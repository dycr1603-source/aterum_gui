"use strict";
// Reuse the production n8n pure planner verbatim. Fail if its source boundary changes.
// Never execute the workflow's network or order-management section in research.
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const source = fs.readFileSync(
  path.join(
    __dirname,
    "../../bot-control/workflows/code/trailing-manager-profit.js",
  ),
  "utf8",
);
const start = source.indexOf("const FEE_RATE_PER_SIDE"),
  end = source.indexOf("\nfunction nextMilestoneText");
if (start < 0 || end < start) throw Error("TRAILING_PLANNER_SOURCE_CHANGED");
const planner = vm.runInNewContext(
  `(()=>{${source.slice(start, end)};return planProtection;})()`,
  Object.freeze({}),
  { timeout: 1000 },
);
module.exports = { planProtection: planner };
