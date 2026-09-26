'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

async function run(sqliteFails, databaseFails = false) {
  const actual = {trades:2,pnl:'-1.25',wins:1,losses:1};
  const context = {
    module:{exports:{}}, process:{env:{}}, console:{warn(){},error(){}}, Date,
    require(name) {
      if(name==='child_process')return {execFile(){}};
      if(name==='util')return {promisify:()=>async()=>{if(sqliteFails)throw new Error('no database');return {stdout:'[]'};}};
      if(name==='../shared')return {query:async sql=>databaseFails?null:sql.includes('COUNT(*) trades')?[actual]:[]};
      if(name==='flatted')return {parse:JSON.parse};
      throw new Error('Unexpected dependency: '+name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../services/simulator.js'),'utf8'),context);
  const report = await context.module.exports.getSimulatorReport();
  assert.equal(report.signals.length,0);
  assert.equal(report.stats.total,0);
  assert.equal(report.sources.executions,sqliteFails?'unavailable':'empty');
  assert.equal(report.actual.summary?.pnl,databaseFails?undefined:'-1.25');
  assert.equal(report.sources.actual,databaseFails?'unavailable':'ready');
  const policy = await context.module.exports.getSimulatorPolicy();
  assert.equal(policy.opportunityGroups.length,0,'No fabricated opportunities when there are no executions');
}
(async()=>{await run(false);await run(true);await run(true,true);console.log('simulator sources: real DB stats retained; no sample fallback; failures distinguished');})().catch(error=>{console.error(error);process.exitCode=1});
