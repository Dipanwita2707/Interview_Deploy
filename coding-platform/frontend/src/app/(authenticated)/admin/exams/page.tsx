'use client';

import { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { adminExamApi } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';

// ─── difficulty helpers ───────────────────────────────────────
const DIFF_MAP: Record<string, string> = {
  easy: 'low', low: 'low', medium: 'medium', med: 'medium', hard: 'high', high: 'high',
};
const DIFF_LABEL: Record<string, string> = { low: 'Easy', medium: 'Medium', high: 'Hard' };
const DIFF_COLOR: Record<string, string> = {
  low: 'bg-green-100 text-green-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
};

// ─── Excel Question Import sub-component ─────────────────────
function ExcelQuestionImport({ templateId, onImported }: { templateId: string; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; total: number; results: any[] } | null>(null);
  const [err, setErr] = useState('');

  // Parse the file client-side for preview whenever a file is chosen
  const handleFileChange = (chosen: File | null) => {
    setFile(chosen);
    setResult(null);
    setErr('');
    setPreview(null);
    if (!chosen) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target!.result as ArrayBuffer), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        setPreview(rows.slice(0, 50)); // show up to 50 rows in preview
      } catch {
        setErr('Could not parse file. Make sure it is a valid .xlsx file.');
      }
    };
    reader.readAsArrayBuffer(chosen);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true); setErr('');
    try {
      const res = await adminExamApi.importQuestionsExcel(templateId, file);
      setResult(res.data.data as any);
      setFile(null);
      setPreview(null);
      onImported();
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Upload failed');
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-4">
      {/* File picker row */}
      <div className="flex gap-2 items-center">
        <label className="flex-1 flex items-center gap-2 px-3 py-2 border border-dashed border-[var(--border)] rounded-lg cursor-pointer hover:bg-[var(--bg-primary)] transition-colors text-sm text-[var(--text-secondary)]">
          <span>📄</span>
          <span className="truncate">{file ? file.name : 'Choose Excel file (.xlsx)'}</span>
          <input type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => handleFileChange(e.target.files?.[0] || null)} />
        </label>
        {file && (
          <button onClick={() => handleFileChange(null)} className="text-xs text-[var(--text-secondary)] hover:text-red-500 px-2">✕</button>
        )}
      </div>

      {/* Preview table */}
      {preview && preview.length > 0 && (
        <div className="border border-blue-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-200">
            <span className="text-sm font-semibold text-blue-800">Preview — {preview.length} question{preview.length !== 1 ? 's' : ''} found</span>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {uploading ? 'Importing…' : `⬆ Import All ${preview.length}`}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
            {preview.map((row, i) => {
              const diff = DIFF_MAP[String(row.difficulty || '').trim().toLowerCase()] ?? 'medium';
              const tags = String(row.topic_tags || '').split(',').map((t: string) => t.trim()).filter(Boolean);
              const missing = !row.title;
              return (
                <div key={i} className={`px-4 py-3 ${missing ? 'bg-red-50' : 'bg-[var(--bg-secondary)]'}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-[var(--text-secondary)] font-mono w-6 pt-0.5 shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      {missing ? (
                        <p className="text-xs text-red-600 font-medium">⚠ Missing title — row will be skipped</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DIFF_COLOR[diff]}`}>{DIFF_LABEL[diff]}</span>
                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{row.title}</span>
                          </div>
                          {row.problem_statement && (
                            <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mb-1">{row.problem_statement}</p>
                          )}
                          <div className="flex gap-1 flex-wrap">
                            {tags.map((t: string) => (
                              <span key={t} className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">{t}</span>
                            ))}
                            {row.time_limit_minutes && (
                              <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">⏱ {row.time_limit_minutes} min</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {preview && preview.length === 0 && (
        <p className="text-xs text-[var(--text-secondary)] text-center py-3">No rows found in the file.</p>
      )}

      {err && <p className="text-xs text-red-600">{err}</p>}

      {/* Import result */}
      {result && (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <div className={`px-4 py-2 text-sm font-semibold ${result.skipped === 0 ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'}`}>
            ✅ {result.imported} imported &nbsp;|&nbsp; {result.skipped > 0 ? `⚠️ ${result.skipped} skipped` : '0 skipped'} &nbsp;|&nbsp; Total: {result.total}
          </div>
          {result.results.filter((r: any) => r.status !== 'imported').length > 0 && (
            <div className="max-h-36 overflow-y-auto divide-y divide-[var(--border)]">
              {result.results.filter((r: any) => r.status !== 'imported').map((r: any) => (
                <div key={r.row} className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-700 bg-red-50">
                  <span className="font-mono text-gray-500">row {r.row}</span>
                  <span className="flex-1 truncate">{r.title || '—'}</span>
                  <span>{r.error || r.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Manual Question Form sub-component ──────────────────────
const EMPTY_FORM = {
  title: '', difficulty: 'medium', time_limit_minutes: '2',
  topic_tags: '', problem_statement: '', input_format: '',
  output_format: '', constraints: '',
  sample_input: '', sample_output: '', explanation: '',
};

function ManualQuestionForm({ templateId, onAdded }: { templateId: string; onAdded: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');

  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(p => ({ ...p, [k]: v }));

  const reset = () => { setForm({ ...EMPTY_FORM }); setStep(1); setErr(''); setSuccess(''); };

  const handleSave = async () => {
    if (!form.title.trim()) { setErr('Title is required'); return; }
    setSaving(true); setErr('');
    try {
      // Build one-row import payload and send as Excel via the existing import-excel endpoint
      const row = {
        title: form.title.trim(),
        difficulty: form.difficulty,
        time_limit_minutes: parseFloat(form.time_limit_minutes) || 2,
        topic_tags: form.topic_tags,
        problem_statement: form.problem_statement || form.title,
        input_format: form.input_format,
        output_format: form.output_format,
        constraints: form.constraints,
        sample_input: form.sample_input,
        sample_output: form.sample_output,
        explanation: form.explanation,
      };
      // Build a single-row xlsx in-browser and POST it
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet([row]);
      XLSX.utils.book_append_sheet(wb, ws, 'Questions');
      const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const file = new File([buf], 'question.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      await adminExamApi.importQuestionsExcel(templateId, file);
      setSuccess(`"${row.title}" added successfully!`);
      onAdded();
      setTimeout(reset, 1500);
    } catch (e: any) {
      setErr(e?.response?.data?.error || 'Failed to save question');
    } finally { setSaving(false); }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-[var(--text-secondary)]';
  const labelCls = 'block text-xs font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wide';

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Step header */}
      <div className="flex border-b border-[var(--border)]">
        {([1, 2, 3] as const).map((s) => (
          <button key={s} onClick={() => setStep(s)}
            className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${step === s ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-primary)]'}`}>
            {s === 1 ? '1 · Basics' : s === 2 ? '2 · Problem' : '3 · Examples'}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* ── Step 1: Basic info ── */}
        {step === 1 && (
          <>
            <div>
              <label className={labelCls}>Title *</label>
              <input className={inputCls} placeholder="e.g. Two Sum" value={form.title} onChange={e => set('title', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Difficulty</label>
                <select className={inputCls} value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
                  <option value="low">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="high">Hard</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Time Limit (minutes)</label>
                <input type="number" min="1" max="60" className={inputCls} value={form.time_limit_minutes} onChange={e => set('time_limit_minutes', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Topic Tags <span className="font-normal normal-case">(comma-separated)</span></label>
              <input className={inputCls} placeholder="arrays, hash-map, two-pointers" value={form.topic_tags} onChange={e => set('topic_tags', e.target.value)} />
              {form.topic_tags && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {form.topic_tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <span key={t} className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 2: Problem statement ── */}
        {step === 2 && (
          <>
            <div>
              <label className={labelCls}>Problem Statement</label>
              <textarea rows={4} className={inputCls} placeholder="Describe the problem clearly…" value={form.problem_statement} onChange={e => set('problem_statement', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Input Format</label>
              <textarea rows={2} className={inputCls} placeholder="Describe the input format…" value={form.input_format} onChange={e => set('input_format', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Output Format</label>
              <textarea rows={2} className={inputCls} placeholder="Describe the expected output format…" value={form.output_format} onChange={e => set('output_format', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Constraints</label>
              <textarea rows={2} className={inputCls} placeholder="e.g. 1 ≤ n ≤ 10⁵" value={form.constraints} onChange={e => set('constraints', e.target.value)} />
            </div>
          </>
        )}

        {/* ── Step 3: Examples + preview ── */}
        {step === 3 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Sample Input</label>
                <textarea rows={3} className={`${inputCls} font-mono text-xs`} placeholder="[2,7,11,15]&#10;9" value={form.sample_input} onChange={e => set('sample_input', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Sample Output</label>
                <textarea rows={3} className={`${inputCls} font-mono text-xs`} placeholder="0 1" value={form.sample_output} onChange={e => set('sample_output', e.target.value)} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Explanation <span className="font-normal normal-case">(optional)</span></label>
              <textarea rows={2} className={inputCls} placeholder="Because nums[0] + nums[1] = 9…" value={form.explanation} onChange={e => set('explanation', e.target.value)} />
            </div>

            {/* Full question preview */}
            {form.title && (
              <div className="mt-2 border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-primary)] space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${DIFF_COLOR[form.difficulty]}`}>{DIFF_LABEL[form.difficulty]}</span>
                  <h5 className="text-base font-bold text-[var(--text-primary)]">{form.title}</h5>
                </div>
                {form.topic_tags && (
                  <div className="flex gap-1 flex-wrap">
                    {form.topic_tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                      <span key={t} className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">{t}</span>
                    ))}
                    <span className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">⏱ {form.time_limit_minutes} min</span>
                  </div>
                )}
                {form.problem_statement && <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{form.problem_statement}</p>}
                {form.input_format && <div><p className="text-xs font-semibold text-[var(--text-secondary)] mb-0.5">Input Format</p><p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{form.input_format}</p></div>}
                {form.output_format && <div><p className="text-xs font-semibold text-[var(--text-secondary)] mb-0.5">Output Format</p><p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{form.output_format}</p></div>}
                {form.constraints && <div><p className="text-xs font-semibold text-[var(--text-secondary)] mb-0.5">Constraints</p><p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{form.constraints}</p></div>}
                {(form.sample_input || form.sample_output) && (
                  <div className="grid grid-cols-2 gap-2">
                    {form.sample_input && <div><p className="text-xs font-semibold text-[var(--text-secondary)] mb-0.5">Sample Input</p><pre className="text-xs bg-[var(--bg-secondary)] p-2 rounded font-mono">{form.sample_input}</pre></div>}
                    {form.sample_output && <div><p className="text-xs font-semibold text-[var(--text-secondary)] mb-0.5">Sample Output</p><pre className="text-xs bg-[var(--bg-secondary)] p-2 rounded font-mono">{form.sample_output}</pre></div>}
                  </div>
                )}
                {form.explanation && <div><p className="text-xs font-semibold text-[var(--text-secondary)] mb-0.5">Explanation</p><p className="text-xs text-[var(--text-primary)] whitespace-pre-wrap">{form.explanation}</p></div>}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)]">
        <button onClick={reset} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">↺ Reset</button>
        <div className="flex gap-2">
          {step > 1 && <button onClick={() => setStep(s => (s - 1) as any)} className="px-3 py-1.5 text-xs border border-[var(--border)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors">← Back</button>}
          {step < 3
            ? <button onClick={() => setStep(s => (s + 1) as any)} disabled={step === 1 && !form.title.trim()} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">Next →</button>
            : <button onClick={handleSave} disabled={saving || !form.title.trim()} className="px-4 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-semibold transition-colors">{saving ? 'Saving…' : '✓ Add Question'}</button>
          }
        </div>
      </div>
      {err && <p className="px-4 pb-3 text-xs text-red-600">{err}</p>}
      {success && <p className="px-4 pb-3 text-xs text-green-600 font-medium">{success}</p>}
    </div>
  );
}

// ─── Add Questions Panel (sub-tabs: Manual | Excel) ───────────
function AddFromBankPanel({ templateId, onAdded }: { templateId: string; onAdded: () => void }) {
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [candidates, setCandidates] = useState<{ id: string; title: string; difficulty: string; topic_tags: string[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [err, setErr] = useState('');

  const doSearch = useCallback(async (q: string, diff: string) => {
    setLoading(true); setErr('');
    try {
      const res = await adminExamApi.searchPoolCandidates(templateId, q || undefined, diff || undefined);
      setCandidates((res.data.data as any[]) || []);
    } catch { setErr('Failed to load questions'); }
    finally { setLoading(false); }
  }, [templateId]);

  useEffect(() => {
    const t = setTimeout(() => doSearch(search, diffFilter), 300);
    return () => clearTimeout(t);
  }, [search, diffFilter, doSearch]);

  const handleAdd = async (versionId: string, title: string) => {
    setAdding(versionId); setErr('');
    try {
      await adminExamApi.addQuestionToPool(templateId, versionId);
      setAdded(prev => {
        const next = new Set(prev);
        next.add(versionId);
        return next;
      });
      setCandidates(prev => prev.filter(q => q.id !== versionId));
      onAdded();
    } catch (e: any) {
      setErr(e?.response?.data?.error || `Failed to add "${title}"`);
    } finally { setAdding(null); }
  };

  const DIFF_COLOR: Record<string, string> = {
    low: 'bg-green-100 text-green-700', medium: 'bg-yellow-100 text-yellow-700', high: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">Search published questions from the global bank and add them to this exam's dedicated pool.</p>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search by title…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={diffFilter}
          onChange={e => setDiffFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All difficulties</option>
          <option value="low">Easy</option>
          <option value="medium">Medium</option>
          <option value="high">Hard</option>
        </select>
      </div>

      {err && <p className="text-xs text-red-600">{err}</p>}

      {loading ? (
        <p className="text-xs text-[var(--text-secondary)] py-4 text-center">Searching…</p>
      ) : candidates.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)] py-4 text-center">
          {search || diffFilter ? 'No matching questions found.' : 'All published questions are already in this pool, or no questions exist yet.'}
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden max-h-80 overflow-y-auto">
          {candidates.map(q => (
            <div key={q.id} className="flex items-center gap-3 px-3 py-2.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)] transition-colors">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${DIFF_COLOR[q.difficulty] ?? 'bg-gray-100 text-gray-600'}`}>
                {q.difficulty === 'low' ? 'Easy' : q.difficulty === 'medium' ? 'Med' : 'Hard'}
              </span>
              <span className="flex-1 text-sm font-medium text-[var(--text-primary)] truncate">{q.title}</span>
              <div className="flex gap-1 flex-wrap justify-end shrink-0">
                {(q.topic_tags ?? []).slice(0, 3).map((t: string) => (
                  <span key={t} className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">{t}</span>
                ))}
              </div>
              <button
                onClick={() => handleAdd(q.id, q.title)}
                disabled={adding === q.id}
                className="shrink-0 px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {adding === q.id ? '…' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
      )}

      {added.size > 0 && (
        <p className="text-xs text-green-700 font-medium">✅ {added.size} question{added.size !== 1 ? 's' : ''} added to this exam's pool.</p>
      )}
    </div>
  );
}

function AddQuestionsPanel({ templateId, onAdded }: { templateId: string; onAdded: () => void }) {
  const [tab, setTab] = useState<'manual' | 'excel' | 'bank'>('manual');
  const [downloadErr, setDownloadErr] = useState('');

  const downloadTemplate = async () => {
    setDownloadErr('');
    try {
      const res = await adminExamApi.downloadImportTemplate(templateId);
      const url = URL.createObjectURL(new Blob([res.data as any]));
      const a = document.createElement('a'); a.href = url; a.download = 'question-import-template.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch { setDownloadErr('Failed to download template'); }
  };

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Sub-tab header */}
      <div className="flex items-center border-b border-[var(--border)]">
        <button onClick={() => setTab('manual')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
          ✏️ Manual Entry
        </button>
        <button onClick={() => setTab('excel')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === 'excel' ? 'border-blue-600 text-blue-600' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
          📥 Bulk Import (Excel)
        </button>
        <button onClick={() => setTab('bank')}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${tab === 'bank' ? 'border-blue-600 text-blue-600' : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
          🗄️ Add from Question Bank
        </button>
        {tab === 'excel' && (
          <button onClick={downloadTemplate}
            className="ml-auto mr-3 text-xs px-3 py-1.5 border border-[var(--border)] rounded-lg hover:bg-[var(--bg-primary)] transition-colors font-medium flex items-center gap-1">
            ⬇ Download Template
          </button>
        )}
      </div>

      <div className="p-4">
        {tab === 'manual' && (
          <ManualQuestionForm templateId={templateId} onAdded={onAdded} />
        )}
        {tab === 'excel' && (
          <>
            <p className="text-xs text-[var(--text-secondary)] mb-3">
              Download the template, fill in your questions, then upload. Each row becomes a question exclusive to this exam. Preview is shown before importing.
            </p>
            {downloadErr && <p className="text-xs text-red-600 mb-2">{downloadErr}</p>}
            <ExcelQuestionImport templateId={templateId} onImported={onAdded} />
          </>
        )}
        {tab === 'bank' && (
          <AddFromBankPanel templateId={templateId} onAdded={onAdded} />
        )}
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────
interface ExamTemplate {
  id: string;
  name: string;
  company?: string;
  role?: string;
  package_slab?: string;
  question_count: number;
  difficulty_distribution: { low: number; medium: number; high: number };
  duration_minutes: number;
  allowed_retakes: number;
  shuffle_questions: boolean;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  total_attempts?: number;
  completed_attempts?: number;
  total_invitations?: number;
  pending_invitations?: number;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

interface Attempt {
  id: string;
  student_name: string;
  student_email: string;
  state: string;
  started_at?: string;
  submitted_at?: string;
  duration_minutes: number;
}

interface Invitation {
  id: string;
  user_id: string;
  student_name: string;
  student_email: string;
  assigned_by_name: string;
  assigned_at: string;
  expires_at?: string;
  status: string;
  note?: string;
}

// ─── Pill helpers ─────────────────────────────────────────────
const STATE_COLOR: Record<string, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  ready: 'bg-blue-100 text-blue-700',
  started: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-green-100 text-green-700',
  evaluated: 'bg-emerald-100 text-emerald-700',
  flagged: 'bg-red-100 text-red-700',
  reviewed: 'bg-purple-100 text-purple-700',
};

const INV_COLOR: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-700',
  started: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
};

// ─── Main Page ────────────────────────────────────────────────
export default function AdminExamsPage() {
  const { isHead } = useAuthStore();
  const [templates, setTemplates] = useState<ExamTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    template: ExamTemplate;
    attempts: Attempt[];
    invitations: Invitation[];
  } | null>(null);
  const [detailTab, setDetailTab] = useState<'attempts' | 'invitations' | 'questions' | 'staff'>('invitations');

  // ── Create form ──────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    company: '',
    role: '',
    durationMinutes: 60,
    low: 1,
    medium: 1,
    high: 1,
    isDefault: false,
    shuffleQuestions: true,
    allowedRetakes: 0,
  });

  // ── Invite form ──────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false);
  const [inviteTab, setInviteTab] = useState<'search' | 'excel'>('search');
  const [studentSearch, setStudentSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [inviteExpiry, setInviteExpiry] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [inviting, setInviting] = useState(false);

  // Excel upload state
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelResult, setExcelResult] = useState<{
    invited: number; skipped: number; total: number;
    results: { row: number; email: string; status: string; error?: string }[];
  } | null>(null);
  const [excelUploading, setExcelUploading] = useState(false);

  // ── Question pool state ──────────────────────────────────────
  const [questionPool, setQuestionPool] = useState<{
    usingDedicatedPool: boolean;
    coverage: Record<string, { needed: number; available: number; ok: boolean }>;
    questions: { id: string; title: string; difficulty: string; topic_tags: string[]; added_by_name: string; added_at: string }[];
    canStart: boolean;
  } | null>(null);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolSearch, setPoolSearch] = useState('');
  const [poolSearchDiff, setPoolSearchDiff] = useState('');
  const [poolCandidates, setPoolCandidates] = useState<{ id: string; title: string; difficulty: string; topic_tags: string[] }[]>([]);
  const [poolCandidatesLoading, setPoolCandidatesLoading] = useState(false);
  const [addingToPool, setAddingToPool] = useState<string | null>(null);
  const [removingFromPool, setRemovingFromPool] = useState<string | null>(null);
  // ── Staff state ───────────────────────────────────────────────
  const [templateStaff, setTemplateStaff] = useState<{ user_id: string; name: string; email: string; role: string; assigned_at: string; assigned_by_name: string }[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffCandidates, setStaffCandidates] = useState<Student[]>([]);
  const [assigningStaff, setAssigningStaff] = useState<string | null>(null);
  const [removingStaff, setRemovingStaff] = useState<string | null>(null);

  // ── Launch state ─────────────────────────────────────────────
  const [launching, setLaunching] = useState<string | null>(null);

  // ── Load templates ───────────────────────────────────────────
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminExamApi.listTemplates();
      setTemplates((res.data.data as ExamTemplate[]) || []);
    } catch (err: any) {
      setError('Failed to load exam templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ── Load detail ──────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) { setDetail(null); setQuestionPool(null); return; }
    adminExamApi.getTemplate(selectedId).then((res) => {
      setDetail(res.data.data as any);
    }).catch(() => setDetail(null));
    setQuestionPool(null);
    setPoolCandidates([]);
    setTemplateStaff([]);
    setStaffCandidates([]);
  }, [selectedId]);

  // ── Student search ───────────────────────────────────────────
  useEffect(() => {
    if (!showInvite) return;
    const t = setTimeout(async () => {
      const res = await adminExamApi.searchStudents(studentSearch || undefined);
      setStudents((res.data.data as Student[]) || []);
    }, 300);
    return () => clearTimeout(t);
  }, [studentSearch, showInvite]);

  // ── Create template ──────────────────────────────────────────
  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      await adminExamApi.createTemplate({
        name: form.name,
        company: form.company || undefined,
        role: form.role || undefined,
        questionCount: form.low + form.medium + form.high,
        difficultyDistribution: { low: form.low, medium: form.medium, high: form.high },
        durationMinutes: form.durationMinutes,
        allowedRetakes: form.allowedRetakes,
        shuffleQuestions: form.shuffleQuestions,
        isDefault: form.isDefault,
      });
      setShowCreate(false);
      setForm({ name: '', company: '', role: '', durationMinutes: 60, low: 1, medium: 1, high: 1, isDefault: false, shuffleQuestions: true, allowedRetakes: 0 });
      await loadTemplates();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create template');
    } finally {
      setCreating(false);
    }
  };

  // ── Send invitations ─────────────────────────────────────────
  const handleInvite = async () => {
    if (!selectedId || selectedStudents.length === 0) return;
    setInviting(true);
    try {
      await adminExamApi.inviteUsers(
        selectedId,
        selectedStudents.map((s) => s.id),
        inviteExpiry || undefined,
        inviteNote || undefined,
      );
      setShowInvite(false);
      setSelectedStudents([]);
      setInviteNote('');
      setInviteExpiry('');
      // Reload detail
      const res = await adminExamApi.getTemplate(selectedId);
      setDetail(res.data.data as any);
    } catch (err: any) {
      const apiErr = err?.response?.data;
      if (apiErr?.errors) {
        const details = Object.entries(apiErr.errors)
          .map(([field, msg]) => `${field}: ${msg}`)
          .join(', ');
        setError(`Validation error — ${details}`);
      } else {
        setError(apiErr?.error || 'Failed to send invitations');
      }
    } finally {
      setInviting(false);
    }
  };

  // ── Cancel invitation ────────────────────────────────────────
  const handleCancelInvite = async (userId: string) => {
    if (!selectedId) return;
    await adminExamApi.cancelInvite(selectedId, userId);
    const res = await adminExamApi.getTemplate(selectedId);
    setDetail(res.data.data as any);
  };

  // ── Excel bulk upload ─────────────────────────────────────────
  const handleExcelUpload = async () => {
    if (!selectedId || !excelFile) return;
    setExcelUploading(true);
    setExcelResult(null);
    try {
      const res = await adminExamApi.inviteByExcel(selectedId, excelFile, inviteExpiry || undefined, inviteNote || undefined);
      setExcelResult(res.data.data as any);
      // Reload invitations list
      const detail = await adminExamApi.getTemplate(selectedId);
      setDetail(detail.data.data as any);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Excel upload failed');
    } finally {
      setExcelUploading(false);
    }
  };

  // ── Launch exam for a student ──────────────────────────────
  const handleLaunchForStudent = async (userId: string) => {
    if (!selectedId) return;
    setLaunching(userId);
    try {
      await adminExamApi.launchForStudent(selectedId, userId);
      // Reload detail to show new attempt
      const res = await adminExamApi.getTemplate(selectedId);
      setDetail(res.data.data as any);
      setDetailTab('attempts');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to launch exam');
    } finally {
      setLaunching(null);
    }
  };

  // ── Load question pool ────────────────────────────────────────
  const loadQuestionPool = async () => {
    if (!selectedId) return;
    setPoolLoading(true);
    try {
      const res = await adminExamApi.getQuestionPool(selectedId);
      setQuestionPool(res.data.data as any);
    } catch { setQuestionPool(null); }
    finally { setPoolLoading(false); }
  };

  // ── Search candidates to add to pool ─────────────────────────
  const searchPoolCandidates = useCallback(async () => {
    if (!selectedId) return;
    setPoolCandidatesLoading(true);
    try {
      const res = await adminExamApi.searchPoolCandidates(selectedId, poolSearch || undefined, poolSearchDiff || undefined);
      setPoolCandidates((res.data.data as any[]) || []);
    } catch { setPoolCandidates([]); }
    finally { setPoolCandidatesLoading(false); }
  }, [selectedId, poolSearch, poolSearchDiff]);

  useEffect(() => {
    const t = setTimeout(searchPoolCandidates, 300);
    return () => clearTimeout(t);
  }, [searchPoolCandidates]);

  const handleAddToPool = async (versionId: string) => {
    if (!selectedId) return;
    setAddingToPool(versionId);
    try {
      await adminExamApi.addQuestionToPool(selectedId, versionId);
      await loadQuestionPool();
      setPoolCandidates(prev => prev.filter(q => q.id !== versionId));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to add question');
    } finally { setAddingToPool(null); }
  };

  const handleRemoveFromPool = async (versionId: string) => {
    if (!selectedId) return;
    setRemovingFromPool(versionId);
    try {
      await adminExamApi.removeQuestionFromPool(selectedId, versionId);
      await loadQuestionPool();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove question');
    } finally { setRemovingFromPool(null); }
  };

  // ── Load & manage staff ───────────────────────────────────────
  const loadTemplateStaff = async () => {
    if (!selectedId) return;
    setStaffLoading(true);
    try {
      const res = await adminExamApi.getTemplateStaff(selectedId);
      setTemplateStaff((res.data.data as any[]) || []);
    } catch { setTemplateStaff([]); }
    finally { setStaffLoading(false); }
  };

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!staffSearch) { setStaffCandidates([]); return; }
      try {
        const res = await adminExamApi.searchStudents(staffSearch);
        // filter to only staff-role users — API returns all; we'll show all for now
        setStaffCandidates((res.data.data as Student[]) || []);
      } catch { setStaffCandidates([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [staffSearch]);

  const handleAssignStaff = async (userId: string) => {
    if (!selectedId) return;
    setAssigningStaff(userId);
    try {
      await adminExamApi.assignStaff(selectedId, userId);
      setStaffSearch('');
      setStaffCandidates([]);
      await loadTemplateStaff();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to assign staff');
    } finally { setAssigningStaff(null); }
  };

  const handleRemoveStaff = async (userId: string) => {
    if (!selectedId) return;
    setRemovingStaff(userId);
    try {
      await adminExamApi.removeStaff(selectedId, userId);
      await loadTemplateStaff();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to remove staff');
    } finally { setRemovingStaff(null); }
  };

  // ── Toggle student in invite list ────────────────────────────
  const toggleStudent = (s: Student) => {
    setSelectedStudents((prev) =>
      prev.find((p) => p.id === s.id) ? prev.filter((p) => p.id !== s.id) : [...prev, s]
    );
  };

  const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="flex gap-6 h-[calc(100vh-80px)]">
      {/* ── LEFT: Template list ─────────────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">📋 Exam Templates</h1>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            {showCreate ? 'Cancel' : '+ New'}
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-50 text-red-700 text-sm rounded-lg mb-3">{error}</div>
        )}

        {/* Create form */}
        {showCreate && (
          <div className="border border-[var(--border)] rounded-xl p-4 mb-4 space-y-3 bg-[var(--bg-secondary)] text-sm">
            <p className="font-semibold text-[var(--text-primary)]">New Exam Template</p>
            <input
              placeholder="Template name *"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Company (optional)"
                value={form.company}
                onChange={(e) => setForm((p) => ({ ...p, company: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
              <input
                placeholder="Role (optional)"
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Easy</label>
                <input type="number" min={0} value={form.low} onChange={(e) => setForm((p) => ({ ...p, low: +e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-center" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Medium</label>
                <input type="number" min={0} value={form.medium} onChange={(e) => setForm((p) => ({ ...p, medium: +e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-center" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Hard</label>
                <input type="number" min={0} value={form.high} onChange={(e) => setForm((p) => ({ ...p, high: +e.target.value }))} className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-center" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Duration (min)</label>
                <input type="number" min={10} value={form.durationMinutes} onChange={(e) => setForm((p) => ({ ...p, durationMinutes: +e.target.value }))} className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]" />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Retakes</label>
                <input type="number" min={0} value={form.allowedRetakes} onChange={(e) => setForm((p) => ({ ...p, allowedRetakes: +e.target.value }))} className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]" />
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                Default (visible to all students)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={form.shuffleQuestions} onChange={(e) => setForm((p) => ({ ...p, shuffleQuestions: e.target.checked }))} />
                Shuffle
              </label>
            </div>
            <button
              onClick={handleCreate}
              disabled={!form.name || creating}
              className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating…' : 'Create Template'}
            </button>
          </div>
        )}

        {/* Template cards */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {loading ? (
            <div className="text-center py-8 text-[var(--text-secondary)] text-sm">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-[var(--text-secondary)] text-sm">No exam templates yet. Create one!</div>
          ) : (
            templates.map((t) => {
              const dist = typeof t.difficulty_distribution === 'string'
                ? JSON.parse(t.difficulty_distribution)
                : t.difficulty_distribution;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                  className={`w-full text-left p-4 rounded-xl border transition-all ${
                    selectedId === t.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="font-semibold text-sm text-[var(--text-primary)] leading-tight">{t.name}</span>
                    {t.is_default && (
                      <span className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full flex-shrink-0">Default</span>
                    )}
                  </div>
                  {t.company && (
                    <p className="text-xs text-[var(--text-secondary)] mb-1">🏢 {t.company}{t.role ? ` — ${t.role}` : ''}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="text-green-600">{dist.low ?? 0}E</span>
                    <span className="text-yellow-600">{dist.medium ?? 0}M</span>
                    <span className="text-red-600">{dist.high ?? 0}H</span>
                    <span className="mx-1">·</span>
                    <span>⏱ {t.duration_minutes}min</span>
                  </div>
                  <div className="flex gap-3 mt-2 text-xs text-[var(--text-secondary)]">
                    <span>👤 {t.total_invitations ?? 0} invited</span>
                    <span>📝 {t.total_attempts ?? 0} attempts</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── RIGHT: Detail panel ──────────────────────────────── */}
      {selectedId && detail ? (
        <div className="flex-1 overflow-hidden flex flex-col border border-[var(--border)] rounded-2xl bg-[var(--bg-secondary)]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--border)] flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{detail.template.name}</h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-[var(--text-secondary)]">
                {detail.template.company && <span>🏢 {detail.template.company}</span>}
                {detail.template.role && <span>👤 {detail.template.role}</span>}
                <span>⏱ {detail.template.duration_minutes} min</span>
                <span>📊 {detail.template.total_attempts ?? 0} attempts, {detail.template.total_invitations ?? 0} invited</span>
              </div>
            </div>
            <button
              onClick={() => { setShowInvite(true); setDetailTab('invitations'); }}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold flex-shrink-0 transition-colors"
            >
              + Assign Students
            </button>
          </div>

          {/* Invite panel */}
          {showInvite && (
            <div className="mx-6 my-4 p-4 border border-blue-200 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-sm text-[var(--text-primary)]">Assign students to this exam</p>
                {/* Tab switcher */}
                <div className="flex rounded-lg bg-white dark:bg-gray-800 border border-[var(--border)] p-0.5 text-xs font-medium">
                  <button onClick={() => setInviteTab('search')} className={`px-3 py-1 rounded-md transition-colors ${inviteTab === 'search' ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)]'}`}>
                    🔍 Search
                  </button>
                  <button onClick={() => { setInviteTab('excel'); setExcelResult(null); }} className={`px-3 py-1 rounded-md transition-colors ${inviteTab === 'excel' ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)]'}`}>
                    📊 Upload Excel
                  </button>
                </div>
              </div>

              {inviteTab === 'search' && (
                <>
                  <input
                    placeholder="Search students by name or email…"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1 mb-3">
                    {students.length === 0 && (
                      <p className="text-xs text-[var(--text-secondary)] py-2 text-center">No students found</p>
                    )}
                    {students.map((s) => {
                      const checked = !!selectedStudents.find((p) => p.id === s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 hover:bg-white dark:hover:bg-gray-800 rounded-lg cursor-pointer text-sm">
                          <input type="checkbox" checked={checked} onChange={() => toggleStudent(s)} />
                          <span className="font-medium text-[var(--text-primary)]">{s.name}</span>
                          <span className="text-[var(--text-secondary)] text-xs">{s.email}</span>
                        </label>
                      );
                    })}
                  </div>
                  {selectedStudents.length > 0 && (
                    <p className="text-xs text-blue-700 font-medium mb-2">
                      Selected: {selectedStudents.map((s) => s.name).join(', ')}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Expires at (optional)</label>
                      <input type="datetime-local" value={inviteExpiry} onChange={(e) => setInviteExpiry(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Note (optional)</label>
                      <input value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} placeholder="e.g. Campus drive batch" className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleInvite} disabled={selectedStudents.length === 0 || inviting} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 transition-colors">
                      {inviting ? 'Assigning…' : `Assign ${selectedStudents.length > 0 ? `(${selectedStudents.length})` : ''}`}
                    </button>
                    <button onClick={() => { setShowInvite(false); setSelectedStudents([]); setStudentSearch(''); }} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg-primary)] transition-colors">
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {inviteTab === 'excel' && (
                <>
                  <div className="text-xs text-[var(--text-secondary)] bg-white dark:bg-gray-800 border border-[var(--border)] rounded-lg px-3 py-2 mb-3">
                    <p className="font-medium text-[var(--text-primary)] mb-1">📋 Required columns in your Excel / CSV:</p>
                    <p><code className="text-blue-700">name</code> — student full name (optional)</p>
                    <p><code className="text-blue-700">email</code> — student email <span className="text-red-600">(required)</span></p>
                    <p className="mt-1 text-gray-500">New students are auto-created. Existing students are re-invited.</p>
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs text-[var(--text-secondary)] mb-1">Select .xlsx or .csv file</label>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={(e) => { setExcelFile(e.target.files?.[0] ?? null); setExcelResult(null); }}
                      className="block w-full text-sm text-[var(--text-secondary)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Expires at (optional)</label>
                      <input type="datetime-local" value={inviteExpiry} onChange={(e) => setInviteExpiry(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-[var(--text-secondary)] mb-1">Note (optional)</label>
                      <input value={inviteNote} onChange={(e) => setInviteNote(e.target.value)} placeholder="e.g. Campus drive batch" className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-sm" />
                    </div>
                  </div>

                  <div className="flex gap-2 mb-3">
                    <button onClick={handleExcelUpload} disabled={!excelFile || excelUploading} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50 transition-colors">
                      {excelUploading ? '⏳ Uploading…' : '📤 Upload & Invite'}
                    </button>
                    <button onClick={() => { setShowInvite(false); setExcelFile(null); setExcelResult(null); }} className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--bg-primary)] transition-colors">
                      Cancel
                    </button>
                  </div>

                  {excelResult && (
                    <div className="mt-3 border border-[var(--border)] rounded-lg overflow-hidden">
                      <div className={`px-4 py-2 text-sm font-semibold ${excelResult.skipped === 0 ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'}`}>
                        ✅ {excelResult.invited} invited &nbsp;|&nbsp; ⚠️ {excelResult.skipped} skipped &nbsp;|&nbsp; Total: {excelResult.total}
                      </div>
                      {excelResult.results.filter(r => r.status !== 'invited').length > 0 && (
                        <div className="max-h-40 overflow-y-auto divide-y divide-[var(--border)]">
                          {excelResult.results.filter(r => r.status !== 'invited').map((r) => (
                            <div key={r.row} className="flex items-center gap-2 px-3 py-1.5 text-xs text-red-700 bg-red-50">
                              <span className="font-mono text-gray-500">row {r.row}</span>
                              <span className="flex-1 truncate">{r.email}</span>
                              <span>{r.error || r.status}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-[var(--border)] px-6">
            {(['invitations', 'attempts', 'questions', 'staff'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setDetailTab(tab as any);
                  if (tab === 'questions') loadQuestionPool();
                  if (tab === 'staff' && !templateStaff.length) loadTemplateStaff();
                }}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                  detailTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {tab === 'invitations' ? `Invitations (${detail.invitations?.length ?? 0})`
                  : tab === 'attempts' ? `Attempts (${detail.attempts?.length ?? 0})`
                  : tab === 'questions' ? '📚 Question Pool'
                  : '👤 Staff'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {detailTab === 'invitations' && (
              <div>
                {!detail.invitations?.length ? (
                  <div className="text-center py-10 text-[var(--text-secondary)] text-sm">
                    No students assigned yet. Click "+ Assign Students" to invite.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
                        <th className="pb-2 font-medium">Student</th>
                        <th className="pb-2 font-medium">Assigned By</th>
                        <th className="pb-2 font-medium">Assigned At</th>
                        <th className="pb-2 font-medium">Expires</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {detail.invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-[var(--bg-primary)] transition-colors">
                          <td className="py-3">
                            <p className="font-medium text-[var(--text-primary)]">{inv.student_name}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{inv.student_email}</p>
                          </td>
                          <td className="py-3 text-[var(--text-secondary)]">{inv.assigned_by_name}</td>
                          <td className="py-3 text-[var(--text-secondary)] text-xs">{fmt(inv.assigned_at)}</td>
                          <td className="py-3 text-[var(--text-secondary)] text-xs">{inv.expires_at ? fmt(inv.expires_at) : '—'}</td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${INV_COLOR[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-3">
                            <div className="flex gap-2 items-center">
                              {inv.status === 'pending' && (
                                <button
                                  onClick={() => handleLaunchForStudent(inv.user_id)}
                                  disabled={launching === inv.user_id}
                                  title="Create exam attempt for this student immediately"
                                  className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium transition-colors"
                                >
                                  {launching === inv.user_id ? '…' : '▶ Start'}
                                </button>
                              )}
                              {inv.status === 'pending' && (
                                <button
                                  onClick={() => handleCancelInvite(inv.user_id)}
                                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {(detailTab as string) === 'questions' && (
              <div className="space-y-6">
                {poolLoading ? (
                  <div className="text-center py-10 text-[var(--text-secondary)] text-sm">Loading question pool…</div>
                ) : !questionPool ? (
                  <div className="text-center py-10">
                    <button onClick={loadQuestionPool} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">Load Question Pool</button>
                  </div>
                ) : (
                  <>
                    {/* Pool mode badge */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border ${questionPool.usingDedicatedPool ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                      {questionPool.usingDedicatedPool ? '🔒 Using dedicated pool for this exam' : '🌐 Using global question pool (add questions below to create a dedicated pool)'}
                    </div>

                    {/* Coverage summary */}
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${questionPool.canStart ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                      <span className="text-lg">{questionPool.canStart ? '✅' : '❌'}</span>
                      {questionPool.canStart ? 'Enough questions — students can start this exam.' : 'Not enough questions — add more below.'}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(questionPool.coverage).map(([diff, cov]) => (
                        <div key={diff} className={`rounded-xl border p-4 ${cov.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                          <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${diff === 'low' ? 'text-green-700' : diff === 'medium' ? 'text-yellow-700' : 'text-red-700'}`}>{diff === 'low' ? 'Easy' : diff === 'medium' ? 'Medium' : 'Hard'}</p>
                          <p className="text-2xl font-bold text-[var(--text-primary)]">{cov.available}</p>
                          <p className="text-xs text-[var(--text-secondary)] mt-0.5">available · needs {cov.needed}</p>
                          {!cov.ok && <p className="text-xs text-red-600 font-medium mt-1">⚠️ Short by {cov.needed - cov.available}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Questions in pool with remove */}
                    {questionPool.questions.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Questions in this pool ({questionPool.questions.length})</h4>
                        <div className="space-y-1.5">
                          {questionPool.questions.map((q) => (
                            <div key={q.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] text-sm">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${q.difficulty === 'low' ? 'bg-green-100 text-green-700' : q.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{q.difficulty === 'low' ? 'Easy' : q.difficulty === 'medium' ? 'Med' : 'Hard'}</span>
                              <span className="flex-1 font-medium text-[var(--text-primary)]">{q.title}</span>
                              <div className="flex gap-1 flex-wrap justify-end">
                                {(q.topic_tags ?? []).slice(0, 3).map((t: string) => (
                                  <span key={t} className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">{t}</span>
                                ))}
                              </div>
                              <button
                                onClick={() => handleRemoveFromPool(q.id)}
                                disabled={removingFromPool === q.id}
                                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors disabled:opacity-50"
                              >
                                {removingFromPool === q.id ? '…' : '✕ Remove'}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Add Questions — two sub-tabs */}
                    <AddQuestionsPanel templateId={selectedId!} onAdded={() => { loadQuestionPool(); }} />
                  </>
                )}
              </div>
            )}

            {(detailTab as string) === 'staff' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)]">Staff assigned to this exam</h4>
                  <button onClick={loadTemplateStaff} disabled={staffLoading} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                    {staffLoading ? 'Loading…' : '↻ Refresh'}
                  </button>
                </div>

                {/* Assigned staff list */}
                {templateStaff.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)] py-4 text-center">No staff assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {templateStaff.map((s) => (
                      <div key={s.user_id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold">{s.name[0]?.toUpperCase()}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">{s.name}</p>
                          <p className="text-xs text-[var(--text-secondary)] truncate">{s.email} · {s.role}</p>
                        </div>
                        <span className="text-xs text-[var(--text-secondary)]">by {s.assigned_by_name}</span>
                        <button
                          onClick={() => handleRemoveStaff(s.user_id)}
                          disabled={removingStaff === s.user_id}
                          className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                        >
                          {removingStaff === s.user_id ? '…' : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Assign staff */}
                <div className="border border-[var(--border)] rounded-xl p-4">
                  <h5 className="text-sm font-semibold text-[var(--text-primary)] mb-3">➕ Assign Staff</h5>
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={e => setStaffSearch(e.target.value)}
                    placeholder="Search staff by name or email…"
                    className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-primary)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {staffCandidates.length > 0 && (
                    <div className="mt-2 border border-[var(--border)] rounded-lg overflow-hidden divide-y divide-[var(--border)] max-h-48 overflow-y-auto">
                      {staffCandidates.map((s) => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-primary)] transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{s.name}</p>
                            <p className="text-xs text-[var(--text-secondary)] truncate">{s.email}</p>
                          </div>
                          <button
                            onClick={() => handleAssignStaff(s.id)}
                            disabled={assigningStaff === s.id}
                            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                          >
                            {assigningStaff === s.id ? '…' : 'Assign'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailTab === 'attempts' && (
              <div>
                {!detail.attempts?.length ? (
                  <div className="text-center py-10 text-[var(--text-secondary)] text-sm">
                    No attempts yet for this exam.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--text-secondary)] border-b border-[var(--border)]">
                        <th className="pb-2 font-medium">Student</th>
                        <th className="pb-2 font-medium">State</th>
                        <th className="pb-2 font-medium">Started At</th>
                        <th className="pb-2 font-medium">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {detail.attempts.map((a) => (
                        <tr key={a.id} className="hover:bg-[var(--bg-primary)] transition-colors">
                          <td className="py-3">
                            <p className="font-medium text-[var(--text-primary)]">{a.student_name}</p>
                            <p className="text-xs text-[var(--text-secondary)]">{a.student_email}</p>
                          </td>
                          <td className="py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATE_COLOR[a.state] ?? 'bg-gray-100 text-gray-600'}`}>
                              {a.state.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 text-xs text-[var(--text-secondary)]">{fmt(a.started_at)}</td>
                          <td className="py-3 text-xs text-[var(--text-secondary)]">{fmt(a.submitted_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center border border-dashed border-[var(--border)] rounded-2xl text-[var(--text-secondary)]">
          <div className="text-center">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-base font-medium">Select an exam template</p>
            <p className="text-sm mt-1">to view details, attempts, and manage invitations</p>
          </div>
        </div>
      )}
    </div>
  );
}
