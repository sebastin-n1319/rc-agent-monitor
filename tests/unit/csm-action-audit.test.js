import { describe, it, expect } from 'vitest';
const os = require('os'), path = require('path');
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }
const ca = require('../../lib/csm-action-audit.js');

describe('CSM action audit', () => {
  it('cleans notes and keeps contact details out', () => {
    expect(ca._clean('<div>zsu[@user:852209043]zsu Spoke to Jen&nbsp;at (973) 405-7698, mail a@b.com about zsu[#420109:1:1]zsu</div>'))
      .toBe('@someone Spoke to Jen at [phone], mail [email] about #420109');
  });
  it('puts CSM phone calls in the timeline under their Desk name', () => {
    const x = { ticket: { ticket_number: '420109', subject: 'Billing', channel: 'Phone', status: 'Closed', owner_user_name: 'Alexis Harris', cf_owner_change_log: '' }, comments: [], threads: [],
      calls: [{ start_at: '2026-10-22T19:42:57Z', duration_seconds: 1227, who: 'alexis.harris' }, { start_at: '2026-10-22T19:36:26Z', duration_seconds: 305, who: 'richard' }] };
    const who = (n) => (/alexis|richard/i.test(n) ? '[CSM]' : '[other team]');
    const t = ca._timeline(x, who, new Map([['richard', 'Richard Marshall']]));
    expect(t).toContain('Phone call with the client by Alexis Harris [CSM], 20 min');
    expect(t).toContain('Phone call with the client by Richard Marshall [CSM], 5 min');
  });
  it.skipIf(!sqlite3)('reads the timeline, asks once, and reuses the answer until the ticket changes', async () => {
    const db = new sqlite3.Database(path.join(os.tmpdir(), 'caa-' + Date.now() + '.db'));
    ca.setDB(db); await ca.initSchema();
    let asked = [], comments = [{ ticket_id: '111111', author_name: 'Alexis Harris', created_time: '2026-10-22T21:03:51Z', content: '<p>Spoke with the client about billing</p>' }];
    ca.setDeps({
      query: async (sql) => /FROM desk_tickets/.test(sql) ? { rows: [{ id: '111111', ticket_number: '420109', subject: 'Billing', channel: 'Phone', status: 'Closed', owner_user_name: 'Alexis Harris', cf_owner_change_log: 'Owner changed to Alexis Harris on 2026-10-22 14:40:00 | Role : Tech CSM' }] }
        : /desk_ticket_comments/.test(sql) ? { rows: comments } : { rows: [] },
      ai: { isAnthropicConfigured: () => true, claudeJSON: async (o) => { asked.push(o.user); return { json: { transfer: 'correct', csm_action: 'real action', note: 'CSM called the client about billing.' } }; } } });
    const opts = { csmNames: new Set(['alexis harris']), t1Names: new Set(['sabrina quinn']) };
    const r = await ca.audit([{ ticket_id: '111111', csm: 'Alexis Harris' }], opts);
    expect(r.get('111111|alexis harris')).toEqual({ transfer: 'correct', csm_action: 'real action', note: 'CSM called the client about billing.' });
    expect(asked[0]).toContain('Note by Alexis Harris [CSM]: Spoke with the client about billing');
    await ca.audit([{ ticket_id: '111111', csm: 'Alexis Harris' }], opts);
    expect(asked.length).toBe(1); // cached
    comments = comments.concat([{ ticket_id: '111111', author_name: 'Sabrina Quinn', created_time: '2026-10-23T10:00:00Z', content: 'Follow up' }]);
    await ca.audit([{ ticket_id: '111111', csm: 'Alexis Harris' }], opts);
    expect(asked.length).toBe(2); // the timeline changed
    expect(asked[1]).toContain('Note by Sabrina Quinn [T1]');
  });
});
