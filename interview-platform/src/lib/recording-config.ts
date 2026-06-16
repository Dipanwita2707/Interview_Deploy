import { z } from "zod";

/**
 * Granular per-interview recording configuration.
 *
 * Each option is independent — interviewers can mix any combination.
 * Stored as JSONB in the `interviews.recordingConfig` column.
 */
export const RecordingConfigSchema = z.object({
  /** Record combined mic + AI TTS audio for the session */
  voiceRecording: z.boolean().default(true),
  /** Capture the candidate's camera as a video recording */
  videoRecording: z.boolean().default(false),
  /** Capture the candidate's screen as a video recording */
  screenRecording: z.boolean().default(false),
  /** Periodically take snapshots from the candidate's camera */
  cameraSnapshot: z.boolean().default(false),
  /** Periodically take snapshots from the candidate's screen share */
  screenSnapshot: z.boolean().default(false),
});

export type RecordingConfig = z.infer<typeof RecordingConfigSchema>;

/** Default when no recordingConfig is saved on the interview */
export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  voiceRecording: true,
  videoRecording: false,
  screenRecording: false,
  cameraSnapshot: false,
  screenSnapshot: false,
};

/**
 * Returns true if any recording or snapshot mode requires a camera stream.
 */
export function needsCameraStream(cfg: RecordingConfig): boolean {
  return cfg.videoRecording || cfg.cameraSnapshot;
}

/**
 * Returns true if any recording or snapshot mode requires a screen share stream.
 */
export function needsScreenStream(cfg: RecordingConfig): boolean {
  return cfg.screenRecording || cfg.screenSnapshot;
}

/**
 * Returns true if any recording/snapshot feature is enabled at all.
 */
export function isAnyRecordingEnabled(cfg: RecordingConfig): boolean {
  return (
    cfg.voiceRecording ||
    cfg.videoRecording ||
    cfg.screenRecording ||
    cfg.cameraSnapshot ||
    cfg.screenSnapshot
  );
}

/** Parse an unknown value (from DB JSONB) into a valid RecordingConfig. */
export function parseRecordingConfig(raw: unknown): RecordingConfig {
  const result = RecordingConfigSchema.safeParse(raw ?? {});
  return result.success ? result.data : DEFAULT_RECORDING_CONFIG;
}
