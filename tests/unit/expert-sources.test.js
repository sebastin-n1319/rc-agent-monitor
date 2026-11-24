import { describe, it, expect, beforeEach } from 'vitest';
const ES = require('../../lib/expert-sources');
const sqlite3 = require('sqlite3');

describe('Expert sources folder (Batch 417)', () => {
  let files, reads;
  beforeEach(async () => {
    const db = new sqlite3.Database(':memory:'); ES.setDB(db); await ES.initSchema();
    files = [
      { id: 'd1', name: 'T1 Transfer SOP', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-11-24T10:00:00Z', webViewLink: 'https://docs/d1' },
      { id: 'h1', name: 'Payroll 2026', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-11-24T10:00:00Z' },
    ];
    reads = 0;
    ES.setDeps({
      apis: { drive: { files: {
        list: async () => ({ data: { files } }),
        export: async () => { reads++; return { data: '# Transfers\nT1 sets Pending Review - T1 for the owning team. Contact jane@example.com or 904-555-1234.\nPassword: hunter2\n' + 'Details. '.repeat(40) }; },
      } } },
      ai: { bestJSON: async () => ({ json: { conflicts: [] } }) },
      expert: { rules: async () => [{ title: 'Hand over with Pending Review - T1', body: 'x' }], bust: () => {} },
      library: { refreshForDoc: async () => ({ rebuilt: 0 }) },
    });
    await ES.setFolder('https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx');
  });
  it('reads a new document once, scrubbed, and leaves HR documents out', async () => {
    const r = await ES.check();
    expect(r.read).toBe(1);
    expect(r.skipped.join(' ')).toMatch(/Payroll 2026 \(HR/);
    const c = await ES.chunks();
    expect(c.length).toBeGreaterThan(0);
    const all = c.map((x) => x.text).join(' ');
    expect(all).toMatch(/Pending Review - T1/);
    expect(all).not.toMatch(/jane@example|555-1234|hunter2/);
    expect((await ES.check()).read).toBe(0); // unchanged: not read again, no AI
    expect(reads).toBe(1);
  });
  it('a changed document is read again, and a removed one stops being used', async () => {
    await ES.check();
    files[0] = Object.assign({}, files[0], { modifiedTime: '2026-11-25T10:00:00Z' });
    expect((await ES.check()).read).toBe(1);
    files = [];
    expect((await ES.check()).removed).toBe(2);
    expect((await ES.chunks()).length).toBe(0);
  });
});
