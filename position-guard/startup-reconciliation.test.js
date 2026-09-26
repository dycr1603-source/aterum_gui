'use strict';
const assert = require('node:assert/strict');
const { startupReconciliationEvent } = require('./index');

const recovered = startupReconciliationEvent({
  ok:true,positions:5,protected:5,unprotected:0,reconciled:2,adopted:0,errors:[],durationMs:123
});
assert.equal(recovered.eventType,'STARTUP_RECONCILIATION_COMPLETED');
assert.equal(recovered.actionStatus,'SUCCESS');
assert.equal(recovered.actual.reconciled,2);

const partial = startupReconciliationEvent({ok:false,positions:4,errors:['Binance timeout']});
assert.equal(partial.severity,'WARNING');
assert.equal(partial.actionStatus,'PARTIAL');
assert.deepEqual(partial.actual.errors,['Binance timeout']);
assert.equal(partial.actual.unrelated,undefined);

console.log('startup reconciliation audit: ok');
