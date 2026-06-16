# SMART Proctor Guard — Chrome Extension

Prevents cheating during SMART Coding Platform proctored exams.

## What it does

| Protection | Detail |
|---|---|
| **Ctrl+C / Ctrl+V blocked** | Copy & paste completely disabled on exam pages |
| **F1–F12 blocked** | All function keys suppressed |
| **Right-click disabled** | Context menu blocked |
| **DevTools shortcuts blocked** | Ctrl+Shift+I/J/C/K, Ctrl+U, etc. |
| **Clipboard API neutralised** | `navigator.clipboard.readText/writeText` return errors |
| **Extension gate** | Exam page refuses to start until this extension is detected |

## Installation (students)

1. Get the `chrome-extension/` folder from your exam coordinator (or download it from the platform).
2. Open **Chrome** and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `chrome-extension` folder.
5. The 🛡️ icon appears in the toolbar — the extension is active.
6. **Before each exam**: click the icon → *Open Extensions Page* → disable all other extensions.

## Updating the production URL

Edit `manifest.json` and add your production hostname to:
- `host_permissions`
- `content_scripts[0].matches`

```json
"host_permissions": [
  "http://localhost:3001/*",
  "https://YOUR-DOMAIN.com/*"
],
"content_scripts": [{
  "matches": [
    "http://localhost:3001/exam/*",
    "https://YOUR-DOMAIN.com/exam/*"
  ],
  ...
}]
```

Then reload the extension in `chrome://extensions`.

## How the exam gate works

The content script (`content.js`) sets `window.__SMART_PROCTOR_ACTIVE__ = true` at
`document_start` — before any page JavaScript runs. The exam page polls this flag via
`useProctor` hook. If it's not set, a full-screen gate blocks the exam from starting
until the student installs the extension and reloads.

## Why "disabling other extensions" matters

Other extensions (AI assistants, copy-paste helpers, etc.) inject their own content
scripts. By:
1. Running our script at `document_start` before theirs
2. Using `stopImmediatePropagation` in capture phase
3. Overriding `navigator.clipboard` with a non-configurable property

...we ensure our blocks run first. Students should still manually disable other
extensions via `chrome://extensions` for maximum security.
