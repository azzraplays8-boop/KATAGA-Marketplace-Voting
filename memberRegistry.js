﻿// KATAGA Marketplace Voting â€” official member registry and conservative
// member-name matching for the admin-only "Member Voting Status" feature.
//
// This module NEVER changes the public voting flow. It is used only by the
// admin endpoint (server.js, /api/admin/members) to decide which official
// members have already voted based on the existing public.votes rows.

'use strict';

// The 27 official KATAGA members, in the official "Surname, First Name M.I." format.
const OFFICIAL_MEMBERS = [
  'Pesalbon, Ronel A.',
  'Acosta, Finley Hannah F.',
  'Manayaga, John Welter',
  'Manayaga, Jean Myca',
  'Justo, Hanna Kim B.',
  'Jabonillo, Neljane B.',
  'Comodas, Carmela P.',
  'Betco, Bernadeth Jane N.',
  'Tio, Erin Princess V.',
  'Guevarra, Mykah Elois P.',
  'Gurrobat, Mark Jade',
  'Sulit, Jenny Alcantara',
  'Ortiz, Marl Shawn B.',
  'AvendaÃ±o, Hazel Anne O.',
  'Genuino, Yohnnie Marianne F.',
  'Pacaldo, Christine Manuelle',
  'Aquino, Ellaiza',
  'Baliza, Cris Ann Belen B.',
  'Abing, Jea Mae G.',
  'Marco, Denzy Jay Z.',
  'Olimba, Nicole Shane',
  'Loria, Allysa Jean',
  'Bernardo, Amanda Aliya A.',
  'Geocaniga, Charlette C.',
  'Semeniano, Lawrence G.',
  "Ramos, Jhon Michael 'Jhanella'",
  'Viduya, Kimberly V.'
];

// Explicit nickname aliases. ONLY the member explicitly designated gets one.
// "Jhanella" â†’ Jhon Michael 'Jhanella' Ramos
const ALIASES = {
  jhanella: ["Ramos, Jhon Michael 'Jhanella'"]
};

// --- normalization helpers -------------------------------------------------

// Normalize a name for comparison: lowercase, strip commas/periods/apostrophes
// and quote characters, trim, collapse whitespace. The result is a plain
// space-separated token string.
function normalize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/['â€™`"]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split "Surname, Given Names" into { surname, given } tokens. If there is no
// comma the caller supplies interpretations (see below).
function splitOfficial(name) {
  const raw = String(name || '');
  const ci = raw.indexOf(',');
  if (ci === -1) return null;
  const surname = normalize(raw.slice(0, ci));
  const given = normalize(raw.slice(ci + 1));
  return { surnameTokens: surname.split(' ').filter(Boolean), givenTokens: given.split(' ').filter(Boolean) };
}

// --- precomputed registry ---------------------------------------------------

const MEMBERS = OFFICIAL_MEMBERS.map(name => {
  const parts = splitOfficial(name);
  const aliasList = [];
  const normKey = name.toLowerCase();
  for (const [alias, targets] of Object.entries(ALIASES)) {
    if (targets.some(t => t.toLowerCase() === normKey)) aliasList.push(alias);
  }
  return {
    name,
    surnameTokens: parts.surnameTokens,   // e.g. ['pesalbon']
    givenTokens: parts.givenTokens,       // e.g. ['ronel', 'a'] (quotes stripped)
    aliases: aliasList
  };
});

// --- hypothesis generation for a submitted name -----------------------------

// Given a normalized submitted token list, produce plausible
// { surnameTokens, givenTokens } interpretations:
//  - with a comma: exactly one (unambiguous)
//  - without: surname as first token ("pesalbon ronel") OR as last token
//    ("ronel pesalbon")
function hypotheses(tokens, hasComma) {
  if (hasComma) {
    return [{ surnameTokens: tokens.slice(0, 1), givenTokens: tokens.slice(1) }];
  }
  if (tokens.length < 2) return [];
  return [
    { surnameTokens: tokens.slice(0, 1), givenTokens: tokens.slice(1) },
    { surnameTokens: tokens.slice(-1), givenTokens: tokens.slice(0, -1) }
  ];
}

// Score one interpretation against one member.
// Returns { matched, score } where score counts exact given-name token matches.
// A hypothesis matches only when:
//   1. the surname matches the member's surname exactly (all tokens), AND
//   2. at least one given token matches exactly (full word or explicit alias),
//   3. every other given token matches the member's given names (exact or as
//      an initial) â€” so "john welter manayaga" cannot be absorbed into a
//      different person, and a bare initial alone never confirms a match.
function scoreHypothesis(h, member) {
  const surnames = h.surnameTokens;
  if (surnames.length !== member.surnameTokens.length) return null;
  for (let i = 0; i < surnames.length; i++) {
    if (surnames[i] !== member.surnameTokens[i]) return null;
  }

  const acceptedGiven = [...member.givenTokens, ...member.aliases];
  let exact = 0;
  for (const g of h.givenTokens) {
    if (acceptedGiven.includes(g)) { exact++; continue; }
    const initial = acceptedGiven.some(t => t.length > 1 && t[0] === g && g.length === 1);
    if (initial) continue;
    return null; // a given token the member doesn't have â†’ not this person
  }
  if (exact === 0) return null; // surname-only or initials-only never matches
  return { matched: true, score: exact };
}

// --- public API --------------------------------------------------------------

// Classify one submitted vote row against the official members.
// Returns one of:
//   { type: 'matched',    member, submittedName, submittedAt, id, score }
//   { type: 'unmatched',  submittedName, submittedAt, id, possibleMatches: [memberName,...] }
//
// `possibleMatches` uses a deliberately looser rule (surname match plus any
// given-name agreement, or a unique single-token name) so the admin sees
// candidates for review instead of a silent guess. A submission is only ever
// counted as a member's vote under the STRICT rule above.
function classifySubmission(row) {
  const raw = String(row.full_name || '');
  const norm = normalize(raw);
  const tokens = norm.split(' ').filter(Boolean);
  const hasComma = raw.includes(',');
  const base = { id: row.id, submittedName: raw.trim(), submittedAt: row.submitted_at };

  if (tokens.length === 0) return { ...base, type: 'unmatched', possibleMatches: [] };

  // Single-token submission (should not normally pass the public validator,
  // but historical rows may contain anything). Only a UNIQUE given-name or
  // alias match across all 27 members counts as a "possible match".
  if (tokens.length === 1 && !hasComma) {
    const hits = MEMBERS.filter(m =>
      m.givenTokens.includes(tokens[0]) || m.aliases.includes(tokens[0])
    );
    return { ...base, type: 'unmatched', possibleMatches: hits.length === 1 ? [hits[0].name] : [] };
  }

  // STRICT pass: confident match required to mark a member as voted.
  let best = null; // { member, score }
  let tied = false;
  for (const member of MEMBERS) {
    for (const h of hypotheses(tokens, hasComma)) {
      const s = scoreHypothesis(h, member);
      if (!s) continue;
      if (!best || s.score > best.score) { best = { member, score: s.score }; tied = false; }
      else if (s.score === best.score && member.name !== best.member.name) tied = true;
    }
  }
  if (best && !tied) {
    return { ...base, type: 'matched', member: best.member, score: best.score };
  }

  // LOOSE pass: candidates for the "possible match" column (never auto-assigns).
  const candidates = new Set();
  for (const member of MEMBERS) {
    for (const h of hypotheses(tokens, hasComma)) {
      if (h.surnameTokens.length !== member.surnameTokens.length) continue;
      if (!h.surnameTokens.every((t, i) => t === member.surnameTokens[i])) continue;
      const acceptedGiven = [...member.givenTokens, ...member.aliases];
      const anyGiven = h.givenTokens.some(g =>
        acceptedGiven.includes(g) || acceptedGiven.some(t => t.length > 1 && t[0] === g && g.length === 1)
      );
      if (anyGiven) candidates.add(member.name);
    }
  }
  // Tied strict scores are genuinely ambiguous â€” still list them for review.
  if (tied && best) candidates.add(best.member.name);

  return { ...base, type: 'unmatched', possibleMatches: [...candidates] };
}

// Full report for the admin dashboard.
// rows: [{ id, full_name, submitted_at }] from the existing votes table.
function buildMemberReport(rows) {
  const matchedByMember = new Map(); // member name -> row
  const unmatched = [];

  for (const row of rows) {
    const result = classifySubmission(row);
    if (result.type === 'matched') {
      // first (earliest) submission wins; later duplicates shouldn't exist
      // anyway thanks to the unique index.
      if (!matchedByMember.has(result.member.name)) matchedByMember.set(result.member.name, result);
    } else {
      unmatched.push(result);
    }
  }

  // Members whose only "evidence" is an ambiguous/unmatched submission get a
  // needs-review flag so the admin knows to look at the unmatched list.
  const possibleFor = new Set();
  unmatched.forEach(u => (u.possibleMatches || []).forEach(m => possibleFor.add(m)));

  const members = MEMBERS.map(m => {
    const hit = matchedByMember.get(m.name);
    let status = 'not_voted';
    if (hit) status = 'voted';
    else if (possibleFor.has(m.name)) status = 'needs_review';
    return {
      name: m.name,
      status,
      submittedName: hit ? hit.submittedName : null,
      submittedAt: hit ? hit.submittedAt : null,
      submissionId: hit ? hit.id : null
    };
  });

  const voted = members.filter(m => m.status === 'voted').length;
  const needsReview = members.filter(m => m.status === 'needs_review').length;
  const notVoted = members.length - voted - needsReview;
  const total = members.length;

  return {
    totalMembers: total,
    voted,
    needsReview,
    notVoted,
    participationRate: total ? +(((voted) / total) * 100).toFixed(1) : 0,
    members,
    unmatchedSubmissions: unmatched.map(u => ({
      id: u.id,
      submittedName: u.submittedName,
      submittedAt: u.submittedAt,
      possibleMatches: u.possibleMatches
    }))
  };
}

module.exports = {
  OFFICIAL_MEMBERS,
  MEMBERS,
  normalize,
  classifySubmission,
  buildMemberReport
};
