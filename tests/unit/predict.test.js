/**
 * Unit tests for lib/predict.js — the logistic-regression abandonment engine.
 *
 * Coverage targets:
 *   • Math primitives (sigmoid, mean, stddev, standardize)
 *   • Training convergence on synthetic separable data
 *   • Inference correctness + cold-start behavior
 *   • Evaluation metrics
 *   • Engine never throws on adversarial input
 */
import { describe, it, expect } from 'vitest';
import {
  FEATURE_KEYS,
  NUM_FEATURES,
  MIN_TRAINING_ROWS,
  DEFAULT_DECISION_THRESHOLD,
  sigmoid,
  standardize,
  trainLogisticRegression,
  predictAbandonProb,
  evaluateModel,
  _internal
} from '../../lib/predict.js';

// ─── Helpers ───────────────────────────────────────────────────────────

function buildSeparableDataset(n = 200) {
  // y=1 when queueDepth+avgWaitSeconds is large; otherwise 0.
  // This is a clean signal a logistic regression must learn.
  const rows = [];
  for (let i = 0; i < n; i++) {
    const q = Math.floor(Math.random() * 10);
    const w = Math.floor(Math.random() * 60);
    const score = q * 2 + w * 0.5;
    rows.push({
      features: {
        queueDepth: q,
        hourOfDay: 10 + (i % 8),
        weekday: i % 5 + 1,
        avgWaitSeconds: w,
        agentsAvailable: 5 + (i % 3)
      },
      label: score > 25 ? 1 : 0
    });
  }
  return rows;
}

// ─── Public surface ────────────────────────────────────────────────────
describe('predict — public surface', () => {
  it('exports the 5 stable feature keys in canonical order', () => {
    expect(FEATURE_KEYS).toEqual([
      'queueDepth', 'hourOfDay', 'weekday', 'avgWaitSeconds', 'agentsAvailable'
    ]);
  });
  it('NUM_FEATURES matches FEATURE_KEYS', () => {
    expect(NUM_FEATURES).toBe(FEATURE_KEYS.length);
  });
  it('MIN_TRAINING_ROWS is at least 30 (sanity floor)', () => {
    expect(MIN_TRAINING_ROWS).toBeGreaterThanOrEqual(30);
  });
  it('DEFAULT_DECISION_THRESHOLD is in (0, 1)', () => {
    expect(DEFAULT_DECISION_THRESHOLD).toBeGreaterThan(0);
    expect(DEFAULT_DECISION_THRESHOLD).toBeLessThan(1);
  });
});

// ─── sigmoid ───────────────────────────────────────────────────────────
describe('sigmoid', () => {
  it('returns 0.5 at z=0', () => {
    expect(sigmoid(0)).toBe(0.5);
  });
  it('saturates at large positive z', () => {
    expect(sigmoid(20)).toBeCloseTo(1, 6);
  });
  it('saturates at large negative z', () => {
    expect(sigmoid(-20)).toBeCloseTo(0, 6);
  });
  it('is numerically stable for very large negative z (no Infinity)', () => {
    const r = sigmoid(-1000);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBe(0);
  });
  it('is numerically stable for very large positive z', () => {
    const r = sigmoid(1000);
    expect(Number.isFinite(r)).toBe(true);
    expect(r).toBe(1);
  });
});

// ─── stats internals ───────────────────────────────────────────────────
describe('stats — mean / stddev', () => {
  const { mean, stddev } = _internal;
  it('mean of empty array = 0', () => {
    expect(mean([])).toBe(0);
  });
  it('mean ignores non-finite values', () => {
    expect(mean([1, 2, 3, NaN, Infinity, 4])).toBe(2.5);
  });
  it('stddev of single value = 0', () => {
    expect(stddev([7])).toBe(0);
  });
  it('stddev of identical values = 0', () => {
    expect(stddev([5, 5, 5, 5])).toBe(0);
  });
  it('stddev matches hand-computed example', () => {
    // n-1 sample stddev of [1,2,3,4,5] = sqrt(2.5) ≈ 1.5811
    expect(stddev([1, 2, 3, 4, 5])).toBeCloseTo(1.5811, 3);
  });
});

// ─── standardize ───────────────────────────────────────────────────────
describe('standardize', () => {
  it('returns empty result on empty input', () => {
    const { standardized, mu, sigma } = standardize([]);
    expect(standardized).toEqual([]);
    expect(mu.length).toBe(NUM_FEATURES);
    expect(sigma.length).toBe(NUM_FEATURES);
  });
  it('subtracts mean and divides by sigma', () => {
    const rows = [[10, 1], [20, 2], [30, 3]];   // 2-col mini
    const { standardized, mu, sigma } = standardize(rows);
    expect(mu[0]).toBe(20);
    expect(mu[1]).toBe(2);
    expect(sigma[0]).toBeCloseTo(10, 3);   // sample stddev
    expect(standardized[0][0]).toBeCloseTo(-1, 3);
    expect(standardized[2][0]).toBeCloseTo(1, 3);
  });
  it('replaces sigma=0 with 1 to avoid div by zero', () => {
    const rows = [[5, 1], [5, 2]];
    const { sigma } = standardize(rows);
    expect(sigma[0]).toBe(1);
    expect(sigma[1]).toBeGreaterThan(0);
  });
});

// ─── Training ──────────────────────────────────────────────────────────
describe('trainLogisticRegression — cold start', () => {
  it('returns ready:false on insufficient data', () => {
    const rows = [];
    for (let i = 0; i < 10; i++) rows.push({ features: {}, label: 0 });
    const m = trainLogisticRegression(rows);
    expect(m.ready).toBe(false);
    expect(m.reason).toBe('insufficient_data');
    expect(m.sampleSize).toBe(10);
    expect(m.minRequired).toBe(MIN_TRAINING_ROWS);
  });
  it('returns ready:false on null/undefined input', () => {
    expect(trainLogisticRegression(null).ready).toBe(false);
    expect(trainLogisticRegression(undefined).ready).toBe(false);
  });
});

describe('trainLogisticRegression — convergence', () => {
  it('learns a clear linear signal (converges to high accuracy)', () => {
    const rows = buildSeparableDataset(300);
    const m = trainLogisticRegression(rows, { iterations: 300 });
    expect(m.ready).toBe(true);
    expect(m.weights).toBeDefined();
    expect(m.weights.length).toBe(NUM_FEATURES + 1);  // +1 for intercept
    // On separable data, accuracy should be very high (>0.85)
    expect(m.evalMetrics.accuracy).toBeGreaterThan(0.85);
    // Loss should be small after training
    expect(m.finalLoss).toBeLessThan(0.5);
  });

  it('persists mu/sigma so inference can apply the same transform', () => {
    const rows = buildSeparableDataset(200);
    const m = trainLogisticRegression(rows);
    expect(Array.isArray(m.mu)).toBe(true);
    expect(Array.isArray(m.sigma)).toBe(true);
    expect(m.mu.length).toBe(NUM_FEATURES);
    expect(m.sigma.length).toBe(NUM_FEATURES);
    for (const s of m.sigma) expect(s).toBeGreaterThan(0);
  });

  it('respects custom iterations + learning rate', () => {
    const rows = buildSeparableDataset(100);
    const m = trainLogisticRegression(rows, { iterations: 50, learningRate: 0.01 });
    expect(m.iterations).toBe(50);
    expect(m.learningRate).toBe(0.01);
  });

  it('returns featureKeys in canonical order', () => {
    const rows = buildSeparableDataset(100);
    const m = trainLogisticRegression(rows);
    expect(m.featureKeys).toEqual(FEATURE_KEYS);
  });
});

// ─── Inference ─────────────────────────────────────────────────────────
describe('predictAbandonProb', () => {
  it('returns ready:false when given no model', () => {
    const r = predictAbandonProb({ features: {} });
    expect(r.ready).toBe(false);
    expect(r.reason).toBe('no_model');
  });

  it('returns ready:false when model is not ready', () => {
    const r = predictAbandonProb({ model: { ready: false, reason: 'insufficient_data' }, features: {} });
    expect(r.ready).toBe(false);
  });

  it('predicts high probability for "obvious" abandonment scenarios', () => {
    const rows = buildSeparableDataset(300);
    const m = trainLogisticRegression(rows, { iterations: 300 });
    // High queueDepth + high avgWait → predict high probability
    const r = predictAbandonProb({
      model: m,
      features: { queueDepth: 9, hourOfDay: 14, weekday: 3, avgWaitSeconds: 50, agentsAvailable: 2 }
    });
    expect(r.ready).toBe(true);
    expect(r.probability).toBeGreaterThan(0.5);
  });

  it('predicts low probability for "calm" scenarios', () => {
    const rows = buildSeparableDataset(300);
    const m = trainLogisticRegression(rows, { iterations: 300 });
    const r = predictAbandonProb({
      model: m,
      features: { queueDepth: 0, hourOfDay: 14, weekday: 3, avgWaitSeconds: 2, agentsAvailable: 10 }
    });
    expect(r.ready).toBe(true);
    expect(r.probability).toBeLessThan(0.5);
  });

  it('handles missing feature values by treating them as 0', () => {
    const rows = buildSeparableDataset(100);
    const m = trainLogisticRegression(rows);
    const r = predictAbandonProb({ model: m, features: {} });   // empty features
    expect(r.ready).toBe(true);
    expect(typeof r.probability).toBe('number');
    expect(r.probability).toBeGreaterThanOrEqual(0);
    expect(r.probability).toBeLessThanOrEqual(1);
  });

  it('echoes back the input features for transparency', () => {
    const rows = buildSeparableDataset(100);
    const m = trainLogisticRegression(rows);
    const r = predictAbandonProb({
      model: m,
      features: { queueDepth: 7, hourOfDay: 11, weekday: 2, avgWaitSeconds: 20, agentsAvailable: 4 }
    });
    expect(r.features.queueDepth).toBe(7);
  });

  it('returns a confidence string (low/medium/high)', () => {
    const rows = buildSeparableDataset(300);
    const m = trainLogisticRegression(rows, { iterations: 300 });
    const r = predictAbandonProb({ model: m, features: { queueDepth: 5 } });
    expect(['low', 'medium', 'high']).toContain(r.confidence);
  });

  it('returns expectedAbandons as "≥1" or "<1"', () => {
    const rows = buildSeparableDataset(200);
    const m = trainLogisticRegression(rows, { iterations: 300 });
    const r = predictAbandonProb({ model: m, features: { queueDepth: 9, avgWaitSeconds: 60 } });
    expect(['≥1', '<1']).toContain(r.expectedAbandons);
  });
});

// ─── Evaluation ────────────────────────────────────────────────────────
describe('evaluateModel', () => {
  it('returns zeros on empty test set', () => {
    const m = trainLogisticRegression(buildSeparableDataset(80));
    const out = evaluateModel(m, []);
    expect(out.n).toBe(0);
    expect(out.precision).toBe(0);
    expect(out.recall).toBe(0);
    expect(out.accuracy).toBe(0);
  });

  it('produces high precision/recall on separable test data', () => {
    const train = buildSeparableDataset(200);
    const test = buildSeparableDataset(100);
    const m = trainLogisticRegression(train, { iterations: 300 });
    const out = evaluateModel(m, test);
    expect(out.n).toBe(100);
    expect(out.accuracy).toBeGreaterThan(0.7);
    // Both precision and recall should be > 0.5 on truly separable data
    expect(out.precision + out.recall).toBeGreaterThan(0.8);
  });

  it('tp+fp+fn+tn equals test set size', () => {
    const train = buildSeparableDataset(150);
    const test = buildSeparableDataset(80);
    const m = trainLogisticRegression(train);
    const out = evaluateModel(m, test);
    expect(out.tp + out.fp + out.fn + out.tn).toBe(test.length);
  });

  it('threshold tunes the precision/recall tradeoff', () => {
    const train = buildSeparableDataset(200);
    const test = buildSeparableDataset(80);
    const m = trainLogisticRegression(train, { iterations: 300 });
    const lowT = evaluateModel(m, test, 0.2);
    const highT = evaluateModel(m, test, 0.8);
    // Lower threshold → recall up, precision (usually) down
    expect(lowT.recall).toBeGreaterThanOrEqual(highT.recall);
  });
});

// ─── Engine guarantees ─────────────────────────────────────────────────
describe('engine guarantees', () => {
  it('predictAbandonProb never throws on adversarial input', () => {
    const adversarial = [
      null, undefined, {},
      { model: null, features: null },
      { model: { ready: true, weights: null, mu: null, sigma: null }, features: {} },
      { model: { ready: true, weights: [0, 0, 0, 0, 0, 0], mu: [NaN, 1, 1, 1, 1], sigma: [1, 1, 1, 1, 1] }, features: { queueDepth: Infinity } }
    ];
    for (const a of adversarial) {
      expect(() => predictAbandonProb(a)).not.toThrow();
    }
  });

  it('trainLogisticRegression never throws on garbage rows', () => {
    const garbage = [
      Array.from({ length: 100 }, () => ({ features: null, label: 'x' })),
      Array.from({ length: 100 }, () => ({ features: { queueDepth: NaN }, label: undefined })),
      Array.from({ length: 100 }, () => ({}))
    ];
    for (const rows of garbage) {
      expect(() => trainLogisticRegression(rows)).not.toThrow();
    }
  });

  it('evaluateModel never throws on bad test rows', () => {
    const m = trainLogisticRegression(buildSeparableDataset(100));
    expect(() => evaluateModel(m, null)).not.toThrow();
    expect(() => evaluateModel(m, [{}])).not.toThrow();
    expect(() => evaluateModel(m, [{ features: null, label: null }])).not.toThrow();
  });
});
