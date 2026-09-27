/**
 * Popup Script for HP Gas CDCMS Blocker
 * Integrates with LicenseVault (https://licensescript.netlify.app/)
 * Developed by Mr. Rahul Script
 * English Only Implementation
 */

const ICONS = {
  SHIELD: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
  ALERT: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  LOCK: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  CHECK: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  CLOSE: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  REFRESH: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
};

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
    licStatusText.innerHTML = `${ICONS.SHIELD} Active: ${licStatus.plan || 'PRO'} • ${remainingStr}`;
    licBadgeTag.textContent = 'UNLOCKED';
    licBadgeTag.style.background = 'rgba(16, 185, 129, 0.2)';
    licBadgeTag.style.color = '#065f46';
    actForm.style.display = 'none';
  } else if (licStatus && licStatus.status === 'expired') {
    licBox.className = 'license-badge license-locked';
    licStatusText.innerHTML = `${ICONS.ALERT} Expired on ${licStatus.formattedExpiry}! Please Renew`;
    licBadgeTag.textContent = 'EXPIRED';
    licBadgeTag.style.background = '#dc2626';
    licBadgeTag.style.color = '#ffffff';
    actForm.style.display = 'block';
  } else {
    licBox.className = 'license-badge license-locked';
    licStatusText.innerHTML = `${ICONS.LOCK} License Required to Use`;
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
      statusMsg.innerHTML = `<span style="color: #16a34a; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CHECK} License Activated Successfully!</span>`;
      // Notify all tabs to unlock immediately
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(t => {
          if (t?.id) {
            chrome.tabs.sendMessage(t.id, { action: 'LICENSE_UPDATED' }).catch(() => {});
          }
        });
      });
    } else {
      statusMsg.innerHTML = `<span style="color: #dc2626; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CLOSE} ${res.message}</span>`;
    }
  } catch (err) {
    statusMsg.innerHTML = `<span style="color: #dc2626; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CLOSE} Verification error: ${err.message}</span>`;
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
            chrome.tabs.sendMessage(tab.id, { action: 'OPEN_PANEL' }).catch(() => {});
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

// Check GitHub for new releases / updates
function compareVersions(v1, v2) {
  if (!v1 || !v2) return 0;
  const p1 = String(v1).replace(/^v/i, '').split('.').map(Number);
  const p2 = String(v2).replace(/^v/i, '').split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0;
    const n2 = p2[i] || 0;
    if (n1 > n2) return 1;
    if (n1 < n2) return -1;
  }
  return 0;
}

function downloadUpdateZip() {
  const downloadUrl = 'https://github.com/rahulmaithili/cdcms-cancle-tool/archive/refs/heads/main.zip';
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = 'cdcms-blocker-update.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const bannerUpdateBtn = document.getElementById('popup-banner-update-btn');
if (bannerUpdateBtn) {
  bannerUpdateBtn.addEventListener('click', downloadUpdateZip);
}

async function checkGitHubUpdates() {
  try {
    const currentVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
      ? chrome.runtime.getManifest().version
      : '1.0.0';

    const res = await fetch(`https://raw.githubusercontent.com/rahulmaithili/cdcms-cancle-tool/main/manifest.json?t=${Date.now()}`);
    if (!res.ok) return;
    const data = await res.json();
    const remoteVersion = data.version;

    if (compareVersions(remoteVersion, currentVersion) > 0) {
      const banner = document.getElementById('popup-update-banner');
      const verLabel = document.getElementById('popup-update-version');
      if (banner) {
        banner.style.display = 'flex';
        if (verLabel) verLabel.textContent = `v${remoteVersion}`;
      }
    }
  } catch (e) {
    // Ignore network / offline error
  }
}

async function manualCheckPopupUpdate() {
  const btn = document.getElementById('popup-check-update-btn');
  const msg = document.getElementById('popup-gh-msg');
  const banner = document.getElementById('popup-update-banner');
  const verLabel = document.getElementById('popup-update-version');
  const curVerEl = document.getElementById('popup-cur-ver');

  const currentVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
    ? chrome.runtime.getManifest().version
    : '1.0.0';

  if (curVerEl) curVerEl.textContent = `v${currentVersion}`;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `${ICONS.REFRESH} Checking...`;
  }
  if (msg) {
    msg.textContent = 'Checking for updates...';
    msg.style.color = '#0284c7';
  }

  try {
    const res = await fetch(`https://raw.githubusercontent.com/rahulmaithili/cdcms-cancle-tool/main/manifest.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const remoteVersion = data.version;

    if (compareVersions(remoteVersion, currentVersion) > 0) {
      if (msg) {
        msg.innerHTML = `
          <div style="color: #16a34a; font-weight: 700; margin-bottom: 5px;">
            ${ICONS.CHECK} New Version v${remoteVersion} Available!
          </div>
          <button id="popup-dl-update-btn" style="width: 100%; background: #16a34a; color: white; border: none; padding: 6px; border-radius: 5px; font-weight: 600; font-size: 11px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
            <svg class="cdcms-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Update Package
          </button>
          <div style="font-size: 9.5px; color: #64748b; margin-top: 4px; text-align: center;">
            Or run <b>update.bat</b> in your extension folder
          </div>
        `;
        const dlBtn = document.getElementById('popup-dl-update-btn');
        if (dlBtn) dlBtn.addEventListener('click', downloadUpdateZip);
      }
      if (banner) banner.style.display = 'flex';
      if (verLabel) verLabel.textContent = `v${remoteVersion}`;
    } else {
      if (msg) {
        msg.innerHTML = `<span style="color: #16a34a; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CHECK} You have the latest version (v${currentVersion}) installed!</span>`;
      }
      if (banner) banner.style.display = 'none';
    }
  } catch (err) {
    if (msg) {
      msg.innerHTML = `<span style="color: #dc2626; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CLOSE} Check failed: Check internet connection.</span>`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${ICONS.REFRESH} Check Update`;
    }
  }
}

const checkUpBtn = document.getElementById('popup-check-update-btn');
if (checkUpBtn) {
  checkUpBtn.addEventListener('click', manualCheckPopupUpdate);
}

// Listen to storage sync events
if (typeof window !== 'undefined') {
  window.addEventListener('cdcms_license_synced', () => {
    updateLicenseUI();
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  const currentVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
    ? chrome.runtime.getManifest().version
    : '1.0.0';
  const curVerEl = document.getElementById('popup-cur-ver');
  if (curVerEl) curVerEl.textContent = `v${currentVersion}`;

  if (typeof LicenseManager !== 'undefined' && LicenseManager.ready) {
    await LicenseManager.ready();
  }
  updateLicenseUI();
  checkGitHubUpdates();
});
