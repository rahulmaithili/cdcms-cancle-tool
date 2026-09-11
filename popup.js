async function activatePanel() {
  const statusEl = document.getElementById('status-msg');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusEl.textContent = 'Please open HP Gas CDCMS tab first.';
      return;
    }

    // Try sending message first
    chrome.tabs.sendMessage(tab.id, { action: 'OPEN_PANEL' }, async (response) => {
      if (chrome.runtime.lastError || !response) {
        // Content script wasn't loaded yet (page opened before extension was installed)
        // Dynamically inject script and css
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          // Wait briefly then send message again
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'OPEN_PANEL' });
            window.close();
          }, 400);
        } catch (e) {
          statusEl.textContent = 'Please refresh the CDCMS page (Press F5).';
        }
      } else {
        // Opened successfully, close the popup so user sees panel
        window.close();
      }
    });
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
}

document.getElementById('open-panel-btn').addEventListener('click', activatePanel);

// Auto-trigger on popup open for instant convenience
window.addEventListener('DOMContentLoaded', () => {
  activatePanel();
});
