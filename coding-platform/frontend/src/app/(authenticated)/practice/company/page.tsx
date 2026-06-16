'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { practiceApi } from '@/lib/api';
import type { PracticeCompanyGroup } from '@/types';

export default function CompanyWisePracticePage() {
  const [companies, setCompanies] = useState<PracticeCompanyGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await practiceApi.getByCompany();
        if (res?.data?.data) setCompanies(res.data.data as PracticeCompanyGroup[]);
      } catch (err) {
        console.error('Failed to load companies:', err);
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
        <span className="text-lg text-[var(--text-secondary)]">Loading companies…</span>
      </div>
    );
  }

  // Assign each company a color from a palette for visual variety
  const colorPalettes = [
    { border: 'border-emerald-200 dark:border-emerald-800', bg: 'bg-emerald-50 dark:bg-emerald-950', text: 'text-emerald-700 dark:text-emerald-300', icon: 'from-emerald-500 to-emerald-600', shadow: 'shadow-emerald-500/25', hover: 'hover:border-emerald-400/50', accent: 'text-emerald-500' },
    { border: 'border-violet-200 dark:border-violet-800', bg: 'bg-violet-50 dark:bg-violet-950', text: 'text-violet-700 dark:text-violet-300', icon: 'from-violet-500 to-violet-600', shadow: 'shadow-violet-500/25', hover: 'hover:border-violet-400/50', accent: 'text-violet-500' },
    { border: 'border-sky-200 dark:border-sky-800', bg: 'bg-sky-50 dark:bg-sky-950', text: 'text-sky-700 dark:text-sky-300', icon: 'from-sky-500 to-sky-600', shadow: 'shadow-sky-500/25', hover: 'hover:border-sky-400/50', accent: 'text-sky-500' },
    { border: 'border-rose-200 dark:border-rose-800', bg: 'bg-rose-50 dark:bg-rose-950', text: 'text-rose-700 dark:text-rose-300', icon: 'from-rose-500 to-rose-600', shadow: 'shadow-rose-500/25', hover: 'hover:border-rose-400/50', accent: 'text-rose-500' },
    { border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700 dark:text-amber-300', icon: 'from-amber-500 to-amber-600', shadow: 'shadow-amber-500/25', hover: 'hover:border-amber-400/50', accent: 'text-amber-500' },
    { border: 'border-teal-200 dark:border-teal-800', bg: 'bg-teal-50 dark:bg-teal-950', text: 'text-teal-700 dark:text-teal-300', icon: 'from-teal-500 to-teal-600', shadow: 'shadow-teal-500/25', hover: 'hover:border-teal-400/50', accent: 'text-teal-500' },
  ];

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
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-xl shadow-lg shadow-emerald-500/25">
              🏢
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">Company-wise Practice</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {companies.length} companies • {companies.reduce((s, c) => s + Number(c.question_count), 0)} total problems
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Company Grid */}
      <div className="w-full px-4 py-8 sm:px-6 lg:px-10 xl:px-12">
        {companies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🏢</div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No company problems available yet</h3>
            <p className="text-sm text-[var(--text-secondary)] max-w-md">
              Company-specific problems will appear here once the coordinators start adding questions tagged to companies.
            </p>
            <Link href="/practice/all" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[var(--accent-strong)]">
              Browse All Problems →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {companies.map((company, idx) => {
              const total = Number(company.question_count);
              const easy = Number(company.easy_count);
              const medium = Number(company.medium_count);
              const hard = Number(company.hard_count);
              const palette = colorPalettes[idx % colorPalettes.length];

              return (
                <Link
                  key={company.company_name}
                  href={`/practice/all?company=${encodeURIComponent(company.company_name)}`}
                  className="group"
                >
                  <div className={`relative overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] transition-all duration-300 hover:shadow-[0_16px_50px_rgba(15,23,42,0.12)] ${palette.hover} hover:-translate-y-0.5`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${palette.icon} text-white text-sm font-bold ${palette.shadow} shadow-lg`}>
                          {company.company_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className={`text-base font-semibold text-[var(--text-primary)] truncate group-hover:${palette.accent} transition-colors`}>
                            {company.company_name}
                          </h3>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                            {total} problem{total !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`text-lg ${palette.accent} group-hover:translate-x-1 transition-transform ml-2`}>→</span>
                    </div>

                    {/* Difficulty Breakdown */}
                    <div className="flex gap-2 flex-wrap">
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
