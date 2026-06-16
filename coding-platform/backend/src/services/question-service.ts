import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../database/connection';
import { QuestionInput, QuestionStatus, QuestionDifficulty, TestCaseInput, StarterCodeInput } from '../types';
import { AppError } from '../utils/app-error';
import { cacheDel } from '../database/redis';

const columnPresenceCache = new Map<string, boolean>();

async function hasQuestionVersionsColumn(columnName: string) {
  const cacheKey = `question_versions.${columnName}`;
  if (columnPresenceCache.has(cacheKey)) return columnPresenceCache.get(cacheKey)!;

  const result = await query(
    `SELECT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'question_versions'
         AND column_name = $1
     ) AS exists`,
    [columnName]
  );

  const exists = Boolean(result.rows[0]?.exists);
  columnPresenceCache.set(cacheKey, exists);
  return exists;
}

// ─── Create Question Draft ─────────────────────────────────────
export async function createQuestion(input: QuestionInput, createdBy: string) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const questionId = uuidv4();
    const versionId = uuidv4();

    // Insert into question_bank
    await client.query(
      `INSERT INTO question_bank (id, slug, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [questionId, input.slug, createdBy]
    );

    // Insert first version as draft
    await client.query(
      `INSERT INTO question_versions (
        id, question_id, version_number, title, problem_statement,
        input_format, output_format, constraints, examples, explanations,
        difficulty, topic_tags, source_company, course_id, course_name,
        role_specificity, package_slab_specificity,
        is_company_specific, time_limit_ms, memory_limit_kb, supported_languages,
        status, created_by, created_at
      ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW())`,
      [
        versionId, questionId, input.title, input.problemStatement,
        input.inputFormat, input.outputFormat, input.constraints,
        JSON.stringify(input.examples), input.explanations || null,
        input.difficulty, input.topicTags, input.sourceCompany || null,
        input.courseId || null, input.courseName || null,
        input.roleSpecificity || null, input.packageSlabSpecificity || null,
        input.isCompanySpecific, input.timeLimitMs || 2000, input.memoryLimitKb || 262144,
        input.supportedLanguages, QuestionStatus.DRAFT, createdBy,
      ]
    );

    await client.query('COMMIT');
    return { questionId, versionId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Add Test Cases ────────────────────────────────────────────
export async function addTestCases(versionId: string, testCases: TestCaseInput[]) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const tc of testCases) {
      await client.query(
        `INSERT INTO test_cases (id, version_id, input, expected_output, is_public, explanation, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [uuidv4(), versionId, tc.input, tc.expectedOutput, tc.isPublic, tc.explanation || null, tc.orderIndex]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Add Starter Code ──────────────────────────────────────────
export async function addStarterCode(versionId: string, starterCodes: StarterCodeInput[]) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (const sc of starterCodes) {
      await client.query(
        `INSERT INTO starter_code (id, version_id, language_id, code)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), versionId, sc.languageId, sc.code]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Get Question by Version ID (for practice/exam pages) ──────
export async function getQuestionByVersionId(versionId: string) {
  const result = await query(
    `SELECT qb.id AS question_id, qb.slug,
       qv.id, qv.title, qv.difficulty, qv.status, qv.topic_tags,
       qv.problem_statement AS description,
       qv.input_format, qv.output_format, qv.constraints, qv.examples,
       qv.time_limit_ms, qv.memory_limit_kb, qv.version_number, qv.created_by, qv.created_at,
       (SELECT json_agg(
         json_build_object('id', sc.id, 'language_id', sc.language_id, 'language_name', sc.language_id, 'code', sc.code)
       ) FROM starter_code sc WHERE sc.version_id = qv.id) AS starter_code,
       (SELECT json_agg(tc.*) FROM test_cases tc WHERE tc.version_id = qv.id AND tc.is_public = true) AS public_test_cases
     FROM question_versions qv
     JOIN question_bank qb ON qb.id = qv.question_id
     WHERE qv.id = $1
     LIMIT 1`,
    [versionId]
  );

  if (result.rows.length === 0) throw AppError.notFound('Question version');
  return result.rows[0];
}

// ─── Get Question with Latest Version ──────────────────────────
export async function getQuestionById(questionId: string) {
  const result = await query(
    `SELECT qb.id AS question_id, qb.slug, qv.*
     FROM question_bank qb
     JOIN question_versions qv ON qv.question_id = qb.id
     WHERE qb.id = $1
     ORDER BY qv.version_number DESC
     LIMIT 1`,
    [questionId]
  );

  if (result.rows.length === 0) {
    throw AppError.notFound('Question');
  }
  return result.rows[0];
}

// ─── List Questions (with filters) ─────────────────────────────
export async function listQuestions(filters: {
  status?: QuestionStatus;
  difficulty?: QuestionDifficulty;
  topic?: string;
  company?: string;
  page?: number;
  limit?: number;
  /** When set (placement_member), restrict to questions in their assigned courses/companies */
  staffUserId?: string;
}) {
  const { status, difficulty, topic, company, page = 1, limit = 20, staffUserId } = filters;
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (status) {
    conditions.push(`qv.status = $${paramIdx++}`);
    params.push(status);
  }
  if (difficulty) {
    conditions.push(`qv.difficulty = $${paramIdx++}`);
    params.push(difficulty);
  }
  if (topic) {
    conditions.push(`$${paramIdx++} = ANY(qv.topic_tags)`);
    params.push(topic);
  }
  if (company) {
    conditions.push(`qv.source_company = $${paramIdx++}`);
    params.push(company);
  }
  if (staffUserId) {
    conditions.push(`(
      qv.course_id IN (SELECT course_id FROM user_course_assignments WHERE user_id = $${paramIdx})
      OR qv.source_company IN (SELECT company_name FROM user_company_assignments WHERE user_id = $${paramIdx})
    )`);
    params.push(staffUserId);
    paramIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  // Get latest version per question
  const result = await query(
    `SELECT DISTINCT ON (qb.id) qb.id AS question_id, qb.slug,
       qv.id AS version_id, qv.title, qv.difficulty, qv.status,
       qv.topic_tags, qv.source_company, qv.version_number, qv.created_at
     FROM question_bank qb
     JOIN question_versions qv ON qv.question_id = qb.id
     ${whereClause}
     ORDER BY qb.id, qv.version_number DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(DISTINCT qb.id) AS total
     FROM question_bank qb
     JOIN question_versions qv ON qv.question_id = qb.id
     ${whereClause}`,
    params
  );

  return {
    questions: result.rows,
    total: parseInt(countResult.rows[0].total),
    page,
    limit,
  };
}

// ─── Update Draft ──────────────────────────────────────────────
export async function updateDraft(versionId: string, updates: Partial<QuestionInput>) {
  // Verify it's still a draft
  const existing = await query(
    'SELECT status FROM question_versions WHERE id = $1',
    [versionId]
  );
  if (existing.rows.length === 0) throw AppError.notFound('Question version');
  if (existing.rows[0].status !== QuestionStatus.DRAFT) {
    throw AppError.badRequest('Only draft versions can be edited directly');
  }

  const fields: string[] = [];
  const params: any[] = [];
  let idx = 1;

  const fieldMap: Record<string, string> = {
    title: 'title',
    problemStatement: 'problem_statement',
    inputFormat: 'input_format',
    outputFormat: 'output_format',
    constraints: 'constraints',
    explanations: 'explanations',
    difficulty: 'difficulty',
    timeLimitMs: 'time_limit_ms',
    memoryLimitKb: 'memory_limit_kb',
  };

  for (const [tsKey, dbCol] of Object.entries(fieldMap)) {
    if ((updates as any)[tsKey] !== undefined) {
      fields.push(`${dbCol} = $${idx++}`);
      params.push((updates as any)[tsKey]);
    }
  }

  if (updates.topicTags) {
    fields.push(`topic_tags = $${idx++}`);
    params.push(updates.topicTags);
  }
  if (updates.examples) {
    fields.push(`examples = $${idx++}`);
    params.push(JSON.stringify(updates.examples));
  }
  if (updates.supportedLanguages) {
    fields.push(`supported_languages = $${idx++}`);
    params.push(updates.supportedLanguages);
  }

  if (fields.length === 0) return;

  params.push(versionId);
  await query(
    `UPDATE question_versions SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
    params
  );
}

// ─── Approve Question ──────────────────────────────────────────
export async function approveQuestion(versionId: string, approvedBy: string) {
  const existing = await query('SELECT status FROM question_versions WHERE id = $1', [versionId]);
  if (existing.rows.length === 0) throw AppError.notFound('Question version');
  if (existing.rows[0].status !== QuestionStatus.DRAFT) {
    throw AppError.badRequest('Only draft versions can be approved');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE question_versions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [QuestionStatus.APPROVED, versionId]
    );

    await client.query(
      `INSERT INTO question_approvals (id, version_id, action, performed_by, created_at)
       VALUES ($1, $2, 'approved', $3, NOW())`,
      [uuidv4(), versionId, approvedBy]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Reject Question ───────────────────────────────────────────
export async function rejectQuestion(versionId: string, rejectedBy: string, remarks: string) {
  const existing = await query('SELECT status FROM question_versions WHERE id = $1', [versionId]);
  if (existing.rows.length === 0) throw AppError.notFound('Question version');
  if (existing.rows[0].status !== QuestionStatus.DRAFT) {
    throw AppError.badRequest('Only draft versions can be rejected');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO question_approvals (id, version_id, action, remarks, performed_by, created_at)
       VALUES ($1, $2, 'rejected', $3, $4, NOW())`,
      [uuidv4(), versionId, remarks, rejectedBy]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Publish Question ──────────────────────────────────────────
export async function publishQuestion(versionId: string, pools: string[], publishedBy: string) {
  const existing = await query('SELECT status FROM question_versions WHERE id = $1', [versionId]);
  if (existing.rows.length === 0) throw AppError.notFound('Question version');
  if (existing.rows[0].status !== QuestionStatus.APPROVED) {
    throw AppError.badRequest('Only approved versions can be published');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE question_versions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [QuestionStatus.PUBLISHED, versionId]
    );

    for (const pool of pools) {
      await client.query(
        `INSERT INTO question_publish_targets (id, version_id, pool_type, published_by, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [uuidv4(), versionId, pool, publishedBy]
      );
    }

    await client.query('COMMIT');

    // Invalidate pool caches
    await cacheDel('pool:practice:questions');
    await cacheDel('pool:exam:questions');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─── Get Published Questions for a Pool ────────────────────────
export async function getPoolQuestions(poolType: string, filters?: {
  difficulty?: string;
  topic?: string;
  company?: string;
  courseId?: string;
  userId?: string;
}) {
  const conditions = [`qpt.pool_type = $1`, `qv.status = 'published'`];
  const params: any[] = [poolType];
  let idx = 2;
  const supportsCourseId = await hasQuestionVersionsColumn('course_id');

  if (filters?.difficulty) {
    conditions.push(`qv.difficulty = $${idx++}`);
    params.push(filters.difficulty);
  }
  if (filters?.topic) {
    conditions.push(`$${idx++} = ANY(qv.topic_tags)`);
    params.push(filters.topic);
  }
  if (filters?.company) {
    conditions.push(`qv.source_company = $${idx++}`);
    params.push(filters.company);
  }
  if (filters?.courseId && supportsCourseId) {
    conditions.push(`qv.course_id = $${idx++}`);
    params.push(filters.courseId);
  }

  // user_status subquery — only when userId provided
  const userStatusExpr = filters?.userId
    ? `CASE
         WHEN EXISTS (
           SELECT 1 FROM submission_records s
           WHERE s.version_id = qv.id AND s.user_id = '${filters.userId.replace(/'/g, "''")}' AND s.verdict = 'accepted'
         ) THEN 'solved'
         WHEN EXISTS (
           SELECT 1 FROM submission_records s
           WHERE s.version_id = qv.id AND s.user_id = '${filters.userId.replace(/'/g, "''")}'
         ) THEN 'attempted'
         ELSE 'not_started'
       END`
    : `'not_started'`;

  const result = await query(
    `SELECT qv.id AS version_id, qv.id, qb.slug, qv.title, qv.difficulty, qv.status,
       qv.topic_tags, qv.source_company, qv.time_limit_ms, qv.memory_limit_kb, qv.created_at,
       (SELECT json_agg(tc.*) FROM test_cases tc WHERE tc.version_id = qv.id AND tc.is_public = true) AS public_test_cases,
       ${userStatusExpr} AS user_status
     FROM question_versions qv
     JOIN question_bank qb ON qb.id = qv.question_id
     JOIN question_publish_targets qpt ON qpt.version_id = qv.id
     WHERE ${conditions.join(' AND ')}
     ORDER BY qv.created_at DESC`,
    params
  );

  return result.rows;
}
