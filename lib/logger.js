/**
 * Structured logger — JSON line format, multiple severities.
 * Replaces ad-hoc console.log calls. Designed to be cheap (no deps)
 * and to make Railway / Datadog / CloudWatch log ingestion trivial.
 *
 * Usage:
 *   const { log, errorTracker } = require('./lib/logger');
 *   log.info('handoff_created', { email, noteLen: note.length });
 *   log.warn('cache_miss', { key });
 *   log.error('db_error', err, { query: sql });
 *
 *   // Express middleware
 *   app.use(errorTracker());
 */
const SEVERITIES = ['debug', 'info', 'warn', 'error', 'fatal'];
const SEV_LEVEL = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const MIN_LEVEL = SEV_LEVEL[process.env.LOG_LEVEL || 'info'] || 20;

function emit(severity, event, data, err) {
  if (SEV_LEVEL[severity] < MIN_LEVEL) return;
  const entry = {
    ts: new Date().toISOString(),
    severity,
    event,
    ...(data || {})
  };
  if (err) {
    entry.error = {
      message: err.message,
      stack: (err.stack || '').split('\n').slice(0, 6).join('\n'),
      code: err.code,
      name: err.name
    };
  }
  // Single JSON line — easy to parse
  const out = JSON.stringify(entry);
  if (severity === 'error' || severity === 'fatal') console.error(out);
  else console.log(out);
}

const log = {
  debug: (event, data) => emit('debug', event, data),
  info:  (event, data) => emit('info', event, data),
  warn:  (event, data) => emit('warn', event, data),
  error: (event, err, data) => emit('error', event, data, err),
  fatal: (event, err, data) => emit('fatal', event, data, err)
};

/**
 * Express error middleware — catches all unhandled route errors and
 * logs them with request context. MUST be last in the middleware chain.
 */
function errorTracker() {
  return function (err, req, res, next) {
    log.error('http_unhandled_error', err, {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      user: req.session && req.session.email,
      status: err.status || 500
    });
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({
      success: false,
      error: err.status ? err.message : 'Internal server error'
    });
  };
}

/**
 * Wrap an async route handler to auto-log + propagate errors.
 *   app.get('/foo', requireAuth, wrap(async (req, res) => { ... }));
 */
function wrap(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Process-level guards — catch unhandled rejections so the process
 * logs the cause before crashing.
 */
function installProcessGuards() {
  process.on('unhandledRejection', (reason) => {
    log.error('unhandled_rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on('uncaughtException', (err) => {
    log.fatal('uncaught_exception', err);
    // Give the log line time to flush, then exit
    setTimeout(() => process.exit(1), 200);
  });
}

module.exports = { log, errorTracker, wrap, installProcessGuards, SEVERITIES };
