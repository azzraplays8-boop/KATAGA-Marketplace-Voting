require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');
const nameGuard = require('./nameGuard');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'kataga2025';

// ---------- Database setup (Supabase PostgreSQL via DATABASE_URL) ----------
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('FATAL: DATABASE_URL is not set. Add it to .env or your hosting environment.');
  process.exit(1);
}

// Supabase requires SSL. rejectUnauthorized:false allows the session pooler's
// certificate chain to be accepted even when intermediates are not sent.
const needsSsl = /supabase\.(co|com)|pooler\.supabase/i.test(connectionString) || process.env.PGSSL === 'require';
const pool = new Pool({
  connectionString,
  ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      id             BIGSERIAL PRIMARY KEY,
      full_name      TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      choice_1       TEXT NOT NULL,
      choice_2       TEXT NOT NULL,
      submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Database-level duplicate protection (race-condition safe)
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS votes_normalized_name_unique ON votes (normalized_name)');
}

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

// Use the shared normalizer from nameGuard (lowercase, dot-stripped,
// whitespace-collapsed) so stored normalized_name values and comparisons
// are always consistent. Existing stored values are already lowercase with
// collapsed spaces; the only addition is stripped periods, which is a
// backward-compatible refinement (a name submitted earlier with periods
// would have its UNIQUE key match the new form going forward).
const normalizeName = (s) => nameGuard.normalizeName(s);
const EXACT_DUPLICATE_MSG = 'It looks like you have already submitted your vote.';
const LIKELY_DUPLICATE_MSG = 'It looks like you may have already submitted a vote. If you believe this is a mistake, please contact a KATAGA officer.';

// ---------- API: get name options ----------
app.get('/api/names', (req, res) => {
  res.json({ names: OFFICIAL_NAMES });
});

// ---------- API: submit a vote ----------
app.post('/api/vote', async (req, res) => {
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim().replace(/\s+/g, ' ') : '';
    const { choices } = req.body;

    if (!fullName) {
      return res.status(400).json({ error: 'Please enter your full name (first name and last name).' });
    }

    // Require a proper full name (at least two meaningful name words).
    const nameError = nameGuard.validateFullName(fullName);
    if (nameError) {
      return res.status(400).json({ error: nameError });
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

    // prevent double voting (also guards double clicks via UNIQUE index)
    const existing = await pool.query('SELECT id FROM votes WHERE normalized_name = $1', [nameKey]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: EXACT_DUPLICATE_MSG });
    }

    // Conservative partial-name duplicate check: load existing normalized
    // names and compare using whole-word token logic (never substring
    // matching). The existing voter's name is NEVER echoed back to the
    // public API.
    const { rows: existingNames } = await pool.query('SELECT normalized_name FROM votes');
    if (existingNames.some(r => nameGuard.isLikelyDuplicate(nameKey, r.normalized_name))) {
      return res.status(409).json({ error: LIKELY_DUPLICATE_MSG });
    }

    await pool.query(
      'INSERT INTO votes (full_name, normalized_name, choice_1, choice_2) VALUES ($1, $2, $3, $4)',
      [fullName, nameKey, c1, c2]
    );

    res.json({ ok: true, message: 'Your vote has been recorded. Thank you for voting!' });
  } catch (err) {
    if (err && err.code === '23505') { // unique_violation – race-safe duplicate rejection
      return res.status(409).json({ error: EXACT_DUPLICATE_MSG });
    }
    console.error('POST /api/vote failed:', err.code || '', err.message);
    res.status(500).json({ error: 'Something went wrong while saving your vote. Please try again.' });
  }
});

// ---------- API: check if a name has already voted (friendly pre-check) ----------
app.get('/api/check', async (req, res) => {
  try {
    const name = (req.query.name || '').toString();
    if (!name) return res.json({ voted: false });
    const nameKey = normalizeName(name);
    const result = await pool.query('SELECT normalized_name FROM votes');
    const voted = result.rows.some(r => r.normalized_name === nameKey || nameGuard.isLikelyDuplicate(nameKey, r.normalized_name));
    res.json({ voted });
  } catch (err) {
    console.error('GET /api/check failed:', err.code || '', err.message);
    res.status(500).json({ voted: false });
  }
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
app.get('/api/admin/results', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, full_name, choice_1 AS "choice1", choice_2 AS "choice2", submitted_at FROM votes ORDER BY submitted_at DESC, id DESC'
    );
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
  } catch (err) {
    console.error('GET /api/admin/results failed:', err.code || '', err.message);
    res.status(500).json({ error: 'Could not load results. Please try again.' });
  }
});

// ---------- API: admin CSV export ----------
app.get('/api/admin/export.csv', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, full_name, choice_1 AS "choice1", choice_2 AS "choice2", submitted_at FROM votes ORDER BY id ASC'
    );
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = ['ID,Full Name,Choice 1,Choice 2,Date/Time Submitted'];
    rows.forEach(r => lines.push([r.id, r.full_name, r.choice1, r.choice2, r.submitted_at].map(esc).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kataga-votes.csv"');
    // BOM so Excel opens UTF-8 names correctly
    res.send('\uFEFF' + lines.join('\r\n'));
  } catch (err) {
    console.error('GET /api/admin/export.csv failed:', err.code || '', err.message);
    res.status(500).json({ error: 'Could not export data. Please try again.' });
  }
});

// ---------- API: admin delete a respondent (with client-side confirmation) ----------
app.delete('/api/admin/respondent/:id', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM votes WHERE id = $1', [Number(req.params.id) || 0]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Respondent not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/admin/respondent failed:', err.code || '', err.message);
    res.status(500).json({ error: 'Could not delete respondent. Please try again.' });
  }
});

// ---------- Routes ----------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ---------- Start ----------
(async () => {
  try {
    await initDb();
    console.log('  PostgreSQL schema ready (votes table + unique index).');
  } catch (err) {
    console.error('FATAL: could not initialize PostgreSQL schema:', err.code || '', err.message);
    process.exit(1);
  }

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
  console.log('  Database:        Supabase PostgreSQL (via DATABASE_URL)');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('======================================================');
  });
})();
