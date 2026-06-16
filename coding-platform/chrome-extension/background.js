// SMART Proctor Guard — Background Service Worker

const VIOLATION_KEY = 'proctor_violations';

// ── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  // Open extensions manager so students can disable conflicting extensions
  if (message.action === 'open-extensions') {
    chrome.tabs.create({ url: 'chrome://extensions' });
    sendResponse({ success: true });
    return true;
  }

  // Content script forwards a violation event
  if (message.action === 'violation') {
    const { type, ts, tabId: msgTabId } = message;
    const key = VIOLATION_KEY + '_' + (msgTabId || sender.tab?.id || 'unknown');
    chrome.storage.local.get([key], function (result) {
      const list = result[key] || [];
      list.push({ type, ts: ts || Date.now() });
      const update = {};
      update[key] = list;
      chrome.storage.local.set(update);

      // Update badge with count
      const tid = msgTabId || sender.tab?.id;
      if (tid) {
        chrome.action.setBadgeText({ text: String(list.length), tabId: tid });
        chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId: tid });
      }
    });
    sendResponse({ success: true });
    return true;
  }

  // Popup requests current violation list for a tab
  if (message.action === 'get-violations') {
    const key = VIOLATION_KEY + '_' + message.tabId;
    chrome.storage.local.get([key], function (result) {
      sendResponse({ violations: result[key] || [] });
    });
    return true; // async
  }

  // Popup requests violation count reset
  if (message.action === 'clear-violations') {
    const key = VIOLATION_KEY + '_' + message.tabId;
    chrome.storage.local.remove(key, function () {
      sendResponse({ success: true });
    });
    return true;
  }

  return true;
});

// ── Badge on exam pages ──────────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('/exam/')) {
    // Check stored violation count first
    const key = VIOLATION_KEY + '_' + tabId;
    chrome.storage.local.get([key], function (result) {
      const count = (result[key] || []).length;
      if (count > 0) {
        chrome.action.setBadgeText({ text: String(count), tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId: tabId });
      } else {
        chrome.action.setBadgeText({ text: 'ON', tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#d97706', tabId: tabId });
      }
    });
  }
});
