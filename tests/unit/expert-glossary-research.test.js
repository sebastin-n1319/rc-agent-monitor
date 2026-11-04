import { describe, it, expect, beforeEach } from 'vitest';
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }
const G = require('../../lib/expert-glossary');
const R = require('../../lib/expert-research');
const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('Did you mean? (Batch 247)', () => {
  beforeEach(() => { G._reset(); G.setDeps({ query: async () => ({ rows: [{ display_name: 'Tyler Roden', job_title: 'Tech OB Team Lead', department: 'Tech OB' }, { display_name: 'Tyler Brooks', job_title: 'SDR', department: 'Sales' }, { display_name: 'Tanya Garrison', job_title: 'Tech OB Manager', department: 'Tech OB' }] }), whoDoesWhat: null, agents: null }); });
  it('asks when a first name matches more than one person', async () => {
    const c = await G.didYouMean('What did Tyler promise the practice?');
    expect(c.term).toBe('Tyler');
    expect(c.options.map(o => o.label)).toEqual(['Tyler Roden', 'Tyler Brooks']);
  });
  it('does not ask when the full name is given, the name is unique, or it is a ticket review', async () => {
    expect(await G.didYouMean('What did Tyler Roden promise?')).toBe(null);
    expect(await G.didYouMean('Ask Tanya about the onboarder')).toBe(null);
    expect(await G.didYouMean('#422530 what did Tyler do?')).toBe(null);
  });
  it('reads a lower-case name only after a word that points to a person', async () => {
    expect((await G.didYouMean('tickets handled by tyler last week')).term).toBe('tyler');
  });
});

describe('Glossary chat (Batch 247)', () => {
  it('answers only from written sections and says what is missing', async () => {
    let sent = '';
    G.setDeps({ expert: { rules: async () => [{ title: 'Escalations go to the CSM', body: 'Escalations, cancellations and port-outs go to the CSM.' }], notes: async () => [], searchLocal: async () => [] },
      whoDoesWhat: async () => ({ people: [{ team: 'Tech OB', name: 'Tanya Garrison', role: 'Manager' }] }),
      ai: { bestJSON: async (o) => { sent = o.user; return { json: { knows: 'partly', answer: 'Port-outs go to the CSM.', used: [1], add: 'Who covers port-outs when the CSM is out.' } }; } } });
    const r = await G.ask('Who handles port-outs?');
    expect(sent).toMatch(/\[1\] Rule: Escalations go to the CSM/);
    expect(sent).toMatch(/Team: Tech OB/);
    expect(r.knows).toBe('partly');
    expect(r.used).toEqual([{ kind: 'rule', title: 'Rule: Escalations go to the CSM' }]);
    expect(r.add).toMatch(/CSM is out/);
  });
});

describe.skipIf(!sqlite3)('Deep research and Strategise (Batch 247)', () => {
  it('plans, runs the ticked parts in the background, writes the report and messages when asked', async () => {
    const dms = [], asked = [];
    R.setDB(new sqlite3.Database(':memory:')); await R.initSchema();
    R.setDeps({ ai: { bestJSON: async (o) => /Plan a deep research/.test(o.system)
        ? { json: { title: 'VoIP transfers in October', assumptions: ['Window: October'], parts: [{ title: 'Count', question: 'How many?' }, { title: 'Reasons', question: 'Why?', limits: 'sample' }, { title: 'Agents', question: 'Who?' }] } }
        : { json: { summary: [{ tag: 'Problem', point: 'Transfers rose 30%.', do: 'Coach on caller ID checks.' }], sections: [{ title: 'Count', body: '120 vs 92' }], confidence: 'medium', figures: '2 of 2', could_not_answer: ['Agent level reasons'] } } },
      investigate: { investigate: async (o) => { asked.push(o.question); return { summary: 'FINDINGS: 120 transfers (desk_tickets, October)', steps: [{}, {}] }; } },
      dm: async (o) => dms.push(o), publicUrl: 'https://x' });
    const p = await R.plan('lead@adit.com', { question: 'Why did VoIP transfers rise in October?' });
    expect(p.status).toBe('planned'); expect(p.parts.length).toBe(3);
    await R.start('lead@adit.com', p.id, { on: [0, 1], notify: true });
    for (let i = 0; i < 50 && (await R.get('lead@adit.com', p.id)).status === 'running'; i++) await wait(10);
    const d = await R.get('lead@adit.com', p.id);
    expect(d.status).toBe('done');
    expect(asked.sort()).toEqual(['How many?', 'Why?']);
    expect(d.parts[2].status).toBe('waiting');
    expect(d.report.summary[0].tag).toBe('Problem');
    expect(dms[0].text).toMatch(/https:\/\/x\/guides#research\//);
    await expect(R.get('other@adit.com', p.id)).rejects.toThrow(/Not found/);
  });
});
