# Platcorp QR Attendance

Generate a QR code for a meeting, training or event. Attendees scan it with their phone and
fill in a short form: **name, email and department**. The organiser sees check-ins live and
can export them to CSV/Excel.

## How it works

1. An admin opens `/admin`, creates a session (title + date) and gets a branded QR code.
2. The QR code is shown full screen on a projector, printed, or shared as a PNG/link.
3. Attendees scan it, land on `/a/<code>` and submit their name, email and department.
4. Check-ins appear on the session page within a few seconds. Each email can check in
   once per session. Close the session when the event ends to stop late check-ins.
5. **Export CSV** downloads the attendance list (opens directly in Excel).

## Setup

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`, so there's no database to install).

```bash
npm install
cp .env.example .env     # then set ADMIN_PASSWORD (and BASE_URL when deployed)
npm start
```

Open http://localhost:3000/admin and sign in with `ADMIN_USER` / `ADMIN_PASSWORD` from `.env`.

### Making the QR code reachable from phones

The QR code encodes `BASE_URL/a/<code>`. If `BASE_URL` is empty the server uses this
computer's LAN IP (printed at startup), which works when phones are on the same Wi-Fi.
On Windows, allow Node.js through the firewall when prompted.

For real use, deploy behind HTTPS and set `BASE_URL` to the public address, e.g.
`https://attendance.platcorpgroup.com`. Basic auth sends the admin password with every
request, so the admin dashboard should only be used over HTTPS outside a trusted network.

## Running with Docker

```bash
cp .env.example .env     # set ADMIN_PASSWORD and BASE_URL (see below)
docker compose up -d --build
```

The app listens inside the container on 3000, published to `http://localhost:3000`
(override the host port with `HOST_PORT=8080 docker compose up -d`). The SQLite
database is kept in the named volume `qr-data`, so it survives restarts and rebuilds.

**You must set `BASE_URL` in `.env`.** Inside a container the app cannot detect the
host's LAN address, so QR codes would otherwise point at the container's internal IP.
Set it to the address phones will actually open, e.g. `http://192.168.1.20:3000`
(this host's LAN IP) or, in production, `https://attendance.example.com`.

Logs: `docker compose logs -f` · Stop: `docker compose down` (add `-v` to also delete
the database).

## Configuration

| Setting | Where | Purpose |
| --- | --- | --- |
| `ADMIN_USER`, `ADMIN_PASSWORD` | `.env` | Admin dashboard login |
| `PORT` | `.env` | Server port (default 3000) |
| `BASE_URL` | `.env` | Address encoded in QR codes |
| `ALLOWED_EMAIL_DOMAINS` | `.env` | Restrict check-ins to work emails, e.g. `platcorpgroup.com` |
| `DB_PATH` | `.env` | SQLite file location (default `data/attendance.db`) |
| Department list | `config.js` | Options in the form's department dropdown |

## Project layout

```
server.js        Express app: routes, validation, admin auth, QR + CSV generation
db.js            SQLite schema and queries
config.js        Department list
views/           attend.html (attendee form), admin.html, session.html
public/          CSS, browser JS and Platcorp logo assets
```
