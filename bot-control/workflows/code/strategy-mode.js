const base = process.env.INTERNAL_DASHBOARD_BASE || 'http://127.0.0.1:3001';
try {
  const status = await this.helpers.httpRequest({method:'GET',url:`${base}/internal/strategy/status`,json:true,timeout:10000,headers:{Authorization:`Bearer ${process.env.EXECUTION_ENGINE_TOKEN || ''}`}});
  if (!['legacy','two-indicator'].includes(status.engine)) throw new Error('STRATEGY_MODE_INVALID');
  return [{json:{strategyV2:status.engine==='two-indicator',strategyMode:status.mode}}];
} catch (error) {
  // Router failure cannot fall back to an older, more permissive entry path.
  throw new Error(`STRATEGY_STATUS_UNAVAILABLE: ${error.message}`);
}
