const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runAll() {
  console.log("[Migration] Connecting to database...");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // 1. Check if 'users' table exists to decide if we apply base schema
    const res = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    const tableExists = res.rows[0].exists;

    if (!tableExists) {
      console.log("[Migration] Database is empty. Applying base schema (schema.sql)...");
      const schemaSql = fs.readFileSync(path.join(__dirname, 'database/schema.sql'), 'utf8');
      await client.query(schemaSql);
      console.log("[Migration] Base schema applied successfully.");
    } else {
      console.log("[Migration] 'users' table already exists. Skipping base schema setup.");
    }

    // 2. Apply 002_exam_bridge_columns.sql
    console.log("[Migration] Applying 002_exam_bridge_columns.sql...");
    const m002 = fs.readFileSync(path.join(__dirname, 'database/migrations/002_exam_bridge_columns.sql'), 'utf8');
    await client.query(m002);

    // 3. Apply 003 & 004 table schema equivalents
    console.log("[Migration] Applying 003/004 exam templates and pools...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_template_questions (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_id   UUID NOT NULL REFERENCES rule_templates(id) ON DELETE CASCADE,
        version_id    UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
        added_by      UUID NOT NULL REFERENCES users(id),
        added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(template_id, version_id)
      );
      CREATE INDEX IF NOT EXISTS idx_etq_template ON exam_template_questions(template_id);
      CREATE INDEX IF NOT EXISTS idx_etq_version  ON exam_template_questions(version_id);

      CREATE TABLE IF NOT EXISTS exam_template_staff (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_id UUID NOT NULL REFERENCES rule_templates(id) ON DELETE CASCADE,
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by UUID NOT NULL REFERENCES users(id),
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(template_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ets_template ON exam_template_staff(template_id);
      CREATE INDEX IF NOT EXISTS idx_ets_user     ON exam_template_staff(user_id);
    `);

    // 4. Apply 005_add_complexity_metrics.sql
    console.log("[Migration] Applying 005_add_complexity_metrics.sql...");
    const m005 = fs.readFileSync(path.join(__dirname, 'database/migrations/005_add_complexity_metrics.sql'), 'utf8');
    await client.query(m005);

    // 5. Apply add-course-company-assignments.sql
    console.log("[Migration] Applying add-course-company-assignments.sql...");
    const mAssignments = fs.readFileSync(path.join(__dirname, 'database/migrations/add-course-company-assignments.sql'), 'utf8');
    await client.query(mAssignments);

    console.log("✅ [Migration] All migrations completed successfully!");
  } catch (err) {
    console.error("❌ [Migration] Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runAll();
