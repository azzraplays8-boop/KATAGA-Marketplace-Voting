

process.env.PORT = '3101'; process.env.ADMIN_PASSWORD = 'testpass'; process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
const m = require('pg-mem'); const memDb = m.newDb();
require('pg'); require.cache[require.resolve('pg')].exports = memDb.adapters.createPg();
require('./server.js');
setTimeout(() => {
  memDb.public.none(`insert into votes (full_name, normalized_name, choice_1, choice_2) values ('X','x','a','b')`);
  try { memDb.public.none(`insert into votes (full_name, normalized_name, choice_1, choice_2) values ('Y','x','a','b')`); console.log('NO INDEX ENFORCED'); }
  catch (e) { console.log('INDEX ENFORCED:', (e.code || '') + ' ' + e.message.slice(0, 60)); }
  const r = memDb.public.query('select * from votes');
  console.log('rows:', JSON.stringify(r.rows));
  // also test app-level insert path shape
  console.log('app schema create succeeded above');
  process.exit(0);
}, 1500);
