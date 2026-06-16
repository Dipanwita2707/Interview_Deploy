-- ────────────────────────────────────────────────────────────────────────────
-- Migration 002: Recording Configuration + Noise Cancellation
--
-- Adds per-interview recording options (voice, video, screen, snapshots)
-- and a noise-cancellation flag.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE interviews
  ADD COLUMN IF NOT EXISTS "recordingConfig" jsonb NOT NULL
    DEFAULT '{"voiceRecording":true,"videoRecording":false,"screenRecording":false,"cameraSnapshot":false,"screenSnapshot":false}'::jsonb,
  ADD COLUMN IF NOT EXISTS "noiseCancellationEnabled" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN interviews."recordingConfig" IS
  'Granular recording options: voiceRecording, videoRecording, screenRecording, cameraSnapshot, screenSnapshot';

COMMENT ON COLUMN interviews."noiseCancellationEnabled" IS
  'When true, enhanced noise suppression is applied to the candidate microphone stream';
