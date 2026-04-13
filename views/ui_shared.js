'use strict';

function getSharedHeadAssets() {
  return `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js"></script>`;
}

function getLoadingMarkup(label = 'Cargando terminal') {
  return `<div class="loading loading-shell" aria-live="polite">
  <div class="loading-visual" aria-hidden="true">
    <div class="loading-bars"><span></span><span></span><span></span><span></span><span></span></div>
    <div class="loading-gridline"></div>
    <div class="loading-pulses"><span></span><span></span><span></span></div>
  </div>
  <div class="loading-copy">
    <strong>${label}</strong>
    <span>Sincronizando superficies de mercado...</span>
  </div>
</div>`;
}

function getSharedChrome(options = {}) {
  const {
    accent = '#3d9eff',
    accentSoft = 'rgba(61,158,255,.2)',
    secondary = 'rgba(0,229,160,.14)',
    loaderLabel = 'Preparando terminal'
  } = options;

  return `<style>:root{--fx-accent:${accent};--fx-accent-soft:${accentSoft};--fx-secondary:${secondary};}</style>
<div class="app-chrome" aria-hidden="true" style="--fx-accent:${accent};--fx-accent-soft:${accentSoft};--fx-secondary:${secondary}">
  <div class="app-grid"></div>
  <div class="app-grid app-grid-secondary"></div>
  <div class="app-beam app-beam-a"></div>
  <div class="app-beam app-beam-b"></div>
  <div class="app-orb app-orb-a"></div>
  <div class="app-orb app-orb-b"></div>
  <div class="app-particles">
    <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
  </div>
</div>
<div class="page-transition" id="pageTransition" aria-hidden="true">
  <div class="page-transition-core"></div>
  <div class="page-transition-bar"></div>
  <div class="page-transition-copy">Abriendo superficie de mercado...</div>
</div>
<div class="page-loader" id="pageLoader" aria-hidden="true">
  ${getLoadingMarkup(loaderLabel)}
</div>
<div class="assistant-floating" id="assistantFloating">
  <button class="assistant-fab" id="assistantFab" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="assistantPanel">
    <span class="assistant-fab-core" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3l7 4v6c0 4.1-2.7 7.7-7 8-4.3-.3-7-3.9-7-8V7l7-4z"></path>
        <path d="M9.5 11.5c.5-1.3 1.5-2 2.9-2 1.7 0 2.8.9 2.8 2.4 0 1.2-.6 1.9-1.8 2.5-.9.4-1.2.9-1.2 1.6"></path>
        <circle cx="12" cy="17.4" r=".8" fill="currentColor" stroke="none"></circle>
      </svg>
    </span>
    <span class="assistant-fab-copy">
      <strong>Asistente IA</strong>
      <small>Análisis en tiempo real</small>
    </span>
  </button>
</div>
<div class="assistant-backdrop" id="assistantBackdrop" aria-hidden="true"></div>
<aside class="assistant-panel" id="assistantPanel" aria-hidden="true" role="dialog" aria-modal="true" aria-labelledby="assistantPanelTitle">
  <div class="assistant-panel-sheen"></div>
  <div class="assistant-panel-head">
    <div>
      <div class="assistant-panel-kicker" id="assistantPanelKicker">Asistente IA</div>
      <div class="assistant-panel-title" id="assistantPanelTitle">Contexto operativo en vivo</div>
    </div>
    <button class="assistant-close" id="assistantClose" type="button" aria-label="Cerrar asistente">×</button>
  </div>
  <div class="assistant-panel-sub" id="assistantPanelSub">Sincronizando contexto del mercado...</div>
  <div class="assistant-panel-chips" id="assistantContextChips"></div>
  <div class="assistant-panel-actions" id="assistantStarterRow"></div>
  <div class="assistant-log" id="assistantLog" aria-live="polite" aria-relevant="additions text"></div>
  <form class="assistant-form" id="assistantForm" autocomplete="off">
    <input id="assistantInput" class="assistant-input" type="text" placeholder="Pregunta por tu posición, el precio o el riesgo actual" autocomplete="off" enterkeyhint="send" autocapitalize="sentences" spellcheck="false">
    <button class="assistant-send" id="assistantSend" type="submit">Consultar</button>
  </form>
</aside>`;
}

function getSharedStyles() {
  return `
:where(.page-shell,.page-shell > *,.assistant-floating,.assistant-panel,.assistant-panel > *,.assistant-log,.assistant-form){
  min-width:0;
  min-height:0;
}
.page-shell{
  min-height:100vh;
  min-height:100dvh;
  display:flex;
  flex-direction:column;
}
.app-chrome{
  position:fixed;
  inset:0;
  pointer-events:none;
  z-index:0;
  overflow:hidden;
}
.app-grid{
  position:absolute;
  inset:0;
  background:
    linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);
  background-size:72px 72px;
  mask-image:radial-gradient(circle at center,black 36%,transparent 88%);
  opacity:.2;
  animation:gridFloat 22s ease-in-out infinite alternate;
}
.app-grid-secondary{
  opacity:.1;
  transform:scale(1.08);
  animation-duration:30s;
  animation-direction:alternate-reverse;
}
.app-beam{
  position:absolute;
  width:44vw;
  height:220px;
  min-width:280px;
  border-radius:999px;
  filter:blur(52px);
  opacity:.34;
  animation:beamShift 20s ease-in-out infinite alternate;
}
.app-beam-a{
  top:-110px;
  left:18%;
  background:linear-gradient(90deg,transparent,var(--fx-accent-soft),transparent);
}
.app-beam-b{
  right:-12vw;
  bottom:12%;
  background:linear-gradient(90deg,transparent,var(--fx-secondary),transparent);
  animation-duration:24s;
}
.app-orb{
  position:absolute;
  width:28vw;
  height:28vw;
  min-width:220px;
  min-height:220px;
  border-radius:50%;
  filter:blur(70px);
  opacity:.48;
  animation:orbFloat 18s ease-in-out infinite alternate;
}
.app-orb-a{
  top:-8vw;
  left:-6vw;
  background:radial-gradient(circle,var(--fx-accent-soft),transparent 70%);
}
.app-orb-b{
  right:-8vw;
  bottom:-10vw;
  background:radial-gradient(circle,var(--fx-secondary),transparent 72%);
  animation-duration:24s;
}
.app-particles{
  position:absolute;
  inset:0;
}
.app-particles span{
  position:absolute;
  width:4px;
  height:4px;
  border-radius:50%;
  background:rgba(255,255,255,.34);
  box-shadow:0 0 12px rgba(255,255,255,.16);
  opacity:.22;
  animation:particleDrift 14s linear infinite;
}
.app-particles span:nth-child(1){top:18%;left:12%;animation-duration:16s}
.app-particles span:nth-child(2){top:30%;left:78%;animation-duration:13s;animation-delay:-4s}
.app-particles span:nth-child(3){top:62%;left:20%;animation-duration:18s;animation-delay:-9s}
.app-particles span:nth-child(4){top:70%;left:74%;animation-duration:12s;animation-delay:-2s}
.app-particles span:nth-child(5){top:48%;left:52%;animation-duration:20s;animation-delay:-7s}
.app-particles span:nth-child(6){top:12%;left:58%;animation-duration:15s;animation-delay:-11s}
.app-particles span:nth-child(7){top:82%;left:38%;animation-duration:19s;animation-delay:-6s}
.app-particles span:nth-child(8){top:8%;left:84%;animation-duration:17s;animation-delay:-8s}
.page-transition{
  position:fixed;
  inset:0;
  z-index:950;
  pointer-events:none;
  opacity:0;
  backdrop-filter:blur(0px);
  transition:opacity .34s ease,backdrop-filter .34s ease;
}
.page-transition::before{
  content:'';
  position:absolute;
  inset:0;
  background:rgba(7,13,24,.42);
}
.page-transition::after{
  content:'';
  position:absolute;
  inset:0;
  background:
    radial-gradient(circle at 20% 10%,var(--fx-accent-soft),transparent 28%),
    radial-gradient(circle at 82% 24%,var(--fx-secondary),transparent 24%);
  opacity:.72;
}
.page-transition-core{
  position:absolute;
  inset:16% 20%;
  border-radius:36px;
  border:1px solid rgba(255,255,255,.08);
  background:linear-gradient(180deg,rgba(11,19,32,.82),rgba(7,12,22,.72));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.06),
    0 34px 80px rgba(0,0,0,.3),
    0 0 80px var(--fx-accent-soft);
  transform:scale(.94);
  opacity:0;
  transition:transform .34s cubic-bezier(.22,1,.36,1),opacity .34s ease;
}
.page-transition-bar{
  position:absolute;
  top:0;
  left:0;
  width:0;
  height:3px;
  background:linear-gradient(90deg,var(--fx-accent),rgba(255,255,255,.94),var(--fx-secondary));
  box-shadow:0 0 32px var(--fx-accent-soft);
}
.page-transition-copy{
  position:absolute;
  right:22px;
  bottom:18px;
  padding:9px 14px;
  border-radius:999px;
  background:rgba(11,18,30,.82);
  border:1px solid rgba(255,255,255,.1);
  box-shadow:0 12px 30px rgba(0,0,0,.22);
  color:#d5e6ff;
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.14em;
  text-transform:uppercase;
}
body.page-leaving .page-transition{
  opacity:1;
  backdrop-filter:blur(14px);
}
body.page-leaving .page-transition-core{
  transform:scale(1);
  opacity:1;
}
body.page-leaving .page-transition-bar{
  width:100%;
  transition:width .38s cubic-bezier(.22,1,.36,1);
}
.page-loader{
  position:fixed;
  inset:0;
  z-index:920;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:24px;
  background:rgba(8,14,24,.66);
  backdrop-filter:blur(22px);
  transition:opacity .3s ease,visibility .3s ease;
}
.page-loader.is-hidden{
  opacity:0;
  visibility:hidden;
}
.loading-shell{
  min-width:min(100%,380px);
  padding:20px;
  border-radius:30px;
  border:1px solid rgba(255,255,255,.08);
  background:linear-gradient(180deg,rgba(16,25,40,.96),rgba(9,15,27,.92));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.06),
    0 32px 72px rgba(0,0,0,.32),
    0 0 70px var(--fx-accent-soft);
  display:grid;
  grid-template-columns:120px 1fr;
  gap:16px;
  align-items:center;
}
.loading-shell-wrap .loading-shell,
.card-body > .loading-shell,
.perf-body > .loading-shell,
.tbl-wrap > .loading-shell,
.kpi-grid > .loading-shell,
.stat-row > .loading-shell{
  width:100%;
  min-width:0;
}
.loading-visual{
  position:relative;
  height:88px;
  border-radius:20px;
  overflow:hidden;
  background:linear-gradient(180deg,rgba(11,18,30,.96),rgba(8,13,23,.92));
  border:1px solid rgba(255,255,255,.06);
}
.loading-visual::before{
  content:'';
  position:absolute;
  inset:-20%;
  background:linear-gradient(120deg,transparent 20%,rgba(255,255,255,.1) 48%,transparent 78%);
  transform:translateX(-100%);
  animation:shimmerSweep 1.65s ease-in-out infinite;
}
.loading-bars{
  position:absolute;
  inset:auto 16px 12px;
  display:flex;
  align-items:flex-end;
  gap:7px;
  height:52px;
}
.loading-bars span{
  width:10px;
  border-radius:999px 999px 4px 4px;
  background:linear-gradient(180deg,var(--fx-accent),rgba(255,255,255,.16));
  animation:barPulse 1.05s ease-in-out infinite;
}
.loading-bars span:nth-child(1){height:28px;animation-delay:-.2s}
.loading-bars span:nth-child(2){height:42px;animation-delay:-.45s}
.loading-bars span:nth-child(3){height:22px;animation-delay:-.1s}
.loading-bars span:nth-child(4){height:48px;animation-delay:-.6s}
.loading-bars span:nth-child(5){height:30px;animation-delay:-.3s}
.loading-gridline{
  position:absolute;
  left:0;
  right:0;
  top:48%;
  height:1px;
  background:linear-gradient(90deg,transparent,var(--fx-accent-soft),transparent);
  animation:gridShift 2.2s linear infinite;
}
.loading-pulses{
  position:absolute;
  top:16px;
  right:16px;
  display:flex;
  gap:6px;
}
.loading-pulses span{
  width:6px;
  height:6px;
  border-radius:50%;
  background:var(--fx-accent);
  opacity:.45;
  animation:pulseDots 1.05s ease-in-out infinite;
}
.loading-pulses span:nth-child(2){animation-delay:.18s}
.loading-pulses span:nth-child(3){animation-delay:.36s}
.loading-copy{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.loading-copy strong{
  color:#eef5ff;
  font:800 22px/1 'Inter Tight','Inter',sans-serif;
  letter-spacing:-.04em;
}
.loading-copy span{
  color:#97afd0;
  font:500 11px/1.5 'Inter',sans-serif;
  letter-spacing:.04em;
}
.page-shell{
  position:relative;
  z-index:1;
  opacity:0;
  transform:translateY(16px) scale(.992);
  filter:blur(12px);
  transition:
    opacity .42s ease,
    transform .42s cubic-bezier(.22,1,.36,1),
    filter .42s ease;
}
body.page-ready .page-shell{
  opacity:1;
  transform:none;
  filter:none;
}
body.page-leaving .page-shell{
  opacity:.08;
  transform:translateY(18px) scale(.984);
  filter:blur(16px) saturate(.92);
}
.nav{
  transition:transform .28s ease,opacity .2s ease,box-shadow .28s ease;
  will-change:transform;
}
.nav-user{
  display:inline-flex;
  align-items:center;
  min-height:34px;
  padding:0 12px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.1);
  background:rgba(14,22,36,.84);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);
  color:#c0d3ee;
  font:600 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.nav-link-ghost{
  color:#9db4d3 !important;
}
.nav.nav-hidden{
  transform:translateY(calc(-100% - 14px));
}
.nav-link,.nav-btn,.filter-btn,.f-btn,.hero-btn,.decision-btn,.exec-btn,.exec-mode-btn,
.chart-fs-btn,.ind-btn,.bnav-tab,.mode-chip,.risk-chip,.game-btn,.cashout-btn,
.tile-btn,.mine-tile,.wl-item,.acct-pos-chip,.sym-item,.rejection-item,.session-row,
.assistant-fab,.assistant-close,.assistant-send,.assistant-starter,.assistant-suggestion{
  position:relative;
  overflow:hidden;
  transform:translateZ(0);
  transition:
    transform .22s cubic-bezier(.22,1,.36,1),
    box-shadow .28s ease,
    border-color .24s ease,
    background .24s ease,
    color .2s ease,
    opacity .2s ease;
}
.nav-link:hover,.nav-btn:hover,.filter-btn:hover,.f-btn:hover,.hero-btn:hover,.decision-btn:hover,
.exec-btn:hover,.exec-mode-btn:hover,.chart-fs-btn:hover,.ind-btn:hover,.mode-chip:hover,
.risk-chip:hover,.game-btn:hover,.cashout-btn:hover,.tile-btn:hover,.mine-tile:hover,
.assistant-fab:hover,.assistant-close:hover,.assistant-send:hover,.assistant-starter:hover,.assistant-suggestion:hover{
  transform:translateY(-2px) scale(1.012);
  box-shadow:
    0 14px 30px rgba(7,13,24,.24),
    0 0 0 1px rgba(255,255,255,.04) inset,
    0 0 32px var(--fx-accent-soft);
}
.nav-link.is-pressing,.nav-btn.is-pressing,.filter-btn.is-pressing,.f-btn.is-pressing,.hero-btn.is-pressing,
.decision-btn.is-pressing,.exec-btn.is-pressing,.exec-mode-btn.is-pressing,.chart-fs-btn.is-pressing,
.ind-btn.is-pressing,.mode-chip.is-pressing,.risk-chip.is-pressing,.game-btn.is-pressing,
.cashout-btn.is-pressing,.tile-btn.is-pressing,.mine-tile.is-pressing,
.assistant-fab.is-pressing,.assistant-close.is-pressing,.assistant-send.is-pressing,.assistant-starter.is-pressing,.assistant-suggestion.is-pressing{
  transform:translateY(0) scale(.982);
}
.side-card,.terminal-card,.chart-shell,.metric-card,.market-card,.hero-card,.panel,.stat,
.card,.perf-card,.chart-card,.tbl-card,.acct-panel,.kpi,.acct-stat,.stat-card,.stat-c{
  transition:
    transform .3s cubic-bezier(.22,1,.36,1),
    box-shadow .32s ease,
    border-color .28s ease,
    background .28s ease,
    filter .28s ease;
  will-change:transform;
}
.side-card:hover,.terminal-card:hover,.chart-shell:hover,.metric-card:hover,.market-card:hover,.hero-card:hover,
.panel:hover,.stat:hover,.card:hover,.perf-card:hover,.chart-card:hover,.tbl-card:hover,.acct-panel:hover,
.kpi:hover,.acct-stat:hover,.stat-card:hover,.stat-c:hover{
  transform:translateY(-4px);
  border-color:rgba(125,198,255,.2);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.05),
    0 24px 60px rgba(5,10,18,.28),
    0 0 34px rgba(61,158,255,.08);
  filter:saturate(1.04);
}
.wl-item:hover,.sym-item:hover,.rejection-item:hover,.session-row:hover,.acct-pos-chip:hover{
  box-shadow:0 14px 30px rgba(8,14,24,.18),0 0 22px rgba(61,158,255,.08);
}
.ui-ripple-ink{
  position:absolute;
  left:0;
  top:0;
  width:14px;
  height:14px;
  border-radius:50%;
  pointer-events:none;
  opacity:.78;
  transform:translate(-50%,-50%) scale(0);
  background:radial-gradient(circle,rgba(255,255,255,.55) 0%,var(--fx-accent-soft) 45%,transparent 75%);
  animation:rippleWave .7s cubic-bezier(.22,1,.36,1) forwards;
}
.assistant-floating{
  position:fixed;
  right:calc(22px + env(safe-area-inset-right,0px));
  bottom:calc(22px + env(safe-area-inset-bottom,0px));
  z-index:930;
}
.assistant-fab{
  min-width:206px;
  display:flex;
  align-items:center;
  gap:12px;
  padding:12px 14px;
  border:none;
  border-radius:22px;
  cursor:pointer;
  color:#eef5ff;
  background:
    linear-gradient(135deg,rgba(12,22,37,.96),rgba(9,15,27,.92)),
    linear-gradient(135deg,var(--fx-accent-soft),transparent 70%);
  border:1px solid rgba(255,255,255,.1);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.05),
    0 20px 48px rgba(4,9,17,.28),
    0 0 32px rgba(61,158,255,.08);
  backdrop-filter:blur(22px);
}
.assistant-fab-core{
  width:42px;
  height:42px;
  border-radius:14px;
  display:grid;
  place-items:center;
  color:var(--fx-accent);
  background:linear-gradient(180deg,rgba(255,255,255,.09),rgba(255,255,255,.03));
  border:1px solid rgba(255,255,255,.08);
  box-shadow:0 0 24px var(--fx-accent-soft);
}
.assistant-fab-core svg{
  width:20px;
  height:20px;
}
.assistant-fab-copy{
  display:grid;
  gap:3px;
  text-align:left;
}
.assistant-fab-copy strong{
  color:#f4f8ff;
  font:800 13px/1 'Inter Tight','Inter',sans-serif;
  letter-spacing:-.02em;
}
.assistant-fab-copy small{
  color:#96b0d4;
  font:600 10px/1.2 'JetBrains Mono',monospace;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.assistant-backdrop{
  position:fixed;
  inset:0;
  z-index:935;
  background:rgba(6,12,22,.44);
  backdrop-filter:blur(10px);
  opacity:0;
  visibility:hidden;
  transition:opacity .28s ease,visibility .28s ease;
}
.assistant-panel{
  position:fixed;
  right:18px;
  bottom:18px;
  height:min(760px,calc(100dvh - 36px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)));
  width:min(430px,calc(100vw - 24px));
  max-height:calc(100dvh - 36px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));
  z-index:940;
  padding:18px 18px calc(18px + env(safe-area-inset-bottom,0px));
  border-radius:28px;
  border:1px solid rgba(255,255,255,.1);
  background:linear-gradient(180deg,rgba(13,22,37,.98),rgba(8,13,24,.96));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.05),
    0 34px 90px rgba(0,0,0,.34),
    0 0 64px var(--fx-accent-soft);
  backdrop-filter:blur(24px);
  display:flex;
  flex-direction:column;
  gap:14px;
  opacity:0;
  visibility:hidden;
  pointer-events:none;
  transform:translate3d(0,18px,0) scale(.965);
  transform-origin:bottom right;
  transition:
    opacity .28s ease,
    visibility .28s ease,
    transform .34s cubic-bezier(.22,1,.36,1);
}
.assistant-panel-sheen{
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius:28px;
  background:
    radial-gradient(circle at top right,rgba(255,255,255,.08),transparent 26%),
    linear-gradient(180deg,rgba(255,255,255,.02),transparent 22%);
}
body.assistant-open{
  overflow:hidden;
  touch-action:none;
}
body.assistant-open .assistant-backdrop{
  opacity:1;
  visibility:visible;
}
body.assistant-open .assistant-panel{
  opacity:1;
  visibility:visible;
  pointer-events:auto;
  transform:translate3d(0,0,0) scale(1);
}
body.assistant-open .assistant-fab{
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.05),
    0 24px 64px rgba(4,9,17,.34),
    0 0 40px var(--fx-accent-soft);
}
.assistant-panel-head{
  position:relative;
  z-index:1;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
}
.assistant-panel-kicker{
  color:#8ca9cf;
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.12em;
  text-transform:uppercase;
  margin-bottom:7px;
}
.assistant-panel-title{
  color:#f3f8ff;
  font:900 24px/1 'Inter Tight','Inter',sans-serif;
  letter-spacing:-.05em;
}
.assistant-panel-sub{
  position:relative;
  z-index:1;
  color:#98b2d4;
  font:500 12px/1.6 'Inter',sans-serif;
}
.assistant-close{
  width:38px;
  height:38px;
  border-radius:14px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.03);
  color:#bfd0eb;
  font:400 22px/1 'Inter',sans-serif;
  cursor:pointer;
}
.assistant-panel-chips,.assistant-panel-actions,.assistant-suggestion-row{
  position:relative;
  z-index:1;
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.assistant-chip,.assistant-starter,.assistant-suggestion{
  border-radius:999px;
  border:1px solid rgba(255,255,255,.1);
  background:rgba(255,255,255,.04);
  color:#c7daf3;
  padding:7px 11px;
  font:700 10px/1.1 'JetBrains Mono',monospace;
  letter-spacing:.05em;
  text-transform:uppercase;
}
.assistant-chip.good{color:#6cf0c0;border-color:rgba(0,229,160,.2);background:rgba(0,229,160,.08)}
.assistant-chip.bad{color:#ff7b93;border-color:rgba(255,83,111,.24);background:rgba(255,83,111,.08)}
.assistant-chip.warn{color:#ffd07b;border-color:rgba(245,184,75,.24);background:rgba(245,184,75,.09)}
.assistant-chip.info{color:#9cc8ff;border-color:rgba(87,176,255,.24);background:rgba(87,176,255,.08)}
.assistant-starter,.assistant-suggestion{
  cursor:pointer;
}
.assistant-log{
  position:relative;
  z-index:1;
  flex:1 1 auto;
  min-height:220px;
  overflow-y:auto;
  display:grid;
  gap:12px;
  align-content:start;
  padding-right:6px;
  padding-bottom:6px;
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
}
.assistant-log::-webkit-scrollbar{
  width:5px;
}
.assistant-log::-webkit-scrollbar-thumb{
  background:rgba(255,255,255,.12);
  border-radius:999px;
}
.assistant-msg{
  max-width:92%;
  display:grid;
  gap:10px;
  padding:14px 15px;
  border-radius:22px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.035);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
  word-break:break-word;
}
.assistant-msg.is-loading{
  border-style:dashed;
}
.assistant-msg.user{
  margin-left:auto;
  border-color:rgba(87,176,255,.18);
  background:linear-gradient(135deg,rgba(87,176,255,.15),rgba(87,176,255,.06));
}
.assistant-msg.assistant{
  margin-right:auto;
  border-color:rgba(0,229,160,.12);
  background:linear-gradient(180deg,rgba(13,21,36,.9),rgba(10,15,26,.86));
}
.assistant-msg-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
}
.assistant-msg-top strong{
  color:#edf5ff;
  font:700 12px/1 'Inter Tight','Inter',sans-serif;
}
.assistant-msg-time{
  color:#7e9abb;
  font:700 9px/1 'JetBrains Mono',monospace;
  letter-spacing:.1em;
  text-transform:uppercase;
}
.assistant-msg-title{
  color:#f4f8ff;
  font:800 16px/1.2 'Inter Tight','Inter',sans-serif;
  letter-spacing:-.03em;
}
.assistant-msg-copy,.assistant-section-copy{
  color:#98b1d3;
  font:500 12px/1.7 'Inter',sans-serif;
}
.assistant-structured{
  display:grid;
  gap:8px;
  padding:12px;
  border-radius:18px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.03);
}
.assistant-structured.good{border-color:rgba(0,229,160,.16);background:rgba(0,229,160,.05)}
.assistant-structured.bad{border-color:rgba(255,83,111,.18);background:rgba(255,83,111,.05)}
.assistant-structured.warn{border-color:rgba(245,184,75,.18);background:rgba(245,184,75,.06)}
.assistant-structured.info{border-color:rgba(87,176,255,.16);background:rgba(87,176,255,.05)}
.assistant-section-label{
  color:#eef6ff;
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.12em;
  text-transform:uppercase;
}
.assistant-section-list{
  margin:0;
  padding-left:16px;
  color:#9cb4d4;
  font:500 12px/1.7 'Inter',sans-serif;
}
.assistant-section-list li{
  margin:5px 0;
}
.assistant-empty{
  min-height:180px;
  display:grid;
  place-items:center;
  text-align:center;
  padding:16px;
  border-radius:22px;
  border:1px dashed rgba(255,255,255,.1);
  color:#8ba6c9;
  font:600 12px/1.6 'Inter',sans-serif;
}
.assistant-form{
  position:relative;
  z-index:1;
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
  margin-top:auto;
  padding-top:10px;
  position:sticky;
  bottom:0;
  background:linear-gradient(180deg,rgba(13,22,37,0),rgba(13,22,37,.9) 26%,rgba(13,22,37,.98) 100%);
}
.assistant-input{
  min-width:0;
  min-height:52px;
  border:none;
  outline:none;
  border-radius:18px;
  border:1px solid rgba(255,255,255,.1);
  background:rgba(255,255,255,.04);
  color:#eff6ff;
  padding:14px 15px;
  font:500 12px/1.4 'Inter',sans-serif;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
.assistant-input::placeholder{
  color:#6f8aac;
}
.assistant-send{
  border:none;
  cursor:pointer;
  padding:0 16px;
  min-height:52px;
  border-radius:18px;
  color:#06111b;
  font:800 11px/1 'JetBrains Mono',monospace;
  letter-spacing:.08em;
  text-transform:uppercase;
  background:linear-gradient(135deg,#eef7ff,var(--fx-accent));
  box-shadow:0 14px 28px rgba(61,158,255,.24);
}
.assistant-send:disabled{
  cursor:wait;
  opacity:.78;
}
.assistant-thinking{
  display:inline-flex;
  align-items:center;
  gap:6px;
  margin-top:2px;
}
.assistant-thinking span{
  width:7px;
  height:7px;
  border-radius:50%;
  background:var(--fx-accent);
  box-shadow:0 0 12px var(--fx-accent-soft);
  opacity:.35;
  animation:pulseDots 1s ease-in-out infinite;
}
.assistant-thinking span:nth-child(2){animation-delay:.16s}
.assistant-thinking span:nth-child(3){animation-delay:.32s}
@keyframes shimmerSweep{
  0%{transform:translateX(-100%)}
  100%{transform:translateX(120%)}
}
@keyframes orbFloat{
  0%{transform:translate3d(-2%,0,0)}
  100%{transform:translate3d(2%,-3%,0) scale(1.05)}
}
@keyframes beamShift{
  0%{transform:translate3d(-4%,0,0) rotate(-10deg)}
  100%{transform:translate3d(3%,-4%,0) rotate(-6deg)}
}
@keyframes particleDrift{
  0%{transform:translate3d(0,0,0);opacity:.12}
  25%{opacity:.32}
  100%{transform:translate3d(30px,-54px,0);opacity:0}
}
@keyframes barPulse{
  0%,100%{transform:scaleY(.82);opacity:.72}
  50%{transform:scaleY(1.14);opacity:1}
}
@keyframes gridShift{
  0%{transform:translateX(-14px)}
  100%{transform:translateX(14px)}
}
@keyframes gridFloat{
  0%{transform:translate3d(-10px,-6px,0)}
  100%{transform:translate3d(12px,8px,0)}
}
@keyframes pulseDots{
  0%,100%{transform:scale(.8);opacity:.35}
  50%{transform:scale(1.2);opacity:1}
}
@keyframes rippleWave{
  0%{transform:translate(-50%,-50%) scale(0);opacity:.82}
  100%{transform:translate(-50%,-50%) scale(12);opacity:0}
}
@media(max-width:840px){
  .nav{
    position:sticky !important;
    top:10px;
    margin:10px 10px 0;
    border-radius:22px;
  }
  .assistant-floating{
    right:12px;
    left:12px;
    bottom:calc(12px + env(safe-area-inset-bottom,0px));
  }
  .assistant-fab{
    width:100%;
    min-width:0;
    justify-content:flex-start;
  }
  .assistant-panel{
    left:12px;
    right:12px;
    top:calc(12px + env(safe-area-inset-top,0px));
    bottom:calc(12px + env(safe-area-inset-bottom,0px));
    width:auto;
    height:auto;
    max-height:none;
    transform-origin:bottom center;
    padding:16px 16px calc(14px + env(safe-area-inset-bottom,0px));
  }
  .assistant-log{
    min-height:0;
  }
  .loading-shell{
    grid-template-columns:1fr;
    min-width:min(100%,320px);
  }
}
@media(max-width:560px){
  .assistant-panel{
    gap:12px;
    border-radius:24px;
  }
  .assistant-panel-title{
    font-size:21px;
  }
  .assistant-panel-sub{
    font-size:11px;
  }
  .assistant-msg{
    max-width:100%;
    padding:12px 13px;
    border-radius:18px;
  }
  .assistant-panel-chips,.assistant-panel-actions,.assistant-suggestion-row{
    gap:6px;
  }
  .assistant-form{
    grid-template-columns:1fr;
  }
  .assistant-send{
    width:100%;
  }
}
@media(prefers-reduced-motion:reduce){
  .app-orb,.app-beam,.app-grid,.app-particles span,.loading-bars span,.loading-visual::before,
  .loading-gridline,.loading-pulses span,.ui-ripple-ink{
    animation:none !important;
  }
  .page-transition,.page-loader,.page-shell,.nav,.nav-link,.nav-btn,.filter-btn,.f-btn,.hero-btn,
  .decision-btn,.exec-btn,.exec-mode-btn,.chart-fs-btn,.ind-btn,.bnav-tab,.mode-chip,.risk-chip,
  .game-btn,.cashout-btn,.tile-btn,.mine-tile,.side-card,.terminal-card,.chart-shell,.metric-card,
  .market-card,.hero-card,.panel,.stat,.card,.perf-card,.chart-card,.tbl-card,.acct-panel,.kpi,
  .acct-stat,.stat-card,.stat-c,.assistant-fab,.assistant-backdrop,.assistant-panel,.assistant-msg,
  .assistant-structured,.assistant-send,.assistant-close,.assistant-starter,.assistant-suggestion{
    transition:none !important;
  }
}
`;
}

function getSharedScript() {
  return `
(function(){
  const body=document.body;
  const loader=document.getElementById('pageLoader');
  const transition=document.getElementById('pageTransition');
  const nav=document.querySelector('.nav');
  const assistantFab=document.getElementById('assistantFab');
  const assistantPanel=document.getElementById('assistantPanel');
  const assistantBackdrop=document.getElementById('assistantBackdrop');
  const assistantClose=document.getElementById('assistantClose');
  const assistantInput=document.getElementById('assistantInput');
  const assistantSend=document.getElementById('assistantSend');
  const assistantForm=document.getElementById('assistantForm');
  const assistantLog=document.getElementById('assistantLog');
  const assistantContextChips=document.getElementById('assistantContextChips');
  const assistantStarterRow=document.getElementById('assistantStarterRow');
  const assistantPanelKicker=document.getElementById('assistantPanelKicker');
  const assistantPanelSub=document.getElementById('assistantPanelSub');
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navHidden=false,lastY=window.scrollY||0,ticking=false;
  const assistantConfig=Object.assign({
    page:(window.location.pathname||'').includes('/analytics')?'analytics':(window.location.pathname||'').includes('/ai-data')?'aidata':'dashboard',
    kicker:'Asistente IA',
    subtitle:'Analiza noticias, sesiones, señales y tu contexto operativo en tiempo real.',
    placeholder:'Pregunta por tu posición, el precio o el riesgo actual',
    launcherLabel:'Asistente IA'
  },window.aterumAssistantConfig||{});
  const assistantState={
    open:false,
    loading:false,
    summary:null,
    seedKey:'',
    latestContextKey:'',
    emptyCopy:'Abre una consulta y te responderé con lectura contextual del mercado, tu riesgo y la señal actual.',
    messages:[]
  };

  const interactiveSelector=[
    'button',
    '.nav-link',
    '.nav-btn',
    '.wl-item',
    '.acct-pos-chip',
    '.sym-item',
    '.rejection-item',
    '.session-row',
    '.mode-chip',
    '.risk-chip',
    '.mine-tile',
    '.tile-btn',
    '.game-btn',
    '.cashout-btn',
    '.assistant-fab',
    '.assistant-close',
    '.assistant-send',
    '.assistant-starter',
    '.assistant-suggestion'
  ].join(',');

  const escapeHtml=(value)=>String(value==null?'':value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');

  const readContext=()=>{
    try{
      const raw=typeof window.aterumAssistantContext==='function'
        ? window.aterumAssistantContext()
        : (window.aterumAssistantContext||{});
      return raw&&typeof raw==='object'?raw:{};
    }catch(error){
      return {};
    }
  };

  const getPageLabel=(page)=>({
    dashboard:'Trading',
    analytics:'Análisis',
    aidata:'Inteligencia',
    play:'Crypto Play'
  })[page]||'Plataforma';

  const toneClass=(tone)=>{
    const key=String(tone||'info').toLowerCase();
    if(key==='alcista'||key==='good'||key==='long')return 'good';
    if(key==='bajista'||key==='bad'||key==='short'||key==='crítica'||key==='critica')return 'bad';
    if(key==='warn'||key==='warning'||key==='media'||key==='alta')return 'warn';
    return 'info';
  };

  const addChip=(label,tone)=>{
    if(!label)return '';
    return '<span class="assistant-chip '+toneClass(tone)+'">'+escapeHtml(label)+'</span>';
  };

  const renderEmptyState=(copy)=>{
    assistantState.emptyCopy=copy||assistantState.emptyCopy||'Abre una consulta y te responderé con lectura contextual en tiempo real.';
    if(!assistantLog)return;
    assistantLog.innerHTML='<div class="assistant-empty">'+escapeHtml(assistantState.emptyCopy)+'</div>';
    assistantLog.scrollTop=0;
  };

  const getContextSymbol=(ctx)=>{
    return String(
      ctx.activo||
      ctx.symbol||
      (ctx.posicion&&ctx.posicion.symbol)||
      (ctx.position&&ctx.position.symbol)||
      (assistantState.summary&&assistantState.summary.symbol)||
      ''
    ).trim().toUpperCase();
  };

  const buildRequestContext=()=>{
    const ctx=Object.assign({},readContext());
    const summary=assistantState.summary||{};
    const openSession=(summary.sessions||[]).find((session)=>session.status==='abierta')||(summary.sessions||[])[0]||null;
    return Object.assign({},ctx,{
      pagina:assistantConfig.page,
      activo:getContextSymbol(ctx)||summary.symbol||'',
      noticias:Array.isArray(ctx.noticias)&&ctx.noticias.length?ctx.noticias:(summary.news||[]).slice(0,3),
      sesion:ctx.sesion||ctx.session||(openSession?openSession.label:null),
      senal:ctx.senal||ctx.signal||summary.signal||null
    });
  };

  const formatStamp=(value)=>{
    const date=value?new Date(value):new Date();
    try{
      return date.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'UTC'})+' UTC';
    }catch(error){
      return date.toISOString().slice(11,16)+' UTC';
    }
  };

  const renderStructuredSections=(sections)=>{
    return (sections||[]).map((section)=>{
      const bullets=Array.isArray(section.bullets)&&section.bullets.length
        ? '<ul class="assistant-section-list">'+section.bullets.map((item)=>'<li>'+escapeHtml(item)+'</li>').join('')+'</ul>'
        : '';
      const text=section.text?'<div class="assistant-section-copy">'+escapeHtml(section.text)+'</div>':'';
      return '<section class="assistant-structured '+toneClass(section.tone)+'"><div class="assistant-section-label">'+escapeHtml(section.title||'Lectura')+'</div>'+text+bullets+'</section>';
    }).join('');
  };

  const renderSuggestions=(items)=>{
    if(!items||!items.length)return '';
    return '<div class="assistant-suggestion-row">'+items.map((item)=>'<button type="button" class="assistant-suggestion" data-question="'+escapeHtml(item)+'">'+escapeHtml(item)+'</button>').join('')+'</div>';
  };

  const nextMessageId=()=> 'assistant-msg-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);

  const serializeAnswerForHistory=(answer)=>{
    if(!answer)return '';
    const sections=Array.isArray(answer.sections)
      ? answer.sections.map((section)=>{
        const parts=[section.title||''];
        if(section.text)parts.push(section.text);
        if(Array.isArray(section.bullets)&&section.bullets.length)parts.push(section.bullets.join(' | '));
        return parts.filter(Boolean).join(': ');
      }).filter(Boolean).join('\\n')
      : '';
    return [
      answer.headline||'',
      answer.contextLine||'',
      sections
    ].filter(Boolean).join('\\n');
  };

  const getHistoryPayload=()=>{
    return assistantState.messages.map((message)=>{
      if(!message||!message.includeInHistory)return null;
      if(message.role==='user'){
        const text=String(message.text||'').trim();
        return text?{role:'user',content:text}:null;
      }
      if(message.role==='assistant'&&message.answer){
        const content=serializeAnswerForHistory(message.answer);
        return content?{role:'assistant',content}:null;
      }
      return null;
    }).filter(Boolean).slice(-8);
  };

  const renderMessageBody=(message)=>{
    if(message.role==='user'){
      return '<div class="assistant-msg-copy">'+escapeHtml(message.text||'')+'</div>';
    }
    if(message.variant==='intro'){
      return renderIntroMessage(message.summary||null);
    }
    if(message.variant==='answer'){
      return renderAnswer(message.answer||null);
    }
    const title=message.title||'Actualizando lectura';
    const copy=message.text||'Estoy cruzando tu contexto actual con el modelo para devolverte una lectura útil y específica.';
    const thinking=message.loading
      ? '<div class="assistant-thinking" aria-hidden="true"><span></span><span></span><span></span></div>'
      : '';
    return '<div class="assistant-msg-title">'+escapeHtml(title)+'</div><div class="assistant-msg-copy">'+escapeHtml(copy)+'</div>'+thinking;
  };

  const renderMessage=(message)=>{
    return '<article class="assistant-msg '+message.role+(message.loading?' is-loading':'')+'">'+
      '<div class="assistant-msg-top">'+
        '<strong>'+(message.role==='assistant'?'Aterum IA':'Tú')+'</strong>'+
        '<span class="assistant-msg-time">'+formatStamp(message.createdAt)+'</span>'+
      '</div>'+
      renderMessageBody(message)+
    '</article>';
  };

  const renderMessages=()=>{
    if(!assistantLog)return;
    if(!assistantState.messages.length){
      renderEmptyState(assistantState.emptyCopy);
      return;
    }
    assistantLog.innerHTML=assistantState.messages.map(renderMessage).join('');
    requestAnimationFrame(()=>{
      if(assistantLog)assistantLog.scrollTop=assistantLog.scrollHeight;
    });
  };

  const setMessages=(updater)=>{
    const next=typeof updater==='function'?updater(assistantState.messages.slice()):(Array.isArray(updater)?updater.slice():[]);
    assistantState.messages=next;
    renderMessages();
  };

  const pushMessage=(message)=>{
    const payload=Object.assign({
      id:nextMessageId(),
      role:'assistant',
      createdAt:new Date().toISOString(),
      includeInHistory:false
    },message||{});
    setMessages((messages)=>messages.concat(payload));
    return payload.id;
  };

  const removeMessage=(id)=>{
    if(!id)return;
    setMessages((messages)=>messages.filter((message)=>message.id!==id));
  };

  const hasConversationHistory=()=>{
    return assistantState.messages.some((message)=>message&&message.includeInHistory);
  };

  const renderIntroMessage=(summary)=>{
    if(!summary){
      return '<div class="assistant-msg-title">Asistente listo</div><div class="assistant-msg-copy">Puedo leer el contexto de la página, tus posiciones, noticias, sesiones y señales antes de responder.</div>';
    }
    const introSections=[
      {
        title:'Estado del mercado',
        tone:summary.posture&&summary.posture.bias,
        text:(summary.posture&&summary.posture.summary)||'El contexto de mercado se está actualizando.'
      },
      {
        title:'Riesgo actual',
        tone:(summary.signal&&summary.signal.risk)||'warn',
        text:(summary.alerts&&summary.alerts[0]&&summary.alerts[0].detail)||'Sin alerta dominante por encima del flujo actual.'
      },
      {
        title:'Recomendación',
        tone:(summary.signal&&summary.signal.action)||'warn',
        text:summary.signal
          ? 'Señal '+(summary.signal.action||'NO OPERAR')+' con confianza '+(summary.signal.confidence||'baja')+'. '+(summary.signal.explanation||'')
          : 'Todavía no hay una recomendación disponible.'
      }
    ];
    return '<div class="assistant-msg-title">Lectura inmediata</div>'+
      '<div class="assistant-msg-copy">'+escapeHtml(summary.pageContext||assistantConfig.subtitle)+'</div>'+
      renderStructuredSections(introSections);
  };

  const renderAnswer=(answer)=>{
    if(!answer){
      return '<div class="assistant-msg-copy">No hay una respuesta disponible en este momento.</div>';
    }
    const headerChips=[
      addChip((answer.stance||'neutral')+' · '+(answer.confidence||'baja'),answer.stance),
      addChip((answer.signal||'NO OPERAR')+' · riesgo '+(answer.risk||'alto'),answer.signal)
    ].join('');
    return (headerChips?'<div class="assistant-panel-chips">'+headerChips+'</div>':'')+
      '<div class="assistant-msg-title">'+escapeHtml(answer.headline||'Lectura actual')+'</div>'+
      (answer.contextLine?'<div class="assistant-msg-copy">'+escapeHtml(answer.contextLine)+'</div>':'')+
      renderStructuredSections(answer.sections||[])+
      renderSuggestions(answer.followUps||[]);
  };

  const renderStarterButtons=(items)=>{
    if(!assistantStarterRow)return;
    if(!items||!items.length){
      assistantStarterRow.innerHTML='';
      return;
    }
    assistantStarterRow.innerHTML=items.slice(0,4).map((item)=>
      '<button type="button" class="assistant-starter" data-question="'+escapeHtml(item)+'">'+escapeHtml(item)+'</button>'
    ).join('');
  };

  const syncHeader=(summary)=>{
    if(assistantPanelKicker)assistantPanelKicker.textContent=assistantConfig.kicker||'Asistente IA';
    if(!assistantPanelSub)return;
    assistantPanelSub.textContent=summary&&summary.pageContext
      ? summary.pageContext
      : (assistantConfig.subtitle||'Analiza noticias, sesiones, señales y tu contexto operativo en tiempo real.');
  };

  const renderContextChips=()=>{
    if(!assistantContextChips)return;
    const ctx=buildRequestContext();
    const summary=assistantState.summary||{};
    const activeSession=(summary.sessions||[]).find((session)=>session.status==='abierta')||(summary.sessions||[]).find((session)=>session.status==='próxima')||null;
    assistantContextChips.innerHTML=[
      addChip(getPageLabel(assistantConfig.page),'info'),
      addChip(getContextSymbol(ctx)||summary.symbol,'info'),
      addChip(summary.signal&&summary.signal.action?summary.signal.action:null,summary.signal&&summary.signal.action),
      addChip(activeSession?activeSession.label+' · '+activeSession.status:null,'warn'),
      addChip(summary.posture&&summary.posture.bias?summary.posture.bias:null,summary.posture&&summary.posture.bias)
    ].filter(Boolean).join('');
  };

  const seedAssistant=(summary)=>{
    const seedKey=[
      assistantConfig.page,
      summary&&summary.symbol,
      summary&&summary.generatedAt
    ].join(':');
    if(assistantState.seedKey===seedKey&&assistantState.messages.length)return;
    assistantState.seedKey=seedKey;
    setMessages([{
      id:nextMessageId(),
      role:'assistant',
      variant:'intro',
      summary:summary||null,
      createdAt:new Date().toISOString(),
      includeInHistory:false
    }]);
  };

  const setAssistantLoading=(loading,label)=>{
    assistantState.loading=loading;
    if(assistantSend){
      assistantSend.disabled=loading;
      assistantSend.textContent=loading?(label||'Pensando...'):'Consultar';
    }
    if(assistantPanel)assistantPanel.setAttribute('aria-busy',loading?'true':'false');
    if(assistantLog)assistantLog.setAttribute('aria-busy',loading?'true':'false');
  };

  const openAssistant=()=>{
    assistantState.open=true;
    body.classList.add('assistant-open');
    if(assistantFab)assistantFab.setAttribute('aria-expanded','true');
    if(assistantPanel)assistantPanel.setAttribute('aria-hidden','false');
    if(assistantBackdrop)assistantBackdrop.setAttribute('aria-hidden','false');
    renderContextChips();
    if(assistantInput)setTimeout(()=>assistantInput.focus(),60);
    if(!assistantState.summary)loadSummary({force:true});
    else if(!assistantState.messages.length)seedAssistant(assistantState.summary);
  };

  const closeAssistant=()=>{
    assistantState.open=false;
    body.classList.remove('assistant-open');
    if(assistantFab)assistantFab.setAttribute('aria-expanded','false');
    if(assistantPanel)assistantPanel.setAttribute('aria-hidden','true');
    if(assistantBackdrop)assistantBackdrop.setAttribute('aria-hidden','true');
  };

  const loadSummary=async(options)=>{
    const opts=options||{};
    const ctx=buildRequestContext();
    const symbol=getContextSymbol(ctx);
    const contextKey=[assistantConfig.page,symbol,JSON.stringify(ctx.posicion||ctx.position||null)].join('|');
    if(!opts.force&&assistantState.summary&&assistantState.latestContextKey===contextKey){
      renderContextChips();
      if(assistantState.open&&!assistantState.messages.length)seedAssistant(assistantState.summary);
      return assistantState.summary;
    }
    assistantState.latestContextKey=contextKey;
    syncHeader(assistantState.summary);
    if(!assistantState.open&&opts.silent)return assistantState.summary;
    try{
      if(opts.showLoader!==false)setAssistantLoading(true,'Leyendo...');
      const url='/api/intelligence/summary?page='+encodeURIComponent(assistantConfig.page)+(symbol?'&symbol='+encodeURIComponent(symbol):'');
      const response=await fetch(url);
      const payload=await response.json();
      if(!response.ok)throw new Error(payload&&payload.error?payload.error:'No pude cargar el contexto del asistente');
      assistantState.summary=payload;
      syncHeader(payload);
      renderContextChips();
      renderStarterButtons(payload.assistantStarters||[]);
      if(assistantState.open&&(!assistantState.messages.length||opts.forceSeed))seedAssistant(payload);
      return payload;
    }catch(error){
      if(assistantState.open&&(!assistantState.messages.length||opts.forceSeed)){
        renderEmptyState(error&&error.message?error.message:'No pude sincronizar el contexto del asistente.');
      }
      return assistantState.summary;
    }finally{
      setAssistantLoading(false);
    }
  };

  const askQuestion=async(question,options)=>{
    const text=String(question||'').trim();
    const opts=options||{};
    if(!text||assistantState.loading)return;
    openAssistant();
    if(!assistantState.summary)await loadSummary({force:true,showLoader:false});
    const history=getHistoryPayload();
    if(!opts.skipUser){
      pushMessage({
        role:'user',
        text,
        createdAt:new Date().toISOString(),
        includeInHistory:true
      });
    }
    const loadingId=pushMessage({
      role:'assistant',
      variant:'status',
      title:'Analizando contexto',
      text:'Estoy cruzando tu contexto operativo, el historial del chat y la señal actual para responder con lectura útil.',
      loading:true,
      createdAt:new Date().toISOString(),
      includeInHistory:false
    });
    try{
      setAssistantLoading(true,'Analizando...');
      const ctx=buildRequestContext();
      const response=await fetch('/api/intelligence/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          question:text,
          page:assistantConfig.page,
          symbol:getContextSymbol(ctx),
          context:ctx,
          history
        })
      });
      const payload=await response.json();
      if(!response.ok)throw new Error(payload&&payload.error?payload.error:'No pude generar una respuesta contextual');
      removeMessage(loadingId);
      if(payload.summary){
        assistantState.summary=payload.summary;
        syncHeader(payload.summary);
        renderContextChips();
        renderStarterButtons(payload.summary.assistantStarters||[]);
      }
      pushMessage({
        role:'assistant',
        variant:'answer',
        answer:payload.answer||null,
        createdAt:new Date().toISOString(),
        includeInHistory:true
      });
      return payload;
    }catch(error){
      removeMessage(loadingId);
      pushMessage({
        role:'assistant',
        variant:'error',
        title:'No pude responder',
        text:error&&error.message?error.message:'Intenta de nuevo en un momento.',
        createdAt:new Date().toISOString(),
        includeInHistory:false
      });
      return null;
    }finally{
      removeMessage(loadingId);
      setAssistantLoading(false);
    }
  };

  const hideLoader=()=>{
    body.classList.add('page-ready');
    if(loader){
      requestAnimationFrame(()=>loader.classList.add('is-hidden'));
      setTimeout(()=>loader.remove(),440);
    }
  };

  if(document.readyState==='complete') hideLoader();
  else window.addEventListener('load',()=>setTimeout(hideLoader,220),{once:true});
  requestAnimationFrame(()=>body.classList.add('page-ready'));

  const handleNav=()=>{
    ticking=false;
    if(!nav||window.innerWidth>840)return;
    const y=window.scrollY||0;
    const delta=y-lastY;
    if(y<24||delta<-8){
      if(navHidden){nav.classList.remove('nav-hidden');navHidden=false;}
    }else if(delta>8){
      if(!navHidden){nav.classList.add('nav-hidden');navHidden=true;}
    }
    lastY=y;
  };

  window.addEventListener('scroll',()=>{
    if(window.innerWidth>840||ticking)return;
    ticking=true;
    requestAnimationFrame(handleNav);
  },{passive:true});

  window.addEventListener('resize',()=>{
    if(window.innerWidth>840&&navHidden&&nav){
      nav.classList.remove('nav-hidden');
      navHidden=false;
    }
  });

  const createRipple=(target,clientX,clientY)=>{
    if(!target||reduceMotion)return;
    const rect=target.getBoundingClientRect();
    const ripple=document.createElement('span');
    ripple.className='ui-ripple-ink';
    ripple.style.left=(clientX-rect.left)+'px';
    ripple.style.top=(clientY-rect.top)+'px';
    target.appendChild(ripple);
    setTimeout(()=>ripple.remove(),720);
  };

  document.addEventListener('pointerdown',(e)=>{
    const target=e.target.closest(interactiveSelector);
    if(!target)return;
    target.classList.add('is-pressing');
    createRipple(target,e.clientX,e.clientY);
    setTimeout(()=>target.classList.remove('is-pressing'),170);
  },{passive:true});

  const shouldIntercept=(link)=>{
    if(!link)return false;
    if(link.target&&link.target!=='_self')return false;
    if(link.hasAttribute('download'))return false;
    if(link.dataset.noTransition==='true')return false;
    const href=link.getAttribute('href')||'';
    if(!href||href.startsWith('#')||href.startsWith('javascript:'))return false;
    if(href.includes('/logout'))return false;
    try{
      const url=new URL(link.href,window.location.href);
      return url.origin===window.location.origin;
    }catch(e){return false;}
  };

  document.addEventListener('click',(e)=>{
    const link=e.target.closest('a');
    if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    if(!shouldIntercept(link))return;
    if(link.href===window.location.href)return;
    e.preventDefault();
    body.classList.add('page-leaving');
    if(transition)transition.setAttribute('aria-hidden','false');
    setTimeout(()=>{ window.location.href=link.href; },320);
  });

  const submitAssistantInput=async()=>{
    const question=assistantInput?assistantInput.value.trim():'';
    if(!question||assistantState.loading)return;
    if(assistantInput)assistantInput.value='';
    await askQuestion(question);
  };

  if(assistantInput)assistantInput.placeholder=assistantConfig.placeholder||assistantInput.placeholder;
  syncHeader(null);
  renderContextChips();
  renderEmptyState('Abre una consulta y te responderé con lectura contextual del mercado, tu riesgo y la señal actual.');

  if(assistantFab)assistantFab.addEventListener('click',()=>{
    if(assistantState.open)closeAssistant();
    else openAssistant();
  });
  if(assistantClose)assistantClose.addEventListener('click',closeAssistant);
  if(assistantBackdrop)assistantBackdrop.addEventListener('click',closeAssistant);
  if(assistantForm)assistantForm.addEventListener('submit',async(event)=>{
    event.preventDefault();
    await submitAssistantInput();
  });
  if(assistantInput)assistantInput.addEventListener('keydown',(event)=>{
    if(event.key==='Enter'&&!event.shiftKey){
      event.preventDefault();
      submitAssistantInput();
    }
  });
  document.addEventListener('click',(event)=>{
    const actionButton=event.target.closest('.assistant-starter,.assistant-suggestion');
    if(!actionButton)return;
    const question=actionButton.getAttribute('data-question')||'';
    if(!question)return;
    askQuestion(question,{skipUser:false});
  });
  document.addEventListener('keydown',(event)=>{
    if(event.key==='Escape'&&assistantState.open){
      event.preventDefault();
      closeAssistant();
    }
  });

  window.AterumAssistant={
    open:openAssistant,
    close:closeAssistant,
    ask:(question)=>askQuestion(question),
    setSummary:(summary)=>{
      assistantState.summary=summary||null;
      assistantState.seedKey='';
      syncHeader(summary||null);
      renderContextChips();
      renderStarterButtons(summary&&summary.assistantStarters?summary.assistantStarters:[]);
      if(assistantState.open&&!hasConversationHistory())seedAssistant(summary||null);
    },
    notifyContextChanged:(options)=>{
      const opts=options||{};
      assistantState.latestContextKey='';
      renderContextChips();
      if(opts.clearHistory){
        assistantState.seedKey='';
        setMessages([{
          id:nextMessageId(),
          role:'assistant',
          variant:'status',
          title:'Contexto actualizado',
          text:'El contexto cambió. Haz una nueva consulta y adaptaré el análisis a la vista, símbolo y riesgo actuales.',
          createdAt:new Date().toISOString(),
          includeInHistory:false
        }]);
      }
      if(opts.refetchSummary&&assistantState.open){
        loadSummary({force:true,forceSeed:!hasConversationHistory()});
      }
    },
    refreshSummary:()=>loadSummary({force:true}),
    getSummary:()=>assistantState.summary,
    getMessages:()=>assistantState.messages.slice()
  };

  loadSummary({silent:true,showLoader:false});
})();
`;
}

function getSharedNav(current, user, accent = 'blue', extraRight = '') {
  return `<div class="nav">
  <div class="nav-logo"><div class="nav-dot"></div>αтεгυм</div>
  <div class="nav-links">
    <a href="/dashboard" class="nav-link${current==='dashboard'?' active':''}">Trading</a>
    <a href="/analytics" class="nav-link${current==='analytics'?' active':''}">Análisis</a>
    <a href="/simulator" class="nav-link${current==='simulator'?' active':''}">Simulador</a>
    <a href="/ai-data#inteligencia" class="nav-link${current==='aidata'?' active':''}">Inteligencia</a>
    <a href="/ai-data#asistente-ia" class="nav-link${current==='aidata'?' active':''}">Asistente IA</a>
    <a href="/crypto-play" class="nav-link${current==='play'?' active':''}">Crypto Play</a>
    <div style="flex:1"></div>
    ${extraRight}
    <span class="nav-user nav-user-${accent}">${user?.username || ''}</span>
    <a href="/logout" class="nav-link nav-link-ghost" data-no-transition="true">Salir</a>
  </div>
</div>`;
}

module.exports = {
  getSharedHeadAssets,
  getLoadingMarkup,
  getSharedChrome,
  getSharedStyles,
  getSharedScript,
  getSharedNav
};
