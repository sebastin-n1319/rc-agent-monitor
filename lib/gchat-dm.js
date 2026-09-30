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
async function sendDM({ asEmail, toEmail, text, transport }) {
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
    await request({ url: 'https://chat.googleapis.com/v1/' + space + '/messages', method: 'POST', data: { text: body } });
    return { ok: true };
  } catch (e) {
    if (e && e.status && !e.response) throw e;
    const err = new Error(explain(e)); err.status = 424; throw err;
  }
}

module.exports = { sendDM, available, SCOPES, explain };
