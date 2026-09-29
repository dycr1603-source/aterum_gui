'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reconcileStaleOpen}=require('../scripts/reconcile-stale-open');
const id='061f14b5-bf1a-d35d-c580-9a87575cce08';
const now=Date.parse('2026-09-29T05:00:00Z');
function fixture({exists=false,history=[],linked=0,affected=1,ageHours=78}={}){
 const writes=[];
 const row={request_type:'OPEN_POSITION',final_status:'EXECUTING',symbol:'ARBUSDT',
  requested_at:new Date(now-ageHours*3600000),exchange_order_id:null,exchange_response:null,verification_result:null};
 const conn={beginTransaction:async()=>writes.push('begin'),commit:async()=>writes.push('commit'),rollback:async()=>writes.push('rollback'),
  release(){},execute:async(sql,args)=>{writes.push({sql,args});return [{affectedRows:affected}]}};
 const db={execute:async(sql)=>sql.includes('SELECT *')?[[row]]:[[{n:linked}]],getConnection:async()=>conn};
 const binance={queryOrder:async()=>{if(exists)return {status:'FILLED'};throw Object.assign(new Error('not found'),{code:-2013})},allOrders:async()=>history};
 return {db,binance,writes};
}
test('audit only does not change a stale receipt',async()=>{
 const f=fixture();const result=await reconcileStaleOpen({...f,executionId:id,now});
 assert.equal(result.status,'AUDIT_ONLY');assert.equal(result.clientId,'aterum_entry_061f14b5bf1ad35dc5809a8');assert.deepEqual(f.writes,[]);
});
test('explicit repair records failed receipt and evidence transactionally, with no Binance write method',async()=>{
 const f=fixture();const r=await reconcileStaleOpen({...f,executionId:id,now,apply:true});
 assert.equal(r.status,'RECONCILED_FAILED');assert.equal(f.writes.at(-1),'commit');
 const v=JSON.parse(f.writes[1].args[0]);assert.equal(v.verified,false);assert.equal(v.readOnlyEvidence.binanceReadOnly,true);
});
test('existing order, linked trade, incomplete history and unsafe age all refuse writes',async()=>{
 for(const settings of [{exists:true},{linked:1},{history:Array.from({length:1000},()=>({}))},{ageHours:2},{ageHours:200}]){
  const f=fixture(settings);await assert.rejects(reconcileStaleOpen({...f,executionId:id,now,apply:true}));assert.deepEqual(f.writes,[]);
 }
});
test('concurrent receipt change rolls back without creating a success audit',async()=>{
 const f=fixture({affected:0});await assert.rejects(reconcileStaleOpen({...f,executionId:id,now,apply:true}),/RECEIPT_CHANGED/);
 assert.equal(f.writes.at(-1),'rollback');assert(!f.writes.includes('commit'));
});
