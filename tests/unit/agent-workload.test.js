import { describe, it, expect } from 'vitest';
const W = require('../../lib/agent-workload');

// Wed 4 Nov 2026, 15:00 Central
const NOW = Date.parse('2026-11-04T21:00:00Z');
const AG = [
  { email: 'evan@adit.com', name: 'Evan Cruz' },
  { email: 'leo@adit.com', name: 'Leo Clayton' },
  { email: 'greg@adit.com', name: 'Greg Dawson' },
  { email: 'greg2@adit.com', name: 'Greg Mills' },
];

describe('agent workload: period', () => {
  it('defaults to today and reads yesterday, weeks and months', () => {
    expect(W.parsePeriod('workload of Evan', NOW)).toMatchObject({ from: '2026-11-04', to: '2026-11-04', days: 1 });
    expect(W.parsePeriod('evan yesterday', NOW)).toMatchObject({ from: '2026-11-03', to: '2026-11-03' });
    expect(W.parsePeriod('this week', NOW)).toMatchObject({ from: '2026-11-02', to: '2026-11-04', days: 3 });
    expect(W.parsePeriod('last week', NOW)).toMatchObject({ from: '2026-10-26', to: '2026-11-01', days: 7 });
    expect(W.parsePeriod('last month', NOW)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(W.parsePeriod('last 3 days', NOW)).toMatchObject({ from: '2026-11-02', to: '2026-11-04' });
  });
  it('reads dates and weekdays', () => {
    expect(W.parsePeriod('on 2 Nov', NOW)).toMatchObject({ from: '2026-11-02' });
    expect(W.parsePeriod('on Oct 30th', NOW)).toMatchObject({ from: '2026-10-30' });
    expect(W.parsePeriod('on 2026-10-29', NOW)).toMatchObject({ from: '2026-10-29' });
    expect(W.parsePeriod('on monday', NOW)).toMatchObject({ from: '2026-11-02' });
    expect(W.parsePeriod('2026-12-01', NOW)).toBeNull();
  });
});

describe('agent workload: detect', () => {
  it('finds the agent by full or first name', () => {
    expect(W.detect("What was Evan's workload yesterday?", AG, 'x@adit.com', NOW).agent.email).toBe('evan@adit.com');
    expect(W.detect('how many tickets did leo clayton close this week', AG, 'x', NOW).agent.email).toBe('leo@adit.com');
  });
  it('asks which one when a first name is shared, and settles on the full name', () => {
    expect(W.detect('workload of Greg today', AG, 'x', NOW).choice).toHaveLength(2);
    expect(W.detect('workload of Greg today (Greg Mills)', AG, 'x', NOW).agent.email).toBe('greg2@adit.com');
  });
  it('reads "my workload" as the asker', () => {
    const r = W.detect('my workload last week', AG, 'leo@adit.com', NOW);
    expect(r.agent.email).toBe('leo@adit.com'); expect(r.self).toBe(true);
  });
  it('leaves product questions and ticket reviews alone', () => {
    expect(W.detect('How many calls can the AI agent take at once?', AG, 'leo@adit.com', NOW)).toBeNull();
    expect(W.detect('#422530 what did evan do here', AG, 'x', NOW)).toBeNull();
    expect(W.detect('How do I reset a password?', AG, 'x', NOW)).toBeNull();
  });
});

describe('agent workload: answer', () => {
  it('writes one line like Aria, with hours and minutes', () => {
    const out = { agent: { name: 'Evan Cruz' }, period: { label: 'yesterday, Tue 3 Nov' }, rc: { availSec: 22320, unavailSec: 6000 }, desk: { handled: 23, replied: 18, closed: 9, transferred: 2 }, chats: { count: 31 }, calls: { total: 4 }, breaks: { totalMin: 58, items: [] }, limits: [] };
    expect(W.headline(out)).toBe('Evan Cruz, yesterday, Tue 3 Nov (Central): RingCentral available 6h 12m, unavailable 1h 40m; 23 tickets handled (18 replied, 9 closed, 2 transferred); 31 chats; 4 calls; breaks 58m.');
    expect(W.plainText(Object.assign({ scrinSec: 3600 }, out))).toContain('scrin.io tracked: 1h 00m');
  });
});
