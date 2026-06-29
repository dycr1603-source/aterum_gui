'use strict';

const { execFile } = require('child_process');

function sqliteJson(database, sql) {
  return new Promise((resolve, reject) => {
    execFile('sqlite3', ['-readonly', '-json', database, sql], { timeout: 5000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return reject(error);
      try { resolve(stdout.trim() ? JSON.parse(stdout) : []); }
      catch (parseError) { reject(parseError); }
    });
  });
}

async function recentExecutionErrors(config, limit = 8) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 8));
  return sqliteJson(config.n8nDatabase, `SELECT e.id,w.name AS workflow,e.status,e.startedAt,e.stoppedAt
    FROM execution_entity e
    LEFT JOIN workflow_entity w ON w.id=e.workflowId
    WHERE e.status IN ('error','crashed','canceled')
    ORDER BY e.startedAt DESC LIMIT ${safeLimit}`);
}

async function workflowMetadata(config) {
  if (!config.tradingWorkflowId) return null;
  const escaped = String(config.tradingWorkflowId).replace(/'/g, "''");
  const rows = await sqliteJson(config.n8nDatabase, `SELECT w.name,w.active,COUNT(e.id) AS executions,MAX(e.startedAt) AS last_execution
    FROM workflow_entity w LEFT JOIN execution_entity e ON e.workflowId=w.id
    WHERE w.id='${escaped}' GROUP BY w.id,w.name,w.active LIMIT 1`);
  return rows[0] || null;
}

module.exports = { recentExecutionErrors, workflowMetadata };
