/**
 * Migration 003 — Per-template question pools + staff assignments
 * Run with: node database/migrations/003_per_template_pools.js
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    -- Per-template question pool: each exam template has its own set of questions
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

    -- Staff assignments: which staff members can manage a given exam template
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
  console.log('Migration 003 applied OK');
  pool.end();
}

run().catch(e => { console.error('FAILED:', e.message); pool.end(); process.exit(1); });
