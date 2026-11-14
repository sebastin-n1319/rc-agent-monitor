import { describe, it, expect } from 'vitest';
const sqlite3 = require('sqlite3');
const lib = require('../../lib/expert-library.js');

describe('Expert library (Batch 335)', () => {
  it('discovers topics, builds a page from sources, matches questions, files back confirmed answers and lints', async () => {
    const db = new sqlite3.Database(':memory:'); lib.setDB(db); await lib.initSchema();
    await new Promise((r) => db.run(`CREATE TABLE expert_log (id INTEGER PRIMARY KEY, question TEXT, module TEXT, created_at TEXT DEFAULT (datetime('now')))`, r));
    await new Promise((r) => db.run(`INSERT INTO expert_log (question, module) VALUES ('How do I customize appointment reminders for a practice?', 'Engage')`, r));
    const calls = [];
    lib.setDeps({
      expert: {
        searchLocal: async () => [{ src: 'kb', id: 'a1', title: 'Appointment Reminders', section: 'Edit', url: 'https://help.adit.com/x', text: 'Go to Engage > Auto-Reminders > Appointment Reminders and click the pencil icon. Call 555-123-4567 for help.' }],
        searchCases: async () => [], bust: () => {},
      },
      ai: {
        chatJSON: async (o) => { calls.push('chat'); return /TOPICS/.test(o.messages[0].content) ? { json: { topics: [{ title: 'Customize appointment reminders', module: 'Engage', keywords: 'appointment reminder customize edit message auto-reminders', count: 3 }] } } : { json: { issues: ['The page does not say reminders need the EHR connected.'] } }; },
        bestJSON: async (o) => { calls.push('best'); if (/TOPICS/.test(o.system)) return { json: { topics: [{ title: 'Customize appointment reminders', module: 'Engage', keywords: 'appointment reminder customize edit message auto-reminders', examples: ['How do I change the reminder text?'], count: 3 }, { title: 'Adit Pay feature questions and support', module: 'Adit Pay', keywords: 'pay', count: 9 }] } }; return { json: { summary: 'How to change appointment reminders', keywords: 'appointment reminders customize edit engage auto-reminders', body: 'WHAT IT IS: Automatic texts before appointments.\nT1 OR HAND OVER: T1 handles it.\nSTEPS:\n1. Engage > Auto-Reminders > Appointment Reminders.\n2. Click the pencil icon and edit the message.\nCHECK FIRST: which reminder.\nGOTCHAS: needs the EHR connected. Call 555-123-4567.\nSAY TO THE CLIENT: Happy to help.\nCONFLICTS: None', conflicts: ['None'], sources: [1] } }; },
      },
    });
    const found = await lib.discover();
    expect(found.map((t) => t.slug)).toEqual(['customize-appointment-reminders']);
    // a module-wide title is dropped (Batch 336)
    expect(lib._tooBroad('Adit Pay feature questions and support')).toBe(true);
    expect(lib._tooBroad('Account, billing and user compliance inquiries')).toBe(true);
    expect(lib._tooBroad('Request a phone number port-out')).toBe(false);
    const b = await lib.build('customize-appointment-reminders');
    expect(b.built).toBe('customize-appointment-reminders');
    const p = await lib.page('customize-appointment-reminders');
    expect(p.body).toMatch(/Engage > Auto-Reminders/);
    expect(p.body).not.toMatch(/555-123-4567/); // contact details are scrubbed
    expect(p.sources[0].url).toBe('https://help.adit.com/x');
    // the same sources again: nothing to rebuild
    expect((await lib.build('customize-appointment-reminders')).skipped).toBe('no change');
    // matching
    const m = await lib.match('client wants to edit the appointment reminder message in engage');
    expect(m.slug).toBe('customize-appointment-reminders');
    expect(m.strong).toBe(true);
    expect(await lib.match('port out my fax number to a new carrier')).toBe(null);
    // the page is a search chunk Expert reads
    const ch = await lib.chunks();
    expect(ch[0].src).toBe('page');
    // file back a confirmed answer, once
    expect(await lib.fileBack({ question: 'How to edit appointment reminder text?', answer: 'Engage > Auto-Reminders, pencil icon.', via: 'thumbs up' })).toBe('customize-appointment-reminders');
    expect(await lib.fileBack({ question: 'How to edit appointment reminder text?', answer: 'again', via: 'thumbs up' })).toBe(null);
    expect((await lib.page('customize-appointment-reminders')).confirmed.length).toBe(1);
    // lint
    const issues = await lib.lint('customize-appointment-reminders');
    expect(issues.length).toBe(1);
    const ov = await lib.overview();
    expect(ov.totals).toMatchObject({ pages: 1, ready: 1, confirmed: 1, issues: 1 });
    expect(ov.log.map((l) => l.kind)).toEqual(expect.arrayContaining(['discover', 'ingest', 'fileback', 'lint']));
  });
  it('a light-model check picks the page, or none, so shared words alone never pick a page (Batch 336)', async () => {
    lib.setDeps({ ai: { chatJSON: async (o) => /PAGES/.test(o.messages[1].content) ? { json: /reminder message/.test(o.messages[1].content) ? { pick: 1, covers: 'full' } : { pick: 0 } } : { json: {} } } });
    expect(await lib.match('appointment reminder engage edit, our patient forms are stuck importing')).toBe(null);
    const m = await lib.match('how to edit the appointment reminder message in engage');
    expect(m.slug).toBe('customize-appointment-reminders');
    expect(m.strong).toBe(true);
  });
  it('a new Adit Update rebuilds the pages it touches, with the update as a source (Batch 340)', async () => {
    let items = [{ id: 1, title: 'Old change', summary: 'old', postedAt: '2026-11-01' }];
    let seenUser = '';
    lib.setDeps({ updates: { archive: async () => ({ items }) }, ai: { chatJSON: async () => ({ json: {} }), bestJSON: async (o) => { seenUser = o.user; return { json: { summary: 'How to change appointment reminders', keywords: 'appointment reminders customize edit engage', body: 'WHAT IT IS: Automatic texts.\nSTEPS:\n1. Engage > Auto-Reminders > Appointment Reminders, now under the new Reminders tab.\n2. Edit.\nCONFLICTS: None, plenty of text to pass the length check here.', conflicts: [], sources: [1] } }; } } });
    expect((await lib.refreshForUpdates()).first).toBe(true);
    items = items.concat([{ id: 2, title: 'Appointment reminders moved to a new Reminders tab in Engage', summary: 'Edit appointment reminder message text from the Reminders tab.', postedAt: '2026-11-14' }]);
    const r = await lib.refreshForUpdates();
    expect(r).toMatchObject({ fresh: 1, rebuilt: 1 });
    expect(seenUser).toContain('[UPDATE] Appointment reminders moved');
    expect((await lib.refreshForUpdates()).fresh).toBe(0);
  });
});
