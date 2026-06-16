const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_template_questions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        template_id UUID NOT NULL REFERENCES rule_templates(id) ON DELETE CASCADE,
        version_id UUID NOT NULL REFERENCES question_versions(id) ON DELETE CASCADE,
        added_by UUID NOT NULL REFERENCES users(id),
        added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(template_id, version_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_etq_template ON exam_template_questions(template_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_etq_version ON exam_template_questions(version_id)`);
    console.log('✅ exam_template_questions table created successfully');
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
