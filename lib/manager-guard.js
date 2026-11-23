'use strict';
/**
 * Batch 397 (#431198): a client reply may name an account manager (CSM) or onboarding owner only when CRM confirms that
 * person for the account. Any other name next to "account manager", "CSM", "success manager" or "onboarding specialist"
 * is taken out, so the reply says "your account manager" and names nobody.
 */
// Team names and placeholders that sit in the manager fields but are not a person ("Technical Support", "Walter's POD").
const TEAMLIKE = /^(technical support|tech support|customer support|support|csm|csm team|tech csm|unassigned|none|n\/?a|-+|adit|admin|t1|t2)$|\b(team|pod|support|department|queue|group)\b/i;
function person(s) {
  const v = String(s || '').replace(/\s+/g, ' ').trim();
  return v && v.length <= 60 && !TEAMLIKE.test(v) && /[a-z]/i.test(v) ? v : '';
}
const ROLE = "(?:account manager|customer success manager|success manager|CSM|onboarding (?:specialist|manager|owner|lead)|onboarding team member)";
const NAME = "([A-Z][a-zA-Z'\\-]+(?: [A-Z][a-zA-Z'\\-]+){0,2})";
const SKIPWORD = /^(Adit|Our|Your|The|They|He|She|We|Will|Who|This|That|Please|Thanks|Team)$/;
function allowedOf(names) {
  const out = new Set();
  for (const n of names || []) {
    const p = person(n); if (!p) continue;
    out.add(p.toLowerCase());
    out.add(p.split(' ')[0].toLowerCase());
  }
  return out;
}
const ok = (name, allowed) => { const n = String(name).toLowerCase(); return allowed.has(n) || allowed.has(n.split(' ')[0]); };
/** { text, removed: [names] }. names: the CSM and onboarding owner CRM confirms for this account. */
function guard(text, names) {
  let s = String(text || '');
  const allowed = allowedOf(names), removed = [];
  const keep = (name) => SKIPWORD.test(String(name).split(' ')[0]) || ok(name, allowed);
  // "your account manager, Morgan Taylor, will" / "your account manager Morgan Taylor"
  s = s.replace(new RegExp(`(\\b[Yy]our ${ROLE}|\\b[Tt]he ${ROLE}|\\b${ROLE})(,? (?:is )?)${NAME}(,)?`, 'g'), (m, role, sep, name, comma) => {
    if (keep(name)) return m;
    removed.push(name);
    return role + (comma && /,\s*$/.test(sep) ? '' : '');
  });
  // "Morgan Taylor, your account manager," / "Morgan Taylor (your CSM)"
  s = s.replace(new RegExp(`${NAME}(,| \\() ?(your|the) ${ROLE}\\)?(,)?`, 'g'), (m, name, sep, det, comma) => {
    if (keep(name)) return m;
    removed.push(name);
    return det === 'your' ? 'your ' + m.match(new RegExp(ROLE, 'i'))[0] : 'the ' + m.match(new RegExp(ROLE, 'i'))[0];
  });
  // Sentences that now start lower case ("your account manager will" at the start of a sentence)
  s = s.replace(/(^|[.!?]\s+|\n)(your|the) /g, (m, a, w) => a + w[0].toUpperCase() + w.slice(1) + ' ');
  return { text: s, removed };
}
module.exports = { guard, person, TEAMLIKE };
