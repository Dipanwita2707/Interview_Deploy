/**
 * Sarvam AI Voice Relay
 *
 * Protocol matches use-voice.ts / voice-relay.ts conventions:
 *
 *  Browser → Server (JSON):
 *    { type: "init", context: { title, questions, language, aiName, aiTone, followUpDepth, ... } }
 *    { type: "audio", data: <hex-encoded PCM16 16kHz mono> }
 *    { type: "next_question" }
 *    { type: "end" }
 *
 *  Server → Browser (JSON):
 *    { type: "ready", sessionId: "..." }
 *    { type: "question_change", questionIndex: N, totalQuestions: M, auto: true }
 *    { type: "asr_ended", text: "..." }
 *    { type: "tts_text", data: { text: "..." } }
 *    { type: "tts_ended" }
 *    { type: "interview_complete" }
 *    { type: "error", message: "..." }
 *
 *  Server → Browser (binary):
 *    Float32Array PCM audio chunks
 *
 * Run: npx tsx server/azure-speech-relay.ts
 */

import { randomUUID } from "crypto";
import { config } from "dotenv";
import { WebSocket, WebSocketServer } from "ws";
import OpenAI from "openai";
import { createLogger } from "../src/lib/logger";
import { sarvamTTS, sarvamSTT } from "../src/lib/ai/sarvam";
import type { SarvamLanguage } from "../src/lib/ai/sarvam";

config({ path: ".env.local", override: true });
config({ path: ".env" });

const log = createLogger("sarvam-relay");

const SILENCE_FLUSH_MS = 900;
const MIC_TEST_MAX_BUFFER_MS = 4_000;
const INTERVIEW_MAX_BUFFER_MS = 6_000;
const PCM16_BYTES_PER_SECOND = 32_000;

// ── Config ──────────────────────────────────────────────────────────
const PORT = Number(process.env.AZURE_SPEECH_RELAY_PORT) || 8083;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "";
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4.1";
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-08-01-preview";
const isAzure = OPENAI_BASE_URL.includes("azure.com");
// /openai/v1 is the OpenAI-compatible endpoint — it rejects api-version query params
const isAzureV1 = isAzure && OPENAI_BASE_URL.includes("/openai/v1");

if (!process.env.SARVAM_API_KEY) {
  log.error("Missing SARVAM_API_KEY — set it in .env.local");
  process.exit(1);
}

// ── OpenAI / Azure LLM client ────────────────────────────────────────
const llm = new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL || undefined,
  ...(isAzure && {
    defaultHeaders: { "api-key": OPENAI_API_KEY },
    ...(!isAzureV1 && {
      defaultQuery: { "api-version": AZURE_API_VERSION },
    }),
  }),
});

// ── TTS via Sarvam — returns WAV buffer ──────────────────────────────
async function synthesizeWAV(text: string, lang = "en"): Promise<Buffer> {
  const isZh = lang.toLowerCase().startsWith("zh");
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sarvamTTS({
        text,
        language: isZh ? "hi-IN" : "en-IN",
        speaker: isZh ? "manisha" : "anushka",
      });
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.toLowerCase().includes("rate_limit");
      if (!is429 || attempt === maxAttempts) throw err;
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      log.warn(`[TTS] rate-limited (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Convert WAV buffer → Float32 PCM and send as binary WS message.
 * Sarvam returns 22050 Hz signed 16-bit PCM WAV (44-byte header).
 */
function sendWAVAudio(ws: WebSocket, wav: Buffer) {
  if (ws.readyState !== WebSocket.OPEN) return;
  // Skip 44-byte WAV header
  const pcm16 = wav.subarray(44);
  const samples = pcm16.length / 2;
  const float32 = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    float32[i] = pcm16.readInt16LE(i * 2) / 32768.0;
  }
  ws.send(Buffer.from(float32.buffer), { binary: true });
}

// ── STT via Sarvam — accepts raw PCM16 16kHz mono buffer ─────────────
async function recognizeSpeech(pcm16Buffer: Buffer, lang = "en-US"): Promise<string> {
  const isZh = lang.toLowerCase().startsWith("zh");
  const sarvamLang: SarvamLanguage = isZh ? "hi-IN" : "en-IN";

  // Build a minimal WAV header for 16kHz mono 16-bit PCM
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcm16Buffer.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  const wavBuffer = Buffer.concat([header, pcm16Buffer]);

  // Retry up to 4 times on 429 rate-limit errors with exponential backoff
  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sarvamSTT({ audio: wavBuffer, filename: "audio.wav", language: sarvamLang });
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = msg.includes("429") || msg.toLowerCase().includes("rate_limit");
      if (!is429 || attempt === maxAttempts) throw err;
      const delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      log.warn(`[STT] rate-limited (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs}ms…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// ── Types ─────────────────────────────────────────────────────────────
interface Question {
  text: string;
  type: string;
  description?: string | null;
  order: number;
}

interface InterviewContext {
  title: string;
  objective?: string | null;
  aiName: string;
  aiTone: string;
  language: string;
  followUpDepth: string;
  startQuestionIndex?: number;
  examContext?: {
    source?: string;
    examScore?: number;
    weakTopics?: string[];
    submissionSummary?: Array<{
      questionTitle: string;
      verdict: string;
      score: number;
      topics: string[];
      language?: string;
      submittedAnswerExcerpt?: string;
    }>;
  };
  questions: Question[];
}

interface SessionState {
  sessionId: string;
  ctx: InterviewContext;
  currentQ: number;
  // How many user reply turns happened on the current question.
  // Used to enforce follow-up depth before advancing.
  userTurnsThisQuestion: number;
  minFollowUps: number;
  history: { role: "user" | "assistant"; content: string }[];
  audioChunks: Buffer[];
  silenceTimer: ReturnType<typeof setTimeout> | null;
  processing: boolean;
}

function createSession(): SessionState {
  return {
    sessionId: randomUUID(),
    ctx: {} as InterviewContext,
    currentQ: 0,
    userTurnsThisQuestion: 0,
    minFollowUps: 1,
    history: [],
    audioChunks: [],
    silenceTimer: null,
    processing: false,
  };
}

function getMinFollowUps(followUpDepth: string): number {
  switch (followUpDepth) {
    case "LIGHT":    return 1;
    case "MODERATE": return 2;
    case "DEEP":     return 4;
    default:         return 1;
  }
}

// ── LLM + TTS per turn ────────────────────────────────────────────────
async function askQuestion(
  ws: WebSocket,
  state: SessionState,
  userText?: string
) {
  if (state.processing) return;
  state.processing = true;

  const { ctx } = state;
  const sortedQuestions = [...ctx.questions].sort((a, b) => a.order - b.order);
  const question = sortedQuestions[state.currentQ];
  const lang = ctx.language || "en-US";

  if (!question) {
    // All questions done
    const farewell = lang.toLowerCase().startsWith("zh")
      ? "感谢您参加本次面试，我们会尽快与您联系。"
      : "Thank you for completing the interview. We'll be in touch soon!";
    ws.send(JSON.stringify({ type: "tts_text", data: { text: farewell } }));
    const wav = await synthesizeWAV(farewell, lang).catch(() => null);
    if (wav) sendWAVAudio(ws, wav);
    ws.send(JSON.stringify({ type: "tts_ended" }));
    ws.send(JSON.stringify({ type: "interview_complete" }));
    state.processing = false;
    return;
  }

  if (userText?.trim()) {
    state.history.push({ role: "user", content: userText.trim() });
    state.userTurnsThisQuestion++;
  }

  // Determine whether the AI is allowed to advance to the next question.
  // It must complete at least minFollowUps exchanges first.
  const canAdvance = state.userTurnsThisQuestion >= state.minFollowUps;
  const followUpInstruction = canAdvance
    ? `You have asked enough follow-ups (${state.userTurnsThisQuestion}/${state.minFollowUps}). ` +
      `If the participant has given a detailed, specific answer, wrap up this question with a brief ` +
      `acknowledgement and then ask the NEXT question (question ${state.currentQ + 2}): "${sortedQuestions[state.currentQ + 1]?.text ?? "[end]"}"` +
      ` and append the exact token [NEXT] at the end of your response so the system can detect the transition.` +
      ` Do NOT use [NEXT] if the participant's answer was still vague — ask one more follow-up instead.`
    : `You MUST ask ${state.minFollowUps - state.userTurnsThisQuestion} more follow-up question(s) before moving on. ` +
      `Do NOT advance to the next question yet. Do NOT include [NEXT] in your response.`;

  const examSummary = Array.isArray(ctx.examContext?.submissionSummary)
    ? ctx.examContext!.submissionSummary!
    : [];
  const examContextBlock = examSummary.length > 0
    ? `\nPERSONALIZED EXAM CONTEXT (mandatory): This interview must focus on the participant's solved coding problems below. For each problem, probe approach, complexity, trade-offs, and improvements — NOT generic questions.\n`
      + (ctx.examContext?.examScore !== undefined ? `Exam score: ${ctx.examContext.examScore}\n` : "")
      + (ctx.examContext?.weakTopics?.length ? `Weak topics: ${ctx.examContext.weakTopics.join(", ")}\n` : "")
      + examSummary.slice(0, 8).map((s, i) => {
          const p = (s.submittedAnswerExcerpt || "").trim();
          return `${i+1}. ${s.questionTitle} | verdict=${s.verdict} | score=${s.score} | topics=${(s.topics||[]).join(",")||"n/a"}`
            + (s.language ? ` | lang=${s.language}` : "")
            + (p ? `\n   code: ${p.slice(0, 300)}` : "");
        }).join("\n")
    : "";

  const systemPrompt =
    `You are ${ctx.aiName || "an AI interviewer"}, conducting a ${ctx.aiTone || "professional"} ` +
    `voice interview for: "${ctx.title}".\n` +
    (ctx.objective ? `Objective: ${ctx.objective}\n` : "") +
    `Language: ${lang}. Always reply in the same language.\n` +
    `Be concise (2-3 sentences). No lists or markdown — speak naturally.\n` +
    `Question ${state.currentQ + 1} of ${sortedQuestions.length}: "${question.text}"\n` +
    (question.description ? `Context: ${question.description}\n` : "") +
    examContextBlock +
    `\n${followUpInstruction}`;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...state.history,
  ];

  if (!userText?.trim()) {
    messages.push({ role: "user", content: "[Start: greet briefly and ask the question.]" });
  }

  try {
    const completion = await llm.chat.completions.create({
      model: AZURE_DEPLOYMENT,
      messages,
      max_tokens: 350,
      temperature: 0.7,
    });

    let aiText = completion.choices[0]?.message?.content ?? "";
    const shouldAdvance = canAdvance && aiText.includes("[NEXT]");
    // Remove the [NEXT] token before sending to TTS / browser
    aiText = aiText.replace(/\[NEXT\]/g, "").trim();

    state.history.push({ role: "assistant", content: aiText });

    if (ws.readyState !== WebSocket.OPEN) { state.processing = false; return; }

    ws.send(JSON.stringify({ type: "tts_text", data: { text: aiText } }));
    const wav = await synthesizeWAV(aiText, lang);
    sendWAVAudio(ws, wav);
    ws.send(JSON.stringify({ type: "tts_ended" }));

    // Only advance the question index when the LLM signals [NEXT]
    if (shouldAdvance) {
      state.currentQ++;
      state.userTurnsThisQuestion = 0;
      if (state.currentQ < sortedQuestions.length) {
        ws.send(JSON.stringify({
          type: "question_change",
          questionIndex: state.currentQ,
          totalQuestions: sortedQuestions.length,
          auto: true,
        }));
        log.info(`→ Q${state.currentQ + 1}/${sortedQuestions.length}`);
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("LLM/TTS error:", message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "error", message }));
    }
  } finally {
    state.processing = false;
  }
}

// ── Process accumulated audio (STT → LLM → TTS) ───────────────────────
async function processAudio(ws: WebSocket, state: SessionState) {
  if (state.audioChunks.length === 0) return;
  const combined = Buffer.concat(state.audioChunks);
  state.audioChunks = [];
  if (combined.length < 6400) return; // < ~0.2s, skip

  const lang = state.ctx.language || "en-US";
  // Debug: compute RMS of the combined buffer
  const samples = combined.length / 2;
  let sumSq = 0;
  for (let i = 0; i < samples; i++) {
    const s = combined.readInt16LE(i * 2) / 32768.0;
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / samples);
  const durationS = (combined.length / 2 / 16000).toFixed(2);
  log.info(`STT audio: ${combined.length} bytes, ~${durationS}s, RMS=${rms.toFixed(4)}`);
  // Skip STT if audio is silent (all-zero buffer from suspended AudioContext)
  if (rms < 0.001) {
    log.info("STT skipped: audio is silent (RMS < 0.001)");
    return;
  }

  try {
    const text = await recognizeSpeech(combined, mapLang(lang));
    log.info(`STT result: "${text}"`);
    if (!text.trim()) return;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "asr_ended", text: text.trim() }));
    }
    await askQuestion(ws, state, text.trim());
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("STT error:", message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "error", message }));
    }
  }
}

function mapLang(lang: string): string {
  const l = lang.trim().toLowerCase();
  if (l.startsWith("zh")) return "zh-CN";
  if (l.startsWith("en")) return "en-US";
  return lang;
}

// ── WebSocket server ─────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  log.info("Client connected");
  const state = createSession();

  let mode: "unknown" | "mic_test" | "interview" = "unknown";
  let micTestLang = "en-US";
  const micChunks: Buffer[] = [];
  let micTimer: ReturnType<typeof setTimeout> | null = null;

  ws.on("message", async (raw, isBinary) => {
    if (isBinary) return;

    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (mode === "unknown") {
      if (msg.type === "mic_test") {
        mode = "mic_test";
        micTestLang = (msg.language as string) || "en-US";
        log.info(`Mic test mode, lang: ${micTestLang}`);
        ws.send(JSON.stringify({ type: "ready" }));
        return;
      }
      if (msg.type === "init" && msg.context) {
        mode = "interview";
        const ctx = msg.context as InterviewContext;
        state.ctx = ctx;
        state.currentQ = ctx.startQuestionIndex ?? 0;
        state.userTurnsThisQuestion = 0;
        state.minFollowUps = getMinFollowUps(ctx.followUpDepth);
        state.history = [];
        log.info(`Session ${state.sessionId} — "${ctx.title}", ${ctx.questions.length} questions, lang: ${ctx.language}, followUpDepth: ${ctx.followUpDepth} (min ${state.minFollowUps} turns)`);
        ws.send(JSON.stringify({ type: "ready", sessionId: state.sessionId }));
        ws.send(JSON.stringify({
          type: "question_change",
          questionIndex: state.currentQ,
          totalQuestions: ctx.questions.length,
          auto: true,
        }));
        await askQuestion(ws, state);
        return;
      }
      return;
    }

    // ── Mic test ─────────────────────────────────────────────────────
    if (mode === "mic_test") {
      if (msg.type === "audio" && typeof msg.data === "string") {
        const chunk = Buffer.from(msg.data as string, "hex");
        micChunks.push(chunk);

        const samples = chunk.length / 2;
        let sumSq = 0;
        for (let i = 0; i < samples; i++) {
          const s = chunk.readInt16LE(i * 2) / 32768.0;
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / samples);
        const isSilent = rms < 0.008;

        if (!isSilent && micTimer) { clearTimeout(micTimer); micTimer = null; }
        if (isSilent && !micTimer) {
          micTimer = setTimeout(async () => {
            micTimer = null;
            if (micChunks.length === 0) return;
            const combined = Buffer.concat(micChunks);
            micChunks.length = 0;
            if (combined.length < 3200) return;
            const text = await recognizeSpeech(combined, mapLang(micTestLang)).catch(() => "");
            const finalText = text.trim() || "ok";
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "asr_ended", text: finalText }));
            }
          }, SILENCE_FLUSH_MS);
        }
        const totalBytes = micChunks.reduce((s, c) => s + c.length, 0);
        if (totalBytes >= (MIC_TEST_MAX_BUFFER_MS / 1000) * PCM16_BYTES_PER_SECOND && !micTimer) {
          micTimer = setTimeout(async () => {
            micTimer = null;
            if (micChunks.length === 0) return;
            const combined = Buffer.concat(micChunks);
            micChunks.length = 0;
            const text = await recognizeSpeech(combined, mapLang(micTestLang)).catch(() => "");
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "asr_ended", text: text.trim() || "ok" }));
            }
          }, 100);
        }
      }
      return;
    }

    // ── Interview mode ───────────────────────────────────────────────
    if (mode === "interview") {
      if (msg.type === "audio" && typeof msg.data === "string") {
        const buf = Buffer.from(msg.data as string, "hex");
        state.audioChunks.push(buf);

        const samples = buf.length / 2;
        let sumSq = 0;
        for (let i = 0; i < samples; i++) {
          const s = buf.readInt16LE(i * 2) / 32768.0;
          sumSq += s * s;
        }
        const rms = Math.sqrt(sumSq / samples);
        const isSilent = rms < 0.008;

        if (!isSilent && state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
        if (isSilent && !state.silenceTimer) {
          state.silenceTimer = setTimeout(() => {
            state.silenceTimer = null;
            processAudio(ws, state).catch((e) => log.error("processAudio:", e));
          }, SILENCE_FLUSH_MS);
        }
        const totalBytes = state.audioChunks.reduce((s, c) => s + c.length, 0);
        if (totalBytes >= (INTERVIEW_MAX_BUFFER_MS / 1000) * PCM16_BYTES_PER_SECOND && !state.silenceTimer) {
          state.silenceTimer = setTimeout(() => {
            state.silenceTimer = null;
            processAudio(ws, state).catch((e) => log.error("processAudio:", e));
          }, 100);
        }
        return;
      }

      if (msg.type === "next_question") {
        if (state.silenceTimer) { clearTimeout(state.silenceTimer); state.silenceTimer = null; }
        state.audioChunks = [];
        const sortedLen = [...state.ctx.questions].length;
        state.currentQ = Math.min(state.currentQ + 1, sortedLen - 1);
        state.userTurnsThisQuestion = 0;
        await askQuestion(ws, state);
        return;
      }

      if (msg.type === "end") {
        if (state.silenceTimer) clearTimeout(state.silenceTimer);
        ws.send(JSON.stringify({ type: "interview_complete" }));
      }
    }
  });

  ws.on("close", (code, reason) => {
    if (state.silenceTimer) clearTimeout(state.silenceTimer);
    if (micTimer) clearTimeout(micTimer);
    log.info(`Client disconnected (mode=${mode}, code=${code}, reason=${reason.toString() || "none"})`);
  });

  ws.on("error", (err) => {
    log.error("WS error:", err.message);
  });
});

log.info(`Sarvam voice relay on ws://localhost:${PORT}`);
log.info(`LLM model: ${AZURE_DEPLOYMENT}`);

process.on("uncaughtException", (err) => {
  log.error("Uncaught exception (relay kept alive):", err.message);
});
process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection (relay kept alive):", String(reason));
});

