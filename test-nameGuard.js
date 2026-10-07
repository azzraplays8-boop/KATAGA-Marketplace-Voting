// Tests for nameGuard.js — run: node test-nameGuard.js
'use strict';
const assert = require('assert');
const g = require('./nameGuard');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('PASS: ' + name); }
  catch (e) { failed++; console.log('FAIL: ' + name + ' -> ' + e.message); }
}

// --- Full-name validation ---
test('rejects single-word name "Rome"', () => assert(g.validateFullName('Rome')));
test('rejects single-word name "Ronel"', () => assert(g.validateFullName('Ronel')));
test('rejects "Dela Cruz" (no identifying tokens)', () => assert(g.validateFullName('Dela Cruz')));
test('rejects empty', () => assert(g.validateFullName('   ')));
test('accepts "Rome Fin Dela Cruz"', () => assert.strictEqual(g.validateFullName('Rome Fin Dela Cruz'), null));
test('accepts "John Santos"', () => assert.strictEqual(g.validateFullName('John Santos'), null));
test('accepts "Maria Dela Cruz"', () => assert.strictEqual(g.validateFullName('Maria Dela Cruz'), null));
test('normalizes messy input', () => assert.strictEqual(g.normalizeName('  ROME   FIN   DELA CRUZ  '), 'rome fin dela cruz'));
test('normalizes with periods', () => assert.strictEqual(g.normalizeName('Rome F. Dela Cruz'), 'rome f dela cruz'));

// --- Duplicate detection (existing: rome fin dela cruz) ---
const EXISTING = 'rome fin dela cruz';
test('T1: exact duplicate ROME FIN DELA CRUZ blocked', () => assert(g.isLikelyDuplicate(g.normalizeName('ROME FIN DELA CRUZ'), EXISTING)));
test('T2: extra-space version blocked', () => assert(g.isLikelyDuplicate(g.normalizeName('Rome   Fin   Dela Cruz'), EXISTING)));
test('T3: Rome Fin blocked', () => assert(g.isLikelyDuplicate('rome fin', EXISTING)));
test('T4: Rome Dela Cruz blocked', () => assert(g.isLikelyDuplicate('rome dela cruz', EXISTING)));
test('T5: Fin Dela Cruz blocked', () => assert(g.isLikelyDuplicate('fin dela cruz', EXISTING)));
test('T10: Rome F. Dela Cruz blocked', () => assert(g.isLikelyDuplicate(g.normalizeName('Rome F. Dela Cruz'), EXISTING)));

// --- Must NOT block ---
test('John Dela Cruz vs Maria Dela Cruz NOT blocked', () => assert(!g.isLikelyDuplicate('john dela cruz', 'maria dela cruz')));
test('John Santos vs Maria Santos NOT blocked', () => assert(!g.isLikelyDuplicate('john santos', 'maria santos')));
test('Anna Reyes vs Carlo Reyes NOT blocked', () => assert(!g.isLikelyDuplicate('anna reyes', 'carlo reyes')));
test('Maria Dela Cruz vs Rome Fin Dela Cruz NOT blocked', () => assert(!g.isLikelyDuplicate('maria dela cruz', EXISTING)));
test('Ann vs Joanne — no substring match', () => { assert(g.isLikelyDuplicate('ann', 'joanne') === false); });
test('different 2-token names not blocked', () => assert(!g.isLikelyDuplicate('rome cruz', 'maria cruz')));

// --- Partial match, different people, same family ---
test('T8: Maria Dela Cruz allowed vs existing', () => assert(!g.isLikelyDuplicate('maria dela cruz', EXISTING)));
test('T9: John Santos allowed vs Maria Santos', () => assert(!g.isLikelyDuplicate('john santos', 'maria santos')));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
