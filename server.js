const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const PORT = Number(process.env.CHART_API_PORT || 3000);
const HOST = process.env.BIND_HOST || '0.0.0.0';
const CHROMIUM_PATH = '/usr/bin/chromium';

app.get('/chart', async (req, res) => {
  const symbol = (req.query.symbol || 'BTCUSDT').toUpperCase();

  // Orden de fallback para TradingView
  const TV_SYMBOLS = [
    `BINANCE:${symbol}.P`,
    `BINANCE:${symbol}`,
    `BYBIT:${symbol}.P`,
  ];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROMIUM_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

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
        timeout: 60000
      });

      await new Promise(resolve => setTimeout(resolve, 8000));

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

    await new Promise(resolve => setTimeout(resolve, 500));

    await page.keyboard.down('Alt');
    await page.keyboard.press('Digit2');
    await page.keyboard.up('Alt');

    await new Promise(resolve => setTimeout(resolve, 1500));

    const chartArea = await page.$('canvas');
    if(chartArea){
      const box = await chartArea.boundingBox();
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;

      await page.mouse.move(centerX, centerY);

      for(let i = 0; i < 8; i++){
        await page.mouse.wheel({ deltaY: -120 });
        await new Promise(r => setTimeout(r, 150));
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

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

    await new Promise(resolve => setTimeout(resolve, 500));

    const screenshot = await page.screenshot({
      type: 'jpeg',
      quality: 70
    });

    res.set('Content-Type', 'image/jpeg');
    res.send(screenshot);

  } catch (error) {
    console.error('❌ Screenshot error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/', (req, res) => {
  res.send('Chart API running 🚀');
});

app.listen(PORT, HOST, () => {
  console.log(`🚀 Chart API running on ${HOST}:${PORT}`);
});
