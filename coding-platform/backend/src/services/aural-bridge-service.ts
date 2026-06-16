import axios from 'axios';
import { config } from '../config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BridgeResult {
  sessionId: string;
  inviteToken: string;
  sessionUrl: string;
  interviewId: string;
}

// ─── Create Interview Session in aural-oss ─────────────────────────────────────
// Called immediately after a student submits their exam.  Returns the invite
// token and full URL the student should be redirected to.

export async function createAuralSession(params: {
  studentName: string;
  studentEmail: string;
  examAttemptId: string;
  examScore: number;
  weakTopics: string[];
  submissionSummary: Array<{
    questionTitle: string;
    verdict: string;
    score: number;
    topics: string[];
    language?: string;
    submittedAnswerExcerpt?: string;
  }>;
  company?: string;
  course?: string;
}): Promise<BridgeResult> {
  const bridgeUrl = config.auralOss.bridgeUrl; // e.g. https://aural.example.com/api/exam-bridge
  const apiKey   = config.auralOss.serviceApiKey;

  if (!bridgeUrl || !apiKey) {
    throw new Error('aural-oss bridge not configured (AURAL_OSS_BRIDGE_URL / AURAL_OSS_SERVICE_KEY)');
  }

  const response = await axios.post<BridgeResult>(
    bridgeUrl,
    params,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return response.data;
}

// ─── Fetch session detail (for admin panel) ───────────────────────────────────

export interface AuralSessionDetail {
  id: string;
  status: string;
  summary: string | null;
  insights: unknown;
  themes: string[];
  sentiment: unknown;
  totalDurationSeconds: number | null;
  completedAt: string | null;
  participantMetadata: Record<string, unknown> | null;
}

export async function getAuralSessionDetail(
  sessionId: string
): Promise<AuralSessionDetail | null> {
  const bridgeUrl = config.auralOss.bridgeUrl;
  const apiKey   = config.auralOss.serviceApiKey;

  if (!bridgeUrl || !apiKey) return null;

  try {
    const baseUrl = bridgeUrl.replace('/api/exam-bridge', '');
    const response = await axios.get<{ session: AuralSessionDetail }>(
      `${baseUrl}/api/exam-bridge?sessionId=${encodeURIComponent(sessionId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 10000,
      }
    );
    return response.data.session ?? null;
  } catch {
    return null;
  }
}

// ─── Refresh session participantMetadata (e.g. add source code excerpts) ──────

export async function refreshAuralSessionMetadata(params: {
  sessionId: string;
  examAttemptId: string;
  examScore: number;
  weakTopics: string[];
  submissionSummary: Array<{
    questionTitle: string;
    verdict: string;
    score: number;
    topics: string[];
    language?: string;
    submittedAnswerExcerpt?: string;
  }>;
  company?: string;
  course?: string;
}): Promise<boolean> {
  const bridgeUrl = config.auralOss.bridgeUrl;
  const apiKey   = config.auralOss.serviceApiKey;

  if (!bridgeUrl || !apiKey) return false;

  try {
    await axios.patch(
      bridgeUrl,
      {
        sessionId: params.sessionId,
        participantMetadata: {
          source: 'coding-platform',
          examAttemptId: params.examAttemptId,
          examScore: params.examScore,
          weakTopics: params.weakTopics,
          submissionSummary: params.submissionSummary,
          company: params.company ?? null,
          course: params.course ?? null,
          refreshedAt: new Date().toISOString(),
        },
      },
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );
    return true;
  } catch {
    return false;
  }
}
