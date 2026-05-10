'use strict';
const bcrypt  = require('bcrypt');
const session = require('express-session');
require('../services/load_env');

const SESSION_SECRET  = process.env.SESSION_SECRET || 'aterum-session-secret-xK9mP2024';
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
  const isPage = ['/dashboard', '/analytics', '/ai-data', '/simulator', '/crypto-play'].some(p => req.path.startsWith(p));
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
<title>αтεгυм — Login</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{background:#05070b;color-scheme:dark}
body{background:linear-gradient(180deg,rgba(87,176,255,.08),transparent 260px),linear-gradient(115deg,rgba(46,230,166,.075),transparent 42%),linear-gradient(245deg,rgba(248,200,106,.05),transparent 44%),#05070b;color:#f4f8ff;font-family:'Inter','SF Pro Text','Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;padding:24px;-webkit-font-smoothing:antialiased}
body::after{content:'';position:fixed;inset:0;pointer-events:none;background:linear-gradient(115deg,transparent 0%,rgba(87,176,255,.13) 38%,transparent 58%);transform:translateX(-120%);opacity:0}
body.is-submitting::after{animation:loginWarp .72s cubic-bezier(.22,1,.36,1) forwards}
.bg-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(148,163,184,.1) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.1) 1px,transparent 1px);background-size:64px 64px;pointer-events:none;opacity:.26;mask-image:linear-gradient(180deg,black,transparent 82%);animation:gridFlow 18s linear infinite}
.bg-glow{position:absolute;left:0;right:0;top:86px;height:1px;background:linear-gradient(90deg,transparent,rgba(87,176,255,.38),rgba(46,230,166,.28),transparent);pointer-events:none;overflow:hidden}
.bg-glow::before{content:'';position:absolute;top:-1px;left:-160px;width:140px;height:3px;border-radius:999px;background:linear-gradient(90deg,transparent,#57b0ff,#2ee6a6,transparent);animation:loginLane 4.8s ease-in-out infinite}
.login-orbit{position:absolute;inset:0;pointer-events:none}
.login-orbit span{position:absolute;width:2px;height:2px;border-radius:999px;background:#57b0ff;box-shadow:0 0 16px #57b0ff;opacity:.26;animation:particleFloat 9s ease-in-out infinite}
.login-orbit span:nth-child(1){left:10%;top:18%;animation-delay:0s}
.login-orbit span:nth-child(2){left:22%;top:74%;animation-delay:1.1s;background:#2ee6a6}
.login-orbit span:nth-child(3){left:42%;top:24%;animation-delay:2.2s}
.login-orbit span:nth-child(4){left:68%;top:78%;animation-delay:3.4s;background:#f8c86a}
.login-orbit span:nth-child(5){left:84%;top:34%;animation-delay:4.1s}
.login-orbit span:nth-child(6){left:92%;top:66%;animation-delay:5.2s;background:#2ee6a6}
.container{position:relative;z-index:1;width:100%;max-width:440px;perspective:900px;animation:terminalEnter .58s cubic-bezier(.22,1,.36,1) both}
.card{background:linear-gradient(180deg,rgba(14,21,34,.92),rgba(12,18,29,.76));border:1px solid rgba(166,183,208,.16);border-radius:10px;padding:42px 38px;text-align:center;position:relative;overflow:hidden;box-shadow:0 34px 80px rgba(0,0,0,.42),0 0 56px rgba(87,176,255,.08),inset 0 1px 0 rgba(255,255,255,.07);backdrop-filter:blur(22px) saturate(1.18);transition:transform .34s cubic-bezier(.22,1,.36,1),opacity .34s,filter .34s}
.card::before{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(255,255,255,.075),rgba(255,255,255,.018) 42%,rgba(255,255,255,0))}
body.is-submitting .card{transform:translateY(-8px) rotateX(2deg) scale(.985);opacity:.9;filter:brightness(1.12)}
.logo{font-family:'Inter Tight','Inter',sans-serif;font-size:34px;font-weight:900;letter-spacing:.04em;margin-bottom:8px;position:relative}
.logo span{color:#57b0ff}
.logo-dot{display:inline-block;width:8px;height:8px;border-radius:999px;background:linear-gradient(180deg,#2ee6a6,#57b0ff);box-shadow:0 0 18px rgba(46,230,166,.42);margin-right:10px;vertical-align:middle;animation:glow 2.4s ease-in-out infinite}
@keyframes glow{0%,100%{opacity:.78;transform:scale(.92)}50%{opacity:1;transform:scale(1)}}
.subtitle{font:700 10px/1 'JetBrains Mono',monospace;color:#8d9aab;letter-spacing:.12em;margin-bottom:34px;text-transform:uppercase;position:relative}
.divider{height:1px;background:linear-gradient(90deg,transparent,rgba(166,183,208,.2),transparent);margin-bottom:28px}
.form-group{margin-bottom:16px;text-align:left;position:relative}
.form-label{display:block;font:700 10px/1 'JetBrains Mono',monospace;color:#8d9aab;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px}
.form-input{width:100%;min-height:46px;padding:12px 14px;background:rgba(255,255,255,.045);border:1px solid rgba(166,183,208,.16);border-radius:8px;color:#f4f8ff;font-family:'Inter',sans-serif;font-size:13px;outline:none;transition:border-color .2s,box-shadow .2s,background .2s}
.form-input:focus{border-color:rgba(87,176,255,.44);background:rgba(255,255,255,.065);box-shadow:0 0 0 4px rgba(87,176,255,.1)}
.submit-btn{width:100%;min-height:48px;background:linear-gradient(180deg,rgba(87,176,255,.24),rgba(46,230,166,.1));border:1px solid rgba(87,176,255,.36);border-radius:8px;color:#f4f8ff;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;transition:transform .2s,box-shadow .2s,border-color .2s,color .2s;margin-top:8px;position:relative;overflow:hidden}
.submit-btn::before{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent,rgba(255,255,255,.16),transparent);transform:translateX(-120%);transition:transform .5s cubic-bezier(.22,1,.36,1)}
.submit-btn:hover::before{transform:translateX(120%)}
.submit-btn::after{content:'';position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid rgba(255,255,255,.28);border-top-color:#f4f8ff;border-radius:999px;opacity:0;transform:scale(.8);animation:spin .68s linear infinite}
body.is-submitting .submit-btn{color:transparent;pointer-events:none}
body.is-submitting .submit-btn::after{opacity:1;transform:scale(1)}
.submit-btn:hover{transform:translateY(-1px);border-color:rgba(46,230,166,.36);box-shadow:0 18px 42px rgba(0,0,0,.28)}
.error-msg{margin-top:16px;padding:11px 14px;background:rgba(255,91,117,.1);border:1px solid rgba(255,91,117,.24);border-radius:8px;font-size:12px;color:#ff8798;display:${error ? 'block' : 'none'}}
.footer{margin-top:26px;font:700 10px/1.5 'JetBrains Mono',monospace;color:#64748b;letter-spacing:.08em;text-transform:uppercase}
@keyframes spin{to{transform:scale(1) rotate(360deg)}}
@keyframes gridFlow{to{background-position:64px 64px,64px 64px}}
@keyframes loginLane{0%{transform:translateX(0);opacity:0}20%{opacity:.72}100%{transform:translateX(calc(100vw + 220px));opacity:0}}
@keyframes particleFloat{0%,100%{transform:translate3d(0,0,0) scale(.8);opacity:.12}50%{transform:translate3d(0,-18px,0) scale(1.35);opacity:.36}}
@keyframes terminalEnter{0%{opacity:0;transform:translateY(18px) rotateX(5deg) scale(.985)}100%{opacity:1;transform:none}}
@keyframes loginWarp{0%{transform:translateX(-120%);opacity:0}32%{opacity:.8}100%{transform:translateX(120%);opacity:0}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none !important;transition:none !important}}
@media(max-width:480px){.card{padding:34px 24px}.logo{font-size:30px}}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="bg-glow"></div>
<div class="login-orbit" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
<div class="container">
  <div class="card">
    <div class="logo"><span class="logo-dot"></span>α<span>т</span>εгυм</div>
    <div class="subtitle">TRADING DASHBOARD · ACCESO PRIVADO</div>
    <div class="divider"></div>
    <form method="POST" action="/login">
      <div class="form-group">
        <label class="form-label" for="username">Usuario</label>
        <input class="form-input" type="text" id="username" name="username" autocomplete="username" placeholder="admin" required>
      </div>
      <div class="form-group">
        <label class="form-label" for="password">Contraseña</label>
        <input class="form-input" type="password" id="password" name="password" autocomplete="current-password" required>
      </div>
      <button type="submit" class="submit-btn">Iniciar Sesión</button>
    </form>
    <div class="error-msg">${errMsg}</div>
    <div class="footer">Sesión de 8 horas · Solo usuarios autorizados</div>
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
