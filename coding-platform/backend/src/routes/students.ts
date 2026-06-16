import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authenticate } from '../middleware/auth';
import * as roadmapService from '../services/roadmap-service';

const router = Router();
router.use(authenticate);

// ─── Roadmap Summary (for SMART integration) ───────────────────
router.get('/:userId/roadmap-summary', async (req: AuthRequest, res: Response) => {
  const summary = await roadmapService.getRoadmapSummary(req.params.userId);
  res.json({ success: true, data: summary });
});

// ─── Performance Summary ───────────────────────────────────────
router.get('/:userId/performance-summary', async (req: AuthRequest, res: Response) => {
  const summary = await roadmapService.getPerformanceSummary(req.params.userId);
  res.json({ success: true, data: summary });
});

export default router;
