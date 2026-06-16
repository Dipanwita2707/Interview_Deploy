import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../types';
import { authenticate, requireStaff } from '../middleware/auth';
import { validate } from '../middleware/validators';
import * as ruleService from '../services/rule-service';

const router = Router();
router.use(authenticate);
router.use(requireStaff);

// ─── Create Rule Template ──────────────────────────────────────
const createRuleSchema = z.object({
  name: z.string().min(3).max(100),
  targetMode: z.enum(['practice', 'exam']),
  company: z.string().optional(),
  role: z.string().optional(),
  packageSlab: z.string().optional(),
  questionCount: z.number().int().positive(),
  difficultyDistribution: z.object({
    low: z.number().int().min(0),
    medium: z.number().int().min(0),
    high: z.number().int().min(0),
  }),
  topicDistribution: z.record(z.number().int().min(0)).optional(),
  durationMinutes: z.number().int().positive(),
  allowedRetakes: z.number().int().min(0),
  shuffleQuestions: z.boolean().default(true),
  roadmapLinkage: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  effectiveFrom: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return val === '' ? undefined : val;
  }, z.string().datetime().optional()),
  effectiveTo: z.preprocess((val) => {
    if (typeof val === 'string' && val.trim() !== '') {
      const date = new Date(val);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
    return val === '' ? undefined : val;
  }, z.string().datetime().optional()),

});

router.post('/', validate(createRuleSchema), async (req: AuthRequest, res: Response) => {
  const result = await ruleService.createRuleTemplate({
    ...req.body,
    effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
    effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : undefined,
    createdBy: req.user!.shadowUserId,
  });
  res.status(201).json({ success: true, data: result });
});

// ─── List Rule Templates ───────────────────────────────────────
router.get('/', async (req: AuthRequest, res: Response) => {
  const { mode } = req.query;
  const templates = await ruleService.listRuleTemplates(mode as string);
  res.json({ success: true, data: templates });
});

export default router;
