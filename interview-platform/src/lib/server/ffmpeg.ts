import "server-only";

import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export interface VideoCompressionResult {
  buffer: Buffer;
  contentType: string;
  extension: string;
  compressed: boolean;
}

const DEFAULT_VIDEO_COMPRESSION_THRESHOLD_BYTES = 8 * 1024 * 1024;
const DEFAULT_FFMPEG_TIMEOUT_MS = 120_000;

let ffmpegAvailability: boolean | null = null;

function getFfmpegPath(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

function getCompressionThresholdBytes(): number {
  const configured = Number(process.env.SESSION_VIDEO_COMPRESSION_THRESHOLD_BYTES);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_VIDEO_COMPRESSION_THRESHOLD_BYTES;
}

function getFfmpegTimeoutMs(): number {
  const configured = Number(process.env.SESSION_FFMPEG_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_FFMPEG_TIMEOUT_MS;
}

function inputExtension(contentType?: string): string {
  if (contentType?.includes("mp4")) return "mp4";
  if (contentType?.includes("quicktime")) return "mov";
  return "webm";
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getFfmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FFmpeg compression timed out"));
    }, getFfmpegTimeoutMs());

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 4000) {
        stderr = stderr.slice(-4000);
      }
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        ffmpegAvailability = false;
      }
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`));
    });
  });
}

export async function compressVideoForStorage(
  input: Buffer,
  contentType?: string,
): Promise<VideoCompressionResult> {
  if (input.byteLength < getCompressionThresholdBytes()) {
    return {
      buffer: input,
      contentType: contentType || "video/webm",
      extension: inputExtension(contentType),
      compressed: false,
    };
  }

  if (ffmpegAvailability === false) {
    return {
      buffer: input,
      contentType: contentType || "video/webm",
      extension: inputExtension(contentType),
      compressed: false,
    };
  }

  const workspace = join(tmpdir(), `aural-ffmpeg-${randomUUID()}`);
  const sourcePath = join(workspace, `source.${inputExtension(contentType)}`);
  const outputPath = join(workspace, "compressed.webm");

  try {
    await mkdir(workspace, { recursive: true });
    await writeFile(sourcePath, input);
    await runFfmpeg([
      "-y",
      "-i",
      sourcePath,
      "-vf",
      "scale='min(1280,iw)':-2",
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      process.env.SESSION_VIDEO_BITRATE || "900k",
      "-deadline",
      "good",
      "-cpu-used",
      "4",
      "-row-mt",
      "1",
      "-c:a",
      "libopus",
      "-b:a",
      process.env.SESSION_VIDEO_AUDIO_BITRATE || "64k",
      outputPath,
    ]);
    ffmpegAvailability = true;

    const compressed = await readFile(outputPath);
    if (compressed.byteLength > 0 && compressed.byteLength < input.byteLength) {
      return {
        buffer: compressed,
        contentType: "video/webm",
        extension: "webm",
        compressed: true,
      };
    }

    return {
      buffer: input,
      contentType: contentType || "video/webm",
      extension: inputExtension(contentType),
      compressed: false,
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
