'use strict';
/**
 * Batch 345: database backups go to Google Drive (never to anyone's computer), so they can be reached at any time.
 * The checked backup copy (storage-guard.backup) is gzipped and uploaded with the tool's Google service account:
 *   - as the Drive owner set in Settings > Storage when the service account may act for that person (domain-wide
 *     delegation with the Drive scope), into their folder; or
 *   - into a shared drive folder the service account is a member of.
 * The last KEEP backups in the folder are kept; older ones this tool made are moved to the trash.
 */
const fs = require('fs'), zlib = require('zlib');
const KEEP = Number(process.env.BACKUP_KEEP || 3);
function key() { try { return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''); } catch (e) { return null; } }
function client(subject) {
  const { google } = require('googleapis');
  const k = key(); if (!k) throw new Error('The Google service account is not set up (GOOGLE_SERVICE_ACCOUNT_KEY)');
  const auth = new google.auth.JWT({ email: k.client_email, key: k.private_key, scopes: ['https://www.googleapis.com/auth/drive'], subject: subject || undefined });
  return google.drive({ version: 'v3', auth });
}

/** Uploads file (gzipped) to the folder. Returns { id, link, mb, as }. */
async function upload(file, { folderId, asUser } = {}) {
  if (!folderId) throw new Error('Set the Drive backup folder in Settings > Storage first');
  const name = 'rc-monitor-backup-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.db.gz';
  const tries = asUser ? [asUser, null] : [null];
  let last = null;
  // Batch 345.2: the service account has no Drive storage of its own, so it cannot create files in a person's folder.
  // It can replace the content of a file that person owns, though (the storage stays theirs): the folder holds
  // placeholder files named rc-monitor-backup-slot-1..3, and each backup overwrites the oldest one.
  try {
    const drive = client(null);
    const r = await drive.files.list({ q: `'${folderId}' in parents and name contains 'rc-monitor-backup' and trashed = false`, orderBy: 'modifiedTime', fields: 'files(id, name, modifiedTime)', supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 20 });
    const slot = (r.data.files || []).find((f) => /slot/i.test(f.name) || /rc-monitor-backup-\d{4}/.test(f.name));
    if (slot) {
      const u = await drive.files.update({ fileId: slot.id, requestBody: { name: name.replace('rc-monitor-backup-', 'rc-monitor-backup-slot-'), description: 'RC Agent Monitor database backup (SQLite, gzipped). Made before a compaction. Restore: gunzip, then use the .db file.' },
        media: { mimeType: 'application/gzip', body: fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })) }, supportsAllDrives: true, fields: 'id, webViewLink, size' });
      return { id: u.data.id, link: u.data.webViewLink, mb: Math.round(Number(u.data.size || 0) / 1048576), as: 'service account (owner slot)' };
    }
  } catch (e) { /* fall through to creating a file */ }
  for (const who of tries) {
    try {
      const drive = client(who);
      const r = await drive.files.create({ requestBody: { name, parents: [folderId], description: 'RC Agent Monitor database backup (SQLite, gzipped). Made before a compaction.' },
        media: { mimeType: 'application/gzip', body: fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })) }, supportsAllDrives: true, fields: 'id, webViewLink, size' });
      await prune(drive, folderId).catch(() => {});
      return { id: r.data.id, link: r.data.webViewLink, mb: Math.round(Number(r.data.size || 0) / 1048576), as: who ? 'owner' : 'service account' };
    } catch (e) { last = e; }
  }
  const m = String((last && (last.errors && last.errors[0] && last.errors[0].message)) || (last && last.message) || 'upload failed');
  throw new Error(/storageQuota|quota/i.test(m) ? 'Drive refused the upload (the service account has no storage of its own). Use a shared drive folder the service account is a member of, or let it act for the folder owner.' : /unauthorized_client|delegation/i.test(m) ? 'The service account may not act for that person in Drive. Use a shared drive folder instead.' : m);
}
async function prune(drive, folderId) {
  const r = await drive.files.list({ q: `'${folderId}' in parents and name contains 'rc-monitor-backup-' and trashed = false`, orderBy: 'createdTime desc', fields: 'files(id, name)', supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 50 });
  for (const f of (r.data.files || []).slice(KEEP)) await drive.files.update({ fileId: f.id, requestBody: { trashed: true }, supportsAllDrives: true }).catch(() => {});
}
module.exports = { upload };
