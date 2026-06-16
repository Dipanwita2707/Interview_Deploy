import type { TestResult } from '@/types';
import VerdictBadge from '@/components/ui/VerdictBadge';

interface TestResultsPanelProps {
  results: TestResult[];
  isRunning: boolean;
}

export default function TestResultsPanel({ results, isRunning }: TestResultsPanelProps) {
  if (isRunning) {
    return (
      <div className="p-4 text-center text-[var(--text-secondary)]">
        <svg className="animate-spin h-6 w-6 mx-auto mb-2" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Running test cases…
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="p-4 text-center text-[var(--text-secondary)] text-sm">
        Submit your code to see results
      </div>
    );
  }

  const passed = results.filter((r) => r.passed).length;

  return (
    <div className="divide-y divide-[var(--border)]">
      {/* Summary */}
      <div className="px-4 py-3 flex items-center justify-between bg-[var(--bg-secondary)]">
        <span className="text-sm font-medium">
          Test Results: {passed}/{results.length} passed
        </span>
        <VerdictBadge
          verdict={passed === results.length ? 'accepted' : 'wrong_answer'}
        />
      </div>

      {/* Individual results */}
      {results.map((result, idx) => (
        <div key={result.test_case_id} className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">
              Test Case #{idx + 1}
            </span>
            <VerdictBadge verdict={result.verdict} />
          </div>
          <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
            {result.execution_time_ms !== undefined && (
              <span>⏱ {result.execution_time_ms}ms</span>
            )}
            {result.memory_used_kb !== undefined && (
              <span>💾 {(result.memory_used_kb / 1024).toFixed(1)}MB</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
