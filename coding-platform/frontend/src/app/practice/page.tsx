'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { practiceApi, studentApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { CodingRole } from '@/types';
import type { PracticeCourseGroup, PracticeCompanyGroup, RoadmapSummary } from '@/types';

export default function PracticeLandingPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const [courses, setCourses] = useState<PracticeCourseGroup[]>([]);
  const [companies, setCompanies] = useState<PracticeCompanyGroup[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Redirect staff and heads to their questions dashboard
  useEffect(() => {
    if (user && user.role !== CodingRole.STUDENT) {
      router.replace('/admin/questions');
    }
  }, [user, router]);

  useEffect(() => {
    const load = async () => {
      try {
        const [courseRes, companyRes, roadmapRes] = await Promise.all([
          practiceApi.getByCourse().catch(() => null),
          practiceApi.getByCompany().catch(() => null),
          user ? studentApi.getRoadmapSummary(user.id).catch(() => null) : Promise.resolve(null),
        ]);
        if (courseRes?.data?.data) setCourses(courseRes.data.data as PracticeCourseGroup[]);
        if (companyRes?.data?.data) setCompanies(companyRes.data.data as PracticeCompanyGroup[]);
        if (roadmapRes?.data?.data) setRoadmap(roadmapRes.data.data as RoadmapSummary);
      } catch (err) {
        console.error("Failed to load practice data:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const totalCourseQuestions = courses.reduce((s, c) => s + Number(c.question_count), 0);
  const totalCompanyQuestions = companies.reduce((s, c) => s + Number(c.question_count), 0);
  const totalSolved = roadmap?.practice_stats?.total_solved ?? 0;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <svg className="mr-3 h-8 w-8 animate-spin text-[var(--accent)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-lg text-[var(--text-secondary)]">Loading practice hub…</span>
      </div>
    );
  }

  return (
    <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2">
      {/* ═══ HEADER ═════════════════════════════════════════════════════════ */}
      <div className="border-b border-[var(--border)] bg-[linear-gradient(135deg,rgba(242,130,65,0.18),transparent_38%),linear-gradient(180deg,rgba(191,83,59,0.05),rgba(191,83,59,0)),var(--bg-secondary)]">
        <div className="w-full px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
          <div className="flex flex-col gap-5 rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.56),rgba(255,255,255,0.18)),var(--bg-surface)] px-5 py-6 shadow-[var(--card-shadow)] sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="space-y-3">
              <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                🚀 SMART Code
                <span className="text-lg font-normal text-[var(--text-secondary)] sm:text-2xl">/ Practice Hub</span>
              </h1>
              <p className="text-sm text-[var(--text-secondary)] sm:text-base max-w-lg">
                Choose your practice mode — master course-specific topics, prepare with company-style questions, or test yourself in exams.
              </p>
              <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
                {totalSolved > 0 && (
                  <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-700 dark:text-emerald-300">
                    {totalSolved} problems solved
                  </div>
                )}
                <div className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-[var(--accent-strong)]">
                  {totalCourseQuestions + totalCompanyQuestions} total questions
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Link
                href="/practice/all"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(242,130,65,0.32)] transition-all hover:bg-[var(--accent-strong)] hover:shadow-[0_16px_34px_rgba(191,83,59,0.34)]"
              >
                <span>📋</span> All Problems
              </Link>
              <p className="text-xs text-[var(--text-secondary)]">
                Browse the complete problem pool
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ THREE CARDS ════════════════════════════════════════════════════ */}
      <div className="w-full px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">

          {/* ── Card 1: Course-wise Practice ─────────────────────────────── */}
          <Link href="/practice/course" className="group">
            <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] transition-all duration-300 hover:shadow-[0_20px_60px_rgba(15,23,42,0.15)] hover:border-[var(--accent)]/50 hover:-translate-y-1">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-blue-400 to-cyan-400" />

              <div className="flex items-center gap-4 mb-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-2xl shadow-lg shadow-blue-500/25">
                  📚
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                    Course-wise Practice
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Practice by your course subjects
                  </p>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">
                Solve problems organized by your academic courses. Perfect for exam preparation and strengthening subject-specific programming skills.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-[var(--accent-soft)] bg-[var(--accent-soft)] px-3 py-1 text-xs font-medium text-[var(--accent-strong)]">
                    {courses.length} courses
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {totalCourseQuestions} problems
                  </span>
                </div>
                <span className="text-sm font-medium text-[var(--accent)] group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </Link>

          {/* ── Card 2: Company-wise Practice ────────────────────────────── */}
          <Link href="/practice/company" className="group">
            <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] transition-all duration-300 hover:shadow-[0_20px_60px_rgba(15,23,42,0.15)] hover:border-emerald-400/50 hover:-translate-y-1">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />

              <div className="flex items-center gap-4 mb-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-2xl shadow-lg shadow-emerald-500/25">
                  🏢
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-emerald-500 transition-colors">
                    Company-wise Practice
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Prepare for specific companies
                  </p>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">
                Practice coding questions categorized by company. Ideal for placement preparation — tackle the exact types of problems asked by your dream companies.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {companies.length} companies
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {totalCompanyQuestions} problems
                  </span>
                </div>
                <span className="text-sm font-medium text-emerald-500 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </Link>

          {/* ── Card 3: Exam ─────────────────────────────────────────────── */}
          <Link href="/exam" className="group">
            <div className="relative overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[0_12px_40px_rgba(15,23,42,0.08)] transition-all duration-300 hover:shadow-[0_20px_60px_rgba(15,23,42,0.15)] hover:border-amber-400/50 hover:-translate-y-1">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-red-400" />

              <div className="flex items-center gap-4 mb-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-2xl shadow-lg shadow-amber-500/25">
                  🎯
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] group-hover:text-amber-500 transition-colors">
                    Exam
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Timed assessments & mock tests
                  </p>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-5 leading-relaxed">
                Take proctored coding exams under real-time conditions. Get evaluated with automated scoring, time tracking, and detailed performance reports.
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {roadmap?.exam_stats && (
                    <>
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        {roadmap.exam_stats.total_attempts} taken
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        Best: {roadmap.exam_stats.best_score}%
                      </span>
                    </>
                  )}
                  {!roadmap?.exam_stats && (
                    <span className="text-xs text-[var(--text-secondary)]">Ready to begin</span>
                  )}
                </div>
                <span className="text-sm font-medium text-amber-500 group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </Link>
        </div>

        {/* ═══ QUICK LINKS ══════════════════════════════════════════════════ */}
        <div className="mt-8 rounded-[20px] border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Quick Links</h3>
          <div className="flex flex-wrap gap-3">
            <Link href="/practice/all" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition-all hover:border-[var(--accent)] hover:shadow-sm">
              📋 All Problems
            </Link>
            <Link href="/practice/personalized" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition-all hover:border-[var(--accent)] hover:shadow-sm">
              ✨ Personalized Set
            </Link>
            <Link href="/progress" className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition-all hover:border-[var(--accent)] hover:shadow-sm">
              📊 My Progress
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
