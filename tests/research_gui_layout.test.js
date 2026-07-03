'use strict';

const assert = require('assert');
const { getResearchHTML } = require('../views/research');

const html = getResearchHTML({ username: 'test' });

for (const panel of ['overview', 'engine', 'reports', 'changes']) {
  assert(html.includes(`data-target="${panel}"`), `missing ${panel} navigation tab`);
  assert(html.includes(`data-panel="${panel}"`), `missing ${panel} content panel`);
}
assert(html.includes('function setResearchPanel(panel)'), 'panel controller is missing');
assert(html.includes('.table-wrap{overflow:auto;max-height:390px'), 'tables must use internal scrolling');
assert(html.includes('.report-text{white-space:pre-wrap;max-height:460px;overflow:auto'), 'report must use internal scrolling');
assert(html.includes('position:sticky;top:10px'), 'section navigation must remain visible');

console.log('research gui layout tests: ok');
