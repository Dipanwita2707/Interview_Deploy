// SMART Proctor Guard — Popup script

document.getElementById('open-extensions').addEventListener('click', function () {
  chrome.runtime.sendMessage({ action: 'open-extensions' });
});

document.getElementById('toggle-tip').addEventListener('click', function () {
  var tip = document.getElementById('tip');
  var isVisible = tip.style.display === 'block';
  tip.style.display = isVisible ? 'none' : 'block';
  this.textContent = isVisible ? '📋  Before-exam checklist' : '📋  Hide checklist';
});

// ── Violation summary ────────────────────────────────────────────────────────
function loadViolations() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || !tabs[0]) return;
    var tabId = tabs[0].id;
    var isExamPage = tabs[0].url && tabs[0].url.includes('/exam/');

    var container = document.getElementById('violation-section');
    if (!container) return;

    if (!isExamPage) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    chrome.runtime.sendMessage({ action: 'get-violations', tabId: tabId }, function (resp) {
      var violations = (resp && resp.violations) || [];
      var count = violations.length;
      var countEl = document.getElementById('violation-count');
      var listEl  = document.getElementById('violation-list');

      if (countEl) countEl.textContent = count;

      if (listEl) {
        listEl.innerHTML = '';
        if (count === 0) {
          var li = document.createElement('li');
          li.textContent = 'No violations detected ✓';
          li.style.color = '#16a34a';
          listEl.appendChild(li);
        } else {
          // Show last 5
          violations.slice(-5).reverse().forEach(function (v) {
            var li = document.createElement('li');
            var d  = new Date(v.ts);
            var time = d.toLocaleTimeString();
            li.textContent = time + '  — ' + v.type.replace(/_/g, ' ');
            li.style.color = '#dc2626';
            listEl.appendChild(li);
          });
        }
      }
    });

    // Wire clear button
    var clearBtn = document.getElementById('clear-violations');
    if (clearBtn) {
      clearBtn.onclick = function () {
        chrome.runtime.sendMessage({ action: 'clear-violations', tabId: tabId }, function () {
          loadViolations();
        });
      };
    }
  });
}

loadViolations();
