type SessionUploadType =
  | "recording"
  | "screenshot"
  | "camera-recording"
  | "screen-recording";

type SessionUploadMetadata =
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

interface QueuedUpload {
  id: string;
  sessionId: string;
  uploadType: SessionUploadType;
  filename: string;
  blob: Blob;
  metadata: SessionUploadMetadata;
  createdAt: number;
  nextAttemptAt: number;
  attempts: number;
  uploaded?: {
    url: string;
    path: string;
    bucket: string;
  };
}

interface EnqueueMessage {
  type: "enqueue";
  payload: Omit<QueuedUpload, "createdAt" | "nextAttemptAt" | "attempts"> & {
    delayMs: number;
  };
}

const DB_NAME = "aural-session-upload-queue";
const DB_VERSION = 1;
const STORE_NAME = "uploads";
const MAX_ATTEMPTS = 5;
const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;
let processing = false;
let processTimer: ReturnType<typeof setTimeout> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllUploads(): Promise<QueuedUpload[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readonly");
  return requestToPromise(tx.objectStore(STORE_NAME).getAll());
}

async function putUpload(upload: QueuedUpload): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await requestToPromise(tx.objectStore(STORE_NAME).put(upload));
}

async function deleteUpload(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await requestToPromise(tx.objectStore(STORE_NAME).delete(id));
}

function buildResult(upload: QueuedUpload) {
  if (!upload.uploaded) {
    throw new Error("Upload result is missing");
  }
  return {
    id: upload.id,
    sessionId: upload.sessionId,
    uploadType: upload.uploadType,
    url: upload.uploaded.url,
    path: upload.uploaded.path,
    bucket: upload.uploaded.bucket,
    metadata: upload.metadata,
  };
}

async function uploadBlob(upload: QueuedUpload): Promise<QueuedUpload> {
  if (upload.uploaded) return upload;

  if (upload.blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is too large for background upload (${Math.round(upload.blob.size / 1024 / 1024)}MB)`,
    );
  }

  const form = new FormData();
  form.append("file", upload.blob, upload.filename);
  form.append("sessionId", upload.sessionId);
  form.append("type", upload.uploadType);
  form.append("filename", upload.filename);
  form.append("upsert", "true");

  const res = await fetch("/api/session/upload", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const data = await res.json();
  return {
    ...upload,
    uploaded: {
      url: data.url,
      path: data.path,
      bucket: data.bucket,
    },
  };
}

async function persistUpload(upload: QueuedUpload): Promise<void> {
  const res = await fetch("/api/session/recording-artifact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: upload.sessionId,
      upload: upload.uploaded,
      metadata: upload.metadata,
    }),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}

function scheduleQueue(delayMs = 0): void {
  if (processTimer) clearTimeout(processTimer);
  processTimer = setTimeout(() => {
    processTimer = null;
    void processQueue();
  }, Math.max(0, delayMs));
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  try {
    const now = Date.now();
    const uploads = await getAllUploads();
    const dueUploads = uploads
      .filter((upload) => upload.nextAttemptAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt);

    for (const upload of dueUploads) {
      let currentUpload = upload;
      try {
        currentUpload = await uploadBlob(upload);
        await putUpload(currentUpload);
        await persistUpload(currentUpload);
        await deleteUpload(upload.id);
        self.postMessage({ type: "uploaded", payload: buildResult(currentUpload) });
      } catch (err) {
        const attempts = upload.attempts + 1;
        const error = err instanceof Error ? err.message : "Upload failed";

        if (attempts >= MAX_ATTEMPTS || error.includes("too large")) {
          await deleteUpload(upload.id);
          self.postMessage({
            type: "failed",
            payload: { id: upload.id, error },
          });
          continue;
        }

        await putUpload({
          ...currentUpload,
          attempts,
          nextAttemptAt: Date.now() + Math.min(60_000, 2 ** attempts * 2_000),
        });
      }
    }

    const remaining = await getAllUploads();
    const next = remaining
      .map((upload) => upload.nextAttemptAt)
      .sort((a, b) => a - b)[0];
    if (next) scheduleQueue(next - Date.now());
  } finally {
    processing = false;
  }
}

self.onmessage = (event: MessageEvent<EnqueueMessage>) => {
  if (event.data.type !== "enqueue") return;

  const now = Date.now();
  const upload: QueuedUpload = {
    ...event.data.payload,
    createdAt: now,
    nextAttemptAt: now + event.data.payload.delayMs,
    attempts: 0,
  };

  void putUpload(upload).then(() => {
    scheduleQueue(0);
  });
};

void openDb().then(() => scheduleQueue(1_000));
