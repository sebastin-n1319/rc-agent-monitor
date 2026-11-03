'use strict';
/**
 * Batch 236: a small client for AditKB's MCP endpoint (/mcp), with the tool's own key (ADITKB_API_KEY).
 * AditKB serves the same read-only tools to AI clients that people use from Claude: data_dictionary, search_schema,
 * table_detail, run_sql, read_rows, account_analysis and more. Expert's investigator calls them so it can look things up
 * the way a person would (find the account, read the deal, the tickets, the calls), within the key's own access.
 * Streamable HTTP transport: JSON-RPC over POST, replies as JSON or as server-sent events.
 */
const BASE = (process.env.ADITKB_BASE_URL || 'https://aditkb-production.up.railway.app').replace(/\/+$/, '');
let _sid = null, _id = 0, _tools = null, _toolsAt = 0, _init = null;

function isConfigured() { return !!process.env.ADITKB_API_KEY; }
function headers() {
  const h = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${process.env.ADITKB_API_KEY}`, 'MCP-Protocol-Version': '2025-06-18' };
  if (_sid) h['Mcp-Session-Id'] = _sid;
  return h;
}
// A reply is plain JSON, or an event stream whose data lines carry JSON-RPC messages.
function readReply(text, id) {
  const t = String(text || '').trim();
  if (!t) return null;
  if (t[0] === '{' || t[0] === '[') { const j = JSON.parse(t); return Array.isArray(j) ? j.find((x) => x.id === id) || j[0] : j; }
  let hit = null;
  for (const block of t.split(/\r?\n\r?\n/)) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
    if (!data) continue;
    try { const j = JSON.parse(data); if (j && (j.id === id || (hit == null && (j.result || j.error)))) hit = j; } catch (e) { /* keep reading */ }
  }
  return hit;
}
async function rpc(method, params, { timeoutMs = 45000, notify = false } = {}) {
  const id = notify ? undefined : ++_id;
  const body = JSON.stringify(Object.assign({ jsonrpc: '2.0', method }, params !== undefined ? { params } : {}, notify ? {} : { id }));
  const res = await fetch(BASE + '/mcp', { method: 'POST', headers: headers(), body, signal: AbortSignal.timeout(timeoutMs) });
  const sid = res.headers.get('mcp-session-id'); if (sid) _sid = sid;
  if (notify) return null;
  const text = await res.text();
  if (res.status === 404 && _sid && method !== 'initialize') { _sid = null; _init = null; throw Object.assign(new Error('session expired'), { retry: true }); }
  if (!res.ok) throw new Error(`AditKB MCP ${method} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  const j = readReply(text, id);
  if (!j) throw new Error(`AditKB MCP ${method}: empty reply`);
  if (j.error) throw new Error(`AditKB MCP ${method}: ${String(j.error.message || JSON.stringify(j.error)).slice(0, 300)}`);
  return j.result;
}
async function ensure() {
  if (_init) return _init;
  _init = (async () => {
    const r = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'rc-agent-monitor-expert', version: '1.0' } });
    await rpc('notifications/initialized', undefined, { notify: true }).catch(() => {});
    return r || {};
  })().catch((e) => { _init = null; throw e; });
  return _init;
}
async function withSession(fn) {
  await ensure();
  try { return await fn(); }
  catch (e) { if (!e.retry) throw e; await ensure(); return fn(); }
}
/** The server's tools (cached 30 minutes): [{ name, description, inputSchema }] */
async function tools() {
  if (_tools && Date.now() - _toolsAt < 30 * 60e3) return _tools;
  const r = await withSession(() => rpc('tools/list', {}));
  _tools = (r && r.tools) || []; _toolsAt = Date.now();
  return _tools;
}
/** The server's own instructions (how to use its tools), from initialize. */
async function instructions() { const r = await ensure(); return String((r && r.instructions) || ''); }
/** Calls a tool; returns its text content (joined), trimmed to maxChars. */
async function call(name, args, { timeoutMs = 45000, maxChars = 12000 } = {}) {
  const r = await withSession(() => rpc('tools/call', { name, arguments: args || {} }, { timeoutMs }));
  const parts = ((r && r.content) || []).map((c) => (c.type === 'text' ? c.text : c.type === 'resource' && c.resource ? c.resource.text || '' : '')).filter(Boolean);
  let text = parts.join('\n');
  if (!text && r && r.structuredContent) text = JSON.stringify(r.structuredContent);
  // The house rules ride along on every reply; the investigator has them once from the first call, so trim repeats.
  text = text.replace(/"house_rules":\s*\{[\s\S]*$/m, (m) => (m.length > 2500 ? '"house_rules": "(trimmed: same rules as earlier replies)"}' : m));
  return { isError: !!(r && r.isError), text: text.length > maxChars ? text.slice(0, maxChars) + `\n...(cut at ${maxChars} characters; narrow the query for more)` : text };
}
module.exports = { isConfigured, tools, call, instructions, _readReply: readReply, _reset: () => { _sid = null; _init = null; _tools = null; } };
