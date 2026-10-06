require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kataga2025';

// ---------- Database setup (local SQLite file, persists across restarts) ----------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'votes.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    choice1 TEXT NOT NULL,
    choice2 TEXT NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

const OFFICIAL_NAMES = [
  'KatagaFinds',
  'KATAMBAY',
  'Kataga Marketverse',
  'KATAGA Hub',
  'Kataga & Co.',
  'Kataga Studio',
  'KATAlogue',
  'KATAGALERY',
  'KATAGPUAN',
  'KATAGUYOD-Marketplace',
  'KATAGA MarketSpace',
  'KATAGA MarketLand',
  'KA—TIANGGE',
  'KA—VENTURES',
  'KA—MERKADO',
  'KATAGA FAIR',
  'KATAGA EXPO',
  'KATAGA MART',
  'KATAGA BAZAAR',
  'KA—RAVAN',
  'kaTAGAtinda',
  'KATAGAWA',
  'KATAGORA',
  'KATAGANI',
  'KATAGORY',
  'KATAGATHERS',
  'KATAGALIKHA'
];

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const normalizeName = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();

// ---------- API: get name options ----------
app.get('/api/names', (req, res) => {
  res.json({ names: OFFICIAL_NAMES });
});

// ---------- API: submit a vote ----------
app.post('/api/vote', (req, res) => {
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim().replace(/\s+/g, ' ') : '';
    const { choices } = req.body;

    if (!fullName || fullName.length < 2 || fullName.length > 80) {
      return res.status(400).json({ error: 'Please enter your full name (2–80 characters).' });
    }

    if (!Array.isArray(choices) || choices.length !== 2) {
      return res.status(400).json({ error: 'You must select exactly TWO (2) marketplace names.' });
    }

    const [c1, c2] = choices;
    if (!OFFICIAL_NAMES.includes(c1) || !OFFICIAL_NAMES.includes(c2)) {
      return res.status(400).json({ error: 'One or more selected names are not in the official list.' });
    }
    if (c1 === c2) {
      return res.status(400).json({ error: 'You must choose two DIFFERENT names.' });
    }

    const nameKey = normalizeName(fullName);

    // prevent double voting (also guards double clicks via UNIQUE name_key)
    const existing = db.prepare('SELECT id FROM votes WHERE name_key = ?').get(nameKey);
    if (existing) {
      return res.status(409).json({
        error: `A vote has already been recorded under the name "${fullName}". One response per person — thank you for participating!`
      });
    }

    db.prepare('INSERT INTO votes (full_name, name_key, choice1, choice2) VALUES (?, ?, ?, ?)')
      .run(fullName, nameKey, c1, c2);

    res.json({ ok: true, message: 'Your vote has been recorded. Thank you for voting!' });
  } catch (err) {
    if (/UNIQUE constraint/i.test(err && err.message)) {
      return res.status(409).json({ error: 'A vote has already been recorded under that name. One response per person.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong while saving your vote. Please try again.' });
  }
});

// ---------- API: check if a name has already voted (friendly pre-check) ----------
app.get('/api/check', (req, res) => {
  const name = (req.query.name || '').toString();
  if (!name) return res.json({ voted: false });
  const row = db.prepare('SELECT id FROM votes WHERE name_key = ?').get(normalizeName(name));
  res.json({ voted: !!row });
});

// ---------- Admin auth ----------
const ADMIN_COOKIE = 'kataga_admin';
const crypto = require('crypto');
const sessions = new Set();

app.post('/api/admin/login', (req, res) => {
  const pw = req.body && req.body.password;
  if (pw === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString('hex');
    sessions.add(token);
    res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Incorrect admin password.' });
});

app.post('/api/admin/logout', (req, res) => {
  const token = parseCookie(req)[ADMIN_COOKIE];
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

function parseCookie(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function requireAdmin(req, res, next) {
  const token = parseCookie(req)[ADMIN_COOKIE];
  if (token && sessions.has(token)) return next();
  res.status(401).json({ error: 'Not authorized. Please log in.' });
}

// ---------- API: admin results ----------
app.get('/api/admin/results', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, full_name, choice1, choice2, submitted_at FROM votes ORDER BY submitted_at DESC, id DESC').all();
  const totalRespondents = rows.length;

  const tally = {};
  OFFICIAL_NAMES.forEach(n => tally[n] = 0);
  rows.forEach(r => {
    if (r.choice1 in tally) tally[r.choice1]++;
    if (r.choice2 in tally) tally[r.choice2]++;
  });

  const results = OFFICIAL_NAMES.map(name => ({
    name,
    votes: tally[name],
    percentage: totalRespondents ? +((tally[name] / totalRespondents) * 100).toFixed(1) : 0
  })).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  res.json({
    totalRespondents,
    totalVotes: totalRespondents * 2,
    results,
    respondents: rows
  });
});

// ---------- API: admin CSV export ----------
app.get('/api/admin/export.csv', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, full_name, choice1, choice2, submitted_at FROM votes ORDER BY id ASC').all();
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = ['ID,Full Name,Choice 1,Choice 2,Date/Time Submitted'];
  rows.forEach(r => lines.push([r.id, r.full_name, r.choice1, r.choice2, r.submitted_at].map(esc).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kataga-votes.csv"');
  // BOM so Excel opens UTF-8 names correctly
  res.send('\uFEFF' + lines.join('\r\n'));
});

// ---------- API: admin delete a respondent (with client-side confirmation) ----------
app.delete('/api/admin/respondent/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM votes WHERE id = ?').run(Number(req.params.id) || 0);
  if (info.changes === 0) return res.status(404).json({ error: 'Respondent not found.' });
  res.json({ ok: true });
});

// ---------- Routes ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ---------- Start ----------
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  let lanIps = [];
  Object.values(nets).flat().forEach(n => {
    if (n && n.family === 'IPv4' && !n.internal) lanIps.push(n.address);
  });

  console.log('======================================================');
  console.log('  KATAGA Marketplace Name Voting System is running.');
  console.log('======================================================');
  console.log('');
  console.log('  This device:');
  console.log(`  http://localhost:${PORT}`);
  console.log('');
  if (lanIps.length) {
    console.log('  Other devices on the same Wi-Fi:');
    lanIps.forEach(ip => console.log(`  http://${ip}:${PORT}`));
  } else {
    console.log('  Other devices on the same Wi-Fi:');
    console.log(`  http://YOUR-LOCAL-IP:${PORT}   (run "ipconfig" to find your IPv4 address)`);
  }
  console.log('');
  console.log(`  Admin dashboard: http://localhost:${PORT}/admin`);
  console.log('  Database file:   data/votes.db');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('======================================================');
});
