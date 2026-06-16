/**
 * SMART Proctor Guard — Content Script
 * World: MAIN  |  Runs at: document_start
 *
 * Executes before ANY page script or other extension content script.
 * Uses capture-phase listeners + stopImmediatePropagation to block events
 * before other handlers (including other extensions loaded in MAIN world).
 */
(function () {
  'use strict';

  // ── 1. Signal presence to the exam page ─────────────────────────────────────
  //    useProctor hook polls for this flag to unlock the exam UI
  window.__SMART_PROCTOR_ACTIVE__  = true;
  window.__SMART_PROCTOR_VERSION__ = '1.0.0';

  // ── 2. Keyboard blocking (capture phase = runs first) ───────────────────────
  window.addEventListener('keydown', function (e) {
    var ctrl  = e.ctrlKey || e.metaKey;
    var shift = e.shiftKey;
    var key   = e.key ? e.key.toLowerCase() : '';

    // Block ALL function keys (F1–F12)
    if (/^f\d+$/.test(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Block Ctrl+C (copy) and Ctrl+V (paste)
    if (ctrl && !shift && (key === 'c' || key === 'v')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Block Ctrl+Shift+I / J / C / K  (DevTools variants)
    if (ctrl && shift && ['i', 'j', 'c', 'k'].includes(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Block Ctrl+U (view-source), Ctrl+S (save dialog), Ctrl+P (print)
    if (ctrl && !shift && ['u', 's', 'p'].includes(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Block PrintScreen / SnapShot
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }, true); // ← capture=true is the critical flag

  // ── 3. Block clipboard events ────────────────────────────────────────────────
  //    Prevents programmatic copy/paste as well as keyboard-triggered ones
  window.addEventListener('copy', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  window.addEventListener('cut', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  window.addEventListener('paste', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // ── 4. Block right-click context menu ───────────────────────────────────────
  window.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // ── 5. Neutralise the Clipboard API ─────────────────────────────────────────
  //    Prevents other scripts / extensions from reading the OS clipboard
  var denied = function () {
    return Promise.reject(new DOMException('Clipboard access denied by SMART Proctor Guard', 'NotAllowedError'));
  };

  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: false,
      enumerable:   true,
      get: function () {
        return {
          readText:  denied,
          writeText: denied,
          read:      denied,
          write:     denied,
        };
      },
    });
  } catch (_) {
    // Property already non-configurable — try prototype override
    try {
      var proto = Object.getPrototypeOf(navigator.clipboard);
      ['readText', 'writeText', 'read', 'write'].forEach(function (fn) {
        try { Object.defineProperty(proto, fn, { value: denied, writable: false, configurable: false }); } catch (_) {}
      });
    } catch (_) { /* best-effort */ }
  }

  // ── 6. Block execCommand copy/paste ─────────────────────────────────────────
  var _execCommand = document.execCommand.bind(document);
  document.execCommand = function (cmd) {
    if (['copy', 'cut', 'paste'].indexOf(cmd.toLowerCase()) !== -1) return false;
    return _execCommand.apply(document, arguments);
  };

  // ── 7. Violation detection — dispatches CustomEvents the exam page can hear ──
  function dispatchViolation(type, extra) {
    window.dispatchEvent(new CustomEvent('__SMART_PROCTOR_VIOLATION__', {
      detail: Object.assign({ type: type, ts: Date.now() }, extra || {})
    }));
    // Also relay to background service worker so it can persist + update badge
    try {
      chrome.runtime.sendMessage({
        action: 'violation',
        type: type,
        ts: Date.now(),
        tabId: null  // background resolves via sender.tab.id
      });
    } catch (_) { /* extension context may be invalidated — ignore */ }
  }

  // Tab-switch: page becomes hidden
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) dispatchViolation('tab_switch');
  }, true);

  // Focus loss: user clicks away from the window
  window.addEventListener('blur', function () {
    dispatchViolation('focus_loss');
  }, true);

  // DevTools heuristic: extra chrome around the window (side/bottom panel)
  var _devtoolsOpen = false;
  setInterval(function () {
    var threshold = 160;
    var widthDiff  = window.outerWidth  - window.innerWidth;
    var heightDiff = window.outerHeight - window.innerHeight;
    var open = widthDiff > threshold || heightDiff > threshold;
    if (open && !_devtoolsOpen) {
      _devtoolsOpen = true;
      dispatchViolation('devtools_open', { widthDiff: widthDiff, heightDiff: heightDiff });
    } else if (!open) {
      _devtoolsOpen = false;
    }
  }, 1000);

  console.info(
    '%c\uD83D\uDEE1\uFE0F SMART Proctor Guard v1.0.0 active',
    'color:#f59e0b; font-weight:bold; font-size:13px;'
  );
})();
