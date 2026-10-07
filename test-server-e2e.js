// End-to-end server test with in-memory PostgreSQL (pg-mem).
// Does NOT touch the real Supabase database.
'use strict';
const { newDb } = require('pg-mem');

process.env.DATABASE_URL = 'postgres://test:test@localhost/test';
const db = newDb();
const mem = db.adapters.createPg();

// Patch pg so server.js uses the in-memory instance
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'pg') return { Pool: mem.Pool };
  return origRequire.apply(this, arguments);
};

const { pool } = { pool: null };
const assert = require('assert');

(async () => {
  const server = require('./server.js');
  // wait for listen
  await new Promise(r => setTimeout(r, 1500));

  const BASE = 'http://localhost:3210';
  const post = async (body) => {
    const res = await fetch(BASE + '/api/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: res.status, body: await res.json() };
  };

  let passed = 0, failed = 0;
  async function t(name, fn) {
    try { await fn(); passed++; console.log('PASS: ' + name); }
    catch (e) { failed++; console.log('FAIL: ' + name + ' -> ' + e.message); }
  }

  const CH = ['KatagaFinds', 'KATAMBAY'];
  await t('seed Rome Fin Dela Cruz', async () => {
    const r = await post({ fullName: 'Rome Fin Dela Cruz', choices: CH });
    assert.strictEqual(r.status, 200);
  });

  await t('T1: ROME FIN DELA CRUZ -> BLOCK 409', async () => {
    const r = await post({ fullName: 'ROME FIN DELA CRUZ', choices: CH });
    assert.strictEqual(r.status, 409);
  });
  await t('T2: "Rome   Fin   Dela Cruz" -> BLOCK 409', async () => {
    const r = await post({ fullName: 'Rome   Fin   Dela Cruz', choices: CH });
    assert.strictEqual(r.status, 409);
  });
  await t('T3: Rome Fin -> BLOCK 409', async () => {
    const r = await post({ fullName: 'Rome Fin', choices: CH });
    assert.strictEqual(r.status, 409);
  });
  await t('T4: Rome Dela Cruz -> BLOCK 409', async () => {
    const r = await post({ fullName: 'Rome Dela Cruz', choices: CH });
    assert.strictEqual(r.status, 409);
  });
  await t('T5: Fin Dela Cruz -> BLOCK 409', async () => {
    const r = await post({ fullName: 'Fin Dela Cruz', choices: CH });
    assert.strictEqual(r.status, 409);
  });
  await t('T6: Rome -> BLOCK 400 (not a full name)', async () => {
    const r = await post({ fullName: 'Rome', choices: CH });
    assert.strictEqual(r.status, 400);
    assert(/full name/i.test(r.body.error));
  });
  await t('T7: Dela Cruz -> BLOCK 400 (surname only)', async () => {
    const r = await post({ fullName: 'Dela Cruz', choices: CH });
    assert.strictEqual(r.status, 400);
  });
  await t('T8: Maria Dela Cruz -> ALLOW 200', async () => {
    const r = await post({ fullName: 'Maria Dela Cruz', choices: CH });
    assert.strictEqual(r.status, 200);
  });
  await t('T9: John Santos vs Maria Santos -> ALLOW 200', async () => {
    const r2 = await post({ fullName: 'Maria Santos', choices: CH });
    assert.strictEqual(r2.status, 200);
    const r = await post({ fullName: 'John Santos', choices: CH });
    assert.strictEqual(r.status, 200);
  });
  await t('T10: Rome F. Dela Cruz -> BLOCK 409', async () => {
    const r = await post({ fullName: 'Rome F. Dela Cruz', choices: CH });
    assert.strictEqual(r.status, 409);
  });
  await t('duplicate message is generic (no name leak)', async () => {
    const r = await post({ fullName: 'Rome Fin', choices: CH });
    assert(!/Rome/i.test(r.body.error));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
