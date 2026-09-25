'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deliver } = require('../services/telegram_delivery');
const { ExecutionEngine } = require('../position-guard/execution-engine');
const fs = require('fs');
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
function database() {
  const rows = new Map();
  return { rows, execute: async (sql,p = []) => {
    if (sql.includes('INSERT INTO notification_deliveries')) {
      if (rows.has(p[0])) throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
      rows.set(p[0], { status:p[1] });
    }
    if (sql.includes('UPDATE notification_deliveries')) rows.set(p[3], { status:p[0], messageId:p[1], errorCode:p[2] });
    return [{ affectedRows:1 }];
  } };
}
test('Telegram all decision and lifecycle events, concurrent dedupe, restart dedupe', async () => {
  const db = database(), messages = [];
  const fetchImpl = async (_url, args) => { messages.push(JSON.parse(args.body)); return { ok:true, json:async()=>({ok:true,result:{message_id:42}}) }; };
  for (const eventKey of ['jev:NO_TRADE','jev:LONG','jev:SHORT','validation-rejected','risk-rejected','open-verified','execution-failure','close-verified']) {
    const args = { db, eventKey, text:`${eventKey} < > &`, token:'secret', chatId:'test', fetchImpl };
    const r = await Promise.all([deliver(args),deliver(args)]);
    assert.equal(r.filter(x=>x.sent).length,1);
    assert.equal((await deliver(args)).status,'DUPLICATE');
  }
  assert.equal(messages.length,8); assert(messages.every(x=>!x.parse_mode));
});
test('HTTP 200 with ok=false is failure, uncertain delivery is not retried, secrets never logged', async () => {
  const original = console.error, logs=[]; console.error=(...args)=>logs.push(args.join(' '));
  try {
    for (const fetchImpl of [async()=>({ok:true,status:200,json:async()=>({ok:false,error_code:400})}),
      async()=>{throw new Error('https://api.telegram.org/botSECRET/sendMessage');}]) {
      const db = database(); let attempts=0;
      const args = { db,eventKey:'x',text:'hi',token:'SECRET',chatId:'test',fetchImpl:async(...p)=>{attempts++;return fetchImpl(...p);} };
      const r=await deliver(args); assert.equal(r.sent,false); assert(r.errorCode);
      await deliver(args); assert.equal(attempts,1);
      assert(!JSON.stringify([...db.rows]).includes('SECRET'));
    }
    assert(!logs.join().includes('SECRET'));
  } finally { console.error=original; }
});
test('workflow sender uses authenticated persisted delivery, preserves event key and result',async()=>{
  const code=fs.readFileSync(require.resolve('../bot-control/workflows/code/send-telegram-notification-v1.js'),'utf8');
  const calls=[];
  const fn=new AsyncFunction('$input','process','require',code);
  const run=async input=>(await fn.call({helpers:{httpRequest:async o=>{calls.push(o);return {status:'SENT',messageId:42};}}},
    {first:()=>({json:input})},{env:{EXECUTION_ENGINE_TOKEN:'test'}},require))[0].json;
  const r=await run({text:'confirmed',notificationEventKey:'execution-failure:abc'});
  assert.equal(r.notificationStatus,'SENT'); assert.equal(r.telegramMessageId,42);
  assert.equal(calls[0].body.eventKey,'execution-failure:abc');
  assert.equal(calls[0].headers.Authorization,'Bearer test');
  assert.equal((await run({})).notificationStatus,'SKIPPED_NO_TEXT');
});
test('engine failure and confirmed-close delivery inspect Telegram response', async()=>{
  const db=database(), e=new ExecutionEngine({config:{telegramToken:'test',telegramChatId:'test'},db,binance:{}});
  e.event=async()=>{};
  const old=global.fetch, messages=[];
  global.fetch=async(_url,args)=>{messages.push(JSON.parse(args.body).text);return {ok:true,json:async()=>({ok:true,result:{message_id:7}})};};
  try {
    assert.equal(await e.notifyFailure({executionId:'failure-1',symbol:'BTCUSDT',positionSide:'LONG',type:'OPEN_POSITION'},new Error('rejected'),false,'EXECUTION_FAILURE'),true);
    assert.equal((await e.sendCanonicalClose({executionId:'close-1',symbol:'BTCUSDT',positionSide:'LONG',closeReason:'SL',pnl:1,rFinal:1,durationMinutes:1})).messageId,7);
    assert(messages[0].includes('EJECUCIÓN FALLIDA')); assert(messages[1].includes('TRADE CLOSED'));
    global.fetch=async()=>({ok:true,status:200,json:async()=>({ok:false,error_code:400})});
    assert.equal(await e.notifyFailure({executionId:'failure-2',symbol:'BTCUSDT'},new Error('rejected')),false);
    await assert.rejects(e.sendCanonicalClose({executionId:'close-2',symbol:'BTCUSDT'}),/TELEGRAM_CLOSE/);
  } finally {global.fetch=old;}
});
module.exports={database};
