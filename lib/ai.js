/**
 * Session 46: one place for every OpenAI call in the app.
 *
 * - Model per feature, overridable by env var, cheap defaults.
 * - 20s timeout (AbortSignal) so a slow OpenAI never hangs a request.
 * - resp.ok checked; one retry on a cheaper fallback model if the chosen
 *   model is missing or overloaded.
 * - Errors are logged here and callers get a generic message, never
 *   OpenAI's raw text.
 * - store:false, and a small in-memory cache for repeatable calls.
 */

const AI_VERSION = '5.0';

const MODELS = {
  ticket:  process.env.OPENAI_MODEL_TICKET  || 'gpt-4.1-mini',
  brain:   process.env.OPENAI_MODEL_BRAIN   || 'gpt-4.1-mini',
  writer:  process.env.OPENAI_MODEL_WRITER  || 'gpt-4.1-nano',
  calldoc: process.env.OPENAI_MODEL_CALLDOC || 'gpt-4.1-nano',
  analyze: process.env.OPENAI_MODEL_ANALYZE || 'gpt-4.1-mini',
};
const FALLBACK_MODEL = process.env.OPENAI_MODEL_FALLBACK || 'gpt-4o-mini';
const TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 20000);

function isConfigured() { return !!process.env.OPENAI_API_KEY; }

// gpt-5 / o-series take max_completion_tokens and no custom temperature.
function buildBody(model, { messages, maxTokens, temperature, json }) {
  const reasoning = /^(gpt-5|o\d)/.test(model);
  const body = { model, messages, store: false };
  if (reasoning) {
    body.max_completion_tokens = maxTokens;
    body.reasoning_effort = 'minimal';
  } else {
    body.max_tokens = maxTokens;
    if (temperature != null) body.temperature = temperature;
  }
  if (json) body.response_format = { type: 'json_object' };
  return body;
}

class AIError extends Error {}

async function postOnce(model, opts) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(buildBody(model, opts)),
    signal: AbortSignal.timeout(opts.timeoutMs || TIMEOUT_MS),
  });
  let data = null;
  try { data = await resp.json(); } catch (e) { /* non-JSON */ }
  if (!resp.ok) {
    const code = data && data.error && (data.error.code || data.error.type);
    const err = new AIError(`OpenAI ${resp.status} ${code || ''}`.trim());
    err.status = resp.status; err.code = code;
    throw err;
  }
  const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  const u = data && data.usage;
  if (u) require('./ai-usage').record({ feature: opts._feature || require('./ai-usage').callerFeature(), model, usage: { input_tokens: (u.prompt_tokens || 0) - ((u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0), cache_read_input_tokens: (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0, output_tokens: u.completion_tokens || 0 } }).catch(() => {});
  return { text: (text || '').trim(), usage: u, model };
}

/**
 * chat({ feature, messages, maxTokens, temperature, json })
 * -> { text, usage, model }  (throws AIError with a safe message)
 */
async function chat(opts) {
  if (!isConfigured()) throw new AIError('AI is not configured');
  const model = opts.model || MODELS[opts.feature] || FALLBACK_MODEL;
  try {
    return await postOnce(model, opts);
  } catch (e) {
    const retryable = e.status === 404 || e.code === 'model_not_found' || e.status === 429 || e.status >= 500 || e.name === 'TimeoutError';
    console.error(`AI ${opts.feature || ''} ${model} failed: ${e.message || e.name}`);
    if (retryable && model !== FALLBACK_MODEL) {
      try { return await postOnce(FALLBACK_MODEL, opts); }
      catch (e2) { console.error(`AI fallback ${FALLBACK_MODEL} failed: ${e2.message || e2.name}`); }
    }
    throw new AIError('The AI service is busy right now, please try again in a moment.');
  }
}

async function chatJSON(opts) {
  const r = await chat({ ...opts, json: true });
  try { return { ...r, json: JSON.parse(r.text) }; }
  catch (e) { throw new AIError('The AI returned an unreadable answer.'); }
}

// Session 58: text to speech for read-aloud assessment questions.
// Returns an MP3 Buffer. Model and voice are overridable.
const TTS_VOICES = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
async function speech({ input, voice = 'alloy', speed = 1 }) {
  if (!isConfigured()) throw new AIError('AI is not configured');
  const model = process.env.OPENAI_MODEL_TTS || 'tts-1';
  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model, voice: TTS_VOICES.has(voice) ? voice : 'alloy', input: String(input || '').slice(0, 3000), response_format: 'mp3', speed: Math.min(1.5, Math.max(0.7, Number(speed) || 1)) }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) { console.error(`AI tts ${model} failed: HTTP ${resp.status}`); throw new AIError('The voice service is busy right now, please try again.'); }
  return Buffer.from(await resp.arrayBuffer());
}

// Batch 247: dictation. Audio goes straight to OpenAI's transcription and only the text comes back; nothing is kept.
// The glossary terms are passed as a prompt so Adit and CRM words are spelled right.
async function transcribe({ buf, mime = 'audio/webm', prompt = '' }) {
  if (!isConfigured()) throw new AIError('Dictation needs the OpenAI key on the server');
  const ext = /mp4|m4a|aac/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';
  for (const model of [process.env.OPENAI_MODEL_TRANSCRIBE || 'gpt-4o-mini-transcribe', 'whisper-1']) {
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: mime }), 'audio.' + ext);
    fd.append('model', model);
    fd.append('language', 'en');
    if (prompt) fd.append('prompt', String(prompt).slice(0, 800));
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd, signal: AbortSignal.timeout(60000) });
    if (resp.ok) { const j = await resp.json().catch(() => ({})); return String(j.text || '').trim(); }
    console.error(`AI transcribe ${model} failed: HTTP ${resp.status}`);
    if (resp.status !== 404 && resp.status !== 400) break;
  }
  throw new AIError('Dictation is busy right now, please type instead.');
}

// Batch 266: Call QA. Whisper with segment timestamps, so pauses (dead air, holds) show in the transcript as gaps.
async function transcribeTimed({ buf, mime = 'audio/mpeg', prompt = '' }) {
  if (!isConfigured()) throw new AIError('Transcription needs the OpenAI key on the server');
  const ext = /wav/.test(mime) ? 'wav' : /mp4|m4a|aac/.test(mime) ? 'mp4' : 'mp3';
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), 'call.' + ext);
  fd.append('model', 'whisper-1'); fd.append('language', 'en'); fd.append('response_format', 'verbose_json');
  if (prompt) fd.append('prompt', String(prompt).slice(0, 800));
  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: fd, signal: AbortSignal.timeout(120000) });
  if (!resp.ok) { console.error(`AI transcribe whisper-1 timed failed: HTTP ${resp.status}`); return transcribe({ buf, mime, prompt }); }
  const j = await resp.json().catch(() => ({}));
  const segs = Array.isArray(j.segments) ? j.segments : [];
  if (!segs.length) return String(j.text || '').trim();
  return segs.map((x) => `[${Math.round(Number(x.start) * 10) / 10}s] ${String(x.text || '').trim()}`).join('\n');
}

// Session 59: Anthropic (Claude) for the heavier writing tasks, when
// ANTHROPIC_API_KEY is set. bestJSON() prefers Claude and falls back to
// OpenAI, so features keep working with either key.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
function isAnthropicConfigured() { return !!process.env.ANTHROPIC_API_KEY; }
// Batch 290: cost control. Every Claude call goes through anthropicRaw(), which records the tokens by feature (ai-usage)
// and caches the system prompt (and tools, for callers that pass them), so a prompt sent again within 5 minutes is
// read from the cache at a tenth of the price. Simple background sorting jobs use the light model; a small sample of
// their answers is checked against the main model, and a feature that drifts goes back to the main model on its own.
const usage = require('./ai-usage');
const ANTHROPIC_MODEL_LIGHT = process.env.ANTHROPIC_MODEL_LIGHT || 'claude-haiku-4-5';
const LIGHT_FEATURES = new Set(String(process.env.ANTHROPIC_LIGHT_FEATURES != null ? process.env.ANTHROPIC_LIGHT_FEATURES : 'voip-project,ticket-hygiene,transfer-review,describe-images').split(',').map((x) => x.trim()).filter(Boolean));
// Light jobs go to OpenAI when its key is set (cheapest, and off the Claude bill), else to the light Claude model.
const LIGHT_PROVIDER = () => (process.env.AI_LIGHT_PROVIDER || (isConfigured() ? 'openai' : 'anthropic')).toLowerCase();
const SHADOW_RATE = Math.min(1, Math.max(0, Number(process.env.AI_SHADOW_RATE != null ? process.env.AI_SHADOW_RATE : 0.05)));
function cachedSystem(system) { return system ? [{ type: 'text', text: String(system), cache_control: { type: 'ephemeral' } }] : undefined; }
async function anthropicRaw(body, { timeoutMs = 120000, feature = 'other' } = {}) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  let data = null; try { data = await resp.json(); } catch (e) { /* below */ }
  if (resp.ok && data && data.usage) usage.record({ feature, model: body.model, usage: data.usage }).catch(() => {});
  return { resp, data };
}
function featureOf(feature) { return feature && !MODELS[feature] ? String(feature) : usage.callerFeature(); }
function useLight(feature) { return LIGHT_FEATURES.has(feature) && usage.lightOk(feature); }
// Batch 245: an answer cut off at the length limit is closed off (open string, arrays and objects) instead of lost.
function closeJSON(t) {
  const st = []; let inStr = false, esc = false;
  for (const ch of t) {
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === '{' || ch === '[') st.push(ch); else if (ch === '}' || ch === ']') st.pop();
  }
  let out = t + (inStr ? '"' : '');
  out = out.replace(/,\s*$/, '').replace(/:\s*$/, ': null').replace(/,\s*"[^"]*"\s*$/, '');
  while (st.length) out += st.pop() === '{' ? '}' : ']';
  return out;
}
function parseJSONLoose(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch (e) {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
  if (a >= 0) { try { const j = JSON.parse(closeJSON(t.slice(a))); if (j && typeof j === 'object') { j._truncated = true; return j; } } catch (e) {} }
  throw new AIError('The AI returned an unreadable answer.');
}
async function claudeOnce({ system, user, maxTokens, timeoutMs, temperature, model, feature }) {
  const { resp, data } = await anthropicRaw(Object.assign({ model, max_tokens: maxTokens, system: cachedSystem(system + '\nReply with one JSON object only, no prose and no code fences.'), messages: [{ role: 'user', content: user }] }, temperature != null ? { temperature } : {}), { timeoutMs, feature });
  // Batch 207: a model that does not take a temperature is asked again without one
  if (resp.status === 400 && temperature != null && /temperature/i.test(JSON.stringify(data || ''))) return claudeOnce({ system, user, maxTokens, timeoutMs, model, feature });
  if (!resp.ok) {
    console.error(`AI claude ${model} failed: HTTP ${resp.status} ${data && data.error && data.error.type || ''}`);
    const err = new AIError('The AI service is busy right now, please try again in a moment.'); err.status = resp.status; throw err;
  }
  const text = ((data && data.content) || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  try { return { json: parseJSONLoose(text), model, provider: 'anthropic' }; }
  catch (e) { console.error(`AI claude ${model} unreadable answer (stop: ${data && data.stop_reason}, ${text.length} chars, max_tokens ${maxTokens})`); throw e; }
}
async function claudeJSON({ system, user, maxTokens = 4000, timeoutMs = 120000, temperature, feature, model }) {
  if (!isAnthropicConfigured()) throw new AIError('Anthropic is not configured');
  feature = featureOf(feature);
  const light = !model && useLight(feature);
  const opts = { system, user, maxTokens, timeoutMs, temperature, feature };
  if (!light) return claudeOnce(Object.assign(opts, { model: model || ANTHROPIC_MODEL }));
  let out;
  // A light answer that fails or comes back cut off is asked again on the main model, so quality never drops.
  try {
    if (LIGHT_PROVIDER() === 'openai' && isConfigured()) {
      const r = await chatJSON({ feature: 'analyze', _feature: feature, messages: [{ role: 'system', content: system + '\nReply with one JSON object only.' }, { role: 'user', content: user }], maxTokens, temperature: temperature != null ? temperature : 0.2, timeoutMs: Math.min(timeoutMs, 90000) });
      out = { json: r.json, model: r.model, provider: 'openai' };
    } else out = await claudeOnce(Object.assign({}, opts, { model: ANTHROPIC_MODEL_LIGHT }));
    if (out.json && out.json._truncated) throw new Error('cut off');
  }
  catch (e) { console.warn(`AI light model for ${feature} failed (${e.message}), using ${ANTHROPIC_MODEL}`); return claudeOnce(Object.assign({}, opts, { model: ANTHROPIC_MODEL })); }
  if (Math.random() < SHADOW_RATE) {
    claudeOnce(Object.assign({}, opts, { model: ANTHROPIC_MODEL, feature: feature + ' (check)' }))
      .then((r) => usage.addShadow(feature, usage.agreement(out.json, r.json))).catch(() => {});
  }
  return out;
}
// Reads screenshots a client sent (Claude first, OpenAI as fallback). images: [{ mime, b64 }]. Returns ['what image 1 shows', ...].
async function describeImages({ images, context = '', timeoutMs = 25000 }) {
  if (!images || !images.length) return [];
  const system = 'You read screenshots that a dental, orthodontic, optometry or chiropractic office sent to Adit support. For each image, in order, say in 1 to 3 plain sentences what it shows and copy any visible text that matters (field names and values, addresses, error messages, settings, dates). Do not guess beyond what is visible. No em dashes. Reply with one JSON object only: {"images": ["image 1", "image 2"]}.';
  const text = (context ? 'Ticket context: ' + context + '\n\n' : '') + `There are ${images.length} image(s).`;
  if (isAnthropicConfigured()) {
    const content = images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.b64 } })).concat([{ type: 'text', text }]);
    const models = useLight('describe-images') && !(LIGHT_PROVIDER() === 'openai' && isConfigured()) ? [ANTHROPIC_MODEL_LIGHT, ANTHROPIC_MODEL] : [ANTHROPIC_MODEL];
    for (const model of models) {
      try {
        const { resp, data } = await anthropicRaw({ model, max_tokens: 900, system: cachedSystem(system), messages: [{ role: 'user', content }] }, { timeoutMs, feature: 'describe-images' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const out = parseJSONLoose(((data && data.content) || []).filter(b => b.type === 'text').map(b => b.text).join('\n'));
        if (out._truncated) throw new Error('cut off');
        return Array.isArray(out.images) ? out.images.map(String) : [];
      } catch (e) { console.warn(`describeImages claude ${model} failed: ` + e.message); }
    }
    if (!isConfigured()) throw new AIError('Could not read the image');
  }
  if (!isConfigured()) return [];
  try {
    const content = [{ type: 'text', text }].concat(images.map(im => ({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.b64}` } })));
    const r = await chatJSON({ feature: 'analyze', messages: [{ role: 'system', content: system }, { role: 'user', content }], maxTokens: 900, temperature: 0.1, timeoutMs });
    return Array.isArray(r.json.images) ? r.json.images.map(String) : [];
  } catch (e) { console.warn('describeImages openai failed: ' + e.message); throw e; }
}
// Batch 198: reads a PDF the client or agent attached (scanned or with little text) with Claude. Returns the text and the details that matter.
async function readDocument({ b64, mime = 'application/pdf', name = '', context = '', timeoutMs = 60000 }) {
  if (!isAnthropicConfigured()) return '';
  const system = 'You read a file attached to an Adit support ticket (dental, orthodontic, optometry or chiropractic office software). Write out everything in it that could matter to support, in detail: what kind of document it is, names of the office, dates, amounts, account, phone and fax numbers as written, settings, error messages, line items, signatures, requests and instructions. Keep the original wording for key lines. Plain text, no em dashes, no preamble.';
  const content = [{ type: 'document', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: (context ? 'Ticket: ' + context + '\n' : '') + 'File: ' + name }];
  const { resp, data } = await anthropicRaw({ model: ANTHROPIC_MODEL, max_tokens: 2500, system: cachedSystem(system), messages: [{ role: 'user', content }] }, { timeoutMs, feature: 'read-document' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return ((data && data.content) || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}
function anyConfigured() { return isAnthropicConfigured() || isConfigured(); }
async function bestJSON({ system, user, maxTokens = 4000, feature = 'analyze', timeoutMs = 120000, temperature }) {
  if (isAnthropicConfigured()) {
    try { return await claudeJSON({ system, user, maxTokens, timeoutMs, temperature, feature: featureOf(feature) }); }
    catch (e) { if (!isConfigured()) throw e; console.warn('Claude failed (' + (e.message || e.name) + '), falling back to OpenAI'); }
  }
  const r = await chatJSON({ feature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, temperature: temperature != null ? temperature : 0.4, timeoutMs: Math.min(timeoutMs, 90000) });
  return { json: r.json, model: r.model, provider: 'openai' };
}

// Tiny LRU for repeatable results (e.g. ticket analysis per modifiedTime).
function makeCache(limit = 300) {
  const m = new Map();
  return {
    get(k) { if (!m.has(k)) return undefined; const v = m.get(k); m.delete(k); m.set(k, v); return v; },
    set(k, v) { m.set(k, v); if (m.size > limit) m.delete(m.keys().next().value); },
  };
}

// Strip obvious PII before text leaves the app.
function redact(text) {
  return String(text || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/(\+?\d[\d\s().-]{8,}\d)/g, '[phone]');
}

// Messages from the browser: only user/assistant turns, capped.
function sanitizeHistory(messages, { maxTurns = 12, maxChars = 2000 } = {}) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-maxTurns)
    .map(m => ({ role: m.role, content: m.content.slice(0, maxChars) }));
}

module.exports = { transcribeTimed, transcribe, _parseJSONLoose: parseJSONLoose, AI_VERSION, MODELS, FALLBACK_MODEL, isConfigured, chat, chatJSON, speech, TTS_VOICES, isAnthropicConfigured, claudeJSON, anthropicRaw, cachedSystem, ANTHROPIC_MODEL, ANTHROPIC_MODEL_LIGHT, LIGHT_FEATURES, LIGHT_PROVIDER, anyConfigured, bestJSON, describeImages, readDocument, makeCache, redact, sanitizeHistory, AIError };
