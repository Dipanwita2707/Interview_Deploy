import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { sarvamSTT, type SarvamLanguage } from "@/lib/ai/sarvam";

const log = createLogger("api/voice/sarvam-stt");

/**
 * POST /api/voice/sarvam-stt
 * Body: multipart/form-data with fields:
 *   - file: audio file (WAV/MP3, 16kHz mono recommended)
 *   - language: BCP-47 code e.g. "en-IN" (optional)
 * Returns: { transcript: string }
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const language = (formData.get("language") as string) ?? "en-IN";

    if (!file) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);

    const transcript = await sarvamSTT({
      audio,
      filename: file.name || "audio.wav",
      language: language as SarvamLanguage,
    });

    return NextResponse.json({ transcript });
  } catch (err) {
    log.error("Sarvam STT error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "STT failed" },
      { status: 500 }
    );
  }
}
