// Verifies /api/admin/members is registered, admin-protected, and returns a
// proper report — using a stubbed pg Pool (no real database needed).
'use strict';
process.env.DATABASE_URL = 'postgres://stub:stub@localhost:5432/stub';
process.env.PORT = '3999';
process.env.ADMIN_PASSWORD = 'test-admin-pw'; // dotenv won't override existing env vars

const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'pg') {
    return {
      Pool: class {
        constructor() {}
        async query(sql) {
          if (/SELECT id, full_name, submitted_at FROM votes/.test(sql)) {
            return {
              rows: [
                { id: 1, full_name: 'Ronel Pesalbon', submitted_at: '2026-10-07T18:30:00.000Z' },
                { id: 2, full_name: 'John Manayaga', submitted_at: '2026-10-07T19:00:00.000Z' },
                { id: 3, full_name: 'Unknown Person', submitted_at: '2026-10-07T19:05:00.000Z' },
                { id: 4, full_name: 'Finley', submitted_at: '2026-10-07T19:10:00.000Z' }
              ]
            };
          }
          return { rows: [], rowCount: 0 };
        }
        async connect() { return { release() {} }; }
        on() {}
      }
    };
  }
  return origLoad.apply(this, arguments);
};

// silence the startup log a bit
const origLog = console.log; console.log = () => {};
require('./server.js');
console.log = origLog;

const http = require('http');
function req(method, path, cookie) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: 3999, path, method, headers: cookie ? { Cookie: cookie } : { 'Content-Type': 'application/json' } }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    r.on('error', reject);
    if (method === 'POST') r.write(JSON.stringify({ password: 'test-admin-pw' }));
    r.end();
  });
}

(async () => {
  await new Promise(r => setTimeout(r, 500));

  // 1. no cookie -> 401
  const unauth = await req('GET', '/api/admin/members');
  console.log('unauthenticated /api/admin/members ->', unauth.status, unauth.status === 401 ? '(PASS)' : '(FAIL!)');

  // 2. login -> cookie
  const login = await req('POST', '/api/admin/login');
  const cookie = (login.headers['set-cookie'] || [''])[0].split(';')[0];
  console.log('login ->', login.status);

  // 3. with cookie -> full report
  const auth = await req('GET', '/api/admin/members', cookie);
  const data = JSON.parse(auth.body);
  console.log('authenticated /api/admin/members ->', auth.status);
  console.log('totalMembers:', data.totalMembers, '| voted:', data.voted, '| needsReview:', data.needsReview, '| notVoted:', data.notVoted, '| rate:', data.participationRate + '%');
  const pesalbon = data.members.find(m => m.name === 'Pesalbon, Ronel A.');
  const jean = data.members.find(m => m.name === 'Manayaga, Jean Myca');
  const acosta = data.members.find(m => m.name === 'Acosta, Finley Hannah F.');
  console.log('Pesalbon status:', pesalbon.status, '| submitted as:', pesalbon.submittedName);
  console.log('Jean Myca status:', jean.status);
  console.log('Acosta status:', acosta.status);
  console.log('unmatched:', JSON.stringify(data.unmatchedSubmissions.map(u => ({ n: u.submittedName, p: u.possibleMatches }))));

  const ok =
    unauth.status === 401 &&
    auth.status === 200 &&
    data.totalMembers === 27 && data.voted === 2 &&
    pesalbon.status === 'voted' && jean.status === 'not_voted' &&
    acosta.status === 'needs_review' &&
    data.unmatchedSubmissions.length === 2;

  console.log(ok ? '\nALL SERVER TESTS PASSED' : '\nSERVER TESTS FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
