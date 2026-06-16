'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { questionApi, catalogApi } from '@/lib/api';
import { useEditorStore, LANGUAGES } from '@/stores/editor-store';

const CodeEditor = dynamic(() => import('@/components/editor/CodeEditor'), {
  ssr: false,
  loading: () => <div className="h-64 bg-gray-900 rounded-lg" />,
});

interface TestCaseInput {
  input: string;
  expected_output: string;
  is_sample: boolean;
  points: number;
}

export default function CreateQuestionPage() {
  const router = useRouter();
  const { code, language } = useEditorStore();

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    difficulty: 'easy',
    topic_tags: '',
    constraints: '',
    input_format: '',
    output_format: '',
    time_limit_ms: 2000,
    memory_limit_kb: 262144,
    courseId: '',
    courseName: '',
    sourceCompany: '',
  });

  // courses come from SMART catalog: { id, name, code, course_type }
  const [myCourses, setMyCourses] = useState<{ id: string; name: string; code: string }[]>([]);
  // companies come from SMART catalog: plain strings
  const [myCompanies, setMyCompanies] = useState<string[]>([]);
  const [customCourse, setCustomCourse] = useState(false);
  const [customCompany, setCustomCompany] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    const loadCatalog = async () => {
      try {
        const res = await catalogApi.get();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.data.data as any;
        if (data?.courses?.length) setMyCourses(data.courses);
        if (data?.companies?.length) setMyCompanies(data.companies);
      } catch (err) {
        console.error('Failed to load catalog:', err);
      } finally {
        setCatalogLoading(false);
      }
    };
    loadCatalog();
  }, []);

  const [testCases, setTestCases] = useState<TestCaseInput[]>([
    { input: '', expected_output: '', is_sample: true, points: 10 },
  ]);

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'details' | 'testcases' | 'startercode'>('details');

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (field === 'title') {
      setFormData((prev) => ({
        ...prev,
        slug: (value as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      }));
    }
  };

  const addTestCase = () => {
    setTestCases((prev) => [...prev, { input: '', expected_output: '', is_sample: false, points: 10 }]);
  };

  const removeTestCase = (idx: number) => {
    setTestCases((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTestCase = (idx: number, field: keyof TestCaseInput, value: string | boolean | number) => {
    setTestCases((prev) =>
      prev.map((tc, i) => (i === idx ? { ...tc, [field]: value } : tc)),
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');

    try {
      // Step 1: Create question
      const qRes = await questionApi.create({
        ...formData,
        topic_tags: formData.topic_tags.split(',').map((t) => t.trim()).filter(Boolean),
        ...(formData.courseId ? { courseId: formData.courseId, courseName: formData.courseName } : {}),
        ...(formData.sourceCompany ? { sourceCompany: formData.sourceCompany } : {}),
      });

      const created = qRes.data.data as { version_id: string };
      const versionId = created.version_id;

      // Step 2: Add test cases (map snake_case UI fields → camelCase backend schema)
      if (testCases.length > 0) {
        await questionApi.addTestCases(
          versionId,
          testCases.map((tc, idx) => ({
            input: tc.input,
            expectedOutput: tc.expected_output,
            isPublic: tc.is_sample,          // sample = publicly visible
            explanation: '',
            orderIndex: idx,
          })),
        );
      }

      // Step 3: Add starter code — use monacoId string (e.g. 'python') as languageId
      if (code.trim()) {
        await questionApi.addStarterCode(versionId, [
          { languageId: language, code },
        ]);
      }

      router.push('/admin/questions');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create question';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Question</h1>

      {/* Step tabs */}
      <div className="flex gap-1 mb-6">
        {(['details', 'testcases', 'startercode'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              step === s
                ? 'bg-primary-600 text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
            }`}
          >
            {s === 'details' ? '1. Details' : s === 'testcases' ? '2. Test Cases' : '3. Starter Code'}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm mb-4">{error}</div>
      )}

      {/* Step 1: Details */}
      {step === 'details' && (
        <div className="space-y-4 border border-[var(--border)] rounded-lg p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
                placeholder="Two Sum"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Slug</label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => handleChange('slug', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description (HTML supported)</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={8}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] font-mono text-sm"
              placeholder="<p>Given an array of integers...</p>"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Difficulty</label>
              <select
                value={formData.difficulty}
                onChange={(e) => handleChange('difficulty', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Time Limit (ms)</label>
              <input
                type="number"
                value={formData.time_limit_ms}
                onChange={(e) => handleChange('time_limit_ms', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Memory Limit (KB)</label>
              <input
                type="number"
                value={formData.memory_limit_kb}
                onChange={(e) => handleChange('memory_limit_kb', Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </div>
          </div>

          {/* Course & Company Selection */}
          <div className="grid grid-cols-2 gap-4">
            {/* ── Course ── */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">📚 Course (optional)</label>
                {!catalogLoading && myCourses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomCourse((v) => !v);
                      setFormData((prev) => ({ ...prev, courseId: '', courseName: '' }));
                    }}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {customCourse ? '← Pick from list' : '✏️ Type manually'}
                  </button>
                )}
              </div>
              {catalogLoading ? (
                <div className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)]">
                  Loading courses…
                </div>
              ) : customCourse || myCourses.length === 0 ? (
                <input
                  type="text"
                  value={formData.courseName}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      courseName: e.target.value,
                      courseId: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                    }))
                  }
                  placeholder={myCourses.length === 0 ? 'No courses found — type course name' : 'Course name'}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                />
              ) : (
                <select
                  value={formData.courseId}
                  onChange={(e) => {
                    const selected = myCourses.find((c) => c.id === e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      courseId: e.target.value,
                      courseName: selected?.name || '',
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                >
                  <option value="">— No course —</option>
                  {myCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.code ? ` (${c.code})` : ''}
                    </option>
                  ))}
                </select>
              )}
              {formData.courseName && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Tagged as: <span className="font-medium">{formData.courseName}</span>
                </p>
              )}
            </div>

            {/* ── Company ── */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">🏢 Company (optional)</label>
                {!catalogLoading && myCompanies.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomCompany((v) => !v);
                      setFormData((prev) => ({ ...prev, sourceCompany: '' }));
                    }}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {customCompany ? '← Pick from list' : '✏️ Type manually'}
                  </button>
                )}
              </div>
              {catalogLoading ? (
                <div className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm text-[var(--text-secondary)]">
                  Loading companies…
                </div>
              ) : customCompany || myCompanies.length === 0 ? (
                <input
                  type="text"
                  value={formData.sourceCompany}
                  onChange={(e) => handleChange('sourceCompany', e.target.value)}
                  placeholder={myCompanies.length === 0 ? 'No companies found — type company name' : 'Company name'}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                />
              ) : (
                <select
                  value={formData.sourceCompany}
                  onChange={(e) => handleChange('sourceCompany', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
                >
                  <option value="">— No company —</option>
                  {myCompanies.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              )}
              {formData.sourceCompany && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Tagged as: <span className="font-medium">{formData.sourceCompany}</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Topic Tags (comma-separated)</label>
            <input
              type="text"
              value={formData.topic_tags}
              onChange={(e) => handleChange('topic_tags', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              placeholder="arrays, hash-table, two-pointers"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Constraints</label>
            <textarea
              value={formData.constraints}
              onChange={(e) => handleChange('constraints', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
              placeholder="1 <= nums.length <= 10^4"
            />
          </div>

          <button
            onClick={() => setStep('testcases')}
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Next: Test Cases →
          </button>
        </div>
      )}

      {/* Step 2: Test Cases */}
      {step === 'testcases' && (
        <div className="space-y-4 border border-[var(--border)] rounded-lg p-6">
          {testCases.map((tc, idx) => (
            <div key={idx} className="border border-[var(--border)] rounded-lg p-4 relative">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Test Case #{idx + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={tc.is_sample}
                      onChange={(e) => updateTestCase(idx, 'is_sample', e.target.checked)}
                    />
                    Sample
                  </label>
                  <input
                    type="number"
                    value={tc.points}
                    onChange={(e) => updateTestCase(idx, 'points', Number(e.target.value))}
                    className="w-20 px-2 py-1 text-sm rounded border border-[var(--border)]"
                    placeholder="Points"
                  />
                  {testCases.length > 1 && (
                    <button
                      onClick={() => removeTestCase(idx)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Input</label>
                  <textarea
                    value={tc.input}
                    onChange={(e) => updateTestCase(idx, 'input', e.target.value)}
                    rows={3}
                    className="w-full px-2 py-1.5 text-sm font-mono rounded border border-[var(--border)] bg-[var(--bg-primary)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--text-secondary)] mb-1">Expected Output</label>
                  <textarea
                    value={tc.expected_output}
                    onChange={(e) => updateTestCase(idx, 'expected_output', e.target.value)}
                    rows={3}
                    className="w-full px-2 py-1.5 text-sm font-mono rounded border border-[var(--border)] bg-[var(--bg-primary)]"
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={addTestCase}
            className="px-4 py-2 text-sm border border-dashed border-[var(--border)] rounded-lg w-full hover:border-primary-400 hover:text-primary-600 transition-colors"
          >
            + Add Test Case
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('details')}
              className="px-6 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep('startercode')}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Next: Starter Code →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Starter Code */}
      {step === 'startercode' && (
        <div className="space-y-4 border border-[var(--border)] rounded-lg p-6">
          <p className="text-sm text-[var(--text-secondary)]">
            Provide starter code that students will see when they open this problem. You can add code for different languages later.
          </p>

          <CodeEditor height="300px" />

          <div className="flex gap-3">
            <button
              onClick={() => setStep('testcases')}
              className="px-6 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !formData.title || !formData.description}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : '✓ Create Question'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
