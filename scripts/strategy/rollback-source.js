"use strict";
// Restores only the entry workflow source and configuration. Does not overwrite
// the n8n volume, current stops, trade database, or management workflow state.
const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."),
  dir = fs
    .readFileSync(path.join(root, ".local/strategy-last-backup"), "utf8")
    .trim();
if (!path.resolve(dir).startsWith(path.join(root, ".local") + path.sep))
  throw Error("INVALID_BACKUP_PATH");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json")));
fs.copyFileSync(
  path.join(dir, "main.workflow.json"),
  path.join(
    root,
    "bot-control/workflows/current/advanced-ai-trading-bot-v2-clean.workflow.json",
  ),
);
for (const name of [".env", "config/strategy-v2.json"])
  if (fs.existsSync(path.join(dir, name)))
    fs.copyFileSync(path.join(dir, name), path.join(root, name));
execFileSync("docker", ["tag", manifest.image, "aterum-dashboard:local"], {
  stdio: "inherit",
});
console.log(
  "Prior entry graph, environment and image tag restored. Run the documented offline workflow sync and service recreation.",
);
