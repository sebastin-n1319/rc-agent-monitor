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

async function review(R) {
  if (!ai.anyConfigured()) { const e = new Error('AI is not set up on this server.'); e.status = 503; throw e; }
  const key = 'rev|' + R.period + '|' + R.totals.total + '|' + R.agents.map((a) => a.totals.total + ':' + Object.values(a.months).map((m) => m.points).join(',')).join('|');
  const hit = cache.get(key); if (hit) return Object.assign({ cached: true }, hit);
  const lines = [];
  for (const a of R.agents) {
    lines.push(`## ${a.name} (${a.team} team${a.eligible ? '' : ', NOT in the bonus this period'}) total Rs.${a.totals.total} (slab ${a.totals.slab}, CSAT ${a.totals.csat})`);
    for (const mk of Object.keys(a.months)) {
      const m = a.months[mk];
      if (m.outside) { lines.push(`- ${m.label}: not in T1 CS`); continue; }
      lines.push(`- ${m.label}: ${m.points} pts, present ${m.present}, leave count ${m.leaveCount}${m.unplanned ? ', UNPLANNED leave' : ''}, ${m.eligible ? 'eligible ' + m.slab : 'not eligible (' + (m.why || []).join(' ') + ')'}, slab Rs.${m.slabAmt}, CSAT Rs.${m.csat ? m.csat.amount : 0}. ${monthLine(m)}`);
    }
  }
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
  const clean = (s) => String(s || '').replace(/(Rs\.?|₹|INR)\s?[\d,]+/gi, '').replace(/[\u2013\u2014]/g, ',');
  const out = { headline: clean(j.headline), wins: (j.wins || []).map(clean).slice(0, 3), focus: (j.focus || []).filter((x) => x && x.metric).map((x) => ({ metric: clean(x.metric), action: clean(x.action) })).slice(0, 3), goal: clean(j.goal), at: new Date().toISOString() };
  cache.set(key, out);
  return out;
}

module.exports = { review, coach };
