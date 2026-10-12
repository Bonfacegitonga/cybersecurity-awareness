'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'attendance.db'));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS sessions (
    id          INTEGER PRIMARY KEY,
    code        TEXT    NOT NULL UNIQUE,
    title       TEXT    NOT NULL,
    event_date  TEXT    NOT NULL,
    is_open     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id             INTEGER PRIMARY KEY,
    session_id     INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name           TEXT    NOT NULL,
    email          TEXT    NOT NULL,
    department     TEXT    NOT NULL,
    checked_in_at  TEXT    NOT NULL,
    UNIQUE (session_id, email)
  );
`);

const SESSION_COLUMNS = `
  s.id, s.code, s.title, s.event_date AS eventDate, s.is_open AS isOpen, s.created_at AS createdAt,
  (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id) AS attendeeCount
`;

const stmt = {
  listSessions: db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s ORDER BY s.event_date DESC, s.id DESC`),
  getSession: db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.id = ?`),
  getSessionByCode: db.prepare(`SELECT ${SESSION_COLUMNS} FROM sessions s WHERE s.code = ?`),
  insertSession: db.prepare('INSERT INTO sessions (code, title, event_date, created_at) VALUES (?, ?, ?, ?)'),
  setSessionOpen: db.prepare('UPDATE sessions SET is_open = ? WHERE id = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
  listAttendance: db.prepare(`
    SELECT name, email, department, checked_in_at AS checkedInAt
    FROM attendance WHERE session_id = ? ORDER BY checked_in_at, id
  `),
  findAttendance: db.prepare(`
    SELECT name, email, department, checked_in_at AS checkedInAt
    FROM attendance WHERE session_id = ? AND email = ?
  `),
  insertAttendance: db.prepare(`
    INSERT INTO attendance (session_id, name, email, department, checked_in_at) VALUES (?, ?, ?, ?, ?)
  `),
};

// Rows come back as null-prototype objects with 0/1 flags; normalise them for JSON.
const toSession = (row) => row && { ...row, isOpen: Boolean(row.isOpen) };

module.exports = {
  listSessions: () => stmt.listSessions.all().map(toSession),
  getSession: (id) => toSession(stmt.getSession.get(id)),
  getSessionByCode: (code) => toSession(stmt.getSessionByCode.get(code)),

  createSession(title, eventDate) {
    // Unguessable code so the check-in URL for one session can't be derived from another.
    const code = crypto.randomBytes(6).toString('base64url');
    const { lastInsertRowid } = stmt.insertSession.run(code, title, eventDate, new Date().toISOString());
    return this.getSession(lastInsertRowid);
  },

  setSessionOpen: (id, open) => stmt.setSessionOpen.run(open ? 1 : 0, id),
  deleteSession: (id) => stmt.deleteSession.run(id),
  listAttendance: (sessionId) => stmt.listAttendance.all(sessionId).map((row) => ({ ...row })),

  // node:sqlite is synchronous, so check-then-insert can't interleave with another request.
  addAttendance(sessionId, { name, email, department }) {
    const existing = stmt.findAttendance.get(sessionId, email);
    if (existing) return { duplicate: true, record: { ...existing } };
    const checkedInAt = new Date().toISOString();
    stmt.insertAttendance.run(sessionId, name, email, department, checkedInAt);
    return { duplicate: false, record: { name, email, department, checkedInAt } };
  },
};
