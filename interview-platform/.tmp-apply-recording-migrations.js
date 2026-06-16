require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const fs = require('fs');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  await client.query(fs.readFileSync('supabase/migrations/002_recording_config.sql', 'utf8'));
  console.log('APPLIED 002_recording_config.sql');

  await client.query(fs.readFileSync('supabase/migrations/003_session_recording_artifacts.sql', 'utf8'));
  console.log('APPLIED 003_session_recording_artifacts.sql');

  const verify = await client.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('interviews', 'sessions')
      and column_name in ('recordingConfig', 'noiseCancellationEnabled', 'recordingArtifacts')
    order by table_name, column_name
  `);

  console.log(JSON.stringify(verify.rows, null, 2));
  await client.end();
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
