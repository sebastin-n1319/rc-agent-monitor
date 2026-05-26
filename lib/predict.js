/**
 * lib/predict.js — pure logistic regression engine for abandonment forecasting.
 *
 * Replaces the rough Session 1 per-hour-mean stub with a proper supervised
 * model. ~5 features → P(any abandonment in next 15 min).
 *
 * Zero I/O. Zero clock access. Every input is explicit.
 *
 * Public API:
 *   FEATURE_KEYS                 — frozen ordered list of feature names
 *   sigmoid(z)                   — numerically stable
 *   standardize(rows)            — returns { standardized, mu, sigma }
 *   trainLogisticRegression(rows, opts)
 *      → { weights, mu, sigma, featureKeys, sampleSize, evalMetrics, notes }
 *   predictAbandonProb({ weights, mu, sigma, features })
 *      → { probability, confidence, expectedAbandons, ready }
 *   evaluateModel(model, testRows)
 *      → { precision, recall, accuracy, tp, fp, fn, tn, n }
 *
 * The engine is intentionally simple — vanilla batch gradient descent with L2
 * regularization. Converges in ~200 iterations on typical Adit-scale data
 * (5K rows × 5 features). No matrix libraries needed.
 */
'use strict';

const FEATURE_KEYS = Object.freeze([
  'queueDepth',
  'hourOfDay',
  'weekday',
  'avgWaitSeconds',
  'agentsAvailable'
]);

const NUM_FEATURES = FEATURE_KEYS.length;
const DEFAULT_ITERS = 200;
const DEFAULT_LR = 0.1;
const DEFAULT_L2 = 0.01;
const DEFAULT_DECISION_THRESHOLD = 0.5;

// Below this sample size we refuse to train and return a "cold start" model
// that returns ready:false. Keeps us from publishing wildly inaccurate models.
const MIN_TRAINING_ROWS = 60;

// ─── Stats / math primitives ────────────────────────────────────────────

/**
 * Numerically stable sigmoid. For very negative z, e^-z overflows; switch
 * to the algebraically equivalent e^z / (1+e^z) form.
 */
function sigmoid(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

/** Mean of an array. Returns 0 on empty / invalid. */
function mean(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  let s = 0, n = 0;
  for (const v of arr) {
    if (typeof v === 'number' && Number.isFinite(v)) { s += v; n++; }
  }
  return n ? s / n : 0;
}

/** Sample standard deviation. Returns 0 if all values are identical. */
function stddev(arr, m) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  if (m == null) m = mean(arr);
  let s = 0, n = 0;
  for (const v of arr) {
    if (typeof v === 'number' && Number.isFinite(v)) { s += (v - m) ** 2; n++; }
  }
  if (n < 2) return 0;
  return Math.sqrt(s / (n - 1));
}

/**
 * Standardize features: for each column, subtract the mean and divide
 * by the standard deviation. Stores `mu` + `sigma` so inference can
 * apply the same transform.
 *
 * @param {Array<Array<number>>} rows — N×F matrix
 * @returns {{ standardized, mu, sigma }}
 */
function standardize(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { standardized: [], mu: new Array(NUM_FEATURES).fill(0), sigma: new Array(NUM_FEATURES).fill(1) };
  }
  const F = rows[0].length;
  const mu = new Array(F).fill(0);
  const sigma = new Array(F).fill(1);
  for (let j = 0; j < F; j++) {
    const col = rows.map(r => r[j]);
    mu[j] = mean(col);
    const sd = stddev(col, mu[j]);
    sigma[j] = sd > 1e-9 ? sd : 1;   // avoid divide-by-zero
  }
  const standardized = rows.map(r => r.map((v, j) => (v - mu[j]) / sigma[j]));
  return { standardized, mu, sigma };
}

// ─── Training ───────────────────────────────────────────────────────────

/**
 * Compute the log-loss + gradient for one mini-batch.
 * @param {Array<Array<number>>} X — standardized features (N×F)
 * @param {Array<number>} y — labels (0/1)
 * @param {Array<number>} w — weights including intercept at [0] (F+1)
 * @param {number} l2 — L2 regularization strength
 * @returns {{ loss, grad }}
 */
function lossAndGrad(X, y, w, l2) {
  const N = X.length;
  if (N === 0) return { loss: 0, grad: w.map(() => 0) };
  const F = X[0].length;
  let loss = 0;
  const grad = new Array(F + 1).fill(0);
  for (let i = 0; i < N; i++) {
    let z = w[0];
    for (let j = 0; j < F; j++) z += w[j + 1] * X[i][j];
    const p = sigmoid(z);
    const eps = 1e-12;
    loss += -(y[i] * Math.log(p + eps) + (1 - y[i]) * Math.log(1 - p + eps));
    const err = p - y[i];
    grad[0] += err;
    for (let j = 0; j < F; j++) grad[j + 1] += err * X[i][j];
  }
  loss /= N;
  // L2 reg — exclude intercept by convention
  for (let j = 1; j < grad.length; j++) {
    grad[j] = grad[j] / N + l2 * w[j];
    loss += 0.5 * l2 * w[j] * w[j];
  }
  grad[0] /= N;
  return { loss, grad };
}

/**
 * Train logistic regression on training rows.
 *
 * @param {Array<{features, label}>} rows
 * @param {Object} [opts]
 * @param {number} [opts.iterations]
 * @param {number} [opts.learningRate]
 * @param {number} [opts.l2]
 * @param {number} [opts.testSplit] — fraction held out for eval (default 0.2)
 * @returns {Object} fitted model
 */
function trainLogisticRegression(rows, opts) {
  opts = opts || {};
  const iters = opts.iterations || DEFAULT_ITERS;
  const lr = opts.learningRate || DEFAULT_LR;
  const l2 = (opts.l2 != null) ? opts.l2 : DEFAULT_L2;
  const testSplit = (opts.testSplit != null) ? opts.testSplit : 0.2;

  if (!Array.isArray(rows) || rows.length < MIN_TRAINING_ROWS) {
    return {
      ready: false,
      reason: 'insufficient_data',
      sampleSize: Array.isArray(rows) ? rows.length : 0,
      minRequired: MIN_TRAINING_ROWS,
      featureKeys: FEATURE_KEYS,
      weights: null,
      mu: null,
      sigma: null,
      notes: 'need at least ' + MIN_TRAINING_ROWS + ' training rows'
    };
  }

  // Deterministic split — sort by enqueuedAt-like key if present, else by index
  const shuffled = rows.slice();
  const splitIdx = Math.floor(shuffled.length * (1 - testSplit));
  const train = shuffled.slice(0, splitIdx);
  const test = shuffled.slice(splitIdx);

  // Build matrices — defensive: rows may have null features, missing label,
  // non-numeric values. We coerce everything safely and never throw.
  const X_raw = train.map(r => {
    const f = (r && typeof r.features === 'object' && r.features) || {};
    return FEATURE_KEYS.map(k => {
      const v = Number(f[k]);
      return Number.isFinite(v) ? v : 0;
    });
  });
  const y = train.map(r => r && r.label ? 1 : 0);
  if (X_raw.length === 0) return { ready: false, reason: 'empty_train_after_split' };

  const { standardized: X, mu, sigma } = standardize(X_raw);

  // Initialize weights to zero (intercept first)
  let w = new Array(NUM_FEATURES + 1).fill(0);

  // Gradient descent
  let finalLoss = 0;
  for (let it = 0; it < iters; it++) {
    const { loss, grad } = lossAndGrad(X, y, w, l2);
    finalLoss = loss;
    for (let j = 0; j < w.length; j++) w[j] -= lr * grad[j];
  }

  const model = {
    ready: true,
    featureKeys: FEATURE_KEYS,
    weights: w,
    mu,
    sigma,
    sampleSize: train.length,
    iterations: iters,
    learningRate: lr,
    l2,
    finalLoss,
    notes: 'trained ' + iters + ' iters on ' + train.length + ' rows'
  };

  // Evaluate on held-out test set
  model.evalMetrics = test.length > 0 ? evaluateModel(model, test) : { n: 0, note: 'no_test_set' };
  return model;
}

// ─── Inference ──────────────────────────────────────────────────────────

/**
 * Predict P(any abandonment in next 15 min) for one feature vector.
 *
 * @param {Object} args
 * @param {Object} args.model — fitted model with weights/mu/sigma
 * @param {Object} args.features — { queueDepth, hourOfDay, weekday, avgWaitSeconds, agentsAvailable }
 * @returns {Object} { ready, probability, confidence, expectedAbandons }
 */
function predictAbandonProb(args) {
  try {
    const model = args && args.model;
    if (!model || !model.ready || !Array.isArray(model.weights)) {
      return { ready: false, reason: model && model.reason || 'no_model', probability: null };
    }
    const features = (args && args.features) || {};
    const x = FEATURE_KEYS.map((k, j) => {
      const raw = Number(features[k]);
      const v = Number.isFinite(raw) ? raw : 0;
      const mu = model.mu[j];
      const sigma = model.sigma[j] || 1;
      return (v - mu) / sigma;
    });
    let z = model.weights[0];
    for (let j = 0; j < x.length; j++) z += model.weights[j + 1] * x[j];
    const p = sigmoid(z);

    // Confidence — derived from training sample size and recent eval accuracy.
    // We expose a string bucket so the UI doesn't have to reason about it.
    const acc = (model.evalMetrics && model.evalMetrics.accuracy) || 0;
    let confidence = 'low';
    if (model.sampleSize >= 500 && acc >= 0.75) confidence = 'high';
    else if (model.sampleSize >= 200 && acc >= 0.65) confidence = 'medium';

    // Expected count = probability * window-size (we don't know intensity,
    // so use probability as proxy and cap at "≥1 expected" / "<1 expected")
    const expectedAbandons = p > 0.5 ? '≥1' : '<1';

    return {
      ready: true,
      probability: Math.round(p * 10000) / 10000,
      confidence,
      expectedAbandons,
      features  // echo input for debugging
    };
  } catch (e) {
    return { ready: false, reason: 'error', error: e.message, probability: null };
  }
}

// ─── Evaluation ─────────────────────────────────────────────────────────

/**
 * Score model on a labelled test set. Returns precision / recall / accuracy.
 *
 * @param {Object} model
 * @param {Array<{features, label}>} testRows
 * @param {number} [threshold] — decision threshold for binarizing probability
 */
function evaluateModel(model, testRows, threshold) {
  threshold = threshold || DEFAULT_DECISION_THRESHOLD;
  if (!Array.isArray(testRows) || testRows.length === 0) {
    return { n: 0, precision: 0, recall: 0, accuracy: 0, tp: 0, fp: 0, fn: 0, tn: 0 };
  }
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const row of testRows) {
    const out = predictAbandonProb({ model, features: row.features });
    if (!out.ready) continue;
    const predicted = out.probability >= threshold ? 1 : 0;
    const actual = row.label ? 1 : 0;
    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 1) fn++;
    else tn++;
  }
  const denom = tp + fp + fn + tn || 1;
  return {
    n: testRows.length,
    tp, fp, fn, tn,
    precision: (tp + fp) ? tp / (tp + fp) : 0,
    recall:    (tp + fn) ? tp / (tp + fn) : 0,
    accuracy:  (tp + tn) / denom,
    threshold
  };
}

// ─── Exports ────────────────────────────────────────────────────────────
module.exports = {
  FEATURE_KEYS,
  NUM_FEATURES,
  MIN_TRAINING_ROWS,
  DEFAULT_DECISION_THRESHOLD,
  sigmoid,
  standardize,
  trainLogisticRegression,
  predictAbandonProb,
  evaluateModel,
  // exposed for tests
  _internal: { mean, stddev, lossAndGrad }
};
