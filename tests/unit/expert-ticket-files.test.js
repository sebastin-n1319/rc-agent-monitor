import { describe, it, expect } from 'vitest';
const fs = require('fs');
const path = require('path');
const et = require('../../lib/expert-ticket.js');

const FIX = path.join(__dirname, '..', 'fixtures');
const files = { '/f/loa.pdf': fs.readFileSync(path.join(FIX, 'loa.pdf')), '/f/form.docx': fs.readFileSync(path.join(FIX, 'form.docx')), '/f/scan.pdf': Buffer.from('%PDF-1.4 not really text'), '/f/notes.txt': Buffer.from('Carrier says port date confirmed for Nov 5'), '/f/inlineImages/shot.png': Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(600)]) };
const at = (d) => new Date(Date.now() - d * 864e5).toISOString();
const desk = {
  isConfigured: () => true,
  fetchBinary: async (href) => ({ mime: 'application/octet-stream', buf: files[href] }),
  fetchRaw: async (p) => {
    if (p.startsWith('/tickets/search')) return { data: [{ id: '9', ticketNumber: '500001', subject: 'Port out' }] };
    if (p === '/tickets/9?include=contacts,assignee,team') return { id: '9', ticketNumber: '500001', subject: 'Port out', status: 'Open', channel: 'Email', createdTime: at(5), customFields: { 'Asana Task Link': 'https://app.asana.com/0/1/2' } };
    if (p.startsWith('/tickets/9/threads?')) return { data: [{ id: 't1', direction: 'in', createdTime: at(5), summary: 'see attached', attachmentCount: 2 }] };
    if (p === '/tickets/9/threads/t1') return { id: 't1', direction: 'in', createdTime: at(5), plainText: 'Please port our number, letter attached.', attachments: [{ name: 'loa.pdf', size: 18000, href: '/f/loa.pdf' }, { name: 'call.mp3', size: 900, href: '/f/call.mp3' }] };
    if (p.startsWith('/tickets/9/comments?')) return { data: [{ id: 'n1', commentedTime: at(4), commenter: { name: 'Lincy' }, content: 'Asana created- <a href="https://app.asana.com/1/715/project/120/task/1218340844303981?focus=true">link</a> Checked carrier, see notes <img src="/f/inlineImages/shot.png" width="600">', attachments: [{ name: 'carrier-notes.txt', size: 40, href: '/f/notes.txt' }] }] };
    if (p.startsWith('/tickets/9/attachments')) return { data: [{ name: 'form.docx', size: 8524, href: '/f/form.docx' }, { name: 'scan.pdf', size: 24, href: '/f/scan.pdf' }, { name: 'loa.pdf', size: 18000, href: '/f/loa.pdf' }] };
    return { data: [] };
  },
};
et.setDesk(desk);
et.setAI({ readDocument: async ({ name }) => `Scanned page of ${name}: signed authorization`, describeImages: async ({ images }) => images.map(() => 'Carrier portal showing port status Approved') });

let haveLibs = true; try { require('pdf-parse/lib/pdf-parse.js'); require('mammoth'); } catch (e) { haveLibs = false; } // not installed on every machine
describe.skipIf(!haveLibs)('Expert opens attached files', () => {
  it('reads PDFs, Word files and scanned PDFs, and names the rest', async () => {
    const tk = await et.load('500001', { deep: true });
    expect(tk.text).toContain('Attached file "loa.pdf", its content');
    expect(tk.text).toContain('Smile Dental');
    expect(tk.text).toContain('Insurance ID');
    expect(tk.text).toContain('(read by the AI) Scanned page of scan.pdf');
    expect(tk.text).toContain('Also attached: call.mp3');
    expect(tk.text.match(/loa\.pdf", its content/g).length).toBe(1);
    expect(tk.text).toContain('File "carrier-notes.txt" attached to the note');
    expect(tk.text).toContain('port date confirmed');
    expect(tk.text).toContain('Screenshot 1 in this note: Carrier portal');
    expect(tk.docs.sort()).toEqual(['carrier-notes.txt', 'form.docx', 'loa.pdf', 'scan.pdf']);
    expect(tk.meta.fields.asana).toContain('asana.com');
    expect(tk.meta.asanaLinks.some((u) => u.includes('1218340844303981'))).toBe(true);
  });
});
