'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { examApi } from '@/lib/api';
import type { ExamAttempt, RuleTemplate } from '@/types';

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  created: { label: 'Not Started', color: 'bg-gray-100 text-gray-800' },
  ready: { label: 'Ready', color: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' },
  submitted: { label: 'Submitted', color: 'bg-green-100 text-green-800' },
  auto_submitted: { label: 'Auto Submitted', color: 'bg-orange-100 text-orange-800' },
  under_review: { label: 'Under Review', color: 'bg-purple-100 text-purple-800' },
  reviewed: { label: 'Reviewed', color: 'bg-green-100 text-green-800' },
  flagged: { label: 'Flagged', color: 'bg-red-100 text-red-800' },
  evaluated: { label: 'Evaluated', color: 'bg-emerald-100 text-emerald-800' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function scoreColor(pct: number) {
  if (pct >= 75) return 'text-emerald-400';
  if (pct >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function getVerdictDetails(verdict: string | null) {
  if (!verdict) {
    return {
      label: 'Not Attempted',
      color: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
      icon: '⚪'
    };
  }
  switch (verdict) {
    case 'accepted':
      return { label: 'Accepted', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: '✅' };
    case 'wrong_answer':
      return { label: 'Wrong Answer', color: 'bg-red-500/10 text-red-400 border-red-500/20', icon: '❌' };
    case 'compile_error':
      return { label: 'Compile Error', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: '⚠️' };
    case 'runtime_error':
      return { label: 'Runtime Error', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: '💥' };
    case 'time_limit_exceeded':
      return { label: 'Time Limit Exceeded', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: '⏱️' };
    case 'memory_limit_exceeded':
      return { label: 'Memory Limit Exceeded', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: '💾' };
    case 'pending':
      return { label: 'Pending', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: '⏳' };
    default:
      return { label: verdict.toUpperCase(), color: 'bg-gray-500/10 text-gray-400 border-gray-500/20', icon: '❓' };
  }
}

interface ExamEntry extends RuleTemplate {
  access_type?: 'open' | 'invited';
  invitation_id?: string;
  expires_at_inv?: string;
}

interface PendingAttempt {
  attempt_id: string;
  state: string;
  exam_name: string;
  duration_minutes: number;
  difficulty_distribution: Record<string, number>;
  created_at: string;
  started_at?: string;
}

interface CompletedAttempt {
  attempt_id: string;
  state: string;
  started_at: string | null;
  submitted_at: string | null;
  exam_name: string;
  duration_minutes: number;
  total_submissions: number;
  accepted_count: number;
  avg_score: number | null;
  avg_cyclomatic_complexity?: number | null;
  avg_maintainability_index?: number | null;
  max_nesting_depth?: number | null;
}

export default function ExamPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<ExamEntry[]>([]);
  const [pendingAttempts, setPendingAttempts] = useState<PendingAttempt[]>([]);
  const [completedAttempts, setCompletedAttempts] = useState<CompletedAttempt[]>([]);
  const [starting, setStarting] = useState<string | null>(null);
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [attemptDetails, setAttemptDetails] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  useEffect(() => {
    if (!selectedAttemptId) {
      setAttemptDetails(null);
      setDetailsError('');
      return;
    }
    const loadDetails = async () => {
      setDetailsLoading(true);
      setDetailsError('');
      try {
        const res = await examApi.getAttempt(selectedAttemptId);
        const payload = res.data.data as { attempt: any; proctoring: any };
        setAttemptDetails(payload.attempt ?? payload);
      } catch (err) {
        console.error('Failed to load exam details:', err);
        setDetailsError('Failed to load details. Please try again.');
      } finally {
        setDetailsLoading(false);
      }
    };
    loadDetails();
  }, [selectedAttemptId]);

  const topicsSummary = useMemo(() => {
    if (!attemptDetails || !attemptDetails.questions) return { weak: [], strong: [] };

    const weakSet = new Set<string>();
    const strongSet = new Set<string>();

    attemptDetails.questions.forEach((q: any) => {
      const qSubmissions = (attemptDetails.submissions || []).filter(
        (s: any) => s.version_id === q.version_id
      );
      const latestSub = qSubmissions.length > 0 ? qSubmissions[qSubmissions.length - 1] : null;
      const isAccepted = latestSub && latestSub.verdict === 'accepted';
      
      const qTopics = q.topic_tags || [];
      if (isAccepted) {
        qTopics.forEach((t: string) => strongSet.add(t));
      } else {
        qTopics.forEach((t: string) => weakSet.add(t));
      }
    });

    const weak = Array.from(weakSet);
    const strong = Array.from(strongSet).filter(t => !weakSet.has(t));

    return { weak, strong };
  }, [attemptDetails]);

  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [poolRes, attRes, compRes] = await Promise.all([
          examApi.getPool(),
          examApi.getMyAttempts().catch(() => ({ data: { data: [] } })),
          examApi.getCompletedAttempts().catch(() => ({ data: { data: [] } })),
        ]);
        setEntries((poolRes.data.data as ExamEntry[]) || []);
        setPendingAttempts((attRes.data.data as PendingAttempt[]) || []);
        setCompletedAttempts((compRes.data.data as CompletedAttempt[]) || []);
      } catch (err) {
        setError('Failed to load available exams');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleStartExam = async (templateId: string) => {
    setStarting(templateId);
    setError('');
    try {
      const res = await examApi.createSession(templateId);
      // Backend returns { attemptId } (not { id })
      const result = res.data.data as { attemptId?: string; id?: string };
      const id = result.attemptId ?? result.id;
      if (!id) throw new Error('No attempt ID returned from server');
      router.push(`/exam/${id}`);
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.error
        ?? (err instanceof Error ? err.message : 'Failed to create exam session');
      setError(msg);
      setStarting(null);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-[var(--text-secondary)]">Loading exams…</div>;
  }

  const invited = entries.filter((e) => e.access_type === 'invited');
  const open = entries.filter((e) => e.access_type !== 'invited');

  const ExamCard = ({ tmpl }: { tmpl: ExamEntry }) => {
    const raw = (tmpl as any).difficulty_distribution;
    const dist: Record<string, number> =
      typeof raw === 'string' ? JSON.parse(raw) : raw || {};

    const isStarting = starting === tmpl.id;

    return (
      <div className="border border-[var(--border)] rounded-xl p-5 hover:border-blue-300 transition-all bg-[var(--bg-secondary)]">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">{tmpl.name}</h3>
          <div className="flex gap-1 flex-shrink-0">
            {tmpl.access_type === 'invited' && (
              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-medium">Invited</span>
            )}
            {tmpl.is_default && (
              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">Open</span>
            )}
          </div>
        </div>

        {/* Company / Role */}
        {tmpl.department && (
          <p className="text-xs text-[var(--text-secondary)] mb-2">📚 {tmpl.department}</p>
        )}

        {/* Difficulty pills */}
        <div className="flex gap-2 mb-3 text-sm">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="text-green-600 font-medium">{dist.low ?? 0}</span>
            <span className="text-[var(--text-secondary)]">Easy</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
            <span className="text-yellow-600 font-medium">{dist.medium ?? 0}</span>
            <span className="text-[var(--text-secondary)]">Medium</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            <span className="text-red-600 font-medium">{dist.high ?? 0}</span>
            <span className="text-[var(--text-secondary)]">Hard</span>
          </span>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-4">
          <span>⏱ {(tmpl as any).time_limit_minutes ?? (tmpl as any).duration_minutes} minutes</span>
          {tmpl.access_type === 'invited' && tmpl.expires_at_inv && (
            <span className="text-orange-600">
              Expires {new Date(tmpl.expires_at_inv).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
            </span>
          )}
        </div>

        {/* Security notice */}
        <div className="flex items-center gap-1.5 text-xs text-blue-600 mb-4">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Proctored — fullscreen required
        </div>

        <button
          onClick={() => handleStartExam(tmpl.id)}
          disabled={isStarting}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {isStarting ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Starting…
            </>
          ) : (
            'Start Exam'
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📝 Exams</h1>
        <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          All exams are proctored &amp; secure
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm mb-4">{error}</div>
      )}

      {/* Pending / pre-launched attempts */}
      {pendingAttempts.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block animate-pulse" />
            Pending Exams — Ready to Begin ({pendingAttempts.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingAttempts.map((a) => {
              const dist = typeof a.difficulty_distribution === 'string'
                ? JSON.parse(a.difficulty_distribution) : a.difficulty_distribution || {};
              const stateLabel = a.state === 'ready' ? 'Assigned — Not Started' : a.state === 'started' ? 'In Progress' : 'Interrupted';
              const stateColor = a.state === 'ready' ? 'bg-blue-100 text-blue-700' : a.state === 'started' ? 'bg-yellow-100 text-yellow-700' : 'bg-orange-100 text-orange-700';
              return (
                <div key={a.attempt_id} className="border-2 border-orange-300 rounded-xl p-5 bg-orange-50">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">{a.exam_name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0 ${stateColor}`}>{stateLabel}</span>
                  </div>
                  <div className="flex gap-2 mb-3 text-sm">
                    <span className="text-green-600 font-medium">{dist.low ?? 0} Easy</span>
                    <span className="text-[var(--text-secondary)]">/</span>
                    <span className="text-yellow-600 font-medium">{dist.medium ?? 0} Medium</span>
                    <span className="text-[var(--text-secondary)]">/</span>
                    <span className="text-red-600 font-medium">{dist.high ?? 0} Hard</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mb-4">⏱ {a.duration_minutes} min · Assigned {new Date(a.created_at).toLocaleDateString('en-IN')}</p>
                  <button
                    onClick={() => router.push(`/exam/${a.attempt_id}`)}
                    className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
                  >
                    {a.state === 'ready' ? '▶ Start Exam' : '↩ Resume Exam'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {entries.length === 0 && pendingAttempts.length === 0 && completedAttempts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-2xl text-[var(--text-secondary)]">
          <div className="text-5xl mb-3">📭</div>
          <p className="font-medium">No exams available at the moment.</p>
          <p className="text-sm mt-1">Your placement coordinator will assign exams when ready.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Personal invitations */}
          {invited.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Assigned to You ({invited.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {invited.map((t) => <ExamCard key={t.id} tmpl={t} />)}
              </div>
            </section>
          )}

          {/* Open / default exams */}
          {open.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                Open Exams ({open.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {open.map((t) => <ExamCard key={t.id} tmpl={t} />)}
              </div>
            </section>
          )}

          {/* Completed exams / results */}
          {completedAttempts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Completed Exams &amp; Results ({completedAttempts.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {completedAttempts.map((a) => {
                  const stateLabel = STATE_LABELS[a.state]?.label || a.state;
                  const stateColor = STATE_LABELS[a.state]?.color || 'bg-gray-100 text-gray-800';
                  
                  const hasSubmissions = a.total_submissions > 0;
                  const scoreDisplay = a.avg_score != null ? `${a.avg_score}%` : '—';
                  
                  return (
                    <div
                      key={a.attempt_id}
                      onClick={() => setSelectedAttemptId(a.attempt_id)}
                      className="cursor-pointer border border-[var(--border)] rounded-xl p-5 bg-[var(--bg-secondary)] hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between shadow-sm"
                    >
                      <div>
                        {/* Top row */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-base font-semibold text-[var(--text-primary)] leading-tight">{a.exam_name}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0 ${stateColor}`}>{stateLabel}</span>
                        </div>
                        
                        <p className="text-xs text-[var(--text-secondary)] mb-4">
                          ⏱ {a.duration_minutes} min · Submitted {a.submitted_at ? new Date(a.submitted_at).toLocaleString('en-IN') : '—'}
                        </p>
                      </div>

                      {/* Auto Grader results box */}
                      <div className="border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-primary)] mb-1 text-xs">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-[var(--text-secondary)]">Auto Grader</span>
                          <span className={`px-2 py-0.5 rounded-full text-2xs font-bold ${hasSubmissions ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30' : 'bg-gray-100 text-gray-600'}`}>
                            {hasSubmissions ? 'Graded' : 'No Submissions'}
                          </span>
                        </div>
                        
                        {hasSubmissions ? (
                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-sm font-bold text-[var(--text-primary)]">
                              <span>Grade Score:</span>
                              <span className="text-emerald-600">{scoreDisplay}</span>
                            </div>
                            <div className="flex justify-between text-[var(--text-secondary)]">
                              <span>Correct Solutions:</span>
                              <span>{a.accepted_count} / {a.total_submissions}</span>
                            </div>

                            {a.avg_cyclomatic_complexity != null && (
                              <div className="border-t border-[var(--border)] pt-2 mt-2 space-y-1 text-2xs text-[var(--text-secondary)]">
                                <div className="flex justify-between">
                                  <span>Complexity Index (CC):</span>
                                  <span className={a.avg_cyclomatic_complexity > 10 ? 'text-red-500 font-semibold' : 'text-[var(--text-primary)]'}>
                                    {a.avg_cyclomatic_complexity} {a.avg_cyclomatic_complexity > 10 ? '(High)' : '(Optimal)'}
                                  </span>
                                </div>
                                {a.avg_maintainability_index != null && (
                                  <div className="flex justify-between">
                                    <span>Maintainability:</span>
                                    <span className="text-[var(--text-primary)]">{a.avg_maintainability_index}/100</span>
                                  </div>
                                )}
                                {a.max_nesting_depth != null && (
                                  <div className="flex justify-between">
                                    <span>Max Loop Nesting:</span>
                                    <span className={a.max_nesting_depth >= 2 ? 'text-orange-500 font-semibold' : 'text-[var(--text-primary)]'}>
                                      {a.max_nesting_depth} {a.max_nesting_depth >= 2 ? '(Deep)' : '(Flat)'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-[var(--text-secondary)] italic">No code submissions recorded for this attempt.</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ─── Detailed Exam Report Modal ─── */}
      {selectedAttemptId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-[var(--text-primary)]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-[var(--border)] flex items-start justify-between bg-gradient-to-r from-blue-600/10 to-indigo-600/10 flex-shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/20">
                  Detailed Exam Report
                </span>
                <h3 className="text-xl font-bold mt-2 text-[var(--text-primary)]">
                  {attemptDetails?.exam_name || 'Loading exam details…'}
                </h3>
                {attemptDetails?.company && (
                  <p className="text-xs text-[var(--text-secondary)] mt-1">
                    {attemptDetails.company} {attemptDetails.role && `• ${attemptDetails.role}`}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedAttemptId(null)}
                className="text-2xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[var(--bg-primary)]/10">
              {detailsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                  <span className="text-sm text-[var(--text-secondary)]">Fetching detailed report…</span>
                </div>
              ) : detailsError ? (
                <div className="text-center py-20 text-red-400 font-medium">
                  ⚠️ {detailsError}
                </div>
              ) : attemptDetails ? (
                <>
                  {/* Stats Summary Panel */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Overall Score</span>
                      <div className={`text-2xl font-bold mt-1 ${scoreColor(attemptDetails.score_pct ?? attemptDetails.avg_score ?? 0)}`}>
                        {attemptDetails.score_pct ?? attemptDetails.avg_score ?? 0}%
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)]">Average Score</span>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Status</span>
                      <div className="text-lg font-semibold mt-1.5 capitalize text-blue-400">
                        {attemptDetails.state ?? 'Submitted'}
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)]">Completion State</span>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Questions Solved</span>
                      <div className="text-2xl font-bold mt-1 text-[var(--text-primary)]">
                        {attemptDetails.questions_solved ?? attemptDetails.accepted_count ?? 0} / {attemptDetails.questions?.length ?? attemptDetails.total_questions ?? 0}
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)]">Passed / Total</span>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 shadow-sm">
                      <span className="text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">Completed On</span>
                      <div className="text-sm font-semibold mt-2.5 text-[var(--text-primary)]">
                        {fmtDate(attemptDetails.submitted_at)}
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)]">Submission Date</span>
                    </div>
                  </div>

                  {/* Topics Analysis */}
                  <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm space-y-4">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Topic Proficiency Analysis</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Weak Topics */}
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                          🔴 Needs Improvement (Not Fine)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {topicsSummary.weak.length > 0 ? (
                            topicsSummary.weak.map((topic) => (
                              <span
                                key={topic}
                                className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] text-red-300 ring-1 ring-red-500/20 capitalize font-medium"
                              >
                                {topic}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)] italic">No weak topics in this exam. Great work!</span>
                          )}
                        </div>
                      </div>

                      {/* Strong Topics */}
                      <div className="space-y-2">
                        <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                          🟢 Strong Areas (Accepted)
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {topicsSummary.strong.length > 0 ? (
                            topicsSummary.strong.map((topic) => (
                              <span
                                key={topic}
                                className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300 ring-1 ring-emerald-500/20 capitalize font-medium"
                              >
                                {topic}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-[var(--text-secondary)] italic">No fully solved topics yet.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Individual Programs Section */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-bold text-[var(--text-primary)]">Each Program Detailed Report</h4>
                    <div className="space-y-5">
                      {attemptDetails.questions?.map((q: any, idx: number) => {
                        const qSubmissions = (attemptDetails.submissions || []).filter(
                          (s: any) => s.version_id === q.version_id
                        );
                        const latestSub = qSubmissions.length > 0 ? qSubmissions[qSubmissions.length - 1] : null;
                        const verdictDetails = getVerdictDetails(latestSub?.verdict ?? null);

                        return (
                          <div
                            key={q.version_id}
                            className="rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-sm space-y-4"
                          >
                            {/* Question Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)]/45 pb-3">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-[var(--text-primary)]">
                                  {idx + 1}. {q.title}
                                </span>
                                <span
                                  className={`px-2 py-0.5 text-[9px] font-medium rounded-full uppercase ${
                                    q.difficulty === 'easy'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : q.difficulty === 'medium'
                                      ? 'bg-amber-500/10 text-amber-300'
                                      : 'bg-red-500/10 text-red-400'
                                  }`}
                                >
                                  {q.difficulty}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border flex items-center gap-1 ${verdictDetails.color}`}>
                                  {verdictDetails.icon} {verdictDetails.label}
                                </span>
                                {latestSub && (
                                  <span className="text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-primary)]/50 border border-[var(--border)] px-2 py-1 rounded-md">
                                    Score: {latestSub.score ?? 0} / 100
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Problem description details */}
                            <details className="group mt-2 border border-[var(--border)]/60 rounded-xl overflow-hidden bg-[var(--bg-primary)]/30">
                              <summary className="flex items-center justify-between px-4 py-2 text-xs font-medium text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-primary)]/50 select-none">
                                <span>Show Problem Description</span>
                                <span className="transition-transform group-open:rotate-180">▼</span>
                              </summary>
                              <div
                                className="px-4 py-3 border-t border-[var(--border)]/40 text-xs text-[var(--text-secondary)] prose prose-invert prose-xs max-w-none max-h-60 overflow-y-auto"
                                dangerouslySetInnerHTML={{ __html: q.description }}
                              />
                            </details>

                            {/* Submitted Answer Code */}
                            <div>
                              <div className="text-xs font-bold text-[var(--text-primary)] mb-1.5 flex items-center justify-between">
                                <span>Submitted Code {latestSub?.language && <span className="text-[10px] text-[var(--text-secondary)] font-normal">({latestSub.language})</span>}</span>
                                {latestSub && (
                                  <button
                                    onClick={(e) => {
                                      navigator.clipboard.writeText(latestSub.source_code);
                                      const target = e.currentTarget as HTMLButtonElement;
                                      const original = target.innerText;
                                      target.innerText = 'Copied!';
                                      setTimeout(() => { target.innerText = original; }, 2000);
                                    }}
                                    className="px-2 py-0.5 text-[9px] bg-gray-800 hover:bg-gray-700 text-gray-300 rounded font-medium transition-colors"
                                  >
                                    Copy Code
                                  </button>
                                )}
                              </div>
                              {latestSub ? (
                                <div className="relative">
                                  <pre className="font-mono text-xs overflow-x-auto p-4 rounded-xl bg-gray-950 border border-gray-800 text-gray-100 max-h-60">
                                    <code>{latestSub.source_code}</code>
                                  </pre>
                                </div>
                              ) : (
                                <div className="p-4 rounded-xl bg-red-950/15 border border-red-900/20 text-red-400 text-xs font-mono text-center">
                                  ⚠️ Not Attempted
                                </div>
                              )}
                            </div>

                            {/* AST analysis metrics */}
                            {latestSub && (
                              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 bg-[var(--bg-primary)]/40 p-4 rounded-xl border border-[var(--border)]">
                                <div>
                                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">Complexity</div>
                                  <div className="text-base font-bold mt-0.5 text-[var(--text-primary)]">
                                    {latestSub.cyclomatic_complexity ?? '—'}
                                  </div>
                                  <div className="text-[9px] text-[var(--text-secondary)]">Cyclomatic Complexity</div>
                                </div>
                                <div>
                                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">Maintainability</div>
                                  <div className="text-base font-bold mt-0.5 text-[var(--text-primary)]">
                                    {latestSub.maintainability_index ?? '—'}
                                  </div>
                                  <div className="text-[9px] text-[var(--text-secondary)]">Index (0-100)</div>
                                </div>
                                <div>
                                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">Nesting Depth</div>
                                  <div className="text-base font-bold mt-0.5 text-[var(--text-primary)]">
                                    {latestSub.max_nesting_depth ?? '—'}
                                  </div>
                                  <div className="text-[9px] text-[var(--text-secondary)]">Max Depth</div>
                                </div>
                                <div>
                                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-secondary)]">Passed Test cases</div>
                                  <div className="text-base font-bold mt-0.5 text-[var(--text-primary)]">
                                    {latestSub.passed_count ?? 0} / {latestSub.total_count ?? 0}
                                  </div>
                                  <div className="text-[9px] text-[var(--text-secondary)]">Test results</div>
                                </div>
                              </div>
                            )}

                            {/* Optimization Warnings */}
                            {latestSub?.optimization_warning && (
                              <div className="px-4 py-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-xs flex items-start gap-2">
                                <span className="text-base leading-none">⚠️</span>
                                <div>
                                  <span className="font-semibold">Optimization Warning:</span> {latestSub.optimization_warning}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end flex-shrink-0 bg-[var(--bg-secondary)]">
              <button
                onClick={() => setSelectedAttemptId(null)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors text-sm"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

