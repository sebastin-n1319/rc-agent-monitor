import { describe, it, expect } from 'vitest';
const G = require('../../lib/manager-guard');

describe('account manager names in client replies (Batch 397, #431198)', () => {
  it('takes out a manager CRM does not confirm and keeps the right one', () => {
    expect(G.guard('Your account manager, Morgan Taylor, will confirm exactly what comes with that office.', ['Walter Green']).text)
      .toBe('Your account manager will confirm exactly what comes with that office.');
    expect(G.guard('Morgan Taylor, your account manager, will reach out.', ['Walter Green']).text).toBe('Your account manager will reach out.');
    expect(G.guard('Your account manager, Walter Green, will confirm.', ['Walter Green']).removed).toEqual([]);
    expect(G.guard('I will ask your CSM Walter to call you.', ['Walter Green']).removed).toEqual([]);
  });
  it('with no confirmed person, nobody is named', () => {
    const r = G.guard('Your account manager, Morgan Taylor, will confirm.', ['Technical Support']);
    expect(r.text).toBe('Your account manager will confirm.');
    expect(r.removed).toEqual(['Morgan Taylor']);
  });
  it('team placeholders are not people', () => {
    expect(G.person('Technical Support')).toBe('');
    expect(G.person("Walter's POD")).toBe('');
    expect(G.person('Walter Green')).toBe('Walter Green');
  });
});
