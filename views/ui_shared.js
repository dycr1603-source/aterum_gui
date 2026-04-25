'use strict';

function getSharedHeadAssets() {
  return `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script>
(function(){
  try{
    var stored=localStorage.getItem('aterum-theme');
    var theme=(stored==='dark'||stored==='light')?stored:'dark';
    document.documentElement.setAttribute('data-theme',theme);
  }catch(error){
    document.documentElement.setAttribute('data-theme','dark');
  }
})();
</script>
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
  <div class="app-scanlines"></div>
  <div class="app-vignette"></div>
  <div class="app-pixel-lane"><span></span><span></span><span></span><span></span><span></span></div>
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
:root{
  --space-1:8px;
  --space-2:16px;
  --space-3:24px;
  --space-4:32px;
  --radius-sm:8px;
  --radius-md:12px;
  --radius-lg:16px;
  --motion-fast:200ms;
  --motion-base:260ms;
  --ease-standard:cubic-bezier(.22,1,.36,1);
}
:root,
[data-theme='dark']{
  --color-bg:#0b0b0c;
  --color-bg-elev:#111113;
  --color-surface:#1c1c1e;
  --color-surface-2:#202024;
  --color-text:#ffffff;
  --color-text-muted:#a1a1aa;
  --color-border:#2a2a2e;
  --color-border-strong:#35353b;
  --color-primary:#3b82f6;
  --color-primary-soft:rgba(59,130,246,.2);
  --color-success:#22c55e;
  --color-danger:#ef4444;
  --color-warning:#f59e0b;
  --shadow-sm:0 4px 12px rgba(0,0,0,.32);
  --shadow-md:0 12px 26px rgba(0,0,0,.4);
  --shadow-lg:0 24px 48px rgba(0,0,0,.52);
  --overlay:rgba(0,0,0,.62);
  --ui-bg:var(--color-bg);
  --ui-bg-soft:var(--color-bg-elev);
  --ui-bg-raised:var(--color-surface);
  --ui-bg-panel:var(--color-surface);
  --ui-text:var(--color-text);
  --ui-muted:var(--color-text-muted);
  --ui-faint:#868692;
  --ui-line:var(--color-border);
  --ui-line-strong:var(--color-border-strong);
  --ui-accent:var(--color-primary);
  --ui-green:var(--color-success);
  --ui-red:var(--color-danger);
}
[data-theme='light']{
  --color-bg:#f5f5f7;
  --color-bg-elev:#f8f9fb;
  --color-surface:#ffffff;
  --color-surface-2:#f3f4f7;
  --color-text:#1d1d1f;
  --color-text-muted:#6e6e73;
  --color-border:#e5e5ea;
  --color-border-strong:#d6d7df;
  --color-primary:#007aff;
  --color-primary-soft:rgba(0,122,255,.12);
  --color-success:#1f9e74;
  --color-danger:#d94f63;
  --color-warning:#cf9440;
  --shadow-sm:0 2px 8px rgba(15,23,42,.06);
  --shadow-md:0 8px 24px rgba(15,23,42,.08);
  --shadow-lg:0 16px 38px rgba(15,23,42,.1);
  --overlay:rgba(15,23,42,.26);
  --ui-bg:var(--color-bg);
  --ui-bg-soft:var(--color-bg-elev);
  --ui-bg-raised:var(--color-surface);
  --ui-bg-panel:var(--color-surface);
  --ui-text:var(--color-text);
  --ui-muted:var(--color-text-muted);
  --ui-faint:#8d9098;
  --ui-line:var(--color-border);
  --ui-line-strong:var(--color-border-strong);
  --ui-accent:var(--color-primary);
  --ui-green:var(--color-success);
  --ui-red:var(--color-danger);
}
*,
*::before,
*::after{box-sizing:border-box}
html{
  background:var(--color-bg) !important;
  color-scheme:dark;
  max-width:100%;
  overflow-x:hidden;
}
html[data-theme='light']{color-scheme:light}
html[data-theme='dark']{color-scheme:dark}
body{
  margin:0;
  background:var(--color-bg) !important;
  color:var(--color-text) !important;
  font-family:'Inter','SF Pro Text','Segoe UI',sans-serif;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  max-width:100%;
  overflow-x:hidden;
}
body::before,
body::after{
  display:none !important;
}
img,svg,canvas,video{
  max-width:100%;
}
.page-shell{
  position:relative;
  z-index:1;
  min-height:100vh;
  min-height:100dvh;
  opacity:0;
  transform:translateY(8px);
  transition:opacity var(--motion-base) var(--ease-standard),transform var(--motion-base) var(--ease-standard);
}
body.page-ready .page-shell{
  opacity:1;
  transform:none;
}
body.page-leaving .page-shell{
  opacity:.1;
  transform:translateY(12px);
}
/* ---------- layout containers ---------- */
body.has-shared-nav{
  --bg:var(--color-bg);
  --bg2:var(--color-surface);
  --bg3:var(--color-bg-elev);
  --bg4:var(--color-surface-2);
  --bg5:var(--color-surface-2);
  --panel:var(--color-surface);
  --panel2:var(--color-bg-elev);
  --line:var(--color-border);
  --line2:var(--color-border-strong);
  --border:var(--color-border);
  --border2:var(--color-border-strong);
  --border3:var(--color-border-strong);
  --text:var(--color-text);
  --text2:var(--color-text-muted);
  --muted:var(--color-text-muted);
  --green:var(--color-success);
  --green2:var(--color-success);
  --green3:color-mix(in srgb,var(--color-success) 20%,transparent);
  --red:var(--color-danger);
  --red2:var(--color-danger);
  --red3:color-mix(in srgb,var(--color-danger) 20%,transparent);
  --blue:var(--color-primary);
  --blue2:var(--color-primary);
  --blue3:var(--color-primary-soft);
  --gold:var(--color-warning);
  --gold2:rgba(207,148,64,.12);
  --purple:var(--color-primary);
  --purple2:var(--color-primary-soft);
  --orange:var(--color-warning);
}
body.has-shared-nav .page,
body.has-shared-nav .container,
body.has-shared-nav .content{
  width:min(1600px,100%);
  margin-inline:auto;
  padding-inline:clamp(14px,2vw,28px);
}
.app-chrome,
.app-grid,
.app-grid-secondary,
.app-scanlines,
.app-vignette,
.app-pixel-lane,
.app-particles{
  display:none !important;
}
/* ---------- navbar ---------- */
.nav-shell{
  position:sticky !important;
  top:10px;
  z-index:420;
  margin:10px clamp(10px,2vw,24px) 0;
  min-height:64px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:10px 12px;
  border:1px solid var(--color-border);
  border-radius:var(--radius-md);
  background:color-mix(in srgb,var(--color-surface) 82%,transparent);
  backdrop-filter:blur(14px);
  box-shadow:var(--shadow-sm);
}
.nav-main{
  min-width:0;
  flex:1;
  display:flex;
  align-items:center;
  gap:10px;
}
.nav-logo{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-height:40px;
  padding:0 12px;
  border-radius:var(--radius-sm);
  border:1px solid var(--color-border);
  text-decoration:none;
  color:var(--color-text);
  background:var(--color-surface);
  font:800 12px/1 'Inter Tight','Inter',sans-serif;
  letter-spacing:.08em;
}
.nav-dot{
  width:7px;
  height:7px;
  border-radius:999px;
  background:var(--color-success);
}
.nav-links-desktop{
  display:flex;
  align-items:center;
  gap:6px;
}
.nav-link{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:38px;
  padding:0 12px;
  border-radius:var(--radius-sm);
  border:1px solid transparent;
  color:var(--color-text-muted);
  text-decoration:none;
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
  transition:all var(--motion-fast) var(--ease-standard);
}
.nav-link:hover{
  border-color:var(--color-border);
  background:var(--color-surface-2);
  color:var(--color-text);
}
.nav-link.active{
  border-color:color-mix(in srgb,var(--color-primary) 38%,var(--color-border) 62%);
  background:var(--color-primary-soft);
  color:var(--color-text);
}
.nav-utility{
  display:flex;
  align-items:center;
  gap:8px;
}
.nav-extra,
.nav-market{
  display:inline-flex;
  align-items:center;
  gap:8px;
}
.nav-market{
  min-height:38px;
  padding:0 10px;
  border:1px solid var(--color-border);
  border-radius:var(--radius-sm);
  background:var(--color-surface);
}
.nav-user{
  min-height:38px;
  display:inline-flex;
  align-items:center;
  padding:0 12px;
  border-radius:var(--radius-sm);
  border:1px solid var(--color-border);
  background:var(--color-surface);
  color:var(--color-text-muted);
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.theme-toggle{
  min-height:38px;
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:0 12px;
  border-radius:var(--radius-sm);
  border:1px solid var(--color-border);
  background:var(--color-surface);
  color:var(--color-text-muted);
  cursor:pointer;
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
  transition:all var(--motion-fast) var(--ease-standard);
}
.theme-toggle:hover{
  background:var(--color-surface-2);
  color:var(--color-text);
}
.theme-toggle-icon{
  width:18px;
  height:18px;
  border-radius:999px;
  display:grid;
  place-items:center;
  border:1px solid var(--color-border);
  background:var(--color-surface-2);
}
.theme-toggle-drawer{
  width:100%;
  justify-content:center;
}
.nav-link-ghost{
  color:var(--color-text-muted) !important;
}
.nav-link-ghost:hover{
  color:var(--color-danger) !important;
  border-color:color-mix(in srgb,var(--color-danger) 34%,var(--color-border) 66%) !important;
  background:rgba(217,79,99,.08) !important;
}
.nav-toggle{
  width:40px;
  height:40px;
  border-radius:var(--radius-sm);
  border:1px solid var(--color-border);
  background:var(--color-surface);
  color:var(--color-text-muted);
  display:none;
  align-items:center;
  justify-content:center;
  cursor:pointer;
}
.nav-drawer-backdrop{
  position:fixed;
  inset:0;
  z-index:430;
  background:var(--overlay);
  opacity:0;
  visibility:hidden;
  transition:opacity var(--motion-base) var(--ease-standard),visibility var(--motion-base) var(--ease-standard);
}
.nav-drawer{
  position:fixed;
  inset:0 0 0 auto;
  z-index:435;
  width:min(88vw,360px);
  display:flex;
  flex-direction:column;
  gap:14px;
  padding:16px;
  border-left:1px solid var(--color-border);
  background:var(--color-surface);
  box-shadow:var(--shadow-lg);
  transform:translateX(104%);
  transition:transform var(--motion-base) var(--ease-standard);
}
.nav-drawer-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.nav-drawer-title{
  display:inline-flex;
  align-items:center;
  gap:8px;
  color:var(--color-text);
  font:800 13px/1 'Inter Tight','Inter',sans-serif;
}
.nav-drawer-close{
  width:34px;
  height:34px;
  border-radius:var(--radius-sm);
  border:1px solid var(--color-border);
  background:var(--color-surface-2);
  color:var(--color-text-muted);
  cursor:pointer;
  font:500 20px/1 'Inter',sans-serif;
}
.nav-drawer-links{
  display:grid;
  gap:8px;
}
.nav-drawer-link{
  min-height:42px;
  display:flex;
  align-items:center;
  padding:0 12px;
  border-radius:var(--radius-sm);
  border:1px solid var(--color-border);
  background:var(--color-surface-2);
  text-decoration:none;
  color:var(--color-text);
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nav-drawer-link.active{
  border-color:color-mix(in srgb,var(--color-primary) 38%,var(--color-border) 62%);
  background:var(--color-primary-soft);
}
.nav-drawer-foot{
  margin-top:auto;
  display:grid;
  gap:8px;
}
.nav-drawer-user{
  min-height:40px;
  display:flex;
  align-items:center;
  padding:0 12px;
  border:1px solid var(--color-border);
  border-radius:var(--radius-sm);
  color:var(--color-text-muted);
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.nav-drawer-logout{
  min-height:40px;
  display:flex;
  align-items:center;
  justify-content:center;
  border-radius:var(--radius-sm);
  text-decoration:none;
  border:1px solid color-mix(in srgb,var(--color-danger) 34%,var(--color-border) 66%);
  background:rgba(217,79,99,.1);
  color:var(--color-danger);
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
}
body.nav-drawer-open{
  overflow:hidden;
}
body.nav-drawer-open .nav-drawer-backdrop{
  opacity:1;
  visibility:visible;
}
body.nav-drawer-open .nav-drawer{
  transform:translateX(0);
}
/* ---------- component system ---------- */
.card,.kpi,.panel,.stat,.side-card,.terminal-card,.metric-card,.market-card,.tbl-card,.chart-card,.acct-panel,.acct-stat,.sim-loading-card{
  background:var(--color-surface) !important;
  border:1px solid var(--color-border) !important;
  border-radius:var(--radius-md) !important;
  box-shadow:var(--shadow-md) !important;
  color:var(--color-text) !important;
  min-width:0;
  max-width:100%;
  overflow:hidden;
}
.layout,.page,.container,.content,#chart-wrap,.chart-shell,.terminal-kpis,.market-grid,.workspace-grid,.stats-grid,.book-grid,.acct-grid,.kpi-grid,.cards2,.cards3,.cards-equal,.charts,.charts-row,.perf-grid,.intel-grid,.posture-row,.split,.form-grid,.glossary,.table-wrap,.tbl-wrap,.wl,.sb{
  min-width:0 !important;
  max-width:100% !important;
}
.card *, .kpi *, .panel *, .stat *, .terminal-card *, .market-card *, .metric-card *, .acct-panel *, .acct-stat *, .tbl-card *, .chart-card *, .side-card *{
  min-width:0;
  max-width:100%;
}
.card p,.kpi p,.panel p,.stat p,.terminal-card p,.market-card p,.metric-card p,.acct-panel p,.acct-stat p,.tbl-card p,.chart-card p,.side-card p,.card-title,.card-badge,.section-title,.section-label,.metric-label,.market-label,.stat-lbl,.filter-label,.f-lbl,td,th,.reason,.sub,.page-sub,.hint,.empty,.loading{
  overflow-wrap:anywhere;
  word-wrap:break-word;
  word-break:break-word;
}
.card-hdr,.card-h,.tbl-hdr,.chart-hdr,.perf-hdr,.wl-hdr,.terminal-card-hdr{
  background:var(--color-bg-elev) !important;
  border-color:var(--color-border) !important;
}
.btn,.filter-btn,.f-btn,.hero-btn,.exec-btn,.exec-mode-btn,.game-btn,.cashout-btn,.tile-btn,.mine-tile,.chart-fs-btn,.ind-btn,.select,.input,.filter-select,.ask-input,.intel-select{
  border-radius:var(--radius-sm) !important;
  border:1px solid var(--color-border) !important;
  background:var(--color-surface) !important;
  color:var(--color-text) !important;
  transition:all var(--motion-fast) var(--ease-standard);
}
.btn:hover,.filter-btn:hover,.f-btn:hover,.hero-btn:hover,.exec-btn:hover,.exec-mode-btn:hover,.game-btn:hover,.cashout-btn:hover,.tile-btn:hover,.mine-tile:hover,.chart-fs-btn:hover,.ind-btn:hover,.select:hover,.input:hover,.filter-select:hover,.ask-input:hover,.intel-select:hover{
  transform:translateY(-1px);
  border-color:var(--color-border-strong) !important;
  box-shadow:var(--shadow-sm);
}
.btn:focus-visible,.filter-btn:focus-visible,.f-btn:focus-visible,.hero-btn:focus-visible,.exec-btn:focus-visible,.exec-mode-btn:focus-visible,.game-btn:focus-visible,.cashout-btn:focus-visible,.tile-btn:focus-visible,.mine-tile:focus-visible,.chart-fs-btn:focus-visible,.ind-btn:focus-visible,.select:focus-visible,.input:focus-visible,.filter-select:focus-visible,.ask-input:focus-visible,.intel-select:focus-visible{
  outline:none;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--color-primary) 22%,transparent);
}
.btn-primary,.hero-btn.primary,.assistant-send{
  background:var(--color-primary-soft) !important;
  border-color:color-mix(in srgb,var(--color-primary) 40%,var(--color-border) 60%) !important;
}
.badge,.chip,.stage-pill,.exec-pill,.exec-side{
  border-radius:999px !important;
  border:1px solid var(--color-border) !important;
  background:var(--color-bg-elev) !important;
}
.b-long,.b-open,.b-confirms,.pp,.rp,.up{color:var(--color-success) !important;}
.b-short,.b-reject,.b-contradicts,.pn,.rn,.down{color:var(--color-danger) !important;}
.b-neutral{color:var(--color-primary) !important;background:var(--color-primary-soft) !important;}
.page-title,.title,.hero-title,.chart-title,.metric-value,.market-value,.workspace-balance,.stat-val,.kpi-val,.kpi-value,.intel-headline{
  color:var(--color-text) !important;
}
.page-sub,.sub,.hint,.loading,.empty,.card-title,.card-badge,.tbl-title,.tbl-badge,.kpi-lbl,.kpi-sub,.section-title,.section-label,.metric-label,.market-label,.stat-lbl,.filter-label,.f-lbl{
  color:var(--color-text-muted) !important;
}
table{
  border-collapse:collapse;
}
th{
  background:var(--color-bg-elev) !important;
  color:var(--color-text-muted) !important;
  border-bottom:1px solid var(--color-border) !important;
}
td{
  color:var(--color-text) !important;
  border-bottom:1px solid var(--color-border) !important;
}
tr:hover td{
  background:color-mix(in srgb,var(--color-primary) 4%,var(--color-surface) 96%) !important;
}
.table-wrap,.tbl-wrap{overflow:auto}
.table-wrap table,.tbl-wrap table,.real-table table,.mini-table table{
  min-width:0 !important;
  width:100% !important;
  table-layout:fixed;
}
/* ---------- page systems ---------- */
body.dashboard-v3,
body.analytics-v3,
body.aidata-v3,
body.simulator-v3,
body.play-v3{
  background:var(--color-bg) !important;
  color:var(--color-text) !important;
}
body.dashboard-v3::before,
body.dashboard-v3::after,
body.analytics-v3::before,
body.analytics-v3::after,
body.aidata-v3::before,
body.aidata-v3::after,
body.simulator-v3::before,
body.simulator-v3::after,
body.play-v3::before,
body.play-v3::after{
  display:none !important;
}
body.dashboard-v3 .page-shell,
body.analytics-v3 .page-shell,
body.aidata-v3 .page-shell,
body.simulator-v3 .page-shell,
body.play-v3 .page-shell{
  min-height:100vh;
  min-height:100dvh;
  padding:12px clamp(12px,2vw,24px) 28px;
}
body.dashboard-v3 .page-shell{
  padding-bottom:90px;
}
body.analytics-v3 .page,
body.aidata-v3 .page,
body.simulator-v3 .page,
body.play-v3 .page{
  width:min(1500px,100%);
  margin:0 auto;
  padding:0 !important;
}
body.analytics-v3 .page-hdr,
body.aidata-v3 .page-hdr,
body.simulator-v3 .hero,
body.play-v3 .hero{
  margin:0 0 18px !important;
}
body.analytics-v3 .page-hdr,
body.aidata-v3 .page-hdr{
  padding:0 !important;
  background:transparent !important;
  border:none !important;
  border-radius:0 !important;
  box-shadow:none !important;
}
body.analytics-v3 .page-title,
body.aidata-v3 .page-title,
body.simulator-v3 .title,
body.play-v3 .hero-title{
  color:var(--color-text) !important;
  letter-spacing:0 !important;
}
body.analytics-v3 .page-title span,
body.aidata-v3 .page-title span,
body.play-v3 .hero-title span{
  color:var(--color-primary) !important;
}
body.analytics-v3 .page-sub,
body.aidata-v3 .page-sub,
body.simulator-v3 .sub,
body.play-v3 .hero-sub,
body.analytics-v3 .section-note,
body.aidata-v3 .intel-copy{
  color:var(--color-text-muted) !important;
}
body.analytics-v3 .acct-panel,
body.analytics-v3 .card,
body.analytics-v3 .kpi,
body.analytics-v3 .acct-stat,
body.analytics-v3 .filters-row,
body.analytics-v3 .cooldown-body,
body.aidata-v3 .intel-card,
body.aidata-v3 .timeline-card,
body.aidata-v3 .session-row,
body.aidata-v3 .news-item,
body.aidata-v3 .insight-item,
body.aidata-v3 .chat-msg,
body.simulator-v3 .card,
body.simulator-v3 .kpi,
body.simulator-v3 .group-row,
body.simulator-v3 .term,
body.play-v3 .hero-card,
body.play-v3 .panel,
body.play-v3 .stat,
body.play-v3 .tile-btn,
body.play-v3 .mine-tile{
  background:var(--color-surface) !important;
  border:1px solid var(--color-border) !important;
  border-radius:14px !important;
  box-shadow:var(--shadow-sm) !important;
}
body.analytics-v3 .acct-panel::before,
body.analytics-v3 .kpi-glow,
body.analytics-v3 .kpi-icon,
body.analytics-v3 .kpi-accent,
body.aidata-v3 .intel-card::before,
body.play-v3 .hero-card::before,
body.play-v3 .panel::before{
  display:none !important;
}
body.analytics-v3 .card-hdr,
body.analytics-v3 .card-h,
body.analytics-v3 .acct-header,
body.aidata-v3 .intel-card-head,
body.play-v3 .panel-hdr,
body.simulator-v3 .card-h{
  background:var(--color-bg-elev) !important;
  border-bottom:1px solid var(--color-border) !important;
}
body.analytics-v3 .card-title,
body.analytics-v3 .card-badge,
body.analytics-v3 .kpi-lbl,
body.analytics-v3 .acct-stat-lbl,
body.analytics-v3 .filter-label,
body.analytics-v3 .section-title,
body.aidata-v3 .intel-kicker,
body.aidata-v3 .intel-label,
body.aidata-v3 .session-kicker,
body.simulator-v3 .kicker,
body.simulator-v3 .kpi-label,
body.simulator-v3 .card-title,
body.simulator-v3 .field label,
body.play-v3 .eyebrow,
body.play-v3 .panel-title,
body.play-v3 .control-label,
body.play-v3 .stat-label{
  color:var(--color-text-muted) !important;
}
body.analytics-v3 .acct-stat-val,
body.analytics-v3 .kpi-val,
body.aidata-v3 .intel-headline,
body.aidata-v3 .intel-big,
body.simulator-v3 .kpi-value,
body.play-v3 .stat-value,
body.play-v3 .micro-stat-value{
  color:var(--color-text) !important;
}
body.analytics-v3 .filter-select,
body.analytics-v3 .filter-btn,
body.simulator-v3 .select,
body.simulator-v3 .btn,
body.simulator-v3 .input,
body.play-v3 .hero-btn,
body.play-v3 .cashout-btn,
body.play-v3 .mode-chip,
body.play-v3 .risk-chip{
  background:var(--color-surface) !important;
  border:1px solid var(--color-border) !important;
  color:var(--color-text) !important;
  border-radius:10px !important;
}
body.analytics-v3 .filter-btn.active,
body.play-v3 .mode-chip.is-active,
body.play-v3 .risk-chip.is-active,
body.simulator-v3 .btn-primary{
  background:var(--color-primary-soft) !important;
  border-color:color-mix(in srgb,var(--color-primary) 38%,var(--color-border) 62%) !important;
  color:var(--color-text) !important;
}
body.analytics-v3 th,
body.simulator-v3 th,
body.play-v3 th{
  background:var(--color-bg-elev) !important;
  border-bottom:1px solid var(--color-border) !important;
}
body.analytics-v3 td,
body.simulator-v3 td,
body.play-v3 td{
  border-bottom:1px solid var(--color-border) !important;
}
body.analytics-v3 tr:hover td,
body.simulator-v3 tr:hover td,
body.play-v3 tr:hover td{
  background:color-mix(in srgb,var(--color-primary) 5%,var(--color-surface) 95%) !important;
}
/* ---------- dashboard v3 ---------- */
body.dashboard-v3{
  overflow:auto !important;
  height:auto !important;
}
body.dashboard-v3 .layout{
  display:grid !important;
  grid-template-columns:minmax(260px,290px) minmax(0,1fr) minmax(300px,340px);
  gap:20px;
  align-items:start;
  min-height:calc(100vh - 130px);
  height:auto !important;
  padding:0 !important;
}
body.dashboard-v3 .wl,
body.dashboard-v3 .sb{
  width:auto !important;
  min-width:0 !important;
  max-width:none !important;
  background:transparent !important;
  border:none !important;
  box-shadow:none !important;
  border-radius:0 !important;
  padding:0 !important;
  gap:14px;
}
body.dashboard-v3 .wl{
  position:sticky;
  top:92px;
  max-height:calc(100dvh - 112px);
  overflow:auto;
}
body.dashboard-v3 .sb{
  position:sticky;
  top:92px;
  max-height:calc(100dvh - 112px) !important;
  height:auto !important;
  overflow:auto;
}
body.dashboard-v3 #chart-wrap{
  min-width:0;
  display:flex;
  flex-direction:column;
  gap:14px;
  overflow:visible !important;
  background:transparent !important;
}
body.dashboard-v3 #chart-wrap::before{
  display:none !important;
}
body.dashboard-v3 .terminal-kpis{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:14px;
}
body.dashboard-v3 .terminal-kpis,
body.dashboard-v3 .market-grid{
  margin:0 !important;
}
body.dashboard-v3 .chart-shell,
body.dashboard-v3 .metric-card,
body.dashboard-v3 .market-card,
body.dashboard-v3 .side-card,
body.dashboard-v3 .terminal-card,
body.dashboard-v3 .stat-c,
body.dashboard-v3 .lv,
body.dashboard-v3 .result-row,
body.dashboard-v3 .wl-item{
  background:var(--color-surface) !important;
  background-image:none !important;
  border:1px solid var(--color-border) !important;
  border-radius:14px !important;
  box-shadow:var(--shadow-sm) !important;
}
body.dashboard-v3 .metric-card::before,
body.dashboard-v3 .metric-card::after,
body.dashboard-v3 .chart-shell::before,
body.dashboard-v3 .pnl-hero::after,
body.dashboard-v3 .sec::after{
  display:none !important;
}
body.dashboard-v3 .metric-label,
body.dashboard-v3 .market-label,
body.dashboard-v3 .side-card-label,
body.dashboard-v3 .terminal-card-title,
body.dashboard-v3 .sec-ttl,
body.dashboard-v3 .stat-lbl,
body.dashboard-v3 .pm-lbl,
body.dashboard-v3 .workspace-stat-label,
body.dashboard-v3 .telemetry-row span:first-child,
body.dashboard-v3 .chart-eyebrow,
body.dashboard-v3 .chart-sub{
  color:var(--color-text-muted) !important;
}
body.dashboard-v3 .metric-value,
body.dashboard-v3 .market-value,
body.dashboard-v3 .workspace-balance,
body.dashboard-v3 .chart-title,
body.dashboard-v3 .exec-symbol,
body.dashboard-v3 .pnl-val,
body.dashboard-v3 .stat-val{
  color:var(--color-text) !important;
  overflow-wrap:anywhere;
  word-break:break-word;
}
body.dashboard-v3 .metric-value{font-size:clamp(22px,3.3vw,36px) !important}
body.dashboard-v3 .workspace-balance{font-size:clamp(36px,4vw,52px) !important}
body.dashboard-v3 .market-value{font-size:clamp(20px,2.6vw,30px) !important}
body.dashboard-v3 .chart-title{font-size:clamp(30px,3.1vw,40px)}
body.dashboard-v3 .exec-symbol{font-size:clamp(30px,3vw,42px) !important}
body.dashboard-v3 .pnl-val{font-size:clamp(28px,3.2vw,42px) !important}
body.dashboard-v3 .stat-val{font-size:clamp(16px,2vw,22px) !important}
body.dashboard-v3 .wl-hdr{
  padding:0 2px 2px !important;
  border:none !important;
  background:transparent !important;
}
body.dashboard-v3 .wl-scroll{
  border:none !important;
  border-radius:0 !important;
  background:transparent !important;
}
body.dashboard-v3 .wl-item{
  margin:0 0 10px !important;
  padding:12px !important;
}
body.dashboard-v3 .chart-shell{
  display:flex;
  flex-direction:column;
  gap:12px;
  padding:16px;
}
body.dashboard-v3 .chart-head{
  padding:0 !important;
  align-items:flex-start;
  gap:10px;
  flex-wrap:wrap;
}
body.dashboard-v3 .chart-structure{
  text-align:left;
  min-width:0;
}
body.dashboard-v3 .ind-toolbar{
  height:auto !important;
  min-height:46px;
  padding:8px !important;
  border:1px solid var(--color-border) !important;
  border-radius:12px !important;
  background:var(--color-surface) !important;
}
body.dashboard-v3 .ind-btn,
body.dashboard-v3 .chart-fs-btn{
  border-radius:10px !important;
  border:1px solid var(--color-border) !important;
  background:var(--color-surface) !important;
  color:var(--color-text-muted) !important;
  box-shadow:none !important;
}
body.dashboard-v3 #chart-container{
  height:56vh;
  min-height:400px;
  border-radius:12px;
  border:1px solid var(--color-border);
  background:var(--color-surface);
}
body.dashboard-v3 .sub-panel{
  border-top:1px solid var(--color-border) !important;
  background:var(--color-surface) !important;
}
body.dashboard-v3 .market-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:12px;
}
body.dashboard-v3 .terminal-card-hdr{
  background:var(--color-bg-elev) !important;
  border-bottom:1px solid var(--color-border) !important;
}
body.dashboard-v3 .exec-body,
body.dashboard-v3 .terminal-card-body,
body.dashboard-v3 .sec{
  min-width:0;
}
body.dashboard-v3 .exec-btn,
body.dashboard-v3 .exec-mode-btn{
  border:1px solid var(--color-border) !important;
  border-radius:10px !important;
  background:var(--color-surface) !important;
  color:var(--color-text-muted) !important;
}
body.dashboard-v3 .exec-btn.active{
  background:rgba(31,158,116,.12) !important;
  border-color:rgba(31,158,116,.28) !important;
  color:var(--color-success) !important;
}
body.dashboard-v3 .exec-btn.sell-active{
  background:rgba(217,79,99,.12) !important;
  border-color:rgba(217,79,99,.28) !important;
  color:var(--color-danger) !important;
}
body.dashboard-v3 .exec-slider,
body.dashboard-v3 .workspace-bar,
body.dashboard-v3 .r-track{
  background:var(--color-bg-elev) !important;
}
body.dashboard-v3 .exec-slider-fill,
body.dashboard-v3 .workspace-bar-fill,
body.dashboard-v3 #stageBar,
body.dashboard-v3 #acctMarginBar{
  background:var(--color-primary) !important;
}
body.dashboard-v3 .exec-pill,
body.dashboard-v3 .exec-side,
body.dashboard-v3 .stage-pill,
body.dashboard-v3 .closed-banner{
  background:var(--color-bg-elev) !important;
  border:1px solid var(--color-border) !important;
  color:var(--color-text-muted) !important;
}
body.dashboard-v3 .no-trade-overlay{
  background:color-mix(in srgb,var(--color-bg) 82%,transparent) !important;
  backdrop-filter:blur(3px);
}
body.dashboard-v3 .no-sym{
  color:color-mix(in srgb,var(--color-text-muted) 28%,white) !important;
}
body.dashboard-v3 .no-txt{
  color:var(--color-text-muted) !important;
}
body.dashboard-v3 .up,
body.dashboard-v3 .pp,
body.dashboard-v3 .rp,
body.dashboard-v3 .r-pos{
  color:var(--color-success) !important;
}
body.dashboard-v3 .down,
body.dashboard-v3 .pn,
body.dashboard-v3 .rn,
body.dashboard-v3 .r-neg{
  color:var(--color-danger) !important;
}
body.dashboard-v3 .overlay{
  display:none !important;
}
body.dashboard-v3 .bnav{
  border-top:1px solid var(--color-border) !important;
  background:color-mix(in srgb,var(--color-surface) 88%,transparent) !important;
  backdrop-filter:blur(10px);
}
body.dashboard-v3 .bnav-tab{
  color:var(--color-text-muted) !important;
}
body.dashboard-v3 .bnav-tab.active{
  color:var(--color-primary) !important;
}
/* ---------- loaders and transitions ---------- */
.page-loader{
  position:fixed;
  inset:0;
  z-index:920;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:24px;
  background:var(--overlay);
  backdrop-filter:blur(6px);
  transition:opacity var(--motion-base) var(--ease-standard),visibility var(--motion-base) var(--ease-standard);
}
.page-loader.is-hidden{
  opacity:0;
  visibility:hidden;
}
.loading-shell{
  width:min(420px,100%);
  padding:20px;
  display:grid;
  gap:14px;
  border-radius:var(--radius-md);
  border:1px solid var(--color-border);
  background:var(--color-surface);
  box-shadow:var(--shadow-lg);
}
.loading-visual{
  height:64px;
  border-radius:var(--radius-sm);
  background:linear-gradient(90deg,var(--color-surface-2),var(--color-surface),var(--color-surface-2));
  background-size:220% 100%;
  animation:loadingSweep 1.2s linear infinite;
}
.loading-bars,.loading-gridline,.loading-pulses,.app-chrome{display:none !important;}
.loading-copy strong{
  color:var(--color-text);
  font:800 20px/1 'Inter Tight','Inter',sans-serif;
}
.loading-copy span{
  color:var(--color-text-muted);
  font:500 12px/1.4 'Inter',sans-serif;
}
@keyframes loadingSweep{
  0%{background-position:200% 0}
  100%{background-position:-20% 0}
}
.page-transition{display:none !important;}
/* ---------- assistant UI ---------- */
.assistant-floating{
  position:fixed;
  right:16px;
  bottom:calc(16px + env(safe-area-inset-bottom,0px));
  z-index:930;
}
.assistant-fab{
  min-width:200px;
  display:flex;
  align-items:center;
  gap:10px;
  padding:10px 12px;
  border:1px solid var(--color-border);
  border-radius:var(--radius-md);
  background:var(--color-surface);
  color:var(--color-text);
  box-shadow:var(--shadow-md);
  cursor:pointer;
  transition:all var(--motion-fast) var(--ease-standard);
}
.assistant-fab:hover{
  transform:translateY(-1px);
  box-shadow:var(--shadow-lg);
}
.assistant-fab-core{
  width:34px;
  height:34px;
  border-radius:10px;
  display:grid;
  place-items:center;
  border:1px solid var(--color-border);
  color:var(--color-primary);
  background:var(--color-primary-soft);
}
.assistant-fab-copy strong{
  color:var(--color-text);
  font:800 12px/1 'Inter Tight','Inter',sans-serif;
}
.assistant-fab-copy small{
  color:var(--color-text-muted);
  font:600 9px/1.2 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
}
.assistant-backdrop{
  position:fixed;
  inset:0;
  z-index:935;
  background:var(--overlay);
  backdrop-filter:blur(4px);
  opacity:0;
  visibility:hidden;
  transition:opacity var(--motion-base) var(--ease-standard),visibility var(--motion-base) var(--ease-standard);
}
.assistant-panel{
  position:fixed;
  right:16px;
  bottom:16px;
  width:min(430px,calc(100vw - 24px));
  height:min(760px,calc(100dvh - 36px));
  z-index:940;
  display:flex;
  flex-direction:column;
  gap:12px;
  padding:16px;
  border-radius:var(--radius-lg);
  border:1px solid var(--color-border);
  background:var(--color-surface);
  box-shadow:var(--shadow-lg);
  opacity:0;
  visibility:hidden;
  pointer-events:none;
  transform:translateY(12px) scale(.98);
  transition:all var(--motion-base) var(--ease-standard);
}
.assistant-panel-sheen{display:none}
.assistant-panel-head{display:flex;justify-content:space-between;gap:10px}
.assistant-panel-kicker{
  color:var(--color-text-muted);
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.1em;
  text-transform:uppercase;
}
.assistant-panel-title{
  color:var(--color-text);
  font:900 22px/1 'Inter Tight','Inter',sans-serif;
}
.assistant-panel-sub{color:var(--color-text-muted);font:500 12px/1.5 'Inter',sans-serif;}
.assistant-close{
  width:34px;
  height:34px;
  border-radius:var(--radius-sm);
  border:1px solid var(--color-border);
  background:var(--color-surface-2);
  color:var(--color-text-muted);
  cursor:pointer;
}
.assistant-panel-chips,.assistant-panel-actions,.assistant-suggestion-row{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.assistant-chip,.assistant-starter,.assistant-suggestion{
  border-radius:999px;
  border:1px solid var(--color-border);
  background:var(--color-surface-2);
  color:var(--color-text-muted);
  padding:6px 10px;
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.04em;
  text-transform:uppercase;
}
.assistant-chip.good{color:var(--color-success)}
.assistant-chip.bad{color:var(--color-danger)}
.assistant-chip.warn{color:var(--color-warning)}
.assistant-chip.info{color:var(--color-primary)}
.assistant-log{
  flex:1;
  overflow:auto;
  display:grid;
  gap:10px;
}
.assistant-msg{
  max-width:92%;
  display:grid;
  gap:8px;
  padding:12px;
  border-radius:14px;
  border:1px solid var(--color-border);
  background:var(--color-surface-2);
  word-break:break-word;
}
.assistant-msg.user{
  margin-left:auto;
  background:var(--color-primary-soft);
}
.assistant-msg.assistant{
  margin-right:auto;
}
.assistant-msg-top{
  display:flex;
  justify-content:space-between;
  gap:8px;
}
.assistant-msg-top strong{
  color:var(--color-text);
  font:700 12px/1 'Inter Tight','Inter',sans-serif;
}
.assistant-msg-time{
  color:var(--color-text-muted);
  font:700 9px/1 'JetBrains Mono',monospace;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.assistant-msg-title{color:var(--color-text);font:800 15px/1.2 'Inter Tight','Inter',sans-serif;}
.assistant-msg-copy,.assistant-section-copy{color:var(--color-text-muted);font:500 12px/1.6 'Inter',sans-serif;}
.assistant-structured{
  display:grid;
  gap:8px;
  padding:10px;
  border-radius:12px;
  border:1px solid var(--color-border);
  background:var(--color-surface);
}
.assistant-section-label{
  color:var(--color-text);
  font:700 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.1em;
  text-transform:uppercase;
}
.assistant-section-list{
  margin:0;
  padding-left:16px;
  color:var(--color-text-muted);
  font:500 12px/1.5 'Inter',sans-serif;
}
.assistant-empty{
  min-height:150px;
  display:grid;
  place-items:center;
  text-align:center;
  border:1px dashed var(--color-border);
  border-radius:12px;
  color:var(--color-text-muted);
  padding:14px;
}
.assistant-form{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:8px;
  margin-top:auto;
}
.assistant-input{
  min-height:44px;
  border:1px solid var(--color-border);
  border-radius:var(--radius-sm);
  background:var(--color-surface-2);
  color:var(--color-text);
  padding:10px 12px;
  font:500 12px/1.4 'Inter',sans-serif;
}
.assistant-input::placeholder{color:var(--color-text-muted)}
.assistant-send{
  min-height:44px;
  border:1px solid color-mix(in srgb,var(--color-primary) 42%,var(--color-border) 58%);
  border-radius:var(--radius-sm);
  background:var(--color-primary-soft);
  color:var(--color-text);
  padding:0 14px;
  font:800 10px/1 'JetBrains Mono',monospace;
  letter-spacing:.06em;
  text-transform:uppercase;
  cursor:pointer;
}
body.assistant-open{
  overflow:hidden;
}
body.assistant-open .assistant-backdrop{
  opacity:1;
  visibility:visible;
}
body.assistant-open .assistant-panel{
  opacity:1;
  visibility:visible;
  pointer-events:auto;
  transform:none;
}
/* ---------- responsive ---------- */
@media(max-width:840px){
  .nav-shell{
    top:8px;
    margin:8px 10px 0;
    min-height:58px;
  }
  .nav-links-desktop,
  .nav-user,
  .nav-link-ghost,
  .nav-extra,
  .theme-toggle,
  .nav-market{
    display:none !important;
  }
  .nav-toggle{display:inline-flex}
  .assistant-floating{
    right:12px;
    left:12px;
  }
  .assistant-fab{
    width:100%;
    min-width:0;
  }
  .assistant-panel{
    left:12px;
    right:12px;
    top:calc(12px + env(safe-area-inset-top,0px));
    bottom:calc(12px + env(safe-area-inset-bottom,0px));
    width:auto;
    height:auto;
  }
}
@media(max-width:1024px){
  body.dashboard-v3 .layout{
    grid-template-columns:minmax(0,1fr) minmax(0,1fr);
    gap:14px;
    min-height:auto;
  }
  body.dashboard-v3 #chart-wrap{
    grid-column:1 / -1;
  }
  body.dashboard-v3 .wl{
    grid-column:1 / 2;
  }
  body.dashboard-v3 .sb{
    grid-column:2 / 3;
  }
  body.dashboard-v3 .wl,
  body.dashboard-v3 .sb{
    position:relative;
    top:0;
    max-height:none !important;
    height:auto !important;
    overflow:visible;
  }
  body.dashboard-v3 .bnav{
    display:flex !important;
    position:sticky;
    bottom:0;
    z-index:240;
  }
  body.has-shared-nav .cards2,
  body.has-shared-nav .cards3,
  body.has-shared-nav .cards-equal,
  body.has-shared-nav .charts,
  body.has-shared-nav .charts-row,
  body.has-shared-nav .perf-grid,
  body.has-shared-nav .intel-grid,
  body.has-shared-nav .posture-row,
  body.has-shared-nav .split{
    grid-template-columns:1fr !important;
  }
}
@media(max-width:1280px) and (min-width:1025px){
  body.dashboard-v3 .layout{
    grid-template-columns:minmax(240px,270px) minmax(0,1fr) minmax(280px,320px);
    gap:16px;
  }
  body.dashboard-v3 .terminal-kpis{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  body.dashboard-v3 .market-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
@media(max-width:720px){
  body.dashboard-v3 .layout{
    grid-template-columns:1fr;
  }
  body.dashboard-v3 #chart-wrap,
  body.dashboard-v3 .wl,
  body.dashboard-v3 .sb{
    grid-column:auto;
  }
  body.dashboard-v3 #chart-container{
    height:46vh;
    min-height:300px;
  }
  body.dashboard-v3 .metric-value{font-size:clamp(20px,7vw,30px) !important}
  body.dashboard-v3 .workspace-balance{font-size:clamp(30px,11vw,40px) !important}
  body.dashboard-v3 .exec-symbol{font-size:clamp(24px,8vw,34px) !important}
  body.dashboard-v3 .pnl-val{font-size:clamp(24px,8vw,34px) !important}
  body.analytics-v3 .acct-grid,
  body.analytics-v3 .kpi-grid,
  body.simulator-v3 .kpis,
  body.simulator-v3 .real-summary,
  body.simulator-v3 .charts,
  body.simulator-v3 .glossary{
    grid-template-columns:1fr !important;
  }
  body.analytics-v3 .filters-row{
    position:relative !important;
    top:0 !important;
  }
}
@media(max-width:560px){
  .nav-drawer{
    width:min(100vw,360px);
    padding:14px 12px;
  }
  body.has-shared-nav .kpis,
  body.has-shared-nav .real-summary,
  body.has-shared-nav .stat-row,
  body.has-shared-nav .glossary{
    grid-template-columns:1fr !important;
  }
  .assistant-form{
    grid-template-columns:1fr;
  }
  .assistant-send{width:100%}
}
@media(max-width:420px){
  .nav-shell{
    margin:6px 8px 0;
    padding:8px;
  }
  body.dashboard-v3 .page-shell,
  body.analytics-v3 .page-shell,
  body.aidata-v3 .page-shell,
  body.simulator-v3 .page-shell,
  body.play-v3 .page-shell{
    padding-inline:8px;
  }
  body.dashboard-v3 .chart-shell,
  body.dashboard-v3 .terminal-card,
  body.dashboard-v3 .side-card,
  body.analytics-v3 .card,
  body.aidata-v3 .intel-card,
  body.simulator-v3 .card,
  body.play-v3 .panel,
  body.play-v3 .stat{
    border-radius:12px !important;
    padding-inline:12px !important;
  }
}
@media(prefers-reduced-motion:reduce){
  *,
  *::before,
  *::after{
    animation:none !important;
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
  return `<div class="nav nav-shell">
  <div class="nav-main">
    <a href="/dashboard" class="nav-logo" aria-label="Ir a trading"><div class="nav-dot"></div>αтεгυм</a>
    <nav class="nav-links nav-links-desktop" aria-label="Navegación principal">
      <a href="/dashboard" class="nav-link${current==='dashboard'?' active':''}">Trading</a>
      <a href="/analytics" class="nav-link${current==='analytics'?' active':''}">Análisis</a>
      <a href="/simulator" class="nav-link${current==='simulator'?' active':''}">Simulador</a>
      <a href="/ai-data#inteligencia" class="nav-link${current==='aidata'?' active':''}">Inteligencia</a>
      <a href="/ai-data#asistente-ia" class="nav-link${current==='aidata'?' active':''}">Asistente IA</a>
      <a href="/crypto-play" class="nav-link${current==='play'?' active':''}">Crypto Play</a>
    </nav>
  </div>
  <div class="nav-utility">
    ${extraRight ? `<div class="nav-extra">${extraRight}</div>` : ''}
    <button class="theme-toggle" id="themeToggle" type="button" aria-label="Cambiar tema">
      <span class="theme-toggle-icon" aria-hidden="true">◐</span>
      <span class="theme-toggle-label" id="themeToggleLabel">Oscuro</span>
    </button>
    <span class="nav-user nav-user-${accent}">${user?.username || ''}</span>
    <a href="/logout" class="nav-link nav-link-ghost" data-no-transition="true">Salir</a>
    <button class="nav-toggle" id="navToggle" type="button" aria-label="Abrir menú" aria-controls="navDrawer" aria-expanded="false">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="4" y1="7" x2="20" y2="7"></line>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <line x1="4" y1="17" x2="20" y2="17"></line>
      </svg>
    </button>
  </div>
</div>
<div class="nav-drawer-backdrop" id="navDrawerBackdrop" data-nav-close="true" aria-hidden="true"></div>
<aside class="nav-drawer" id="navDrawer" aria-hidden="true" aria-label="Menú móvil">
  <div class="nav-drawer-head">
    <div class="nav-drawer-title"><span class="nav-dot"></span> Menú</div>
    <button class="nav-drawer-close" type="button" data-nav-close="true" aria-label="Cerrar menú">×</button>
  </div>
  <nav class="nav-drawer-links">
    <a href="/dashboard" class="nav-drawer-link${current==='dashboard'?' active':''}">Trading</a>
    <a href="/analytics" class="nav-drawer-link${current==='analytics'?' active':''}">Análisis</a>
    <a href="/simulator" class="nav-drawer-link${current==='simulator'?' active':''}">Simulador</a>
    <a href="/ai-data#inteligencia" class="nav-drawer-link${current==='aidata'?' active':''}">Inteligencia</a>
    <a href="/ai-data#asistente-ia" class="nav-drawer-link${current==='aidata'?' active':''}">Asistente IA</a>
    <a href="/crypto-play" class="nav-drawer-link${current==='play'?' active':''}">Crypto Play</a>
  </nav>
  <div class="nav-drawer-foot">
    <button class="theme-toggle theme-toggle-drawer" id="themeToggleDrawer" type="button" aria-label="Cambiar tema">
      <span class="theme-toggle-icon" aria-hidden="true">◐</span>
      <span class="theme-toggle-label" id="themeToggleDrawerLabel">Oscuro</span>
    </button>
    <div class="nav-drawer-user">${user?.username || ''}</div>
    <a href="/logout" class="nav-drawer-logout" data-no-transition="true">Cerrar sesión</a>
  </div>
</aside>
<script>
(function(){
  if(window.__aterumNavBooted)return;
  window.__aterumNavBooted=true;
  var body=document.body;
  var root=document.documentElement;
  var navShell=document.querySelector('.nav-shell');
  var toggle=document.getElementById('navToggle');
  var drawer=document.getElementById('navDrawer');
  var themeToggle=document.getElementById('themeToggle');
  var themeToggleDrawer=document.getElementById('themeToggleDrawer');
  var themeToggleLabel=document.getElementById('themeToggleLabel');
  var themeToggleDrawerLabel=document.getElementById('themeToggleDrawerLabel');
  if(!navShell)return;
  body.classList.add('has-shared-nav');
  function getTheme(){
    return root.getAttribute('data-theme')==='dark'?'dark':'light';
  }
  function syncThemeLabels(theme){
    var label=theme==='dark'?'Claro':'Oscuro';
    if(themeToggleLabel)themeToggleLabel.textContent=label;
    if(themeToggleDrawerLabel)themeToggleDrawerLabel.textContent=label;
  }
  function applyTheme(next){
    var theme=next==='dark'?'dark':'light';
    root.setAttribute('data-theme',theme);
    try{ localStorage.setItem('aterum-theme',theme); }catch(error){}
    syncThemeLabels(theme);
  }
  if(!root.getAttribute('data-theme')) applyTheme('dark');
  else syncThemeLabels(getTheme());
  function setOpen(open){
    body.classList.toggle('nav-drawer-open',!!open);
    if(toggle)toggle.setAttribute('aria-expanded',open?'true':'false');
    if(drawer)drawer.setAttribute('aria-hidden',open?'false':'true');
  }
  function toggleTheme(){
    applyTheme(getTheme()==='dark'?'light':'dark');
  }
  if(themeToggle)themeToggle.addEventListener('click',toggleTheme);
  if(themeToggleDrawer)themeToggleDrawer.addEventListener('click',toggleTheme);
  if(toggle){
    toggle.addEventListener('click',function(){ setOpen(!body.classList.contains('nav-drawer-open')); });
  }
  document.addEventListener('click',function(event){
    var closeEl=event.target.closest('[data-nav-close]');
    if(closeEl){ setOpen(false); return; }
    var drawerLink=event.target.closest('.nav-drawer-link');
    if(drawerLink){ setOpen(false); }
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&body.classList.contains('nav-drawer-open')) setOpen(false);
  });
  window.addEventListener('resize',function(){
    if(window.innerWidth>840&&body.classList.contains('nav-drawer-open')) setOpen(false);
  });
})();
</script>`;
}

module.exports = {
  getSharedHeadAssets,
  getLoadingMarkup,
  getSharedChrome,
  getSharedStyles,
  getSharedScript,
  getSharedNav
};
