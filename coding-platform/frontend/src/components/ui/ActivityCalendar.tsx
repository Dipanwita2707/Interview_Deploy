'use client';

import { useMemo } from 'react';

export interface ActivityDay {
  day: string;        // 'YYYY-MM-DD'
  submissions: number | string;
  solved: number | string;
}

interface ActivityCalendarProps {
  data: ActivityDay[];
  currentStreak: number;
  longestStreak: number;
  totalActive: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function addDaysUTC(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['','Mon','','Wed','','Fri',''];

function cellColor(subs: number, solved: number): string {
  if (subs === 0 && solved === 0) return 'border border-[var(--border)] bg-[var(--bg-elevated)]';
  if (solved >= 3) return 'bg-[var(--accent-strong)]';
  if (solved >= 2) return 'bg-[var(--accent)]';
  if (solved >= 1) return 'bg-orange-300';
  // attempted but not solved
  return 'bg-orange-100 dark:bg-orange-900/40';
}

function makeTooltip(day: string, subs: number, solved: number) {
  if (subs === 0 && solved === 0) return `${day} — No activity`;
  const parts: string[] = [];
  if (solved > 0) parts.push(`${solved} question${solved !== 1 ? 's' : ''} solved`);
  if (subs > solved) parts.push(`${subs - solved} attempted`);
  return `${day} — ${parts.join(', ')}`;
}

// ── Build Jan 1 → Dec 31 grid for the current year ──────────────────────────
function buildGrid(data: ActivityDay[]) {
  // Normalise keys: handle both 'YYYY-MM-DD' and ISO timestamp strings
  const map = new Map<string, { subs: number; solved: number }>();
  data.forEach(d => {
    const key = String(d.day).slice(0, 10);
    map.set(key, {
      subs:   Number(d.submissions),
      solved: Number(d.solved),
    });
  });

  const todayUTC  = new Date().toISOString().slice(0, 10);
  const year      = new Date(todayUTC + 'T00:00:00Z').getUTCFullYear();
  const jan1      = `${year}-01-01`;
  const dec31     = `${year}-12-31`;

  // Grid starts on the Sunday on/before Jan 1
  const jan1Date  = new Date(jan1 + 'T00:00:00Z');
  const dow       = jan1Date.getUTCDay();          // 0=Sun
  const gridStart = addDaysUTC(jan1, -dow);

  const weeks: Array<Array<{ ymd: string; subs: number; solved: number; inYear: boolean; isFuture: boolean }>> = [];
  let cur = gridStart;

  // We need enough weeks to cover Jan 1 through Dec 31
  while (cur <= addDaysUTC(dec31, 6)) {
    const week: typeof weeks[0] = [];
    for (let d = 0; d < 7; d++) {
      const entry = map.get(cur);
      week.push({
        ymd:      cur,
        subs:     entry?.subs   ?? 0,
        solved:   entry?.solved ?? 0,
        inYear:   cur >= jan1 && cur <= dec31,
        isFuture: cur > todayUTC,
      });
      cur = addDaysUTC(cur, 1);
    }
    weeks.push(week);
    if (weeks.length >= 54) break;
  }

  // Month labels: first col where month changes (only within-year weeks)
  const monthLabels: Array<{ col: number; label: string }> = [];
  let lastMonth = -1;
  weeks.forEach((week, col) => {
    const inYearDay = week.find(c => c.inYear);
    if (!inYearDay) return;
    const m = new Date(inYearDay.ymd + 'T00:00:00Z').getUTCMonth();
    if (m !== lastMonth) {
      monthLabels.push({ col, label: MONTHS[m] });
      lastMonth = m;
    }
  });

  return { weeks, monthLabels, todayUTC, year };
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function ActivityCalendar({
  data,
  currentStreak,
  longestStreak,
  totalActive,
}: ActivityCalendarProps) {
  const { weeks, monthLabels, todayUTC, year } = useMemo(() => buildGrid(data), [data]);
  const totalSolved = useMemo(() => data.reduce((sum, d) => sum + Number(d.solved), 0), [data]);
  const recentSolved = useMemo(() => {
    const cutoff = addDaysUTC(todayUTC, -29);
    return data.reduce((sum, d) => {
      const ymd = String(d.day).slice(0, 10);
      return ymd >= cutoff && ymd <= todayUTC ? sum + Number(d.solved) : sum;
    }, 0);
  }, [data, todayUTC]);
  const completionRate = useMemo(() => {
    const elapsedDays = Math.max(
      1,
      Math.floor(
        (new Date(todayUTC + 'T00:00:00Z').getTime() - new Date(`${year}-01-01T00:00:00Z`).getTime()) / 86400000,
      ) + 1,
    );
    return Math.round((totalActive / elapsedDays) * 100);
  }, [todayUTC, totalActive, year]);

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(242,130,65,0.10),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.45),rgba(255,255,255,0.06)),var(--bg-surface)] p-5 shadow-[var(--card-shadow)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(242,130,65,0.12),transparent_26%)]" />
      <div className="pointer-events-none absolute -left-10 top-8 h-24 w-24 rounded-full bg-[var(--accent-soft)] blur-3xl" />

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-base text-[var(--accent-strong)] ring-1 ring-[rgba(242,130,65,0.22)]">
                🔥
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Coding Activity</p>
                <p className="text-xs text-[var(--text-secondary)]">Track your unique solves, streaks, and consistency across {year}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full border border-[rgba(242,130,65,0.18)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--accent-strong)]">{totalSolved}</span>{' '}
                question{totalSolved !== 1 ? 's' : ''} solved
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{totalActive}</span>{' '}
                active day{totalActive !== 1 ? 's' : ''}
              </div>
              <div className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--accent-strong)]">{recentSolved}</span> solved in 30 days
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 xl:min-w-[320px]">
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-elevated)]/88 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Current streak</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{currentStreak}<span className="ml-1 text-sm text-[var(--accent-strong)]">days</span></p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-elevated)]/88 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Longest streak</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{longestStreak}<span className="ml-1 text-sm text-[var(--accent-strong)]">days</span></p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-elevated)]/88 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">Consistency</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{completionRate}<span className="ml-1 text-sm text-[var(--accent-strong)]">%</span></p>
            </div>
            <div className="rounded-[24px] border border-[var(--border)] bg-[var(--bg-elevated)]/88 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">{year}</p>
              <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{weeks.length}<span className="ml-1 text-sm text-[var(--accent-strong)]">weeks</span></p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-elevated)]/72 px-4 py-4 backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Daily contribution heatmap</p>
              <p className="text-[11px] text-[var(--text-secondary)]">Warmer cells mean more questions solved</p>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="inline-flex min-w-max gap-0">
                <div className="mr-2 flex flex-col gap-[4px] pt-6">
                {DAYS.map((label, i) => (
                  <div key={i} className="flex h-[13px] items-center pr-1 text-[10px] leading-none text-[var(--text-secondary)]">
                    {label}
                  </div>
                ))}
                </div>
                <div>
                  <div className="mb-2 flex h-4 gap-[4px]">
                    {weeks.map((_, col) => {
                      const lbl = monthLabels.find(m => m.col === col);
                      return (
                        <div key={col} className="w-[13px] whitespace-nowrap text-[10px] leading-none text-[var(--text-secondary)]">
                          {lbl?.label ?? ''}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-[4px]">
                    {weeks.map((week, col) => (
                      <div key={col} className="flex flex-col gap-[4px]">
                        {week.map(({ ymd, subs, solved, inYear, isFuture }) => {
                          const isToday = ymd === todayUTC;
                          const hidden = !inYear;
                          return (
                            <div
                              key={ymd}
                              title={inYear && !isFuture ? makeTooltip(ymd, subs, solved) : undefined}
                              className={`h-[13px] w-[13px] rounded-[4px] transition-all duration-150 ${
                                hidden
                                  ? 'pointer-events-none opacity-0'
                                  : isFuture
                                    ? 'border border-[var(--border)] bg-[var(--bg-elevated)] opacity-35'
                                    : isToday && subs === 0
                                      ? 'border-2 border-[var(--accent)] bg-[var(--bg-elevated)] shadow-[0_0_0_3px_rgba(242,130,65,0.14)]'
                                      : cellColor(subs, solved)
                              } ${!hidden && !isFuture ? 'cursor-default hover:-translate-y-[1px] hover:scale-[1.16] hover:shadow-[0_4px_10px_rgba(242,130,65,0.22)]' : ''}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-[var(--border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] text-[var(--text-secondary)]">Tip: solve at least one question daily to keep your streak alive.</p>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--text-secondary)]">Less</span>
                {[
                  'border border-[var(--border)] bg-[var(--bg-elevated)]',
                  'bg-orange-100 dark:bg-orange-900/40',
                  'bg-orange-300',
                  'bg-[var(--accent)]',
                  'bg-[var(--accent-strong)]',
                ].map((cls, i) => (
                  <div key={i} className={`h-[13px] w-[13px] rounded-[4px] ${cls}`} />
                ))}
                <span className="text-[10px] text-[var(--text-secondary)]">More</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(242,130,65,0.12),rgba(255,255,255,0.46)),var(--bg-elevated)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Momentum</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{currentStreak}</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Keep solving today to extend your streak.</p>
            </div>

            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Best run</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{longestStreak}</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Your longest streak this year so far.</p>
            </div>

            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">Rhythm</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{completionRate}%</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">Days active out of the days elapsed this year.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
