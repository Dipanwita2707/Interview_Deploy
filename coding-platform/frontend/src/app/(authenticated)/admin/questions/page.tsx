'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { questionApi } from '@/lib/api';
import type { Question } from '@/types';

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  approved: 'bg-[var(--accent-soft)] text-[var(--accent-strong)]',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-red-100 text-red-700',
};

export default function QuestionsAdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, limit: 20 };
      if (statusFilter) params.status = statusFilter;

      const res = await questionApi.list(params);
      // API returns { questions: [], total, page, limit } wrapped in data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = res.data.data as any;
      const rows: Question[] = Array.isArray(payload)
        ? payload
        : (payload?.questions ?? []);
      setQuestions(rows);
      const total: number = payload?.total ?? rows.length;
      setTotalPages(Math.max(1, Math.ceil(total / 20)));
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">📋 Question Management</h1>
        <Link
          href="/admin/questions/create"
          className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          + Create Question
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        {['', 'draft', 'approved', 'published', 'archived'].map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              statusFilter === s
                ? 'bg-primary-600 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--border)]'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-8 text-[var(--text-secondary)]">Loading…</div>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[var(--bg-secondary)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Title</th>
                <th className="text-left px-4 py-3 font-medium">Difficulty</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Topics</th>
                <th className="text-left px-4 py-3 font-medium">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {questions.map((q) => (
                // list endpoint returns question_id (qb.id alias), version_id (qv.id alias)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <tr key={(q as any).question_id ?? q.version_id ?? q.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                  <td className="px-4 py-3">
                    <Link href={`/admin/questions/${q.version_id}`} className="font-medium hover:text-primary-600">
                      {q.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      q.difficulty === 'easy' ? 'bg-green-50 text-green-600' :
                      q.difficulty === 'medium' ? 'bg-amber-50 text-amber-600' :
                      'bg-red-50 text-red-600'
                    }`}>
                      {q.difficulty}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[q.status] || ''}`}>
                      {q.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {q.topic_tags?.slice(0, 3).map((tag) => (
                        <span key={tag} className="px-1.5 py-0.5 text-xs bg-[var(--bg-secondary)] rounded">
                          {tag}
                        </span>
                      ))}
                      {(q.topic_tags?.length || 0) > 3 && (
                        <span className="text-xs text-[var(--text-secondary)]">+{q.topic_tags!.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">v{q.version_number}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-3 bg-[var(--bg-secondary)] border-t border-[var(--border)]">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm rounded border border-[var(--border)] disabled:opacity-50"
              >
                ← Prev
              </button>
              <span className="text-sm text-[var(--text-secondary)]">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm rounded border border-[var(--border)] disabled:opacity-50"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
