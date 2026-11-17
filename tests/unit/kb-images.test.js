import { describe, it, expect } from 'vitest';
const kb = require('../../lib/kb-live.js');
// Batch 380: Help Center screenshots are kept as image blocks so Expert can show them with an answer.
describe('kb-live images', () => {
  it('keeps absolute https images as img blocks and drops relative ones', () => {
    const b = kb.htmlToBlocks('<h2>Step</h2><p>Open the Family File</p><p><img alt="Family File" src="https://help.adit.com/galleryDocuments/x?inline=true&amp;a=1"></p><img src="/rel.png"><p>Done</p>');
    expect(b.filter(x => x.t === 'img')).toEqual([{ t: 'img', src: 'https://help.adit.com/galleryDocuments/x?inline=true&a=1', alt: 'Family File' }]);
    expect(b.map(x => x.t)).toEqual(['h3', 'p', 'img', 'p']);
  });
});
