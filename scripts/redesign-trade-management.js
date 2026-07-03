'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const workflowDir = path.join(root, 'bot-control/workflows/current');

function readWorkflow(filename) {
  const file = path.join(workflowDir, filename);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { file, wrapper: Array.isArray(parsed), workflow: Array.isArray(parsed) ? parsed[0] : parsed };
}

function writeWorkflow(entry) {
  fs.writeFileSync(entry.file, JSON.stringify(entry.wrapper ? [entry.workflow] : entry.workflow, null, 2) + '\n');
}

function nodeCode(entry, name) {
  const node = entry.workflow.nodes.find(item => item.name === name);
  if (!node?.parameters?.jsCode) throw new Error(`Missing code node ${name}`);
  return node;
}

function replaceOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(search, replacement);
}

function snippet(fn) {
  const match = fn.toString().match(/\/\*CODE\n([\s\S]*?)\nCODE\*\//);
  if (!match) throw new Error('Invalid embedded code snippet');
  return match[1];
}

const executionHelpers = snippet(function(){/*CODE
const EXECUTION_ENGINE = process.env.EXECUTION_ENGINE_URL || 'http://position_guard:3091/executions';
const EXECUTION_TOKEN  = process.env.EXECUTION_ENGINE_TOKEN;

async function executeVerified(helpers, request){
  const executionId = crypto.randomUUID();
  if(!EXECUTION_TOKEN){
    return { ok:false, executionId, finalStatus:'FAILED', error:'EXECUTION_ENGINE_TOKEN is not configured' };
  }
  try{
    const result = await helpers.httpRequest({
      method:'POST', url:EXECUTION_ENGINE, json:true, timeout:180000,
      headers:{ Authorization:`Bearer ${EXECUTION_TOKEN}` },
      body:{ ...request, executionId, maxAttempts:3 }
    });
    if(result?.ok === true && result.finalStatus === 'VERIFIED' && result.verificationResult?.verified === true){
      return result;
    }
    return { ...result, ok:false, executionId:result?.executionId || executionId,
      finalStatus:result?.finalStatus || 'FAILED', error:result?.error || 'Binance verification failed' };
  }catch(error){
    return { ok:false, executionId, finalStatus:'FAILED', error:error.message, failureNotificationSent:false };
  }
}

function executionFailureText(result, action, symbol){
  if(result?.failureNotificationSent) return null;
  return [
    '🚨 ATERUM EXECUTION FAILED',
    `${action} ${symbol}`,
    `Execution ID: ${result?.executionId || 'not-created'}`,
    result?.verificationResult?.exchangeVerified
      ? 'Binance confirmed the exchange action, but local persistence/synchronization failed.'
      : 'Binance did not confirm the requested change. Local trade state was not advanced.',
    'No success notification was sent.',
    `Error: ${String(result?.error || 'unknown').slice(0,500)}`
  ].join('\n');
}
CODE*/});

function updateTrailing() {
  const entry = readWorkflow('trailing-manager.workflow.json');
  const node = nodeCode(entry, 'Trailing Manager Code');
  let code = node.parameters.jsCode;
  code = replaceOnce(code,
    "const DASHBOARD  = 'http://127.0.0.1:3001';\n",
    "const DASHBOARD  = 'http://127.0.0.1:3001';\n" + executionHelpers + '\n',
    'trailing execution helpers');
  code = replaceOnce(code, "    let telegramText=null;", "    let telegramText=null;\n    let execution=null;",
    'trailing execution audit scope');
  code = replaceOnce(code,
    "    if(slChanged){\n      // ── 1. SL Monitor con reintento — si falla, abortar todo ─────────────",
    snippet(function(){/*CODE
    if(slChanged){
      // Binance is authoritative: execute and verify before touching n8n state or Telegram.
      execution = await executeVerified(this.helpers, {
        type: newStage === 'TRAILING' ? 'TRAILING_STOP' : 'MOVE_STOP_LOSS',
        symbol, positionSide, targetPrice:newSL, reason, requestedStage:newStage
      });
      if(!execution.ok){
        slChanged=false;
        reason += ` | BINANCE ${execution.finalStatus}: ${execution.error}`;
        telegramText=executionFailureText(execution, newStage === 'TRAILING' ? 'TRAILING STOP' : 'MOVE STOP LOSS', symbol);
      } else {
        // ── 1. Update local monitor only after Binance verification ───────────
CODE*/}),
    'trailing verified gate');
  code = replaceOnce(code,
    "        reason += ' | ERROR SL_SET después de 3 intentos — dashboard NO actualizado';\n        console.log(`[${symbol}] SL_SET falló 3 veces — abortando update completo`);",
    "        reason += ' | Binance VERIFIED but SL_SET local sync failed';\n        telegramText=executionFailureText({ executionId:execution.executionId, error:'Binance confirmed the SL but n8n local state synchronization failed', failureNotificationSent:false }, 'LOCAL STATE SYNC', symbol);\n        console.log(`[${symbol}] Binance verified, but SL_SET local synchronization failed`);",
    'trailing local sync failure');
  code = replaceOnce(code,
    "        symbol, positionSide, slPrice:newSL, qty, side,",
    "        symbol, executionId:execution.executionId, positionSide, slPrice:newSL, qty, side,",
    'trailing local execution ID');
  code = replaceOnce(code,
    "        // ── 3. DB — solo si SL Monitor fue exitoso ────────────────────────\n        try{\n          await this.helpers.httpRequest({\n            method:'POST',url:`${DASHBOARD}/db/trade/update-sl`,json:true,\n            body:{symbol,newSL,stage:newStage}\n          });\n        }catch(e){console.log(`[${symbol}] DB error: ${e.message}`);}\n\n        // ── 4. Telegram ───────────────────────────────────────────────────",
    "        // MySQL was already persisted by the verified execution engine.\n\n        // ── 3. Telegram (verified execution only) ──────────────────────────",
    'remove optimistic trailing DB update');
  code = replaceOnce(code,
    "        }catch(e){console.log(`[${symbol}] Dashboard error: ${e.message}`);}",
    "        }catch(e){throw new Error(`Dashboard local state failed after verified execution: ${e.message}`);}",
    'trailing dashboard state fail closed');
  code = replaceOnce(code,
    "    }\n\n    console.log(`[${symbol}] R=${currentR.toFixed(2)} stage=${newStage}",
    "      }\n    }\n\n    console.log(`[${symbol}] R=${currentR.toFixed(2)} stage=${newStage}",
    'close trailing verified gate');
  code = replaceOnce(code,
    "      reason,telegramText\n    };",
    "      reason,telegramText,\n      executionId:execution?.executionId || null,\n      exchangeOrderId:execution?.exchangeOrderId || null,\n      verificationResult:execution?.verificationResult || null,\n      finalStatus:execution?.finalStatus || null\n    };",
    'trailing audit fields');
  code = replaceOnce(code,
    "  }catch(err){\n    console.log(`[${symbol}] Error: ${err.message}`);\n    return{symbol,status:'error',message:err.message,telegramText:null};\n  }",
    "  }catch(err){\n    console.log(`[${symbol}] Error: ${err.message}`);\n    return{symbol,status:'error',finalStatus:'FAILED',message:err.message,\n      telegramText:executionFailureText({error:err.message,failureNotificationSent:false},'TRAILING MANAGEMENT',symbol)};\n  }",
    'trailing unexpected failure notification');
  node.parameters.jsCode = code;
  writeWorkflow(entry);
}

function updateSlMonitor() {
  const entry = readWorkflow('sl-monitor.workflow.json');
  nodeCode(entry, 'Guardar Estado').parameters.jsCode = snippet(function(){/*CODE
const state=$getWorkflowStaticData('global');
const d=$input.first().json.body||$input.first().json;
if(!state.positions) state.positions={};
const existing=state.positions[d.symbol]||{};
state.positions[d.symbol]={
  positionSide:d.positionSide??existing.positionSide,
  slPrice:d.slPrice??existing.slPrice,
  qty:d.qty??existing.qty,
  side:d.side??existing.side,
  entryPrice:d.entryPrice??existing.entryPrice??null,
  initialSL:d.initialSL??existing.initialSL??d.slPrice,
  stage:d.stage??existing.stage??'INITIAL',
  tp:d.tp??existing.tp??null,
  leverage:d.leverage??existing.leverage??null,
  finalScore:d.finalScore??existing.finalScore??null,
  openedAt:d.openedAt??existing.openedAt??Date.now(),
  aiRegime:d.aiRegime??existing.aiRegime??'N/A',
  bestPrice:d.bestPrice??existing.bestPrice??null,
  scanScore:d.scanScore??existing.scanScore??null,
  dynamicThreshold:d.dynamicThreshold??existing.dynamicThreshold??null,
  tf4h:d.tf4h??existing.tf4h??null,
  marketContext:d.marketContext??existing.marketContext??null,
  indicators:d.indicators??existing.indicators??null,
  aiBias:d.aiBias??existing.aiBias??null,
  aiReasoning:d.aiReasoning??existing.aiReasoning??null,
  aiKeyRisk:d.aiKeyRisk??existing.aiKeyRisk??null,
  setupLabel:d.setupLabel??existing.setupLabel??null,
  entryReason:d.entryReason??existing.entryReason??null,
  lastExecutionId:d.executionId??existing.lastExecutionId??null,
  lastSyncedAt:new Date().toISOString()
};
return [{json:{ok:true,positions:state.positions}}];
CODE*/});
  const node = nodeCode(entry, 'SL Monitor Code');
  let code = node.parameters.jsCode;
  code = replaceOnce(code,
    "const state      = $getWorkflowStaticData('global');\n",
    "const state      = $getWorkflowStaticData('global');\n" + executionHelpers + '\n',
    'SL monitor execution helpers');

  code = replaceOnce(code,
    snippet(function(){/*CODE
async function closeDashboard(symbol, reason, price){
  try{
    await this.helpers.httpRequest({
      method: 'DELETE',
      url: `${DASHBOARD}/trade/${symbol}?reason=${reason}&exitPrice=${price}`,
      json: true
    });
    console.log(`Dashboard: ${symbol} cerrado (${reason}) @ ${price}`);
  }catch(e){ console.log(`Dashboard close error ${symbol}: ${e.message}`); }
}
CODE*/}),
    snippet(function(){/*CODE
async function closeDashboard(symbol, reason, price){
  await this.helpers.httpRequest({
    method: 'DELETE',
    url: `${DASHBOARD}/trade/${symbol}?reason=${reason}&exitPrice=${price}`,
    json: true
  });
  console.log(`Dashboard: ${symbol} cerrado (${reason}) @ ${price}`);
}
CODE*/}),
    'strict dashboard close');
  code = replaceOnce(code,
    snippet(function(){/*CODE
  }catch(e){
    console.log(`DB close error ${symbol}: ${e.message}`);
    return { pnl: 0, rFinal: 0, durationMinutes: 0 };
  }
}
CODE*/}),
    snippet(function(){/*CODE
  }catch(e){
    console.log(`DB close error ${symbol}: ${e.message}`);
    throw e;
  }
}
CODE*/}),
    'strict DB close');

  const exitReader = snippet(function(){/*CODE
async function readConfirmedExit(helpers, symbol, pos){
  const startTime=Math.max(0, Number(pos.openedAt||Date.now())-60000);
  const trades=await helpers.httpRequest({
    method:'GET', url:`${BASE}/fapi/v1/userTrades?${sign({symbol,startTime,limit:1000})}`,
    headers:{'X-MBX-APIKEY':API_KEY}, json:true
  });
  const closingSide=pos.positionSide==='LONG'?'SELL':'BUY';
  const fills=(Array.isArray(trades)?trades:[]).filter(t=>t.side===closingSide && Number(t.time||0)>=startTime);
  if(!fills.length) throw new Error('Binance position is closed but no closing fill could be verified');
  const latestTime=Math.max(...fills.map(t=>Number(t.time||0)));
  const latest=fills.filter(t=>Math.abs(Number(t.time||0)-latestTime)<2000);
  const qty=latest.reduce((sum,t)=>sum+Number(t.qty||0),0);
  const exitPrice=latest.reduce((sum,t)=>sum+Number(t.price||0)*Number(t.qty||0),0)/(qty||1);
  const realizedPnl=latest.reduce((sum,t)=>sum+Number(t.realizedPnl||0),0);
  const orderId=String(latest[0].orderId||'');
  const [orders,algos]=await Promise.all([
    helpers.httpRequest({method:'GET',url:`${BASE}/fapi/v1/allOrders?${sign({symbol,startTime,limit:1000})}`,headers:{'X-MBX-APIKEY':API_KEY},json:true}).catch(()=>[]),
    helpers.httpRequest({method:'GET',url:`${BASE}/fapi/v1/allAlgoOrders?${sign({symbol,startTime,limit:1000})}`,headers:{'X-MBX-APIKEY':API_KEY},json:true}).catch(()=>[])
  ]);
  const order=[...(orders||[]),...(algos||[])].find(o=>String(o.orderId||o.actualOrderId||o.algoId||'')===orderId);
  const type=String(order?.origType||order?.type||order?.orderType||'').toUpperCase();
  const reason=type.includes('STOP')?'SL':type.includes('TAKE_PROFIT')||type==='LIMIT'?'TP':'MANUAL';
  return { exitPrice,realizedPnl,orderId,reason,fills:latest,order:order||null,verified:true };
}
CODE*/});
  code = replaceOnce(code,
    "async function notifyCB(event, positionSide, symbol){",
    exitReader + "\nasync function notifyCB(event, positionSide, symbol){",
    'confirmed exit reader');

  const oldExternalStart = "    // ── Cerrada externamente (TP hit) ─────────────────────────────────────────\n    if(!activePos){";
  const oldExternalEnd = "      continue;\n    }\n\n    // ── Precio actual";
  const start = code.indexOf(oldExternalStart);
  const end = code.indexOf(oldExternalEnd, start);
  if (start < 0 || end < 0) throw new Error('external close block not found');
  const external = snippet(function(){/*CODE
    // Binance position is absent; verify the actual closing fill before local mutation.
    if(!activePos){
      try{
        const exit=await readConfirmedExit(this.helpers,symbol,pos);
        await closeDB.call(this,symbol,pos,exit.exitPrice,exit.reason);
        await closeDashboard.call(this,symbol,exit.reason.toLowerCase(),exit.exitPrice);
        const pnl=Number(exit.realizedPnl.toFixed(2));
        const initialRisk=Math.abs(pos.entryPrice-(pos.initialSL||pos.slPrice));
        const rFinal=initialRisk>0?+((Math.abs(exit.exitPrice-pos.entryPrice)/initialRisk)*(pnl>=0?1:-1)).toFixed(2):0;
        const durationMinutes=pos.openedAt?Math.floor((Date.now()-pos.openedAt)/60000):0;
        await notifyCB.call(this,exit.reason==='SL'?'sl':'tp',positionSide,symbol);
        await setCooldown.call(this,symbol,exit.reason==='SL'?15:30);
        const telegramText=buildCloseMessage(symbol,pos,exit.exitPrice,exit.reason,pnl,rFinal,durationMinutes);
        delete state.positions[symbol];
        results.push({symbol,status:'EXCHANGE_CLOSE_VERIFIED',exitPrice:exit.exitPrice,pnl,rFinal,durationMinutes,
          closeType:exit.reason,exchangeOrderId:exit.orderId,exchangeResponse:{fills:exit.fills,order:exit.order},
          verificationResult:{verified:true,position:null,fillVerified:true},finalStatus:'VERIFIED',telegramText,...buildLearningContext(pos)});
      }catch(error){
        results.push({symbol,status:'EXTERNAL_CLOSE_UNVERIFIED',finalStatus:'FAILED',message:error.message,
          telegramText:executionFailureText({error:error.message,failureNotificationSent:false},'VERIFY EXTERNAL CLOSE',symbol)});
      }
      continue;
    }

    // ── Precio actual
CODE*/});
  code = code.slice(0, start) + external + code.slice(end + oldExternalEnd.length);

  const slStart = code.indexOf("    if(slTriggered){");
  const slEndMarker = "\n    } else {\n\n      // ── Gestión por tiempo en pérdida";
  const slEnd = code.indexOf(slEndMarker, slStart);
  if (slStart < 0 || slEnd < 0) throw new Error('SL close block not found');
  const slBlock = snippet(function(){/*CODE
    if(slTriggered){
      const execution=await executeVerified(this.helpers,{
        type:'CLOSE_POSITION',symbol,positionSide,reason:'STOP_LOSS_TRIGGERED'
      });
      if(!execution.ok){
        results.push({symbol,status:'SL_EXECUTION_FAILED',finalStatus:execution.finalStatus,executionId:execution.executionId,
          message:execution.error,telegramText:executionFailureText(execution,'CLOSE POSITION (SL)',symbol)});
        continue;
      }
      const closeOrder=execution.exchangeResponse?.order||{};
      const exitPrice=Number(closeOrder.avgPrice||price);
      await closeDB.call(this,symbol,pos,exitPrice,'SL');
      await closeDashboard.call(this,symbol,'sl',exitPrice);
      const pnl=pos.positionSide==='SHORT'?(pos.entryPrice-exitPrice)*pos.qty:(exitPrice-pos.entryPrice)*pos.qty;
      const initialRisk=Math.abs(pos.entryPrice-(pos.initialSL||pos.slPrice));
      const rFinal=initialRisk>0?+((Math.abs(exitPrice-pos.entryPrice)/initialRisk)*(pnl>=0?1:-1)).toFixed(2):0;
      const durationMinutes=pos.openedAt?Math.floor((Date.now()-pos.openedAt)/60000):0;
      const stage=pos.stage||'INITIAL';
      const isRealLoss=stage==='INITIAL'&&pnl<0;
      await notifyCB.call(this,isRealLoss?'sl':'tp',positionSide,symbol);
      await setCooldown.call(this,symbol,isRealLoss?15:30);
      const telegramText=buildCloseMessage(symbol,pos,exitPrice,'SL',pnl,rFinal,durationMinutes);
      delete state.positions[symbol];
      results.push({symbol,status:'SL_EXECUTED',price:exitPrice,slPrice,stage,pnl:+pnl.toFixed(2),rFinal,durationMinutes,
        closeType:'SL',telegramText,executionId:execution.executionId,exchangeOrderId:execution.exchangeOrderId,
        exchangeResponse:execution.exchangeResponse,verificationResult:execution.verificationResult,
        timestamp:execution.timestamp,finalStatus:execution.finalStatus,...buildLearningContext(pos)});
CODE*/});
  code = code.slice(0, slStart) + slBlock + code.slice(slEnd);

  const forceStart = code.indexOf("        if(timeAction.action === 'FORCE_CLOSE'){");
  const forceEndMarker = "\n        } else if(timeAction.action === 'MOVE_SL'){";
  const forceEnd = code.indexOf(forceEndMarker, forceStart);
  if (forceStart < 0 || forceEnd < 0) throw new Error('time close block not found');
  const forceBlock = snippet(function(){/*CODE
        if(timeAction.action === 'FORCE_CLOSE'){
          const execution=await executeVerified(this.helpers,{
            type:'CLOSE_POSITION',symbol,positionSide,reason:'TIME_EXIT_20H'
          });
          if(!execution.ok){
            results.push({symbol,status:'TIME_EXIT_FAILED',finalStatus:execution.finalStatus,executionId:execution.executionId,
              message:execution.error,telegramText:executionFailureText(execution,'CLOSE POSITION (TIME EXIT)',symbol)});
            continue;
          }
          const closeOrder=execution.exchangeResponse?.order||{};
          const exitPrice=Number(closeOrder.avgPrice||price);
          await closeDB.call(this,symbol,pos,exitPrice,'TIME_EXIT');
          await closeDashboard.call(this,symbol,'time_exit',exitPrice);
          const pnl=pos.positionSide==='SHORT'?(pos.entryPrice-exitPrice)*pos.qty:(exitPrice-pos.entryPrice)*pos.qty;
          const initialRisk=Math.abs(pos.entryPrice-(pos.initialSL||pos.slPrice));
          const rFinal=initialRisk>0?+((Math.abs(exitPrice-pos.entryPrice)/initialRisk)*(pnl>=0?1:-1)).toFixed(2):0;
          const durationMinutes=pos.openedAt?Math.floor((Date.now()-pos.openedAt)/60000):0;
          await notifyCB.call(this,'sl',positionSide,symbol);
          await setCooldown.call(this,symbol,60);
          const telegramText=buildCloseMessage(symbol,pos,exitPrice,'TIME_EXIT',pnl,rFinal,durationMinutes,`⏱ ${timeAction.note}`);
          delete state.positions[symbol];
          results.push({symbol,status:'TIME_EXIT',price:exitPrice,pnl:+pnl.toFixed(2),rFinal,durationMinutes,
            closeType:'TIME_EXIT',telegramText,executionId:execution.executionId,exchangeOrderId:execution.exchangeOrderId,
            exchangeResponse:execution.exchangeResponse,verificationResult:execution.verificationResult,
            timestamp:execution.timestamp,finalStatus:execution.finalStatus,...buildLearningContext(pos)});
CODE*/});
  code = code.slice(0, forceStart) + forceBlock + code.slice(forceEnd);

  const moveStart = code.indexOf("        } else if(timeAction.action === 'MOVE_SL'){");
  const moveEndMarker = "\n        }\n\n      } else {";
  const moveEnd = code.indexOf(moveEndMarker, moveStart);
  if (moveStart < 0 || moveEnd < 0) throw new Error('time SL block not found');
  const moveBlock = snippet(function(){/*CODE
        } else if(timeAction.action === 'MOVE_SL'){
          const execution=await executeVerified(this.helpers,{
            type:'MOVE_STOP_LOSS',symbol,positionSide,targetPrice:timeAction.newSL,reason:timeAction.note
          });
          if(!execution.ok){
            results.push({symbol,status:'TIME_SL_FAILED',finalStatus:execution.finalStatus,executionId:execution.executionId,
              message:execution.error,telegramText:executionFailureText(execution,'MOVE STOP LOSS (TIME)',symbol)});
            continue;
          }
          state.positions[symbol].slPrice=timeAction.newSL;
          state.positions[symbol].lastExecutionId=execution.executionId;
          await this.helpers.httpRequest({method:'POST',url:`${DASHBOARD}/trade`,json:true,body:{
            symbol,side:positionSide,entryPrice:pos.entryPrice,sl:timeAction.newSL,tp:pos.tp||0,
            qty:pos.qty,leverage:pos.leverage||1,openedAt:pos.openedAt,stage:pos.stage||'INITIAL',
            initialSL:pos.initialSL||pos.slPrice,aiResult:{regime:pos.aiRegime||'N/A',direction_bias:positionSide}
          }});
          results.push({
            symbol,status:'TIME_SL_ADJUSTED',price,oldSL:slPrice,newSL:timeAction.newSL,
            hoursOpen:+hoursOpen.toFixed(1),note:timeAction.note,
            executionId:execution.executionId,exchangeOrderId:execution.exchangeOrderId,
            exchangeResponse:execution.exchangeResponse,verificationResult:execution.verificationResult,
            timestamp:execution.timestamp,finalStatus:execution.finalStatus,
            telegramText:[
              '━━━━━━━━━━━━━━━━━━━━━━━','⏱ SL AJUSTADO POR TIEMPO','━━━━━━━━━━━━━━━━━━━━━━━',
              `💎 ${symbol}   ${isLong?'🟢 LONG':'🔴 SHORT'}`,'',
              `  ${timeAction.note}`,`  SL anterior : $${slPrice}`,`  SL nuevo    : $${timeAction.newSL}`,
              `  Precio act  : $${price}`,`  Entry       : $${pos.entryPrice}`,
              `  Tiempo      : ${Math.floor(hoursOpen)}h ${Math.round((hoursOpen%1)*60)}m`,'━━━━━━━━━━━━━━━━━━━━━━━'
            ].join('\n')
          });
CODE*/});
  code = code.slice(0, moveStart) + moveBlock + code.slice(moveEnd);
  code = replaceOnce(code,
    "  }catch(err){\n    results.push({ symbol, status:'error', message:err.message, telegramText:null });\n  }",
    "  }catch(err){\n    results.push({ symbol, status:'error', finalStatus:'FAILED', message:err.message,\n      telegramText:executionFailureText({error:err.message,failureNotificationSent:false},'TRADE MANAGEMENT',symbol) });\n  }",
    'SL monitor unexpected failure notification');
  node.parameters.jsCode = code;

  const postTrade = nodeCode(entry, 'Post-Trade Agent');
  postTrade.parameters.jsCode = replaceOnce(postTrade.parameters.jsCode,
    "// Solo analizar cierres reales\nif(!t.telegramText || t.status === 'monitoring' || t.status === 'no_positions_active'){\n  return [{ json: { skipped: true, reason: 'no close event' } }];\n}",
    "// Only Binance-verified close events may produce post-trade notifications.\nconst verifiedClose=['SL_EXECUTED','TIME_EXIT','EXCHANGE_CLOSE_VERIFIED'].includes(t.status) && t.finalStatus==='VERIFIED';\nif(!verifiedClose){ return []; }",
    'post-trade verified close gate');
  const deleteWebhook = {
    parameters:{httpMethod:'POST',path:'sl-monitor-delete',responseMode:'lastNode',options:{}},
    id:'sl-monitor-delete-webhook-v1',name:'Webhook Delete Position',type:'n8n-nodes-base.webhook',
    typeVersion:2,position:[240,120],webhookId:'sl-monitor-delete'
  };
  const deleteCode = {
    parameters:{jsCode:snippet(function(){/*CODE
const state=$getWorkflowStaticData('global');
const d=$input.first().json.body||$input.first().json;
if(!state.positions) state.positions={};
const existed=Boolean(state.positions[d.symbol]);
delete state.positions[d.symbol];
return [{json:{ok:true,symbol:d.symbol,removed:existed,executionId:d.executionId||null,positions:state.positions}}];
CODE*/})},
    id:'sl-monitor-delete-code-v1',name:'Eliminar Posición',type:'n8n-nodes-base.code',typeVersion:2,position:[464,120]
  };
  for(const newNode of [deleteWebhook,deleteCode]){
    const index=entry.workflow.nodes.findIndex(item=>item.name===newNode.name);
    if(index>=0) entry.workflow.nodes[index]=newNode; else entry.workflow.nodes.push(newNode);
  }
  entry.workflow.connections['Webhook Delete Position']={main:[[{node:'Eliminar Posición',type:'main',index:0}]]};
  writeWorkflow(entry);
}

function hardenEntry() {
  const entry = readWorkflow('advanced-ai-trading-bot-v2-clean.workflow.json');
  const node = nodeCode(entry, 'Execute Trade');
  node.parameters.jsCode = snippet(function(){/*CODE
const crypto=require('crypto');
const d=$input.first().json;
const executionId=crypto.randomUUID();
const positionSide=d.side==='BUY'?'LONG':'SHORT';
const engineUrl=process.env.EXECUTION_ENGINE_URL||'http://position_guard:3091/executions';
const token=process.env.EXECUTION_ENGINE_TOKEN;
if(!token){
  return [{json:{...d,success:false,executionId,finalStatus:'FAILED',failureNotificationSent:false,
    error:'EXECUTION_ENGINE_TOKEN is not configured',verificationResult:{verified:false}}}];
}
try{
  const execution=await this.helpers.httpRequest({
    method:'POST',url:engineUrl,json:true,timeout:180000,
    headers:{Authorization:`Bearer ${token}`},
    body:{executionId,type:'OPEN_POSITION',symbol:d.symbol,positionSide,quantity:d.qty,
      leverage:d.leverage,stopLoss:d.sl,takeProfit:d.tp,maxAttempts:3,tradeContext:{
        marginRequired:d.marginRequired,riskPct:d.riskPct,maxLoss:d.maxLoss,maxGain:d.maxGain,rrRatio:d.rrRatio,
        finalScore:d.finalScore,scanScore:d.scanScore,aiResult:d.aiResult,aiVision:d.aiVision,
        usedFallback:d.usedFallback,originalSymbol:d.originalSymbol,tf4h:d.tf4h,marketContext:d.marketContext,
        sizingInfo:d.sizingInfo,indicators:d.indicators,dynamicThreshold:d.dynamicThreshold,
        entryReason:d.aiResult?.reasoning,setupLabel:d.setupLabel
      }}
  });
  if(execution?.ok!==true||execution.finalStatus!=='VERIFIED'||execution.verificationResult?.verified!==true){
    return [{json:{...d,...execution,success:false,error:execution?.error||'Binance verification failed'}}];
  }
  const position=execution.verificationResult.after.position;
  const confirmedRequest=execution.verificationResult.requested;
  const stopCreate=execution.exchangeResponse?.stopOrder?.create||{};
  const tpCreate=execution.exchangeResponse?.takeProfitOrder?.create||{};
  return [{json:{
    ...d,success:true,executionId:execution.executionId,exchangeOrderId:execution.exchangeOrderId,
    exchangeResponse:execution.exchangeResponse,verificationResult:execution.verificationResult,
    timestamp:execution.timestamp,finalStatus:execution.finalStatus,
    symbol:d.symbol,side:positionSide,qty:position.qty,leverage:d.leverage,
    entryPrice:position.entryPrice,sl:confirmedRequest.stopLoss,tp:confirmedRequest.takeProfit,marketOrderId:execution.exchangeOrderId,
    slOrderId:stopCreate.algoId||null,tpOrderId:tpCreate.algoId||null,
    slPrice:confirmedRequest.stopLoss,slSide:positionSide==='LONG'?'SELL':'BUY',slPositionSide:positionSide,
    slMonitorRequired:true
  }}];
}catch(error){
  return [{json:{...d,success:false,executionId,finalStatus:'FAILED',failureNotificationSent:false,
    error:error.message,exchangeResponse:null,verificationResult:{verified:false,error:error.message},timestamp:new Date().toISOString()}}];
}
CODE*/});

  const monitorNode = nodeCode(entry, 'Monitor SL Global');
  let monitor = monitorNode.parameters.jsCode;
  monitor = replaceOnce(monitor,
    "const d = $input.first().json;\n",
    "const d = $input.first().json;\nif(d.finalStatus !== 'VERIFIED' || d.verificationResult?.verified !== true){\n  throw new Error('Trade cannot enter local state because Binance verification is missing');\n}\n",
    'entry local state verification gate');
  monitor = replaceOnce(monitor,
    "    symbol:       d.symbol,",
    "    symbol:       d.symbol,\n    executionId:  d.executionId,",
    'entry local execution ID');
  monitor = replaceOnce(monitor,
    "  if(!slMonitorOk){\n    console.log(`⚠️ SL Monitor FALLÓ 3 veces para ${d.symbol} — continuando igual`);\n  }",
    "  if(!slMonitorOk){\n    return [{json:{...d,success:false,finalStatus:'LOCAL_STATE_FAILED',failureNotificationSent:false,\n      error:`Binance verified the entry but SL Monitor local state failed for ${d.symbol}`}}];\n  }",
    'entry local state fail closed');
  monitor = replaceOnce(monitor, "  // ── 2. Health check", "  let slStateConfirmed=false;\n\n  // ── 2. Health check",
    'entry local state readback flag');
  monitor = replaceOnce(monitor,
    "          await this.helpers.httpRequest({\n            method:  'POST',\n            url:     WEBHOOK_URL,\n            json:    true,\n            body:    newPosition,\n            timeout: 5000\n          });\n          console.log(`✅ Health check reintento exitoso: ${d.symbol}`);",
    "          const retried=await this.helpers.httpRequest({\n            method:  'POST',\n            url:     WEBHOOK_URL,\n            json:    true,\n            body:    newPosition,\n            timeout: 5000\n          });\n          slStateConfirmed=Boolean(retried?.positions?.[d.symbol]);\n          console.log(`Health check retry ${slStateConfirmed?'confirmed':'unconfirmed'}: ${d.symbol}`);",
    'entry local state retry readback');
  monitor = replaceOnce(monitor,
    "      } else {\n        console.log(`✅ Health check OK: ${d.symbol} confirmado en SL Monitor`);",
    "      } else {\n        slStateConfirmed=true;\n        console.log(`✅ Health check OK: ${d.symbol} confirmado en SL Monitor`);",
    'entry local state readback success');
  monitor = replaceOnce(monitor,
    "  // ── 3. Dashboard (/trade)",
    "  if(!slStateConfirmed){\n    return [{json:{...d,success:false,finalStatus:'LOCAL_STATE_FAILED',failureNotificationSent:false,\n      error:`Binance verified the entry but SL Monitor read-back failed for ${d.symbol}`}}];\n  }\n\n  // ── 3. Dashboard (/trade)",
    'entry require local state readback');
  monitor = replaceOnce(monitor, "return [$input.first()];", "d.localStateVerified=true;\nreturn [{json:d}];",
    'entry local state confirmation');
  monitor = replaceOnce(monitor,
    "  }catch(e){\n    console.log(`Dashboard error: ${e.message}`);\n  }",
    "  }catch(e){\n    return [{json:{...d,success:false,finalStatus:'LOCAL_STATE_FAILED',failureNotificationSent:false,\n      error:`Binance verified the entry but Dashboard local state failed: ${e.message}`}}];\n  }",
    'entry dashboard state fail closed');
  monitorNode.parameters.jsCode = monitor;

  const alertNode = nodeCode(entry, 'Build Trade Alert');
  let alert = alertNode.parameters.jsCode;
  alert = replaceOnce(alert,
    "const d = $input.first().json;\n",
    "const d = $input.first().json;\nif(d.finalStatus !== 'VERIFIED' || d.verificationResult?.verified !== true || d.localStateVerified !== true){\n  return [{json:{text:['🚨 ATERUM LOCAL STATE FAILED',`${d.symbol||'UNKNOWN'} ${d.side||''}`,`Execution ID: ${d.executionId||'not-created'}`,\n    'Binance did not produce a fully persisted local trade state. No success notification was sent.',`Error: ${d.error||'verification or local-state gate failed'}`].join('\\n'),\n    finalStatus:d.finalStatus||'FAILED',executionId:d.executionId}}];\n}\n",
    'entry notification verification gate');
  alert = replaceOnce(alert,
    "}catch(e){ console.log('DB open error:',e.message); }\n\nconst lines = [",
    "}catch(e){\n  return [{json:{text:['🚨 ATERUM STATE PERSISTENCE FAILED',`${symbol} ${side}`,`Execution ID: ${d.executionId}`,\n    'Binance confirmed the position, but local persistence failed. No success notification was sent.',`Error: ${e.message}`].join('\\n'),\n    finalStatus:'LOCAL_PERSIST_FAILED',executionId:d.executionId}}];\n}\n\nconst lines = [",
    'entry persistence failure notification');
  alert = replaceOnce(alert,
    "marketOrderId:marketOrderId||null, tpOrderId:tpOrderId||null,",
    "marketOrderId:marketOrderId||null, slOrderId:slOrderId||null, tpOrderId:tpOrderId||null,\n      initialSL:sl, trailingStage:'INITIAL',",
    'entry persist protective IDs');
  alert = replaceOnce(alert,
    "      symbol, direction:side, entryPrice, sl, tp, qty, leverage,",
    "      executionId:d.executionId, symbol, direction:side, entryPrice, sl, tp, qty, leverage,",
    'entry idempotent persistence ID');
  alert = replaceOnce(alert, "      slMonitorRequired:!slOrderId,", "      slMonitorRequired:d.slMonitorRequired===true,",
    'entry persist logical monitor status');
  alertNode.parameters.jsCode = alert;

  const tradeTelegram = entry.workflow.nodes.find(item => item.name === 'Telegram: Trade Opened');
  const failureBuilder = {
    parameters:{jsCode:snippet(function(){/*CODE
const d=$input.first().json;
if(d.failureNotificationSent){ return [{json:{...d,telegramText:null}}]; }
const telegramText=[
  '🚨 ATERUM EXECUTION FAILED',
  `OPEN POSITION ${d.symbol||'UNKNOWN'} ${d.side||''}`,
  `Execution ID: ${d.executionId||'not-created'}`,
  'Binance did not confirm a protected position.',
  'Local state was not updated and no success notification was sent.',
  `Error: ${String(d.error||'unknown').slice(0,500)}`
].join('\n');
return [{json:{...d,telegramText}}];
CODE*/})},
    id:'execution-failure-builder-v1',name:'Build Execution Failure',type:'n8n-nodes-base.code',typeVersion:2,
    position:[2240,440]
  };
  const executionIf = {
    parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[
      {id:'execution-verified-condition',leftValue:'={{ $json.finalStatus }}',rightValue:'VERIFIED',operator:{type:'string',operation:'equals'}},
      {id:'execution-readback-condition',leftValue:'={{ $json.verificationResult.verified }}',rightValue:'',operator:{type:'boolean',operation:'true',singleValue:true}}
    ],combinator:'and'},options:{}},
    id:'execution-verified-if-v1',name:'If: Execution Verified',type:'n8n-nodes-base.if',typeVersion:2.2,position:[2050,300]
  };
  const failureIf = {
    parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},conditions:[
      {id:'failure-text-condition',leftValue:'={{ $json.telegramText }}',rightValue:'',operator:{type:'string',operation:'notEmpty',singleValue:true}}
    ],combinator:'and'},options:{}},
    id:'execution-failure-if-v1',name:'If: Failure Notification Required',type:'n8n-nodes-base.if',typeVersion:2.2,position:[2440,440]
  };
  const failureTelegram = JSON.parse(JSON.stringify(tradeTelegram));
  failureTelegram.id='execution-failure-telegram-v1'; failureTelegram.name='Telegram: Execution Failed';
  failureTelegram.position=[2640,440]; failureTelegram.parameters.text='={{ $json.telegramText }}';
  for(const newNode of [executionIf,failureBuilder,failureIf,failureTelegram]){
    const index=entry.workflow.nodes.findIndex(item=>item.name===newNode.name);
    if(index>=0) entry.workflow.nodes[index]=newNode; else entry.workflow.nodes.push(newNode);
  }
  entry.workflow.connections['Execute Trade']={main:[[{node:'If: Execution Verified',type:'main',index:0}]]};
  entry.workflow.connections['If: Execution Verified']={main:[
    [{node:'Monitor SL Global',type:'main',index:0}],
    [{node:'Build Execution Failure',type:'main',index:0}]
  ]};
  entry.workflow.connections['Build Execution Failure']={main:[[{node:'If: Failure Notification Required',type:'main',index:0}]]};
  entry.workflow.connections['If: Failure Notification Required']={main:[[{node:'Telegram: Execution Failed',type:'main',index:0}],[]]};
  entry.workflow.connections['Telegram: Execution Failed']={main:[[]]};
  writeWorkflow(entry);
}

updateTrailing();
updateSlMonitor();
hardenEntry();
console.log('trade-management workflows redesigned');
