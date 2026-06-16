"use client";

import { createLogger } from "@/lib/logger";
import {
    getStoredCameraStream,
    getStoredScreenStream,
    setStoredCameraStream,
    setStoredScreenStream,
    wasCameraSkipped,
    wasScreenSkipped,
} from "@/lib/media-stream-store";
import {
    DEFAULT_RECORDING_CONFIG,
    needsCameraStream,
    needsScreenStream,
    type RecordingConfig,
} from "@/lib/recording-config";
import { enqueueSessionUpload, type SessionUploadType } from "@/lib/session-upload-worker-client";
import fixWebmDuration from "fix-webm-duration";
import { useCallback, useEffect, useRef, useState } from "react";

const log = createLogger("recording");

export interface ScreenshotEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "camera" | "screen";
}

export interface RecordingArtifactEntry {
  url: string;
  path: string;
  timestamp: string;
  type: "audio" | "camera_video" | "screen_video";
  mimeType?: string;
}

interface UseInterviewRecordingOptions {
  sessionId: string;
  enabled: boolean;
  screenshotIntervalMs?: number;
  /** Granular recording feature flags — defaults to DEFAULT_RECORDING_CONFIG */
  recordingConfig?: RecordingConfig;
  /** When true, enhanced noise suppression is requested from getUserMedia */
  noiseCancellationEnabled?: boolean;
}

/**
 * Resolve the actual playable duration of a WebM audio blob.
 * WebM files from MediaRecorder often have Infinity/missing duration;
 * the seek-to-end trick forces the browser to compute it.
 */
function resolveBlobDuration(blob: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) { resolved = true; cleanup(); resolve(undefined); }
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    }

    function finish(dur: number) {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(Math.round(dur));
    }

    audio.addEventListener("durationchange", () => {
      if (audio.duration && isFinite(audio.duration)) {
        finish(audio.duration);
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && isFinite(audio.duration)) {
        finish(audio.duration);
      } else {
        audio.currentTime = 1e10;
      }
    });

    audio.preload = "auto";
    audio.src = url;
  });
}

/**
 * Manages audio recording (combined mic + TTS), camera/screen streams,
 * and periodic screenshot capture during a voice interview.
 *
 * Audio mixing strategy:
 *   - A single AudioContext drives a MediaStreamAudioDestinationNode.
 *   - The mic MediaStream is piped in via createMediaStreamSource.
 *   - TTS PCM chunks (float32 @ 24 kHz) are decoded into AudioBuffers
 *     and played into the same destination via BufferSourceNodes.
 *   - MediaRecorder records the destination's combined stream as webm/opus.
 */
export function useInterviewRecording({
  sessionId,
  enabled,
  screenshotIntervalMs = 60_000,
  recordingConfig = DEFAULT_RECORDING_CONFIG,
}: UseInterviewRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);

  // Refs for recording infrastructure
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioMimeRef = useRef<string>("");
  const cameraRecorderRef = useRef<MediaRecorder | null>(null);
  const cameraChunksRef = useRef<Blob[]>([]);
  const cameraMimeRef = useRef<string>("");
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenChunksRef = useRef<Blob[]>([]);
  const screenMimeRef = useRef<string>("");
  const mixCtxRef = useRef<AudioContext | null>(null);
  const mixDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const screenshotTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenshotsRef = useRef<ScreenshotEntry[]>([]);
  const artifactsRef = useRef<RecordingArtifactEntry[]>([]);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const ttsPlayTimeRef = useRef(0);
  const ttsSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Keep refs in sync with state
  useEffect(() => { cameraStreamRef.current = cameraStream; }, [cameraStream]);
  useEffect(() => { screenStreamRef.current = screenStream; }, [screenStream]);

  /** Acquire camera and screen streams, reusing stored streams from onboarding. */
  const acquireStreams = useCallback(async () => {
    // Camera: only if videoRecording or cameraSnapshot is enabled
    if (needsCameraStream(recordingConfig)) {
      const storedCam = getStoredCameraStream();
      if (storedCam) {
        setCameraStream(storedCam);
        cameraStreamRef.current = storedCam;
        setStoredCameraStream(null);
      } else if (!wasCameraSkipped()) {
        try {
          const cam = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: 640, height: 480 },
          });
          setCameraStream(cam);
          cameraStreamRef.current = cam;
        } catch (err) {
          log.warn("Camera not available:", err);
        }
      }
    }

    // Screen share: only if screenRecording or screenSnapshot is enabled
    if (needsScreenStream(recordingConfig)) {
      const storedScreen = getStoredScreenStream();
      if (storedScreen) {
        setScreenStream(storedScreen);
        screenStreamRef.current = storedScreen;
        setStoredScreenStream(null);
        storedScreen.getVideoTracks()[0]?.addEventListener("ended", () => {
          setScreenStream(null);
          screenStreamRef.current = null;
        });
      } else if (!wasScreenSkipped()) {
        try {
          const screen = await navigator.mediaDevices.getDisplayMedia({
            video: true,
          });
          setScreenStream(screen);
          screenStreamRef.current = screen;
          screen.getVideoTracks()[0]?.addEventListener("ended", () => {
            setScreenStream(null);
            screenStreamRef.current = null;
          });
        } catch (err) {
          log.warn("Screen share not available:", err);
        }
      }
    }
  }, [recordingConfig]);

  /** Pipe a mic MediaStream into the recording mixer. */
  const attachMicStream = useCallback((micStream: MediaStream) => {
    const ctx = mixCtxRef.current;
    if (!ctx || !mixDestRef.current) return;

    // Disconnect previous mic source if any
    try { micSourceRef.current?.disconnect(); } catch { /* noop */ }

    const source = ctx.createMediaStreamSource(micStream);
    source.connect(mixDestRef.current);
    micSourceRef.current = source;
  }, []);

  /**
   * Feed a TTS PCM chunk (float32 @ 24 kHz) into the recording mixer.
   * Chunks are scheduled sequentially to avoid overlapping audio.
   */
  const addTtsChunk = useCallback((pcmData: ArrayBuffer) => {
    const ctx = mixCtxRef.current;
    const dest = mixDestRef.current;
    if (!ctx || !dest || pcmData.byteLength === 0) return;

    const float32 = new Float32Array(pcmData);
    const sampleRate = 24000;
    const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(dest);

    const startAt = Math.max(ctx.currentTime, ttsPlayTimeRef.current);
    source.start(startAt);
    ttsPlayTimeRef.current = startAt + audioBuffer.duration;

    ttsSourcesRef.current.push(source);
    source.onended = () => {
      ttsSourcesRef.current = ttsSourcesRef.current.filter((s) => s !== source);
    };
  }, []);

  /**
   * Cancel all scheduled TTS sources in the recording mixer.
   * Must be called when the user interrupts the agent so the recording
   * only contains audio that was actually heard.
   */
  const cancelTts = useCallback(() => {
    for (const source of ttsSourcesRef.current) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    ttsSourcesRef.current = [];
    ttsPlayTimeRef.current = 0;
  }, []);

  const stageUpload = useCallback(
    async (
      blob: Blob,
      options: {
        uploadType: SessionUploadType;
        filename: string;
        delayMs?: number;
        metadata:
          | {
              kind: "screenshot";
              timestamp: string;
              screenshotType: "camera" | "screen";
            }
          | {
              kind: "artifact";
              timestamp: string;
              artifactType: "audio" | "camera_video" | "screen_video";
              mimeType?: string;
              audioDuration?: number;
            };
      },
    ): Promise<{ url: string; path: string } | null> => {
      try {
        const data = await enqueueSessionUpload({
          sessionId,
          blob,
          uploadType: options.uploadType,
          filename: options.filename,
          metadata: options.metadata,
          delayMs: options.delayMs,
        });
        return { url: data.url, path: data.path };
      } catch (err) {
        log.error("Background upload failed:", options.uploadType, err);
        return null;
      }
    },
    [sessionId],
  );

  /** Capture a screenshot from a video element and upload it. */
  const captureAndUpload = useCallback(
    async (video: HTMLVideoElement, type: "camera" | "screen") => {
      if (video.readyState < 2 || video.videoWidth === 0) return;

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;

      if (type === "camera") {
        ctx2d.translate(canvas.width, 0);
        ctx2d.scale(-1, 1);
      }
      ctx2d.drawImage(video, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7),
      );
      if (!blob) return;

      const timestamp = new Date().toISOString();
      const filename = `${timestamp.replace(/[:.]/g, "-")}-${type}.jpg`;

      void stageUpload(blob, {
        uploadType: "screenshot",
        filename,
        delayMs: 12_000,
        metadata: {
          kind: "screenshot",
          timestamp,
          screenshotType: type,
        },
      }).then((data) => {
        if (!data) return;
        screenshotsRef.current.push({
          url: data.url,
          path: data.path,
          timestamp,
          type,
        });
        log.info(`Screenshot uploaded: ${type}`);
      }).catch((err) => {
        log.error("Screenshot upload failed:", err);
      });
    },
    [stageUpload],
  );

  /** Take screenshots from enabled streams. */
  const takeScreenshots = useCallback(() => {
    if (recordingConfig.cameraSnapshot && cameraVideoRef.current && cameraStreamRef.current) {
      captureAndUpload(cameraVideoRef.current, "camera");
    }
    if (recordingConfig.screenSnapshot && screenVideoRef.current && screenStreamRef.current) {
      captureAndUpload(screenVideoRef.current, "screen");
    }
  }, [captureAndUpload, recordingConfig]);

  /** Start recording audio and periodic screenshots. */
  const start = useCallback(
    async (micStream?: MediaStream) => {
      if (!enabled || isRecording) return;
      stoppedRef.current = false;
      ttsPlayTimeRef.current = 0;
      screenshotsRef.current = [];
      artifactsRef.current = [];
      chunksRef.current = [];
      cameraChunksRef.current = [];
      screenChunksRef.current = [];

      // Create mixing AudioContext and destination
      const ctx = new AudioContext();
      mixCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      mixDestRef.current = dest;

      // Attach mic if provided
      if (micStream) {
        attachMicStream(micStream);
      }

      // Start MediaRecorder for voice/audio — only if voiceRecording is enabled
      chunksRef.current = [];
      if (recordingConfig.voiceRecording) {
        const preferredMime = ["audio/mp4", "audio/mp4;codecs=aac", "audio/webm;codecs=opus", "audio/webm"]
          .find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
        audioMimeRef.current = preferredMime;
        log.info("Recording MIME:", preferredMime || "(default)");
        const recorder = new MediaRecorder(dest.stream, {
          ...(preferredMime ? { mimeType: preferredMime } : {}),
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.start(5000); // collect chunks every 5s
        recorderRef.current = recorder;
      } else {
        log.info("Voice recording disabled — skipping MediaRecorder");
      }

      // Acquire camera + screen
      await acquireStreams();

      if (recordingConfig.videoRecording && cameraStreamRef.current) {
        cameraChunksRef.current = [];
        const preferredMime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
          .find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
        cameraMimeRef.current = preferredMime;
        const recorder = new MediaRecorder(cameraStreamRef.current, {
          ...(preferredMime ? { mimeType: preferredMime } : {}),
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) cameraChunksRef.current.push(e.data);
        };
        recorder.start(5000);
        cameraRecorderRef.current = recorder;
      }

      if (recordingConfig.screenRecording && screenStreamRef.current) {
        screenChunksRef.current = [];
        const preferredMime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"]
          .find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
        screenMimeRef.current = preferredMime;
        const recorder = new MediaRecorder(screenStreamRef.current, {
          ...(preferredMime ? { mimeType: preferredMime } : {}),
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) screenChunksRef.current.push(e.data);
        };
        recorder.start(5000);
        screenRecorderRef.current = recorder;
      }

      // Set up hidden video elements for screenshot capture
      if (!cameraVideoRef.current) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.style.display = "none";
        document.body.appendChild(v);
        cameraVideoRef.current = v;
      }
      if (!screenVideoRef.current) {
        const v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        v.style.display = "none";
        document.body.appendChild(v);
        screenVideoRef.current = v;
      }

      // Bind streams to hidden video elements for canvas capture
      const bindStream = (video: HTMLVideoElement, stream: MediaStream | null) => {
        if (stream) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }
      };
      // Use refs (set in acquireStreams via state update + useEffect sync)
      // Small delay to let state sync
      setTimeout(() => {
        bindStream(cameraVideoRef.current!, cameraStreamRef.current);
        bindStream(screenVideoRef.current!, screenStreamRef.current);
      }, 500);

      // Start periodic screenshot timer
      screenshotTimerRef.current = setInterval(takeScreenshots, screenshotIntervalMs);

      setIsRecording(true);
      log.info("Started");
    },
    [
      enabled,
      isRecording,
      acquireStreams,
      attachMicStream,
      takeScreenshots,
      screenshotIntervalMs,
      recordingConfig.screenRecording,
      recordingConfig.videoRecording,
      recordingConfig.voiceRecording,
    ],
  );

  /**
   * Stop recording. Uploads the audio blob and returns recording metadata.
   * Returns the list of screenshot entries.
   */
  const stop = useCallback(async (): Promise<{
    audioUrl?: string;
    audioDuration?: number;
    screenshots: ScreenshotEntry[];
    artifacts: RecordingArtifactEntry[];
  }> => {
    if (stoppedRef.current) {
      return { screenshots: screenshotsRef.current, artifacts: artifactsRef.current };
    }
    stoppedRef.current = true;

    // Stop screenshot timer
    if (screenshotTimerRef.current) {
      clearInterval(screenshotTimerRef.current);
      screenshotTimerRef.current = null;
    }

    // Take one final set of screenshots
    takeScreenshots();

    // Stop MediaRecorder and collect audio
    let audioUrl: string | undefined;
    let audioDuration: number | undefined;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      const mime = audioMimeRef.current || "audio/webm";
      const isWebm = mime.includes("webm");
      const ext = isWebm ? "webm" : "m4a";
      const rawBlob = new Blob(chunksRef.current, { type: mime });
      if (rawBlob.size > 0) {
        audioDuration = await resolveBlobDuration(rawBlob);

        // Patch WebM container with correct duration so players can display it
        const audioBlob = (isWebm && audioDuration)
          ? await fixWebmDuration(rawBlob, audioDuration * 1000)
          : rawBlob;

        const timestamp = new Date().toISOString();
        const fname = `recording-${Date.now()}.${ext}`;
        void stageUpload(audioBlob, {
          uploadType: "recording",
          filename: fname,
          delayMs: 1_000,
          metadata: {
            kind: "artifact",
            timestamp,
            artifactType: "audio",
            mimeType: mime,
            audioDuration,
          },
        }).then((data) => {
          if (!data) return;
          audioUrl = data.url;
          artifactsRef.current.push({
            url: data.url,
            path: data.path,
            timestamp,
            type: "audio",
            mimeType: mime,
          });
          log.info("Audio uploaded:", audioUrl);
        }).catch((err) => {
          log.error("Audio upload failed:", err);
        });
      }
    }

    const stopVideoRecorder = async (
      recorder: MediaRecorder | null,
      chunksRefForRecorder: { current: Blob[] },
      mime: string,
      uploadType: "camera-recording" | "screen-recording",
      artifactType: "camera_video" | "screen_video",
    ) => {
      if (!recorder || recorder.state === "inactive") return;
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      const ext = mime.includes("mp4") ? "mp4" : "webm";
      const blob = new Blob(chunksRefForRecorder.current, { type: mime || `video/${ext}` });
      if (blob.size === 0) return;
      const timestamp = new Date().toISOString();
      const filename = `${artifactType}-${Date.now()}.${ext}`;
      void stageUpload(blob, {
        uploadType,
        filename,
        delayMs: 1_000,
        metadata: {
          kind: "artifact",
          timestamp,
          artifactType,
          mimeType: mime || `video/${ext}`,
        },
      }).then((uploaded) => {
        if (!uploaded) return;
        artifactsRef.current.push({
          url: uploaded.url,
          path: uploaded.path,
          timestamp,
          type: artifactType,
          mimeType: mime || `video/${ext}`,
        });
      }).catch((err) => {
        log.error(`${artifactType} upload failed:`, err);
      });
    };

    await stopVideoRecorder(
      cameraRecorderRef.current,
      cameraChunksRef,
      cameraMimeRef.current,
      "camera-recording",
      "camera_video",
    );
    await stopVideoRecorder(
      screenRecorderRef.current,
      screenChunksRef,
      screenMimeRef.current,
      "screen-recording",
      "screen_video",
    );

    // Disconnect mic source
    try { micSourceRef.current?.disconnect(); } catch { /* noop */ }
    micSourceRef.current = null;

    // Close mix context
    try { mixCtxRef.current?.close(); } catch { /* noop */ }
    mixCtxRef.current = null;
    mixDestRef.current = null;
    recorderRef.current = null;
    cameraRecorderRef.current = null;
    screenRecorderRef.current = null;

    // Stop camera/screen tracks
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setScreenStream(null);

    // Clean up hidden video elements
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
      cameraVideoRef.current.remove();
      cameraVideoRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
      screenVideoRef.current.remove();
      screenVideoRef.current = null;
    }

    setIsRecording(false);
    log.info("Stopped");

    return {
      audioUrl,
      audioDuration,
      screenshots: screenshotsRef.current,
      artifacts: artifactsRef.current,
    };
  }, [stageUpload, takeScreenshots]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (screenshotTimerRef.current) clearInterval(screenshotTimerRef.current);
      try { recorderRef.current?.stop(); } catch { /* noop */ }
      try { cameraRecorderRef.current?.stop(); } catch { /* noop */ }
      try { screenRecorderRef.current?.stop(); } catch { /* noop */ }
      try { micSourceRef.current?.disconnect(); } catch { /* noop */ }
      try { mixCtxRef.current?.close(); } catch { /* noop */ }
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (cameraVideoRef.current) { cameraVideoRef.current.remove(); cameraVideoRef.current = null; }
      if (screenVideoRef.current) { screenVideoRef.current.remove(); screenVideoRef.current = null; }
    };
  }, []);

  return {
    start,
    stop,
    addTtsChunk,
    cancelTts,
    attachMicStream,
    cameraStream,
    screenStream,
    isRecording,
    screenshots: screenshotsRef,
    artifacts: artifactsRef,
  };
}
