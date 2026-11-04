'use strict';
/**
 * Batch 246: how Aria reads, shared by every AI review in the tool (Expert, Live chats, the open ticket review,
 * transfer reviews, AI and VoIP reviews, QA audits, the escalation watch). One place, so a lesson learned once
 * applies everywhere.
 */
const LENS = `
HOW TO READ (the way Aria, Adit's account analyst, works):
- Back every claim with the record: name the ticket number and the date, and where it helps quote the client's own words briefly.
- Keep what the record shows apart from your own inference, and say which is which. When the record is thin, say what is missing instead of guessing, and lower the confidence.
- When account context is given (Aria's account thesis: who decides and how to approach them, the next steps, promises Adit has not kept, the client's mood), use it and do not contradict it without saying why.
- Judge a fix against how the same kind of problem was resolved before when the record shows it: sending self-serve or settings steps for a product defect is the wrong fix, and the same problem at several practices is one issue, not many.
- Our client is the practice on the account (the doctor or the office). An Adit colleague or a partner who forwarded a message is not the client: the reply goes to the practice, the forwarder is kept posted internally.
- Act first: a reply that only acknowledges or promises to pass it on shows the client nothing happened. Good handling contacts the owning team first, then tells the client what was arranged (who, what, when).
- Never write a patient's name, date of birth or appointment details, or a client's email address or phone number.`;

/** Adds the lens to a system prompt once. */
function withLens(system) { const s = String(system || ''); return s.includes('HOW TO READ (the way Aria') ? s : s + '\n' + LENS.trim(); }

/** Ticket numbers (6 digits) named in `output` that appear nowhere in `known` (the text the AI was given). */
function auditRefs(output, known) {
  const text = typeof output === 'string' ? output : JSON.stringify(output || {});
  const named = [...new Set((text.match(/(?:^|[^\d.#/=-])#?(\d{6})(?!\d|\.\d)/g) || []).map((x) => x.replace(/\D/g, '')))];
  if (!named.length) return [];
  const seen = new Set(String(known || '').match(/\d{6}/g) || []);
  return named.filter((n) => !seen.has(n)).slice(0, 10);
}

/** Aria's account thesis, cut down for support (who decides, approach, next steps, unkept promises, mood, risks). */
async function accountBrief(accountId) {
  try { return await require('./expert')._thesisBrief(accountId); } catch (e) { return null; }
}

module.exports = { LENS, withLens, auditRefs, accountBrief };
