function updateLicenseUI() {
  const licBox = document.getElementById('license-box');
  const licStatusText = document.getElementById('lic-status-text');
  const licBadgeTag = document.getElementById('lic-badge-tag');
  const actForm = document.getElementById('activation-form');

  const lic = LicenseManager.getStoredLicense();
  if (lic && lic.valid) {
    licBox.className = 'license-badge license-active';
    licStatusText.textContent = `🛡️ Active: ${lic.plan} (${lic.expiry})`;
    licBadgeTag.textContent = 'UNLOCKED';
    actForm.style.display = 'none';
  } else {
    licBox.className = 'license-badge license-locked';
    licStatusText.textContent = '🔒 License Required to Use';
    licBadgeTag.textContent = 'LOCKED';
    actForm.style.display = 'block';
  }
}

document.getElementById('popup-activate-btn').addEventListener('click', () => {
  const input = document.getElementById('popup-lic-key');
  const key = input.value.trim();
  const res = LicenseManager.validateKey(key);

  if (res.valid) {
    LicenseManager.saveLicense(res);
    updateLicenseUI();
    document.getElementById('status-msg').innerHTML = '<span style="color: #16a34a;">✔ License Activated Successfully!</span>';
    // Notify active tab to unlock immediately
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'LICENSE_UPDATED' });
      }
    });
  } else {
    document.getElementById('status-msg').innerHTML = `<span style="color: #dc2626;">✖ ${res.message}</span>`;
  }
});

async function activatePanel() {
  const statusEl = document.getElementById('status-msg');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusEl.textContent = 'Please open HP Gas CDCMS tab first.';
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action: 'OPEN_PANEL' }, async (response) => {
      if (chrome.runtime.lastError || !response) {
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          });
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['license.js', 'content.js']
          });
          setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, { action: 'OPEN_PANEL' });
            window.close();
          }, 400);
        } catch (e) {
          statusEl.textContent = 'Please refresh the CDCMS page (Press F5).';
        }
      } else {
        window.close();
      }
    });
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
  }
}

document.getElementById('open-panel-btn').addEventListener('click', activatePanel);

window.addEventListener('DOMContentLoaded', () => {
  updateLicenseUI();
});
