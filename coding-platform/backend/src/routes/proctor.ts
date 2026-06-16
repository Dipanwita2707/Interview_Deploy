import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, ProctorIncidentType } from '../types';
import * as proctorService from '../services/proctor-service';

const router = Router();

// ─── Proctor Webhook — Receive Events ──────────────────────────
// This endpoint is called by the proctoring service, not by users directly
const eventSchema = z.object({
  sessionId: z.string().uuid(),
  incidentType: z.nativeEnum(ProctorIncidentType),
  evidenceUrl: z.string().url().optional(),
  metadata: z.record(z.any()).optional(),
});

router.post('/webhooks/events', async (req, res: Response) => {
  // TODO: Validate webhook signature from proctoring service
  const { sessionId, incidentType, evidenceUrl, metadata } = req.body;

  const result = await proctorService.recordProctorEvent({
    sessionId,
    incidentType,
    evidenceUrl,
    metadata,
  });

  res.json({ success: true, data: result });
});

export default router;
