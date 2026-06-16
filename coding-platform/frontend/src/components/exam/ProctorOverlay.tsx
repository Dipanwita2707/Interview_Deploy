'use client';

import { MAX_VIOLATIONS } from '@/hooks/useProctor';

interface ProctorOverlayProps {
  /** Whether the page is currently in fullscreen */
  isFullscreen: boolean;
  violationCount: number;
  showWarning: boolean;
  currentWarning: string;
  /** Exam auto-terminated — max violations reached */
  terminated: boolean;
  /** Whether the SMART Proctor Guard Chrome extension is detected */
  extensionInstalled: boolean;
  onRequestFullscreen: () => void;
  onDismissWarning: () => void;
}

// ─── Terminated screen ────────────────────────────────────────
function TerminatedScreen() {
  return (
    <div className="fixed inset-0 z-[9999] bg-red-950 flex items-center justify-center">
      <div className="text-center text-white max-w-lg px-8 py-12">
        <div className="text-7xl mb-6 select-none">🚫</div>
        <h1 className="text-4xl font-bold mb-4">Exam Terminated</h1>
        <p className="text-red-200 text-lg mb-3">
          You exceeded {MAX_VIOLATIONS} security violations.
        </p>
        <p className="text-red-400 text-sm leading-relaxed">
          Your exam has been automatically submitted and flagged for review by the exam
          administrator. If you believe this is an error, please contact your placement team.
        </p>
      </div>
    </div>
  );
}

// ─── Extension gate ──────────────────────────────────────────
function ExtensionGate() {
  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex items-center justify-center p-4">
      <div className="text-center text-white max-w-lg w-full px-8 py-10">
        {/* Icon */}
        <div className="w-20 h-20 bg-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-amber-900/50">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-2">Extension Required</h1>
        <p className="text-gray-400 mb-6 text-sm leading-relaxed">
          The <strong className="text-white">SMART Proctor Guard</strong> Chrome extension must be
          active before this exam can begin. It blocks clipboard access, function keys, and
          prevents other extensions from interfering.
        </p>

        {/* Install steps */}
        <div className="text-left bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6 space-y-3 text-sm text-gray-400">
          <p className="text-gray-200 font-semibold mb-2">📦 How to install</p>
          {([
            'Get the extension folder from your exam coordinator.',
            'Open chrome://extensions in Chrome.',
            'Enable Developer mode (top-right toggle).',
            'Click Load unpacked and select the chrome-extension folder.',
            'Disable ALL other extensions while the exam is running.',
          ] as const).map((step, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold ${
                i === 4 ? 'bg-amber-600' : 'bg-blue-700'
              }`}>
                {i + 1}
              </span>
              <span className={i === 4 ? 'text-amber-300 font-medium' : ''}>{step}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-amber-600 hover:bg-amber-500 active:scale-95 rounded-xl font-semibold text-white text-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-amber-900/40"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
          I've Installed It — Reload Page
        </button>
        <p className="mt-3 text-gray-600 text-xs">
          The extension is detected automatically on page load.
        </p>
      </div>
    </div>
  );
}

// ─── Fullscreen gate ──────────────────────────────────────────
function FullscreenGate({
  violationCount,
  onRequestFullscreen,
}: {
  violationCount: number;
  onRequestFullscreen: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[9999] bg-gray-950 flex items-center justify-center">
      <div className="text-center text-white max-w-lg px-8 py-10">
        {/* Shield icon */}
        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-900/50">
          <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold mb-2">Secure Exam Mode</h1>
        <p className="text-gray-400 mb-6 text-sm">
          This exam requires fullscreen mode to ensure integrity.
        </p>

        {/* Rules */}
        <div className="text-left bg-gray-900 border border-gray-700 rounded-xl p-5 mb-8 space-y-2 text-sm text-gray-400">
          <p className="text-gray-200 font-semibold mb-3 text-base">📋 Exam Rules</p>
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">⚠</span>
            <span>Tab switching will be recorded and reported</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">⚠</span>
            <span>Exiting fullscreen counts as a violation</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">⚠</span>
            <span>DevTools / browser console usage is detected</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">⚠</span>
            <span>Copying exam questions is not permitted</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-red-400 mt-0.5">⚠</span>
            <span>Pasting large external content will be flagged</span>
          </div>
          <div className="flex items-start gap-2 pt-1 border-t border-gray-700">
            <span className="text-orange-400 mt-0.5">🔴</span>
            <span className="text-orange-300 font-medium">
              {MAX_VIOLATIONS} violations = automatic submission + admin flag
            </span>
          </div>
        </div>

        {violationCount > 0 && (
          <div className="mb-5 px-4 py-2 bg-yellow-900/60 border border-yellow-600 rounded-lg text-yellow-300 text-sm">
            ⚠ {violationCount} violation(s) already recorded this session
          </div>
        )}

        <button
          onClick={onRequestFullscreen}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 rounded-xl font-semibold text-white text-lg transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
          </svg>
          Enter Fullscreen &amp; Start Exam
        </button>

        <p className="mt-4 text-gray-600 text-xs">
          Press Esc during the exam = 1 violation. Do not exit fullscreen.
        </p>
      </div>
    </div>
  );
}

// ─── Violation warning modal ──────────────────────────────────
function ViolationModal({
  currentWarning,
  violationCount,
  onDismiss,
}: {
  currentWarning: string;
  violationCount: number;
  onDismiss: () => void;
}) {
  const remaining = MAX_VIOLATIONS - violationCount;
  const severity =
    remaining <= 1 ? 'red' : remaining <= 2 ? 'orange' : 'yellow';

  const colors = {
    red: {
      header: 'bg-red-600',
      badge: 'bg-red-100 text-red-800 border-red-200',
      btn: 'bg-red-700 hover:bg-red-800',
    },
    orange: {
      header: 'bg-orange-600',
      badge: 'bg-orange-100 text-orange-800 border-orange-200',
      btn: 'bg-orange-700 hover:bg-orange-800',
    },
    yellow: {
      header: 'bg-yellow-500',
      badge: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      btn: 'bg-yellow-600 hover:bg-yellow-700',
    },
  }[severity];

  return (
    <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-[scale-in_0.15s_ease-out]">
        {/* Header */}
        <div className={`${colors.header} px-6 py-4 flex items-center gap-3`}>
          <svg className="w-6 h-6 text-white flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <h2 className="text-white font-bold text-lg">Security Violation Detected</h2>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-700 text-base mb-5 leading-relaxed">{currentWarning}</p>

          <div className={`border rounded-lg px-4 py-3 mb-6 text-sm font-medium ${colors.badge}`}>
            Violation {violationCount} of {MAX_VIOLATIONS} &mdash;{' '}
            {remaining <= 0
              ? 'Submitting exam…'
              : `${remaining} more will auto-submit your exam`}
          </div>

          <button
            onClick={onDismiss}
            className={`w-full py-3 text-white rounded-xl font-semibold transition-colors ${colors.btn}`}
          >
            I Understand — Return to Exam
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────
export default function ProctorOverlay({
  isFullscreen,
  violationCount,
  showWarning,
  currentWarning,
  terminated,
  extensionInstalled,
  onRequestFullscreen,
  onDismissWarning,
}: ProctorOverlayProps) {
  if (terminated) return <TerminatedScreen />;

  // Extension gate — must be installed before entering fullscreen
  if (!extensionInstalled) return <ExtensionGate />;

  if (!isFullscreen)
    return (
      <FullscreenGate
        violationCount={violationCount}
        onRequestFullscreen={onRequestFullscreen}
      />
    );

  if (showWarning)
    return (
      <ViolationModal
        currentWarning={currentWarning}
        violationCount={violationCount}
        onDismiss={onDismissWarning}
      />
    );

  return null;
}

// ─── Warning banner (always-visible strip) ───────────────────
export function ViolationBanner({ violationCount }: { violationCount: number }) {
  if (violationCount === 0) return null;

  const remaining = MAX_VIOLATIONS - violationCount;
  const bg =
    remaining <= 1
      ? 'bg-red-600 text-white'
      : remaining <= 2
      ? 'bg-orange-500 text-white'
      : 'bg-yellow-400 text-yellow-900';

  return (
    <div className={`px-4 py-1.5 text-xs text-center font-semibold tracking-wide select-none ${bg}`}>
      🔴 {violationCount} security violation{violationCount > 1 ? 's' : ''} recorded —{' '}
      {remaining} more will auto-submit your exam
    </div>
  );
}
