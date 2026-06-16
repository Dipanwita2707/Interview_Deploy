'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { type OnMount, type OnChange } from '@monaco-editor/react';
import { useEditorStore, LANGUAGES } from '@/stores/editor-store';

// Default boilerplate shown when no starter code is provided for a language
const DEFAULT_TEMPLATES: Record<string, string> = {
  python: `import sys\ninput = sys.stdin.readline\n\n# your code here\n`,
  java: `import java.util.*;\nimport java.io.*;\n\npublic class Solution {\n    public static void main(String[] args) throws IOException {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        // your code here\n    }\n}\n`,
  cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    // your code here\n    return 0;\n}\n`,
  c: `#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    // your code here\n    return 0;\n}\n`,
  javascript: `const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');\nlet idx = 0;\n// your code here\n`,
  typescript: `const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\\n');\nlet idx = 0;\n// your code here\n`,
  go: `package main\n\nimport "fmt"\n\nfunc main() {\n    // your code here\n}\n`,
  rust: `use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).unwrap();\n    // your code here\n}\n`,
  csharp: `using System;\nusing System.Collections.Generic;\n\nclass Solution {\n    static void Main(string[] args) {\n        // your code here\n    }\n}\n`,
  ruby: `# your code here\n`,
};

// Detect whether the page is currently in dark mode
function useDarkMode() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark'),
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() =>
      setIsDark(el.classList.contains('dark')),
    );
    observer.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

interface CodeEditorProps {
  readOnly?: boolean;
  height?: string;
  onRun?: () => void;
  onSubmit?: () => void;
  isRunning?: boolean;
  isSubmitting?: boolean;
  starterCode?: Record<string, string>;
}

export default function CodeEditor({
  readOnly = false,
  height = 'calc(100vh - 280px)',
  onRun,
  onSubmit,
  isRunning = false,
  isSubmitting = false,
  starterCode,
}: CodeEditorProps) {
  const { language, code, setLanguage, setCode } = useEditorStore();
  const isDark = useDarkMode();
  const monacoTheme = isDark ? 'vs-dark' : 'vs';
  const editorRef = useRef<unknown>(null);

  // Pending language switch — stored while confirm dialog is open
  const [pendingLang, setPendingLang] = useState<(typeof LANGUAGES)[number] | null>(null);

  const handleEditorMount: OnMount = useCallback((editor) => {
    editorRef.current = editor;
    editor.focus();
  }, []);

  const handleChange: OnChange = useCallback(
    (value) => {
      setCode(value || '');
    },
    [setCode],
  );

  /** Returns true when the editor has user-written content (differs from starter / template). */
  const hasUserCode = () => {
    const trimmed = code.trim();
    if (!trimmed) return false;
    const template = (starterCode?.[language] ?? DEFAULT_TEMPLATES[language] ?? '').trim();
    return trimmed !== template;
  };

  const applyLanguageSwitch = (selected: (typeof LANGUAGES)[number]) => {
    setLanguage(selected.monacoId, selected.judge0Id);
    if (starterCode && starterCode[selected.monacoId]) {
      setCode(starterCode[selected.monacoId]);
    } else {
      setCode(DEFAULT_TEMPLATES[selected.monacoId] ?? '');
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = LANGUAGES.find((l) => l.monacoId === e.target.value);
    if (!selected) return;
    if (hasUserCode()) {
      // Show confirm dialog instead of switching immediately
      setPendingLang(selected);
    } else {
      applyLanguageSwitch(selected);
    }
  };

  const handleConfirmSwitch = () => {
    if (pendingLang) applyLanguageSwitch(pendingLang);
    setPendingLang(null);
  };

  const handleReset = () => {
    if (starterCode && starterCode[language]) {
      setCode(starterCode[language]);
    } else {
      setCode(DEFAULT_TEMPLATES[language] ?? '');
    }
  };

  const langName = (monacoId: string) => LANGUAGES.find((l) => l.monacoId === monacoId)?.name ?? monacoId;

  return (
    <>
      {/* ── Language-switch confirmation dialog ── */}
      {pendingLang && (
        <div className="fixed inset-0 z-[99999] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-amber-500 text-xl">⚠️</span>
                <h3 className="font-bold text-base text-gray-900 dark:text-white">Switch to {pendingLang.name}?</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                You have written code in <strong>{langName(language)}</strong>. Switching languages will
                replace it with the <strong>{pendingLang.name}</strong> starter template —{' '}
                <span className="text-red-500 font-medium">your current code will be lost</span>.
              </p>
            </div>
            <div className="px-6 py-4 flex gap-3">
              <button
                onClick={() => setPendingLang(null)}
                className="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium transition-colors text-sm"
              >
                Keep my code
              </button>
              <button
                onClick={handleConfirmSwitch}
                className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium transition-colors text-sm"
              >
                Switch anyway
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="flex flex-col h-full border border-[var(--border)] rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          {/* value shows current language; if dialog is open, select stays on current lang */}
          <select
            value={language}
            onChange={handleLanguageChange}
            className="px-2 py-1 text-sm rounded border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.monacoId} value={lang.monacoId}>
                {lang.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleReset}
            className="px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            title="Reset to starter code"
          >
            ↺ Reset
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onRun && (
            <button
              onClick={onRun}
              disabled={isRunning || isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[var(--bg-primary)] border border-[var(--border)] hover:border-gray-400 text-[var(--text-primary)] rounded transition-colors disabled:opacity-50"
            >
              {isRunning ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : <span className="text-green-500">▶</span>}
              Run
            </button>
          )}
          {onSubmit && (
            <button
              onClick={onSubmit}
              disabled={isRunning || isSubmitting}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : null}
              Submit
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <Editor
        height={height}
        language={language}
        value={code}
        theme={monacoTheme}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          tabSize: 4,
          insertSpaces: true,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          padding: { top: 12, bottom: 12 },
          suggest: { showSnippets: true },
        }}
        loading={
          <div className="flex items-center justify-center h-full bg-[var(--bg-editor)]">
            <span className="text-gray-400 text-sm">Loading editor…</span>
          </div>
        }
      />
    </div>
    </>
  );
}
