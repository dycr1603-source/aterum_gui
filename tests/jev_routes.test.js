'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('crypto');
// Replace shared BEFORE loading routes: no .env, credentials or database connection.
const decisions=new Map(), deliveries=new Map();
const db={execute:async(sql,p=[])=>{
  if(sql.startsWith('CREATE TABLE')) return [{}];
  if(sql.startsWith('INSERT INTO jev_decisions')) {
    if(decisions.has(p[0])) throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
    decisions.set(p[0],null);return [{}];
  }
  if(sql.startsWith('UPDATE jev_decisions')) {decisions.set(p[1],p[0]);return [{}];}
  if(sql.startsWith('SELECT result FROM jev_decisions')) return [[{result:decisions.get(p[0])}]];
  if(sql.startsWith('INSERT INTO notification_deliveries')) {
    if(deliveries.has(p[0])) throw Object.assign(new Error('duplicate'),{code:'ER_DUP_ENTRY'});
    deliveries.set(p[0],{status:p[1]});return [{}];
  }
  if(sql.startsWith('UPDATE notification_deliveries')) {deliveries.set(p[3],{status:p[0],error:p[2]});return [{}];}
  throw new Error('Unexpected SQL');
}};
const sharedPath=require.resolve('../shared');
require.cache[sharedPath]={id:sharedPath,filename:sharedPath,loaded:true,exports:{db}};
const router=require('../routes/jev');
function call(path,body,token='test-internal') {
  const handlers=router.stack.find(s=>s.route?.path===path).route.stack;
  return new Promise((resolve,reject)=>{
    const req={body,get:()=>`Bearer ${token}`};
    const res={code:200,status(n){this.code=n;return this;},json(body){resolve({code:this.code,body});},sendStatus(n){resolve({code:n});}};
    handlers[0].handle(req,res,()=>Promise.resolve(handlers[1].handle(req,res)).catch(reject));
  });
}
test('authenticated route: three decisions, persisted audit, Telegram simulation, concurrency and stale replay',async()=>{
  const keys=['JEV_ENABLED','JEV_OBSERVE_ONLY','TYPESAFE_API_KEY','EXECUTION_ENGINE_TOKEN','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID'];
  const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{JEV_ENABLED:'true',JEV_OBSERVE_ONLY:'false',TYPESAFE_API_KEY:'test-api',EXECUTION_ENGINE_TOKEN:'test-internal',TELEGRAM_BOT_TOKEN:'test-bot',TELEGRAM_CHAT_ID:'test-chat'});
  const oldFetch=global.fetch;let apiCalls=0;const messages=[];
  global.fetch=async(url,args)=>{
    if(url.includes('telegram.org')) {messages.push(JSON.parse(args.body).text);return {ok:true,json:async()=>({ok:true,result:{message_id:messages.length}})};}
    if(url.includes('ticker/price')) return {ok:true,json:async()=>({symbol:'BTCUSDT',price:'100',time:Date.now()})};
    if(url.includes('exchangeInfo')) return {ok:true,json:async()=>({symbols:[{symbol:'BTCUSDT',status:'TRADING',filters:[{filterType:'PRICE_FILTER',tickSize:'0.1'}]}]})};
    apiCalls++;const q=JSON.parse(args.body);const choice=q.state.cycleId;
    return {ok:true,json:async()=>({model:'jev-1.13.0',answers:{[Object.keys(q.questions)[0]]:{type:'choice',choice,confidence:1,
      probabilities:Object.fromEntries(['NO_TRADE','LONG','SHORT'].map(k=>[k,k===choice?1:0]))}}})};
  };
  try {
    assert.equal((await call('/internal/jev/evaluate',{},'wrong')).code,401);
    for(const choice of ['NO_TRADE','LONG','SHORT']) {
      const d={...require('./fixtures/jev_context')(),opportunityCycleId:choice,symbol:'BTCUSDT',direction:choice==='SHORT'?'SHORT':'LONG',marketDataAt:Date.now(),indicators:{currentPrice:100,atr:2}};
      const [a,b]=await Promise.all([call('/internal/jev/evaluate',d),call('/internal/jev/evaluate',d)]);
      assert.equal(a.body.decision,choice);assert([choice,'NO_TRADE'].includes(b.body.decision));
      const replay=await call('/internal/jev/evaluate',d);assert.equal(replay.body.id,a.body.id);
      const stored=JSON.parse(decisions.get(a.body.id));assert(stored.request.questions);assert.equal(stored.answer.choice,choice);
      stored.expiresAt=0;decisions.set(a.body.id,JSON.stringify(stored));
      assert.equal((await call('/internal/jev/evaluate',d)).body.decision,'NO_TRADE');
    }
    assert.equal(apiCalls,3);assert.equal(messages.length,3);
    assert(messages.every(s=>s.includes('PROPUESTA')&&s.includes('No confirma una orden')));
    assert.equal([...deliveries.values()].filter(x=>x.status==='SENT').length,3);
    assert(!JSON.stringify([...decisions]).includes('test-api'));
  } finally {
    global.fetch=oldFetch;
    for(const key of keys) {if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key];}
  }
});
