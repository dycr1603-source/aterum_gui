'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

const root = path.resolve(__dirname, '..');
const raw = JSON.parse(fs.readFileSync(path.join(root,
  'bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json')));
const workflow = Array.isArray(raw) ? raw[0] : raw;
const next = workflow.nodes.find(n => n.name === 'Next Strategy Slot');
const source = fs.readFileSync(path.join(root,'bot-control/workflows/code/strategy-next-slot.js'),'utf8').trimEnd();

test('verified positions alone can request the next slot, at most three per run', async () => {
  assert.equal(next.parameters.jsCode, source);
  assert(workflow.connections['If: Execution Verified'].main[0].some(e => e.node === next.name));
  assert.equal(workflow.connections[next.name].main[0][0].node,'If: Strategy Approved');
  const run = new AsyncFunction('$input','process',next.parameters.jsCode);
  const calls=[];
  const context={helpers:{httpRequest:async req=>{
    calls.push(req);
    return {strategyV2:true,passAI:true,symbol:'NEXTUSDT'};
  }}};
  const env={env:{EXECUTION_ENGINE_TOKEN:'test-token'}};
  const input=value=>({first:()=>({json:value})});
  const verified={strategyV2:true,finalStatus:'VERIFIED',verificationResult:{verified:true}};
  assert.equal((await run.call(context,input({...verified,strategySlot:1}),env))[0].json.strategySlot,2);
  assert.equal((await run.call(context,input({...verified,strategySlot:2}),env))[0].json.strategySlot,3);
  assert.deepEqual(await run.call(context,input({...verified,strategySlot:3}),env),[]);
  assert.deepEqual(await run.call(context,input({...verified,strategySlot:0}),env),[]);
  assert.deepEqual(await run.call(context,input({...verified,strategySlot:1,finalStatus:'FAILED'}),env),[]);
  assert.deepEqual(await run.call(context,input({...verified,strategySlot:1,verificationResult:{verified:false}}),env),[]);
  assert.deepEqual(await run.call(context,input({...verified,strategySlot:1,strategyV2:false}),env),[]);
  assert.equal(calls.length,2);
  assert(calls.every(c=>c.url.endsWith('/internal/strategy/cycle')));
});
