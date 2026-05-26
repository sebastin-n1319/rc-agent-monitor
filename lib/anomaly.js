/**
 * lib/anomaly.js — pure anomaly detection engine.
 *
 * Zero I/O. Zero clock access. Every input is explicit.
 * Uses median + MAD-based modified z-score (robust to outliers).
 *
 * Public API:
 *   METRICS                  — frozen list of supported metric keys
 *   DEFAULT_THRESHOLDS       — admin-tunable defaults to seed the DB
 *   median(values)           — exposed for tests; null on empty
 *   medianAbsoluteDeviation(values, m?)  — MAD; null on empty
 *   modifiedZScore(value, median, mad)   — 0.6745 * (x - m) / MAD
 *   evaluateMetric({metric, history, todayValue, config})
 *     → null OR { metric, todayValue, baselineMedian, baselineMad,
 *                  modifiedZ, direction, severity }
 *   evaluateAgentDay(...)    — runs every enabled metric for an agent on a date
 *   evaluateBulk(historyByAgent, todayByAgent, configs)
 *
 * All evaluators return null when:
 *   • config.enabled is false
 *   • history has fewer than `min_history_days` non-zero values
 *   • MAD is 0 (cannot divide)
 *   • todayValue is null/undefined/NaN
 *
 * None of these conditions throw.
 */
'use strict';

// ─── Constants ──────────────────────────────────────────────────────────
const METRICS = Object.freeze([
  'daily_live_minutes',
  'daily_call_volume',
  'daily_missed_calls',
  'daily_break_minutes',
  'daily_aht_seconds'
]);

const DIRECTIONS = Object.freeze(['low', 'high', 'either']);
const SEVERITIES = Object.freeze(['info', 'warning', 'critical']);

// 0.6745 is the scaling constant making MAD-based z comparable to
// regular z under the normal distribution.
const MAD_SCALE = 0.6745;

const DEFAULT_THRESHOLDS = Object.freeze({
  daily_live_minutes: {
    enabled: 1, z_threshold: 3.5, direction: 'low',
    min_history_days: 10, lookback_days: 30
  },
  daily_call_volume: {
    enabled: 1, z_threshold: 3.5, direction: 'either',
    min_history_days: 10, lookback_days: 30
  },
  daily_missed_calls: {
    enabled: 1, z_threshold: 3.5, direction: 'high',
    min_history_days: 10, lookback_days: 30
  },
  daily_break_minutes: {
    enabled: 1, z_threshold: 3.5, direction: 'high',
    min_history_days: 10, lookback_days: 30
  },
  daily_aht_seconds: {
    enabled: 1, z_threshold: 3.5, direction: 'either',
    min_history_days: 10, lookback_days: 30
  }
});

// ─── Pure stat helpers ──────────────────────────────────────────────────

/** Median of a numeric array. Returns null on empty / non-numeric input. */
function median(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const nums = values.filter(v => typeof v === 'number' && Number.isFinite(v));
  if (nums.length === 0) return null;
  const sorted = nums.slice().sort((a, b) => a - b);
  const n = sorted.length;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/**
 * Median Absolute Deviation. Optionally pass a precomputed median.
 * Returns null if the input is empty/invalid.
 */
function medianAbsoluteDeviation(values, m) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const med = (typeof m === 'number' && Number.isFinite(m)) ? m : median(values);
  if (med == null) return null;
  const deviations = values
    .filter(v => typeof v === 'number' && Number.isFinite(v))
    .map(v => Math.abs(v - med));
  return median(deviations);
}

/**
 * Modified z-score. Returns null when MAD is 0 (cannot divide) or any input invalid.
 */
function modifiedZScore(value, med, mad) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (typeof med !== 'number' || !Number.isFinite(med)) return null;
  if (typeof mad !== 'number' || !Number.isFinite(mad) || mad === 0) return null;
  return MAD_SCALE * (value - med) / mad;
}

// ─── Severity classification ────────────────────────────────────────────
/** Derive severity from |z|. Critical at ≥5, warning at ≥3.5, otherwise null. */
function severityForZ(z, threshold) {
  const absZ = Math.abs(z);
  if (absZ < threshold) return null;
  if (absZ >= 5) return 'critical';
  return 'warning';
}

// ─── Single metric evaluation ───────────────────────────────────────────

/**
 * Evaluate one metric for one agent on one day.
 *
 * @param {Object} args
 * @param {string} args.metric        — METRICS key
 * @param {Array<number>} args.history — non-zero baseline values
 * @param {number} args.todayValue    — today's measurement
 * @param {Object} args.config        — { enabled, z_threshold, direction, min_history_days }
 * @returns {Object|null}
 */
function evaluateMetric(args) {
  try {
    if (!args || typeof args !== 'object') return null;
    const { metric, history, todayValue, config } = args;
    if (!metric) return null;
    if (!config || !config.enabled) return null;
    if (typeof todayValue !== 'number' || !Number.isFinite(todayValue)) return null;
    if (!Array.isArray(history)) return null;

    // Filter to non-zero finite numbers — zeros usually mean day off / no data
    const nonZero = history.filter(v => typeof v === 'number' && Number.isFinite(v) && v !== 0);

    const minHistory = Number(config.min_history_days) || 10;
    if (nonZero.length < minHistory) return null;

    const med = median(nonZero);
    let mad = medianAbsoluteDeviation(nonZero, med);
    const threshold = Number(config.z_threshold) || 3.5;
    const direction = (typeof config.direction === 'string') ? config.direction : 'either';

    // MAD = 0 means every baseline value is identical (e.g. always 1 missed
    // call/day). Real-world this DOES happen. A naive divide-by-zero would
    // either crash or silently miss obvious anomalies. We synthesize a
    // "noise floor" MAD: max(0.5, |median|*0.05). That preserves:
    //   - the math (no div by 0)
    //   - the threshold (small drifts still don't fire)
    //   - real detection (a 20x jump from baseline 1 still fires)
    let isFlatBaseline = false;
    if (mad === 0) {
      isFlatBaseline = true;
      mad = Math.max(0.5, Math.abs(med) * 0.05);
    }

    const z = modifiedZScore(todayValue, med, mad);
    if (z == null) return null;

    // Direction filter
    const actualDirection = z > 0 ? 'high' : 'low';
    if (direction !== 'either' && direction !== actualDirection) return null;

    const severity = severityForZ(z, threshold);
    if (!severity) return null;

    return {
      metric,
      todayValue,
      baselineMedian: med,
      baselineMad: isFlatBaseline ? 0 : mad,  // report the real MAD, not synthetic
      modifiedZ: Math.round(z * 1000) / 1000,
      direction: actualDirection,
      severity,
      sampleSize: nonZero.length,
      ...(isFlatBaseline ? { flatBaseline: true } : {})
    };
  } catch (e) {
    // Engine never throws — return null with side-channel error info
    return null;
  }
}

// ─── Per-agent evaluation ───────────────────────────────────────────────

/**
 * Evaluate every enabled metric for a single agent on a single day.
 *
 * @param {Object} agent — { email, isWorkingDay, historyByMetric, todayByMetric }
 * @param {Object} configs — { [metric]: configObject }
 * @returns {Array<Object>} anomaly objects (possibly empty)
 */
function evaluateAgentDay(agent, configs) {
  if (!agent || typeof agent !== 'object') return [];
  if (agent.isWorkingDay === false) return [];   // skip days off
  const history = agent.historyByMetric || {};
  const today = agent.todayByMetric || {};
  const cfg = configs || {};

  const out = [];
  for (const metric of METRICS) {
    const result = evaluateMetric({
      metric,
      history: history[metric] || [],
      todayValue: today[metric],
      config: cfg[metric] || DEFAULT_THRESHOLDS[metric]
    });
    if (result) {
      out.push({ agentEmail: agent.email, ...result });
    }
  }
  return out;
}

// ─── Bulk evaluation ────────────────────────────────────────────────────

/**
 * Evaluate every agent's day in one call.
 *
 * @param {Object} agentsByEmail — {[email]: agentObject as in evaluateAgentDay}
 * @param {Object} configs       — {[metric]: configObject}
 * @returns {Array<Object>} all anomalies across all agents
 */
function evaluateBulk(agentsByEmail, configs) {
  if (!agentsByEmail || typeof agentsByEmail !== 'object') return [];
  const out = [];
  for (const email of Object.keys(agentsByEmail)) {
    const agent = { email, ...(agentsByEmail[email] || {}) };
    const found = evaluateAgentDay(agent, configs);
    out.push(...found);
  }
  // Sort: critical first, then by absolute z desc
  out.sort((a, b) => {
    if (a.severity !== b.severity) {
      if (a.severity === 'critical') return -1;
      if (b.severity === 'critical') return 1;
    }
    return Math.abs(b.modifiedZ) - Math.abs(a.modifiedZ);
  });
  return out;
}

// ─── Exports ────────────────────────────────────────────────────────────
module.exports = {
  METRICS,
  DIRECTIONS,
  SEVERITIES,
  MAD_SCALE,
  DEFAULT_THRESHOLDS,
  median,
  medianAbsoluteDeviation,
  modifiedZScore,
  severityForZ,
  evaluateMetric,
  evaluateAgentDay,
  evaluateBulk
};
