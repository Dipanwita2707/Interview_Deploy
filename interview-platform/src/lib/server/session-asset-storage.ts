import "server-only";

import { mkdir, stat, unlink, writeFile } from "fs/promises";
import { dirname, join, normalize, sep } from "path";

const LOCAL_ASSET_PUBLIC_PREFIX = "/session-artifacts";

function getPublicRoot(): string {
  return join(process.cwd(), "public", LOCAL_ASSET_PUBLIC_PREFIX.replace(/^\//, ""));
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._/-]/g, "-");
}

function ensureSafeRelativePath(storagePath: string): string {
  const normalized = normalize(storagePath).replace(/^([/\\])+/, "");
  if (
    normalized.length === 0 ||
    normalized === "." ||
    normalized.split(/[\\/]+/).some((segment) => segment === "..")
  ) {
    throw new Error("Invalid storage path");
  }
  return normalized;
}

export function buildLocalSessionAssetUrl(bucket: string, storagePath: string): string {
  const safeBucket = sanitizeSegment(bucket);
  const safePath = ensureSafeRelativePath(storagePath)
    .split(sep)
    .join("/")
    .split("/")
    .map(sanitizeSegment)
    .join("/");
  return `${LOCAL_ASSET_PUBLIC_PREFIX}/${safeBucket}/${safePath}`;
}

export function isLocalSessionAssetUrl(url?: string | null): boolean {
  return typeof url === "string" && url.startsWith(`${LOCAL_ASSET_PUBLIC_PREFIX}/`);
}

export async function saveSessionAssetLocally(options: {
  bucket: string;
  storagePath: string;
  buffer: Buffer;
  upsert?: boolean;
}): Promise<{ path: string; url: string }> {
  const safeBucket = sanitizeSegment(options.bucket);
  const safeStoragePath = ensureSafeRelativePath(options.storagePath)
    .split(/[\\/]+/)
    .map(sanitizeSegment)
    .join("/");
  const targetPath = join(getPublicRoot(), safeBucket, safeStoragePath);

  await mkdir(dirname(targetPath), { recursive: true });

  if (!options.upsert) {
    try {
      await stat(targetPath);
      throw new Error("Asset already exists");
    } catch (err: unknown) {
      const errorWithCode = err as { code?: string };
      if (errorWithCode.code !== "ENOENT") {
        throw err;
      }
    }
  } else {
    try {
      await unlink(targetPath);
    } catch {
      // ignore existing file cleanup errors
    }
  }

  await writeFile(targetPath, options.buffer);

  return {
    path: safeStoragePath,
    url: buildLocalSessionAssetUrl(safeBucket, safeStoragePath),
  };
}