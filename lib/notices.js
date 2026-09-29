/**
 * Session 68: tool-wide notification centre (the bell in the main header).
 *
 * Sources merged by the front end:
 *   1. Admin announcements written here (audience + category)
 *   2. "What's new" entries shipped in public/whats-new.json, imported once
 *   3. Personal items for one person (notifyPerson)
 *   4. Assessment items, which still live in lib/assessments.js
 * Each person can mute categories; urgent posts ignore the mute.
 */
const fs = require('fs');
const path = require('path');
let _db = null;
function setDB(db) { _db = db; }
const run = (sql, p = []) => new Promise((res, rej) => _db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => _db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => _db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const lc = (s) => String(s || '').trim().toLowerCase();
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B-\u001F]/g, ' ').trim().slice(0, n);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CATEGORIES = [
  { key: 'update', label: 'Tool updates' },
  { key: 'process', label: 'Process and policy' },
  { key: 'schedule', label: 'Breaks and schedule' },
  { key: 'assessments', label: 'Assessments' },
  { key: 'general', label: 'General' },
];
const CAT_KEYS = new Set(CATEGORIES.map(c => c.key));
const AUDIENCES = new Set(['all', 'agents', 'admins', 'people']);

async function initSchema() {
  await run(`CREATE TABLE IF NOT EXISTS tool_notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, body TEXT, link TEXT,
    category TEXT NOT NULL DEFAULT 'general',
    audience TEXT NOT NULL DEFAULT 'all',
    people TEXT, urgent INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'admin', ref TEXT,
    created_by TEXT, created_at TEXT DEFAULT (datetime('now')), expires_at TEXT)`);
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_notices_ref ON tool_notices(ref) WHERE ref IS NOT NULL`);
  await run(`CREATE TABLE IF NOT EXISTS tool_notice_reads (email TEXT NOT NULL, notice_id INTEGER NOT NULL, PRIMARY KEY (email, notice_id))`);
  await run(`CREATE TABLE IF NOT EXISTS tool_notice_prefs (email TEXT PRIMARY KEY, muted TEXT)`);
}

/** Insert entries from public/whats-new.json that are not in the table yet. */
async function importWhatsNew() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'whats-new.json'), 'utf8')); } catch (e) { return 0; }
  if (!Array.isArray(list)) return 0;
  let added = 0;
  for (const it of list.slice(0, 50)) {
    const ref = clean(it.id, 80);
    if (!ref || !it.title) continue;
    const r = await run(`INSERT OR IGNORE INTO tool_notices (title, body, link, category, audience, urgent, source, ref, created_by)
      VALUES (?,?,?,?,?,0,'release',?,'release')`,
      [clean(it.title, 140), clean(it.body, 600), clean(it.link, 200), CAT_KEYS.has(it.category) ? it.category : 'update', AUDIENCES.has(it.audience) ? it.audience : 'all', ref]);
    if (r.changes) added++;
  }
  return added;
}

async function mutedFor(email) {
  const r = await get(`SELECT muted FROM tool_notice_prefs WHERE email = ?`, [lc(email)]);
  try { const a = JSON.parse(r && r.muted || '[]'); return Array.isArray(a) ? a.filter(k => CAT_KEYS.has(k)) : []; } catch (e) { return []; }
}
async function setMuted(email, cats) {
  const list = [...new Set((Array.isArray(cats) ? cats : []).filter(k => CAT_KEYS.has(k)))];
  await run(`INSERT INTO tool_notice_prefs (email, muted) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET muted = excluded.muted`, [lc(email), JSON.stringify(list)]);
  return list;
}

function visibleTo(row, me, isAdmin) {
  if (row.audience === 'all') return true;
  if (row.audience === 'admins') return isAdmin;
  if (row.audience === 'agents') return !isAdmin;
  if (row.audience === 'people') { try { return JSON.parse(row.people || '[]').map(lc).includes(me); } catch (e) { return false; } }
  return false;
}

async function listFor(email, isAdmin) {
  const me = lc(email);
  const rows = await all(`SELECT n.*, CASE WHEN r.notice_id IS NULL THEN 0 ELSE 1 END AS read
    FROM tool_notices n LEFT JOIN tool_notice_reads r ON r.notice_id = n.id AND r.email = ?
    WHERE n.created_at > datetime('now', '-45 days') AND (n.expires_at IS NULL OR n.expires_at > datetime('now'))
    ORDER BY n.id DESC LIMIT 200`, [me]);
  const muted = await mutedFor(me);
  const items = rows.filter(r => visibleTo(r, me, isAdmin)).slice(0, 60).map(r => ({
    id: r.id, title: r.title, body: r.body || '', link: r.link || '', category: r.category, urgent: !!r.urgent,
    source: r.source, at: r.created_at, read: !!r.read, muted: muted.includes(r.category) && !r.urgent,
  }));
  return { items, muted, categories: CATEGORIES, unread: items.filter(i => !i.read && !i.muted).length };
}

async function markRead(email, ids, isAdmin) {
  const me = lc(email);
  let list = Array.isArray(ids) ? ids.map(Number).filter(Boolean) : null;
  if (!list) list = (await listFor(me, isAdmin)).items.filter(i => !i.read).map(i => i.id);
  for (const id of list.slice(0, 200)) await run(`INSERT OR IGNORE INTO tool_notice_reads (email, notice_id) VALUES (?,?)`, [me, id]);
}

async function createNotice(by, b) {
  const title = clean(b.title, 140);
  if (!title) { const e = new Error('Add a title'); e.status = 400; throw e; }
  const audience = AUDIENCES.has(b.audience) ? b.audience : 'all';
  let people = null;
  if (audience === 'people') {
    const list = [...new Set((Array.isArray(b.people) ? b.people : []).map(lc).filter(e => EMAIL_RE.test(e)))].slice(0, 200);
    if (!list.length) { const e = new Error('Pick at least one person'); e.status = 400; throw e; }
    people = JSON.stringify(list);
  }
  let expires = null;
  const days = Number(b.expiresInDays);
  if (days > 0 && days <= 365) expires = new Date(Date.now() + days * 86400000).toISOString().replace('T', ' ').slice(0, 19);
  const link = clean(b.link, 200);
  if (link && !/^(https:\/\/|\/)/.test(link)) { const e = new Error('Link must start with https:// or /'); e.status = 400; throw e; }
  const r = await run(`INSERT INTO tool_notices (title, body, link, category, audience, people, urgent, source, created_by, expires_at)
    VALUES (?,?,?,?,?,?,?,'admin',?,?)`,
    [title, clean(b.body, 600), link, CAT_KEYS.has(b.category) ? b.category : 'general', audience, people, b.urgent ? 1 : 0, lc(by), expires]);
  return r.lastID;
}
/** Personal item for one person (used by server-side events). */
async function notifyPerson(email, { title, body = '', link = '', category = 'general', urgent = false }) {
  if (!EMAIL_RE.test(lc(email)) || !title) return;
  await run(`INSERT INTO tool_notices (title, body, link, category, audience, people, urgent, source, created_by, expires_at)
    VALUES (?,?,?,?,'people',?,?,'personal','system',datetime('now','+14 days'))`,
    [clean(title, 140), clean(body, 600), clean(link, 200), CAT_KEYS.has(category) ? category : 'general', JSON.stringify([lc(email)]), urgent ? 1 : 0]);
}
/** Post to a whole audience ('admins' or 'agents' or 'all'). */
async function notifyAudience(audience, { title, body = '', link = '', category = 'general', urgent = false, days = 14 }) {
  if (!AUDIENCES.has(audience) || audience === 'people' || !title) return;
  await run(`INSERT INTO tool_notices (title, body, link, category, audience, urgent, source, created_by, expires_at)
    VALUES (?,?,?,?,?,?,'personal','system',datetime('now','+' || ? || ' days'))`,
    [clean(title, 140), clean(body, 600), clean(link, 200), CAT_KEYS.has(category) ? category : 'general', audience, urgent ? 1 : 0, Math.max(1, Math.min(60, Number(days) || 14))]);
}
async function adminList() {
  const rows = await all(`SELECT n.*, (SELECT COUNT(*) FROM tool_notice_reads r WHERE r.notice_id = n.id) AS reads
    FROM tool_notices n WHERE n.source = 'admin' ORDER BY n.id DESC LIMIT 100`);
  return rows.map(r => ({ id: r.id, title: r.title, body: r.body || '', category: r.category, audience: r.audience,
    people: r.people ? JSON.parse(r.people) : [], urgent: !!r.urgent, at: r.created_at, by: r.created_by, expires: r.expires_at, reads: r.reads }));
}
async function deleteNotice(id) {
  await run(`DELETE FROM tool_notice_reads WHERE notice_id = ?`, [Number(id)]);
  return (await run(`DELETE FROM tool_notices WHERE id = ? AND source = 'admin'`, [Number(id)])).changes;
}
module.exports = { setDB, initSchema, importWhatsNew, listFor, markRead, setMuted, createNotice, notifyPerson, notifyAudience, adminList, deleteNotice, CATEGORIES };
