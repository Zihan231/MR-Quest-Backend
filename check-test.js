const { Client } = require('pg');

async function check() {
  const client = new Client({
    connectionString: "postgresql://neondb_owner:npg_CyZqSA4eQ0xN@ep-red-rain-at0pqjxi-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
  });
  await client.connect();
  const res = await client.query('SELECT * FROM notifications ORDER BY id DESC LIMIT 5');
  console.log(res.rows);
  await client.end();
}

check().catch(console.error);
