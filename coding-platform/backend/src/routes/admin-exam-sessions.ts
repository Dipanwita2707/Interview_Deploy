import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authenticate, requireStaff } from '../middleware/auth';
import { pool } from '../database/connection';
import { getAuralSessionDetail } from '../services/aural-bridge-service';

const router = Router();
router.use(authenticate);
router.use(requireStaff); // placement_member or placement_head

// ─── GET /api/admin/exam-sessions ─────────────────────────────
// Returns all exam attempts with student info, submission summary,
// and linked aural-oss session metadata.
// Query params:
//   ?page=1&limit=20
//   ?company=Infosys
//   ?course=<courseId>
//   ?state=submitted|evaluated|reviewed
//   ?withAuralDetail=true  (fetches live aural-oss session data — slower)

router.get('/', async (req: AuthRequest, res: Response) => {
  const page   = Math.max(1, parseInt((req.query.page   as string) || '1'));
  const limit  = Math.min(100, Math.max(1, parseInt((req.query.limit as string) || '20')));
  const offset = (page - 1) * limit;

  const company          = (req.query.company  as string) || null;
  const course           = (req.query.course   as string) || null;
  const state            = (req.query.state    as string) || null;
  const date             = (req.query.date     as string) || null;
  const templateId       = (req.query.templateId as string) || null;
  const withAuralDetail  = req.query.withAuralDetail === 'true';

  // Build dynamic WHERE clauses
  const conditions: string[] = [];
  const params: unknown[]    = [];
  let   paramIdx = 1;

  if (state) {
    conditions.push(`ea.state = $${paramIdx++}`);
    params.push(state);
  }

  if (company) {
    conditions.push(`rt.company = $${paramIdx++}`);
    params.push(company);
  }

  if (date) {
    conditions.push(`ea.created_at::date = $${paramIdx++}`);
    params.push(date);
  }

  if (templateId) {
    conditions.push(`ea.exam_config_id = $${paramIdx++}`);
    params.push(templateId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countRes = await pool.query(
    `SELECT COUNT(*) AS total
     FROM exam_attempts ea
     LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
     ${whereClause}`,
    params
  );

  const total = parseInt(countRes.rows[0]?.total ?? '0');

  // Main query — includes per-attempt submission stats and aural columns
  const dataParams = [...params, limit, offset];
  const rows = await pool.query(
    `SELECT
       ea.id                   AS attempt_id,
       ea.state,
       ea.started_at,
       ea.submitted_at,
       ea.aural_session_id,
       ea.aural_interview_id,
       ea.aural_session_url,
       ea.aural_reentry_count,

       u.id                    AS student_id,
       u.name                  AS student_name,
       u.email                 AS student_email,

       rt.id                   AS template_id,
       rt.name                 AS template_name,
       rt.company              AS company_filter,
       rt.role                 AS role_filter,

       -- Submission stats (based on questions in attempt snapshot)
       COALESCE(jsonb_array_length(ea.question_snapshot), 0) AS total_submissions,
       COALESCE((
         SELECT COUNT(DISTINCT sr2.question_id)
         FROM submission_records sr2
         WHERE sr2.session_id = ea.id
           AND sr2.session_type = 'exam'
           AND sr2.verdict = 'accepted'
       ), 0) AS accepted_count,
       COALESCE((
         SELECT ROUND(AVG(max_q_score))
         FROM (
           SELECT COALESCE(MAX(sr2.score), 0) AS max_q_score
           FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
           LEFT JOIN submission_records sr2 
             ON sr2.session_id = ea.id
             AND sr2.session_type = 'exam'
             AND sr2.version_id = v_id::uuid
           GROUP BY v_id
         ) AS q_scores
       ), 0) AS avg_score,

       -- Weak topics (aggregated from failing submissions)
       (
         SELECT array_agg(DISTINCT tag ORDER BY tag)
         FROM submission_records sr2
         JOIN question_versions qv ON qv.id = sr2.version_id,
         UNNEST(qv.topic_tags) AS tag
         WHERE sr2.session_id  = ea.id
           AND sr2.user_id     = ea.user_id
           AND sr2.session_type = 'exam'
           AND sr2.verdict     != 'accepted'
       ) AS weak_topics

     FROM exam_attempts ea
     JOIN users u            ON u.id = ea.user_id
     LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
     ${whereClause}
     GROUP BY ea.id, u.id, rt.id
     ORDER BY ea.submitted_at DESC NULLS LAST, ea.created_at DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
    dataParams
  );

  let sessions = rows.rows;

  // Optionally enrich with live aural-oss session data
  if (withAuralDetail) {
    sessions = await Promise.all(
      sessions.map(async (row) => {
        if (!row.aural_session_id) return row;
        const auralDetail = await getAuralSessionDetail(row.aural_session_id);
        return { ...row, aural_detail: auralDetail };
      })
    );
  }

  return res.json({
    success: true,
    data: {
      sessions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    },
  });
});

// ─── GET /api/admin/exam-sessions/:attemptId ──────────────────
// Full detail for one attempt: student, all submissions per question,
// aural-oss session live data.

router.get('/:attemptId', async (req: AuthRequest, res: Response) => {
  const { attemptId } = req.params;

  const attemptRes = await pool.query(
    `SELECT
       ea.*,
       u.name  AS student_name,
       u.email AS student_email,
       rt.name AS template_name,
       rt.company AS company_filter,
       rt.role    AS role_filter
     FROM exam_attempts ea
     JOIN users u ON u.id = ea.user_id
     LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
     WHERE ea.id = $1`,
    [attemptId]
  );

  if (attemptRes.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Exam attempt not found' });
  }

  const attempt = attemptRes.rows[0];

  // Submissions with question info
  const submissionsRes = await pool.query(
    `SELECT
       sr.id, sr.verdict, sr.score, sr.passed_count, sr.total_count,
       sr.language, sr.execution_time_ms, sr.memory_kb,
       sr.compile_output, sr.stderr, sr.created_at, sr.evaluated_at,
       sr.cyclomatic_complexity, sr.maintainability_index,
       sr.max_nesting_depth, sr.optimization_warning,
       qv.title         AS question_title,
       qv.difficulty,
       qv.topic_tags
     FROM submission_records sr
     JOIN question_versions qv ON qv.id = sr.version_id
     WHERE sr.session_id = $1 AND sr.user_id = $2 AND sr.session_type = 'exam'
     ORDER BY sr.created_at ASC`,
    [attemptId, attempt.user_id]
  );

  // Aural-oss session live detail
  let auralDetail = null;
  if (attempt.aural_session_id) {
    auralDetail = await getAuralSessionDetail(attempt.aural_session_id);
  }

  return res.json({
    success: true,
    data: {
      attempt,
      submissions: submissionsRes.rows,
      auralDetail,
    },
  });
});

// ─── POST /api/admin/exam-sessions/:attemptId/reset-reentry ──
// Allows a coordinator to reset the re-entry counter for a student.

router.post('/:attemptId/reset-reentry', async (req: AuthRequest, res: Response) => {
  const { attemptId } = req.params;

  await pool.query(
    `UPDATE exam_attempts SET aural_reentry_count = 0, updated_at = NOW() WHERE id = $1`,
    [attemptId]
  );

  return res.json({ success: true, message: 'Re-entry count reset to 0' });
});

export default router;
