'use strict';
const express = require('express');
const shared  = require('./shared');
const { setupAuth, requireAuth } = require('./middleware/auth');

const app  = express();
const PORT = 3001;

app.use(express.json());

// ── Auth: session + login/logout routes ──────────────────────────────────────
setupAuth(app, shared.db);

// ── Page routes (require auth for browser access) ────────────────────────────
const { getDashboardHTML }  = require('./views/dashboard');
const { getAnalyticsHTML }  = require('./views/analytics');
const { getAIDataHTML }     = require('./views/aidata');
const { getPlayHTML }       = require('./views/play');
const { getSimulatorHTML }  = require('./views/simulator');
const accountRoutes         = require('./routes/account');
const cooldownRoutes        = require('./routes/cooldown');

app.get('/dashboard', requireAuth, (req, res) => {
  const sym = (req.query.symbol || Object.keys(shared.activeTrades)[0] || Object.keys(shared.closedTrades)[0] || 'BTCUSDT').toUpperCase();
  res.send(getDashboardHTML(sym, req.session.user));
});
app.get('/', (req, res) => res.redirect('/dashboard'));
app.get('/ai-data', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.send(getAIDataHTML(req.session.user));
});
app.get('/analytics', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.send(getAnalyticsHTML(req.session.user));
});
app.get('/crypto-play', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.send(getPlayHTML(req.session.user));
});
app.get('/simulator', requireAuth, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.send(getSimulatorHTML(req.session.user));
});

// ── Mount route modules ──────────────────────────────────────────────────────
app.use(accountRoutes);
app.use(require('./routes/trades'));
app.use(require('./routes/analytics'));
app.use(require('./routes/aidata'));
app.use(require('./routes/intelligence'));
app.use(require('./routes/simulator'));
app.use(require('./routes/cb'));
app.use('/', cooldownRoutes);

const server = app.listen(PORT, '0.0.0.0', () => console.log('αтεгυм Dashboard on port ' + PORT));
if (typeof accountRoutes.attachRealtimeServer === 'function') accountRoutes.attachRealtimeServer(server);
