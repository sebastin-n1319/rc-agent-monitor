import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sqlite3 = require('sqlite3');
const cq = require('../../lib/call-qa.js');
const ct = require('../../lib/call-qa-teach.js');

const q = (db, sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
let db, judge = [];
beforeAll(async () => {
  db = new sqlite3.Database(':memory:');
  cq.setDB(db); await cq.initSchema(); ct.setDB(db); await ct.initSchema();
  ct.setDeps({ cq, ai: { bestJSON: async (o) => {
    if (/Write questions/.test(o.system)) { const u = JSON.parse(o.user); return { json: { questions: Array.from({ length: u.how_many }, (_, i) => ({ kind: 'scenario', topic: i ? 'hold' : 'survey', question: 'Question number ' + i + ' about scoring?', context: 'A made-up call.', needs: ['the decision', 'when it applies'] })) } }; }
    if (/check new QA rules/.test(o.system)) return { json: { conflicts: [] } };
    return { json: judge.shift() };
  } } });
});

describe('Teach the AI', () => {
  it('manages QA reviewers (adit.com only)', async () => {
    expect(await ct.setTrainers('qa.one@adit.com, x@gmail.com, QA.Two@adit.com')).toEqual(['qa.one@adit.com', 'qa.two@adit.com']);
    expect(await ct.isTrainer('QA.ONE@adit.com')).toBe(true);
    expect(await ct.isTrainer('agent@adit.com')).toBe(false);
  });
  it('writes the day’s questions once', async () => {
    const t = await ct.today('qa.one@adit.com', false);
    expect(t.items).toHaveLength(8);
    const again = await ct.today('qa.one@adit.com', false);
    expect(again.items).toHaveLength(8);
  });
  it('follows up until the answer is enough, then the confirmed rule goes into the auditor', async () => {
    const t = await ct.today('qa.one@adit.com', false);
    const id = t.items[0].id;
    judge.push({ sufficient: false, missing: ['when it applies'], followup: 'Does this apply on calls that end with a ticket created?' });
    let it = await ct.answer(id, 'qa.one@adit.com', false, 'Not fatal');
    expect(it.status).toBe('followup');
    expect(it.thread.map((x) => x.role)).toEqual(['qa', 'ai']);
    judge.push({ sufficient: true, rules: [{ param: 'survey', text: 'A missing survey pitch is never fatal; mark Call Closing missed only on FCR calls the agent closed.' }] });
    it = await ct.answer(id, 'qa.one@adit.com', false, 'Only on FCR calls the agent closed, mark Call Closing missed.');
    expect(it.status).toBe('confirm');
    const draft = it.rules[0];
    it = await ct.confirm(id, 'qa.one@adit.com', false, [{ id: draft.id, text: draft.text + ' Partial pitches count as offered.' }]);
    expect(it.status).toBe('done');
    const rules = JSON.parse((await q(db, `SELECT v FROM cq_state WHERE k = 'qa_rules'`))[0].v);
    expect(rules[0].text).toMatch(/Partial pitches count as offered/);
  });
  it('keeps other people out of a question', async () => {
    const t = await ct.today('qa.one@adit.com', false);
    await expect(ct.answer(t.items[1].id, 'qa.two@adit.com', false, 'hi there')).rejects.toThrow(/not found/);
  });
  it('lets an admin pick the survey rule and switch rules off', async () => {
    let a = await ct.setSurveyMode('closing'); expect(a.surveyMode).toBe('closing');
    await expect(ct.setSurveyMode('x')).rejects.toThrow();
    a = await ct.setRule(a.rules[0].id, 'off', 'admin@adit.com');
    expect(a.rules[0].status).toBe('off');
    expect(JSON.parse((await q(db, `SELECT v FROM cq_state WHERE k = 'qa_rules'`))[0].v)).toEqual([]);
  });
});

describe('survey modes in the auditor', () => {
  const base = () => ({ stage: 'Resolved', params: Object.fromEntries(cq.PARAMS.map((p) => [p[0], { r: 'met' }])), fatal: Object.fromEntries(cq.FATALS.map((f) => [f[0], { hit: false }])), survey: { required: true, pitched: 'no' } });
  it('fatal, closing or left to the AI', () => {
    expect(cq.enforce(base(), [{}]).fatal.survey.hit).toBe(true);
    const c = cq.enforce(base(), [{}], { surveyMode: 'closing' });
    expect(c.fatal.survey.hit).toBe(false); expect(c.params.closing.r).toBe('missed');
    const r = base(); r.fatal.survey = { hit: true, why: 'x' };
    expect(cq.enforce(r, [{}], { surveyMode: 'ai' }).fatal.survey.hit).toBe(true);
    expect(cq.enforce(base(), [{}], { surveyMode: 'ai' }).fatal.survey.hit).toBe(false);
  });
});
