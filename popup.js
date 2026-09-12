/**
 * Popup Script for HP Gas CDCMS Blocker
 * Integrates with LicenseVault (https://licensescript.netlify.app/)
 * Developed by Mr. Rahul Script
 * English Only Implementation
 */

function updateLicenseUI() {
  const licBox = document.getElementById('license-box');
  const licStatusText = document.getElementById('lic-status-text');
  const licBadgeTag = document.getElementById('lic-badge-tag');
  const actForm = document.getElementById('activation-form');
  const deviceIdEl = document.getElementById('popup-device-id');

  if (deviceIdEl && typeof LicenseManager !== 'undefined') {
    deviceIdEl.textContent = LicenseManager.getDeviceId();
  }

  const licStatus = typeof LicenseManager !== 'undefined' ? LicenseManager.checkLicenseStatus() : null;

  if (licStatus && licStatus.valid && licStatus.status === 'active') {
    licBox.className = 'license-badge license-active';
    const remainingStr = licStatus.lifetime ? 'Lifetime' : `${licStatus.remainingDays}d left (${licStatus.formattedExpiry})`;
    licStatusText.textContent = `🛡️ Active: ${licStatus.plan || 'PRO'} • ${remainingStr}`;
    licBadgeTag.textContent = 'UNLOCKED';
    licBadgeTag.style.background = 'rgba(16, 185, 129, 0.2)';
    licBadgeTag.style.color = '#065f46';
    actForm.style.display = 'none';
  } else if (licStatus && licStatus.status === 'expired') {
    licBox.className = 'license-badge license-locked';
    licStatusText.textContent = `⚠️ Expired on ${licStatus.formattedExpiry}! Please Renew`;
    licBadgeTag.textContent = 'EXPIRED';
    licBadgeTag.style.background = '#dc2626';
    licBadgeTag.style.color = '#ffffff';
    actForm.style.display = 'block';
  } else {
    licBox.className = 'license-badge license-locked';
    licStatusText.textContent = '🔒 License Required to Use';
    licBadgeTag.textContent = 'LOCKED';
    licBadgeTag.style.background = 'rgba(0, 0, 0, 0.1)';
    licBadgeTag.style.color = '#991b1b';
    actForm.style.display = 'block';
  }
}

// Copy Device ID to clipboard
const copyDevBtn = document.getElementById('btn-copy-device-id');
if (copyDevBtn) {
  copyDevBtn.addEventListener('click', () => {
    const devId = LicenseManager.getDeviceId();
    navigator.clipboard.writeText(devId).then(() => {
      const orig = copyDevBtn.textContent;
      copyDevBtn.textContent = 'Copied!';
      setTimeout(() => { copyDevBtn.textContent = orig; }, 1200);
    });
  });
}

// Activate License button
document.getElementById('popup-activate-btn').addEventListener('click', async () => {
  const input = document.getElementById('popup-lic-key');
  const key = input.value.trim();
  const statusMsg = document.getElementById('status-msg');
  const activateBtn = document.getElementById('popup-activate-btn');

  if (!key) {
    statusMsg.innerHTML = '<span style="color: #dc2626;">Please enter a license key.</span>';
    return;
  }

  activateBtn.disabled = true;
  activateBtn.textContent = 'Checking...';
  statusMsg.innerHTML = '<span style="color: #0284c7;">Verifying with LicenseVault Cloud...</span>';

  try {
    const res = await LicenseManager.validateKeyAsync(key);

    if (res.valid) {
      LicenseManager.saveLicense(res);
      updateLicenseUI();
      statusMsg.innerHTML = '<span style="color: #16a34a;">✔ License Activated Successfully!</span>';
      // Notify active tab to unlock immediately
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'LICENSE_UPDATED' });
        }
      });
    } else {
      statusMsg.innerHTML = `<span style="color: #dc2626;">✖ ${res.message}</span>`;
    }
  } catch (err) {
    statusMsg.innerHTML = `<span style="color: #dc2626;">✖ Verification error: ${err.message}</span>`;
  } finally {
    activateBtn.disabled = false;
    activateBtn.textContent = 'Activate';
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
