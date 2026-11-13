import { describe, it, expect } from 'vitest';
const sqlite3 = require('sqlite3');
const dn = require('../../lib/ticket-doc-note.js');

describe('ticket documentation notes (Batch 328)', () => {
  it('writes the first note in the team format, then one case update note edited in place', async () => {
    const db = new sqlite3.Database(':memory:'); dn.setDB(db); await dn.initSchema(); dn._reset();
    let threads = [{ id: 't1', direction: 'in', status: 'SUCCESS' }], comments = [];
    const writes = []; let n = 0;
    const T = { id: '1978000555', ticketNumber: '123456', teamId: '197800000052125116', statusType: 'Open', email: 'evan.cruz@adit.com', phone: '1234567890', contact: { firstName: 'Evan', lastName: 'Cruz', account: { accountName: 'Evan Cruz Chiropractic' } } };
    dn.setDeps({
      deskRead: async (p) => /threads/.test(p) ? { data: threads } : /comments/.test(p) ? { data: comments } : T,
      ticket: { load: async () => ({ text: 'ticket text', meta: {} }) },
      expert: { crmContext: async () => ({ header: { stage: 'CSM', csm: 'Molly Smith', escalation: 'Open T2', escalationOwner: 'Richard Roe' }, account: { number: '12345' }, facts: { stage: 'CSM', csm: 'Molly Smith', escalation: 'Open T2' } }) },
      ai: { bestJSON: async (o) => ({ json: /FIRST note/.test(o.user) ? { query: 'Client reported a payment posted to the wrong account type.', trouble: ['Reviewed the concern.'], next: ['Review the account.'] } : { query: '', trouble: ['Reviewed the concern.', 'Advised the ledger fix in ChiroTouch.'], next: ['Confirm with the client.'] } }) },
      write: { note: async (id, cm, html) => { writes.push({ id, cm: cm && cm.id, html }); comments.push({ id: cm ? cm.id : 'c' + (++n), content: html }); return { id: cm ? cm.id : 'c' + n }; } },
    });
    const r1 = await dn.touch('1978000555');
    expect(r1.created).toBe('initial');
    const h = writes[0].html;
    for (const k of ['Client Name: Evan Cruz', 'Practice Name: Evan Cruz Chiropractic', 'Account Number: 12345', 'Deal Stage: CSM | Molly', 'Callback Number: (123) 456-7890', 'Email: evan.cruz@adit.com', 'Ticket Number: #123456', 'Any Escalation Ticket Open: Yes - Open T2 | Richard', "Client's Query:", 'Troubleshooting Done Till Now:', 'Next Steps:']) expect(h).toContain(k.replace("'", "'"));
    expect((await dn.touch('1978000555')).skipped).toBe('no change');
    // the client replies: one case update note, without the header
    threads = threads.concat([{ id: 't2', direction: 'in', status: 'SUCCESS' }]);
    const r2 = await dn.touch('1978000555');
    expect(r2.updated).toBe(true);
    expect(writes[1].cm).toBeFalsy();
    expect(writes[1].html).toMatch(/Case update/);
    expect(writes[1].html).not.toMatch(/Client Name/);
    // an agent adds their own note: the same update note is edited
    comments.push({ id: 'agent1', content: 'Called the office, left a voicemail.' });
    const r3 = await dn.touch('1978000555');
    expect(r3.updated).toBe(true);
    expect(writes[2].cm).toBe(writes[1].cm || 'c2');
    expect(writes.length).toBe(3);
  });
  it('skips tickets outside T1', async () => {
    dn.setDeps({ deskRead: async () => ({ id: '1', ticketNumber: '1', teamId: '999', statusType: 'Open' }) });
    expect((await dn.touch('1')).skipped).toMatch(/T1/);
  });
});
