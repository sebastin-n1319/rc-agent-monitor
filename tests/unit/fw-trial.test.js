import { describe, it, expect, beforeEach } from 'vitest';
const T = require('../../lib/fw-trial');
const sqlite3 = require('sqlite3');

describe('DeepSeek trial on real work (Batch 403)', () => {
  let db;
  beforeEach(async () => { db = new sqlite3.Database(':memory:'); T.setDB(db); await T.initSchema(); process.env.FIREWORKS_TRIAL = 'on'; });
  it('compares short fields only and says when there are none', () => {
    expect(T.agreeN({ score: 4, pass: true, note: 'x'.repeat(80) }, { score: 4, pass: false, note: 'y'.repeat(80) })).toEqual({ agree: 0.5, n: 2 });
    expect(T.agreeN({ text: 'x'.repeat(80) }, { text: 'y'.repeat(80) }).agree).toBe(null);
  });
  it('never samples Expert questions or the checks themselves', () => {
    T.setDeps({ random: () => 0 });
    expect(T.want('expert')).toBe(false);
    expect(T.want('fw-trial-grade')).toBe(false);
    expect(T.want('call-qa')).toBe(true);
    process.env.FIREWORKS_TRIAL = 'off';
    expect(T.want('call-qa')).toBe(false);
  });
  it('keeps both answers, then grades DeepSeek against Claude', async () => {
    T.setDeps({ random: () => 0, ai: {
      isFireworks: () => true,
      fireworksJSON: async () => ({ json: { score: 4 } }),
      claudeJSON: async () => ({ json: { accuracy: 5, quality: 4.5, contradicts: false, note: 'same' } }),
      ANTHROPIC_MODEL: 'm',
    } });
    T.maybe('call-qa', { system: 's', user: 'u' }, { json: { score: 4 } });
    await new Promise((r) => setTimeout(r, 50));
    let s = await T.status();
    expect(s.features[0]).toMatchObject({ feature: 'call-qa', samples: 1, shortFieldAgree: 100, graded: 0 });
    const g = await T.grade({ n: 5 });
    expect(g.graded).toBe(1);
    s = await T.status();
    expect(s.features[0]).toMatchObject({ graded: 1, accuracy: 5, contradicts: 0, ready: false });
  });
});
