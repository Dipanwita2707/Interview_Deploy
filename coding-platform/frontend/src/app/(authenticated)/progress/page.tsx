'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { studentApi, examApi } from '@/lib/api';
import type { RoadmapSummary, PerformanceSummary } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────
interface ExamAttempt {
  attempt_id: string;
  state: string;
  exam_name: string;
  company: string | null;
  role: string | null;
  started_at: string | null;
  submitted_at: string | null;
  duration_minutes: number;
  total_questions: number;
  questions_attempted: number;
  questions_solved: number;
  score_pct: number;
  primary_language: string | null;
  difficulties: string[];
  topics: string[];
}

interface DailyActivity {
  [date: string]: { total: number; accepted: number };
}

interface ExtendedPerformance extends PerformanceSummary {
  daily_activity: DailyActivity;
  exam_breakdown: ExamAttempt[];
}

// ─── Helpers ──────────────────────────────────────────────────────────
const BAND_COLORS = {
  green: {
    bg: 'bg-emerald-500/10', border: 'border-emerald-500/20',
    text: 'text-emerald-400', chip: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20',
    label: '🟢 Strong', bar: 'bg-emerald-500',
  },
  yellow: {
    bg: 'bg-amber-500/10', border: 'border-amber-500/20',
    text: 'text-amber-300', chip: 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/20',
    label: '🟡 Average', bar: 'bg-amber-500',
  },
  red: {
    bg: 'bg-red-500/10', border: 'border-red-500/20',
    text: 'text-red-400', chip: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/20',
    label: '🔴 Needs Work', bar: 'bg-red-500',
  },
};

function scoreColor(pct: number) {
  if (pct >= 75) return 'text-emerald-400';
  if (pct >= 50) return 'text-amber-400';
  return 'text-red-400';
}
function scoreBarColor(pct: number) {
  if (pct >= 75) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
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

// ─── Activity Heatmap ─────────────────────────────────────────────────
function ActivityHeatmap({ activity }: { activity: DailyActivity }) {
  const weeks = useMemo(() => {
    const today = new Date();
    // Build 53 weeks (371 days) worth of cells ending today
    const days: { date: string; data: { total: number; accepted: number } | null }[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, data: activity[key] ?? null });
    }
    // Pad front so first day aligns to its weekday (0=Sun)
    const firstDow = new Date(days[0].date).getDay();
    const padded = [
      ...Array(firstDow).fill(null),
      ...days,
    ];
    // Group into weeks
    const result: typeof days[number][][] = [];
    for (let i = 0; i < padded.length; i += 7) {
      result.push(padded.slice(i, i + 7) as typeof days[number][]);
    }
    return result;
  }, [activity]);

  const totalActive = Object.keys(activity).length;
  const longestStreak = useMemo(() => {
    const sorted = Object.keys(activity).sort();
    let max = 0, cur = 0, prev = '';
    for (const d of sorted) {
      if (prev) {
        const diff = (new Date(d).getTime() - new Date(prev).getTime()) / 86400000;
        cur = diff === 1 ? cur + 1 : 1;
      } else { cur = 1; }
      if (cur > max) max = cur;
      prev = d;
    }
    return max;
  }, [activity]);

  function cellColor(data: { total: number; accepted: number } | null) {
    if (!data || data.total === 0) return 'bg-[var(--border)] opacity-60';
    const rate = data.accepted / data.total;
    if (rate >= 0.8) return 'bg-emerald-500';
    if (rate >= 0.5) return 'bg-emerald-500/60';
    if (rate >= 0.2) return 'bg-amber-500/70';
    return 'bg-red-500/60';
  }

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // Month labels — find the first week each month label should appear
  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((week, wi) => {
    const firstReal = week.find(d => d && d.date);
    if (!firstReal || !firstReal.date) return;
    const m = new Date(firstReal.date).getMonth();
    const prev2 = weeks[wi - 1]?.find(d => d && d.date);
    const pm = prev2 ? new Date(prev2.date).getMonth() : -1;
    if (m !== pm) monthLabels.push({ label: months[m], col: wi });
  });

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Daily Activity</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Submission heatmap over the last 12 months</p>
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-xl font-bold text-[var(--text-primary)]">{totalActive}</div>
            <div className="text-xs text-[var(--text-secondary)]">Active days</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-[var(--text-primary)]">{longestStreak}</div>
            <div className="text-xs text-[var(--text-secondary)]">Longest streak</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Month labels */}
          <div className="mb-1 flex" style={{ paddingLeft: 28 }}>
            {weeks.map((_, wi) => {
              const lbl = monthLabels.find(m => m.col === wi);
              return (
                <div key={wi} className="w-[14px] text-[9px] text-[var(--text-secondary)]" style={{ marginRight: 2 }}>
                  {lbl ? lbl.label : ''}
                </div>
              );
            })}
          </div>

          <div className="flex gap-0.5">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-0.5 mr-1" style={{ width: 24 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d, i) => (
                <div key={d} className="h-[13px] text-[9px] leading-[13px] text-[var(--text-secondary)]">
                  {i % 2 === 1 ? d.slice(0,1) : ''}
                </div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-0.5">
                {Array(7).fill(null).map((_, di) => {
                  const cell = week[di];
                  if (!cell) {
                    return <div key={di} className="h-[13px] w-[13px] rounded-[2px]" />;
                  }
                  const tip = cell.data
                    ? `${cell.date}: ${cell.data.total} submission${cell.data.total !== 1 ? 's' : ''}, ${cell.data.accepted} accepted`
                    : `${cell.date}: no activity`;
                  return (
                    <div
                      key={di}
                      title={tip}
                      className={`h-[13px] w-[13px] rounded-[2px] transition-transform hover:scale-125 cursor-default ${cellColor(cell?.data ?? null)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span>Less</span>
            <div className="h-3 w-3 rounded-[2px] bg-[var(--border)] opacity-60" />
            <div className="h-3 w-3 rounded-[2px] bg-red-500/60" />
            <div className="h-3 w-3 rounded-[2px] bg-amber-500/70" />
            <div className="h-3 w-3 rounded-[2px] bg-emerald-500/60" />
            <div className="h-3 w-3 rounded-[2px] bg-emerald-500" />
            <span>More</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Exam Card ────────────────────────────────────────────────────────
function ExamCard({ exam, onClick }: { exam: ExamAttempt; onClick?: () => void }) {
  const pct = exam.score_pct;
  const scoreClr = scoreColor(pct);
  const barClr = scoreBarColor(pct);
  const solvedRatio = exam.total_questions > 0
    ? `${exam.questions_solved}/${exam.total_questions}`
    : `${exam.questions_solved} solved`;

  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/70 p-4 transition-all ${
        onClick ? 'cursor-pointer hover:bg-[var(--bg-primary)] hover:border-blue-500/40 hover:shadow-lg' : ''
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {exam.exam_name}
          </h4>
          <div className="mt-0.5 flex flex-wrap gap-1.5">
            {exam.company && (
              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300 ring-1 ring-blue-500/20">
                {exam.company}
              </span>
            )}
            {exam.role && (
              <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-violet-500/20">
                {exam.role}
              </span>
            )}
          </div>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${scoreClr}`}>
          {pct}%
        </div>
      </div>

      {/* Score bar */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={`h-full rounded-full transition-all ${barClr}`}
          style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 text-xs text-[var(--text-secondary)]">
        <span>
          <span className="font-medium text-[var(--text-primary)]">{solvedRatio}</span> questions
        </span>
        {exam.submitted_at && (
          <span>{fmtDate(exam.submitted_at)}</span>
        )}
        {exam.primary_language && (
          <span className="capitalize">{exam.primary_language}</span>
        )}
        {exam.duration_minutes > 0 && (
          <span>{exam.duration_minutes}m duration</span>
        )}
      </div>

      {/* Topics */}
      {exam.topics.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {exam.topics.slice(0, 4).map(t => (
            <span
              key={t}
              className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border)]"
            >
              {t}
            </span>
          ))}
          {exam.topics.length > 4 && (
            <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border)]">
              +{exam.topics.length - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────
export default function ProgressPage() {
  const { user } = useAuthStore();
  const [roadmap, setRoadmap] = useState<RoadmapSummary | null>(null);
  const [performance, setPerformance] = useState<ExtendedPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'exams' | 'topics'>('overview');

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

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [roadmapRes, perfRes] = await Promise.all([
          studentApi.getRoadmapSummary(user.id),
          studentApi.getPerformanceSummary(user.id),
        ]);
        setRoadmap(roadmapRes.data.data as RoadmapSummary);
        setPerformance(perfRes.data.data as ExtendedPerformance);
      } catch (err) {
        console.error('Failed to load progress:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  // ── All hooks MUST be called before any conditional returns ──────────
  const dailyActivity = performance?.daily_activity ?? {};

  const currentStreak = useMemo(() => {
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (dailyActivity[key]) streak++;
      else if (i > 0) break;
    }
    return streak;
  }, [dailyActivity]);
  // ─────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-5 text-sm text-[var(--text-secondary)] shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
          Loading progress…
        </div>
      </div>
    );
  }

  if (!roadmap) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8 text-center shadow-[0_14px_40px_rgba(0,0,0,0.16)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl ring-1 ring-blue-500/20">
            📈
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Your Progress Dashboard</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Start solving problems and taking exams to unlock progress insights, difficulty breakdowns, and topic performance.
          </p>
          <div className="mt-6 inline-flex rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-xs text-[var(--text-secondary)]">
            No progress data yet
          </div>
        </div>
      </div>
    );
  }

  const performanceBand = (roadmap.recent_performance?.band ?? 'red') as keyof typeof BAND_COLORS;
  const performanceTrend = roadmap.recent_performance?.trend ?? 'stable';
  const band = BAND_COLORS[performanceBand];

  const acceptanceRate   = roadmap.practice_stats?.acceptance_rate ?? 0;
  const totalSolved      = roadmap.practice_stats?.total_solved ?? 0;
  const totalSubmissions = roadmap.practice_stats?.total_submissions ?? 0;
  const easySolved       = roadmap.practice_stats?.easy_solved ?? 0;
  const mediumSolved     = roadmap.practice_stats?.medium_solved ?? 0;
  const hardSolved       = roadmap.practice_stats?.hard_solved ?? 0;
  const examAttempts     = roadmap.exam_stats?.total_attempts ?? 0;
  const bestScore        = roadmap.exam_stats?.best_score ?? 0;
  const avgScore         = roadmap.exam_stats?.average_score ?? 0;

  const topicBreakdown  = performance?.topic_breakdown ?? [];
  const languageUsage   = performance?.language_usage ?? [];
  const examBreakdown   = performance?.exam_breakdown ?? [];

  const totalDifficultySolved = easySolved + mediumSolved + hardSolved;
  const trendIcon = performanceTrend === 'improving' ? '📈' : performanceTrend === 'declining' ? '📉' : '➡️';

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4 mb-6 -mx-4 sm:-mx-6 lg:-mx-8 -mt-6">
        <div className="mx-auto flex w-full items-center justify-between px-2 sm:px-4 lg:px-6">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
              📊 SMART Code
              <span className="text-base font-normal text-[var(--text-secondary)]">/ Progress</span>
            </h1>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Track your coding performance, topic strength, and exam outcomes
            </p>
          </div>
          <div className={`hidden rounded-full px-3 py-1.5 text-xs font-medium md:inline-flex ${band.chip}`}>
            {band.label}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full flex-col gap-6 px-2 sm:px-4 lg:px-6">

        {/* ── Performance Banner ───────────────────────────────── */}
        <div className={`relative overflow-hidden rounded-3xl border ${band.border} ${band.bg} p-6 shadow-[0_12px_36px_rgba(0,0,0,0.14)]`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl ring-1 ring-white/10">
                  {performanceBand === 'green' ? '🚀' : performanceBand === 'yellow' ? '✨' : '🎯'}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">Performance summary</p>
                  <h2 className={`text-2xl font-semibold ${band.text}`}>{band.label}</h2>
                </div>
              </div>
              <p className="max-w-2xl text-sm text-[var(--text-secondary)] capitalize">
                Momentum is{' '}
                <span className="font-medium text-[var(--text-primary)]">{trendIcon} {performanceTrend}</span>.
                {' '}Keep solving consistently to improve your acceptance rate and strengthen weak areas.
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip label="Acceptance" value={`${acceptanceRate}%`} color="orange" />
                <Chip label="Solved" value={String(totalSolved)} color="blue" />
                <Chip label="Exams" value={String(examAttempts)} color="violet" />
                {currentStreak > 0 && <Chip label="🔥 Streak" value={`${currentStreak}d`} color="red" />}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:min-w-[340px]">
              <HeroMetric label="Acceptance Rate" value={`${acceptanceRate}%`} />
              <HeroMetric label="Avg Exam Score" value={`${avgScore}%`} />
              <HeroMetric label="Best Exam Score" value={`${bestScore}%`} />
              <HeroMetric label="Current Streak" value={`${currentStreak}d`} />
            </div>
          </div>
        </div>

        {/* ── Stat Cards ──────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total Solved" value={totalSolved} hint="Questions accepted" accent="blue" icon="✅" />
          <StatCard label="Submissions" value={totalSubmissions} hint="All attempts" accent="orange" icon="📤" />
          <StatCard label="Exams Taken" value={examAttempts} hint="Completed exams" accent="violet" icon="📝" />
          <StatCard label="Best Exam Score" value={`${bestScore}%`} hint="Highest recorded" accent="green" icon="🏆" />
        </div>

        {/* ── Activity Heatmap ─────────────────────────────────── */}
        <ActivityHeatmap activity={dailyActivity} />

        {/* ── Tab Navigation ──────────────────────────────────── */}
        <div className="flex gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-1 w-fit">
          {(['overview', 'exams', 'topics'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition-all ${
                activeTab === tab
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab === 'exams' ? `Exams (${examAttempts})` : tab}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_1fr]">
            {/* Difficulty Breakdown */}
            <SectionCard
              title="Problems Solved by Difficulty"
              subtitle="Across all practice and exam submissions"
            >
              <div className="space-y-4">
                <DifficultyBar label="Easy" solved={easySolved} total={Math.max(totalDifficultySolved, 1)} color="bg-emerald-500" textClass="text-emerald-400" />
                <DifficultyBar label="Medium" solved={mediumSolved} total={Math.max(totalDifficultySolved, 1)} color="bg-amber-500" textClass="text-amber-300" />
                <DifficultyBar label="Hard" solved={hardSolved} total={Math.max(totalDifficultySolved, 1)} color="bg-red-500" textClass="text-red-400" />
              </div>
            </SectionCard>

            {/* Languages */}
            <SectionCard title="Languages Used" subtitle="Your coding language preferences">
              {languageUsage.length > 0 ? (
                <div className="space-y-3">
                  {languageUsage.map(lang => (
                    <div key={lang.language} className="flex items-center gap-3">
                      <span className="w-24 text-sm capitalize text-[var(--text-primary)] truncate">{lang.language}</span>
                      <div className="flex-1 h-2 overflow-hidden rounded-full bg-[var(--border)]">
                        <div
                          className="h-full rounded-full bg-violet-500 transition-all"
                          style={{ width: `${Math.max(6, lang.percentage)}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-[var(--text-secondary)] w-12 text-right">
                        {lang.count} sub{lang.count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyPanel icon="💻" title="No language usage yet"
                  description="Submit solutions and your language preferences will appear here." />
              )}
            </SectionCard>
          </div>
        )}

        {/* ── Exams Tab ───────────────────────────────────────── */}
        {activeTab === 'exams' && (
          <div>
            {examBreakdown.length > 0 ? (
              <>
                {/* Score Distribution Summary */}
                <div className="mb-5 grid grid-cols-3 gap-4">
                  {[
                    { label: '≥ 75%', count: examBreakdown.filter(e => e.score_pct >= 75).length, color: 'text-emerald-400' },
                    { label: '50–74%', count: examBreakdown.filter(e => e.score_pct >= 50 && e.score_pct < 75).length, color: 'text-amber-400' },
                    { label: '< 50%', count: examBreakdown.filter(e => e.score_pct < 50).length, color: 'text-red-400' },
                  ].map(({ label, count, color }) => (
                    <div key={label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-center">
                      <div className={`text-2xl font-bold ${color}`}>{count}</div>
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {examBreakdown.map(exam => (
                    <ExamCard key={exam.attempt_id} exam={exam} onClick={() => setSelectedAttemptId(exam.attempt_id)} />
                  ))}
                </div>
              </>
            ) : (
              <EmptyPanel icon="📝" title="No completed exams yet"
                description="Complete an exam to see your per-exam score, question breakdown, and topics covered." />
            )}
          </div>
        )}

        {/* ── Topics Tab ──────────────────────────────────────── */}
        {activeTab === 'topics' && (
          <div>
            {topicBreakdown.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {topicBreakdown.map(topic => {
                  const pct = topic.success_rate;
                  return (
                    <div
                      key={topic.topic}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4"
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-medium capitalize text-[var(--text-primary)]">{topic.topic}</span>
                        <span className={`text-sm font-bold tabular-nums ${scoreColor(pct)}`}>{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
                        <div
                          className={`h-full rounded-full transition-all ${scoreBarColor(pct)}`}
                          style={{ width: `${Math.max(pct > 0 ? 4 : 0, pct)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>{topic.solved}/{topic.attempted} solved</span>
                        <span>{pct >= 75 ? '✅ Strong' : pct >= 50 ? '⚠️ Average' : '❌ Weak'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyPanel icon="🧠" title="No topic data yet"
                description="Once you solve a few problems, your strongest and weakest topics will appear here." />
            )}
          </div>
        )}

      </div>

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

// ─── Sub-components ───────────────────────────────────────────────────

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  const cls: Record<string, string> = {
    orange: 'bg-orange-500/10 text-orange-300 ring-orange-500/20',
    blue:   'bg-blue-500/10 text-blue-300 ring-blue-500/20',
    violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/20',
    red:    'bg-red-500/10 text-red-300 ring-red-500/20',
  };
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs ring-1 ${cls[color] ?? cls.blue}`}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/70 px-4 py-4 backdrop-blur-sm">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function StatCard({
  label, value, hint, accent, icon,
}: {
  label: string; value: string | number; hint: string; accent: 'blue' | 'orange' | 'violet' | 'green'; icon: string;
}) {
  const map = {
    blue:   'from-blue-500/20 to-blue-500/5 text-blue-300',
    orange: 'from-orange-500/20 to-orange-500/5 text-orange-300',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-300',
    green:  'from-green-500/20 to-green-500/5 text-green-300',
  } as const;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.10)]">
      <div className="mb-3 flex items-center justify-between">
        <div className={`h-1.5 w-14 rounded-full bg-gradient-to-r ${map[accent]}`} />
        <span className="text-lg">{icon}</span>
      </div>
      <div className="text-3xl font-bold text-[var(--text-primary)]">{value}</div>
      <div className="mt-1 text-sm font-medium text-[var(--text-primary)]">{label}</div>
      <div className="mt-1 text-xs text-[var(--text-secondary)]">{hint}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
      <div className="mb-5">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function DifficultyBar({ label, solved, total, color, textClass }: {
  label: string; solved: number; total: number; color: string; textClass: string;
}) {
  const pct = total > 0 ? (solved / total) * 100 : 0;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/70 px-4 py-3">
      <div className="mb-2 flex justify-between text-sm">
        <span className={`font-medium ${textClass}`}>{label}</span>
        <span className="font-semibold text-[var(--text-primary)]">{solved}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(solved > 0 ? 8 : 0, pct)}%` }} />
      </div>
      <div className="mt-2 text-right text-xs text-[var(--text-secondary)]">{pct.toFixed(0)}% of solved set</div>
    </div>
  );
}

function EmptyPanel({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-primary)]/45 px-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--bg-secondary)] text-xl">
        {icon}
      </div>
      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">{description}</p>
    </div>
  );
}
