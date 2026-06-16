import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { sarvamTTS, type SarvamLanguage, type SarvamSpeaker } from "@/lib/ai/sarvam";

const log = createLogger("api/voice/tts-s2s");

/**
 * POST /api/voice/tts-s2s
 * Synthesize speech via Sarvam AI TTS.
 * Returns WAV audio (22050 Hz, mono).
 */
export async function POST(req: Request) {
  const { text, language } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  // Map interview language to Sarvam language code and speaker voice
  const isZh = language?.toLowerCase().startsWith("zh");
  const sarvamLang: SarvamLanguage = isZh ? "hi-IN" : "en-IN";
  const speaker: SarvamSpeaker = isZh ? "manisha" : "anushka";

  try {
    const audioBuffer = await sarvamTTS({
      text,
      language: sarvamLang,
      speaker,
      pace: 0.95,
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
