import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const g = require('../../lib/guides.js');

describe('internal Expert guides (Batch 354)', () => {
  it('loads the EHR, Adit Pay and app guides for Expert', () => {
    const d = g.load();
    expect(d.ehr.chunks.length).toBeGreaterThan(100);
    expect(d.aditpay.chunks.length).toBeGreaterThan(10);
    expect(d.app.chunks.length).toBeGreaterThan(10);
  });
  it('keeps them off the Guides page and out of guide Ask AI', () => {
    expect(g.docList().map((x) => x.id)).toEqual(['voip', 'ai']);
    expect(g.docHtml('ehr')).toBeNull();
    expect(g.search('Cloud 9 appointment sync').every((c) => !['ehr', 'aditpay', 'app'].includes(c.doc))).toBe(true);
    expect(g.search('Cloud 9 appointment sync', { internal: true }).some((c) => c.doc === 'ehr')).toBe(true);
  });
  it('carries no contact details or internal terminal cost', () => {
    const all = Object.values(g.load()).filter((x) => x.internal).map((x) => x.html).join('\n');
    expect(all).not.toMatch(/[\w.+-]+@adit\.com/);
    expect(all).not.toMatch(/257\.14|360\.34/);
  });
});
