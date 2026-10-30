import { describe, it, expect, beforeEach } from 'vitest';
const lc = require('../../lib/live-chat.js');

const now = Date.now();
const convs = [
  { id: '901', reference_id: '32350', status: 'Connected', chat_status: { label: 'Connected', status_key: 'open' }, attender: { email: 'Sky@adit.com', name: 'Sky' }, visitor: { name: 'Dr. Lee', company_name: 'Smile Dental' }, question: 'Texts not sending', start_time: String(now - 600e3), department: { name: 'Support' } },
  { id: '902', reference_id: '32351', status: 'closed', chat_status: { label: 'Ended', status_key: 'ended' }, end_time: String(now), attender: { email: 'sky@adit.com' }, visitor: { name: 'Ann' } },
  { id: '903', reference_id: '32352', status: 'open', chat_status: { label: 'Attended' }, attender: { email: 'lincy@adit.com' }, visitor: { name: 'Bo' } },
];
const msgs = { data: [
  { id: 'm1', time: String(now - 500e3), sequence_id: 1, sender: { type: 'visitor', name: 'Dr. Lee' }, message: { text: 'Our texts are not sending' } },
  { id: 'm2', time: String(now - 400e3), sequence_id: 2, sender: { type: 'operator', name: 'Sky' }, message: 'Sorry about that, let me check.' },
  { id: 'm3', time: String(now - 300e3), sequence_id: 3, sender: { type: 'visitor', name: 'Dr. Lee' }, message: { text: 'Call me at 555-123-4567 or lee@smile.com' } },
  { id: 'm4', time: String(now - 200e3), sequence_id: 4, sender: { type: 'system' }, message: '' },
], more_data_available: false };
let seen = [];
const ai = { isAnthropicConfigured: () => true,
  claudeJSON: async ({ system, user }) => { seen.push({ system, user });
    return { json: { reply: 'Thanks, Dr. Lee \u2014 let us check.\n\nhttps://help.adit.com/portal/en/kb/articles/texting\nhttps://evil.example.com/x\n\n[screenshot - Settings > Texting]', why: 'Client says texts fail', checks: ['Check the 10DLC status'], handover: '', kb: 'Texting', kb_url: 'https://evil.example.com/y' } }; } };
const expert = { searchLocal: async () => [{ src: 'kb', module: 'Engage', title: 'Texting', url: 'https://help.adit.com/portal/en/kb/articles/texting', text: 'How texting works' }], rules: async () => [{ title: 'T1 cannot make outbound calls', body: 'Callbacks go to VoIP.' }], updatesFor: async () => '- Texting fix released' };
const ended = { id: '904', reference_id: '32300', status: 'Attended Online', chat_status: { status_key: 'closed' }, attender: { email: 'sky@adit.com' }, visitor: { name: 'Old' } };
const reopened = { id: '905', reference_id: '32346', status: 'Connected', chat_status: { status_key: 'reopen' }, attender: { email: 'sky@adit.com' }, visitor: { name: 'Re' }, start_time: String(now - 120e3) };
// SalesIQ hands back about 5 chats per read and pages by record offset (index=1, 6, 11...).
const listed = convs.concat([reopened]);
const page = (p) => { const i = Number((/index=(\d+)/.exec(p) || [])[1] || 1); return listed.slice(i - 1, i - 1 + 2); };
const siq = { rawGet: async (p) => /status=closed/.test(p) ? { data: /index=1\b/.test(p) ? [ended] : [] }
  : /^conversations\?/.test(p) ? { data: page(p), more_data_available: true }
  : /^conversations\/\d+$/.test(p) ? { data: listed.concat([ended]).find((c) => p.endsWith('/' + c.id)) || null }
  : msgs };

beforeEach(() => { lc._reset(); seen = []; lc.setDeps({ siq, expert, ai }); });

describe('Live chats', () => {
  it('reads every page of the list by record offset', async () => {
    const all = await lc.mine('x@adit.com', { all: true });
    expect(all.map((c) => c.ref).sort()).toEqual(['32346', '32350', '32352']); // spread over 2 reads of 2
  });
  it('lists only the agent\'s open chats', async () => {
    const m = await lc.mine('sky@adit.com');
    expect(m.map((c) => c.ref).sort()).toEqual(['32346', '32350']);
    expect(m.find((c) => c.ref === '32350').company).toBe('Smile Dental');
  });
  it('lets agents open only their own chats, admins and SPOCs any', async () => {
    await expect(lc.chat('32352', { email: 'sky@adit.com' })).rejects.toThrow('not one of your chats');
    expect((await lc.chat('32352', { email: 'x@adit.com', spoc: true })).chat.ref).toBe('32352');
    expect((await lc.chat('#32352', { email: 'x@adit.com', admin: true })).chat.visitor).toBe('Bo');
    await expect(lc.chat('99999', { email: 'x', admin: true })).rejects.toThrow('not found');
    const old = await lc.chat('32300', { email: 'sky@adit.com' });
    expect(old.chat.open).toBe(false);
  });
  it('reads the transcript in order and finds the last client message', async () => {
    const c = await lc.chat('32350', { email: 'sky@adit.com' });
    expect(c.messages.map((m) => m.who)).toEqual(['client', 'agent', 'client']);
    expect(c.messages[0].text).toBe('Our texts are not sending');
    expect(c.lastClientId).toBe('m3');
    expect(c.suggestion).toBeNull();
  });
  it('writes the next reply with only source links and screenshot spots, and keeps contact details out of the prompt', async () => {
    const s = await lc.suggest('32350', { email: 'sky@adit.com' });
    expect(s.reply).not.toMatch(/[\u2014\u2013]/);
    expect(s.reply).toContain('https://help.adit.com/portal/en/kb/articles/texting');
    expect(s.reply).not.toContain('evil.example.com');
    expect(s.reply).toContain('[Screenshot: Settings > Texting]');
    expect(s.screenshots).toBe(1);
    expect(s.kbUrl).toBe('');
    expect(s.basis).toBe('m3');
    expect(seen[0].user).toContain('[phone]');
    expect(seen[0].user).toContain('[email]');
    expect(seen[0].user).toContain('T1 cannot make outbound calls');
    expect(seen[0].user).toContain('Texting fix released');
    await lc.suggest('32350', { email: 'sky@adit.com' });
    expect(seen.length).toBe(1); // cached for the same client message
    expect((await lc.chat('32350', { email: 'sky@adit.com' })).suggestion.reply).toBe(s.reply);
  });
  it('improves a reply from the agent\'s instruction', async () => {
    await expect(lc.improve('32350', { email: 'sky@adit.com' }, { instruction: '', current: 'Hi' })).rejects.toThrow('what to change');
    const r = await lc.improve('32350', { email: 'sky@adit.com' }, { instruction: 'Shorter', current: 'Hello there, long reply' });
    expect(r.improved).toBe(true);
    expect(seen[0].user).toContain('The agent\'s instruction: Shorter');
    expect(seen[0].user).toContain('Hello there, long reply');
  });
  it('reads message text in its usual shapes', () => {
    expect(lc._msgText({ message: 'hi' })).toBe('hi');
    expect(lc._msgText({ message: { text: 'yo' } })).toBe('yo');
    expect(lc._msgText({ message: { file: { name: 'a.png' } } })).toBe('[File: a.png]');
    expect(lc._isOpen({ status: 'missed' })).toBe(false);
  });
  it('finds the Adit account number the client gives, and not a phone number', () => {
    const M = (who, text) => ({ who, text });
    expect(lc._findAcct([M('client', 'Sandra and our Adit account number is 64624 and you can call me at 773-788-9090')])).toBe('64624');
    expect(lc._findAcct([M('agent', 'Could you share your Adit Account Number?'), M('client', '51234')])).toBe('51234');
    expect(lc._findAcct([M('client', 'call me at 773-788-9090')])).toBeNull();
    expect(lc._findAcct([M('client', 'my order was 51234')])).toBeNull();
  });
  it('loads the account review for the banner and the reply', async () => {
    expert.crmContext = async (n, o) => ({ text: 'Account: Smile Dental Care. Escalation: none.', header: { account: 'Smile Dental Care', escalation: 'none' }, account: { name: 'Smile Dental Care', city: 'Chicago, IL', tickets: 4 }, analysis: { headline: 'Stable', issues: [{ text: 'Refunds failing', status: 'open', times: 2 }], open: [] }, facts: { stage: 'CSM', csm: 'Ana', ob: 'Hannah S', escalation: 'none', health: 'Good', fcr: 80 }, _o: o });
    const c1 = await lc.chat('32350', { email: 'sky@adit.com' }, { acct: '64624' });
    expect(c1.account.loading).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    const c2 = await lc.chat('32350', { email: 'sky@adit.com' }, { acct: '64624' });
    expect(c2.account.found).toBe(true);
    expect(c2.account.csm).toBe('Ana');
    expect(c2.account.escalation).toBe('');
    expect(c2.account.text).toBeUndefined();
    await lc.suggest('32350', { email: 'sky@adit.com' }, { force: true, acct: '64624' });
    expect(seen.slice(-1)[0].user).toContain('account record (internal');
    expect(seen.slice(-1)[0].user).toContain('Smile Dental Care');
    delete expert.crmContext;
  });
  it('gives an admin every open chat, marked as theirs or not', async () => {
    const all = await lc.mine('sky@adit.com', { all: true });
    expect(all.map((c) => c.ref).sort()).toEqual(['32346', '32350', '32352']);
    expect(all.find((c) => c.ref === '32352').own).toBe(false);
    expect(all.find((c) => c.ref === '32350').own).toBe(true);
  });
  it('never lists a missed chat as open', () => {
    expect(lc._isOpen({ status: 'Tracked in CRM', chat_status: { label: 'Tracked in CRM' } })).toBe(false);
    expect(lc._isOpen({ status: 'Connected', chat_status: { label: 'Connected', status_key: 'reopen' } })).toBe(true);
    expect(lc._isOpen({ status: 'Attended Online', chat_status: { label: 'Attended Online', status_key: 'closed', state_key: 'end' } })).toBe(false);
  });
  it('lets an agent read a chat they took part in before it moved', () => {
    const c = { attender: { email: 'anold@adit.com' }, owner: { email: 'anold@adit.com' }, participants: [{ email: 'Evan@adit.com' }, 'x'] };
    expect(lc._canSee(c, { email: 'evan@adit.com' })).toBe(true);
    expect(lc._canSee(c, { email: 'leo@adit.com' })).toBe(false);
  });
});
