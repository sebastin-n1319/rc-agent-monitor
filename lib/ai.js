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
  return { text: (text || '').trim(), usage: data && data.usage, model };
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

module.exports = { AI_VERSION, MODELS, FALLBACK_MODEL, isConfigured, chat, chatJSON, speech, TTS_VOICES, makeCache, redact, sanitizeHistory, AIError };
