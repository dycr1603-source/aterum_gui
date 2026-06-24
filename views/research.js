'use strict';

const {
  getSharedHeadAssets,
  getLoadingMarkup,
  getSharedChrome,
  getSharedStyles,
  getSharedScript,
  getSharedNav
} = require('./ui_shared');

function getResearchHTML(user) { return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>αтεгυм — Research</title>
${getSharedHeadAssets()}
<style>
:root{
  --bg:#070b12;--panel:#0d131d;--panel2:#111a27;--panel3:#151f2d;
  --line:rgba(148,163,184,.16);--line2:rgba(148,163,184,.26);
  --text:#f4f8ff;--muted:#93a4ba;--faint:#6f7f92;
  --blue:#57b0ff;--green:#2ee6a6;--red:#ff5b75;--gold:#f8c86a;
  --mono:'JetBrains Mono',monospace;--display:'Inter Tight','Inter',sans-serif;--sans:'Inter','Segoe UI',sans-serif;
}
*{box-sizing:border-box}
body.research-v1{margin:0;background:var(--bg);color:var(--text);font-family:var(--sans);font-size:12px}
.research-page{width:min(1600px,100%);margin:0 auto;padding:26px clamp(14px,2vw,28px) 70px}
.terminal-header{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr);gap:16px;margin-bottom:18px}
.surface{background:linear-gradient(180deg,rgba(17,26,39,.96),rgba(10,15,24,.96));border:1px solid var(--line);border-radius:8px;box-shadow:0 14px 36px rgba(0,0,0,.22)}
.surface.pad{padding:18px}
.kicker{font:700 9px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.title{font-family:var(--display);font-size:30px;line-height:1;font-weight:900;letter-spacing:0;margin:8px 0 10px}
.copy{font-size:12px;line-height:1.65;color:var(--muted);max-width:78ch}
.status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.status-cell{background:rgba(7,11,18,.62);border:1px solid var(--line);border-radius:6px;padding:12px}
.label{font:700 9px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--faint);margin-bottom:7px}
.value{font-family:var(--display);font-size:19px;font-weight:800;color:var(--text);overflow-wrap:anywhere}
.sub{font-size:10px;color:var(--muted);line-height:1.45;margin-top:4px}
.grid-2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-bottom:16px}
.grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.metric-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:16px}
.metric{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px;min-height:92px}
.metric .value{font-size:24px}
.section{margin-bottom:16px}
.section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:15px 16px;border-bottom:1px solid var(--line)}
.section-title{font:800 10px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;color:#c9d8eb}
.section-sub{font-size:10px;color:var(--muted);line-height:1.45;margin-top:5px}
.body{padding:16px}
.flow{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
.flow-step{border:1px solid var(--line);background:rgba(7,11,18,.58);border-radius:6px;min-height:62px;padding:10px;display:flex;align-items:center;justify-content:center;text-align:center;font:800 10px/1.3 var(--mono);color:#d8e6f8}
.help-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.help-card{border-left:2px solid var(--blue);background:rgba(87,176,255,.045);padding:10px 12px;border-radius:0 6px 6px 0}
.help-title{font:800 9px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:#c9d8eb;margin-bottom:6px}
.help-copy{font-size:10px;line-height:1.55;color:var(--muted)}
.table-wrap{overflow:auto}
table{width:100%;border-collapse:collapse}
th{position:sticky;top:0;background:#0c131d;border-bottom:1px solid var(--line2);padding:10px 12px;text-align:left;font:800 9px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:#91a4ba;white-space:nowrap}
td{border-bottom:1px solid rgba(148,163,184,.1);padding:11px 12px;vertical-align:top;font-size:11px;line-height:1.5;color:#d6e2f1}
tr:hover td{background:rgba(87,176,255,.035)}
.rec-text{font-weight:700;color:#eef5ff;max-width:760px}
.rec-detail{font-size:9px;color:#91a4ba;margin-top:5px}
.chip{display:inline-flex;align-items:center;border:1px solid var(--line2);border-radius:999px;padding:4px 8px;font:800 9px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);background:rgba(7,11,18,.72);white-space:nowrap}
.chip.good{color:var(--green);border-color:rgba(46,230,166,.24);background:rgba(46,230,166,.07)}
.chip.bad{color:var(--red);border-color:rgba(255,91,117,.24);background:rgba(255,91,117,.07)}
.chip.warn{color:var(--gold);border-color:rgba(248,200,106,.24);background:rgba(248,200,106,.07)}
.chip.info{color:var(--blue);border-color:rgba(87,176,255,.24);background:rgba(87,176,255,.07)}
.list{display:grid;gap:10px}
.item{border:1px solid var(--line);background:rgba(7,11,18,.58);border-radius:7px;padding:12px}
.item-title{font-size:12px;font-weight:800;line-height:1.45;color:#eef5ff}
.item-meta{font-size:10px;color:var(--muted);line-height:1.5;margin-top:6px}
.report-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:16px}
.report-text{white-space:pre-wrap;max-height:460px;overflow:auto;color:#c4d2e5;font-size:11px;line-height:1.65;background:rgba(7,11,18,.45);border:1px solid var(--line);border-radius:7px;padding:13px}
.report-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.report-list{max-height:460px;overflow:auto}
.report-item{border-bottom:1px solid rgba(148,163,184,.11);padding:11px;cursor:pointer}
.report-item.active{background:rgba(87,176,255,.07)}
.report-item:hover{background:rgba(87,176,255,.045)}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.input{min-height:34px;border-radius:6px;border:1px solid var(--line);background:#090f17;color:var(--text);font:600 10px var(--mono);padding:0 10px}
.empty{padding:22px;color:var(--muted);font-size:11px;text-align:center}
.fade-in{animation:fadeIn .22s ease both}
@keyframes fadeIn{from{opacity:.55}to{opacity:1}}
@media(max-width:1100px){.terminal-header,.grid-2,.report-layout{grid-template-columns:1fr}.metric-grid{grid-template-columns:repeat(3,1fr)}.flow{grid-template-columns:repeat(2,1fr)}.help-grid,.grid-3{grid-template-columns:1fr}}
@media(max-width:680px){.metric-grid,.status-grid{grid-template-columns:1fr}.title{font-size:24px}.research-page{padding-inline:14px}}
${getSharedStyles()}
</style>
</head>
<body class="research-v1">
${getSharedChrome({accent:'#57b0ff',accentSoft:'rgba(87,176,255,.18)',secondary:'rgba(46,230,166,.1)',loaderLabel:'Cargando research'})}
<div class="page-shell">
${getSharedNav('research', user, 'blue')}
<main class="research-page">
  <header class="terminal-header">
    <section class="surface pad">
      <div class="kicker">AI Research Terminal</div>
      <h1 class="title">Research</h1>
      <div class="copy">Centro de interpretación de Anthropic sobre datos reales del sistema. Analytics muestra métricas; Research explica hipótesis, riesgos, oportunidades, recomendaciones y su impacto histórico.</div>
    </section>
    <section class="surface pad">
      <div class="status-grid" id="headerStatus">${getLoadingMarkup('Cargando estado')}</div>
    </section>
  </header>

  <section class="surface section">
    <div class="section-head">
      <div>
        <div class="section-title">Overview</div>
        <div class="section-sub">Qué hace, qué no hace y cómo debe interpretarse.</div>
      </div>
      <span class="chip info">Observacional</span>
    </div>
    <div class="body">
      <div class="grid-3">
        <div class="item"><div class="item-title">Qué es</div><div class="item-meta">Un sistema de aprendizaje operativo que analiza trades, cierres, rechazos, horarios, símbolos y post-trade analysis.</div></div>
        <div class="item"><div class="item-title">Qué no hace</div><div class="item-meta">No abre operaciones, no toca Binance, no cambia ATR, RSI, trailing, scoring ni Risk Guard.</div></div>
        <div class="item"><div class="item-title">Cuándo actuar</div><div class="item-meta">Cuando la recomendación tenga evidencia, confianza razonable y el Review Engine la valide con datos posteriores.</div></div>
      </div>
      <div class="help-grid">
        <div class="help-card"><div class="help-title">Confianza</div><div class="help-copy">Lectura de fuerza de la hipótesis extraída del informe. No es permiso para ejecutar cambios.</div></div>
        <div class="help-card"><div class="help-title">Impacto</div><div class="help-copy">Diferencia medida entre ventana previa y posterior usando PnL, expectancy y win rate.</div></div>
        <div class="help-card"><div class="help-title">Estado</div><div class="help-copy">Pending espera datos; reviewing no concluye; validated mejora; rejected empeora.</div></div>
      </div>
    </div>
  </section>

  <section class="surface section">
    <div class="section-head">
      <div>
        <div class="section-title">How it works</div>
        <div class="section-sub">Pipeline de datos e interpretación visible para el operador.</div>
      </div>
    </div>
    <div class="body">
      <div class="flow">
        <div class="flow-step">Binance</div>
        <div class="flow-step">n8n</div>
        <div class="flow-step">MySQL</div>
        <div class="flow-step">Research API</div>
        <div class="flow-step">Anthropic</div>
        <div class="flow-step">Recommendations</div>
        <div class="flow-step">Review Engine</div>
      </div>
    </div>
  </section>

  <section class="metric-grid" id="recommendationMetrics">${getLoadingMarkup('Cargando KPIs')}</section>

  <section class="surface section">
    <div class="section-head">
      <div>
        <div class="section-title">Último informe Anthropic</div>
        <div class="section-sub">Informe persistido por los workflows Daily Analysis Report o Weekly Deep Analysis.</div>
      </div>
      <span class="chip good" id="reportStatus">Histórico</span>
    </div>
    <div class="body">
      <div class="filters">
        <select class="input" id="reportType" onchange="loadResearchReports()"><option value="">Todos</option><option value="daily">Diario</option><option value="weekly">Semanal</option></select>
        <input class="input" type="date" id="reportFrom" onchange="loadResearchReports()">
        <input class="input" type="date" id="reportTo" onchange="loadResearchReports()">
      </div>
      <div class="report-layout">
        <div>
          <div class="report-meta" id="reportMeta"></div>
          <div class="value" id="reportTitle">Sin informes todavía</div>
          <div class="report-text" id="reportText">Cuando se ejecute un informe de Anthropic, quedará guardado aquí.</div>
        </div>
        <div>
          <div class="kicker" style="margin-bottom:8px">Histórico</div>
          <div class="report-list" id="reportHistory">${getLoadingMarkup('Cargando informes')}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="surface section">
    <div class="section-head">
      <div>
        <div class="section-title">Recommendations</div>
        <div class="section-sub">Recomendaciones completas con evidencia, estado, impacto y resultado. La acción es siempre manual.</div>
      </div>
      <span class="chip warn" id="recReviewStatus">Cargando</span>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Fecha</th><th>Recomendación</th><th>Confianza</th><th>Evidencia</th><th>Implementación</th><th>Estado</th><th>Impacto</th><th>Resultado</th></tr></thead><tbody id="recommendationsTable"><tr><td colspan="8">${getLoadingMarkup('Cargando recomendaciones')}</td></tr></tbody></table>
    </div>
  </section>

  <div class="grid-2">
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Risks</div><div class="section-sub">Riesgos detectados e hipótesis que requieren cautela.</div></div></div>
      <div class="body"><div class="list" id="riskList">${getLoadingMarkup('Cargando riesgos')}</div></div>
    </section>
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Opportunities</div><div class="section-sub">Oportunidades detectadas para revisión operativa.</div></div></div>
      <div class="body"><div class="list" id="opportunityList">${getLoadingMarkup('Cargando oportunidades')}</div></div>
    </section>
  </div>

  <div class="grid-2">
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Operator Actions</div><div class="section-sub">Qué revisar manualmente, sin ejecución automática.</div></div></div>
      <div class="body"><div class="list" id="operatorActions">${getLoadingMarkup('Cargando acciones')}</div></div>
    </section>
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Strategy Evolution</div><div class="section-sub">Timeline de aprendizaje y resultado histórico.</div></div></div>
      <div class="body"><div class="list" id="strategyEvolution">${getLoadingMarkup('Cargando evolución')}</div></div>
    </section>
  </div>
</main>
</div>

<script>
let researchReports=[];
let researchRecommendations=[];
let recommendationPerformance=null;
let strategyEvolution=[];

function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function safeJson(value,fallback){if(value&&typeof value==='object')return value;if(!value)return fallback;try{return JSON.parse(value)}catch(e){return fallback}}
function fmtDate(value){if(!value)return 'sin fecha';return String(value).slice(0,10)}
function statusLabel(value){return ({pending:'pendiente',reviewing:'en revisión',validated:'validada',rejected:'rechazada',positive:'positivo',neutral:'neutral',negative:'negativo',baja:'baja',media:'media',alta:'alta',pendiente:'pendiente',en_prueba:'en prueba',implementada:'implementada',descartada:'descartada'})[value]||value||'pendiente'}
function chipClass(value){return ({validated:'good',positive:'good',implementada:'good',rejected:'bad',negative:'bad',descartada:'bad',pending:'warn',pendiente:'warn',reviewing:'info',neutral:'info',en_prueba:'info',baja:'warn',media:'info',alta:'good'})[value]||'info'}
function metric(label,value,sub){return '<div class="metric fade-in"><div class="label">'+escapeHtml(label)+'</div><div class="value">'+escapeHtml(value)+'</div><div class="sub">'+escapeHtml(sub)+'</div></div>'}

function renderHeader(){
  const latest=researchReports[0]||null;
  const s=recommendationPerformance?.summary||{};
  document.getElementById('headerStatus').innerHTML=[
    metric('Último informe', latest?fmtDate(latest.report_date):'sin datos', latest?String(latest.report_type||'daily').toUpperCase():'esperando Anthropic'),
    metric('Modelo', latest?.model||'sin modelo', latest?.source_workflow||'workflow pendiente'),
    metric('Estado', (s.pending||0)+' pending', (s.validated||0)+' validadas · '+(s.rejected||0)+' rechazadas'),
    metric('Impacto promedio', Number(s.avgImpactScore||0).toFixed(3), 'medido por Review Engine')
  ].join('');
}

function selectResearchReport(id){
  const report=researchReports.find(r=>String(r.id)===String(id))||researchReports[0];
  if(!report)return;
  document.querySelectorAll('.report-item').forEach(el=>el.classList.toggle('active',el.dataset.id===String(report.id)));
  document.getElementById('reportTitle').textContent=(report.report_type||'daily').toUpperCase()+' · '+fmtDate(report.report_date);
  document.getElementById('reportText').textContent=report.report||'Sin reporte';
  document.getElementById('reportMeta').innerHTML=[
    report.model?'Modelo '+report.model:null,
    report.score!=null?'Score '+report.score:null,
    report.source_workflow||null,
    report.created_at?String(report.created_at).replace('T',' ').slice(0,16)+' UTC':null
  ].filter(Boolean).map(v=>'<span class="chip info">'+escapeHtml(v)+'</span>').join('');
}

async function loadResearchReports(){
  const params=new URLSearchParams();
  const type=document.getElementById('reportType')?.value||'';
  const from=document.getElementById('reportFrom')?.value||'';
  const to=document.getElementById('reportTo')?.value||'';
  if(type)params.set('type',type); if(from)params.set('from',from); if(to)params.set('to',to); params.set('limit','80');
  const data=await fetch('/api/research/reports?'+params.toString()).then(r=>r.json());
  researchReports=data.reports||[];
  document.getElementById('reportStatus').textContent=researchReports.length+' informes';
  const history=document.getElementById('reportHistory');
  if(!researchReports.length){
    history.innerHTML='<div class="empty">Sin informes guardados todavía</div>';
    renderHeader();
    return;
  }
  history.innerHTML=researchReports.map((r,i)=>'<div class="report-item '+(i===0?'active':'')+'" data-id="'+r.id+'" onclick="selectResearchReport(\\''+r.id+'\\')"><div class="item-title">'+escapeHtml((r.report_type||'daily').toUpperCase()+' · '+fmtDate(r.report_date))+'</div><div class="item-meta">'+escapeHtml(r.model||'modelo no registrado')+'</div></div>').join('');
  selectResearchReport(researchReports[0].id);
  renderHeader();
}

function renderRecommendationMetrics(){
  const s=recommendationPerformance?.summary||{};
  document.getElementById('recommendationMetrics').innerHTML=[
    metric('Emitidas',s.total||0,'recomendaciones registradas'),
    metric('Exitosas',s.positive||0,'resultado positivo'),
    metric('Fallidas',s.negative||0,'resultado negativo'),
    metric('Neutras',s.neutral||0,'sin evidencia concluyente'),
    metric('Success Rate',(s.successRate||0)+'%','positivas sobre total'),
    metric('Impact Score',Number(s.avgImpactScore||0).toFixed(3),'impacto promedio')
  ].join('');
}

function renderRecommendationsTable(){
  const tbody=document.getElementById('recommendationsTable');
  if(!researchRecommendations.length){tbody.innerHTML='<tr><td colspan="8" class="empty">Sin recomendaciones extraídas todavía</td></tr>';return;}
  tbody.innerHTML=researchRecommendations.map(rec=>{
    const evidence=safeJson(rec.evidence,{});
    const details=[rec.category?'Categoría: '+rec.category:null, rec.rationale||null, (evidence.symbols||[]).length?'Símbolos: '+evidence.symbols.join(', '):null, (evidence.hours||[]).length?'Horarios: '+evidence.hours.join(', '):null, rec.notes||null].filter(Boolean).join(' · ');
    return '<tr><td>'+escapeHtml(fmtDate(rec.created_at||rec.report_date))+'</td><td><div class="rec-text">'+escapeHtml(rec.recommendation)+'</div><div class="rec-detail">'+escapeHtml(details||'Evidencia pendiente')+'</div></td><td>'+Number(rec.confidence||0).toFixed(0)+'%</td><td><span class="chip '+chipClass(rec.evidence_level)+'">'+escapeHtml(statusLabel(rec.evidence_level||'baja'))+'</span></td><td><span class="chip '+chipClass(rec.implementation_status)+'">'+escapeHtml(statusLabel(rec.implementation_status||'pendiente'))+'</span></td><td><span class="chip '+chipClass(rec.status)+'">'+escapeHtml(statusLabel(rec.status))+'</span></td><td>'+(rec.impact_score==null?'pendiente':Number(rec.impact_score).toFixed(3))+'</td><td><span class="chip '+chipClass(rec.outcome)+'">'+escapeHtml(statusLabel(rec.outcome||'neutral'))+'</span></td></tr>';
  }).join('');
}

function renderList(id,items,empty){
  const el=document.getElementById(id);
  if(!items.length){el.innerHTML='<div class="empty">'+escapeHtml(empty)+'</div>';return;}
  el.innerHTML=items.slice(0,10).map(rec=>'<div class="item fade-in"><div class="item-title">'+escapeHtml(rec.recommendation||rec.version)+'</div><div class="item-meta">'+escapeHtml(rec.notes||rec.rationale||rec.meta||'Pendiente de revisión')+'</div></div>').join('');
}

function renderLearning(){
  document.getElementById('recReviewStatus').textContent=researchRecommendations.length+' recomendaciones';
  renderRecommendationMetrics();
  renderRecommendationsTable();
  const risks=researchRecommendations.filter(r=>r.category==='risk');
  const opps=researchRecommendations.filter(r=>r.category==='opportunity');
  const actions=researchRecommendations.filter(r=>['pending','reviewing','validated'].includes(r.status));
  renderList('riskList',risks,'Sin riesgos detectados todavía.');
  renderList('opportunityList',opps,'Sin oportunidades detectadas todavía.');
  renderList('operatorActions',actions.map(r=>({...r,notes:'Acción manual sugerida · confianza '+Number(r.confidence||0).toFixed(0)+'% · estado '+statusLabel(r.status)})),'Sin acciones pendientes.');
  renderList('strategyEvolution',(strategyEvolution||[]).map(e=>({version:e.version,recommendation:e.version,meta:(e.recommendations||0)+' recomendaciones · '+(e.validated||0)+' validadas · '+(e.rejected||0)+' rechazadas · impacto '+Number(e.avgImpactScore||0).toFixed(3)})),'Sin evolución histórica todavía.');
  renderHeader();
}

async function loadRecommendationLearning(){
  const [recs,perf,evolution]=await Promise.all([
    fetch('/api/research/recommendations?limit=180').then(r=>r.json()),
    fetch('/api/research/recommendations/performance').then(r=>r.json()),
    fetch('/api/research/strategy-evolution').then(r=>r.json())
  ]);
  researchRecommendations=recs.recommendations||[];
  recommendationPerformance=perf||{};
  strategyEvolution=evolution.evolution||[];
  renderLearning();
}

async function refreshResearch(){
  try{
    await Promise.all([loadResearchReports(),loadRecommendationLearning()]);
  }catch(error){
    document.getElementById('recommendationMetrics').innerHTML='<div class="empty">No se pudo cargar Research</div>';
  }
}

window.aterumAssistantConfig={page:'research',kicker:'AI Research',subtitle:'Explica recomendaciones, riesgos, oportunidades e impacto medido.',placeholder:'¿Qué debería revisar manualmente hoy?'};
window.aterumAssistantContext=()=>({pagina:'research',recomendaciones:researchRecommendations.slice(0,8),ultimoInforme:researchReports[0]||null,performance:recommendationPerformance?.summary||null});

refreshResearch();
setInterval(refreshResearch,60000);
</script>
<script>${getSharedScript()}</script>
</body></html>`; }

module.exports = { getResearchHTML };
