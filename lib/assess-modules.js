/**
 * Session 65: product modules for assessments.
 *
 * A fixed list (the modules in Adit's release notes) so every assessment and
 * question is tagged with the same names. Sub-modules are free: the AI
 * suggests them from the questions, reviewers can edit them, and any
 * sub-module already used is offered again so names do not drift.
 */
const MODULES = [
  { key: 'online-scheduling', name: 'Online Scheduling', group: 'Applications', icon: 'm_calendar', words: ['online scheduling', 'booking link', 'book online', 'appointment request', 'widget', 'self schedule'] },
  { key: 'engage', name: 'Engage', group: 'Applications', icon: 'm_engage', words: ['engage', 'reminder', 'recall', 'campaign', 'text message', 'sms', 'communication preference', 'broadcast'] },
  { key: 'schedule', name: 'Schedule', group: 'Applications', icon: 'm_schedcheck', words: ['schedule', 'appointment book', 'appointment color', 'calendar view', 'operatory'] },
  { key: 'patient-forms', name: 'Patient Forms', group: 'Applications', icon: 'doc', words: ['patient form', 'intake form', 'form', 'signature', 'consent'] },
  { key: 'ai-agent', name: 'AI Agent', group: 'Applications', icon: 'm_ai', words: ['ai agent', 'webchat', 'chatbot', 'ai receptionist', 'ai assistant'] },
  { key: 'adit-pay', name: 'Adit Pay', group: 'Applications', icon: 'm_dollar', words: ['adit pay', 'payment', 'refund', 'terminal', 'card reader', 'merchant', 'statement', 'payscore', 'text to pay', 'convenience fee'] },
  { key: 'call-tracking', name: 'Call Tracking', group: 'Applications', icon: 'm_phonecall', words: ['call tracking', 'call intelligence', 'call log', 'call recording', 'transcript', 'tracking number'] },
  { key: 'tasks', name: 'Tasks', group: 'Applications', icon: 'm_check', words: ['task', 'to-do', 'follow up task'] },
  { key: 'crm', name: 'CRM', group: 'Applications', icon: 'users', words: ['crm', 'lead', 'pipeline', 'contact record'] },
  { key: 'practice-analytics', name: 'Practice Analytics', group: 'Applications', icon: 'chart', words: ['practice analytics', 'analytics', 'dashboard metric', 'production report'] },
  { key: 'rcm', name: 'RCM', group: 'Applications', icon: 'm_rcm', words: ['rcm', 'revenue cycle', 'claim', 'insurance verification', 'eligibility', 'billing'] },
  { key: 'reports', name: 'Reports', group: 'Applications', icon: 'm_reports', words: ['report', 'call insights', 'export report'] },
  { key: 'treatment-plans', name: 'Treatment Plans', group: 'Applications', icon: 'm_tx', words: ['treatment plan', 'tooth chart', 'case acceptance', 'treatment presentation'] },
  { key: 'automations', name: 'Automations', group: 'Applications', icon: 'm_bolt', words: ['automation', 'workflow', 'trigger', 'follow-up workflow'] },
  { key: 'voice', name: 'Voice', group: 'Voice', icon: 'm_phone', words: ['voice', 'phone system', 'ring group', 'ivr', 'call forwarding', 'voicemail', 'softphone', 'extension', 'phones down', 'caller id', 'porting', 'sip'] },
  { key: 'efax', name: 'eFax', group: 'Voice', icon: 'm_fax', words: ['efax', 'fax'] },
  { key: 'ehr-connection', name: 'EHR Connection', group: 'EHR Connection', icon: 'link', words: ['ehr', 'pms', 'sync', 'adit server', 'bridge', 'integration', 'dentrix', 'eaglesoft', 'open dental', 'denticon', 'connection'] },
  { key: 'platform', name: 'Platform', group: 'Platform', icon: 'layers', words: ['platform', 'desktop app', 'notification', 'login', 'navigation', 'web app', 'mobile app'] },
  { key: 'admin-billing', name: 'Admin and Billing', group: 'Settings', icon: 'm_idcard', words: ['subscription', 'invoice', 'admin', 'plan pricing', 'tax', 'account billing'] },
  { key: 'general-settings', name: 'General Settings', group: 'Settings', icon: 'm_gear', words: ['settings', 'office hours', 'practice profile', 'preferences'] },
  { key: 'account-security', name: 'Account and Security', group: 'Settings', icon: 'shield', words: ['password', 'security', 'two factor', '2fa', 'permissions', 'user roles', 'access'] },
  { key: 'general', name: 'General', group: 'Other', icon: 'm_folder', words: [] },
];
const BY_KEY = new Map(MODULES.map(m => [m.key, m]));
const cleanSub = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001F<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
const tcase = (s) => cleanSub(s).replace(/\b([a-z])/g, (m, c, i, str) => (i === 0 || /[\s/-]/.test(str[i - 1])) && !/^(and|or|of|the|to|for|in|on)\b/i.test(str.slice(i)) ? c.toUpperCase() : c);

function isKey(k) { return BY_KEY.has(String(k || '')); }
function moduleKey(v) {
  const s = String(v || '').trim().toLowerCase();
  if (BY_KEY.has(s)) return s;
  const hit = MODULES.find(m => m.name.toLowerCase() === s);
  return hit ? hit.key : '';
}
function resolve(list) {
  return (Array.isArray(list) ? list : []).map(x => {
    const m = BY_KEY.get(moduleKey(x && (x.key || x.module || x)));
    if (!m) return null;
    return { key: m.key, name: m.name, icon: m.icon, group: m.group, subs: Array.from(new Set((Array.isArray(x.subs) ? x.subs : []).map(tcase).filter(Boolean))).slice(0, 6) };
  }).filter(Boolean);
}
/** Stored form: [{key, subs:[]}]. */
function normModules(list) {
  const seen = new Map();
  (Array.isArray(list) ? list : []).forEach(x => {
    const k = moduleKey(x && (x.key || x.module || x));
    if (!k) return;
    const cur = seen.get(k) || { key: k, subs: [] };
    (Array.isArray(x.subs) ? x.subs : []).map(tcase).filter(Boolean).forEach(s => { if (!cur.subs.some(y => y.toLowerCase() === s.toLowerCase())) cur.subs.push(s); });
    cur.subs = cur.subs.slice(0, 6);
    seen.set(k, cur);
  });
  return Array.from(seen.values()).slice(0, 6);
}
function normPrep(p) {
  const o = p && typeof p === 'object' ? p : {};
  const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const topics = (Array.isArray(o.topics) ? o.topics : []).map(t => ({
    title: clean(t && t.title, 90),
    points: (Array.isArray(t && t.points) ? t.points : []).map(x => clean(x, 200)).filter(Boolean).slice(0, 6),
  })).filter(t => t.title).slice(0, 10);
  return { summary: clean(o.summary, 600), topics };
}

/** Keyword fallback when no AI is configured. */
function guessModule(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  let best = null, bestN = 0;
  for (const m of MODULES) {
    let n = 0;
    for (const w of m.words) { if (t.includes(w)) n += w.includes(' ') ? 2 : 1; }
    if (n > bestN) { best = m; bestN = n; }
  }
  return best ? best.key : 'general';
}

function questionLine(q) {
  const opts = Array.isArray(q.options) ? q.options.map(o => typeof o === 'string' ? o : (o && o.text)).filter(Boolean).slice(0, 6).join(' | ') : '';
  return `[q${q.id}] ${String(q.prompt || '').slice(0, 300)}${opts ? '\n   options: ' + opts.slice(0, 300) : ''}${q.tags && q.tags.length ? '\n   tags: ' + q.tags.join(', ') : ''}${q.explanation ? '\n   why: ' + String(q.explanation).slice(0, 200) : ''}`;
}

/**
 * Suggests a title, description, module tags, sub-modules and a "what this
 * covers" prep list for a set of questions. `existingSubs` is a
 * {moduleKey: [names]} map of sub-modules already in use, so the AI reuses
 * them. Works without AI (keyword fallback) so the button never dead-ends.
 */
async function suggest({ questions, ai, existingSubs = {}, hint = '' }) {
  const qs = (questions || []).slice(0, 40);
  if (!qs.length) return { title: '', description: '', modules: [], perQuestion: {}, prep: { summary: '', topics: [] }, provider: 'none' };
  if (ai && ai.anyConfigured && ai.anyConfigured() && ai.bestJSON) {
    const list = MODULES.map(m => `${m.key} = ${m.name}`).join('\n');
    const subs = Object.keys(existingSubs).map(k => `${k}: ${existingSubs[k].slice(0, 12).join(', ')}`).join('\n') || '(none yet)';
    const system = `You organise assessments for a customer support team at Adit, which sells software to dental and healthcare practices. You label questions with product modules, name assessments, and write a short study guide for the agents who will take them.
Modules (use only these keys):
${list}
Sub-modules already in use, reuse them when they fit:
${subs}
Return JSON only:
{"title":"...","description":"...","modules":[{"key":"module-key","subs":["Sub Module"]}],"questions":[{"id":"q12","module":"module-key","sub":"Sub Module"}],"prep":{"summary":"...","topics":[{"title":"...","points":["..."]}]}}
Rules:
- title: 3 to 7 words, plain and specific (for example "Voice call routing and escalation"). No quotes, no "Assessment", no dates.
- description: one or two plain sentences saying what the assessment checks. Written to the agent.
- modules: the 1 to 3 modules that matter most, most important first. Each has 0 to 3 sub-modules of 1 to 3 words in Title Case (for example "Ring Groups", "Refunds", "Booking Links").
- questions: one entry per question with its best module and sub-module.
- prep.summary: one or two sentences telling the agent what to revise.
- prep.topics: 3 to 6 topics, each with 2 to 4 short study pointers written as things to know or be able to do ("Know who owns a ticket after escalation").
- NEVER quote a question, list answer options, or state which answer is correct. Pointers name the topic and skill, not the answer.
- Use only what the questions show. Do not invent product behaviour.`;
    const user = (hint ? `Context: ${hint}\n\n` : '') + `Questions:\n${qs.map(questionLine).join('\n')}`;
    try {
      const r = await ai.bestJSON({ system, user, maxTokens: 2500, timeoutMs: 60000 });
      const jn = r.json || {};
      const perQuestion = {};
      (Array.isArray(jn.questions) ? jn.questions : []).forEach(x => {
        const id = Number(String(x && x.id).replace(/\D/g, ''));
        const k = moduleKey(x && x.module);
        if (id && k) perQuestion[id] = { module: k, sub: tcase(x.sub) };
      });
      let modules = normModules(jn.modules);
      if (!modules.length) { const counts = {}; Object.values(perQuestion).forEach(v => { counts[v.module] = (counts[v.module] || 0) + 1; }); modules = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3).map(k => ({ key: k, subs: [] })); }
      return { title: String(jn.title || '').replace(/[\u0000-\u001F"]/g, ' ').trim().slice(0, 100), description: String(jn.description || '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 400),
        modules, perQuestion, prep: normPrep(jn.prep), provider: r.provider || 'ai' };
    } catch (e) { /* fall through to keywords */ }
  }
  // Fallback: keywords and tags.
  const perQuestion = {}, counts = {}, tagCount = {};
  qs.forEach(q => {
    const k = guessModule(`${q.prompt} ${(q.tags || []).join(' ')} ${q.explanation || ''}`);
    perQuestion[q.id] = { module: k, sub: '' };
    counts[k] = (counts[k] || 0) + 1;
    (q.tags || []).forEach(t => { tagCount[t] = (tagCount[t] || 0) + 1; });
  });
  const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
  const topTags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]).slice(0, 5);
  const main = BY_KEY.get(keys[0]);
  const title = topTags.length ? tcase(topTags.slice(0, 2).join(' and ')) + (main && main.key !== 'general' ? ' in ' + main.name : '') : (main && main.key !== 'general' ? main.name + ' knowledge check' : 'Knowledge check');
  return { title: title.slice(0, 100), description: `Checks what you know about ${topTags.length ? topTags.slice(0, 3).join(', ') : (main ? main.name : 'the topic')}.`,
    modules: keys.map(k => ({ key: k, subs: [] })), perQuestion,
    prep: { summary: `Revise ${topTags.length ? topTags.slice(0, 3).join(', ') : 'the topics below'} before you start.`, topics: topTags.map(t => ({ title: tcase(t), points: [] })) }, provider: 'keywords' };
}

module.exports = { MODULES, BY_KEY, isKey, moduleKey, resolve, normModules, normPrep, guessModule, cleanSub: tcase, suggest };
