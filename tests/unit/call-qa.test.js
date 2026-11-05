import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const cq = require('../../lib/call-qa.js');

const db = new sqlite3.Database(':memory:');
const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
const allMet = () => Object.fromEntries(cq.PARAMS.map((p) => [p[0], { r: 'met' }]));
const noFatal = () => Object.fromEntries(cq.FATALS.map((f) => [f[0], { hit: false }]));

describe('Call QA scoring', () => {
  it('weights add up to 100', () => {
    expect(cq.PARAMS.reduce((a, p) => a + p[2], 0)).toBe(100);
    expect(cq.scoreOf({ params: allMet(), fatal: noFatal() })).toBe(100);
  });
  it('missed loses its weight, N/A keeps it, any fatal makes it 0', () => {
    const p = allMet(); p.probing = { r: 'missed' }; p.verification = { r: 'na' };
    expect(cq.scoreOf({ params: p, fatal: noFatal() })).toBe(83);
    const f = noFatal(); f.survey = { hit: true };
    expect(cq.scoreOf({ params: p, fatal: f })).toBe(0);
  });
  it('overrides change results and the score', () => {
    const p = allMet(); p.documentation = { r: 'missed' };
    const res = { stage: 'Resolved', params: p, fatal: noFatal() };
    const out = cq.applyOverrides(res, [{ field: 'documentation', value: 'met', reason: 'Notes are complete' }, { field: 'rude', value: 'hit', reason: 'Sarcastic' }, { field: 'stage', value: 'Ticket Created' }]);
    expect(out.params.documentation.r).toBe('met');
    expect(out.stage).toBe('Ticket Created');
    expect(cq.scoreOf(out)).toBe(0);
    expect(res.params.documentation.r).toBe('missed'); // original untouched
  });
  it('shapes a sloppy AI answer into the full rubric', () => {
    const s = cq.shapeResult({ stage: 'Odd', params: { probing: { r: 'missed', why: 'No ticket asked' } }, fatal: { rude: { hit: 'yes' } }, survey: { pitched: 'full' } });
    expect(s.stage).toBe('Resolved');
    expect(Object.keys(s.params).length).toBe(16);
    expect(s.params.probing.r).toBe('missed');
    expect(s.params.opening.r).toBe('na');
    expect(s.fatal.rude.hit).toBe(false); // only true counts
    expect(s.survey.pitched).toBe('full');
  });
});

describe('Call QA pipeline', () => {
  const sent = [];
  beforeAll(async () => {
    cq.setDB(db);
    await cq.initSchema();
    cq.setDeps({
      agents: async () => [{ name: 'Audrey Miles', email: 'audrey.miles@adit.com', rc_id: '111' }],
      dayWindow: (d) => ({ start: new Date(d + 'T05:00:00Z'), end: new Date(Date.parse(d + 'T05:00:00Z') + 864e5) }),
      rc: {
        listRecordedCalls: async () => [
          { id: 'c1', startTime: '2026-11-02T15:00:20Z', duration: 480, direction: 'Inbound', recording: { id: 'r1', contentUri: 'https://x/r1' } },
          { id: 'c2', startTime: '2026-11-02T16:00:00Z', duration: 200, direction: 'Inbound', recording: { id: 'r2', contentUri: 'https://x/r2' } },
        ],
        fetchRecording: async () => ({ buf: Buffer.from('mp3'), mime: 'audio/mpeg' }),
      },
      kbq: async (sql) => {
        sent.push(sql);
        if (/FROM call_facts/.test(sql)) return { rows: [{ avoma_uuid: 'av1', start_at: '2026-11-02T15:00:18Z', duration_seconds: 480, account_id: 'acc1', has_transcript: true }, { avoma_uuid: 'av9', start_at: '2026-11-02T18:00:00Z', duration_seconds: 90, account_id: null, has_transcript: true }] };
        if (/shiv_avoma_transcripts/.test(sql)) return { rows: [{ full_text: '[3.5s] Audrey Miles: Thank you for calling Adit. This is Audrey. May I have your name and the account number?\n[10s] Client: Sure.' }] };
        if (/FROM desk_tickets/.test(sql)) return { rows: [{ id: '9', ticket_number: '424000', subject: 'Phones down', status: 'Closed', channel: 'Phone', web_url: 'https://t/9' }] };
        return { rows: [] };
      },
      ai: {
        anyConfigured: () => true,
        transcribe: async () => 'Agent: thank you for calling Adit, my name is Audrey. Client: my phones are not ringing at all today.',
        bestJSON: async () => ({ json: { stage: 'Resolved', callType: 'Phones not ringing', fcr: true, params: Object.assign(allMet(), { probing: { r: 'missed', why: 'Did not ask for a ticket' } }), fatal: noFatal(), survey: { required: true, pitched: 'full' }, summary: 'ok', confidence: 'high' }, model: 'test' }),
      },
    });
  });
  it('matches RingCentral recordings with Avoma calls and keeps Avoma-only calls', async () => {
    const r = await cq.discover('2026-11-02');
    expect(r.added).toBe(3);
    const rows = await q('SELECT call_key, source, avoma_uuid, account_id FROM cq_calls ORDER BY call_key');
    expect(rows).toEqual([
      { call_key: 'Aav9', source: 'avoma', avoma_uuid: 'av9', account_id: null },
      { call_key: 'Rr1', source: 'rc+avoma', avoma_uuid: 'av1', account_id: 'acc1' },
      { call_key: 'Rr2', source: 'rc', avoma_uuid: null, account_id: null },
    ]);
    // The agent's email is only filtered on, never returned (AditKB caps results that carry personal data).
    expect(sent.filter((s) => /call_facts/.test(s)).every((s) => !/SELECT[^]*organizer_email[^]*FROM/.test(s))).toBe(true);
    expect((await cq.discover('2026-11-02')).added).toBe(0);
  });
  it('audits from Avoma or the transcribed recording, links the ticket and scores', async () => {
    const [a] = await q(`SELECT id FROM cq_calls WHERE call_key = 'Rr1'`);
    const r = await cq.auditOne(a.id);
    expect(r).toEqual({ done: true, total: 83 });
    const [x] = await q('SELECT status, transcript_source, total, tickets FROM cq_calls WHERE id = ?', [a.id]);
    expect(x.status).toBe('done'); expect(x.transcript_source).toBe('avoma');
    expect(JSON.parse(x.tickets)[0].number).toBe('424000');
    const [b] = await q(`SELECT id FROM cq_calls WHERE call_key = 'Rr2'`);
    await cq.auditOne(b.id);
    const [y] = await q('SELECT transcript_source FROM cq_calls WHERE id = ?', [b.id]);
    expect(y.transcript_source).toBe('rc');
  });
  it('lists and corrects audits, and summarises by agent', async () => {
    const from = '2026-11-02T05:00:00Z', to = '2026-11-03T05:00:00Z';
    const list = await cq.list({ from, to });
    const one = list.find((c) => c.total === 83);
    expect(one.missed).toEqual(['Probing']);
    await expect(cq.override(one.id, { email: 's@adit.com' }, { field: 'probing', value: 'met', reason: '' })).rejects.toThrow();
    const d = await cq.override(one.id, { email: 's@adit.com' }, { field: 'probing', value: 'met', reason: 'She asked for the ticket number' });
    expect(d.total).toBe(100); expect(d.aiTotal).toBe(83);
    const s = await cq.summary({ from, to });
    expect(s.totals.audited).toBe(2);
    expect(s.agents[0].name).toBe('Audrey Miles');
  });
  it('compares AI and human QA on the same calls', async () => {
    const fields = Object.fromEntries(cq.PARAMS.map((p) => [p[3], 'Yes'])); fields.Probing = 'No';
    await q(`INSERT INTO cq_human (id, name, agent_email, stage, total, fields, avoma_uuid, created_at, completed) VALUES ('h1', 'CA - 1', 'audrey.miles@adit.com', 'Resolved', 83, ?, 'av1', '2026-11-02T15:00:20Z', '2026-11-03')`, [JSON.stringify(fields)]);
    await q(`INSERT INTO cq_calls (call_key, kind, status, result, total, stage, human_id, agent_name, started_at) SELECT 'Hh1', 'calib', 'done', result, total, stage, 'h1', agent_name, started_at FROM cq_calls WHERE call_key = 'Rr1'`);
    const a = await cq.agreement();
    expect(a.calls).toBe(1);
    expect(a.avgDiff).toBe(0);
    const pr = a.params.find((p) => p.key === 'probing');
    expect(pr.agreePct).toBe(100); expect(pr.caughtPct).toBe(100);
  });
});

describe('Call QA rules that hold whatever the AI says', () => {
  const base = () => ({ stage: 'Resolved', params: Object.fromEntries(cq.PARAMS.map((p) => [p[0], { r: 'met' }])), fatal: Object.fromEntries(cq.FATALS.map((f) => [f[0], { hit: false }])), survey: { required: true, pitched: 'partial' } });
  it('a pitch in the agent\'s own words is not a survey fatal', () => {
    const r = base(); r.fatal.survey = { hit: true, why: 'Not word for word' };
    expect(cq.enforce(r, [{}]).fatal.survey.hit).toBe(false);
  });
  it('no pitch at all on a call that needed it is a survey fatal', () => {
    const r = base(); r.survey.pitched = 'no';
    expect(cq.enforce(r, [{}]).fatal.survey.hit).toBe(true);
  });
  it('no ticket found is never a documentation fatal', () => {
    const r = base(); r.fatal.documentation_task = { hit: true }; r.params.documentation = { r: 'missed' };
    const out = cq.enforce(r, []);
    expect(out.fatal.documentation_task.hit).toBe(false);
    expect(out.params.documentation.r).toBe('na');
  });
});
