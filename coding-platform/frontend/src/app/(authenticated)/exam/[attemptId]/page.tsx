'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { examApi } from '@/lib/api';
import { useEditorStore, LANGUAGES } from '@/stores/editor-store';
import TestResultsPanel from '@/components/ui/TestResultsPanel';
import ProctorOverlay, { ViolationBanner } from '@/components/exam/ProctorOverlay';
import { useProctor, MAX_VIOLATIONS } from '@/hooks/useProctor';
import type { ExamAttempt, Question, Submission } from '@/types';

const CodeEditor = dynamic(() => import('@/components/editor/CodeEditor'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-[var(--bg-editor)] rounded-lg flex items-center justify-center">
      <span className="text-gray-400">Loading editor…</span>
    </div>
  ),
});

export default function ExamAttemptPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const router = useRouter();
  const [attempt, setAttempt] = useState<ExamAttempt | null>(null);
  const [activeQuestion, setActiveQuestion] = useState<number>(0);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [proctorEnabled, setProctorEnabled] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [interviewRedirectUrl, setInterviewRedirectUrl] = useState<string | null>(null);
  /** Replace window.confirm (exits fullscreen) with a custom confirm dialog */
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const { code, language, languageId, resetEditor } = useEditorStore();

  // ── Auto-submit without confirm (called by proctoring on max violations) ──
  const handleAutoSubmit = useCallback(async () => {
    try {
      const res = await examApi.submitExam(attemptId);
      const sessionUrl = (res.data?.data as { interviewSessionUrl?: string })?.interviewSessionUrl;
      if (sessionUrl) {
        window.location.href = sessionUrl;
        return;
      }
    } catch (err) {
      console.error('Auto-submit failed:', err);
    }
    router.push('/exam');
  }, [attemptId, router]);

  // ── Proctoring hook ──────────────────────────────────────────
  const {
    isFullscreen,
    violationCount,
    showWarning,
    currentWarning,
    terminated,
    extensionInstalled,
    requestFullscreen,
    dismissWarning,
  } = useProctor({ attemptId, onAutoSubmit: handleAutoSubmit, enabled: proctorEnabled });

  // ── Load exam attempt ────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res = await examApi.getAttempt(attemptId);
        const payload = res.data.data as { attempt: ExamAttempt; proctoring: unknown };
        let data: ExamAttempt = payload.attempt ?? (payload as unknown as ExamAttempt);
        setAttempt(data);

        // Start exam if not yet started
        if (data.state === 'created' || data.state === 'ready') {
          await examApi.startExam(attemptId);
          const refreshed = await examApi.getAttempt(attemptId);
          const rp = refreshed.data.data as { attempt: ExamAttempt; proctoring: unknown };
          data = rp.attempt ?? (rp as unknown as ExamAttempt);
          setAttempt(data);
        }

        // Enable proctoring now that exam is live
        setProctorEnabled(true);

        // Pre-load starter code for first question
        const firstQ = data.questions?.[0];
        if (firstQ?.starter_code?.length) {
          const sc = firstQ.starter_code[0];
          const langEntry = LANGUAGES.find((l) => l.monacoId === sc.language_name);
          resetEditor({
            code: sc.code,
            language: langEntry?.monacoId ?? 'python',
            languageId: langEntry?.judge0Id ?? 71,
          });
        }

        // Calculate remaining time
        if (data.started_at) {
          const startMs = new Date(data.started_at).getTime();
          const endMs = startMs + data.time_limit_minutes * 60 * 1000;
          setTimeLeft(Math.max(0, Math.floor((endMs - Date.now()) / 1000)));
        }
      } catch (err) {
        console.error('Failed to load exam:', err);
        setError('Failed to load exam. Please refresh or contact support.');
      }
    };
    load();
  }, [attemptId]);

  // ── Timer countdown ──────────────────────────────────────────
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ── Run / submit code ────────────────────────────────────────
  const handleRunCode = useCallback(async () => {
    if (!attempt?.questions?.[activeQuestion]) return;
    if (isRunning) return;  // prevent double-submit while polling
    const question = attempt.questions[activeQuestion];
    const questionId = question.question_id;
    if (!questionId) {
      setError('Question data is incomplete — please refresh the page.');
      return;
    }
    setIsRunning(true);
    setError('');
    try {
      const res = await examApi.submitCode(attemptId, {
        questionId,
        versionId: question.version_id,
        language,
        sourceCode: code,
      });
      const initial = res.data.data as Submission;
      setSubmission(initial);

      // Poll until verdict is no longer PENDING (local executor is async)
      if (initial.verdict === 'pending') {
        let attempts = 0;
        const maxAttempts = 20; // 20 × 1.5s = 30s max
        const poll = setInterval(async () => {
          attempts++;
          try {
            const pollRes = await examApi.getSubmission(attemptId, initial.id);
            const updated = pollRes.data.data as Submission;
            setSubmission(updated);
            if (updated.verdict !== 'pending' || attempts >= maxAttempts) {
              clearInterval(poll);
              setIsRunning(false);
            }
          } catch {
            clearInterval(poll);
            setIsRunning(false);
          }
        }, 1500);
      } else {
        setIsRunning(false);
      }
    } catch (err: unknown) {
      // Log full error detail to console to help debug 422 validation failures
      if ((err as any)?.response?.data) {
        console.error('Submission error detail:', JSON.stringify((err as any).response.data));
      }
      setError(err instanceof Error ? err.message : 'Submission failed');
      setIsRunning(false);
    }
  }, [attempt, activeQuestion, attemptId, language, code, isRunning]);

  // ── Final exam submit ────────────────────────────────────────
  const handleSubmitExam = async () => {
    setShowSubmitConfirm(false);
    setIsSubmitting(true);
    try {
      const res = await examApi.submitExam(attemptId);
      const sessionUrl = (res.data?.data as { interviewSessionUrl?: string })?.interviewSessionUrl;
      if (sessionUrl) {
        // Redirect directly to interview platform
        window.location.href = sessionUrl;
        return;
      }
      router.push('/exam');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit exam');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Question navigation ──────────────────────────────────────
  const switchQuestion = (idx: number) => {
    setActiveQuestion(idx);
    setSubmission(null);
    const q = attempt?.questions?.[idx];
    if (q?.starter_code?.length) {
      // Try to keep the current language; fall back to first available
      const scForCurrentLang = q.starter_code.find((sc) => sc.language_name === language);
      const sc = scForCurrentLang ?? q.starter_code[0];
      const langEntry = LANGUAGES.find((l) => l.monacoId === sc.language_name);
      resetEditor({
        code: sc.code,
        language: langEntry?.monacoId ?? language,
        languageId: langEntry?.judge0Id ?? languageId,
      });
    } else {
      // No starter code — keep current language, clear code
      resetEditor({ language, languageId, code: '' });
    }
  };

  // Build a language → starter-code map — MUST be before any early return (Rules of Hooks)
  const questions = attempt?.questions || [];
  const currentQ = questions[activeQuestion];
  const starterCodeMap = useMemo(() => {
    if (!currentQ?.starter_code?.length) return {};
    return Object.fromEntries(currentQ.starter_code.map((sc) => [sc.language_name, sc.code]));
  }, [currentQ]);

  // ── Loading state ────────────────────────────────────────────
  if (!attempt) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--text-secondary)]">
        {error || 'Loading exam…'}
      </div>
    );
  }

  const timeIsLow = timeLeft !== null && timeLeft < 300;

  return (
    <>
      {/* ── Proctor overlays (fullscreen gate / warnings / terminated) ── */}
      <ProctorOverlay
        isFullscreen={isFullscreen}
        violationCount={violationCount}
        showWarning={showWarning}
        currentWarning={currentWarning}
        terminated={terminated}
        extensionInstalled={extensionInstalled}
        onRequestFullscreen={requestFullscreen}
        onDismissWarning={dismissWarning}
      />

      {/* ── Custom submit confirm (replaces window.confirm — keeps fullscreen) ── */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[9997] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
            <div className="px-6 py-4 border-b">
              <h3 className="font-bold text-lg text-gray-900">Submit Exam?</h3>
              <p className="text-gray-500 text-sm mt-1">
                This action cannot be undone. All your current answers will be submitted.
              </p>
            </div>
            <div className="px-6 py-4 flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Submitting…' : 'Submit Exam'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Interview redirect modal ── */}
      {interviewRedirectUrl && (
        <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-blue-600 to-indigo-600">
              <h3 className="font-bold text-xl text-white">🎉 Exam Submitted!</h3>
              <p className="text-blue-100 text-sm mt-1">
                Your results are being processed. An AI interview has been prepared for you.
              </p>
            </div>
            <div className="px-6 py-5">
              <p className="text-gray-700 text-sm mb-4">
                You will now be taken to a short AI-powered interview based on the topics from this exam.
                You can re-enter this interview up to <strong>5 times</strong>.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => router.push('/exam')}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors text-sm"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => { window.location.href = interviewRedirectUrl; }}
                  className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors text-sm"
                >
                  Start Interview →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Main exam UI (fixed overlay to cover navbar in fullscreen) ── */}
      <div className="fixed inset-0 z-[9990] bg-[var(--bg-primary)] flex flex-col overflow-hidden">
        {/* Violation banner */}
        <ViolationBanner violationCount={violationCount} />

        {/* Exam header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Shield badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 rounded-md text-white text-xs font-semibold">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              SECURE
            </div>

            <span className="font-semibold text-sm hidden sm:block">Exam</span>

            {/* Question pills */}
            <div className="flex gap-1">
              {questions.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => switchQuestion(idx)}
                  className={`w-8 h-8 rounded text-xs font-semibold transition-colors ${
                    idx === activeQuestion
                      ? 'bg-blue-600 text-white'
                      : 'bg-[var(--bg-primary)] border border-[var(--border)] hover:border-blue-400 text-[var(--text-secondary)]'
                  }`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {timeLeft !== null && (
              <span
                className={`text-base font-mono font-bold tabular-nums px-3 py-1 rounded-md ${
                  timeIsLow
                    ? 'bg-red-600 text-white animate-pulse'
                    : 'bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)]'
                }`}
              >
                ⏱ {formatTime(timeLeft)}
              </span>
            )}

            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="px-4 py-1.5 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Submit Exam
            </button>
          </div>
        </div>

        {/* Error strip */}
        {error && (
          <div className="px-4 py-2 bg-red-50 text-red-700 text-sm border-b border-red-200 flex-shrink-0">
            {error}
          </div>
        )}

        {/* Problem + Editor */}
        {currentQ ? (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 min-h-0 overflow-hidden">
            {/* Problem pane */}
            <div className="overflow-y-auto border border-[var(--border)] rounded-xl p-5 bg-[var(--bg-secondary)]">
              <div className="flex items-start gap-2 mb-3">
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                  Q{activeQuestion + 1}
                </span>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    currentQ.difficulty === 'easy'
                      ? 'bg-green-100 text-green-700'
                      : currentQ.difficulty === 'medium'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {currentQ.difficulty}
                </span>
              </div>

              <h2 className="text-lg font-bold mb-3 text-[var(--text-primary)]">
                {currentQ.title}
              </h2>

              <div
                className="prose prose-sm max-w-none text-[var(--text-secondary)]"
                dangerouslySetInnerHTML={{ __html: currentQ.description }}
              />

              {currentQ.examples?.map((ex, i) => (
                <div
                  key={i}
                  className="mt-4 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-3 text-sm font-mono"
                >
                  <p className="text-xs font-semibold text-gray-500 mb-2">Example {i + 1}</p>
                  <div className="text-[var(--text-primary)]">
                    <span className="text-gray-500">Input: </span>
                    {ex.input}
                  </div>
                  <div className="text-[var(--text-primary)] mt-1">
                    <span className="text-gray-500">Output: </span>
                    {ex.output}
                  </div>
                  {ex.explanation && (
                    <div className="mt-1 text-gray-400 text-xs">{ex.explanation}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Editor + results */}
            <div className="flex flex-col gap-2 min-h-0">
              <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-[var(--border)]">
                <CodeEditor height="100%" onRun={handleRunCode} starterCode={starterCodeMap} />
              </div>
              <div className="border border-[var(--border)] rounded-xl overflow-hidden max-h-44 overflow-y-auto bg-[var(--bg-secondary)]">
                <TestResultsPanel
                  results={submission?.test_results || []}
                  isRunning={isRunning}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
            No questions available for this exam.
          </div>
        )}
      </div>
    </>
  );
}
