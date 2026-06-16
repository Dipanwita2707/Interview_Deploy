'use client';

import { useEffect, useState, useCallback } from 'react';
import { analyticsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { CodingRole } from '@/types';

// ─── Types ─────────────────────────────────────────────────────

interface QuestionStat {
  version_id: string;
  title: string;
  difficulty: 'low' | 'medium' | 'high';
  status: string;
  course_id: string | null;
  course_name: string | null;
  source_company: string | null;
  total_submissions: number;
  accepted_submissions: number;
  unique_students: number;
  students_solved: number;
}

interface SubmissionRow {
  id: string;
  verdict: string;
  language: string;
  score: number;
  passed_count: number;
  total_count: number;
  execution_time_ms: number | null;
  created_at: string;
  student_name: string;
  student_email: string;
}

interface StudentStat {
  user_id: string;
  name: string;
  email: string;
  department: string | null;
  batch_year: number | null;
  questions_attempted: number;
  questions_solved: number;
  total_submissions: number;
  last_submission: string | null;
}

interface Overview {
  total_questions: number;
  total_submissions: number;
  total_accepted: number;
  acceptance_rate: number;
  active_students: number;
}

// ─── Helpers ───────────────────────────────────────────────────

const VERDICT_STYLES: Record<string, string> = {
  accepted: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  wrong_answer: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  compile_error: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  runtime_error: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  time_limit_exceeded: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  memory_limit_exceeded: 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const DIFFICULTY_STYLES: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-700',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700',
};

function verdictLabel(v: string) {
  return v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function acceptanceRate(accepted: number, total: number) {
  if (!total) return '—';
  return `${Math.round((accepted / total) * 100)}%`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
}

// ─── Submissions Modal ─────────────────────────────────────────

function SubmissionsModal({
  versionId,
  title,
  onClose,
}: {
  versionId: string;
  title: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);

  useEffect(() => {
    analyticsApi.getQuestionSubmissions(versionId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((r) => setSubmissions((r.data.data as any)?.submissions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [versionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[80vh] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Submissions</h2>
            <p className="text-sm text-[var(--text-secondary)] truncate max-w-md">{title}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <svg className="h-6 w-6 animate-spin text-[var(--accent)]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : submissions.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-secondary)]">No submissions yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--bg-secondary)] z-10">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Student</th>
                  <th className="text-left px-4 py-2 font-medium">Verdict</th>
                  <th className="text-left px-4 py-2 font-medium">Language</th>
                  <th className="text-left px-4 py-2 font-medium">Score</th>
                  <th className="text-left px-4 py-2 font-medium">Time</th>
                  <th className="text-left px-4 py-2 font-medium">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {submissions.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-2">
                      <div className="font-medium text-[var(--text-primary)]">{s.student_name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{s.student_email}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${VERDICT_STYLES[s.verdict] || 'bg-gray-100 text-gray-600'}`}>
                        {verdictLabel(s.verdict)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{s.language}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {s.passed_count}/{s.total_count}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">
                      {s.execution_time_ms != null ? `${Math.round(s.execution_time_ms)}ms` : '—'}
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)] text-xs whitespace-nowrap">{fmtDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { user } = useAuthStore();
  const isHead = user?.role === CodingRole.PLACEMENT_HEAD;

  const [tab, setTab] = useState<'questions' | 'students'>('questions');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [questions, setQuestions] = useState<QuestionStat[]>([]);
  const [students, setStudents] = useState<StudentStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuestion, setSelectedQuestion] = useState<{ id: string; title: string } | null>(null);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ovRes, qRes, sRes] = await Promise.all([
        analyticsApi.getOverview().catch(() => null),
        analyticsApi.getQuestionAnalytics().catch(() => null),
        analyticsApi.getStudentAnalytics().catch(() => null),
      ]);
      if (ovRes?.data?.data) setOverview(ovRes.data.data as Overview);
      if (qRes?.data?.data) setQuestions(qRes.data.data as QuestionStat[]);
      if (sRes?.data?.data) setStudents(sRes.data.data as StudentStat[]);
    } catch (err) {
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredQuestions = questions.filter((q) =>
    !search || q.title.toLowerCase().includes(search.toLowerCase()) ||
    (q.course_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (q.source_company ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const filteredStudents = students.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            📊 Analytics
            {!isHead && (
              <span className="ml-2 text-sm font-normal text-[var(--text-secondary)]">(Your assigned scope)</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isHead
              ? 'Platform-wide question and student submission data'
              : 'Question and student data for your assigned courses and companies'}
          </p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] transition-colors"
        >
          ↺ Refresh
        </button>
      </div>

      {/* ─── Overview Cards ──────────────────────────────────────── */}
      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Published Questions', value: overview.total_questions, icon: '📋' },
            { label: 'Total Submissions', value: overview.total_submissions.toLocaleString(), icon: '🚀' },
            { label: 'Acceptance Rate', value: `${overview.acceptance_rate}%`, icon: '✅' },
            { label: 'Active Students', value: overview.active_students, icon: '👥' },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-sm"
            >
              <div className="text-2xl mb-1">{card.icon}</div>
              <div className="text-xl font-bold text-[var(--text-primary)]">{card.value}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-0.5">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Tabs + Search ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1 w-fit">
          {(['questions', 'students'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(''); }}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors capitalize ${
                tab === t
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t === 'questions' ? `📋 Questions (${questions.length})` : `👥 Students (${students.length})`}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === 'questions' ? 'Search questions, courses, companies…' : 'Search students…'}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] w-full sm:w-64"
        />
      </div>

      {/* ─── Content ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="h-8 w-8 animate-spin text-[var(--accent)]" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : tab === 'questions' ? (
        /* ── Questions Table ── */
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          {filteredQuestions.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-secondary)]">
              {search ? 'No questions match your search' : 'No published questions in your scope yet'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-secondary)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Question</th>
                  <th className="text-left px-4 py-3 font-medium">Difficulty</th>
                  <th className="text-left px-4 py-3 font-medium">Course / Company</th>
                  <th className="text-right px-4 py-3 font-medium">Submissions</th>
                  <th className="text-right px-4 py-3 font-medium">Acceptance</th>
                  <th className="text-right px-4 py-3 font-medium">Students Solved</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredQuestions.map((q) => (
                  <tr key={q.version_id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3 font-medium text-[var(--text-primary)] max-w-xs">
                      <span className="line-clamp-2">{q.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${DIFFICULTY_STYLES[q.difficulty] || ''}`}>
                        {q.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] text-xs">
                      {q.course_name ? (
                        <span className="rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)] px-2 py-0.5">
                          📚 {q.course_name}
                        </span>
                      ) : q.source_company ? (
                        <span className="rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 dark:bg-violet-900/30 dark:text-violet-300">
                          🏢 {q.source_company}
                        </span>
                      ) : (
                        <span className="text-[var(--text-secondary)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                      {Number(q.total_submissions).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={Number(q.total_submissions) > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}>
                        {acceptanceRate(Number(q.accepted_submissions), Number(q.total_submissions))}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                      {Number(q.students_solved)} / {Number(q.unique_students)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedQuestion({ id: q.version_id, title: q.title })}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
                      >
                        View Subs →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        /* ── Students Table ── */
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          {filteredStudents.length === 0 ? (
            <div className="py-16 text-center text-[var(--text-secondary)]">
              {search ? 'No students match your search' : 'No student submissions in your scope yet'}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-secondary)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Student</th>
                  {isHead && <th className="text-left px-4 py-3 font-medium">Dept / Batch</th>}
                  <th className="text-right px-4 py-3 font-medium">Attempted</th>
                  <th className="text-right px-4 py-3 font-medium">Solved</th>
                  <th className="text-right px-4 py-3 font-medium">Total Subs</th>
                  <th className="text-right px-4 py-3 font-medium">Solve Rate</th>
                  <th className="text-right px-4 py-3 font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredStudents.map((s) => {
                  const solveRate = Number(s.questions_attempted) > 0
                    ? Math.round((Number(s.questions_solved) / Number(s.questions_attempted)) * 100)
                    : 0;
                  return (
                    <tr key={s.user_id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-primary)]">{s.name}</div>
                        <div className="text-xs text-[var(--text-secondary)]">{s.email}</div>
                      </td>
                      {isHead && (
                        <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                          {s.department || '—'}{s.batch_year ? ` · ${s.batch_year}` : ''}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                        {Number(s.questions_attempted)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                        {Number(s.questions_solved)}
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--text-secondary)]">
                        {Number(s.total_submissions).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${solveRate}%` }}
                            />
                          </div>
                          <span className="text-xs text-[var(--text-secondary)] w-8 text-right">{solveRate}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-[var(--text-secondary)] whitespace-nowrap">
                        {s.last_submission ? fmtDate(s.last_submission) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ─── Submissions Modal ───────────────────────────────────── */}
      {selectedQuestion && (
        <SubmissionsModal
          versionId={selectedQuestion.id}
          title={selectedQuestion.title}
          onClose={() => setSelectedQuestion(null)}
        />
      )}
    </div>
  );
}
