/**
 * One-shot fix: adds question_publish_targets rows for all published questions
 * that are missing from the practice pool.
 * Run: npx ts-node fix-publish-targets.ts
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const client = await pool.connect();
  try {
    // Find published versions that have no practice pool entry
    const { rows: missing } = await client.query(`
      SELECT qv.id AS version_id, qv.title
      FROM question_versions qv
      WHERE qv.status = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM question_publish_targets qpt
          WHERE qpt.version_id = qv.id AND qpt.pool_type = 'practice'
        )
    `);

    // Get any existing user to satisfy the published_by FK
    const { rows: users } = await client.query(`SELECT id FROM users LIMIT 1`);
    if (users.length === 0) throw new Error('No users in DB — run SSO login first to create a shadow user, then re-run this script.');
    const publishedBy = users[0].id;

    if (missing.length === 0) {
      console.log('✅ All published questions already have practice pool entries.');
    } else {
      console.log(`Found ${missing.length} published question(s) missing from practice pool:`);
      for (const row of missing) {
        await client.query(
          `INSERT INTO question_publish_targets (id, version_id, pool_type, published_by)
           VALUES ($1, $2, 'practice', $3)
           ON CONFLICT DO NOTHING`,
          [uuidv4(), row.version_id, publishedBy]
        );
        console.log(`  ✅ Added to practice pool: "${row.title}"`);
      }
    }

    // Print final pool count
    const { rows } = await client.query(`
      SELECT qv.title, qv.difficulty, qv.status
      FROM question_versions qv
      JOIN question_publish_targets qpt ON qpt.version_id = qv.id
      WHERE qpt.pool_type = 'practice' AND qv.status = 'published'
      ORDER BY qv.created_at
    `);

    console.log(`\n📋 Practice pool now has ${rows.length} question(s):`);
    rows.forEach((r, i) =>
      console.log(`  ${i + 1}. [${r.difficulty.toUpperCase()}] ${r.title}`)
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ Failed:', err);
  process.exit(1);
});
