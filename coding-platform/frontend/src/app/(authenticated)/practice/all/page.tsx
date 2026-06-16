'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { practiceApi, studentApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import ActivityCalendar, { type ActivityDay } from '@/components/ui/ActivityCalendar';
import type { Question, RoadmapSummary } from '@/types';

// ── Difficulty config ──────────────────────────────────────────────────────
const DIFF = {
  easy:   { text: 'text-green-500',  bg: 'bg-green-50  border-green-200',  bar: 'bg-green-500'  },
  medium: { text: 'text-amber-500',  bg: 'bg-amber-50  border-amber-200',  bar: 'bg-amber-500'  },
  hard:   { text: 'text-red-500',    bg: 'bg-red-50    border-red-200',    bar: 'bg-red-500'    },
};

// ── Status icon ────────────────────────────────────────────────────────────
function StatusIcon({ status }: { status?: string }) {
  if (status === 'solved')    return <span title="Solved"    className="text-green-500 text-base">✓</span>;
  if (status === 'attempted') return <span title="Attempted" className="text-amber-400 text-base">~</span>;
  return <span className="inline-block w-4" />;
}

// ── Circular donut SVG ─────────────────────────────────────────────────────
function DonutChart({ value, total, color }: { value: number; total: number; color: string }) {
  const r = 28, cx = 34, cy = 34;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? value / total : 0;
  const dash = pct * circ;
  return (
    <svg width="68" height="68" viewBox="0 0 68 68">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor" className="text-[var(--text-primary)]">
        {value}
      </text>
    </svg>
  );
}

export default function PracticeAllPage() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');
  const courseName = searchParams.get('courseName');
  const company = searchParams.get('company');

  const [questions, setQuestions]   = useState<Question[]>([]);
  const [roadmap,   setRoadmap]     = useState<RoadmapSummary | null>(null);
  const [loading,   setLoading]     = useState(true);
  const [difficulty, setDifficulty] = useState('');
  const [topic,      setTopic]      = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activity, setActivity]     = useState<ActivityDay[]>([]);

  // ── Load questions + stats in parallel ──────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: 1, limit: 100 };
      if (difficulty) params.difficulty = difficulty;
      if (topic)      params.topic      = topic;
      if (courseId)    params.courseId   = courseId;
      if (company)    params.company    = company;

      const [poolRes, roadmapRes, activityRes] = await Promise.all([
        practiceApi.getPool(params),
        user ? studentApi.getRoadmapSummary(user.id).catch(() => null) : Promise.resolve(null),
        practiceApi.getActivity().catch(() => null),
      ]);
      setQuestions((poolRes.data.data as Question[]) || []);
      if (roadmapRes?.data?.data) setRoadmap(roadmapRes.data.data as RoadmapSummary);
      if (activityRes?.data?.data) setActivity(activityRes.data.data as ActivityDay[]);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
  }, [difficulty, topic, user, courseId, company]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const easy   = questions.filter(q => q.difficulty === 'easy');
    const medium = questions.filter(q => q.difficulty === 'medium');
    const hard   = questions.filter(q => q.difficulty === 'hard');
    const solved   = (arr: Question[]) => arr.filter(q => q.user_status === 'solved').length;
    const attempted = (arr: Question[]) => arr.filter(q => q.user_status === 'attempted').length;
    return {
      total:   questions.length,
      totalSolved: questions.filter(q => q.user_status === 'solved').length,
      easy:   { total: easy.length,   solved: solved(easy),   attempted: attempted(easy)   },
      medium: { total: medium.length, solved: solved(medium), attempted: attempted(medium) },
      hard:   { total: hard.length,   solved: solved(hard),   attempted: attempted(hard)   },
    };
  }, [questions]);

  // ── Filtered list ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!statusFilter) return questions;
    return questions.filter(q => q.user_status === statusFilter || (statusFilter === 'not_started' && (!q.user_status || q.user_status === 'not_started')));
  }, [questions, statusFilter]);

  // ── All unique topics for filter chips ───────────────────────────────────
  const allTopics = useMemo(() => {
    const s = new Set<string>();
    questions.forEach(q => q.topic_tags?.forEach(t => s.add(t)));
    return Array.from(s).sort();
  }, [questions]);

  const acceptanceRate = roadmap?.practice_stats?.acceptance_rate != null
    ? roadmap.practice_stats.acceptance_rate.toFixed(0)
    : null;

  // ── Streak computation ───────────────────────────────────────────────────
  const streakStats = useMemo(() => {
    const activeSet = new Set(activity.filter(d => Number(d.submissions) > 0).map(d => String(d.day).slice(0, 10)));
    const totalActive = activeSet.size;
    const todayUTC = new Date().toISOString().slice(0, 10);
    let currentStreak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(todayUTC + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      if (activeSet.has(d.toISOString().slice(0, 10))) currentStreak++;
      else break;
    }
    const sortedDays = Array.from(activeSet).sort();
    let longest = 0, cur = 0, prev: Date | null = null;
    for (const ymd of sortedDays) {
      const d = new Date(ymd + 'T00:00:00Z');
      if (prev) {
        const diff = (d.getTime() - prev.getTime()) / 86400000;
        if (diff === 1) cur++;
        else cur = 1;
      } else cur = 1;
      if (cur > longest) longest = cur;
      prev = d;
    }
    return { currentStreak, longestStreak: longest, totalActive };
  }, [activity]);

  const clearFilters = () => {
    setDifficulty('');
    setTopic('');
    setStatusFilter('');
  };

  const pageTitle = courseName
    ? `Course: ${courseName}`
    : company
      ? `Company: ${company}`
      : 'All Problems';

  const pageSubtitle = courseName || company
    ? 'Filtered practice problems'
    : 'Sharpen your skills with curated coding problems';

  return (
    <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2">
      {/* ═══ PAGE HEADER ════════════════════════════════════════════════════ */}
      <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(242,130,65,0.18),transparent_38%),linear-gradient(180deg,rgba(191,83,59,0.05),rgba(191,83,59,0)),var(--bg-secondary)]">
        <div className="w-full px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
          <div className="flex flex-col gap-5 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(255,255,255,0.18)),var(--bg-surface)] px-5 py-5 shadow-[var(--card-shadow)] sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-3">
                  <Link href="/practice" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors">
                    ← Back
                  </Link>
                </div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl mt-2">
                  SMART Code
                  <span className="text-lg font-normal text-[var(--text-secondary)] sm:text-2xl">/ {pageTitle}</span>
                </h1>
                <p className="mt-1 text-sm text-[var(--text-secondary)] sm:text-base">
                  {pageSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                <div className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[var(--accent-strong)]">
                  {stats.total} problems
                </div>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-700 dark:text-emerald-300">
                  {stats.totalSolved} solved
                </div>
                <div className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-amber-700 dark:text-amber-300">
                  {streakStats.currentStreak} day streak
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Link
                href="/practice/personalized"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(242,130,65,0.32)] transition-all hover:bg-[var(--accent-strong)] hover:shadow-[0_16px_34px_rgba(191,83,59,0.34)]"
              >
                <span>✨</span> Personalized Problems
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
        {/* ═══ ACTIVITY CALENDAR ════════════════════════════════════════════ */}
        <div className="mb-6 w-full">
          <ActivityCalendar
            data={activity}
            currentStreak={streakStats.currentStreak}
            longestStreak={streakStats.longestStreak}
            totalActive={streakStats.totalActive}
          />
        </div>

        <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">

          {/* ── LEFT: Stats sidebar ───────────────────────────────────────── */}
          <aside className="w-full space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
              <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Solved Problems</h2>
              <div className="flex items-center gap-4">
                <DonutChart value={stats.totalSolved} total={stats.total} color="#3b82f6" />
                <div className="space-y-1 text-sm">
                  <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.totalSolved}</div>
                  <div className="text-xs text-[var(--text-secondary)]">/ {stats.total} total</div>
                  {acceptanceRate && (
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      Acceptance: <span className="font-medium text-[var(--text-primary)]">{acceptanceRate}%</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-4 space-y-2.5">
                {(['easy', 'medium', 'hard'] as const).map((d) => {
                  const s = stats[d];
                  const pct = s.total > 0 ? (s.solved / s.total) * 100 : 0;
                  const dc = DIFF[d];
                  return (
                    <div key={d}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className={`font-medium capitalize ${dc.text}`}>{d}</span>
                        <span className="text-[var(--text-secondary)]">
                          <span className="font-semibold text-[var(--text-primary)]">{s.solved}</span>/{s.total}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                        <div className={`h-full rounded-full ${dc.bar} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {roadmap && (
              <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">My Statistics</h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Submissions', value: roadmap.practice_stats?.total_submissions ?? 0 },
                    { label: 'Accept Rate',  value: `${(roadmap.practice_stats?.acceptance_rate ?? 0).toFixed(0)}%` },
                    { label: 'Exams Taken',  value: roadmap.exam_stats?.total_attempts ?? 0 },
                    { label: 'Best Score',   value: `${roadmap.exam_stats?.best_score ?? 0}%` },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-[var(--bg-primary)] p-3 text-center">
                      <div className="text-sm font-bold text-[var(--text-primary)]">{value}</div>
                      <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{label}</div>
                    </div>
                  ))}
                </div>
                {roadmap.recent_performance && (
                  <div className={`rounded-xl px-3 py-2 text-center text-xs font-medium ${
                    roadmap.recent_performance.band === 'green'  ? 'bg-green-50 text-green-700' :
                    roadmap.recent_performance.band === 'yellow' ? 'bg-amber-50 text-amber-700' :
                                                                    'bg-red-50 text-red-700'
                  }`}>
                    {roadmap.recent_performance.band === 'green'  ? '🟢 Strong Performance' :
                     roadmap.recent_performance.band === 'yellow' ? '🟡 Average Performance' :
                                                                    '🔴 Needs Improvement'}
                    <div className="mt-0.5 font-normal capitalize opacity-80">{roadmap.recent_performance.trend} trend</div>
                  </div>
                )}
              </div>
            )}

            {allTopics.length > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Topics</h2>
                  <button onClick={() => setTopic('')} className="text-xs text-[var(--accent)] transition-colors hover:text-[var(--accent-strong)]">Reset</button>
                </div>
                <div className="flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
                  <button
                    onClick={() => setTopic('')}
                    className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${topic === '' ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-gray-400'}`}
                  >All</button>
                  {allTopics.map(t => (
                    <button key={t} onClick={() => setTopic(prev => prev === t ? '' : t)}
                      className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${topic === t ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-gray-400'}`}
                    >{t}</button>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ── RIGHT: Problem list ───────────────────────────────────────── */}
          <section className="min-w-0 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(59,130,246,0.08),transparent_18%),var(--bg-primary)] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.10)] sm:p-5 lg:p-6">
            <div className="mb-5 flex flex-col gap-4 border-b border-[var(--border)] pb-5">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">Problem Set</h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Browse the practice pool, filter by progress, and jump straight into solving.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                  <div className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[var(--text-secondary)]">
                    {filtered.length} showing
                  </div>
                  <div className="rounded-full border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[var(--text-secondary)]">
                    {stats.total - stats.totalSolved} left
                  </div>
                </div>
              </div>

              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3">
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                  className="min-w-[170px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="">All Difficulties</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-w-[170px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]">
                  <option value="">All Status</option>
                  <option value="solved">✓ Solved</option>
                  <option value="attempted">~ Attempted</option>
                  <option value="not_started">○ Not Started</option>
                </select>
                <input type="text" placeholder="Search topic..." value={topic} onChange={(e) => setTopic(e.target.value)}
                  className="min-w-[220px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]" />
                <button type="button" onClick={clearFilters}
                  className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]">
                  Clear filters
                </button>
              </div>
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[32px_minmax(0,1.6fr)_minmax(180px,1fr)_100px] gap-x-4 border-b border-[var(--border)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">
              <span></span>
              <span>Title</span>
              <span>Tags</span>
              <span className="text-right">Difficulty</span>
            </div>

            {/* Rows */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
                <svg className="mr-3 h-6 w-6 animate-spin text-[var(--accent)]" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Loading problems…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-[var(--text-secondary)]">
                <p className="mb-1 text-base">No problems match your filters</p>
                <button onClick={clearFilters} className="text-sm text-[var(--accent)] hover:underline">Clear filters</button>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filtered.map((q, idx) => {
                  const dc = DIFF[q.difficulty as keyof typeof DIFF];
                  return (
                    <Link key={q.id} href={`/practice/${q.version_id}`}
                      className="group grid grid-cols-[32px_minmax(0,1.6fr)_minmax(180px,1fr)_100px] items-center gap-x-4 rounded-2xl px-4 py-4 transition-colors hover:bg-[var(--bg-secondary)]">
                      <div className="flex justify-center"><StatusIcon status={q.user_status} /></div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--text-secondary)]">{idx + 1}.</span>
                          <span className="truncate text-sm font-medium text-[var(--text-primary)] transition-colors group-hover:text-[var(--accent)] sm:text-base">{q.title}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {q.topic_tags?.slice(0, 3).map(tag => (
                          <span key={tag} className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] text-[var(--text-secondary)] sm:text-xs">{tag}</span>
                        ))}
                        {(q.topic_tags?.length ?? 0) > 3 && (
                          <span className="self-center text-[10px] text-[var(--text-secondary)] sm:text-xs">+{q.topic_tags!.length - 3}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`text-xs font-semibold capitalize sm:text-sm ${dc?.text ?? 'text-gray-500'}`}>{q.difficulty}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
