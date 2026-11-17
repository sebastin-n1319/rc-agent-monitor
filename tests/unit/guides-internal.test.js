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
    // Batch 383: Practice Analytics knowledge, with the draft warning at the top.
    expect(d.pa.chunks.length).toBeGreaterThan(100);
    expect(d.pa.html).toContain('Needs confirmation');
    expect(d.pa.html).not.toMatch(/app\.avoma\.com/);
    // Batch 380: the EHR library has a section for every EHR in the Integration Rulebook.
    expect(d.ehrlib.chunks.length).toBeGreaterThan(200);
    // Screenshot sections carry their images, served from the signed-in image route.
    const shots = d.ehrlib.chunks.filter((c) => c.images && c.images.length);
    expect(shots.length).toBeGreaterThan(20);
    expect(shots.every((c) => c.images.every((i) => /^\/api\/guides\/doc-img\/[a-z0-9-]+\/[a-z0-9_-]+\.webp$/.test(i.src)))).toBe(true);
    for (const e of ['Ortho2 Edge', 'Dentrix', 'Eaglesoft', 'Open Dental', 'OfficeMate', 'ChiroTouch', 'OrthoTrac', 'Dolphin', 'Cloud 9']) expect(d.ehrlib.html).toContain(e);
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
