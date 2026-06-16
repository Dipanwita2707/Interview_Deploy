/**
 * Sarvam AI - TTS (Text-to-Speech) and STT (Speech-to-Text) helpers
 *
 * Docs: https://docs.sarvam.ai
 *
 * TTS endpoint:  POST https://api.sarvam.ai/text-to-speech
 * STT endpoint:  POST https://api.sarvam.ai/speech-to-text
 */

const SARVAM_BASE_URL = "https://api.sarvam.ai";

function getSarvamKey(): string {
  return process.env.SARVAM_API_KEY || "";
}

// Supported Sarvam TTS speaker voices (bulbul:v2 compatible)
export type SarvamSpeaker =
  | "anushka"  // Female
  | "vidya"    // Female
  | "arya"     // Female
  | "manisha"  // Female
  | "abhilash" // Male
  | "karun"    // Male
  | "hitesh";  // Male

// Supported Sarvam languages
export type SarvamLanguage =
  | "en-IN"   // English (India)
  | "hi-IN"   // Hindi
  | "bn-IN"   // Bengali
  | "ta-IN"   // Tamil
  | "te-IN"   // Telugu
  | "mr-IN"   // Marathi
  | "gu-IN"   // Gujarati
  | "kn-IN"   // Kannada
  | "ml-IN"   // Malayalam
  | "od-IN"   // Odia
  | "pa-IN";  // Punjabi

export interface SarvamTTSOptions {
  text: string;
  /** BCP-47 language code, default: "en-IN" */
  language?: SarvamLanguage;
  /** Speaker voice, default: "anushka" */
  speaker?: SarvamSpeaker;
  /** Speech pace 0.5–2.0, default: 1.0 */
  pace?: number;
}

export interface SarvamSTTOptions {
  /** Audio file as Buffer (WAV/MP3/OGG/FLAC, mono, 16kHz recommended) */
  audio: Buffer;
  /** Filename with extension e.g. "audio.wav" */
  filename?: string;
  /** BCP-47 language code, default: "en-IN" */
  language?: SarvamLanguage;
}

/**
 * Sarvam AI Text-to-Speech
 * Returns a Buffer containing WAV audio.
 */
export async function sarvamTTS(options: SarvamTTSOptions): Promise<Buffer> {
  const SARVAM_API_KEY = getSarvamKey();
  if (!SARVAM_API_KEY) {
    throw new Error("SARVAM_API_KEY is not configured in .env.local");
  }

  const {
    text,
    language = "en-IN",
    speaker = "anushka",
    pace = 1.0,
  } = options;

  const response = await fetch(`${SARVAM_BASE_URL}/text-to-speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": SARVAM_API_KEY,
    },
    body: JSON.stringify({
      inputs: [text],
      target_language_code: language,
      speaker,
      pace,
      speech_sample_rate: 22050,
      enable_preprocessing: true,
      model: "bulbul:v2",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sarvam TTS failed [${response.status}]: ${errText}`);
  }

  const json = await response.json();

  // Sarvam returns base64-encoded WAV in audios[0]
  const base64Audio: string = json.audios?.[0];
  if (!base64Audio) {
    throw new Error("Sarvam TTS: no audio returned");
  }

  return Buffer.from(base64Audio, "base64");
}

/**
 * Sarvam AI Speech-to-Text
 * Returns the transcript string.
 */
export async function sarvamSTT(options: SarvamSTTOptions): Promise<string> {
  const SARVAM_API_KEY = getSarvamKey();
  if (!SARVAM_API_KEY) {
    throw new Error("SARVAM_API_KEY is not configured in .env.local");
  }

  const { audio, filename = "audio.wav", language = "en-IN" } = options;

  const formData = new FormData();
  const audioArrayBuffer = audio.buffer.slice(
    audio.byteOffset,
    audio.byteOffset + audio.byteLength
  ) as ArrayBuffer;
  formData.append(
    "file",
    new Blob([audioArrayBuffer], { type: "audio/wav" }),
    filename
  );
  formData.append("language_code", language);
  formData.append("model", "saaras:v3");

  const response = await fetch(`${SARVAM_BASE_URL}/speech-to-text`, {
    method: "POST",
    headers: {
      "api-subscription-key": SARVAM_API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sarvam STT failed [${response.status}]: ${errText}`);
  }

  const json = await response.json();
  // saaras:v3 may return { transcript } or { transcripts: [{transcript}] }
  return (
    json.transcript ??
    json.transcripts?.[0]?.transcript ??
    ""
  );
}
