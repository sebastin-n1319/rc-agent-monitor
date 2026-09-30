'use strict';
// Private Google Chat messages without a webhook. Uses the Chat API with the
// service account (domain-wide delegation), acting as the signed-in admin, so
// the message arrives as a direct message from that admin.
// One-time setup in Google: enable the Google Chat API in the project, and add
// these two scopes to the service account in Workspace admin, Domain-wide delegation:
//   https://www.googleapis.com/auth/chat.spaces.create
//   https://www.googleapis.com/auth/chat.messages.create
const SCOPES = ['https://www.googleapis.com/auth/chat.spaces.create', 'https://www.googleapis.com/auth/chat.messages.create'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function available() { return !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY; }

function explain(e) {
  const m = String((e && (e.message || (e.response && e.response.data && e.response.data.error && e.response.data.error.message))) || e || '');
  if (/unauthorized_client|not authorized|access_denied|invalid_scope/i.test(m)) return 'Google has not allowed private messages yet. A Workspace admin needs to add the two Chat scopes to the service account under Domain-wide delegation (see the note under the dialog).';
  if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(m)) return 'The Google Chat API is not enabled for this project. Enable it in Google Cloud, then try again.';
  if (/not found|invalid.*member|NOT_FOUND/i.test(m)) return 'Google could not find that person in Chat. Check the email address.';
  if (/permission|PERMISSION_DENIED|forbidden|403/i.test(m)) return 'Google refused the private message. The person may have Chat DMs limited by policy.';
  return 'Could not send the private message (' + m.slice(0, 140) + ')';
}

/** Sends `text` as a DM from `asEmail` to `toEmail`. `transport` is for tests. */
async function sendDM({ asEmail, toEmail, text, transport, image, imageUrl }) {
  const from = String(asEmail || '').trim().toLowerCase(), to = String(toEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) { const e = new Error('Pick a person to message'); e.status = 400; throw e; }
  if (!EMAIL_RE.test(from)) { const e = new Error('Could not tell who is sending'); e.status = 400; throw e; }
  const body = String(text || '').trim().slice(0, 4000);
  if (!body) { const e = new Error('Nothing to send'); e.status = 400; throw e; }
  try {
    let request = transport;
    if (!request) {
      if (!available()) { const e = new Error('Private messages need the Google service account (GOOGLE_SERVICE_ACCOUNT_KEY is not set)'); e.status = 503; throw e; }
      const { google } = require('googleapis');
      const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: SCOPES, clientOptions: { subject: from } });
      const client = await auth.getClient();
      request = (o) => client.request(o);
    }
    const sp = await request({ url: 'https://chat.googleapis.com/v1/spaces:setup', method: 'POST',
      data: { space: { spaceType: 'DIRECT_MESSAGE' }, memberships: [{ member: { name: 'users/' + to, type: 'HUMAN' } }] } });
    const space = sp && sp.data && sp.data.name;
    if (!space) throw new Error('Google did not open a direct message');
    let data = { text: body }, attached = false;
    if (image) {
      try {
        const b = 'b' + require('crypto').randomBytes(8).toString('hex');
        const payload = Buffer.concat([Buffer.from('--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ filename: 'results-chart.png' }) + '\r\n--' + b + '\r\nContent-Type: image/png\r\n\r\n'), image, Buffer.from('\r\n--' + b + '--')]);
        const up = await request({ url: 'https://chat.googleapis.com/upload/v1/' + space + '/attachments:upload?uploadType=multipart', method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: payload });
        const ref = up && up.data && up.data.attachmentDataRef;
        if (ref) { data.attachment = [{ attachmentDataRef: ref }]; attached = true; }
      } catch (e) { attached = false; }
      if (!attached && imageUrl) data.text = body + '\nChart: ' + imageUrl;
    }
    await request({ url: 'https://chat.googleapis.com/v1/' + space + '/messages', method: 'POST', data });
    return { ok: true, imageAttached: attached };
  } catch (e) {
    if (e && e.status && !e.response) throw e;
    const err = new Error(explain(e)); err.status = 424; throw err;
  }
}

// ── As the "T1 Agent Monitor" Chat app (app authentication, no delegation needed) ──
const BOT_SCOPE = 'https://www.googleapis.com/auth/chat.bot';
function explainBot(e) {
  const m = String((e && (e.message || (e.response && e.response.data && e.response.data.error && e.response.data.error.message))) || e || '');
  if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(m)) return 'The Google Chat API is not enabled for the project. Enable it in Google Cloud, then try again.';
  if (/Chat app not found|not configured|no chat app|Chat API has not been configured/i.test(m)) return 'The Chat app is not configured yet. In Google Cloud, open Google Chat API, then Configuration, and save the app (name T1 Agent Monitor).';
  if (/not found|NOT_FOUND|404/i.test(m)) return 'T1 Agent Monitor has no chat with that person yet. Ask your Workspace admin to install the app for the organisation, or ask the person to open Google Chat, find "T1 Agent Monitor" and say hi once.';
  if (/permission|PERMISSION_DENIED|forbidden|403/i.test(m)) return 'Google refused the message from T1 Agent Monitor. Check the app is installed for that person and its visibility includes them.';
  return 'Could not send the private message (' + m.slice(0, 140) + ')';
}
/** DM from the Chat app. `ids` are user ids or emails to try in order. `transport` is for tests. */
async function sendBotDM({ toEmail, ids, text, imageUrl, transport }) {
  const to = String(toEmail || '').trim().toLowerCase();
  if (!EMAIL_RE.test(to)) { const e = new Error('Pick a person to message'); e.status = 400; throw e; }
  const body = String(text || '').trim().slice(0, 4000);
  if (!body) { const e = new Error('Nothing to send'); e.status = 400; throw e; }
  try {
    let request = transport;
    if (!request) {
      if (!available()) { const e = new Error('Private messages need the Google service account (GOOGLE_SERVICE_ACCOUNT_KEY is not set)'); e.status = 503; throw e; }
      const { google } = require('googleapis');
      const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY), scopes: [BOT_SCOPE] });
      const client = await auth.getClient();
      request = (o) => client.request(o);
    }
    const tries = [...(Array.isArray(ids) ? ids : []).filter(Boolean).map(x => 'users/' + String(x).replace(/^users\//, '')), 'users/' + to];
    let space = null, last = null;
    for (const name of [...new Set(tries)]) {
      try { const r = await request({ url: 'https://chat.googleapis.com/v1/spaces:findDirectMessage?name=' + encodeURIComponent(name), method: 'GET' }); if (r && r.data && r.data.name) { space = r.data.name; break; } } catch (e) { last = e; }
    }
    if (!space) throw last || new Error('not found');
    const data = { text: body };
    if (imageUrl) data.cardsV2 = [{ cardId: 'chart', card: { sections: [{ widgets: [{ image: { imageUrl, altText: 'Assessment results chart' } }] }] } }];
    await request({ url: 'https://chat.googleapis.com/v1/' + space + '/messages', method: 'POST', data });
    return { ok: true, imageAttached: !!imageUrl, via: 'app' };
  } catch (e) {
    if (e && e.status && !e.response) throw e;
    const err = new Error(explainBot(e)); err.status = 424; throw err;
  }
}

module.exports = { sendDM, sendBotDM, available, SCOPES, explain, explainBot };
