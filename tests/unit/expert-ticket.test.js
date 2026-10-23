import { describe, it, expect } from 'vitest';
const { detect } = require('../../lib/expert-ticket.js');

describe('expert ticket number detection', () => {
  it('finds the ticket number in the ways agents write it', () => {
    expect(detect('498391 - how to handle this ticket')).toBe('498391');
    expect(detect('420302 - how to handle it')).toBe('420302');
    expect(detect('#417854 how should I respond?')).toBe('417854');
    expect(detect('ticket no 417854')).toBe('417854');
    expect(detect('how do I reply to 417854')).toBe('417854');
    expect(detect('498391')).toBe('498391');
  });
  it('ignores phone numbers, dates and zip codes', () => {
    expect(detect('call from 555-123-4567 about sync')).toBe(null);
    expect(detect('zip 75201 patient')).toBe(null);
    expect(detect('appointment on 10/23/2026 not syncing')).toBe(null);
    expect(detect('how to handle 2026 billing')).toBe(null);
  });
});

describe('expert ticket screenshots', () => {
  const { _imagesIn } = require('../../lib/expert-ticket.js');
  it('picks pasted and attached screenshots, skips logos, icons and other files', () => {
    const f = { content: '<img width="280" height="67" src="/api/v1/threads/1/inlineImages/abc?et=1&amp;f=1.png"/><img src="https://ci3.googleusercontent.com/logo.png" width="100"/><img src="/api/v1/threads/1/inlineImages/x" width="16" height="16"/>',
      attachments: [{ name: 'shot.JPG', size: 2000, href: 'https://desk.zoho.com/api/v1/tickets/9/threads/1/attachments/5/content' }, { name: 'a.pdf', size: 10, href: 'x' }] };
    expect(_imagesIn(f)).toEqual(['/api/v1/threads/1/inlineImages/abc?et=1&amp;f=1.png', 'https://desk.zoho.com/api/v1/tickets/9/threads/1/attachments/5/content']);
  });
});
