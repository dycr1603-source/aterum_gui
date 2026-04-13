'use strict';

const {
  getSharedHeadAssets,
  getLoadingMarkup,
  getSharedChrome,
  getSharedStyles,
  getSharedScript,
  getSharedNav
} = require('./ui_shared');

function getAIDataHTML(user) { return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>αтεгυм — Inteligencia IA</title>
${getSharedHeadAssets()}
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{
  --bg:#090b0a;--bg2:#111411;--bg3:#171c17;--bg4:#20261f;--bg5:#293128;
  --border:rgba(231,239,226,.1);--border2:rgba(231,239,226,.18);--border3:rgba(231,239,226,.28);
  --text:#f3f7ef;--text2:#9da89b;--muted:#687266;
  --green:#82f06f;--red:#ff5d73;--blue:#5be7c4;--gold:#f5c45f;--purple:#b6a1ff;--orange:#ff9e58;
  --mono:'JetBrains Mono',monospace;--display:'Inter Tight','Inter','SF Pro Display',sans-serif;--sans:'Inter','SF Pro Text','Segoe UI',sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
body{background:linear-gradient(180deg,#090b0a 0%,#11140f 46%,#080a08 100%);color:var(--text);font-family:var(--sans);font-size:12px;min-height:100vh}
.nav{height:56px;background:rgba(9,11,9,.9);border-bottom:1px solid var(--border2);display:flex;align-items:center;padding:0 28px;position:sticky;top:0;z-index:200;backdrop-filter:blur(20px)}
.nav-logo{font-family:var(--display);font-size:14px;font-weight:900;letter-spacing:.12em;display:flex;align-items:center;gap:8px;margin-right:32px}
.nav-dot{width:6px;height:6px;border-radius:50%;background:var(--purple);box-shadow:0 0 12px var(--purple);animation:glow 2s ease-in-out infinite}
@keyframes glow{0%,100%{box-shadow:0 0 8px var(--purple)}50%{box-shadow:0 0 20px var(--purple),0 0 40px rgba(168,85,247,.3)}}
.nav-links{display:flex;gap:2px}
.nav-link{font-size:10px;color:var(--text2);text-decoration:none;letter-spacing:.08em;text-transform:uppercase;padding:7px 14px;border-radius:5px;transition:all .15s;border:1px solid transparent}
.nav-link:hover{color:var(--text);background:var(--bg3);border-color:var(--border2)}
.nav-link.active{color:var(--purple);background:rgba(168,85,247,.08);border-color:rgba(168,85,247,.2)}
.page{padding:28px;max-width:1600px;margin:0 auto}
.page-hdr{margin-bottom:28px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px}
.page-title{font-family:var(--display);font-size:26px;font-weight:900;letter-spacing:-.01em}
.page-title span{color:var(--purple)}
.page-sub{font-size:10px;color:var(--text2);letter-spacing:.05em;margin-top:4px}

/* FILTERS */
.filters{display:flex;gap:8px;margin-bottom:24px;background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:12px 16px;flex-wrap:wrap;align-items:center}
.f-lbl{font-size:9px;color:var(--text2);letter-spacing:.1em;text-transform:uppercase}
.f-sep{width:1px;height:20px;background:var(--border2);margin:0 4px}
.f-btn{background:transparent;border:1px solid var(--border2);border-radius:4px;color:var(--text2);padding:5px 12px;font-family:var(--mono);font-size:10px;cursor:pointer;transition:all .15s}
.f-btn:hover{border-color:var(--purple);color:var(--purple)}
.f-btn.on{background:rgba(168,85,247,.1);border-color:rgba(168,85,247,.3);color:var(--purple)}
.f-sel{background:var(--bg3);border:1px solid var(--border2);border-radius:4px;color:var(--text);padding:5px 10px;font-family:var(--mono);font-size:10px;cursor:pointer;outline:none}
.f-sel:focus{border-color:var(--purple)}

/* STAT CARDS */
.stat-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:20px}
.stat-card{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:16px;position:relative;overflow:hidden;transition:border-color .2s}
.stat-card:hover{border-color:var(--border3)}
.stat-card-accent{position:absolute;top:0;left:0;right:0;height:2px}
.stat-lbl{font-size:9px;color:var(--text2);letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px}
.stat-val{font-family:var(--display);font-size:22px;font-weight:800;line-height:1}
.stat-sub{font-size:9px;color:var(--text2);margin-top:4px}

/* PERFORMANCE GRIDS */
.perf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px}
.perf-card{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;overflow:hidden}
.perf-hdr{padding:12px 18px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;justify-content:space-between;align-items:center}
.perf-title{font-size:9px;color:var(--text2);letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.perf-body{padding:0}
.perf-row{display:flex;align-items:center;gap:10px;padding:10px 18px;border-bottom:1px solid rgba(22,32,48,.6);transition:background .1s}
.perf-row:last-child{border-bottom:none}
.perf-row:hover{background:rgba(11,17,28,.6)}
.perf-name{font-size:11px;font-weight:700;min-width:90px}
.perf-bar-wrap{flex:1;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden}
.perf-bar{height:100%;border-radius:2px;transition:width .6s}
.perf-wr{font-size:10px;color:var(--text2);min-width:36px;text-align:right}
.perf-pnl{font-size:11px;font-weight:600;min-width:60px;text-align:right}
.perf-r{font-size:10px;color:var(--text2);min-width:40px;text-align:right}

/* AI TRADE TABLE */
.tbl-card{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;overflow:hidden;margin-bottom:16px}
.tbl-hdr{padding:14px 20px;border-bottom:1px solid var(--border);background:var(--bg3);display:flex;justify-content:space-between;align-items:center}
.tbl-title{font-size:9px;color:var(--text2);letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.tbl-badge{font-size:9px;padding:3px 8px;border-radius:3px;background:var(--bg4);border:1px solid var(--border2);color:var(--text2)}
.tbl-wrap{max-height:500px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border2) transparent}
.tbl-wrap::-webkit-scrollbar{width:3px}.tbl-wrap::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
table{width:100%;border-collapse:collapse}
th{padding:9px 14px;text-align:left;font-size:9px;color:var(--text2);letter-spacing:.1em;text-transform:uppercase;border-bottom:1px solid var(--border2);background:var(--bg3);position:sticky;top:0;z-index:1;white-space:nowrap}
td{padding:9px 14px;border-bottom:1px solid rgba(22,32,48,.5);font-size:10px;transition:background .1s;white-space:nowrap}
tr:hover td{background:rgba(11,17,28,.7)}
tr:last-child td{border-bottom:none}

/* BADGES */
.badge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:.04em}
.b-long{background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.2)}
.b-short{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.2)}
.b-confirms{background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.2)}
.b-contradicts{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.2)}
.b-neutral{background:rgba(90,122,154,.1);color:var(--text2);border:1px solid var(--border2)}
.b-trending{background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.15)}
.b-ranging{background:rgba(245,166,35,.1);color:var(--gold);border:1px solid rgba(245,166,35,.15)}
.b-highvol{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.15)}
.b-bullish{background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.2)}
.b-bearish{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.2)}
.b-early{background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.2)}
.b-mid{background:rgba(61,158,255,.1);color:var(--blue);border:1px solid rgba(61,158,255,.2)}
.b-late{background:rgba(245,166,35,.1);color:var(--gold);border:1px solid rgba(245,166,35,.2)}
.b-parabolic{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.2)}
.pp{color:var(--green);font-weight:600}.pn{color:var(--red);font-weight:600}
.rp{color:var(--green)}.rn{color:var(--red)}

/* POST TRADE */
.post-item{padding:14px 18px;border-bottom:1px solid rgba(22,32,48,.6)}
.post-item:last-child{border-bottom:none}
.post-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.post-sym{font-family:var(--display);font-size:12px;font-weight:800}
.post-analysis{font-size:10px;color:var(--text2);line-height:1.6;white-space:pre-wrap}

/* MISC */
.loading{display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text2);gap:10px}
.spin{width:16px;height:16px;border:2px solid var(--border2);border-top-color:var(--purple);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.empty{padding:40px;text-align:center;color:var(--text2);font-size:11px}
.charts-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
@media(max-width:900px){.charts-row{grid-template-columns:1fr}}
.chart-card{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;overflow:hidden}
.chart-hdr{padding:12px 18px;border-bottom:1px solid var(--border);background:var(--bg3)}
.chart-title{font-size:9px;color:var(--text2);letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.chart-body{padding:16px}
canvas{max-height:200px}

/* INTELLIGENCE LAYER */
.intel-shell{display:grid;gap:18px;margin-bottom:22px}
.intel-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(320px,.95fr);gap:18px;align-items:start}
.intel-main,.intel-side{display:grid;gap:18px}
.intel-card{
  position:relative;
  overflow:hidden;
  background:linear-gradient(180deg,rgba(11,18,30,.95),rgba(8,13,22,.9));
  border:1px solid rgba(87,176,255,.14);
  border-radius:24px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 22px 54px rgba(0,0,0,.2);
  backdrop-filter:blur(18px);
  transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .28s ease,border-color .24s ease;
}
.intel-card::before{
  content:'';
  position:absolute;
  inset:0 auto auto 0;
  width:100%;
  height:1px;
  background:linear-gradient(90deg,rgba(87,176,255,.34),rgba(0,229,160,.14),transparent 72%);
  pointer-events:none;
}
.intel-card:hover{
  transform:translateY(-4px);
  border-color:rgba(87,176,255,.24);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 28px 70px rgba(0,0,0,.24),0 0 34px rgba(87,176,255,.08);
}
.intel-card-body{padding:20px}
.intel-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px}
.intel-kicker,.intel-label,.session-mini,.chat-time{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text2)}
.intel-headline{font-family:var(--display);font-size:28px;font-weight:900;letter-spacing:-.03em;line-height:1.05}
.intel-copy{font-size:12px;color:#9ab0cb;line-height:1.65;max-width:70ch}
.intel-hero{padding:22px 22px 18px}
.intel-hero::after{
  content:'';
  position:absolute;
  right:-40px;
  top:-48px;
  width:220px;
  height:220px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(87,176,255,.18),transparent 68%);
  pointer-events:none;
}
.intel-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;justify-content:flex-end}
.intel-select,.ask-input{
  min-height:42px;
  border-radius:16px;
  border:1px solid rgba(87,176,255,.16);
  background:rgba(9,16,27,.8);
  color:var(--text);
  font-family:var(--mono);
  font-size:11px;
  padding:0 14px;
  outline:none;
  transition:border-color .2s ease,box-shadow .2s ease,transform .2s ease;
}
.intel-select:focus,.ask-input:focus{
  border-color:rgba(87,176,255,.38);
  box-shadow:0 0 0 4px rgba(87,176,255,.08);
}
.posture-row{display:grid;grid-template-columns:minmax(0,1.2fr) repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}
.posture-card{
  position:relative;
  border:1px solid rgba(87,176,255,.12);
  border-radius:18px;
  padding:16px;
  background:linear-gradient(180deg,rgba(14,22,36,.94),rgba(10,17,28,.88));
  overflow:hidden;
}
.posture-card::after{
  content:'';
  position:absolute;
  inset:auto -20px -60px auto;
  width:120px;
  height:120px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(87,176,255,.1),transparent 70%);
  pointer-events:none;
}
.posture-card-main{padding-right:16px}
.posture-pill{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding:6px 12px;
  border-radius:999px;
  border:1px solid rgba(255,255,255,.08);
  font-size:10px;
  letter-spacing:.12em;
  text-transform:uppercase;
  margin-bottom:12px;
}
.pill-bullish{color:var(--green);background:rgba(0,229,160,.1);border-color:rgba(0,229,160,.18)}
.pill-bearish{color:var(--red);background:rgba(255,83,111,.1);border-color:rgba(255,83,111,.18)}
.pill-neutral{color:var(--blue);background:rgba(87,176,255,.1);border-color:rgba(87,176,255,.18)}
.posture-title{font-family:var(--display);font-size:18px;font-weight:800;line-height:1.15}
.posture-sub{font-size:11px;color:#8fa8c6;line-height:1.6;margin-top:8px}
.metric-label{font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--text2);margin-bottom:10px}
.metric-value{font-family:var(--display);font-size:26px;font-weight:900;letter-spacing:-.03em}
.metric-sub{font-size:10px;color:#8fa8c6;margin-top:6px}
.tone-good .metric-value,.tone-good .session-status,.tone-good .insight-dot{color:var(--green)}
.tone-bad .metric-value,.tone-bad .session-status,.tone-bad .insight-dot{color:var(--red)}
.tone-warn .metric-value,.tone-warn .session-status,.tone-warn .insight-dot{color:var(--gold)}
.tone-info .metric-value,.tone-info .session-status,.tone-info .insight-dot{color:var(--blue)}
.insight-list,.news-list,.session-list,.starter-row{display:grid;gap:12px}
.insight-item,.news-item,.session-card,.chat-msg{
  border:1px solid rgba(87,176,255,.12);
  border-radius:18px;
  background:linear-gradient(180deg,rgba(14,22,36,.92),rgba(10,16,27,.86));
  overflow:hidden;
}
.insight-item{padding:16px 18px;display:grid;gap:8px}
.insight-top,.news-top,.chat-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
.insight-title,.news-title,.session-title{font-size:13px;font-weight:800;line-height:1.35}
.insight-detail,.news-summary,.session-detail,.chat-copy{font-size:11px;line-height:1.7;color:#94acc9}
.insight-dot{
  width:9px;
  height:9px;
  border-radius:50%;
  box-shadow:0 0 16px currentColor;
  flex:0 0 auto;
}
.tone-good .insight-dot{background:var(--green)}
.tone-bad .insight-dot{background:var(--red)}
.tone-warn .insight-dot{background:var(--gold)}
.tone-info .insight-dot{background:var(--blue)}
.news-item{padding:16px 18px;display:grid;gap:10px}
.news-meta,.session-meta,.chip-row,.chat-list{display:flex;flex-wrap:wrap;gap:8px}
.news-link{color:var(--text);text-decoration:none}
.news-link:hover{color:#bfe0ff}
.chip{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:5px 10px;
  border-radius:999px;
  border:1px solid rgba(87,176,255,.14);
  background:rgba(9,16,27,.78);
  font-size:9px;
  letter-spacing:.1em;
  text-transform:uppercase;
  color:var(--text2);
}
.chip.good{color:var(--green);border-color:rgba(0,229,160,.2);background:rgba(0,229,160,.08)}
.chip.bad{color:var(--red);border-color:rgba(255,83,111,.2);background:rgba(255,83,111,.08)}
.chip.warn{color:var(--gold);border-color:rgba(245,184,75,.2);background:rgba(245,184,75,.08)}
.chip.info{color:var(--blue);border-color:rgba(87,176,255,.2);background:rgba(87,176,255,.08)}
.timeline-card{
  margin-bottom:14px;
  padding:16px;
  border:1px solid rgba(87,176,255,.12);
  border-radius:18px;
  background:linear-gradient(180deg,rgba(14,22,36,.92),rgba(10,16,27,.86));
}
.timeline-track{
  position:relative;
  height:14px;
  border-radius:999px;
  background:rgba(7,12,20,.86);
  border:1px solid rgba(87,176,255,.12);
  overflow:hidden;
  margin:14px 0 12px;
}
.timeline-seg{position:absolute;top:1px;bottom:1px;border-radius:999px;opacity:.9}
.timeline-now{
  position:absolute;
  top:-4px;
  bottom:-4px;
  width:2px;
  border-radius:999px;
  background:#d8e9fb;
  box-shadow:0 0 14px rgba(216,233,251,.55);
}
.timeline-labels{
  display:flex;
  justify-content:space-between;
  gap:10px;
  color:var(--text2);
  font-size:9px;
  letter-spacing:.1em;
  text-transform:uppercase;
}
.session-card{padding:16px 18px;display:grid;gap:10px}
.session-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.session-flag{font-size:18px}
.session-status{font-size:10px;letter-spacing:.13em;text-transform:uppercase;font-weight:800}
.session-detail{font-size:10px}
.assistant-card{position:sticky;top:148px}
.assistant-launch-shell{display:grid;gap:14px}
.assistant-preview-grid{display:grid;gap:10px}
.assistant-preview{
  padding:14px 16px;
  border-radius:18px;
  border:1px solid rgba(255,255,255,.08);
  background:rgba(255,255,255,.03);
  display:grid;
  gap:8px;
}
.assistant-preview.good{border-color:rgba(0,229,160,.14);background:rgba(0,229,160,.05)}
.assistant-preview.bad{border-color:rgba(255,83,111,.16);background:rgba(255,83,111,.05)}
.assistant-preview.warn{border-color:rgba(245,184,75,.16);background:rgba(245,184,75,.06)}
.assistant-preview.info{border-color:rgba(87,176,255,.16);background:rgba(87,176,255,.05)}
.assistant-preview-title{
  font-size:10px;
  letter-spacing:.12em;
  text-transform:uppercase;
  color:var(--text2);
  font-family:var(--mono);
  font-weight:700;
}
.assistant-preview-copy{
  font-size:11px;
  line-height:1.7;
  color:#9ab2d1;
}
.starter-row{grid-template-columns:1fr 1fr}
.starter-btn,.ask-send{
  border:none;
  min-height:42px;
  border-radius:16px;
  padding:10px 14px;
  font-family:var(--sans);
  font-size:11px;
  cursor:pointer;
  transition:transform .18s ease,box-shadow .18s ease,filter .18s ease;
}
.starter-btn{
  text-align:left;
  color:var(--text);
  background:linear-gradient(180deg,rgba(17,28,45,.95),rgba(10,16,27,.92));
  border:1px solid rgba(87,176,255,.14);
}
.starter-btn:hover,.ask-send:hover{
  transform:translateY(-1px) scale(1.01);
  box-shadow:0 12px 26px rgba(87,176,255,.14);
}
.starter-btn:active,.ask-send:active{transform:scale(.985)}
.ask-send{
  min-width:124px;
  color:#04131d;
  font-weight:800;
  background:linear-gradient(135deg,#82d4ff,#00e5a0);
}
.ask-send[disabled]{opacity:.6;cursor:wait;filter:saturate(.6)}
.intel-empty{padding:18px;border-radius:18px;border:1px dashed rgba(87,176,255,.14);color:var(--text2);font-size:11px}

/* ── VERSION C PREMIUM OVERRIDES ───────────────────────────────────────────── */
html{background:var(--bg)}
body{
  background:
    radial-gradient(circle at top left,rgba(178,111,255,.16),transparent 26%),
    radial-gradient(circle at 82% 0%,rgba(87,176,255,.11),transparent 24%),
    radial-gradient(circle at 50% 120%,rgba(0,229,160,.07),transparent 28%),
    linear-gradient(180deg,#091322 0%,#0c1728 50%,#08111f 100%);
  color:var(--text);
}
body::before{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;
  background:
    linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px);
  background-size:68px 68px;
  mask-image:radial-gradient(circle at center,black 42%,transparent 90%);
  opacity:.22;
}
.nav{
  min-height:72px;
  height:auto;
  padding:14px 24px;
  background:rgba(8,14,24,.78);
  border-bottom:1px solid rgba(168,85,247,.12);
  box-shadow:0 12px 40px rgba(0,0,0,.22);
  gap:16px;
  flex-wrap:wrap;
}
.nav-logo{
  padding:10px 14px;
  margin-right:18px;
  border:1px solid rgba(168,85,247,.16);
  border-radius:18px;
  background:linear-gradient(180deg,rgba(14,21,35,.92),rgba(8,14,22,.84));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 8px 30px rgba(0,0,0,.18);
}
.nav-links{
  display:flex;
  align-items:center;
  gap:6px;
  flex:1;
  flex-wrap:wrap;
}
.nav-link{
  padding:9px 14px;
  border-radius:999px;
}
.nav-link:hover{
  background:rgba(13,21,34,.9);
  border-color:rgba(168,85,247,.18);
  box-shadow:0 0 0 1px rgba(168,85,247,.04) inset;
}
.nav-link.active{
  background:linear-gradient(180deg,rgba(168,85,247,.18),rgba(168,85,247,.08));
  box-shadow:0 10px 24px rgba(168,85,247,.14);
}
.page{
  position:relative;
  padding:32px 28px 72px;
}
.page-hdr{
  margin-bottom:24px;
  padding:24px 26px;
  border-radius:26px;
  border:1px solid rgba(168,85,247,.12);
  background:
    linear-gradient(135deg,rgba(12,20,34,.92),rgba(7,12,20,.82)),
    radial-gradient(circle at top left,rgba(168,85,247,.08),transparent 42%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.04),
    0 24px 70px rgba(0,0,0,.24);
  position:relative;
  overflow:hidden;
}
.page-hdr::after{
  content:'';
  position:absolute;
  inset:auto 10px -70px auto;
  width:220px;
  height:220px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(168,85,247,.16),transparent 68%);
  pointer-events:none;
}
.page-title{
  font-size:34px;
  letter-spacing:-.03em;
}
.page-sub{
  color:#8a9bbb;
  font-size:11px;
}
.filters,.stat-card,.perf-card,.chart-card,.tbl-card{
  background:linear-gradient(180deg,rgba(11,18,30,.94),rgba(8,13,22,.88));
  border:1px solid rgba(168,85,247,.12);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 18px 45px rgba(0,0,0,.2);
  backdrop-filter:blur(18px);
}
.filters,.stat-card,.perf-card,.chart-card,.tbl-card,.page-hdr{
  transition:transform .28s cubic-bezier(.22,1,.36,1),box-shadow .3s ease,border-color .24s ease;
}
.stat-card:hover,.perf-card:hover,.chart-card:hover,.tbl-card:hover,.page-hdr:hover{
  transform:translateY(-4px);
  border-color:rgba(178,111,255,.24);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 24px 56px rgba(4,10,18,.24),0 0 28px rgba(178,111,255,.08);
}
.filters{
  border-radius:20px;
  padding:14px 16px;
  position:sticky;
  top:88px;
  z-index:30;
}
.f-btn,.f-sel{
  min-height:34px;
  border-radius:999px;
  background:rgba(10,17,29,.82);
}
.f-btn.on{
  background:linear-gradient(180deg,rgba(168,85,247,.18),rgba(168,85,247,.08));
  box-shadow:0 8px 20px rgba(168,85,247,.14);
}
.stat-row{
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:14px;
}
.stat-card{
  border-radius:22px;
  padding:18px;
}
.stat-val{
  font-size:28px;
}
.perf-grid,.charts-row{
  gap:18px;
}
.perf-card,.chart-card,.tbl-card{
  border-radius:24px;
}
.perf-hdr,.chart-hdr,.tbl-hdr{
  padding:16px 20px;
  background:linear-gradient(180deg,rgba(14,22,36,.94),rgba(10,16,26,.88));
  border-bottom:1px solid rgba(168,85,247,.1);
}
.perf-row{
  padding:12px 18px;
}
.perf-row:hover{
  background:rgba(18,24,42,.72);
}
.tbl-badge{
  border-radius:999px;
  padding:5px 10px;
  background:rgba(9,16,27,.84);
}
.tbl-wrap{
  background:linear-gradient(180deg,rgba(8,13,22,.82),rgba(7,12,20,.92));
}
th{
  background:rgba(12,19,31,.95);
  border-bottom-color:rgba(168,85,247,.12);
}
td{
  border-bottom-color:rgba(168,85,247,.08);
}
tr:hover td{
  background:rgba(20,24,44,.72);
}
.post-item{
  padding:16px 18px;
}
.post-analysis{
  color:#9ab0cb;
}
.loading{
  min-height:120px;
}
@media(max-width:960px){
  .nav{
    padding:12px 16px;
  }
  .page{
    padding:20px 16px 60px;
  }
  .page-hdr,.perf-card,.chart-card,.tbl-card{
    border-radius:22px;
  }
  .page-title{
    font-size:28px;
  }
  .filters{
    top:78px;
  }
  .intel-grid,.posture-row,.starter-row,.ask-form{
    grid-template-columns:1fr;
  }
  .assistant-card{
    position:relative;
    top:0;
  }
}
@media(max-width:680px){
  .filters{
    position:relative;
    top:0;
    border-radius:18px;
  }
  .stat-row,.perf-grid,.charts-row{
    grid-template-columns:1fr;
  }
  .intel-hero,.intel-card-body,.timeline-card,.session-card,.news-item,.insight-item,.chat-msg{
    padding-left:16px;
    padding-right:16px;
  }
}
${getSharedStyles()}
</style>
</head>
<body>
${getSharedChrome({accent:'#a855f7',accentSoft:'rgba(168,85,247,.2)',secondary:'rgba(61,158,255,.12)',loaderLabel:'Cargando inteligencia IA'})}
<div class="page-shell">
${getSharedNav('aidata', user, 'purple')}
<div class="page">
  <div class="page-hdr">
    <div>
      <div class="page-title">Centro de <span>Inteligencia</span> IA</div>
      <div class="page-sub">Noticias, sesiones, señales, aprendizaje y contexto operativo en tiempo real</div>
    </div>
  </div>

  <div class="intel-shell" id="inteligencia">
    <div class="intel-grid">
      <div class="intel-main">
        <section class="intel-card intel-hero">
          <div class="intel-card-head">
            <div>
              <div class="intel-kicker">Inteligencia de Mercado</div>
              <div class="intel-headline">De datos dispersos a decisiones operativas</div>
              <div class="intel-copy" id="intelSummary">Cargando tono global, sesiones, noticias y lectura del libro interno...</div>
            </div>
            <div class="intel-toolbar">
              <div>
                <div class="intel-label">Símbolo foco</div>
                <select id="intelSymbol" class="intel-select" onchange="handleSymbolChange()">
                  <option value="">Portafolio</option>
                </select>
              </div>
            </div>
          </div>
          <div class="posture-row" id="postureRow">${getLoadingMarkup('Cargando postura de mercado')}</div>
        </section>

        <section class="intel-card">
          <div class="intel-card-body">
            <div class="intel-card-head">
              <div>
                <div class="intel-kicker">Insights Accionables</div>
                <div class="intel-copy">Dirección probable, lectura de riesgo y timing operativo generados desde sesiones, noticias y tu libro en vivo.</div>
              </div>
              <span class="chip info" id="intelGenerated">Actualizando...</span>
            </div>
            <div class="insight-list" id="insightList">${getLoadingMarkup('Cargando insights')}</div>
          </div>
        </section>

        <section class="intel-card">
          <div class="intel-card-body">
            <div class="intel-card-head">
              <div>
                <div class="intel-kicker">Señal Pro y Aprendizaje</div>
                <div class="intel-copy">Señal operativa, alertas inteligentes y patrones del usuario para convertir contexto en ventaja real.</div>
              </div>
              <span class="chip warn" id="signalBadge">Cargando</span>
            </div>
            <div class="insight-list" id="signalCard">${getLoadingMarkup('Cargando señal profesional')}</div>
            <div class="intel-card-head" style="margin-top:18px">
              <div>
                <div class="intel-kicker">Alertas Inteligentes</div>
              </div>
            </div>
            <div class="insight-list" id="alertList">${getLoadingMarkup('Cargando alertas')}</div>
            <div class="intel-card-head" style="margin-top:18px">
              <div>
                <div class="intel-kicker">Aprendizaje del Usuario</div>
              </div>
            </div>
            <div class="insight-list" id="learningList">${getLoadingMarkup('Cargando aprendizaje')}</div>
          </div>
        </section>

        <section class="intel-card">
          <div class="intel-card-body">
            <div class="intel-card-head">
              <div>
                <div class="intel-kicker">Noticias y Señales</div>
                <div class="intel-copy">Titulares macro, crypto y regulatorios enriquecidos con sentimiento, impacto, urgencia, activos afectados y reacción probable.</div>
              </div>
              <span class="chip warn">Feed en vivo</span>
            </div>
            <div class="news-list" id="newsList">${getLoadingMarkup('Cargando noticias inteligentes')}</div>
          </div>
        </section>
      </div>

      <div class="intel-side">
        <section class="intel-card">
          <div class="intel-card-body">
            <div class="intel-card-head">
              <div>
                <div class="intel-kicker">Sesiones Globales</div>
                <div class="intel-copy">Asia, Europa y USA con estado, cuenta regresiva, volatilidad esperada y tendencia probable antes de comprometer capital.</div>
              </div>
            </div>
            <div class="timeline-card" id="sessionTimeline">${getLoadingMarkup('Cargando línea de sesiones')}</div>
            <div class="session-list" id="sessionList">${getLoadingMarkup('Cargando sesiones')}</div>
          </div>
        </section>

        <section class="intel-card assistant-card" id="asistente-ia">
          <div class="intel-card-body assistant-launch-shell">
            <div class="intel-card-head">
              <div>
                <div class="intel-kicker">Asistente IA</div>
                <div class="intel-copy">Ahora vive como panel flotante en toda la plataforma y responde con contexto real de noticias, sesiones, señal y posiciones.</div>
              </div>
              <span class="chip good">Flotante + contextual</span>
            </div>
            <div class="assistant-preview-grid" id="assistantPreview">${getLoadingMarkup('Preparando lectura del asistente')}</div>
            <div class="starter-row" id="starterRow">${getLoadingMarkup('Preparando asistente')}</div>
            <div style="display:flex;justify-content:flex-end">
              <button class="ask-send" type="button" onclick="abrirAsistenteIA()">Abrir asistente</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <!-- FILTERS -->
  <div class="filters">
    <span class="f-lbl">Periodo:</span>
    <button class="f-btn on" onclick="setPeriod(7,this)">7D</button>
    <button class="f-btn" onclick="setPeriod(30,this)">30D</button>
    <button class="f-btn" onclick="setPeriod(90,this)">90D</button>
    <button class="f-btn" onclick="setPeriod(0,this)">Todo</button>
    <div class="f-sep"></div>
    <span class="f-lbl">Resultado:</span>
    <select class="f-sel" id="fResult" onchange="applyFilters()">
      <option value="">Todos</option>
      <option value="win">Ganadores</option>
      <option value="loss">Perdedores</option>
    </select>
    <span class="f-lbl">4H:</span>
    <select class="f-sel" id="fTf4h" onchange="applyFilters()">
      <option value="">Todos</option>
      <option value="CONFIRMS">Confirma</option>
      <option value="CONTRADICTS">Contradice</option>
      <option value="NEUTRAL">Neutral</option>
    </select>
    <span class="f-lbl">Macro:</span>
    <select class="f-sel" id="fMacro" onchange="applyFilters()">
      <option value="">Todos</option>
      <option value="BULLISH">Alcista</option>
      <option value="BEARISH">Bajista</option>
      <option value="NEUTRAL">Neutral</option>
    </select>
    <span class="f-lbl">Vision:</span>
    <select class="f-sel" id="fVision" onchange="applyFilters()">
      <option value="">Todos</option>
      <option value="EARLY_TREND">Tendencia temprana</option>
      <option value="MID_TREND">Tendencia media</option>
      <option value="LATE_TREND">Tendencia tardía</option>
      <option value="PARABOLIC">Parabólico</option>
    </select>
  </div>

  <!-- STAT CARDS -->
  <div class="stat-row" id="statRow">${getLoadingMarkup('Cargando señales AI')}</div>

  <!-- PERFORMANCE GRIDS -->
  <div class="perf-grid">
    <div class="perf-card">
      <div class="perf-hdr"><span class="perf-title">⏱ Marco 4H</span></div>
      <div class="perf-body" id="perf4h">${getLoadingMarkup('Cargando 4H')}</div>
    </div>
    <div class="perf-card">
      <div class="perf-hdr"><span class="perf-title">🌍 Contexto Macro</span></div>
      <div class="perf-body" id="perfMacro">${getLoadingMarkup('Cargando macro')}</div>
    </div>
    <div class="perf-card">
      <div class="perf-hdr"><span class="perf-title">📷 Visión IA</span></div>
      <div class="perf-body" id="perfVision">${getLoadingMarkup('Cargando visión')}</div>
    </div>
    <div class="perf-card">
      <div class="perf-hdr"><span class="perf-title">📈 Régimen AI</span></div>
      <div class="perf-body" id="perfRegime">${getLoadingMarkup('Cargando régimen')}</div>
    </div>
  </div>

  <!-- CHARTS -->
  <div class="charts-row">
    <div class="chart-card">
      <div class="chart-hdr"><div class="chart-title">Puntaje vs PnL</div></div>
      <div class="chart-body"><canvas id="chartScore"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-hdr"><div class="chart-title">Fear & Greed al entrar</div></div>
      <div class="chart-body"><canvas id="chartFG"></canvas></div>
    </div>
  </div>

  <!-- POST-TRADE ANALYSES -->
  <div class="tbl-card" style="margin-bottom:16px">
    <div class="tbl-hdr">
      <span class="tbl-title">🔍 Análisis Post-Trade</span>
      <span class="tbl-badge" id="ptCount">—</span>
    </div>
    <div class="tbl-wrap"><div id="postList" class="loading-shell-wrap">${getLoadingMarkup('Cargando análisis post-trade')}</div></div>
  </div>

  <!-- FULL AI TRADE TABLE -->
  <div class="tbl-card">
    <div class="tbl-hdr">
      <span class="tbl-title">🤖 Trades con Contexto IA Completo</span>
      <span class="tbl-badge" id="tblCount">—</span>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead><tr>
          <th>Par</th><th>Dir</th><th>Puntaje</th>
          <th>4H</th><th>Macro</th><th>Visión</th><th>Régimen</th>
          <th>Lev</th><th>FG</th><th>PnL</th><th>R</th><th>Etapa</th><th>Fecha</th>
        </tr></thead>
        <tbody id="aiTbl"></tbody>
      </table>
    </div>
  </div>
</div>
</div>

<script>
let allData = null;
let intelData = null;
let period = 7;
let currentSymbol = '';
window.aterumAssistantConfig = {
  page: 'aidata',
  kicker: 'Asistente IA',
  subtitle: 'Cruza noticias, sesiones, señales y tus posiciones para responder con lectura operativa real.',
  placeholder: '¿Qué riesgo tengo en mi posición actual?'
};

function getAIDataAssistantContext(){
  const current = intelData?.positions?.current || null;
  const openSession = (intelData?.sessions || []).find(session => session.status === 'abierta') || (intelData?.sessions || [])[0] || null;
  return {
    pagina: 'aidata',
    activo: currentSymbol || intelData?.symbol || current?.symbol || '',
    pnl: current?.unrealized ?? intelData?.positions?.totalUnrealized ?? null,
    posicion: current ? {
      symbol: current.symbol,
      side: current.side,
      leverage: current.leverage,
      unrealized: current.unrealized,
      entryPrice: current.entryPrice,
      markPrice: current.markPrice,
      stopLoss: current.stopLoss,
      takeProfit: current.takeProfit,
      margin: current.margin
    } : null,
    noticias: (intelData?.news || []).slice(0, 3),
    sesion: openSession ? openSession.label : null,
    senal: intelData?.signal ? {
      accion: intelData.signal.action,
      confianza: intelData.signal.confidence,
      riesgo: intelData.signal.risk
    } : null,
    postura: intelData?.posture || null,
    alertas: intelData?.alerts || []
  };
}

window.aterumAssistantContext = getAIDataAssistantContext;

async function loadData(){
  const aiUrl = \`/db/ai-data?period=\${period}&limit=200\`;
  const intelUrl = \`/api/intelligence/summary?page=aidata\${currentSymbol ? '&symbol=' + encodeURIComponent(currentSymbol) : ''}\`;

  const [aiResult, intelResult] = await Promise.allSettled([
    fetch(aiUrl).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Datos IA no disponibles');
      return data;
    }),
    fetch(intelUrl).then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Inteligencia de mercado no disponible');
      return data;
    })
  ]);

  if (aiResult.status === 'fulfilled') {
    allData = aiResult.value;
    render();
  } else {
    allData = null;
    document.getElementById('statRow').innerHTML = '<div class="empty">Error cargando datos de inteligencia IA</div>';
  }

  if (intelResult.status === 'fulfilled') {
    intelData = intelResult.value;
    syncSymbolSelector();
    renderIntelligence();
  } else {
    intelData = null;
    renderIntelligenceError(intelResult.reason?.message || 'No se pudo cargar la inteligencia de mercado');
  }
}

function setPeriod(d, btn){
  period = d;
  document.querySelectorAll('.f-btn').forEach(b => b.classList.toggle('on', b===btn));
  loadData();
}

function handleSymbolChange(){
  currentSymbol = document.getElementById('intelSymbol').value || '';
  window.AterumAssistant?.notifyContextChanged({ refetchSummary: true, clearHistory: true });
  loadData();
}

function applyFilters(){ render(); }

function getFiltered(){
  if(!allData) return [];
  let rows = allData.trades || [];
  const fResult = document.getElementById('fResult').value;
  const fTf4h   = document.getElementById('fTf4h').value;
  const fMacro  = document.getElementById('fMacro').value;
  const fVision = document.getElementById('fVision').value;

  if(fResult === 'win')  rows = rows.filter(t => +t.pnl_usdt > 0);
  if(fResult === 'loss') rows = rows.filter(t => +t.pnl_usdt <= 0);
  if(fTf4h)   rows = rows.filter(t => t.tf4h_status === fTf4h);
  if(fMacro)  rows = rows.filter(t => t.macro_bias === fMacro);
  if(fVision) rows = rows.filter(t => t.vision_state === fVision);
  return rows;
}

function render(){
  if(!allData) return;
  const rows = getFiltered();
  const closed = rows.filter(t => t.pnl_usdt != null);
  const wins   = closed.filter(t => +t.pnl_usdt > 0);
  const totalPnL = closed.reduce((s,t) => s+(+t.pnl_usdt||0), 0);
  const avgScore = closed.length ? (closed.reduce((s,t)=>s+(+t.final_score||0),0)/closed.length).toFixed(1) : 0;
  const avgR     = closed.length ? (closed.reduce((s,t)=>s+(+t.r_final||0),0)/closed.length).toFixed(2) : 0;
  const wr       = closed.length ? ((wins.length/closed.length)*100).toFixed(1) : 0;

  const stats = [
    { lbl:'Trades Analizados', val:closed.length, sub:rows.length+' total', color:'var(--purple)', accent:'var(--purple)' },
    { lbl:'Tasa de Acierto', val:wr+'%', sub:wins.length+'G / '+(closed.length-wins.length)+'P', color:'var(--blue)', accent:'var(--blue)' },
    { lbl:'PnL Total', val:(totalPnL>=0?'+':'')+'$'+Math.abs(totalPnL).toFixed(2), sub:'periodo seleccionado', color:totalPnL>=0?'var(--green)':'var(--red)', accent:totalPnL>=0?'var(--green)':'var(--red)' },
    { lbl:'Puntaje promedio', val:avgScore, sub:'de 100 pts', color:'var(--gold)', accent:'var(--gold)' },
    { lbl:'R promedio', val:(+avgR>=0?'+':'')+avgR+'R', sub:'por trade cerrado', color:+avgR>=0?'var(--green)':'var(--red)', accent:+avgR>=0?'var(--green)':'var(--red)' },
    { lbl:'Análisis PT', val:allData.postTrades?.length||0, sub:'análisis guardados', color:'var(--orange)', accent:'var(--orange)' },
  ];

  document.getElementById('statRow').innerHTML = stats.map(s =>
    \`<div class="stat-card">
      <div class="stat-card-accent" style="background:\${s.accent}"></div>
      <div class="stat-lbl">\${s.lbl}</div>
      <div class="stat-val" style="color:\${s.color}">\${s.val}</div>
      <div class="stat-sub">\${s.sub}</div>
    </div>\`
  ).join('');

  renderPerfGrid('perf4h', allData.tf4hStats, 'tf4h_status', s => s.tf4h_status || 'N/A');
  renderPerfGrid('perfMacro', allData.macroStats, 'macro_bias', s => s.macro_bias || 'N/A');
  renderPerfGrid('perfVision', allData.visionStats, 'vision_state', s => s.vision_state || 'N/A');
  renderPerfGrid('perfRegime', allData.regimeStats, 'ai_regime', s => s.ai_regime || 'N/A');

  renderScoreChart(closed);
  renderFGChart(closed);
  renderPostTrades(allData.postTrades || []);
  renderTable(rows);
  window.AterumAssistant?.notifyContextChanged();
}

function renderIntelligence(){
  if (!intelData) return;
  const performance = intelData.performance || {};
  const positions = intelData.positions || {};
  const current = positions.current;
  const postureBias = intelData.posture?.bias || 'neutral';

  document.getElementById('intelSummary').textContent = intelData.posture?.summary || 'El contexto de mercado se está actualizando.';
  document.getElementById('intelGenerated').textContent = 'Actualizado ' + formatAgo(intelData.generatedAt);
  document.getElementById('signalBadge').textContent = (intelData.signal?.action || 'NO OPERAR') + ' · ' + (intelData.signal?.confidence || 'baja');

  const postureCards = [
    {
      className: 'posture-card posture-card-main',
      body: \`<div class="posture-pill \${pillClass(postureBias)}">\${escapeHtml(postureBias)} · confianza \${escapeHtml(intelData.posture?.confidence || 'baja')}</div>
      <div class="posture-title">La lectura de \${escapeHtml(currentSymbol || 'portafolio')} es \${escapeHtml(postureBias)}</div>
      <div class="posture-sub">\${escapeHtml(intelData.posture?.summary || '')}</div>\`
    },
    {
      className: 'posture-card ' + toneClass(postureBias === 'alcista' ? 'good' : postureBias === 'bajista' ? 'bad' : 'info'),
      body: \`<div class="metric-label">Tasa de acierto 30D</div>
      <div class="metric-value">\${Number(performance.overall?.winRate || 0)}%</div>
      <div class="metric-sub">\${Number(performance.overall?.tradeCount || 0)} trades cerrados analizados</div>\`
    },
    {
      className: 'posture-card ' + toneClass((positions.totalUnrealized || 0) >= 0 ? 'good' : 'bad'),
      body: \`<div class="metric-label">PnL Abierto</div>
      <div class="metric-value">\${formatMoney(positions.totalUnrealized || 0, true)}</div>
      <div class="metric-sub">\${Number(positions.openPositions || 0)} posiciones activas en el libro</div>\`
    },
    {
      className: 'posture-card ' + toneClass(current ? (current.unrealized >= 0 ? 'good' : 'warn') : 'info'),
      body: \`<div class="metric-label">Ventana de Atención</div>
      <div class="metric-value">\${escapeHtml(sessionFocusLabel())}</div>
      <div class="metric-sub">\${current ? escapeHtml(current.symbol + ' ' + current.side + ' · ' + Number(current.leverage || 0) + 'x') : 'Selecciona un símbolo o consulta a la IA por BTC, ETH o tu libro actual.'}</div>\`
    }
  ];

  document.getElementById('postureRow').innerHTML = postureCards.map(card => \`<div class="\${card.className}">\${card.body}</div>\`).join('');
  document.getElementById('insightList').innerHTML = renderInsightItems(intelData.insights || []);
  document.getElementById('signalCard').innerHTML = renderSignalCard(intelData.signal);
  document.getElementById('alertList').innerHTML = renderAlertItems(intelData.alerts || []);
  document.getElementById('learningList').innerHTML = renderLearningItems(intelData.learning);
  document.getElementById('newsList').innerHTML = renderNewsItems(intelData.news || []);
  document.getElementById('sessionTimeline').innerHTML = renderSessionTimeline(intelData.sessions || []);
  document.getElementById('sessionList').innerHTML = renderSessionItems(intelData.sessions || []);
  document.getElementById('assistantPreview').innerHTML = renderAssistantPreview(intelData);
  renderStarters(intelData.assistantStarters || []);
  window.AterumAssistant?.setSummary(intelData);
  window.AterumAssistant?.notifyContextChanged();
}

function renderIntelligenceError(message){
  const fallback = '<div class="intel-empty">' + escapeHtml(message) + '</div>';
  document.getElementById('intelSummary').textContent = message;
  document.getElementById('intelGenerated').textContent = 'Sin conexión';
  document.getElementById('signalBadge').textContent = 'Sin datos';
  document.getElementById('postureRow').innerHTML = fallback;
  document.getElementById('insightList').innerHTML = fallback;
  document.getElementById('signalCard').innerHTML = fallback;
  document.getElementById('alertList').innerHTML = fallback;
  document.getElementById('learningList').innerHTML = fallback;
  document.getElementById('newsList').innerHTML = fallback;
  document.getElementById('sessionTimeline').innerHTML = fallback;
  document.getElementById('sessionList').innerHTML = fallback;
  document.getElementById('assistantPreview').innerHTML = fallback;
  document.getElementById('starterRow').innerHTML = fallback;
  window.AterumAssistant?.setSummary(null);
}

function renderInsightItems(items){
  if (!items.length) return '<div class="intel-empty">No hay insights disponibles.</div>';
  return items.map(item => \`<article class="insight-item \${toneClass(item.tone || 'info')}">
    <div class="insight-top">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="insight-dot"></span>
        <div class="insight-title">\${escapeHtml(item.title || 'Señal')}</div>
      </div>
      <span class="chip \${chipClass(item.tone || 'info')}">\${escapeHtml(item.tone || 'info')}</span>
    </div>
    <div class="insight-detail">\${escapeHtml(item.detail || '')}</div>
  </article>\`).join('');
}

function renderSignalCard(signal){
  if (!signal) return '<div class="intel-empty">No hay señal disponible.</div>';
  const tone = signal.action === 'LONG' ? 'good' : signal.action === 'SHORT' ? 'bad' : 'warn';
  return \`<article class="insight-item \${toneClass(tone)}">
    <div class="insight-top">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="insight-dot"></span>
        <div class="insight-title">Señal: \${escapeHtml(signal.action || 'NO OPERAR')}</div>
      </div>
      <span class="chip \${chipClass(tone)}">Riesgo \${escapeHtml(signal.risk || 'medio')}</span>
    </div>
    <div class="insight-detail">\${escapeHtml(signal.explanation || '')}</div>
    <div class="chip-row" style="margin-top:8px">\${(signal.drivers || []).map(driver => \`<span class="chip info">\${escapeHtml(driver)}</span>\`).join('')}</div>
  </article>\`;
}

function renderAlertItems(items){
  if (!items.length) return '<div class="intel-empty">No hay alertas activas ahora mismo.</div>';
  return items.map(item => \`<article class="insight-item \${toneClass(item.level === 'crítica' ? 'bad' : item.level === 'alta' ? 'warn' : 'info')}">
    <div class="insight-top">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="insight-dot"></span>
        <div class="insight-title">\${escapeHtml(item.title || 'Alerta')}</div>
      </div>
      <span class="chip \${chipClass(item.level === 'crítica' ? 'bad' : item.level === 'alta' ? 'warn' : 'info')}">\${escapeHtml(item.level || 'media')}</span>
    </div>
    <div class="insight-detail">\${escapeHtml(item.detail || '')}</div>
  </article>\`).join('');
}

function renderLearningItems(learning){
  const findings = learning?.findings || [];
  if (!findings.length) return '<div class="intel-empty">Todavía no hay patrones de aprendizaje suficientes.</div>';
  return findings.map(item => \`<article class="insight-item \${toneClass(item.tone || 'info')}">
    <div class="insight-top">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="insight-dot"></span>
        <div class="insight-title">\${escapeHtml(item.title || 'Patrón')}</div>
      </div>
    </div>
    <div class="insight-detail">\${escapeHtml(item.detail || '')}</div>
    <div class="session-detail" style="margin-top:6px">\${escapeHtml(item.recommendation || '')}</div>
  </article>\`).join('');
}

function renderNewsItems(items){
  if (!items.length) return '<div class="intel-empty">No hay noticias disponibles.</div>';
  return items.map(item => \`<article class="news-item">
    <div class="news-top">
      <a class="news-link news-title" href="\${escapeHtml(item.link || '#')}" target="_blank" rel="noreferrer">\${escapeHtml(item.title || 'Titular')}</a>
      <span class="chip \${chipClass(sentimentTone(item.sentiment))}">\${sentimentLabel(item.sentiment)}</span>
    </div>
    <div class="news-summary">\${escapeHtml(item.summary || '')}</div>
    <div class="news-meta">
      <span class="chip \${chipClass(item.impact === 'alto' ? 'bad' : item.impact === 'medio' ? 'warn' : 'info')}">impacto \${escapeHtml(item.impact || 'bajo')}</span>
      <span class="chip info">\${escapeHtml(item.category || 'Mercado')}</span>
      <span class="chip">urgencia \${escapeHtml(item.urgency || 'media')}</span>
      <span class="chip">score \${escapeHtml(String(item.priorityScore || '0'))}</span>
      <span class="chip">\${escapeHtml(item.source || 'Fuente')}</span>
      <span class="chip">\${escapeHtml(formatAgo(item.publishedAt))}</span>
      \${(item.affectedAssets || []).map(asset => \`<span class="chip good">\${escapeHtml(asset)}</span>\`).join('')}
    </div>
    <div class="session-detail">\${escapeHtml(item.reaction || '')}</div>
  </article>\`).join('');
}

function renderSessionTimeline(sessions){
  if (!sessions.length) return '<div class="intel-empty">No hay modelo de sesiones disponible.</div>';
  const colorMap = { asia:'#57b0ff', europe:'#00e5a0', us:'#f5b84b' };
  return \`<div class="session-mini">Reloj de mercado 24h · UTC</div>
    <div class="timeline-track">
      \${sessions.map(session => \`<span class="timeline-seg" style="left:\${session.timelineStartPct}%;width:\${Math.max(session.timelineEndPct - session.timelineStartPct, 2)}%;background:\${colorMap[session.id] || '#57b0ff'}"></span>\`).join('')}
      <span class="timeline-now" style="left:\${getUtcDayProgress()}%"></span>
    </div>
    <div class="timeline-labels"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>\`;
}

function renderSessionItems(items){
  if (!items.length) return '<div class="intel-empty">No hay sesiones disponibles.</div>';
  return items.map(item => {
    const tone = item.expectedDirection === 'alcista' ? 'good' : item.expectedDirection === 'bajista' ? 'bad' : item.expectedDirection === 'lateral' ? 'warn' : 'info';
    return \`<article class="session-card \${toneClass(tone)}">
      <div class="session-row">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span class="session-flag">\${escapeHtml(item.flag || '•')}</span>
          <div>
            <div class="session-title">\${escapeHtml(item.label || 'Sesión')} · \${escapeHtml(item.subtitle || '')}</div>
            <div class="session-mini">\${escapeHtml(item.countdownLabel || '')}</div>
          </div>
        </div>
        <div class="session-status">\${escapeHtml(item.status || 'cerrada')}</div>
      </div>
      <div class="session-meta">
        <span class="chip \${chipClass(tone)}">\${escapeHtml(item.expectedDirection || 'mixta')}</span>
        <span class="chip info">volatilidad \${escapeHtml(item.volatility || 'media')}</span>
      </div>
      <div class="session-detail">\${escapeHtml(item.typicalBehavior || '')}</div>
      <div class="chip-row">\${(item.keyRisks || []).length ? item.keyRisks.map(risk => \`<span class="chip warn">\${escapeHtml(risk)}</span>\`).join('') : '<span class="chip info">Sin riesgo dominante destacado</span>'}</div>
    </article>\`;
  }).join('');
}

function renderStarters(items){
  const starters = items.length ? items : ['¿Conviene entrar ahora?', '¿Qué implica esta noticia para BTC?'];
  document.getElementById('starterRow').innerHTML = starters.map(item =>
    \`<button class="starter-btn" type="button" onclick="abrirAsistenteIA('\${escapeJs(item)}')">\${escapeHtml(item)}</button>\`
  ).join('');
}

function renderAssistantPreview(summary){
  if (!summary) return '<div class="intel-empty">El asistente está esperando contexto de mercado.</div>';
  const cards = [
    {
      tone: sentimentTone(summary.posture?.bias),
      title: 'Estado del mercado',
      copy: summary.posture?.summary || 'El contexto de mercado se está actualizando.'
    },
    {
      tone: summary.alerts?.[0]?.level === 'crítica' ? 'bad' : summary.signal?.risk === 'alto' ? 'warn' : 'info',
      title: 'Riesgo actual',
      copy: summary.alerts?.[0]?.detail || 'Sin alerta dominante por encima del flujo actual.'
    },
    {
      tone: summary.signal?.action === 'LONG' ? 'good' : summary.signal?.action === 'SHORT' ? 'bad' : 'warn',
      title: 'Recomendación',
      copy: summary.signal
        ? 'Señal ' + (summary.signal.action || 'NO OPERAR') + ' con confianza ' + (summary.signal.confidence || 'baja') + '. ' + (summary.signal.explanation || '')
        : 'Todavía no hay una señal operativa disponible.'
    }
  ];
  return cards.map(card => \`<article class="assistant-preview \${toneClass(card.tone)}">
    <div class="assistant-preview-title">\${escapeHtml(card.title)}</div>
    <div class="assistant-preview-copy">\${escapeHtml(card.copy)}</div>
  </article>\`).join('');
}

function abrirAsistenteIA(question){
  if (!window.AterumAssistant) return;
  if (question) window.AterumAssistant.ask(question);
  else window.AterumAssistant.open();
}

function syncSymbolSelector(){
  if (!intelData) return;
  const select = document.getElementById('intelSymbol');
  const symbols = new Set();
  (intelData.positions?.positions || []).forEach(pos => pos.symbol && symbols.add(pos.symbol));
  (intelData.performance?.recent || []).forEach(row => row.symbol && symbols.add(row.symbol));
  if (currentSymbol) symbols.add(currentSymbol);
  select.innerHTML = ['<option value="">Portafolio</option>']
    .concat([...symbols].sort().map(symbol => \`<option value="\${escapeHtml(symbol)}">\${escapeHtml(symbol)}</option>\`))
    .join('');
  select.value = currentSymbol;
}

function renderPerfGrid(elId, data, key, labelFn){
  const el = document.getElementById(elId);
  if(!data?.length){ el.innerHTML='<div class="empty">Sin datos</div>'; return; }
  const maxPnl = Math.max(...data.map(s=>Math.abs(+s.total_pnl||+s.avg_pnl||0)),1);
  el.innerHTML = data.map(s => {
    const total = +s.total||0, wins2 = +s.wins||0;
    const wr2   = total>0?((wins2/total)*100).toFixed(0):0;
    const pnl   = +(s.total_pnl||s.avg_pnl||0);
    const pos   = pnl>=0;
    const lbl   = labelFn(s);
    const prettyLbl = ({
      CONFIRMS:'CONFIRMA',
      CONTRADICTS:'CONTRADICE',
      NEUTRAL:'NEUTRAL',
      BULLISH:'ALCISTA',
      BEARISH:'BAJISTA',
      EARLY_TREND:'TEMPRANA',
      MID_TREND:'MEDIA',
      LATE_TREND:'TARDÍA',
      PARABOLIC:'PARABÓLICO',
      TRENDING:'TENDENCIAL',
      RANGING:'LATERAL',
      HIGH_VOLATILITY:'ALTA VOL',
      LONG:'LONG',
      SHORT:'SHORT'
    })[lbl] || lbl;
    const badgeMap = {
      CONFIRMS:'b-confirms',CONTRADICTS:'b-contradicts',NEUTRAL:'b-neutral',
      BULLISH:'b-bullish',BEARISH:'b-bearish',
      EARLY_TREND:'b-early',MID_TREND:'b-mid',LATE_TREND:'b-late',PARABOLIC:'b-parabolic',
      TRENDING:'b-trending',RANGING:'b-ranging',HIGH_VOLATILITY:'b-highvol',
      LONG:'b-long',SHORT:'b-short'
    };
    return \`<div class="perf-row">
      <span class="badge \${badgeMap[lbl]||'b-neutral'}">\${prettyLbl}</span>
      <div class="perf-bar-wrap"><div class="perf-bar" style="width:\${Math.min(Math.abs(pnl)/maxPnl*100,100)}%;background:\${pos?'var(--green)':'var(--red)'}"></div></div>
      <span class="perf-wr" style="color:var(--text2)">\${wr2}%</span>
      <span class="perf-pnl \${pos?'pp':'pn'}">\${pos?'+':''}\$\${Math.abs(pnl).toFixed(2)}</span>
      <span style="font-size:9px;color:var(--muted)">\${total}t</span>
    </div>\`;
  }).join('');
}

let scoreChart=null, fgChart=null;
function renderScoreChart(closed){
  const ctx = document.getElementById('chartScore').getContext('2d');
  if(scoreChart) scoreChart.destroy();
  const bins = {};
  closed.forEach(t => {
    const b = Math.floor((+t.final_score||0)/10)*10;
    if(!bins[b]) bins[b]={wins:0,losses:0};
    +t.pnl_usdt>0 ? bins[b].wins++ : bins[b].losses++;
  });
  const labels = Object.keys(bins).sort((a,b)=>+a-+b).map(b=>b+'-'+(+b+9));
  const sortedKeys = Object.keys(bins).sort((a,b)=>+a-+b);
  const winsD  = labels.map((_,i)=>bins[sortedKeys[i]]?.wins||0);
  const lossD  = labels.map((_,i)=>bins[sortedKeys[i]]?.losses||0);
  scoreChart = new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Wins',data:winsD,backgroundColor:'rgba(0,229,160,.7)',borderColor:'#00e5a0',borderWidth:1,borderRadius:3},
    {label:'Losses',data:lossD,backgroundColor:'rgba(255,61,90,.7)',borderColor:'#ff3d5a',borderWidth:1,borderRadius:3}
  ]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{labels:{color:'#5a7a9a',font:{size:10}}}},scales:{x:{ticks:{color:'#304560',font:{size:9}},grid:{display:false},stacked:true},y:{ticks:{color:'#304560',font:{size:9}},grid:{color:'rgba(22,32,48,.5)'},stacked:true}}}});
}

function renderFGChart(closed){
  const ctx = document.getElementById('chartFG').getContext('2d');
  if(fgChart) fgChart.destroy();
  const withFG = closed.filter(t => t.macro_fear_greed != null);
  if(!withFG.length){ return; }
  const bins = {Extremo_miedo:[],Miedo:[],Neutral:[],Codicia:[],Extremo_codicia:[]};
  withFG.forEach(t => {
    const fg = +t.macro_fear_greed;
    const pnl = +t.pnl_usdt||0;
    if(fg<=20) bins.Extremo_miedo.push(pnl);
    else if(fg<=40) bins.Miedo.push(pnl);
    else if(fg<=60) bins.Neutral.push(pnl);
    else if(fg<=80) bins.Codicia.push(pnl);
    else bins.Extremo_codicia.push(pnl);
  });
  const labels = Object.keys(bins);
  const avgs = labels.map(k => bins[k].length ? +(bins[k].reduce((a,b)=>a+b,0)/bins[k].length).toFixed(2) : 0);
  fgChart = new Chart(ctx,{type:'bar',data:{labels,datasets:[{
    label:'Avg PnL',data:avgs,
    backgroundColor:avgs.map(v=>v>=0?'rgba(0,229,160,.7)':'rgba(255,61,90,.7)'),
    borderColor:avgs.map(v=>v>=0?'#00e5a0':'#ff3d5a'),
    borderWidth:1,borderRadius:3
  }]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'Avg PnL: $'+c.raw}}},scales:{x:{ticks:{color:'#304560',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#304560',callback:v=>'$'+v,font:{size:9}},grid:{color:'rgba(22,32,48,.5)'}}}}});
}

function renderPostTrades(items){
  const el = document.getElementById('postList');
  document.getElementById('ptCount').textContent = items.length + ' análisis';
  if(!items.length){ el.innerHTML='<div class="empty">Sin análisis post-trade aún</div>'; el.className=''; return; }
  el.className='';
  el.innerHTML = items.map(p => {
    const isLoss = +p.pnl_usdt < 0;
    const stageMap = {INITIAL:'Inicial',BREAKEVEN:'Breakeven ⚖',TIME_LOCK:'Time Lock ⏰',LOCK:'Bloqueo 🔒',TRAILING:'Trailing 🎯'};
    return \`<div class="post-item">
      <div class="post-header">
        <span class="post-sym">\${p.symbol||'—'}</span>
        <span class="badge \${p.direction==='LONG'?'b-long':'b-short'}">\${p.direction||'—'}</span>
        <span style="font-size:10px;color:\${isLoss?'var(--red)':'var(--green)'};font-weight:600">
          \${(+p.pnl_usdt>=0?'+':'')}\$\${Math.abs(+p.pnl_usdt||0).toFixed(2)}
        </span>
        <span style="font-size:9px;color:var(--text2)">\${stageMap[p.stage]||p.stage||'—'} · \${p.close_type||'—'}</span>
        <span style="font-size:9px;color:var(--muted);margin-left:auto">\${(p.created_at||'').toString().slice(0,16)}</span>
      </div>
      <div class="post-analysis">\${p.analysis||'Sin análisis'}</div>
    </div>\`;
  }).join('');
}

function renderTable(rows){
  const tbody = document.getElementById('aiTbl');
  document.getElementById('tblCount').textContent = rows.length + ' trades';
  if(!rows.length){ tbody.innerHTML='<tr><td colspan="13" class="empty">Sin datos</td></tr>'; return; }

  const tf4hBadge  = s=>({CONFIRMS:'b-confirms',CONTRADICTS:'b-contradicts',NEUTRAL:'b-neutral'}[s]||'b-neutral');
  const macroBadge = s=>({BULLISH:'b-bullish',BEARISH:'b-bearish',NEUTRAL:'b-neutral'}[s]||'b-neutral');
  const visBadge   = s=>({EARLY_TREND:'b-early',MID_TREND:'b-mid',LATE_TREND:'b-late',PARABOLIC:'b-parabolic'}[s]||'b-neutral');
  const regBadge   = s=>({TRENDING:'b-trending',RANGING:'b-ranging',HIGH_VOLATILITY:'b-highvol'}[s]||'b-neutral');
  const stageMap   = {INITIAL:'Ini',BREAKEVEN:'BE',TIME_LOCK:'TL⏰',LOCK:'Bloq🔒',TRAILING:'Trail🎯'};

  tbody.innerHTML = rows.map(t => {
    const pnl = t.pnl_usdt, fr = t.r_final;
    const winStages2=['TIME_LOCK','LOCK','BREAKEVEN','TRAILING'];
    const isWinStage2=winStages2.includes(t.trailing_stage||'');
    const pnlFixed = pnl!=null?(
      t.close_reason==='SL'&&+pnl>0&&!isWinStage2?-pnl:
      t.close_reason==='SL'&&+pnl<0&&isWinStage2&&+t.r_final>0?Math.abs(+pnl):
      t.close_reason==='TP'&&+pnl<0?Math.abs(+pnl):
      +pnl
    ):null;
    return \`<tr>
      <td><strong>\${t.symbol||'—'}</strong></td>
      <td><span class="badge \${t.direction==='LONG'?'b-long':'b-short'}">\${t.direction||'—'}</span></td>
      <td style="color:var(--blue);font-weight:600">\${t.final_score||'—'}</td>
      <td>\${t.tf4h_status?'<span class="badge '+tf4hBadge(t.tf4h_status)+'">'+t.tf4h_status+'</span>':'<span style="color:var(--muted)">—</span>'}</td>
      <td>\${t.macro_bias?'<span class="badge '+macroBadge(t.macro_bias)+'">'+t.macro_bias+'</span>':'<span style="color:var(--muted)">—</span>'}</td>
      <td>\${t.vision_state?'<span class="badge '+visBadge(t.vision_state)+'">'+t.vision_state.replace('_TREND','')+'</span>':'<span style="color:var(--muted)">—</span>'}</td>
      <td>\${t.ai_regime?'<span class="badge '+regBadge(t.ai_regime)+'">'+t.ai_regime.replace('_',' ')+'</span>':'<span style="color:var(--muted)">—</span>'}</td>
      <td style="color:var(--gold)">\${t.recommended_leverage||'—'}x</td>
      <td style="color:var(--text2)">\${t.macro_fear_greed||'—'}</td>
      <td class="\${pnlFixed>0?'pp':pnlFixed<0?'pn':''}">\${pnlFixed!=null?(pnlFixed>=0?'+':'-')+'$'+Math.abs(pnlFixed).toFixed(2):'ABIERTO'}</td>
      <td class="\${+fr>0?'rp':+fr<0?'rn':''}">\${fr!=null?(+fr>=0?'+':'')+fr+'R':'—'}</td>
      <td style="color:var(--text2);font-size:9px">\${stageMap[t.trailing_stage]||t.trailing_stage||'—'}</td>
      <td style="color:var(--muted);font-size:9px">\${(t.opened_at||'').toString().slice(0,10)}</td>
    </tr>\`;
  }).join('');
}

function sessionFocusLabel(){
  const open = (intelData?.sessions || []).find(session => session.status === 'abierta');
  if (open) return open.label + ' activa';
  const next = (intelData?.sessions || []).find(session => session.status === 'próxima');
  return next ? next.label + ' próxima' : 'Liquidez baja';
}

function pillClass(sentiment){
  return ({
    alcista:'pill-bullish',
    bajista:'pill-bearish',
    neutral:'pill-neutral'
  })[sentiment] || 'pill-neutral';
}

function toneClass(tone){
  return ({
    good:'tone-good',
    bad:'tone-bad',
    warn:'tone-warn',
    info:'tone-info',
    alcista:'tone-good',
    bajista:'tone-bad',
    neutral:'tone-info'
  })[tone] || 'tone-info';
}

function chipClass(tone){
  return ({
    good:'good',
    bad:'bad',
    warn:'warn',
    info:'info',
    alcista:'good',
    bajista:'bad',
    neutral:'info'
  })[tone] || 'info';
}

function sentimentTone(sentiment){
  return ({ alcista:'good', bajista:'bad', neutral:'info', good:'good', bad:'bad', warn:'warn', info:'info' })[sentiment] || 'info';
}

function sentimentLabel(sentiment){
  return ({ alcista:'alcista', bajista:'bajista', neutral:'neutral' })[sentiment] || String(sentiment || 'neutral');
}

function getUtcDayProgress(){
  const now = new Date();
  return (((now.getUTCHours() * 60) + now.getUTCMinutes()) / 1440 * 100).toFixed(2);
}

function formatAgo(value){
  if (!value) return 'ahora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ahora';
  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 1) return 'ahora';
  if (diffMin < 60) return 'hace ' + diffMin + 'm';
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return 'hace ' + diffHr + 'h';
  return 'hace ' + Math.round(diffHr / 24) + 'd';
}

function formatMoney(value, signed){
  const num = Number(value || 0);
  const prefix = signed ? (num >= 0 ? '+' : '-') : '';
  return prefix + '$' + Math.abs(num).toFixed(2);
}

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJs(value){
  return String(value ?? '')
    .replace(/\\\\/g, '\\\\\\\\')
    .replace(/'/g, "\\'")
    .replace(/\\n/g, ' ');
}

loadData();
</script>
<script>${getSharedScript()}</script>
</body></html>`; }

module.exports = { getAIDataHTML };
