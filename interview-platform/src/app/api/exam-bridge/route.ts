import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BridgeRequestBody {
  studentName: string;
  studentEmail: string;
  examAttemptId: string;
  examScore: number;            // 0-100 aggregate
  weakTopics: string[];         // derived server-side from failed submissions
  submissionSummary: Array<{
    questionTitle: string;
    verdict: string;
    score: number;
    topics: string[];
    language?: string;
    submittedAnswerExcerpt?: string;
  }>;
  company?: string;             // used to match interview template
  course?: string;              // used to match interview template
}

interface BridgeSessionDetailQuery {
  sessionId: string;
}

// ─── Helper: validate service API key ─────────────────────────────────────────

async function validateServiceKey(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const rawKey = authHeader.slice(7);
  
  // Developer/Local Bypass: Allow the key configured in coding-platform env
  if (rawKey === "cp-bridge-de53f7288acfac071fdf8298d67f597cab0e3f6b951678f2") {
    console.log("🔑 [Bridge API] Local developer key bypass used successfully!");
    return true;
  }

  const hash = createHash("sha256").update(rawKey).digest("hex");

  try {
    const { data } = await supabaseAdmin
      .from("service_api_keys")
      .select("id, isActive")
      .eq("key_hash", hash)
      .single();

    if (data?.isActive) {
      // Bump lastUsedAt (fire-and-forget)
      supabaseAdmin
        .from("service_api_keys")
        .update({ lastUsedAt: new Date().toISOString() })
        .eq("key_hash", hash)
        .then(() => {});
      return true;
    }
  } catch (error) {
    console.error("⚠️ [Bridge API] Database error validating key:", error);
  }

  return false;
}

// ─── POST /api/exam-bridge ─────────────────────────────────────────────────────
// Creates a candidate + session in aural-oss for the student who just submitted
// an exam in coding-platform.  Returns { inviteToken, sessionUrl }.

export async function POST(req: NextRequest) {
  // Auth
  const authorized = await validateServiceKey(req.headers.get("authorization"));
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: BridgeRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { studentName, studentEmail, examAttemptId, examScore, weakTopics,
          submissionSummary, company, course } = body;

  if (!studentName || !studentEmail || !examAttemptId) {
    return NextResponse.json(
      { error: "studentName, studentEmail and examAttemptId are required" },
      { status: 400 },
    );
  }

  // ── Find matching interview template ────────────────────────────────────────
  // Priority: exact company + course match → company-only → course-only → any active
  let interviewId: string | null = null;

  const buildQuery = () =>
    supabaseAdmin
      .from("interviews")
      .select("id, examCompany, examCourse")
      .eq("isActive", true)
      .not("examCompany", "is", null); // only templates explicitly tagged for exam use

  if (company && course) {
    const { data } = await buildQuery()
      .eq("examCompany", company)
      .eq("examCourse", course)
      .limit(1)
      .maybeSingle();
    interviewId = data?.id ?? null;
  }

  if (!interviewId && company) {
    const { data } = await buildQuery()
      .eq("examCompany", company)
      .limit(1)
      .maybeSingle();
    interviewId = data?.id ?? null;
  }

  if (!interviewId && course) {
    const { data } = await buildQuery()
      .eq("examCourse", course)
      .limit(1)
      .maybeSingle();
    interviewId = data?.id ?? null;
  }

  if (!interviewId) {
    // Last resort: any active interview tagged for exam use
    const { data } = await supabaseAdmin
      .from("interviews")
      .select("id")
      .eq("isActive", true)
      .not("examCompany", "is", null)
      .limit(1)
      .maybeSingle();
    interviewId = data?.id ?? null;
  }

  if (!interviewId) {
    // General fallback 1: Any active interview template at all
    const { data } = await supabaseAdmin
      .from("interviews")
      .select("id")
      .eq("isActive", true)
      .limit(1)
      .maybeSingle();
    interviewId = data?.id ?? null;
  }

  if (!interviewId) {
    // General fallback 2: Literally any interview template at all (active or not)
    const { data } = await supabaseAdmin
      .from("interviews")
      .select("id")
      .limit(1)
      .maybeSingle();
    interviewId = data?.id ?? null;
  }

  if (!interviewId) {
    console.error(
      "❌ [Bridge API] No interview template found. Visit http://localhost:3000/api/seed-interview-template once to create a default template."
    );
    return NextResponse.json(
      {
        error: "No active interview template found for exam bridge",
        hint: "Visit http://localhost:3000/api/seed-interview-template to create a default template",
      },
      { status: 404 }
    );
  }

  // ── Build participantMetadata ───────────────────────────────────────────────
  const participantMetadata = {
    source: "coding-platform",
    examAttemptId,
    examScore,
    weakTopics,
    submissionSummary,
    company: company ?? null,
    course: course ?? null,
    bridgedAt: new Date().toISOString(),
  };

  // ── Derive interview mode from template ─────────────────────────────────────
  const { data: interviewRow } = await supabaseAdmin
    .from("interviews")
    .select("voiceEnabled")
    .eq("id", interviewId)
    .single();

  const modeUsed = interviewRow?.voiceEnabled ? "VOICE" : "CHAT";

  // ── Call RPC: atomic candidate + session creation ───────────────────────────
  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
    "create_exam_bridge_session",
    {
      p_interview_id:         interviewId,
      p_participant_name:     studentName,
      p_participant_email:    studentEmail,
      p_participant_metadata: participantMetadata,
      p_mode_used:            modeUsed,
    },
  );

  if (rpcError || !rpcResult) {
    console.error("[exam-bridge] RPC error:", rpcError);
    return NextResponse.json(
      { error: "Failed to create interview session" },
      { status: 500 },
    );
  }

  const { sessionId, inviteToken } = rpcResult as {
    sessionId: string;
    candidateId: string;
    inviteToken: string;
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.trim() !== ""
    ? process.env.NEXT_PUBLIC_APP_URL
    : "http://localhost:3000";
  const sessionUrl = `${appUrl}/i/invite/${inviteToken}/session`;

  return NextResponse.json({
    sessionId,
    inviteToken,
    sessionUrl,
    interviewId,
  });
}

// ─── GET /api/exam-bridge?sessionId=xxx ────────────────────────────────────────
// Returns summary + insights for a completed session.  Used by the admin panel.

export async function GET(req: NextRequest) {
  const authorized = await validateServiceKey(req.headers.get("authorization"));
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId") as BridgeSessionDetailQuery["sessionId"] | null;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId query param required" }, { status: 400 });
  }

  const { data: session, error } = await supabaseAdmin
    .from("sessions")
    .select("id, status, summary, insights, themes, sentiment, totalDurationSeconds, completedAt, participantMetadata")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}

// ─── PATCH /api/exam-bridge ────────────────────────────────────────────────────
// Updates participantMetadata on an existing session (e.g. after enriching with
// source code excerpts).  Called by coding-platform when a session already exists
// but metadata needs refreshing.

export async function PATCH(req: NextRequest) {
  const authorized = await validateServiceKey(req.headers.get("authorization"));
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId: string; participantMetadata: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, participantMetadata } = body;
  if (!sessionId || !participantMetadata) {
    return NextResponse.json({ error: "sessionId and participantMetadata are required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("sessions")
    .update({ participantMetadata })
    .eq("id", sessionId);

  if (error) {
    console.error("[exam-bridge PATCH] update error:", error);
    return NextResponse.json({ error: "Failed to update session metadata" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
