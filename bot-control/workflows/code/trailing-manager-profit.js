const crypto = require('crypto');
const API_KEY    = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;
const BASE       = 'https://fapi.binance.com';
const SL_GET     = 'http://127.0.0.1:5678/webhook/sl-monitor-get';
const SL_SET     = 'http://127.0.0.1:5678/webhook/sl-monitor-set';
const DASHBOARD  = 'http://127.0.0.1:3001';
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
  if(result?.failureNotificationSent || result?.failureNotificationSuppressed) return null;
  const transient=/status code 429|too many requests|timeout|timed out|ECONNRESET|EAI_AGAIN/i.test(String(result?.error||''));
  if(transient && result?.verificationResult?.exchangeVerified!==true) return null;
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

// ── Protection policy ─────────────────────────────────────────────────────────
// Two parallel progress measures, both qty-invariant (computed per unit):
//   currentR       = favourable move / real initial risk |entry - initialSL|
//   profitProgress = net PnL now / net PnL expected at TP (fees on both legs)
// A milestone is reached by R alone, or by profitProgress with an R floor.
// Every stop must also clear fees (BE and above), stay outside ATR noise and
// strictly improve the current SL — it never moves backwards.
const FEE_RATE_PER_SIDE = 0.001; // Binance taker + slippage reserve; matches execution engine buffer
const ATR_MULT      = 1.0;       // trailing distance
const ATR_PERIOD    = 14;
const MIN_GAP_ATR   = 0.5;       // new stop must stay >= 0.5 ATR(1h) away from price
const FALLBACK_GAP_R = 0.25;     // gap used when ATR is unavailable
const MIN_STEP_R    = 0.10;      // ignore SL improvements smaller than 0.1R
const MIN_NET_FEE_MULT = 1.0;    // net PnL must be >= round-trip fees before claiming BE or better
const RISK_REDUCED_R = 0.5;      // remaining risk after the first milestone

const MILESTONES = {
  RISK_REDUCED:{ r:0.60, progress:0.30, minR:0.35 },
  BREAKEVEN:   { r:1.00, progress:0.50, minR:0.50 },
  LOCK:        { r:1.50, progress:0.70, minR:0.70, lockR:0.5, lockShare:0.30 },
  TRAILING:    { r:2.00, progress:0.85, minR:0.85, lockShare:0.50 },
};

// Time rules are expressed in R of the real initial risk, not in % of price.
const TIME_RULES = [
  { h:4,  r:0.75, keep:0.30, label:'4h ≥0.75R → asegura 30% neto'  },
  { h:6,  r:1.00, keep:0.45, label:'6h ≥1R → asegura 45% neto'     },
  { h:8,  r:1.00, keep:0.55, label:'8h ≥1R → asegura 55% neto'     },
  { h:12, r:0.75, keep:0.65, label:'12h ≥0.75R → asegura 65% neto' },
  { h:16, r:0.50, keep:0.75, label:'16h ≥0.5R → asegura 75% neto'  },
  { h:24, r:0.25, keep:0.85, label:'24h ≥0.25R → asegura 85% neto' },
];

function sign(params){
  const query=Object.entries({...params,timestamp:Date.now(),recvWindow:60000})
    .map(([k,v])=>`${k}=${encodeURIComponent(v)}`).join('&');
  return query+'&signature='+crypto.createHmac('sha256',API_SECRET).update(query).digest('hex');
}
function precision(v){
  const s=v.toString();
  if(!s.includes('.'))return 0;
  return s.split('.')[1].replace(/0+$/,'').length;
}
// Rounds towards the price (tighter stop): LONG up, SHORT down.
function roundProtective(val,tick,positionSide){
  const units=positionSide==='SHORT'?Math.floor(val/tick+1e-9):Math.ceil(val/tick-1e-9);
  return Number((units*tick).toFixed(precision(tick)));
}
// Rounds away from the price (keeps the full gap): LONG down, SHORT up.
function roundLoose(val,tick,positionSide){
  const units=positionSide==='SHORT'?Math.ceil(val/tick-1e-9):Math.floor(val/tick+1e-9);
  return Number((units*tick).toFixed(precision(tick)));
}
// Stop price at which closing leaves `netPerUnit` USDT per unit after both fee legs.
function stopForNetProfit(positionSide,entryPrice,netPerUnit,tick){
  const f=FEE_RATE_PER_SIDE;
  const raw=positionSide==='SHORT'
    ?(entryPrice*(1-f)-netPerUnit)/(1+f)
    :(entryPrice*(1+f)+netPerUnit)/(1-f);
  return roundProtective(raw,tick,positionSide);
}
function netPerUnitAt(positionSide,entryPrice,exitPrice){
  const move=positionSide==='SHORT'?entryPrice-exitPrice:exitPrice-entryPrice;
  return move-(entryPrice+exitPrice)*FEE_RATE_PER_SIDE;
}
function isSafeStop(stop,price,positionSide,tick){
  return Number.isFinite(stop)&&(positionSide==='SHORT'?stop>=price+2*tick:stop<=price-2*tick);
}
function betterStop(a,b,positionSide){
  if(a==null)return b;
  if(b==null)return a;
  return positionSide==='SHORT'?Math.min(a,b):Math.max(a,b);
}
function calcATR(klines){
  const trs=[];
  for(let i=1;i<klines.length;i++){
    const h=parseFloat(klines[i][2]),l=parseFloat(klines[i][3]),pc=parseFloat(klines[i-1][4]);
    trs.push(Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc)));
  }
  if(trs.length<ATR_PERIOD)return trs.reduce((a,b)=>a+b,0)/(trs.length||1);
  let atr=trs.slice(0,ATR_PERIOD).reduce((a,b)=>a+b,0)/ATR_PERIOD;
  for(let i=ATR_PERIOD;i<trs.length;i++)atr=(atr*(ATR_PERIOD-1)+trs[i])/ATR_PERIOD;
  return atr;
}
function stageWeight(s){
  return {INITIAL:0,BREAKEVEN:1,TIME_LOCK:2,LOCK:3,TRAILING:4}[s]||0;
}

// Pure decision: returns the most protective valid stop, or null.
function planProtection(p){
  const { positionSide, entryPrice, initialRisk, slPrice, price, tick, atr, tp, hoursOpen, stage } = p;
  const dir=positionSide==='SHORT'?-1:1;
  const currentR=dir*(price-entryPrice)/initialRisk;
  const netPerUnit=netPerUnitAt(positionSide,entryPrice,price);
  const feePerUnit=(entryPrice+price)*FEE_RATE_PER_SIDE;
  const tpValid=Number.isFinite(tp)&&dir*(tp-entryPrice)>0;
  const targetNetPerUnit=tpValid?netPerUnitAt(positionSide,entryPrice,tp):0;
  const profitProgress=targetNetPerUnit>0&&netPerUnit>0?netPerUnit/targetNetPerUnit:0;
  const netOk=netPerUnit>=MIN_NET_FEE_MULT*feePerUnit;
  const breakevenSL=stopForNetProfit(positionSide,entryPrice,0,tick);
  const gap=Math.max(atr>0?MIN_GAP_ATR*atr:FALLBACK_GAP_R*initialRisk,2*tick);
  const gapLimit=roundLoose(price-dir*gap,tick,positionSide);
  const minStep=Math.max(MIN_STEP_R*initialRisk,tick);
  const currentWeight=stageWeight(stage);
  const reached=m=>currentR>=m.r||(profitProgress>=m.progress&&currentR>=m.minR);
  const via=m=>currentR>=m.r?`${currentR.toFixed(2)}R`:`${(profitProgress*100).toFixed(0)}% del PnL neto al TP`;

  const candidates=[];
  const consider=(stageName,raw,{floor=null,label,trigger})=>{
    if(raw==null||!Number.isFinite(raw))return;
    let stop=floor!=null?betterStop(raw,floor,positionSide):raw;
    // Never place the stop inside the noise band around price.
    if(dir*(stop-gapLimit)>0)stop=gapLimit;
    // Crossing from a net-negative SL to a fee-covered one is always worth a move, however small.
    const crossesBreakeven=floor!=null&&dir*(slPrice-breakevenSL)<0&&dir*(stop-slPrice)>0;
    const valid=(floor==null||dir*(stop-floor)>=-1e-12)
      &&(dir*(stop-slPrice)>=minStep-1e-12||crossesBreakeven)
      &&isSafeStop(stop,price,positionSide,tick);
    candidates.push({stage:stageName,stop,valid,label,trigger});
  };

  if(netPerUnit>0&&reached(MILESTONES.RISK_REDUCED)){
    consider('INITIAL',roundProtective(entryPrice-dir*initialRisk*RISK_REDUCED_R,tick,positionSide),
      {label:'🛡 Riesgo reducido a 0.5R',trigger:via(MILESTONES.RISK_REDUCED)});
  }
  if(netOk&&reached(MILESTONES.BREAKEVEN)){
    consider('BREAKEVEN',breakevenSL,{floor:breakevenSL,
      label:'⚖️ Break-even neto (comisiones cubiertas)',trigger:via(MILESTONES.BREAKEVEN)});
  }
  if(netOk){
    let rule=null;
    for(const r of TIME_RULES) if(hoursOpen>=r.h&&currentR>=r.r) rule=r;
    if(rule){
      consider('TIME_LOCK',stopForNetProfit(positionSide,entryPrice,netPerUnit*rule.keep,tick),
        {floor:breakevenSL,label:`⏰ Time Lock: ${rule.label}`,trigger:rule.label});
    }
  }
  if(netOk&&reached(MILESTONES.LOCK)){
    const m=MILESTONES.LOCK;
    const byR=currentR>=m.r?roundProtective(entryPrice+dir*initialRisk*m.lockR,tick,positionSide):null;
    const byProfit=profitProgress>=m.progress?stopForNetProfit(positionSide,entryPrice,netPerUnit*m.lockShare,tick):null;
    consider('LOCK',betterStop(byR,byProfit,positionSide),{floor:breakevenSL,
      label:'🔒 Ganancia neta protegida',trigger:via(m)});
  }
  const trailing=netOk&&reached(MILESTONES.TRAILING);
  if(trailing||(currentWeight>=stageWeight('TRAILING')&&netPerUnit>0)){
    const m=MILESTONES.TRAILING;
    const byAtr=roundLoose(price-dir*atr*ATR_MULT,tick,positionSide);
    const byProfit=profitProgress>=m.progress?stopForNetProfit(positionSide,entryPrice,netPerUnit*m.lockShare,tick):null;
    consider('TRAILING',betterStop(byAtr,byProfit,positionSide),{floor:breakevenSL,
      label:'🎯 Trailing ATR / 50% del PnL neto',trigger:trailing?via(m):'trailing activo'});
  }

  const valid=candidates.filter(c=>c.valid);
  let chosen=null;
  for(const c of valid) if(!chosen||dir*(c.stop-chosen.stop)>0) chosen=c;
  let newStage=stage;
  if(chosen){
    // The chosen stop is at least as protective as every valid candidate, so it earns the highest stage among them.
    for(const c of valid) if(stageWeight(c.stage)>stageWeight(newStage)) newStage=c.stage;
    if(dir*(chosen.stop-slPrice)<=0) chosen=null; // final guard: SL never retreats
  }
  return { currentR, netPerUnit, feePerUnit, targetNetPerUnit, profitProgress, netOk, breakevenSL,
    gap, minStep, candidates, chosen, newStage: chosen?newStage:stage };
}

function nextMilestoneText(currentR,profitProgress){
  for(const [name,m] of Object.entries(MILESTONES)){
    if(!(currentR>=m.r||(profitProgress>=m.progress&&currentR>=m.minR))){
      return `${name}: ${m.r}R o ${(m.progress*100).toFixed(0)}% del TP neto (mín ${m.minR}R)`;
    }
  }
  return 'TRAILING activo';
}
function esc(v){
  return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function isTransientNetworkError(e){
  const msg=String(e?.message||e||'');
  const code=String(e?.code||e?.cause?.code||'');
  return ['EAI_AGAIN','ENOTFOUND','ECONNRESET','ETIMEDOUT','ECONNABORTED'].some(x=>msg.includes(x)||code.includes(x));
}
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
async function httpWithRetry(helpers, options, label='request', maxRetries=3){
  let lastErr=null;
  for(let i=0;i<maxRetries;i++){
    try{
      return await helpers.httpRequest({...options, timeout: options.timeout||15000});
    }catch(e){
      lastErr=e;
      const retryable=isTransientNetworkError(e) || (e?.response?.statusCode>=500);
      console.log(`[${label}] intento ${i+1}/${maxRetries} falló: ${e.message}`);
      if(!retryable || i===maxRetries-1) break;
      await sleep(750*(i+1));
    }
  }
  throw lastErr;
}
function fallbackTick(symbol){
  if(symbol==='BTCUSDT')return 0.1;
  if(symbol==='ETHUSDT')return 0.01;
  return 0.01;
}

// ── Reintento para SL_SET ─────────────────────────────────────────────────────
async function setSLWithRetry(helpers, url, body, maxRetries=3){
  for(let i=0; i<maxRetries; i++){
    try{
      await httpWithRetry(helpers, { method:'POST', url, json:true, body }, 'SL_SET', 3);
      return true;
    }catch(e){
      console.log(`[SL_SET] Intento ${i+1}/${maxRetries} falló: ${e.message}`);
      if(i < maxRetries-1) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

// ── Fetch estado ──────────────────────────────────────────────────────────────
let positions={};
try{
  const resp=await httpWithRetry(this.helpers,{method:'GET',url:SL_GET,json:true},'SL_GET',3);
  positions=resp.positions||{};
}catch(e){
  return [{json:{status:'error_reading_state',message:e.message}}];
}

if(Object.keys(positions).length===0){
  return [{json:{status:'no_positions',ts:new Date().toISOString()}}];
}

// exchangeInfo una sola vez. Si Binance DNS falla, no tumbar el nodo completo.
let exInfo={symbols:[]};
try{
  exInfo=await httpWithRetry(this.helpers,{
    method:'GET',url:`${BASE}/fapi/v1/exchangeInfo`,json:true
  },'exchangeInfo',4);
}catch(e){
  console.log(`[exchangeInfo] no disponible tras reintentos: ${e.message}. Se usan ticks fallback por simbolo.`);
}

// ── Procesar todas las posiciones EN PARALELO ─────────────────────────────────
const results=await Promise.all(Object.keys(positions).map(async(key)=>{
  const pos=positions[key];
  const symbol=pos.symbol||key.split(':')[0];
  const{positionSide,side,stage}=pos;
  const slPrice=Number(pos.slPrice),entryPrice=Number(pos.entryPrice),initialSL=Number(pos.initialSL),qty=Number(pos.qty);

  if(!entryPrice||!initialSL||!slPrice){
    return{symbol,status:'missing_entry_data',slPrice,stage,telegramText:null};
  }
  const initialRisk=Math.abs(entryPrice-initialSL);
  if(!(initialRisk>0)){
    return{symbol,status:'missing_entry_data',slPrice,stage,message:'initial risk is zero',telegramText:null};
  }

  try{
    const[tickerResp,klinesResp]=await Promise.all([
      httpWithRetry(this.helpers,{method:'GET',url:`${BASE}/fapi/v1/ticker/price?symbol=${symbol}`,json:true},`ticker ${symbol}`,3),
      httpWithRetry(this.helpers,{method:'GET',url:`${BASE}/fapi/v1/klines?symbol=${symbol}&interval=1h&limit=30`,json:true},`klines ${symbol}`,3)
    ]);

    const price=parseFloat(tickerResp.price);
    const atr=calcATR(klinesResp);

    const symInfo=exInfo.symbols.find(s=>s.symbol===symbol);
    const tick=parseFloat(symInfo?.filters.find(f=>f.filterType==='PRICE_FILTER')?.tickSize||fallbackTick(symbol));

    const openedAt     =pos.openedAt||Date.now();
    const hoursOpen    =(Date.now()-openedAt)/(1000*60*60);
    const minutesOpen  =Math.floor((Date.now()-openedAt)/60000);
    const targetPrice  =Number(pos.tp);

    const plan=planProtection({ positionSide, entryPrice, initialRisk, slPrice, price, tick,
      atr:Number.isFinite(atr)?atr:0, tp:targetPrice, hoursOpen, stage:stage||'INITIAL' });
    const { currentR, profitProgress } = plan;
    const unitQty      =qty>0?qty:0;
    const currentPnL   =positionSide==='SHORT'?entryPrice-price:price-entryPrice;
    const currentPct   =currentPnL/entryPrice;
    const unrealizedPnL=+(currentPnL*unitQty).toFixed(2);
    const pnlPct       =+((currentPnL/entryPrice)*100).toFixed(3);
    const netPnL       =plan.netPerUnit*unitQty;
    const targetNetPnL =plan.targetNetPerUnit*unitQty;
    const targetGain   =positionSide==='SHORT'?entryPrice-targetPrice:targetPrice-entryPrice;

    let newSL=slPrice,newStage=stage||'INITIAL',reason;
    let slChanged=false,stageLabel='',stageEmoji='';
    if(plan.chosen){
      newSL=plan.chosen.stop;newStage=plan.newStage;slChanged=true;
      stageLabel=plan.chosen.label;stageEmoji=plan.chosen.label.split(' ')[0];
      reason=`${plan.chosen.label} (${plan.chosen.trigger}): ${slPrice} → ${newSL}`;
    }else{
      const blocked=plan.candidates.map(c=>`${c.stage}@${c.stop}`).join(', ');
      reason=`R=${currentR.toFixed(3)} | PnL neto ${netPnL.toFixed(3)} USDT (${(profitProgress*100).toFixed(1)}% del TP)`
        +` | próximo ${nextMilestoneText(currentR,profitProgress)} | ${Math.floor(hoursOpen)}h`
        +(blocked?` | sin mejora válida (${blocked})`:'');
    }

    const protectedNetPnL=slChanged
      ?+(netPerUnitAt(positionSide,entryPrice,newSL)*unitQty).toFixed(2)
      :null;

    let telegramText=null;
    let execution=null;

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
      const slSetOk = await setSLWithRetry(this.helpers, SL_SET, {
        symbol, executionId:execution.executionId, positionSide, slPrice:newSL, qty:pos.qty, side,
        entryPrice:pos.entryPrice, initialSL:pos.initialSL, stage:newStage,
        tp:pos.tp||null, leverage:pos.leverage||null,
        finalScore:pos.finalScore||null,
        openedAt, aiRegime:pos.aiRegime||'N/A'
      });

      if(!slSetOk){
        slChanged = false;
        reason += ' | Binance VERIFIED but SL_SET local sync failed';
        telegramText=executionFailureText({ executionId:execution.executionId, error:'Binance confirmed the SL but n8n local state synchronization failed', failureNotificationSent:false }, 'LOCAL STATE SYNC', symbol);
        console.log(`[${symbol}] Binance verified, but SL_SET local synchronization failed`);
      } else {
        console.log(`[${symbol}] SL Monitor: ${slPrice} → ${newSL} (${newStage})`);

        // ── 2. Dashboard — solo si SL Monitor fue exitoso ─────────────────
        try{
          await this.helpers.httpRequest({
            method:'POST',url:`${DASHBOARD}/trade`,json:true,
            body:{
              symbol,side:positionSide,entryPrice,
              sl:newSL,tp:pos.tp||0,qty,
              leverage:pos.leverage||1,finalScore:pos.finalScore||0,
              openedAt,stage:newStage,initialSL,
              aiResult:{regime:pos.aiRegime||'N/A',direction_bias:positionSide}
            }
          });
        }catch(e){throw new Error(`Dashboard local state failed after verified execution: ${e.message}`);}

        // MySQL was already persisted by the verified execution engine.

        // ── 3. Telegram (verified execution only) ──────────────────────────
        const dir=positionSide==='SHORT'?'🔴 SHORT':'🟢 LONG';
        const ts=new Date().toISOString().replace('T',' ').slice(0,19)+' UTC';
        const durTxt=minutesOpen<60?`${minutesOpen}m`:`${Math.floor(minutesOpen/60)}h ${minutesOpen%60}m`;
        const protectionLabel=plan.chosen.stage==='INITIAL'?'RIESGO REDUCIDO':newStage;
        const initialGrossRisk=initialRisk*unitQty;
        const remainingGrossRisk=Math.max(0,positionSide==='SHORT'?newSL-entryPrice:entryPrice-newSL)*unitQty;
        const remainingRiskPct=initialGrossRisk>0?remainingGrossRisk/initialGrossRisk*100:0;
        const previousNetAtSL=netPerUnitAt(positionSide,entryPrice,slPrice)*unitQty;

        telegramText=[
          `━━━━━━━━━━━━━━━━━━━`,
          `${stageEmoji} SL ACTUALIZADO — ${esc(protectionLabel)}`,
          `━━━━━━━━━━━━━━━━━━━`,
          ``,
          `${dir}  ${esc(symbol)}`,
          `⏰ ${ts}  (abierto ${durTxt})`,
          ``,
          `📊 ${esc(stageLabel)}`,
          `└ Disparador: ${esc(plan.chosen.trigger)}`,
          ``,
          `🎯 Stop Loss`,
          `├ Anterior:  ${esc(slPrice)}`,
          `└ Nuevo:     ${esc(newSL)}  ✅`,
          `✅ Cambio confirmado por Binance y persistido`,
          `🆔 Ejecución: ${esc(execution.executionId)}`,
          ``,
          `🛡 Riesgo al stop`,
          `├ Inicial sin comisiones: $${initialGrossRisk.toFixed(3)}`,
          `├ Restante sin comisiones: $${remainingGrossRisk.toFixed(3)} (${remainingRiskPct.toFixed(1)}% del inicial)`,
          `└ Neto estimado al SL anterior: ${previousNetAtSL>=0?'+':'-'}$${Math.abs(previousNetAtSL).toFixed(3)}`,
          ``,
          `💰 Estado`,
          `├ Entry:     ${esc(entryPrice)}`,
          `├ Precio:    ${esc(price)}`,
          `├ Cantidad: ${esc(qty)} · Apalancamiento: ${esc(pos.leverage||1)}×`,
          `├ R actual:  ${currentR.toFixed(3)}R`,
          `├ PnL bruto: ${unrealizedPnL>=0?'+':''}$${esc(unrealizedPnL)} (${pnlPct>=0?'+':''}${pnlPct}%)`,
          `├ PnL neto estimado: ${netPnL>=0?'+':''}$${netPnL.toFixed(2)}`,
          `├ Avance al TP: ${(profitProgress*100).toFixed(1)}% del PnL neto objetivo`,
          protectedNetPnL>=0
            ?`└ Protegido al SL (neto estimado): +$${protectedNetPnL.toFixed(2)}`
            :`└ Pérdida máx. al SL (neto estimado): -$${Math.abs(protectedNetPnL).toFixed(2)}`,
          ``,
          `📐 Niveles`,
          `├ BE neto:   ${esc(plan.breakevenSL)}`,
          `├ TP objetivo: ${esc(pos.tp||'N/A')} (${targetGain>0?(targetGain/initialRisk).toFixed(2)+'R':'N/D'})`,
          `├ Initial SL: ${esc(initialSL)}`,
          `└ Próximo: ${esc(nextMilestoneText(currentR,profitProgress))} — el SL solo mejora`,
          `━━━━━━━━━━━━━━━━━━━`
        ].join('\n');
      }
      }
    }

    console.log(`[${symbol}] R=${currentR.toFixed(2)} PnLnet=${netPnL.toFixed(3)} TP=${(profitProgress*100).toFixed(1)}% stage=${newStage} ${Math.floor(hoursOpen)}h +${(currentPct*100).toFixed(2)}% | ${reason}`);

    return{
      symbol,
      status:       slChanged?'SL_UPDATED':'monitoring',
      currentR:     +currentR.toFixed(3),
      price,entryPrice,initialSL,
      initialRisk:  +initialRisk.toFixed(8),
      unrealizedPnL,pnlPct,
      netPnL:+netPnL.toFixed(3),targetNetPnL:+targetNetPnL.toFixed(3),profitProgress:+profitProgress.toFixed(3),
      hoursOpen:    +hoursOpen.toFixed(2),
      oldSL:slPrice,newSL,
      stage:slChanged?newStage:(stage||'INITIAL'),
      atr:+atr.toFixed(8),
      candidates:plan.candidates,
      reason,telegramText,
      executionId:execution?.executionId || null,
      exchangeOrderId:execution?.exchangeOrderId || null,
      verificationResult:execution?.verificationResult || null,
      finalStatus:execution?.finalStatus || null
    };

  }catch(err){
    console.log(`[${symbol}] Error: ${err.message}`);
    return{symbol,status:'error',finalStatus:'FAILED',message:err.message,
      telegramText:executionFailureText({error:err.message,failureNotificationSent:false},'TRAILING MANAGEMENT',symbol)};
  }
}));

return results.map(r=>({json:r}));
