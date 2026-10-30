'use strict';
/**
 * Batch 194: monthly QA scores from Zoho CRM Call Audits, the same numbers as the CRM QA report.
 * QA for an agent and a month = the average Total Score of that agent's Call Audits whose Audit Complete Date falls in
 * the month, leaving out audits at stage "Not Relevant" or "Disconnected" (checked against the Q3 2026 QA entered for
 * the bonus: Lincy Tabita Jul 90.93, Aug 88.98, Sep 92.84). Read with the suite token (CRM + Desk + Analytics + SalesIQ).
 * Complete months are kept 12 hours, the current month 30 minutes. Fails soft: callers get an empty map and a reason.
 */
const analytics = require('./analytics-service');
const BASE = process.env.ZOHO_CRM_API_BASE || 'https://www.zohoapis.com/crm/v6';
const EXCLUDE = ['Not Relevant', 'Disconnected'];
const _cache = new Map();
const lc = (s) => String(s || '').trim().toLowerCase();
const r2 = (n) => Math.round(n * 100) / 100; // the CRM report shows two decimals

async function coql(query) {
  const token = await analytics.getSuiteAccessToken();
  const res = await fetch(BASE + '/coql', { method: 'POST', headers: { Authorization: 'Zoho-oauthtoken ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ select_query: query }), signal: AbortSignal.timeout(25000) });
  if (res.status === 204) return { data: [], info: { more_records: false } };
  const text = await res.text(); let j = null; try { j = JSON.parse(text); } catch (e) { /* not JSON */ }
  if (!res.ok) throw new Error('Zoho CRM ' + res.status + (j && j.code ? ' ' + j.code : '') + (j && j.message ? ': ' + j.message : ''));
  return j || { data: [], info: { more_records: false } };
}

/** 'YYYY-MM' -> Map(email -> { qa, audits }) */
async function monthQA(key) {
  if (!/^\d{4}-\d{2}$/.test(key)) throw new Error('Bad month');
  const [y, m] = key.split('-').map(Number), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const now = new Date(), current = now.getUTCFullYear() === y && now.getUTCMonth() + 1 === m;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < (current ? 30 * 60e3 : 12 * 3600e3)) return hit.map;
  const sums = new Map();
  for (let offset = 0; offset < 20000; offset += 2000) {
    const q = `select Callee_Details_Name.email, Total_Score_Formula from Call_Audits where Audit_Complete_Date between '${key}-01' and '${key}-${String(last).padStart(2, '0')}' and Stage not in (${EXCLUDE.map((s) => `'${s}'`).join(',')}) order by id limit ${offset}, 2000`;
    const j = await coql(q);
    for (const r of j.data || []) {
      const email = lc(r['Callee_Details_Name.email']); if (!email) continue;
      const s = sums.get(email) || { total: 0, n: 0 }; s.total += Number(r.Total_Score_Formula) || 0; s.n++; sums.set(email, s);
    }
    if (!j.info || !j.info.more_records) break;
  }
  const map = new Map([...sums].map(([e, s]) => [e, { qa: r2(s.total / s.n), audits: s.n }]));
  _cache.set(key, { at: Date.now(), map });
  return map;
}

module.exports = { monthQA, EXCLUDE, coql };
