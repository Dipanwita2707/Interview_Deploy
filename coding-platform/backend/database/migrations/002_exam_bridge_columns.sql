-- ============================================================
-- Migration: Exam Bridge columns on exam_attempts
--
-- Adds columns to track the aural-oss interview session that
-- was created when this exam attempt was submitted.
-- aural_reentry_count caps re-entry at 5 per attempt.
-- ============================================================

ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS aural_session_id   TEXT,
  ADD COLUMN IF NOT EXISTS aural_interview_id TEXT,
  ADD COLUMN IF NOT EXISTS aural_session_url  TEXT,
  ADD COLUMN IF NOT EXISTS aural_invite_token TEXT,
  ADD COLUMN IF NOT EXISTS aural_reentry_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ea_aural_session ON exam_attempts (aural_session_id)
  WHERE aural_session_id IS NOT NULL;
