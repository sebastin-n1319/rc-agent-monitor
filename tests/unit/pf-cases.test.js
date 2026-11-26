import { describe, it, expect, beforeEach } from 'vitest';
const sqlite3 = require('sqlite3');
const PF = require('../../lib/pf-cases');

let aiCalls;
const ai = (verdict) => ({ claudeJSON: async ({ user }) => { aiCalls.push(user); return { json: verdict(user) }; } });
const yes = () => ({ pf: true, type: 'New Form', confidence: 0.92, reason: 'Asks to add an attached form' });
const no = () => ({ pf: false, type: null, confidence: 0.9, reason: 'A form is not sending' });

describe('Patient forms detection, watch only (Batch 421)', () => {
  beforeEach(async () => { const db = new sqlite3.Database(':memory:'); PF.setDB(db); await PF.initSchema(); aiCalls = []; PF.setDeps({ ai: ai(yes), waitMs: 0 }); });

  it('keyword rules follow the old Desk detector', () => {
    expect(PF.keywords({ subject: 'New consent forms to add', body: '' }).hit).toBe(true);
    expect(PF.keywords({ subject: 'New patient forms not being uploaded', body: '' }).hit).toBe(true); // keywords alone get this wrong
    expect(PF.keywords({ subject: 'Forms not sending to patients', body: '' }).hit).toBe(false);
    expect(PF.keywords({ subject: 'Patient forms', body: 'Can you create a new form from the attached PDF?' }).hit).toBe(true);
    expect(PF.keywords({ subject: 'Update our medical history form in Spanish', body: '' }).type).toBe('Spanish Version');
    expect(PF.keywords({ subject: 'Please update the intake form', body: '' }).type).toBe('Edit Existing Form');
    expect(PF.keywords({ subject: 'Invoice question', body: 'hello' }).formWord).toBe(false);
  });

  it('suggests only when keywords and the AI agree, and changes nothing anywhere', async () => {
    const r = await PF.classify({ id: '1', number: '500001', subject: 'New consent form to add', body: 'Please add the attached consent form. Call 904-555-1234', source: 'live' });
    expect(r.would).toBe('suggest');
    expect(r.would_do).toMatch(/pf-suggested/);
    expect(aiCalls[0]).not.toMatch(/904-555-1234/); // contact details scrubbed before the AI
    PF.setDeps({ ai: ai(no) });
    const r2 = await PF.classify({ id: '2', number: '500002', subject: 'New patient forms not being uploaded', body: '', source: 'live' });
    expect(r2.would).toBe('none');
    PF.setDeps({ ai: ai(() => ({ pf: true, type: 'New Form', confidence: 0.6 })) });
    expect((await PF.classify({ id: '3', number: '500003', subject: 'New form request', body: '' })).would).toBe('none'); // low confidence
  });

  it('uses past PF cases as examples, and new labels join them', async () => {
    await PF.classify({ id: '10', number: '1', subject: 'Add records release authorization form', body: 'attached pdf', asanaHint: true, source: 'replay' }, { useAi: false });
    await PF.classify({ id: '11', number: '2', subject: 'Records release form not sending', body: '', source: 'replay' }, { useAi: false });
    await PF.label('11', { label: 'not_pf', by: 'lead@adit.com' });
    const ex = await PF.examples({ id: '99', subject: 'Records release authorization form', body: '' });
    expect(ex.pos.map((r) => r.ticket_id)).toEqual(['10']);
    expect(ex.neg.map((r) => r.ticket_id)).toEqual(['11']);
    await PF.classify({ id: '12', number: '3', subject: 'New records release form to add', body: '' });
    expect(aiCalls.pop()).toMatch(/NEEDED the PF team[\s\S]*NOT a PF request/);
  });

  it('measures precision on labels and holds the gate below 95% on 50 cases', async () => {
    for (let i = 0; i < 4; i++) await PF.classify({ id: 'x' + i, number: String(i), subject: 'New intake form to add', body: '' });
    await PF.label('x0', { label: 'pf', type: 'New Form', by: 'ronnie@adit.com' });
    await PF.label('x1', { label: 'pf', type: 'Edit Existing Form', by: 'ronnie@adit.com' });
    await PF.label('x2', { label: 'not_pf', by: 'ronnie@adit.com' });
    const s = await PF.stats();
    expect(s.suggest.labelled).toBe(3); expect(s.suggest.precision).toBe(66.7);
    expect(s.typeAccuracy).toBe(50);
    expect(s.gate).toBe(false);
    await expect(PF.label('x3', { label: 'maybe' })).rejects.toThrow(/pf or not_pf/);
    expect((await PF.list({ view: 'tolabel' })).total).toBe(1);
  });

  it('live: reads the ticket, skips what the old detector skipped, and never writes to Desk', async () => {
    const writes = [];
    const T = { id: '777', ticketNumber: '500777', subject: 'New consent forms to add', description: 'Please add the attached form', teamId: '197800000052125116', status: 'Open', statusType: 'Open', createdTime: new Date().toISOString(), email: 'dr@x.com', assignee: { firstName: 'Sabrina', lastName: 'Quinn' } };
    let tags = { data: [] }, comments = { data: [] };
    PF.setDeps({ deskRead: async (p, m) => { if (m) writes.push(p); return /tags/.test(p) ? tags : /comments/.test(p) ? comments : T; } });
    const ev = { eventType: 'Ticket_Add', payload: { id: '777', direction: 'in' } };
    expect((await PF.onDeskEvent(ev))[0].would).toBe('suggest');
    PF.setDeps({}); // new events within 10 minutes are ignored for the same ticket
    expect(await PF.onDeskEvent(ev)).toEqual([]);
    tags = { data: [{ name: 'pf-request' }] };
    const out = await PF.onDeskEvent({ eventType: 'Ticket_Add', payload: { id: '778' } });
    expect(out[0].skip).toMatch(/already tagged pf-request/);
    tags = { data: [] }; comments = { data: [{ content: 'Task https://app.asana.com/0/1202095993396108/123456789012' }] };
    expect((await PF.onDeskEvent({ eventType: 'Ticket_Add', payload: { id: '779' } }))[0].skip).toMatch(/Asana/);
    Object.assign(T, { teamId: '9' });
    expect((await PF.onDeskEvent({ eventType: 'Ticket_Add', payload: { id: '780' } }))[0].skip).toMatch(/not a T1/);
    expect(writes).toEqual([]);
    await PF.setSetting('mode', 'off');
    expect(await PF.onDeskEvent({ eventType: 'Ticket_Add', payload: { id: '781' } })).toEqual([]);
  });

  it('replay saves PF hints first, then classifies with the AI once per ticket', async () => {
    PF.setDeps({ kbq: async (sql) => /desk_ticket_comments/.test(sql) ? { rows: [{ ticket_id: '201' }] }
      : { rows: [{ id: '201', ticket_number: '9201', subject: 'Add new intake form', body: 'attached', created_time: '2026-11-01' }, { id: '202', ticket_number: '9202', subject: 'Forms not syncing', body: '', created_time: '2026-11-02' }] } });
    await PF.replay({ days: 30 });
    for (let i = 0; i < 50 && !PF.replayStatus().done; i++) await new Promise((r) => setTimeout(r, 10));
    const st = PF.replayStatus();
    expect(st.total).toBe(2); expect(st.checked).toBe(2);
    expect(aiCalls.length).toBe(2);
    expect((await PF.list({ view: 'all' })).rows.find((r) => r.ticket_id === '201').asana_hint).toBe(1);
    await PF.replay({ days: 30 });
    for (let i = 0; i < 50 && !PF.replayStatus().done; i++) await new Promise((r) => setTimeout(r, 10));
    expect(aiCalls.length).toBe(2); // already classified: no second AI call
  });
});
