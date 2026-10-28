import { describe, it, expect } from 'vitest';
const rs = require('../../lib/roster-sheet.js');

const days = Array.from({ length: 31 }, (_, i) => (i + 1) + ' Oct');
const head = ['Emp Id', 'Pseudo Name', 'Full Name', 'Email', 'Designation', 'DOJ', 'Tenurity (In Months)', 'Contact Number', 'Alternative', 'Shit Timings'];
const lincy = ['AD0673', 'Lincy Tabita', 'Lincy Tabita', 'lincy@adit.com', 'Technical Support Representative', '27 Oct 2022', '48', 'x', '', '9.30 PM - 06.30 AM',
  'P', 'Worked on  Holiday ', 'OFF', 'OFF', 'P', 'P', 'P', 'P', 'P', 'OFF', 'OFF', 'P', 'P', 'HD PL', 'P', 'P', 'OFF', 'OFF', 'P', 'Floater Leave', 'P', 'P', 'P', 'OFF', 'OFF', 'P', 'P', 'P', '', '', 'OFF'];

describe('roster sheet', () => {
  it('reads month tab names', () => {
    expect(rs.tabMonth("Oct'26")).toBe('2026-10');
    expect(rs.tabMonth("Sept'26")).toBe('2026-09');
    expect(rs.tabMonth(' Feb 2024')).toBe('2024-02');
    expect(rs.tabMonth('Oct Leave Planner')).toBeNull();
  });
  it('turns a month tab into roster days, leaving blank days alone', () => {
    const p = rs.parseTab('2026-10', [[...Array(10).fill(''), ...days], [...head, 'Thursday'], lincy]);
    expect(p.agents).toHaveLength(1);
    const a = p.agents[0];
    expect(a.emp_id).toBe('AD0673'); expect(a.email).toBe('lincy@adit.com');
    expect(a.days['2026-10-01']).toBe('present');
    expect(a.days['2026-10-02']).toBe('on_duty');
    expect(a.days['2026-10-14']).toBe('hd_pl');
    expect(a.days['2026-10-20']).toBe('fl');
    expect(a.days['2026-10-29']).toBeUndefined();
    expect(a.days['2026-10-31']).toBe('off');
    expect(p.unknown).toEqual([]);
  });
});
