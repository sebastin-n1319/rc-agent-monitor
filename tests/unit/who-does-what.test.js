import { describe, it, expect } from 'vitest';
const w = require('../../lib/who-does-what.js');

describe('Who Does What sheet', () => {
  it('reads pods, real names and EHR coverage, and never keeps phone numbers', () => {
    const tech = [['Pod Name', 'CSM Name', 'Alternate name', 'Direct line', 'Extension', 'Working hours'],
      ["Alexis's POD", 'Alexis Harris ', 'Aayushi Agarwal ', '(832) 476-2992', '5425', '7-4 CST'],
      ['Pod TQ', 'Morgan Taylor', 'Mohit Thapa', '(832) 857-0934', '5361', '7-4 CST'], [],
      ['CSM/Client Services VP/Team Manager', 'Kushal Joshi', 'Kushal Joshi', '(832) 856-4601', '3021', '7-4 CST'], [], [],
      ['Pod Name', 'CSM Name', 'Alternate name'], ['Ava B\'s POD', 'Ava Bates', 'Annie Bhatia']];
    const mkt = [['', 'CSM', 'ACSM', 'ACSM'], ['POD DSO Mark ', 'Vera & Loki Williams (Lokender) MT 8-5', 'Anna Greene', 'Jack Johnson & Hope Marshal'], ['POD F', 'Faith Chiaravallo - CST 7-4', ' Rajat', 'Sharon (Dhanashree Patil)'], ['CSM/CSR Team Manager', 'Joshua Cloud']];
    const t2 = [['Emp ID', 'Alias Name', 'Real name'], ['AD1367', 'Debra Horton', 'Deblina Chakraborty', '(281) 668-4753', '5477', '08:30 AM - 05:30 PM']];
    const ehr = [['Vertical', 'CSM Name', 'EHR Systems'], ['Dental Cloud', 'Morgan Taylor', 'Denticon, Ascend, Curve']];
    const p = w.parse([{ values: tech }, { values: mkt }, { values: t2 }, {}, {}, {}, { values: ehr }]);
    const tc = p.filter((x) => x.team === 'Tech CSM');
    expect(tc.map((x) => [x.name, x.real, x.pod])).toEqual([['Alexis Harris', 'Aayushi Agarwal', "Alexis's POD"], ['Morgan Taylor', 'Mohit Thapa', 'Pod TQ']]);
    expect(tc[1].ehr).toBe('Denticon, Ascend, Curve');
    expect(p.find((x) => x.name === 'Kushal Joshi').team).toBe('Tech CSM leadership');
    expect(p.some((x) => x.name === 'Ava Bates')).toBe(false); // the older second list
    expect(p.filter((x) => x.team === 'Marketing CSM' && x.role === 'CSM').map((x) => x.name)).toEqual(['Vera', 'Loki Williams', 'Faith Chiaravallo']);
    expect(p.filter((x) => x.role === 'ACSM').map((x) => x.name)).toEqual(['Anna Greene', 'Jack Johnson', 'Hope Marshal', 'Rajat', 'Sharon']);
    expect(p.find((x) => x.team === 'T2 CS')).toMatchObject({ name: 'Debra Horton', real: 'Deblina Chakraborty', hours: '08:30 AM - 05:30 PM' });
    expect(JSON.stringify(p)).not.toMatch(/\(\d{3}\)|5425|476-2992/);
  });
});
