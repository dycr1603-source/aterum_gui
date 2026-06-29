'use strict';

const mysql = require('mysql2/promise');

class AuditStore {
  constructor(config) {
    this.pool = mysql.createPool(config.db);
  }

  async initialize() {
    await this.pool.execute(`CREATE TABLE IF NOT EXISTS telegram_audit (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      update_id BIGINT NULL,
      user_id BIGINT NULL,
      username VARCHAR(255) NULL,
      role VARCHAR(16) NULL,
      group_name VARCHAR(255) NULL,
      chat_id BIGINT NOT NULL,
      command VARCHAR(64) NOT NULL,
      response MEDIUMTEXT NULL,
      duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
      result VARCHAR(32) NOT NULL,
      endpoints_used JSON NULL,
      errors TEXT NULL,
      ip VARCHAR(45) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_telegram_audit_update (update_id),
      INDEX idx_telegram_audit_chat_date (chat_id, created_at),
      INDEX idx_telegram_audit_result_date (result, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const auditColumns = [
      `ALTER TABLE telegram_audit ADD COLUMN IF NOT EXISTS role VARCHAR(16) NULL AFTER username`,
      `ALTER TABLE telegram_audit ADD COLUMN IF NOT EXISTS group_name VARCHAR(255) NULL AFTER role`,
      `ALTER TABLE telegram_audit ADD COLUMN IF NOT EXISTS endpoints_used JSON NULL AFTER result`,
      `ALTER TABLE telegram_audit ADD COLUMN IF NOT EXISTS errors TEXT NULL AFTER endpoints_used`
    ];
    for (const sql of auditColumns) await this.pool.execute(sql);
    await this.pool.execute(`CREATE TABLE IF NOT EXISTS telegram_users (
      telegram_id BIGINT PRIMARY KEY,
      username VARCHAR(255) NULL,
      first_name VARCHAR(255) NULL,
      role ENUM('viewer','moderator','admin') NOT NULL DEFAULT 'viewer',
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_telegram_users_role_enabled (role,enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await this.pool.execute(`CREATE TABLE IF NOT EXISTS telegram_ai_usage (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NULL,
      question_hash CHAR(64) NOT NULL,
      route ENUM('local','knowledge','cache','claude') NOT NULL,
      estimated_tokens INT UNSIGNED NOT NULL DEFAULT 0,
      input_tokens INT UNSIGNED NOT NULL DEFAULT 0,
      output_tokens INT UNSIGNED NOT NULL DEFAULT 0,
      saved_tokens INT UNSIGNED NOT NULL DEFAULT 0,
      duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
      cache_hit TINYINT(1) NOT NULL DEFAULT 0,
      model VARCHAR(100) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_telegram_ai_usage_created (created_at),
      INDEX idx_telegram_ai_usage_route_created (route,created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await this.pool.execute(`CREATE TABLE IF NOT EXISTS telegram_ai_cache (
      question_hash CHAR(64) PRIMARY KEY,
      normalized_question TEXT NOT NULL,
      response MEDIUMTEXT NOT NULL,
      model VARCHAR(100) NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_telegram_ai_cache_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  async bootstrapAdmins(ids) {
    for (const id of ids || []) {
      if (!/^\d+$/.test(String(id))) continue;
      await this.pool.execute(`INSERT INTO telegram_users (telegram_id,role,enabled)
        VALUES (?,'admin',1)
        ON DUPLICATE KEY UPDATE role='admin',enabled=1`, [id]);
    }
  }

  async getOrCreateUser(actor) {
    await this.pool.execute(`INSERT INTO telegram_users (telegram_id,username,first_name,role,enabled)
      VALUES (?,?,?,'viewer',1)
      ON DUPLICATE KEY UPDATE username=VALUES(username),first_name=VALUES(first_name)`, [
      actor.userId, actor.username || null, actor.firstName || null
    ]);
    const [rows] = await this.pool.execute(`SELECT * FROM telegram_users WHERE telegram_id=? LIMIT 1`, [actor.userId]);
    return rows?.[0] || null;
  }

  async listUsers(limit = 30) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
    const [rows] = await this.pool.query(`SELECT telegram_id,username,first_name,role,enabled,created_at,updated_at
      FROM telegram_users ORDER BY FIELD(role,'admin','moderator','viewer'),enabled DESC,updated_at DESC LIMIT ?`, [safeLimit]);
    return rows || [];
  }

  async setRole(telegramId, role) {
    if (!['viewer', 'moderator', 'admin'].includes(role)) throw new Error('Invalid role');
    const [result] = await this.pool.execute(`UPDATE telegram_users SET role=? WHERE telegram_id=?`, [role, telegramId]);
    return result.affectedRows > 0;
  }

  async setEnabled(telegramId, enabled) {
    const [result] = await this.pool.execute(`UPDATE telegram_users SET enabled=? WHERE telegram_id=?`, [enabled ? 1 : 0, telegramId]);
    return result.affectedRows > 0;
  }

  async record(entry) {
    await this.pool.execute(`INSERT INTO telegram_audit
      (update_id,user_id,username,role,group_name,chat_id,command,response,duration_ms,result,endpoints_used,errors,ip)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE response=VALUES(response),duration_ms=VALUES(duration_ms),result=VALUES(result),
        role=VALUES(role),group_name=VALUES(group_name),endpoints_used=VALUES(endpoints_used),errors=VALUES(errors)`, [
      entry.updateId ?? null,
      entry.userId ?? null,
      entry.username || null,
      entry.role || null,
      entry.groupName || null,
      entry.chatId,
      String(entry.command || 'unknown').slice(0, 64),
      String(entry.response || '').slice(0, 30000),
      Math.max(0, Math.round(entry.durationMs || 0)),
      String(entry.result || 'ok').slice(0, 32),
      JSON.stringify(entry.endpointsUsed || []),
      entry.errors ? String(entry.errors).slice(0, 10000) : null,
      entry.ip || null
    ]);
  }

  async lastUpdateId() {
    const [rows] = await this.pool.execute(`SELECT MAX(update_id) AS id FROM telegram_audit`);
    return Number(rows?.[0]?.id || 0);
  }

  async ping() {
    const started = Date.now();
    await this.pool.query('SELECT 1');
    return Date.now() - started;
  }

  async operationalEvents() {
    const [research, learning, rejections] = await Promise.all([
      this.pool.execute(`SELECT report_type,model,created_at FROM research_reports ORDER BY created_at DESC LIMIT 3`).then(([rows]) => rows).catch(() => []),
      this.pool.execute(`SELECT run_type,rules_active,rules_monitoring,created_at FROM learning_runs ORDER BY created_at DESC LIMIT 3`).then(([rows]) => rows).catch(() => []),
      this.pool.execute(`SELECT symbol,skip_reason,rejected_at FROM trade_rejections ORDER BY rejected_at DESC LIMIT 5`).then(([rows]) => rows).catch(() => [])
    ]);
    return { research, learning, rejections };
  }

  async latestScans(limit = 10) {
    const safeLimit = Math.max(1, Math.min(30, Number(limit) || 10));
    const [rows] = await this.pool.query(`SELECT symbol,scan_score,direction,final_score,pass_ai,skip_reason,scanned_at
      FROM scan_events ORDER BY scanned_at DESC LIMIT ?`, [safeLimit]);
    return rows || [];
  }

  async recordAiUsage(entry) {
    await this.pool.execute(`INSERT INTO telegram_ai_usage
      (user_id,question_hash,route,estimated_tokens,input_tokens,output_tokens,saved_tokens,duration_ms,cache_hit,model)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [
      entry.userId || null, entry.questionHash, entry.route,
      Math.max(0, Math.round(entry.estimatedTokens || 0)),
      Math.max(0, Math.round(entry.inputTokens || 0)),
      Math.max(0, Math.round(entry.outputTokens || 0)),
      Math.max(0, Math.round(entry.savedTokens || 0)),
      Math.max(0, Math.round(entry.durationMs || 0)), entry.cacheHit ? 1 : 0, entry.model || null
    ]);
  }

  async recordLocalRoute(userId, command, durationMs, response) {
    const crypto = require('crypto');
    const questionHash = crypto.createHash('sha256').update(`command:${command}`).digest('hex');
    const estimatedTokens = Math.max(100, Math.ceil((String(response || '').length + 3000) / 4));
    return this.recordAiUsage({ userId, questionHash, route: 'local', estimatedTokens, savedTokens: estimatedTokens, durationMs });
  }

  async getAiCache(questionHash) {
    const [rows] = await this.pool.execute(`SELECT response,model FROM telegram_ai_cache
      WHERE question_hash=? AND expires_at > UTC_TIMESTAMP() LIMIT 1`, [questionHash]);
    return rows?.[0] || null;
  }

  async setAiCache(questionHash, question, response, model, ttlSeconds) {
    const seconds = Math.max(30, Math.round(ttlSeconds || 300));
    await this.pool.execute(`INSERT INTO telegram_ai_cache
      (question_hash,normalized_question,response,model,expires_at)
      VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND))
      ON DUPLICATE KEY UPDATE normalized_question=VALUES(normalized_question),response=VALUES(response),
        model=VALUES(model),expires_at=VALUES(expires_at),updated_at=UTC_TIMESTAMP()`,
    [questionHash, String(question).slice(0, 4000), String(response).slice(0, 30000), model || null, seconds]);
  }

  async aiStats(days = 30) {
    const safeDays = Math.max(1, Math.min(365, Number(days) || 30));
    const [rows] = await this.pool.query(`SELECT
      COUNT(*) total,
      SUM(route='local') local_count,
      SUM(route='knowledge') knowledge_count,
      SUM(route='cache') cache_count,
      SUM(route='claude') claude_count,
      COALESCE(SUM(input_tokens + output_tokens),0) actual_tokens,
      COALESCE(SUM(saved_tokens),0) saved_tokens,
      COALESCE(AVG(duration_ms),0) avg_duration_ms
      FROM telegram_ai_usage WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(),INTERVAL ? DAY)`, [safeDays]);
    return rows?.[0] || {};
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { AuditStore };
