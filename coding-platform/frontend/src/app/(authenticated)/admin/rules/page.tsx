'use client';

import { useEffect, useState } from 'react';
import { ruleApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { RuleTemplate } from '@/types';

export default function RulesAdminPage() {
  const { isHead } = useAuthStore();
  const [rules, setRules] = useState<RuleTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const [newRule, setNewRule] = useState({
    name: '',
    department: '',
    batch_year: '',
    pool_type: 'exam',
    easy_count: 2,
    medium_count: 2,
    hard_count: 1,
    time_limit_minutes: 60,
    topic_tags: '',
    is_default: false,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const res = await ruleApi.list();
        setRules((res.data.data as RuleTemplate[]) || []);
      } catch (err) {
        console.error('Failed to load rules:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCreate = async () => {
    try {
      const payload = {
        ...newRule,
        batch_year: newRule.batch_year ? Number(newRule.batch_year) : undefined,
        topic_tags: newRule.topic_tags ? newRule.topic_tags.split(',').map((t) => t.trim()) : [],
      };
      const res = await ruleApi.create(payload);
      const created = res.data.data as RuleTemplate;
      setRules((prev) => [created, ...prev]);
      setShowCreate(false);
      setNewRule({
        name: '', department: '', batch_year: '', pool_type: 'exam',
        easy_count: 2, medium_count: 2, hard_count: 1, time_limit_minutes: 60,
        topic_tags: '', is_default: false,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create rule');
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-[var(--text-secondary)]">Loading…</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">⚙️ Rule Templates</h1>
        {isHead() && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            {showCreate ? 'Cancel' : '+ Create Rule'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm mb-4">{error}</div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="border border-[var(--border)] rounded-lg p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={newRule.name}
                onChange={(e) => setNewRule((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
                placeholder="e.g. CS Final Exam 2025"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Pool Type</label>
              <select
                value={newRule.pool_type}
                onChange={(e) => setNewRule((p) => ({ ...p, pool_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              >
                <option value="exam">Exam</option>
                <option value="practice">Practice</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Easy</label>
              <input
                type="number"
                value={newRule.easy_count}
                onChange={(e) => setNewRule((p) => ({ ...p, easy_count: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Medium</label>
              <input
                type="number"
                value={newRule.medium_count}
                onChange={(e) => setNewRule((p) => ({ ...p, medium_count: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hard</label>
              <input
                type="number"
                value={newRule.hard_count}
                onChange={(e) => setNewRule((p) => ({ ...p, hard_count: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time (min)</label>
              <input
                type="number"
                value={newRule.time_limit_minutes}
                onChange={(e) => setNewRule((p) => ({ ...p, time_limit_minutes: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Department (optional)</label>
              <input
                type="text"
                value={newRule.department}
                onChange={(e) => setNewRule((p) => ({ ...p, department: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
                placeholder="Computer Science"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Batch Year (optional)</label>
              <input
                type="text"
                value={newRule.batch_year}
                onChange={(e) => setNewRule((p) => ({ ...p, batch_year: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
                placeholder="2025"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_default"
              checked={newRule.is_default}
              onChange={(e) => setNewRule((p) => ({ ...p, is_default: e.target.checked }))}
            />
            <label htmlFor="is_default" className="text-sm">Set as default template</label>
          </div>

          <button
            onClick={handleCreate}
            disabled={!newRule.name}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            ✓ Create Rule Template
          </button>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-secondary)]">No rule templates yet.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((rule) => (
            <div key={rule.id} className="border border-[var(--border)] rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold">{rule.name}</h3>
                <div className="flex gap-1">
                  {rule.is_default && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">Default</span>
                  )}
                  <span className={`px-2 py-0.5 text-xs rounded-full ${
                    rule.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {rule.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mb-2">
                <span className="text-green-600">{rule.easy_count} Easy</span>
                <span className="text-amber-600">{rule.medium_count} Medium</span>
                <span className="text-red-600">{rule.hard_count} Hard</span>
              </div>
              <div className="text-sm text-[var(--text-secondary)]">
                ⏱ {rule.time_limit_minutes} min • {rule.pool_type}
                {rule.department && ` • ${rule.department}`}
                {rule.batch_year && ` • ${rule.batch_year}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
