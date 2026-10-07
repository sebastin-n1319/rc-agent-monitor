'use strict';
/**
 * Client lookup for agents on a live call.
 *  search(q)              ticket number, deal, account, phone or email -> matching accounts / deals
 *  profile(acc, deal)     the review-tile facts plus contacts, other deals, and the full deal history
 *  topic(acc, deal, text) what the client is calling about: matching earlier tickets, conversations, issues
 *  guide(acc, deal, text) what to check, what to say, what the agent can do, when to escalate (AI, with a rules fallback)
 * Source is AditKB through lib/deal-context.js, so every read is queued, cached and fails soft.
 */
const dealCtx = require('./deal-context');
const H = () => dealCtx._h;
let _deps = {};
function setDeps(d) { _deps = d || {}; }
const clean = (s, n = 300) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const esc = (s) => String(s).replace(/[%_\\:]/g, ' ').trim();
const safe = (p) => p.catch(() => []);

async function search(q) {
  q = clean(q, 80);
  if (q.length < 2) return { results: [] };
  const { kb } = H();
  const digits = q.replace(/\D/g, '');
  const phoneLike = /^[\d\s()+.\-]+$/.test(q) && digits.length >= 7;
  const out = new Map();
  const add = (r) => { const k = (r.accountId || '') + '|' + (r.dealId || ''); if ((r.accountId || r.dealId) && !out.has(k)) out.set(k, r); };

  // Ticket number or ticket id.
  if (/^#?\d{4,20}$/.test(q)) {
    const n = q.replace('#', '');
    const rows = await safe(kb('desk_tickets', { select: 'id,ticket_number,subject,contact_account_name,aria_account_id,aria_deal_id,cf_deal_stage', filters: [`ticket_number:eq:${n}`], limit: 3 }));
    const rows2 = rows.length ? rows : await safe(kb('desk_tickets', { select: 'id,ticket_number,subject,contact_account_name,aria_account_id,aria_deal_id,cf_deal_stage', filters: [`id:eq:${n}`], limit: 1 }));
    for (const t of rows2) add({ accountId: t.aria_account_id, dealId: t.aria_deal_id, account: clean(t.contact_account_name, 120), deal: '', stage: clean(t.cf_deal_stage, 40), matchedOn: 'Ticket #' + t.ticket_number + ' (' + clean(t.subject, 70) + ')' });
  }
  if (q.includes('@')) {
    const e = esc(q.replace(/[%]/g, ''));
    const rows = await safe(kb('crm_contacts', { select: 'id,account_id,account_name,full_name,email,phone,mobile', filters: [`email:ilike:%${e}%`, 'deleted:eq:false'], limit: 8 }));
    for (const c of rows) add({ accountId: c.account_id, account: clean(c.account_name, 120), matchedOn: clean(c.full_name, 60) + ', ' + clean(c.email, 80) });
  } else if (phoneLike) {
    const d = digits.slice(-10);
    const pat = d.length >= 10 ? `%${d.slice(0, 3)}%${d.slice(3, 6)}%${d.slice(6)}%` : `%${d.split('').join('%')}%`;
    const [a, b, c] = await Promise.all([
      safe(kb('crm_contacts', { select: 'id,account_id,account_name,full_name,phone,mobile', filters: [`phone:ilike:${pat}`, 'deleted:eq:false'], limit: 6 })),
      safe(kb('crm_contacts', { select: 'id,account_id,account_name,full_name,phone,mobile', filters: [`mobile:ilike:${pat}`, 'deleted:eq:false'], limit: 6 })),
      safe(kb('crm_accounts', { select: 'id,account_name,phone', filters: [`phone:ilike:${pat}`, 'deleted:eq:false'], limit: 6 })),
    ]);
    for (const x of a.concat(b)) add({ accountId: x.account_id, account: clean(x.account_name, 120), matchedOn: clean(x.full_name, 60) + ', ' + clean(x.phone || x.mobile, 30) });
    for (const x of c) add({ accountId: x.id, account: clean(x.account_name, 120), matchedOn: 'Office line ' + clean(x.phone, 30) });
  } else {
    const t = esc(q);
    const [accs, deals] = await Promise.all([
      safe(kb('crm_accounts', { select: 'id,account_name,billing_city,billing_state', filters: [`account_name:ilike:%${t}%`, 'deleted:eq:false'], limit: 8 })),
      safe(kb('crm_deals', { select: 'id,deal_name,stage,account_id,account_name', filters: [`deal_name:ilike:%${t}%`], limit: 8 })),
    ]);
    for (const d of deals) add({ accountId: d.account_id, dealId: d.id, account: clean(d.account_name, 120), deal: clean(d.deal_name, 140), stage: clean(d.stage, 40), matchedOn: 'Deal' });
    for (const a of accs) add({ accountId: a.id, account: clean(a.account_name, 120), matchedOn: [a.billing_city, a.billing_state].filter(Boolean).join(', ') || 'Account' });
    if (!out.size) {
      const rows = await safe(kb('crm_contacts', { select: 'id,account_id,account_name,full_name,email', filters: [`full_name:ilike:%${t}%`, 'deleted:eq:false'], limit: 8 }));
      for (const c of rows) add({ accountId: c.account_id, account: clean(c.account_name, 120), matchedOn: clean(c.full_name, 60) + (c.email ? ', ' + clean(c.email, 60) : '') });
    }
  }
  return { results: [...out.values()].slice(0, 12) };
}

async function anchorTicket(accountId, dealId) {
  const { kb, ticketRow } = H();
  const f = dealId ? `aria_deal_id:eq:${dealId}` : `aria_account_id:eq:${accountId}`;
  const rows = await safe(kb('desk_tickets', { select: 'id', filters: [f], order_by: 'created_time', desc: true, limit: 1 }));
  return rows[0] ? ticketRow(rows[0].id) : null;
}

async function profile(accountId, dealId, localAll) {
  const H_ = H(); const { kb, clean: c } = H_;
  if (!accountId && !dealId) return { available: false, note: 'Nothing to look up.' };
  let deal = null;
  if (dealId) deal = await H_.dealName(dealId);
  if (!accountId && deal && deal.account_id) accountId = deal.account_id;
  const [accRows, contacts, deals] = await Promise.all([
    accountId ? safe(kb('crm_accounts', { select: 'id,account_name,phone,website,billing_city,billing_state,owner_name,j_account_manager,j_ehr_pms,j_account_risk,j_current_contract_expiry,j_number_of_locations', filters: [`id:eq:${accountId}`], limit: 1 })) : [],
    accountId ? safe(kb('crm_contacts', { select: 'id,full_name,email,phone,mobile,title,j_role', filters: [`account_id:eq:${accountId}`, 'deleted:eq:false'], limit: 12 })) : [],
    accountId ? safe(kb('crm_deals', { select: 'id,deal_name,stage', filters: [`account_id:eq:${accountId}`], limit: 12 })) : [],
  ]);
  const acc = accRows[0] || null;
  if (!acc && !deal) {
    // columns the key cannot read: retry with the narrow list
    const a2 = accountId ? await safe(kb('crm_accounts', { select: 'id,account_name,phone', filters: [`id:eq:${accountId}`], limit: 1 })) : [];
    if (!a2[0]) return { available: false, note: 'This client is not in AditKB.' };
    accRows[0] = a2[0];
  }
  const a = accRows[0] || acc || {};
  const anchor = await anchorTicket(accountId, dealId);
  let detail = null;
  if (anchor) detail = await dealCtx.detail(anchor.id, localAll);
  const esc = await H_.escalationStatus({ aria_deal_id: dealId || (anchor && anchor.aria_deal_id) || null, aria_account_id: accountId });
  const quick = (detail && detail.quick) ? detail.quick : null;
  const header = {
    account: c(a.account_name || (quick && quick.account) || (deal && deal.account_name), 120),
    deal: c((deal && deal.deal_name) || (quick && quick.deal), 140),
    stage: c((deal && deal.stage) || (quick && quick.stage), 60),
    csm: (quick && quick.csm) || c(a.j_account_manager, 80) || null,
    ob: (quick && quick.ob) || null,
    escalation: (quick && quick.escalation) || H_.escLabel(anchor, esc),
    escalationOwner: (quick && quick.escalationOwner) || H_.escOwner(esc),
  };
  return {
    available: true, accountId, dealId: dealId || (anchor && anchor.aria_deal_id) || null,
    header,
    account: { name: header.account, phone: c(a.phone, 30), website: c(a.website, 80), city: [a.billing_city, a.billing_state].filter(Boolean).join(', '), owner: c(a.owner_name, 60), ehr: c(a.j_ehr_pms, 60), risk: c(a.j_account_risk, 40), contractEnd: a.j_current_contract_expiry || null, locations: c(a.j_number_of_locations, 10) },
    contacts: contacts.map(x => ({ name: c(x.full_name, 60), email: c(x.email, 80), phone: c(x.phone || x.mobile, 30), title: c(x.title || x.j_role, 50) })).filter(x => x.name || x.email || x.phone),
    deals: deals.map(x => ({ id: x.id, name: c(x.deal_name, 120), stage: c(x.stage, 40) })),
    detail: detail && detail.available ? detail : null,
    detailNote: detail && !detail.available ? detail.note : (!anchor ? 'There are no support tickets for this client yet.' : null),
  };
}

// ── topic search ──────────────────────────────────────────────────────────
const STOP = new Set('client calling call now about with have from that this they their there been just does doesnt cant cannot wont when what which while would could should issue problem problems please help need needs want wants again still also very into onto over under after before than then them these those some any are was were has had not the and for you our out'.split(' '));
function topicTerms(text) {
  const { THEMES } = H();
  const themes = THEMES.filter(t => t.re.test(text));
  const tokens = [...new Set(String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)))].slice(0, 8);
  return { themes, tokens };
}
const strip = (s) => String(s || '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
function threadText(r) {
  let t = r.summary || r.content || '';
  if (/^\s*[{[]/.test(t)) { try { const j = JSON.parse(t); t = j.text || j.summary || j.body || ''; } catch (e) { t = ''; } }
  return clean(strip(t), 320);
}

async function topic(accountId, dealId, text, localAll) {
  const H_ = H(); const { kb } = H_;
  text = clean(text, 300);
  const { themes, tokens } = topicTerms(text);
  const anchor = await anchorTicket(accountId, dealId);
  const tix = anchor ? await H_.dealTickets(anchor) : [];
  const hit = (subj) => themes.some(t => t.re.test(subj)) || tokens.some(w => subj.toLowerCase().includes(w));
  const matched = tix.filter(r => hit(String(r.subject || ''))).slice(0, 12);
  const tickets = matched.map(r => ({ number: r.ticket_number, subject: clean(r.subject, 140), status: clean(r.status, 40), state: H_.bucket(r.status || ''), channel: clean(r.channel, 20), created: r.created_time, agent: clean(r.assignee_name, 60), url: /^https:\/\//.test(r.web_url || '') ? r.web_url : null }));
  // Conversations: the latest messages of up to four matching tickets, newest ticket first.
  const convos = [];
  for (const r of matched.slice(0, 4)) {
    const rows = await safe(kb('desk_ticket_threads', { select: 'direction,author_name,channel,summary,content,created_time', filters: [`ticket_id:eq:${r.id}`], order_by: 'created_time', desc: true, limit: 6 }));
    const msgs = rows.map(m => ({ who: m.channel === 'TELEPHONY' ? 'Call' : (/in/i.test(m.direction || '') ? 'Client' : 'Adit'), name: clean(m.author_name, 50), at: m.created_time, text: threadText(m) })).filter(m => m.text).reverse();
    if (msgs.length) convos.push({ number: r.ticket_number, subject: clean(r.subject, 100), messages: msgs.slice(-4) });
  }
  // Issues from the written analysis (or derived from subjects) that touch this topic.
  let issues = [];
  const a = await H_.analysisFor(accountId, null);
  const an = H_.shapeAnalysis(a, []);
  const allIssues = (an && an.available ? an.issues : []).concat(H_.deriveFromTickets(tix.map(r => ({ subject: r.subject, state: H_.bucket(r.status || ''), created: r.created_time }))).issues);
  issues = allIssues.filter(i => hit(i.problem + ' ' + (i.product || ''))).slice(0, 6);
  const findings = (an && an.available ? an.findings || [] : []).filter(f => hit(f.claim + ' ' + (f.product || ''))).slice(0, 3);
  return { text, themes: themes.map(t => t.name), tokens, tickets, convos, issues, findings, suggestions: THEME_TIPS_FOR(themes) };
}

// ── what to say and do ────────────────────────────────────────────────────
const TIPS = {
  phones: { check: ['Is the phone line registered and showing online in Adit?', 'Does it happen on every call or only some (inbound, outbound, one device)?', 'Any change recently: new router, new headset, new extension?'], say: ['I can see your phone history with us, let me check what is happening on the line right now.'], can: ['Run a test call while the client waits.', 'Check call routing and extensions in the account.'], esc: 'Calls drop on every device or the line shows offline: move it to Tech support with the call time.' },
  ehr: { check: ['Last sync time in the Adit app.', 'Is the Adit server or bridge machine on and online?', 'Any EHR update or password change at the practice?'], say: ['I can see when your system last synced with Adit. Let me check the server with you.'], can: ['Ask them to confirm the server machine is on.', 'Check for a recent EHR update.'], esc: 'Last sync older than a day, or the third report on this deal: Tech support.' },
  sched: { check: ['Are the online booking rules and hours set as the client expects?', 'Which appointment type is failing or double booking?'], say: ['Let me look at your online scheduling settings while we talk.'], can: ['Review appointment types and operatory availability.'], esc: 'Double bookings with correct settings point to a sync issue: Tech support.' },
  remind: { check: ['Is the reminder template turned on and scheduled?', 'Did the patient reply STOP (opted out)?', 'Is the practice number approved for texting?'], say: ['I will check whether those reminders went out and what the patient saw.'], can: ['Look up the message log for the patient.'], esc: 'Messages show sent but not delivered for many patients: Tech support.' },
  email: { check: ['Campaign status and send time.', 'Is the sender domain verified?'], say: ['I will check that campaign with you now.'], can: ['Review the campaign status and recipient list.'], esc: 'Domain or deliverability problems: Tech support.' },
  pay: { check: ['Which charge or invoice, and the date?', 'Is it a card terminal or online payment?'], say: ['I can look at the payment with you, but billing changes go through the billing team.'], can: ['Explain the charge and share the invoice details you can see.'], esc: 'Refunds, disputes or billing changes: billing team.' },
  login: { check: ['Is the user locked out or is the password wrong?', 'Which email do they log in with?'], say: ['I can help you get back in. Which email do you sign in with?'], can: ['Send a password reset to the email on file.'], esc: 'Repeated reset failures: Tech support.' },
  reviews: { check: ['Which review site and when was the request sent?'], say: ['Let me look at how review requests are set up for your office.'], can: ['Check review request settings.'], esc: 'Missing reviews on Google: Customer Success.' },
  forms: { check: ['Which form and which step fails?'], say: ['Let me open that form and test it with you.'], can: ['Preview the form and send a test.'], esc: 'Form not saving into the EHR: Tech support.' },
};
function THEME_TIPS_FOR(themes) { return themes.map(t => ({ key: t.key, name: t.name, check: (TIPS[t.key] || {}).check || [], say: (TIPS[t.key] || {}).say || [], can: (TIPS[t.key] || {}).can || [], escalate: (TIPS[t.key] || {}).esc || '' })).filter(x => x.check.length); }

const GUIDE_SYS = `You help an Adit T1 support agent who is on a live call with a client. Use only the facts given. Return JSON: {"opener": one sentence the agent can say right now, "check": up to 4 short things to verify on the account or with the client, "say": up to 3 short phrases the agent can say, "can": up to 4 things the agent can do now in the tools, "escalate": one sentence on when to escalate and to whom, "heads_up": one sentence about earlier history that matters (repeat issues, open tickets, escalation), or ""}.
Plain, short, calm. Do not promise fixes or timelines. If the account is escalated, say so in heads_up and tell the agent to keep the owner informed. Never invent facts or numbers. No em dashes.`;
async function guide(accountId, dealId, text, localAll) {
  const t = await topic(accountId, dealId, text, localAll);
  const p = await profile(accountId, dealId, localAll);
  const ai = _deps.ai;
  const facts = [
    `Client: ${p.header ? p.header.account : ''}${p.header && p.header.deal ? ' / ' + p.header.deal : ''}, stage ${p.header ? p.header.stage : ''}`,
    `Escalation: ${p.header ? p.header.escalation : ''}${p.header && p.header.escalationOwner ? ', owner ' + p.header.escalationOwner.owner : ''}`,
    `Client says: ${t.text}`,
    `Earlier tickets on this topic:\n${t.tickets.slice(0, 6).map(x => `- #${x.number} ${x.subject} (${x.state}, ${String(x.created || '').slice(0, 10)})`).join('\n') || '(none)'}`,
    `Recent conversation:\n${t.convos.slice(0, 2).map(c => c.messages.map(m => `${m.who}: ${m.text}`).join('\n')).join('\n---\n') || '(none)'}`,
    `Known issues:\n${t.issues.map(i => `- ${i.problem}`).join('\n') || '(none)'}`,
  ].join('\n\n');
  let j = null;
  if (ai && ai.anyConfigured && ai.anyConfigured()) {
    try { const x = await ai.bestJSON({ system: GUIDE_SYS, user: facts.slice(0, 9000), maxTokens: 700, feature: 'analyze', timeoutMs: 40000 }); j = x && x.json; } catch (e) { j = null; }
  }
  const arr = (v, n) => (Array.isArray(v) ? v : []).map(x => clean(x, 220)).filter(Boolean).slice(0, n);
  if (j) return { ai: true, opener: clean(j.opener, 260), check: arr(j.check, 4), say: arr(j.say, 3), can: arr(j.can, 4), escalate: clean(j.escalate, 260), headsUp: clean(j.heads_up, 260) };
  const tip = t.suggestions[0];
  return { ai: false, opener: tip ? tip.say[0] : 'Let me look at your account while we talk.', check: tip ? tip.check : [], say: tip ? tip.say : [], can: tip ? tip.can : [], escalate: tip ? tip.escalate : '', headsUp: t.tickets.filter(x => x.state !== 'closed').length ? 'There are ' + t.tickets.filter(x => x.state !== 'closed').length + ' open ticket(s) on this topic already.' : '' };
}

module.exports = { setDeps, search, profile, topic, guide, topicTerms };
