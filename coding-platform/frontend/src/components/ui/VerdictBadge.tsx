import type { Verdict } from '@/types';

const VERDICT_LABELS: Record<string, string> = {
  accepted: 'Accepted',
  wrong_answer: 'Wrong Answer',
  compile_error: 'Compile Error',
  runtime_error: 'Runtime Error',
  time_limit_exceeded: 'TLE',
  memory_limit_exceeded: 'MLE',
  pending: 'Pending',
};

interface VerdictBadgeProps {
  verdict: Verdict | string;
  className?: string;
}

export default function VerdictBadge({ verdict, className = '' }: VerdictBadgeProps) {
  const label = VERDICT_LABELS[verdict] || verdict;

  return (
    <span className={`verdict-badge verdict-${verdict} ${className}`}>
      {verdict === 'pending' && (
        <svg className="animate-spin -ml-0.5 mr-1.5 h-3 w-3" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {verdict === 'accepted' && '✓ '}
      {verdict === 'wrong_answer' && '✗ '}
      {label}
    </span>
  );
}
