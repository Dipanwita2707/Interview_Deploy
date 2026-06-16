import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, CodingRole, QuestionDifficulty, QuestionStatus } from '../types';
import { authenticate, requireStaff, requireHead } from '../middleware/auth';
import { validate } from '../middleware/validators';
import * as questionService from '../services/question-service';

const router = Router();

// All question routes require authentication + staff role
router.use(authenticate);

// ─── Create Question Draft ─────────────────────────────────────
const createQuestionSchema = z.object({
  title: z.string().min(3).max(200),
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/),
  problemStatement: z.string().min(10),
  inputFormat: z.string().min(1),
  outputFormat: z.string().min(1),
  constraints: z.string().min(1),
  examples: z.array(z.object({
    input: z.string(),
    output: z.string(),
    explanation: z.string().optional(),
  })).min(1),
  explanations: z.string().optional(),
  difficulty: z.nativeEnum(QuestionDifficulty),
  topicTags: z.array(z.string()).min(1),
  sourceCompany: z.string().optional(),
  courseId: z.string().optional(),
  courseName: z.string().optional(),
  roleSpecificity: z.string().optional(),
  packageSlabSpecificity: z.string().optional(),
  isCompanySpecific: z.boolean().default(false),
  timeLimitMs: z.number().positive().optional(),
  memoryLimitKb: z.number().positive().optional(),
  supportedLanguages: z.array(z.string()).min(1),
});

router.post('/', requireStaff, validate(createQuestionSchema), async (req: AuthRequest, res: Response) => {
  const result = await questionService.createQuestion(req.body, req.user!.shadowUserId);
  res.status(201).json({ success: true, data: result });
});

// ─── Add Test Cases to a Version ───────────────────────────────
const testCasesSchema = z.object({
  testCases: z.array(z.object({
    input: z.string(),
    expectedOutput: z.string(),
    isPublic: z.boolean(),
    explanation: z.string().optional(),
    orderIndex: z.number().int().min(0),
  })).min(1),
});

router.post('/:versionId/test-cases', requireStaff, validate(testCasesSchema), async (req: AuthRequest, res: Response) => {
  await questionService.addTestCases(req.params.versionId, req.body.testCases);
  res.json({ success: true, message: 'Test cases added' });
});

// ─── Add Starter Code to a Version ─────────────────────────────
const starterCodeSchema = z.object({
  starterCodes: z.array(z.object({
    languageId: z.string(),
    code: z.string(),
  })).min(1),
});

router.post('/:versionId/starter-code', requireStaff, validate(starterCodeSchema), async (req: AuthRequest, res: Response) => {
  await questionService.addStarterCode(req.params.versionId, req.body.starterCodes);
  res.json({ success: true, message: 'Starter code added' });
});

// ─── Update Draft ──────────────────────────────────────────────
router.put('/:versionId/draft', requireStaff, async (req: AuthRequest, res: Response) => {
  await questionService.updateDraft(req.params.versionId, req.body);
  res.json({ success: true, message: 'Draft updated' });
});

// ─── Get Question by Version ID ──────────────────────────────
router.get('/version/:versionId', async (req: AuthRequest, res: Response) => {
  const question = await questionService.getQuestionByVersionId(req.params.versionId);
  res.json({ success: true, data: question });
});

// ─── Get Question ──────────────────────────────────────────────
router.get('/:questionId', async (req: AuthRequest, res: Response) => {
  const question = await questionService.getQuestionById(req.params.questionId);
  res.json({ success: true, data: question });
});

// ─── List Questions ────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const { status, difficulty, topic, company, page, limit } = req.query;

  // placement_member sees only questions in their assigned courses/companies
  const staffUserId = req.user?.role === CodingRole.PLACEMENT_MEMBER
    ? (req.user.shadowUserId || req.user.userId)
    : undefined;

  const questions = await questionService.listQuestions({
    status: status as QuestionStatus,
    difficulty: difficulty as QuestionDifficulty,
    topic: topic as string,
    company: company as string,
    page: page ? parseInt(page as string) : 1,
    limit: limit ? parseInt(limit as string) : 20,
    staffUserId,
  });
  res.json({ success: true, data: questions });
});

// ─── Approve Question (Head only) ──────────────────────────────
router.post('/:versionId/approve', requireHead, async (req: AuthRequest, res: Response) => {
  await questionService.approveQuestion(req.params.versionId, req.user!.shadowUserId);
  res.json({ success: true, message: 'Question approved' });
});

// ─── Reject Question (Head only) ───────────────────────────────
const rejectSchema = z.object({
  remarks: z.string().min(1, 'Rejection remarks are required'),
});

router.post('/:versionId/reject', requireHead, validate(rejectSchema), async (req: AuthRequest, res: Response) => {
  await questionService.rejectQuestion(req.params.versionId, req.user!.shadowUserId, req.body.remarks);
  res.json({ success: true, message: 'Question rejected' });
});

// ─── Publish Question (Head only) ──────────────────────────────
const publishSchema = z.object({
  pools: z.array(z.enum(['practice', 'exam'])).min(1),
});

router.post('/:versionId/publish', requireHead, validate(publishSchema), async (req: AuthRequest, res: Response) => {
  await questionService.publishQuestion(req.params.versionId, req.body.pools, req.user!.shadowUserId);
  res.json({ success: true, message: 'Question published' });
});

export default router;
