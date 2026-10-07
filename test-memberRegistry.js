// Test suite for the admin-only Member Voting Status name matching.
// Run: node test-memberRegistry.js
'use strict';
const { classifySubmission, buildMemberReport, OFFICIAL_MEMBERS } = require('./memberRegistry');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label); }
}

const row = (name) => ({ id: 1, full_name: name, submitted_at: '2026-10-07T18:30:00Z' });

console.log('--- Required test cases ---');

// 1. Pesalbon, Ronel A. ← "Ronel Pesalbon"
let r = classifySubmission(row('Ronel Pesalbon'));
check('Ronel Pesalbon → Pesalbon, Ronel A. VOTED', r.type === 'matched' && r.member.name === 'Pesalbon, Ronel A.');

// 2. "Ronel A. Pesalbon"
r = classifySubmission(row('Ronel A. Pesalbon'));
check('Ronel A. Pesalbon → Pesalbon, Ronel A. VOTED', r.type === 'matched' && r.member.name === 'Pesalbon, Ronel A.');

// extra accepted formats
r = classifySubmission(row('Ronel A Pesalbon'));
check('Ronel A Pesalbon → VOTED', r.type === 'matched' && r.member.name === 'Pesalbon, Ronel A.');
r = classifySubmission(row('Pesalbon, Ronel'));
check('Pesalbon, Ronel → VOTED', r.type === 'matched' && r.member.name === 'Pesalbon, Ronel A.');
r = classifySubmission(row('Pesalbon Ronel'));
check('Pesalbon Ronel → VOTED', r.type === 'matched' && r.member.name === 'Pesalbon, Ronel A.');

// 3. Manayaga disambiguation
r = classifySubmission(row('John Manayaga'));
check('John Manayaga → John Welter Manayaga VOTED', r.type === 'matched' && r.member.name === 'Manayaga, John Welter');
r = classifySubmission(row('Jean Myca Manayaga'));
check('Jean Myca Manayaga → Jean Myca VOTED', r.type === 'matched' && r.member.name === 'Manayaga, Jean Myca');
r = classifySubmission(row('Manayaga'));
check('Bare "Manayaga" → NOT matched to anyone', r.type === 'unmatched');

// 4. Nickname alias
r = classifySubmission(row("Jhanella Ramos"));
check("Jhanella Ramos → Ramos, Jhon Michael 'Jhanella' VOTED", r.type === 'matched' && r.member.name === "Ramos, Jhon Michael 'Jhanella'");
r = classifySubmission(row('Jhon Michael Ramos'));
check('Jhon Michael Ramos → VOTED', r.type === 'matched' && r.member.name === "Ramos, Jhon Michael 'Jhanella'");
r = classifySubmission(row("Jhon Michael 'Jhanella' Ramos"));
check("Jhon Michael Jhanella Ramos → VOTED", r.type === 'matched' && r.member.name === "Ramos, Jhon Michael 'Jhanella'");

// 5. Unknown → unmatched, with no possible match
r = classifySubmission(row('Unknown Person'));
check('Unknown Person → UNMATCHED, no possible match', r.type === 'unmatched' && r.possibleMatches.length === 0);

console.log('--- Conservative / uncertain cases ---');

// First-name-only → unmatched with a possible match listed
r = classifySubmission(row('Finley'));
check('Finley → unmatched with possible match Acosta, Finley Hannah F.', r.type === 'unmatched' && r.possibleMatches.includes('Acosta, Finley Hannah F.'));

// Surname-only in different forms must never match
r = classifySubmission(row('Guevarra'));
check('Bare surname "Guevarra" → unmatched', r.type === 'unmatched');

// wrong first name, same surname → never matched
r = classifySubmission(row('Maria Pesalbon'));
check('Maria Pesalbon → NOT counted as Pesalbon, Ronel A.', !(r.type === 'matched' && r.member.name === 'Pesalbon, Ronel A.'));

// someone who doesn't exist at all
r = classifySubmission(row('Juan Dela Cruz'));
check('Juan Dela Cruz → unmatched', r.type === 'unmatched');

// each official name matches itself in canonical format
console.log('--- Canonical self-matches (all 27) ---');
let allSelf = true;
for (const m of OFFICIAL_MEMBERS) {
  const res = classifySubmission(row(m));
  if (!(res.type === 'matched' && res.member.name === m)) {
    allSelf = false;
    console.log('  FAIL self-match for: ' + m + ' → ' + JSON.stringify(res));
  }
}
check('All 27 official members self-match in canonical format', allSelf);

// also comma-less canonical form, e.g. "Hanna Kim Justo"
r = classifySubmission(row('Hanna Kim Justo'));
check('Hanna Kim Justo → Justo, Hanna Kim B. VOTED', r.type === 'matched' && r.member.name === 'Justo, Hanna Kim B.');

// full report sanity
console.log('--- buildMemberReport ---');
const rows = [
  row('Ronel Pesalbon'),
  { id: 2, full_name: 'John Manayaga', submitted_at: '2026-10-07T19:00:00Z' },
  { id: 3, full_name: 'Unknown Person', submitted_at: '2026-10-07T19:05:00Z' },
  { id: 4, full_name: 'Finley', submitted_at: '2026-10-07T19:10:00Z' }
];
const report = buildMemberReport(rows);
check('totalMembers = 27', report.totalMembers === 27);
check('voted = 2 (Pesalbon + John Welter Manayaga)', report.voted === 2);
check('Jean Myca Manayaga is not_voted', report.members.find(m => m.name === 'Manayaga, Jean Myca').status === 'not_voted');
check('Acosta needs review (Finley)', report.members.find(m => m.name === 'Acosta, Finley Hannah F.').status === 'needs_review');
check('1 unmatched submission with no possible match', report.unmatchedSubmissions.length === 2 && report.unmatchedSubmissions.find(u => u.submittedName === 'Unknown Person').possibleMatches.length === 0);
check('participation rate = 2/27 = 7.4%', report.participationRate === 7.4);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
