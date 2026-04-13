'use strict';

const {
  getSharedHeadAssets,
  getLoadingMarkup,
  getSharedChrome,
  getSharedStyles,
  getSharedScript,
  getSharedNav
} = require('./ui_shared');

function getAnalyticsHTML(user) { return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>αтεгυм — Análisis</title>
${getSharedHeadAssets()}
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
:root{
  --bg:#090b0a;--bg2:#111411;--bg3:#171c17;--bg4:#20261f;--bg5:#293128;
  --border:rgba(231,239,226,.1);--border2:rgba(231,239,226,.18);--border3:rgba(231,239,226,.28);
  --text:#f3f7ef;--text2:#9da89b;--muted:#687266;
  --green:#82f06f;--green2:#45c85e;--green3:rgba(130,240,111,.08);
  --red:#ff5d73;--red2:#e23d5d;--red3:rgba(255,93,115,.08);
  --blue:#5be7c4;--blue2:#32bba0;--blue3:rgba(91,231,196,.08);
  --gold:#f5c45f;--gold2:rgba(245,196,95,.08);
  --purple:#b6a1ff;--purple2:rgba(182,161,255,.08);
  --orange:#ff8c42;
  --mono:'JetBrains Mono',monospace;--display:'Inter Tight','Inter','SF Pro Display',sans-serif;--sans:'Inter','SF Pro Text','Segoe UI',sans-serif;
}
*{margin:0;padding:0;box-sizing:border-box;-webkit-font-smoothing:antialiased}
html{scroll-behavior:smooth}
body{background:linear-gradient(180deg,#090b0a 0%,#11140f 46%,#080a08 100%);color:var(--text);font-family:var(--sans);font-size:12px;min-height:100vh}

/* ── NAV ── */
.nav{height:56px;background:rgba(9,11,9,.9);border-bottom:1px solid var(--border2);
  display:flex;align-items:center;padding:0 28px;position:sticky;top:0;z-index:200;
  backdrop-filter:blur(20px);gap:0}
.nav-logo{font-family:var(--display);font-size:14px;font-weight:900;letter-spacing:.12em;
  display:flex;align-items:center;gap:8px;margin-right:32px;color:var(--text)}
.nav-dot{width:6px;height:6px;border-radius:50%;background:var(--green);
  box-shadow:0 0 12px var(--green),0 0 24px rgba(0,229,160,.3);animation:glow 2s ease-in-out infinite}
@keyframes glow{0%,100%{box-shadow:0 0 8px var(--green)}50%{box-shadow:0 0 20px var(--green),0 0 40px rgba(0,229,160,.2)}}
.nav-links{display:flex;gap:2px}
.nav-link{font-size:10px;color:var(--text2);text-decoration:none;letter-spacing:.08em;text-transform:uppercase;
  padding:7px 14px;border-radius:5px;transition:all .15s;border:1px solid transparent;font-weight:500}
.nav-link:hover{color:var(--text);background:var(--bg3);border-color:var(--border2)}
.nav-link.active{color:var(--blue);background:var(--blue3);border-color:rgba(61,158,255,.2)}
.nav-spacer{flex:1}
.nav-badge{font-size:9px;letter-spacing:.06em;padding:4px 10px;border-radius:3px;
  background:var(--bg4);border:1px solid var(--border2);color:var(--text2)}
.live-dot{width:5px;height:5px;border-radius:50%;background:var(--muted);display:inline-block;margin-right:4px}
.live-dot.on{background:var(--green);box-shadow:0 0 6px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* ── LAYOUT ── */
.page{padding:28px 28px 60px;max-width:1600px;margin:0 auto}
.page-hdr{margin-bottom:32px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px}
.page-title{font-family:var(--display);font-size:26px;font-weight:900;letter-spacing:-.01em;line-height:1}
.page-title span{color:var(--blue)}
.page-sub{font-size:10px;color:var(--text2);letter-spacing:.05em;margin-top:4px}
.section-title{font-size:9px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;
  color:var(--text2);margin-bottom:14px;display:flex;align-items:center;gap:8px}
.section-title::after{content:'';flex:1;height:1px;background:var(--border2)}

/* ── ACCOUNT PANEL ── */
.acct-panel{background:linear-gradient(135deg,rgba(61,158,255,.04) 0%,rgba(0,229,160,.03) 50%,transparent 100%);
  border:1px solid var(--border2);border-radius:12px;padding:20px 24px;margin-bottom:28px;position:relative;overflow:hidden}
.acct-panel::before{content:'';position:absolute;inset:0;border-radius:12px;
  background:linear-gradient(135deg,rgba(61,158,255,.06),transparent 60%);pointer-events:none}
.acct-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.acct-title{font-family:var(--display);font-size:13px;font-weight:700;letter-spacing:.06em;color:var(--text2);text-transform:uppercase}
.acct-live{display:flex;align-items:center;gap:6px;font-size:9px;color:var(--text2);
  background:var(--bg4);border:1px solid var(--border2);border-radius:4px;padding:4px 10px}
.acct-live.on{border-color:rgba(0,229,160,.25);color:var(--green);background:rgba(0,229,160,.05)}
.acct-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:16px}
@media(max-width:1200px){.acct-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:768px){.acct-grid{grid-template-columns:repeat(2,1fr)}}
.acct-stat{background:var(--bg3);border:1px solid var(--border2);border-radius:8px;
  padding:14px 16px;transition:border-color .2s;position:relative;overflow:hidden}
.acct-stat:hover{border-color:var(--border3)}
.acct-stat-lbl{font-size:9px;color:var(--text2);letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.acct-stat-val{font-family:var(--display);font-size:20px;font-weight:800;line-height:1;
  transition:color .3s,opacity .3s}
.acct-stat-sub{font-size:9px;color:var(--text2);margin-top:4px}
.acct-stat-accent{position:absolute;top:0;left:0;right:0;height:2px;border-radius:2px 2px 0 0}
.acct-bar-row{display:flex;align-items:center;gap:12px}
.acct-bar-label{font-size:9px;color:var(--text2);letter-spacing:.08em;text-transform:uppercase;min-width:90px}
.acct-bar-outer{flex:1;height:5px;background:var(--bg4);border-radius:3px;overflow:hidden}
.acct-bar-inner{height:100%;border-radius:3px;transition:width .6s cubic-bezier(.4,0,.2,1),background .3s}
.acct-bar-pct{font-size:10px;font-weight:600;min-width:40px;text-align:right}
.acct-positions{margin-top:14px;border-top:1px solid var(--border2);padding-top:14px;display:flex;flex-wrap:wrap;gap:8px}
.acct-pos-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;border-radius:5px;
  border:1px solid var(--border2);background:var(--bg4);font-size:10px;transition:border-color .15s}
.acct-pos-chip:hover{border-color:var(--border3)}
.acct-pos-sym{font-weight:700;color:var(--text)}
.acct-pos-side{font-size:9px;padding:1px 5px;border-radius:2px}
.side-short{background:var(--red3);color:var(--red)}
.side-long{background:var(--green3);color:var(--green)}
.acct-pos-pnl{font-weight:600}

/* ── COOLDOWNS ── */
.cooldown-panel{margin-bottom:24px}
.cooldown-body{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:16px 20px}
.cooldown-empty{font-size:11px;color:var(--text2)}
.cooldown-chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;
  background:var(--bg3);border:1px solid var(--border2);font-size:10px;letter-spacing:.04em}
.cooldown-chip strong{font-family:var(--display);font-size:11px}
.cooldown-time{color:var(--text2);font-size:9px}
.cooldown-clear{border:none;background:transparent;color:var(--text2);cursor:pointer;
  font-size:11px;line-height:1;padding:2px 6px;border-radius:999px;transition:all .15s;border:1px solid transparent}
.cooldown-clear:hover{color:var(--red);background:var(--red3);border:1px solid rgba(255,83,111,.2)}

/* ── FILTERS ── */
.filters-row{display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;align-items:center;
  background:var(--bg2);border:1px solid var(--border2);border-radius:8px;padding:12px 16px}
.filter-label{font-size:9px;color:var(--text2);letter-spacing:.1em;text-transform:uppercase;margin-right:4px}
.filter-sep{width:1px;height:20px;background:var(--border2);margin:0 4px}
.filter-select{background:var(--bg3);border:1px solid var(--border2);border-radius:5px;color:var(--text);
  padding:6px 10px;font-family:var(--mono);font-size:10px;cursor:pointer;transition:border-color .15s;outline:none}
.filter-select:focus{border-color:var(--blue)}
.filter-btn{background:transparent;border:1px solid var(--border2);border-radius:5px;color:var(--text2);
  padding:6px 12px;font-family:var(--mono);font-size:10px;cursor:pointer;transition:all .15s;letter-spacing:.04em}
.filter-btn:hover{border-color:var(--blue);color:var(--blue)}
.filter-btn.active{background:var(--blue3);border-color:rgba(61,158,255,.3);color:var(--blue)}

/* ── KPI GRID ── */
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:24px}
.kpi{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;padding:18px;
  position:relative;overflow:hidden;transition:transform .15s,border-color .2s;cursor:default}
.kpi:hover{transform:translateY(-2px);border-color:var(--border3)}
.kpi-glow{position:absolute;inset:0;pointer-events:none;border-radius:10px}
.kpi.kpi-green .kpi-glow{background:radial-gradient(ellipse at top left,rgba(0,229,160,.08),transparent 60%)}
.kpi.kpi-red .kpi-glow{background:radial-gradient(ellipse at top left,rgba(255,61,90,.08),transparent 60%)}
.kpi.kpi-blue .kpi-glow{background:radial-gradient(ellipse at top left,rgba(61,158,255,.08),transparent 60%)}
.kpi.kpi-gold .kpi-glow{background:radial-gradient(ellipse at top left,rgba(245,166,35,.08),transparent 60%)}
.kpi.kpi-purple .kpi-glow{background:radial-gradient(ellipse at top left,rgba(168,85,247,.08),transparent 60%)}
.kpi-lbl{font-size:9px;color:var(--text2);letter-spacing:.12em;text-transform:uppercase;margin-bottom:10px;font-weight:500}
.kpi-val{font-family:var(--display);font-size:26px;font-weight:800;line-height:1}
.kpi-sub{font-size:9px;color:var(--text2);margin-top:6px}
.kpi-icon{position:absolute;top:14px;right:14px;font-size:18px;opacity:.5}
.kpi-accent{position:absolute;bottom:0;left:0;right:0;height:2px}
.kpi.kpi-green .kpi-accent{background:linear-gradient(90deg,transparent,var(--green),transparent)}
.kpi.kpi-red .kpi-accent{background:linear-gradient(90deg,transparent,var(--red),transparent)}
.kpi.kpi-blue .kpi-accent{background:linear-gradient(90deg,transparent,var(--blue),transparent)}
.kpi.kpi-gold .kpi-accent{background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.kpi.kpi-purple .kpi-accent{background:linear-gradient(90deg,transparent,var(--purple),transparent)}

/* ── CARDS ── */
.cards-row{display:grid;gap:16px;margin-bottom:16px}
.cards-2{grid-template-columns:2fr 1fr}
.cards-equal{grid-template-columns:1fr 1fr}
.cards-3{grid-template-columns:1fr 1fr 1fr}
@media(max-width:1100px){.cards-2,.cards-equal,.cards-3{grid-template-columns:1fr}}
.card{background:var(--bg2);border:1px solid var(--border2);border-radius:10px;overflow:hidden}
.card-hdr{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:var(--bg3)}
.card-title{font-size:9px;color:var(--text2);letter-spacing:.12em;text-transform:uppercase;font-weight:600}
.card-badge{font-size:9px;padding:3px 8px;border-radius:3px;background:var(--bg4);
  border:1px solid var(--border2);color:var(--text2)}
.card-body{padding:20px}
canvas{max-height:220px}

/* ── TABLE ── */
.tbl-wrap{max-height:420px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border2) transparent}
.tbl-wrap::-webkit-scrollbar{width:3px}
.tbl-wrap::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
table{width:100%;border-collapse:collapse}
th{padding:10px 16px;text-align:left;font-size:9px;color:var(--text2);letter-spacing:.1em;
  text-transform:uppercase;border-bottom:1px solid var(--border2);background:var(--bg3);
  position:sticky;top:0;z-index:1;font-weight:600;white-space:nowrap}
td{padding:10px 16px;border-bottom:1px solid rgba(22,32,48,.6);font-size:11px;transition:background .1s}
tr:hover td{background:rgba(11,17,28,.8)}
tr:last-child td{border-bottom:none}

/* ── BADGES ── */
.badge{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:3px;
  font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.b-long{background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.2)}
.b-short{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.2)}
.b-open{background:rgba(61,158,255,.1);color:var(--blue);border:1px solid rgba(61,158,255,.2)}
.b-closed{background:rgba(48,69,96,.08);color:var(--text2);border:1px solid var(--border2)}
.b-tp{background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.15)}
.b-sl{background:rgba(255,61,90,.1);color:var(--red);border:1px solid rgba(255,61,90,.15)}
.pp{color:var(--green);font-weight:600}.pn{color:var(--red);font-weight:600}
.rp{color:var(--green)}.rn{color:var(--red)}

/* ── LIST ITEMS ── */
.rejection-item{display:flex;align-items:center;gap:12px;padding:11px 20px;border-bottom:1px solid rgba(22,32,48,.6)}
.rejection-item:last-child{border-bottom:none}
.rej-rank{font-size:9px;color:var(--muted);font-weight:700;min-width:16px;text-align:center}
.rej-lbl{font-size:11px;color:var(--text2);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rej-bar-wrap{width:100px;height:3px;background:var(--bg4);border-radius:2px;overflow:hidden;flex-shrink:0}
.rej-bar-fill{height:100%;background:linear-gradient(90deg,var(--red2),var(--red));border-radius:2px;transition:width .6s}
.rej-count{font-size:11px;color:var(--text);font-weight:700;min-width:28px;text-align:right}
.sym-item{display:flex;align-items:center;gap:10px;padding:10px 20px;border-bottom:1px solid rgba(22,32,48,.6)}
.sym-item:last-child{border-bottom:none}
.sym-name{font-family:var(--display);font-size:12px;font-weight:800;min-width:70px}
.sym-wr{font-size:9px;color:var(--text2);min-width:36px;text-align:right}
.sym-bar-wrap{flex:1;height:3px;background:var(--bg4);border-radius:2px;overflow:hidden}
.sym-bar-fill{height:100%;border-radius:2px;transition:width .6s}
.sym-pnl{font-size:11px;font-weight:600;min-width:60px;text-align:right}

/* ── MISC ── */
.score-bar{display:inline-flex;align-items:center;gap:6px}
.score-fill{height:3px;border-radius:2px;background:var(--blue);opacity:.7}
.loading{display:flex;align-items:center;justify-content:center;padding:60px;color:var(--text2);gap:10px}
.spin{width:16px;height:16px;border:2px solid var(--border2);border-top-color:var(--blue);
  border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.empty{padding:40px;text-align:center;color:var(--text2);font-size:11px;letter-spacing:.04em}
.flash{animation:flash .6s cubic-bezier(.22,1,.36,1)}
@keyframes flash{
  0%{opacity:.35;transform:translateY(2px) scale(.985);filter:brightness(.9)}
  35%{opacity:1;transform:translateY(-2px) scale(1.025);filter:brightness(1.28) drop-shadow(0 0 20px rgba(87,176,255,.28))}
  100%{opacity:1;transform:translateY(0) scale(1);filter:none}
}

/* ── VERSION C PREMIUM OVERRIDES ───────────────────────────────────────────── */
html{background:var(--bg)}
body{
  background:
    radial-gradient(circle at top left,rgba(87,176,255,.18),transparent 28%),
    radial-gradient(circle at 85% 0%,rgba(0,229,160,.11),transparent 24%),
    radial-gradient(circle at 50% 120%,rgba(178,111,255,.08),transparent 30%),
    linear-gradient(180deg,#091322 0%,#0c1728 48%,#08111f 100%);
  color:var(--text);
}
body::before{
  content:'';
  position:fixed;
  inset:0;
  pointer-events:none;
  background:
    linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px);
  background-size:72px 72px;
  mask-image:radial-gradient(circle at center,black 40%,transparent 90%);
  opacity:.2;
}
.nav{
  min-height:72px;
  height:auto;
  padding:14px 24px;
  background:rgba(8,14,24,.78);
  border-bottom:1px solid rgba(61,158,255,.12);
  box-shadow:0 12px 40px rgba(0,0,0,.22);
}
.nav-logo{
  padding:10px 14px;
  margin-right:18px;
  border:1px solid rgba(61,158,255,.14);
  border-radius:18px;
  background:linear-gradient(180deg,rgba(13,21,34,.92),rgba(8,14,22,.82));
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
  border:1px solid transparent;
}
.nav-link:hover{
  background:rgba(13,21,34,.9);
  border-color:rgba(61,158,255,.16);
  box-shadow:0 0 0 1px rgba(61,158,255,.04) inset;
}
.nav-link.active{
  background:linear-gradient(180deg,rgba(61,158,255,.16),rgba(61,158,255,.08));
  box-shadow:0 10px 24px rgba(61,158,255,.12);
}
.nav-badge{
  padding:7px 12px;
  border-radius:999px;
  background:rgba(13,21,34,.9);
  border-color:rgba(0,229,160,.12);
}
.page{
  position:relative;
  padding:32px 28px 72px;
}
.page-hdr{
  margin-bottom:24px;
  padding:24px 26px;
  border-radius:26px;
  border:1px solid rgba(61,158,255,.12);
  background:
    linear-gradient(135deg,rgba(12,20,34,.92),rgba(7,12,20,.82)),
    radial-gradient(circle at top left,rgba(61,158,255,.08),transparent 44%);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.04),
    0 24px 70px rgba(0,0,0,.24);
  position:relative;
  overflow:hidden;
}
.page-hdr::after{
  content:'';
  position:absolute;
  inset:auto 22px 0 auto;
  width:180px;
  height:180px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(61,158,255,.16),transparent 70%);
  filter:blur(12px);
  pointer-events:none;
}
.page-title{
  font-size:34px;
  letter-spacing:-.03em;
}
.page-sub{
  font-size:11px;
  color:#7d9abe;
}
.acct-panel,.card,.filters-row,.kpi{
  background:linear-gradient(180deg,rgba(11,18,30,.94),rgba(8,13,22,.88));
  border:1px solid rgba(61,158,255,.12);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 18px 45px rgba(0,0,0,.2);
  backdrop-filter:blur(18px);
}
.acct-panel{
  border-radius:26px;
  padding:24px 24px 20px;
}
.acct-panel::before{
  background:linear-gradient(135deg,rgba(61,158,255,.1),rgba(0,229,160,.04) 48%,transparent 72%);
}
.acct-panel::after{
  content:'';
  position:absolute;
  inset:auto -40px -60px auto;
  width:220px;
  height:220px;
  border-radius:50%;
  background:radial-gradient(circle,rgba(0,229,160,.12),transparent 72%);
  pointer-events:none;
}
.acct-header{position:relative;z-index:1}
.acct-live{
  padding:7px 12px;
  border-radius:999px;
  background:rgba(10,17,29,.9);
}
.acct-grid{position:relative;z-index:1}
.acct-stat{
  border-radius:18px;
  background:linear-gradient(180deg,rgba(15,24,39,.94),rgba(9,15,25,.9));
  border:1px solid rgba(61,158,255,.12);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
}
.acct-stat:hover,.card:hover,.kpi:hover{
  transform:translateY(-4px);
  border-color:rgba(87,176,255,.24);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 24px 56px rgba(4,10,18,.24),0 0 28px rgba(87,176,255,.08);
}
.acct-stat-val{font-size:24px}
.acct-pos-chip{
  border-radius:999px;
  background:rgba(10,17,29,.9);
  border-color:rgba(61,158,255,.14);
}
.filters-row{
  border-radius:20px;
  padding:14px 16px;
  position:sticky;
  top:88px;
  z-index:30;
}
.filter-select,.filter-btn{
  min-height:34px;
  border-radius:999px;
  background:rgba(10,17,29,.82);
}
.filter-btn.active{
  background:linear-gradient(180deg,rgba(61,158,255,.16),rgba(61,158,255,.08));
  box-shadow:0 8px 20px rgba(61,158,255,.12);
}
.kpi-grid{
  grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
  gap:14px;
}
.kpi{
  border-radius:22px;
  padding:20px;
}
.kpi-val{font-size:30px}
.cards-row{gap:18px}
.card{
  border-radius:24px;
}
.card-hdr{
  padding:16px 20px;
  background:linear-gradient(180deg,rgba(14,22,36,.94),rgba(10,16,26,.88));
  border-bottom:1px solid rgba(61,158,255,.1);
}
.card-title,.section-title,.acct-title{
  color:#89a8ca;
}
.card-badge{
  border-radius:999px;
  padding:5px 10px;
  background:rgba(9,16,27,.84);
}
.card-body{padding:22px}
.tbl-wrap{
  background:linear-gradient(180deg,rgba(8,13,22,.82),rgba(7,12,20,.92));
}
th{
  background:rgba(12,19,31,.95);
  border-bottom-color:rgba(61,158,255,.1);
}
td{
  border-bottom-color:rgba(61,158,255,.08);
}
tr:hover td{
  background:rgba(16,27,44,.74);
}
.rejection-item,.sym-item{
  padding:13px 20px;
}
.loading{
  min-height:120px;
}
@media(max-width:960px){
  .nav{
    padding:12px 16px;
    gap:10px;
  }
  .nav-logo{
    margin-right:0;
  }
  .page{
    padding:20px 16px 60px;
  }
  .page-hdr,.acct-panel,.card{
    border-radius:22px;
  }
  .page-title{
    font-size:28px;
  }
  .filters-row{
    top:78px;
  }
}
@media(max-width:680px){
  .nav{
    align-items:flex-start;
  }
  .nav-badge{
    width:100%;
    justify-content:center;
  }
  .page-hdr{
    padding:20px 18px;
  }
  .filters-row{
    position:relative;
    top:0;
    border-radius:18px;
  }
  .acct-grid,.kpi-grid{
    grid-template-columns:1fr;
  }
  .acct-bar-row{
    flex-wrap:wrap;
  }
}
${getSharedStyles()}
</style>
</head>
<body>
${getSharedChrome({accent:'#3d9eff',accentSoft:'rgba(61,158,255,.18)',secondary:'rgba(0,229,160,.14)',loaderLabel:'Cargando mesa de análisis'})}
<div class="page-shell">
${getSharedNav('analytics', user, 'blue', '<div class="nav-badge"><span class="live-dot on" id="navLiveDot"></span><span id="navLiveTs">conectando...</span></div>')}
<div class="page">
  <div class="page-hdr">
    <div>
      <div class="page-title">Análisis <span>&amp;</span> Cuenta</div>
      <div class="page-sub">Rendimiento completo del sistema · actualización en tiempo real</div>
    </div>
  </div>

  <!-- ACCOUNT PANEL -->
  <div class="acct-panel">
    <div class="acct-header">
      <div class="acct-title">💼 Cuenta Binance Futures</div>
      <div class="acct-live" id="acctLiveBadge"><span class="live-dot" id="acctLiveDot"></span><span id="acctTs">conectando...</span></div>
    </div>
    <div class="acct-grid">
      <div class="acct-stat">
        <div class="acct-stat-accent" style="background:var(--green)"></div>
        <div class="acct-stat-lbl">Equity</div>
        <div class="acct-stat-val" id="acctEquity" style="color:var(--green)">—</div>
        <div class="acct-stat-sub">Wallet: <span id="acctBalance" style="color:var(--text2)">—</span></div>
      </div>
      <div class="acct-stat">
        <div class="acct-stat-accent" style="background:var(--blue)"></div>
        <div class="acct-stat-lbl">Disponible</div>
        <div class="acct-stat-val" id="acctAvail" style="color:var(--blue)">—</div>
        <div class="acct-stat-sub">para nuevas posiciones</div>
      </div>
      <div class="acct-stat">
        <div class="acct-stat-accent" style="background:var(--gold)"></div>
        <div class="acct-stat-lbl">En Margen</div>
        <div class="acct-stat-val" id="acctMargin" style="color:var(--gold)">—</div>
        <div class="acct-stat-sub">colateral usado</div>
      </div>
      <div class="acct-stat">
        <div class="acct-stat-accent" id="acctUnrealAccent" style="background:var(--text2)"></div>
        <div class="acct-stat-lbl">PnL no realizado</div>
        <div class="acct-stat-val" id="acctUnreal">—</div>
        <div class="acct-stat-sub">posiciones abiertas</div>
      </div>
      <div class="acct-stat">
        <div class="acct-stat-accent" id="acctDailyAccent" style="background:var(--text2)"></div>
        <div class="acct-stat-lbl">PnL Hoy</div>
        <div class="acct-stat-val" id="acctDailyPnl">—</div>
        <div class="acct-stat-sub" id="acctDailyRoi">ROI del día</div>
      </div>
      <div class="acct-stat">
        <div class="acct-stat-accent" style="background:var(--purple)"></div>
        <div class="acct-stat-lbl">Posiciones</div>
        <div class="acct-stat-val" id="acctPositions" style="color:var(--purple)">—</div>
        <div class="acct-stat-sub">abiertas ahora</div>
      </div>
    </div>
    <div class="acct-bar-row">
      <div class="acct-bar-label">Margen usado</div>
      <div class="acct-bar-outer"><div class="acct-bar-inner" id="acctMarginBar" style="width:0%"></div></div>
      <div class="acct-bar-pct" id="acctMarginPct">—</div>
    </div>
    <div class="acct-positions" id="acctPosList"></div>
  </div>

  <!-- CIRCUIT BREAKER PANEL -->
  <div id="cbPanel" style="margin-bottom:20px">
    <div class="card" id="cbCard" style="border-color:var(--border2)">
      <div class="card-hdr" style="background:var(--bg3)">
        <span class="card-title">🛡 Interruptor de Riesgo</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span id="cbStatusBadge" style="font-size:9px;padding:3px 10px;border-radius:3px;background:rgba(0,229,160,.1);color:var(--green);border:1px solid rgba(0,229,160,.2)">✅ ACTIVO — OPERANDO</span>
          <button onclick="resetCB()" style="font-size:9px;padding:3px 10px;border-radius:3px;background:var(--bg4);border:1px solid var(--border2);color:var(--text2);cursor:pointer;font-family:var(--mono)">Reinicio manual</button>
        </div>
      </div>
      <div class="card-body" style="padding:16px 20px">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:14px">
          <div class="acct-stat" style="padding:12px 14px">
            <div class="acct-stat-lbl">Estado</div>
            <div class="acct-stat-val" id="cbStateName" style="font-size:16px;color:var(--green)">OPERANDO</div>
          </div>
          <div class="acct-stat" style="padding:12px 14px">
            <div class="acct-stat-lbl">SL Consecutivos</div>
            <div style="display:flex;align-items:baseline;gap:6px">
              <div class="acct-stat-val" id="cbConsec" style="font-size:24px;color:var(--text)">0</div>
              <div style="font-size:11px;color:var(--text2)">/3</div>
            </div>
          </div>
          <div class="acct-stat" style="padding:12px 14px">
            <div class="acct-stat-lbl">Dirección</div>
            <div class="acct-stat-val" id="cbDir" style="font-size:16px;color:var(--text2)">—</div>
          </div>
          <div class="acct-stat" style="padding:12px 14px">
            <div class="acct-stat-lbl">Expira en</div>
            <div class="acct-stat-val" id="cbExpires" style="font-size:16px;color:var(--text2)">—</div>
          </div>
        </div>
        <!-- Progress bar -->
        <div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:9px;color:var(--text2)">
          <span>Progreso hacia el interruptor de riesgo</span>
          <span id="cbProgTxt">0 / 3 SL consecutivos</span>
        </div>
        <div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden">
          <div id="cbProgBar" style="height:100%;border-radius:3px;width:0%;transition:width .5s,background .3s;background:var(--green)"></div>
        </div>
        <div id="cbMessage" style="display:none;margin-top:12px;padding:10px 14px;border-radius:6px;font-size:11px;border:1px solid"></div>
      </div>
    </div>
  </div>

  <!-- SYMBOL COOLDOWNS PANEL -->
  <div class="card cooldown-panel" id="cooldownPanel">
    <div class="card-hdr">
      <span class="card-title">⏳ Symbol Cooldowns</span>
      <span class="card-badge" id="cooldownCount">0 activos</span>
    </div>
    <div class="cooldown-body" id="cooldownList">
      <div class="cooldown-empty">Sin cooldowns activos</div>
    </div>
  </div>

  <!-- FILTERS -->
  <div class="filters-row">
    <span class="filter-label">Periodo:</span>
    <button class="filter-btn active" onclick="setPeriod(7,this)">7D</button>
    <button class="filter-btn" onclick="setPeriod(30,this)">30D</button>
    <button class="filter-btn" onclick="setPeriod(90,this)">90D</button>
    <button class="filter-btn" onclick="setPeriod(0,this)">Todo</button>
    <div class="filter-sep"></div>
    <span class="filter-label">Dir:</span>
    <select class="filter-select" id="filterDir" onchange="applyFilters()">
      <option value="">Todas</option><option value="LONG">LONG</option><option value="SHORT">SHORT</option>
    </select>
    <span class="filter-label">Resultado:</span>
    <select class="filter-select" id="filterResult" onchange="applyFilters()">
      <option value="">Todos</option><option value="win">Ganadores</option><option value="loss">Perdedores</option>
    </select>
  </div>

  <!-- KPIs -->
  <div class="kpi-grid" id="kpiGrid">${getLoadingMarkup('Cargando métricas')}</div>

  <!-- CHARTS ROW 1 -->
  <div class="cards-row cards-2" style="margin-bottom:16px">
    <div class="card">
      <div class="card-hdr"><span class="card-title">PnL Acumulado</span><span class="card-badge" id="pnlBadge">—</span></div>
      <div class="card-body"><canvas id="chartPnL"></canvas></div>
    </div>
    <div class="card">
      <div class="card-hdr"><span class="card-title">Ganadas / Perdidas</span></div>
      <div class="card-body" style="display:flex;align-items:center;justify-content:center;min-height:180px">
        <canvas id="chartWinLoss"></canvas>
      </div>
    </div>
  </div>

  <!-- CHARTS ROW 2 -->
  <div class="cards-row cards-equal" style="margin-bottom:16px">
    <div class="card">
      <div class="card-hdr"><span class="card-title">PnL por Semana</span></div>
      <div class="card-body"><canvas id="chartWeekly"></canvas></div>
    </div>
    <div class="card">
      <div class="card-hdr"><span class="card-title">Rendimiento por Par</span></div>
      <div class="card-body" style="padding:0"><div id="symList" class="loading-shell-wrap">${getLoadingMarkup('Cargando símbolos')}</div></div>
    </div>
  </div>

  <!-- REJECTIONS + TABLE -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-hdr"><span class="card-title">Razones de Rechazo</span><span class="card-badge" id="rejBadge">—</span></div>
    <div id="rejList" class="loading-shell-wrap">${getLoadingMarkup('Cargando rechazos')}</div>
  </div>
  <div class="card">
    <div class="card-hdr">
      <span class="card-title">Historial de Trades</span>
      <span class="card-badge" id="tradeCount">—</span>
    </div>
    <div class="tbl-wrap">
      <table><thead><tr>
        <th>Par</th><th>Dir</th><th>Entrada</th><th>Salida</th><th>PnL</th>
        <th>R</th><th>Score</th><th>Cierre</th><th>Duración</th><th>Estado</th>
      </tr></thead><tbody id="tradesTbl"></tbody></table>
    </div>
  </div>
</div>
</div>

<script>
let allStats=null, period=7, filterDir='', filterResult='';
window.aterumAssistantConfig={
  page:'analytics',
  kicker:'Analista IA',
  subtitle:'Lee tu rendimiento, consistencia y patrones de ejecución para responder con contexto real.',
  placeholder:'¿Qué patrón me está restando más rendimiento?'
};

const escapeHtml=value=>String(value==null?'':value)
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;');

function getAnalyticsRowsForAssistant(){
  if(!allStats)return [];
  let rows=[...(allStats.recent||[])];
  if(period>0){
    const cut=Date.now()-period*86400000;
    rows=rows.filter(t=>{
      const d=new Date(t.opened_at||t.closed_at).getTime();
      return d>=cut;
    });
  }
  if(filterDir)rows=rows.filter(t=>t.direction===filterDir);
  if(filterResult==='win')rows=rows.filter(t=>(+t.pnl_usdt||0)>0);
  if(filterResult==='loss')rows=rows.filter(t=>(+t.pnl_usdt||0)<=0);
  return rows;
}

function getAnalyticsAssistantContext(){
  const rows=getAnalyticsRowsForAssistant();
  const closed=rows.filter(t=>t.pnl_usdt!=null);
  const wins=closed.filter(t=>(+t.pnl_usdt||0)>0).length;
  const totalPnL=closed.reduce((sum,t)=>sum+(+t.pnl_usdt||0),0);
  const avgR=closed.length?closed.reduce((sum,t)=>sum+(+t.r_final||0),0)/closed.length:0;
  const winRate=closed.length?(wins/closed.length)*100:0;
  return {
    pagina:'analytics',
    pnl:totalPnL,
    metricas:{
      tradesAnalizados:closed.length,
      pnlTotal:+totalPnL.toFixed(2),
      tasaAcierto:+winRate.toFixed(1),
      rPromedio:+avgR.toFixed(2),
      periodo,
      filtroDireccion:filterDir||'todas',
      filtroResultado:filterResult||'todos'
    },
    ultimosTrades:closed.slice(0,5).map(t=>({
      symbol:t.symbol,
      side:t.direction,
      pnl:+(+t.pnl_usdt||0).toFixed(2),
      r:+(+t.r_final||0).toFixed(2),
      closeReason:t.close_reason||''
    }))
  };
}
window.aterumAssistantContext=getAnalyticsAssistantContext;

// ── Account realtime ───────────────────────────────────────────────────────────
function flash(id){
  const el=document.getElementById(id);
  if(!el)return;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}
function setVal(id,text,color,doFlash=true){
  const el=document.getElementById(id);
  if(!el)return;
  const changed=el.textContent!==text;
  if(changed){
    el.textContent=text;
    if(color)el.style.color=color;
    if(doFlash)flash(id);
  } else if(color){
    el.style.color=color;
  }
}

function renderAccount(acct){
  const balance    = acct.balance     || 0;
  const available  = acct.available   || 0;
  const margin     = acct.totalMargin || 0;
  const unreal     = acct.totalUnreal || 0;
  const openCount  = acct.openPositions || 0;

  // Daily PnL from loaded stats
  const recent = allStats?.recent || [];
  const today  = new Date().toISOString().slice(0,10);
  const todayClosed = recent.filter(t=>t.pnl_usdt!=null&&(t.closed_at||'').toString().slice(0,10)===today);
  const dailyPnl  = todayClosed.reduce((s,t)=>s+(+t.pnl_usdt||0),0);
  const marginPct = balance>0?(margin/balance*100):0;
  const dailyRoi  = balance>0?(dailyPnl/balance*100):0;

  const fmt  = v=>'$'+Math.abs(+v).toFixed(2);
  const sign = v=>((+v)>=0?'+':'-')+fmt(v);

  const equity = acct.equity || (balance + unreal);
  setVal('acctEquity', balance>0?fmt(equity):'—', equity>balance?'var(--green)':equity<balance?'var(--red)':'var(--green)');
  setVal('acctBalance', balance>0?fmt(balance):'—', 'var(--text2)', false);
  setVal('acctAvail',   balance>0?fmt(available):'—', 'var(--blue)');
  setVal('acctMargin',  fmt(margin), 'var(--gold)');
  setVal('acctUnreal',  sign(unreal), unreal>=0?'var(--green)':'var(--red)');
  document.getElementById('acctUnrealAccent').style.background=unreal>=0?'var(--green)':'var(--red)';

  setVal('acctDailyPnl', todayClosed.length?sign(dailyPnl):'$0.00', dailyPnl>=0?'var(--green)':'var(--red)');
  document.getElementById('acctDailyAccent').style.background=dailyPnl>=0?'var(--green)':'var(--red)';
  document.getElementById('acctDailyRoi').textContent=balance>0?(dailyRoi>=0?'+':'')+dailyRoi.toFixed(2)+'% del balance':'—';

  setVal('acctPositions', String(openCount), openCount>0?'var(--purple)':'var(--text2)');

  const pct=Math.min(marginPct,100);
  document.getElementById('acctMarginPct').textContent=marginPct.toFixed(1)+'%';
  document.getElementById('acctMarginPct').style.color=pct>60?'var(--red)':pct>30?'var(--gold)':'var(--blue)';
  const bar=document.getElementById('acctMarginBar');
  if(bar){bar.style.width=pct+'%';bar.style.background=pct>60?'var(--red)':pct>30?'var(--gold)':'var(--blue)';}

  // Position chips
  const posList=document.getElementById('acctPosList');
  if(posList&&acct.positions&&Object.keys(acct.positions).length>0){
    posList.innerHTML=Object.entries(acct.positions).map(([sym,p])=>{
      const pnlSign=(p.unrealized||0)>=0?'+':'-';
      const pnlColor=(p.unrealized||0)>=0?'var(--green)':'var(--red)';
      return \`<div class="acct-pos-chip">
        <span class="acct-pos-sym">\${sym.replace('USDT','')}</span>
        <span class="acct-pos-side \${p.side==='SHORT'?'side-short':'side-long'}">\${p.side}</span>
        <span class="acct-pos-pnl" style="color:\${pnlColor}">\${pnlSign}$\${Math.abs(p.unrealized||0).toFixed(2)}</span>
        <span style="font-size:9px;color:var(--text2)">@\${p.entryPrice||'—'}</span>
      </div>\`;
    }).join('');
  } else if(posList){
    posList.innerHTML='<span style="font-size:10px;color:var(--text2);padding:4px 0">Sin posiciones abiertas</span>';
  }

  // Update live badge
  const ts=new Date(acct.ts||Date.now()).toISOString().replace('T',' ').slice(11,19)+' UTC';
  document.getElementById('acctTs').textContent='⚡ en vivo · '+ts;
  document.getElementById('acctLiveDot').className='live-dot on';
  document.getElementById('acctLiveBadge').className='acct-live on';
  document.getElementById('navLiveDot').className='live-dot on';
  document.getElementById('navLiveTs').textContent=ts;
}

function startAccountStream(){
  const es=new EventSource('/api/account/stream');
  es.onmessage=ev=>{
    try{ renderAccount(JSON.parse(ev.data)); }catch(e){}
  };
  es.onerror=()=>{
    document.getElementById('acctTs').textContent='⚠ reconectando...';
    document.getElementById('acctLiveDot').className='live-dot';
    document.getElementById('acctLiveBadge').className='acct-live';
    document.getElementById('navLiveDot').className='live-dot';
  };
}
async function loadAccountData(){
  try{ const r=await fetch('/api/account'); renderAccount(await r.json()); }catch(e){}
}

// ── Circuit Breaker UI ────────────────────────────────────────────────────────
async function loadCBStatus(){
  try{
    const cb = await fetch('/cb/status').then(r=>r.json());
    const active    = cb.active;
    const consec    = cb.consecutiveSL || 0;
    const dir       = cb.lastDirection || cb.direction || '—';
    const expiresIn = cb.expiresIn || 0;

    // Card border color
    const card = document.getElementById('cbCard');
    if(active){
      card.style.borderColor = 'rgba(255,61,90,.4)';
      card.style.background  = 'rgba(255,61,90,.03)';
    } else if(consec >= 2){
      card.style.borderColor = 'rgba(245,166,35,.3)';
      card.style.background  = 'rgba(245,166,35,.02)';
    } else {
      card.style.borderColor = 'var(--border2)';
      card.style.background  = '';
    }

    // Badge
    const badge = document.getElementById('cbStatusBadge');
    if(active){
      badge.textContent = '🔴 PAUSADO — ' + cb.direction;
      badge.style.background = 'rgba(255,61,90,.1)';
      badge.style.color = 'var(--red)';
      badge.style.borderColor = 'rgba(255,61,90,.3)';
    } else {
      badge.textContent = '✅ ACTIVO — OPERANDO';
      badge.style.background = 'rgba(0,229,160,.1)';
      badge.style.color = 'var(--green)';
      badge.style.borderColor = 'rgba(0,229,160,.2)';
    }

    // Stats
    document.getElementById('cbStateName').textContent = active ? 'PAUSADO' : 'OPERANDO';
    document.getElementById('cbStateName').style.color = active ? 'var(--red)' : 'var(--green)';
    document.getElementById('cbConsec').textContent    = consec;
    document.getElementById('cbConsec').style.color    = consec >= 3 ? 'var(--red)' : consec >= 2 ? 'var(--gold)' : 'var(--text)';
    document.getElementById('cbDir').textContent       = dir;
    document.getElementById('cbDir').style.color       = dir==='SHORT' ? 'var(--red)' : dir==='LONG' ? 'var(--green)' : 'var(--text2)';
    document.getElementById('cbExpires').textContent   = active ? expiresIn + 'min' : '—';
    document.getElementById('cbExpires').style.color   = active ? 'var(--gold)' : 'var(--text2)';

    // Progress bar
    const pct = Math.min((consec / 3) * 100, 100);
    document.getElementById('cbProgBar').style.width = pct + '%';
    document.getElementById('cbProgBar').style.background =
      pct >= 100 ? 'var(--red)' : pct >= 66 ? 'var(--gold)' : 'var(--green)';
    document.getElementById('cbProgTxt').textContent = consec + ' / 3 SL consecutivos en ' + (dir === '—' ? 'ninguna dirección' : dir);

    // Message
    const msg = document.getElementById('cbMessage');
    if(active){
      msg.style.display = 'block';
      msg.style.background = 'rgba(255,61,90,.08)';
      msg.style.color = 'var(--red)';
      msg.style.borderColor = 'rgba(255,61,90,.25)';
      msg.textContent = '⛔ 3 SL consecutivos en ' + cb.direction + ' — operaciones pausadas ' + expiresIn + ' minutos más. Expira: ' + (cb.expiresAt ? new Date(cb.expiresAt).toISOString().replace('T',' ').slice(0,19) + ' UTC' : '—');
    } else if(consec >= 2){
      msg.style.display = 'block';
      msg.style.background = 'rgba(245,166,35,.08)';
      msg.style.color = 'var(--gold)';
      msg.style.borderColor = 'rgba(245,166,35,.25)';
      msg.textContent = '⚠️ Alerta: ' + consec + '/3 SL consecutivos en ' + dir + ' — un SL más activará el interruptor de riesgo por 2h';
    } else {
      msg.style.display = 'none';
    }

  }catch(e){ console.error('CB status error:', e); }
}

async function resetCB(){
  if(!confirm('¿Reiniciar manualmente el interruptor de riesgo?')) return;
  try{
    await fetch('/cb/reset', { method: 'POST' });
    await loadCBStatus();
    console.log('CB reseteado');
  }catch(e){ console.error('CB reset error:', e); }
}

// ── Symbol Cooldowns ─────────────────────────────────────────────────────────
function formatMinutesLeft(value){
  const mins=Math.max(0,Math.round(+value||0));
  return mins<=1?'1 min':mins+' min';
}

function renderCooldowns(payload){
  const list=document.getElementById('cooldownList');
  const badge=document.getElementById('cooldownCount');
  if(!list)return;
  const active=payload&&payload.active?payload.active:{};
  const entries=Object.entries(active);
  if(badge)badge.textContent=entries.length+' activos';
  if(!entries.length){
    list.innerHTML='<div class="cooldown-empty">Sin cooldowns activos</div>';
    return;
  }
  list.innerHTML=entries.map(([symbol,info])=>{
    const minutesLeft=info&&info.minutesLeft!=null?info.minutesLeft:0;
    return '<div class="cooldown-chip">'+
      '<strong>'+escapeHtml(symbol)+'</strong>'+
      '<span class="cooldown-time">'+formatMinutesLeft(minutesLeft)+'</span>'+
      '<button type="button" class="cooldown-clear" data-cooldown-clear="true" data-symbol="'+escapeHtml(symbol)+'" aria-label="Quitar cooldown">×</button>'+
    '</div>';
  }).join('');
}

async function loadCooldowns(){
  try{
    const res=await fetch('/cooldown/status');
    const data=await res.json();
    renderCooldowns(data);
  }catch(e){
    const list=document.getElementById('cooldownList');
    if(list)list.innerHTML='<div class="cooldown-empty">No se pudo cargar los cooldowns</div>';
  }
}

async function clearCooldown(symbol){
  const sym=String(symbol||'').trim();
  if(!sym)return;
  try{
    await fetch('/cooldown/'+encodeURIComponent(sym),{method:'DELETE'});
  }catch(e){}
  loadCooldowns();
}

document.addEventListener('click',(event)=>{
  const btn=event.target.closest('[data-cooldown-clear]');
  if(!btn)return;
  const symbol=btn.getAttribute('data-symbol');
  clearCooldown(symbol);
});

// ── Analytics ─────────────────────────────────────────────────────────────────
function setPeriod(d,btn){
  period=d;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.toggle('active',b===btn));
  applyFilters();
}
function applyFilters(){
  filterDir=document.getElementById('filterDir').value;
  filterResult=document.getElementById('filterResult').value;
  render();
}

async function loadStats(){
  try{
    const r=await fetch('/db/stats');
    allStats=await r.json();
    render();
  }catch(e){
    document.getElementById('kpiGrid').innerHTML='<div class="empty">Error cargando datos — verifica DB</div>';
  }
  return allStats;
}

function render(){
  if(!allStats)return;
  let rows=allStats.recent||[];
  if(period>0){const cut=Date.now()-period*86400000;rows=rows.filter(t=>{const d=new Date(t.opened_at||t.closed_at).getTime();return d>=cut;}); }
  if(filterDir) rows=rows.filter(t=>t.direction===filterDir);
  if(filterResult==='win')  rows=rows.filter(t=>(+t.pnl_usdt||0)>0);
  if(filterResult==='loss') rows=rows.filter(t=>(+t.pnl_usdt||0)<=0);
  rows.forEach(t=>{t.pnl_usdt=t.pnl_usdt!=null?+t.pnl_usdt:null;t.r_final=t.r_final!=null?+t.r_final:null;t.final_score=+t.final_score||0;t.entry_price=+t.entry_price||0;t.exit_price=t.exit_price!=null?+t.exit_price:null;});
  const closed=rows.filter(t=>t.pnl_usdt!==null);
  const wins=closed.filter(t=>t.pnl_usdt>0).length;
  const losses=closed.filter(t=>t.pnl_usdt<=0).length;
  const totalPnL=closed.reduce((s,t)=>s+(t.pnl_usdt||0),0);
  const avgR=closed.length?+(closed.reduce((s,t)=>s+(t.r_final||0),0)/closed.length).toFixed(2):0;
  const bestTrade=closed.reduce((b,t)=>(!b||t.pnl_usdt>b.pnl_usdt)?t:b,null);
  const worstTrade=closed.reduce((b,t)=>(!b||t.pnl_usdt<b.pnl_usdt)?t:b,null);
  renderKPIs({totalPnL,winRate:closed.length?((wins/closed.length)*100).toFixed(1):0,wins,losses,avgR,total:closed.length,bestTrade,worstTrade});
  renderPnLChart(closed);renderWinLoss(wins,losses);
  renderWeekly(allStats.weeklyPnl);renderSymbols(allStats.symbols);
  renderRejections(allStats.topRejections);renderTable(rows);
  window.AterumAssistant?.notifyContextChanged();
}

function renderKPIs({totalPnL,winRate,wins,losses,avgR,total,bestTrade,worstTrade}){
  const kpis=[
    {lbl:'PnL Total',val:(totalPnL>=0?'+':'')+'$'+Math.abs(totalPnL).toFixed(2),sub:total+' trades cerrados',cls:totalPnL>=0?'kpi-green':'kpi-red',icon:'💰',color:totalPnL>=0?'var(--green)':'var(--red)'},
    {lbl:'Tasa de acierto',val:winRate+'%',sub:wins+' G · '+losses+' P',cls:'kpi-blue',icon:'🎯',color:'var(--blue)'},
    {lbl:'R promedio',val:(avgR>=0?'+':'')+avgR+'R',sub:'por trade',cls:avgR>=0?'kpi-green':'kpi-red',icon:'📊',color:avgR>=0?'var(--green)':'var(--red)'},
    {lbl:'Mejor Trade',val:bestTrade?((+bestTrade.pnl_usdt>=0?'+':'')+'$'+Math.abs(+bestTrade.pnl_usdt||0).toFixed(2)):'—',sub:bestTrade?.symbol||'—',cls:'kpi-green',icon:'🏆',color:'var(--green)'},
    {lbl:'Peor Trade',val:worstTrade?((+worstTrade.pnl_usdt>=0?'+':'-')+'$'+Math.abs(+worstTrade.pnl_usdt||0).toFixed(2)):'—',sub:worstTrade?.symbol||'—',cls:'kpi-red',icon:'🛑',color:'var(--red)'},
    {lbl:'Operaciones totales',val:total,sub:'en el periodo',cls:'kpi-purple',icon:'📈',color:'var(--purple)'},
  ];
  document.getElementById('kpiGrid').innerHTML=kpis.map(k=>\`<div class="kpi \${k.cls}"><div class="kpi-glow"></div><div class="kpi-accent"></div><div class="kpi-lbl">\${k.lbl}</div><div class="kpi-val" style="color:\${k.color}">\${k.val}</div><div class="kpi-sub">\${k.sub}</div><div class="kpi-icon">\${k.icon}</div></div>\`).join('');
  const cum=document.getElementById('pnlBadge');
  if(cum)cum.textContent=(totalPnL>=0?'+':'')+'$'+Math.abs(totalPnL).toFixed(2);
  cum.style.color=totalPnL>=0?'var(--green)':'var(--red)';
}

let pnlChart=null,wlChart=null,weeklyChart=null;
function renderPnLChart(closed){
  const sorted=[...closed].sort((a,b)=>new Date(a.closed_at)-new Date(b.closed_at));
  let cum=0;
  const labels=sorted.map(t=>new Date(t.closed_at).toLocaleDateString('es',{month:'short',day:'numeric'}));
  const data=sorted.map(t=>{cum+=t.pnl_usdt||0;return+cum.toFixed(2)});
  const pos=cum>=0;
  const ctx=document.getElementById('chartPnL').getContext('2d');
  if(pnlChart)pnlChart.destroy();
  pnlChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'PnL',data,
    borderColor:pos?'#00e5a0':'#ff3d5a',
    backgroundColor:pos?'rgba(0,229,160,.06)':'rgba(255,61,90,.06)',
    borderWidth:2,fill:true,tension:.35,
    pointRadius:data.length>30?0:3,pointHoverRadius:5,
    pointBackgroundColor:pos?'#00e5a0':'#ff3d5a'}]},
    options:{responsive:true,maintainAspectRatio:true,
      plugins:{legend:{display:false},tooltip:{backgroundColor:'rgba(6,9,16,.9)',borderColor:'rgba(30,46,69,.8)',borderWidth:1,padding:10,callbacks:{label:c=>'PnL: $'+c.raw}}},
      scales:{
        x:{ticks:{color:'#304560',maxTicksLimit:8,font:{size:9,family:"'JetBrains Mono',monospace"}},grid:{color:'rgba(22,32,48,.5)'},border:{display:false}},
        y:{ticks:{color:'#304560',callback:v=>'$'+v,font:{size:9,family:"'JetBrains Mono',monospace"}},grid:{color:'rgba(22,32,48,.5)'},border:{display:false}}
      }}});
}
function renderWinLoss(wins,losses){
  const ctx=document.getElementById('chartWinLoss').getContext('2d');
  if(wlChart)wlChart.destroy();
  wlChart=new Chart(ctx,{type:'doughnut',data:{labels:['Ganadas','Perdidas'],datasets:[{
    data:[wins||0,losses||0],
    backgroundColor:['rgba(0,229,160,.75)','rgba(255,61,90,.75)'],
    borderColor:['#00e5a0','#ff3d5a'],borderWidth:2,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:true,cutout:'75%',
      plugins:{legend:{position:'bottom',labels:{color:'#7a96b8',font:{size:10},padding:16,usePointStyle:true}},
        tooltip:{backgroundColor:'rgba(6,9,16,.9)',borderColor:'rgba(30,46,69,.8)',borderWidth:1,callbacks:{label:c=>c.label+': '+c.raw+(wins+losses>0?' ('+((c.raw/(wins+losses))*100).toFixed(1)+'%)':'')}}}}});
}
function renderWeekly(weekly){
  if(!weekly?.length){document.getElementById('chartWeekly').parentElement.innerHTML='<div class="empty">Sin datos semanales</div>';return}
  const ctx=document.getElementById('chartWeekly').getContext('2d');
  if(weeklyChart)weeklyChart.destroy();
  const sorted=[...weekly].reverse();
  weeklyChart=new Chart(ctx,{type:'bar',data:{labels:sorted.map(w=>'S'+String(w.week).slice(-2)),datasets:[{
    label:'PnL',data:sorted.map(w=>+w.pnl||0),
    backgroundColor:sorted.map(w=>(+w.pnl||0)>=0?'rgba(0,229,160,.65)':'rgba(255,61,90,.65)'),
    borderColor:sorted.map(w=>(+w.pnl||0)>=0?'#00e5a0':'#ff3d5a'),
    borderWidth:1,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:true,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>'$'+c.raw}}},
      scales:{x:{ticks:{color:'#304560',font:{size:9}},grid:{display:false},border:{display:false}},
        y:{ticks:{color:'#304560',callback:v=>'$'+v,font:{size:9}},grid:{color:'rgba(22,32,48,.5)'},border:{display:false}}}}});
}
function renderSymbols(symbols){
  const el=document.getElementById('symList');
  if(!symbols?.length){el.innerHTML='<div class="empty">Sin datos por símbolo</div>';return}
  const max=Math.max(...symbols.map(s=>Math.abs(+s.total_pnl||0)),1);
  el.className='';
  el.innerHTML=symbols.map(s=>{
    const pos=(+s.total_pnl||0)>=0;
    return \`<div class="sym-item">
      <div class="sym-name">\${(s.symbol||'').replace('USDT','')}</div>
      <div class="sym-bar-wrap"><div class="sym-bar-fill" style="width:\${Math.min(Math.abs(+s.total_pnl||0)/max*100,100)}%;background:\${pos?'var(--green)':'var(--red)'}"></div></div>
      <div class="sym-wr" style="color:var(--text2)">\${+s.win_rate||0}%</div>
      <div class="sym-pnl \${pos?'pp':'pn'}">\${pos?'+':''}\$\${Math.abs(+s.total_pnl||0).toFixed(2)}</div>
    </div>\`;
  }).join('');
}
function renderRejections(rejections){
  const el=document.getElementById('rejList');
  if(!rejections?.length){el.innerHTML='<div class="empty">Sin rechazos registrados</div>';return}
  const max=Math.max(...rejections.map(r=>+r.count||0),1);
  const badge=document.getElementById('rejBadge');
  if(badge)badge.textContent=rejections.reduce((s,r)=>s+(+r.count||0),0)+' total';
  el.className='';
  el.innerHTML=rejections.map((r,i)=>\`<div class="rejection-item">
    <div class="rej-rank">\${i+1}</div>
    <div class="rej-lbl">\${r.skip_reason||'—'}</div>
    <div class="rej-bar-wrap"><div class="rej-bar-fill" style="width:\${Math.min((+r.count/max)*100,100)}%"></div></div>
    <div class="rej-count">\${r.count}</div>
  </div>\`).join('');
}
function renderTable(rows){
  const tbody=document.getElementById('tradesTbl');
  document.getElementById('tradeCount').textContent=rows.length+' trades';
  if(!rows.length){tbody.innerHTML='<tr><td colspan="10" class="empty">Sin trades en este período</td></tr>';return}
  tbody.innerHTML=rows.map(t=>{
    const pnl=t.pnl_usdt,fr=t.r_final,mins=t.duration_minutes;
    const reason=t.close_reason||'';
    const winStages1=['TIME_LOCK','LOCK','BREAKEVEN','TRAILING'];
    const isWinStage1=winStages1.includes(t.trailing_stage||'');
    const pnlFixed=pnl!=null?(
      reason==='SL'&&+pnl>0&&!isWinStage1?-pnl:
      reason==='SL'&&+pnl<0&&isWinStage1&&+fr>0?Math.abs(+pnl):
      reason==='TP'&&+pnl<0?Math.abs(+pnl):
      +pnl
    ):null;
    const dur=mins?mins<60?mins+'m':Math.floor(mins/60)+'h '+(mins%60)+'m':'—';
    const rm={SL:'<span class="badge b-sl">SL</span>',TP:'<span class="badge b-tp">TP</span>',MANUAL:'Manual',SYNC:'Sync'};
    return \`<tr>
      <td><strong>\${t.symbol||'—'}</strong></td>
      <td><span class="badge \${t.direction==='LONG'?'b-long':'b-short'}">\${t.direction||'—'}</span></td>
      <td>$\${(+t.entry_price||0).toFixed(4)}</td>
      <td>\${t.exit_price?'$'+(+t.exit_price).toFixed(4):'—'}</td>
      <td class="\${pnlFixed>0?'pp':pnlFixed<0?'pn':''}">\${pnlFixed!=null?(pnlFixed>=0?'+':'-')+'$'+Math.abs(pnlFixed).toFixed(2):'ABIERTO'}</td>
      <td class="\${fr>0?'rp':fr<0?'rn':''}">\${fr!=null?(fr>=0?'+':'')+fr+'R':'—'}</td>
      <td><div class="score-bar"><div class="score-fill" style="width:\${t.final_score||0}px;opacity:.7"></div>\${t.final_score||'—'}</div></td>
      <td>\${rm[t.close_reason]||t.close_reason||'—'}</td>
      <td style="color:var(--text2)">\${dur}</td>
      <td><span class="badge \${t.status==='OPEN'?'b-open':'b-closed'}">\${t.status||'—'}</span></td>
    </tr>\`;
  }).join('');
}

// Arrancar stream INMEDIATAMENTE — no depende de loadStats
loadAccountData();
startAccountStream();
// Circuit breaker status
loadCBStatus();
setInterval(loadCBStatus, 10000);
// Cooldown status
loadCooldowns();
setInterval(loadCooldowns, 30000);
// Luego cargar stats de DB
loadStats();
</script>
<script>${getSharedScript()}</script>
</body></html>`; }

module.exports = { getAnalyticsHTML };
