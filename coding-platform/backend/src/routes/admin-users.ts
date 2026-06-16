import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import { authenticate, requireHead, requireStaff } from '../middleware/auth';
import { validate } from '../middleware/validators';
import { pool } from '../database/connection';

const router = Router();
router.use(authenticate);

// ─── Get My Assignments (any staff) ────────────────────────────
// placement_head  → returns ALL distinct courses/companies in the system
// placement_member → returns only their own assigned courses/companies
router.get('/my-assignments', requireStaff, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.shadowUserId || req.user!.userId;
  const isHead = req.user!.role === 'placement_head';

  const [courses, companies] = await Promise.all([
    isHead
      ? pool.query(
          `SELECT DISTINCT ON (course_id) id, course_id, course_name
           FROM user_course_assignments
           ORDER BY course_id, course_name ASC`
        )
      : pool.query(
          'SELECT * FROM user_course_assignments WHERE user_id = $1 ORDER BY course_name',
          [userId]
        ),
    isHead
      ? pool.query(
          `SELECT DISTINCT ON (company_name) id, company_name
           FROM user_company_assignments
           ORDER BY company_name ASC`
        )
      : pool.query(
          'SELECT * FROM user_company_assignments WHERE user_id = $1 ORDER BY company_name',
          [userId]
        ),
  ]);
  res.json({
    success: true,
    data: {
      courses: courses.rows,
      companies: companies.rows,
    },
  });
});

// ─── All routes below require placement_head ───────────────────
router.use(requireHead);

// ─── List Staff Users ──────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const result = await pool.query(`
    SELECT u.id, u.smart_user_id, u.email, u.name, u.role, u.is_active, u.created_at,
      COALESCE(
        (SELECT json_agg(json_build_object('id', uca.id, 'course_id', uca.course_id, 'course_name', uca.course_name))
         FROM user_course_assignments uca WHERE uca.user_id = u.id), '[]'
      ) as course_assignments,
      COALESCE(
        (SELECT json_agg(json_build_object('id', ucoa.id, 'company_name', ucoa.company_name))
         FROM user_company_assignments ucoa WHERE ucoa.user_id = u.id), '[]'
      ) as company_assignments
    FROM users u
    WHERE u.role IN ('placement_member', 'placement_head')
    ORDER BY u.name ASC
  `);
  res.json({ success: true, data: result.rows });
});

// ─── Assign Course to User ─────────────────────────────────────
const assignCourseSchema = z.object({
  userId: z.string().uuid(),
  courseId: z.string().min(1),
  courseName: z.string().min(1),
});

router.post('/assign-course', validate(assignCourseSchema), async (req: AuthRequest, res: Response) => {
  const { userId, courseId, courseName } = req.body;
  const result = await pool.query(`
    INSERT INTO user_course_assignments (user_id, course_id, course_name, assigned_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, course_id) DO NOTHING
    RETURNING *
  `, [userId, courseId, courseName, req.user!.shadowUserId]);

  if (result.rows.length === 0) {
    return res.json({ success: true, message: 'Course already assigned' });
  }
  res.status(201).json({ success: true, data: result.rows[0] });
});

// ─── Remove Course Assignment ──────────────────────────────────
router.delete('/course-assignment/:assignmentId', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM user_course_assignments WHERE id = $1', [req.params.assignmentId]);
  res.json({ success: true, message: 'Course assignment removed' });
});

// ─── Assign Company to User ────────────────────────────────────
const assignCompanySchema = z.object({
  userId: z.string().uuid(),
  companyName: z.string().min(1),
});

router.post('/assign-company', validate(assignCompanySchema), async (req: AuthRequest, res: Response) => {
  const { userId, companyName } = req.body;
  const result = await pool.query(`
    INSERT INTO user_company_assignments (user_id, company_name, assigned_by)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, company_name) DO NOTHING
    RETURNING *
  `, [userId, companyName, req.user!.shadowUserId]);

  if (result.rows.length === 0) {
    return res.json({ success: true, message: 'Company already assigned' });
  }
  res.status(201).json({ success: true, data: result.rows[0] });
});

// ─── Remove Company Assignment ─────────────────────────────────
router.delete('/company-assignment/:assignmentId', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM user_company_assignments WHERE id = $1', [req.params.assignmentId]);
  res.json({ success: true, message: 'Company assignment removed' });
});

export default router;
