/**
 * lib/alerts.js — pure alert evaluation engine.
 *
 * Zero I/O. Zero clock access. `now` is always passed in.
 * Every function is deterministic and 100% unit-testable.
 *
 * Public API:
 *   ALERT_KEYS           — frozen list of supported alert keys
 *   DEFAULT_THRESHOLDS   — defaults to seed the alert_thresholds table
 *   evaluateAll(state)   — returns array of fired-alert descriptions
 *   evaluateOne(key, state) — evaluate a single rule (used by tests)
 *
 * Each evaluator returns either `null` (no alert) or an object:
 *   { key, severity, body, agentEmail?, data }
 *
 * The runner (server.js) is responsible for:
 *   • cooldown checks against alert_events
 *   • persistence into alert_events
 *   • broadcast via SSE
 *   • snooze/ack state (queried before evaluation)
 */
'use strict';

// ─── Constants ──────────────────────────────────────────────────────────
const ALERT_KEYS = Object.freeze([
  'abandonment_spike',
  'stuck_call',
  'queue_backup',
  'long_aux',
  'coverage_gap'
]);

const SEVERITIES = Object.freeze(['info', 'warning', 'critical']);

const DEFAULT_THRESHOLDS = Object.freeze({
  abandonment_spike: {
    enabled: 1,
    severity: 'critical',
    cooldown_seconds: 600,         // 10 min between identical alerts
    threshold: {
      ratePercent: 15,             // % of calls abandoned
      minCalls: 5,                 // ignore until at least 5 calls in window
      windowMinutes: 15
    }
  },
  stuck_call: {
    enabled: 1,
    severity: 'warning',
    cooldown_seconds: 300,
    threshold: {
      callMinutes: 18              // a single call > 18 min
    }
  },
  queue_backup: {
    enabled: 1,
    severity: 'critical',
    cooldown_seconds: 600,
    threshold: {
      callers: 5,                  // ≥ N callers waiting
      sustainedMinutes: 3          // for ≥ Y minutes
    }
  },
  long_aux: {
    enabled: 1,
    severity: 'warning',
    cooldown_seconds: 600,
    threshold: {
      auxMinutes: 25,              // agent in away/break/training/qa > 25 min
      // States we consider "AUX" — non-call non-available states
      auxStates: ['BRB', 'BREAK', 'TRAINING', 'QA_AUX', 'INTERNAL_CALL']
    }
  },
  coverage_gap: {
    enabled: 1,
    severity: 'critical',
    cooldown_seconds: 600,
    threshold: {
      sustainedMinutes: 2,         // 0 available for ≥ X min
      // Business hours window when this rule applies (24h CST)
      businessHours: { startHour: 9, endHour: 17 },
      // Timezone offset minutes (CST is UTC-6)
      // Caller passes `nowHourCST` in state — we use that
    }
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────
function safeNum(x, def) {
  const n = Number(x);
  return Number.isFinite(n) ? n : def;
}

function fmtMinSec(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

// ─── Individual evaluators ──────────────────────────────────────────────

/**
 * Returns alert if abandonment rate in the last `windowMinutes` exceeds
 * the threshold (and there are enough calls to be meaningful).
 *
 * state.callsLast15Min: array of {abandoned: boolean, ...}
 */
function evalAbandonmentSpike(state, cfg) {
  const t = (cfg && cfg.threshold) || {};
  const ratePct = safeNum(t.ratePercent, 15);
  const minCalls = safeNum(t.minCalls, 5);

  const calls = Array.isArray(state.callsLast15Min) ? state.callsLast15Min : [];
  if (calls.length < minCalls) return null;

  const abandoned = calls.filter(c => c && c.abandoned).length;
  const actualPct = (abandoned / calls.length) * 100;
  if (actualPct < ratePct) return null;

  return {
    key: 'abandonment_spike',
    severity: cfg.severity || 'critical',
    body: 'Abandonment rate is ' + actualPct.toFixed(1) + '% (' + abandoned + '/' + calls.length + ' calls). Threshold: ' + ratePct + '%.',
    data: { actualPct: Number(actualPct.toFixed(1)), abandoned, total: calls.length, threshold: ratePct }
  };
}

/**
 * Returns alert if any agent has been on a single call longer than threshold.
 * Fires ONE alert per stuck agent (the runner can choose which to broadcast).
 *
 * state.agents: array of {email, name, status, currentCallStartedAt}
 * state.now: epoch ms
 */
function evalStuckCall(state, cfg) {
  const t = (cfg && cfg.threshold) || {};
  const limitMs = safeNum(t.callMinutes, 18) * 60 * 1000;

  const agents = Array.isArray(state.agents) ? state.agents : [];
  const now = safeNum(state.now, 0);
  const stuck = [];
  for (const a of agents) {
    if (!a) continue;
    const status = String(a.status || '').toLowerCase();
    if (!/oncall|incall|busy/.test(status)) continue;
    const started = safeNum(a.currentCallStartedAt, 0);
    if (!started) continue;
    const elapsedMs = now - started;
    if (elapsedMs >= limitMs) {
      stuck.push({ agent: a, elapsedMs });
    }
  }
  if (!stuck.length) return null;
  // Report the longest one
  stuck.sort((x, y) => y.elapsedMs - x.elapsedMs);
  const top = stuck[0];
  return {
    key: 'stuck_call',
    severity: cfg.severity || 'warning',
    body: (top.agent.name || top.agent.email || 'An agent') + ' has been on a call for ' + fmtMinSec(top.elapsedMs) + '.',
    agentEmail: top.agent.email,
    data: {
      elapsedMs: top.elapsedMs,
      thresholdMs: limitMs,
      allStuck: stuck.map(s => ({ email: s.agent.email, name: s.agent.name, elapsedMs: s.elapsedMs }))
    }
  };
}

/**
 * Returns alert if queue depth ≥ threshold has been sustained for ≥ window.
 *
 * state.queueDepth: { current: N, sinceMs: epoch_ms_when_reached_current_level }
 */
function evalQueueBackup(state, cfg) {
  const t = (cfg && cfg.threshold) || {};
  const callerThreshold = safeNum(t.callers, 5);
  const sustainedMs = safeNum(t.sustainedMinutes, 3) * 60 * 1000;

  const q = state.queueDepth;
  if (!q || typeof q !== 'object') return null;

  const current = safeNum(q.current, 0);
  if (current < callerThreshold) return null;

  const sinceMs = safeNum(q.sinceMs, 0);
  if (!sinceMs) return null;

  const now = safeNum(state.now, 0);
  const sustainedFor = now - sinceMs;
  if (sustainedFor < sustainedMs) return null;

  return {
    key: 'queue_backup',
    severity: cfg.severity || 'critical',
    body: current + ' callers have been waiting for ' + fmtMinSec(sustainedFor) + '. Threshold: ' + callerThreshold + ' callers, ' + (sustainedMs / 60000) + ' min.',
    data: { currentDepth: current, sustainedMs: sustainedFor, threshold: callerThreshold }
  };
}

/**
 * Returns alert if any agent has been in an AUX state longer than threshold.
 *
 * state.agents: array of {email, name, status, sinceMs}
 *   `status` matches one of cfg.threshold.auxStates (case-insensitive)
 */
function evalLongAux(state, cfg) {
  const t = (cfg && cfg.threshold) || {};
  const limitMs = safeNum(t.auxMinutes, 25) * 60 * 1000;
  const auxStates = Array.isArray(t.auxStates) ? t.auxStates.map(s => String(s).toUpperCase()) : ['BRB', 'BREAK'];

  const agents = Array.isArray(state.agents) ? state.agents : [];
  const now = safeNum(state.now, 0);
  const longAux = [];

  for (const a of agents) {
    if (!a) continue;
    const status = String(a.status || '').toUpperCase();
    if (!auxStates.includes(status)) continue;
    const sinceMs = safeNum(a.sinceMs, 0);
    if (!sinceMs) continue;
    const elapsedMs = now - sinceMs;
    if (elapsedMs >= limitMs) {
      longAux.push({ agent: a, elapsedMs, status });
    }
  }
  if (!longAux.length) return null;
  longAux.sort((x, y) => y.elapsedMs - x.elapsedMs);
  const top = longAux[0];
  return {
    key: 'long_aux',
    severity: cfg.severity || 'warning',
    body: (top.agent.name || top.agent.email || 'An agent') + ' has been in ' + top.status + ' for ' + fmtMinSec(top.elapsedMs) + '.',
    agentEmail: top.agent.email,
    data: {
      elapsedMs: top.elapsedMs,
      thresholdMs: limitMs,
      status: top.status,
      allLong: longAux.map(s => ({ email: s.agent.email, name: s.agent.name, status: s.status, elapsedMs: s.elapsedMs }))
    }
  };
}

/**
 * Returns alert if all agents are unavailable during business hours.
 *
 * state.agents: array of {status, ...}
 * state.coverage: { zeroAvailableSinceMs: epoch_ms_when_count_dropped_to_zero }
 * state.nowHourCST: integer 0-23, the current hour in business timezone
 */
function evalCoverageGap(state, cfg) {
  const t = (cfg && cfg.threshold) || {};
  const sustainedMs = safeNum(t.sustainedMinutes, 2) * 60 * 1000;
  const bh = t.businessHours || { startHour: 9, endHour: 17 };
  const startHour = safeNum(bh.startHour, 9);
  const endHour = safeNum(bh.endHour, 17);

  const hour = safeNum(state.nowHourCST, -1);
  if (hour < 0) return null;
  if (hour < startHour || hour >= endHour) return null;  // outside business hours

  const agents = Array.isArray(state.agents) ? state.agents : [];
  // Available means status is "Available" / "available"
  const available = agents.filter(a => {
    if (!a) return false;
    const s = String(a.status || '').toLowerCase();
    return s === 'available' || s === 'avail';
  });
  if (available.length > 0) return null;

  const cov = state.coverage;
  if (!cov || !cov.zeroAvailableSinceMs) return null;

  const sustainedFor = safeNum(state.now, 0) - safeNum(cov.zeroAvailableSinceMs, 0);
  if (sustainedFor < sustainedMs) return null;

  return {
    key: 'coverage_gap',
    severity: cfg.severity || 'critical',
    body: 'No agents available for ' + fmtMinSec(sustainedFor) + ' during business hours.',
    data: { sustainedMs: sustainedFor, hour, totalAgents: agents.length }
  };
}

const EVALUATORS = {
  abandonment_spike: evalAbandonmentSpike,
  stuck_call: evalStuckCall,
  queue_backup: evalQueueBackup,
  long_aux: evalLongAux,
  coverage_gap: evalCoverageGap
};

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Evaluate a single named alert. Returns the alert object or null.
 * Never throws. Returns null on missing key, missing config, or any error.
 */
function evaluateOne(key, state) {
  try {
    if (!state || typeof state !== 'object') return null;
    const fn = EVALUATORS[key];
    if (!fn) return null;
    const cfg = (state.thresholds || {})[key];
    if (!cfg || !cfg.enabled) return null;
    return fn(state, cfg) || null;
  } catch (e) {
    // Engine never throws — log via caller's logger
    return { key, severity: 'info', body: 'Alert evaluator error: ' + e.message, data: { error: true, message: e.message } };
  }
}

/**
 * Run every enabled evaluator. Returns array of alert objects (possibly empty).
 *
 * The runner is responsible for cooldown / persistence — this function is
 * stateless and just answers "what alerts SHOULD fire given this snapshot?"
 */
function evaluateAll(state) {
  if (!state || typeof state !== 'object') return [];
  const out = [];
  for (const key of ALERT_KEYS) {
    const r = evaluateOne(key, state);
    if (r) out.push(r);
  }
  return out;
}

module.exports = {
  ALERT_KEYS,
  SEVERITIES,
  DEFAULT_THRESHOLDS,
  evaluateAll,
  evaluateOne,
  // Exported for unit testing — not part of stable API
  _internal: { fmtMinSec, EVALUATORS }
};
