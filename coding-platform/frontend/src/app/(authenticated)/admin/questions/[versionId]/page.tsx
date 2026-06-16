'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { questionApi, analyticsApi } from '@/lib/api';
import { useEditorStore, LANGUAGES } from '@/stores/editor-store';
import type { Question } from '@/types';

const CodeEditor = dynamic(() => import('@/components/editor/CodeEditor'), {
  ssr: false,
  loading: () => <div className="h-64 bg-[var(--bg-editor)] rounded-lg" />,
});

const STATUS_STEPS = ['draft', 'approved', 'published', 'archived'];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  approved: 'bg-blue-50 text-blue-700 border-blue-300',
  published: 'bg-green-50 text-green-700 border-green-300',
  archived: 'bg-red-50 text-red-700 border-red-300',
};

interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  is_public: boolean;
  order_index: number;
}

interface StarterCode {
  id: string;
  language_id: string;
  language_name: string;
  code: string;
}

export default function QuestionDetailPage() {
  const { versionId } = useParams<{ versionId: string }>();
  const router = useRouter();
  const { code, language } = useEditorStore();

  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'testcases' | 'startercode' | 'analytics'>('details');

  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [publishPools, setPublishPools] = useState<string[]>(['practice']);

  // Editable details state
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    difficulty: 'easy',
    constraints: '',
    input_format: '',
    output_format: '',
    topic_tags: '',
    time_limit_ms: 2000,
    memory_limit_kb: 262144,
  });

  // Analytics
  const [analyticsSubs, setAnalyticsSubs] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await questionApi.getByVersionId(versionId);
      const q = res.data.data as Question;
      setQuestion(q);
      setEditData({
        title: q.title || '',
        description: (q as any).description || (q as any).problem_statement || '',
        difficulty: q.difficulty || 'easy',
        constraints: (q as any).constraints || '',
        input_format: (q as any).input_format || '',
        output_format: (q as any).output_format || '',
        topic_tags: (q.topic_tags || []).join(', '),
        time_limit_ms: (q as any).time_limit_ms || 2000,
        memory_limit_kb: (q as any).memory_limit_kb || 262144,
      });
    } catch (err) {
      setError('Failed to load question');
    } finally {
      setLoading(false);
    }
  }, [versionId]);

  useEffect(() => { load(); }, [load]);

  const loadAnalytics = useCallback(async () => {
    if (analyticsLoading || analyticsSubs.length) return;
    setAnalyticsLoading(true);
    try {
      const res = await analyticsApi.getQuestionSubmissions(versionId);
      setAnalyticsSubs((res.data.data as any)?.submissions || []);
    } catch {
      setAnalyticsSubs([]);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [versionId, analyticsLoading, analyticsSubs.length]);

  useEffect(() => {
    if (activeTab === 'analytics') loadAnalytics();
  }, [activeTab, loadAnalytics]);

  const handleSaveDraft = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await questionApi.updateDraft(versionId, {
        ...editData,
        topicTags: editData.topic_tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setSuccess('Question updated successfully.');
      setEditMode(false);
      await load();
    } catch (err) {
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    setError('');
    try {
      await questionApi.approve(versionId);
      setSuccess('Question approved.');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to approve');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { setError('Please provide a reason for rejection.'); return; }
    setSaving(true);
    setError('');
    try {
      await questionApi.reject(versionId, rejectReason);
      setSuccess('Question rejected.');
      setShowReject(false);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reject');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (publishPools.length === 0) { setError('Select at least one pool type.'); return; }
    setSaving(true);
    setError('');
    try {
      await questionApi.publish(versionId, publishPools);
      setSuccess('Question published successfully.');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const handleAddStarterCode = async () => {
    if (!code.trim()) { setError('Write some starter code first.'); return; }
    setSaving(true);
    setError('');
    try {
      await questionApi.addStarterCode(versionId, [{ languageId: language, code }]);
      setSuccess(`Starter code for ${language} added.`);
      await load();
    } catch (err) {
      setError('Failed to add starter code');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <svg className="animate-spin h-8 w-8 text-[var(--accent)]" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="text-center py-12 text-[var(--text-secondary)]">
        <p className="text-red-500">{error || 'Question not found.'}</p>
        <button onClick={() => router.push('/admin/questions')} className="mt-4 text-[var(--accent)] hover:underline text-sm">
          ← Back to Questions
        </button>
      </div>
    );
  }

  const status = question.status || 'draft';
  const starterCodes: StarterCode[] = (question as any).starter_code || [];
  const testCases: TestCase[] = (question as any).public_test_cases || [];

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push('/admin/questions')}
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            ← Questions
          </button>
          <span className="text-[var(--text-secondary)]">/</span>
          <h1 className="text-xl font-bold text-[var(--text-primary)] truncate max-w-xl">
            {question.title}
          </h1>
          <span className={`px-2.5 py-1 text-xs font-medium rounded-full border capitalize ${STATUS_COLORS[status] || ''}`}>
            {status}
          </span>
          <span className={`px-2 py-0.5 text-xs rounded border ${
            question.difficulty === 'easy' ? 'bg-green-50 text-green-700 border-green-200' :
            question.difficulty === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
            'bg-red-50 text-red-700 border-red-200'
          }`}>
            {question.difficulty}
          </span>
        </div>

        {/* Action buttons based on status */}
        <div className="flex items-center gap-2 shrink-0">
          {status === 'draft' && (
            <>
              {editMode ? (
                <>
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : '💾 Save'}
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-1.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg-secondary)]"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setEditMode(true)}
                  className="px-4 py-1.5 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg-secondary)]"
                >
                  ✏️ Edit
                </button>
              )}
              <button
                onClick={handleApprove}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => setShowReject((v) => !v)}
                className="px-4 py-1.5 text-sm bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100"
              >
                ✗ Reject
              </button>
            </>
          )}
          {status === 'approved' && (
            <>
              <button
                onClick={handlePublish}
                disabled={saving}
                className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                🚀 {saving ? 'Publishing…' : 'Publish'}
              </button>
              <label className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={publishPools.includes('exam')}
                  onChange={(e) => setPublishPools(
                    e.target.checked ? [...publishPools, 'exam'] : publishPools.filter((p) => p !== 'exam')
                  )}
                /> Exam pool
              </label>
            </>
          )}
        </div>
      </div>

      {/* Reject reason input */}
      {showReject && (
        <div className="p-4 border border-red-200 rounded-lg bg-red-50 space-y-3">
          <label className="block text-sm font-medium text-red-800">Rejection reason</label>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-red-300 rounded-lg bg-white"
            placeholder="Explain why this question is being rejected…"
          />
          <div className="flex gap-2">
            <button onClick={handleReject} disabled={saving}
              className="px-4 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
              Confirm Reject
            </button>
            <button onClick={() => setShowReject(false)}
              className="px-4 py-1.5 text-sm border border-[var(--border)] rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {success && <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm">{success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {(['details', 'testcases', 'startercode', 'analytics'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-primary-600 text-primary-600 font-medium'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab === 'testcases' ? `Test Cases (${testCases.length})` :
             tab === 'startercode' ? `Starter Code (${starterCodes.length})` :
             tab === 'analytics' ? '📊 Analytics' :
             '📝 Details'}
          </button>
        ))}
      </div>

      {/* Tab: Details */}
      {activeTab === 'details' && (
        <div className="border border-[var(--border)] rounded-lg p-6 space-y-4">
          {editMode ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Title</label>
                  <input
                    value={editData.title}
                    onChange={(e) => setEditData((d) => ({ ...d, title: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Difficulty</label>
                  <select
                    value={editData.difficulty}
                    onChange={(e) => setEditData((d) => ({ ...d, difficulty: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Problem Statement (HTML)</label>
                <textarea
                  value={editData.description}
                  onChange={(e) => setEditData((d) => ({ ...d, description: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Input Format</label>
                  <textarea
                    value={editData.input_format}
                    onChange={(e) => setEditData((d) => ({ ...d, input_format: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Output Format</label>
                  <textarea
                    value={editData.output_format}
                    onChange={(e) => setEditData((d) => ({ ...d, output_format: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Constraints</label>
                <textarea
                  value={editData.constraints}
                  onChange={(e) => setEditData((d) => ({ ...d, constraints: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Topic Tags (comma-separated)</label>
                <input
                  value={editData.topic_tags}
                  onChange={(e) => setEditData((d) => ({ ...d, topic_tags: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                  placeholder="arrays, dp, graphs"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Time Limit (ms)</label>
                  <input
                    type="number"
                    value={editData.time_limit_ms}
                    onChange={(e) => setEditData((d) => ({ ...d, time_limit_ms: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 uppercase tracking-wide">Memory Limit (KB)</label>
                  <input
                    type="number"
                    value={editData.memory_limit_kb}
                    onChange={(e) => setEditData((d) => ({ ...d, memory_limit_kb: Number(e.target.value) }))}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">Problem Statement</p>
                <div
                  className="prose prose-sm max-w-none text-[var(--text-primary)]"
                  dangerouslySetInnerHTML={{ __html: (question as any).description || (question as any).problem_statement || '—' }}
                />
              </div>
              {(question as any).input_format && (
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">Input Format</p>
                  <pre className="text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded p-3 whitespace-pre-wrap">{(question as any).input_format}</pre>
                </div>
              )}
              {(question as any).output_format && (
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">Output Format</p>
                  <pre className="text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded p-3 whitespace-pre-wrap">{(question as any).output_format}</pre>
                </div>
              )}
              {(question as any).constraints && (
                <div>
                  <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1">Constraints</p>
                  <pre className="text-sm text-[var(--text-primary)] bg-[var(--bg-secondary)] rounded p-3 whitespace-pre-wrap">{(question as any).constraints}</pre>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {(question.topic_tags || []).map((tag) => (
                  <span key={tag} className="px-2 py-0.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-0.5">Time Limit</p>
                  <p className="font-medium">{(question as any).time_limit_ms ?? 2000} ms</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-0.5">Memory Limit</p>
                  <p className="font-medium">{Math.round(((question as any).memory_limit_kb ?? 262144) / 1024)} MB</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-0.5">Version</p>
                  <p className="font-medium">v{question.version_number}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Test Cases */}
      {activeTab === 'testcases' && (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          {testCases.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-secondary)] text-sm">
              No public test cases yet. Add them in the question creation flow.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {testCases.map((tc, idx) => (
                <div key={tc.id} className="p-4 hover:bg-[var(--bg-secondary)] transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Case #{idx + 1}</span>
                    {tc.is_public && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                        Sample
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] mb-1">Input</p>
                      <pre className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-40">
                        {tc.input || '(empty)'}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--text-secondary)] mb-1">Expected Output</p>
                      <pre className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-40">
                        {tc.expected_output || '(empty)'}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Starter Code */}
      {activeTab === 'startercode' && (
        <div className="space-y-4">
          {/* Existing starter codes */}
          {starterCodes.length > 0 && (
            <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)]">
              {starterCodes.map((sc) => {
                const langName = LANGUAGES.find((l) => l.monacoId === sc.language_id)?.name ?? sc.language_id;
                return (
                  <div key={sc.id} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded font-medium">
                        {langName}
                      </span>
                    </div>
                    <pre className="bg-[var(--bg-primary)] border border-[var(--border)] rounded px-3 py-2 text-sm font-mono whitespace-pre-wrap overflow-x-auto max-h-48">
                      {sc.code}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add new starter code */}
          {status === 'draft' && (
            <div className="border border-[var(--border)] rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium">Add / Replace Starter Code</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Use the language switcher in the editor to set the language, then write or paste the template code.
              </p>
              <CodeEditor height="300px" />
              <button
                onClick={handleAddStarterCode}
                disabled={saving}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : `💾 Save ${language} starter code`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Analytics */}
      {activeTab === 'analytics' && (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          {analyticsLoading ? (
            <div className="flex justify-center py-12">
              <svg className="animate-spin h-6 w-6 text-[var(--accent)]" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : analyticsSubs.length === 0 ? (
            <div className="py-12 text-center text-[var(--text-secondary)] text-sm">No submissions yet for this question.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[var(--bg-secondary)]">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Student</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Verdict</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Language</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Time</th>
                  <th className="text-left px-4 py-3 font-medium text-xs uppercase tracking-wide">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {analyticsSubs.map((s) => (
                  <tr key={s.id} className="hover:bg-[var(--bg-secondary)] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium">{s.student_name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{s.student_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        s.verdict === 'accepted' ? 'bg-green-50 text-green-700' :
                        s.verdict === 'wrong_answer' ? 'bg-red-50 text-red-700' :
                        s.verdict === 'compile_error' ? 'bg-amber-50 text-amber-700' :
                        'bg-gray-50 text-gray-700'
                      }`}>
                        {s.verdict?.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{s.language}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{s.passed_count}/{s.total_count}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {s.execution_time_ms != null ? `${Math.round(s.execution_time_ms)}ms` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)] text-xs whitespace-nowrap">
                      {new Date(s.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
