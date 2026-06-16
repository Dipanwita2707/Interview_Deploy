'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { practiceApi } from '@/lib/api';
import type { PracticeCourseGroup } from '@/types';

export default function CourseWisePracticePage() {
  const [courses, setCourses] = useState<PracticeCourseGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await practiceApi.getByCourse();
        if (res?.data?.data) setCourses(res.data.data as PracticeCourseGroup[]);
      } catch (err) {
        console.error('Failed to load courses:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <svg className="mr-3 h-8 w-8 animate-spin text-[var(--accent)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-lg text-[var(--text-secondary)]">Loading courses…</span>
      </div>
    );
  }

  return (
    <div className="relative left-1/2 min-h-screen w-screen -translate-x-1/2">
      {/* Header */}
      <div className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="w-full px-4 py-6 sm:px-6 lg:px-10 xl:px-12">
          <div className="flex items-center gap-3 mb-2">
            <Link href="/practice" className="text-sm text-[var(--accent)] hover:underline">
              ← Back to Practice Hub
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 text-xl shadow-lg shadow-blue-500/25">
              📚
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Course-wise Practice</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {courses.length} courses • {courses.reduce((s, c) => s + Number(c.question_count), 0)} total problems
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Course Grid */}
      <div className="w-full px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">📚</div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No courses available yet</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-md">
              Course-specific problems will appear here once the coordinators start adding questions tagged to courses.
            </p>
            <Link href="/practice/all" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--accent-strong)]">
              Browse All Problems →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {courses.map((course) => {
              const total = Number(course.question_count);
              const easy = Number(course.easy_count);
              const medium = Number(course.medium_count);
              const hard = Number(course.hard_count);

              return (
                <Link
                  key={course.course_id}
                  href={`/practice/all?courseId=${encodeURIComponent(course.course_id)}&courseName=${encodeURIComponent(course.course_name)}`}
                  className="group"
                >
                  <div className="relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all duration-300 hover:shadow-[0_16px_50px_rgba(15,23,42,0.12)] hover:border-[var(--accent)]/50 hover:-translate-y-0.5">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400 opacity-0 transition-opacity group-hover:opacity-100" />

                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                          {course.course_name}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                          {total} problem{total !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <span className="text-lg text-[var(--accent)] group-hover:translate-x-1 transition-transform ml-2">→</span>
                    </div>

                    {/* Difficulty Breakdown */}
                    <div className="flex gap-2">
                      {easy > 0 && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          Easy {easy}
                        </span>
                      )}
                      {medium > 0 && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Med {medium}
                        </span>
                      )}
                      {hard > 0 && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                          Hard {hard}
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {total > 0 && (
                      <div className="mt-4 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                        <div className="flex h-full">
                          {easy > 0 && <div className="bg-emerald-500" style={{ width: `${(easy / total) * 100}%` }} />}
                          {medium > 0 && <div className="bg-amber-500" style={{ width: `${(medium / total) * 100}%` }} />}
                          {hard > 0 && <div className="bg-red-500" style={{ width: `${(hard / total) * 100}%` }} />}
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
