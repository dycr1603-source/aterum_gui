'use strict';
// Explicit live, read-only visual check. Screenshots stay outside the repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const {createPreview} = require('../scripts/preview-gui');

async function run() {
  require('../services/load_env');
  const username = process.env.GUI_TEST_USER || process.env.DEFAULT_ADMIN_USER;
  const password = process.env.GUI_TEST_PASSWORD || process.env.DEFAULT_ADMIN_PASSWORD;
  assert(username && password, 'Configure GUI_TEST_USER / GUI_TEST_PASSWORD or local admin credentials');
  const output = process.env.GUI_ARTIFACTS || '/tmp/aterum-gui-review';
  fs.mkdirSync(output, {recursive:true});
  const server = createPreview();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/dashboard', {waitUntil:'domcontentloaded'});
    assert(new URL(page.url()).pathname === '/login', 'Preview must preserve authentication');
    await page.type('#username', username); await page.type('#password', password);
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}), page.click('button[type=submit]')]);
    assert(new URL(page.url()).pathname === '/dashboard', 'Login failed; no further attempts were made');
    const reports = [];
    for (const viewport of (process.env.GUI_MOBILE_ONLY?[{width:390,height:844}]:[{width:1440,height:1000},{width:390,height:844}])) {
      await page.setViewport(viewport);
      for (const route of (process.env.GUI_ROUTES?process.env.GUI_ROUTES.split(','):['/dashboard','/analytics','/ai-data','/research','/knowledge','/simulator','/crypto-play'])) {
        errors.length = 0;
        await page.goto(origin + route, {waitUntil:'networkidle2',timeout:60000});
        await page.waitForFunction(() => !document.querySelector('.data-panel[aria-busy="true"]'), {timeout:35000});
        if (route === '/analytics') await page.waitForFunction(() => document.querySelector('#kpiGrid .kpi'), {timeout:30000});
        if (route === '/dashboard') {
          await page.waitForFunction(async () => {
            if (!window.AterumUI || !document.querySelector('#watchlist')) return false;
            const data=await AterumUI.json('/api/dashboard/state');
            const visible=Number(document.getElementById('wl-count').textContent);
            const expected=Object.keys(data.trades?.active||{}).length+Object.keys(data.trades?.closed||{}).length;
            return visible===expected && document.querySelectorAll('#wl-open .wl-item').length===Object.keys(data.trades?.active||{}).length;
          }, {timeout:30000});
        }
        if (route === '/knowledge') await page.waitForFunction(() => !document.querySelector('#decisionDetail .loading-line'), {timeout:30000});
        const snapshot = await page.evaluate(() => ({
          width:innerWidth, scroll:document.documentElement.scrollWidth,
          docHeight:document.documentElement.scrollHeight,
          viewportHeight:innerHeight,
          overflowY:getComputedStyle(document.documentElement).overflowY,
          bodyOverflowY:getComputedStyle(document.body).overflowY,
          dashboardPanels:document.body.classList.contains('dashboard-v3')?{
            watchlistPosition:getComputedStyle(document.querySelector('.wl')).position,
            executionPosition:getComputedStyle(document.querySelector('.sb')).position,
            layoutHeight:Math.round(document.querySelector('.layout').getBoundingClientRect().height)
          }:null,
          errors:[...document.querySelectorAll('.data-error')].map(el=>el.textContent),
          clipped:[...document.querySelectorAll('main,.page,.nav-shell,.data-panel')].filter(el=>el.getBoundingClientRect().right>innerWidth+2).map(el=>el.className)
        }));
        const file = route.slice(1) + '-' + viewport.width + '.png';
        await page.screenshot({path:path.join(output,file)});
        reports.push({route,viewport:viewport.width,...snapshot,jsErrors:[...errors]});
        console.log(JSON.stringify(reports.at(-1)));
        if(snapshot.docHeight>snapshot.viewportHeight+2){
          assert.notEqual(snapshot.overflowY,'hidden',route+' hides document vertical overflow');
          const reached=await page.evaluate(async()=>{
            const max=document.documentElement.scrollHeight-innerHeight;
            window.scrollTo({top:max,behavior:'instant'});
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            const value=window.scrollY;
            window.scrollTo({top:0,behavior:'instant'});
            return value;
          });
          assert(reached>0,route+' does not scroll vertically despite overflowing the viewport');
        }
        if(route==='/dashboard'&&viewport.width<=840){
          assert.notEqual(snapshot.dashboardPanels.watchlistPosition,'fixed','Mobile dashboard watchlist must stay in document flow');
          assert.notEqual(snapshot.dashboardPanels.executionPosition,'fixed','Mobile dashboard execution panel must stay in document flow');
        }
        if (route === '/ai-data') {
          const comparison = await page.evaluate(async () => {
            const d=await AterumUI.json('/api/opportunities/latest?limit=10');
            return {expected:d.opportunities.length,actual:document.querySelectorAll('#opportunitiesPanel .data-content > .data-table-scroll > table > tbody > tr').length,selected:d.cycles[0]?.selected_symbol,shown:document.querySelector('#opportunitiesPanel').textContent};
          });
          assert.equal(comparison.actual,comparison.expected || 1);
          if(comparison.selected)assert(comparison.shown.includes(comparison.selected));
          await page.$eval('#opportunitiesPanel',el=>el.scrollIntoView({behavior:'instant'}));
          await page.screenshot({path:path.join(output,'opportunities-'+viewport.width+'.png')});
        }
        if (route === '/research') {
          await page.click('[data-target="engine"]');
          await page.$eval('#shadowPanel',el=>el.scrollIntoView({behavior:'instant'}));
          const shadow = await page.evaluate(async () => {
            const data=await AterumUI.json('/api/research/shadow-summary');
            return {expected:AterumUI.number(data.summary.evaluations,0),actual:document.querySelector('#shadowPanel .data-metric strong').textContent};
          });
          assert.equal(shadow.actual,shadow.expected);
          await page.screenshot({path:path.join(output,'shadow-'+viewport.width+'.png')});
        }
        if (viewport.width === 390) {
          await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
          await page.waitForFunction(()=>document.documentElement.scrollTop===0);
          await page.click('#navToggle');
          assert.equal(await page.$eval('#navToggle',el=>el.getAttribute('aria-expanded')),'true');
          await page.keyboard.press('Escape');
          assert.equal(await page.$eval('#navToggle',el=>el.getAttribute('aria-expanded')),'false');
        }
      }
    }
    await page.setViewport({width:1440,height:1000});
    await page.goto(origin+'/analytics',{waitUntil:'networkidle2'});
    await page.waitForFunction(()=>document.querySelector('#kpiGrid .kpi'));
    // Compare rendered PnL against the API rows for the active period.
    const pnl = await page.evaluate(() => {
      const cut=period>0?Date.now()-period*86400000:0;
      const rows=allStats.recent.filter(t=>!cut||new Date(t.closed_at||t.opened_at).getTime()>=cut);
      const total=rows.filter(t=>t.pnl_usdt!=null).reduce((sum,t)=>sum+Number(t.pnl_usdt),0);
      return {expected:(total>=0?'+':'-')+'$'+Math.abs(total).toFixed(2),actual:document.querySelector('#kpiGrid .kpi-val').textContent};
    });
    assert.equal(pnl.actual,pnl.expected);console.log('PASS live PnL, opportunity ranking and shadow counts match API responses');
    await page.click('#themeToggle');
    await page.screenshot({path:path.join(output,'analytics-light.png')});
    await page.goto(origin+'/ai-data',{waitUntil:'networkidle2'});
    await page.waitForFunction(()=>document.querySelector('#opportunitiesPanel').getAttribute('aria-busy')==='false');
    const previous=await page.$eval('#opportunitiesPanel .data-content',el=>el.innerHTML);
    await page.setRequestInterception(true);
    const failRequest=request=>request.url().includes('/api/opportunities/latest')?request.respond({status:503,contentType:'application/json',body:'{"error":"TEST_UNAVAILABLE"}'}):request.continue();
    page.on('request',failRequest);
    await page.click('#opportunitiesPanel .data-refresh');
    await page.waitForSelector('#opportunitiesPanel .data-error');
    assert.equal(await page.$eval('#opportunitiesPanel .data-content',el=>el.innerHTML),previous,'Failed refresh must retain last valid data');
    await page.$eval('#opportunitiesPanel',el=>el.scrollIntoView({behavior:'instant'}));
    await page.screenshot({path:path.join(output,'opportunities-error.png')});
    page.off('request',failRequest);await page.setRequestInterception(false);
    await page.click('#opportunitiesPanel .data-refresh');
    await page.waitForFunction(()=>document.querySelector('#opportunitiesPanel').getAttribute('aria-busy')==='false'&&!document.querySelector('#opportunitiesPanel .data-error'));
    console.log('PASS HTTP error state, retained data and successful retry');
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(reports,null,2));
    assert(reports.every(r=>r.jsErrors.length===0),'Browser runtime errors: see report.json');
    assert(reports.every(r=>r.scroll<=r.width+2 && !r.clipped.length),'Responsive overflow: see report.json');
    console.log('PASS authenticated GUI, desktop/mobile, vertical scrolling, themes, navigation; screenshots: '+output);
  } finally {
    if(browser)await browser.close();
    server.closeAllConnections(); await new Promise(resolve=>server.close(resolve));
  }
}
run().catch(error=>{console.error(error.message);process.exitCode=1});
