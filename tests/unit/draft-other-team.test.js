import { describe, it, expect } from 'vitest';
const X = require('../../lib/expert-desk-draft');

describe('Expert drafts: client talking with someone outside T1 (Batch 416)', () => {
  const threads = (who) => ({ data: [
    { id: '3', direction: 'in', createdTime: '2026-11-24T21:05:00Z', channel: 'EMAIL', summary: 'Here is the form' },
    { id: '2', direction: 'out', createdTime: '2026-11-24T18:00:00Z', channel: 'EMAIL', author: { id: '9', name: who } },
    { id: '1', direction: 'in', createdTime: '2026-11-24T15:00:00Z', channel: 'EMAIL' },
  ] });
  const t1 = async () => [{ id: '1', name: 'Henry P' }, { id: '2', name: 'Evan Cruz' }, { id: '3', name: 'Sky Gibson' }];
  it('names the onboarding specialist the client is answering', async () => {
    X.setDeps({ deskRead: async () => threads('Kyle Simmons'), t1Agents: t1 });
    expect(await X._talkingWith('t')).toBe('Kyle Simmons');
  });
  it('drafts as usual when the last reply came from T1', async () => {
    X.setDeps({ deskRead: async () => threads('Evan Cruz'), t1Agents: t1 });
    expect(await X._talkingWith('t')).toBe(null);
  });
});
