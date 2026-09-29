'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { HostController } = require('../scripts/aterum-control');
const { operationDrain } = require('../position-guard/operation-drain');
const SERVICES = ['mysql','redis','dashboard','aterum_gui','n8n','position_guard','telegram_control','typesafe_adapter','nginx'];

function fixture(t, { running = true, drain = { workflows: 0, executions: 0 }, unclean = null, badHealth = false,
  tunnelError = false, externalTunnel = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-control-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const states = new Map(SERVICES.map(s => [s, { running, exitCode: 0, health: 'healthy' }]));
  let tunnelState = running ? 'active' : 'inactive';
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (command === 'systemctl') return args.includes('--property=LoadState') ? 'loaded' : tunnelState;
    if (command === 'sudo') {
      if (tunnelError && args.includes('systemctl') && args.includes('stop')) throw new Error('TUNNEL_STOP_FAILED');
      if (args.includes('systemctl')) tunnelState = args.includes('stop') ? 'inactive' : 'active';
      return '';
    }
    if (args[0] === 'inspect') return [...states].map(([service,s]) => JSON.stringify({Running:s.running,
      Restarting:false,Paused:false,ExitCode:s.exitCode,Health:{Status:badHealth?'unhealthy':s.health}})+'|'+service).join('\n');
    if (args[0] === 'exec') return JSON.stringify(drain);
    if (args.includes('run')) return JSON.stringify(drain);
    if (args.includes('config')) return '';
    if (args.includes('ps')) {
      const service=args.find(a=>SERVICES.includes(a));
      return service ? (states.get(service).running ? service+'-id' : '') : SERVICES.map(s=>s+'-id').join('\n');
    }
    if(args[0]==='kill'){
      assert(args.includes('--signal=SIGINT'));
      const service=SERVICES.find(s=>args.at(-1)===s+'-id');
      assert.equal(service,'typesafe_adapter');
      states.set(service,{running:false,exitCode:130,health:'healthy'});
      return '';
    }
    const action = args.indexOf('stop') >= 0 ? 'stop' : args.indexOf('up') >= 0 ? 'up' : null;
    if (action) {
      let selected = args.slice(args.indexOf(action)+1).filter(s=>SERVICES.includes(s));
      if (!selected.length) selected = SERVICES;
      for (const service of selected) states.set(service, { running:action==='up', exitCode:action==='stop'&&service===unclean?137:0, health:'healthy' });
      return '';
    }
    throw new Error('Unexpected fake command');
  };
  const controller = new HostController({ directory, run, hostId:'host-a', user:'tester', sleep:async()=>{}, log:()=>{},
    inspectTunnel:async()=>externalTunnel });
  return { controller, calls, directory, states };
}

test('migration drains producers before executor/storage, persists retirement and never sends an order', async t => {
  const {controller,calls,directory}=fixture(t);
  const result=await controller.stop({retire:true});
  assert.equal(result.migrationReady,true);
  assert.equal(controller.state().mode,'RETIRED');
  assert(fs.existsSync(path.join(directory,'inhibited')));
  const receipt=JSON.parse(fs.readFileSync(path.join(directory,'handoff.json'),'utf8'));
  assert.equal(receipt.migrationReady,true);
  assert.equal(receipt.requiresFinalBackup,true);
  const stopCalls=calls.filter(c=>c.includes('stop')&&c[0]==='docker');
  assert(stopCalls[0].includes('telegram_control'));
  assert(stopCalls[1].includes('n8n'));
  assert(stopCalls[2].includes('position_guard'));
  const snapshotAt=calls.findIndex(c=>c[1]==='exec');
  const mysqlStopAt=calls.findIndex(c=>c.includes('stop')&&c.includes('mysql'));
  assert(snapshotAt<mysqlStopAt);
  assert(calls.every(c=>!c.includes('down')&&!c.includes('--volumes')));
  assert.equal(fs.statSync(path.join(directory,'handoff.json')).mode&0o777,0o600);
  await assert.rejects(controller.start(),/PC_RETIRED/);
});

test('retired and stopped boot is a no-op and repeated stop remains safe', async t => {
  const {controller,calls}=fixture(t);
  await controller.stop({retire:true});
  const n=calls.length;
  await controller.start({boot:true});
  assert.equal(calls.length,n);
  assert.equal((await controller.stop({retire:true})).migrationReady,true);
});

test('partial shutdown can recheck storage without restarting Dashboard or trading',async t=>{
 const {controller,states,calls}=fixture(t,{running:false});
 states.set('mysql',{running:true,exitCode:0,health:'healthy'});
 controller.save({mode:'RETIRED',migrationReady:false});
 assert.equal((await controller.stop({retire:true})).migrationReady,true);
 assert(calls.some(c=>c.includes('run')&&c.includes('--no-deps')&&c.includes('-e')));
 assert(!calls.some(c=>c.includes('up')));
});

test('pending workflow or executor prevents a migration receipt while still stopping services', async t => {
  const {controller,directory,states}=fixture(t,{drain:{workflows:1,executions:2}});
  await assert.rejects(controller.stop({retire:true}),/PENDING_WORKFLOWS_OR_EXECUTIONS/);
  assert(!fs.existsSync(path.join(directory,'handoff.json')));
  assert.equal(controller.state().migrationReady,false);
  assert([...states.values()].every(s=>!s.running));
});

test('unclean writer exit never certifies migration', async t => {
  const {controller,directory}=fixture(t,{unclean:'n8n'});
  await assert.rejects(controller.stop({retire:true}),/UNCLEAN_SHUTDOWN/);
  assert(!fs.existsSync(path.join(directory,'handoff.json')));
});

test('unclean database exit never certifies migration', async t => {
  const {controller,directory}=fixture(t,{unclean:'mysql'});
  await assert.rejects(controller.stop({retire:true}),/UNCLEAN_STORAGE_SHUTDOWN/);
  assert(!fs.existsSync(path.join(directory,'handoff.json')));
});

test('failure to stop tunnel cannot certify migration', async t => {
  const {controller,directory,states}=fixture(t,{tunnelError:true});
  await assert.rejects(controller.stop({retire:true}),/TUNNEL_STOP_FAILED/);
  assert(!fs.existsSync(path.join(directory,'handoff.json')));
  assert([...states.values()].every(s=>!s.running));
});

test('explicit start resumes normal stopped PC, after core health and before tunnel', async t => {
  const {controller,calls,directory}=fixture(t);
  await controller.stop(); calls.length=0;
  await controller.start();
  assert.equal(controller.state().mode,'ACTIVE');
  assert(!fs.existsSync(path.join(directory,'inhibited')));
  const ups=calls.filter(c=>c.includes('up'));
  assert(ups[0].includes('mysql'));
  assert(ups[1].includes('position_guard'));
  assert(ups[2].includes('n8n'));
  assert(ups[3].includes('telegram_control'));
  assert(calls.at(-2).includes('start')); // tunnel command, followed by active state check
});

test('fresh PC requires handoff; different-host valid receipt enables explicit takeover', async t => {
  const {controller,directory}=fixture(t,{running:false});
  await assert.rejects(controller.start(),/FIRST_START_REQUIRES/);
  controller.inhibit();
  controller.save({mode:'STOPPED',requiresHandoff:true});
  await assert.rejects(controller.start(),/FIRST_START_REQUIRES/);
  const handoff=path.join(directory,'from-source.json');
  fs.writeFileSync(handoff,JSON.stringify({schema:'aterum-handoff-v1',hostId:'host-b',migrationReady:true,
    containersStopped:true,tunnelStopped:true,drain:{workflows:0,executions:0}}));
  await controller.start({handoff});
  assert.equal(controller.state().mode,'ACTIVE');
});

test('ngrok outside the service prevents migration certification without killing another process', async t => {
  const {controller,directory}=fixture(t,{externalTunnel:true});
  await assert.rejects(controller.stop({retire:true}),/EXTERNAL_NGROK_TUNNEL_STILL_RUNNING/);
  assert(!fs.existsSync(path.join(directory,'handoff.json')));
});

test('same-host or incomplete handoff does not start any containers', async t => {
  const {controller,calls,directory}=fixture(t,{running:false});
  const handoff=path.join(directory,'bad.json');
  fs.writeFileSync(handoff,JSON.stringify({schema:'aterum-handoff-v1',hostId:'host-a',migrationReady:true,
    containersStopped:true,tunnelStopped:true,drain:{workflows:0,executions:0}}));
  await assert.rejects(controller.start({handoff}),/INVALID_HANDOFF/);
  assert.equal(calls.length,0);
});

test('partial startup rolls back instead of leaving writers active', async t => {
  const {controller,states,directory}=fixture(t,{running:false,badHealth:true});
  await assert.rejects(controller.start({firstInstall:true}),/STARTUP_HEALTH_TIMEOUT/);
  assert([...states.values()].every(s=>!s.running));
  assert(fs.existsSync(path.join(directory,'inhibited')));
});

test('normal systemd shutdown preserves auto-start intent; manual stop persists inhibition', async t => {
  const {controller,directory}=fixture(t);
  controller.save({mode:'ACTIVE',migrationReady:false});
  await controller.stop({shutdown:true});
  assert(!fs.existsSync(path.join(directory,'inhibited')));
  await controller.start({boot:true});
  assert.equal(controller.state().mode,'ACTIVE');
  await controller.stop();
  assert(fs.existsSync(path.join(directory,'inhibited')));
});

test('executor drain waits for scans, requests and rejected tasks before resources close', async () => {
  const drain=operationDrain(); let complete; let drained=false;
  const work=drain.run(()=>new Promise(resolve=>{complete=resolve}));
  drain.run(async()=>{throw new Error('expected')}).catch(()=>{});
  const waiting=drain.wait().then(()=>{drained=true});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(drained,false);
  complete(); await work; await waiting;
  assert.equal(drained,true);
});

test('tunnel monitor refuses to start on an inhibited host', async t => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'aterum-tunnel-inhibited-'));
  const previous=process.env.ATERUM_CONTROL_STATE_DIR;
  const fetchBefore=global.fetch;
  t.after(()=>{
    if(previous===undefined)delete process.env.ATERUM_CONTROL_STATE_DIR;
    else process.env.ATERUM_CONTROL_STATE_DIR=previous;
    global.fetch=fetchBefore;
    fs.rmSync(directory,{recursive:true,force:true});
  });
  fs.writeFileSync(path.join(directory,'inhibited'),'stopped');
  process.env.ATERUM_CONTROL_STATE_DIR=directory;
  global.fetch=async()=>{throw new Error('Must not contact a dependency or create a tunnel')};
  await require('../scripts/gui-ngrok-watch').startup();
});
