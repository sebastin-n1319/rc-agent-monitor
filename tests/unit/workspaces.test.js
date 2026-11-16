import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }

describe('workspaces (Batch 353)', () => {
  it.skipIf(!sqlite3)('reads a workspace list, T1 only when empty or unknown', () => {
    const { parseWorkspaces } = require('../../database.js');
    expect(parseWorkspaces(null)).toEqual(['t1']);
    expect(parseWorkspaces('')).toEqual(['t1']);
    expect(parseWorkspaces('aditpay')).toEqual(['aditpay']);
    expect(parseWorkspaces('t1, AditPay,t1')).toEqual(['t1', 'aditpay']);
    expect(parseWorkspaces('sales,xyz')).toEqual(['t1']);
  });
  it('keeps the workspace style tag when the reset runs', () => {
    const src = fs.readFileSync(new URL('../../public/adit-reset.js', import.meta.url), 'utf8');
    expect(src).toMatch(/'ws-css': true/);
  });
  it('leaves status colors alone and only swaps orange hues', () => {
    const src = fs.readFileSync(new URL('../../public/workspace.js', import.meta.url), 'utf8');
    expect(src).toMatch(/SKIP_SEL = \/warn\|late\|overdue/);
    expect(src).toMatch(/hsl\[0\] >= 14 && hsl\[0\] <= 38/);
  });
});
