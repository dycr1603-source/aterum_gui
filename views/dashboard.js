'use strict';

const {
  getSharedChrome,
  getSharedStyles,
  getSharedScript,
  getSharedNav
} = require('./ui_shared');

function getDashboardHTML(symbol, user) { return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#f5f5f7">
<title>αтεгυм — ${symbol}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://unpkg.com/lightweight-charts@3.8.0/dist/lightweight-charts.standalone.production.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.7/dist/gsap.min.js"></script>
<style>
:root{--bg:var(--ui-bg,#f5f5f7);--bg2:var(--ui-bg-raised,#ffffff);--bg3:#f4f7fc;--bg4:#e2e9f2;--border:rgba(29,29,31,.12);--border2:rgba(29,29,31,.2);--text:var(--ui-text,#1d1d1f);--text2:var(--ui-muted,#6e6e73);--muted:var(--ui-faint,#8f949d);--green:#1f9e74;--green2:#1a8b66;--red:#d94f63;--red2:#c24558;--blue:#007aff;--gold:#cf9440;--purple:#6f67d8;--mono:'JetBrains Mono',monospace;--display:'Inter Tight','Inter','SF Pro Display',sans-serif;--sans:'Inter','SF Pro Text','Segoe UI',sans-serif;--safe-top:env(safe-area-inset-top,0px);--safe-bot:env(safe-area-inset-bottom,0px);--ease:cubic-bezier(.22,1,.36,1)}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{height:100%;overscroll-behavior:none}
body{background:
linear-gradient(180deg,rgba(67,111,243,.06),transparent 30%),
linear-gradient(135deg,rgba(0,122,255,.08),transparent 42%),
linear-gradient(180deg,#f8f9fb 0%,#f2f5fa 48%,#edf2f8 100%);
color:var(--text);font-family:var(--sans);font-size:12px;height:100%;overflow:hidden;-webkit-font-smoothing:antialiased;padding-top:var(--safe-top);padding-bottom:var(--safe-bot)}
/* NAV */
.nav{height:48px;display:flex;align-items:center;padding:0 16px;gap:0;background:rgba(9,11,9,.84);border-bottom:1px solid var(--border);z-index:200;flex-shrink:0;position:relative;backdrop-filter:blur(16px) saturate(1.15);box-shadow:0 12px 30px rgba(0,0,0,.26)}
.nav-logo{font-family:var(--display);font-size:13px;font-weight:800;letter-spacing:.1em;display:flex;align-items:center;gap:7px;margin-right:18px;flex-shrink:0}
.nav-dot{width:5px;height:5px;border-radius:2px;background:var(--green);box-shadow:0 0 8px var(--green);animation:glow 2s steps(2,end) infinite}
@keyframes glow{0%,100%{box-shadow:0 0 4px var(--green)}50%{box-shadow:0 0 14px var(--green)}}
.nav-sym{font-family:var(--display);font-size:14px;font-weight:700;margin-right:8px;flex-shrink:0}
.nav-price{font-size:16px;font-weight:600;transition:color .2s;flex-shrink:0;min-width:80px}
.up{color:var(--green)}.down{color:var(--red)}
.nav-pill{padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;letter-spacing:.08em;margin-left:8px;flex-shrink:0}
.pill-short{background:rgba(255,61,90,.12);color:var(--red);border:1px solid rgba(255,61,90,.25)}
.pill-long{background:rgba(0,229,160,.10);color:var(--green);border:1px solid rgba(0,229,160,.22)}
.pill-closed{background:rgba(48,69,96,.15);color:var(--muted);border:1px solid var(--border2)}
.nav-live{display:flex;align-items:center;gap:5px;margin-left:10px;flex-shrink:0}
.live-dot{width:5px;height:5px;border-radius:50%;background:var(--muted);flex-shrink:0}
.live-dot.on{background:var(--green);box-shadow:0 0 5px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.live-txt{font-size:9px;color:var(--text2);letter-spacing:.06em}
.nav-spacer{flex:1}
.nav-actions{display:flex;align-items:center;gap:8px}
.nav-btn{background:rgba(15,21,32,.86);border:1px solid rgba(61,158,255,.12);color:var(--text2);padding:5px 12px;border-radius:999px;font-size:10px;font-family:var(--mono);cursor:pointer;letter-spacing:.06em;text-decoration:none;display:inline-flex;align-items:center;gap:5px;transition:all .15s}
.nav-btn:hover{border-color:var(--blue);color:var(--blue);box-shadow:0 0 0 1px rgba(61,158,255,.08) inset}
.nav-btn.active{background:rgba(61,158,255,.1);border-color:var(--blue);color:var(--blue)}
.nav-time{font-size:9px;color:var(--muted);letter-spacing:.04em}
.nav-menu-btn{display:none;background:none;border:none;cursor:pointer;color:var(--text2);padding:4px;margin-left:8px;flex-shrink:0}
.nav-menu-btn svg{width:18px;height:18px}
/* LAYOUT */
.layout{display:flex;height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot))}
/* WATCHLIST */
.wl{width:190px;min-width:190px;background:rgba(17,20,17,.82);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;transition:transform .25s var(--ease);flex-shrink:0;backdrop-filter:blur(18px)}
.wl-hdr{padding:10px 14px 8px;font-size:9px;font-weight:600;letter-spacing:.12em;color:var(--muted);text-transform:uppercase;border-bottom:1px solid var(--border2);flex-shrink:0;display:flex;justify-content:space-between;align-items:center}
.wl-count{background:var(--bg4);border:1px solid var(--border2);border-radius:10px;padding:1px 7px;font-size:9px;color:var(--text2)}
.wl-scroll{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border2) transparent}
.wl-scroll::-webkit-scrollbar{width:3px}
.wl-scroll::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
.wl-sec-lbl{padding:8px 14px 4px;font-size:9px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase}
.wl-item{padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(24,46,69,.4);transition:background .15s;display:flex;flex-direction:column;gap:5px;border-left:2px solid transparent}
.wl-item:hover{background:rgba(255,255,255,.02)}
.wl-item.active{background:rgba(22,32,48,.76)}
.wl-item.open-short{border-left-color:var(--red)}
.wl-item.open-long{border-left-color:var(--green)}
.wl-item.closed-item{opacity:.6}
.wl-row1{display:flex;justify-content:space-between;align-items:baseline}
.wl-sym{font-family:var(--display);font-size:11px;font-weight:700;color:var(--text)}
.wl-sym span{font-size:9px;color:var(--muted);font-weight:400}
.wl-pnl{font-size:11px;font-weight:700}
.pp{color:var(--green)}.pn{color:var(--red)}.pz{color:var(--text2)}
.wl-row2{display:flex;justify-content:space-between;align-items:center}
.wl-badge{font-size:9px;font-weight:600;letter-spacing:.07em}
.wl-badge.live{color:var(--green)}.wl-badge.closed{color:var(--muted)}
.wl-r{font-size:10px;font-weight:600}
.wl-bar{height:2px;border-radius:1px;background:var(--border);overflow:hidden}
.wl-bar-fill{height:100%;border-radius:1px;transition:width .5s}
.wl-bar-p{background:linear-gradient(90deg,var(--green2),var(--green))}
.wl-bar-n{background:linear-gradient(90deg,var(--red2),var(--red))}
/* CHART */
#chart-wrap{flex:1;position:relative;overflow:hidden;min-width:0;display:flex;flex-direction:column}
#chart-wrap::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 16% 8%,rgba(61,158,255,.08),transparent 24%),radial-gradient(circle at 82% 12%,rgba(0,229,160,.05),transparent 18%);z-index:0}
#chart-container{flex:1;width:100%;min-height:0;position:relative;z-index:1}
/* INDICATOR TOOLBAR */
.ind-toolbar{height:32px;background:rgba(16,26,41,.8);border-bottom:1px solid rgba(87,176,255,.12);display:flex;align-items:center;padding:0 10px;gap:4px;overflow-x:auto;flex-shrink:0;scrollbar-width:none;backdrop-filter:blur(16px);position:relative;z-index:1}
.ind-toolbar::-webkit-scrollbar{display:none}
.ind-btn{padding:3px 8px;border-radius:999px;font-size:9px;font-weight:600;letter-spacing:.07em;cursor:pointer;border:1px solid var(--border2);background:rgba(15,21,32,.9);color:var(--muted);transition:all .15s;white-space:nowrap;font-family:var(--mono)}
.ind-btn:hover{color:var(--text2);border-color:var(--border)}
.ind-btn.on{background:rgba(61,158,255,.08);border-color:rgba(61,158,255,.3);color:var(--text)}
.ind-btn.ema8.on{border-color:rgba(0,229,160,.5);color:#00e5a0;background:rgba(0,229,160,.06)}
.ind-btn.ema21.on{border-color:rgba(61,158,255,.5);color:#3d9eff;background:rgba(61,158,255,.06)}
.ind-btn.ema50.on{border-color:rgba(245,166,35,.5);color:#f5a623;background:rgba(245,166,35,.06)}
.ind-btn.vwap.on{border-color:rgba(168,85,247,.5);color:#a855f7;background:rgba(168,85,247,.06)}
.ind-btn.vol.on{border-color:rgba(61,158,255,.4);color:#3d9eff;background:rgba(61,158,255,.05)}
.ind-btn.rsi.on{border-color:rgba(255,140,66,.5);color:#ff8c42;background:rgba(255,140,66,.06)}
.ind-btn.sqz.on{border-color:rgba(0,229,160,.4);color:#00e5a0;background:rgba(0,229,160,.05)}
.ind-btn.adx.on{border-color:rgba(255,61,90,.4);color:#ff3d5a;background:rgba(255,61,90,.05)}
.ind-sep{width:1px;height:16px;background:var(--border2);flex-shrink:0;margin:0 2px}
/* SUB PANELS */
.sub-panel{width:100%;background:var(--bg);border-top:1px solid var(--border2);flex-shrink:0;display:none;position:relative;min-height:50px;max-height:300px;z-index:1}
#vol-panel{height:80px}
#rsi-panel{height:90px}
#sqz-panel{height:70px}
.panel-resize{position:absolute;top:0;left:0;right:0;height:5px;cursor:ns-resize;z-index:10;background:transparent;transition:background .15s}
.panel-resize:hover{background:rgba(61,158,255,.3)}
.panel-resize::before{content:'';position:absolute;top:2px;left:50%;transform:translateX(-50%);width:32px;height:1px;background:var(--border2);border-radius:1px}
.panel-label{position:absolute;top:6px;left:8px;font-size:9px;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;pointer-events:none;z-index:5}
.no-trade-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none;background:rgba(6,9,16,.92);z-index:2}
.no-sym{font-family:var(--display);font-size:clamp(28px,5vw,44px);font-weight:800;color:var(--border2)}
.no-txt{font-size:11px;color:var(--muted);letter-spacing:.06em}
/* SIDEBAR */
.sb{width:240px;min-width:240px;background:rgba(15,24,40,.8);border-left:1px solid rgba(87,176,255,.12);overflow-y:auto;flex-shrink:0;transition:transform .25s ease;scrollbar-width:thin;scrollbar-color:var(--border2) transparent;backdrop-filter:blur(18px)}
.sb::-webkit-scrollbar{width:3px}.sb::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
/* PNL HERO */
.pnl-hero{padding:16px 16px 14px;border-bottom:1px solid var(--border2);position:relative;overflow:hidden}
.pnl-hero::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(135deg,rgba(0,229,160,.04) 0%,transparent 60%);transition:background .3s}
.pnl-hero.loss::after{background:linear-gradient(135deg,rgba(255,61,90,.05) 0%,transparent 60%)}
.pnl-lbl{font-size:9px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin-bottom:5px}
.pnl-val{font-family:var(--display);font-size:clamp(22px,2.5vw,30px);font-weight:800;line-height:1;margin-bottom:10px;transition:color .3s}
.pnl-meta{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pm-lbl{font-size:9px;color:var(--muted);margin-bottom:2px}
.pm-val{font-size:11px;font-weight:600}
/* SECTION */
.sec{padding:13px 16px;border-bottom:1px solid var(--border2)}
.sec-ttl{font-size:9px;color:var(--muted);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px}
.sec-ttl::after{content:'';flex:1;height:1px;background:var(--border2)}
/* LEVELS */
.levels{display:flex;flex-direction:column;gap:5px}
.lv{display:flex;align-items:center;justify-content:space-between;padding:9px 11px;border-radius:12px;position:relative;overflow:hidden;gap:8px;transition:all .2s}
.lv::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px}
.lv-entry{background:rgba(61,158,255,.07)}.lv-entry::before{background:var(--blue)}
.lv-sl{background:rgba(255,61,90,.08)}.lv-sl::before{background:var(--red)}
.lv-tp{background:rgba(0,229,160,.07)}.lv-tp::before{background:var(--green)}
.lv-left{flex:1;min-width:0}
.lv-name{font-size:9px;color:var(--text2);letter-spacing:.08em;text-transform:uppercase}
.lv-dist{font-size:9px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lv-price{font-size:12px;font-weight:600;flex-shrink:0}
.lv-entry .lv-price{color:var(--blue)}.lv-sl .lv-price{color:var(--red)}.lv-tp .lv-price{color:var(--green)}
/* SL/TP Visual indicators */
.sl-indicator{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--red);margin-top:4px;padding:3px 6px;background:rgba(255,61,90,.06);border-radius:3px;border:1px solid rgba(255,61,90,.15)}
.tp-indicator{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--green);margin-top:4px;padding:3px 6px;background:rgba(0,229,160,.06);border-radius:3px;border:1px solid rgba(0,229,160,.15)}
.indicator-dot{width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0}
/* R TRACK */
.r-wrap{display:flex;flex-direction:column;align-items:center;gap:8px;padding:2px 0}
.r-big{font-family:var(--display);font-size:clamp(26px,3vw,34px);font-weight:800;line-height:1}
.r-pos{color:var(--green)}.r-neg{color:var(--red)}
.r-track-wrap{width:100%}
.r-track{width:100%;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;position:relative}
.r-fill{height:100%;border-radius:3px;transition:width .5s}
.r-fill-p{background:linear-gradient(90deg,var(--green2),var(--green))}
.r-fill-n{background:linear-gradient(90deg,var(--red2),var(--red))}
.r-marks{display:flex;justify-content:space-between;margin-top:5px}
.r-mark{font-size:8px;color:var(--muted)}
.r-target-line{position:absolute;right:50%;top:-1px;bottom:-1px;width:1px;background:rgba(255,255,255,.1)}
/* STATS */
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.stat-c{background:rgba(15,21,32,.88);border:1px solid var(--border2);border-radius:12px;padding:9px 10px;display:flex;flex-direction:column;gap:3px;transition:border-color .15s}
.stat-c:hover{border-color:var(--border)}
.stat-lbl{font-size:9px;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.stat-val{font-size:13px;font-weight:600}
.c-gold{color:var(--gold)}.c-blue{color:var(--blue)}.c-purple{color:var(--purple)}.c-green{color:var(--green)}.c-red{color:var(--red)}.c-muted{color:var(--text2)}
/* ACCOUNT PANEL */
.acct-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px}
.acct-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(24,46,69,.3)}
.acct-row:last-child{border-bottom:none}
.acct-lbl{font-size:9px;color:var(--muted);letter-spacing:.07em;text-transform:uppercase}
.acct-val{font-size:12px;font-weight:600}
.acct-bar-wrap{margin-top:6px}
.acct-bar-lbl{display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-bottom:3px}
.acct-bar{height:4px;background:var(--bg4);border-radius:2px;overflow:hidden}
.acct-bar-fill{height:100%;border-radius:2px;transition:width .5s}
/* STAGE PILL */
.stage-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:10px;font-weight:600}
.s-INITIAL{background:rgba(48,69,96,.2);color:var(--text2);border:1px solid var(--border2)}
.s-BREAKEVEN{background:rgba(61,158,255,.1);color:var(--blue);border:1px solid rgba(61,158,255,.25)}
.s-LOCK{background:rgba(0,229,160,.09);color:var(--green);border:1px solid rgba(0,229,160,.22)}
.s-TRAILING{background:rgba(168,85,247,.1);color:var(--purple);border:1px solid rgba(168,85,247,.25)}
.s-TIME_LOCK{background:rgba(245,166,35,.1);color:#f5a623;border:1px solid rgba(245,166,35,.25)}
.stage-dot{width:5px;height:5px;border-radius:50%;background:currentColor}
/* CLOSED */
.closed-banner{margin:10px 16px;padding:8px 12px;border-radius:999px;background:rgba(48,69,96,.1);border:1px solid var(--border2);font-size:10px;color:var(--text2);text-align:center;letter-spacing:.05em}
.result-row{display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:rgba(15,21,32,.88);border-radius:12px;border:1px solid var(--border2);margin-bottom:5px}
.rr-lbl{font-size:9px;color:var(--muted);letter-spacing:.07em;text-transform:uppercase}
.rr-val{font-size:13px;font-weight:700}
/* BOTTOM NAV */
.bnav{display:none;height:52px;background:rgba(10,15,24,.9);border-top:1px solid var(--border2);padding-bottom:var(--safe-bot);backdrop-filter:blur(14px)}
.bnav-tabs{display:flex;height:52px}
.bnav-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:none;border:none;color:var(--muted);cursor:pointer;font-size:9px;letter-spacing:.06em;text-transform:uppercase;transition:color .15s;font-family:var(--mono)}
.bnav-tab.active{color:var(--blue)}
.bnav-tab svg{width:18px;height:18px}
/* OVERLAY */
.overlay{display:none;position:fixed;inset:0;background:rgba(9,15,26,.66);z-index:150;backdrop-filter:blur(5px)}
.overlay.visible{display:block}
/* RESPONSIVE */
@media(max-width:1024px){
  .wl{position:fixed;top:48px;left:0;bottom:52px;z-index:160;transform:translateX(-100%);box-shadow:4px 0 32px rgba(0,0,0,.6)}
  .wl.open{transform:translateX(0)}
  .sb{position:fixed;top:48px;right:0;bottom:52px;z-index:160;transform:translateX(100%);box-shadow:-4px 0 32px rgba(0,0,0,.6)}
  .sb.open{transform:translateX(0)}
  .bnav{display:flex}.nav-menu-btn{display:flex}.nav-time{display:none}
  .layout{height:calc(100vh - 48px - 52px - var(--safe-top) - var(--safe-bot))}
}
@media(max-width:768px){.nav{padding:0 10px}.nav-logo{margin-right:10px}.nav-price{font-size:15px;min-width:70px}.wl{width:240px}.sb{width:280px}}
@media(max-width:480px){.nav-logo span{display:none}.nav-live{display:none}.nav-pill{font-size:9px;padding:2px 6px}.nav-price{font-size:14px;min-width:65px}.wl,.sb{width:100vw;min-width:unset}.pnl-val{font-size:26px}}
@media(max-width:1024px) and (orientation:landscape) and (max-height:500px){.nav{height:40px}.bnav{height:44px}.layout{height:calc(100vh - 40px - 44px - var(--safe-top) - var(--safe-bot))}.wl,.sb{top:40px;bottom:44px}.pnl-val{font-size:20px}.r-big{font-size:22px}.sec{padding:8px 12px}}
@media(min-width:1400px){.wl{width:210px}.sb{width:260px}}
@media(min-width:1800px){.wl{width:240px}.sb{width:290px}}

/* VERSION C PREMIUM OVERRIDES */
html{background:var(--bg)}
body::before{content:'';position:fixed;inset:0;pointer-events:none;background:linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px);background-size:74px 74px;mask-image:radial-gradient(circle at center,black 42%,transparent 92%);opacity:.18}
.nav{
  background:linear-gradient(180deg,rgba(9,15,25,.9),rgba(7,12,20,.82));
  border-bottom:1px solid rgba(61,158,255,.12);
  box-shadow:0 18px 48px rgba(0,0,0,.26);
}
.nav-logo{
  padding:7px 10px;
  border:1px solid rgba(61,158,255,.12);
  border-radius:14px;
  background:rgba(12,18,30,.72);
}
.nav-sym,.nav-price{
  text-shadow:0 0 18px rgba(61,158,255,.08);
}
.nav-actions{
  gap:10px;
}
.nav-btn{
  background:linear-gradient(180deg,rgba(14,22,36,.92),rgba(10,16,26,.88));
  border-color:rgba(61,158,255,.14);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
}
.layout{
  position:relative;
}
.wl,.sb{
  background:linear-gradient(180deg,rgba(11,18,30,.9),rgba(8,13,22,.86));
  border-color:rgba(61,158,255,.1);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
.wl-hdr,.ind-toolbar{
  background:linear-gradient(180deg,rgba(13,21,34,.88),rgba(10,16,26,.82));
}
.wl-item{
  margin:8px 10px 0;
  border:1px solid transparent;
  border-radius:18px;
  background:rgba(10,17,29,.32);
}
.wl-item.active{
  background:linear-gradient(180deg,rgba(19,30,48,.86),rgba(13,21,34,.8));
  border-color:rgba(61,158,255,.12);
  box-shadow:0 14px 30px rgba(0,0,0,.18);
}
.wl-item:hover{
  background:rgba(18,28,44,.68);
  border-color:rgba(61,158,255,.1);
}
#chart-wrap{
  background:linear-gradient(180deg,rgba(7,12,20,.3),rgba(5,8,15,.02));
}
#chart-container{
  border-left:1px solid rgba(61,158,255,.04);
  border-right:1px solid rgba(61,158,255,.04);
}
.ind-btn{
  background:linear-gradient(180deg,rgba(16,25,40,.92),rgba(11,18,30,.88));
  border-color:rgba(61,158,255,.12);
}
.sub-panel{
  background:linear-gradient(180deg,rgba(8,13,22,.96),rgba(6,10,18,.94));
}
.panel-label{
  color:#7d9abc;
}
.pnl-hero{
  padding:20px 18px 18px;
  background:
    radial-gradient(circle at top left,rgba(61,158,255,.08),transparent 38%),
    linear-gradient(180deg,rgba(13,21,34,.82),rgba(9,15,25,.7));
}
.pnl-hero.loss{
  background:
    radial-gradient(circle at top left,rgba(255,61,90,.08),transparent 38%),
    linear-gradient(180deg,rgba(13,21,34,.82),rgba(9,15,25,.7));
}
.sec{
  position:relative;
  padding:15px 16px;
}
.sec::after{
  content:'';
  position:absolute;
  left:16px;
  right:16px;
  bottom:0;
  height:1px;
  background:linear-gradient(90deg,transparent,rgba(61,158,255,.12),transparent);
}
.sec:last-child::after,.sec:nth-last-child(2)::after{display:none}
.lv,.stat-c,.result-row{
  border:1px solid rgba(61,158,255,.1);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
.lv{
  border-radius:16px;
}
.stat-c{
  border-radius:16px;
  background:linear-gradient(180deg,rgba(15,24,39,.94),rgba(9,15,25,.9));
}
.closed-banner{
  background:linear-gradient(180deg,rgba(14,22,36,.9),rgba(10,16,26,.86));
  border-color:rgba(61,158,255,.12);
}
.bnav{
  background:linear-gradient(180deg,rgba(10,15,24,.94),rgba(8,13,22,.9));
}
.bnav-tab.active{
  text-shadow:0 0 18px rgba(61,158,255,.24);
}
@media(max-width:1024px){
  .wl,.sb{
    background:linear-gradient(180deg,rgba(10,16,27,.96),rgba(8,13,22,.94));
  }
}
@media(max-width:640px){
  .nav{
    padding:0 10px;
  }
  .wl-item{
    margin:8px 8px 0;
  }
  .sec{
    padding:14px 12px;
  }
}
/* TERMINAL UI */
.layout{
  gap:14px;
  padding:14px;
  align-items:stretch;
  min-height:0;
}
.wl{
  width:270px;
  min-width:270px;
  border-radius:28px;
  overflow:hidden;
  padding:14px;
  gap:12px;
  min-height:0;
}
.wl-scroll{
  min-height:0;
  border:1px solid rgba(61,158,255,.08);
  border-radius:22px;
  background:rgba(7,12,20,.42);
}
.wl-hdr{
  padding:0 4px;
  border-bottom:none;
}
.side-card,.terminal-card,.chart-shell,.metric-card{
  border:1px solid rgba(87,176,255,.14);
  background:linear-gradient(180deg,rgba(21,33,52,.95),rgba(13,20,33,.9));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 40px rgba(3,8,16,.2);
}
.side-card{
  border-radius:24px;
  padding:16px;
}
.side-card-label,.terminal-card-label,.chart-eyebrow{
  font-size:9px;
  color:var(--muted);
  letter-spacing:.16em;
  text-transform:uppercase;
}
.workspace-user{
  margin-top:10px;
  font-family:var(--display);
  font-size:18px;
  font-weight:700;
}
.workspace-balance{
  margin-top:8px;
  font-family:var(--display);
  font-size:38px;
  font-weight:800;
  line-height:1;
}
.workspace-sub{
  margin-top:6px;
  font-size:10px;
  color:var(--text2);
}
.workspace-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:10px;
  margin-top:16px;
}
.workspace-stat{
  padding:10px 0;
  border-top:1px solid rgba(61,158,255,.08);
}
.workspace-stat-label{
  font-size:8px;
  color:var(--muted);
  letter-spacing:.12em;
  text-transform:uppercase;
  margin-bottom:5px;
}
.workspace-stat-value{
  font-size:12px;
  font-weight:700;
}
.workspace-progress{
  margin-top:14px;
}
.workspace-progress-top{
  display:flex;
  justify-content:space-between;
  font-size:9px;
  color:var(--text2);
  margin-bottom:6px;
}
.workspace-bar{
  height:5px;
  background:rgba(255,255,255,.05);
  border-radius:999px;
  overflow:hidden;
}
.workspace-bar-fill{
  height:100%;
  width:0%;
  background:linear-gradient(90deg,var(--green2),var(--blue));
  border-radius:999px;
  transition:width .5s ease;
}
.telemetry-card{
  margin-top:auto;
}
.telemetry-list{
  display:flex;
  flex-direction:column;
  gap:10px;
  margin-top:12px;
}
.telemetry-row{
  display:flex;
  justify-content:space-between;
  gap:8px;
  font-size:10px;
}
.telemetry-row span:first-child{
  color:var(--muted);
  text-transform:uppercase;
  letter-spacing:.08em;
}
#chart-wrap{
  gap:12px;
}
.terminal-kpis{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:12px;
}
.metric-card{
  border-radius:24px;
  padding:16px 18px;
  position:relative;
  overflow:hidden;
}
.metric-card::after{
  content:'';
  position:absolute;
  left:18px;
  right:18px;
  bottom:0;
  height:2px;
  border-radius:999px;
  background:linear-gradient(90deg,transparent,rgba(61,158,255,.8),transparent);
  opacity:.8;
}
.metric-card:nth-child(2)::after{background:linear-gradient(90deg,transparent,rgba(0,229,160,.85),transparent)}
.metric-card:nth-child(3)::after{background:linear-gradient(90deg,transparent,rgba(245,166,35,.85),transparent)}
.metric-card:nth-child(4)::after{background:linear-gradient(90deg,transparent,rgba(255,61,90,.85),transparent)}
.metric-label{
  font-size:9px;
  color:var(--muted);
  text-transform:uppercase;
  letter-spacing:.13em;
}
.metric-value{
  margin-top:12px;
  font-family:var(--display);
  font-size:32px;
  font-weight:800;
  line-height:1;
}
.metric-sub{
  margin-top:8px;
  font-size:10px;
  color:var(--text2);
}
.chart-shell{
  flex:1;
  min-height:0;
  border-radius:28px;
  padding:14px;
  position:relative;
  display:flex;
  flex-direction:column;
  gap:10px;
  transition:padding .32s cubic-bezier(.22,1,.36,1),border-radius .32s cubic-bezier(.22,1,.36,1),box-shadow .32s ease,background .32s ease;
}
.chart-shell::before{
  content:'';
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius:inherit;
  opacity:0;
  border:1px solid rgba(61,158,255,.18);
  box-shadow:0 0 0 1px rgba(255,255,255,.03) inset,0 0 40px rgba(61,158,255,.08),0 0 80px rgba(0,229,160,.06);
  transition:opacity .32s ease;
}
.chart-head{
  display:flex;
  justify-content:space-between;
  gap:16px;
  align-items:flex-end;
  padding:4px 6px 0;
}
.chart-title{
  margin-top:4px;
  font-family:var(--display);
  font-size:26px;
  font-weight:800;
  line-height:1;
}
.chart-sub{
  margin-top:6px;
  font-size:10px;
  color:var(--text2);
}
.chart-structure{
  font-size:10px;
  color:var(--text2);
  text-align:right;
}
.chart-structure strong{
  display:block;
  margin-top:4px;
  color:var(--text);
  font-size:11px;
  letter-spacing:.08em;
}
.chart-head-side{
  display:flex;
  align-items:flex-end;
  gap:12px;
  margin-left:auto;
}
.chart-actions{
  display:flex;
  align-items:center;
}
.chart-fs-btn{
  position:relative;
  overflow:hidden;
  min-height:38px;
  padding:0 12px;
  border-radius:999px;
  border:1px solid rgba(61,158,255,.16);
  background:linear-gradient(180deg,rgba(10,16,26,.94),rgba(8,13,22,.88));
  color:var(--text);
  display:inline-flex;
  align-items:center;
  gap:8px;
  cursor:pointer;
  font-family:var(--mono);
  font-size:10px;
  letter-spacing:.08em;
  text-transform:uppercase;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 10px 22px rgba(0,0,0,.18);
  transition:transform .18s ease,border-color .18s ease,box-shadow .24s ease,background .24s ease,color .18s ease;
}
.chart-fs-btn::before{
  content:'';
  position:absolute;
  inset:1px;
  border-radius:inherit;
  background:linear-gradient(135deg,rgba(61,158,255,.12),rgba(0,229,160,.04));
  opacity:0;
  transition:opacity .2s ease;
}
.chart-fs-btn:hover{
  transform:translateY(-1px);
  border-color:rgba(61,158,255,.32);
  color:#eef7ff;
  box-shadow:0 0 0 1px rgba(61,158,255,.08) inset,0 12px 26px rgba(61,158,255,.16);
}
.chart-fs-btn:hover::before,
.chart-fs-btn:focus-visible::before{
  opacity:1;
}
.chart-fs-btn:focus-visible{
  outline:none;
  border-color:rgba(61,158,255,.38);
  box-shadow:0 0 0 1px rgba(61,158,255,.12) inset,0 0 0 3px rgba(61,158,255,.14);
}
.chart-fs-btn.is-active{
  border-color:rgba(0,229,160,.3);
  color:var(--green);
  box-shadow:0 0 0 1px rgba(0,229,160,.08) inset,0 14px 30px rgba(0,229,160,.14);
}
.chart-fs-btn svg,
.chart-fs-text,
.chart-fs-key{
  position:relative;
  z-index:1;
}
.chart-fs-btn svg{
  width:14px;
  height:14px;
}
.chart-fs-key{
  padding:3px 6px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.06);
  background:rgba(255,255,255,.04);
  color:var(--text2);
  font-size:9px;
}
.terminal-kpis,
.market-grid{
  overflow:hidden;
  max-height:1200px;
  transition:opacity .22s ease,transform .32s cubic-bezier(.22,1,.36,1),max-height .32s cubic-bezier(.22,1,.36,1);
}
.nav,
.wl,
.sb,
.bnav,
.overlay{
  transition:opacity .24s ease,transform .32s cubic-bezier(.22,1,.36,1),visibility 0s linear;
}
body.chart-fullscreen-active{
  overflow:hidden;
}
body.chart-fullscreen-active .nav,
body.chart-fullscreen-active .wl,
body.chart-fullscreen-active .sb,
body.chart-fullscreen-active .bnav,
body.chart-fullscreen-active .overlay{
  opacity:0;
  visibility:hidden;
  pointer-events:none;
}
body.chart-fullscreen-active .nav{
  transform:translateY(-18px);
}
body.chart-fullscreen-active .wl{
  transform:translateX(-28px);
}
body.chart-fullscreen-active .sb{
  transform:translateX(28px);
}
body.chart-fullscreen-active .bnav{
  transform:translateY(18px);
}
#chart-wrap{
  transition:padding .32s cubic-bezier(.22,1,.36,1),background .32s ease,filter .32s ease;
}
#chart-wrap.is-fullscreen{
  position:fixed;
  inset:0;
  width:100vw;
  height:100vh;
  height:100dvh;
  z-index:400;
  padding:calc(var(--safe-top) + 14px) 14px calc(var(--safe-bot) + 14px);
  background:
    radial-gradient(circle at 18% 0%,rgba(61,158,255,.18),transparent 28%),
    radial-gradient(circle at 84% 0%,rgba(0,229,160,.14),transparent 24%),
    linear-gradient(180deg,rgba(4,7,13,.96),rgba(4,7,13,.98));
  backdrop-filter:blur(18px);
  overflow:hidden;
}
#chart-wrap.is-fullscreen::before{
  opacity:1;
  background:
    radial-gradient(circle at 14% 8%,rgba(61,158,255,.16),transparent 22%),
    radial-gradient(circle at 86% 12%,rgba(0,229,160,.1),transparent 18%);
}
#chart-wrap.is-fullscreen::after{
  content:'';
  position:absolute;
  inset:0;
  pointer-events:none;
  background:
    linear-gradient(180deg,rgba(255,255,255,.025),transparent 22%),
    radial-gradient(circle at center,transparent 56%,rgba(0,0,0,.18) 100%);
}
#chart-wrap.is-fullscreen .terminal-kpis,
#chart-wrap.is-fullscreen .market-grid{
  opacity:0;
  transform:translateY(-12px);
  max-height:0;
  pointer-events:none;
}
#chart-wrap.is-fullscreen .chart-shell{
  flex:1 1 auto;
  min-height:0;
  padding:12px;
  border-radius:30px;
  background:
    linear-gradient(180deg,rgba(10,16,26,.96),rgba(6,10,18,.94)),
    radial-gradient(circle at top left,rgba(61,158,255,.08),transparent 34%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.05),
    0 0 0 1px rgba(61,158,255,.14),
    0 24px 70px rgba(0,0,0,.42),
    0 0 80px rgba(61,158,255,.08);
}
#chart-wrap.is-fullscreen .chart-shell::before{
  opacity:1;
}
#chart-wrap.is-fullscreen .chart-head{
  align-items:center;
  padding:0 4px;
}
#chart-wrap.is-fullscreen .ind-toolbar{
  min-height:38px;
  border-color:rgba(61,158,255,.16);
  background:linear-gradient(180deg,rgba(14,22,36,.92),rgba(8,13,22,.88));
}
#chart-wrap.is-fullscreen #chart-container{
  flex:1 1 auto;
  min-height:0;
  height:auto;
  border-radius:20px;
  overflow:hidden;
  box-shadow:inset 0 0 0 1px rgba(61,158,255,.08);
}
#chart-wrap.is-fullscreen .sub-panel{
  border-top-color:rgba(61,158,255,.12);
}
.ind-toolbar{
  border:1px solid rgba(61,158,255,.08);
  border-radius:18px;
  padding:0 8px;
}
.market-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:10px;
}
.market-card{
  border:1px solid rgba(61,158,255,.08);
  border-radius:18px;
  padding:14px 14px 12px;
  background:rgba(9,15,25,.68);
}
.market-label{
  font-size:9px;
  color:var(--muted);
  text-transform:uppercase;
  letter-spacing:.12em;
}
.market-value{
  margin-top:8px;
  font-family:var(--display);
  font-size:22px;
  font-weight:800;
  line-height:1;
}
.market-sub{
  margin-top:6px;
  font-size:10px;
  color:var(--text2);
}
.sb{
  width:330px;
  min-width:330px;
  border-radius:28px;
  padding:14px;
  display:flex;
  flex-direction:column;
  gap:12px;
  min-height:0;
  height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 28px);
  max-height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 28px);
  overflow-y:auto;
  overflow-x:hidden;
  overscroll-behavior:contain;
  scrollbar-gutter:stable;
  -webkit-overflow-scrolling:touch;
}
.sb > *{flex-shrink:0}
.terminal-card{
  border-radius:24px;
  overflow:hidden;
}
.terminal-card-hdr{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:14px 16px;
  border-bottom:1px solid rgba(61,158,255,.08);
  background:rgba(12,18,29,.72);
}
.terminal-card-title{
  font-size:9px;
  color:var(--muted);
  letter-spacing:.15em;
  text-transform:uppercase;
}
.terminal-card-meta{
  font-size:9px;
  color:var(--text2);
}
.terminal-card-body{
  padding:14px 16px 16px;
}
.book-grid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:12px;
}
.book-side-title{
  margin-bottom:8px;
  font-size:9px;
  color:var(--muted);
  text-transform:uppercase;
  letter-spacing:.12em;
}
.book-side-title.asks{color:var(--red)}
.book-side-title.bids{color:var(--green)}
.book-list{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.book-row,.tape-row{
  position:relative;
  display:grid;
  grid-template-columns:1fr auto;
  gap:8px;
  padding:6px 8px;
  border-radius:12px;
  overflow:hidden;
  background:rgba(8,13,22,.66);
}
.book-row::before,.tape-row::before{
  content:'';
  position:absolute;
  inset:0;
  width:var(--depth,0%);
  opacity:.16;
}
.book-row.ask::before{background:linear-gradient(90deg,transparent,var(--red))}
.book-row.bid::before{background:linear-gradient(90deg,transparent,var(--green))}
.book-price,.tape-price{
  position:relative;
  z-index:1;
  font-size:10px;
  font-weight:700;
}
.book-size,.tape-meta{
  position:relative;
  z-index:1;
  font-size:9px;
  color:var(--text2);
}
.trade-tape{
  display:flex;
  flex-direction:column;
  gap:8px;
}
.tape-price.up{color:var(--green)}
.tape-price.down{color:var(--red)}
.exec-pill{
  padding:4px 10px;
  border-radius:999px;
  font-size:9px;
  letter-spacing:.08em;
  background:rgba(0,229,160,.08);
  color:var(--green);
  border:1px solid rgba(0,229,160,.16);
}
.exec-body{
  padding:16px;
  display:flex;
  flex-direction:column;
  gap:14px;
}
.exec-toggle,.exec-mode{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:8px;
}
.exec-btn,.exec-mode-btn{
  min-height:38px;
  border-radius:999px;
  border:1px solid rgba(61,158,255,.12);
  background:rgba(9,15,25,.72);
  color:var(--text2);
  font-family:var(--mono);
  font-size:11px;
}
.exec-btn.active{
  background:linear-gradient(180deg,rgba(0,229,160,.18),rgba(0,229,160,.08));
  color:var(--green);
  border-color:rgba(0,229,160,.24);
}
.exec-btn.sell-active{
  background:linear-gradient(180deg,rgba(255,61,90,.18),rgba(255,61,90,.08));
  color:var(--red);
  border-color:rgba(255,61,90,.24);
}
.exec-mode-btn.active{
  color:var(--text);
  border-color:rgba(61,158,255,.2);
}
.exec-slider-group{
  display:flex;
  flex-direction:column;
  gap:10px;
}
.exec-slider-label{
  display:flex;
  justify-content:space-between;
  font-size:9px;
  color:var(--muted);
  text-transform:uppercase;
  letter-spacing:.1em;
}
.exec-slider{
  height:5px;
  border-radius:999px;
  overflow:hidden;
  background:rgba(255,255,255,.06);
}
.exec-slider-fill{
  height:100%;
  width:0%;
  border-radius:999px;
  background:linear-gradient(90deg,var(--blue),var(--green));
  transition:width .5s ease;
}
.exec-symbol-row{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:10px;
  padding-top:4px;
}
.exec-symbol{
  font-family:var(--display);
  font-size:22px;
  font-weight:800;
  line-height:1;
}
.exec-side{
  padding:4px 10px;
  border-radius:999px;
  font-size:10px;
  border:1px solid rgba(61,158,255,.14);
  background:rgba(61,158,255,.08);
  color:var(--blue);
}
.exec-pnl-panel{
  padding:14px;
  border-radius:18px;
  background:rgba(8,13,22,.72);
  border:1px solid rgba(61,158,255,.08);
}
.exec-pnl-top{
  display:flex;
  justify-content:space-between;
  gap:10px;
  font-size:9px;
  color:var(--muted);
  text-transform:uppercase;
  letter-spacing:.1em;
}
.exec-pnl-value{
  margin-top:8px;
  font-family:var(--display);
  font-size:30px;
  font-weight:800;
  line-height:1;
}
.exec-pnl-sub{
  margin-top:6px;
  display:flex;
  gap:12px;
  font-size:10px;
}
.details-card .sec{
  padding:14px 16px;
}
.details-card .pnl-hero{
  border-bottom:1px solid rgba(61,158,255,.08);
}
.book-empty{
  padding:12px;
  color:var(--muted);
  font-size:10px;
  text-align:center;
}
/* ELITE UI REFRESH */
:root{
  --surface-0:rgba(255,255,255,.78);
  --surface-1:rgba(255,255,255,.9);
  --surface-2:rgba(250,252,255,.96);
  --surface-3:rgba(248,251,255,.98);
  --panel-border:rgba(19,33,54,.14);
  --panel-border-strong:rgba(19,33,54,.22);
  --panel-shadow:0 20px 52px rgba(17,30,48,.14);
  --panel-shadow-hover:0 28px 64px rgba(17,30,48,.18);
  --glass-line:rgba(19,33,54,.08);
  --glow-blue:rgba(67,111,243,.18);
  --glow-green:rgba(31,158,116,.14);
  --glow-red:rgba(217,79,99,.14);
  --glow-gold:rgba(207,148,64,.16);
}
body{
  font-family:var(--sans);
  letter-spacing:-.012em;
  background:
    radial-gradient(circle at 12% -6%,rgba(67,111,243,.14),transparent 28%),
    radial-gradient(circle at 88% 0%,rgba(31,158,116,.08),transparent 24%),
    radial-gradient(circle at 50% 118%,rgba(255,255,255,.2),transparent 30%),
    linear-gradient(180deg,#f8f9fb 0%,#f2f5fa 42%,#edf2f8 100%);
}
body::after{
  content:'';
  position:fixed;
  inset:-16% -12%;
  pointer-events:none;
  background:
    radial-gradient(circle at 18% 16%,rgba(61,158,255,.16),transparent 22%),
    radial-gradient(circle at 76% 18%,rgba(0,229,160,.1),transparent 18%),
    radial-gradient(circle at 48% 78%,rgba(255,255,255,.05),transparent 16%);
  opacity:.55;
  filter:blur(120px);
  animation:ambientDrift 18s ease-in-out infinite alternate;
}
@keyframes ambientDrift{
  0%{transform:translate3d(-2%,0,0) scale(1)}
  100%{transform:translate3d(2%,-2%,0) scale(1.04)}
}
.nav{
  padding:0 20px;
  background:rgba(7,12,20,.78);
  border-bottom-color:rgba(122,154,209,.14);
  box-shadow:0 18px 44px rgba(0,0,0,.24);
}
.nav-logo{
  border-radius:999px;
  border-color:rgba(61,158,255,.18);
  background:linear-gradient(180deg,rgba(13,20,34,.96),rgba(9,14,24,.88));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 12px 24px rgba(0,0,0,.14);
}
.nav-sym{
  font-size:16px;
  letter-spacing:-.03em;
}
.nav-price{
  min-width:96px;
  font-family:var(--display);
  font-size:26px;
  font-weight:800;
  letter-spacing:-.05em;
}
.nav-pill{
  letter-spacing:.14em;
}
.nav-btn{
  min-height:34px;
  padding:0 14px;
  border-color:rgba(122,154,209,.16);
  background:linear-gradient(180deg,rgba(13,20,33,.92),rgba(8,13,23,.86));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
}
.layout{
  position:relative;
  z-index:1;
  display:grid;
  grid-template-columns:minmax(252px,286px) minmax(0,1fr) minmax(320px,360px);
  gap:18px;
  padding:18px;
  align-items:stretch;
}
.layout > *{
  align-self:stretch;
}
.wl,
.sb{
  width:auto;
  min-width:0;
  padding:16px;
  gap:14px;
  height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 36px);
  max-height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 36px);
  border-radius:32px;
  background:linear-gradient(180deg,rgba(17,27,43,.88),rgba(10,16,26,.92));
  border:1px solid var(--panel-border);
  box-shadow:var(--panel-shadow);
}
#chart-wrap{
  gap:16px;
}
.side-card,
.terminal-card,
.chart-shell,
.metric-card,
.market-card,
.stat-c,
.lv,
.result-row{
  border:1px solid var(--panel-border);
  background:linear-gradient(180deg,rgba(20,31,48,.95),rgba(12,19,31,.9));
  box-shadow:inset 0 1px 0 var(--glass-line),var(--panel-shadow);
}
.side-card:hover,
.terminal-card:hover,
.metric-card:hover,
.market-card:hover,
.stat-c:hover,
.lv:hover,
.result-row:hover{
  transform:translateY(-2px);
  border-color:var(--panel-border-strong);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),var(--panel-shadow-hover);
}
.side-card,
.terminal-card,
.chart-shell{
  border-radius:30px;
  overflow:hidden;
}
.terminal-kpis{
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:14px;
}
.metric-card{
  min-height:136px;
  padding:20px 22px 18px;
  border-radius:26px;
  position:relative;
}
.metric-card::before{
  content:'';
  position:absolute;
  inset:0;
  pointer-events:none;
  background:radial-gradient(circle at top left,rgba(255,255,255,.06),transparent 52%);
  opacity:.75;
}
.metric-label,
.market-label,
.side-card-label,
.terminal-card-title,
.chart-eyebrow,
.wl-hdr,
.sec-ttl,
.stat-lbl,
.pm-lbl,
.panel-label{
  color:#7f95b5;
  letter-spacing:.18em;
}
.metric-value{
  margin-top:18px;
  font-size:48px;
  line-height:.92;
  letter-spacing:-.05em;
}
.metric-sub{
  margin-top:12px;
  font-size:11px;
  color:#8fa6c7;
}
.workspace-card{
  padding:18px 18px 16px;
}
.workspace-user{
  margin-top:14px;
  font-size:24px;
  letter-spacing:-.04em;
}
.workspace-balance{
  margin-top:12px;
  font-size:56px;
  letter-spacing:-.065em;
}
.workspace-sub{
  margin-top:10px;
  font-size:12px;
  color:#8fa6c7;
}
.workspace-stat{
  padding:12px 0;
}
.workspace-stat-label{
  font-size:8px;
  letter-spacing:.16em;
}
.workspace-stat-value{
  font-size:14px;
  font-weight:700;
}
.telemetry-card{
  margin-top:0;
}
.wl-hdr{
  padding:2px 6px 0;
  border-bottom:none;
}
.wl-scroll{
  padding:8px;
  border-radius:26px;
  background:rgba(6,11,18,.62);
  border:1px solid rgba(122,154,209,.08);
}
.wl-item{
  margin:0 0 10px;
  padding:14px 16px;
  border-radius:20px;
  border-left-width:1px;
  background:linear-gradient(180deg,rgba(13,20,32,.84),rgba(10,16,26,.78));
}
.wl-item:last-child{
  margin-bottom:0;
}
.wl-item.active{
  border-color:rgba(61,158,255,.18);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 22px 44px rgba(0,0,0,.22);
}
.wl-item:hover{
  background:linear-gradient(180deg,rgba(17,26,41,.92),rgba(11,18,29,.86));
  border-color:rgba(61,158,255,.18);
}
.wl-sym{
  font-size:12px;
  letter-spacing:-.02em;
}
.wl-pnl{
  font-family:var(--display);
  font-size:14px;
  letter-spacing:-.03em;
}
.chart-shell{
  padding:18px;
  gap:14px;
  background:
    linear-gradient(180deg,rgba(12,19,30,.97),rgba(8,13,23,.94)),
    radial-gradient(circle at top left,rgba(61,158,255,.08),transparent 34%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.05),
    0 0 0 1px rgba(61,158,255,.08),
    0 28px 70px rgba(0,0,0,.3);
}
.chart-head{
  padding:10px 12px 4px;
}
.chart-title{
  margin-top:10px;
  font-size:clamp(34px,4vw,58px);
  letter-spacing:-.06em;
}
.chart-sub{
  margin-top:10px;
  font-size:12px;
  color:#93a9c7;
}
.chart-head-side{
  gap:14px;
}
.chart-structure{
  min-width:170px;
  padding:10px 14px 12px;
  border-radius:20px;
  background:rgba(11,18,29,.74);
  border:1px solid rgba(122,154,209,.12);
  text-align:left;
}
.chart-structure strong{
  margin-top:8px;
  font-size:16px;
  letter-spacing:-.03em;
}
.chart-fs-btn{
  min-height:42px;
  padding:0 14px;
  background:linear-gradient(180deg,rgba(14,22,36,.94),rgba(10,15,26,.88));
}
.ind-toolbar{
  min-height:44px;
  height:auto;
  padding:6px;
  border-radius:22px;
  border-color:rgba(122,154,209,.14);
  background:rgba(8,13,22,.78);
}
.ind-btn{
  min-height:30px;
  padding:0 12px;
  border-radius:999px;
  font-size:10px;
  letter-spacing:.1em;
  background:rgba(13,21,34,.72);
}
.market-grid{
  gap:14px;
}
.market-card{
  min-height:94px;
  padding:16px 18px;
  border-radius:22px;
}
.market-value{
  margin-top:12px;
  font-size:36px;
  letter-spacing:-.055em;
}
.market-sub{
  margin-top:10px;
  font-size:11px;
  color:#8fa6c7;
}
#chart-container{
  border-radius:24px;
  background:linear-gradient(180deg,rgba(5,9,16,.92),rgba(4,7,13,.96));
  box-shadow:
    inset 0 0 0 1px rgba(61,158,255,.08),
    0 28px 50px rgba(0,0,0,.2);
}
#chart-container:hover{
  box-shadow:
    inset 0 0 0 1px rgba(61,158,255,.16),
    0 0 0 1px rgba(61,158,255,.06),
    0 32px 58px rgba(0,0,0,.24),
    0 0 40px rgba(61,158,255,.08);
}
.sub-panel{
  border-top-color:rgba(122,154,209,.14);
  background:linear-gradient(180deg,rgba(10,15,24,.96),rgba(7,11,20,.94));
}
.terminal-card-hdr{
  padding:18px 20px;
  border-bottom-color:rgba(122,154,209,.1);
  background:linear-gradient(180deg,rgba(14,22,36,.94),rgba(10,16,26,.9));
}
.terminal-card-meta{
  color:#8fa6c7;
}
.exec-body{
  padding:18px;
  gap:16px;
}
.exec-btn,
.exec-mode-btn{
  min-height:44px;
  font-weight:600;
  letter-spacing:-.01em;
  transition:transform .18s ease,border-color .18s ease,box-shadow .22s ease,background .22s ease,color .18s ease;
}
.exec-btn:hover,
.exec-mode-btn:hover,
.nav-btn:hover,
.ind-btn:hover,
.chart-fs-btn:hover{
  transform:translateY(-1px);
}
.exec-btn:active,
.exec-mode-btn:active,
.nav-btn:active,
.ind-btn:active,
.chart-fs-btn:active{
  transform:translateY(0) scale(.985);
}
.exec-symbol{
  font-size:46px;
  letter-spacing:-.065em;
}
.exec-side{
  padding:6px 12px;
  letter-spacing:.12em;
}
.exec-pnl-panel{
  padding:18px;
  border-radius:24px;
  background:linear-gradient(180deg,rgba(9,15,24,.84),rgba(8,12,21,.76));
  border-color:rgba(122,154,209,.12);
}
.exec-pnl-top{
  font-size:10px;
  color:#7f95b5;
}
.exec-pnl-value{
  margin-top:12px;
  font-size:48px;
  letter-spacing:-.05em;
}
.exec-pnl-sub{
  margin-top:10px;
  font-size:11px;
  color:#8fa6c7;
}
.exec-exposure{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:12px;
  align-items:center;
  padding:16px 18px;
  border-radius:22px;
  border:1px solid rgba(245,166,35,.14);
  background:
    linear-gradient(180deg,rgba(18,15,11,.88),rgba(10,12,18,.88)),
    radial-gradient(circle at top left,rgba(245,166,35,.1),transparent 50%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 36px rgba(0,0,0,.2);
}
.exec-exposure-label{
  font-size:9px;
  color:#8fa6c7;
  letter-spacing:.16em;
  text-transform:uppercase;
}
.exec-exposure-value{
  margin-top:10px;
  font-family:var(--display);
  font-size:34px;
  font-weight:800;
  line-height:1;
  letter-spacing:-.05em;
  color:#f7f1d5;
}
.exec-exposure-side{
  display:flex;
  flex-direction:column;
  align-items:flex-end;
  gap:8px;
}
.exec-exposure-chip{
  padding:5px 10px;
  border-radius:999px;
  border:1px solid rgba(245,166,35,.18);
  background:rgba(245,166,35,.08);
  color:var(--gold);
  font-size:9px;
  letter-spacing:.14em;
  text-transform:uppercase;
}
.exec-exposure-meta{
  font-family:var(--display);
  font-size:16px;
  font-weight:700;
  letter-spacing:-.03em;
  color:var(--text);
}
.pnl-hero{
  padding:24px 20px 22px;
}
.pnl-lbl{
  font-size:10px;
}
.pnl-val{
  font-size:clamp(44px,4.8vw,60px);
  letter-spacing:-.07em;
}
.pnl-meta{
  gap:14px;
}
.pm-val{
  font-size:13px;
}
.sec{
  padding:18px 20px;
}
.sec-ttl{
  margin-bottom:14px;
}
.levels{
  gap:10px;
}
.lv{
  padding:14px 16px;
  border-radius:18px;
}
.lv-name{
  font-size:10px;
  color:#9bb2cf;
}
.lv-dist{
  margin-top:4px;
  font-size:10px;
}
.lv-price{
  font-family:var(--display);
  font-size:17px;
  font-weight:800;
  letter-spacing:-.03em;
}
.sl-indicator,
.tp-indicator{
  margin-top:8px;
  padding:8px 10px;
  border-radius:12px;
}
.r-wrap{
  gap:12px;
}
.r-big{
  font-size:clamp(40px,4vw,58px);
  letter-spacing:-.05em;
}
.r-track{
  height:8px;
  border-radius:999px;
}
.r-mark{
  letter-spacing:.06em;
}
.stats-grid{
  gap:10px;
}
.stat-c{
  min-height:82px;
  padding:14px 16px;
  border-radius:18px;
}
.stat-val{
  font-family:var(--display);
  font-size:20px;
  font-weight:800;
  letter-spacing:-.04em;
}
#acctPositions,
#acctMarginPct{
  color:#8fa6c7;
}
.book-grid{
  gap:14px;
}
.book-row,
.tape-row{
  padding:10px 12px;
  border-radius:16px;
  background:rgba(9,14,24,.76);
}
.book-price,
.tape-price{
  font-family:var(--display);
  font-size:11px;
  letter-spacing:-.02em;
}
.book-size,
.tape-meta{
  font-size:10px;
}
.result-row{
  padding:10px 12px;
  border-radius:18px;
}
.flash{
  animation:softFlash .45s ease;
}
@keyframes softFlash{
  0%{opacity:.45;transform:translateY(2px)}
  100%{opacity:1;transform:translateY(0)}
}
@media(max-width:1480px){
  .terminal-kpis,.market-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
@media(max-width:1200px){
  .layout{
    grid-template-columns:minmax(220px,252px) minmax(0,1fr) minmax(292px,320px);
    padding:10px;
    gap:10px;
  }
  .wl,.sb{
    height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 20px);
    max-height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 20px);
  }
  .workspace-balance{
    font-size:46px;
  }
  .metric-value{
    font-size:40px;
  }
  .market-value{
    font-size:30px;
  }
  .wl{
    width:240px;
    min-width:240px;
  }
  .sb{
    width:300px;
    min-width:300px;
    height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 20px);
    max-height:calc(100vh - 48px - var(--safe-top) - var(--safe-bot) - 20px);
  }
}
@media(max-width:1024px){
  .layout{
    padding:0;
    gap:0;
  }
  .wl,.sb{
    border-radius:0;
    padding:12px;
    height:auto;
    max-height:none;
  }
  #chart-wrap{
    padding:10px;
  }
}
@media(max-width:760px){
  .terminal-kpis,.market-grid,.book-grid{
    grid-template-columns:1fr;
  }
  .chart-head{
    flex-direction:column;
    align-items:flex-start;
  }
  .chart-head-side{
    width:100%;
    justify-content:space-between;
    align-items:center;
  }
}
/* RESPONSIVE SYSTEM */
.layout > *{min-width:0}
#chart-wrap{min-width:0;min-height:0}
.chart-shell{overflow:hidden}
#chart-container{min-height:360px}
@media(min-width:768px) and (max-width:1024px){
  html,body{
    height:auto;
    min-height:100%;
    overflow:auto;
  }
  body{
    min-height:100dvh;
  }
  .nav{
    height:auto;
    min-height:56px;
    padding:10px 14px;
    flex-wrap:wrap;
    align-items:center;
    gap:10px;
  }
  .nav-actions{
    flex:1 1 100%;
    order:10;
    justify-content:flex-end;
    gap:8px;
  }
  .nav-menu-btn,.bnav,.overlay{
    display:none !important;
  }
  .layout{
    display:grid;
    grid-template-columns:minmax(0,1fr) minmax(0,1fr);
    grid-template-areas:
      'chart chart'
      'watch stats';
    align-items:start;
    height:auto;
    min-height:auto;
    overflow:visible;
    padding:12px;
    gap:12px;
  }
  #chart-wrap{
    grid-area:chart;
    order:0;
    padding:0;
  }
  .wl,.sb{
    position:relative;
    inset:auto;
    transform:none !important;
    width:auto;
    min-width:0;
    max-width:none;
    height:auto;
    max-height:none;
    border-radius:24px;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 18px 40px rgba(0,0,0,.18);
    display:flex;
    overflow:visible;
  }
  .wl{grid-area:watch}
  .sb{grid-area:stats}
  .wl-scroll{
    max-height:420px;
  }
  .chart-shell{
    min-height:0;
  }
  #chart-container{
    height:min(54vh,520px);
    min-height:420px;
  }
  .terminal-kpis,.market-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .book-grid{
    grid-template-columns:1fr;
  }
}
@media(max-width:767px){
  html,body{
    height:auto;
    min-height:100%;
    overflow:auto;
    overscroll-behavior:auto;
  }
  body{
    min-height:100dvh;
    padding-bottom:calc(60px + var(--safe-bot));
  }
  .nav{
    height:auto;
    min-height:54px;
    padding:10px 12px;
    flex-wrap:wrap;
    gap:8px;
    align-items:center;
  }
  .nav-logo{
    margin-right:0;
  }
  .nav-sym,.nav-price{
    min-width:0;
  }
  .nav-live{
    margin-left:0;
  }
  .nav-actions{
    width:100%;
    order:10;
    justify-content:space-between;
    flex-wrap:wrap;
    gap:8px;
  }
  .nav-time{
    display:none;
  }
  .layout{
    display:flex;
    flex-direction:column;
    align-items:stretch;
    height:auto;
    min-height:auto;
    overflow:visible;
    padding:10px 10px 14px;
    gap:10px;
  }
  #chart-wrap{
    order:1;
    width:100%;
    padding:0;
  }
  .terminal-kpis{
    grid-template-columns:1fr 1fr;
    gap:8px;
  }
  .metric-card{
    padding:14px;
    border-radius:18px;
  }
  .metric-value{
    font-size:24px;
  }
  .chart-shell{
    border-radius:22px;
    padding:10px;
    gap:8px;
  }
  .chart-title{
    font-size:22px;
  }
  .chart-sub,.chart-structure,.metric-sub{
    font-size:9px;
  }
  .market-grid{
    grid-template-columns:1fr 1fr;
    gap:8px;
  }
  .market-card{
    border-radius:14px;
    padding:12px 12px 10px;
  }
  .exec-exposure{
    grid-template-columns:1fr;
    align-items:flex-start;
  }
  .exec-exposure-side{
    align-items:flex-start;
  }
  .exec-exposure-value{
    font-size:28px;
  }
  .market-value{
    font-size:18px;
  }
  #chart-container{
    height:min(52vh,420px);
    min-height:300px;
    border-radius:16px;
    overflow:hidden;
  }
  .sub-panel{
    min-height:56px;
  }
  .wl,.sb{
    position:relative;
    inset:auto;
    transform:none !important;
    width:100%;
    min-width:0;
    max-width:none;
    height:auto;
    max-height:none;
    border-radius:22px;
    padding:10px;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 16px 36px rgba(0,0,0,.18);
    overflow:visible;
    display:none;
  }
  .wl.open,.sb.open{
    display:flex;
  }
  .wl{
    order:2;
  }
  .sb{
    order:3;
  }
  .wl-scroll{
    max-height:42vh;
  }
  .workspace-grid,.stats-grid,.book-grid{
    grid-template-columns:1fr 1fr;
  }
  .details-card .sec{
    padding:12px;
  }
  .exec-body,.terminal-card-body{
    padding:12px;
  }
  .book-list,.trade-tape{
    gap:6px;
  }
  .exec-symbol{
    font-size:18px;
  }
  .exec-pnl-value{
    font-size:24px;
  }
  .bnav{
    display:flex !important;
    position:sticky;
    bottom:0;
    z-index:240;
  }
  .overlay{
    display:none !important;
  }
}
@media(max-width:560px){
  .nav-logo span{
    display:none;
  }
  .nav-live{
    display:none;
  }
  .nav-btn{
    padding:5px 10px;
  }
  .terminal-kpis,.market-grid,.workspace-grid,.stats-grid,.book-grid{
    grid-template-columns:1fr;
  }
  .chart-fs-btn{
    min-width:38px;
    padding:0 11px;
    justify-content:center;
  }
  .chart-fs-text,.chart-fs-key{
    display:none;
  }
  #chart-container{
    height:min(48vh,360px);
    min-height:260px;
  }
  .wl-scroll{
    max-height:38vh;
  }
}
@media(max-width:767px){
  #chart-wrap.is-fullscreen{
    padding:calc(var(--safe-top) + 8px) 8px calc(var(--safe-bot) + 8px);
  }
  #chart-wrap.is-fullscreen .chart-shell{
    padding:10px;
    border-radius:22px;
  }
  #chart-wrap.is-fullscreen #chart-container{
    border-radius:16px;
  }
}
@media(prefers-reduced-motion:reduce){
  .nav,.wl,.sb,.bnav,.overlay,#chart-wrap,.chart-shell,.chart-shell::before,.terminal-kpis,.market-grid,.chart-fs-btn{
    transition:none !important;
  }
}
${getSharedStyles()}
/* ── Dashboard V2 Stripe Layout (UI only) ───────────────────────────────── */
.dashboard-v2{
  overflow:auto !important;
  height:auto !important;
  background:var(--ui-bg) !important;
}
.dashboard-v2::before,
.dashboard-v2::after{
  display:none !important;
}
.dashboard-v2 .app-chrome{
  display:none !important;
}
.dashboard-v2 .page-shell{
  min-height:100vh;
  padding:12px 20px 20px;
  opacity:1 !important;
  filter:none !important;
  transform:none !important;
}
.dashboard-v2 .nav-shell{
  margin:0 0 16px !important;
  min-height:64px !important;
  border:1px solid var(--ui-line) !important;
  background:var(--ui-nav-bg) !important;
  box-shadow:var(--ui-shadow) !important;
}
.dashboard-v2 .nav-shell .nav-market,
.dashboard-v2 .nav-shell .nav-user{
  background:var(--ui-bg-panel) !important;
  border-color:var(--ui-line) !important;
}
.dashboard-v2 .layout{
  display:grid !important;
  grid-template-columns:minmax(260px,290px) minmax(0,1fr) minmax(300px,340px);
  gap:24px;
  align-items:start;
  height:auto !important;
  min-height:calc(100vh - 120px);
  padding:0 !important;
}
.dashboard-v2 .wl,
.dashboard-v2 .sb{
  width:auto !important;
  min-width:0 !important;
  max-width:none !important;
  background:transparent !important;
  border:none !important;
  box-shadow:none !important;
  border-radius:0 !important;
  padding:0 !important;
  gap:16px;
}
.dashboard-v2 .wl{
  position:sticky;
  top:92px;
  max-height:calc(100dvh - 112px);
  overflow:auto;
}
.dashboard-v2 .sb{
  position:sticky;
  top:92px;
  height:calc(100dvh - 112px) !important;
  max-height:calc(100dvh - 112px) !important;
  overflow:auto;
}
.dashboard-v2 #chart-wrap{
  display:flex;
  flex-direction:column;
  gap:16px;
  min-width:0;
  overflow:visible !important;
  background:transparent !important;
}
.dashboard-v2 #chart-wrap::before{
  display:none !important;
}
.dashboard-v2 .terminal-kpis{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:16px;
}
.dashboard-v2 .chart-shell,
.dashboard-v2 .metric-card,
.dashboard-v2 .market-card,
.dashboard-v2 .side-card,
.dashboard-v2 .terminal-card,
.dashboard-v2 .stat-c,
.dashboard-v2 .lv,
.dashboard-v2 .result-row{
  background:#fff !important;
  border:1px solid var(--ui-line) !important;
  border-radius:14px !important;
  box-shadow:0 8px 24px rgba(15,23,42,.06) !important;
}
.dashboard-v2 .metric-card::before,
.dashboard-v2 .metric-card::after,
.dashboard-v2 .chart-shell::before,
.dashboard-v2 .pnl-hero::after,
.dashboard-v2 .sec::after{
  display:none !important;
}
.dashboard-v2 .metric-card{
  min-height:118px;
  padding:18px 18px 16px;
}
.dashboard-v2 .metric-label,
.dashboard-v2 .market-label,
.dashboard-v2 .side-card-label,
.dashboard-v2 .terminal-card-title,
.dashboard-v2 .sec-ttl,
.dashboard-v2 .stat-lbl,
.dashboard-v2 .pm-lbl,
.dashboard-v2 .workspace-stat-label,
.dashboard-v2 .telemetry-row span:first-child{
  color:var(--ui-muted) !important;
  letter-spacing:.08em;
}
.dashboard-v2 .metric-sub,
.dashboard-v2 .market-sub,
.dashboard-v2 .workspace-sub,
.dashboard-v2 .chart-sub,
.dashboard-v2 .chart-eyebrow,
.dashboard-v2 .live-txt,
.dashboard-v2 .terminal-card-meta,
.dashboard-v2 .r-mark,
.dashboard-v2 #lastUpdate{
  color:var(--ui-muted) !important;
}
.dashboard-v2 .metric-value,
.dashboard-v2 .market-value,
.dashboard-v2 .workspace-balance,
.dashboard-v2 .chart-title,
.dashboard-v2 .exec-symbol,
.dashboard-v2 .pnl-val,
.dashboard-v2 .stat-val{
  color:var(--ui-text) !important;
}
.dashboard-v2 .metric-value{
  margin-top:10px;
  font-size:34px;
  font-weight:800;
  line-height:1;
}
.dashboard-v2 .workspace-balance{
  font-size:50px;
}
.dashboard-v2 .wl-hdr{
  padding:0 2px 2px !important;
  border:none !important;
  background:transparent !important;
}
.dashboard-v2 .wl-scroll{
  min-height:0;
  border:none !important;
  border-radius:0 !important;
  background:transparent !important;
}
.dashboard-v2 .wl-item{
  margin:0 0 10px !important;
  border:1px solid var(--ui-line) !important;
  border-radius:12px !important;
  background:#fff !important;
  padding:12px !important;
}
.dashboard-v2 .wl-item.active{
  border-color:var(--ui-line-strong) !important;
  background:#fff !important;
}
.dashboard-v2 .chart-shell{
  display:flex;
  flex-direction:column;
  gap:14px;
  padding:18px;
}
.dashboard-v2 .chart-head{
  padding:0 !important;
  align-items:flex-start;
}
.dashboard-v2 .chart-title{
  font-size:34px;
}
.dashboard-v2 .chart-structure{
  text-align:left;
}
.dashboard-v2 .ind-toolbar{
  height:auto !important;
  min-height:46px;
  padding:8px !important;
  border:1px solid var(--ui-line) !important;
  border-radius:12px !important;
  background:#fff !important;
}
.dashboard-v2 .ind-btn,
.dashboard-v2 .chart-fs-btn{
  border-radius:10px !important;
  border:1px solid var(--ui-line) !important;
  background:#fff !important;
  color:var(--ui-muted) !important;
  box-shadow:none !important;
}
.dashboard-v2 #chart-container{
  height:56vh;
  min-height:420px;
  border-radius:12px;
  border:1px solid var(--ui-line);
  background:#fff;
}
.dashboard-v2 .sub-panel{
  border-top:1px solid var(--ui-line) !important;
  background:#fff !important;
}
.dashboard-v2 .market-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:12px;
}
.dashboard-v2 .market-card{
  padding:14px;
}
.dashboard-v2 .market-value{
  margin-top:8px;
  font-size:26px;
}
.dashboard-v2 .terminal-card-hdr{
  background:#fff !important;
  border-bottom:1px solid var(--ui-line) !important;
}
.dashboard-v2 .exec-body{
  padding:16px;
}
.dashboard-v2 .exec-btn,
.dashboard-v2 .exec-mode-btn{
  border:1px solid var(--ui-line) !important;
  border-radius:10px !important;
  background:#fff !important;
  color:var(--ui-muted) !important;
}
.dashboard-v2 .exec-btn.active{
  background:rgba(31,158,116,.12) !important;
  border-color:rgba(31,158,116,.26) !important;
  color:var(--ui-green) !important;
}
.dashboard-v2 .exec-btn.sell-active{
  background:rgba(217,79,99,.12) !important;
  border-color:rgba(217,79,99,.26) !important;
  color:var(--ui-red) !important;
}
.dashboard-v2 .exec-mode-btn.active{
  color:var(--ui-text) !important;
}
.dashboard-v2 .exec-slider,
.dashboard-v2 .workspace-bar,
.dashboard-v2 .r-track{
  background:#eef2f7 !important;
}
.dashboard-v2 .exec-slider-fill,
.dashboard-v2 .workspace-bar-fill,
.dashboard-v2 #stageBar,
.dashboard-v2 #acctMarginBar{
  background:var(--ui-accent) !important;
}
.dashboard-v2 .exec-exposure,
.dashboard-v2 .exec-pnl-panel,
.dashboard-v2 .pnl-hero,
.dashboard-v2 .lv,
.dashboard-v2 .stat-c,
.dashboard-v2 .result-row{
  background:#fff !important;
}
.dashboard-v2 .exec-pill,
.dashboard-v2 .exec-side,
.dashboard-v2 .stage-pill,
.dashboard-v2 .closed-banner{
  background:#f6f8fb !important;
  border:1px solid var(--ui-line) !important;
  color:var(--ui-muted) !important;
}
.dashboard-v2 .no-trade-overlay{
  background:rgba(245,245,247,.72) !important;
  backdrop-filter:blur(3px);
}
.dashboard-v2 .no-sym{
  color:#cad1dd !important;
}
.dashboard-v2 .no-txt{
  color:var(--ui-muted) !important;
}
.dashboard-v2 #chart-wrap.is-fullscreen{
  background:var(--ui-bg-soft) !important;
  padding:14px !important;
}
.dashboard-v2 #chart-wrap.is-fullscreen .chart-shell{
  background:#fff !important;
  border:1px solid var(--ui-line) !important;
  box-shadow:0 16px 38px rgba(15,23,42,.12) !important;
}
.dashboard-v2 #chart-wrap.is-fullscreen #chart-container{
  border:1px solid var(--ui-line) !important;
  background:#fff !important;
}
.dashboard-v2 .up,
.dashboard-v2 .pp,
.dashboard-v2 .rp,
.dashboard-v2 .r-pos{
  color:var(--ui-green) !important;
}
.dashboard-v2 .down,
.dashboard-v2 .pn,
.dashboard-v2 .rn,
.dashboard-v2 .r-neg{
  color:var(--ui-red) !important;
}
.dashboard-v2 .overlay{
  display:none !important;
}
.dashboard-v2 .bnav{
  border-top:1px solid var(--ui-line) !important;
  background:rgba(255,255,255,.88) !important;
}
.dashboard-v2 .bnav-tab{
  color:var(--ui-muted) !important;
}
.dashboard-v2 .bnav-tab.active{
  color:var(--ui-accent) !important;
}
@media (max-width:1280px){
  .dashboard-v2 .layout{
    grid-template-columns:minmax(240px,270px) minmax(0,1fr) minmax(280px,320px);
    gap:18px;
  }
  .dashboard-v2 .terminal-kpis{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
  .dashboard-v2 .market-grid{
    grid-template-columns:repeat(2,minmax(0,1fr));
  }
}
@media (max-width:1024px){
  .dashboard-v2 .layout{
    grid-template-columns:minmax(0,1fr) minmax(280px,320px);
    gap:16px;
  }
  .dashboard-v2 .wl{
    grid-column:1/-1;
    position:relative;
    top:0;
    max-height:72px;
    overflow:hidden;
    transition:max-height .28s ease;
  }
  .dashboard-v2 .wl.open{
    max-height:68vh;
  }
  .dashboard-v2 #chart-wrap{
    grid-column:1/2;
  }
  .dashboard-v2 .sb{
    grid-column:2/3;
    position:sticky;
    top:82px;
    height:calc(100dvh - 98px) !important;
    max-height:calc(100dvh - 98px) !important;
  }
  .dashboard-v2 .bnav{
    display:flex !important;
  }
}
@media (max-width:840px){
  .dashboard-v2 .page-shell{
    padding:10px 12px 72px;
  }
  .dashboard-v2 .layout{
    grid-template-columns:1fr;
  }
  .dashboard-v2 #chart-wrap,
  .dashboard-v2 .sb,
  .dashboard-v2 .wl{
    grid-column:auto;
  }
  .dashboard-v2 .sb{
    position:relative;
    top:0;
    height:auto !important;
    max-height:none !important;
  }
  .dashboard-v2 .wl{
    max-height:64px;
  }
  .dashboard-v2 .wl.open{
    max-height:66vh;
  }
  .dashboard-v2 .terminal-kpis,
  .dashboard-v2 .market-grid{
    grid-template-columns:1fr;
  }
  .dashboard-v2 #chart-container{
    min-height:320px;
    height:46vh;
  }
}
</style>
</head>
<body class="dashboard-v3">
${getSharedChrome({accent:'#3d9eff',accentSoft:'rgba(61,158,255,.18)',secondary:'rgba(0,229,160,.14)',loaderLabel:'Cargando terminal de trading'})}
<div class="page-shell">
${getSharedNav('dashboard', user, 'blue',
  '<div class="nav-market">'+
    '<span class="nav-sym" id="hSym">'+symbol+'</span>'+
    '<span class="nav-price up" id="hPrice">—</span>'+
    '<span class="nav-pill pill-closed" id="hDir">—</span>'+
    '<span class="nav-live"><span class="live-dot" id="liveDot"></span><span class="live-txt" id="liveTxt">conectando</span></span>'+
    '<span class="nav-time" id="hTime">—</span>'+
  '</div>'
)}
<div class="overlay" id="overlay"></div>
<div class="layout">
  <div class="wl" id="watchlist">
    <div class="side-card workspace-card">
      <div class="side-card-label">Espacio de trabajo</div>
      <div class="workspace-user">${user?.username || 'terminal'}</div>
      <div class="workspace-balance" id="workspaceBalance">—</div>
      <div class="workspace-sub">Capital disponible <span id="workspaceAvail">—</span></div>
      <div class="workspace-grid">
        <div class="workspace-stat"><div class="workspace-stat-label">Equidad</div><div class="workspace-stat-value" id="workspaceEquity">—</div></div>
        <div class="workspace-stat"><div class="workspace-stat-label">Diario</div><div class="workspace-stat-value" id="workspaceDaily">—</div></div>
        <div class="workspace-stat"><div class="workspace-stat-label">Ritmo</div><div class="workspace-stat-value" id="workspaceRunRate">—</div></div>
        <div class="workspace-stat"><div class="workspace-stat-label">Abiertas</div><div class="workspace-stat-value" id="workspaceOpen">—</div></div>
      </div>
      <div class="workspace-progress">
        <div class="workspace-progress-top"><span>Uso de margen</span><span id="workspaceMarginPct">—</span></div>
        <div class="workspace-bar"><div class="workspace-bar-fill" id="workspaceMarginBar"></div></div>
      </div>
    </div>
    <div class="wl-hdr">Posiciones abiertas y cerradas<span class="wl-count" id="wl-count">0</span></div>
    <div class="wl-scroll">
      <div id="wl-open-lbl" class="wl-sec-lbl" style="display:none">Abiertas</div>
      <div id="wl-open"></div>
      <div id="wl-close-lbl" class="wl-sec-lbl" style="display:none">Historial</div>
      <div id="wl-closed"></div>
    </div>
    <div class="side-card telemetry-card">
      <div class="side-card-label">Telemetría de sesión</div>
      <div class="telemetry-list">
        <div class="telemetry-row"><span>Vol 24h</span><strong id="telemetryVol">—</strong></div>
        <div class="telemetry-row"><span>ATR horario</span><strong id="telemetryAtr">—</strong></div>
        <div class="telemetry-row"><span>R promedio</span><strong id="telemetryAvgR">—</strong></div>
        <div class="telemetry-row"><span>No realizado</span><strong id="telemetryUnreal">—</strong></div>
      </div>
    </div>
  </div>
  <div id="chart-wrap">
    <div class="terminal-kpis">
      <div class="metric-card">
        <div class="metric-label">Cambio 24H</div>
        <div class="metric-value" id="metric24hChange">—</div>
        <div class="metric-sub">Pulso de tendencia</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Delta de vela</div>
        <div class="metric-value" id="metricCandleDelta">—</div>
        <div class="metric-sub">Movimiento actual 1h</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Margen en uso</div>
        <div class="metric-value" id="metricMarginInUse">—</div>
        <div class="metric-sub">Capital asignado</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">No realizado</div>
        <div class="metric-value" id="metricUnrealized">—</div>
        <div class="metric-sub">Variación viva de cuenta</div>
      </div>
    </div>
    <div class="chart-shell">
      <div class="chart-head">
        <div>
          <div class="chart-eyebrow">Gráfico</div>
          <div class="chart-title">${symbol}</div>
          <div class="chart-sub" id="chartRangeText">Rango 24h —</div>
        </div>
        <div class="chart-head-side">
          <div class="chart-structure">Estructura 1H<strong id="metricStructure">—</strong></div>
          <div class="chart-actions">
            <button class="chart-fs-btn" id="chartFullscreenBtn" type="button" aria-pressed="false" aria-label="Entrar a pantalla completa" title="Pantalla completa (F)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="8 3 3 3 3 8"></polyline>
                <line x1="3" y1="3" x2="9" y2="9"></line>
                <polyline points="16 3 21 3 21 8"></polyline>
                <line x1="15" y1="9" x2="21" y2="3"></line>
                <polyline points="3 16 3 21 8 21"></polyline>
                <line x1="3" y1="21" x2="9" y2="15"></line>
                <polyline points="16 21 21 21 21 16"></polyline>
                <line x1="15" y1="15" x2="21" y2="21"></line>
              </svg>
              <span class="chart-fs-text">Pantalla completa</span>
              <span class="chart-fs-key">F</span>
            </button>
          </div>
        </div>
      </div>
      <div class="ind-toolbar">
        <button class="ind-btn ema8" onclick="toggleInd('ema8',this)" title="EMA 8">EMA8</button>
        <button class="ind-btn ema21" onclick="toggleInd('ema21',this)" title="EMA 21">EMA21</button>
        <button class="ind-btn ema50" onclick="toggleInd('ema50',this)" title="EMA 50">EMA50</button>
        <div class="ind-sep"></div>
        <button class="ind-btn vwap" onclick="toggleInd('vwap',this)" title="VWAP">VWAP</button>
        <div class="ind-sep"></div>
        <button class="ind-btn vol" onclick="toggleInd('vol',this)" title="Volumen">VOL</button>
        <button class="ind-btn rsi" onclick="toggleInd('rsi',this)" title="RSI 14">RSI</button>
        <button class="ind-btn sqz" onclick="toggleInd('sqz',this)" title="Squeeze Momentum">SQZ</button>
        <button class="ind-btn adx" onclick="toggleInd('adx',this)" title="ADX">ADX</button>
      </div>
      <div id="chart-container"></div>
      <div id="vol-panel" class="sub-panel"><div class="panel-resize" onmousedown="startResize(event,'vol-panel')" ontouchstart="startResize(event,'vol-panel')"></div><div class="panel-label">VOL</div></div>
      <div id="rsi-panel" class="sub-panel"><div class="panel-resize" onmousedown="startResize(event,'rsi-panel')" ontouchstart="startResize(event,'rsi-panel')"></div><div class="panel-label">RSI 14</div></div>
      <div id="sqz-panel" class="sub-panel"><div class="panel-resize" onmousedown="startResize(event,'sqz-panel')" ontouchstart="startResize(event,'sqz-panel')"></div><div class="panel-label">SQUEEZE</div></div>
      <div class="market-grid">
        <div class="market-card"><div class="market-label">Último</div><div class="market-value" id="marketLast">—</div><div class="market-sub">precio en tiempo real</div></div>
        <div class="market-card"><div class="market-label">Máximo 24H</div><div class="market-value" id="marketHigh">—</div><div class="market-sub">zona de resistencia</div></div>
        <div class="market-card"><div class="market-label">Mínimo 24H</div><div class="market-value" id="marketLow">—</div><div class="market-sub">zona de soporte</div></div>
        <div class="market-card"><div class="market-label">Volumen 24H</div><div class="market-value" id="marketVolume">—</div><div class="market-sub">futuros perpetuos</div></div>
      </div>
      <div class="no-trade-overlay" id="noTrade" style="display:none">
        <div class="no-sym">${symbol}</div>
        <div class="no-txt">Sin posición activa</div>
      </div>
    </div>
  </div>
  <div class="sb" id="sidebar">
    <div class="terminal-card">
      <div class="terminal-card-hdr">
        <div class="terminal-card-title">Ejecución</div>
        <div class="exec-pill" id="execStatusPill">En espera</div>
      </div>
      <div class="exec-body">
        <div class="exec-toggle">
          <button class="exec-btn active" id="execBuyBtn" type="button">Comprar</button>
          <button class="exec-btn" id="execSellBtn" type="button">Vender</button>
        </div>
        <div class="exec-mode">
          <button class="exec-mode-btn active" type="button">Mercado</button>
          <button class="exec-mode-btn" type="button">Límite</button>
        </div>
        <div class="exec-slider-group">
          <div class="exec-slider-label"><span>Apalancamiento</span><strong id="execLevText">—</strong></div>
          <div class="exec-slider"><div class="exec-slider-fill" id="execLevFill"></div></div>
          <div class="exec-slider-label"><span>Asignación de cuenta</span><strong id="execAllocText">—</strong></div>
          <div class="exec-slider"><div class="exec-slider-fill" id="execAllocFill"></div></div>
        </div>
        <div class="exec-symbol-row">
          <div class="exec-symbol" id="execSymbol">${symbol}</div>
          <div class="exec-side" id="execSideBadge">—</div>
        </div>
        <div class="exec-exposure">
          <div>
            <div class="exec-exposure-label">Capital en posición</div>
            <div class="exec-exposure-value" id="execInvestedAmount">—</div>
          </div>
          <div class="exec-exposure-side">
            <span class="exec-exposure-chip">Notional</span>
            <strong class="exec-exposure-meta" id="execNotionalAmount">—</strong>
          </div>
        </div>
        <div class="exec-pnl-panel">
          <div class="exec-pnl-top"><span>PnL en vivo</span><span id="execStageMeta">Sin trade activo</span></div>
          <div class="exec-pnl-value" id="execPnlVal">—</div>
          <div class="exec-pnl-sub"><span id="execPnlPct">—</span><span id="execUpdated">sync pending</span></div>
        </div>
      </div>
    </div>
    <div class="terminal-card details-card">
      <div class="terminal-card-hdr">
        <div class="terminal-card-title">Inteligencia de trade</div>
        <div class="terminal-card-meta" id="detailUpdated">—</div>
      </div>
      <div id="closedBanner"></div>
      <div class="pnl-hero" id="pnlHero">
        <div class="pnl-lbl" id="pnlLbl">PnL No Realizado</div>
        <div class="pnl-val" id="pnlVal" style="color:var(--text2)">—</div>
        <div class="pnl-meta">
          <div><div class="pm-lbl">PnL %</div><div class="pm-val" id="pnlPct">—</div></div>
          <div><div class="pm-lbl">Duración</div><div class="pm-val" id="dur">—</div></div>
        </div>
      </div>
      <div class="sec">
        <div class="sec-ttl">Niveles</div>
        <div class="levels">
          <div class="lv lv-entry"><div class="lv-left"><div class="lv-name">Entrada</div><div class="lv-dist" id="dEntry">—</div></div><div class="lv-price" id="lEntry">—</div></div>
          <div class="lv lv-sl"><div class="lv-left"><div class="lv-name">Stop Loss</div><div class="lv-dist" id="dSL">—</div></div><div class="lv-price" id="lSL">—</div></div>
          <div class="lv lv-tp"><div class="lv-left"><div class="lv-name">Objetivo</div><div class="lv-dist" id="dTP">—</div></div><div class="lv-price" id="lTP">—</div></div>
        </div>
        <div id="sl-indicator" class="sl-indicator" style="display:none"><span class="indicator-dot"></span><span id="sl-dist-txt">SL a —% del precio</span></div>
        <div id="tp-indicator" class="tp-indicator" style="display:none"><span class="indicator-dot"></span><span id="tp-dist-txt">TP a —% del precio</span></div>
      </div>
      <div class="sec">
        <div class="sec-ttl">Progreso R</div>
        <div class="r-wrap">
          <div class="r-big r-neg" id="rVal">—</div>
          <div class="r-track-wrap" style="width:100%">
            <div class="r-track"><div class="r-fill r-fill-n" id="rFill" style="width:0%"></div><div class="r-target-line"></div></div>
            <div class="r-marks"><span class="r-mark">0R</span><span class="r-mark">1R BE</span><span class="r-mark">1.5R</span><span class="r-mark">2R TP</span></div>
          </div>
        </div>
      </div>
      <div class="sec">
        <div class="sec-ttl">Posición</div>
        <div class="stats-grid">
          <div class="stat-c"><div class="stat-lbl">Cantidad</div><div class="stat-val" id="sQty">—</div></div>
          <div class="stat-c"><div class="stat-lbl">Apalancamiento</div><div class="stat-val c-gold" id="sLev">—</div></div>
          <div class="stat-c"><div class="stat-lbl">Score AI</div><div class="stat-val c-blue" id="sScore">—</div></div>
          <div class="stat-c"><div class="stat-lbl">Régimen</div><div class="stat-val c-purple" id="sRegime">—</div></div>
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between">
          <span id="sStage">—</span>
          <span id="sHours" style="font-size:9px;color:var(--muted)">—</span>
        </div>
        <div id="stageProgress" style="margin-top:8px;display:none">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-size:9px;color:var(--muted)">Próximo:</span>
            <span id="nextStageLabel" style="font-size:9px;color:var(--text2)">—</span>
          </div>
          <div style="height:3px;background:var(--bg4);border-radius:2px;overflow:hidden">
            <div id="stageBar" style="height:100%;border-radius:2px;background:var(--blue);transition:width .5s;width:0%"></div>
          </div>
        </div>
      </div>
      <div class="sec">
        <div class="sec-ttl">Cuenta</div>
        <div class="stats-grid">
          <div class="stat-c"><div class="stat-lbl">Balance</div><div class="stat-val" id="acctBalance">—</div></div>
          <div class="stat-c"><div class="stat-lbl">Disponible</div><div class="stat-val" id="acctAvail">—</div></div>
          <div class="stat-c"><div class="stat-lbl">Margen</div><div class="stat-val c-gold" id="acctMargin">—</div></div>
          <div class="stat-c"><div class="stat-lbl">No realizado</div><div class="stat-val" id="acctUnreal">—</div></div>
          <div class="stat-c"><div class="stat-lbl">PnL diario</div><div class="stat-val" id="acctDailyPnl">—</div></div>
          <div class="stat-c"><div class="stat-lbl">ROI diario</div><div class="stat-val" id="acctDailyRoi">—</div></div>
        </div>
        <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between">
          <span id="acctPositions" style="font-size:10px;color:var(--text2)">—</span>
          <span id="acctMarginPct" style="font-size:10px;color:var(--muted)">—</span>
        </div>
        <div style="margin-top:6px;height:4px;background:var(--bg4);border-radius:999px;overflow:hidden">
          <div id="acctMarginBar" style="height:100%;width:0%;background:var(--blue);border-radius:999px;transition:width .5s"></div>
        </div>
      </div>
      <div class="sec" id="closedSec" style="display:none">
        <div class="sec-ttl">Resultado Final</div>
        <div id="closedContent"></div>
      </div>
      <div class="sec">
        <div class="sec-ttl">Actualización</div>
        <div id="lastUpdate" style="font-size:11px;color:var(--muted)">—</div>
      </div>
    </div>
  </div>
</div>
<div class="bnav">
  <div class="bnav-tabs">
    <button class="bnav-tab" id="bnChart" onclick="showPanel('chart')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>Gráfico</button>
    <button class="bnav-tab" id="bnWatch" onclick="showPanel('watch')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>Pares</button>
    <button class="bnav-tab active" id="bnStats" onclick="showPanel('stats')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>Datos</button>
  </div>
</div>
</div>
<script>
const SYMBOL='${symbol}';
const isPhone=()=>window.innerWidth<768;
const isTablet=()=>window.innerWidth>=768&&window.innerWidth<=1024;
const isMobile=()=>window.innerWidth<=1024;
let currentPanel='chart';
const chartWrap=document.getElementById('chart-wrap');
const chartShell=chartWrap.querySelector('.chart-shell');
const fullscreenBtn=document.getElementById('chartFullscreenBtn');
const prefersReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
window.aterumAssistantConfig={
  page:'dashboard',
  kicker:'Asistente IA',
  subtitle:'Analiza tu posición, el precio en vivo, el riesgo y la señal actual antes de ejecutar.',
  placeholder:'¿Debo mantener mi posición actual o esperar confirmación?'
};
let layoutSyncFrame=0,layoutSyncTimer=0,lastChartBox={width:0,height:0};
let isChartFullscreen=false,fullscreenAnimTimer=0;
function applyChartLayout(){
  layoutSyncFrame=0;
  const width=container.clientWidth||0;
  const height=container.clientHeight||0;
  if(width<40||height<40)return;
  if(lastChartBox.width===width&&lastChartBox.height===height)return;
  lastChartBox={width,height};
  chart.applyOptions({width,height});
  const vp=document.getElementById('vol-panel');
  const rp=document.getElementById('rsi-panel');
  const sp=document.getElementById('sqz-panel');
  if(volChart&&vp&&vp.style.display!=='none')volChart.applyOptions({width:vp.clientWidth,height:vp.clientHeight||80});
  if(rsiChart&&rp&&rp.style.display!=='none')rsiChart.applyOptions({width:rp.clientWidth,height:rp.clientHeight||90});
  if(sqzChart&&sp&&sp.style.display!=='none')sqzChart.applyOptions({width:sp.clientWidth,height:sp.clientHeight||70});
}
function syncChartLayout({immediate=false}={}){
  clearTimeout(layoutSyncTimer);
  const schedule=()=>{
    if(layoutSyncFrame)return;
    layoutSyncFrame=requestAnimationFrame(applyChartLayout);
  };
  if(immediate)schedule();
  else layoutSyncTimer=setTimeout(schedule,60);
}
function requestChartRelayout(){
  syncChartLayout({immediate:true});
  requestAnimationFrame(()=>syncChartLayout({immediate:true}));
  setTimeout(()=>syncChartLayout({immediate:true}),140);
  setTimeout(()=>syncChartLayout({immediate:true}),320);
}
function clearChartShellAnimation(){
  clearTimeout(fullscreenAnimTimer);
  chartShell.style.transition='';
  chartShell.style.transform='';
  chartShell.style.transformOrigin='';
}
function animateChartShellFlip(fromRect){
  if(prefersReducedMotion.matches||!fromRect)return;
  const toRect=chartShell.getBoundingClientRect();
  if(!toRect.width||!toRect.height)return;
  const dx=fromRect.left-toRect.left;
  const dy=fromRect.top-toRect.top;
  const sx=fromRect.width/Math.max(toRect.width,1);
  const sy=fromRect.height/Math.max(toRect.height,1);
  if(Math.abs(dx)<1&&Math.abs(dy)<1&&Math.abs(sx-1)<.01&&Math.abs(sy-1)<.01)return;
  clearChartShellAnimation();
  chartShell.style.transformOrigin='top left';
  chartShell.style.transition='none';
  chartShell.style.transform='translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')';
  chartShell.getBoundingClientRect();
  chartShell.style.transition='transform 320ms cubic-bezier(.22,1,.36,1),box-shadow 320ms ease,border-radius 320ms ease,background 320ms ease';
  chartShell.style.transform='translate(0px,0px) scale(1,1)';
  fullscreenAnimTimer=setTimeout(clearChartShellAnimation,360);
}
function syncFullscreenButton(){
  fullscreenBtn.classList.toggle('is-active',isChartFullscreen);
  fullscreenBtn.setAttribute('aria-pressed',isChartFullscreen?'true':'false');
  fullscreenBtn.setAttribute('aria-label',isChartFullscreen?'Salir de pantalla completa del gráfico':'Entrar a pantalla completa del gráfico');
  fullscreenBtn.title=isChartFullscreen?'Salir de pantalla completa (Esc)':'Entrar a pantalla completa (F)';
  const label=fullscreenBtn.querySelector('.chart-fs-text');
  if(label)label.textContent=isChartFullscreen?'Salir':'Pantalla completa';
}
function setChartFullscreen(next){
  next=!!next;
  if(isChartFullscreen===next)return;
  const fromRect=chartShell.getBoundingClientRect();
  isChartFullscreen=next;
  currentPanel='chart';
  showPanel('chart',{skipScroll:true});
  document.body.classList.toggle('chart-fullscreen-active',next);
  chartWrap.classList.toggle('is-fullscreen',next);
  syncFullscreenButton();
  animateChartShellFlip(fromRect);
  requestChartRelayout();
}
function toggleChartFullscreen(){
  setChartFullscreen(!isChartFullscreen);
}
function shouldIgnoreFullscreenKey(target){
  if(!target)return false;
  const tag=(target.tagName||'').toUpperCase();
  return !!(target.isContentEditable||tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||target.closest('[contenteditable="true"]'));
}
function handleFullscreenKeydown(e){
  if(e.defaultPrevented||e.metaKey||e.ctrlKey||e.altKey)return;
  if(shouldIgnoreFullscreenKey(e.target))return;
  const key=(e.key||'').toLowerCase();
  if(key==='escape'&&isChartFullscreen){
    e.preventDefault();
    setChartFullscreen(false);
    return;
  }
  if(key==='f'){
    e.preventDefault();
    toggleChartFullscreen();
  }
}
function showPanel(p,{skipScroll=false}={}){
  currentPanel=p;
  const wl=document.getElementById('watchlist'),sb=document.getElementById('sidebar'),ov=document.getElementById('overlay');
  const bnC=document.getElementById('bnChart'),bnW=document.getElementById('bnWatch'),bnS=document.getElementById('bnStats');
  if(!isMobile()){
    wl.classList.remove('open');sb.classList.remove('open');ov.classList.remove('visible');
    [bnC,bnW,bnS].forEach(b=>b.classList.remove('active'));
    bnC.classList.add('active');
    syncChartLayout({immediate:true});
    return;
  }
  if(isTablet()){
    wl.classList.remove('open');sb.classList.remove('open');ov.classList.remove('visible');
    [bnC,bnW,bnS].forEach(b=>b.classList.remove('active'));
    if(p==='watch'){
      wl.classList.add('open');
      bnW.classList.add('active');
      if(!skipScroll)setTimeout(()=>wl.scrollIntoView({behavior:'smooth',block:'start'}),30);
    }else if(p==='stats'){
      bnS.classList.add('active');
      if(!skipScroll)setTimeout(()=>sb.scrollIntoView({behavior:'smooth',block:'start'}),30);
    }else{
      bnC.classList.add('active');
      if(!skipScroll)setTimeout(()=>document.getElementById('chart-wrap').scrollIntoView({behavior:'smooth',block:'start'}),30);
    }
    syncChartLayout({immediate:true});
    return;
  }
  wl.classList.remove('open');sb.classList.remove('open');ov.classList.remove('visible');
  [bnC,bnW,bnS].forEach(b=>b.classList.remove('active'));
  if(p==='watch'){
    wl.classList.add('open');bnW.classList.add('active');
    if(!skipScroll)setTimeout(()=>wl.scrollIntoView({behavior:'smooth',block:'start'}),30);
  }
  else if(p==='stats'){
    sb.classList.add('open');bnS.classList.add('active');
    if(!skipScroll)setTimeout(()=>sb.scrollIntoView({behavior:'smooth',block:'start'}),30);
  }
  else{
    bnC.classList.add('active');
    if(!skipScroll)setTimeout(()=>document.getElementById('chart-wrap').scrollIntoView({behavior:'smooth',block:'start'}),30);
  }
  syncChartLayout({immediate:true});
}
document.getElementById('overlay').addEventListener('click',()=>showPanel('chart'));
const menuBtnEl=document.getElementById('menuBtn');
if(menuBtnEl)menuBtnEl.addEventListener('click',()=>showPanel(currentPanel==='watch'?'chart':'watch'));
fullscreenBtn.addEventListener('click',toggleChartFullscreen);
document.addEventListener('keydown',handleFullscreenKeydown);
function syncResponsiveState(){
  if(isPhone())showPanel(currentPanel||'chart',{skipScroll:true});
  else if(isTablet())showPanel('chart',{skipScroll:true});
  else showPanel('chart',{skipScroll:true});
  syncChartLayout({immediate:true});
}
syncFullscreenButton();

const container=document.getElementById('chart-container');
const chart=LightweightCharts.createChart(container,{
  width:container.clientWidth,height:container.clientHeight,
  layout:{backgroundColor:'#060910',textColor:'#a8b3c7'},
  grid:{vertLines:{color:'#11192a'},horzLines:{color:'#11192a'}},
  crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{color:'#304560',labelBackgroundColor:'#1a2336'},horzLine:{color:'#304560',labelBackgroundColor:'#1a2336'}},
  rightPriceScale:{borderColor:'#1a2336',scaleMargins:{top:.1,bottom:.1}},
  timeScale:{borderColor:'#1a2336',timeVisible:true,secondsVisible:false}
});
const candles=chart.addCandlestickSeries({upColor:'#1f9e74',downColor:'#d94f63',borderUpColor:'#1f9e74',borderDownColor:'#d94f63',wickUpColor:'#1f9e74',wickDownColor:'#d94f63'});
let entryLine=null,slLine=null,tpLine=null,slZone=null,tpZone=null;
let klineData=[],lastPrice=null,currentTrade=null,isClosed=false,tradeMap={active:{},closed:{}},wlPrices={};
let priceStream=null;
let accountStream=null;
let priceReconnectTimer=0;
let accountReconnectTimer=0;
let isUnloading=false;
let pendingFetches={klines:false,account:false,trades:false,recentTrades:false,stats:false};
const rangeLinks={vol:{main:null,sub:null},rsi:{main:null,sub:null},sqz:{main:null,sub:null}};
let cachedAccountDerived={dailyPnl:0,dailyRoi:0,marginPct:0};
let cachedMarketStats={prior:0,high24:0,low24:0,vol24:0,atr:0,structure:'Balanceado'};

// ── Indicator state ────────────────────────────────────────────────────────────
const indState={ema8:false,ema21:false,ema50:false,vwap:false,vol:false,rsi:false,sqz:false,adx:false};
let indSeries={ema8:null,ema21:null,ema50:null,vwap:null};
let volChart=null,volSeries=null,rsiChart=null,rsiSeries=null,rsiOB=null,rsiOS=null;
let sqzChart=null,sqzSeries=null,sqzDotSeries=null;

// ── Indicator calculations ─────────────────────────────────────────────────────
function calcEMA(data,period){
  const k=2/(period+1);
  const out=[];
  let e=data[0];
  for(let i=0;i<data.length;i++){e=i===0?data[i]:data[i]*k+e*(1-k);out.push(e);}
  return out;
}
function calcVWAP(klines){
  let tpv=0,vol=0;
  return klines.map(k=>{
    const tp=(k.high+k.low+k.close)/3;
    tpv+=tp*k.volume; vol+=k.volume;
    return vol>0?tpv/vol:k.close;
  });
}
function calcRSI(closes,period=14){
  const out=new Array(period).fill(null);
  let ag=0,al=0;
  for(let i=1;i<=period;i++){const d=closes[i]-closes[i-1];d>0?ag+=d:al-=d;}
  ag/=period;al/=period;
  out.push(al===0?100:100-(100/(1+ag/al)));
  for(let i=period+1;i<closes.length;i++){
    const d=closes[i]-closes[i-1];
    ag=(ag*(period-1)+(d>0?d:0))/period;
    al=(al*(period-1)+(d<0?-d:0))/period;
    out.push(al===0?100:100-(100/(1+ag/al)));
  }
  return out;
}
function calcATR(klines,period=14){
  const trs=klines.map((k,i)=>i===0?k.high-k.low:Math.max(k.high-k.low,Math.abs(k.high-klines[i-1].close),Math.abs(k.low-klines[i-1].close)));
  const out=new Array(period).fill(null);
  let atr=trs.slice(0,period).reduce((a,b)=>a+b,0)/period;
  out.push(atr);
  for(let i=period;i<trs.length;i++){atr=(atr*(period-1)+trs[i])/period;out.push(atr);}
  return out;
}
function calcADX(klines,period=14){
  const dmP=[],dmN=[],tr=[];
  for(let i=1;i<klines.length;i++){
    const upMove=klines[i].high-klines[i-1].high;
    const downMove=klines[i-1].low-klines[i].low;
    dmP.push(upMove>downMove&&upMove>0?upMove:0);
    dmN.push(downMove>upMove&&downMove>0?downMove:0);
    tr.push(Math.max(klines[i].high-klines[i].low,Math.abs(klines[i].high-klines[i-1].close),Math.abs(klines[i].low-klines[i-1].close)));
  }
  const smooth=(arr,p)=>{
    const out=[arr.slice(0,p).reduce((a,b)=>a+b,0)];
    for(let i=p;i<arr.length;i++)out.push(out[out.length-1]-out[out.length-1]/p+arr[i]);
    return out;
  };
  const sTR=smooth(tr,period),sDMP=smooth(dmP,period),sDMN=smooth(dmN,period);
  const diP=sDMP.map((v,i)=>sTR[i]>0?v/sTR[i]*100:0);
  const diN=sDMN.map((v,i)=>sTR[i]>0?v/sTR[i]*100:0);
  const dx=diP.map((v,i)=>diP[i]+diN[i]>0?Math.abs(diP[i]-diN[i])/(diP[i]+diN[i])*100:0);
  const adx=smooth(dx,period);
  const offset=klines.length-1-adx.length;
  return klines.map((_,i)=>i<offset+1?null:adx[i-offset-1]||null);
}
function calcSqueeze(klines,period=20,mult=1.5){
  const closes=klines.map(k=>k.close);
  const out=[];
  for(let i=0;i<klines.length;i++){
    if(i<period-1){out.push({val:null,color:'gray',dot:'gray'});continue;}
    const slice=klines.slice(i-period+1,i+1);
    const cl=closes.slice(i-period+1,i+1);
    const avg=cl.reduce((a,b)=>a+b,0)/period;
    // Bollinger
    const std=Math.sqrt(cl.reduce((s,v)=>s+(v-avg)**2,0)/period);
    const bbUp=avg+mult*std,bbDn=avg-mult*std;
    // Keltner
    const atrV=slice.reduce((s,k,j)=>s+(j===0?k.high-k.low:Math.max(k.high-k.low,Math.abs(k.high-slice[j-1].close),Math.abs(k.low-slice[j-1].close))),0)/period;
    const kcUp=avg+mult*atrV,kcDn=avg-mult*atrV;
    const sqzOn=bbUp<kcUp&&bbDn>kcDn;
    const sqzOff=bbUp>kcUp&&bbDn<kcDn;
    // Momentum
    const highestH=Math.max(...slice.map(k=>k.high));
    const lowestL=Math.min(...slice.map(k=>k.low));
    const midHL=(highestH+lowestL)/2;
    const midEMA=cl.reduce((a,b)=>a+b,0)/period;
    const val=closes[i]-(midHL+midEMA)/2;
    out.push({
      val,
      color:val>0?(val>out[out.length-1]?.val?'#00e5a0':'#00b880'):(val<out[out.length-1]?.val?'#ff3d5a':'#cc2040'),
      dot:sqzOn?'#ff3d5a':sqzOff?'#00e5a0':'#304560'
    });
  }
  return out;
}

// ── Build full kline objects from API data ─────────────────────────────────────
let fullKlines=[];
let accountSnapshot={balance:0,available:0,totalMargin:0,totalUnreal:0,openPositions:0};
const pulseToneById={
  workspaceBalance:'blue',
  workspaceEquity:'blue',
  metricMarginInUse:'gold',
  marketLast:'blue',
  marketHigh:'blue',
  marketLow:'blue',
  marketVolume:'blue',
  execInvestedAmount:'gold',
  execNotionalAmount:'blue',
  acctBalance:'blue',
  acctAvail:'blue',
  acctMargin:'gold'
};
const tweenTextIds=new Set(['hPrice','marketLast','metric24hChange','metricCandleDelta','metricUnrealized','pnlVal','pnlPct','execPnlVal','execPnlPct','rVal']);
const textTweenState=new WeakMap();
function animateValueUpdate(el,tone='blue'){
  if(!el||prefersReducedMotion.matches)return;
  const glow={
    blue:'rgba(87,176,255,.34)',
    green:'rgba(0,229,160,.26)',
    red:'rgba(255,83,111,.24)',
    gold:'rgba(245,184,75,.24)'
  }[tone]||'rgba(87,176,255,.34)';
  if(window.gsap){
    gsap.killTweensOf(el);
    gsap.fromTo(el,
      {scale:1,y:0,filter:'drop-shadow(0 0 0 '+glow+')'},
      {scale:1.045,y:-2,filter:'drop-shadow(0 0 20px '+glow+')',duration:.2,ease:'power2.out',yoyo:true,repeat:1,clearProps:'transform,filter'}
    );
    return;
  }
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
function parseTweenToken(text){
  const raw=(text||'').replace(/,/g,'').trim();
  const match=raw.match(/^([+\\-]?\\$?)(\\d+(?:\\.\\d+)?)(.*)$/);
  if(!match)return null;
  const decimals=(match[2].split('.')[1]||'').length;
  return {prefix:match[1],value:+match[2],suffix:match[3],decimals};
}
function formatTweenToken(token,value){
  return token.prefix+Number(value).toFixed(token.decimals)+token.suffix;
}
function writeAnimatedText(el,value,tone='blue',allowTween=false){
  if(!el||el.textContent===value)return;
  animateValueUpdate(el,tone);
  if(!allowTween||!window.gsap||prefersReducedMotion.matches){
    el.textContent=value;
    return;
  }
  const nextToken=parseTweenToken(value);
  const prevToken=parseTweenToken(el.textContent);
  if(!nextToken||!prevToken||nextToken.prefix!==prevToken.prefix||nextToken.suffix!==prevToken.suffix){
    el.textContent=value;
    return;
  }
  const tween=textTweenState.get(el)||{value:prevToken.value};
  tween.value=prevToken.value;
  textTweenState.set(el,tween);
  gsap.killTweensOf(tween);
  gsap.to(tween,{
    value:nextToken.value,
    duration:.3,
    ease:'power2.out',
    onUpdate(){ el.textContent=formatTweenToken(nextToken,tween.value); },
    onComplete(){ el.textContent=value; }
  });
}
function calcTradeExposure(trade){
  const entry=+(trade?.entryPrice||0);
  const qty=+(trade?.qty||0);
  const leverage=+(trade?.leverage||0);
  const notional=entry*qty;
  const invested=leverage>0?notional/leverage:notional;
  return {invested,notional};
}
function getDashboardLivePnlValue(){
  if(!currentTrade)return null;
  if(isClosed&&currentTrade.finalPnL!=null)return +currentTrade.finalPnL||0;
  const entry=+currentTrade.entryPrice||0;
  const qty=+currentTrade.qty||0;
  const price=+(lastPrice||currentTrade.markPrice||0);
  if(!entry||!qty||!price)return currentTrade.unrealized!=null?+currentTrade.unrealized||0:null;
  return currentTrade.side==='SHORT'?(entry-price)*qty:(price-entry)*qty;
}
function getDashboardAssistantContext(){
  const exposure=calcTradeExposure(currentTrade||{});
  const livePnl=getDashboardLivePnlValue();
  return {
    pagina:'dashboard',
    activo:SYMBOL,
    precioActual:lastPrice||null,
    pnl:livePnl,
    posicion:currentTrade?{
      symbol:SYMBOL,
      side:currentTrade.side,
      entryPrice:+currentTrade.entryPrice||null,
      stopLoss:+currentTrade.sl||null,
      takeProfit:+currentTrade.tp||null,
      leverage:+currentTrade.leverage||null,
      qty:+currentTrade.qty||null,
      unrealized:livePnl,
      invested:exposure.invested||null,
      notional:exposure.notional||null,
      abierta:!isClosed
    }:null,
    mercado:{
      estructura:cachedMarketStats.structure||null,
      high24:cachedMarketStats.high24||null,
      low24:cachedMarketStats.low24||null,
      volumen24:cachedMarketStats.vol24||null,
      atr:cachedMarketStats.atr||null
    },
    metricas:{
      balance:accountSnapshot.balance||null,
      disponible:accountSnapshot.available||null,
      margen:accountSnapshot.totalMargin||null,
      pnlAbierto:accountSnapshot.totalUnreal||null,
      posicionesAbiertas:accountSnapshot.openPositions||0
    }
  };
}
window.aterumAssistantContext=getDashboardAssistantContext;
function initEliteMotion(){
  if(!window.gsap||prefersReducedMotion.matches)return;
  gsap.fromTo('.nav',{y:-18,opacity:0},{y:0,opacity:1,duration:.55,ease:'power2.out',clearProps:'opacity,transform'});
  gsap.fromTo('.wl,.chart-shell,.sb',{y:18,opacity:0},{y:0,opacity:1,duration:.68,stagger:.07,ease:'power3.out',clearProps:'opacity,transform',delay:.05});
  gsap.fromTo('.metric-card,.market-card,.terminal-card,.side-card',{y:14,opacity:0},{y:0,opacity:1,duration:.52,stagger:.03,ease:'power2.out',clearProps:'opacity,transform',delay:.14});
}

function setText(id,value,tone){
  const el=document.getElementById(id);
  if(el&&el.textContent!==value){
    writeAnimatedText(el,value,tone||pulseToneById[id],tweenTextIds.has(id));
  }
}
function setHTML(id,value){
  const el=document.getElementById(id);
  if(el&&el.innerHTML!==value)el.innerHTML=value;
}
function setWidth(id,value){
  const el=document.getElementById(id);
  if(el&&el.style.width!==value)el.style.width=value;
}
function fmtUSD(v,d=2){
  if(v==null||Number.isNaN(+v))return '—';
  return '$'+Math.abs(+v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
}
function fmtSignedUSD(v,d=2){
  if(v==null||Number.isNaN(+v))return '—';
  return ((+v)>=0?'+':'-')+fmtUSD(v,d);
}
function fmtPct(v,d=2){
  if(v==null||Number.isNaN(+v))return '—';
  return ((+v)>=0?'+':'')+(+v).toFixed(d)+'%';
}
function fmtCompact(v){
  if(v==null||Number.isNaN(+v))return '—';
  const n=Math.abs(+v);
  if(n>=1e9)return '$'+(n/1e9).toFixed(2)+'B';
  if(n>=1e6)return '$'+(n/1e6).toFixed(1)+'M';
  if(n>=1e3)return '$'+(n/1e3).toFixed(1)+'K';
  return fmtUSD(n,2);
}
function paintValue(id,value,tone){
  const el=document.getElementById(id);
  if(!el)return;
  if(el.textContent!==value){
    el.textContent=value;
    animateValueUpdate(el,tone||pulseToneById[id]);
  }
}
function paintSigned(id,val,suffix){
  const el=document.getElementById(id);
  if(!el||val==null||Number.isNaN(+val))return;
  const next=((+val)>=0?'+':'')+(+val).toFixed(2)+(suffix||'');
  const color=(+val)>=0?'var(--green)':'var(--red)';
  if(el.textContent!==next){
    writeAnimatedText(el,next,(+val)>=0?'green':'red',tweenTextIds.has(id));
  }
  if(el.style.color!==color)el.style.color=color;
}
function updateWorkspacePanel(extra={}){
  const bal=+(accountSnapshot.balance||0);
  const avail=+(accountSnapshot.available||0);
  const equity=+(accountSnapshot.equity||bal+(accountSnapshot.totalUnreal||0));
  const daily=+(extra.dailyPnl||0);
  const marginPct=+(extra.marginPct||0);
  const runRate=bal>0?((accountSnapshot.totalUnreal||0)/bal*100):0;
  setText('workspaceBalance',bal>0?fmtUSD(bal):'—');
  setText('workspaceAvail',avail>0?fmtUSD(avail):'—');
  setText('workspaceEquity',equity>0?fmtUSD(equity):'—');
  setText('workspaceDaily',daily||daily===0?fmtSignedUSD(daily):'—');
  setText('workspaceRunRate',bal>0?fmtPct(runRate):'—');
  setText('workspaceOpen',String(accountSnapshot.openPositions||0));
  setText('workspaceMarginPct',(marginPct||0).toFixed(1)+'%');
  setWidth('workspaceMarginBar',Math.min(marginPct||0,100)+'%');
  const d=document.getElementById('workspaceDaily');
  if(d)d.style.color=daily>=0?'var(--green)':'var(--red)';
  const rr=document.getElementById('workspaceRunRate');
  if(rr)rr.style.color=runRate>=0?'var(--green)':'var(--red)';
}
function recomputeMarketStats(){
  if(!fullKlines.length)return;
  const lookback=fullKlines.slice(-24);
  const last=+(lastPrice||fullKlines[fullKlines.length-1]?.close||0);
  cachedMarketStats.prior=+(fullKlines[Math.max(fullKlines.length-25,0)]?.close||lookback[0]?.open||last||0);
  cachedMarketStats.high24=Math.max(...lookback.map(k=>+k.high||0));
  cachedMarketStats.low24=Math.min(...lookback.map(k=>+k.low||0));
  cachedMarketStats.vol24=lookback.reduce((s,k)=>s+(+k.volume||0),0);
  const atrSeries=calcATR(fullKlines).filter(v=>v!=null);
  cachedMarketStats.atr=atrSeries[atrSeries.length-1]||0;
  const change24=cachedMarketStats.prior?((last-cachedMarketStats.prior)/cachedMarketStats.prior*100):0;
  cachedMarketStats.structure=change24>1?'Sesgo alcista':change24<-1?'Sesgo bajista':'Balanceado';
}

function updateMarketDashboard(){
  if(!fullKlines.length)return;
  const last=+(lastPrice||fullKlines[fullKlines.length-1]?.close||0);
  const current=fullKlines[fullKlines.length-1];
  const change24=cachedMarketStats.prior?((last-cachedMarketStats.prior)/cachedMarketStats.prior*100):0;
  const candleDelta=current&&current.open?((current.close-current.open)/current.open*100):0;
  paintSigned('metric24hChange',change24,'%');
  paintSigned('metricCandleDelta',candleDelta,'%');
  setText('marketLast',last?fmtUSD(last,4):'—');
  setText('marketHigh',cachedMarketStats.high24?fmtUSD(cachedMarketStats.high24,4):'—');
  setText('marketLow',cachedMarketStats.low24?fmtUSD(cachedMarketStats.low24,4):'—');
  setText('marketVolume',fmtCompact(cachedMarketStats.vol24*last));
  setText('chartRangeText',cachedMarketStats.high24&&cachedMarketStats.low24?'Rango 24h '+fmtUSD(cachedMarketStats.low24,4)+' - '+fmtUSD(cachedMarketStats.high24,4):'Rango 24h —');
  setText('metricStructure',cachedMarketStats.structure);
  setText('telemetryVol',fmtCompact(cachedMarketStats.vol24*last));
  setText('telemetryAtr',cachedMarketStats.atr?fmtPct((cachedMarketStats.atr/Math.max(last,1))*100):'—');
  const tv=document.getElementById('telemetryAtr');
  if(tv)tv.style.color='var(--text)';
}
function updateTradeTelemetry(){
  const closed=Object.values(tradeMap.closed||{});
  const avgR=closed.length?closed.reduce((s,t)=>s+(+t.finalR||0),0)/closed.length:0;
  setText('telemetryAvgR',closed.length?((avgR>=0?'+':'')+avgR.toFixed(2)+'R'):'—');
  const ar=document.getElementById('telemetryAvgR');
  if(ar)ar.style.color=avgR>=0?'var(--green)':'var(--red)';
  setText('telemetryUnreal',fmtSignedUSD(accountSnapshot.totalUnreal||0));
  const tu=document.getElementById('telemetryUnreal');
  if(tu)tu.style.color=(accountSnapshot.totalUnreal||0)>=0?'var(--green)':'var(--red)';
}
function applyAccountSnapshot(acct){
  const balance=+(acct.balance||0);
  const available=+(acct.available||0);
  const totalMargin=+(acct.totalMargin||0);
  const totalUnreal=+(acct.totalUnreal||0);
  const openCount=+(acct.openPositions||0);
  const equity=+(acct.equity||balance+totalUnreal);
  const marginPct=balance>0?(totalMargin/balance*100):(cachedAccountDerived.marginPct||0);
  accountSnapshot={...acct,equity,balance,available,totalMargin,totalUnreal,openPositions:openCount};

  setText('acctBalance',balance>0?fmtUSD(balance):'—');
  setText('acctAvail',available>0?fmtUSD(available):'—');
  setText('acctMargin',fmtUSD(totalMargin));
  setText('acctUnreal',fmtSignedUSD(totalUnreal));
  const unEl=document.getElementById('acctUnreal');
  if(unEl)unEl.style.color=totalUnreal>=0?'var(--green)':'var(--red)';

  setText('acctPositions',openCount+' abiertas');
  setText('acctMarginPct',marginPct.toFixed(1)+'%');
  const bar=document.getElementById('acctMarginBar');
  if(bar){
    const pct=Math.min(marginPct,100);
    bar.style.width=pct+'%';
    bar.style.background=pct>60?'var(--red)':pct>30?'var(--gold)':'var(--blue)';
  }

  setText('acctDailyPnl',fmtSignedUSD(cachedAccountDerived.dailyPnl||0));
  const dpEl=document.getElementById('acctDailyPnl');
  if(dpEl)dpEl.style.color=(cachedAccountDerived.dailyPnl||0)>=0?'var(--green)':'var(--red)';
  setText('acctDailyRoi',balance>0?fmtPct(cachedAccountDerived.dailyRoi||0):'—');
  const roiEl=document.getElementById('acctDailyRoi');
  if(roiEl)roiEl.style.color=(cachedAccountDerived.dailyRoi||0)>=0?'var(--green)':'var(--red)';

  setText('metricMarginInUse',fmtUSD(totalMargin));
  setText('metricUnrealized',fmtSignedUSD(totalUnreal));
  const mu=document.getElementById('metricUnrealized');
  if(mu)mu.style.color=totalUnreal>=0?'var(--green)':'var(--red)';

  updateWorkspacePanel({dailyPnl:cachedAccountDerived.dailyPnl||0,marginPct});
  updateTradeTelemetry();
  syncExecutionPanel();
}
function syncExecutionPanel(){
  const hasTrade=!!currentTrade;
  const exposure=calcTradeExposure(currentTrade);
  const buyBtn=document.getElementById('execBuyBtn');
  const sellBtn=document.getElementById('execSellBtn');
  if(buyBtn)buyBtn.className='exec-btn'+((!hasTrade||currentTrade.side==='LONG')?' active':'');
  if(sellBtn)sellBtn.className='exec-btn'+(hasTrade&&currentTrade.side==='SHORT'?' sell-active':'');
  setText('execSymbol',SYMBOL);
  setText('execSideBadge',hasTrade?(isClosed?'CERRADO':currentTrade.side):'SEGUIMIENTO');
  const sideBadge=document.getElementById('execSideBadge');
  if(sideBadge){
    if(!hasTrade){sideBadge.style.color='var(--blue)';sideBadge.style.borderColor='rgba(61,158,255,.16)';sideBadge.style.background='rgba(61,158,255,.08)';}
    else if(currentTrade.side==='SHORT'){sideBadge.style.color='var(--red)';sideBadge.style.borderColor='rgba(255,61,90,.18)';sideBadge.style.background='rgba(255,61,90,.08)';}
    else{sideBadge.style.color='var(--green)';sideBadge.style.borderColor='rgba(0,229,160,.18)';sideBadge.style.background='rgba(0,229,160,.08)';}
  }
  const lev=+(currentTrade?.leverage||0);
  setText('execLevText',lev?lev+'x':'—');
  setWidth('execLevFill',Math.min(lev/20*100,100)+'%');
  const marginPct=parseFloat((document.getElementById('acctMarginPct')||{}).textContent)||0;
  setText('execAllocText',marginPct?marginPct.toFixed(1)+'%':'—');
  setWidth('execAllocFill',Math.min(marginPct,100)+'%');
  setText('execInvestedAmount',hasTrade&&exposure.invested?fmtUSD(exposure.invested):'—','gold');
  setText('execNotionalAmount',hasTrade&&exposure.notional?fmtUSD(exposure.notional):'—','blue');
  setText('execStatusPill',isClosed?'Snapshot cerrado':hasTrade?'Posición en vivo':'En espera');
  const pill=document.getElementById('execStatusPill');
  if(pill){
    if(isClosed){pill.style.background='rgba(90,122,154,.12)';pill.style.color='var(--text2)';pill.style.borderColor='rgba(90,122,154,.18)';}
    else if(hasTrade){pill.style.background='rgba(0,229,160,.08)';pill.style.color='var(--green)';pill.style.borderColor='rgba(0,229,160,.16)';}
    else{pill.style.background='rgba(61,158,255,.08)';pill.style.color='var(--blue)';pill.style.borderColor='rgba(61,158,255,.16)';}
  }
  const stageMeta = {INITIAL:'Inicial',BREAKEVEN:'Punto de equilibrio',LOCK:'Bloqueo',TRAILING:'Seguimiento',TIME_LOCK:'Bloqueo temporal'}[currentTrade?.stage||'INITIAL'] || (currentTrade?.stage||'Inicial');
  setText('execStageMeta',hasTrade?stageMeta:'Sin trade activo');
  setText('execPnlVal',(document.getElementById('pnlVal')||{}).textContent||'—');
  setText('execPnlPct',(document.getElementById('pnlPct')||{}).textContent||'—');
}
function renderDepthRows(targetId,rows,side){
  const el=document.getElementById(targetId);
  if(!el)return;
  if(!rows.length){el.innerHTML='<div class="book-empty">No depth data</div>';return;}
  const maxQty=Math.max(...rows.map(r=>+r[1]||0),1);
  el.innerHTML=rows.map(r=>{
    const price=+r[0],qty=+r[1],width=Math.min(qty/maxQty*100,100).toFixed(0)+'%';
    return '<div class="book-row '+side+'" style="--depth:'+width+'"><span class="book-price" style="color:'+(side==='ask'?'var(--red)':'var(--green)')+'">'+price.toFixed(4)+'</span><span class="book-size">'+qty.toFixed(3)+'</span></div>';
  }).join('');
}
function getRealtimeURL(channel){
  const protocol=window.location.protocol==='https:'?'wss:':'ws:';
  const url=new URL(protocol+'//'+window.location.host+'/ws');
  url.searchParams.set('channel',channel);
  if(channel==='market')url.searchParams.set('symbol',SYMBOL);
  return url.toString();
}
function schedulePriceReconnect(){
  if(isUnloading)return;
  clearTimeout(priceReconnectTimer);
  priceReconnectTimer=setTimeout(()=>{
    if(priceStream&&(priceStream.readyState===WebSocket.OPEN||priceStream.readyState===WebSocket.CONNECTING))return;
    connectSSE();
  },1000);
}
function scheduleAccountReconnect(){
  if(isUnloading)return;
  clearTimeout(accountReconnectTimer);
  accountReconnectTimer=setTimeout(()=>{
    if(accountStream&&(accountStream.readyState===WebSocket.OPEN||accountStream.readyState===WebSocket.CONNECTING))return;
    startAccountStream();
  },1000);
}
function startAccountStream(){
  if(accountStream&&(accountStream.readyState===WebSocket.OPEN||accountStream.readyState===WebSocket.CONNECTING))return accountStream;
  clearTimeout(accountReconnectTimer);
  accountStream=new WebSocket(getRealtimeURL('account'));
  accountStream.onmessage=ev=>{
    try{applyAccountSnapshot(JSON.parse(ev.data));}catch(e){}
  };
  accountStream.onclose=()=>{
    accountStream=null;
    scheduleAccountReconnect();
  };
  accountStream.onerror=()=>{ try{accountStream&&accountStream.close();}catch(e){} };
  return accountStream;
}

function unlinkPanelRange(name,panelChart){
  const link=rangeLinks[name];
  if(link?.main)chart.timeScale().unsubscribeVisibleLogicalRangeChange(link.main);
  if(link?.sub&&panelChart)panelChart.timeScale().unsubscribeVisibleLogicalRangeChange(link.sub);
  rangeLinks[name]={main:null,sub:null};
}
function linkPanelRange(name,panelChart){
  unlinkPanelRange(name,panelChart);
  const mainCb=r=>{ if(r&&panelChart)panelChart.timeScale().setVisibleLogicalRange(r); };
  const subCb=r=>{ if(r)chart.timeScale().setVisibleLogicalRange(r); };
  chart.timeScale().subscribeVisibleLogicalRangeChange(mainCb);
  panelChart.timeScale().subscribeVisibleLogicalRangeChange(subCb);
  rangeLinks[name]={main:mainCb,sub:subCb};
}

// ── Toggle indicator ───────────────────────────────────────────────────────────
function toggleInd(name,btn){
  indState[name]=!indState[name];
  btn.classList.toggle('on',indState[name]);
  if(indState[name]) showInd(name);
  else hideInd(name);
}

function showInd(name){
  if(!fullKlines.length)return;
  const closes=fullKlines.map(k=>k.close);
  const times=fullKlines.map(k=>k.time);

  if(name==='ema8'){
    if(indSeries.ema8)try{chart.removeSeries(indSeries.ema8)}catch(e){}
    indSeries.ema8=chart.addLineSeries({color:'#00e5a0',lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    const v=calcEMA(closes,8);
    indSeries.ema8.setData(times.map((t,i)=>({time:t,value:v[i]})));
  }
  if(name==='ema21'){
    if(indSeries.ema21)try{chart.removeSeries(indSeries.ema21)}catch(e){}
    indSeries.ema21=chart.addLineSeries({color:'#3d9eff',lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    const v=calcEMA(closes,21);
    indSeries.ema21.setData(times.map((t,i)=>({time:t,value:v[i]})));
  }
  if(name==='ema50'){
    if(indSeries.ema50)try{chart.removeSeries(indSeries.ema50)}catch(e){}
    indSeries.ema50=chart.addLineSeries({color:'#f5a623',lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    const v=calcEMA(closes,50);
    indSeries.ema50.setData(times.map((t,i)=>({time:t,value:v[i]})));
  }
  if(name==='vwap'){
    if(indSeries.vwap)try{chart.removeSeries(indSeries.vwap)}catch(e){}
    indSeries.vwap=chart.addLineSeries({color:'#a855f7',lineWidth:1,lineStyle:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    const v=calcVWAP(fullKlines);
    indSeries.vwap.setData(times.map((t,i)=>({time:t,value:v[i]})));
  }
  if(name==='vol'){
    const panel=document.getElementById('vol-panel');
    panel.style.display='block';
    if(volChart){unlinkPanelRange('vol',volChart);try{volChart.remove()}catch(e){}}
    volChart=LightweightCharts.createChart(panel,{
      width:panel.clientWidth,height:80,
      layout:{backgroundColor:'#060910',textColor:'#304560'},
      grid:{vertLines:{color:'#0a1220'},horzLines:{color:'#0a1220'}},
      rightPriceScale:{borderColor:'#182030',scaleMargins:{top:.1,bottom:.0}},
      timeScale:{borderColor:'#182030',timeVisible:true,visible:false},
      crosshair:{mode:LightweightCharts.CrosshairMode.Normal}
    });
    volSeries=volChart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'',scaleMargins:{top:.1,bottom:.0}});
    volSeries.setData(fullKlines.map(k=>({time:k.time,value:k.volume,color:k.close>=k.open?'rgba(0,229,160,.5)':'rgba(255,61,90,.5)'})));
    linkPanelRange('vol',volChart);
  }
  if(name==='rsi'){
    const panel=document.getElementById('rsi-panel');
    panel.style.display='block';
    if(rsiChart){unlinkPanelRange('rsi',rsiChart);try{rsiChart.remove()}catch(e){}}
    rsiChart=LightweightCharts.createChart(panel,{
      width:panel.clientWidth,height:90,
      layout:{backgroundColor:'#060910',textColor:'#304560'},
      grid:{vertLines:{color:'#0a1220'},horzLines:{color:'#0a1220'}},
      rightPriceScale:{borderColor:'#182030',scaleMargins:{top:.1,bottom:.1}},
      timeScale:{borderColor:'#182030',timeVisible:true,visible:false},
      crosshair:{mode:LightweightCharts.CrosshairMode.Normal}
    });
    rsiSeries=rsiChart.addLineSeries({color:'#ff8c42',lineWidth:1,priceLineVisible:false,lastValueVisible:true});
    rsiOB=rsiChart.addLineSeries({color:'rgba(255,61,90,.3)',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    rsiOS=rsiChart.addLineSeries({color:'rgba(0,229,160,.3)',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    const v=calcRSI(closes);
    const validData=times.map((t,i)=>v[i]!=null?{time:t,value:v[i]}:null).filter(Boolean);
    rsiSeries.setData(validData);
    rsiOB.setData(times.map(t=>({time:t,value:70})));
    rsiOS.setData(times.map(t=>({time:t,value:30})));
    linkPanelRange('rsi',rsiChart);
  }
  if(name==='sqz'){
    const panel=document.getElementById('sqz-panel');
    panel.style.display='block';
    if(sqzChart){unlinkPanelRange('sqz',sqzChart);try{sqzChart.remove()}catch(e){}}
    sqzChart=LightweightCharts.createChart(panel,{
      width:panel.clientWidth,height:70,
      layout:{backgroundColor:'#060910',textColor:'#304560'},
      grid:{vertLines:{color:'#0a1220'},horzLines:{color:'#0a1220'}},
      rightPriceScale:{borderColor:'#182030',scaleMargins:{top:.1,bottom:.1}},
      timeScale:{borderColor:'#182030',timeVisible:true,visible:false},
      crosshair:{mode:LightweightCharts.CrosshairMode.Normal}
    });
    sqzSeries=sqzChart.addHistogramSeries({priceLineVisible:false,lastValueVisible:false});
    sqzDotSeries=sqzChart.addLineSeries({lineWidth:0,priceLineVisible:false,lastValueVisible:false,crosshairMarkerRadius:4});
    const sqz=calcSqueeze(fullKlines);
    sqzSeries.setData(times.map((t,i)=>sqz[i]?.val!=null?{time:t,value:sqz[i].val,color:sqz[i].color}:null).filter(Boolean));
    sqzDotSeries.setData(times.map((t,i)=>({time:t,value:0,color:sqz[i]?.dot||'#304560'})));
    linkPanelRange('sqz',sqzChart);
  }
  if(name==='adx'){
    // ADX se superpone al precio como línea secundaria con escala separada
    if(indSeries.adx)try{chart.removeSeries(indSeries.adx)}catch(e){}
    indSeries.adx=chart.addLineSeries({color:'#ff3d5a',lineWidth:1,priceScaleId:'adx',priceLineVisible:false,lastValueVisible:true});
    indSeries.adx.priceScale().applyOptions({scaleMargins:{top:.7,bottom:.0},borderColor:'transparent'});
    const v=calcADX(fullKlines);
    const validData=times.map((t,i)=>v[i]!=null?{time:t,value:v[i]}:null).filter(Boolean);
    indSeries.adx.setData(validData);
  }
}

function hideInd(name){
  if(name==='ema8'&&indSeries.ema8){try{chart.removeSeries(indSeries.ema8)}catch(e){}indSeries.ema8=null;}
  if(name==='ema21'&&indSeries.ema21){try{chart.removeSeries(indSeries.ema21)}catch(e){}indSeries.ema21=null;}
  if(name==='ema50'&&indSeries.ema50){try{chart.removeSeries(indSeries.ema50)}catch(e){}indSeries.ema50=null;}
  if(name==='vwap'&&indSeries.vwap){try{chart.removeSeries(indSeries.vwap)}catch(e){}indSeries.vwap=null;}
  if(name==='adx'&&indSeries.adx){try{chart.removeSeries(indSeries.adx)}catch(e){}indSeries.adx=null;}
  if(name==='vol'){document.getElementById('vol-panel').style.display='none';if(volChart){unlinkPanelRange('vol',volChart);try{volChart.remove()}catch(e){}}volChart=null;}
  if(name==='rsi'){document.getElementById('rsi-panel').style.display='none';if(rsiChart){unlinkPanelRange('rsi',rsiChart);try{rsiChart.remove()}catch(e){}}rsiChart=null;}
  if(name==='sqz'){document.getElementById('sqz-panel').style.display='none';if(sqzChart){unlinkPanelRange('sqz',sqzChart);try{sqzChart.remove()}catch(e){}}sqzChart=null;}
}

function refreshActiveInds(){
  Object.keys(indState).forEach(n=>{if(indState[n])showInd(n);});
}

function drawZones(t){
  if(!hasTradeLevels(t))return;
  try{if(slZone)chart.removeSeries(slZone)}catch(e){}
  try{if(tpZone)chart.removeSeries(tpZone)}catch(e){}
  if(!klineData.length)return;
  const t0=klineData[0].time,t1=klineData[klineData.length-1].time+14400;
  const entry=+t.entryPrice,sl=+t.sl,tp=+t.tp;
  slZone=chart.addAreaSeries({topColor:'rgba(255,61,90,.12)',bottomColor:'rgba(255,61,90,.02)',lineColor:'transparent',lineWidth:0,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
  slZone.setData([{time:t0,value:Math.max(entry,sl)},{time:t1,value:Math.max(entry,sl)}]);
  tpZone=chart.addAreaSeries({topColor:'rgba(0,229,160,.02)',bottomColor:'rgba(0,229,160,.10)',lineColor:'transparent',lineWidth:0,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
  tpZone.setData([{time:t0,value:Math.max(entry,tp)},{time:t1,value:Math.max(entry,tp)}]);
}
function hasTradeLevels(t){
  const entry=+t?.entryPrice,sl=+t?.sl,tp=+t?.tp;
  return Number.isFinite(entry) && entry>0 && Number.isFinite(sl) && sl>0 && Number.isFinite(tp) && tp>0;
}
function hasSLLevel(t){
  const sl=+t?.sl;
  return Number.isFinite(sl) && sl>0;
}
function hasTPLevel(t){
  const tp=+t?.tp;
  return Number.isFinite(tp) && tp>0;
}
function drawLevels(t,closed){
  try{if(entryLine)candles.removePriceLine(entryLine)}catch(e){}
  try{if(slLine)candles.removePriceLine(slLine)}catch(e){}
  try{if(tpLine)candles.removePriceLine(tpLine)}catch(e){}
  const e=+t.entryPrice,s=+t.sl,p=+t.tp;
  const hasLevels=hasTradeLevels(t);
  const hasSL=hasSLLevel(t);
  const hasTP=hasTPLevel(t);
  if(Number.isFinite(e)&&e>0){
    entryLine=candles.createPriceLine({price:e,color:closed?'#1a3a6a':'#3d9eff',lineWidth:closed?1:2,lineStyle:closed?2:0,axisLabelVisible:true,title:'ENTRY'});
  }
  if(hasSL){
    slLine=candles.createPriceLine({price:s,color:closed?'#6a1020':'#ff3d5a',lineWidth:closed?1:2,lineStyle:1,axisLabelVisible:true,title:'SL ↑ STOP'});
  }
  if(hasTP){
    tpLine=candles.createPriceLine({price:p,color:closed?'#0a4a2a':'#00e5a0',lineWidth:closed?1:2,lineStyle:1,axisLabelVisible:true,title:'TP ↓ TARGET'});
  }
  if(hasLevels){
    if(!closed)drawZones(t);
  } else {
    try{if(slZone)chart.removeSeries(slZone)}catch(e){}
    try{if(tpZone)chart.removeSeries(tpZone)}catch(e){}
  }
  document.getElementById('lEntry').textContent=t.entryPrice;
  document.getElementById('lSL').textContent=hasSL?t.sl:'—';
  document.getElementById('lTP').textContent=hasTP?t.tp:'—';
  document.getElementById('sQty').textContent=t.qty;
  document.getElementById('sLev').textContent=(t.leverage||'—')+'x';
  document.getElementById('sScore').textContent=(t.finalScore||'—')+'/100';
  document.getElementById('sRegime').textContent=t.aiRegime||'—';
  const dist=(a,b)=>((Math.abs(a-b)/a)*100).toFixed(2)+'%';
  document.getElementById('dSL').textContent=hasSL?dist(e,s)+' del entry':'—';
  document.getElementById('dTP').textContent=hasTP?dist(e,p)+' del entry':'—';
  document.getElementById('dEntry').textContent=lastPrice&&e?dist(lastPrice,e)+' del precio':'—';
  const stage=t.stage||'INITIAL';
  const isLiveOnly=t.source==='BINANCE_LIVE'||stage==='LIVE_ONLY';
  const slbl={INITIAL:'Inicial',BREAKEVEN:'Punto de equilibrio ⚖',LOCK:'Bloqueo +0.5R 🔒',TRAILING:'Seguimiento ATR 🎯',TIME_LOCK:'Bloqueo temporal ⏰'}[stage]||stage;
  const protectionText = hasSL ? (hasTP ? 'SL+TP' : 'Solo SL') : (hasTP ? 'Solo TP' : 'Sin SL');
  document.getElementById('sStage').innerHTML=isLiveOnly
    ? '<span class="stage-pill"><span class="stage-dot"></span>Live Binance · '+protectionText+'</span>'
    : '<span class="stage-pill s-'+stage+'"><span class="stage-dot"></span>'+slbl+'</span>';
  // Hours open
  const minsOpen=Math.floor((Date.now()-(t.openedAt||Date.now()))/60000);
  const hoursEl=document.getElementById('sHours');
  hoursEl.textContent=minsOpen<60?minsOpen+'m':Math.floor(minsOpen/60)+'h '+(minsOpen%60)+'m abierto';
  // Stage progress bar
  const spEl=document.getElementById('stageProgress');
  const sbEl=document.getElementById('stageBar');
  const nsEl=document.getElementById('nextStageLabel');
  spEl.style.display=isLiveOnly?'none':'block';
  const stageOrder=['INITIAL','BREAKEVEN','TIME_LOCK','LOCK','TRAILING'];
  const stageIdx=stageOrder.indexOf(stage);
  const progress=((stageIdx+1)/stageOrder.length*100).toFixed(0);
  sbEl.style.width=progress+'%';
  const stageColors={INITIAL:'var(--muted)',BREAKEVEN:'var(--blue)',TIME_LOCK:'#f5a623',LOCK:'var(--green)',TRAILING:'var(--purple)'};
  sbEl.style.background=stageColors[stage]||'var(--blue)';
  const nextStages={INITIAL:'→ 1R punto de equilibrio',BREAKEVEN:'→ 1.5R bloqueo / temporal',TIME_LOCK:'→ 1.5R bloqueo',LOCK:'→ 2R seguimiento',TRAILING:'✅ Máximo'};
  nsEl.textContent=nextStages[stage]||'—';
  const hd=document.getElementById('hDir');
  hd.textContent=t.side;
  hd.className='nav-pill '+(closed?'pill-closed':t.side==='SHORT'?'pill-short':'pill-long');
  if(hasLevels){
    candles.applyOptions({autoscaleInfoProvider:()=>({priceRange:{minValue:Math.min(e,s,p)*.994,maxValue:Math.max(e,s,p)*1.006},margins:{above:10,below:10}})});
  }
  syncExecutionPanel();
}
// ── Account data ──────────────────────────────────────────────────────────────
async function loadAccountData(){
  if(pendingFetches.account)return;
  pendingFetches.account=true;
  try{
    const acctResp=await fetch('/api/account');
    applyAccountSnapshot(await acctResp.json());
  }catch(e){ console.error('Account data error:', e); }
  finally{pendingFetches.account=false;}
}

async function loadDailyStats(){
  if(pendingFetches.stats)return;
  pendingFetches.stats=true;
  try{
    const statsResp=await fetch('/db/stats');
    const stats=await statsResp.json();
    const balance=+(accountSnapshot.balance||0);
    const totalMargin=+(accountSnapshot.totalMargin||0);
    const recent=stats.recent||[];
    const today=new Date().toISOString().slice(0,10);
    const todayClosed=recent.filter(t=>
      t.pnl_usdt!=null &&
      (t.closed_at||'').toString().slice(0,10)===today
    );
    const dailyPnl=todayClosed.reduce((s,t)=>s+(+t.pnl_usdt||0),0);
    const marginPct=balance>0?(totalMargin/balance*100):0;
    const dailyRoi=balance>0?(dailyPnl/balance*100):0;
    cachedAccountDerived={dailyPnl,dailyRoi,marginPct};
    applyAccountSnapshot(accountSnapshot);
  }catch(e){ console.error('Stats data error:', e); }
  finally{pendingFetches.stats=false;}
}

async function loadKlines(){
  if(pendingFetches.klines)return;
  pendingFetches.klines=true;
  try{
    const r=await fetch('/api/klines?symbol='+SYMBOL+'&interval=1h&limit=100');
    const raw=await r.json();
    if(!Array.isArray(raw))return;
    klineData=raw.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4]}));
    // Store full klines with volume for indicator calculations
    fullKlines=raw.map(k=>({time:Math.floor(k[0]/1000),open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
    candles.setData(klineData);
    const latest=fullKlines[fullKlines.length-1];
	    if(latest){
	      const prevClose=fullKlines[fullKlines.length-2]?.close ?? latest.close;
	      lastPrice=latest.close;
      const pe=document.getElementById('hPrice');
      writeAnimatedText(pe,'$'+lastPrice.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4}),lastPrice>=prevClose?'green':'red',true);
      pe.className='nav-price '+(lastPrice>=prevClose?'up':'down');
      setText('marketLast',fmtUSD(lastPrice,4));
	    }
	    chart.timeScale().fitContent();
	    if(currentTrade)drawLevels(currentTrade,isClosed);
	    // Refresh any active indicators with new data
	    refreshActiveInds();
	    recomputeMarketStats();
	    updateMarketDashboard();
	  }catch(e){console.error('Klines:',e)}
  finally{pendingFetches.klines=false;}
}
function connectSSE(){
  if(priceStream&&(priceStream.readyState===WebSocket.OPEN||priceStream.readyState===WebSocket.CONNECTING))return priceStream;
  clearTimeout(priceReconnectTimer);
  priceStream=new WebSocket(getRealtimeURL('market'));
  priceStream.onopen=()=>{document.getElementById('liveDot').className='live-dot on';document.getElementById('liveTxt').textContent='live';};
  priceStream.onmessage=ev=>{
    try{
      const msg=JSON.parse(ev.data);
      if(msg.type!=='candle')return;
      const c=msg.candle;
      const prevTime=klineData[klineData.length-1]?.time||0;
      const isNewCandle=c.time>prevTime;
      candles.update({time:c.time,open:c.open,high:c.high,low:c.low,close:c.close});
      if(klineData.length&&prevTime===c.time){
        klineData[klineData.length-1]={...c};
        if(fullKlines.length)fullKlines[fullKlines.length-1]={...fullKlines[fullKlines.length-1],...c};
      } else if(isNewCandle){
        klineData.push({...c});
        if(fullKlines.length)fullKlines.push({...c,volume:0});
      }
      const prev=lastPrice;lastPrice=c.close;
      const pe=document.getElementById('hPrice');
      const priceText='$'+lastPrice.toLocaleString('en-US',{minimumFractionDigits:4,maximumFractionDigits:4});
      if(pe.textContent!==priceText){
        writeAnimatedText(pe,priceText,lastPrice>=(prev||lastPrice)?'green':'red',true);
      }
      pe.className='nav-price '+(lastPrice>=(prev||lastPrice)?'up':'down');
      const nowIso=new Date().toISOString();
      const nowUtc=nowIso.replace('T',' ').slice(0,19)+' UTC';
      const shortUtc=nowIso.slice(11,19)+' UTC';
      setText('hTime',nowUtc);
      setText('lastUpdate',nowUtc);
      setText('detailUpdated','updated '+shortUtc);
      setText('execUpdated','updated '+shortUtc);
      if(isNewCandle||c.closed)recomputeMarketStats();
      updateMarketDashboard();
      if(!isClosed)updatePnL();
    }catch(e){}
  };
  priceStream.onclose=()=>{
    priceStream=null;
    document.getElementById('liveDot').className='live-dot';
    document.getElementById('liveTxt').textContent='offline';
    schedulePriceReconnect();
  };
  priceStream.onerror=()=>{ try{priceStream&&priceStream.close();}catch(e){} };
  return priceStream;
}
function updatePnL(){
  if(!lastPrice||!currentTrade||isClosed)return;
  const e=+currentTrade.entryPrice,s=+currentTrade.sl,q=+currentTrade.qty,side=currentTrade.side;
  const tp=+currentTrade.tp;
  const fallbackUnrealized=+currentTrade.unrealized||0;
  const pnl=(e>0&&q>0)?(side==='SHORT'?(e-lastPrice)*q:(lastPrice-e)*q):fallbackUnrealized;
  const pct=e>0?((pnl/(e*q))*100).toFixed(2):'0.00';
  const win=side==='SHORT'?lastPrice<e:lastPrice>e;
  // R: initialSL > SL actual > inferir desde TP asumiendo RR 1:2
  const initialSL=+(currentTrade.initialSL||0);
  const ir=initialSL>0 ? Math.abs(e-initialSL)
         : s>0         ? Math.abs(e-s)
         : null;
  const curR=ir?Math.abs(lastPrice-e)/ir:null;
  // PnL hero
  document.getElementById('pnlHero').className='pnl-hero'+(pnl<0?' loss':'');
  const pv=document.getElementById('pnlVal');
  const pvTxt=(pnl>=0?'+':'')+'$'+Math.abs(pnl).toFixed(2);
  if(pv.textContent!==pvTxt){writeAnimatedText(pv,pvTxt,pnl>=0?'green':'red',true);pv.style.color=pnl>=0?'var(--green)':'var(--red)';}
  const pp=document.getElementById('pnlPct');
  const ppTxt=(pnl>=0?'+':'')+pct+'%';
  if(pp.textContent!==ppTxt){writeAnimatedText(pp,ppTxt,pnl>=0?'green':'red',true);pp.style.color=pnl>=0?'var(--green)':'var(--red)';}
  // Duracion
  const mins=Math.floor((Date.now()-currentTrade.openedAt)/60000);
  const durTxt=mins<60?mins+' min':Math.floor(mins/60)+'h '+(mins%60)+'m';
  const durEl=document.getElementById('dur');
  if(durEl.textContent!==durTxt)durEl.textContent=durTxt;
  // Horas abiertas en sidebar stage
  const hoursEl2=document.getElementById('sHours');
  if(hoursEl2){const ht=mins<60?mins+'m':Math.floor(mins/60)+'h '+(mins%60)+'m abierto';if(hoursEl2.textContent!==ht)hoursEl2.textContent=ht;}
  // R display
  const rTxt=curR==null?'—':(win?'+':'-')+curR.toFixed(2)+'R';
  const rv=document.getElementById('rVal');
  if(rv.textContent!==rTxt){writeAnimatedText(rv,rTxt,win?'green':'red',true);rv.className='r-big '+(win?'r-pos':'r-neg');}
  const fillW=curR==null?'0%':Math.min(curR/2*100,100).toFixed(0)+'%';
  const fill=document.getElementById('rFill');
  if(fill.style.width!==fillW){fill.style.width=fillW;fill.className='r-fill '+(win?'r-fill-p':'r-fill-n');}
  // Distancias niveles — solo actualizar si cambia
  const slPct=s>0?((Math.abs(lastPrice-s)/lastPrice)*100).toFixed(2):null;
  const tpPct=tp>0?((Math.abs(lastPrice-tp)/lastPrice)*100).toFixed(2):null;
  const ePct=e>0?((Math.abs(lastPrice-e)/lastPrice)*100).toFixed(2):null;
  const dSL=document.getElementById('dSL'),dTP=document.getElementById('dTP'),dE=document.getElementById('dEntry');
  if(dSL.dataset.v!==(slPct||'—')){dSL.textContent=slPct?slPct+'% del precio':'—';dSL.dataset.v=slPct||'—';}
  if(dTP.dataset.v!==(tpPct||'—')){dTP.textContent=tpPct?tpPct+'% del precio':'—';dTP.dataset.v=tpPct||'—';}
  if(dE.dataset.v!==(ePct||'—')){dE.textContent=ePct?ePct+'% del precio':'—';dE.dataset.v=ePct||'—';}
  // Ocultar indicadores parpadeantes
  document.getElementById('sl-indicator').style.display='none';
  document.getElementById('tp-indicator').style.display='none';
  syncExecutionPanel();
}
function showClosed(t){
  document.getElementById('closedBanner').innerHTML='<div class="closed-banner">POSICIÓN CERRADA — HISTORIAL</div>';
  document.getElementById('pnlLbl').textContent='PnL Final';
  const pnl=t.finalPnL||0,e=+t.entryPrice,q=+t.qty;
  const pv=document.getElementById('pnlVal');
  writeAnimatedText(pv,(pnl>=0?'+':'')+'$'+Math.abs(pnl).toFixed(2),pnl>=0?'green':'red',true);
  pv.style.color=pnl>=0?'var(--green)':'var(--red)';
  const pct=e>0?((pnl/(e*q))*100).toFixed(2):'0.00';
  const pp=document.getElementById('pnlPct');
  writeAnimatedText(pp,(pnl>=0?'+':'')+pct+'%',pnl>=0?'green':'red',true);
  pp.style.color=pnl>=0?'var(--green)':'var(--red)';
  const dur=t.duration||0,m=Math.floor(dur/60000);
  document.getElementById('dur').textContent=m<60?m+' min':Math.floor(m/60)+'h '+(m%60)+'m';
  const fr=parseFloat(t.finalR||0),pos=fr>=0;
  const rv=document.getElementById('rVal');
  writeAnimatedText(rv,(pos?'+':'')+fr.toFixed(2)+'R',pos?'green':'red',true);
  rv.className='r-big '+(pos?'r-pos':'r-neg');
  const fill=document.getElementById('rFill');
  fill.style.width=Math.min(Math.abs(fr)/2*100,100)+'%';
  fill.className='r-fill '+(pos?'r-fill-p':'r-fill-n');
  const rm={sl:'SL Activado 🛑',tp:'TP Alcanzado 🎯',manual:'Cierre Manual',sync:'Sincronizado'};
  document.getElementById('closedSec').style.display='block';
  document.getElementById('closedContent').innerHTML=
    '<div class="result-row"><span class="rr-lbl">Exit Price</span><span class="rr-val">$'+(t.exitPrice||'—')+'</span></div>'+
    '<div class="result-row" style="margin-top:4px"><span class="rr-lbl">Razón</span><span class="rr-val c-muted">'+(rm[t.closeReason]||t.closeReason||'—')+'</span></div>';
  syncExecutionPanel();
}
function clearClosed(){
  document.getElementById('closedBanner').innerHTML='';
  document.getElementById('pnlLbl').textContent='PnL No Realizado';
  document.getElementById('closedSec').style.display='none';
  document.getElementById('sl-indicator').style.display='none';
  document.getElementById('tp-indicator').style.display='none';
  syncExecutionPanel();
}
function renderWatchlist(active,closed){
  const openEl=document.getElementById('wl-open'),closedEl=document.getElementById('wl-closed');
  openEl.innerHTML='';closedEl.innerHTML='';
  const totalCount=Object.keys(active).length+Object.keys(closed).length;
  document.getElementById('wl-count').textContent=totalCount;
  document.getElementById('wl-open-lbl').style.display=Object.keys(active).length?'block':'none';
  document.getElementById('wl-close-lbl').style.display=Object.keys(closed).length?'block':'none';
  Object.entries(active).forEach(([sym,t])=>{
    const entry=+t.entryPrice||0;
    const qty=+t.qty||0;
    const price=wlPrices[sym]||+t.markPrice||entry;
    const hasCalc=entry>0&&qty>0&&price>0;
    const pnl=hasCalc
      ? (t.side==='SHORT'?(entry-price)*qty:(price-entry)*qty)
      : (+t.unrealized||0);
    const initialSL=+(t.initialSL||t.sl);
    const ir=initialSL>0&&entry>0?Math.abs(entry-initialSL):0;
    const curR=ir>0?((Math.abs(price-entry)/ir)*(pnl>=0?1:-1)).toFixed(2):null;
    const isAct=sym===SYMBOL;
    const protectionBadge = t.sl ? '' : ' · SIN SL';
    const liveBadge=t.source==='BINANCE_LIVE'?'● LIVE BINANCE'+protectionBadge:'● LIVE';
    const el=document.createElement('div');
    el.className='wl-item'+(isAct?' active open-'+t.side.toLowerCase():' open-'+t.side.toLowerCase());
    el.innerHTML='<div class="wl-row1"><div class="wl-sym">'+sym.replace('USDT','')+'<span>/USDT</span></div><div class="wl-pnl '+(pnl>=0?'pp':'pn')+'">'+(pnl>=0?'+':'')+'$'+Math.abs(pnl).toFixed(2)+'</div></div>'+
      '<div class="wl-row2"><span class="wl-badge live">'+liveBadge+'</span><span class="wl-r '+((curR==null||+curR>=0)?'c-green':'c-red')+'">'+(curR==null?'—':((+curR>=0?'+':'')+curR+'R'))+'</span></div>'+
      '<div class="wl-bar"><div class="wl-bar-fill '+(pnl>=0?'wl-bar-p':'wl-bar-n')+'" style="width:'+(curR==null?0:Math.min(Math.abs(+curR)/2*100,100))+'%"></div></div>';
    el.onclick=()=>window.location.href='/dashboard?symbol='+sym;
    openEl.appendChild(el);
  });
  Object.entries(closed).forEach(([sym,t])=>{
    const pnl=t.finalPnL||0,fr=t.finalR||'0',isAct=sym===SYMBOL;
    const el=document.createElement('div');
    el.className='wl-item closed-item'+(isAct?' active':'');
    el.innerHTML='<div class="wl-row1"><div class="wl-sym" style="color:var(--text2)">'+sym.replace('USDT','')+'<span>/USDT</span></div><div class="wl-pnl '+(pnl>=0?'pp':'pn')+'">'+(pnl>=0?'+':'')+'$'+Math.abs(pnl).toFixed(2)+'</div></div>'+
      '<div class="wl-row2"><span class="wl-badge closed">◉ CERRADO</span><span class="wl-r '+(+fr>=0?'c-green':'c-red')+'">'+(+fr>=0?'+':'')+fr+'R</span></div>';
    el.onclick=()=>window.location.href='/dashboard?symbol='+sym;
    closedEl.appendChild(el);
  });
}
async function loadTrades(){
  if(pendingFetches.trades)return;
  pendingFetches.trades=true;
  try{
    const r=await fetch('/trades');
    const data=await r.json();
    const active=data.active||{},closed=data.closed||{};
    tradeMap={active,closed};
    try{ const pr=await fetch('/api/all-prices'); const pd=await pr.json(); Object.assign(wlPrices,pd); }catch(e){}
    if(lastPrice)wlPrices[SYMBOL]=lastPrice;
    renderWatchlist(active,closed);
    const prev=currentTrade,wasC=isClosed;
    if(active[SYMBOL]){
      currentTrade=active[SYMBOL];isClosed=false;clearClosed();
      document.getElementById('noTrade').style.display='none';
      const changed=!prev||prev.sl!==currentTrade.sl||prev.tp!==currentTrade.tp||prev.stage!==currentTrade.stage;
      if(changed)drawLevels(currentTrade,false);
    }else if(closed[SYMBOL]){
      currentTrade=closed[SYMBOL];isClosed=true;
      document.getElementById('noTrade').style.display='none';
      if(!wasC||prev?.symbol!==SYMBOL){drawLevels(currentTrade,true);showClosed(currentTrade)}
    }else{
      currentTrade=null;document.getElementById('noTrade').style.display='flex';
    }
    document.getElementById('hSym').textContent=SYMBOL;
    updateTradeTelemetry();
    updateWorkspacePanel({dailyPnl:0,marginPct:parseFloat((document.getElementById('acctMarginPct')||{}).textContent)||0});
    syncExecutionPanel();
    window.AterumAssistant?.notifyContextChanged({refetchSummary:true});
  }catch(e){console.log('Trades:',e.message)}
  finally{pendingFetches.trades=false;}
}
// ── Panel resize ──────────────────────────────────────────────────────────────
let resizeState=null;
function startResize(e,panelId){
  e.preventDefault();
  const panel=document.getElementById(panelId);
  const startY=e.touches?e.touches[0].clientY:e.clientY;
  const startH=panel.offsetHeight;
  resizeState={panel,startY,startH};
  document.addEventListener('mousemove',doResize);
  document.addEventListener('mouseup',stopResize);
  document.addEventListener('touchmove',doResize,{passive:false});
  document.addEventListener('touchend',stopResize);
}
function doResize(e){
  if(!resizeState)return;
  e.preventDefault();
  const y=e.touches?e.touches[0].clientY:e.clientY;
  const delta=resizeState.startY-y; // drag up = bigger
  const newH=Math.min(300,Math.max(50,resizeState.startH+delta));
  resizeState.panel.style.height=newH+'px';
  // Resize the chart inside
  const id=resizeState.panel.id;
  const chartMap={['vol-panel']:volChart,['rsi-panel']:rsiChart,['sqz-panel']:sqzChart};
  const ch=chartMap[id];
  if(ch)ch.applyOptions({height:newH});
}
function stopResize(){
  resizeState=null;
  document.removeEventListener('mousemove',doResize);
  document.removeEventListener('mouseup',stopResize);
  document.removeEventListener('touchmove',doResize);
  document.removeEventListener('touchend',stopResize);
}

const resizeObserver=new ResizeObserver(()=>{
  syncChartLayout();
});
resizeObserver.observe(container);
window.addEventListener('resize',syncResponsiveState);
window.addEventListener('orientationchange',()=>setTimeout(syncResponsiveState,120));
window.addEventListener('beforeunload',()=>{
  isUnloading=true;
  clearChartShellAnimation();
  clearTimeout(priceReconnectTimer);
  clearTimeout(accountReconnectTimer);
  if(priceStream)try{priceStream.close();}catch(e){}
  if(accountStream)try{accountStream.close();}catch(e){}
});
syncResponsiveState();
initEliteMotion();
connectSSE();startAccountStream();loadKlines();loadTrades();loadAccountData();loadDailyStats();
setInterval(loadKlines,300000);setInterval(loadTrades,5000);setInterval(updatePnL,1000);setInterval(loadAccountData,300000);setInterval(loadDailyStats,300000);
</script>
<script>${getSharedScript()}</script>
</body></html>`; }

module.exports = { getDashboardHTML };
