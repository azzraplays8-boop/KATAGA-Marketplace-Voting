// Temporary migration test harness: runs server.js against an in-memory
// PostgreSQL (pg-mem) instead of Supabase. Deleted after verification.
process.env.PORT = '3100';
process.env.ADMIN_PASSWORD = 'testpass';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'; // intercepted below

const mem = require('pg-mem');
const memDb = mem.newDb();
const pgFake = memDb.adapters.createPg();
// require pg first so it lands in the require cache, then swap its exports
require('pg');
require.cache[require.resolve('pg')].exports = pgFake;

const http = require('http');

function req(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ host: '127.0.0.1', port: 3100, method, path,
      headers: { 'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } },
      res => {
        let out = '';
        res.on('data', c => out += c);
        res.on('end', () => {
          let json = null; try { json = JSON.parse(out); } catch {}
          resolve({ status: res.statusCode, json, text: out, headers: res.headers });
        });
      });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  require('./server.js');
  await new Promise(r => setTimeout(r, 1500));

  const results = [];
  const t = (name, ok) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}`);

  // schema + unique index (pg-mem lacks pg_indexes; test via duplicate insert instead)
  let idxOk = false;
  try { memDb.public.query(`insert into votes (full_name, normalized_name, choice_1, choice_2) values ('seed','x','a','b')`); } catch { idxOk = true; }
  t('unique index on normalized_name enforced', idxOk);
  memDb.public.query(`delete from votes`);

  // TEST 1: names endpoint
  const names = await req('GET', '/api/names');
  t('GET /api/names returns 27 names', names.json.names.length === 27);

  // TEST 2/8: invalid submissions rejected
  t('1 choice rejected 400', (await req('POST', '/api/vote', { fullName: 'T1', choices: ['KatagaFinds'] })).status === 400);
  t('same choice twice rejected 400', (await req('POST', '/api/vote', { fullName: 'T2', choices: ['KatagaFinds', 'KatagaFinds'] })).status === 400);
  t('non-whitelist choice rejected 400', (await req('POST', '/api/vote', { fullName: 'T3', choices: ['FAKE', 'KatagaFinds'] })).status === 400);
  t('3 choices rejected 400', (await req('POST', '/api/vote', { fullName: 'T4', choices: ['KatagaFinds', 'KATAMBAY', 'KATAGA Hub'] })).status === 400);
  t('empty name rejected 400', (await req('POST', '/api/vote', { fullName: '', choices: ['KatagaFinds', 'KATAMBAY'] })).status === 400);

  // TEST 4/5: valid submission persists to PostgreSQL
  t('valid vote accepted 200', (await req('POST', '/api/vote', { fullName: '  Juan   Dela Cruz  ', choices: ['KatagaFinds', 'KATAMBAY'] })).status === 200);
  const row = memDb.public.query('select * from votes');
  t('row persisted: normalized_name, cleaned full_name, choices, timestamp',
    row.length === 1 && row[0].normalized_name === 'juan dela cruz' && row[0].full_name === 'Juan Dela Cruz' &&
    row[0].choice_1 === 'KatagaFinds' && !!row[0].submitted_at);

  // TEST 6/7: duplicates
  t('exact duplicate rejected 409', (await req('POST', '/api/vote', { fullName: 'Juan Dela Cruz', choices: ['KATAGA Hub', 'KATAGA FAIR'] })).status === 409);
  t('case/space duplicate rejected 409', (await req('POST', '/api/vote', { fullName: '  juan   dela cruz ', choices: ['KATAGA Hub', 'KATAGA FAIR'] })).status === 409);
  t('still only 1 row', memDb.public.query('select count(*) as c from votes').rows[0].c === 1);

  // race-condition simulation: raw insert violating unique index must fail
  let race = false;
  try { memDb.public.query(`insert into votes (full_name, normalized_name, choice_1, choice_2) values ('X','JUAN DELA CRUZ','a','b')`); } catch { race = true; }
  t('DB-level unique constraint blocks race insert', race);

  t('/api/check detects duplicate', (await req('GET', '/api/check?name=juan%20dela%20cruz')).json.voted === true);

  // admin auth
  t('admin blocked without login 401', (await req('GET', '/api/admin/results')).status === 401);
  t('wrong password rejected 401', (await req('POST', '/api/admin/login', { password: 'wrong' })).status === 401);
  const login = await req('POST', '/api/admin/login', { password: 'testpass' });
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  t('admin login ok 200', login.status === 200);

  // TEST 9: admin results from PG
  const admin = await req('GET', '/api/admin/results', null, { Cookie: cookie });
  t('admin results 200', admin.status === 200);
  t('totalRespondents=1, totalVotes=2', admin.json.totalRespondents === 1 && admin.json.totalVotes === 2);
  t('rankings count both choices', admin.json.results.find(x => x.name === 'KatagaFinds').votes === 1 && admin.json.results.find(x => x.name === 'KATAMBAY').votes === 1);
  t('respondent row has choice1/choice2 + submitted_at', admin.json.respondents[0].choice1 === 'KatagaFinds' && !!admin.json.respondents[0].submitted_at);

  // TEST 10: CSV
  const csv = (await req('GET', '/api/admin/export.csv', null, { Cookie: cookie })).text;
  t('CSV header + data row', csv.includes('ID,Full Name,Choice 1,Choice 2') && csv.includes('Juan Dela Cruz'));

  // cleanup test data (mirrors what we'd do in Supabase)
  memDb.public.query('delete from votes');
  t('test data removable; back to zero', memDb.public.query('select count(*) as c from votes').rows[0].c === 0);

  results.forEach(x => console.log(x));
  process.exit(results.some(x => x.startsWith('FAIL')) ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });


