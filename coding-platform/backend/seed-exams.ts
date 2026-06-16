/**
 * Seed script — creates exam rule templates and publishes questions to exam pool
 * Run with: npx ts-node seed-exams.ts
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const SEED_EMAIL = 'seed@smartcode.dev';

// ─── Exam rule templates to create ───────────────────────────
const EXAM_TEMPLATES = [
  {
    name: 'General Aptitude Test',
    company: null,
    role: null,
    package_slab: null,
    question_count: 3,
    difficulty_distribution: { low: 1, medium: 1, high: 1 },
    duration_minutes: 60,
    allowed_retakes: 0,
    shuffle_questions: true,
    is_default: true,
    description: 'Standard aptitude test for all students',
  },
  {
    name: 'TCS NQT Mock Exam',
    company: 'TCS',
    role: null,
    package_slab: null,
    question_count: 3,
    difficulty_distribution: { low: 1, medium: 1, high: 1 },
    duration_minutes: 90,
    allowed_retakes: 1,
    shuffle_questions: true,
    is_default: false,
    description: 'Mock exam for TCS National Qualifier Test',
  },
  {
    name: 'Infosys Specialist Programmer',
    company: 'Infosys',
    role: 'Specialist Programmer',
    package_slab: null,
    question_count: 2,
    difficulty_distribution: { low: 0, medium: 1, high: 1 },
    duration_minutes: 75,
    allowed_retakes: 0,
    shuffle_questions: true,
    is_default: false,
    description: 'Advanced track for Infosys SP selection',
  },
  {
    name: 'Campus Hackathon — Round 1',
    company: null,
    role: null,
    package_slab: null,
    question_count: 2,
    difficulty_distribution: { low: 0, medium: 1, high: 1 },
    duration_minutes: 120,
    allowed_retakes: 0,
    shuffle_questions: false,
    is_default: false,
    description: 'Inter-college coding hackathon qualifier round',
  },
];

async function seed() {
  const client = await pool.connect();
  console.log('🚀 Seeding exam templates…\n');

  try {
    // ── 1. Get or create seed user ──────────────────────────────
    let { rows } = await client.query(
      `SELECT id FROM users WHERE email = $1`,
      [SEED_EMAIL]
    );
    let userId: string;

    if (rows.length > 0) {
      userId = rows[0].id;
      console.log('  👤 Found seed user:', userId);
    } else {
      userId = uuidv4();
      await client.query(
        `INSERT INTO users (id, smart_user_id, email, name, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'Seed Bot', 'placement_head', true, NOW(), NOW())`,
        [userId, `seed-bot-${userId}`, SEED_EMAIL]
      );
      console.log('  ✅ Created seed user:', userId);
    }

    // ── 2. Publish all published questions to exam pool ─────────
    console.log('\n📚 Publishing questions to exam pool…');
    const { rows: versionRows } = await client.query(
      `SELECT id, difficulty FROM question_versions WHERE status = 'published'`
    );

    let publishedToExam = 0;
    for (const v of versionRows) {
      // Check if already published to exam pool
      const { rows: existing } = await client.query(
        `SELECT id FROM question_publish_targets WHERE version_id = $1 AND pool_type = 'exam'`,
        [v.id]
      );
      if (existing.length === 0) {
        await client.query(
          `INSERT INTO question_publish_targets (id, version_id, pool_type, published_by)
           VALUES ($1, $2, 'exam', $3)`,
          [uuidv4(), v.id, userId]
        );
        publishedToExam++;
      }
    }
    console.log(`  ✅ Published ${publishedToExam} question(s) to exam pool (${versionRows.length} total published)`);

    // If no published questions, also seed some practice questions to exam pool
    if (versionRows.length === 0) {
      // Also try questions that have practice publish targets
      const { rows: practiceVersions } = await client.query(
        `SELECT DISTINCT qv.id, qv.difficulty FROM question_versions qv
         JOIN question_publish_targets qpt ON qpt.version_id = qv.id
         WHERE qpt.pool_type = 'practice'`
      );
      for (const v of practiceVersions) {
        const { rows: existing } = await client.query(
          `SELECT id FROM question_publish_targets WHERE version_id = $1 AND pool_type = 'exam'`,
          [v.id]
        );
        if (existing.length === 0) {
          await client.query(
            `INSERT INTO question_publish_targets (id, version_id, pool_type, published_by)
             VALUES ($1, $2, 'exam', $3)`,
            [uuidv4(), v.id, userId]
          );
        }
      }
      console.log(`  ℹ️  Also published ${practiceVersions.length} practice question(s) to exam pool`);
    }

    // ── 3. Create exam rule templates ───────────────────────────
    console.log('\n📋 Creating exam rule templates…');
    for (const tmpl of EXAM_TEMPLATES) {
      const { rows: existing } = await client.query(
        `SELECT id FROM rule_templates WHERE name = $1 AND target_mode = 'exam'`,
        [tmpl.name]
      );

      if (existing.length > 0) {
        console.log(`  ⏭️  Skipping "${tmpl.name}" (already exists)`);
        continue;
      }

      const tmplId = uuidv4();
      await client.query(
        `INSERT INTO rule_templates (
          id, name, target_mode, company, role, package_slab,
          question_count, difficulty_distribution,
          duration_minutes, allowed_retakes, shuffle_questions,
          roadmap_linkage, is_default, is_active, created_by, created_at
        ) VALUES ($1,$2,'exam',$3,$4,$5,$6,$7,$8,$9,$10,false,$11,true,$12,NOW())`,
        [
          tmplId, tmpl.name, tmpl.company, tmpl.role, tmpl.package_slab,
          tmpl.question_count, JSON.stringify(tmpl.difficulty_distribution),
          tmpl.duration_minutes, tmpl.allowed_retakes, tmpl.shuffle_questions,
          tmpl.is_default, userId,
        ]
      );
      console.log(`  ✅ Created: "${tmpl.name}" (${tmpl.duration_minutes}min, ${JSON.stringify(tmpl.difficulty_distribution)})`);
    }

    // ── 4. Create exam_invitations table if not exists ──────────
    console.log('\n🗄️  Ensuring exam_invitations table…');
    await client.query(`
      CREATE TABLE IF NOT EXISTS exam_invitations (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rule_template_id UUID NOT NULL REFERENCES rule_templates(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_by UUID NOT NULL REFERENCES users(id),
        assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'started', 'completed', 'expired', 'cancelled')),
        note TEXT,
        UNIQUE(rule_template_id, user_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ei_user ON exam_invitations(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ei_template ON exam_invitations(rule_template_id);
    `);
    console.log('  ✅ exam_invitations table ready');

    // ── 5. Summary ──────────────────────────────────────────────
    console.log('\n── Summary ─────────────────────────────────────────────');
    const { rows: templateRows } = await client.query(
      `SELECT name, company, duration_minutes, is_default,
              difficulty_distribution->>'low' AS easy,
              difficulty_distribution->>'medium' AS medium,
              difficulty_distribution->>'high' AS hard
       FROM rule_templates WHERE target_mode = 'exam' AND is_active = true
       ORDER BY created_at`
    );
    templateRows.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name}${t.company ? ` [${t.company}]` : ''} — ${t.easy}E/${t.medium}M/${t.hard}H, ${t.duration_minutes}min${t.is_default ? ' ✓ default' : ''}`);
    });

    const { rows: examQs } = await client.query(
      `SELECT COUNT(*) AS cnt FROM question_publish_targets WHERE pool_type = 'exam'`
    );
    console.log(`\n  📊 Questions in exam pool: ${examQs[0].cnt}`);
    console.log('\n✅ Exam seeding complete!\n');

  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
