"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { AntiCheatingGuard } from "@/components/session/anti-cheating-banner";
import { IntervieweeOnboarding } from "@/components/session/interviewee-onboarding";
import { PreparingScreen } from "@/components/session/preparing-screen";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc/client";
import { parseRecordingConfig } from "@/lib/recording-config";
import { CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const ChatInterface = dynamic(
  () => import("@/components/session/chat-interface").then((m) => m.ChatInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);
const VoiceInterface = dynamic(
  () => import("@/components/session/voice-interface").then((m) => m.VoiceInterface),
  { ssr: false, loading: () => <PreparingScreen /> },
);

export default function InviteSessionPage() {
  const params = useParams();
  const token = params.token as string;
  const router = useRouter();

  const [completed, setCompleted] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(false);

  const candidate = trpc.candidate.getByToken.useQuery(
    { token },
    {
      retry: false,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

  useEffect(() => {
    // Wait until query has settled before deciding to redirect
    if (candidate.isLoading || candidate.isFetching) return;
    if (candidate.isError) {
      router.replace(`/i/invite/${token}`);
      return;
    }
    if (candidate.data) {
      const session = (candidate.data as any).session;
      if (!session) {
        router.replace(`/i/invite/${token}`);
      }
    }
  }, [candidate.data, candidate.isError, candidate.isLoading, candidate.isFetching, token, router]);

  if (candidate.isLoading || !candidate.data) {
    return <PreparingScreen />;
  }

  const session = (candidate.data as any).session;
  const interview = (candidate.data as any).interview;
  const participantMetadata = ((session as any)?.participantMetadata ?? null) as Record<string, any> | null;

  // Debug: log what we received
  console.log('[session-page] participantMetadata:', JSON.stringify(participantMetadata, null, 2));

  const submissionSummary = Array.isArray(participantMetadata?.submissionSummary)
    ? (participantMetadata?.submissionSummary as Array<Record<string, unknown>>)
        .filter((row) => typeof row?.questionTitle === "string" && row.questionTitle.trim().length > 0)
        .map((row) => ({
          questionTitle: String(row.questionTitle),
          verdict: String(row.verdict ?? "unknown"),
          score: Number(row.score ?? 0),
          topics: Array.isArray(row.topics) ? row.topics.map((t) => String(t)) : [],
          language: row.language ? String(row.language) : undefined,
          submittedAnswerExcerpt: row.submittedAnswerExcerpt
            ? String(row.submittedAnswerExcerpt).slice(0, 800)
            : undefined,
        }))
    : [];

  const templateQuestionType =
    (interview.questions?.find((q: any) => typeof q?.type === "string")?.type as string | undefined) ?? "OPEN_ENDED";

  const personalizedQuestions = submissionSummary.length > 0
    ? submissionSummary.map((item, idx) => ({
        text: `Let's discuss your solution for \"${item.questionTitle}\". Explain your approach, time/space complexity, trade-offs, and improvements.`,
        type: templateQuestionType,
        description:
          `Result: ${item.verdict}; Score: ${item.score}; Topics: ${item.topics.join(", ") || "N/A"}`
          + (item.language ? `; Language: ${item.language}` : "")
          + (item.submittedAnswerExcerpt
            ? `\nSubmitted answer excerpt:\n${item.submittedAnswerExcerpt}`
            : ""),
        options: null,
        starterCode: null,
        order: idx,
      }))
    : null;

  const effectiveQuestions = personalizedQuestions
    ?? interview.questions.map((q: any) => ({
      text: q.text,
      type: q.type,
      description: q.description,
      options: q.options,
      starterCode: q.starterCode as { language: string; code: string } | null,
      order: q.order,
    }));

  if (!session) {
    return <PreparingScreen />;
  }

  if (completed || session.status === "COMPLETED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto h-16 w-16 text-secondary-500" />
            <h2 className="mt-4 text-2xl font-bold">Thank you!</h2>
            <p className="mt-2 text-muted-foreground">
              Your interview has been completed successfully. We appreciate your
              time and thoughtful responses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!onboardingDone) {
    return (
      <IntervieweeOnboarding
        interviewTitle={interview.title}
        interviewDescription={
          personalizedQuestions
            ? `${interview.description ?? ""}\n\nThis interview is personalized based on your coding exam submissions.`.trim()
            : interview.description
        }
        questionCount={effectiveQuestions.length}
        timeLimitMinutes={interview.timeLimitMinutes}
        language={interview.language}
        antiCheatingEnabled={!!interview.antiCheatingEnabled}
        voiceEnabled={!!interview.voiceEnabled}
        chatEnabled={!!interview.chatEnabled}
        aiName={interview.aiName}
        questionTypes={effectiveQuestions.map((q: any) => q.type as string)}
        onComplete={() => setOnboardingDone(true)}
      />
    );
  }

  const useVoice = interview.voiceEnabled;

  if (useVoice) {
    const interviewContext = {
      title: interview.title,
      objective: personalizedQuestions
        ? `${interview.objective ?? ""}\nFocus strictly on the candidate's solved coding questions and their submitted answers. Evaluate approach, algorithm choice, correctness, complexity, and optimization reasoning.`.trim()
        : interview.objective,
      aiName: interview.aiName,
      aiTone: interview.aiTone,
      language: interview.language,
      followUpDepth: interview.followUpDepth,
      examContext: personalizedQuestions
        ? {
            source: String(participantMetadata?.source ?? "coding-platform"),
            examScore: Number(participantMetadata?.examScore ?? 0),
            weakTopics: Array.isArray(participantMetadata?.weakTopics)
              ? participantMetadata?.weakTopics.map((t: unknown) => String(t))
              : [],
            submissionSummary,
          }
        : undefined,
      questions: effectiveQuestions,
    };

    return (
      <>
        <AntiCheatingGuard enabled={!!interview.antiCheatingEnabled} sessionId={session.id} />
        <VoiceInterface
          sessionId={session.id}
          interviewId={interview.id}
          interviewTitle={interview.title}
          aiName={interview.aiName}
          questionCount={effectiveQuestions.length}
          interviewContext={interviewContext}
          durationMinutes={interview.timeLimitMinutes ?? undefined}
          chatEnabled={!!interview.chatEnabled}
          onComplete={() => setCompleted(true)}
          videoMode={!!interview.videoEnabled}
          recordingConfig={parseRecordingConfig((interview as any).recordingConfig)}
          noiseCancellationEnabled={!!(interview as any).noiseCancellationEnabled}
        />
      </>
    );
  }

  return (
    <>
      <AntiCheatingGuard enabled={!!interview.antiCheatingEnabled} sessionId={session.id} />
      <ChatInterface
        sessionId={session.id}
        interview={{
          ...interview,
          objective: personalizedQuestions
            ? `${interview.objective ?? ""}\nFocus strictly on the candidate's solved coding questions and their submitted answers.`.trim()
            : interview.objective,
          questions: effectiveQuestions.map((q: any) => ({
            ...q,
            starterCode: q.starterCode as { language: string; code: string } | null,
          })),
        }}
        durationMinutes={interview.timeLimitMinutes ?? undefined}
        onComplete={() => setCompleted(true)}
      />
    </>
  );
}
