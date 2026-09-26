'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { pages } = require('./preview-gui');
let count = 0;
for(const file of ['routes/account.js','routes/aidata.js','services/account_snapshot.js','services/simulator.js','shared.js'])new vm.Script(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{filename:file});
for (const [route, render] of Object.entries(pages)) {
  const html = render({ username: 'GUI validation' });
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc=/.test(match[1]) || !match[2].trim()) continue;
    new vm.Script(match[2], { filename: route + ':inline-' + (++count) });
  }
  console.log('PASS rendered JavaScript: ' + route);
}
new vm.Script(fs.readFileSync(path.join(__dirname, '../assets/gui.js'), 'utf8'), { filename: 'assets/gui.js' });
console.log('Validated ' + count + ' inline scripts and shared assets. Server-rendered GUI needs no bundle.');
