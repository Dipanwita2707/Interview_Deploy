import { query } from '../database/connection';
import { cacheGet, cacheSet } from '../database/redis';
import { config } from '../config';
import { AppError } from '../utils/app-error';

// ─── Rule Resolution Order ────────────────────────────────────
// 1. company + role + package (most specific)
// 2. company + role
// 3. company + package
// 4. company only
// 5. package only
// 6. program default (least specific)

export async function resolveRuleTemplate(params: {
  company?: string;
  role?: string;
  packageSlab?: string;
  mode: 'practice' | 'exam';
}) {
  const cacheKey = `rule:${params.mode}:${params.company || '_'}:${params.role || '_'}:${params.packageSlab || '_'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return JSON.parse(cached);

  // Try each resolution level in order
  const queries = [
    // Level 1: company + role + package
    {
      condition: params.company && params.role && params.packageSlab,
      sql: `SELECT * FROM rule_templates WHERE target_mode = $1 AND company = $2 AND role = $3 AND package_slab = $4 AND is_active = true LIMIT 1`,
      args: [params.mode, params.company, params.role, params.packageSlab],
    },
    // Level 2: company + role
    {
      condition: params.company && params.role,
      sql: `SELECT * FROM rule_templates WHERE target_mode = $1 AND company = $2 AND role = $3 AND package_slab IS NULL AND is_active = true LIMIT 1`,
      args: [params.mode, params.company, params.role],
    },
    // Level 3: company + package
    {
      condition: params.company && params.packageSlab,
      sql: `SELECT * FROM rule_templates WHERE target_mode = $1 AND company = $2 AND role IS NULL AND package_slab = $3 AND is_active = true LIMIT 1`,
      args: [params.mode, params.company, params.packageSlab],
    },
    // Level 4: company only
    {
      condition: params.company,
      sql: `SELECT * FROM rule_templates WHERE target_mode = $1 AND company = $2 AND role IS NULL AND package_slab IS NULL AND is_active = true LIMIT 1`,
      args: [params.mode, params.company],
    },
    // Level 5: package only
    {
      condition: params.packageSlab,
      sql: `SELECT * FROM rule_templates WHERE target_mode = $1 AND company IS NULL AND role IS NULL AND package_slab = $2 AND is_active = true LIMIT 1`,
      args: [params.mode, params.packageSlab],
    },
    // Level 6: program default
    {
      condition: true,
      sql: `SELECT * FROM rule_templates WHERE target_mode = $1 AND company IS NULL AND role IS NULL AND package_slab IS NULL AND is_default = true AND is_active = true LIMIT 1`,
      args: [params.mode],
    },
  ];

  for (const q of queries) {
    if (!q.condition) continue;
    const result = await query(q.sql, q.args);
    if (result.rows.length > 0) {
      const template = result.rows[0];
      await cacheSet(cacheKey, JSON.stringify(template), config.cache.permissionTTL);
      return template;
    }
  }

  return null; // No matching template
}

// ─── Create Rule Template ──────────────────────────────────────
export async function createRuleTemplate(input: {
  name: string;
  targetMode: string;
  company?: string;
  role?: string;
  packageSlab?: string;
  questionCount: number;
  difficultyDistribution: object;
  topicDistribution?: object;
  durationMinutes: number;
  allowedRetakes: number;
  shuffleQuestions: boolean;
  roadmapLinkage: boolean;
  isDefault?: boolean;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  createdBy: string;
}) {
  const { v4: uuidv4 } = await import('uuid');
  const templateId = uuidv4();

  await query(
    `INSERT INTO rule_templates (
      id, name, target_mode, company, role, package_slab,
      question_count, difficulty_distribution, topic_distribution,
      duration_minutes, allowed_retakes, shuffle_questions,
      roadmap_linkage, is_default, is_active,
      effective_from, effective_to, created_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, true, $15, $16, $17, NOW())`,
    [
      templateId, input.name, input.targetMode, input.company || null,
      input.role || null, input.packageSlab || null, input.questionCount,
      JSON.stringify(input.difficultyDistribution),
      input.topicDistribution ? JSON.stringify(input.topicDistribution) : null,
      input.durationMinutes, input.allowedRetakes, input.shuffleQuestions,
      input.roadmapLinkage, input.isDefault || false,
      input.effectiveFrom || null, input.effectiveTo || null, input.createdBy,
    ]
  );

  return { templateId };
}

// ─── List Rule Templates ───────────────────────────────────────
export async function listRuleTemplates(mode?: string) {
  const conditions = ['is_active = true'];
  const params: any[] = [];

  if (mode) {
    conditions.push(`target_mode = $1`);
    params.push(mode);
  }

  const result = await query(
    `SELECT * FROM rule_templates WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params
  );
  return result.rows;
}

// ─── Select Questions Based on Rule Template ───────────────────
export async function selectQuestionsByRule(template: any) {
  const dist = typeof template.difficulty_distribution === 'string'
    ? JSON.parse(template.difficulty_distribution)
    : template.difficulty_distribution;

  // Check if this template has its own dedicated question pool
  const { rows: dedicated } = await query(
    `SELECT COUNT(*) AS cnt FROM exam_template_questions WHERE template_id = $1`,
    [template.id]
  );
  const useTemplatePool = parseInt(dedicated[0]?.cnt ?? '0') > 0;

  const allQuestions: any[] = [];

  for (const [difficulty, count] of Object.entries(dist)) {
    if ((count as number) <= 0) continue;

    let result;
    if (useTemplatePool) {
      // Use the template's own dedicated pool
      result = await query(
        `SELECT qv.id AS version_id, qv.question_id, qv.title, qv.difficulty
         FROM exam_template_questions etq
         JOIN question_versions qv ON qv.id = etq.version_id
         WHERE etq.template_id = $1 AND qv.difficulty = $2 AND qv.status = 'published'
         ORDER BY RANDOM()
         LIMIT $3`,
        [template.id, difficulty, count as number]
      );
    } else {
      // Fall back to global exam pool
      result = await query(
        `SELECT qv.id AS version_id, qv.question_id, qv.title, qv.difficulty
         FROM question_versions qv
         JOIN question_publish_targets qpt ON qpt.version_id = qv.id
         WHERE qpt.pool_type = $1 AND qv.difficulty = $2 AND qv.status = 'published'
         ORDER BY RANDOM()
         LIMIT $3`,
        [template.target_mode, difficulty, count as number]
      );
    }
    allQuestions.push(...result.rows);
  }

  if (template.shuffle_questions) {
    for (let i = allQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
    }
  }

  return allQuestions;
}
