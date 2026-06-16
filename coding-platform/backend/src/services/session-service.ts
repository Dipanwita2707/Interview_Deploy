import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../database/connection';
import { ExamState } from '../types';
import { AppError } from '../utils/app-error';

// ─── Create Practice Session ───────────────────────────────────
export async function createPracticeSession(userId: string, ruleTemplateId?: string) {
  const sessionId = uuidv4();

  await query(
    `INSERT INTO practice_sessions (id, user_id, rule_template_id, started_at, created_at)
     VALUES ($1, $2, $3, NOW(), NOW())`,
    [sessionId, userId, ruleTemplateId || null]
  );

  return { id: sessionId };
}

// ─── Get Practice Session ──────────────────────────────────────
export async function getPracticeSession(sessionId: string) {
  const result = await query(
    `SELECT ps.*,
       (SELECT COUNT(*) FROM submission_records sr WHERE sr.session_id = ps.id AND sr.verdict = 'accepted') AS solved_count,
       (SELECT COUNT(DISTINCT sr.question_id) FROM submission_records sr WHERE sr.session_id = ps.id) AS attempted_count
     FROM practice_sessions ps WHERE ps.id = $1`,
    [sessionId]
  );
  if (result.rows.length === 0) throw AppError.notFound('Practice session');
  return result.rows[0];
}

// ─── Create Exam Attempt ───────────────────────────────────────
export async function createExamAttempt(params: {
  userId: string;
  examConfigId: string;
  durationMinutes: number;
  questionVersionIds: string[];
}) {
  // Return existing ready/started/interrupted attempt if one exists
  const existing = await query(
    `SELECT id, state FROM exam_attempts
     WHERE user_id = $1 AND exam_config_id = $2 AND state IN ('ready', 'started', 'interrupted')
     ORDER BY created_at DESC LIMIT 1`,
    [params.userId, params.examConfigId]
  );
  if (existing.rows.length > 0) {
    return { attemptId: existing.rows[0].id, existing: true, state: existing.rows[0].state };
  }

  const attemptId = uuidv4();

  await query(
    `INSERT INTO exam_attempts (
      id, user_id, exam_config_id, state, duration_minutes,
      question_snapshot, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      attemptId, params.userId, params.examConfigId,
      ExamState.READY, params.durationMinutes,
      JSON.stringify(params.questionVersionIds),
    ]
  );

  return { attemptId };
}

// ─── Start Exam ────────────────────────────────────────────────
export async function startExam(attemptId: string, userId: string) {
  const attempt = await query(
    'SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2',
    [attemptId, userId]
  );
  if (attempt.rows.length === 0) throw AppError.notFound('Exam attempt');

  const exam = attempt.rows[0];

  // Already started — idempotent, just return current state (handles page refresh)
  if (exam.state === ExamState.STARTED) {
    const snapshot = exam.question_snapshot;
    const questionSnapshot: string[] =
      typeof snapshot === 'string' ? JSON.parse(snapshot) : (snapshot ?? []);
    return {
      attemptId,
      state: ExamState.STARTED,
      startedAt: exam.started_at,
      durationMinutes: exam.duration_minutes,
      questionSnapshot,
    };
  }

  if (exam.state !== ExamState.READY && exam.state !== ExamState.INTERRUPTED) {
    throw AppError.badRequest(`Cannot start exam in state: ${exam.state}`);
  }

  await query(
    `UPDATE exam_attempts SET state = $1, started_at = COALESCE(started_at, NOW()), updated_at = NOW()
     WHERE id = $2`,
    [ExamState.STARTED, attemptId]
  );

  // question_snapshot may come back from Postgres as already-parsed JSONB (object/array)
  // or as a plain TEXT string — handle both
  const snapshot = exam.question_snapshot;
  const questionSnapshot: string[] =
    typeof snapshot === 'string' ? JSON.parse(snapshot) : (snapshot ?? []);

  return {
    attemptId,
    state: ExamState.STARTED,
    startedAt: new Date(),
    durationMinutes: exam.duration_minutes,
    questionSnapshot,
  };
}

// ─── Submit Exam ───────────────────────────────────────────────
export async function submitExam(attemptId: string, userId: string) {
  const attempt = await query(
    'SELECT * FROM exam_attempts WHERE id = $1 AND user_id = $2',
    [attemptId, userId]
  );
  if (attempt.rows.length === 0) throw AppError.notFound('Exam attempt');

  const exam = attempt.rows[0];

  // Idempotent: already submitted — just return current state without error
  if (exam.state === ExamState.SUBMITTED) {
    return { attemptId, state: ExamState.SUBMITTED };
  }

  const allowedStates = [ExamState.STARTED, ExamState.INTERRUPTED, ExamState.FLAGGED];
  if (!allowedStates.includes(exam.state)) {
    throw AppError.badRequest(`Cannot submit exam in state: ${exam.state}`);
  }

  // Flagged exams keep their flagged state but get a submitted_at so staff can review
  const newState = exam.state === ExamState.FLAGGED ? ExamState.FLAGGED : ExamState.SUBMITTED;

  await query(
    `UPDATE exam_attempts SET state = $1, submitted_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [newState, attemptId]
  );

  return { attemptId, state: ExamState.SUBMITTED };
}

// ─── Get Exam Attempt ──────────────────────────────────────────
export async function getExamAttempt(attemptId: string) {
  const result = await query(
    `SELECT ea.*,
       ea.duration_minutes AS time_limit_minutes,
       rt.name AS exam_name,
       rt.company,
       rt.role,
       COALESCE(jsonb_array_length(ea.question_snapshot), rt.question_count, 0) AS total_questions,
       COALESCE((
         SELECT COUNT(DISTINCT sr2.question_id)
         FROM submission_records sr2
         WHERE sr2.session_id = ea.id
           AND sr2.session_type = 'exam'
           AND sr2.verdict = 'accepted'
       ), 0) AS questions_solved,
       COALESCE((
         SELECT ROUND(AVG(max_q_score))
         FROM (
           SELECT COALESCE(MAX(sr2.score), 0) AS max_q_score
           FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
           LEFT JOIN submission_records sr2 
             ON sr2.session_id = ea.id
             AND sr2.session_type = 'exam'
             AND sr2.version_id = v_id::uuid
             AND sr2.verdict != 'pending'
           GROUP BY v_id
         ) q_scores
       ), 0) AS score_pct,
       (SELECT json_agg(sr.* ORDER BY sr.created_at)
        FROM submission_records sr WHERE sr.session_id = ea.id) AS submissions
     FROM exam_attempts ea
     LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
     WHERE ea.id = $1`,
    [attemptId]
  );
  if (result.rows.length === 0) throw AppError.notFound('Exam attempt');
  const attempt = result.rows[0];

  // Resolve question_snapshot (array of versionIds) → full question objects
  let versionIds: string[] = [];
  try {
    versionIds = typeof attempt.question_snapshot === 'string'
      ? JSON.parse(attempt.question_snapshot)
      : (attempt.question_snapshot ?? []);
  } catch { versionIds = []; }

  if (versionIds.length > 0) {
    const qResult = await query(
      `SELECT
         qb.id   AS question_id,
         qv.id   AS version_id,
         qv.title,
         qv.problem_statement AS description,
         qv.difficulty,
         qv.examples,
         qv.constraints,
         qv.input_format,
         qv.output_format,
         qv.time_limit_ms,
         qv.topic_tags,
         (SELECT json_agg(json_build_object(
           'id', sc.id, 'language_id', sc.language_id,
           'language_name', CASE sc.language_id::text
             WHEN '71' THEN 'python'
             WHEN '63' THEN 'javascript'
             WHEN '74' THEN 'typescript'
             WHEN '62' THEN 'java'
             WHEN '54' THEN 'cpp'
             WHEN '50' THEN 'c'
             WHEN '60' THEN 'go'
             WHEN '73' THEN 'rust'
             WHEN '72' THEN 'ruby'
             WHEN '51' THEN 'csharp'
             ELSE 'python'
           END,
           'code', sc.code
         )) FROM starter_code sc WHERE sc.version_id = qv.id) AS starter_code
       FROM question_versions qv
       JOIN question_bank qb ON qb.id = qv.question_id
       WHERE qv.id = ANY($1::uuid[])`,
      [versionIds]
    );
    // Preserve original ordering from question_snapshot
    const qMap = Object.fromEntries(qResult.rows.map((r: any) => [r.version_id, r]));
    attempt.questions = versionIds.map((id: string) => qMap[id]).filter(Boolean);
  } else {
    attempt.questions = [];
  }

  return attempt;
}

// ─── Auto-submit Expired Exams ─────────────────────────────────
export async function autoSubmitExpiredExams() {
  const result = await query(
    `UPDATE exam_attempts SET state = $1, submitted_at = NOW(), updated_at = NOW()
     WHERE state = $2
       AND started_at IS NOT NULL
       AND started_at + (duration_minutes || ' minutes')::interval < NOW()
     RETURNING id`,
    [ExamState.SUBMITTED, ExamState.STARTED]
  );
  return result.rows.map((r: any) => r.id);
}

// ─── Flag Exam ─────────────────────────────────────────────────
export async function flagExam(attemptId: string) {
  await query(
    `UPDATE exam_attempts SET state = $1, updated_at = NOW() WHERE id = $2`,
    [ExamState.FLAGGED, attemptId]
  );
}

// ─── Review Flagged Exam ───────────────────────────────────────
export async function reviewExam(attemptId: string, reviewedBy: string, decision: 'valid' | 'flagged' | 'cancelled') {
  const newState = decision === 'valid' ? ExamState.REVIEWED :
                   decision === 'cancelled' ? ExamState.REVIEWED : ExamState.FLAGGED;

  await query(
    `UPDATE exam_attempts SET state = $1, reviewed_by = $2, review_decision = $3, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $4`,
    [newState, reviewedBy, decision, attemptId]
  );
}
