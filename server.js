const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const app = express();
const PORT = Number(process.env.CHART_API_PORT || 3000);
const HOST = process.env.BIND_HOST || '0.0.0.0';
const CHROMIUM_PATH = '/usr/bin/chromium';
const TMPDIR = process.env.TMPDIR || '/home/admin/chart-api/tmp';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

process.env.TMPDIR = TMPDIR;
process.env.TMP = process.env.TMP || TMPDIR;
process.env.TEMP = process.env.TEMP || TMPDIR;

try {
  fs.mkdirSync(TMPDIR, { recursive: true });
} catch (e) {
  console.error('[Chart] tmp init error:', e.message);
}

async function renderChart(symbol) {
  let browser;
  try {
    const TV_SYMBOLS = [
      `BINANCE:${symbol}.P`,
      `BINANCE:${symbol}`,
      `BYBIT:${symbol}.P`,
    ];

    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      protocolTimeout: 120000,
      timeout: 120000,
      pipe: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-crash-reporter'
      ],
      env: {
        ...process.env,
        TMPDIR,
        TMP: process.env.TMP || TMPDIR,
        TEMP: process.env.TEMP || TMPDIR
      }
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
    );

    await page.setViewport({ width: 1280, height: 800 });

    // ── Probar cada exchange hasta que uno cargue ─────────────────────────────
    let symbolLoaded = null;

    for(const tvSymbol of TV_SYMBOLS){
      const url = `https://www.tradingview.com/chart/?symbol=${tvSymbol}&interval=60`;
      console.log(`[Chart] Intentando: ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 90000
      });

      await sleep(8000);

      // Verificar si cargó correctamente
      const failed = await page.evaluate(() => {
        const body = document.body.innerText || '';
        return (
          body.includes('Symbol not found') ||
          body.includes('No data') ||
          body.includes('Invalid symbol') ||
          body.includes('no existe') ||
          // Si no hay canvas el chart no cargó
          !document.querySelector('canvas')
        );
      });

      if(!failed){
        symbolLoaded = tvSymbol;
        console.log(`[Chart] ✅ Cargado: ${tvSymbol}`);
        break;
      }

      console.log(`[Chart] ❌ Falló: ${tvSymbol}`);
    }

    if(!symbolLoaded){
      console.log(`[Chart] ⚠️ Ningún exchange funcionó para ${symbol} — devolviendo último intento`);
    }

    //------------------------------------
    // ZOOM: mostrar solo ultimas 48 velas
    //------------------------------------
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if(canvas) canvas.click();
    });

    await sleep(500);

    await page.keyboard.down('Alt');
    await page.keyboard.press('Digit2');
    await page.keyboard.up('Alt');

    await sleep(1500);

    const chartArea = await page.$('canvas');
    if(chartArea){
      const box = await chartArea.boundingBox();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      await page.mouse.move(centerX, centerY);

      for(let i = 0; i < 8; i++){
        await page.mouse.wheel({ deltaY: -120 });
        await sleep(150);
      }
    }

    await sleep(2000);

    //------------------------------------
    // OCULTAR SIDEBAR DERECHO
    //------------------------------------
    await page.evaluate(() => {
      const selectors = [
        '.layout__area--right',
        '[data-name="right-toolbar"]',
        '.chart-controls-bar'
      ];
      selectors.forEach(sel => {
        const el = document.querySelector(sel);
        if(el) el.style.display = 'none';
      });
    }).catch(() => {});

    await sleep(500);

    return await page.screenshot({
      type: 'jpeg',
      quality: 70
    });
  } finally {
    if (browser) await browser.close();
  }
}

app.get('/chart', async (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();
  const errors = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const screenshot = await renderChart(symbol);
      res.set('Content-Type', 'image/jpeg');
      res.send(screenshot);
      return;
    } catch (error) {
      const message = error?.message || 'unknown error';
      errors.push(message);
      console.error(`❌ Screenshot attempt ${attempt} failed for ${symbol}:`, message);
      await sleep(1500);
    }
  }

  res.status(500).json({ success: false, error: errors[errors.length - 1], attempts: errors });
});

app.get('/', (req, res) => {
  res.send('Chart API running 🚀');
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Chart API running on ${HOST}:${PORT} tmp=${TMPDIR}`);
});
