"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../.."),
  file = path.join(
    root,
    "bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json",
  );
function integrate() {
  const raw = JSON.parse(fs.readFileSync(file)),
    w = Array.isArray(raw) ? raw[0] : raw,
    code = (name) =>
      fs
        .readFileSync(
          path.join(root, "bot-control/workflows/code", name),
          "utf8",
        )
        .trimEnd();
  const mode = {
    parameters: { jsCode: code("strategy-mode.js") },
    id: "strategy-mode-v1",
    name: "Strategy Mode",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [-1300, 0],
  };
  const decision = {
    parameters: { jsCode: code("strategy-decision.js") },
    id: "strategy-decision-v1",
    name: "Two Indicator Decision",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [-800, -300],
  };
  const scanReport = {
    parameters: { jsCode: code("strategy-no-trade.js") },
    id: "strategy-no-trade-v1",
    name: "Strategy Scan Report",
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [-300, -100],
  };
  const branch = JSON.parse(
    JSON.stringify(w.nodes.find((n) => n.name === "If: AI Approves")),
  );
  Object.assign(branch, {
    id: "strategy-route-v1",
    name: "If: Two Indicator Engine",
    position: [-1050, 0],
  });
  branch.parameters.conditions.conditions[0].leftValue =
    "={{ $json.strategyV2 }}";
  branch.parameters.conditions.conditions[0].id = "strategy-v2-condition";
  const approved = JSON.parse(
    JSON.stringify(w.nodes.find((n) => n.name === "If: AI Approves")),
  );
  Object.assign(approved, {
    id: "strategy-approved-v1",
    name: "If: Strategy Approved",
    position: [-550, -300],
  });
  for (const n of [mode, branch, decision, approved, scanReport]) {
    const i = w.nodes.findIndex((x) => x.id === n.id);
    if (i >= 0) w.nodes[i] = n;
    else w.nodes.push(n);
  }
  w.nodes = w.nodes.filter(
    (n, i, all) => all.findIndex((x) => x.id === n.id) === i,
  );
  delete w.connections["Strategy No Trade"];
  const edge = (node) => ({ node, type: "main", index: 0 });
  w.connections["Main Schedule"] = { main: [[edge("Strategy Mode")]] };
  w.connections["Strategy Mode"] = {
    main: [[edge("If: Two Indicator Engine")]],
  };
  w.connections["If: Two Indicator Engine"] = {
    main: [[edge("Two Indicator Decision")], [edge("Risk Guard")]],
  };
  w.connections["Two Indicator Decision"] = {
    main: [[edge("If: Strategy Approved")]],
  };
  w.connections["If: Strategy Approved"] = {
    main: [[edge("Position Sizer")], [edge("Strategy Scan Report")]],
  };
  delete w.connections["Telegram: Trade Opened"];
  w.connections["Strategy Scan Report"] = { main: [[]] };
  // New path already has cost-aware sizing from JEV + Risk Engine. Legacy branch
  // remains rollback-only and is never evaluated by the new path.
  const sizer = w.nodes.find((n) => n.name === "Position Sizer");
  const prefix =
    "if ($input.first().json.strategyV2 === true) return [$input.first()];\n";
  if (!sizer.parameters.jsCode.startsWith(prefix))
    sizer.parameters.jsCode = prefix + sizer.parameters.jsCode;
  const execute = w.nodes.find((n) => n.name === "Execute Trade");
  if (!execute.parameters.jsCode.includes("strategyRisk:d.jev"))
    execute.parameters.jsCode = execute.parameters.jsCode.replace(
      "tradeContext:{",
      "tradeContext:{\n        strategy:d.strategy||null,strategyRisk:d.jev?.risk||null,strategyConfidence:d.jev?.confidence??null,",
    );
  w.nodes.find((n) => n.name === "Build Trade Alert").parameters.jsCode = code(
    "build-verified-open-notification-v1.js",
  );
  const text = JSON.stringify(raw, null, 2) + "\n";
  fs.writeFileSync(file, text);
  console.log(
    "Integrated strategy route:",
    createHash("sha256").update(text).digest("hex"),
  );
}
if (require.main === module) integrate();
module.exports = { integrate };
