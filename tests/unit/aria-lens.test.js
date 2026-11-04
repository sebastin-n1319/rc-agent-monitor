import { describe, it, expect } from 'vitest';
const L = require('../../lib/aria-lens');

describe('Aria lens shared by every review (Batch 246)', () => {
  it('adds the reading rules once', () => {
    const s = L.withLens('You review tickets.');
    expect(s).toMatch(/HOW TO READ/);
    expect(s).toMatch(/Act first/);
    expect(s).toMatch(/not the client: the reply goes to the practice/);
    expect(L.withLens(s)).toBe(s);
  });
  it('flags ticket numbers the AI was never given', () => {
    expect(L.auditRefs({ why: 'Same as #423436 and #999999.' }, 'related ticket #423436 was closed')).toEqual(['999999']);
    expect(L.auditRefs('nothing here', '')).toEqual([]);
  });
});
