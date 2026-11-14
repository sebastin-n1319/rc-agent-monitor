'use strict';
/**
 * Batch 343 (cost): Anthropic Message Batches for AI jobs nobody is waiting on (the automatic open ticket review and the
 * Expert library upkeep). The same model and the same prompt are sent, so the answers are the same, at half the price.
 * Requests are gathered for up to FLUSH_MS (or BATCH_MAX requests), sent as one batch, and the batch is checked every
 * POLL_MS until it ends (most end within minutes, all within 24 hours). Each caller gets its result as if it had called
 * the model directly. If a batch fails or takes longer than MAX_WAIT_MS, the caller falls back to a normal call, so no
 * job is ever lost or left without an answer. Off with AI_BATCH=off.
 */
const FLUSH_MS = Number(process.env.AI_BATCH_FLUSH_MS || 45000);
const BATCH_MAX = Number(process.env.AI_BATCH_MAX || 50);
const POLL_MS = () => Number(process.env.AI_BATCH_POLL_MS || 30000);
const MAX_WAIT_MS = Number(process.env.AI_BATCH_MAX_WAIT_MS || 3 * 3600e3);
const API = 'https://api.anthropic.com/v1/messages/batches';
const headers = () => ({ 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' });
function enabled() { return String(process.env.AI_BATCH || 'on').toLowerCase() !== 'off' && !!process.env.ANTHROPIC_API_KEY; }

let _fetch = (...a) => fetch(...a);
function _setFetch(f) { _fetch = f; }
let _timer = null, _seq = 0;
const queue = []; // { id, params, feature, resolve, reject }
const stats = { submitted: 0, done: 0, failed: 0, batches: 0, open: 0 };

/** Sends one request through a batch. params = Anthropic Messages body (model, max_tokens, system, messages, ...). */
function submit(params, { feature = 'other' } = {}) {
  return new Promise((resolve, reject) => {
    queue.push({ id: 'r' + Date.now().toString(36) + (++_seq), params, feature, resolve, reject });
    stats.submitted++;
    if (queue.length >= BATCH_MAX) flush();
    else if (!_timer) _timer = setTimeout(flush, FLUSH_MS);
  });
}

async function flush() {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const part = queue.splice(0, BATCH_MAX); if (!part.length) return;
  let batch;
  try {
    const r = await _fetch(API, { method: 'POST', headers: headers(), body: JSON.stringify({ requests: part.map((x) => ({ custom_id: x.id, params: x.params })) }), signal: AbortSignal.timeout(60000) });
    batch = await r.json().catch(() => null);
    if (!r.ok || !batch || !batch.id) throw new Error('batch create failed: HTTP ' + r.status);
  } catch (e) { part.forEach((x) => { stats.failed++; x.reject(e); }); return; }
  stats.batches++; stats.open++;
  poll(batch.id, part, Date.now()).finally(() => { stats.open--; });
  if (queue.length) flush();
}

async function poll(id, part, t0) {
  const byId = new Map(part.map((x) => [x.id, x]));
  const failAll = (e) => { for (const x of byId.values()) { stats.failed++; x.reject(e); } byId.clear(); };
  while (byId.size) {
    if (Date.now() - t0 > MAX_WAIT_MS) { _fetch(`${API}/${id}/cancel`, { method: 'POST', headers: headers() }).catch(() => {}); return failAll(new Error('batch took too long')); }
    await new Promise((r) => setTimeout(r, POLL_MS()));
    let b; try { const r = await _fetch(`${API}/${id}`, { headers: headers(), signal: AbortSignal.timeout(30000) }); b = await r.json(); } catch (e) { continue; }
    if (!b || b.processing_status !== 'ended') continue;
    try {
      const r = await _fetch(b.results_url, { headers: headers(), signal: AbortSignal.timeout(120000) });
      const text = await r.text();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        let o; try { o = JSON.parse(line); } catch (e) { continue; }
        const x = byId.get(o.custom_id); if (!x) continue; byId.delete(o.custom_id);
        if (o.result && o.result.type === 'succeeded') {
          const msg = o.result.message || {};
          if (msg.usage) require('./ai-usage').record({ feature: x.feature, model: String(x.params.model) + ':batch', usage: msg.usage }).catch(() => {});
          stats.done++; x.resolve(msg);
        } else { stats.failed++; x.reject(new Error('batch request ' + ((o.result && o.result.type) || 'failed'))); }
      }
    } catch (e) { return failAll(e); }
    return failAll(new Error('missing from batch results'));
  }
}

function status() { return Object.assign({ enabled: enabled(), queued: queue.length }, stats); }
function _reset() { queue.length = 0; if (_timer) clearTimeout(_timer); _timer = null; Object.assign(stats, { submitted: 0, done: 0, failed: 0, batches: 0, open: 0 }); }
module.exports = { submit, flush, status, enabled, _setFetch, _reset };
