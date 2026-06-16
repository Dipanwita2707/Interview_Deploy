"use client";

export type SessionUploadType =
  | "recording"
  | "screenshot"
  | "camera-recording"
  | "screen-recording";

export type SessionUploadMetadata =
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

export interface SessionUploadSuccess {
  id: string;
  sessionId: string;
  uploadType: SessionUploadType;
  url: string;
  path: string;
  bucket: string;
  metadata: SessionUploadMetadata;
}

interface EnqueueSessionUploadOptions {
  sessionId: string;
  uploadType: SessionUploadType;
  filename: string;
  blob: Blob;
  metadata: SessionUploadMetadata;
  delayMs?: number;
}

type WorkerResponse =
  | { type: "uploaded"; payload: SessionUploadSuccess }
  | { type: "failed"; payload: { id: string; error: string } };

const DEFAULT_DELAY_MS = 8_000;
let uploadWorker: Worker | null = null;
const pendingUploads = new Map<
  string,
  {
    resolve: (value: SessionUploadSuccess) => void;
    reject: (reason?: unknown) => void;
  }
>();

function getUploadWorker(): Worker | null {
  if (typeof window === "undefined" || !("Worker" in window)) return null;
  if (uploadWorker) return uploadWorker;

  uploadWorker = new Worker(
    new URL("../workers/session-upload-worker.ts", import.meta.url),
    { type: "module" },
  );
  uploadWorker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === "uploaded") {
      const pending = pendingUploads.get(message.payload.id);
      pending?.resolve(message.payload);
      pendingUploads.delete(message.payload.id);
      return;
    }

    if (message.type === "failed") {
      const pending = pendingUploads.get(message.payload.id);
      pending?.reject(new Error(message.payload.error));
      pendingUploads.delete(message.payload.id);
    }
  };
  return uploadWorker;
}

async function persistUpload(result: SessionUploadSuccess): Promise<void> {
  const res = await fetch("/api/session/recording-artifact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: result.sessionId,
      upload: {
        url: result.url,
        path: result.path,
        bucket: result.bucket,
      },
      metadata: result.metadata,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}

async function uploadWithoutWorker(
  input: EnqueueSessionUploadOptions,
  id: string,
): Promise<SessionUploadSuccess> {
  const form = new FormData();
  form.append("file", input.blob, input.filename);
  form.append("sessionId", input.sessionId);
  form.append("type", input.uploadType);
  form.append("filename", input.filename);
  form.append("upsert", "true");

  const res = await fetch("/api/session/upload", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }

  const data = await res.json();
  const result: SessionUploadSuccess = {
    id,
    sessionId: input.sessionId,
    uploadType: input.uploadType,
    url: data.url,
    path: data.path,
    bucket: data.bucket,
    metadata: input.metadata,
  };
  await persistUpload(result);
  return result;
}

export function enqueueSessionUpload(
  input: EnqueueSessionUploadOptions,
): Promise<SessionUploadSuccess> {
  const id = crypto.randomUUID();
  const worker = getUploadWorker();

  if (!worker) {
    return uploadWithoutWorker(input, id);
  }

  return new Promise((resolve, reject) => {
    pendingUploads.set(id, { resolve, reject });
    worker.postMessage({
      type: "enqueue",
      payload: {
        ...input,
        id,
        delayMs: input.delayMs ?? DEFAULT_DELAY_MS,
      },
    });
  });
}
