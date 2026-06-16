import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import { authenticate, requireStudent } from '../middleware/auth';
import { submissionLimiter } from '../middleware/rate-limiter';
import { validate } from '../middleware/validators';
import * as questionService from '../services/question-service';
import * as sessionService from '../services/session-service';
import * as submissionService from '../services/submission-service';
import * as ruleService from '../services/rule-service';
import { getShadowUserById } from '../services/auth-service';
import { pool } from '../database/connection';

const router = Router();
router.use(authenticate);
// NOTE: requireStudent is applied per-route below.
// /by-course and /by-company are intentionally open to all authenticated users.

const columnPresenceCache = new Map<string, boolean>();

async function hasQuestionVersionsColumn(columnName: string) {
  const cacheKey = `question_versions.${columnName}`;
  if (columnPresenceCache.has(cacheKey)) return columnPresenceCache.get(cacheKey)!;

  const result = await pool.query(
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

// ─── Get Practice Pool ─────────────────────────────────────────
router.get('/pool', requireStudent, async (req: AuthRequest, res: Response) => {
  const { difficulty, topic, company, courseId } = req.query;
  const questions = await questionService.getPoolQuestions('practice', {
    difficulty: difficulty as string,
    topic: topic as string,
    company: company as string,
    courseId: courseId as string,
    userId: req.user?.shadowUserId,
  });
  res.json({ success: true, data: questions });
});

// ─── Create Practice Session ───────────────────────────────────
router.post('/sessions', requireStudent, async (req: AuthRequest, res: Response) => {
  const { ruleTemplateId } = req.body;
  const session = await sessionService.createPracticeSession(req.user!.shadowUserId, ruleTemplateId);
  res.status(201).json({ success: true, data: session });
});

// ─── Get Personalized Practice Set ─────────────────────────────
router.get('/personalized', requireStudent, async (req: AuthRequest, res: Response) => {
  // Get user context
  const user = await getShadowUserById(req.user!.shadowUserId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  // Resolve rule template
  const template = await ruleService.resolveRuleTemplate({
    company: user.dreamCompany || undefined,
    role: user.targetRole || undefined,
    packageSlab: user.packageSlab || undefined,
    mode: 'practice',
  });

  if (!template) {
    return res.json({ success: true, data: { questions: [], message: 'No matching rule template found' } });
  }

  // Select questions based on rule
  const questions = await ruleService.selectQuestionsByRule(template);

  res.json({
    success: true,
    data: {
      template: { id: template.id, name: template.name },
      questions,
    },
  });
});

// ─── Submit Code (Practice) ────────────────────────────────────
const submitSchema = z.object({
  questionId: z.string().uuid(),
  versionId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sourceCode: z.string().min(1),
  language: z.string().min(1),
});

router.post('/submissions', requireStudent, submissionLimiter, validate(submitSchema), async (req: AuthRequest, res: Response) => {
  const result = await submissionService.createSubmission({
    userId: req.user!.shadowUserId,
    questionId: req.body.questionId,
    versionId: req.body.versionId,
    sessionId: req.body.sessionId,
    sessionType: 'practice',
    sourceCode: req.body.sourceCode,
    language: req.body.language,
  });
  res.status(201).json({ success: true, data: result });
});

// ─── Get Submission Result ─────────────────────────────────────
router.get('/submissions/:submissionId', requireStudent, async (req: AuthRequest, res: Response) => {
  const submission = await submissionService.getSubmission(req.params.submissionId);
  res.json({ success: true, data: submission });
});

// ─── Get Session History ───────────────────────────────────────
router.get('/sessions/:sessionId', requireStudent, async (req: AuthRequest, res: Response) => {
  const session = await sessionService.getPracticeSession(req.params.sessionId);
  const submissions = await submissionService.getSessionSubmissions(req.params.sessionId, req.user!.shadowUserId);
  res.json({ success: true, data: { session, submissions } });
});

// ─── Activity Calendar (last 365 days) ────────────────────────
router.get('/activity', requireStudent, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const result = await require('../database/connection').query(
    `SELECT
       TO_CHAR(DATE(created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
       COUNT(DISTINCT question_id)                                  AS submissions,
       COUNT(DISTINCT question_id) FILTER (WHERE verdict = 'accepted') AS solved
     FROM submission_records
     WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '400 days'
     GROUP BY day
     ORDER BY day`,
    [userId]
  );
  res.json({ success: true, data: result.rows });
});

// ─── Get Courses with Published Questions ──────────────────────
router.get('/by-course', async (req: AuthRequest, res: Response) => {
  const hasCourseId = await hasQuestionVersionsColumn('course_id');
  const hasCourseName = await hasQuestionVersionsColumn('course_name');

  if (!hasCourseId || !hasCourseName) {
    return res.json({ success: true, data: [] });
  }

  const result = await pool.query(`
    SELECT 
      qv.course_id,
      qv.course_name,
      COUNT(DISTINCT qv.question_id) as question_count,
      COUNT(DISTINCT qv.question_id) FILTER (WHERE qv.difficulty = 'low') as easy_count,
      COUNT(DISTINCT qv.question_id) FILTER (WHERE qv.difficulty = 'medium') as medium_count,
      COUNT(DISTINCT qv.question_id) FILTER (WHERE qv.difficulty = 'high') as hard_count
    FROM question_versions qv
    JOIN question_publish_targets qpt ON qpt.version_id = qv.id AND qpt.pool_type = 'practice'
    WHERE qv.course_id IS NOT NULL
      AND qv.status = 'published'
    GROUP BY qv.course_id, qv.course_name
    ORDER BY qv.course_name ASC
  `);
  res.json({ success: true, data: result.rows });
});

// ─── Get Companies with Published Questions ────────────────────
router.get('/by-company', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(`
    SELECT 
      qv.source_company as company_name,
      COUNT(DISTINCT qv.question_id) as question_count,
      COUNT(DISTINCT qv.question_id) FILTER (WHERE qv.difficulty = 'low') as easy_count,
      COUNT(DISTINCT qv.question_id) FILTER (WHERE qv.difficulty = 'medium') as medium_count,
      COUNT(DISTINCT qv.question_id) FILTER (WHERE qv.difficulty = 'high') as hard_count
    FROM question_versions qv
    JOIN question_publish_targets qpt ON qpt.version_id = qv.id AND qpt.pool_type = 'practice'
    WHERE qv.source_company IS NOT NULL
      AND qv.source_company != ''
      AND qv.status = 'published'
    GROUP BY qv.source_company
    ORDER BY qv.source_company ASC
  `);
  res.json({ success: true, data: result.rows });
});

export default router;
