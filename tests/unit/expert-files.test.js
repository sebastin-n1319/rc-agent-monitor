import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fx = require('../../lib/expert-files.js');
let sqlite3 = null; try { sqlite3 = require('sqlite3'); new sqlite3.Database(':memory:').close(); } catch (e) { sqlite3 = null; }

describe('Expert files and links (Batch 289)', () => {
  it('knows the file kinds it can read', () => {
    expect(fx.kindOf('shot.png', 'image/png')).toBe('image');
    expect(fx.kindOf('call.m4a', '')).toBe('audio');
    expect(fx.kindOf('letter.pdf', 'application/pdf')).toBe('doc');
    expect(fx.kindOf('setup.exe', 'application/octet-stream')).toBe('');
  });
  it('sorts pasted links', () => {
    const q = 'see https://desk.zoho.com/agent/aditsupport/adit-support/tickets/details/197800012345678901 and https://help.adit.com/portal/en/kb/articles/create-and-send-a-mass-text, https://app.avoma.com/meetings/f23ae350-1df1-457a-91eb-e30770bb2d09 plus https://example.com/page.';
    const l = fx.linksIn(q).map(fx.classify);
    expect(l.map(x => x.type)).toEqual(['desk', 'kb', 'avoma', 'web']);
    expect(l[0].id).toBe('197800012345678901');
    expect(l[1].slug).toBe('create-and-send-a-mass-text');
    expect(l[2].id).toBe('f23ae350-1df1-457a-91eb-e30770bb2d09');
    expect(l[3].url).toBe('https://example.com/page');
  });
  it('never reads private or local addresses', async () => {
    expect(fx._privateIp('10.0.0.5')).toBe(true); expect(fx._privateIp('192.168.1.2')).toBe(true); expect(fx._privateIp('169.254.169.254')).toBe(true); expect(fx._privateIp('8.8.8.8')).toBe(false);
    expect(await fx.readWeb('http://localhost:3000/x')).toBe(null);
    expect(await fx.readWeb('http://127.0.0.1/admin')).toBe(null);
    expect(await fx.readWeb('https://example.com:8443/x')).toBe(null);
    expect(await fx.readWeb('file:///etc/passwd')).toBe(null);
  });
  it('reads a text file and hides contact details', async () => {
    const r = await fx.readUpload({ buf: Buffer.from('Client: call me at 555-123-4567 or a@b.com about the call flow'), name: 'notes.txt', mime: 'text/plain' });
    expect(r.kind).toBe('doc'); expect(r.text).toMatch(/call flow/); expect(r.text).not.toMatch(/555|a@b/);
    await expect(fx.readUpload({ buf: Buffer.from('MZ'), name: 'x.exe', mime: 'application/octet-stream' })).rejects.toThrow(/cannot be read/);
  });
  it('transcribes a recording and reads a screenshot through the AI', async () => {
    fx.setDeps({ ai: { transcribe: async () => 'Hello, my phones say No Account.', describeImages: async () => ['A Yealink phone screen showing No Account.'] } });
    expect((await fx.readUpload({ buf: Buffer.from('x'.repeat(50)), name: 'call.mp3', mime: 'audio/mpeg' })).text).toMatch(/No Account/);
    expect((await fx.readUpload({ buf: Buffer.from('x'.repeat(50)), name: 'shot.png', mime: 'image/png' })).kind).toBe('image');
    fx.setDeps({ ai: null });
  });
});

describe.skipIf(!sqlite3)('Expert uses the attached files', () => {
  it('puts the attachment in the sources', async () => {
    const ex = require('../../lib/expert.js');
    ex.setDB(new sqlite3.Database(':memory:')); await ex.initSchema();
    let user = '';
    ex.setDeps({ ai: { anyConfigured: () => true, isAnthropicConfigured: () => true, isConfigured: () => false, chatJSON: async () => ({ json: { verdict: 'ok' } }),
      bestJSON: async (o) => { if (/route questions/.test(o.system)) return { json: { search: 'no account phone', alt: [], intent: 'troubleshoot' } }; if (/second reviewer/.test(o.system)) return { json: { verdict: 'ok' } }; user = o.user; return { json: { brief: { bottom_line: 'x', reply: 'y' }, answer: 'x', found: true, confidence: 'high', sources: [] }, provider: 'anthropic' }; } },
      investigate: { isConfigured: () => false, needsLookup: () => false }, ticket: { detect: () => null, load: async () => { throw new Error('none'); } } });
    await ex.ask({ question: 'What does this screen mean?', email: 'a@adit.com', depth: 'fast', attachments: [{ name: 'phone.png', kind: 'image', text: 'A desk phone showing No Account on the screen.' }] });
    expect(user).toMatch(/\[Attached file phone\.png\]/);
    expect(user).toMatch(/No Account on the screen/);
  });
});
