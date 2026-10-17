'use strict';
/**
 * Batch 175: AI on the Bonus and Hall of Fame pages.
 *  - review(R): admin review of a bonus period (highlights, things to check, coaching). Sees amounts.
 *  - coach(card, label): a coaching note for one agent from their own Growth Blueprint card. Never sees amounts.
 * Both only summarise numbers the tool already worked out; they never change a number.
 */
const ai = require('./ai');
const cache = ai.makeCache(100);
const t2 = (n) => (n == null || !isFinite(n) ? null : Math.floor(n * 100 + 1e-9) / 100);

function monthLine(m) {
  const mt = (m.metrics || []).map((x) => `${x.label}: ${x.value == null ? 'n/a' : t2(x.value) + (x.pct ? '%' : '')} (S1 ${x.s1}${x.pct ? '%' : ''}, S2 ${x.s2}${x.pct ? '%' : ''}) -> ${x.outcome}`).join('; ');
  return mt;
}

function reviewLines(R) {
  const lines = [];
  for (const a of R.agents) {
    lines.push(`## ${a.name} (${a.team} team${a.eligible ? '' : ', NOT in the bonus this period'}) total Rs.${a.totals.total} (slab ${a.totals.slab}, CSAT ${a.totals.csat})`);
    for (const mk of Object.keys(a.months)) {
      const m = a.months[mk];
      if (m.outside) { lines.push(`- ${m.label}: not in T1 CS`); continue; }
      lines.push(`- ${m.label}: ${m.points} pts, present ${m.present}, leave count ${m.leaveCount}${m.unplanned ? ', UNPLANNED leave' : ''}, ${m.eligible ? 'eligible ' + m.slab : 'not eligible (' + (m.why || []).join(' ') + ')'}, slab Rs.${m.slabAmt}, CSAT Rs.${m.csat ? m.csat.amount : 0} (${m.csat ? m.csat.good + '/' + m.csat.total : '0/0'}). ${monthLine(m)}${m.data ? ` Raw: inbound accepted ${m.data.inbound}, tickets closed ${m.data.closed}, FCR yes ${m.data.fcrYes}, chats ${m.data.chats}, happy ${m.data.happy}.` : ''}`);
    }
  }
  return lines;
}
const RULES_TXT = 'Rules: calls team metrics Inbound calls/day (35 pts, S1 >=7, S2 >=5), Tickets closed/day (20, S1 >=5, S2 >=4), FCR % (25, S1 >=75, S2 >=70), QA % (20, S1 >=90, S2 >=85). Chat team: Chats/day (15, S1 >=11, S2 >=9), Chat CSAT % (30, S1 >=90, S2 >=85), Tickets/day (20), QA (20), FCR (15). Points are earned at either slab. Eligible = 70+ points and 18+ present days. Overall slab = the slab most metrics reached (tie = Slab 1). Planned leave count (PL + SL + half of half days, floater not counted): 0 days 100%, 1-2 days 75%, 3 days 50%, more than 3 days 0%. Any unplanned leave or NCNS forfeits the month. Per day = count / present days.';
const clean = (s) => String(s || '').replace(/(Rs\.?|\u20b9|INR)\s?[\d,]+(\.\d+)?/gi, '').replace(/[\u2013\u2014]/g, ',');
function hist(history) { return ai.sanitizeHistory(history, { maxTurns: 8, maxChars: 1200 }); }
async function chatJSONWith(system, context, history, question, maxTokens) {
  const convo = hist(history).map((m) => (m.role === 'user' ? 'Q: ' : 'A: ') + m.content).join('\n');
  const user = context + (convo ? '\n\nEarlier in this chat:\n' + convo : '') + '\n\nQuestion: ' + String(question || '').slice(0, 600);
  const r = await ai.bestJSON({ system: system + ' Return JSON: {"answer": string (plain text, short paragraphs or "- " bullet lines, max 180 words), "followups": [string] (2-3 short next questions the user might ask)}.', user, maxTokens, feature: 'analyze', timeoutMs: 60000 });
  return r.json || {};
}
async function adminAsk(R, question, history) {
  if (!ai.anyConfigured()) { const e = new Error('AI is not set up on this server.'); e.status = 503; throw e; }
  const system = 'You answer a support manager\'s questions about a team bonus calculation. Use only the numbers given; never invent or recalculate amounts differently from them; if the data cannot answer, say so. Plain English, no em dashes or en dashes. When asked to draft a message for agents, never include rupee amounts.';
  const j = await chatJSONWith(system, `Bonus period ${R.label}. ${RULES_TXT}\nTotal Rs.${R.totals.total}.\n` + reviewLines(R).join('\n'), history, question, 1400);
  return { answer: String(j.answer || '').replace(/[\u2013\u2014]/g, ','), followups: (j.followups || []).map(String).slice(0, 3) };
}
function cardLines(card) {
  return card.months.map((m) => m.onLeave ? `- ${m.label}: on leave / not in T1 CS` : `- ${m.label}: ${m.points} pts, present days ${m.present}, ${m.eligible ? 'eligible ' + (m.slab || '') : 'not eligible (' + (m.why || []).join(' ') + ')'}. ${monthLine(m)}`);
}
async function coachAsk(card, periodLabel, question, history) {
  if (!ai.anyConfigured()) { const e = new Error('AI is not set up on this server.'); e.status = 503; throw e; }
  const system = 'You are a warm, practical performance coach for one customer support agent, answering their questions about their own points, slabs, eligibility and how to improve. You only know this agent\'s own numbers and the rules. '
    + 'Never mention money, rupees or bonus amounts (if asked, say the amount is shared by their team lead), never discuss other agents, and stay on work performance. Address the agent as "you". Plain English, short sentences, no em dashes or en dashes. Show the simple maths when asked what is needed (for example tickets per day x present days).';
  const j = await chatJSONWith(system, `Agent: ${card.name.split(' ')[0]} (${card.team === 'chat' ? 'chat' : 'calls'} team), ${periodLabel}. ${RULES_TXT}\nEligible ${card.eligibleMonths}/${card.months.length} months, ${card.total} points.\n${cardLines(card).join('\n')}\nTool summary: ${card.insight}`, history, question, 900);
  return { answer: clean(j.answer), followups: (j.followups || []).map(clean).slice(0, 3) };
}
async function story(v) {
  if (!ai.anyConfigured()) { const e = new Error('AI is not set up on this server.'); e.status = 503; throw e; }
  const key = 'story|' + v.period + '|' + v.status + '|' + (v.board || []).map((b) => b.name + b.total).join(',');
  const hit = cache.get(key); if (hit) return hit;
  const board = (v.board || []).map((b) => `${b.name} (${b.team}): ${b.months.map((m) => m.label + ' ' + m.points).join(', ')}, total ${b.total}, eligible ${b.eligibleMonths}/${v.months.length}`).join('\n');
  const awards = (v.awards || []).map((a) => `${a.title}: ${a.winners.join(', ')} (${a.desc})`).join('\n');
  const r = await ai.bestJSON({ system: 'You write a short, upbeat but honest quarter recap for a customer support team\'s Hall of Fame page that every agent can read. Celebrate people by name for real numbers only. Never mention money, never criticise anyone by name. Plain English, no em dashes or en dashes. Return JSON: {"title": string (max 8 words), "story": string (3-4 sentences), "teamTip": string (one sentence the whole team can act on next quarter)}.',
    user: `${v.longLabel || v.label}. Points are out of 100 a month; eligible = 70+ points and 18+ present days.\nBoard:\n${board}\nAwards:\n${awards}`, maxTokens: 700, feature: 'analyze', timeoutMs: 60000 });
  const j = r.json || {};
  const out = { title: clean(j.title), story: clean(j.story), teamTip: clean(j.teamTip) };
  cache.set(key, out); return out;
}
async function review(R) {
  if (!ai.anyConfigured()) { const e = new Error('AI is not set up on this server.'); e.status = 503; throw e; }
  const key = 'rev|' + R.period + '|' + R.totals.total + '|' + R.agents.map((a) => a.totals.total + ':' + Object.values(a.months).map((m) => m.points).join(',')).join('|');
  const hit = cache.get(key); if (hit) return Object.assign({ cached: true }, hit);
  const lines = reviewLines(R);
  const system = 'You review a monthly support-team bonus for the team manager. The numbers are already calculated and correct; do not recalculate amounts or invent numbers. '
    + 'Write short, specific, plain English (no em dashes or en dashes, no hype). Use agent first names. '
    + 'Return JSON: {"headline": string (one sentence), "highlights": [string] (3-5 wins), "watch": [string] (2-5 things the manager should check or act on: metrics within 2% of a slab line, agents who would have earned more without leave, months not eligible only because of days, missing data), "coaching": [{"agent": string, "tip": string}] (one practical tip for each agent who is not at Slab 1 in every metric, max 10)}.';
  const user = `Bonus period ${R.label}. Rules: points per metric at Slab 1 or Slab 2, eligible with 70+ points and 18+ present days, overall slab = majority (tie = Slab 1), leave count factor 0:100%, 1-2:75%, 3:50%, >3:0%, any unplanned leave forfeits the month.\nTotal Rs.${R.totals.total} (slab ${R.totals.slab}, CSAT ${R.totals.csat}).\n\n${lines.join('\n')}`;
  const r = await ai.bestJSON({ system, user, maxTokens: 2000, feature: 'analyze', timeoutMs: 90000 });
  const j = r.json || {};
  const out = { headline: String(j.headline || ''), highlights: (j.highlights || []).map(String).slice(0, 6), watch: (j.watch || []).map(String).slice(0, 6),
    coaching: (j.coaching || []).filter((x) => x && x.agent).map((x) => ({ agent: String(x.agent), tip: String(x.tip || '') })).slice(0, 12), model: r.model, at: new Date().toISOString() };
  cache.set(key, out);
  return out;
}

async function coach(card, periodLabel) {
  if (!ai.anyConfigured()) { const e = new Error('AI is not set up on this server.'); e.status = 503; throw e; }
  const key = 'coach|' + periodLabel + '|' + card.name + '|' + card.months.map((m) => m.points + ':' + (m.metrics || []).map((x) => x.value).join(',')).join('|');
  const hit = cache.get(key); if (hit) return Object.assign({ cached: true }, hit);
  const lines = card.months.map((m) => m.onLeave ? `- ${m.label}: on leave / not in T1 CS` : `- ${m.label}: ${m.points} pts, present days ${m.present}, ${m.eligible ? 'eligible ' + (m.slab || '') : 'not eligible (' + (m.why || []).join(' ') + ')'}. ${monthLine(m)}`);
  const system = 'You are a warm, practical performance coach for a customer support agent. You see only this agent\'s own monthly points and metrics. '
    + 'Never mention money, rupees or bonus amounts, and never compare them with named colleagues. Plain English, short sentences, no em dashes or en dashes, no hype. Address the agent as "you". '
    + 'Return JSON: {"headline": string (one encouraging sentence based on a real number), "wins": [string] (2-3 specific things that went well), "focus": [{"metric": string, "action": string}] (2-3 concrete daily habits tied to the metrics that missed Slab 1, say the target per day or %), "goal": string (one measurable goal for next month)}.';
  const user = `Agent: ${card.name.split(' ')[0]} (${card.team === 'chat' ? 'chat' : 'calls'} team), ${periodLabel}. Eligible ${card.eligibleMonths}/${card.months.length} months, ${card.total} points in total.\n${lines.join('\n')}\nTool summary: ${card.insight}`;
  const r = await ai.bestJSON({ system, user, maxTokens: 900, feature: 'analyze', timeoutMs: 60000 });
  const j = r.json || {};
  const out = { headline: clean(j.headline), wins: (j.wins || []).map(clean).slice(0, 3), focus: (j.focus || []).filter((x) => x && x.metric).map((x) => ({ metric: clean(x.metric), action: clean(x.action) })).slice(0, 3), goal: clean(j.goal), at: new Date().toISOString() };
  cache.set(key, out);
  return out;
}

module.exports = { review, coach, adminAsk, coachAsk, story };
