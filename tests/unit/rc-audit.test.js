import { describe, it, expect } from 'vitest';
const a = require('../../lib/rc-audit');

describe('RingCentral audit trail records', () => {
  it('reads the newer layout (actionId with old and new parameters), for the target person', () => {
    const r = { eventTime: '2026-11-04T00:09:13.481Z', actionId: 'CHANGE_USER_DND_STATUS_NEW', details: { parameters: [{ key: 'old', value: 'Do not accept call queue calls' }, { key: 'new', value: 'Take all calls' }] },
      initiator: { extensionNumber: '5334', name: 'Riley Sanders' }, target: { objectType: 'Extension', name: 'Lincy Tabita', extensionNumber: '5208' } };
    expect(a.parseRecord(r)).toMatchObject({ ext: '5208', name: 'Lincy Tabita', to: 'Take all calls', take: true });
  });
  it('still reads the older sentence layout and ignores other records', () => {
    expect(a.parseRecord({ eventTime: '2026-11-03T10:00:00Z', details: 'Set DND status from Take all calls to Do not accept any calls', target: { name: 'X', extensionNumber: '5100' } })).toMatchObject({ take: false, ext: '5100' });
    expect(a.parseRecord({ eventTime: '2026-11-03T10:00:00Z', actionId: 'CHANGE_USER_INFO', details: { parameters: [{ key: 'new', value: 'x' }] } })).toBe(null);
  });
});
