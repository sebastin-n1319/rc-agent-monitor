'use strict';
/**
 * Batch 179: the announcement writer knows the tool, the process and the product.
 * It pulls the parts of docs/tool-guide.md that match the request, the live Hall of Fame state when the request is
 * about the Hall of Fame or the bonus (points and awards only, never amounts), and a short product brief.
 */
const fs = require('fs');
const path = require('path');
let _guide = null;
function guideChunks() {
  if (_guide) return _guide;
  let txt = '';
  try { txt = fs.readFileSync(path.join(__dirname, '..', 'docs', 'tool-guide.md'), 'utf8'); } catch (e) { txt = ''; }
  const out = []; let head = '';
  for (const block of txt.split(/\n\s*\n/)) {
    const b = block.trim(); if (!b) continue;
    const h = b.match(/^#+\s+(.*)/); if (h) { head = h[1]; const rest = b.replace(/^#+.*\n?/, '').trim(); if (rest) out.push({ head, text: rest }); continue; }
    out.push({ head, text: b });
  }
  _guide = out; return out;
}
const SYN = { hof: 'hall fame blueprint champions awards', hall: 'hof fame', bonus: 'slab points eligible calculator', breaks: 'break bot brb roster', assessment: 'assessments test retest', transfer: 'review transfer rework', ticket: 'tickets lifecycle', ai: 'coach assistant', stats: 'my stats lifecycle' };
function words(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2); }
function relevantGuide(gist, n = 6) {
  let q = words(gist); q = q.concat(...q.map((w) => words(SYN[w] || '')));
  const qs = new Set(q.filter((w) => !['the', 'and', 'for', 'about', 'send', 'announcement', 'announce', 'write', 'all', 'team', 'agents'].includes(w)));
  if (!qs.size) return [];
  return guideChunks().map((c) => { const ws = words(c.head + ' ' + c.text); let sc = 0; for (const w of ws) if (qs.has(w)) sc++; return { c, sc: sc / Math.sqrt(ws.length + 5) }; })
    .filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, n).map((x) => '- ' + (x.c.head ? x.c.head + ': ' : '') + x.c.text.slice(0, 900));
}
const PRODUCT = 'Adit is a practice software company for dental, optometry, chiropractic and orthodontic offices. Products include Adit Engage (patient messaging and communication), Adit Voice (VoIP phones), Adit Pay (payments), Adit AI Agent / AI front desk, patient forms, online scheduling, practice analytics, and EHR/PMS integrations. The T1 Customer Support team (Calls Wing and Chat Wing) handles first-line support by phone, chat and tickets in Zoho Desk, and transfers to T2, VoIP, CSM, Tech OB or T3/Dev when needed.';
const BONUS_RULES = 'Bonus structure (for agents, never mention rupee amounts): monthly points out of 100 from metrics (calls team: inbound calls/day, tickets closed/day, FCR, QA; chat team: chats/day, chat CSAT, tickets/day, QA, FCR) at Slab 1 or Slab 2. Eligible months need 70+ points and 18+ present days. Planned leave reduces the slab bonus; any unplanned leave or NCNS forfeits the month. The Hall of Fame shows the Champions Board (top 3 calls, chat champions, awards, scoreboard) and each agent\'s private Growth Blueprint with an AI coach they can ask questions.';
function wantsHof(g) { return /\b(hof|hall of fame|hall|fame|champion|award|blueprint|leaderboard|scoreboard|bonus|slab|star of)\b/i.test(g); }
async function hofContext(hofView, agentNames) {
  try {
    const v = await hofView({ viewerEmail: '', isAdmin: true, agentNames });
    if (!v.ready) return 'Hall of Fame: no quarter is published yet.';
    const board = (v.board || []).map((b) => `${b.name} (${b.team === 'chat' ? 'chat' : 'calls'}): ${b.total} pts, eligible ${b.eligibleMonths}/${v.months.length} months`).join('; ');
    const awards = (v.awards || []).map((a) => `${a.title}: ${a.winners.join(', ')} (${a.desc})`).join('; ');
    return `Hall of Fame now: ${v.longLabel || v.label}, status ${v.status === 'confirmed' ? 'validated and confirmed' : 'in progress, numbers yet to be confirmed'}, ${v.visible ? 'visible to agents' : 'hidden from agents'}. Board: ${board}. Awards: ${awards}. Agents open it from Hall of Fame in the sidebar; Growth Blueprint is their private tab.`;
  } catch (e) { return ''; }
}
async function compose({ ai, notices, gist, audience, tone, previous, instruction, hofView, agentNames }) {
  const cats = notices.CATEGORIES.map((c) => c.key + ' (' + c.label + ')').join(', ');
  const isHof = wantsHof(gist + ' ' + (instruction || ''));
  const ctx = [];
  ctx.push('Product: ' + PRODUCT);
  const g = relevantGuide(gist + ' ' + (instruction || '')); if (g.length) ctx.push('How the tool works (from the tool guide):\n' + g.join('\n'));
  if (isHof) { ctx.push(BONUS_RULES); const h = await hofContext(hofView, agentNames); if (h) ctx.push(h); }
  const system = 'You are the announcement writer inside Adit\'s T1 CS internal tool. You know the tool, the T1 support process and Adit\'s products from the context given. '
    + 'Turn the sender\'s request (even a short one like "send an announcement about HOF") into a complete, ready-to-post announcement, filling in the specifics from the context: what it is, what is new, who it is for, what to do and where to find it in the tool. '
    + 'Rules: plain, warm and direct; short sentences; celebrate people by name only with real facts from the context; never mention rupee or bonus amounts; never invent dates, names or numbers that are not in the request or context; if the status is in progress, say numbers can still change; no emojis; never use em dashes or en dashes. '
    + 'Title at most 80 characters. Body at most 560 characters, 2 to 5 short sentences, plain text (line breaks allowed, no markdown). '
    + 'Choose category from: ' + cats + '. Audience from: all, agents, admins (agents for things only agents act on, all when unsure). Urgent true only if time critical. '
    + 'Set link to "app:hof" when the announcement is about the Hall of Fame, otherwise "" unless the request gives an https link. '
    + 'Return JSON only: {"title": string, "body": string, "category": string, "audience": string, "urgent": boolean, "link": string}.';
  let user = 'Request from the sender:\n' + gist + (tone ? '\nTone: ' + tone : '') + (audience ? '\nIntended audience: ' + audience : '') + '\n\nContext:\n' + ctx.join('\n\n');
  if (previous && (previous.title || previous.body)) user += `\n\nCurrent draft:\nTitle: ${String(previous.title || '').slice(0, 140)}\nBody: ${String(previous.body || '').slice(0, 700)}\nChange it as asked: ${String(instruction || 'improve it').slice(0, 300)}`;
  const r = await ai.bestJSON({ system, user, maxTokens: 900, feature: 'analyze', timeoutMs: 60000 });
  return r.json || {};
}
module.exports = { compose, relevantGuide };
