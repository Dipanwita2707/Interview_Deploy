-- ============================================================
-- Migration 004 — Exam Bridge Integration
--
-- Adds examCompany and examCourse columns to interviews so
-- aural-oss interview templates can be dynamically matched
-- by the coding-platform after exam submission.
-- Also adds a service_api_keys table for machine-to-machine
-- auth (separate from user api_keys).
-- ============================================================

-- ── interviews: exam template matching columns ───────────────
ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS "examCompany"  text,
  ADD COLUMN IF NOT EXISTS "examCourse"   text,
  ADD COLUMN IF NOT EXISTS "examTags"     text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_interviews_exam_company ON interviews ("examCompany");
CREATE INDEX IF NOT EXISTS idx_interviews_exam_course  ON interviews ("examCourse");

-- ── service_api_keys: machine-to-machine auth ────────────────
-- These keys are not tied to a user account; they are used by
-- external services (e.g. coding-platform) to call aural-oss
-- REST endpoints.  Validated in the /api/exam-bridge route.
CREATE TABLE IF NOT EXISTS service_api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  key_hash    text UNIQUE NOT NULL,  -- SHA-256 of the actual key
  "orgId"     uuid REFERENCES organizations(id) ON DELETE CASCADE,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "lastUsedAt" timestamptz
);

CREATE INDEX IF NOT EXISTS idx_service_api_keys_hash ON service_api_keys (key_hash);

-- Allow service keys to be read by org owners/admins (RLS)
ALTER TABLE service_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins can manage service keys"
  ON service_api_keys
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om."workspaceId" = service_api_keys."orgId"
        AND om."userId" = (SELECT auth.uid())
        AND om.role IN ('OWNER', 'ADMIN')
    )
  );

-- ── RPC: create a session pre-seeded with exam metadata ──────
-- Called by the bridge route; creates both a candidate row
-- (with an inviteToken) and links it to a fresh session, all
-- in one atomic transaction.
CREATE OR REPLACE FUNCTION create_exam_bridge_session(
  p_interview_id        uuid,
  p_participant_name    text,
  p_participant_email   text,
  p_participant_metadata jsonb,
  p_mode_used           "InterviewMode" DEFAULT 'CHAT'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite_token text;
  v_candidate_id uuid;
  v_session_id   uuid;
  v_first_q_id   uuid;
BEGIN
  -- Generate a 12-char nanoid-style token (using random hex as fallback)
  v_invite_token := encode(gen_random_bytes(9), 'base64');
  v_invite_token := replace(replace(replace(v_invite_token, '+', 'x'), '/', 'y'), '=', 'z');

  -- First question for this interview
  SELECT id INTO v_first_q_id
  FROM questions
  WHERE "interviewId" = p_interview_id
  ORDER BY "order" ASC
  LIMIT 1;

  -- Insert candidate
  INSERT INTO candidates ("interviewId", name, email, "inviteToken", notes)
  VALUES (p_interview_id, p_participant_name, p_participant_email, v_invite_token,
          'Auto-created via exam bridge')
  RETURNING id INTO v_candidate_id;

  -- Insert session
  INSERT INTO sessions (
    "interviewId", "participantName", "participantEmail",
    "participantMetadata", "modeUsed", "currentQuestionId",
    status, "startedAt", "lastActivityAt"
  )
  VALUES (
    p_interview_id, p_participant_name, p_participant_email,
    p_participant_metadata, p_mode_used, v_first_q_id,
    'IN_PROGRESS', now(), now()
  )
  RETURNING id INTO v_session_id;

  -- Link session back to candidate
  UPDATE candidates SET "sessionId" = v_session_id WHERE id = v_candidate_id;

  RETURN jsonb_build_object(
    'sessionId',    v_session_id,
    'candidateId',  v_candidate_id,
    'inviteToken',  v_invite_token
  );
END;
$$;
