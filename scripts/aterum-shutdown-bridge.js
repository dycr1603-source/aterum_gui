#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const home = require('node:os').homedir();
const directory = path.join(home, '.local/state/aterum-shutdown');
const socket = path.join(directory, 'bridge.sock');
const configFile = path.join(directory, 'config.json');
function validateTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '')); }
async function windowsAction(mode, time, config, run = exec) {
  if (!['Schedule', 'Status', 'Cancel'].includes(mode)) throw new Error('INVALID_ACTION');
  if (mode === 'Schedule' && !validateTime(time)) throw new Error('INVALID_TIME');
  const args = ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',config.windowsScript,
    '-Mode',mode,'-Distro',config.distro,'-LinuxUser',config.user,'-ControlScript',config.controlScript];
  if (mode === 'Schedule') args.push('-Time',time);
  const result = await run('/mnt/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe',args,
    {timeout:30000,maxBuffer:65536,env:{...process.env,WSLENV:''}});
  return JSON.parse(result.stdout.trim());
}
function createServer(config, action = windowsAction) {
  return http.createServer(async(req,res)=>{
    const respond=(code,data)=>{res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
    if (req.method !== 'POST' || !['/schedule','/status','/cancel'].includes(req.url)) return respond(404,{ok:false,error:'UNKNOWN_ACTION'});
    let body='';
    req.on('data',chunk=>{body+=chunk;if(body.length>1024)req.destroy();});
    req.on('end',async()=>{
      try {
        const input=body?JSON.parse(body):{};
        const mode={ '/schedule':'Schedule','/status':'Status','/cancel':'Cancel' }[req.url];
        const result=await action(mode,input.time,config);
        respond(200,{ok:true,...result});
      } catch(error) { respond(400,{ok:false,error:/INVALID_TIME/.test(error.message)?'INVALID_TIME':/TIME_TOO_SOON/.test(error.message)?'TIME_TOO_SOON':'WINDOWS_SCHEDULER_UNAVAILABLE'}); }
    });
  });
}
async function main(){
  const config=JSON.parse(fs.readFileSync(configFile,'utf8'));
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  fs.rmSync(socket,{force:true});
  const server=createServer(config);
  server.listen(socket,()=>{fs.chmodSync(socket,0o600);console.log('[shutdown bridge] ready');});
  process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
if(require.main===module)main().catch(e=>{console.error('[shutdown bridge]',e.message);process.exit(1)});
module.exports={validateTime,windowsAction,createServer};
