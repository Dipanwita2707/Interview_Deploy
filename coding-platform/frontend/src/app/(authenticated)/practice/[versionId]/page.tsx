'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { practiceApi, questionApi } from '@/lib/api';
import { useEditorStore, LANGUAGES } from '@/stores/editor-store';
import type { Question, Submission, TestResult } from '@/types';

// Lazy-load Monaco to avoid SSR issues
const CodeEditor = dynamic(() => import('@/components/editor/CodeEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-[var(--bg-editor)] flex items-center justify-center">
      <span className="text-gray-400 text-sm">Loading editor…</span>
    </div>
  ),
});

// ─── Verdict Banner ─────────────────────────────────────────────────────────
const VERDICT_CONFIG: Record<string, { bg: string; border: string; textColor: string; icon: string; label: string }> = {
  accepted:             { bg: 'bg-green-50',  border: 'border-green-200',  textColor: 'text-green-600',  icon: '✓', label: 'Accepted' },
  wrong_answer:         { bg: 'bg-red-50',    border: 'border-red-200',    textColor: 'text-red-600',    icon: '✗', label: 'Wrong Answer' },
  compile_error:        { bg: 'bg-red-50',    border: 'border-red-200',    textColor: 'text-red-600',    icon: '✗', label: 'Compile Error' },
  runtime_error:        { bg: 'bg-orange-50', border: 'border-orange-200', textColor: 'text-orange-600', icon: '⚠', label: 'Runtime Error' },
  time_limit_exceeded:  { bg: 'bg-amber-50',  border: 'border-amber-200',  textColor: 'text-amber-600',  icon: '⏱', label: 'Time Limit Exceeded' },
  memory_limit_exceeded:{ bg: 'bg-amber-50',  border: 'border-amber-200',  textColor: 'text-amber-600',  icon: '💾', label: 'Memory Limit Exceeded' },
  pending:              { bg: 'bg-orange-50',  border: 'border-orange-200',  textColor: 'text-orange-500',  icon: '…', label: 'Evaluating…' },
};

function VerdictBanner({ submission }: { submission: Submission }) {
  const cfg = VERDICT_CONFIG[submission.verdict] ?? {
    bg: 'bg-gray-50', border: 'border-gray-200', textColor: 'text-gray-600', icon: '?', label: submission.verdict,
  };
  const isPending = submission.verdict === 'pending';
  return (
    <div className={`rounded-lg border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className={`flex items-center gap-2 text-lg font-bold ${cfg.textColor} mb-3`}>
        {isPending ? (
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : <span className="text-xl">{cfg.icon}</span>}
        <span>{cfg.label}</span>
      </div>
      {!isPending && (
        <div className="flex flex-wrap gap-6">
          {submission.passed_count !== undefined && submission.total_count !== undefined && (
            <div>
              <p className="text-xs text-[var(--text-secondary)]">Test Cases</p>
              <p className={`text-sm font-semibold ${cfg.textColor}`}>{submission.passed_count} / {submission.total_count}</p>
            </div>
          )}
          {submission.execution_time_ms !== undefined && (
            <div>
              <p className="text-xs text-[var(--text-secondary)]">Runtime</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{submission.execution_time_ms} ms</p>
            </div>
          )}
          {submission.memory_used_kb !== undefined && (
            <div>
              <p className="text-xs text-[var(--text-secondary)]">Memory</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{(submission.memory_used_kb / 1024).toFixed(1)} MB</p>
            </div>
          )}
          {submission.score !== undefined && (
            <div>
              <p className="text-xs text-[var(--text-secondary)]">Score</p>
              <p className="text-sm font-semibold text-[var(--text-primary)]">{submission.score} pts</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Per-test-case result detail ──────────────────────────────────────────────
function TestResultDetail({ results, question }: { results: TestResult[]; question: Question }) {
  const [activeCase, setActiveCase] = useState(0);
  const result = results[activeCase];
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {results.map((r, i) => (
          <button key={i} onClick={() => setActiveCase(i)}
            className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
              activeCase === i
                ? r.passed ? 'bg-green-100 text-green-700 border-green-400' : 'bg-red-100 text-red-700 border-red-400'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-gray-400'
            }`}
          >
            {r.passed ? '✓' : '✗'} Case {i + 1}
          </button>
        ))}
      </div>
      {result && (
        <div className="space-y-2">
          {result.actual_output !== undefined && (
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-1">Your Output</p>
              <pre className="bg-[var(--bg-inset)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] overflow-x-auto whitespace-pre-wrap">
                {result.actual_output || '(empty)'}
              </pre>
            </div>
          )}
          {question.examples?.[activeCase] && (
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-1">Expected</p>
              <pre className="bg-[var(--bg-inset)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] overflow-x-auto">
                {question.examples[activeCase].output}
              </pre>
            </div>
          )}
          {question.examples?.[activeCase] && (
            <div>
              <p className="text-xs text-[var(--text-secondary)] mb-1">Input</p>
              <pre className="bg-[var(--bg-inset)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] overflow-x-auto">
                {question.examples[activeCase].input}
              </pre>
            </div>
          )}
          <div className="flex gap-4 text-xs text-[var(--text-secondary)] pt-1">
            {result.execution_time_ms !== undefined && <span>⏱ {result.execution_time_ms} ms</span>}
            {result.memory_used_kb !== undefined && <span>💾 {(result.memory_used_kb / 1024).toFixed(1)} MB</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sample test-case viewer (before submit) ──────────────────────────────────
function SampleTestCases({ question }: { question: Question }) {
  const [activeCase, setActiveCase] = useState(0);
  const examples = question.examples ?? [];
  if (!examples.length) {
    return <div className="p-4 text-center text-sm text-[var(--text-secondary)]">No sample test cases available.</div>;
  }
  const ex = examples[activeCase];
  return (
    <div>
      <div className="flex gap-1.5 flex-wrap mb-3">
        {examples.map((_, i) => (
          <button key={i} onClick={() => setActiveCase(i)}
            className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
              activeCase === i
                ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                : 'bg-[var(--bg-secondary)] border-[var(--border)] text-[var(--text-secondary)] hover:border-gray-400'
            }`}
          >Case {i + 1}</button>
        ))}
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1">Input</p>
          <pre className="bg-[var(--bg-inset)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] whitespace-pre-wrap overflow-x-auto">{ex.input}</pre>
        </div>
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1">Expected Output</p>
          <pre className="bg-[var(--bg-inset)] rounded px-3 py-2 font-mono text-sm text-[var(--text-primary)] overflow-x-auto">{ex.output}</pre>
        </div>
        {ex.explanation && (
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1">Explanation</p>
            <p className="text-sm text-[var(--text-primary)]">{ex.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const DIFF_STYLE: Record<string, string> = {
  easy:   'text-green-600 bg-green-50 border-green-200',
  medium: 'text-amber-600 bg-amber-50 border-amber-200',
  hard:   'text-red-600   bg-red-50   border-red-200',
};

const CONSOLE_HEIGHT = 260;

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PracticeProblemPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const router = useRouter();

  // data
  const [question, setQuestion] = useState<Question | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissionHistory, setSubmissionHistory] = useState<Submission[]>([]);
  const [loadError, setLoadError] = useState('');
  const [submitError, setSubmitError] = useState('');

  // ui
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [leftTab, setLeftTab] = useState<'description' | 'submissions'>('description');
  const [consoleTab, setConsoleTab] = useState<'testcases' | 'result'>('testcases');
  const [consoleOpen, setConsoleOpen] = useState(true);

  const { code, language, languageId, resetEditor } = useEditorStore();

  // ── Load question + session ────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const qRes = await questionApi.getByVersionId(versionId);
        const q = qRes.data.data as Question;
        setQuestion(q);
        // Pick starter code — prefer Python, fall back to first available
        const starterPy = q.starter_code?.find((s) => s.language_name === 'python');
        const starter = starterPy ?? q.starter_code?.[0];
        if (starter) {
          // Look up the LANGUAGES entry so we can set both monacoId + judge0Id
          const langEntry = LANGUAGES.find((l) => l.monacoId === (starter.language_name || 'python'));
          resetEditor({
            code: starter.code,
            language: langEntry?.monacoId ?? 'python',
            languageId: langEntry?.judge0Id ?? 71,
          });
        }
        const sRes = await practiceApi.createSession();
        const session = sRes.data.data as { id: string };
        setSessionId(session.id);
      } catch (err) {
        console.error('Failed to load problem:', err);
        setLoadError('Failed to load problem. Please go back and try again.');
      }
    };
    load();
  }, [versionId, resetEditor]);

  // ── Submit core (shared by Run + Submit) ───────────────────────────────────
  const handleSubmitCore = useCallback(
    async (isRun: boolean) => {
      if (!sessionId || !question) return;
      const setFlag = isRun ? setIsRunning : setIsSubmitting;
      setFlag(true);
      setSubmitError('');
      setSubmission(null);
      setConsoleTab('result');
      setConsoleOpen(true);
      try {
        const res = await practiceApi.submitCode({
          sessionId,
          questionId: question.question_id ?? question.id,
          versionId,
          language,
          sourceCode: code,
        });
        const sub = res.data.data as Submission;
        setSubmission(sub);
        const subId = (sub as unknown as Record<string, string>).id ?? (sub as unknown as Record<string, string>).submissionId;
        if (!subId || sub.verdict !== 'pending') {
          setFlag(false);
          if (sub.verdict && sub.verdict !== 'pending') setSubmissionHistory((h) => [sub, ...h]);
          return;
        }
        let polls = 0;
        const poll = setInterval(async () => {
          polls++;
          try {
            const pollRes = await practiceApi.getSubmission(subId);
            const updated = pollRes.data.data as Submission;
            setSubmission(updated);
            if (updated.verdict !== 'pending' || polls >= 30) {
              clearInterval(poll);
              setFlag(false);
              if (updated.verdict !== 'pending') setSubmissionHistory((h) => [updated, ...h]);
            }
          } catch { clearInterval(poll); setFlag(false); }
        }, 1500);
      } catch (err: unknown) {
        setFlag(false);
        setSubmitError(err instanceof Error ? err.message : 'Submission failed. Please try again.');
      }
    },
    [sessionId, versionId, language, code, question],
  );

  const handleRun    = useCallback(() => handleSubmitCore(true),  [handleSubmitCore]);
  const handleSubmit = useCallback(() => handleSubmitCore(false), [handleSubmitCore]);

  const starterCodeMap: Record<string, string> = {};
  question?.starter_code?.forEach((sc) => { starterCodeMap[sc.language_name] = sc.code; });

  // ── Loading / error screens ────────────────────────────────────────────────
  if (loadError && !question) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--bg-primary)] flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-red-500 text-base">⚠ {loadError}</p>
          <button onClick={() => router.push('/practice')} className="text-[var(--accent)] text-sm hover:underline">
            ← Back to Practice
          </button>
        </div>
      </div>
    );
  }
  if (!question) {
    return (
      <div className="fixed inset-0 z-50 bg-[var(--bg-primary)] flex items-center justify-center">
        <svg className="animate-spin h-8 w-8 text-[var(--accent)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const diffStyle = DIFF_STYLE[question.difficulty?.toLowerCase()] ?? 'text-gray-600 bg-gray-50 border-gray-200';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg-primary)] flex flex-col overflow-hidden">

      {/* ═══ TOP BAR ═══════════════════════════════════════════════════════ */}
      <header className="shrink-0 flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <button
          onClick={() => router.push('/practice')}
          className="flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Practice
        </button>

        <div className="h-4 w-px bg-[var(--border)]" />

        <span className="font-semibold text-sm text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-xs">
          {question.title}
        </span>

        <span className={`px-2 py-0.5 text-xs font-medium rounded border capitalize ${diffStyle}`}>
          {question.difficulty}
        </span>

        <div className="hidden sm:flex gap-1.5 flex-wrap">
          {question.topic_tags?.slice(0, 5).map((tag) => (
            <span key={tag} className="px-2 py-0.5 text-xs bg-[var(--bg-primary)] border border-[var(--border)] rounded text-[var(--text-secondary)]">
              {tag}
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4 text-xs text-[var(--text-secondary)] shrink-0">
          <span title="Time limit">⏱ {question.time_limit_ms} ms</span>
          <span title="Memory limit">💾 {Math.round(question.memory_limit_kb / 1024)} MB</span>
        </div>
      </header>

      {/* ═══ MAIN SPLIT ════════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── LEFT: Description / Submissions ─────────────────────────── */}
        <div className="w-[44%] min-w-[300px] max-w-[580px] flex flex-col border-r border-[var(--border)]">
          {/* Tab bar */}
          <div className="shrink-0 flex bg-[var(--bg-secondary)] border-b border-[var(--border)]">
            {(['description', 'submissions'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={`px-5 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                  leftTab === tab
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab}
                {tab === 'submissions' && submissionHistory.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 bg-[var(--accent-soft)] text-[var(--accent-strong)] text-xs rounded-full">
                    {submissionHistory.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">

            {/* Description */}
            {leftTab === 'description' && (
              <div className="px-6 py-5 space-y-5">
                <div className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                  {question.description}
                </div>

                {question.examples && question.examples.length > 0 && (
                  <section>
                    <h3 className="font-semibold text-[var(--text-primary)] mb-3">Examples</h3>
                    <div className="space-y-3">
                      {question.examples.map((ex, i) => (
                        <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden">
                          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-primary)]">
                            <span className="text-xs font-semibold text-[var(--text-secondary)]">Example {i + 1}</span>
                          </div>
                          <div className="px-4 py-3 space-y-1.5 font-mono text-xs">
                            <div><span className="text-[var(--text-secondary)]">Input: </span><span className="text-[var(--text-primary)]">{ex.input}</span></div>
                            <div><span className="text-[var(--text-secondary)]">Output: </span><span className="text-[var(--text-primary)]">{ex.output}</span></div>
                            {ex.explanation && (
                              <div className="font-sans text-[var(--text-secondary)] pt-1 text-xs">
                                <span className="font-semibold">Explanation: </span>{ex.explanation}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {question.constraints && (
                  <section>
                    <h3 className="font-semibold text-[var(--text-primary)] mb-2">Constraints</h3>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                      <pre className="font-mono text-xs text-[var(--text-secondary)] whitespace-pre-wrap">{question.constraints}</pre>
                    </div>
                  </section>
                )}

                {question.input_format && (
                  <section>
                    <h3 className="font-semibold text-[var(--text-primary)] mb-1">Input Format</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{question.input_format}</p>
                  </section>
                )}
                {question.output_format && (
                  <section>
                    <h3 className="font-semibold text-[var(--text-primary)] mb-1">Output Format</h3>
                    <p className="text-sm text-[var(--text-secondary)]">{question.output_format}</p>
                  </section>
                )}

                <div className="flex gap-6 text-xs text-[var(--text-secondary)] border-t border-[var(--border)] pt-4">
                  <span>Time Limit: <strong className="text-[var(--text-primary)]">{question.time_limit_ms} ms</strong></span>
                  <span>Memory: <strong className="text-[var(--text-primary)]">{Math.round(question.memory_limit_kb / 1024)} MB</strong></span>
                </div>
              </div>
            )}

            {/* Submissions */}
            {leftTab === 'submissions' && (
              <div className="px-4 py-4">
                {submissionHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-[var(--text-secondary)]">
                    <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">No submissions yet</p>
                    <p className="text-xs mt-1 opacity-70">Click Submit to see your results here</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {submissionHistory.map((sub, i) => (
                      <div key={sub.id ?? i} className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                        <div className="flex items-center gap-3">
                          <span className={`text-sm font-semibold ${sub.verdict === 'accepted' ? 'text-green-600' : 'text-red-500'}`}>
                            {sub.verdict === 'accepted' ? '✓ Accepted' : `✗ ${sub.verdict?.replace(/_/g, ' ') ?? 'Error'}`}
                          </span>
                          {sub.passed_count !== undefined && (
                            <span className="text-xs text-[var(--text-secondary)]">{sub.passed_count}/{sub.total_count} cases</span>
                          )}
                        </div>
                        <div className="flex gap-3 text-xs text-[var(--text-secondary)]">
                          {sub.execution_time_ms !== undefined && <span>{sub.execution_time_ms} ms</span>}
                          {sub.score !== undefined && <span>{sub.score} pts</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Editor + Console ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Monaco editor */}
          <div className="flex-1 min-h-0">
            <CodeEditor
              height="100%"
              starterCode={starterCodeMap}
              onRun={handleRun}
              onSubmit={handleSubmit}
              isRunning={isRunning}
              isSubmitting={isSubmitting}
            />
          </div>

          {/* Console */}
          <div
            className="shrink-0 flex flex-col border-t border-[var(--border)] bg-[var(--bg-primary)] transition-all duration-150"
            style={{ height: consoleOpen ? `${CONSOLE_HEIGHT}px` : '36px' }}
          >
            {/* Console tab bar */}
            <div className="shrink-0 flex items-center bg-[var(--bg-secondary)] border-b border-[var(--border)] px-3 h-9">
              <button
                onClick={() => setConsoleOpen(!consoleOpen)}
                title={consoleOpen ? 'Collapse console' : 'Expand console'}
                className="mr-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <svg className={`w-3.5 h-3.5 transition-transform ${consoleOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {consoleOpen && (
                <>
                  {(['testcases', 'result'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setConsoleTab(tab)}
                      className={`px-3 py-1 text-xs font-medium border-b-2 transition-colors ${
                        consoleTab === tab
                          ? 'border-[var(--accent)] text-[var(--accent)]'
                          : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tab === 'testcases' ? 'Test Cases' : 'Test Result'}
                    </button>
                  ))}

                  {(isRunning || isSubmitting) && (
                    <span className="ml-3 flex items-center gap-1.5 text-xs text-[var(--accent)]">
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {isRunning ? 'Running…' : 'Submitting…'}
                    </span>
                  )}

                  {submission && submission.verdict !== 'pending' && (
                    <span className={`ml-auto text-xs font-semibold ${submission.verdict === 'accepted' ? 'text-green-600' : 'text-red-500'}`}>
                      {submission.verdict === 'accepted'
                        ? '✓ Accepted'
                        : `✗ ${VERDICT_CONFIG[submission.verdict]?.label ?? submission.verdict}`}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Console body */}
            {consoleOpen && (
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {consoleTab === 'testcases' && <SampleTestCases question={question} />}

                {consoleTab === 'result' && (
                  <div className="space-y-4">
                    {submitError && (
                      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{submitError}</div>
                    )}
                    {(isRunning || isSubmitting) && !submission && (
                      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-2">
                        <svg className="animate-spin h-4 w-4 text-[var(--accent)]" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Evaluating your code…
                      </div>
                    )}
                    {submission && <VerdictBanner submission={submission} />}
                    {submission?.test_results && submission.test_results.length > 0 && (
                      <TestResultDetail results={submission.test_results} question={question} />
                    )}
                    {!submission && !isRunning && !isSubmitting && !submitError && (
                      <div className="text-center py-6 text-sm text-[var(--text-secondary)]">
                        <p>Click <strong className="text-[var(--text-primary)]">Run</strong> to test against sample cases</p>
                        <p className="mt-1">or <strong className="text-[var(--text-primary)]">Submit</strong> to run against all test cases</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
