'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* .env is optional when variables come from the environment */ }

const express = require('express');
const QRCode = require('qrcode');
const store = require('./db');
const { DEPARTMENTS, OTHER_DEPARTMENT, AWARENESS } = require('./config');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
// The URL encoded in the QR code. Phones must be able to reach it, so it defaults to this
// machine's LAN address rather than localhost.
const BASE_URL = (process.env.BASE_URL || `http://${lanAddress()}:${PORT}`).replace(/\/+$/, '');
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

const BRAND_BLUE = '#29408E';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIEWS = path.join(__dirname, 'views');

if (ADMIN_PASSWORD.length < 8) {
  console.error('ADMIN_PASSWORD must be set to at least 8 characters. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(securityHeaders);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => res.redirect('/admin'));

// ---------------------------------------------------------------------------
// Public: the page attendees land on after scanning the QR code
// ---------------------------------------------------------------------------

app.get('/a/:code', (req, res) => res.sendFile(path.join(VIEWS, 'attend.html')));

app.get('/api/attend/:code', (req, res) => {
  const session = store.getSessionByCode(req.params.code);
  if (!session) return res.status(404).json({ error: 'This check-in link is not valid.' });
  res.json({
    title: session.title,
    eventDate: session.eventDate,
    open: session.isOpen,
    departments: [...DEPARTMENTS, OTHER_DEPARTMENT],
    otherDepartment: OTHER_DEPARTMENT,
    emailDomains: ALLOWED_EMAIL_DOMAINS,
    campaign: AWARENESS.enabled ? { lure: AWARENESS.lure, reveal: AWARENESS.reveal } : null,
  });
});

app.post('/api/attend/:code', (req, res) => {
  const session = store.getSessionByCode(req.params.code);
  if (!session) return res.status(404).json({ error: 'This check-in link is not valid.' });
  if (!session.isOpen) return res.status(410).json({ error: 'Check-in for this session is closed.' });

  const { errors, value } = validateAttendee(req.body || {});
  if (errors) return res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });

  const { duplicate, record } = store.addAttendance(session.id, value);
  if (duplicate) {
    return res.status(409).json({
      error: `${record.email} has already checked in to this session.`,
      name: record.name,
      checkedInAt: record.checkedInAt,
    });
  }
  res.status(201).json({ name: record.name, checkedInAt: record.checkedInAt });
});

// ---------------------------------------------------------------------------
// Admin: create sessions, show QR codes, view and export attendance
// ---------------------------------------------------------------------------

app.use(['/admin', '/api/admin'], requireAdmin);

app.get('/admin', (req, res) => res.sendFile(path.join(VIEWS, 'admin.html')));
app.get('/admin/sessions/:id', (req, res) => res.sendFile(path.join(VIEWS, 'session.html')));

app.param('sessionId', (req, res, next, id) => {
  const session = /^\d+$/.test(id) && store.getSession(Number(id));
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  req.attendanceSession = session;
  next();
});

app.get('/api/admin/sessions', (req, res) => {
  res.json(store.listSessions().map(withAttendUrl));
});

app.post('/api/admin/sessions', (req, res) => {
  const title = String(req.body?.title ?? '').trim().replace(/\s+/g, ' ');
  const eventDate = String(req.body?.eventDate ?? '').trim();
  if (title.length < 2 || title.length > 120) {
    return res.status(400).json({ error: 'Enter a session title (2–120 characters).' });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) {
    return res.status(400).json({ error: 'Enter a valid date.' });
  }
  res.status(201).json(withAttendUrl(store.createSession(title, eventDate)));
});

app.get('/api/admin/sessions/:sessionId', (req, res) => {
  const session = req.attendanceSession;
  res.json({ ...withAttendUrl(session), awareness: AWARENESS.enabled, attendees: store.listAttendance(session.id) });
});

app.patch('/api/admin/sessions/:sessionId', (req, res) => {
  if (typeof req.body?.open !== 'boolean') return res.status(400).json({ error: '"open" must be true or false.' });
  store.setSessionOpen(req.attendanceSession.id, req.body.open);
  res.json(withAttendUrl(store.getSession(req.attendanceSession.id)));
});

app.delete('/api/admin/sessions/:sessionId', (req, res) => {
  store.deleteSession(req.attendanceSession.id);
  res.status(204).end();
});

app.get('/api/admin/sessions/:sessionId/qr.png', async (req, res) => {
  // Error correction level H tolerates ~30% damage, leaving room for the logo drawn over the centre.
  const png = await QRCode.toBuffer(attendUrl(req.attendanceSession), {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 1024,
    color: { dark: BRAND_BLUE, light: '#FFFFFF' },
  });
  res.type('png').set('Cache-Control', 'no-store').send(png);
});

app.get('/api/admin/sessions/:sessionId/attendance.csv', (req, res) => {
  const session = req.attendanceSession;
  const rows = store.listAttendance(session.id).map((a, i) => [
    i + 1, a.name, a.email, a.department, formatLocalDateTime(a.checkedInAt),
  ]);
  const csv = [['#', 'Name', 'Email', 'Department', 'Checked in'], ...rows]
    .map((cols) => cols.map(csvCell).join(','))
    .join('\r\n');
  const slug = session.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session';
  // BOM so Excel opens UTF-8 names correctly.
  res.type('text/csv').attachment(`attendance-${session.eventDate}-${slug}.csv`).send(`﻿${csv}\r\n`);
});

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

app.listen(PORT, () => {
  console.log('Platcorp attendance is running');
  console.log(`  Admin dashboard: http://localhost:${PORT}/admin  (user: ${ADMIN_USER})`);
  console.log(`  QR codes link to: ${BASE_URL}/a/<code>`);
  if (!process.env.BASE_URL) {
    console.log('  Phones must be on the same network. Set BASE_URL in .env if this address is wrong.');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attendUrl(session) {
  return `${BASE_URL}/a/${session.code}`;
}

function withAttendUrl(session) {
  return { ...session, attendUrl: attendUrl(session) };
}

function validateAttendee(body) {
  const errors = {};
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(body.email ?? '').trim().toLowerCase();
  let department = String(body.department ?? '').trim();

  if (name.length < 2 || name.length > 100) errors.name = 'Enter your full name.';

  if (email.length > 254 || !EMAIL_RE.test(email)) {
    errors.email = 'Enter a valid email address.';
  } else if (ALLOWED_EMAIL_DOMAINS.length && !ALLOWED_EMAIL_DOMAINS.includes(email.split('@')[1])) {
    errors.email = `Use your work email (${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(' or ')}).`;
  }

  if (department === OTHER_DEPARTMENT) {
    department = String(body.departmentOther ?? '').trim().replace(/\s+/g, ' ');
    if (department.length < 2 || department.length > 60) errors.departmentOther = 'Enter your department.';
  } else if (!DEPARTMENTS.includes(department)) {
    errors.department = 'Select your department.';
  }

  return Object.keys(errors).length ? { errors } : { value: { name, email, department } };
}

function requireAdmin(req, res, next) {
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    // Evaluate both comparisons so timing doesn't reveal which one failed.
    const userOk = safeEqual(decoded.slice(0, sep), ADMIN_USER);
    const passOk = safeEqual(decoded.slice(sep + 1), ADMIN_PASSWORD);
    if (sep > -1 && userOk && passOk) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Platcorp Attendance Admin", charset="UTF-8"');
  res.status(401).send('Authentication required.');
}

function safeEqual(a, b) {
  const hash = (s) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(hash(a), hash(b));
}

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; " +
      "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
}

// Prefix cells that spreadsheet apps would treat as formulas.
function csvCell(value) {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function formatLocalDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Pick the address phones on the same network can reach, skipping VM/container adapters
// (Windows often names those "Ethernet N", so check MAC vendor prefixes too).
function lanAddress() {
  const virtualName = /virtual|vethernet|vmware|vbox|wsl|docker|hyper-v|loopback/i;
  const virtualMac = /^(0a:00:27|08:00:27|00:05:69|00:0c:29|00:1c:14|00:50:56|00:15:5d|02:42)/i;
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (virtualName.test(name)) continue;
    const v4 = addrs?.find((a) => a.family === 'IPv4' && !a.internal && !virtualMac.test(a.mac));
    if (v4) return v4.address;
  }
  return 'localhost';
}
