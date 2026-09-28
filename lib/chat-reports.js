/**
 * Session 50: Google Chat report composer.
 *
 * Builds productivity ("perf") and break ("breaks") reports as a small
 * block model, renders that model as a Google Chat card or plain text,
 * posts it to the webhook, and runs saved schedules (daily / weekly /
 * monthly). All data comes from the same functions the dashboards use,
 * so a report never disagrees with what admins see on screen.
 */

const CHAT_WING = new Set(['anold.fernandes@adit.com', 'evan.cruz@adit.com', 'leo.clayton@adit.com', 'tabbie.shine@adit.com']);
const wingOf = (email) => (CHAT_WING.has(String(email || '').toLowerCase()) ? 'chat' : 'call');
const WING_LABEL = { call: '📞 Call Wing', chat: '💬 Chat Wing' };

const AUX_NAMES = { BRB: 'BRB', BREAK: 'Break', TRAINING: 'Training', QA_SESSION: 'QA', INTERNAL_CALL: 'Internal call' };

// ── Formatting helpers ──────────────────────────────────────────────
const fmtMin = (m) => { const v = Math.round(m || 0); return v < 60 ? `${v}m` : `${Math.floor(v / 60)}h ${v % 60}m`; };
const fmtSec = (s) => { const v = Math.round(s || 0); if (v < 60) return `${v}s`; const m = Math.floor(v / 60); return m < 60 ? `${m}m ${v % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`; };
const fmtPct = (p) => (p == null || Number.isNaN(p) ? '-' : `${Math.round(p)}%`);
const fmtNum = (n) => (n == null ? '-' : String(Math.round(n)));

// ── Metric catalogue ────────────────────────────────────────────────
// agg: how a team total is formed. 'sum' adds agents; 'ratio' uses num/den.
const METRICS = {
  calls_total: { label: 'Calls', short: 'Calls', get: a => a.calls.total, fmt: fmtNum, agg: 'sum', better: 'high' },
  calls_in:    { label: 'Inbound calls', short: 'In', get: a => a.calls.in, fmt: fmtNum, agg: 'sum', better: 'high' },
  calls_out:   { label: 'Outbound calls', short: 'Out', get: a => a.calls.out, fmt: fmtNum, agg: 'sum', better: 'high' },
  missed:      { label: 'Missed calls', short: 'Missed', get: a => a.calls.missed, fmt: fmtNum, agg: 'sum', better: 'low' },
  talk:        { label: 'Talk time', short: 'Talk', get: a => a.calls.talkSec, fmt: fmtSec, agg: 'sum', better: 'high' },
  aht:         { label: 'Avg handle time', short: 'AHT', get: a => a.calls.ahtSec, fmt: fmtSec, agg: 'ratio', num: a => a.calls.ahtSec * a.calls.answered, den: a => a.calls.answered, better: 'low' },
  chats:       { label: 'Chats', short: 'Chats', get: a => a.chats.count, fmt: fmtNum, agg: 'sum', better: 'high' },
  chat_resp:   { label: 'Chat first response', short: 'Chat resp', get: a => a.chats.respSec, fmt: fmtSec, agg: 'ratio', num: a => (a.chats.respSec || 0) * (a.chats.count || 0), den: a => (a.chats.respSec == null ? 0 : a.chats.count || 0), better: 'low' },
  tickets:     { label: 'Tickets handled', short: 'Tickets', get: a => a.tickets.unique, fmt: fmtNum, agg: 'sum', better: 'high' },
  closed:      { label: 'Tickets closed', short: 'Closed', get: a => a.tickets.closed, fmt: fmtNum, agg: 'sum', better: 'high' },
  fcr:         { label: 'FCR', short: 'FCR', get: a => a.tickets.fcrPct, fmt: fmtPct, agg: 'ratio', num: a => a.tickets.fcrYes * 100, den: a => a.tickets.fcrTotal, better: 'high' },
  csat:        { label: 'CSAT', short: 'CSAT', get: a => a.tickets.csatPct, fmt: fmtPct, agg: 'ratio', num: a => a.tickets.csatGood * 100, den: a => a.tickets.csatTotal, better: 'high' },
  transferred: { label: 'Transferred', short: 'Xfer', get: a => a.tickets.transferred, fmt: fmtNum, agg: 'sum', better: 'low' },
  breaks:      { label: 'Break time', short: 'Breaks', get: a => a.breaks.totalMin, fmt: fmtMin, agg: 'sum', better: 'low' },
  break_flags: { label: 'Break limit flags', short: 'Over limit', get: a => (a.breaks.status === 'exceeded' ? 1 : 0), fmt: fmtNum, agg: 'sum', better: 'low' },
};
const DEFAULT_METRICS = ['calls_total', 'missed', 'talk', 'chats', 'tickets', 'closed', 'fcr', 'breaks'];

function teamValue(key, agents) {
  const m = METRICS[key];
  if (m.agg === 'sum') return agents.reduce((s, a) => s + (Number(m.get(a)) || 0), 0);
  const den = agents.reduce((s, a) => s + (Number(m.den(a)) || 0), 0);
  if (!den) return null;
  return agents.reduce((s, a) => s + (Number(m.num(a)) || 0), 0) / den;
}

// ── Periods ─────────────────────────────────────────────────────────
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n, 12)).toISOString().slice(0, 10); };
const dow = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd, 12)).getUTCDay(); };
const todayIn = (tz) => new Date().toLocaleDateString('en-CA', { timeZone: tz });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nice = (d, withYear) => { const [y, m, dd] = d.split('-').map(Number); return `${withYear === 'wd' ? WD[dow(d)] + ' ' : ''}${dd} ${MON[m - 1]}${withYear === true ? ' ' + y : ''}`; };

const PERIODS = {
  today: 'Today', yesterday: 'Yesterday', last_workday: 'Last working day', this_week: 'This week', last_week: 'Last week',
  last_7: 'Last 7 days', this_month: 'This month', last_month: 'Last month', last_30: 'Last 30 days', custom: 'Custom',
};

function resolvePeriod(period, start, end, tz = 'America/Chicago') {
  const t = todayIn(tz);
  let s = t, e = t;
  switch (period) {
    case 'yesterday': s = e = addDays(t, -1); break;
    case 'last_workday': { let d = addDays(t, -1); while ([0, 6].includes(dow(d))) d = addDays(d, -1); s = e = d; break; }
    case 'this_week': { const back = (dow(t) + 6) % 7; s = addDays(t, -back); e = t; break; }
    case 'last_week': { const back = (dow(t) + 6) % 7; e = addDays(t, -back - 1); s = addDays(e, -6); break; }
    case 'last_7': s = addDays(t, -6); break;
    case 'last_30': s = addDays(t, -29); break;
    case 'this_month': s = t.slice(0, 8) + '01'; break;
    case 'last_month': { const first = t.slice(0, 8) + '01'; e = addDays(first, -1); s = e.slice(0, 8) + '01'; break; }
    case 'custom': {
      const ok = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));
      s = ok(start) ? start : t; e = ok(end) ? end : s;
      if (e < s) [s, e] = [e, s];
      if (e > t) e = t;
      break;
    }
    default: break; // today
  }
  const label = s === e ? nice(s, 'wd') + ' ' + s.slice(0, 4) : `${nice(s)} to ${nice(e, true)}`;
  return { start: s, end: e, label, days: Math.round((Date.parse(e) - Date.parse(s)) / 864e5) + 1 };
}

// ── Rendering ───────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (line) => esc(line).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>');

function fillVars(text, vars) {
  return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)).slice(0, 2000);
}

function toChatPayload(model, opts) {
  const intro = model.intro ? model.intro.trim() : '';
  const outro = model.outro ? model.outro.trim() : '';
  const mention = opts.mentionAll ? '<users/all> ' : '';
  if (opts.format === 'text') {
    const parts = [`*${model.title}*`, model.subtitle ? `_${model.subtitle}_` : '', intro];
    for (const b of model.blocks) parts.push((b.heading ? `*${b.heading}*\n` : '') + b.lines.join('\n'));
    if (outro) parts.push(outro);
    return { text: (mention + parts.filter(Boolean).join('\n\n')).slice(0, 4000) };
  }
  const sections = [];
  if (intro) sections.push({ widgets: [{ textParagraph: { text: toHtml(intro).replace(/\n/g, '<br>') } }] });
  for (const b of model.blocks) {
    sections.push({
      header: b.heading || undefined,
      collapsible: b.lines.length > 12,
      uncollapsibleWidgetsCount: b.lines.length > 12 ? 1 : undefined,
      widgets: b.lines.length > 12
        ? [{ textParagraph: { text: b.lines.slice(0, 10).map(toHtml).join('<br>') } }, { textParagraph: { text: b.lines.slice(10).map(toHtml).join('<br>') } }]
        : [{ textParagraph: { text: b.lines.map(toHtml).join('<br>') || '-' } }],
    });
  }
  if (outro) sections.push({ widgets: [{ textParagraph: { text: toHtml(outro).replace(/\n/g, '<br>') } }] });
  const payload = { cardsV2: [{ cardId: 'adit-report-' + Date.now(), card: { header: { title: model.title, subtitle: model.subtitle || '' }, sections } }] };
  if (mention) payload.text = mention.trim();
  return payload;
}

function toPlainText(model) {
  const parts = [model.title, model.subtitle, model.intro];
  for (const b of model.blocks) parts.push((b.heading ? b.heading + '\n' : '') + b.lines.join('\n'));
  parts.push(model.outro);
  return parts.filter(Boolean).join('\n\n').replace(/\*([^*\n]+)\*/g, '$1').replace(/_([^_\n]+)_/g, '$1');
}

// ── Factory ─────────────────────────────────────────────────────────
function createChatReports(deps) {
  const { getDateWindow, getBreakReportData, perfRoster, agentSummary, callAndChatStats, db, fetchFn } = deps;
  const TZ = 'America/Chicago';
  const cache = new Map(); // `${kind}:${start}:${end}` -> { at, data }
  const cached = async (key, ttl, fn) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.data;
    const data = await fn();
    cache.set(key, { at: Date.now(), data });
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    return data;
  };
  const webhookUrl = () => process.env.REPORTS_CHAT_WEBHOOK_URL || process.env.GOOGLE_CHAT_WEBHOOK_URL || '';
  const spaceLabel = () => process.env.REPORTS_CHAT_SPACE_LABEL || process.env.GOOGLE_CHAT_SPACE_LABEL || 'Team chat space';

  async function breakData(start, end) {
    return cached(`b:${start}:${end}`, 60e3, () => getBreakReportData(start, end, TZ));
  }

  async function perfData(start, end) {
    const today = todayIn(TZ);
    const ttl = end >= today ? 90e3 : 15 * 60e3;
    return cached(`p:${start}:${end}`, ttl, async () => {
      const from = getDateWindow(start, TZ).start.toISOString();
      let to = getDateWindow(end, TZ).end.toISOString();
      if (Date.parse(to) > Date.now()) to = new Date().toISOString();
      const { emails, agentNames, byEmail } = await perfRoster();
      const [summary, extra, br] = await Promise.all([
        agentSummary({ from, to, emails, agentNames, rosterNames: Object.values(agentNames) }).catch(() => []),
        callAndChatStats(emails, from, to).catch(() => ({})),
        breakData(start, end).catch(() => ({ agents: [] })),
      ]);
      const sumBy = {}; for (const s of summary) sumBy[s.email] = s;
      const brBy = {}; for (const b of br.agents || []) brBy[(b.email || '').toLowerCase()] = b;
      return emails.map(email => {
        const s = sumBy[email] || {}, x = extra[email] || {}, c = x.callStats || {}, ch = x.chatStats || {}, b = brBy[email];
        const totalMin = b ? Object.values(b.totals || {}).reduce((t, v) => t + v, 0) : 0;
        const answered = Math.max(0, (c.inboundCalls || 0) - (c.missedCalls || 0));
        return {
          email,
          name: byEmail[email]?.pseudo || agentNames[email] || byEmail[email]?.full_name || email.split('@')[0],
          wing: wingOf(email),
          calls: { total: c.totalCalls || 0, in: c.inboundCalls || 0, out: c.outboundCalls || 0, missed: c.missedCalls || 0, talkSec: c.totalTalkSeconds || 0, ahtSec: c.ahtInboundSeconds || 0, answered },
          chats: { count: ch.chatCount || 0, respSec: ch.avgResponseSeconds == null ? null : ch.avgResponseSeconds },
          tickets: {
            unique: s.unique_tickets || 0, closed: s.closed_count || 0, transferred: s.transferred || 0,
            fcrPct: s.fcr_pct, fcrYes: s.fcr_yes || 0, fcrTotal: s.fcr_total || 0,
            csatPct: s.csat_pct, csatGood: s.csat_good || 0, csatTotal: s.csat_total || 0,
          },
          breaks: { totalMin, byAux: b ? b.totals : {}, status: b ? b.overallStatus : 'ok', compliance: b ? b.compliance : {} },
        };
      });
    });
  }

  const activity = (a) => a.calls.total + a.chats.count + a.tickets.unique;

  // ── Productivity model ────────────────────────────────────────────
  async function buildPerf(cfg) {
    const p = resolvePeriod(cfg.period || 'today', cfg.start, cfg.end, TZ);
    const metrics = (Array.isArray(cfg.metrics) && cfg.metrics.length ? cfg.metrics : DEFAULT_METRICS).filter(k => METRICS[k]);
    const version = ['summary', 'leaderboard', 'detailed', 'coaching'].includes(cfg.version) ? cfg.version : 'summary';
    const o = cfg.options || {};
    let agents = await perfData(p.start, p.end);
    if (o.wing === 'call' || o.wing === 'chat') agents = agents.filter(a => a.wing === o.wing);
    if (o.hideIdle !== false) agents = agents.filter(a => activity(a) > 0 || a.breaks.totalMin > 0);
    const rankBy = METRICS[o.rankBy] ? o.rankBy : (metrics.includes('tickets') ? 'tickets' : metrics[0]);
    const topN = Math.min(Math.max(Number(o.topN) || 3, 1), 10);

    let prevTeam = null;
    if (o.compare) {
      const len = p.days;
      const pe = addDays(p.start, -1), ps = addDays(p.start, -len);
      let prev = await perfData(ps, pe).catch(() => null);
      if (prev) {
        if (o.wing === 'call' || o.wing === 'chat') prev = prev.filter(a => a.wing === o.wing);
        prevTeam = {}; for (const k of metrics) prevTeam[k] = teamValue(k, prev);
      }
    }
    const delta = (k, v) => {
      if (!prevTeam || prevTeam[k] == null || v == null || !prevTeam[k]) return '';
      const d = ((v - prevTeam[k]) / Math.abs(prevTeam[k])) * 100;
      if (Math.abs(d) < 1) return ' (flat)';
      const good = (d > 0) === (METRICS[k].better === 'high');
      return ` (${d > 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}% ${good ? '👍' : '⚠️'})`;
    };
    const agentLine = (a, keys) => keys.map(k => `${METRICS[k].short} ${METRICS[k].fmt(METRICS[k].get(a))}`).join(' · ');
    const blocks = [];

    const teamBlock = (list, heading) => ({
      heading,
      lines: metrics.map(k => { const v = teamValue(k, list); return `• ${METRICS[k].label}: *${METRICS[k].fmt(v)}*${heading === 'Team totals' ? delta(k, v) : ''}`; }),
    });

    const ranked = [...agents].sort((x, y) => {
      const m = METRICS[rankBy]; const vx = Number(m.get(x)), vy = Number(m.get(y));
      const nx = Number.isFinite(vx) ? vx : (m.better === 'high' ? -Infinity : Infinity);
      const ny = Number.isFinite(vy) ? vy : (m.better === 'high' ? -Infinity : Infinity);
      return m.better === 'high' ? ny - nx : nx - ny;
    });
    const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;

    const callouts = () => {
      const lines = [];
      const missedHi = agents.filter(a => a.calls.missed >= (Number(o.missedAlert) || 3)).sort((x, y) => y.calls.missed - x.calls.missed);
      if (missedHi.length) lines.push(`📵 Missed calls: ${missedHi.map(a => `${a.name} (${a.calls.missed})`).join(', ')}`);
      const over = agents.filter(a => a.breaks.status === 'exceeded');
      if (over.length) lines.push(`⏰ Over break limit: ${over.map(a => `${a.name} (${fmtMin(a.breaks.totalMin)})`).join(', ')}`);
      const fcrTarget = Number(o.fcrTarget) || 70;
      const lowFcr = agents.filter(a => a.tickets.fcrTotal >= 3 && a.tickets.fcrPct != null && a.tickets.fcrPct < fcrTarget);
      if (lowFcr.length) lines.push(`🎯 FCR under ${fcrTarget}%: ${lowFcr.map(a => `${a.name} (${fmtPct(a.tickets.fcrPct)})`).join(', ')}`);
      return lines;
    };

    if (version === 'summary') {
      blocks.push(teamBlock(agents, 'Team totals'));
      if (o.groupByWing !== false && !o.wing) {
        for (const w of ['call', 'chat']) {
          const list = agents.filter(a => a.wing === w);
          if (list.length) blocks.push({ heading: `${WING_LABEL[w]} (${list.length})`, lines: [metrics.map(k => `${METRICS[k].short} *${METRICS[k].fmt(teamValue(k, list))}*`).join(' · ')] });
        }
      }
      if (o.showTop !== false && ranked.length) blocks.push({ heading: `🏆 Top ${Math.min(topN, ranked.length)} by ${METRICS[rankBy].label.toLowerCase()}`, lines: ranked.slice(0, topN).map((a, i) => `${medal(i)} ${a.name}: *${METRICS[rankBy].fmt(METRICS[rankBy].get(a))}*`) });
      if (o.showCallouts !== false) { const c = callouts(); if (c.length) blocks.push({ heading: '👀 Needs attention', lines: c }); }
    } else if (version === 'leaderboard') {
      const others = metrics.filter(k => k !== rankBy).slice(0, 3);
      blocks.push({ heading: `🏆 Ranked by ${METRICS[rankBy].label.toLowerCase()}`, lines: ranked.map((a, i) => `${medal(i)} *${a.name}*: ${METRICS[rankBy].fmt(METRICS[rankBy].get(a))}${others.length ? '  ·  ' + agentLine(a, others) : ''}`) });
      blocks.push(teamBlock(agents, 'Team totals'));
    } else if (version === 'detailed') {
      blocks.push(teamBlock(agents, 'Team totals'));
      const groups = o.groupByWing !== false && !o.wing ? ['call', 'chat'] : [null];
      for (const w of groups) {
        const list = ranked.filter(a => !w || a.wing === w).sort((x, y) => x.name.localeCompare(y.name));
        if (!list.length) continue;
        blocks.push({ heading: w ? WING_LABEL[w] : 'Agents', lines: list.map(a => `*${a.name}*: ${agentLine(a, metrics)}`) });
      }
      if (o.showCallouts !== false) { const c = callouts(); if (c.length) blocks.push({ heading: '👀 Needs attention', lines: c }); }
    } else {
      const c = callouts();
      const idle = (await perfData(p.start, p.end)).filter(a => (!o.wing || a.wing === o.wing) && activity(a) === 0);
      if (idle.length && o.hideIdle === false) c.push(`💤 No activity: ${idle.map(a => a.name).join(', ')}`);
      blocks.push({ heading: '👀 Coaching focus', lines: c.length ? c : ['✅ No exceptions this period. Great work, team!'] });
      if (ranked.length) blocks.push({ heading: '🌟 Kudos', lines: ranked.slice(0, topN).map((a, i) => `${medal(i)} ${a.name}: *${METRICS[rankBy].fmt(METRICS[rankBy].get(a))}* ${METRICS[rankBy].label.toLowerCase()}`) });
    }

    const vars = { period: p.label, agents: agents.length, calls: fmtNum(teamValue('calls_total', agents)), chats: fmtNum(teamValue('chats', agents)), tickets: fmtNum(teamValue('tickets', agents)), fcr: fmtPct(teamValue('fcr', agents)) };
    const scope = o.wing === 'call' ? ' · Call Wing' : o.wing === 'chat' ? ' · Chat Wing' : '';
    return {
      kind: 'perf', version, period: p,
      title: fillVars(cfg.title || '📈 T1 CS Productivity', vars),
      subtitle: `${p.label}${scope} · ${agents.length} agents`,
      intro: fillVars(cfg.intro, vars), outro: fillVars(cfg.outro, vars),
      blocks,
    };
  }

  // ── Break model ───────────────────────────────────────────────────
  async function buildBreaks(cfg) {
    const p = resolvePeriod(cfg.period || 'today', cfg.start, cfg.end, TZ);
    const version = ['full', 'exceptions', 'compact', 'by_wing'].includes(cfg.version) ? cfg.version : 'full';
    const o = cfg.options || {};
    const data = await breakData(p.start, p.end);
    let agents = data.agents || [];
    if (o.wing === 'call' || o.wing === 'chat') agents = agents.filter(a => wingOf(a.email) === o.wing);
    const line = (a) => {
      const parts = Object.entries(a.compliance || {}).map(([aux, c]) => `${AUX_NAMES[aux] || aux} ${fmtMin(c.mins)}${c.daily_limit && o.showLimits !== false ? '/' + c.daily_limit + 'm' : ''}`);
      return `• ${a.username}${parts.length ? ': ' + parts.join(' · ') : ''}`;
    };
    const by = (s) => agents.filter(a => a.overallStatus === s);
    const totals = {}; agents.forEach(a => Object.entries(a.totals || {}).forEach(([k, v]) => { totals[k] = (totals[k] || 0) + v; }));
    const totalLine = Object.entries(totals).map(([k, v]) => `${AUX_NAMES[k] || k} *${fmtMin(v)}*`).join(' · ') || 'No break data';
    const blocks = [];
    if (version === 'compact') {
      blocks.push({ heading: 'Summary', lines: [`🔴 Over limit: *${by('exceeded').length}*   🟡 Close to limit: *${by('warning').length}*   ✅ Within: *${by('ok').length}*`, `Team total: ${totalLine}`] });
      if (by('exceeded').length) blocks.push({ heading: '🔴 Over limit', lines: [by('exceeded').map(a => a.username).join(', ')] });
    } else if (version === 'by_wing') {
      for (const w of ['call', 'chat']) {
        const list = agents.filter(a => wingOf(a.email) === w);
        if (list.length) blocks.push({ heading: WING_LABEL[w], lines: list.map(a => (a.overallStatus === 'exceeded' ? '🔴 ' : a.overallStatus === 'warning' ? '🟡 ' : '✅ ') + line(a).slice(2)) });
      }
      if (o.showTotals !== false) blocks.push({ heading: 'Team total', lines: [totalLine] });
    } else {
      if (by('exceeded').length) blocks.push({ heading: `🔴 Over limit (${by('exceeded').length})`, lines: by('exceeded').map(line) });
      if (by('warning').length) blocks.push({ heading: `🟡 Close to limit (${by('warning').length})`, lines: by('warning').map(line) });
      if (version === 'full' && by('ok').length) blocks.push({ heading: `✅ Within limits (${by('ok').length})`, lines: by('ok').map(line) });
      if (version === 'exceptions' && !by('exceeded').length && !by('warning').length) blocks.push({ heading: '', lines: ['✅ Everyone stayed within their break limits.'] });
      if (o.showTotals !== false) blocks.push({ heading: 'Team total', lines: [totalLine] });
    }
    if (!agents.length) blocks.splice(0, blocks.length, { heading: '', lines: ['No break events recorded for this period.'] });
    const vars = { period: p.label, agents: agents.length, over: by('exceeded').length };
    return {
      kind: 'breaks', version, period: p,
      title: fillVars(cfg.title || '☕ Break Report', vars),
      subtitle: `${p.label} · ${agents.length} agents tracked`,
      intro: fillVars(cfg.intro, vars), outro: fillVars(cfg.outro, vars),
      blocks,
    };
  }

  async function build(cfg) {
    const model = cfg.kind === 'breaks' ? await buildBreaks(cfg) : await buildPerf(cfg);
    return { model, text: toPlainText(model), target: spaceLabel(), configured: !!webhookUrl() };
  }

  async function send(cfg, who, scheduleId) {
    const { model } = await build(cfg);
    const url = webhookUrl();
    let ok = false, error = null;
    if (!url) error = 'Google Chat webhook is not configured';
    else {
      try {
        const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(toChatPayload(model, cfg.options || {})), signal: AbortSignal.timeout(15000) });
        ok = r.ok; if (!r.ok) error = `Google Chat returned HTTP ${r.status}`;
      } catch (e) { error = 'Could not reach Google Chat'; }
    }
    await db.insertChatReportLog({ kind: model.kind, title: model.title, period_label: model.period.label, version: model.version, schedule_id: scheduleId, sent_by: who, ok, error }).catch(() => {});
    return { ok, error, model };
  }

  // ── Scheduler (called every minute) ───────────────────────────────
  function localParts(tz) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
    const o = {}; for (const x of f.formatToParts(new Date())) o[x.type] = x.value;
    const date = `${o.year}-${o.month}-${o.day}`;
    return { date, mins: Number(o.hour) * 60 + Number(o.minute), dow: dow(date), dom: Number(o.day), dim: new Date(Date.UTC(+o.year, +o.month, 0)).getUTCDate() };
  }
  function isDue(s, now) {
    const [h, m] = String(s.time_hm || '18:00').split(':').map(Number);
    const target = h * 60 + m;
    if (now.mins < target || now.mins > target + 10) return false; // 10 min grace covers restarts
    if (s.last_run_key === now.date) return false;
    if (s.freq === 'weekly') return now.dow === Number(s.weekday ?? 5);
    if (s.freq === 'monthly') return now.dom === Math.min(Number(s.monthday || 1), now.dim);
    if (s.weekdays_only) return now.dow >= 1 && now.dow <= 5;
    return true;
  }
  let running = false;
  async function runDue() {
    if (running) return; running = true;
    try {
      const list = await db.listChatReportSchedules();
      for (const s of list) {
        if (!s.enabled) continue;
        let now; try { now = localParts(s.tz || TZ); } catch (e) { continue; }
        if (!isDue(s, now)) continue;
        await db.markChatReportScheduleRun(s.id, now.date, 'sending');
        let cfg = {}; try { cfg = JSON.parse(s.config || '{}'); } catch (e) {}
        const r = await send({ ...cfg, kind: s.kind }, `schedule:${s.name}`, s.id).catch(e => ({ ok: false, error: e.message }));
        await db.markChatReportScheduleRun(s.id, now.date, r.ok ? 'sent' : ('failed: ' + (r.error || 'error')).slice(0, 120));
      }
    } catch (e) { console.error('❌ chat report scheduler:', e.message); }
    finally { running = false; }
  }

  function nextRun(s) {
    try {
      const now = localParts(s.tz || TZ);
      const [h, m] = String(s.time_hm).split(':').map(Number);
      for (let i = 0; i < 40; i++) {
        const d = addDays(now.date, i);
        if (i === 0 && (now.mins > h * 60 + m + 10 || s.last_run_key === d)) continue;
        const wd = dow(d), dom = Number(d.slice(8)), dim = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate();
        const ok = s.freq === 'weekly' ? wd === Number(s.weekday ?? 5) : s.freq === 'monthly' ? dom === Math.min(Number(s.monthday || 1), dim) : (!s.weekdays_only || (wd >= 1 && wd <= 5));
        if (ok) return `${d} ${s.time_hm}`;
      }
    } catch (e) {}
    return null;
  }

  return { build, send, runDue, nextRun, resolvePeriod, METRICS, DEFAULT_METRICS, PERIODS, spaceLabel, isConfigured: () => !!webhookUrl() };
}

module.exports = { createChatReports, METRICS, DEFAULT_METRICS, PERIODS, resolvePeriod };
