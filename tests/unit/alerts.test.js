/**
 * Unit tests for lib/alerts.js
 *
 * Coverage target: every evaluator's true/false/edge case + the public
 * surface (evaluateAll, evaluateOne) + the "engine never throws" guarantee.
 */
import { describe, it, expect } from 'vitest';
import {
  ALERT_KEYS,
  SEVERITIES,
  DEFAULT_THRESHOLDS,
  evaluateAll,
  evaluateOne,
  _internal
} from '../../lib/alerts.js';

const NOW = 1_700_000_000_000;  // fixed reference time
const MIN = 60_000;             // 1 minute in ms

// Helper: build a thresholds map from DEFAULTS, optionally overriding fields
function makeThresholds(overrides = {}) {
  const t = {};
  for (const k of Object.keys(DEFAULT_THRESHOLDS)) {
    t[k] = { ...DEFAULT_THRESHOLDS[k] };
    if (overrides[k]) {
      t[k] = { ...t[k], ...overrides[k] };
      if (overrides[k].threshold) {
        t[k].threshold = { ...DEFAULT_THRESHOLDS[k].threshold, ...overrides[k].threshold };
      }
    }
  }
  return t;
}

describe('alerts — public surface', () => {
  it('exports the 5 stable alert keys', () => {
    expect(ALERT_KEYS).toEqual([
      'abandonment_spike',
      'stuck_call',
      'queue_backup',
      'long_aux',
      'coverage_gap'
    ]);
  });

  it('exports the 3 severity levels', () => {
    expect(SEVERITIES).toContain('info');
    expect(SEVERITIES).toContain('warning');
    expect(SEVERITIES).toContain('critical');
  });

  it('DEFAULT_THRESHOLDS has an entry for every key with required fields', () => {
    for (const key of ALERT_KEYS) {
      const cfg = DEFAULT_THRESHOLDS[key];
      expect(cfg, key).toBeDefined();
      expect(cfg.enabled).toBe(1);
      expect(SEVERITIES).toContain(cfg.severity);
      expect(cfg.cooldown_seconds).toBeGreaterThan(0);
      expect(cfg.threshold).toBeTypeOf('object');
    }
  });

  it('evaluateAll([null/undefined/empty]) returns [] without throwing', () => {
    expect(evaluateAll(null)).toEqual([]);
    expect(evaluateAll(undefined)).toEqual([]);
    expect(evaluateAll({})).toEqual([]);
    expect(evaluateAll('not-an-object')).toEqual([]);
    expect(evaluateAll([])).toEqual([]);  // arrays are typeof 'object' but ALERT_KEYS loop produces nothing
  });

  it('evaluateOne with unknown key returns null', () => {
    expect(evaluateOne('does_not_exist', { thresholds: makeThresholds() })).toBeNull();
  });

  it('evaluateOne with disabled rule returns null', () => {
    const thresholds = makeThresholds({ stuck_call: { enabled: 0 } });
    const state = {
      now: NOW,
      thresholds,
      agents: [{ email: 'a@x.com', status: 'oncall', currentCallStartedAt: NOW - 30 * MIN }]
    };
    expect(evaluateOne('stuck_call', state)).toBeNull();
  });
});

// ─── abandonment_spike ─────────────────────────────────────────────────
describe('abandonment_spike', () => {
  const KEY = 'abandonment_spike';

  it('fires when rate is above threshold with enough calls', () => {
    const calls = [];
    for (let i = 0; i < 4; i++) calls.push({ abandoned: true });
    for (let i = 0; i < 16; i++) calls.push({ abandoned: false });
    // 4/20 = 20% > default 15% threshold, minCalls=5 satisfied
    const r = evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), callsLast15Min: calls });
    expect(r).not.toBeNull();
    expect(r.key).toBe(KEY);
    expect(r.severity).toBe('critical');
    expect(r.data.actualPct).toBe(20);
    expect(r.data.abandoned).toBe(4);
    expect(r.data.total).toBe(20);
    expect(r.body).toContain('20.0%');
  });

  it('does not fire below rate threshold', () => {
    // 1/20 = 5% < 15%
    const calls = [{ abandoned: true }, ...Array(19).fill({ abandoned: false })];
    const r = evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), callsLast15Min: calls });
    expect(r).toBeNull();
  });

  it('does not fire below minCalls floor even if rate exceeds threshold', () => {
    // 1/2 = 50% > 15%, but only 2 calls < minCalls=5
    const calls = [{ abandoned: true }, { abandoned: false }];
    const r = evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), callsLast15Min: calls });
    expect(r).toBeNull();
  });

  it('handles empty / missing calls gracefully', () => {
    const t = makeThresholds();
    expect(evaluateOne(KEY, { now: NOW, thresholds: t, callsLast15Min: [] })).toBeNull();
    expect(evaluateOne(KEY, { now: NOW, thresholds: t })).toBeNull();
    expect(evaluateOne(KEY, { now: NOW, thresholds: t, callsLast15Min: null })).toBeNull();
  });

  it('respects custom threshold override', () => {
    // tighter: 5% rate, 3 minCalls
    const thresholds = makeThresholds({ abandonment_spike: { threshold: { ratePercent: 5, minCalls: 3 } } });
    // 1/10 = 10% > 5%
    const calls = [{ abandoned: true }, ...Array(9).fill({ abandoned: false })];
    const r = evaluateOne(KEY, { now: NOW, thresholds, callsLast15Min: calls });
    expect(r).not.toBeNull();
    expect(r.data.actualPct).toBe(10);
  });
});

// ─── stuck_call ────────────────────────────────────────────────────────
describe('stuck_call', () => {
  const KEY = 'stuck_call';

  it('fires when an agent has been on a call past threshold', () => {
    const agents = [{ email: 'a@x.com', name: 'Alice', status: 'oncall', currentCallStartedAt: NOW - 25 * MIN }];
    const r = evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents });
    expect(r).not.toBeNull();
    expect(r.key).toBe(KEY);
    expect(r.severity).toBe('warning');
    expect(r.agentEmail).toBe('a@x.com');
    expect(r.body).toContain('Alice');
    expect(r.data.elapsedMs).toBe(25 * MIN);
  });

  it('does not fire if call is below threshold', () => {
    const agents = [{ email: 'a@x.com', status: 'oncall', currentCallStartedAt: NOW - 10 * MIN }];
    expect(evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents })).toBeNull();
  });

  it('ignores agents not on a call', () => {
    const agents = [
      { email: 'a@x.com', status: 'available', currentCallStartedAt: NOW - 30 * MIN },
      { email: 'b@x.com', status: 'unavailable', currentCallStartedAt: NOW - 30 * MIN },
      { email: 'c@x.com', status: 'offline' }
    ];
    expect(evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents })).toBeNull();
  });

  it('reports the longest stuck agent when multiple qualify', () => {
    const agents = [
      { email: 'short@x.com', name: 'S', status: 'oncall', currentCallStartedAt: NOW - 20 * MIN },
      { email: 'long@x.com',  name: 'L', status: 'oncall', currentCallStartedAt: NOW - 40 * MIN },
      { email: 'mid@x.com',   name: 'M', status: 'oncall', currentCallStartedAt: NOW - 30 * MIN }
    ];
    const r = evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents });
    expect(r.agentEmail).toBe('long@x.com');
    expect(r.data.allStuck.length).toBe(3);
    expect(r.data.allStuck[0].email).toBe('long@x.com');  // sorted desc
  });

  it('handles agents with missing currentCallStartedAt', () => {
    const agents = [
      { email: 'a@x.com', status: 'oncall' /* no start */ },
      { email: 'b@x.com', status: 'oncall', currentCallStartedAt: 0 }
    ];
    expect(evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents })).toBeNull();
  });
});

// ─── queue_backup ──────────────────────────────────────────────────────
describe('queue_backup', () => {
  const KEY = 'queue_backup';

  it('fires when depth and duration both exceed thresholds', () => {
    const r = evaluateOne(KEY, {
      now: NOW,
      thresholds: makeThresholds(),
      queueDepth: { current: 7, sinceMs: NOW - 5 * MIN }
    });
    expect(r).not.toBeNull();
    expect(r.severity).toBe('critical');
    expect(r.data.currentDepth).toBe(7);
  });

  it('does not fire if depth is below threshold', () => {
    expect(evaluateOne(KEY, {
      now: NOW,
      thresholds: makeThresholds(),
      queueDepth: { current: 3, sinceMs: NOW - 10 * MIN }
    })).toBeNull();
  });

  it('does not fire if depth is reached but not sustained long enough', () => {
    expect(evaluateOne(KEY, {
      now: NOW,
      thresholds: makeThresholds(),
      queueDepth: { current: 6, sinceMs: NOW - 1 * MIN }  // only 1 min, threshold 3min
    })).toBeNull();
  });

  it('does not fire when queueDepth payload is missing/malformed', () => {
    const t = makeThresholds();
    expect(evaluateOne(KEY, { now: NOW, thresholds: t })).toBeNull();
    expect(evaluateOne(KEY, { now: NOW, thresholds: t, queueDepth: null })).toBeNull();
    expect(evaluateOne(KEY, { now: NOW, thresholds: t, queueDepth: { current: 7 /* no sinceMs */ } })).toBeNull();
  });
});

// ─── long_aux ──────────────────────────────────────────────────────────
describe('long_aux', () => {
  const KEY = 'long_aux';

  it('fires when an agent has been in an AUX state past threshold', () => {
    const agents = [{ email: 'a@x.com', name: 'Alice', status: 'BREAK', sinceMs: NOW - 30 * MIN }];
    const r = evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents });
    expect(r).not.toBeNull();
    expect(r.severity).toBe('warning');
    expect(r.data.status).toBe('BREAK');
    expect(r.data.elapsedMs).toBe(30 * MIN);
  });

  it('matches all configured AUX states case-insensitively', () => {
    const agents = [
      { email: 'q@x.com', status: 'qa_aux', sinceMs: NOW - 30 * MIN },
      { email: 'b@x.com', status: 'brb',    sinceMs: NOW - 28 * MIN }
    ];
    const r = evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents });
    expect(r).not.toBeNull();
    // Longest one wins (q@x.com at 30min)
    expect(r.agentEmail).toBe('q@x.com');
    expect(r.data.allLong.length).toBe(2);
  });

  it('does not fire when agent is in AUX but below threshold', () => {
    const agents = [{ email: 'a@x.com', status: 'BREAK', sinceMs: NOW - 10 * MIN }];
    expect(evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents })).toBeNull();
  });

  it('does not fire when no agents are in AUX', () => {
    const agents = [
      { email: 'a@x.com', status: 'available', sinceMs: NOW - 60 * MIN },
      { email: 'b@x.com', status: 'oncall',    sinceMs: NOW - 40 * MIN }
    ];
    expect(evaluateOne(KEY, { now: NOW, thresholds: makeThresholds(), agents })).toBeNull();
  });
});

// ─── coverage_gap ──────────────────────────────────────────────────────
describe('coverage_gap', () => {
  const KEY = 'coverage_gap';

  it('fires when 0 available agents during business hours, sustained', () => {
    const agents = [
      { email: 'a@x.com', status: 'unavailable' },
      { email: 'b@x.com', status: 'oncall' },
      { email: 'c@x.com', status: 'offline' }
    ];
    const r = evaluateOne(KEY, {
      now: NOW,
      nowHourCST: 14,  // 2pm — inside default 9-17
      thresholds: makeThresholds(),
      agents,
      coverage: { zeroAvailableSinceMs: NOW - 5 * MIN }
    });
    expect(r).not.toBeNull();
    expect(r.severity).toBe('critical');
    expect(r.data.hour).toBe(14);
  });

  it('does not fire outside business hours', () => {
    const r = evaluateOne(KEY, {
      now: NOW,
      nowHourCST: 22,  // 10pm
      thresholds: makeThresholds(),
      agents: [{ status: 'offline' }],
      coverage: { zeroAvailableSinceMs: NOW - 30 * MIN }
    });
    expect(r).toBeNull();
  });

  it('does not fire when at least one agent is available', () => {
    const r = evaluateOne(KEY, {
      now: NOW,
      nowHourCST: 11,
      thresholds: makeThresholds(),
      agents: [
        { status: 'available' },
        { status: 'oncall' }
      ],
      coverage: { zeroAvailableSinceMs: NOW - 10 * MIN }
    });
    expect(r).toBeNull();
  });

  it('does not fire if coverage gap is too brief', () => {
    const r = evaluateOne(KEY, {
      now: NOW,
      nowHourCST: 11,
      thresholds: makeThresholds(),
      agents: [{ status: 'offline' }],
      coverage: { zeroAvailableSinceMs: NOW - 30_000 }  // 30s, threshold 2min
    });
    expect(r).toBeNull();
  });

  it('does not fire when nowHourCST is missing', () => {
    const r = evaluateOne(KEY, {
      now: NOW,
      thresholds: makeThresholds(),
      agents: [{ status: 'offline' }],
      coverage: { zeroAvailableSinceMs: NOW - 30 * MIN }
    });
    expect(r).toBeNull();
  });
});

// ─── engine guarantees ─────────────────────────────────────────────────
describe('engine guarantees', () => {
  it('never throws on adversarial input', () => {
    // Adversarial states: cyclic refs, NaN, very large arrays
    const adversarial = [
      { now: NaN, thresholds: { stuck_call: { enabled: 1, severity: 'warning', threshold: null } }, agents: null },
      { now: Number.POSITIVE_INFINITY, thresholds: {}, agents: [{ status: 123 }] },
      { now: NOW, thresholds: makeThresholds(), agents: [null, undefined, {}, { status: null }] },
      { now: NOW, thresholds: makeThresholds(), callsLast15Min: 'not-an-array' }
    ];
    for (const s of adversarial) {
      expect(() => evaluateAll(s)).not.toThrow();
    }
  });

  it('evaluateAll returns multiple alerts when conditions trip simultaneously', () => {
    const calls = [];
    for (let i = 0; i < 5; i++) calls.push({ abandoned: true });
    for (let i = 0; i < 10; i++) calls.push({ abandoned: false });
    // 33% > 15%, 15 > minCalls=5
    const state = {
      now: NOW,
      nowHourCST: 14,
      thresholds: makeThresholds(),
      agents: [
        { email: 'a@x.com', name: 'A', status: 'oncall', currentCallStartedAt: NOW - 30 * MIN },
        { email: 'b@x.com', name: 'B', status: 'BRB',    sinceMs: NOW - 40 * MIN }
      ],
      callsLast15Min: calls,
      queueDepth: { current: 10, sinceMs: NOW - 10 * MIN },
      coverage: { zeroAvailableSinceMs: NOW - 10 * MIN }
    };
    const results = evaluateAll(state);
    const keys = results.map(r => r.key);
    expect(keys).toContain('abandonment_spike');
    expect(keys).toContain('stuck_call');
    expect(keys).toContain('queue_backup');
    expect(keys).toContain('long_aux');
    expect(keys).toContain('coverage_gap');
    expect(results.length).toBe(5);
  });

  it('fmtMinSec formats correctly', () => {
    const { fmtMinSec } = _internal;
    expect(fmtMinSec(0)).toBe('0s');
    expect(fmtMinSec(30_000)).toBe('30s');
    expect(fmtMinSec(90_000)).toBe('1m 30s');
    expect(fmtMinSec(3600_000)).toBe('60m 0s');
    expect(fmtMinSec(-1)).toBe('0s');
    expect(fmtMinSec(NaN)).toBe('0s');
  });
});
