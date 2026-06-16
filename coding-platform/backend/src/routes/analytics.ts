import { Router, Response } from 'express';
import { AuthRequest, CodingRole } from '../types';
import { authenticate, requireStaff } from '../middleware/auth';
import { pool } from '../database/connection';

const router = Router();
router.use(authenticate);
router.use(requireStaff); // Students cannot access analytics

// ─── Helpers ───────────────────────────────────────────────────

/** Build a SQL fragment + params that restricts to a staff member's
 *  assigned courses and companies.  Returns '' for head (no restriction). */
function buildStaffScope(
  role: CodingRole,
  userId: string,
  versionAlias: string,
  startParamIdx: number,
): { clause: string; params: unknown[]; nextIdx: number } {
  if (role === CodingRole.PLACEMENT_HEAD) {
    return { clause: '', params: [], nextIdx: startParamIdx };
  }
  const p = startParamIdx;
  const clause = `
    AND (
      ${versionAlias}.course_id IN (
        SELECT course_id FROM user_course_assignments WHERE user_id = $${p}
      )
      OR ${versionAlias}.source_company IN (
        SELECT company_name FROM user_company_assignments WHERE user_id = $${p}
      )
    )`;
  return { clause, params: [userId], nextIdx: p + 1 };
}

// ─── Question-wise Analytics ────────────────────────────────────
// Returns all published questions (scoped for staff) with submission counts.
router.get('/questions', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const role = req.user!.role as CodingRole;

  const { clause, params } = buildStaffScope(role, userId, 'qv', 1);

  const result = await pool.query(
    `SELECT
       qv.id            AS version_id,
       qv.title,
       qv.difficulty,
       qv.status,
       qv.course_id,
       qv.course_name,
       qv.source_company,
       COUNT(DISTINCT sr.id)                                              AS total_submissions,
       COUNT(DISTINCT sr.id)  FILTER (WHERE sr.verdict = 'accepted')     AS accepted_submissions,
       COUNT(DISTINCT sr.user_id)                                         AS unique_students,
       COUNT(DISTINCT sr.user_id) FILTER (WHERE sr.verdict = 'accepted') AS students_solved
     FROM question_versions qv
     LEFT JOIN submission_records sr ON sr.version_id = qv.id
     WHERE qv.status = 'published'
     ${clause}
     GROUP BY qv.id, qv.title, qv.difficulty, qv.status, qv.course_id, qv.course_name, qv.source_company
     ORDER BY total_submissions DESC, qv.title ASC`,
    params,
  );

  res.json({ success: true, data: result.rows });
});

// ─── All submitted questions (including draft/approved) for staff ─
// Used by staff to see all questions they created/own, regardless of status.
router.get('/my-questions', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const role = req.user!.role as CodingRole;

  const { clause, params } = buildStaffScope(role, userId, 'qv', 1);

  const result = await pool.query(
    `SELECT DISTINCT ON (qb.id)
       qb.id   AS question_id,
       qb.slug,
       qv.id   AS version_id,
       qv.title,
       qv.difficulty,
       qv.status,
       qv.course_id,
       qv.course_name,
       qv.source_company,
       qv.version_number,
       qv.created_at
     FROM question_bank qb
     JOIN question_versions qv ON qv.question_id = qb.id
     WHERE 1=1
     ${clause}
     ORDER BY qb.id, qv.version_number DESC`,
    params,
  );

  res.json({ success: true, data: result.rows });
});

// ─── Submissions for a specific question ────────────────────────
router.get('/questions/:versionId/submissions', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const role = req.user!.role as CodingRole;
  const { versionId } = req.params;

  // Staff must own/be assigned the question; head can see any
  if (role !== CodingRole.PLACEMENT_HEAD) {
    const access = await pool.query(
      `SELECT 1 FROM question_versions qv
       WHERE qv.id = $1
         AND (
           qv.course_id IN (SELECT course_id FROM user_course_assignments WHERE user_id = $2)
           OR qv.source_company IN (SELECT company_name FROM user_company_assignments WHERE user_id = $2)
         )`,
      [versionId, userId],
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Access denied: question not in your assignment scope' });
    }
  }

  const [questionRes, submissionsRes] = await Promise.all([
    pool.query(
      `SELECT id, title, difficulty, course_id, course_name, source_company, status
       FROM question_versions WHERE id = $1`,
      [versionId],
    ),
    pool.query(
      `SELECT
         sr.id,
         sr.verdict,
         sr.language,
         sr.score,
         sr.passed_count,
         sr.total_count,
         sr.execution_time_ms,
         sr.memory_kb,
         sr.created_at,
         u.name   AS student_name,
         u.email  AS student_email,
         u.id     AS student_id
       FROM submission_records sr
       JOIN users u ON u.id = sr.user_id
       WHERE sr.version_id = $1
       ORDER BY sr.created_at DESC
       LIMIT 200`,
      [versionId],
    ),
  ]);

  res.json({
    success: true,
    data: {
      question: questionRes.rows[0] || null,
      submissions: submissionsRes.rows,
    },
  });
});

// ─── Student-wise Analytics ─────────────────────────────────────
// For staff: only students who submitted to questions in their scope.
// For head: all students with any submission.
router.get('/students', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const role = req.user!.role as CodingRole;

  let scopeFilter = '';
  const params: unknown[] = [];

  if (role !== CodingRole.PLACEMENT_HEAD) {
    scopeFilter = `
      AND qv.id IN (
        SELECT qv2.id FROM question_versions qv2
        WHERE qv2.course_id IN (SELECT course_id FROM user_course_assignments WHERE user_id = $1)
          OR qv2.source_company IN (SELECT company_name FROM user_company_assignments WHERE user_id = $1)
      )`;
    params.push(userId);
  }

  const result = await pool.query(
    `SELECT
       u.id            AS user_id,
       u.name,
       u.email,
       u.program_id    AS department,
       NULL::integer   AS batch_year,
       COUNT(DISTINCT sr.question_id)                                              AS questions_attempted,
       COUNT(DISTINCT sr.question_id) FILTER (WHERE sr.verdict = 'accepted')      AS questions_solved,
       COUNT(sr.id)                                                                AS total_submissions,
       MAX(sr.created_at)                                                          AS last_submission
     FROM users u
     JOIN submission_records sr ON sr.user_id = u.id
     JOIN question_versions qv ON qv.id = sr.version_id
     WHERE u.role = 'student'
     ${scopeFilter}
     GROUP BY u.id, u.name, u.email, u.program_id
     ORDER BY questions_solved DESC, questions_attempted DESC`,
    params,
  );

  res.json({ success: true, data: result.rows });
});

// ─── Overview Stats ─────────────────────────────────────────────
// Quick summary card data for the analytics dashboard header.
router.get('/overview', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const role = req.user!.role as CodingRole;

  const { clause, params } = buildStaffScope(role, userId, 'qv', 1);

  const [questionsRes, submissionsRes, studentsRes] = await Promise.all([
    pool.query(
      `SELECT COUNT(DISTINCT qv.id) AS total_questions
       FROM question_versions qv
       WHERE qv.status = 'published'
       ${clause}`,
      params,
    ),
    pool.query(
      `SELECT
         COUNT(sr.id)                                          AS total_submissions,
         COUNT(sr.id) FILTER (WHERE sr.verdict = 'accepted')  AS total_accepted
       FROM submission_records sr
       JOIN question_versions qv ON qv.id = sr.version_id
       WHERE qv.status = 'published'
       ${clause}`,
      params,
    ),
    pool.query(
      `SELECT COUNT(DISTINCT sr.user_id) AS active_students
       FROM submission_records sr
       JOIN users u ON u.id = sr.user_id
       JOIN question_versions qv ON qv.id = sr.version_id
       WHERE u.role = 'student'
       ${clause}`,
      params,
    ),
  ]);

  const totalQ = Number(questionsRes.rows[0]?.total_questions ?? 0);
  const totalSub = Number(submissionsRes.rows[0]?.total_submissions ?? 0);
  const totalAcc = Number(submissionsRes.rows[0]?.total_accepted ?? 0);
  const activeStudents = Number(studentsRes.rows[0]?.active_students ?? 0);

  res.json({
    success: true,
    data: {
      total_questions: totalQ,
      total_submissions: totalSub,
      total_accepted: totalAcc,
      acceptance_rate: totalSub > 0 ? Math.round((totalAcc / totalSub) * 100) : 0,
      active_students: activeStudents,
    },
  });
});

export default router;
