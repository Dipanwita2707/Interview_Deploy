'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { examApi } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────
export type ProctorIncident = {
  type: string;
  message: string;
  timestamp: string;
};

export const MAX_VIOLATIONS = 5;
const COOLDOWN_MS = 4000; // per-type cooldown to avoid spam

interface UseProctorOptions {
  attemptId: string;
  onAutoSubmit: () => void;
  /** Set to true only after exam is loaded and in_progress */
  enabled?: boolean;
}

export interface UseProctorReturn {
  isFullscreen: boolean;
  violationCount: number;
  incidents: ProctorIncident[];
  showWarning: boolean;
  currentWarning: string;
  terminated: boolean;
  /** true when the SMART Proctor Guard Chrome extension is detected on this page */
  extensionInstalled: boolean;
  requestFullscreen: () => void;
  dismissWarning: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────
export function useProctor({
  attemptId,
  onAutoSubmit,
  enabled = true,
}: UseProctorOptions): UseProctorReturn {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [incidents, setIncidents] = useState<ProctorIncident[]>([]);
  const [showWarning, setShowWarning] = useState(false);
  const [currentWarning, setCurrentWarning] = useState('');
  const [terminated, setTerminated] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);

  // Refs that don't need re-renders
  const cooldownRef = useRef<Record<string, number>>({});
  const terminatedRef = useRef(false);
  const violationRef = useRef(0);

  // ── Core report function ─────────────────────────────────────
  const reportIncident = useCallback(
    async (type: string, message: string, metadata?: Record<string, unknown>) => {
      if (!enabled || terminatedRef.current) return;

      // Per-type cooldown to prevent event storms
      const now = Date.now();
      if ((cooldownRef.current[type] ?? 0) + COOLDOWN_MS > now) return;
      cooldownRef.current[type] = now;

      // Update incident log & counter
      const incident: ProctorIncident = {
        type,
        message,
        timestamp: new Date().toISOString(),
      };
      setIncidents((prev) => [...prev, incident]);
      setCurrentWarning(message);
      setShowWarning(true);

      violationRef.current += 1;
      const nextCount = violationRef.current;
      setViolationCount(nextCount);

      // Auto-submit when threshold exceeded
      if (nextCount >= MAX_VIOLATIONS) {
        terminatedRef.current = true;
        setTerminated(true);
        onAutoSubmit();
      }

      // Best-effort backend report — don't await on critical path
      examApi.reportIncident(attemptId, type, metadata).catch(() => {});
    },
    [enabled, attemptId, onAutoSubmit],
  );

  const requestFullscreen = useCallback(() => {
    document.documentElement
      .requestFullscreen({ navigationUI: 'hide' })
      .catch(() => {});
  }, []);

  const dismissWarning = useCallback(() => setShowWarning(false), []);

  // ── Fullscreen tracking ──────────────────────────────────────
  useEffect(() => {
    const handleChange = () => {
      const isFS = !!document.fullscreenElement;
      setIsFullscreen(isFS);
      if (!isFS && enabled && !terminatedRef.current) {
        reportIncident(
          'focus_loss',
          'Fullscreen exited — return to fullscreen to continue the exam.',
          { event: 'fullscreen_exit' },
        );
      }
    };
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, [reportIncident, enabled]);

  // ── Tab / visibility switch ──────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const handle = () => {
      if (document.hidden) {
        reportIncident('tab_switch', 'Tab switch detected! Stay on the exam window.', {
          event: 'visibility_hidden',
        });
      }
    };
    document.addEventListener('visibilitychange', handle);
    return () => document.removeEventListener('visibilitychange', handle);
  }, [reportIncident, enabled]);

  // ── Window focus loss ────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const handle = () => {
      // Only fire if not already caught by visibilitychange
      if (!document.hidden) {
        reportIncident(
          'focus_loss',
          'Focus lost — keep the exam window active at all times.',
          { event: 'window_blur' },
        );
      }
    };
    window.addEventListener('blur', handle);
    return () => window.removeEventListener('blur', handle);
  }, [reportIncident, enabled]);

  // ── Block right-click ────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const block = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', block);
    return () => document.removeEventListener('contextmenu', block);
  }, [enabled]);

  // ── Block devtools shortcuts ─────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toUpperCase();

      // Block all function keys (F1–F12)
      if (/^F\d+$/.test(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // Block Ctrl+C (copy) and Ctrl+V (paste)
      if (isCtrl && !isShift && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'v')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.key.toLowerCase() === 'v') {
          reportIncident('suspicious_window', 'Pasting external content is not allowed during the exam.', {
            key: e.key, ctrl: true,
          });
        }
        return;
      }

      const isDevtoolsShortcut =
        e.key === 'F12' ||
        (isCtrl && isShift && ['I', 'J', 'C', 'K'].includes(key)) ||
        (isCtrl && e.key === 'u') ||
        e.key === 'PrintScreen';

      const isBlockedSave = isCtrl && e.key === 's';

      if (isDevtoolsShortcut) {
        e.preventDefault();
        e.stopPropagation();
        reportIncident('suspicious_window', 'Suspicious keyboard shortcut detected!', {
          key: e.key,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
        });
        return;
      }

      if (isBlockedSave) {
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handle, true); // capture phase
    return () => document.removeEventListener('keydown', handle, true);
  }, [reportIncident, enabled]);

  // ── DevTools detection via window size ratio ─────────────────
  useEffect(() => {
    if (!enabled) return;
    let devtoolsWasOpen = false;
    const THRESHOLD = 160;

    const check = () => {
      const widthDiff = window.outerWidth - window.innerWidth > THRESHOLD;
      const heightDiff = window.outerHeight - window.innerHeight > THRESHOLD;
      const isOpen = widthDiff || heightDiff;

      if (isOpen && !devtoolsWasOpen) {
        devtoolsWasOpen = true;
        reportIncident(
          'suspicious_window',
          'Developer tools detected — close them to continue.',
          { event: 'devtools_open' },
        );
      } else if (!isOpen) {
        devtoolsWasOpen = false;
      }
    };

    const id = setInterval(check, 2500);
    return () => clearInterval(id);
  }, [reportIncident, enabled]);

  // ── Copy detection in problem pane ───────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const handle = () => {
      const sel = window.getSelection()?.toString() ?? '';
      if (sel.length > 20) {
        reportIncident(
          'suspicious_window',
          'Copying exam content is not permitted.',
          { event: 'copy', textLength: sel.length },
        );
      }
    };
    document.addEventListener('copy', handle);
    return () => document.removeEventListener('copy', handle);
  }, [reportIncident, enabled]);

  // ── Block page navigation / refresh ─────────────────────────
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handle);
    return () => window.removeEventListener('beforeunload', handle);
  }, [enabled]);

  // ── Paste detection (clipboard external content) ─────────────
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? '';
      // Only flag if pasted content is large (likely external AI/code)
      if (text.length > 200) {
        reportIncident(
          'suspicious_window',
          'Large paste detected — external content may not be used.',
          { event: 'paste', textLength: text.length },
        );
      }
    };
    document.addEventListener('paste', handle);
    return () => document.removeEventListener('paste', handle);
  }, [reportIncident, enabled]);

  // ── Chrome extension detection ───────────────────────────────
  // The SMART Proctor Guard extension injects window.__SMART_PROCTOR_ACTIVE__
  // in the MAIN world at document_start — before any React code runs.
  useEffect(() => {
    const check = () => {
      if (typeof window !== 'undefined' && (window as any).__SMART_PROCTOR_ACTIVE__ === true) {
        setExtensionInstalled(true);
        return true;
      }
      return false;
    };
    if (check()) return;
    // Retry for 3 s in case of slow injection (should not be needed but safe)
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (check() || attempts >= 6) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  return {
    isFullscreen,
    violationCount,
    incidents,
    showWarning,
    currentWarning,
    terminated,
    extensionInstalled,
    requestFullscreen,
    dismissWarning,
  };
}
