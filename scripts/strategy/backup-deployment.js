"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
function backup() {
  fs.mkdirSync(path.join(root, ".local"), { recursive: true, mode: 0o700 });
  const tag =
      "aterum-dashboard:before-strategy-" +
      new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14),
    dir = fs.mkdtempSync(path.join(root, ".local/strategy-backup-"));
  fs.chmodSync(dir, 0o700);
  const run = (args) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  // Preserve the container's image, including when stopped or :local was rebuilt.
  const image = run([
    "inspect",
    "--format",
    "{{.Image}}",
    "aterum-dashboard-1",
  ]).trim();
  run(["tag", image, tag]);
  for (const name of [".env", "docker-compose.yml", "config/strategy-v2.json"])
    if (fs.existsSync(path.join(root, name))) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.copyFileSync(path.join(root, name), path.join(dir, name));
      fs.chmodSync(path.join(dir, name), 0o600);
    }
  const rows = JSON.parse(
    run([
      "run",
      "--rm",
      "--network",
      "none",
      "--volumes-from",
      "aterum-dashboard-1:ro",
      "--entrypoint",
      "sqlite3",
      image,
      "-readonly",
      "-json",
      "/n8n-data/database.sqlite",
      "SELECT w.id,w.name,COALESCE(h.nodes,w.nodes) AS nodes,COALESCE(h.connections,w.connections) AS connections,w.settings FROM workflow_entity w LEFT JOIN workflow_history h ON h.workflowId=w.id AND h.versionId=w.activeVersionId WHERE w.id='Cz4TfvaVAygWGRJm'",
    ]),
  );
  if (rows.length !== 1) throw Error("LIVE_MAIN_WORKFLOW_NOT_FOUND");
  const row = rows[0],
    w = {
      ...row,
      active: false,
      nodes: JSON.parse(row.nodes),
      connections: JSON.parse(row.connections),
      settings: JSON.parse(row.settings),
    };
  fs.writeFileSync(
    path.join(dir, "main.workflow.json"),
    JSON.stringify([w], null, 2),
    { mode: 0o600 },
  );
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        image: tag,
        originalImageId: image,
        createdAt: new Date().toISOString(),
        mainWorkflowId: w.id,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  fs.writeFileSync(path.join(root, ".local/strategy-last-backup"), dir + "\n", {
    mode: 0o600,
  });
  console.log("Backup:", dir);
  console.log("Rollback image:", tag);
}
if (require.main === module) backup();
module.exports = { backup };
