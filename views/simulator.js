'use strict';

const {
  getSharedHeadAssets,
  getSharedNav
} = require('./ui_shared');

function getSimulatorHTML(user) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>αтεгυм — Simulador</title>
${getSharedHeadAssets()}
<style>
:root{
  --bg:#090b0a;--panel:#111411;--panel2:#171c17;--line:rgba(231,239,226,.12);--line2:rgba(231,239,226,.2);
  --text:#f3f7ef;--muted:#9da89b;--soft:#687266;--green:#82f06f;--red:#ff5d73;
  --blue:#5be7c4;--gold:#f5c45f;--violet:#b6a1ff;--mono:'JetBrains Mono',monospace;
  --display:'Inter Tight','Inter',sans-serif;--sans:'Inter','Segoe UI',sans-serif;
  --shadow:0 24px 80px rgba(0,0,0,.34);--ease:cubic-bezier(.22,1,.36,1);
}
*{box-sizing:border-box;margin:0;padding:0}
html{background:#090b0a;color-scheme:dark}
body{min-height:100vh;background:
  linear-gradient(180deg,rgba(130,240,111,.05),transparent 28%),
  linear-gradient(135deg,rgba(91,231,196,.06),transparent 42%),
  linear-gradient(180deg,#090b0a 0%,#11140f 48%,#080a08 100%) !important;
  color:var(--text);font-family:var(--sans);font-size:12px;overflow-x:hidden;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:repeating-linear-gradient(180deg,rgba(255,255,255,.035) 0 1px,transparent 1px 5px);opacity:.08}
body::after{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;background:linear-gradient(90deg,transparent,rgba(130,240,111,.1),transparent);height:2px;top:0;animation:simScan 6s var(--ease) infinite}
.nav{height:64px;background:rgba(9,11,9,.82);border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:20;backdrop-filter:blur(18px) saturate(1.2);box-shadow:0 16px 50px rgba(0,0,0,.22)}
.nav-logo{font-family:var(--display);font-size:14px;font-weight:900;letter-spacing:.12em;display:flex;align-items:center;gap:8px;margin-right:24px}
.nav-dot{width:7px;height:7px;border-radius:2px;background:var(--green);box-shadow:0 0 16px rgba(130,240,111,.72);animation:pixelPulse 1.8s steps(2,end) infinite}
.nav-links{display:flex;align-items:center;gap:6px;flex:1}
.nav-link{font:700 10px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;text-decoration:none;color:var(--muted);padding:9px 12px;border:1px solid transparent;border-radius:6px}
.nav-link:hover,.nav-link.active{color:var(--blue);background:rgba(91,231,196,.08);border-color:rgba(91,231,196,.25)}
.nav-user{margin-left:auto;color:var(--muted);border:1px solid var(--line);border-radius:6px;padding:7px 10px;font:700 10px/1 var(--mono)}
.page{position:relative;z-index:1;max-width:1680px;margin:0 auto;padding:32px 24px 72px}
.hero{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}
.kicker{font:700 10px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--blue);margin-bottom:8px}
.title{font-family:var(--display);font-size:34px;line-height:1;font-weight:900;letter-spacing:-.02em}
.sub{margin-top:8px;color:var(--muted);font-size:12px;max-width:760px;line-height:1.55}
.controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.select,.btn,.input{height:40px;border-radius:8px;border:1px solid var(--line);background:rgba(17,20,17,.9);color:var(--text);font:700 11px/1 var(--mono);padding:0 12px;outline:none;transition:border-color .18s var(--ease),box-shadow .18s var(--ease),transform .18s var(--ease),background .18s}
.select:focus,.input:focus{border-color:rgba(91,231,196,.46);box-shadow:0 0 0 4px rgba(91,231,196,.08)}
.input{width:128px}
.btn{cursor:pointer}
.btn:hover{border-color:var(--blue);color:var(--blue);transform:translateY(-1px)}
.btn-primary{background:linear-gradient(180deg,rgba(91,231,196,.22),rgba(91,231,196,.08));border-color:rgba(91,231,196,.42);color:#f3f7ef}
.form-card{margin-bottom:14px}
.form-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:10px;align-items:end}
.field{display:grid;gap:7px}
.field label{font:800 9px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hint{color:var(--muted);font-size:10px;line-height:1.45;margin-top:10px}
.explain-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin-bottom:14px}
.explain-copy{color:#b9d0ea;font-size:12px;line-height:1.6}
.explain-copy strong{color:#eef6ff}
.glossary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.term{border:1px solid rgba(29,56,84,.58);border-radius:7px;background:rgba(7,15,26,.45);padding:10px}
.term b{display:block;font:800 10px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:#dcecff;margin-bottom:5px}
.term span{display:block;color:var(--muted);line-height:1.45}
.filter-strip{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px}
.filter-strip .select,.filter-strip .input{height:34px}
.grid{display:grid;gap:14px}
.section-label{font:900 12px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:#dcecff;margin:18px 0 10px;display:flex;align-items:center;gap:10px}
.section-label::after{content:'';height:1px;flex:1;background:linear-gradient(90deg,var(--line),transparent)}
.section-note{color:var(--muted);font-size:11px;line-height:1.5;margin:-4px 0 12px}
.kpis{grid-template-columns:repeat(7,minmax(0,1fr));margin-bottom:14px}
.card,.kpi{background:linear-gradient(180deg,rgba(24,29,24,.88),rgba(12,15,12,.94));border:1px solid var(--line);border-radius:8px;box-shadow:var(--shadow);overflow:hidden;transition:transform .24s var(--ease),border-color .24s,box-shadow .24s}
.card:hover,.kpi:hover{transform:translateY(-2px);border-color:rgba(130,240,111,.22);box-shadow:0 30px 90px rgba(0,0,0,.42)}
.kpi{padding:16px;min-height:98px;position:relative}
.kpi::after{content:'';position:absolute;left:0;right:0;bottom:0;height:2px;background:linear-gradient(90deg,transparent,var(--accent,var(--blue)),transparent)}
.kpi-label{font:700 9px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.kpi-value{font-family:var(--display);font-weight:900;font-size:28px;line-height:1}
.kpi-sub{color:var(--muted);font-size:10px;margin-top:7px}
.real-summary{grid-template-columns:repeat(5,minmax(0,1fr));margin-bottom:14px}
.cards2{grid-template-columns:1.2fr .8fr;margin-bottom:14px}
.cards3{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:14px}
.card-h{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--line);background:rgba(20,24,20,.74)}
.card-title{font:800 10px/1 var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.card-body{padding:16px}
.table-wrap{overflow:auto;max-height:680px}
table{width:100%;border-collapse:collapse;min-width:1180px}
th{position:sticky;top:0;background:#171c17;z-index:2;text-align:left;color:var(--muted);font:800 9px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;padding:11px 12px;border-bottom:1px solid var(--line)}
td{padding:11px 12px;border-bottom:1px solid rgba(231,239,226,.08);vertical-align:top;font-size:11px}
tr:hover td{background:rgba(130,240,111,.035)}
.badge{display:inline-flex;align-items:center;gap:5px;border-radius:4px;padding:3px 7px;font:800 9px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;border:1px solid var(--line)}
.b-open{color:var(--green);background:rgba(0,229,160,.08);border-color:rgba(0,229,160,.25)}
.b-reject{color:var(--red);background:rgba(255,83,111,.08);border-color:rgba(255,83,111,.25)}
.b-long{color:var(--green)}.b-short{color:var(--red)}.good{color:var(--green)}.bad{color:var(--red)}.warn{color:var(--gold)}.muted{color:var(--muted)}
.mono{font-family:var(--mono)}.reason{max-width:360px;color:var(--muted);line-height:1.45}
.group-list{display:grid;gap:8px}
.group-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:rgba(9,11,9,.45)}
.group-name{font:800 10px/1.35 var(--mono);color:var(--text)}
.group-meta{color:var(--muted);font-size:10px;margin-top:5px}
.bar{height:5px;background:#20261f;border-radius:4px;overflow:hidden;margin-top:8px}
.bar span{display:block;height:100%;background:linear-gradient(90deg,var(--red),var(--gold),var(--green));border-radius:4px}
.empty,.loading{padding:44px;text-align:center;color:var(--muted);font:700 11px/1.5 var(--mono)}
.charts{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px}
.chart-box{display:grid;gap:10px}
.chart-row{display:grid;grid-template-columns:82px 1fr 48px;gap:10px;align-items:center}
.chart-label{font:800 9px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chart-track{height:8px;border-radius:4px;background:#20261f;overflow:hidden}
.chart-fill{height:100%;width:0;border-radius:4px;background:linear-gradient(90deg,var(--blue),var(--green))}
.chart-val{text-align:right;font:800 10px/1 var(--mono);color:var(--text)}
.sim-loading{position:fixed;inset:0;z-index:960;display:none;place-items:center;padding:24px;background:rgba(5,11,20,.62);backdrop-filter:blur(14px)}
.sim-loading.is-active{display:grid}
.sim-loading-card{width:min(420px,100%);border:1px solid rgba(91,231,196,.28);border-radius:8px;background:linear-gradient(180deg,rgba(24,29,24,.96),rgba(9,11,9,.96));box-shadow:0 30px 80px rgba(0,0,0,.35);padding:22px}
.sim-loading-title{font-family:var(--display);font-size:24px;font-weight:900;margin-bottom:8px}
.sim-loading-copy{color:var(--muted);line-height:1.5}
.sim-progress{height:6px;border-radius:4px;overflow:hidden;background:#20261f;margin-top:16px}
.sim-progress span{display:block;width:38%;height:100%;border-radius:4px;background:linear-gradient(90deg,var(--blue),var(--green));animation:simProgress 1.2s ease-in-out infinite alternate}
.split{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mini-table{width:100%;min-width:0}
.mini-table th,.mini-table td{padding:9px 10px}
.real-table table{min-width:980px}
.status-open{color:var(--gold)}
.status-closed{color:var(--green)}
.page-shell{min-height:100vh;opacity:1 !important;transform:none !important;filter:none !important}
.page-loader,.app-chrome,.page-transition,.assistant-floating,.assistant-backdrop,.assistant-panel{display:none !important}
@keyframes simProgress{from{transform:translateX(-30%)}to{transform:translateX(170%)}}
@keyframes simScan{0%{transform:translateY(0);opacity:0}12%{opacity:.55}100%{transform:translateY(100vh);opacity:0}}
@keyframes pixelPulse{0%,100%{opacity:.55}50%{opacity:1}}
@media(max-width:1200px){.kpis,.real-summary{grid-template-columns:repeat(3,1fr)}.cards2,.cards3,.charts,.explain-grid{grid-template-columns:1fr 1fr}.form-grid{grid-template-columns:repeat(4,1fr)}}
@media(max-width:720px){.hero{align-items:flex-start;flex-direction:column}.kpis,.charts,.real-summary,.glossary{grid-template-columns:1fr 1fr}.title{font-size:28px}.page{padding:20px 14px}.nav{overflow:auto}.split,.form-grid,.explain-grid{grid-template-columns:1fr}.input{width:100%}}
</style>
</head>
<body>
<div class="sim-loading" id="simLoading" aria-live="polite" aria-hidden="true">
  <div class="sim-loading-card">
    <div class="sim-loading-title">Calculando escenarios</div>
    <div class="sim-loading-copy" id="simLoadingCopy">Leyendo ejecuciones de n8n, velas 5m y resultados reales.</div>
    <div class="sim-progress"><span></span></div>
  </div>
</div>
<div class="page-shell">
${getSharedNav('simulator', user, 'blue')}
<main class="page">
  <section class="hero">
    <div>
      <div class="kicker">Laboratorio de señales</div>
      <h1 class="title">Simulador de entradas</h1>
      <p class="sub">Elige una muestra pequeña para revisar rápido, o sube la profundidad cuando quieras estudiar contradicciones, thresholds y señales rechazadas con más detalle.</p>
    </div>
  </section>

  <section class="card form-card">
    <div class="card-h"><div class="card-title">Consulta bajo demanda</div><span class="muted mono" id="loadStatus">Sin cargar</span></div>
    <div class="card-body">
      <div class="form-grid">
        <div class="field">
          <label for="limitSel">Muestra</label>
          <select id="limitSel" class="select">
            <option value="10">10 señales rápido</option>
            <option value="20" selected>20 señales</option>
            <option value="40">40 señales</option>
            <option value="80">80 señales pesado</option>
            <option value="120">120 señales profundo</option>
            <option value="160">160 señales máximo</option>
          </select>
        </div>
        <div class="field">
          <label for="hoursSel">Ventana</label>
          <select id="hoursSel" class="select">
            <option value="1" selected>1h después</option>
            <option value="2">2h después</option>
            <option value="4">4h después</option>
            <option value="8">8h después</option>
            <option value="12">12h después</option>
          </select>
        </div>
        <div class="field">
          <label for="forceSel">Cache</label>
          <select id="forceSel" class="select">
            <option value="0" selected>Usar cache 90s</option>
            <option value="1">Recalcular todo</option>
          </select>
        </div>
        <div class="field">
          <label for="symbolInput">Símbolo</label>
          <input id="symbolInput" class="input" placeholder="Todos">
        </div>
        <div class="field">
          <label for="capitalInput">Capital sim.</label>
          <input id="capitalInput" class="input" type="number" min="1" step="1" value="100" placeholder="100">
        </div>
        <div class="field">
          <label for="leverageInput">Leverage sim.</label>
          <input id="leverageInput" class="input" type="number" min="1" max="50" step="1" value="1" placeholder="1">
        </div>
        <div class="field">
          <label>Acción</label>
          <button id="loadBtn" class="btn btn-primary">Cargar análisis</button>
        </div>
        <div class="field">
          <label>Vista</label>
          <button id="clearBtn" class="btn">Limpiar</button>
        </div>
      </div>
      <div class="hint">Capital simulado es el margen hipotético por señal. PnL simulado = capital x leverage x movimiento. No toca tu cuenta real.</div>
    </div>
  </section>

  <section class="explain-grid">
    <div class="card">
      <div class="card-h"><div class="card-title">Cómo leer esta pantalla</div></div>
      <div class="card-body explain-copy">
        <p><strong>Simulación</strong> responde: “si hubiera abierto con X USDT, cuánto habría ganado o perdido aproximadamente”. Esa parte no es dinero real.</p>
        <p style="margin-top:10px"><strong>Real</strong> está separado abajo. Ahí sí ves operaciones cerradas por el bot con PnL positivo o negativo real.</p>
        <p style="margin-top:10px">Si una fila dice <strong>Rechazado</strong>, el bot no entró. La columna PnL simulado te ayuda a ver qué habría pasado si sí entraba.</p>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><div class="card-title">Diccionario rápido</div></div>
      <div class="card-body glossary">
        <div class="term"><b>PnL sim.</b><span>Ganancia o pérdida hipotética con el capital y leverage que elegiste.</span></div>
        <div class="term"><b>PnL real</b><span>Resultado real en USDT. Verde positivo: ganó. Rojo negativo: perdió.</span></div>
        <div class="term"><b>TP / SL</b><span>TP es toma de ganancia. SL es stop loss o pérdida controlada.</span></div>
        <div class="term"><b>MFE</b><span>Máximo movimiento a favor en la simulación.</span></div>
        <div class="term"><b>MAE</b><span>Máximo movimiento en contra en la simulación.</span></div>
        <div class="term"><b>Final</b><span>Resultado al terminar la ventana elegida, no dinero real.</span></div>
        <div class="term"><b>4H</b><span>Tendencia de 4 horas: confirma, neutral o contradice la entrada.</span></div>
        <div class="term"><b>Macro</b><span>Contexto general del mercado. Puede apoyar o contradecir la señal.</span></div>
        <div class="term"><b>Score</b><span>Puntos de calidad de la señal. Threshold es el mínimo exigido.</span></div>
      </div>
    </div>
  </section>

  <div class="filter-strip">
    <select id="filterSel" class="select">
      <option value="all">Todo</option>
      <option value="opened">Solo abiertos</option>
      <option value="rejected">Solo rechazados</option>
      <option value="contradicts">Contra macro</option>
      <option value="aligns">A favor macro</option>
      <option value="bad">Malos</option>
      <option value="good">Buenos</option>
    </select>
    <select id="dirFilter" class="select">
      <option value="all">LONG + SHORT</option>
      <option value="LONG">Solo LONG</option>
      <option value="SHORT">Solo SHORT</option>
    </select>
    <select id="macroFilter" class="select">
      <option value="all">Macro todo</option>
      <option value="aligns">Macro a favor</option>
      <option value="contradicts">Macro en contra</option>
      <option value="neutral">Macro neutral</option>
    </select>
    <select id="tf4hFilter" class="select">
      <option value="all">4H todo</option>
      <option value="CONFIRMS">4H confirma</option>
      <option value="NEUTRAL">4H neutral</option>
      <option value="CONTRADICTS">4H contradice</option>
    </select>
    <select id="outcomeFilter" class="select">
      <option value="all">Resultado todo</option>
      <option value="tp">TP simulado</option>
      <option value="sl">SL simulado</option>
      <option value="mixed">Mixto</option>
    </select>
  </div>

  <div class="section-label">Simulación</div>
  <div class="section-note">Todo este bloque es hipotético. Sirve para responder qué habría pasado con el capital simulado elegido.</div>

  <section class="grid kpis" id="kpis">
    <div class="kpi"><div class="kpi-label">Señales</div><div class="kpi-value">--</div><div class="kpi-sub">analizadas</div></div>
    <div class="kpi" style="--accent:var(--green)"><div class="kpi-label">Buenos</div><div class="kpi-value">--</div><div class="kpi-sub">TP o avance útil</div></div>
    <div class="kpi" style="--accent:var(--red)"><div class="kpi-label">Malos</div><div class="kpi-value">--</div><div class="kpi-sub">SL o presión fuerte</div></div>
    <div class="kpi"><div class="kpi-label">MFE Prom</div><div class="kpi-value">--</div><div class="kpi-sub">máximo a favor</div></div>
    <div class="kpi"><div class="kpi-label">MAE Prom</div><div class="kpi-value">--</div><div class="kpi-sub">máximo en contra</div></div>
    <div class="kpi" style="--accent:var(--gold)"><div class="kpi-label">Final Prom</div><div class="kpi-value">--</div><div class="kpi-sub">cierre ventana</div></div>
    <div class="kpi" style="--accent:var(--blue)"><div class="kpi-label">PnL simulado</div><div class="kpi-value" id="simPnlValue">--</div><div class="kpi-sub" id="simPnlSub">capital x leverage</div></div>
  </section>

  <section class="grid charts">
    <div class="card"><div class="card-h"><div class="card-title">Tipo</div></div><div class="card-body chart-box" id="chartType">${emptyMarkup('Carga un análisis')}</div></div>
    <div class="card"><div class="card-h"><div class="card-title">Dirección</div></div><div class="card-body chart-box" id="chartDirection">${emptyMarkup('Sin datos')}</div></div>
    <div class="card"><div class="card-h"><div class="card-title">Macro</div></div><div class="card-body chart-box" id="chartMacro">${emptyMarkup('Sin datos')}</div></div>
    <div class="card"><div class="card-h"><div class="card-title">4H</div></div><div class="card-body chart-box" id="chart4h">${emptyMarkup('Sin datos')}</div></div>
  </section>

  <section class="grid cards2">
    <div class="card">
      <div class="card-h"><div class="card-title">Grupos de comportamiento</div><span class="muted mono" id="generatedAt">--</span></div>
      <div class="card-body"><div class="group-list" id="groupList">${emptyMarkup('Carga un análisis para ver grupos')}</div></div>
    </div>
  </section>

  <section class="card">
    <div class="card-h"><div class="card-title">Historial simulado</div><span class="muted mono" id="countLabel">--</span></div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Hora</th><th>Tipo</th><th>Símbolo</th><th>Dir</th><th>Score</th><th>Contexto</th>
          <th>Outcome</th><th>PnL sim.</th><th>MFE</th><th>MAE</th><th>Final</th><th>Motivo</th>
        </tr></thead>
        <tbody id="signalsBody"><tr><td colspan="12">${emptyMarkup('Elige parámetros y carga el análisis')}</td></tr></tbody>
      </table>
    </div>
  </section>

  <div class="section-label">Real</div>
  <div class="section-note">Este bloque sí viene de trades abiertos por el bot. Aquí PnL positivo o negativo es dinero real registrado en la base de datos.</div>

  <section class="grid real-summary" id="realSummary">
    <div class="kpi" style="--accent:var(--green)"><div class="kpi-label">Trades reales</div><div class="kpi-value">--</div><div class="kpi-sub">cerrados</div></div>
    <div class="kpi" style="--accent:var(--green)"><div class="kpi-label">Ganadores</div><div class="kpi-value">--</div><div class="kpi-sub">cerraron positivo</div></div>
    <div class="kpi" style="--accent:var(--red)"><div class="kpi-label">Perdedores</div><div class="kpi-value">--</div><div class="kpi-sub">cerraron negativo</div></div>
    <div class="kpi"><div class="kpi-label">Win rate real</div><div class="kpi-value">--</div><div class="kpi-sub">porcentaje ganador</div></div>
    <div class="kpi" style="--accent:var(--gold)"><div class="kpi-label">PnL real total</div><div class="kpi-value">--</div><div class="kpi-sub">USDT neto</div></div>
  </section>

  <section class="grid cards2">
    <div class="card">
      <div class="card-h"><div class="card-title">Resultados reales por 4H</div><span class="muted mono">MySQL</span></div>
      <div class="card-body"><table class="mini-table"><thead><tr><th>4H</th><th>WR</th><th>PnL</th></tr></thead><tbody id="actual4h"><tr><td colspan="3" class="muted">Sin cargar</td></tr></tbody></table></div>
    </div>
    <div class="card">
      <div class="card-h"><div class="card-title">Resultados reales por macro</div><span class="muted mono">MySQL</span></div>
      <div class="card-body"><table class="mini-table"><thead><tr><th>Macro</th><th>WR</th><th>PnL</th></tr></thead><tbody id="actualMacro"><tr><td colspan="3" class="muted">Sin cargar</td></tr></tbody></table></div>
    </div>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="card-h"><div class="card-title">Trades reales recientes</div><span class="muted mono">Ganancia / pérdida real</span></div>
    <div class="table-wrap real-table">
      <table>
        <thead><tr>
          <th>Abrió</th><th>Cerró</th><th>Símbolo</th><th>Dir</th><th>Estado</th><th>Resultado real</th><th>R</th><th>Cierre</th><th>Score</th><th>4H</th><th>Macro</th>
        </tr></thead>
        <tbody id="realTradesBody"><tr><td colspan="11">${emptyMarkup('Carga un análisis para ver trades reales')}</td></tr></tbody>
      </table>
    </div>
  </section>
</main>
</div>
<script>
document.addEventListener('DOMContentLoaded', function(){
const state = { report:null, filter:'all' };
const hasNum = n => n !== null && n !== undefined && n !== '' && Number.isFinite(Number(n));
const fmt = (n,d)=>hasNum(n) ? Number(n).toFixed(d == null ? 2 : d) : '--';
const pct = n => hasNum(n) ? (Number(n) >= 0 ? '+' : '') + Number(n).toFixed(2) + '%' : '--';
const money = n => hasNum(n) ? (Number(n) >= 0 ? '+$' : '-$') + Math.abs(Number(n)).toFixed(2) : '--';
function loadingMarkup(){ return '<div class="loading">Calculando escenarios...</div>'; }
function emptyMarkup(text){ return '<div class="empty">'+text+'</div>'; }
function simCapital(){
  const capital = Number(document.getElementById('capitalInput').value || 0);
  return Number.isFinite(capital) && capital > 0 ? capital : 0;
}
function simLeverage(){
  const lev = Number(document.getElementById('leverageInput').value || 1);
  return Number.isFinite(lev) && lev > 0 ? lev : 1;
}
function simulatedReturnPct(signal){
  const o = signal && signal.outcome;
  if(!o) return null;
  if(o.firstHit === 'tp' && hasNum(o.tpPct)) return Number(o.tpPct);
  if(o.firstHit === 'sl' && hasNum(o.stopPct)) return -Number(o.stopPct);
  return hasNum(o.endRetPct) ? Number(o.endRetPct) : null;
}
function simulatedPnl(signal){
  const ret = simulatedReturnPct(signal);
  if(!hasNum(ret)) return null;
  return simCapital() * simLeverage() * Number(ret) / 100;
}
function clsByOutcome(o){
  if(!o) return 'muted';
  if(String(o.quality||'').startsWith('good')) return 'good';
  if(String(o.quality||'').startsWith('bad')) return 'bad';
  return 'warn';
}
function outcomeLabel(o){
  if(!o) return 'Sin datos';
  const labels = { good_tp:'TP simulado', bad_sl:'SL simulado', good_partial:'Avance útil', bad_pressure:'Presión fuerte', mixed:'Mixto', both_same_bar:'TP/SL misma vela' };
  return labels[o.quality] || o.quality || o.firstHit || 'Mixto';
}
function contextText(s){
  return 'macro ' + (s.macroRelation || '-') + ' · 4H ' + (s.tf4h || '-') + ' · ' + (s.aiRegime || '-');
}
function passFilter(s){
  const f = state.filter;
  if(f === 'all') return true;
  if(f === 'opened' || f === 'rejected') return s.type === f;
  if(f === 'contradicts') return s.macroRelation === 'contradicts';
  if(f === 'aligns') return s.macroRelation === 'aligns';
  if(f === 'good') return String((s.outcome && s.outcome.quality) || '').startsWith('good');
  if(f === 'bad') return String((s.outcome && s.outcome.quality) || '').startsWith('bad');
  return true;
}
function passAdvancedFilters(s){
  const dir = document.getElementById('dirFilter').value;
  const macro = document.getElementById('macroFilter').value;
  const tf4h = document.getElementById('tf4hFilter').value;
  const outcome = document.getElementById('outcomeFilter').value;
  const symbol = document.getElementById('symbolInput').value.trim().toUpperCase();
  if(symbol && !String(s.symbol || '').toUpperCase().includes(symbol)) return false;
  if(dir !== 'all' && s.direction !== dir) return false;
  if(macro !== 'all' && s.macroRelation !== macro) return false;
  if(tf4h !== 'all' && s.tf4h !== tf4h) return false;
  if(outcome !== 'all'){
    const hit = s.outcome && s.outcome.firstHit;
    const quality = String((s.outcome && s.outcome.quality) || '');
    if(outcome === 'tp' && hit !== 'tp') return false;
    if(outcome === 'sl' && hit !== 'sl') return false;
    if(outcome === 'mixed' && (hit === 'tp' || hit === 'sl' || quality.startsWith('good') || quality.startsWith('bad'))) return false;
  }
  return true;
}
function renderKpis(stats){
  const el = document.getElementById('kpis');
  const vals = [
    [stats.total, 'analizadas'],
    [stats.good + ' / ' + stats.goodRate + '%', 'TP o avance útil'],
    [stats.bad, 'SL o presión fuerte'],
    [pct(stats.avgMfe), 'máximo a favor'],
    [pct(stats.avgMae), 'máximo en contra'],
    [pct(stats.avgEnd), 'cierre ventana']
  ];
  [...el.querySelectorAll('.kpi')].forEach((kpi,i)=>{
    if(!vals[i]) return;
    kpi.querySelector('.kpi-value').textContent = vals[i][0];
    kpi.querySelector('.kpi-sub').textContent = vals[i][1];
  });
}
function renderSimPnlSummary(rows){
  const value = document.getElementById('simPnlValue');
  const sub = document.getElementById('simPnlSub');
  const total = (rows || []).reduce((sum, row)=>{
    const pnl = simulatedPnl(row);
    return sum + (hasNum(pnl) ? Number(pnl) : 0);
  }, 0);
  value.textContent = rows && rows.length ? money(total) : '--';
  value.className = 'kpi-value ' + (total >= 0 ? 'good' : 'bad');
  sub.textContent = rows && rows.length ? 'si tomaba todas las filas filtradas' : 'capital x leverage';
}
function renderRealSummary(summary){
  const el = document.getElementById('realSummary');
  const vals = summary ? [
    [summary.trades ?? '--', 'cerrados'],
    [summary.wins ?? '--', 'cerraron positivo'],
    [summary.losses ?? '--', 'cerraron negativo'],
    [fmt(summary.win_rate,1) + '%', 'porcentaje ganador'],
    [money(summary.pnl), 'USDT neto']
  ] : [
    ['--','cerrados'], ['--','cerraron positivo'], ['--','cerraron negativo'], ['--','porcentaje ganador'], ['--','USDT neto']
  ];
  [...el.querySelectorAll('.kpi')].forEach((kpi,i)=>{
    kpi.querySelector('.kpi-value').textContent = vals[i][0];
    kpi.querySelector('.kpi-value').className = 'kpi-value';
    if(i === 4 && hasNum(summary && summary.pnl)) kpi.querySelector('.kpi-value').classList.add(Number(summary.pnl) >= 0 ? 'good' : 'bad');
    kpi.querySelector('.kpi-sub').textContent = vals[i][1];
  });
}
function renderGroups(groups){
  const list = document.getElementById('groupList');
  const rows = Object.entries(groups || {}).sort((a,b)=>b[1].n-a[1].n).slice(0,12);
  if(!rows.length){ list.innerHTML = '<div class="empty">Sin grupos todavía</div>'; return; }
  list.innerHTML = rows.map(([name,g])=>{
    const width = Math.max(3, Math.min(100, g.goodRate || 0));
    return '<div class="group-row"><div><div class="group-name">'+name+'</div><div class="group-meta">n='+g.n+' · buenos '+g.good+' · malos '+g.bad+' · MFE '+pct(g.avgMfe)+' · MAE '+pct(g.avgMae)+'</div><div class="bar"><span style="width:'+width+'%"></span></div></div><div class="mono '+(g.avgEnd>=0?'good':'bad')+'">'+pct(g.avgEnd)+'</div></div>';
  }).join('');
}
function renderActual(tableId, rows){
  const body = document.getElementById(tableId);
  body.innerHTML = (rows || []).map(r => '<tr><td>'+(r.label || 'NULL')+'</td><td>'+fmt(r.win_rate,1)+'%</td><td class="'+(Number(r.pnl)>=0?'good':'bad')+'">'+money(r.pnl)+'</td></tr>').join('') || '<tr><td colspan="3" class="muted">Sin datos</td></tr>';
}
function dateShort(value){
  if(!value) return '--';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return String(value).slice(5,16);
  return date.toLocaleString('es-ES', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false });
}
function renderRealTrades(rows){
  const body = document.getElementById('realTradesBody');
  if(!rows || !rows.length){
    body.innerHTML = '<tr><td colspan="11">'+emptyMarkup('Sin trades reales recientes')+'</td></tr>';
    return;
  }
  body.innerHTML = rows.map(t=>{
    const closed = String(t.status || '').toUpperCase() === 'CLOSED' || t.closed_at;
    const pnl = hasNum(t.pnl_usdt) ? money(t.pnl_usdt) : 'Abierto';
    const pnlClass = hasNum(t.pnl_usdt) ? (Number(t.pnl_usdt) >= 0 ? 'good' : 'bad') : 'warn';
    const stateClass = closed ? 'status-closed' : 'status-open';
    return '<tr>'+
      '<td class="mono">'+dateShort(t.opened_at)+'</td>'+
      '<td class="mono">'+dateShort(t.closed_at)+'</td>'+
      '<td class="mono">'+(t.symbol || '--')+'</td>'+
      '<td><span class="badge '+(t.direction === 'LONG' ? 'b-long' : 'b-short')+'">'+(t.direction || '--')+'</span></td>'+
      '<td class="'+stateClass+'">'+(closed ? 'Cerrado' : 'Abierto')+'</td>'+
      '<td class="'+pnlClass+' mono">'+pnl+'</td>'+
      '<td class="mono">'+fmt(t.r_final,2)+'</td>'+
      '<td>'+(t.close_reason || '--')+'</td>'+
      '<td class="mono">'+(t.final_score ?? '--')+'</td>'+
      '<td>'+(t.tf4h_status || 'NULL')+'</td>'+
      '<td>'+(t.macro_bias || 'NULL')+'</td>'+
    '</tr>';
  }).join('');
}
function countBy(rows, getter){
  return rows.reduce((acc,row)=>{
    const key = getter(row) || 'NULL';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
function renderChart(id, counts){
  const el = document.getElementById(id);
  const entries = Object.entries(counts || {}).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const max = entries.reduce((m,entry)=>Math.max(m,entry[1]),0);
  if(!entries.length){ el.innerHTML = emptyMarkup('Sin datos'); return; }
  el.innerHTML = entries.map(([label,value])=>{
    const width = max ? Math.max(4, value / max * 100) : 0;
    return '<div class="chart-row"><div class="chart-label">'+label+'</div><div class="chart-track"><div class="chart-fill" style="width:'+width+'%"></div></div><div class="chart-val">'+value+'</div></div>';
  }).join('');
}
function renderCharts(rows){
  renderChart('chartType', countBy(rows, s => s.type === 'opened' ? 'Abiertos' : s.type === 'rejected' ? 'Rechazados' : s.type));
  renderChart('chartDirection', countBy(rows, s => s.direction));
  renderChart('chartMacro', countBy(rows, s => s.macroRelation));
  renderChart('chart4h', countBy(rows, s => s.tf4h));
}
function renderSignals(){
  const body = document.getElementById('signalsBody');
  const rows = ((state.report && state.report.signals) || []).filter(passFilter).filter(passAdvancedFilters);
  document.getElementById('countLabel').textContent = rows.length + ' filas';
  renderCharts(rows);
  renderSimPnlSummary(rows);
  if(!rows.length){ body.innerHTML = '<tr><td colspan="12"><div class="empty">Sin señales para este filtro</div></td></tr>'; return; }
  body.innerHTML = rows.map(s=>{
    const o = s.outcome;
    const simPnl = simulatedPnl(s);
    const typeBadge = s.type === 'opened' ? '<span class="badge b-open">Abierto</span>' : '<span class="badge b-reject">Rechazado</span>';
    const dirBadge = '<span class="badge '+(s.direction==='LONG'?'b-long':'b-short')+'">'+s.direction+'</span>';
    const score = (s.score ?? '--') + (s.threshold ? ' / ' + s.threshold : '');
    const reason = s.reason ? String(s.reason).slice(0,180) : '<span class="muted">Trade ejecutado</span>';
    return '<tr>'+
      '<td class="mono">'+String(s.at||'').slice(5,16)+'</td>'+
      '<td>'+typeBadge+'</td>'+
      '<td class="mono">'+s.symbol+'</td>'+
      '<td>'+dirBadge+'</td>'+
      '<td class="mono">'+score+'</td>'+
      '<td class="muted">'+contextText(s)+'</td>'+
      '<td class="'+clsByOutcome(o)+'">'+outcomeLabel(o)+'</td>'+
      '<td class="'+(Number(simPnl)>=0?'good':'bad')+' mono">'+money(simPnl)+'</td>'+
      '<td class="good mono">'+pct(o && o.mfePct)+'</td>'+
      '<td class="bad mono">'+pct(o && o.maePct)+'</td>'+
      '<td class="'+(Number(o && o.endRetPct)>=0?'good':'bad')+' mono">'+pct(o && o.endRetPct)+'</td>'+
      '<td><div class="reason">'+reason+'</div></td>'+
    '</tr>';
  }).join('');
}
function render(report){
  state.report = report;
  renderKpis(report.stats || {});
  renderRealSummary(report.actual && report.actual.summary);
  renderGroups(report.groups || {});
  renderActual('actual4h', (report.actual && report.actual.by4h) || []);
  renderActual('actualMacro', (report.actual && report.actual.byMacro) || []);
  renderRealTrades((report.actual && report.actual.recent) || []);
  document.getElementById('generatedAt').textContent = new Date(report.generatedAt).toLocaleString();
  renderSignals();
}
function setLoading(active, text){
  const overlay = document.getElementById('simLoading');
  const copy = document.getElementById('simLoadingCopy');
  if(copy && text) copy.textContent = text;
  if(overlay){
    overlay.classList.toggle('is-active', !!active);
    overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
  }
  document.getElementById('loadStatus').textContent = active ? 'Cargando...' : (state.report ? 'Cargado' : 'Sin cargar');
  document.getElementById('loadBtn').disabled = !!active;
}
async function load(force=false){
  setLoading(true, 'Leyendo ejecuciones de n8n y simulando velas Binance 5m.');
  document.getElementById('signalsBody').innerHTML = '<tr><td colspan="12">'+loadingMarkup()+'</td></tr>';
  document.getElementById('groupList').innerHTML = loadingMarkup();
  const limit = document.getElementById('limitSel').value;
  const hours = document.getElementById('hoursSel').value;
  const forced = force || document.getElementById('forceSel').value === '1';
  try{
    const res = await fetch('/api/simulator/report?limit='+limit+'&hours='+hours+(forced?'&force=1':''));
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Error cargando simulador');
    render(data);
  }finally{
    setLoading(false);
  }
}
function clearView(){
  state.report = null;
  document.getElementById('loadStatus').textContent = 'Sin cargar';
  document.getElementById('countLabel').textContent = '--';
  document.getElementById('generatedAt').textContent = '--';
  renderKpis({ total:'--', good:'--', goodRate:'--', bad:'--', avgMfe:null, avgMae:null, avgEnd:null });
  renderRealSummary(null);
  document.getElementById('groupList').innerHTML = emptyMarkup('Carga un análisis para ver grupos');
  document.getElementById('signalsBody').innerHTML = '<tr><td colspan="12">'+emptyMarkup('Elige parámetros y carga el análisis')+'</td></tr>';
  renderSimPnlSummary([]);
  document.getElementById('realTradesBody').innerHTML = '<tr><td colspan="11">'+emptyMarkup('Carga un análisis para ver trades reales')+'</td></tr>';
  ['chartType','chartDirection','chartMacro','chart4h'].forEach(id => document.getElementById(id).innerHTML = emptyMarkup('Sin datos'));
}
['filterSel','dirFilter','macroFilter','tf4hFilter','outcomeFilter'].forEach(id=>{
  document.getElementById(id).addEventListener('change', e=>{
    if(id === 'filterSel') state.filter = e.target.value;
    renderSignals();
  });
});
document.getElementById('symbolInput').addEventListener('input', renderSignals);
document.getElementById('capitalInput').addEventListener('input', renderSignals);
document.getElementById('leverageInput').addEventListener('input', renderSignals);
document.getElementById('loadBtn').addEventListener('click', ()=>load(false).catch(err=>{
  setLoading(false);
  document.getElementById('signalsBody').innerHTML = '<tr><td colspan="12"><div class="empty">'+err.message+'</div></td></tr>';
  alert(err.message);
}));
document.getElementById('clearBtn').addEventListener('click', clearView);
clearView();
});
</script>
</body>
</html>`;
}

function loadingMarkup() {
  return '<div class="loading">Calculando escenarios...</div>';
}

function emptyMarkup(text) {
  return '<div class="empty">' + text + '</div>';
}

module.exports = { getSimulatorHTML };
