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
<title>αтεгυм — Login</title>
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
.brand-mark{width:64px;height:64px;margin-bottom:20px;filter:drop-shadow(0 0 22px rgba(87,176,255,.35));animation:glow 3.2s ease-in-out infinite}
@keyframes glow{0%,100%{filter:drop-shadow(0 0 14px rgba(87,176,255,.28))}50%{filter:drop-shadow(0 0 26px rgba(87,176,255,.4)) drop-shadow(0 0 14px rgba(168,85,247,.22))}}
.brand-welcome{font:600 13px/1 'Inter',sans-serif;color:#a9b8cc;margin-bottom:4px}
.brand-title{font-family:'Inter Tight','Inter',sans-serif;font-size:32px;font-weight:800;letter-spacing:-.01em;color:#f4f8ff;margin-bottom:14px}
.brand-desc{font:500 13px/1.6 'Inter',sans-serif;color:#8d9aab;max-width:32ch;margin-bottom:32px}
.brand-foot{font:700 9px/1.6 'JetBrains Mono',monospace;color:#5c6a80;letter-spacing:.1em;text-transform:uppercase;position:relative}
.card{background:linear-gradient(180deg,rgba(14,21,34,.92),rgba(12,18,29,.86));border:1px solid rgba(166,183,208,.16);padding:48px 44px;text-align:left;position:relative;overflow:hidden;backdrop-filter:blur(22px) saturate(1.18);transition:transform .34s cubic-bezier(.22,1,.36,1),opacity .34s,filter .34s;display:flex;flex-direction:column;justify-content:center}
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
@media(max-width:820px){.split{grid-template-columns:1fr}.brand-pane{display:none}.card{padding:40px 28px}}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="login-orbit" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
<div class="container">
  <div class="split">
    <div class="brand-pane">
      <svg class="brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M32 8 L54 52 H10 Z" stroke="url(#markRim)" stroke-width="4.5" stroke-linejoin="round"/>
        <path d="M32 29 L42 49 H22 Z" fill="url(#markCore)"/>
        <defs>
          <linearGradient id="markRim" x1="10" y1="52" x2="54" y2="8">
            <stop stop-color="#eef2ff"/><stop offset="1" stop-color="#c7d6ff"/>
          </linearGradient>
          <linearGradient id="markCore" x1="22" y1="49" x2="42" y2="29">
            <stop stop-color="#a855f7"/><stop offset="1" stop-color="#57b0ff"/>
          </linearGradient>
        </defs>
      </svg>
      <div class="brand-welcome">Bienvenido a</div>
      <div class="brand-title">ATERUM</div>
      <div class="brand-desc">Sistema de Trading Algorítmico Inteligente. Precisión. Disciplina. Resultados.</div>
      <div class="brand-foot">El futuro del trading sistémico</div>
    </div>
    <div class="card">
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
