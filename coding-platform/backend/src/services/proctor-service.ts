import { v4 as uuidv4 } from 'uuid';
import { query } from '../database/connection';
import { ProctorIncidentType } from '../types';
import { AppError } from '../utils/app-error';

// ─── Create Proctor Session ────────────────────────────────────
export async function createProctorSession(examAttemptId: string) {
  // Check for existing session first (idempotent — start is called on every page load)
  const existing = await query(
    `SELECT id FROM proctor_sessions WHERE exam_attempt_id = $1`,
    [examAttemptId]
  );
  if (existing.rows.length > 0) {
    return { sessionId: existing.rows[0].id };
  }

  const sessionId = uuidv4();
  await query(
    `INSERT INTO proctor_sessions (id, exam_attempt_id, started_at, created_at)
     VALUES ($1, $2, NOW(), NOW())
     ON CONFLICT (exam_attempt_id) DO NOTHING`,
    [sessionId, examAttemptId]
  );

  // Re-fetch in case the ON CONFLICT path won the race
  const row = await query(
    `SELECT id FROM proctor_sessions WHERE exam_attempt_id = $1`,
    [examAttemptId]
  );
  return { sessionId: row.rows[0]?.id ?? sessionId };
}

// ─── End Proctor Session ───────────────────────────────────────
export async function endProctorSession(sessionId: string) {
  await query(
    `UPDATE proctor_sessions SET ended_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}

// ─── Record Proctor Event ──────────────────────────────────────
export async function recordProctorEvent(params: {
  sessionId: string;
  incidentType: ProctorIncidentType;
  evidenceUrl?: string;
  metadata?: object;
}) {
  const eventId = uuidv4();

  await query(
    `INSERT INTO proctor_events (id, session_id, incident_type, evidence_url, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [eventId, params.sessionId, params.incidentType, params.evidenceUrl || null, params.metadata ? JSON.stringify(params.metadata) : null]
  );

  // Check if threshold exceeded — auto-flag
  // Only count high-severity incidents (tab switches + suspicious windows; ignore transient focus loss)
  const countResult = await query(
    `SELECT COUNT(*) AS cnt FROM proctor_events
     WHERE session_id = $1
       AND incident_type IN ('tab_switch', 'suspicious_window', 'devtools_open')`,
    [params.sessionId]
  );
  const count = parseInt(countResult.rows[0].cnt);

  // Auto-flag after 10 serious violations
  if (count >= 10) {
    const sessionResult = await query(
      `SELECT exam_attempt_id FROM proctor_sessions WHERE id = $1`,
      [params.sessionId]
    );
    if (sessionResult.rows.length > 0) {
      await query(
        `UPDATE exam_attempts SET state = 'flagged', updated_at = NOW()
         WHERE id = $1 AND state NOT IN ('flagged', 'reviewed')`,
        [sessionResult.rows[0].exam_attempt_id]
      );
    }
  }

  return { eventId };
}

// ─── Get Proctor Session with Events ───────────────────────────
export async function getProctorSession(examAttemptId: string) {
  const sessionResult = await query(
    `SELECT * FROM proctor_sessions WHERE exam_attempt_id = $1`,
    [examAttemptId]
  );
  if (sessionResult.rows.length === 0) return null;

  const session = sessionResult.rows[0];
  const eventsResult = await query(
    `SELECT * FROM proctor_events WHERE session_id = $1 ORDER BY created_at`,
    [session.id]
  );

  return {
    ...session,
    events: eventsResult.rows,
  };
}
