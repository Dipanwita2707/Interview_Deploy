import { createLogger } from "@/lib/logger";
import { compressVideoForStorage } from "@/lib/server/ffmpeg";
import { saveSessionAssetLocally } from "@/lib/server/session-asset-storage";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const log = createLogger("api/session/upload");
const DEFAULT_MAX_UPLOAD_BYTES = 45 * 1024 * 1024;
const DEFAULT_RAW_MAX_UPLOAD_BYTES = 250 * 1024 * 1024;

function getMaxUploadBytes(): number {
  const configured = Number(process.env.SESSION_UPLOAD_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_UPLOAD_BYTES;
}

function getRawMaxUploadBytes(): number {
  const configured = Number(process.env.SESSION_RAW_UPLOAD_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_RAW_MAX_UPLOAD_BYTES;
}

/**
 * Upload a file (audio recording or screenshot) to local session storage.
 *
 * Expects multipart FormData with:
 *   - file: Blob/File
 *   - sessionId: string
 *   - type: "recording" | "screenshot" | "camera-recording" | "screen-recording"
 *   - filename: string (optional, used as the storage path suffix)
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as Blob | null;
    const sessionId = formData.get("sessionId") as string | null;
    const type = formData.get("type") as string | null;
    const filename = formData.get("filename") as string | null;
    const upsert = formData.get("upsert") === "true";

    if (!file || !sessionId || !type) {
      return NextResponse.json(
        { error: "Missing required fields: file, sessionId, type" },
        { status: 400 },
      );
    }

    if (
      type !== "recording" &&
      type !== "screenshot" &&
      type !== "camera-recording" &&
      type !== "screen-recording"
    ) {
      return NextResponse.json(
        { error: 'type must be "recording", "screenshot", "camera-recording", or "screen-recording"' },
        { status: 400 },
      );
    }

    const rawMaxUploadBytes = getRawMaxUploadBytes();
    if (file.size > rawMaxUploadBytes) {
      return NextResponse.json(
        {
          error: `File exceeds maximum raw upload size of ${Math.round(rawMaxUploadBytes / 1024 / 1024)}MB`,
        },
        { status: 413 },
      );
    }

    const bucket = type === "screenshot" ? "screenshots" : "recordings";
    const isVideoRecording = type === "camera-recording" || type === "screen-recording";
    let defaultExt = type !== "screenshot"
      ? (
          file.type?.includes("mp4") ? (isVideoRecording ? "mp4" : "m4a") : "webm"
        )
      : "jpg";

    let buffer: Buffer = Buffer.from(await file.arrayBuffer());

    let defaultContentType = type === "screenshot"
      ? "image/jpeg"
      : isVideoRecording
        ? (file.type?.includes("mp4") ? "video/mp4" : "video/webm")
        : (file.type?.includes("mp4") ? "audio/mp4" : "audio/webm")
      ;

    if (isVideoRecording) {
      try {
        const compressed = await compressVideoForStorage(buffer, file.type || defaultContentType);
        buffer = compressed.buffer;
        defaultContentType = compressed.contentType;
        defaultExt = compressed.extension;
        if (compressed.compressed) {
          log.info(
            `Compressed ${type} from ${Math.round(file.size / 1024 / 1024)}MB to ${Math.round(buffer.byteLength / 1024 / 1024)}MB`,
          );
        }
      } catch (err) {
        log.warn("FFmpeg compression skipped:", err);
      }
    }

    const maxUploadBytes = getMaxUploadBytes();
    if (buffer.byteLength > maxUploadBytes) {
      return NextResponse.json(
        {
          error: `File exceeds maximum upload size of ${Math.round(maxUploadBytes / 1024 / 1024)}MB after compression`,
        },
        { status: 413 },
      );
    }

    const resolvedFilename = filename && isVideoRecording
      ? filename.replace(/\.[^.]+$/, `.${defaultExt}`)
      : filename;
    const storagePath = `${sessionId}/${resolvedFilename || `${Date.now()}.${defaultExt}`}`;

    const savedAsset = await saveSessionAssetLocally({
      bucket,
      storagePath,
      buffer,
      upsert,
    });

    return NextResponse.json({
      url: savedAsset.url,
      path: savedAsset.path,
      bucket,
    });
  } catch (err) {
    log.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 },
    );
  }
}
