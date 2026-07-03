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
.research-page{width:min(1600px,100%);margin:0 auto;padding:22px clamp(14px,2vw,28px) 70px}
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
.metric{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;min-height:82px}
.metric .value{font-size:24px}
.section{margin-bottom:16px}
.section-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:15px 16px;border-bottom:1px solid var(--line)}
.section-title{font:800 10px/1 var(--mono);letter-spacing:.13em;text-transform:uppercase;color:#c9d8eb}
.section-sub{font-size:10px;color:var(--muted);line-height:1.45;margin-top:5px}
.body{padding:16px}
.flow{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:8px}
.flow-step{border:1px solid var(--line);background:rgba(7,11,18,.58);border-radius:6px;min-height:62px;padding:10px;display:flex;align-items:center;justify-content:center;text-align:center;font:800 10px/1.3 var(--mono);color:#d8e6f8}
.help-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
.help-card{border-left:2px solid var(--blue);background:rgba(87,176,255,.045);padding:10px 12px;border-radius:0 6px 6px 0}
.help-title{font:800 9px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;color:#c9d8eb;margin-bottom:6px}
.help-copy{font-size:10px;line-height:1.55;color:var(--muted)}
.table-wrap{overflow:auto;max-height:390px;scrollbar-color:rgba(87,176,255,.38) transparent;scrollbar-width:thin}
.research-tabs{position:sticky;top:10px;z-index:30;display:flex;align-items:center;gap:6px;margin:0 0 16px;padding:7px;background:rgba(8,13,21,.92);border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 28px rgba(0,0,0,.28);backdrop-filter:blur(16px)}
.research-tab{appearance:none;border:1px solid transparent;background:transparent;color:var(--muted);border-radius:7px;padding:10px 16px;font:800 10px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:.18s ease}
.research-tab:hover{color:var(--text);background:rgba(87,176,255,.06)}
.research-tab.active{color:#07111d;background:var(--blue);border-color:rgba(255,255,255,.18);box-shadow:0 5px 16px rgba(87,176,255,.2)}
.research-tab-note{margin-left:auto;padding:0 10px;color:var(--faint);font-size:10px}
[data-panel]{display:none!important}
[data-panel].panel-active{display:block!important}
[data-panel].grid-2.panel-active,[data-panel].metric-grid.panel-active{display:grid!important}
.section .body>.list{max-height:330px;overflow:auto;scrollbar-color:rgba(87,176,255,.38) transparent;scrollbar-width:thin}
table{width:100%;border-collapse:collapse}
.table-wrap .learning-table{min-width:1120px!important}
.table-wrap .changes-table{min-width:1780px!important;table-layout:fixed}
.changes-table th:nth-child(1){width:130px}.changes-table th:nth-child(2){width:90px}.changes-table th:nth-child(3){width:250px}.changes-table th:nth-child(4){width:150px}.changes-table th:nth-child(5){width:390px}.changes-table th:nth-child(6){width:300px}.changes-table th:nth-child(7){width:150px}.changes-table th:nth-child(8){width:110px}.changes-table th:nth-child(9){width:160px}
.change-value{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:5px;align-items:start;font:700 10px/1.45 var(--mono);color:#dce9f8}
.change-value>span:not(.change-arrow){min-width:0;overflow-wrap:anywhere}
.change-arrow{color:var(--blue);padding:0 5px}
.impact-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:6px;align-items:center;min-width:150px}
.impact-pair .before{color:var(--muted)}
.impact-pair .after{color:var(--text);font-weight:800}
.timeline-item{display:grid;grid-template-columns:112px minmax(0,1fr) auto;gap:12px;align-items:start}
.timeline-date{font:700 10px/1.5 var(--mono);color:var(--faint)}
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
@media(max-width:680px){.metric-grid,.status-grid{grid-template-columns:1fr}.title{font-size:24px}.research-page{padding-inline:14px}.research-tabs{top:6px;overflow:auto}.research-tab{padding:9px 12px}.research-tab-note{display:none}}
@media(max-width:680px){.timeline-item{grid-template-columns:1fr}.timeline-date{margin-bottom:-4px}}
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
      <div class="copy">Centro de aprendizaje operativo basado en datos reales. Research interpreta el histórico, construye reglas dinámicas y audita cómo esas reglas modifican cada decisión antes de una entrada.</div>
    </section>
    <section class="surface pad">
      <div class="status-grid" id="headerStatus">${getLoadingMarkup('Cargando estado')}</div>
    </section>
  </header>

  <nav class="research-tabs" aria-label="Secciones de Research">
    <button class="research-tab active" type="button" data-target="overview" onclick="setResearchPanel('overview')">Resumen</button>
    <button class="research-tab" type="button" data-target="engine" onclick="setResearchPanel('engine')">Motor y reglas</button>
    <button class="research-tab" type="button" data-target="reports" onclick="setResearchPanel('reports')">Informes</button>
    <button class="research-tab" type="button" data-target="changes" onclick="setResearchPanel('changes')">Cambios y auditoría</button>
    <span class="research-tab-note">Cada sección conserva su propio scroll</span>
  </nav>

  <section class="surface section panel-active" data-panel="overview">
    <div class="section-head">
      <div>
        <div class="section-title">Resumen operativo</div>
        <div class="section-sub">Qué hace, qué no hace y cómo debe interpretarse.</div>
      </div>
      <span class="chip info" id="learningMode">Cargando modo</span>
    </div>
    <div class="body">
      <div class="grid-3">
        <div class="item"><div class="item-title">Qué es</div><div class="item-meta">Un motor que convierte rendimiento histórico y recomendaciones corroboradas en pesos por símbolo, setup, sesión, régimen y score.</div></div>
        <div class="item"><div class="item-title">Qué no hace</div><div class="item-meta">No cambia ATR, RSI, trailing ni órdenes abiertas. Sólo permite, penaliza, prioriza o rechaza una nueva entrada antes de Position Sizer.</div></div>
        <div class="item"><div class="item-title">Cuándo aprende</div><div class="item-meta">Una regla influye al superar la muestra mínima. Los bloqueos requieren una muestra mayor y evidencia negativa concordante.</div></div>
      </div>
      <div class="help-grid">
        <div class="help-card"><div class="help-title">Peso</div><div class="help-copy">1.00 es neutral. Menor a 1 penaliza el score; mayor a 1 lo prioriza dentro de límites conservadores.</div></div>
        <div class="help-card"><div class="help-title">Evidencia</div><div class="help-copy">La hora corresponde a la entrada. Research y Review Engine sólo refuerzan una regla cuando los trades reales coinciden.</div></div>
        <div class="help-card"><div class="help-title">Protección</div><div class="help-copy">Pérdida diaria, semanal, drawdown y rachas pueden detener nuevas entradas. Nunca cierran una posición existente.</div></div>
      </div>
    </div>
  </section>

  <section class="surface section panel-active" data-panel="overview">
    <div class="section-head">
      <div>
        <div class="section-title">Flujo de aprendizaje</div>
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
        <div class="flow-step">Learning Engine</div>
        <div class="flow-step">Entry Gate</div>
      </div>
    </div>
  </section>

  <section class="metric-grid panel-active" data-panel="overview" id="recommendationMetrics">${getLoadingMarkup('Cargando KPIs')}</section>

  <section class="surface section" data-panel="engine">
    <div class="section-head">
      <div>
        <div class="section-title">Motor de aprendizaje</div>
        <div class="section-sub">Reglas que realmente intervienen antes de abrir una operación.</div>
      </div>
      <span class="chip info" id="learningUpdated">Sin reconstrucción</span>
    </div>
    <div class="body"><div class="metric-grid" id="learningMetrics">${getLoadingMarkup('Cargando motor')}</div></div>
    <div class="table-wrap">
      <table class="learning-table"><thead><tr><th>Estado</th><th>Dimensión</th><th>Regla</th><th>Acción</th><th>Peso</th><th>Muestra</th><th>Win Rate</th><th>Expectancy</th><th>PF</th><th>Evidencia</th></tr></thead><tbody id="learningRules"><tr><td colspan="10">${getLoadingMarkup('Cargando reglas')}</td></tr></tbody></table>
    </div>
  </section>

  <section class="metric-grid" data-panel="changes" id="learningChangeMetrics">${getLoadingMarkup('Cargando cambios')}</section>

  <section class="surface section" data-panel="changes">
    <div class="section-head">
      <div>
        <div class="section-title">Cambios del motor</div>
        <div class="section-sub">Registro permanente de qué cambió, cuánto cambió, por qué se aplicó y quién lo modificó.</div>
      </div>
      <span class="chip info" id="changeAuditStatus">Auditando</span>
    </div>
    <div class="body"><div class="metric-grid" id="changePerformance">${getLoadingMarkup('Cargando impacto global')}</div></div>
    <div class="table-wrap">
      <table class="changes-table"><thead><tr><th>Fecha</th><th>Versión</th><th>Cambio</th><th>Tipo</th><th>Antes → Después</th><th>Razón</th><th>Estado</th><th>Muestra</th><th>Actor</th></tr></thead><tbody id="learningChanges"><tr><td colspan="9">${getLoadingMarkup('Cargando cambios aplicados')}</td></tr></tbody></table>
    </div>
  </section>

  <section class="surface section" data-panel="changes">
    <div class="section-head">
      <div>
        <div class="section-title">Impacto Real</div>
        <div class="section-sub">Comparación antes/después normalizada por ventana, con muestra y significancia visibles.</div>
      </div>
    </div>
    <div class="table-wrap">
      <table class="changes-table"><thead><tr><th>Cambio</th><th>Trades</th><th>Win Rate</th><th>Expectancy</th><th>Profit Factor</th><th>Drawdown</th><th>Confianza</th><th>Resultado</th></tr></thead><tbody id="changeImpact"><tr><td colspan="8">${getLoadingMarkup('Calculando impacto')}</td></tr></tbody></table>
    </div>
  </section>

  <section class="surface section" data-panel="changes">
    <div class="section-head">
      <div>
        <div class="section-title">Línea temporal</div>
        <div class="section-sub">Versiones completas, implementaciones, validaciones y reversiones en orden cronológico.</div>
      </div>
    </div>
    <div class="body"><div class="list" id="learningTimeline">${getLoadingMarkup('Cargando evolución')}</div></div>
  </section>

  <div class="grid-2 panel-active" data-panel="overview">
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Protección de capital</div><div class="section-sub">Circuit breakers calculados con resultados reales y balance actual.</div></div></div>
      <div class="body"><div class="list" id="capitalStatus">${getLoadingMarkup('Cargando protección')}</div></div>
    </section>
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Decisiones recientes</div><div class="section-sub">Últimas evaluaciones del Entry Gate, incluidas pruebas controladas.</div></div></div>
      <div class="body"><div class="list" id="learningDecisions">${getLoadingMarkup('Cargando decisiones')}</div></div>
    </section>
  </div>

  <section class="surface section" data-panel="reports">
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

  <section class="surface section" data-panel="reports">
    <div class="section-head">
      <div>
        <div class="section-title">Recomendaciones</div>
        <div class="section-sub">Hipótesis de Anthropic y su estado real: implementada, en prueba o descartada.</div>
      </div>
      <span class="chip warn" id="recReviewStatus">Cargando</span>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Fecha</th><th>Recomendación</th><th>Confianza</th><th>Evidencia</th><th>Implementación</th><th>Estado</th><th>Impacto</th><th>Resultado</th></tr></thead><tbody id="recommendationsTable"><tr><td colspan="8">${getLoadingMarkup('Cargando recomendaciones')}</td></tr></tbody></table>
    </div>
  </section>

  <div class="grid-2" data-panel="reports">
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Riesgos</div><div class="section-sub">Riesgos detectados e hipótesis que requieren cautela.</div></div></div>
      <div class="body"><div class="list" id="riskList">${getLoadingMarkup('Cargando riesgos')}</div></div>
    </section>
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Oportunidades</div><div class="section-sub">Oportunidades detectadas para revisión operativa.</div></div></div>
      <div class="body"><div class="list" id="opportunityList">${getLoadingMarkup('Cargando oportunidades')}</div></div>
    </section>
  </div>

  <div class="grid-2" data-panel="reports">
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Acciones del operador</div><div class="section-sub">Qué revisar manualmente, sin ejecución automática.</div></div></div>
      <div class="body"><div class="list" id="operatorActions">${getLoadingMarkup('Cargando acciones')}</div></div>
    </section>
    <section class="surface section">
      <div class="section-head"><div><div class="section-title">Evolución de estrategia</div><div class="section-sub">Timeline de aprendizaje y resultado histórico.</div></div></div>
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
let learningSummary=null;
let learningRules=[];
let learningDecisions=[];
let learningChanges=[];
let learningChangeSummary=null;
let learningTimeline=[];

function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function safeJson(value,fallback){if(value&&typeof value==='object')return value;if(!value)return fallback;try{return JSON.parse(value)}catch(e){return fallback}}
function fmtDate(value){if(!value)return 'sin fecha';return String(value).slice(0,10)}
function statusLabel(value){return ({pending:'pendiente',reviewing:'en revisión',validated:'validada',rejected:'rechazada',positive:'positivo',neutral:'neutral',negative:'negativo',baja:'baja',media:'media',alta:'alta',low:'baja',medium:'media',high:'alta',active:'activa',monitoring:'monitoreando',insufficient:'evidencia insuficiente',revert_required:'revertir',reverted:'revertida',superseded:'sustituida',improved:'mejoró',worsened:'empeoró',volume_only:'solo redujo volumen',no_effect:'sin evidencia',no_evidence:'sin evidencia',apply:'aplicado',update:'actualizado',revert:'reversión',manual:'manual',suspended:'suspendida',reduce:'reducir',prioritize:'priorizar',block:'bloquear',halt:'detener',pendiente:'pendiente',en_prueba:'en prueba',implementada:'implementada',descartada:'descartada',enforce:'aplicando',observe:'observando',disabled:'desactivado',ALLOW:'permitida',REJECT:'rechazada',HALT:'detenida'})[value]||value||'pendiente'}
function chipClass(value){return ({validated:'good',positive:'good',improved:'good',implementada:'good',active:'good',prioritize:'good',ALLOW:'good',reverted:'bad',revert_required:'bad',worsened:'bad',volume_only:'bad',rejected:'bad',negative:'bad',descartada:'bad',block:'bad',halt:'bad',REJECT:'bad',HALT:'bad',pending:'warn',pendiente:'warn',monitoring:'warn',insufficient:'warn',reduce:'warn',reviewing:'info',neutral:'info',no_effect:'info',no_evidence:'info',superseded:'info',suspended:'info',en_prueba:'info',baja:'warn',low:'warn',media:'info',medium:'info',alta:'good',high:'good',enforce:'good'})[value]||'info'}
function metric(label,value,sub){return '<div class="metric fade-in"><div class="label">'+escapeHtml(label)+'</div><div class="value">'+escapeHtml(value)+'</div><div class="sub">'+escapeHtml(sub)+'</div></div>'}
function signed(value,decimals=2){const n=Number(value||0);return (n>0?'+':'')+n.toFixed(decimals)}

function setResearchPanel(panel){
  const allowed=['overview','engine','reports','changes'];
  const selected=allowed.includes(panel)?panel:'overview';
  document.querySelectorAll('[data-panel]').forEach(element=>element.classList.toggle('panel-active',element.dataset.panel===selected));
  document.querySelectorAll('.research-tab').forEach(button=>{
    const active=button.dataset.target===selected;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',active?'true':'false');
  });
  try{localStorage.setItem('aterum-research-panel',selected)}catch(_){ }
  history.replaceState(null,'','#'+selected);
}

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

function renderLearningEngine(){
  const summary=learningSummary||{};
  const rules=summary.rules||{};
  const decisions=summary.decisions||{};
  const recommendations=summary.recommendations||{};
  const capital=summary.capital||{};
  const config=summary.config||{};
  document.getElementById('learningMode').textContent='Motor '+statusLabel(summary.mode);
  document.getElementById('learningMode').className='chip '+chipClass(summary.mode);
  document.getElementById('learningUpdated').textContent=summary.latestRun?.created_at?String(summary.latestRun.created_at).replace('T',' ').slice(0,16)+' UTC':'Sin reconstrucción';
  document.getElementById('learningMetrics').innerHTML=[
    metric('Reglas activas',rules.active||0,(rules.new_active||0)+' nuevas · '+(rules.reduced||0)+' reducen · '+(rules.prioritized||0)+' priorizan'),
    metric('En observación',rules.monitoring||0,(rules.suspended||0)+' suspendidas · mínimo '+(config.softMinSample||0)+' cierres'),
    metric('Bloqueos',rules.blocked||0,'mínimo '+(config.hardMinSample||0)+' cierres'),
    metric('Decisiones 7d',decisions.total||0,(decisions.allowed||0)+' permitidas · '+(decisions.rejected||0)+' rechazadas'),
    metric('Implementadas',recommendations.implemented||0,(recommendations.testing||0)+' en prueba · impacto '+Number(recommendations.cumulative_impact||0).toFixed(2)),
    metric('Descartadas',recommendations.discarded||0,'no participan en el score')
  ].join('');

  const tbody=document.getElementById('learningRules');
  if(!learningRules.length){tbody.innerHTML='<tr><td colspan="10" class="empty">Todavía no hay reglas calculadas</td></tr>'}
  else tbody.innerHTML=learningRules.map(rule=>'<tr><td><span class="chip '+chipClass(rule.status)+'">'+escapeHtml(statusLabel(rule.status))+'</span></td><td>'+escapeHtml(rule.rule_type)+'</td><td><div class="rec-text">'+escapeHtml(rule.rule_key)+'</div><div class="rec-detail">'+escapeHtml(rule.rationale||'')+'</div></td><td><span class="chip '+chipClass(rule.action)+'">'+escapeHtml(statusLabel(rule.action))+'</span></td><td>'+Number(rule.weight||1).toFixed(3)+'</td><td>'+Number(rule.sample_size||0)+'</td><td>'+Number(rule.win_rate||0).toFixed(1)+'%</td><td>'+signed(rule.expectancy,3)+'</td><td>'+Number(rule.profit_factor||0).toFixed(2)+'</td><td><span class="chip '+chipClass(rule.evidence_level)+'">'+escapeHtml(statusLabel(rule.evidence_level))+'</span></td></tr>').join('');

  const capitalRows=[
    {title:capital.halted?'Nuevas entradas detenidas':'Protección disponible',meta:capital.halted?(capital.reasons||[]).join(' · '):'Ningún límite alcanzado',tone:capital.halted?'bad':'good'},
    {title:'Día '+signed(capital.dailyPnl)+' USDT ('+signed(capital.dailyPct,2)+'%)',meta:'Límite '+Number(config.dailyLossLimitPct||0).toFixed(1)+'%',tone:Number(capital.dailyPct||0)<0?'warn':'good'},
    {title:'7 días '+signed(capital.weeklyPnl)+' USDT ('+signed(capital.weeklyPct,2)+'%)',meta:'Límite '+Number(config.weeklyLossLimitPct||0).toFixed(1)+'%',tone:Number(capital.weeklyPct||0)<0?'warn':'good'},
    {title:'Drawdown '+signed(capital.maxDrawdown)+' USDT ('+signed(capital.drawdownPct,2)+'%)',meta:'Racha global: '+Number(capital.streaks?.global||0)+' pérdidas',tone:Number(capital.drawdownPct||0)<0?'warn':'good'}
  ];
  document.getElementById('capitalStatus').innerHTML=capitalRows.map(row=>'<div class="item"><div class="item-title"><span class="chip '+row.tone+'">'+escapeHtml(row.title)+'</span></div><div class="item-meta">'+escapeHtml(row.meta)+'</div></div>').join('');

  document.getElementById('learningDecisions').innerHTML=learningDecisions.length?learningDecisions.slice(0,8).map(decision=>'<div class="item"><div class="item-title"><span class="chip '+chipClass(decision.action)+'">'+escapeHtml(statusLabel(decision.action))+'</span> '+escapeHtml(decision.symbol||'Sin símbolo')+' · '+Number(decision.final_score||0).toFixed(1)+' / '+Number(decision.required_score||0).toFixed(1)+'</div><div class="item-meta">'+escapeHtml(decision.reason||'Sin motivo')+' · '+escapeHtml(decision.session_key||'')+(decision.dry_run?' · PRUEBA':'')+'</div></div>').join(''):'<div class="empty">El historial aparecerá cuando n8n consulte el Entry Gate.</div>';
}

function ruleStateText(value){
  const state=safeJson(value,{});
  if(state.weight!=null){
    const extras=[state.action?statusLabel(state.action):null,state.researchFactor!=null?'Research '+Number(state.researchFactor).toFixed(3):null,state.reviewFactor!=null?'Review '+Number(state.reviewFactor).toFixed(3):null].filter(Boolean).join(' · ');
    return Number(state.weight).toFixed(3)+(extras?' · '+extras:'');
  }
  if(state.value!=null)return String(state.value);
  return Object.keys(state).length?JSON.stringify(state):'—';
}

function pair(before,after,formatter){
  const format=formatter||((value)=>String(value??'—'));
  return '<div class="impact-pair"><span class="before">'+escapeHtml(format(before))+'</span><span class="change-arrow">→</span><span class="after">'+escapeHtml(format(after))+'</span></div>';
}

function renderLearningChanges(){
  const summary=learningChangeSummary||{};
  const before=summary.before||{};
  const after=summary.after||{};
  document.getElementById('learningChangeMetrics').innerHTML=[
    metric('Cambios aplicados',summary.applied||0,'registro permanente'),
    metric('Validados',summary.validated||0,'mejora demostrada'),
    metric('Revertidos',summary.reverted||0,'rollback registrado'),
    metric('En observación',Number(summary.monitoring||0),'esperando evidencia'),
    metric('Pendientes',Number(summary.pending||0)+Number(summary.revert_required||0),'requieren resolución'),
    metric('Impacto acumulado',signed(summary.cumulativeImpact||0,2),'sólo cambios validados')
  ].join('');
  document.getElementById('changePerformance').innerHTML=[
    metric('Win Rate',Number(before.winRate||0).toFixed(1)+'% → '+Number(after.winRate||0).toFixed(1)+'%',(before.trades||0)+' antes · '+(after.trades||0)+' después'),
    metric('Expectancy',signed(before.expectancy,3)+' → '+signed(after.expectancy,3),'USDT por trade'),
    metric('Profit Factor',Number(before.profitFactor||0).toFixed(2)+' → '+Number(after.profitFactor||0).toFixed(2),'rendimiento global'),
    metric('Drawdown',signed(before.maxDrawdown,2)+' → '+signed(after.maxDrawdown,2),'USDT'),
    metric('R promedio',signed(before.avgR,3)+' → '+signed(after.avgR,3),'normalizado por riesgo'),
    metric('Frecuencia',Number(before.tradesPerDay||0).toFixed(2)+' → '+Number(after.tradesPerDay||0).toFixed(2),'trades por día')
  ].join('');
  document.getElementById('changeAuditStatus').textContent=learningChanges.length+' cambios trazables';

  const tbody=document.getElementById('learningChanges');
  if(!learningChanges.length){tbody.innerHTML='<tr><td colspan="9" class="empty">Aún no hay cambios implementados registrados</td></tr>'}
  else tbody.innerHTML=learningChanges.map(change=>{
    const evidence=safeJson(change.evidence,{});
    const state=change.review_status||change.status;
    const sample=evidence.sample!=null?evidence.sample:(safeJson(change.after_metrics,{}).trades||0);
    return '<tr><td class="mono">'+escapeHtml(String(change.implemented_at||'').replace('T',' ').slice(0,16))+'</td><td>'+escapeHtml(change.version_label||'—')+'</td><td><div class="rec-text">'+escapeHtml(change.target_key||change.component)+'</div><div class="rec-detail">'+escapeHtml(change.human_explanation||'Sin explicación')+'</div></td><td>'+escapeHtml(change.component)+'</td><td><div class="change-value"><span>'+escapeHtml(ruleStateText(change.before_value))+'</span><span class="change-arrow">→</span><span>'+escapeHtml(ruleStateText(change.after_value))+'</span></div></td><td><div class="rec-detail">'+escapeHtml(change.reason||'Sin razón registrada')+'</div></td><td><span class="chip '+chipClass(state)+'">'+escapeHtml(statusLabel(state))+'</span></td><td>'+Number(sample||0)+' / '+Number(change.validation_sample||20)+'</td><td>'+escapeHtml(change.actor||'Learning Engine')+'</td></tr>';
  }).join('');

  const impactRows=learningChanges.filter(change=>change.before_metrics||change.after_metrics);
  const impactBody=document.getElementById('changeImpact');
  if(!impactRows.length){impactBody.innerHTML='<tr><td colspan="8" class="empty">Los comparativos aparecerán cuando existan trades posteriores a una implementación</td></tr>'}
  else impactBody.innerHTML=impactRows.map(change=>{
    const b=safeJson(change.before_metrics,{}),a=safeJson(change.after_metrics,{});
    const verdict=change.verdict||'no_evidence';
    return '<tr><td><div class="rec-text">'+escapeHtml(change.target_key)+'</div><div class="rec-detail">'+escapeHtml(change.review_explanation||change.human_explanation||'')+'</div></td><td>'+pair(b.trades,a.trades)+'</td><td>'+pair(b.winRate,a.winRate,v=>Number(v||0).toFixed(1)+'%')+'</td><td>'+pair(b.expectancy,a.expectancy,v=>signed(v,3))+'</td><td>'+pair(b.profitFactor,a.profitFactor,v=>Number(v||0).toFixed(2))+'</td><td>'+pair(b.maxDrawdown,a.maxDrawdown,v=>signed(v,2))+'</td><td>'+Number(change.confidence_pct||0).toFixed(0)+'%'+(Number(change.statistically_significant)?' · significativa':'')+'</td><td><span class="chip '+chipClass(verdict)+'">'+escapeHtml(statusLabel(verdict))+'</span></td></tr>';
  }).join('');

  const timeline=document.getElementById('learningTimeline');
  timeline.innerHTML=learningTimeline.length?learningTimeline.map(item=>'<div class="item timeline-item"><div class="timeline-date">'+escapeHtml(String(item.created_at||'').replace('T',' ').slice(0,16))+' UTC</div><div><div class="item-title">'+escapeHtml(item.version_label||'Versión')+' · '+escapeHtml(item.target_key||item.component)+'</div><div class="item-meta">'+escapeHtml(item.summary||item.human_explanation||'Cambio registrado')+' · '+escapeHtml(item.actor||'sistema')+'</div></div><span class="chip '+chipClass(item.status)+'">'+escapeHtml(statusLabel(item.status||item.change_type))+'</span></div>').join(''):'<div class="empty">La línea temporal se construirá con el primer cambio registrado.</div>';
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

async function loadLearningEngine(){
  const [summary,rules,decisions]=await Promise.all([
    fetch('/api/learning/summary').then(r=>r.json()),
    fetch('/api/learning/rules').then(r=>r.json()),
    fetch('/api/learning/decisions?limit=40').then(r=>r.json())
  ]);
  learningSummary=summary||{};
  learningRules=rules.rules||[];
  learningDecisions=decisions.decisions||[];
  renderLearningEngine();
}

async function loadLearningChanges(){
  const [changes,summary,timeline]=await Promise.all([
    fetch('/api/learning/changes?limit=160').then(r=>r.json()),
    fetch('/api/learning/changes/summary').then(r=>r.json()),
    fetch('/api/learning/timeline?limit=160').then(r=>r.json())
  ]);
  learningChanges=changes.changes||[];
  learningChangeSummary=summary||{};
  learningTimeline=timeline.timeline||[];
  renderLearningChanges();
}

async function refreshResearch(){
  try{
    await Promise.all([loadResearchReports(),loadRecommendationLearning(),loadLearningEngine(),loadLearningChanges()]);
  }catch(error){
    document.getElementById('recommendationMetrics').innerHTML='<div class="empty">No se pudo cargar Research</div>';
  }
}

window.aterumAssistantConfig={page:'research',kicker:'AI Research',subtitle:'Explica recomendaciones, riesgos, oportunidades e impacto medido.',placeholder:'¿Qué debería revisar manualmente hoy?'};
window.aterumAssistantContext=()=>({pagina:'research',recomendaciones:researchRecommendations.slice(0,8),ultimoInforme:researchReports[0]||null,performance:recommendationPerformance?.summary||null,learning:learningSummary,reglas:learningRules.filter(r=>r.status==='active').slice(0,12),cambios:learningChanges.slice(0,12),impactoCambios:learningChangeSummary});

let initialPanel=location.hash.replace('#','');
if(!['overview','engine','reports','changes'].includes(initialPanel)){
  try{initialPanel=localStorage.getItem('aterum-research-panel')||'overview'}catch(_){initialPanel='overview'}
}
setResearchPanel(initialPanel);
refreshResearch();
setInterval(refreshResearch,60000);
</script>
<script>${getSharedScript()}</script>
</body></html>`; }

module.exports = { getResearchHTML };
