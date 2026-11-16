import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ed = require('../../lib/expert-desk-draft.js');
const set = (oa, ia) => ed.setDeps({ outageWatch: { current: async () => oa }, issueWatch: { current: async () => ia } });

describe('Expert drafts during an outage (Batch 353)', () => {
  it('no alert, no match', async () => { set(null, null); expect(await ed._outageMatch('1', { subject: 'Phones down' })).toBeNull(); });
  it('phones-down alert matches phones-down wording and listed tickets', async () => {
    set({ version: 'V4', tickets: [{ number: '429520' }] }, null);
    expect(await ed._outageMatch('1', { subject: 'Lexington phones down - cannot make or receive calls' })).toEqual({ what: 'Phones down on V4', team: 'VoIP' });
    expect(await ed._outageMatch('429520', { subject: 'Help' })).toBeTruthy();
    expect(await ed._outageMatch('2', { subject: 'Booking link error' })).toBeNull();
  });
  it('repeated-issue alert matches by label words', async () => {
    set(null, { label: 'Online booking link showing error page', product: 'Scheduling', tickets: [] });
    expect(await ed._outageMatch('3', { subject: 'Booking link error - please help', description: 'the online booking page shows an error' })).toEqual({ what: 'Online booking link showing error page', team: 'owning' });
    expect(await ed._outageMatch('4', { subject: 'How do I add a user' })).toBeNull();
  });
});

describe('never expose app or company issues to clients (Batch 354)', () => {
  it('flags outage, bug, other offices and developer talk', () => {
    const t = ed._toneIssues;
    expect(t('We are aware of an outage affecting several practices.').map((x) => x.kind)).toContain('exposes an app or company issue');
    expect(t('Our developers are working on a bug in the app.').length).toBe(1);
    expect(t('Other offices are reporting the same thing.').length).toBe(1);
    expect(t('I have escalated this to our engineering team.').length).toBe(1);
    expect(t('Please go to Settings > Phone and select your greeting.').length).toBe(0);
  });
});
