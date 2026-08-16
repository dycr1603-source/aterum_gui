'use strict';
const bcrypt  = require('bcrypt');
const session = require('express-session');
const { BRAND_LOGO_PATH } = require('../views/brand');
require('../services/load_env');

const SESSION_SECRET  = process.env.SESSION_SECRET || '';
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

const loginAttempts = {};
const RATE_LIMIT    = 5;
const RATE_WINDOW   = 15 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const d   = loginAttempts[ip];
  if (!d || now > d.resetAt) { loginAttempts[ip] = { count: 1, resetAt: now + RATE_WINDOW }; return true; }
  if (d.count >= RATE_LIMIT) return false;
  d.count++;
  return true;
}

function setupAuth(app, db) {
  app.use(session({
    secret: SESSION_SECRET, resave: false, saveUninitialized: false,
    cookie: { maxAge: SESSION_MAX_AGE, httpOnly: true, sameSite: 'strict' }
  }));
  app.use(require('express').urlencoded({ extended: false }));

  (async () => {
    try {
      await db.execute(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT NOW(),
        last_login DATETIME NULL
      )`);
      const [rows] = await db.execute(`SELECT COUNT(*) as cnt FROM users`);
      if (rows[0].cnt === 0) {
        const defaultUser = process.env.DEFAULT_ADMIN_USER || 'admin';
        const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'change-me-now';
        const hash = await bcrypt.hash(defaultPassword, 12);
        await db.execute(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, [defaultUser, hash]);
        console.log(`[Auth] Default user created — username: ${defaultUser}. Change DEFAULT_ADMIN_PASSWORD after first deploy.`);
      }
    } catch(e) { console.error('[Auth] Init error:', e.message); }
  })();

  app.get('/login', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.send(getLoginHTML(req.query.error));
  });

  app.post('/login', async (req, res) => {
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (!checkRateLimit(ip)) return res.redirect('/login?error=rate');
    const { username, password } = req.body;
    try {
      const [rows] = await db.execute(`SELECT * FROM users WHERE username = ?`, [username || '']);
      const user = rows?.[0];
      if (!user) return res.redirect('/login?error=1');
      const ok = await bcrypt.compare(password || '', user.password_hash);
      if (!ok) return res.redirect('/login?error=1');
      req.session.user = { id: user.id, username: user.username };
      await db.execute(`UPDATE users SET last_login = NOW() WHERE id = ?`, [user.id]);
      console.log(`[Auth] Login: ${user.username} from ${ip}`);
      res.redirect(req.session.returnTo || '/dashboard');
    } catch(e) {
      console.error('[Auth] Login error:', e.message);
      res.redirect('/login?error=1');
    }
  });

  app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
  app.get('/auth/logout', (req, res) => { req.session.destroy(() => res.redirect('/login')); });
}

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  const ua   = req.headers['user-agent'] || '';
  const isN8N = !ua.includes('Mozilla') || !!req.headers['x-n8n-workflow'];
  const isPage = ['/dashboard', '/analytics', '/ai-data', '/research', '/knowledge', '/simulator', '/crypto-play'].some(p => req.path.startsWith(p));
  if (isN8N && !isPage) return next();
  if (isPage) { req.session.returnTo = req.path; return res.redirect('/login'); }
  res.status(401).json({ error: 'No autorizado' });
}

function getLoginHTML(error) {
  const errMsg = error === 'rate'
    ? 'Demasiados intentos — espera 15 minutos'
    : 'Usuario o contraseña incorrectos';
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>ATERUM — Login</title>
<link rel="icon" type="image/png" href="${BRAND_LOGO_PATH}">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{background:#05070a;color-scheme:dark}
:root{
  --at-primary:#57b0ff;--at-success:#2ee6a6;--at-warning:#f8c86a;--at-danger:#ff5b75;
  --at-brand-violet:#a855f7;--at-brand-rim:linear-gradient(90deg,#a855f7,#57b0ff,#2ee6a6);
}
body{background:radial-gradient(620px 420px at 50% -8%,rgba(87,176,255,.14),transparent 60%),radial-gradient(480px 360px at 88% 12%,rgba(168,85,247,.10),transparent 58%),radial-gradient(420px 320px at 8% 88%,rgba(46,230,166,.06),transparent 55%),#05070a;color:#f4f8ff;font-family:'Inter','SF Pro Text','Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;padding:24px;-webkit-font-smoothing:antialiased}
body::after{content:'';position:fixed;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 0%,rgba(87,176,255,.13) 38%,transparent 58%);transform:translateX(-120%);opacity:0}
body.is-submitting::after{animation:loginWarp .72s cubic-bezier(.22,1,.36,1) forwards}
.bg-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.1) 1px,transparent 1px);background-size:64px 64px;pointer-events:none;opacity:.22;mask-image:radial-gradient(circle at 50% 32%,black 32%,transparent 76%);animation:gridFlow 18s linear infinite}
.login-orbit{position:absolute;inset:0;pointer-events:none}
.login-orbit span{position:absolute;width:2px;height:2px;border-radius:999px;background:var(--at-primary);box-shadow:0 0 16px var(--at-primary);opacity:.26;animation:particleFloat 9s ease-in-out infinite}
.login-orbit span:nth-child(1){left:10%;top:18%;animation-delay:0s}
.login-orbit span:nth-child(2){left:22%;top:74%;animation-delay:1.1s;background:var(--at-success);box-shadow:0 0 16px var(--at-success)}
.login-orbit span:nth-child(3){left:42%;top:24%;animation-delay:2.2s;background:var(--at-brand-violet);box-shadow:0 0 16px var(--at-brand-violet)}
.login-orbit span:nth-child(4){left:68%;top:78%;animation-delay:3.4s;background:var(--at-warning);box-shadow:0 0 16px var(--at-warning)}
.login-orbit span:nth-child(5){left:84%;top:34%;animation-delay:4.1s}
.login-orbit span:nth-child(6){left:92%;top:66%;animation-delay:5.2s;background:var(--at-brand-violet);box-shadow:0 0 16px var(--at-brand-violet)}
.container{position:relative;z-index:1;width:100%;max-width:960px;perspective:900px;animation:terminalEnter .58s cubic-bezier(.22,1,.36,1) both}
.split{display:grid;grid-template-columns:1fr 1fr;min-height:520px;border-radius:16px;overflow:hidden;box-shadow:0 34px 80px rgba(0,0,0,.42),0 0 64px rgba(87,176,255,.09),0 0 100px rgba(168,85,247,.05);position:relative}
.split::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--at-brand-rim);opacity:.85;z-index:2}
.brand-pane{background:linear-gradient(160deg,rgba(87,176,255,.12),rgba(168,85,247,.08) 55%,rgba(10,14,22,.4));border:1px solid rgba(166,183,208,.14);border-right:none;padding:48px 44px;display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden;backdrop-filter:blur(22px) saturate(1.18)}
.brand-pane::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.06),transparent 50%)}
.brand-mark{display:block;width:min(100%,280px);height:auto;aspect-ratio:1;margin:-24px auto -6px;object-fit:contain;animation:brandImageFloat 4.8s ease-in-out infinite}
@keyframes brandImageFloat{0%,100%{transform:translate3d(0,2px,0) scale(.985);opacity:.9}50%{transform:translate3d(0,-4px,0) scale(1.015);opacity:1}}
.brand-welcome{font:600 13px/1 'Inter',sans-serif;color:#a9b8cc;margin-bottom:4px}
.brand-title{font-family:'Inter Tight','Inter',sans-serif;font-size:32px;font-weight:800;letter-spacing:-.01em;color:#f4f8ff;margin-bottom:14px}
.brand-desc{font:500 13px/1.6 'Inter',sans-serif;color:#8d9aab;max-width:32ch;margin-bottom:32px}
.brand-foot{font:700 9px/1.6 'JetBrains Mono',monospace;color:#5c6a80;letter-spacing:.1em;text-transform:uppercase;position:relative}
.card{background:linear-gradient(180deg,rgba(14,21,34,.92),rgba(12,18,29,.86));border:1px solid rgba(166,183,208,.16);padding:48px 44px;text-align:left;position:relative;overflow:hidden;backdrop-filter:blur(22px) saturate(1.18);transition:transform .34s cubic-bezier(.22,1,.36,1),opacity .34s,filter .34s;display:flex;flex-direction:column;justify-content:center}
.card-brand-mark{display:none}
.card::after{content:'';position:absolute;inset:0 0 auto;height:120px;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015) 42%,rgba(255,255,255,0))}
body.is-submitting .card{transform:translateY(-8px) scale(.99);opacity:.9;filter:brightness(1.1)}
.form-title{font-family:'Inter Tight','Inter',sans-serif;font-size:22px;font-weight:800;color:#f4f8ff;margin-bottom:4px}
.form-subtitle{font:500 12.5px/1 'Inter',sans-serif;color:#8d9aab;margin-bottom:30px}
.form-group{margin-bottom:16px;text-align:left;position:relative}
.form-label{display:block;font:700 10px/1 'JetBrains Mono',monospace;color:#8d9aab;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.form-input{width:100%;min-height:46px;padding:12px 14px;background:rgba(255,255,255,.045);border:1px solid rgba(166,183,208,.16);border-radius:8px;color:#f4f8ff;font-family:'Inter',sans-serif;font-size:13px;outline:none;transition:border-color .2s,box-shadow .2s,background .2s}
.form-input:focus{border-color:rgba(87,176,255,.44);background:rgba(255,255,255,.065);box-shadow:0 0 0 4px rgba(87,176,255,.1)}
.form-forgot{display:block;text-align:right;font:600 10.5px/1 'Inter',sans-serif;color:var(--at-primary);text-decoration:none;margin:8px 0 20px;opacity:.85}
.form-forgot:hover{opacity:1;text-decoration:underline}
.submit-btn{width:100%;min-height:48px;background:linear-gradient(135deg,#57b0ff,#3d8ce0);border:1px solid rgba(87,176,255,.5);border-radius:8px;color:#08131f;font-family:'Inter',sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;transition:transform .2s,box-shadow .2s,border-color .2s,color .2s;position:relative;overflow:hidden}
.submit-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent,rgba(255,255,255,.22),transparent);transform:translateX(-120%);transition:transform .5s cubic-bezier(.22,1,.36,1)}
.submit-btn:hover::before{transform:translateX(120%)}
.submit-btn::after{content:'';position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid rgba(8,19,31,.28);border-top-color:#08131f;border-radius:999px;opacity:0;transform:scale(.8);animation:spin .68s linear infinite}
body.is-submitting .submit-btn{color:transparent;pointer-events:none}
body.is-submitting .submit-btn::after{opacity:1;transform:scale(1)}
.submit-btn:hover{transform:translateY(-1px);box-shadow:0 18px 42px rgba(87,176,255,.24)}
.divider-row{display:flex;align-items:center;gap:12px;margin:22px 0}
.divider-row::before,.divider-row::after{content:'';flex:1;height:1px;background:rgba(166,183,208,.16)}
.divider-row span{font:600 10px/1 'JetBrains Mono',monospace;color:#5c6a80;letter-spacing:.08em;text-transform:uppercase}
.secondary-btn{width:100%;min-height:46px;background:rgba(255,255,255,.03);border:1px solid rgba(166,183,208,.18);border-radius:8px;color:#c8d3e0;font-family:'Inter',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .2s}
.secondary-btn:hover{background:rgba(255,255,255,.06);border-color:rgba(166,183,208,.3)}
.error-msg{margin-top:16px;padding:11px 14px;background:rgba(255,91,117,.1);border:1px solid rgba(255,91,117,.24);border-radius:8px;font-size:12px;color:#ff8798;display:${error ? 'block' : 'none'}}
.footer{margin-top:24px;font:600 10px/1.5 'Inter',sans-serif;color:#64748b;text-align:center}
@keyframes spin{to{transform:scale(1) rotate(360deg)}}
@keyframes gridFlow{to{background-position:64px 64px,64px 64px}}
@keyframes particleFloat{0%,100%{transform:translate3d(0,0,0) scale(.8);opacity:.12}50%{transform:translate3d(0,-18px,0) scale(1.35);opacity:.36}}
@keyframes terminalEnter{0%{opacity:0;transform:translateY(18px) scale(.985)}100%{opacity:1;transform:none}}
@keyframes loginWarp{0%{transform:translateX(-120%);opacity:0}32%{opacity:.8}100%{transform:translateX(120%);opacity:0}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}

/* Seamless premium login — the official PNG blends into one continuous glass surface. */
body{
  background:
    radial-gradient(720px 520px at 18% 12%,rgba(53,109,255,.12),transparent 64%),
    radial-gradient(620px 480px at 86% 16%,rgba(135,63,255,.12),transparent 66%),
    radial-gradient(520px 420px at 52% 110%,rgba(32,227,178,.055),transparent 64%),
    linear-gradient(145deg,#020610,#050817 46%,#02050d) !important;
}
.bg-grid{opacity:.12;mask-image:radial-gradient(ellipse at 50% 42%,#000 18%,transparent 76%)}
.container{max-width:980px}
.split{
  grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);
  min-height:570px;
  border:0;
  border-radius:24px;
  background:
    radial-gradient(circle at 18% 18%,rgba(74,91,255,.13),transparent 34%),
    radial-gradient(circle at 88% 10%,rgba(72,150,255,.07),transparent 32%),
    linear-gradient(145deg,rgba(18,29,52,.88),rgba(7,14,29,.92));
  box-shadow:
    0 46px 110px rgba(0,2,12,.58),
    0 0 70px rgba(64,76,255,.09),
    inset 0 1px rgba(255,255,255,.055);
  backdrop-filter:blur(30px) saturate(140%);
  isolation:isolate;
}
.split::before{
  left:8%;right:8%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(130,104,255,.72),rgba(79,175,255,.72),rgba(32,227,178,.48),transparent);
  opacity:.78;
}
.brand-pane{
  padding:38px 30px 38px 44px;
  border:0;
  background:transparent;
  align-items:center;
  text-align:center;
}
.brand-pane::before{
  content:'';
  position:absolute;
  inset:7% -8% 6% 3%;
  background:radial-gradient(circle at 46% 42%,rgba(75,87,255,.2),transparent 44%);
  opacity:.68;
  pointer-events:none;
}
.brand-pane::after{
  background:linear-gradient(118deg,rgba(255,255,255,.035),transparent 36%);
}
.brand-mark{
  position:relative;
  z-index:1;
  width:min(100%,350px);
  margin:-48px auto -36px;
  mix-blend-mode:screen;
  opacity:.96;
  -webkit-mask-image:radial-gradient(ellipse 52% 43% at 50% 48%,#000 48%,rgba(0,0,0,.9) 62%,transparent 100%);
  mask-image:radial-gradient(ellipse 52% 43% at 50% 48%,#000 48%,rgba(0,0,0,.9) 62%,transparent 100%);
}
.brand-desc{
  position:relative;
  z-index:1;
  max-width:34ch;
  margin:0 auto 24px;
  color:#a8b7cd;
  text-align:center;
}
.brand-foot{z-index:1;text-align:center;color:#647692}
.card{
  padding:58px 58px;
  border:0;
  background:transparent;
  backdrop-filter:none;
  overflow:visible;
}
.card::before{
  content:'';
  position:absolute;
  z-index:-1;
  inset:8% 7% 8% 2%;
  border-radius:20px;
  background:linear-gradient(145deg,rgba(17,29,52,.62),rgba(6,13,27,.34));
  box-shadow:inset 0 1px rgba(255,255,255,.025),0 18px 42px rgba(0,2,12,.16);
  opacity:.72;
}
.card::after{display:none}
.form-title{font-size:27px;letter-spacing:-.035em;margin-bottom:6px}
.form-subtitle{margin-bottom:34px;color:#91a2ba}
.form-label{color:#8294ae}
.form-input{
  min-height:50px;
  padding:13px 16px;
  border-color:rgba(124,158,218,.16);
  border-radius:11px;
  background:linear-gradient(180deg,rgba(24,39,66,.68),rgba(12,24,43,.7));
  box-shadow:inset 0 1px rgba(255,255,255,.035),0 9px 22px rgba(0,2,10,.13);
}
.form-input:focus{
  border-color:rgba(92,159,255,.52);
  background:linear-gradient(180deg,rgba(28,47,80,.76),rgba(13,27,49,.76));
  box-shadow:0 0 0 4px rgba(65,126,255,.1),0 0 28px rgba(72,92,255,.12),inset 0 1px rgba(255,255,255,.045);
}
.form-forgot{margin:9px 0 22px;color:#65b9ff}
.submit-btn{
  min-height:52px;
  border:0;
  border-radius:11px;
  background:linear-gradient(115deg,#6b55ff 0%,#3d82f1 48%,#35bce5 100%);
  color:#f8fbff;
  box-shadow:0 16px 38px rgba(55,91,244,.23),inset 0 1px rgba(255,255,255,.24);
}
.submit-btn:hover{transform:translateY(-2px);box-shadow:0 20px 46px rgba(55,91,244,.32)}
.divider-row::before,.divider-row::after{background:linear-gradient(90deg,transparent,rgba(124,158,218,.24))}
.divider-row::after{background:linear-gradient(90deg,rgba(124,158,218,.24),transparent)}
.secondary-btn{
  min-height:49px;
  border-color:rgba(124,158,218,.15);
  border-radius:11px;
  background:linear-gradient(180deg,rgba(20,35,60,.48),rgba(9,20,38,.52));
  box-shadow:inset 0 1px rgba(255,255,255,.025);
}
.secondary-btn:hover{background:linear-gradient(180deg,rgba(26,44,74,.62),rgba(12,25,46,.62));border-color:rgba(112,160,232,.26)}
.footer{margin-top:28px;color:#667995}
@media(max-width:820px){
  body{padding:18px}
  .container{max-width:460px}
  .split{grid-template-columns:1fr;min-height:auto;border-radius:20px}
  .brand-pane{display:none}
  .card{padding:36px 30px 38px}
  .card::before{inset:3% 4% 3%;border-radius:17px;opacity:.48}
  .card-brand-mark{display:block;width:184px;height:184px;margin:-52px auto -38px;object-fit:contain;mix-blend-mode:screen;opacity:.96;-webkit-mask-image:radial-gradient(ellipse 52% 43% at 50% 48%,#000 48%,rgba(0,0,0,.9) 62%,transparent 100%);mask-image:radial-gradient(ellipse 52% 43% at 50% 48%,#000 48%,rgba(0,0,0,.9) 62%,transparent 100%)}
  .form-title{text-align:center;font-size:25px}
  .form-subtitle{text-align:center;margin-bottom:30px}
}
@media(max-width:480px){
  body{padding:12px}
  .card{padding:30px 22px 32px}
  .card-brand-mark{width:166px;height:166px;margin:-45px auto -34px}
  .form-title{font-size:23px}
}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="login-orbit" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
<div class="container">
  <div class="split">
    <div class="brand-pane">
      <img class="brand-mark" src="${BRAND_LOGO_PATH}" alt="ATERUM">
      <div class="brand-desc">Sistema de Trading Algorítmico Inteligente. Precisión. Disciplina. Resultados.</div>
      <div class="brand-foot">El futuro del trading sistémico</div>
    </div>
    <div class="card">
      <img class="card-brand-mark" src="${BRAND_LOGO_PATH}" alt="ATERUM">
      <div class="form-title">Iniciar Sesión</div>
      <div class="form-subtitle">Accede a tu cuenta</div>
      <form method="POST" action="/login">
        <div class="form-group">
          <label class="form-label" for="username">Usuario o Email</label>
          <input class="form-input" type="text" id="username" name="username" autocomplete="username" placeholder="admin" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="password">Contraseña</label>
          <input class="form-input" type="password" id="password" name="password" autocomplete="current-password" required>
        </div>
        <a class="form-forgot" href="#">¿Olvidaste tu contraseña?</a>
        <button type="submit" class="submit-btn">Ingresar</button>
      </form>
      <div class="divider-row"><span>o continúa con</span></div>
      <button type="button" class="secondary-btn">SSO / API Key</button>
      <div class="error-msg">${errMsg}</div>
      <div class="footer">Sesión de 8 horas · Solo usuarios autorizados</div>
    </div>
  </div>
</div>
<script>
(function(){
  var form=document.querySelector('form');
  var card=document.querySelector('.card');
  if(!form)return;
  form.addEventListener('submit',function(){
    document.body.classList.add('is-submitting');
    if(card)card.setAttribute('aria-busy','true');
  });
})();
</script>
</body></html>`;
}

module.exports = { setupAuth, requireAuth };
