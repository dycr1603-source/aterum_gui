const base = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';
try {
  const result = await this.helpers.httpRequest({method:'POST',url:`${base}/internal/strategy/cycle`,json:true,timeout:600000,headers:{Authorization:`Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}`},body:{}});
  if(result.strategyV2!==true)throw new Error('INVALID_STRATEGY_RESPONSE');
  if(result.passAI!==true)console.log(`ATERUM NO_TRADE: ${result.skipReason}`);
  return [{json:{...result,strategySlot:1}}];
} catch(error) {
  return [{json:{strategyV2:true,passAI:false,allocationAllowed:false,strategySlot:1,skipReason:error.message}}];
}
