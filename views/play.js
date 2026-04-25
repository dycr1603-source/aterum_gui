'use strict';

const {
  getSharedHeadAssets,
  getSharedChrome,
  getSharedStyles,
  getSharedScript,
  getSharedNav
} = require('./ui_shared');

function getPlayHTML(user) { return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>αтεгυм — Crypto Play</title>
${getSharedHeadAssets()}
<style>
:root{
  --bg:var(--ui-bg,#f5f5f7);--bg2:var(--ui-bg-raised,#ffffff);--bg3:#f4f7fc;--bg4:#e2e9f2;
  --text:var(--ui-text,#1d1d1f);--text2:var(--ui-muted,#6e6e73);--muted:var(--ui-faint,#8f949d);
  --green:#1f9e74;--red:#d94f63;--blue:#007aff;--gold:#cf9440;--cyan:#007aff;--purple:#6f67d8;
  --border:rgba(29,29,31,.12);--border-strong:rgba(29,29,31,.2);
  --display:'Inter Tight','Inter','SF Pro Display',sans-serif;
  --sans:'Inter','SF Pro Text','Segoe UI',sans-serif;
  --mono:'JetBrains Mono',monospace;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
html{scroll-behavior:smooth}
body{
  min-height:100vh;
  font:500 12px/1.5 var(--sans);
  color:var(--text);
  background:
    linear-gradient(180deg,rgba(67,111,243,.06),transparent 30%),
    linear-gradient(135deg,rgba(0,122,255,.08),transparent 42%),
    linear-gradient(180deg,#f8f9fb 0%,#f2f5fa 46%,#edf2f8 100%);
}
.page{
  position:relative;
  z-index:1;
  max-width:1520px;
  margin:0 auto;
  padding:28px 28px 72px;
}
.hero{
  display:grid;
  grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);
  gap:18px;
  margin-bottom:18px;
}
.hero-card,.panel,.stat{
  border:1px solid var(--border);
  background:linear-gradient(180deg,rgba(24,29,24,.95),rgba(10,13,10,.92));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 26px 62px rgba(0,0,0,.28);
}
.hero-card{
  position:relative;
  overflow:hidden;
  border-radius:8px;
  padding:30px;
}
.hero-card::before{
  content:'';
  position:absolute;
  inset:0;
  background:
    radial-gradient(circle at top left,rgba(41,211,255,.14),transparent 34%),
    radial-gradient(circle at 82% 20%,rgba(0,229,160,.12),transparent 26%);
  pointer-events:none;
}
.hero-card::after{
  content:'';
  position:absolute;
  left:0;
  right:0;
  bottom:0;
  height:4px;
  background:linear-gradient(90deg,var(--green),var(--cyan),var(--gold),var(--red));
  pointer-events:none;
}
.eyebrow{
  color:#9ab6d8;
  letter-spacing:.18em;
  text-transform:uppercase;
  font:700 10px/1 var(--mono);
}
.hero-title{
  margin-top:14px;
  font:900 clamp(42px,6vw,78px)/.9 var(--display);
  letter-spacing:-.075em;
}
.hero-title span{
  background:linear-gradient(90deg,var(--cyan),var(--green));
  -webkit-background-clip:text;
  background-clip:text;
  color:transparent;
}
.hero-sub{
  margin-top:14px;
  max-width:720px;
  color:#9ab0cf;
  font-size:15px;
}
.hero-actions{
  display:flex;
  flex-wrap:wrap;
  gap:10px;
  margin-top:22px;
}
.hero-btn,.cashout-btn,.mini-btn{
  min-height:44px;
  padding:0 18px;
  border-radius:999px;
  border:1px solid var(--border);
  background:linear-gradient(180deg,rgba(16,25,40,.92),rgba(10,16,27,.86));
  color:var(--text);
  font:700 10px/1 var(--mono);
  letter-spacing:.12em;
  text-transform:uppercase;
  cursor:pointer;
}
.hero-btn.primary{
  border-color:rgba(41,211,255,.28);
  background:linear-gradient(180deg,rgba(41,211,255,.18),rgba(41,211,255,.08));
  color:var(--cyan);
}
.cashout-btn{
  border-color:rgba(0,229,160,.22);
  background:linear-gradient(180deg,rgba(0,229,160,.18),rgba(0,229,160,.08));
  color:var(--green);
}
.hero-btn:disabled,.cashout-btn:disabled,.mini-btn:disabled{
  opacity:.46;
  cursor:not-allowed;
  box-shadow:none !important;
}
.hero-stack{
  display:grid;
  gap:18px;
}
.stat{
  border-radius:28px;
  padding:22px 24px;
}
.stat-label{
  color:#8aa4c8;
  font:700 9px/1 var(--mono);
  letter-spacing:.16em;
  text-transform:uppercase;
}
.stat-value{
  margin-top:12px;
  font:900 44px/.94 var(--display);
  letter-spacing:-.06em;
}
.stat-sub{
  margin-top:10px;
  color:#9ab0cf;
  font-size:11px;
}
.main-grid{
  display:grid;
  grid-template-columns:minmax(0,1.18fr) minmax(340px,.82fr);
  gap:18px;
}
.panel{
  border-radius:30px;
  overflow:hidden;
}
.panel-hdr{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:18px 22px;
  border-bottom:1px solid rgba(122,174,229,.1);
  background:linear-gradient(180deg,rgba(20,31,48,.95),rgba(12,18,30,.92));
}
.panel-title{
  color:#92add1;
  letter-spacing:.16em;
  text-transform:uppercase;
  font:700 10px/1 var(--mono);
}
.panel-meta{
  color:#95add0;
  font-size:11px;
}
.panel-body{
  padding:22px;
}
.arena-panel{
  position:relative;
  overflow:hidden;
}
.arena-panel::before{
  content:'';
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
    radial-gradient(circle at 18% 10%,rgba(41,211,255,.1),transparent 28%),
    radial-gradient(circle at 82% 16%,rgba(0,229,160,.08),transparent 20%);
}
.control-bar{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
  margin-bottom:16px;
}
.control-group{
  padding:14px;
  border-radius:22px;
  border:1px solid rgba(122,174,229,.1);
  background:rgba(10,16,27,.62);
}
.control-label{
  display:block;
  color:#88a3c8;
  font:700 9px/1 var(--mono);
  letter-spacing:.14em;
  text-transform:uppercase;
}
.chip-row{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
}
.mode-chip,.risk-chip{
  min-height:36px;
  padding:0 12px;
  border-radius:999px;
  border:1px solid rgba(122,174,229,.14);
  background:rgba(14,22,35,.86);
  color:#a2bad7;
  font:700 10px/1 var(--mono);
  letter-spacing:.1em;
  text-transform:uppercase;
  cursor:pointer;
}
.mode-chip.is-active{
  color:var(--cyan);
  border-color:rgba(41,211,255,.24);
  background:linear-gradient(180deg,rgba(41,211,255,.16),rgba(41,211,255,.08));
}
.risk-chip.is-active{
  color:var(--gold);
  border-color:rgba(245,184,75,.24);
  background:linear-gradient(180deg,rgba(245,184,75,.16),rgba(245,184,75,.08));
}
.arena-top{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  flex-wrap:wrap;
  margin-bottom:16px;
}
.live-tag,.status-chip{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-height:36px;
  padding:0 13px;
  border-radius:999px;
  border:1px solid rgba(122,174,229,.12);
  background:rgba(12,18,30,.86);
  color:#a9bfdb;
  font:700 10px/1 var(--mono);
  letter-spacing:.12em;
  text-transform:uppercase;
}
.live-tag::before{
  content:'';
  width:7px;
  height:7px;
  border-radius:50%;
  background:var(--cyan);
  box-shadow:0 0 14px rgba(41,211,255,.4);
}
.status-chip.good{
  color:var(--green);
  border-color:rgba(0,229,160,.22);
  background:rgba(0,229,160,.08);
}
.status-chip.warn{
  color:var(--gold);
  border-color:rgba(245,184,75,.22);
  background:rgba(245,184,75,.08);
}
.status-chip.bad{
  color:var(--red);
  border-color:rgba(255,83,111,.22);
  background:rgba(255,83,111,.08);
}
.status-chip.info{
  color:var(--cyan);
  border-color:rgba(41,211,255,.22);
  background:rgba(41,211,255,.08);
}
.arena-shell{
  position:relative;
  padding:18px;
  border-radius:28px;
  border:1px solid rgba(122,174,229,.1);
  background:linear-gradient(180deg,rgba(9,14,24,.98),rgba(8,13,22,.92));
  box-shadow:inset 0 0 0 1px rgba(87,176,255,.04),0 22px 48px rgba(3,8,16,.22);
}
.board-meta{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:12px;
  margin-bottom:16px;
}
.micro-stat{
  padding:14px 16px;
  border-radius:20px;
  border:1px solid rgba(122,174,229,.1);
  background:rgba(11,18,29,.78);
}
.micro-stat-label{
  color:#83a0c4;
  font:700 9px/1 var(--mono);
  letter-spacing:.14em;
  text-transform:uppercase;
}
.micro-stat-value{
  margin-top:10px;
  font:800 24px/1 var(--display);
  letter-spacing:-.05em;
}
.play-grid-shell{
  position:relative;
  padding:12px;
  border-radius:26px;
  border:1px solid rgba(122,174,229,.1);
  background:
    radial-gradient(circle at top left,rgba(87,176,255,.08),transparent 24%),
    linear-gradient(180deg,rgba(7,12,20,.94),rgba(10,16,26,.92));
  overflow:hidden;
}
.play-grid-shell::before{
  content:'';
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
    linear-gradient(rgba(255,255,255,.014) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.014) 1px,transparent 1px);
  background-size:34px 34px;
  opacity:.35;
}
.mine-grid{
  position:relative;
  z-index:1;
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:12px;
}
.mine-tile{
  position:relative;
  aspect-ratio:1/1;
  border-radius:24px;
  border:1px solid rgba(122,174,229,.12);
  background:linear-gradient(180deg,rgba(17,27,43,.96),rgba(10,16,26,.92));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 16px 30px rgba(0,0,0,.2);
  cursor:pointer;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-direction:column;
  gap:8px;
  min-height:92px;
}
.mine-tile::before{
  content:'';
  position:absolute;
  inset:8px;
  border-radius:18px;
  border:1px solid rgba(255,255,255,.03);
  background:linear-gradient(180deg,rgba(255,255,255,.03),transparent);
  pointer-events:none;
}
.mine-tile.hidden .tile-core{
  width:18px;
  height:18px;
  border-radius:50%;
  border:2px solid rgba(122,174,229,.24);
  box-shadow:0 0 20px rgba(87,176,255,.08);
}
.mine-tile.hidden .tile-label{
  color:#87a5c8;
}
.mine-tile.safe{
  border-color:rgba(0,229,160,.24);
  background:linear-gradient(180deg,rgba(0,229,160,.18),rgba(10,18,26,.92));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 18px 34px rgba(0,229,160,.12),0 0 26px rgba(0,229,160,.12);
}
.mine-tile.safe .tile-core{
  width:18px;
  height:18px;
  border-radius:50%;
  background:radial-gradient(circle,var(--green),rgba(0,229,160,.2));
  box-shadow:0 0 18px rgba(0,229,160,.44);
}
.mine-tile.mine{
  border-color:rgba(255,83,111,.24);
  background:linear-gradient(180deg,rgba(255,83,111,.18),rgba(21,12,18,.92));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 18px 34px rgba(255,83,111,.12),0 0 26px rgba(255,83,111,.12);
}
.mine-tile.mine .tile-core{
  width:18px;
  height:18px;
  border-radius:50%;
  background:radial-gradient(circle,var(--red),rgba(255,83,111,.22));
  box-shadow:0 0 18px rgba(255,83,111,.44);
}
.mine-tile.peek{
  opacity:.8;
}
.mine-tile.hit{
  animation:mineShake .42s ease;
}
.mine-tile:disabled{
  cursor:default;
}
.tile-label{
  font:700 10px/1.2 var(--mono);
  letter-spacing:.12em;
  text-transform:uppercase;
}
.tile-value{
  font:800 15px/1 var(--display);
  letter-spacing:-.03em;
}
.result-banner{
  margin-top:18px;
  padding:15px 16px;
  border-radius:22px;
  border:1px solid rgba(122,174,229,.12);
  background:rgba(11,18,29,.82);
  font-size:12px;
  color:#a5bedb;
}
.result-banner.good{
  border-color:rgba(0,229,160,.24);
  background:rgba(0,229,160,.08);
  color:var(--green);
}
.result-banner.bad{
  border-color:rgba(255,83,111,.24);
  background:rgba(255,83,111,.08);
  color:var(--red);
}
.result-banner.info{
  border-color:rgba(41,211,255,.22);
  background:rgba(41,211,255,.08);
  color:var(--cyan);
}
.side-grid{
  display:grid;
  gap:18px;
}
.score-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}
.score-card{
  padding:16px 18px;
  border-radius:22px;
  border:1px solid rgba(122,174,229,.1);
  background:rgba(11,18,29,.78);
}
.score-card-value{
  margin-top:10px;
  font:900 30px/.94 var(--display);
  letter-spacing:-.05em;
}
.meter-wrap{
  margin-top:16px;
}
.meter-top{
  display:flex;
  justify-content:space-between;
  gap:10px;
  color:#8ca6ca;
  font:700 9px/1 var(--mono);
  letter-spacing:.12em;
  text-transform:uppercase;
}
.meter{
  margin-top:8px;
  height:8px;
  border-radius:999px;
  background:rgba(255,255,255,.05);
  overflow:hidden;
}
.meter-fill{
  height:100%;
  width:0%;
  border-radius:999px;
  background:linear-gradient(90deg,var(--cyan),var(--green));
  transition:width .18s linear,background .22s ease;
}
.leaderboard{
  display:grid;
  gap:10px;
}
.leader-row{
  display:grid;
  grid-template-columns:auto 1fr auto;
  gap:12px;
  align-items:center;
  padding:13px 14px;
  border-radius:20px;
  border:1px solid rgba(122,174,229,.1);
  background:rgba(11,18,29,.76);
}
.leader-rank{
  width:34px;
  height:34px;
  border-radius:50%;
  display:flex;
  align-items:center;
  justify-content:center;
  background:rgba(87,176,255,.12);
  color:var(--cyan);
  font:800 11px/1 var(--mono);
}
.leader-main{
  min-width:0;
}
.leader-main strong{
  display:block;
  font:800 15px/1.1 var(--display);
}
.leader-main span{
  display:block;
  margin-top:5px;
  color:#91aacd;
  font:600 10px/1.4 var(--mono);
  letter-spacing:.04em;
}
.leader-side{
  text-align:right;
}
.leader-side strong{
  display:block;
  font:800 14px/1 var(--display);
  color:var(--green);
}
.leader-side span{
  display:block;
  margin-top:6px;
  color:#86a2c7;
  font:700 9px/1 var(--mono);
  letter-spacing:.12em;
  text-transform:uppercase;
}
.leader-empty{
  padding:24px 16px;
  border-radius:20px;
  border:1px dashed rgba(122,174,229,.16);
  background:rgba(11,18,29,.58);
  color:#90a8ca;
  text-align:center;
  font-size:11px;
}
.rule-list{
  display:grid;
  gap:12px;
}
.rule{
  padding:14px 16px;
  border-radius:20px;
  border:1px solid rgba(122,174,229,.1);
  background:rgba(11,18,29,.76);
}
.rule strong{
  display:block;
  color:#eef6ff;
  font:800 16px/1.1 var(--display);
  letter-spacing:-.03em;
}
.rule span{
  display:block;
  margin-top:8px;
  color:#93acd0;
  font-size:11px;
}
.fx-layer{
  position:absolute;
  inset:0;
  z-index:2;
  pointer-events:none;
  overflow:hidden;
}
.fx-burst{
  position:absolute;
  width:8px;
  height:8px;
  border-radius:50%;
  left:0;
  top:0;
  background:var(--tone,rgba(41,211,255,.9));
  box-shadow:0 0 18px var(--tone,rgba(41,211,255,.9));
  transform:translate(-50%,-50%);
  animation:fxBurst .8s cubic-bezier(.22,1,.36,1) forwards;
}
.fx-burst.good{--tone:rgba(0,229,160,.95)}
.fx-burst.bad{--tone:rgba(255,83,111,.95)}
.fx-burst.warn{--tone:rgba(245,184,75,.95)}
@keyframes fxBurst{
  from{
    opacity:1;
    transform:translate(-50%,-50%) translate(0,0) scale(1);
  }
  to{
    opacity:0;
    transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(.2);
  }
}
@keyframes mineShake{
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-4px)}
  40%{transform:translateX(4px)}
  60%{transform:translateX(-3px)}
  80%{transform:translateX(3px)}
}
@media(max-width:1180px){
  .hero,.main-grid{
    grid-template-columns:1fr;
  }
}
@media(max-width:760px){
  .page{
    padding:18px 14px 64px;
  }
  .hero-card,.panel,.stat{
    border-radius:24px;
  }
  .hero-card{
    padding:22px;
  }
  .panel-body{
    padding:18px;
  }
  .control-bar,.board-meta,.score-grid{
    grid-template-columns:1fr;
  }
  .mine-grid{
    gap:10px;
  }
  .mine-tile{
    min-height:78px;
    border-radius:20px;
  }
}
${getSharedStyles()}
</style>
</head>
<body class="play-v3">
${getSharedChrome({accent:'#29d3ff',accentSoft:'rgba(41,211,255,.22)',secondary:'rgba(0,229,160,.16)',loaderLabel:'Cargando Crypto Mines'})}
<div class="page-shell">
${getSharedNav('play', user, 'green')}
<div class="page">
  <section class="hero">
    <div class="hero-card">
      <div class="eyebrow">Crypto Play</div>
      <h1 class="hero-title">Limpia el tablero. Esquiva la <span>liquidación.</span></h1>
      <p class="hero-sub">Crypto Mines convierte la lectura de mercado en un minijuego rápido y local. Elige régimen, riesgo, descubre casillas de ganancia y retira antes de caer en una trampa de liquidación.</p>
      <div class="hero-actions">
        <button class="hero-btn primary" id="startBtn" type="button">Desplegar tablero</button>
        <button class="cashout-btn" id="cashoutBtn" type="button" disabled>Retirar</button>
        <button class="hero-btn" id="resetBtn" type="button">Reiniciar sesión</button>
      </div>
    </div>
    <div class="hero-stack">
      <div class="stat">
        <div class="stat-label">Billetera Sim</div>
        <div class="stat-value" id="walletVal">$250.00</div>
        <div class="stat-sub">Bankroll solo de sesión. Reventar cuesta stake y retirar asegura ganancia simulada.</div>
      </div>
      <div class="stat">
        <div class="stat-label">Racha</div>
        <div class="stat-value" id="heroStreak">0</div>
        <div class="stat-sub">Retiros ganadores consecutivos. La mejor racha local queda en este dispositivo.</div>
      </div>
    </div>
  </section>

  <section class="main-grid">
    <div class="panel arena-panel" id="arenaPanel">
      <div class="panel-hdr">
        <div class="panel-title">Crypto Mines</div>
        <div class="panel-meta" id="roundMeta">Esperando despliegue</div>
      </div>
      <div class="panel-body">
        <div class="control-bar">
          <div class="control-group">
            <span class="control-label">Modo de mercado</span>
            <div class="chip-row">
              <button class="mode-chip" data-mode="calm" type="button">Calma</button>
              <button class="mode-chip is-active" data-mode="trend" type="button">Tendencia</button>
              <button class="mode-chip" data-mode="frenzy" type="button">Frenesí</button>
            </div>
          </div>
          <div class="control-group">
            <span class="control-label">Modo de riesgo</span>
            <div class="chip-row">
              <button class="risk-chip" data-risk="core" type="button">Core</button>
              <button class="risk-chip is-active" data-risk="boost" type="button">Boost</button>
              <button class="risk-chip" data-risk="apex" type="button">Apex</button>
            </div>
          </div>
        </div>

        <div class="arena-top">
          <div class="live-tag" id="volatilityLive">Pulso de volatilidad</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <div class="status-chip info" id="marketChip">Pulso de tendencia</div>
            <div class="status-chip warn" id="mineCountChip">0 liquidaciones</div>
          </div>
        </div>

        <div class="arena-shell">
          <div class="board-meta">
            <div class="micro-stat">
              <div class="micro-stat-label">Multiplicador</div>
              <div class="micro-stat-value" id="multiplierVal">1.00x</div>
            </div>
            <div class="micro-stat">
              <div class="micro-stat-label">Ganancia ronda</div>
              <div class="micro-stat-value" id="roundGainVal">$0.00</div>
            </div>
            <div class="micro-stat">
              <div class="micro-stat-label">Descubiertas</div>
              <div class="micro-stat-value" id="revealedVal">0</div>
            </div>
            <div class="micro-stat">
              <div class="micro-stat-label">Volatilidad</div>
              <div class="micro-stat-value" id="volatilityVal">52</div>
            </div>
          </div>

          <div class="play-grid-shell">
            <div class="fx-layer" id="fxLayer"></div>
            <div class="mine-grid" id="mineBoard"></div>
          </div>

          <div class="meter-wrap">
            <div class="meter-top">
              <span id="densityLabel">Densidad de minas</span>
              <span id="stakeLabel">Apuesta $30.00</span>
            </div>
            <div class="meter"><div class="meter-fill" id="volatilityFill"></div></div>
          </div>

          <div class="result-banner info" id="resultBanner">Despliega un tablero, descubre casillas de ganancia y retira antes de que una liquidación termine la ronda.</div>
        </div>
      </div>
    </div>

    <div class="side-grid">
      <div class="panel">
        <div class="panel-hdr">
          <div class="panel-title">Alpha de sesión</div>
          <div class="panel-meta" id="bestCashoutVal">Mejor retiro $0.00</div>
        </div>
        <div class="panel-body">
          <div class="score-grid">
            <div class="score-card">
              <div class="stat-label">PnL sesión</div>
              <div class="score-card-value" id="sessionPnlVal">$0.00</div>
            </div>
            <div class="score-card">
              <div class="stat-label">Mejor racha</div>
              <div class="score-card-value" id="bestStreakVal">0</div>
            </div>
            <div class="score-card">
              <div class="stat-label">Ganadas</div>
              <div class="score-card-value" id="winsVal">0</div>
            </div>
            <div class="score-card">
              <div class="stat-label">Perdidas</div>
              <div class="score-card-value" id="lossesVal">0</div>
            </div>
          </div>
          <div class="meter-wrap">
            <div class="meter-top">
              <span>Tasa de retiro</span>
              <span id="winRateVal">0%</span>
            </div>
            <div class="meter"><div class="meter-fill" id="winRateFill"></div></div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hdr">
          <div class="panel-title">Ranking local</div>
          <button class="mini-btn" id="clearLeaderboardBtn" type="button">Limpiar local</button>
        </div>
        <div class="panel-body">
          <div class="leaderboard" id="leaderboardList"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-hdr">
          <div class="panel-title">Cómo jugar</div>
          <div class="panel-meta">Bucle rápido</div>
        </div>
        <div class="panel-body">
          <div class="rule-list">
            <div class="rule"><strong>El modo de mercado cambia el tablero</strong><span>Calma coloca menos celdas de liquidación. Frenesí sube densidad y volatilidad para pagos mayores.</span></div>
            <div class="rule"><strong>El modo de riesgo altera stake y recompensa</strong><span>Más riesgo compromete más capital simulado y acelera el multiplicador, pero el tablero se vuelve más cruel.</span></div>
            <div class="rule"><strong>Retira cuando tu lectura lo pida</strong><span>Cada casilla segura eleva el multiplicador. Asegura ganancia cuando el contexto lo justifique o sigue presionando por una bolsa mayor.</span></div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
</div>

<script>
const leaderboardKey='aterum-crypto-mines-leaderboard';
const bestStreakKey='aterum-crypto-mines-best-streak';
const baseWallet=250;
const boardEl=document.getElementById('mineBoard');
const fxLayer=document.getElementById('fxLayer');
const startBtn=document.getElementById('startBtn');
const cashoutBtn=document.getElementById('cashoutBtn');
const resetBtn=document.getElementById('resetBtn');
const clearLeaderboardBtn=document.getElementById('clearLeaderboardBtn');
const marketModes={
  calm:{label:'Flujo calmo',mines:4,baseVol:26,density:'Densidad baja',chip:'info'},
  trend:{label:'Pulso tendencial',mines:6,baseVol:52,density:'Densidad balanceada',chip:'good'},
  frenzy:{label:'Oleada de volatilidad',mines:8,baseVol:78,density:'Densidad alta',chip:'bad'}
};
const riskModes={
  core:{label:'Base',stake:18,gain:0.16,mineBonus:0},
  boost:{label:'Impulso',stake:30,gain:0.24,mineBonus:1},
  apex:{label:'Apex',stake:48,gain:0.33,mineBonus:2}
};
const state={
  wallet:baseWallet,
  active:false,
  board:[],
  revealed:0,
  multiplier:1,
  roundProfit:0,
  streak:0,
  bestStreak:+(localStorage.getItem(bestStreakKey)||0),
  wins:0,
  losses:0,
  rounds:0,
  marketMode:'trend',
  riskMode:'boost',
  currentMines:0,
  leaderboard:loadLeaderboard(),
  volatility:52,
  lastAmbientPaint:0
};

function loadLeaderboard(){
  try{
    const parsed=JSON.parse(localStorage.getItem(leaderboardKey)||'[]');
    return Array.isArray(parsed)?parsed.slice(0,6):[];
  }catch(e){
    return [];
  }
}
function saveLeaderboard(){
  localStorage.setItem(leaderboardKey,JSON.stringify(state.leaderboard.slice(0,6)));
}
function fmtUSD(value,d=2){
  return '$'+Math.abs(Number(value)||0).toFixed(d);
}
function fmtSignedUSD(value,d=2){
  const num=Number(value)||0;
  return (num>=0?'+':'-')+fmtUSD(num,d);
}
function glowForTone(tone){
  return {
    cyan:'rgba(41,211,255,.34)',
    good:'rgba(0,229,160,.34)',
    bad:'rgba(255,83,111,.3)',
    warn:'rgba(245,184,75,.3)'
  }[tone]||'rgba(87,176,255,.34)';
}
function bumpValue(id,value,tone='cyan'){
  const el=document.getElementById(id);
  if(!el||el.textContent===value)return;
  el.textContent=value;
  if(window.gsap){
    const glow=glowForTone(tone);
    gsap.killTweensOf(el);
    gsap.fromTo(el,{scale:1,y:0,filter:'drop-shadow(0 0 0 '+glow+')'},{scale:1.05,y:-2,filter:'drop-shadow(0 0 18px '+glow+')',duration:.22,ease:'power2.out',yoyo:true,repeat:1,clearProps:'transform,filter'});
  }
}
function setBanner(message,type){
  const el=document.getElementById('resultBanner');
  el.className='result-banner'+(type?' '+type:'');
  el.textContent=message;
}
function setChip(id,text,type){
  const el=document.getElementById(id);
  el.className='status-chip '+type;
  el.textContent=text;
}
function currentMarket(){
  return marketModes[state.marketMode];
}
function currentRisk(){
  return riskModes[state.riskMode];
}
function currentStake(){
  return currentRisk().stake;
}
function computeMultiplier(revealed){
  const market=currentMarket();
  const risk=currentRisk();
  const scarcity=1+(state.currentMines/13);
  const momentum=(market.baseVol/100)*0.12;
  return 1+(revealed*risk.gain*scarcity)+(Math.max(0,revealed-1)*momentum);
}
function createBoard(){
  const total=25;
  const mineCount=Math.min(11,currentMarket().mines+currentRisk().mineBonus);
  const mines=new Set();
  while(mines.size<mineCount){
    mines.add(Math.floor(Math.random()*total));
  }
  state.currentMines=mineCount;
  state.board=Array.from({length:total},(_,index)=>({
    index,
    mine:mines.has(index),
    revealed:false,
    peek:false,
    hit:false
  }));
}
function renderBoard(){
  boardEl.innerHTML=state.board.map(cell=>{
    let cls='mine-tile ';
    let label='Ganancia';
    let value='Mantén';
    if(!cell.revealed&&!cell.peek){
      cls+='hidden';
      label='Señal';
      value='Tocar';
    }else if(cell.mine){
      cls+='mine';
      label='Liquidación';
      value=cell.hit?'Golpe':'Trampa';
      if(cell.peek&&!cell.revealed)cls+=' peek';
      if(cell.hit)cls+=' hit';
    }else{
      cls+='safe';
      label='Ganancia';
      value='+'+state.multiplier.toFixed(2)+'x';
    }
    const disabled=(!state.active||cell.revealed||cell.peek)?' disabled':'';
    return '<button class="'+cls+'" data-index="'+cell.index+'" type="button"'+disabled+'><span class="tile-core"></span><span class="tile-label">'+label+'</span><span class="tile-value">'+value+'</span></button>';
  }).join('');
}
function pushLeaderboard(entry){
  state.leaderboard=[entry,...state.leaderboard]
    .sort((a,b)=>b.payout-a.payout)
    .slice(0,6);
  saveLeaderboard();
  renderLeaderboard();
}
function renderLeaderboard(){
  const list=document.getElementById('leaderboardList');
  if(!state.leaderboard.length){
    list.innerHTML='<div class="leader-empty">No cashouts yet. Land a win to start the local hall of fame.</div>';
    document.getElementById('bestCashoutVal').textContent='Mejor retiro $0.00';
    return;
  }
  document.getElementById('bestCashoutVal').textContent='Mejor retiro '+fmtUSD(state.leaderboard[0].payout);
  list.innerHTML=state.leaderboard.map((entry,index)=>'<div class="leader-row"><div class="leader-rank">#'+(index+1)+'</div><div class="leader-main"><strong>'+fmtUSD(entry.payout)+'</strong><span>'+entry.market+' / '+entry.risk+' · x'+entry.multiplier.toFixed(2)+' · '+entry.when+'</span></div><div class="leader-side"><strong>'+entry.streak+' de racha</strong><span>'+entry.revealed+' limpias</span></div></div>').join('');
}
function syncButtons(){
  startBtn.disabled=state.active;
  cashoutBtn.disabled=!state.active||state.revealed===0;
  cashoutBtn.textContent=state.active&&state.revealed?'Retirar '+fmtUSD(state.roundProfit):'Retirar';
}
function syncHud(){
  const sessionPnl=state.wallet-baseWallet;
  bumpValue('walletVal',fmtUSD(state.wallet),sessionPnl>=0?'good':'bad');
  bumpValue('heroStreak',String(state.streak),state.streak>0?'good':'cyan');
  bumpValue('multiplierVal',state.multiplier.toFixed(2)+'x',state.multiplier>=1.9?'warn':'cyan');
  bumpValue('roundGainVal',fmtUSD(state.roundProfit),state.roundProfit>0?'good':'cyan');
  bumpValue('revealedVal',String(state.revealed),state.revealed>0?'good':'cyan');
  document.getElementById('volatilityVal').textContent=String(Math.round(state.volatility));
  bumpValue('sessionPnlVal',fmtSignedUSD(sessionPnl),sessionPnl>=0?'good':'bad');
  bumpValue('bestStreakVal',String(state.bestStreak),state.bestStreak>0?'warn':'cyan');
  bumpValue('winsVal',String(state.wins),state.wins?'good':'cyan');
  bumpValue('lossesVal',String(state.losses),state.losses?'bad':'cyan');
  const rate=state.rounds?Math.round((state.wins/state.rounds)*100):0;
  bumpValue('winRateVal',rate+'%',rate>=55?'good':rate>=35?'warn':'bad');
  document.getElementById('winRateFill').style.width=rate+'%';
  document.getElementById('winRateFill').style.background=rate>=55?'linear-gradient(90deg,var(--cyan),var(--green))':rate>=35?'linear-gradient(90deg,var(--gold),var(--cyan))':'linear-gradient(90deg,var(--red),var(--gold))';
  document.getElementById('stakeLabel').textContent='Apuesta '+fmtUSD(currentStake());
  document.getElementById('densityLabel').textContent=currentMarket().density+' · '+state.currentMines+' minas';
  document.getElementById('heroStreak').style.color=state.streak>0?'var(--gold)':'var(--text)';
  document.getElementById('sessionPnlVal').style.color=sessionPnl>=0?'var(--green)':'var(--red)';
  document.getElementById('roundMeta').textContent=state.active?'Tablero en vivo · '+currentMarket().label+' · '+currentRisk().label:'Esperando despliegue';
  setChip('marketChip',currentMarket().label,currentMarket().chip);
  setChip('mineCountChip',state.currentMines+' liquidaciones',state.currentMines>=9?'bad':state.currentMines>=7?'warn':'info');
  document.getElementById('volatilityLive').textContent='Pulso de volatilidad '+Math.round(state.volatility);
  document.getElementById('volatilityFill').style.width=Math.round(state.volatility)+'%';
  document.getElementById('volatilityFill').style.background=state.volatility>70?'linear-gradient(90deg,var(--gold),var(--red))':state.volatility>45?'linear-gradient(90deg,var(--cyan),var(--gold))':'linear-gradient(90deg,var(--cyan),var(--green))';
  syncButtons();
}
function updateModeButtons(){
  document.querySelectorAll('.mode-chip').forEach(btn=>{
    btn.classList.toggle('is-active',btn.dataset.mode===state.marketMode);
  });
  document.querySelectorAll('.risk-chip').forEach(btn=>{
    btn.classList.toggle('is-active',btn.dataset.risk===state.riskMode);
  });
}
function emitBurstFromElement(el,tone,count){
  if(!el)return;
  const rect=el.getBoundingClientRect();
  const parent=fxLayer.getBoundingClientRect();
  const x=rect.left-parent.left+(rect.width/2);
  const y=rect.top-parent.top+(rect.height/2);
  for(let i=0;i<count;i++){
    const node=document.createElement('span');
    node.className='fx-burst '+tone;
    node.style.left=x+'px';
    node.style.top=y+'px';
    node.style.setProperty('--dx',((Math.random()-.5)*120)+'px');
    node.style.setProperty('--dy',((Math.random()-.5)*120)+'px');
    fxLayer.appendChild(node);
    setTimeout(()=>node.remove(),820);
  }
}
function startRound(){
  if(state.wallet<currentStake()){
    setBanner('La billetera no alcanza para este modo de riesgo. Reinicia la sesión o baja de nivel.','bad');
    return;
  }
  state.active=true;
  state.revealed=0;
  state.multiplier=1;
  state.roundProfit=0;
  createBoard();
  renderBoard();
  updateModeButtons();
  syncHud();
  setBanner('Tablero armado. Limpia casillas de ganancia y retira antes de tocar liquidación.','info');
  if(window.gsap){
    gsap.fromTo('.mine-tile',{scale:.92,opacity:0},{scale:1,opacity:1,duration:.34,stagger:.015,ease:'power3.out',clearProps:'opacity,transform'});
  }
}
function resolveBust(index,tile){
  state.active=false;
  state.rounds+=1;
  state.losses+=1;
  state.streak=0;
  state.wallet=Math.max(0,state.wallet-currentStake());
  state.board=state.board.map(cell=>cell.mine?{...cell,revealed:true,hit:cell.index===index}:{...cell,peek:cell.revealed});
  renderBoard();
  syncHud();
  setBanner('Golpe de liquidación. El stake de la ronda se quemó. Rearma el tablero e inténtalo otra vez.','bad');
  emitBurstFromElement(tile,'bad',18);
  if(window.gsap){
    gsap.fromTo('#mineBoard',{x:0},{x:-6,duration:.07,repeat:5,yoyo:true,ease:'power1.inOut',clearProps:'transform'});
  }
}
function resolveCashout(sourceEl,forced){
  if(!state.active||!state.revealed)return;
  state.active=false;
  state.rounds+=1;
  state.wins+=1;
  state.streak+=1;
  state.bestStreak=Math.max(state.bestStreak,state.streak);
  localStorage.setItem(bestStreakKey,String(state.bestStreak));
  state.wallet+=state.roundProfit;
  state.board=state.board.map(cell=>cell.mine?{...cell,peek:true}:cell);
  renderBoard();
  pushLeaderboard({
    payout:+state.roundProfit.toFixed(2),
    multiplier:+state.multiplier.toFixed(2),
    market:currentMarket().label,
    risk:currentRisk().label,
    revealed:state.revealed,
    streak:state.streak,
    when:new Date().toISOString().slice(5,16).replace('T',' ')
  });
  syncHud();
  setBanner(forced?'Limpieza perfecta. Vaciaste el tablero completo y aseguraste un pago premium.':'Retiro confirmado. Ganancia simulada asegurada antes de que apareciera la liquidación.','good');
  emitBurstFromElement(sourceEl||document.getElementById('cashoutBtn'),'good',22);
}
function revealCell(index,tile){
  if(!state.active)return;
  const cell=state.board[index];
  if(!cell||cell.revealed)return;
  cell.revealed=true;
  if(cell.mine){
    resolveBust(index,tile);
    return;
  }
  state.revealed+=1;
  state.multiplier=computeMultiplier(state.revealed);
  state.roundProfit=+(currentStake()*(state.multiplier-1)).toFixed(2);
  renderBoard();
  syncHud();
  setBanner('Casilla segura. El multiplicador subió y el valor del retiro mejoró.','good');
  emitBurstFromElement(tile,'good',12);
  if(window.gsap){
    gsap.fromTo(tile,{scale:.9,rotateX:14},{scale:1,rotateX:0,duration:.32,ease:'back.out(1.7)',clearProps:'transform'});
  }
  if(state.revealed>=(25-state.currentMines)){
    resolveCashout(tile,true);
  }
}
function resetSession(){
  state.wallet=baseWallet;
  state.active=false;
  state.revealed=0;
  state.multiplier=1;
  state.roundProfit=0;
  state.streak=0;
  state.wins=0;
  state.losses=0;
  state.rounds=0;
  createBoard();
  renderBoard();
  syncHud();
  setBanner('Sesión reiniciada. La billetera se recargó y el ranking local se mantuvo intacto.','info');
}
boardEl.addEventListener('click',e=>{
  const tile=e.target.closest('.mine-tile');
  if(!tile)return;
  revealCell(+(tile.dataset.index||0),tile);
});
startBtn.addEventListener('click',startRound);
cashoutBtn.addEventListener('click',()=>resolveCashout(cashoutBtn,false));
resetBtn.addEventListener('click',resetSession);
clearLeaderboardBtn.addEventListener('click',()=>{
  state.leaderboard=[];
  saveLeaderboard();
  renderLeaderboard();
  setBanner('Ranking local limpiado. Las estadísticas de la sesión siguen activas.','info');
});
document.querySelectorAll('.mode-chip').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(state.active){
      setBanner('Termina el tablero activo antes de cambiar el modo de mercado.','warn');
      return;
    }
    state.marketMode=btn.dataset.mode;
    updateModeButtons();
    createBoard();
    renderBoard();
    syncHud();
    setBanner('Modo de mercado cambiado. La densidad prevista del tablero se actualizó.','info');
  });
});
document.querySelectorAll('.risk-chip').forEach(btn=>{
  btn.addEventListener('click',()=>{
    if(state.active){
      setBanner('Termina el tablero activo antes de cambiar el modo de riesgo.','warn');
      return;
    }
    state.riskMode=btn.dataset.risk;
    updateModeButtons();
    createBoard();
    renderBoard();
    syncHud();
    setBanner('Modo de riesgo cambiado. Se actualizó el stake y la curva de recompensa.','info');
  });
});
function ambientTick(now){
  if(!state.lastAmbientPaint||now-state.lastAmbientPaint>120){
    const market=currentMarket();
    const wave=Math.sin(now/950)*7+Math.sin(now/430)*3;
    state.volatility=Math.max(14,Math.min(96,market.baseVol+wave));
    syncHud();
    state.lastAmbientPaint=now;
  }
  requestAnimationFrame(ambientTick);
}

createBoard();
renderBoard();
updateModeButtons();
renderLeaderboard();
syncHud();
setBanner('Despliega un tablero, descubre casillas de ganancia y retira antes de que una celda de liquidación termine la ronda.','info');
requestAnimationFrame(ambientTick);
if(window.gsap){
  gsap.fromTo('.hero-card,.panel,.stat',{y:18,opacity:0},{y:0,opacity:1,duration:.62,stagger:.05,ease:'power3.out',clearProps:'opacity,transform',delay:.08});
}
</script>
<script>${getSharedScript()}</script>
</body></html>`; }

module.exports = { getPlayHTML };
