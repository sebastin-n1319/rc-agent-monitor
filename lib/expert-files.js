'use strict';
/**
 * Batch 289: what an agent gives Adit Expert besides the question.
 * - Files: screenshots and photos (read by the AI), PDFs, Word, Excel, CSV and text files (read as text, scanned PDFs by
 *   the AI), and recordings (audio or video, transcribed). Nothing is kept: the text goes back to the page and is sent
 *   with the question.
 * - Links pasted in the question: a Zoho Desk ticket link becomes that ticket, a Help Center link becomes that article,
 *   an Avoma meeting link is handed to the lookup step, and any other public web page is read (public addresses only,
 *   small pages, a few seconds).
 * Everything read is data, never instructions.
 */
const dns = require('dns').promises;
const net = require('net');
let D = {};
function setDeps(d) { D = Object.assign({}, D, d || {}); }
const ai = () => D.ai || require('./ai');
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '...' : s; };
const strip = (h) => String(h || '').replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
const scrub = (s) => String(s || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[contact]').replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[contact]');

function kindOf(name, mime) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  mime = String(mime || '').toLowerCase();
  if (/^image\/(png|jpe?g|gif|webp)$/.test(mime) || /^(png|jpe?g|gif|webp)$/.test(ext)) return 'image';
  if (/^(audio|video)\//.test(mime) || /^(mp3|m4a|wav|webm|ogg|oga|mp4|mov|mpeg|mpga|aac|flac)$/.test(ext)) return 'audio';
  if (/^(pdf|docx|xlsx|csv|txt|log|json|xml|html?|eml|md|rtf)$/.test(ext) || /pdf|word|sheet|csv|text\//.test(mime)) return 'doc';
  return '';
}
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
async function readUpload({ buf, name, mime }) {
  if (!buf || !buf.length) throw Object.assign(new Error('The file is empty'), { status: 400 });
  const kind = kindOf(name, mime);
  if (!kind) throw Object.assign(new Error('That file type cannot be read. Use a screenshot, PDF, Word, Excel, CSV, text file or a recording.'), { status: 415 });
  let text = '';
  if (kind === 'image') {
    const m = /^image\//.test(mime) ? mime : IMG_MIME[String(name).toLowerCase().split('.').pop()] || 'image/png';
    const r = await ai().describeImages({ images: [{ mime: m, b64: buf.toString('base64') }], context: 'An Adit support agent attached this to a question for the support assistant.' });
    text = (r && r[0]) || '';
  } else if (kind === 'audio') {
    if (buf.length > 24 * 1024 * 1024) throw Object.assign(new Error('Recordings up to 24 MB can be read'), { status: 413 });
    text = await ai().transcribe({ buf, mime: mime || 'audio/mpeg', prompt: 'Adit, Zoho Desk, dental practice, call flow, voicemail, Engage, Adit Pay, EHR, Dentrix, Open Dental' });
  } else {
    const docText = (D.docText || require('./expert-ticket').docText);
    text = await docText(buf, name, 'An Adit support agent attached this to a question for the support assistant.');
  }
  text = scrub(cut(String(text || '').trim(), kind === 'audio' ? 16000 : 12000));
  if (!text) throw Object.assign(new Error('Nothing could be read from that file'), { status: 422 });
  return { name: cut(name, 120), kind, text };
}

// ── links ──────────────────────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
function linksIn(q) { return [...new Set((String(q || '').match(URL_RE) || []).map(u => u.replace(/[.,;:!?]+$/, '')))].slice(0, 5); }
function classify(u) {
  let x; try { x = new URL(u); } catch (e) { return null; }
  const host = x.hostname.toLowerCase(), full = u;
  if (/(^|\.)zoho\.(com|in|eu)$/.test(host) && /desk/.test(host + x.pathname + x.hash)) {
    const id = (full.match(/(?:tickets\/(?:details\/)?|dv\/|ticket\/)(\d{12,22})/i) || full.match(/\b(\d{15,22})\b/) || [])[1];
    const num = (full.match(/[?&#](?:ticketNumber|ticket)=(\d{5,7})\b/i) || [])[1];
    return { type: 'desk', url: u, id: id || null, number: num || null };
  }
  if (host === 'help.adit.com') return { type: 'kb', url: u, slug: (x.pathname.match(/articles\/([^/?#]+)/) || [])[1] || '' };
  if (/(^|\.)avoma\.com$/.test(host)) return { type: 'avoma', url: u, id: (x.pathname.match(/meetings\/([0-9a-f-]{20,})/i) || [])[1] || '' };
  if (/(^|\.)adit\.com$/.test(host) && /rc-t1cs-monitor/.test(host)) return { type: 'tool', url: u };
  return { type: 'web', url: u };
}
function privateIp(ip) {
  if (net.isIPv4(ip)) { const p = ip.split('.').map(Number); return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224; }
  const s = ip.toLowerCase(); return s === '::1' || s === '::' || s.startsWith('fc') || s.startsWith('fd') || s.startsWith('fe80') || s.startsWith('::ffff:');
}
// A public web page, read as text. Private or internal addresses, other ports and big files are refused.
async function readWeb(u, { timeoutMs = 8000, maxBytes = 600000, hops = 0 } = {}) {
  let x; try { x = new URL(u); } catch (e) { return null; }
  if (!/^https?:$/.test(x.protocol) || (x.port && !['80', '443'].includes(x.port)) || x.username || x.password) return null;
  if (net.isIP(x.hostname) || /^(localhost|.*\.local|.*\.internal)$/i.test(x.hostname)) return null;
  const addrs = await dns.lookup(x.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some(a => privateIp(a.address))) return null;
  const fetchFn = D.fetch || fetch;
  const r = await fetchFn(u, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'AditExpert/1.0 (support assistant)', Accept: 'text/html,text/plain' } }).catch(() => null);
  if (!r) return null;
  if (r.status >= 300 && r.status < 400) { const loc = r.headers.get('location'); return loc && hops < 3 ? readWeb(new URL(loc, u).toString(), { timeoutMs, maxBytes, hops: hops + 1 }) : null; }
  if (!r.ok || !/text\/(html|plain)/i.test(r.headers.get('content-type') || '')) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > maxBytes) return null;
  const html = buf.toString('utf8');
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').slice(0, 140);
  return { title: title || x.hostname, text: scrub(cut(strip(html), 9000)) };
}
module.exports = { setDeps, readUpload, kindOf, linksIn, classify, readWeb, _privateIp: privateIp };
