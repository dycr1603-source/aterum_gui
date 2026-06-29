'use strict';

class ApiClient {
  constructor(config) {
    this.config = config;
    this.trace = [];
  }

  startTrace() { this.trace = []; }
  consumeTrace() { const trace = [...this.trace]; this.trace = []; return trace; }

  async get(base, path, timeoutMs = this.config.requestTimeoutMs) {
    this.trace.push(`${base === this.config.n8nBase ? 'n8n' : 'dashboard'}:${path}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(base + path, {
        signal: controller.signal,
        headers: { 'user-agent': 'aterum-telegram-control/1.0' }
      });
      const text = await response.text();
      let body = {};
      try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { text }; }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.error || text.slice(0, 160)}`);
      return { body, ms: Date.now() - started, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  }

  dashboard(path) { return this.get(this.config.dashboardBase, path).then(result => result.body); }
  dashboardProbe(path = '/healthz') { return this.get(this.config.dashboardBase, path); }
  n8nProbe(path = '/healthz') { return this.get(this.config.n8nBase, path); }

  dashboardState() { return this.dashboard('/api/dashboard/state'); }
  stats() { return this.dashboard('/db/stats'); }
  researchSummary() { return this.dashboard('/api/research/summary'); }
  latestReport() { return this.dashboard('/api/research/reports/latest'); }
  recommendationsPerformance() { return this.dashboard('/api/research/recommendations/performance'); }
  recommendations(limit = 8) { return this.dashboard(`/api/research/recommendations?limit=${limit}`); }
  learningSummary() { return this.dashboard('/api/learning/summary'); }
  learningChangesSummary() { return this.dashboard('/api/learning/changes/summary'); }
  learningChanges(limit = 8) { return this.dashboard(`/api/learning/changes?limit=${limit}`); }
  learningDecisions(limit = 100) { return this.dashboard(`/api/learning/decisions?limit=${limit}`); }
  learningRules() { return this.dashboard('/api/learning/rules'); }
  aiData(limit = 100, period = 90) { return this.dashboard(`/db/ai-data?limit=${limit}&period=${period}`); }
  intelligence() { return this.dashboard('/api/intelligence/summary?page=aidata'); }
  simulatorReport() { return this.dashboard('/api/simulator/report'); }
}

module.exports = { ApiClient };
