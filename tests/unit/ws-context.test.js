import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const W = require('../../lib/ws-context.js');

const AGENTS = [
  { name: 'Lincy Tabita', extension: '5208', email: 'lincy@x.com', rc_id: '11', workspace: 't1' },
  { name: 'Austin Parker', extension: '5151', email: 'austin@x.com', rc_id: '22', workspace: 'aditpay' },
];
const ROLES = [{ email: 'sandy@x.com', workspaces: 'aditpay' }, { email: 'boss@x.com', workspaces: 't1,aditpay' }, { email: 'ronnie@x.com', workspaces: null }];
W.setDeps({ all: async (sql) => (/monitored_agents/.test(sql) ? AGENTS : /app_roles/.test(sql) ? ROLES : []) });

describe('workspaces (Batch 360)', () => {
  it('has no workspace outside a request, and keeps it through awaits inside one', async () => {
    expect(W.current()).toBe(null);
    await W.run('aditpay', async () => { await new Promise((r) => setTimeout(r, 5)); expect(W.current()).toBe('aditpay'); });
    expect(W.unscoped(() => W.run('t1', () => W.current()))).toBe('t1');
  });
  it('keeps cache keys apart per workspace', () => {
    expect(W.run('t1', () => W.key('summary'))).toBe('summary');
    expect(W.run('aditpay', () => W.key('summary'))).toBe('aditpay:summary');
    expect(W.key('summary')).toBe('all:summary');
  });
  it('counts Adit Pay agents and Adit Pay-only people as Adit Pay; people with both stay in T1', async () => {
    W.bust();
    const m = await W.members();
    expect([...m.emails].sort()).toEqual(['austin@x.com', 'sandy@x.com']);
    expect(m.agentIds.has('22') && m.agentIds.has('5151')).toBe(true);
    expect(await W.run('aditpay', () => W.hasEmail('boss@x.com'))).toBe(false);
    expect(await W.run('t1', () => W.hasEmail('boss@x.com'))).toBe(true);
  });
  it('filters rows by email, agent id or name for the request\'s workspace only', async () => {
    const rows = [{ email: 'lincy@x.com' }, { email: 'austin@x.com' }, { agentId: '22' }, { agentId: 'queue:1' }];
    expect(await W.run('aditpay', () => W.filterRows(rows, { email: 'email', agentId: 'agentId' }))).toEqual([{ email: 'austin@x.com' }, { agentId: '22' }]);
    expect(await W.run('t1', () => W.filterRows(rows, { email: 'email', agentId: 'agentId' }))).toEqual([{ email: 'lincy@x.com' }, { agentId: 'queue:1' }]);
    expect(await W.filterRows(rows)).toBe(rows);
  });
  it('knows each workspace\'s queue and Desk team', () => {
    expect(W.queue('aditpay').ext).toBe('9018');
    expect(W.queue('t1').ext).toBe('1025');
    expect(W.deskTeam('aditpay')).toBe('197800000070274100');
    expect(W.run('t1', () => W.label())).toBe('T1 CS');
  });
  it('tells an email\'s workspace from the last read', async () => {
    W.bust(); await W.members();
    expect(W.wsOfEmail('sandy@x.com')).toBe('aditpay');
    expect(W.wsOfEmail('lincy@x.com')).toBe('t1');
  });
});
