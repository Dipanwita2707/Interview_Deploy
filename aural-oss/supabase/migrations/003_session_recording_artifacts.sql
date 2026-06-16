-- ────────────────────────────────────────────────────────────────────────────
-- Migration 003: Session Recording Artifacts
--
-- Stores modular recording outputs for interview sessions.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS "recordingArtifacts" jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN sessions."recordingArtifacts" IS
  'Recorded artifacts such as audio, camera video, screen video, and future capture outputs';
