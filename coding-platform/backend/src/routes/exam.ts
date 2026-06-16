import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { AuthRequest, CodingRole } from '../types';
import { authenticate, requireStudent, requireHead, requireStaff } from '../middleware/auth';
import { submissionLimiter } from '../middleware/rate-limiter';
import { validate } from '../middleware/validators';
import * as questionService from '../services/question-service';
import * as sessionService from '../services/session-service';
import * as submissionService from '../services/submission-service';
import * as proctorService from '../services/proctor-service';
import * as ruleService from '../services/rule-service';
import { getShadowUserById } from '../services/auth-service';
import { createAuralSession, refreshAuralSessionMetadata } from '../services/aural-bridge-service';
import { pool } from '../database/connection';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

// ─── Student: Get Exam Pool (returns rule templates + invitations) ──
router.get('/pool', async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const role = req.user!.role;

  if (role === CodingRole.STUDENT) {
    // Terminal states — attempts in these states count as "used up" a slot
    const TERMINAL = `('submitted','flagged','reviewed','evaluated','auto_submitted')`;

    // 1. Fetch open (non-invitation) exam templates — is_default or all_students
    //    Exclude ones where the student already has a terminal attempt AND retakes = 0
    const openTemplates = await pool.query(
      `SELECT rt.*, 'open' AS access_type, NULL::uuid AS invitation_id, NULL AS expires_at_inv
       FROM rule_templates rt
       WHERE rt.target_mode = 'exam' AND rt.is_active = true AND rt.is_default = true
         AND NOT (
           rt.allowed_retakes = 0
           AND EXISTS (
             SELECT 1 FROM exam_attempts ea
             WHERE ea.exam_config_id = rt.id::text
               AND ea.user_id = $1
               AND ea.state IN ${TERMINAL}
           )
         )
       ORDER BY rt.created_at DESC`,
      [userId]
    );

    // 2. Fetch personal invitations
    //    Exclude ones where the student already submitted and retakes = 0
    let invitations: any[] = [];
    try {
      const invRes = await pool.query(
        `SELECT rt.*, 'invited' AS access_type, ei.id AS invitation_id, ei.expires_at AS expires_at_inv
         FROM exam_invitations ei
         JOIN rule_templates rt ON rt.id = ei.rule_template_id
         WHERE ei.user_id = $1 AND ei.status = 'pending'
           AND (ei.expires_at IS NULL OR ei.expires_at > NOW())
           AND rt.is_active = true
           AND NOT (
             rt.allowed_retakes = 0
             AND EXISTS (
               SELECT 1 FROM exam_attempts ea
               WHERE ea.exam_config_id = rt.id::text
                 AND ea.user_id = $1
                 AND ea.state IN ${TERMINAL}
             )
           )
         ORDER BY ei.assigned_at DESC`,
        [userId]
      );
      invitations = invRes.rows;
    } catch {
      // exam_invitations table may not exist yet — gracefully skip
    }

    // Merge: invitations first, then open (deduplicate by template id)
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const row of [...invitations, ...openTemplates.rows]) {
      if (!seen.has(row.id)) {
        seen.add(row.id);
        merged.push(row);
      }
    }

    return res.json({ success: true, data: merged });
  }

  // Staff/Head: return all exam rule templates with attempt counts
  const { rows } = await pool.query(
    `SELECT rt.*,
       COUNT(ea.id) AS total_attempts,
       COUNT(CASE WHEN ea.state IN ('submitted','evaluated') THEN 1 END) AS completed_attempts
     FROM rule_templates rt
     LEFT JOIN exam_attempts ea ON ea.exam_config_id = rt.id::text
     WHERE rt.target_mode = 'exam' AND rt.is_active = true
     GROUP BY rt.id
     ORDER BY rt.created_at DESC`
  );
  res.json({ success: true, data: rows });
});

// ─── Student: Get my pending/active attempts ──────────────────
router.get('/my-attempts', requireStudent, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const { rows } = await pool.query(
    `SELECT ea.id AS attempt_id, ea.state, ea.created_at, ea.started_at,
            rt.name AS exam_name, rt.duration_minutes, rt.difficulty_distribution
     FROM exam_attempts ea
     JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
     WHERE ea.user_id = $1 AND ea.state IN ('ready', 'started', 'interrupted')
     ORDER BY ea.created_at DESC`,
    [userId]
  );
  return res.json({ success: true, data: rows });
});

router.get('/completed-attempts', requireStudent, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId;
  const { rows } = await pool.query(
    `SELECT
       ea.id                   AS attempt_id,
       ea.state,
       ea.started_at,
       ea.submitted_at,
       rt.name                 AS exam_name,
       rt.duration_minutes,
       
       -- Total number of questions in the snapshot
       COALESCE(jsonb_array_length(ea.question_snapshot), 0) AS total_submissions,
       
       -- Count of unique questions in the snapshot that have at least one accepted submission
       COALESCE((
         SELECT COUNT(DISTINCT sr.question_id)
         FROM submission_records sr
         WHERE sr.session_id = ea.id
           AND sr.session_type = 'exam'
           AND sr.verdict = 'accepted'
       ), 0) AS accepted_count,

       -- Average of the maximum score for each question in the snapshot
       COALESCE((
         SELECT ROUND(AVG(max_q_score))
         FROM (
           SELECT COALESCE(MAX(sr.score), 0) AS max_q_score
           FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
           LEFT JOIN submission_records sr 
             ON sr.session_id = ea.id
             AND sr.session_type = 'exam'
             AND sr.version_id = v_id::uuid
           GROUP BY v_id
         ) AS q_scores
       ), 0) AS avg_score,

       -- Average complexity / maintainability / nesting of the latest submissions for each question
       COALESCE((
         SELECT ROUND(AVG(sr.cyclomatic_complexity))
         FROM (
           SELECT DISTINCT ON (v_id) sr.cyclomatic_complexity
           FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
           JOIN submission_records sr 
             ON sr.session_id = ea.id
             AND sr.session_type = 'exam'
             AND sr.version_id = v_id::uuid
           ORDER BY v_id, sr.created_at DESC
         ) AS sr
       ), 0) AS avg_cyclomatic_complexity,

       COALESCE((
         SELECT ROUND(AVG(sr.maintainability_index))
         FROM (
           SELECT DISTINCT ON (v_id) sr.maintainability_index
           FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
           JOIN submission_records sr 
             ON sr.session_id = ea.id
             AND sr.session_type = 'exam'
             AND sr.version_id = v_id::uuid
           ORDER BY v_id, sr.created_at DESC
         ) AS sr
       ), 0) AS avg_maintainability_index,

       COALESCE((
         SELECT MAX(sr.max_nesting_depth)
         FROM (
           SELECT DISTINCT ON (v_id) sr.max_nesting_depth
           FROM jsonb_array_elements_text(ea.question_snapshot) AS v_id
           JOIN submission_records sr 
             ON sr.session_id = ea.id
             AND sr.session_type = 'exam'
             AND sr.version_id = v_id::uuid
           ORDER BY v_id, sr.created_at DESC
         ) AS sr
       ), 0) AS max_nesting_depth

     FROM exam_attempts ea
     LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
     WHERE ea.user_id = $1 AND ea.state NOT IN ('ready', 'started', 'interrupted', 'scheduled')
     ORDER BY ea.submitted_at DESC NULLS LAST, ea.created_at DESC`,
    [userId]
  );
  return res.json({ success: true, data: rows });
});

// ─── Admin: Create Exam Template ───────────────────────────────
const createExamTemplateSchema = z.object({
  name: z.string().min(3).max(100),
  company: z.string().optional(),
  role: z.string().optional(),
  packageSlab: z.string().optional(),
  questionCount: z.number().int().positive().default(3),
  difficultyDistribution: z.object({
    low: z.number().int().min(0),
    medium: z.number().int().min(0),
    high: z.number().int().min(0),
  }),
  durationMinutes: z.number().int().positive().default(60),
  allowedRetakes: z.number().int().min(0).default(0),
  shuffleQuestions: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

router.post(
  '/templates',
  requireStaff,
  validate(createExamTemplateSchema),
  async (req: AuthRequest, res: Response) => {
    const result = await ruleService.createRuleTemplate({
      ...req.body,
      targetMode: 'exam',
      roadmapLinkage: false,
      createdBy: req.user!.shadowUserId,
    });
    res.status(201).json({ success: true, data: result });
  }
);

// ─── Admin: List all exam templates (with stats) ───────────────
router.get('/templates', requireStaff, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT rt.*,
       COUNT(DISTINCT ea.id) AS total_attempts,
       COUNT(DISTINCT CASE WHEN ea.state IN ('submitted','evaluated') THEN ea.id END) AS completed_attempts,
       COUNT(DISTINCT ei.id) AS total_invitations,
       COUNT(DISTINCT CASE WHEN ei.status = 'pending' THEN ei.id END) AS pending_invitations
     FROM rule_templates rt
     LEFT JOIN exam_attempts ea ON ea.exam_config_id = rt.id::text
     LEFT JOIN exam_invitations ei ON ei.rule_template_id = rt.id
     WHERE rt.target_mode = 'exam'
     GROUP BY rt.id
     ORDER BY rt.created_at DESC`
  );
  res.json({ success: true, data: rows });
});

// ─── Admin: Get exam template + all attempts ───────────────────
router.get('/templates/:templateId', requireStaff, async (req: AuthRequest, res: Response) => {
  const { rows: tmpl } = await pool.query(
    `SELECT * FROM rule_templates WHERE id = $1 AND target_mode = 'exam'`,
    [req.params.templateId]
  );
  if (!tmpl.length) return res.status(404).json({ success: false, error: 'Exam template not found' });

  const { rows: attempts } = await pool.query(
    `SELECT ea.*, u.name AS student_name, u.email AS student_email
     FROM exam_attempts ea
     JOIN users u ON u.id = ea.user_id
     WHERE ea.exam_config_id = $1
     ORDER BY ea.created_at DESC`,
    [req.params.templateId]
  );

  let invitations: any[] = [];
  try {
    const invRes = await pool.query(
      `SELECT ei.*, u.name AS student_name, u.email AS student_email,
              ab.name AS assigned_by_name
       FROM exam_invitations ei
       JOIN users u ON u.id = ei.user_id
       JOIN users ab ON ab.id = ei.assigned_by
       WHERE ei.rule_template_id = $1
       ORDER BY ei.assigned_at DESC`,
      [req.params.templateId]
    );
    invitations = invRes.rows;
  } catch { /* table may not exist yet */ }

  res.json({ success: true, data: { template: tmpl[0], attempts, invitations } });
});

// ─── Admin: Invite / assign users to an exam ──────────────────
const inviteSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  expiresAt: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return val === '' ? undefined : val;
  }, z.string().datetime().optional()),
  note: z.string().max(500).optional(),
});

router.post(
  '/templates/:templateId/invite',
  requireStaff,
  validate(inviteSchema),
  async (req: AuthRequest, res: Response) => {
    const { templateId } = req.params;
    const { userIds, expiresAt, note } = req.body as {
      userIds: string[];
      expiresAt?: string;
      note?: string;
    };

    // Verify template exists
    const { rows: tmpl } = await pool.query(
      `SELECT id FROM rule_templates WHERE id = $1 AND target_mode = 'exam' AND is_active = true`,
      [templateId]
    );
    if (!tmpl.length) return res.status(404).json({ success: false, error: 'Exam template not found' });

    const results: { userId: string; status: string }[] = [];

    for (const userId of userIds) {
      try {
        await pool.query(
          `INSERT INTO exam_invitations (id, rule_template_id, user_id, assigned_by, expires_at, note)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
           ON CONFLICT (rule_template_id, user_id)
           DO UPDATE SET status = 'pending', expires_at = EXCLUDED.expires_at,
                         assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
          [templateId, userId, req.user!.shadowUserId, expiresAt || null, note || null]
        );
        results.push({ userId, status: 'invited' });
      } catch (err: any) {
        results.push({ userId, status: 'error: ' + err.message });
      }
    }

    res.json({ success: true, data: results });
  }
);

// ─── Admin: Cancel an invitation ──────────────────────────────
router.delete(
  '/templates/:templateId/invite/:userId',
  requireStaff,
  async (req: AuthRequest, res: Response) => {
    await pool.query(
      `UPDATE exam_invitations SET status = 'cancelled'
       WHERE rule_template_id = $1 AND user_id = $2`,
      [req.params.templateId, req.params.userId]
    );
    res.json({ success: true });
  }
);

// ─── Admin: List all students (for invite dropdown) ───────────
router.get('/students', requireStaff, async (req: AuthRequest, res: Response) => {
  const { search } = req.query;
  const params: any[] = ['student'];
  let sql = `SELECT id, name, email FROM users WHERE role = $1 AND is_active = true`;
  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (name ILIKE $2 OR email ILIKE $2)`;
  }
  sql += ` ORDER BY name LIMIT 100`;
  const { rows } = await pool.query(sql, params);
  res.json({ success: true, data: rows });
});

// ─── Admin: Bulk-invite students from Excel ───────────────────
// POST /api/exam/templates/:templateId/invite-excel
// Multipart: field "file" = .xlsx / .csv
// Expected columns (case-insensitive): name, email
// Creates users (as students) if they don't exist, then invites them.
router.post(
  '/templates/:templateId/invite-excel',
  requireStaff,
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    const { templateId } = req.params;
    const expiresAt = req.body?.expiresAt || null;
    const note      = req.body?.note      || null;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Verify template
    const { rows: tmpl } = await pool.query(
      `SELECT id FROM rule_templates WHERE id = $1 AND target_mode = 'exam' AND is_active = true`,
      [templateId]
    );
    if (!tmpl.length) {
      return res.status(404).json({ success: false, error: 'Exam template not found' });
    }

    // Parse workbook
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch {
      return res.status(400).json({ success: false, error: 'Could not parse file. Upload a valid .xlsx or .csv.' });
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rawRows.length) {
      return res.status(400).json({ success: false, error: 'Sheet is empty' });
    }

    // Normalise headers to lowercase
    const rows = rawRows.map(r =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()]))
    );

    const results: { row: number; email: string; status: string; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-based + header
      const email = rows[i]['email'];
      const name  = rows[i]['name'] || rows[i]['student name'] || rows[i]['full name'] || email?.split('@')[0] || '';

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({ row: rowNum, email: email || '(blank)', status: 'skipped', error: 'Invalid email' });
        continue;
      }

      try {
        // Upsert user as student
        const smartId = `excel-${email.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
        const { rows: userRows } = await pool.query(
          `INSERT INTO users (id, smart_user_id, email, name, role, is_active, created_at, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, 'student', true, NOW(), NOW())
           ON CONFLICT (smart_user_id) DO UPDATE
             SET name = CASE WHEN EXCLUDED.name != '' THEN EXCLUDED.name ELSE users.name END,
                 updated_at = NOW()
           RETURNING id, name`,
          [smartId, email.toLowerCase(), name]
        );
        const userId = userRows[0].id;

        // Invite to exam
        await pool.query(
          `INSERT INTO exam_invitations (id, rule_template_id, user_id, assigned_by, expires_at, note)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
           ON CONFLICT (rule_template_id, user_id)
           DO UPDATE SET status = 'pending', expires_at = EXCLUDED.expires_at,
                         assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()`,
          [templateId, userId, req.user!.shadowUserId, expiresAt, note]
        );

        results.push({ row: rowNum, email, status: 'invited' });
      } catch (err: any) {
        results.push({ row: rowNum, email, status: 'error', error: err.message });
      }
    }

    const invited = results.filter(r => r.status === 'invited').length;
    const skipped = results.filter(r => r.status !== 'invited').length;

    return res.json({
      success: true,
      data: { invited, skipped, total: rows.length, results },
    });
  }
);


// ─── Admin: Question pool for a template ──────────────────────
// GET  /api/exam/templates/:id/question-pool  — list + coverage
// POST /api/exam/templates/:id/question-pool  — add a question (by version_id)
// DELETE /api/exam/templates/:id/question-pool/:versionId — remove a question

router.get('/templates/:templateId/question-pool', requireStaff, async (req: AuthRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  const { templateId } = req.params;
  const { rows: tmpl } = await pool.query(
    `SELECT * FROM rule_templates WHERE id = $1 AND target_mode = 'exam'`, [templateId]
  );
  if (!tmpl.length) return res.status(404).json({ success: false, error: 'Template not found' });

  const template = tmpl[0];
  const dist = typeof template.difficulty_distribution === 'string'
    ? JSON.parse(template.difficulty_distribution) : template.difficulty_distribution;

  // Questions already in this template's pool
  const { rows: poolRows } = await pool.query(
    `SELECT qv.id, qv.title, qv.difficulty, qv.topic_tags, qv.time_limit_ms,
            etq.added_at, u.name AS added_by_name
     FROM exam_template_questions etq
     JOIN question_versions qv ON qv.id = etq.version_id
     JOIN users u ON u.id = etq.added_by
     WHERE etq.template_id = $1
     ORDER BY qv.difficulty, qv.title`, [templateId]
  );

  // Coverage per difficulty
  const coverage: Record<string, { needed: number; available: number; ok: boolean }> = {};
  for (const [diff, needed] of Object.entries(dist)) {
    const count = poolRows.filter(q => q.difficulty === diff).length;
    coverage[diff] = { needed: needed as number, available: count, ok: count >= (needed as number) };
  }
  const canStart = Object.values(coverage).every(c => c.ok);
  const usingDedicatedPool = poolRows.length > 0;

  return res.json({
    success: true,
    data: {
      template: { id: template.id, name: template.name, difficulty_distribution: dist },
      usingDedicatedPool,
      coverage,
      questions: poolRows,
      canStart,
    },
  });
});

router.post('/templates/:templateId/question-pool', requireStaff, async (req: AuthRequest, res: Response) => {
  const { templateId } = req.params;
  const { versionId } = req.body;
  if (!versionId) return res.status(400).json({ success: false, error: 'versionId is required' });

  // Verify template exists and user has access
  const { rows: tmpl } = await pool.query(
    `SELECT id FROM rule_templates WHERE id = $1 AND target_mode = 'exam'`, [templateId]
  );
  if (!tmpl.length) return res.status(404).json({ success: false, error: 'Template not found' });

  // Verify question is published
  const { rows: qv } = await pool.query(
    `SELECT id, title, difficulty FROM question_versions WHERE id = $1 AND status = 'published'`, [versionId]
  );
  if (!qv.length) return res.status(404).json({ success: false, error: 'Question not found or not published' });

  await pool.query(
    `INSERT INTO exam_template_questions (template_id, version_id, added_by)
     VALUES ($1, $2, $3) ON CONFLICT (template_id, version_id) DO NOTHING`,
    [templateId, versionId, req.user!.shadowUserId]
  );
  return res.json({ success: true, data: qv[0] });
});

router.delete('/templates/:templateId/question-pool/:versionId', requireStaff, async (req: AuthRequest, res: Response) => {
  const { templateId, versionId } = req.params;
  await pool.query(
    `DELETE FROM exam_template_questions WHERE template_id = $1 AND version_id = $2`,
    [templateId, versionId]
  );
  return res.json({ success: true });
});

// ─── Download Excel template for bulk question import ─────────
router.get('/templates/:templateId/question-pool/import-template', requireStaff, (_req: AuthRequest, res: Response) => {
  const wb = XLSX.utils.book_new();
  const sample = [
    {
      title: 'Two Sum',
      difficulty: 'easy',
      time_limit_minutes: 2,
      topic_tags: 'arrays, hash-map',
      problem_statement: 'Given an array of integers nums and an integer target, return indices of the two numbers that add up to target.',
      input_format: 'First line: array of integers\nSecond line: target integer',
      output_format: 'Two indices separated by space',
      constraints: '2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9',
      sample_input: '[2,7,11,15]\n9',
      sample_output: '0 1',
      explanation: 'nums[0] + nums[1] = 2 + 7 = 9',
    },
    {
      title: 'Reverse a String',
      difficulty: 'easy',
      time_limit_minutes: 1,
      topic_tags: 'strings, two-pointers',
      problem_statement: 'Write a function that reverses a string.',
      input_format: 'A single string s',
      output_format: 'The reversed string',
      constraints: '1 <= s.length <= 10^5',
      sample_input: 'hello',
      sample_output: 'olleh',
      explanation: '',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sample);
  // Set column widths
  ws['!cols'] = [30,12,18,30,50,30,30,30,20,20,30].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Questions');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="question-import-template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.send(buf);
});

// ─── Bulk import questions from Excel ────────────────────────
router.post('/templates/:templateId/question-pool/import-excel', requireStaff, upload.single('file'), async (req: AuthRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const { templateId } = req.params;
  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const { rows: tmpl } = await pool.query(
    `SELECT id FROM rule_templates WHERE id = $1 AND target_mode = 'exam'`, [templateId]
  );
  if (!tmpl.length) return res.status(404).json({ success: false, error: 'Template not found' });

  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  const results: { row: number; status: string; title?: string; error?: string }[] = [];
  let imported = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // Excel rows start at 2 (row 1 = header)

    const rawTitle = String(r.title || '').trim();
    const rawDiff = String(r.difficulty || '').trim().toLowerCase();

    if (!rawTitle) {
      results.push({ row: rowNum, status: 'skipped', error: 'Missing title' });
      skipped++;
      continue;
    }

    const diffMap: Record<string, string> = { easy: 'low', low: 'low', medium: 'medium', med: 'medium', hard: 'high', high: 'high' };
    const difficulty = diffMap[rawDiff] ?? 'medium';

    const timeLimitMs = Math.round((parseFloat(String(r.time_limit_minutes)) || 2) * 60 * 1000);
    const topicTags = String(r.topic_tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
    const problemStatement = String(r.problem_statement || rawTitle);
    const inputFormat = String(r.input_format || '');
    const outputFormat = String(r.output_format || '');
    const constraints = String(r.constraints || '');
    const examples = [];
    if (r.sample_input || r.sample_output) {
      examples.push({ input: String(r.sample_input || ''), output: String(r.sample_output || ''), explanation: String(r.explanation || '') });
    }

    try {
      // 1. Create question_bank entry (slug = kebab-case title + random suffix for uniqueness)
      const baseSlug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
      const slug = `${baseSlug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { rows: qb } = await pool.query(
        `INSERT INTO question_bank (id, slug, created_by, created_at)
         VALUES (uuid_generate_v4(), $1, $2, NOW()) RETURNING id`,
        [slug, req.user!.shadowUserId]
      );
      const questionBankId = qb[0].id;

      // 2. Create question_versions entry (published directly)
      const { rows: qv } = await pool.query(
        `INSERT INTO question_versions
           (question_id, version_number, title, problem_statement, input_format, output_format,
            constraints, examples, difficulty, topic_tags, time_limit_ms, status, created_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, 'published', $11)
         RETURNING id`,
        [questionBankId, rawTitle, problemStatement, inputFormat, outputFormat,
         constraints, JSON.stringify(examples), difficulty, topicTags, timeLimitMs, req.user!.shadowUserId]
      );
      const versionId = qv[0].id;

      // 3. Add to template pool
      await pool.query(
        `INSERT INTO exam_template_questions (template_id, version_id, added_by)
         VALUES ($1, $2, $3) ON CONFLICT (template_id, version_id) DO NOTHING`,
        [templateId, versionId, req.user!.shadowUserId]
      );

      results.push({ row: rowNum, status: 'imported', title: rawTitle });
      imported++;
    } catch (err: any) {
      results.push({ row: rowNum, status: 'error', title: rawTitle, error: err.message });
      skipped++;
    }
  }

  return res.json({ success: true, data: { imported, skipped, total: rows.length, results } });
});

// Search all published questions not yet in this template's pool
router.get('/templates/:templateId/question-pool/search', requireStaff, async (req: AuthRequest, res: Response) => {
  const { templateId } = req.params;
  const q = (req.query.q as string) || '';
  const difficulty = (req.query.difficulty as string) || null;

  const params: any[] = [`%${q}%`];
  let diffClause = '';
  if (difficulty) { params.push(difficulty); diffClause = `AND qv.difficulty = $${params.length}`; }

  const { rows } = await pool.query(
    `SELECT qv.id, qv.title, qv.difficulty, qv.topic_tags
     FROM question_versions qv
     WHERE qv.status = 'published'
       AND qv.title ILIKE $1
       ${diffClause}
       AND qv.id NOT IN (
         SELECT version_id FROM exam_template_questions WHERE template_id = $${params.length + 1}
       )
     ORDER BY qv.difficulty, qv.title
     LIMIT 40`,
    [...params, templateId]
  );
  return res.json({ success: true, data: rows });
});

// ─── Admin: Staff assignments for a template ──────────────────
// GET    /api/exam/templates/:id/staff
// POST   /api/exam/templates/:id/staff   { userId }
// DELETE /api/exam/templates/:id/staff/:userId

router.get('/templates/:templateId/staff', requireStaff, async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT ets.id, ets.assigned_at,
            u.id AS user_id, u.name, u.email, u.role,
            ab.name AS assigned_by_name
     FROM exam_template_staff ets
     JOIN users u  ON u.id  = ets.user_id
     JOIN users ab ON ab.id = ets.assigned_by
     WHERE ets.template_id = $1
     ORDER BY ets.assigned_at DESC`,
    [req.params.templateId]
  );
  return res.json({ success: true, data: rows });
});

router.post('/templates/:templateId/staff', requireHead, async (req: AuthRequest, res: Response) => {
  const { templateId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

  // Verify user is staff
  const { rows: u } = await pool.query(
    `SELECT id, name, email, role FROM users WHERE id = $1 AND role IN ('placement_member','placement_head') AND is_active = true`,
    [userId]
  );
  if (!u.length) return res.status(404).json({ success: false, error: 'Staff user not found' });

  await pool.query(
    `INSERT INTO exam_template_staff (template_id, user_id, assigned_by)
     VALUES ($1, $2, $3) ON CONFLICT (template_id, user_id) DO NOTHING`,
    [templateId, userId, req.user!.shadowUserId]
  );
  return res.json({ success: true, data: u[0] });
});

router.delete('/templates/:templateId/staff/:userId', requireHead, async (req: AuthRequest, res: Response) => {
  await pool.query(
    `DELETE FROM exam_template_staff WHERE template_id = $1 AND user_id = $2`,
    [req.params.templateId, req.params.userId]
  );
  return res.json({ success: true });
});

// ─── Admin: Manually create exam attempt for a student ────────
// POST /api/exam/templates/:templateId/launch-for/:userId
// Lets an admin/staff manually start an exam for a specific student.
router.post('/templates/:templateId/launch-for/:userId', requireStaff, async (req: AuthRequest, res: Response) => {
  const { templateId, userId } = req.params;

  const { rows: tmpl } = await pool.query(
    `SELECT * FROM rule_templates WHERE id = $1 AND target_mode = 'exam' AND is_active = true`,
    [templateId]
  );
  if (!tmpl.length) return res.status(404).json({ success: false, error: 'Template not found' });

  const template = tmpl[0];
  const selected = await ruleService.selectQuestionsByRule(template);
  const questionVersionIds = selected.map((q: any) => q.version_id ?? q.id).filter(Boolean);
  if (questionVersionIds.length === 0) {
    return res.status(422).json({ success: false, error: 'No questions available for this template. Add more questions to the pool first.' });
  }

  const result = await sessionService.createExamAttempt({
    userId,
    examConfigId: template.id,
    durationMinutes: template.duration_minutes ?? 60,
    questionVersionIds,
  });

  return res.json({ success: true, data: result });
});

const createExamSchema = z.object({
  ruleTemplateId: z.string().uuid().optional(),
});

router.post('/sessions', requireStudent, validate(createExamSchema), async (req: AuthRequest, res: Response) => {
  const user = await getShadowUserById(req.user!.shadowUserId);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  // Resolve rule template: by explicit ID, or by student profile (company/role/package)
  let template: any = null;
  if (req.body.ruleTemplateId) {
    const tRes = await pool.query(
      `SELECT * FROM rule_templates WHERE id = $1 AND target_mode = 'exam' AND is_active = true LIMIT 1`,
      [req.body.ruleTemplateId]
    );
    template = tRes.rows[0] ?? null;
  }
  if (!template) {
    template = await ruleService.resolveRuleTemplate({
      company: user.dreamCompany || undefined,
      role: user.targetRole || undefined,
      packageSlab: user.packageSlab || undefined,
      mode: 'exam',
    });
  }
  if (!template) {
    return res.status(422).json({ success: false, error: 'No exam template available for your profile' });
  }

  // Select questions based on the rule template
  const selected = await ruleService.selectQuestionsByRule(template);
  const questionVersionIds = selected.map((q: any) => q.version_id ?? q.id).filter(Boolean);
  if (questionVersionIds.length === 0) {
    return res.status(422).json({ success: false, error: 'No questions available for this exam template' });
  }

  const result = await sessionService.createExamAttempt({
    userId: req.user!.shadowUserId,
    examConfigId: template.id,
    durationMinutes: template.duration_minutes ?? 60,
    questionVersionIds,
  });
  res.status(201).json({ success: true, data: result });
});

// ─── Start Exam ────────────────────────────────────────────────
router.post('/:attemptId/start', requireStudent, async (req: AuthRequest, res: Response) => {
  const result = await sessionService.startExam(req.params.attemptId, req.user!.shadowUserId);

  // Start proctoring session
  const proctorSession = await proctorService.createProctorSession(req.params.attemptId);

  res.json({
    success: true,
    data: {
      ...result,
      proctorSessionId: proctorSession.sessionId,
    },
  });
});

// ─── Submit Code During Exam ───────────────────────────────────
const examSubmitSchema = z.object({
  questionId: z.string().uuid(),
  versionId: z.string().uuid(),
  sourceCode: z.string().min(1),
  language: z.string().min(1),
});

router.post('/:attemptId/submissions', requireStudent, submissionLimiter, validate(examSubmitSchema), async (req: AuthRequest, res: Response) => {
  const result = await submissionService.createSubmission({
    userId: req.user!.shadowUserId,
    questionId: req.body.questionId,
    versionId: req.body.versionId,
    sessionId: req.params.attemptId,
    sessionType: 'exam',
    sourceCode: req.body.sourceCode,
    language: req.body.language,
  });
  res.status(201).json({ success: true, data: result });
});

// ─── Final Exam Submit ─────────────────────────────────────────
router.post('/:attemptId/submit', requireStudent, async (req: AuthRequest, res: Response) => {
  const { attemptId } = req.params;
  const userId = req.user!.shadowUserId;

  const result = await sessionService.submitExam(attemptId, userId);

  // End proctoring session
  const proctorSession = await proctorService.getProctorSession(attemptId);
  if (proctorSession) {
    await proctorService.endProctorSession(proctorSession.id);
  }

  // If exam was already submitted (idempotent), refresh metadata and return the existing URL
  const existingRow = await pool.query(
    `SELECT aural_session_url, aural_session_id FROM exam_attempts WHERE id = $1`,
    [attemptId]
  );
  const existingSessionUrl: string | null = existingRow.rows[0]?.aural_session_url ?? null;
  const existingSessionId: string | null  = existingRow.rows[0]?.aural_session_id  ?? null;
  if (existingSessionUrl && existingSessionId) {
    // Refresh participantMetadata so new code excerpts are available
    try {
      const [userRow, attemptRow] = await Promise.all([
        pool.query(`SELECT name, email FROM users WHERE id = $1`, [userId]),
        pool.query(
          `SELECT ea.exam_config_id, rt.company, rt.role
           FROM exam_attempts ea
           LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
           WHERE ea.id = $1`,
          [attemptId]
        ),
      ]);
      const user    = userRow.rows[0];
      const attempt = attemptRow.rows[0];
      const { weakTopics, submissionSummary, overallScore } =
        await submissionService.getExamWeakTopics(attemptId, userId);
      await refreshAuralSessionMetadata({
        sessionId:         existingSessionId,
        examAttemptId:     attemptId,
        examScore:         overallScore,
        weakTopics,
        submissionSummary,
        company:           attempt?.company ?? undefined,
        course:            attempt?.role    ?? undefined,
      });
    } catch (refreshErr) {
      console.error('[exam-bridge] Failed to refresh session metadata:', refreshErr);
    }
    return res.json({
      success: true,
      data: { ...result, interviewSessionUrl: existingSessionUrl },
    });
  }

  // ── aural-oss bridge: create interview session ────────────────
  let auralResult: { sessionUrl: string; sessionId: string; inviteToken: string; interviewId?: string } | null = null;
  try {
    // Fetch student details and exam config
    const [userRow, attemptRow] = await Promise.all([
      pool.query(`SELECT name, email FROM users WHERE id = $1`, [userId]),
      pool.query(
        `SELECT ea.exam_config_id, rt.company, rt.role
         FROM exam_attempts ea
         LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
         WHERE ea.id = $1`,
        [attemptId]
      ),
    ]);

    const user = userRow.rows[0];
    const attempt = attemptRow.rows[0];

    // Derive weak topics + build submission summary
    const { weakTopics, submissionSummary, overallScore } =
      await submissionService.getExamWeakTopics(attemptId, userId);

    auralResult = await createAuralSession({
      studentName:       user?.name   ?? 'Student',
      studentEmail:      user?.email  ?? '',
      examAttemptId:     attemptId,
      examScore:         overallScore,
      weakTopics,
      submissionSummary,
      company:           attempt?.company   ?? undefined,
      course:            attempt?.role       ?? undefined,
    });

    // Persist the aural session reference on the attempt row
    await pool.query(
      `UPDATE exam_attempts
       SET aural_session_id   = $1,
           aural_interview_id = $2,
           aural_session_url  = $3,
           aural_invite_token = $4,
           updated_at         = NOW()
       WHERE id = $5`,
      [
        auralResult.sessionId,
        auralResult.interviewId ?? null,
        auralResult.sessionUrl,
        auralResult.inviteToken,
        attemptId,
      ]
    );
  } catch (bridgeErr) {
    // Bridge is non-blocking — log and continue
    console.error('[exam-bridge] Failed to create aural session:', bridgeErr);
  }

  res.json({
    success: true,
    data: {
      ...result,
      interviewSessionUrl: auralResult?.sessionUrl ?? null,
    },
  });
});

// ─── Re-entry Gate: get interview link (max 5 attempts) ───────
router.get('/:attemptId/interview-link', requireStudent, async (req: AuthRequest, res: Response) => {
  const { attemptId } = req.params;
  const userId = req.user!.shadowUserId;

  const row = await pool.query(
    `SELECT aural_session_url, aural_reentry_count, user_id, state
     FROM exam_attempts WHERE id = $1`,
    [attemptId]
  );

  if (row.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Exam attempt not found' });
  }

  const attempt = row.rows[0];

  if (attempt.user_id !== userId) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  if (!attempt.aural_session_url) {
    return res.status(404).json({ success: false, error: 'No interview session linked to this attempt yet' });
  }

  const MAX_REENTRY = 5;
  if (attempt.aural_reentry_count >= MAX_REENTRY) {
    return res.status(403).json({
      success: false,
      error: `Maximum re-entries (${MAX_REENTRY}) reached. Contact your coordinator to reset access.`,
      reentryCount: attempt.aural_reentry_count,
      maxReentry: MAX_REENTRY,
    });
  }

  // Increment counter
  await pool.query(
    `UPDATE exam_attempts SET aural_reentry_count = aural_reentry_count + 1, updated_at = NOW()
     WHERE id = $1`,
    [attemptId]
  );

  // Refresh participantMetadata on every re-entry so the AI always has current code excerpts
  try {
    const [userRow, cfgRow] = await Promise.all([
      pool.query(`SELECT name, email FROM users WHERE id = $1`, [userId]),
      pool.query(
        `SELECT ea.aural_session_id, rt.company, rt.role
         FROM exam_attempts ea
         LEFT JOIN rule_templates rt ON rt.id::text = ea.exam_config_id
         WHERE ea.id = $1`,
        [attemptId]
      ),
    ]);
    const auralSessionId: string | null = cfgRow.rows[0]?.aural_session_id ?? null;
    if (auralSessionId) {
      const { weakTopics, submissionSummary, overallScore } =
        await submissionService.getExamWeakTopics(attemptId, userId);
      await refreshAuralSessionMetadata({
        sessionId:         auralSessionId,
        examAttemptId:     attemptId,
        examScore:         overallScore,
        weakTopics,
        submissionSummary,
        company:           cfgRow.rows[0]?.company ?? undefined,
        course:            cfgRow.rows[0]?.role    ?? undefined,
      });
    }
  } catch (refreshErr) {
    console.error('[interview-link] metadata refresh failed:', refreshErr);
  }

  return res.json({
    success: true,
    data: {
      sessionUrl: attempt.aural_session_url,
      reentryCount: attempt.aural_reentry_count + 1,
      maxReentry: MAX_REENTRY,
    },
  });
});

// ─── Get Single Submission Result ────────────────────────────
router.get('/:attemptId/submissions/:submissionId', requireStudent, async (req: AuthRequest, res: Response) => {
  const { submissionId } = req.params;
  const result = await pool.query(
    `SELECT sr.*,
       COALESCE(
         json_agg(str.* ORDER BY str.created_at) FILTER (WHERE str.id IS NOT NULL),
         '[]'
       ) AS test_results
     FROM submission_records sr
     LEFT JOIN submission_test_results str ON str.submission_id = sr.id
     WHERE sr.id = $1 AND sr.session_id = $2
     GROUP BY sr.id`,
    [submissionId, req.params.attemptId]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Submission not found' });
  }
  res.json({ success: true, data: result.rows[0] });
});

// ─── Get Exam Attempt ──────────────────────────────────────────
router.get('/:attemptId', async (req: AuthRequest, res: Response) => {
  const attempt = await sessionService.getExamAttempt(req.params.attemptId);
  let proctorData = null;
  try {
    proctorData = await proctorService.getProctorSession(req.params.attemptId);
  } catch { /* no proctor session yet — not an error */ }
  res.json({ success: true, data: { attempt, proctoring: proctorData } });
});

// ─── Student Self-Report Proctor Incident ─────────────────────
const proctorIncidentSchema = z.object({
  incidentType: z.enum([
    'tab_switch',
    'focus_loss',
    'suspicious_window',
    'camera_unavailable',
    'permission_failure',
    'devtools_open',      // reported by chrome extension
  ]),
  metadata: z.record(z.any()).optional(),
});

router.post(
  '/:attemptId/proctor-incident',
  requireStudent,
  validate(proctorIncidentSchema),
  async (req: AuthRequest, res: Response) => {
    const session = await proctorService.getProctorSession(req.params.attemptId);
    if (!session) {
      return res
        .status(404)
        .json({ success: false, error: 'No proctor session found — was the exam started?' });
    }

    const result = await proctorService.recordProctorEvent({
      sessionId: session.id,
      incidentType: req.body.incidentType as any,
      metadata: req.body.metadata,
    });

    res.json({ success: true, data: result });
  },
);

// ─── Review Flagged Exam (Head only) ───────────────────────────
const reviewSchema = z.object({
  decision: z.enum(['valid', 'flagged', 'cancelled']),
});

router.post('/:attemptId/review', requireHead, validate(reviewSchema), async (req: AuthRequest, res: Response) => {
  await sessionService.reviewExam(req.params.attemptId, req.user!.shadowUserId, req.body.decision);
  res.json({ success: true, message: `Exam ${req.body.decision}` });
});

export default router;
