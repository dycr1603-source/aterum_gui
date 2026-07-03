'use strict';

// Fase 1 del rediseño del Portfolio Manager: Efficiency Gate.
// Reemplaza el nodo "Position Sizer" del workflow principal para que, cuando
// los clamps de portfolio comprimen una posicion por debajo de un ratio de
// realizacion razonable, el sistema pruebe el siguiente candidato del
// opportunityRanking en vez de ejecutar un trade irrelevante. Ver
// docs/trading/README.md y CHANGELOG para contexto de la auditoria que motivo
// este cambio (XPLUSDT/NEARUSDT/ZECUSDT abiertos con $1-5 de margen).

const fs = require('fs');
const path = require('path');

const workflowFile = path.resolve(__dirname, '../bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json');
const codeFile = path.resolve(__dirname, '../bot-control/workflows/code/position-sizer-v1-efficiency-gate.js');

const root = JSON.parse(fs.readFileSync(workflowFile, 'utf8'));
const workflow = Array.isArray(root) ? root[0] : root;
const wrapper = Array.isArray(root);

const node = workflow.nodes.find(item => item.name === 'Position Sizer');
if (!node) throw new Error('Position Sizer node not found');

const newCode = fs.readFileSync(codeFile, 'utf8').trim();
if (!newCode.includes('SIZE_REALIZATION_TOO_LOW')) throw new Error('new Position Sizer code missing efficiency gate marker');

node.parameters.jsCode = newCode;

fs.writeFileSync(workflowFile, JSON.stringify(wrapper ? [workflow] : workflow, null, 2) + '\n');
console.log('Position Sizer updated with Efficiency Gate (SIZE_REALIZATION_TOO_LOW).');
