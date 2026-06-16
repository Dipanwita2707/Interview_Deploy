import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { sarvamTTS, type SarvamLanguage, type SarvamSpeaker } from "@/lib/ai/sarvam";

const log = createLogger("api/voice/sarvam-tts");

/**
 * POST /api/voice/sarvam-tts
 * Body: { text: string, language?: string, speaker?: string }
 * Returns WAV audio buffer.
 */
export async function POST(req: Request) {
  try {
    const { text, language, speaker, pace } = await req.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const audioBuffer = await sarvamTTS({
      text,
      language: (language as SarvamLanguage) ?? "en-IN",
      speaker: (speaker as SarvamSpeaker) ?? "anushka",
      pace: pace ?? 1.0,
    });

    const audioBody = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength
    ) as ArrayBuffer;
    return new Response(audioBody, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    log.error("Sarvam TTS error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TTS failed" },
      { status: 500 }
    );
  }
}
