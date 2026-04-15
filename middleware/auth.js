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
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Syne:wght@700;800;900&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#03050a;color:#c8dff0;font-family:'JetBrains Mono',monospace;min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.bg-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(168,85,247,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.bg-glow{position:absolute;width:600px;height:600px;border-radius:50%;background:radial-gradient(circle,rgba(168,85,247,.06) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);pointer-events:none}
.container{position:relative;z-index:1;width:100%;max-width:420px;padding:24px}
.card{background:#070c14;border:1px solid #162840;border-radius:16px;padding:48px 40px;text-align:center;position:relative;overflow:hidden}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#a855f7,#3d9eff,#00e5a0)}
.logo{font-family:'Syne',sans-serif;font-size:32px;font-weight:900;letter-spacing:.08em;margin-bottom:8px}
.logo span{color:#a855f7}
.logo-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#00e5a0;box-shadow:0 0 12px #00e5a0;margin-right:10px;vertical-align:middle;animation:glow 2s ease-in-out infinite}
@keyframes glow{0%,100%{box-shadow:0 0 8px #00e5a0}50%{box-shadow:0 0 20px #00e5a0,0 0 40px rgba(0,229,160,.3)}}
.subtitle{font-size:11px;color:#5a7a9a;letter-spacing:.08em;margin-bottom:40px}
.divider{height:1px;background:linear-gradient(90deg,transparent,#162840,transparent);margin-bottom:32px}
.form-group{margin-bottom:16px;text-align:left}
.form-label{display:block;font-size:10px;color:#5a7a9a;letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px}
.form-input{width:100%;padding:12px 16px;background:#0c1525;border:1px solid #162840;border-radius:8px;color:#c8dff0;font-family:'JetBrains Mono',monospace;font-size:13px;outline:none;transition:border-color .2s}
.form-input:focus{border-color:#a855f7;box-shadow:0 0 0 3px rgba(168,85,247,.1)}
.submit-btn{width:100%;padding:14px;background:rgba(168,85,247,.15);border:1px solid rgba(168,85,247,.4);border-radius:8px;color:#c8dff0;font-family:'JetBrains Mono',monospace;font-size:13px;font-weight:600;letter-spacing:.06em;cursor:pointer;transition:all .2s;margin-top:8px}
.submit-btn:hover{background:rgba(168,85,247,.25);border-color:rgba(168,85,247,.6);transform:translateY(-1px);box-shadow:0 8px 24px rgba(168,85,247,.2)}
.error-msg{margin-top:16px;padding:10px 16px;background:rgba(255,61,90,.08);border:1px solid rgba(255,61,90,.2);border-radius:6px;font-size:11px;color:#ff3d5a;display:${error ? 'block' : 'none'}}
.footer{margin-top:28px;font-size:10px;color:#243548;letter-spacing:.06em}
</style>
</head>
<body>
<div class="bg-grid"></div>
<div class="bg-glow"></div>
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
</body></html>`;
}

module.exports = { setupAuth, requireAuth };
