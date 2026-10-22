import { describe, it, expect } from 'vitest';
const cf = require('../../lib/cf1025.js');

const H = '"Type","Direction","From","To","Extension","Forwarded To","Name","Date","Time","Action","Action Result","Result Description","Duration","Included","Purchased"';
const row = (o) => ['type', 'dir', 'from', 'to', 'ext', 'fwd', 'name', 'date', 'time', 'action', 'result', 'desc', 'dur', 'inc', 'pur'].map(k => '"' + (o[k] || '') + '"').join(',');
const leg = (dir, ext, result, dur = '0:00:10', extra = {}) => Object.assign({ type: '', dir, from: '(555) 111-2222', ext, date: 'Wed 10/21/2026', time: '2:10 PM', action: 'Phone Call', result, dur }, extra);
const parent = (ext, extra = {}) => Object.assign({ type: 'Voice', dir: 'Incoming', from: '(555) 111-2222', to: '(281) 468-1445', ext, name: 'SMILE DENTAL - 1025', date: 'Wed 10/21/2026', time: '2:10 PM', action: 'Phone Call', result: 'Accepted', dur: '0:05:00' }, extra);
const csv = (sessions) => '﻿' + [H].concat(sessions.flat().map(row)).join('\r\n');

describe('CSV sessions', () => {
  it('groups legs under the parent row and drops whole duplicate sessions', () => {
    const s1 = [parent('1001 - IVR Menu'), leg('Incoming', '1009 - Existing Clients'), leg('Incoming', '1025 - Customer Service', 'Accepted')];
    const s2 = [parent('1025 - Customer Service', { from: '(555) 999-0000' })];
    const r = cf.sessionsFromCSV(csv([s1, s2, s1]));
    expect(r.sessions.length).toBe(2);
    expect(r.dupRows).toBe(3);
    expect(r.dupSessions).toBe(1);
  });
  it('reads quoted commas and the BOM', () => {
    const rows = cf.parseCSV('﻿"a","b,c"\n"1","2"');
    expect(rows[0]).toEqual(['a', 'b,c']);
  });
  it('parses durations', () => { expect(cf.durSec('0:32:48')).toBe(1968); expect(cf.durSec('In progress')).toBe(null); });
});

describe('path and mechanism', () => {
  const C = (legs) => cf.classify(legs);
  it('straight from IVR', () => {
    const c = C([parent('1001 - IVR Menu'), leg('Incoming', '1001 - IVR Menu', 'Accepted'), leg('Incoming', '1009 - Existing Clients', 'Accepted'), leg('Incoming', '1025 - Customer Service', 'Accepted', '0:06:00'), leg('Incoming', '5357 - Sky Gibson', 'Accepted', '0:05:30')]);
    expect(c.path).toBe('ivr'); expect(c.answered_by).toBe('Sky Gibson'); expect(c.talk_sec).toBe(330); expect(c.caller_name).toBe('SMILE DENTAL');
  });
  it('direct to 1025 when nothing comes before it', () => { expect(C([parent('1025 - Customer Service')]).path).toBe('direct'); });
  it('ignores sessions that never reach 1025', () => { expect(C([parent('5603 - Aurora Bennett')])).toBe(null); });
  it('via a person: auto-forwarded', () => {
    const c = C([parent('5603 - Aurora Bennett'), leg('Incoming', '5603 - Aurora Bennett', 'Accepted', '0:00:00'), leg('Incoming', '1025 - Customer Service', 'Missed')]);
    expect(c.path).toBe('person'); expect(c.mechanism).toBe('fwd'); expect(c.origin_ext).toBe('5603'); expect(c.result).toBe('Missed');
  });
  it('via a person: rang out', () => {
    const c = C([parent('5603 - Aurora Bennett'), leg('Incoming', '5603 - Aurora Bennett', 'Missed', '0:00:30'), leg('Incoming', '1025 - Customer Service', 'Voicemail')]);
    expect(c.mechanism).toBe('ring'); expect(c.result).toBe('Voicemail');
  });
  it('via a person: device no answer counts as rang out', () => {
    const c = C([parent('5603 - A B'), leg('Incoming', '5603 - A B', 'Accepted', '0:00:30'), leg('Outgoing', '5603 - A B', 'No Answer'), leg('Incoming', '1025 - Customer Service', 'Accepted')]);
    expect(c.mechanism).toBe('ring');
  });
  it('via a person: answered then transferred', () => {
    const c = C([parent('5603 - A B'), leg('Incoming', '5603 - A B', 'Accepted', '0:01:00'), leg('Outgoing', '5603 - A B', 'Call connected'), leg('Incoming', '1025 - Customer Service', 'Accepted')]);
    expect(c.mechanism).toBe('xfer');
  });
  it('via a person: declined or offline, and back through the main IVR', () => {
    const c = C([parent('5603 - A B'), leg('Incoming', '5603 - A B', 'Accepted', '0:00:05'), leg('Outgoing', '5603 - A B', 'IP Phone Offline'), leg('Incoming', '1001 - IVR Menu', 'Accepted'), leg('Incoming', '1025 - Customer Service', 'Accepted')]);
    expect(c.mechanism).toBe('decl'); expect(c.via_main_ivr).toBe(1);
  });
  it('queue rollovers', () => {
    expect(C([parent('1001 - IVR'), leg('Incoming', '1501 - Inbound VoIP Support', 'Missed'), leg('Incoming', '1025 - Customer Service', 'Accepted')]).path).toBe('voipq');
    expect(C([parent('1001 - IVR'), leg('Incoming', '1004 - Sales', 'Missed'), leg('Incoming', '1025 - Customer Service', 'Accepted')]).path).toBe('salesq');
    expect(C([parent('1001 - IVR'), leg('Incoming', '1777 - Some Group', 'Missed'), leg('Incoming', '1025 - Customer Service', 'Accepted')]).path).toBe('othersys');
  });
});

describe('teams', () => {
  it('short names', () => { expect(cf.teamShort('Tech OB Team')).toBe('Tech OB'); expect(cf.teamShort('DSO Team / RCM Team')).toBe('DSO/RCM'); expect(cf.teamShort('')).toBe('Unknown'); });
});

describe('time zones', () => {
  it('7 AM Central is 5:30 PM IST before 1 Nov 2026 and 6:30 PM after', () => {
    expect(cf.istFor('2026-10-21', 7).label).toBe('5:30 PM');
    expect(cf.istFor('2026-11-02', 7).label).toBe('6:30 PM');
    expect(cf.istFor('2026-10-21', 7).offsetMin).toBe(630);
    expect(cf.istFor('2026-11-02', 7).offsetMin).toBe(690);
  });
  it('parses Central wall time to UTC across DST', () => {
    expect(new Date(cf.parseCT('Wed 10/21/2026', '2:10 PM')).toISOString()).toBe('2026-10-21T19:10:00.000Z');
    expect(new Date(cf.parseCT('Mon 11/02/2026', '2:10 PM')).toISOString()).toBe('2026-11-02T20:10:00.000Z');
  });
});

describe('Erlang C', () => {
  it('matches known values', () => {
    expect(cf.erlangC(3, 2)).toBeCloseTo(0.4444, 3);
    expect(cf.agentsNeeded(0, 754)).toBe(0);
    const n = cf.agentsNeeded(20, 754, { sl: 0.8, t: 60, maxOcc: 0.85 });
    expect(n).toBeGreaterThanOrEqual(5); expect(n).toBeLessThanOrEqual(7);
  });
});

describe('topic rules', () => {
  const T = (s, d) => cf.topicOf({ subject: s, description: d });
  it('first match wins and order matters', () => {
    expect(T('Wants to speak with CSM about phones')).toBe('Wanted a specific person / CSM / OB');
    expect(T('Phones not ringing')).toBe('VoIP / phones');
    expect(T('Reminders not sending')).toBe('Texting / reminders (Engage)');
    expect(T('Password reset')).toBe('Login / users / access');
    expect(T('Importing data')).toBe(TT('Importing data'));
    expect(T('General question', 'patient intake form missing')).toBe('Patient forms');
    expect(T('xyz')).toBe('Other / unclear');
  });
  function TT(s) { return cf.topicOf({ subject: s }); }
  it('no rule matches everything', () => { for (const [, re] of cf.TOPICS) expect(re.test('')).toBe(false); });
});
