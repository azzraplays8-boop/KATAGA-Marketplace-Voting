// KATAGA Marketplace Name Voting — voter name normalization & conservative
// duplicate detection. Used by server.js for ALL validation (server-side only
// enforcement; the frontend merely mirrors the friendly messages).

'use strict';

// Words that identify a person (first/middle/last names) vs. particles and
// suffixes that carry no identifying information. Particles like "dela",
// "de", "san" are shared by huge numbers of Filipino family names and must
// NEVER be counted when deciding whether two names are the same person.
const NON_IDENTIFYING = new Set([
  // particles / connectors
  'de', 'del', 'dela', 'de los', 'las', 'los', 'da', 'di', 'du',
  'san', 'santa', 'sto', 'sto', 'sta',
  // suffixes
  'jr', 'sr', 'ii', 'iii', 'iv', 'v',
  // honorifics
  'mr', 'mrs', 'ms', 'miss', 'dr', 'prof'
]);

// Normalize: trim, collapse internal whitespace, lowercase, strip periods
// (so "F." and "F" and "fin" comparisons are consistent).
function normalizeName(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split a normalized name into tokens.
function tokenize(normalized) {
  return normalized.split(' ').filter(Boolean);
}

// Meaningful (identifying) tokens only. A single letter counts as an initial
// (kept for matching, but NOT counted as a standalone meaningful word).
function identifyingTokens(normalized) {
  return tokenize(normalized).filter(t => !NON_IDENTIFYING.has(t));
}

// Words that are meaningful identifiers (length >= 2 and not a particle).
function meaningfulTokens(normalized) {
  return identifyingTokens(normalized).filter(t => t.length >= 2);
}

// Friendly validation. Returns null if OK, otherwise a user-facing message.
function validateFullName(rawName) {
  const normalized = normalizeName(rawName);
  if (!normalized) {
    return 'Please enter your full name (first name and last name).';
  }
  if (normalized.length < 3 || normalized.length > 80) {
    return 'Please enter your full name (3–80 characters).';
  }
  const words = meaningfulTokens(normalized);
  if (words.length < 2) {
    return 'Please enter your full name (first name and last name).';
  }
  return null;
}

// Whole-token match: exact, OR initial ("f" matches "fin"). Deliberately NOT
// substring matching — "ann" must never match "joanne".
function tokenMatches(a, b) {
  if (a === b) return true;
  if (a.length === 1 && b.length > 1 && b[0] === a) return true;
  if (b.length === 1 && a.length > 1 && a[0] === b) return true;
  return false;
}

// Conservative duplicate decision between two ALREADY-NORMALIZED names.
//
// Rule: the SHORTER name (fewer identifying tokens) must be fully covered by
// the longer one, the shorter must contain at least 2 identifying tokens, and
// at least 2 of those tokens must match EXACTLY (initial-only matches alone
// are never enough to block someone).
//
//   "rome fin dela cruz" vs "rome fin"          -> covered, 2 exact  => true
//   "rome fin dela cruz" vs "rome dela cruz"    -> covered, 2 exact  => true
//   "rome fin dela cruz" vs "fin dela cruz"     -> covered, 2 exact  => true
//   "rome fin dela cruz" vs "rome f dela cruz"  -> covered, 2 exact  => true
//   "john dela cruz"     vs "maria dela cruz"   -> "john" uncovered  => false
//   "john santos"        vs "maria santos"      -> "john" uncovered  => false
//   "rome cruz"          vs "maria cruz"        -> "rome" uncovered  => false
function isLikelyDuplicate(normalizedA, normalizedB) {
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;

  const identA = identifyingTokens(normalizedA);
  const identB = identifyingTokens(normalizedB);
  if (identA.length < 2 || identB.length < 2) return false;

  // shorter must be the subset candidate
  const [shorter, longer] = identA.length <= identB.length ? [identA, identB] : [identB, identA];
  if (shorter.length === longer.length && normalizedA !== normalizedB) {
    // Same number of identifying tokens but different names — require every
    // token to match (handles pure initial-expansion swaps, e.g. two-token
    // names where one token is an initial of the other).
  }

  let exactMatches = 0;
  let covered = true;
  for (const st of shorter) {
    const exact = longer.some(lt => lt === st);
    const any = exact || longer.some(lt => tokenMatches(st, lt));
    if (!any) { covered = false; break; }
    if (exact) exactMatches++;
  }

  return covered && shorter.length >= 2 && exactMatches >= 2;
}

module.exports = {
  normalizeName,
  tokenize,
  identifyingTokens,
  meaningfulTokens,
  validateFullName,
  isLikelyDuplicate,
  NON_IDENTIFYING
};
