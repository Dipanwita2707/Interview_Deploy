'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminExamSessionsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useRouter } from 'next/navigation';
import VerdictBadge from '@/components/ui/VerdictBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExamSession {
  attempt_id: string;
  state: string;
  started_at: string | null;
  submitted_at: string | null;
  aural_session_id: string | null;
  aural_session_url: string | null;
  aural_reentry_count: number;
  student_id: string;
  student_name: string;
  student_email: string;
  template_id: string | null;
  template_name: string | null;
  company_filter: string | null;
  course_filter: string | null;
  total_submissions: number;
  accepted_count: number;
  avg_score: number | null;
  weak_topics: string[] | null;
  aural_detail?: {
    id: string;
    status: string;
    summary: string | null;
    themes: string[];
    totalDurationSeconds: number | null;
    completedAt: string | null;
  } | null;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, string> = {
  submitted:   'bg-blue-100 text-blue-700',
  evaluated:   'bg-green-100 text-green-700',
  reviewed:    'bg-purple-100 text-purple-700',
  flagged:     'bg-red-100 text-red-700',
  started:     'bg-yellow-100 text-yellow-700',
  scheduled:   'bg-gray-100 text-gray-600',
  interrupted: 'bg-orange-100 text-orange-700',
};

const AURAL_STATUS_COLORS: Record<string, string> = {
  COMPLETED:   'bg-emerald-100 text-emerald-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  ABANDONED:   'bg-red-100 text-red-700',
};

function fmt(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminExamSessionsPage() {
  const { user } = useAuthStore();
  const router   = useRouter();

  const [sessions, setSessions]     = useState<ExamSession[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');

  // Filters
  const [filterDate, setFilterDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [filterState, setFilterState] = useState('');
  const [showAuralDetail, setShowAuralDetail] = useState(true); // default to true to load AI interview details
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Detail panel
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail]         = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Fetch list ─────────────────────────────────────────────────────────────
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminExamSessionsApi.list({
        page: 1,
        limit: 150, // Load all attempts on the date to group them
        date:            filterDate    || undefined,
        state:           filterState   || undefined,
        withAuralDetail: showAuralDetail,
      });
      const payload = res.data.data as { sessions: ExamSession[] };
      setSessions(payload.sessions || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, [filterDate, filterState, showAuralDetail]);

  useEffect(() => {
    // Only staff/head can access this page
    if (user && user.role === 'student') {
      router.replace('/exam');
      return;
    }
    fetchSessions();
  }, [fetchSessions, user]);

  // Group attempts by exam template
  const examTemplatesMap = new Map<string, { id: string; name: string; count: number; attempts: ExamSession[] }>();
  
  for (const s of sessions) {
    const templateId = s.template_id || 'unassigned';
    const templateName = s.template_name || 'Custom / Unassigned Exam';
    
    const existing = examTemplatesMap.get(templateId);
    if (existing) {
      existing.count += 1;
      existing.attempts.push(s);
    } else {
      examTemplatesMap.set(templateId, {
        id: templateId,
        name: templateName,
        count: 1,
        attempts: [s],
      });
    }
  }

  const activeExams = Array.from(examTemplatesMap.values());

  // Auto-select the first exam if none selected or if selected is not in activeExams
  useEffect(() => {
    if (activeExams.length > 0) {
      const exists = activeExams.some(e => e.id === selectedTemplateId);
      if (!exists) {
        setSelectedTemplateId(activeExams[0].id);
      }
    } else {
      setSelectedTemplateId(null);
    }
  }, [activeExams, selectedTemplateId]);

  const currentExam = activeExams.find(e => e.id === selectedTemplateId);
  const visibleAttempts = currentExam ? currentExam.attempts : [];

  // ── Expand row detail ──────────────────────────────────────────────────────
  const toggleDetail = async (attemptId: string) => {
    if (expandedId === attemptId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(attemptId);
    setDetailLoading(true);
    try {
      const res = await adminExamSessionsApi.getDetail(attemptId);
      setDetail(res.data.data as Record<string, unknown>);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Reset re-entry ──────────────────────────────────────────────────────────
  const resetReentry = async (attemptId: string) => {
    try {
      await adminExamSessionsApi.resetReentry(attemptId);
      fetchSessions();
    } catch {
      alert('Failed to reset re-entry count');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Exam + Interview Evaluation</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            Grouped by date and exam. Select a date to view exams, select an exam to view and evaluate candidate sessions.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-2xl shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[var(--text-secondary)]">Exam Date</label>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-[var(--text-secondary)]">Status State</label>
          <select
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All states</option>
            <option value="submitted">Submitted</option>
            <option value="evaluated">Evaluated</option>
            <option value="reviewed">Reviewed</option>
            <option value="flagged">Flagged</option>
            <option value="started">In Progress</option>
          </select>
        </div>

        <div className="flex items-center gap-2 mt-5 text-sm text-[var(--text-secondary)] cursor-pointer">
          <input
            type="checkbox"
            id="showAuralDetail"
            checked={showAuralDetail}
            onChange={(e) => setShowAuralDetail(e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500 border-[var(--border)]"
          />
          <label htmlFor="showAuralDetail" className="cursor-pointer select-none text-xs font-medium">Load interview details</label>
        </div>

        <button
          onClick={fetchSessions}
          className="ml-auto mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-md shadow-blue-500/10 transition-colors"
        >
          Refresh Sessions
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Main Grid: Left sidebar (exams) + Right content (attempts) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Sidebar: Exams list on selected date */}
        <div className="lg:col-span-4 border border-[var(--border)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
            <h3 className="font-bold text-[var(--text-primary)] text-sm">Active Exams</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">Select an exam to view details</p>
          </div>
          
          <div className="p-3 space-y-1 max-h-[500px] overflow-y-auto">
            {loading ? (
              <p className="text-center py-6 text-xs text-[var(--text-secondary)]">Loading exams…</p>
            ) : activeExams.length === 0 ? (
              <p className="text-center py-8 text-xs text-[var(--text-secondary)]">No active exams found for this date.</p>
            ) : (
              activeExams.map((exam) => {
                const isActive = selectedTemplateId === exam.id;
                return (
                  <button
                    key={exam.id}
                    onClick={() => setSelectedTemplateId(exam.id)}
                    className={`w-full text-left p-3.5 flex items-center justify-between rounded-xl transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white font-medium shadow-md shadow-blue-500/10'
                        : 'hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] bg-[var(--bg-primary)] border border-[var(--border)]/30'
                    }`}
                  >
                    <span className="text-xs font-semibold truncate flex-1 pr-3">{exam.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-2xs font-bold shrink-0 ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text-secondary)]'
                    }`}>
                      {exam.count} session{exam.count !== 1 ? 's' : ''}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Main section: Attempt details table */}
        <div className="lg:col-span-8 border border-[var(--border)] rounded-2xl bg-[var(--bg-surface)] overflow-hidden shadow-sm">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-between">
            <h3 className="font-bold text-[var(--text-primary)] text-sm">
              {currentExam ? `${currentExam.name} Sessions` : 'Candidate Sessions'}
            </h3>
            {currentExam && (
              <span className="text-xs text-[var(--text-secondary)]">
                Showing {visibleAttempts.length} session{visibleAttempts.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)]">Student</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)]">State</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)]">Score</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)]">AI Interview</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)]">Re-entries</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)]">Submitted</th>
                  <th className="px-4 py-3 text-left font-semibold text-[var(--text-secondary)]">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-[var(--text-secondary)]">
                      Loading candidates…
                    </td>
                  </tr>
                )}

                {!loading && visibleAttempts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-[var(--text-secondary)]">
                      {selectedTemplateId 
                        ? 'No attempts found matching the filters for this exam.'
                        : 'Select an exam from the sidebar to view candidate attempts.'}
                    </td>
                  </tr>
                )}

                {!loading && visibleAttempts.map((s) => (
                  <>
                    <tr
                      key={s.attempt_id}
                      className={`border-b border-[var(--border)] hover:bg-[var(--bg-secondary)] transition-colors ${
                        expandedId === s.attempt_id ? 'bg-blue-50/20 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      {/* Student */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[var(--text-primary)]">{s.student_name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{s.student_email}</div>
                      </td>

                      {/* State */}
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATE_COLORS[s.state] ?? 'bg-gray-100 text-gray-600'}`}>
                          {s.state}
                        </span>
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text-primary)]">
                            {s.avg_score != null ? `${s.avg_score}%` : '—'}
                          </span>
                          <span className="text-2xs text-[var(--text-secondary)]">
                            {s.accepted_count}/{s.total_submissions} AC
                          </span>
                        </div>
                      </td>

                      {/* AI Interview */}
                      <td className="px-4 py-3">
                        {s.aural_session_url ? (
                          <div className="flex flex-col gap-1">
                            <a
                              href={s.aural_session_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline text-xs font-medium"
                            >
                              Open session ↗
                            </a>
                            {s.aural_detail && (
                              <span className={`px-2 py-0.5 rounded-full text-2xs font-medium w-fit ${AURAL_STATUS_COLORS[s.aural_detail.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {s.aural_detail.status}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[var(--text-secondary)] text-xs">Not started</span>
                        )}
                      </td>

                      {/* Re-entries */}
                      <td className="px-4 py-3 text-xs">
                        <span className={`font-semibold ${s.aural_reentry_count >= 5 ? 'text-red-600' : 'text-[var(--text-primary)]'}`}>
                          {s.aural_reentry_count}/5
                        </span>
                      </td>

                      {/* Submitted At */}
                      <td className="px-4 py-3 text-2xs text-[var(--text-secondary)] whitespace-nowrap">
                        {fmt(s.submitted_at || s.started_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleDetail(s.attempt_id)}
                            className="px-2.5 py-1 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] font-semibold transition-colors"
                          >
                            {expandedId === s.attempt_id ? 'Close' : 'Evaluate'}
                          </button>
                          {s.aural_reentry_count >= 5 && (
                            <button
                              onClick={() => resetReentry(s.attempt_id)}
                              className="px-2.5 py-1 text-xs border border-orange-300 text-orange-600 rounded-lg hover:bg-orange-50 transition-colors font-semibold"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Detailed info panel */}
                    {expandedId === s.attempt_id && (
                      <tr key={`${s.attempt_id}-detail`} className="bg-[var(--bg-secondary)]/50 border-b border-[var(--border)]">
                        <td colSpan={7} className="px-6 py-5">
                          {detailLoading && (
                            <p className="text-[var(--text-secondary)] text-xs">Loading candidate submission metrics…</p>
                          )}
                          {!detailLoading && detail && (
                            <DetailPanel data={detail} />
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

interface AuralDetail {
  status: string;
  summary: string | null;
  themes: string[];
  totalDurationSeconds: number | null;
  completedAt: string | null;
  insights: unknown;
}

interface DetailData {
  attempt: {
    aural_session_id: string | null;
    aural_session_url: string | null;
  } & Record<string, unknown>;
  submissions: Array<{
    question_title: string;
    difficulty: string;
    topic_tags: string[] | null;
    score: number;
    passed_count: number;
    total_count: number;
    verdict: string;
    cyclomatic_complexity?: number | null;
    maintainability_index?: number | null;
    max_nesting_depth?: number | null;
    optimization_warning?: string | null;
  }>;
  auralDetail: AuralDetail | null;
}

function DetailPanel({ data }: { data: Record<string, unknown> }) {
  const { attempt, submissions, auralDetail } = data as unknown as DetailData;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Submissions */}
      <div>
        <h4 className="font-semibold text-[var(--text-primary)] mb-3">
          Submissions ({submissions?.length ?? 0})
        </h4>
        <div className="space-y-2">
          {(submissions ?? []).map((sub, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[var(--text-primary)] truncate">
                  {sub.question_title}
                </div>
                <div className="text-[var(--text-secondary)] flex flex-wrap gap-x-2 gap-y-1 mt-0.5 items-center">
                  <span>{sub.difficulty}</span>
                  {sub.topic_tags?.slice(0, 2).map((t) => (
                    <span key={t} className="px-1 bg-gray-100 rounded">{t}</span>
                  ))}
                  {sub.cyclomatic_complexity != null && (
                    <span className="text-[10px] text-gray-500 font-mono">CC: {sub.cyclomatic_complexity}</span>
                  )}
                  {sub.maintainability_index != null && (
                    <span className="text-[10px] text-gray-500 font-mono">MI: {sub.maintainability_index}</span>
                  )}
                  {sub.max_nesting_depth != null && (
                    <span className={`text-[10px] font-mono px-1 rounded ${sub.max_nesting_depth >= 2 ? 'bg-orange-50 text-orange-600' : 'text-gray-500'}`}>
                      Nesting: {sub.max_nesting_depth}
                    </span>
                  )}
                </div>
                {sub.optimization_warning && (
                  <div className="text-[10px] text-red-500 font-medium mt-1">
                    ⚠️ {sub.optimization_warning}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 ml-3 flex-shrink-0">
                <span className="font-semibold">{sub.score ?? 0}%</span>
                <span className="text-[var(--text-secondary)]">
                  {sub.passed_count}/{sub.total_count}
                </span>
                <VerdictBadge verdict={sub.verdict} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Aural-oss Interview */}
      <div>
        <h4 className="font-semibold text-[var(--text-primary)] mb-3">AI Interview</h4>
        {!auralDetail && !attempt.aural_session_id && (
          <p className="text-[var(--text-secondary)] text-sm">No interview session linked.</p>
        )}
        {!auralDetail && !!attempt.aural_session_id && (
          <p className="text-[var(--text-secondary)] text-sm">Interview session not yet available or still in progress.</p>
        )}
        {auralDetail && (
          <div className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                auralDetail.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                auralDetail.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {auralDetail.status as string}
              </span>
              {auralDetail.totalDurationSeconds != null && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                  {Math.round(auralDetail.totalDurationSeconds / 60)} min
                </span>
              )}
            </div>

            {auralDetail.themes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">Detected Themes</p>
                <div className="flex flex-wrap gap-1">
                  {auralDetail.themes.map((t) => (
                    <span key={t} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {auralDetail.summary && (
              <div>
                <p className="text-xs font-semibold text-[var(--text-secondary)] mb-1">AI Summary</p>
                <p className="text-xs text-[var(--text-primary)] leading-relaxed bg-[var(--bg-primary)] border border-[var(--border)] rounded-lg p-3">
                  {auralDetail.summary}
                </p>
              </div>
            )}

            {attempt.aural_session_url && (
              <a
                href={attempt.aural_session_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-blue-600 hover:underline font-medium"
              >
                Open interview session ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
