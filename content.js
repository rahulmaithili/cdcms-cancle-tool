// HP Gas CDCMS Consumer Auto-Blocker - Content Script
(function() {
  'use strict';

  // Inject script into page to intercept alert/confirm popups
  function injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('Could not inject injected.js, using inline fallback', e);
      const inlineScript = document.createElement('script');
      inlineScript.textContent = `
        window.cdcmasLastAlertMessage = '';
        window.alert = function(msg) {
          window.cdcmasLastAlertMessage = msg || '';
          window.postMessage({ source: 'CDCMS_BLOCKER_INJECTED', type: 'ALERT_TRIGGERED', message: String(msg) }, '*');
          return true;
        };
        window.confirm = function(msg) {
          window.cdcmasLastAlertMessage = msg || '';
          window.postMessage({ source: 'CDCMS_BLOCKER_INJECTED', type: 'CONFIRM_TRIGGERED', message: String(msg) }, '*');
          return true;
        };
      `;
      (document.head || document.documentElement).appendChild(inlineScript);
    }
  }

  injectPageScript();

  // State Management
  let isRunning = false;
  let isPaused = false;
  let shouldStop = false;
  let lastCapturedAlert = '';
  let lastCapturedConfirm = '';
  let logsData = [];

  window.addEventListener('message', function(event) {
    if (event.data && event.data.source === 'CDCMS_BLOCKER_INJECTED') {
      if (event.data.type === 'ALERT_TRIGGERED') {
        lastCapturedAlert = event.data.message || '';
        console.log('[CDCMS Blocker] Real Alert intercepted:', lastCapturedAlert);
      } else if (event.data.type === 'CONFIRM_TRIGGERED') {
        lastCapturedConfirm = event.data.message || '';
        console.log('[CDCMS Blocker] Confirm auto-accepted:', lastCapturedConfirm);
      }
    }
  });

  // DOM Finder Helper Utilities with robust fallbacks
  const DOMFinder = {
    getConsumerNoInput: function() {
      // 1. Common IDs
      const byId = document.querySelector('input[id*="txtConsumerNo" i], input[id*="ConsumerNo" i], input[name*="ConsumerNo" i], input[id*="txtConsumer" i]');
      if (byId) return byId;

      // 2. Search label/text 'Consumer No'
      const allTextNodes = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.toLowerCase().includes('consumer no')) {
          allTextNodes.push(node.parentElement);
        }
      }

      for (const el of allTextNodes) {
        // Look within parent row/container
        const container = el.closest('tr, td, div, p');
        if (container) {
          const input = container.querySelector('input[type="text"], input:not([type])');
          if (input) return input;
          const sibling = container.nextElementSibling;
          if (sibling) {
            const sibInput = sibling.querySelector('input[type="text"], input:not([type])');
            if (sibInput) return sibInput;
          }
        }
      }

      // 3. Fallback: first text input on the page
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      for (const inp of inputs) {
        if (inp.offsetParent !== null && !inp.readOnly && !inp.disabled) return inp;
      }
      return null;
    },

    getFetchButton: function() {
      // 1. By ID / Name
      const byId = document.querySelector('input[id*="btnFetch" i], button[id*="btnFetch" i], [name*="btnFetch" i]');
      if (byId) return byId;

      // 2. By Value or Text
      const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button');
      for (const btn of buttons) {
        const val = (btn.value || btn.innerText || '').trim().toLowerCase();
        if (val === 'fetch') return btn;
      }
      return null;
    },

    getBlockReasonSelect: function() {
      // 1. By ID / Name
      const byId = document.querySelector('select[id*="BlockReason" i], select[name*="BlockReason" i], select[id*="ddlReason" i], select[id*="Reason" i]');
      if (byId) return byId;

      // 2. Select containing NonKYC or Block
      const selects = document.querySelectorAll('select');
      for (const sel of selects) {
        for (const opt of sel.options) {
          if (opt.text.toLowerCase().includes('nonkyc') || opt.text.toLowerCase().includes('block')) {
            return sel;
          }
        }
      }

      // 3. Near label 'Block Reason'
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.toLowerCase().includes('block reason')) {
          const container = node.parentElement.closest('tr, td, div');
          if (container) {
            const sel = container.querySelector('select') || (container.nextElementSibling && container.nextElementSibling.querySelector('select'));
            if (sel) return sel;
          }
        }
      }
      return selects.length > 0 ? selects[0] : null;
    },

    getRemarksInput: function() {
      // 1. By ID / Name
      const byId = document.querySelector('input[id*="txtRemarks" i], input[name*="txtRemarks" i], input[id*="Remarks" i], textarea[id*="Remarks" i]');
      if (byId) return byId;

      // 2. Near label 'Remarks'
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.toLowerCase().includes('remarks')) {
          const container = node.parentElement.closest('tr, td, div');
          if (container) {
            const inp = container.querySelector('input[type="text"], textarea') || 
                        (container.nextElementSibling && container.nextElementSibling.querySelector('input[type="text"], textarea'));
            if (inp) return inp;
          }
        }
      }
      return null;
    },

    getBlockButton: function() {
      // 1. By ID / Name
      const byId = document.querySelector('input[id*="btnBlock" i], button[id*="btnBlock" i], [name*="btnBlock" i]');
      if (byId) return byId;

      // 2. By Value or Text
      const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button');
      for (const btn of buttons) {
        const val = (btn.value || btn.innerText || '').trim().toLowerCase();
        if (val === 'block') return btn;
      }
      return null;
    },

    getClearButton: function() {
      const byId = document.querySelector('input[id*="btnClear" i], button[id*="btnClear" i], [name*="btnClear" i]');
      if (byId) return byId;

      const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button');
      for (const btn of buttons) {
        const val = (btn.value || btn.innerText || '').trim().toLowerCase();
        if (val === 'clear') return btn;
      }
      return null;
    },

    getMessageLabel: function() {
      const el = document.querySelector('[id*="lblMsg" i], [id*="lblMessage" i], [id*="lblError" i], [id*="lblSuccess" i], .alert-danger, .alert-success');
      if (el && el.innerText.trim()) return el.innerText.trim();
      return null;
    }
  };

  // Helper sleep
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Check if current page is specifically the Block Consumer screen (CM-16)
  function isBlockConsumerPage() {
    const url = window.location.href.toLowerCase();
    // Match only the exact BlockConsumer page or offline simulator
    if (url.includes('blockconsumer.aspx') || url.includes('test_cdcms_page')) {
      return true;
    }
    // Strict screen code check for CM-16
    const pageText = (document.body ? document.body.innerText : '');
    if (pageText.includes('ScreenCode(CM-16)') || pageText.includes('ScreenCode (CM-16)')) {
      return true;
    }
    return false;
  }

  // Build Floating UI Panel
  function createUI(forceOpen = false) {
    // Only open on Block Consumer screen unless explicitly requested by user
    if (!forceOpen && !isBlockConsumerPage()) {
      const existing = document.getElementById('cdcms-blocker-root');
      if (existing) existing.style.display = 'none';
      return;
    }

    // Check if user previously closed it in this session
    const isClosed = sessionStorage.getItem('cdcms_blocker_closed') === 'true';
    if (isClosed && !forceOpen) {
      const existing = document.getElementById('cdcms-blocker-root');
      if (existing) existing.style.display = 'none';
      return;
    }

    if (document.getElementById('cdcms-blocker-root')) {
      const existing = document.getElementById('cdcms-blocker-root');
      existing.style.display = 'block';
      if (forceOpen) {
        sessionStorage.removeItem('cdcms_blocker_closed');
        const p = document.getElementById('cdcms-panel');
        const l = document.getElementById('cdcms-launcher-btn');
        if (p) p.style.display = 'flex';
        if (l) l.style.display = 'none';
        localStorage.setItem('cdcms_blocker_minimized', 'false');
      }
      return;
    }

    const isMinimized = localStorage.getItem('cdcms_blocker_minimized') === 'true';
    const panelStyle = (isMinimized && !forceOpen) ? 'none' : 'flex';
    const launcherStyle = (isMinimized && !forceOpen) ? 'flex' : 'none';

    const logoIconUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL('icons/icon48.png') : '';
    const logoBigUrl = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL('icons/icon128.png') : '';

    const root = document.createElement('div');
    root.id = 'cdcms-blocker-root';

    root.innerHTML = `
      <div id="cdcms-launcher-btn" style="display: ${launcherStyle}; cursor: pointer;" title="Click to open HP Gas CDCMS Auto-Blocker">
        ${logoIconUrl ? `<img src="${logoIconUrl}" class="cdcms-launcher-logo" alt="RS" />` : ''}
        <span id="cdcms-launcher-label">⚡ CDCMS Auto-Blocker</span>
        <span id="cdcms-launcher-close" title="Close completely (Hide from screen)" style="margin-left: 8px; font-size: 13px; font-weight: bold; opacity: 0.8; padding: 1px 6px; border-radius: 50%; background: rgba(0,0,0,0.25);">✕</span>
      </div>

      <div id="cdcms-panel" style="display: ${panelStyle};">
        <div class="cdcms-panel-header" id="cdcms-panel-drag">
          <div class="cdcms-header-title">
            ${logoIconUrl ? `<img src="${logoIconUrl}" class="cdcms-logo-icon" alt="RS" />` : ''}
            <span>⚡ HP Gas CDCMS Blocker</span>
            <span class="cdcms-badge">CM-16</span>
          </div>
          <div class="cdcms-header-actions">
            <button class="cdcms-btn-icon" id="cdcms-min-btn" title="Minimize to small badge">─</button>
            <button class="cdcms-btn-icon" id="cdcms-close-btn" title="Close completely (Hide from page)" style="font-weight: bold; font-size: 14px; margin-left: 4px; color: #f87171;">✕</button>
          </div>
        </div>

        <div class="cdcms-panel-body">
          <!-- License Status Strip -->
          <div id="cdcms-license-strip" class="cdcms-license-strip" style="display: none;">
            <span id="cdcms-strip-text">🛡️ License: Checking...</span>
            <button id="cdcms-deactivate-btn" class="cdcms-lic-btn-change">Change Key</button>
          </div>

          <!-- Lock Screen (When License Inactive) -->
          <div id="cdcms-lock-screen" class="cdcms-lock-screen">
            ${logoBigUrl ? `<img src="${logoBigUrl}" class="cdcms-lock-logo" alt="RS Logo">` : ''}
            <div class="cdcms-lock-title">License Activation Required</div>
            <div class="cdcms-lock-subtitle">Please enter your LicenseVault key to unlock bulk blocking for this agency.</div>
            
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 10px; margin-bottom: 12px; width: 100%; box-sizing: border-box; font-size: 11px;">
              <span style="color: #94a3b8;">Device ID:</span>
              <code id="cdcms-lock-device-id" style="color: #38bdf8; font-family: monospace; font-weight: 700;">LV-...</code>
              <button id="cdcms-copy-device-btn" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #cbd5e1; border-radius: 4px; padding: 2px 8px; font-size: 10px; cursor: pointer;">Copy</button>
            </div>

            <div class="cdcms-lock-input-wrap">
              <input type="text" id="cdcms-license-input" class="cdcms-lock-input" placeholder="Paste License Key" />
              <button id="cdcms-license-submit" class="cdcms-lock-btn">🔑 Activate</button>
            </div>
            <div id="cdcms-license-msg" class="cdcms-lock-status"></div>

            <div style="display: flex; gap: 8px; width: 100%; margin-top: 10px;">
              <a href="https://licensescript.netlify.app/#pricing-section" target="_blank" class="cdcms-lock-wa-btn" style="flex: 1; text-align: center; text-decoration: none; justify-content: center; background: rgba(2, 132, 199, 0.2); border: 1px solid #0284c7; color: #38bdf8; font-size: 11px;">
                <span>⚡</span> Get on LicenseVault
              </a>
              <a href="https://licensescript.netlify.app/#validate-section" target="_blank" class="cdcms-lock-wa-btn" style="flex: 1; text-align: center; text-decoration: none; justify-content: center; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255,255,255,0.2); color: #e2e8f0; font-size: 11px;">
                <span>🔍</span> Verify on Web
              </a>
            </div>

            <a href="https://wa.me/917564948617?text=Hello%20Mr.%20Rahul%20Script,%20I%20need%20a%20License%20Key%20for%20HP%20Gas%20CDCMS%20Blocker" target="_blank" class="cdcms-lock-wa-btn" style="margin-top: 8px; width: 100%; box-sizing: border-box; justify-content: center;">
              <span>💬</span> WhatsApp Support (+917564948617)
            </a>
          </div>

          <!-- Main Automation Form (Unlocked on Active License) -->
          <div id="cdcms-main-form" style="display: none; flex-direction: column; gap: 12px;">
            <div class="cdcms-form-group">
              <div class="cdcms-label">
                <span>Consumer Numbers (Paste List)</span>
                <span id="cdcms-total-count" style="color: #0284c7;">0 numbers</span>
              </div>
              <textarea id="cdcms-consumer-list" class="cdcms-textarea" placeholder="Paste Consumer Numbers here (one per line, comma or space separated)&#10;825558&#10;825559&#10;825560..."></textarea>
            </div>

            <div class="cdcms-row-2">
              <div class="cdcms-form-group">
                <label class="cdcms-label">Block Reason</label>
                <select id="cdcms-block-reason" class="cdcms-select">
                  <option value="auto">Auto-detect from page</option>
                </select>
              </div>
              <div class="cdcms-form-group">
                <label class="cdcms-label">Remarks</label>
                <input type="text" id="cdcms-remarks" class="cdcms-input" value="ekyc pending" placeholder="e.g. ekyc pending" />
              </div>
            </div>

            <div class="cdcms-row-2">
              <div class="cdcms-form-group">
                <label class="cdcms-label">Delay (Seconds)</label>
                <select id="cdcms-delay" class="cdcms-select">
                  <option value="1500">1.5 sec (Fast)</option>
                  <option value="2500" selected>2.5 sec (Balanced)</option>
                  <option value="3500">3.5 sec (Safe)</option>
                  <option value="5000">5.0 sec (Slow/Heavy Server)</option>
                </select>
              </div>
              <div class="cdcms-form-group">
                <label class="cdcms-label">Status</label>
                <div id="cdcms-status-indicator" style="font-weight: 600; font-size: 11px; padding: 7px 0; color: #64748b;">Ready</div>
              </div>
            </div>

            <div class="cdcms-actions">
              <button id="cdcms-start-btn" class="cdcms-btn cdcms-btn-primary">
                <span>▶</span> Start Blocking
              </button>
              <button id="cdcms-pause-btn" class="cdcms-btn cdcms-btn-warning" disabled>
                <span>⏸</span> Pause
              </button>
              <button id="cdcms-stop-btn" class="cdcms-btn cdcms-btn-danger" disabled>
                <span>⏹</span> Stop
              </button>
            </div>

            <div class="cdcms-stats-grid">
              <div class="cdcms-stat-item">
                <span class="cdcms-stat-val" id="cdcms-stat-total">0</span>
                <span class="cdcms-stat-lbl">Total</span>
              </div>
              <div class="cdcms-stat-item">
                <span class="cdcms-stat-val success" id="cdcms-stat-success">0</span>
                <span class="cdcms-stat-lbl">Blocked</span>
              </div>
              <div class="cdcms-stat-item">
                <span class="cdcms-stat-val failed" id="cdcms-stat-failed">0</span>
                <span class="cdcms-stat-lbl">Failed</span>
              </div>
              <div class="cdcms-stat-item">
                <span class="cdcms-stat-val rem" id="cdcms-stat-rem">0</span>
                <span class="cdcms-stat-lbl">Remaining</span>
              </div>
            </div>

            <div class="cdcms-progress-bar-bg">
              <div id="cdcms-progress-bar" class="cdcms-progress-bar-fill"></div>
            </div>

            <div class="cdcms-form-group">
              <div class="cdcms-label">
                <span>Activity Log</span>
                <span id="cdcms-clear-log" style="cursor: pointer; color: #94a3b8; font-size: 11px;">Clear Log</span>
              </div>
              <div id="cdcms-log-box" class="cdcms-log-box">
                <div class="cdcms-log-item info">
                  <span class="cdcms-log-time">[System]</span>
                  <span>Ready. Paste consumer numbers and click 'Start Blocking'.</span>
                </div>
              </div>
            </div>

            <div class="cdcms-footer">
              <button id="cdcms-download-report" class="cdcms-btn cdcms-btn-secondary">
                <span>📥</span> Download Report (CSV)
              </button>
              <button id="cdcms-copy-failed" class="cdcms-btn cdcms-btn-secondary">
                <span>📋</span> Copy Failed List
              </button>
            </div>
          </div>

          <!-- Developer Branding & Support Section -->
          <div class="cdcms-dev-brand">
            <div class="cdcms-dev-badge">
              <span>👤</span> Developed by <strong>Mr. Rahul Script</strong>
            </div>
            <div class="cdcms-dev-subtext">
              Official Copyright & Technical Support • Business Automation Solutions
            </div>
            <div class="cdcms-contact-row">
              <a href="https://wa.me/917564948617" target="_blank" class="cdcms-contact-pill cdcms-contact-whatsapp">
                <span>💬</span> WhatsApp: +917564948617
              </a>
              <a href="mailto:life.rahulg@gmail.com" class="cdcms-contact-pill cdcms-contact-email">
                <span>✉</span> Email: life.rahulg@gmail.com
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    // Setup Event Listeners
    setupUIListeners();
    syncPageReasonOptions();
  }

  const JOB_KEY = 'cdcms_blocker_active_job';

  function getSavedJob() {
    try {
      const data = localStorage.getItem(JOB_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  function saveJob(job) {
    try {
      if (!job) {
        localStorage.removeItem(JOB_KEY);
      } else {
        localStorage.setItem(JOB_KEY, JSON.stringify(job));
      }
    } catch (e) {}
  }

  function restoreLogsFromStorage() {
    const saved = localStorage.getItem('cdcms_blocker_logs');
    if (!saved) return;
    try {
      logsData = JSON.parse(saved) || [];
      const logBox = document.getElementById('cdcms-log-box');
      if (logBox && logsData.length > 0) {
        logBox.innerHTML = '';
        let successCount = 0;
        let failedCount = 0;
        logsData.forEach(item => {
          const isSuccess = item.status === 'SUCCESS';
          if (isSuccess) successCount++;
          else if (item.status === 'FAILED' || item.status === 'ERROR') failedCount++;

          const div = document.createElement('div');
          div.className = `cdcms-log-item ${isSuccess ? 'success' : 'error'}`;
          div.innerHTML = `
            <span class="cdcms-log-time">[${item.time ? (item.time.split(',')[1] || item.time).trim() : ''}]</span>
            <span><strong>${item.consumerNo || ''}:</strong> ${item.message}</span>
          `;
          logBox.appendChild(div);
        });
        logBox.scrollTop = logBox.scrollHeight;
        document.getElementById('cdcms-stat-success').textContent = successCount;
        document.getElementById('cdcms-stat-failed').textContent = failedCount;
      }
    } catch (e) {
      console.warn('Error parsing logs:', e);
    }
  }

  function setupUIListeners() {
    const launcher = document.getElementById('cdcms-launcher-btn');
    const panel = document.getElementById('cdcms-panel');
    const minBtn = document.getElementById('cdcms-min-btn');
    const textarea = document.getElementById('cdcms-consumer-list');
    const totalCount = document.getElementById('cdcms-total-count');
    const startBtn = document.getElementById('cdcms-start-btn');
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const stopBtn = document.getElementById('cdcms-stop-btn');
    const clearLogBtn = document.getElementById('cdcms-clear-log');
    const downloadBtn = document.getElementById('cdcms-download-report');
    const copyFailedBtn = document.getElementById('cdcms-copy-failed');

    // Restore saved consumer list text so it NEVER disappears on refresh
    const savedText = localStorage.getItem('cdcms_consumer_raw_text');
    if (savedText) {
      textarea.value = savedText;
      const numbers = parseConsumerList(savedText);
      totalCount.textContent = `${numbers.length} numbers`;
      document.getElementById('cdcms-stat-total').textContent = numbers.length;
      document.getElementById('cdcms-stat-rem').textContent = numbers.length;
    }

    // Save on every input
    textarea.addEventListener('input', () => {
      localStorage.setItem('cdcms_consumer_raw_text', textarea.value);
      const numbers = parseConsumerList(textarea.value);
      totalCount.textContent = `${numbers.length} numbers`;
      document.getElementById('cdcms-stat-total').textContent = numbers.length;
      document.getElementById('cdcms-stat-rem').textContent = numbers.length;
    });

    // Restore saved logs so logs NEVER disappear on refresh
    restoreLogsFromStorage();

    const closeBtn = document.getElementById('cdcms-close-btn');
    const launcherClose = document.getElementById('cdcms-launcher-close');
    const launcherLabel = document.getElementById('cdcms-launcher-label');

    function closeToolCompletely() {
      const root = document.getElementById('cdcms-blocker-root');
      if (root) root.style.display = 'none';
      sessionStorage.setItem('cdcms_blocker_closed', 'true');
    }

    if (closeBtn) closeBtn.addEventListener('click', closeToolCompletely);

    if (launcherClose) {
      launcherClose.addEventListener('click', (e) => {
        e.stopPropagation();
        closeToolCompletely();
      });
    }

    // Toggle Open/Close
    launcher.addEventListener('click', () => {
      launcher.style.display = 'none';
      panel.style.display = 'flex';
      localStorage.setItem('cdcms_blocker_minimized', 'false');
      sessionStorage.removeItem('cdcms_blocker_closed');
      syncPageReasonOptions();
    });

    minBtn.addEventListener('click', () => {
      panel.style.display = 'none';
      launcher.style.display = 'flex';
      localStorage.setItem('cdcms_blocker_minimized', 'true');
    });

    // Clear logs
    clearLogBtn.addEventListener('click', () => {
      document.getElementById('cdcms-log-box').innerHTML = '';
      logsData = [];
      localStorage.removeItem('cdcms_blocker_logs');
      saveJob(null);
      const numbers = parseConsumerList(textarea.value);
      updateCounters(numbers.length, 0, 0, numbers.length);
    });

    // Start / Pause / Stop
    startBtn.addEventListener('click', startAutomation);
    pauseBtn.addEventListener('click', togglePause);
    stopBtn.addEventListener('click', stopAutomation);

    // Download CSV
    downloadBtn.addEventListener('click', downloadCSVReport);

    // Copy Failed
    copyFailedBtn.addEventListener('click', copyFailedNumbers);


    // Update license display state
    function updateLicenseStateUI() {
      const lockScreen = document.getElementById('cdcms-lock-screen');
      const mainForm = document.getElementById('cdcms-main-form');
      const strip = document.getElementById('cdcms-license-strip');
      const stripText = document.getElementById('cdcms-strip-text');
      const deviceIdEl = document.getElementById('cdcms-lock-device-id');

      if (deviceIdEl && typeof LicenseManager !== 'undefined') {
        deviceIdEl.textContent = LicenseManager.getDeviceId();
      }

      const lic = typeof LicenseManager !== 'undefined' ? LicenseManager.getStoredLicense() : null;
      if (lic && lic.valid) {
        if (lockScreen) lockScreen.style.display = 'none';
        if (mainForm) mainForm.style.display = 'flex';
        if (strip) strip.style.display = 'flex';
        const agencyName = lic.company ? ` • ${lic.company}` : '';
        if (stripText) stripText.innerHTML = `🛡️ License Active: <strong>${lic.plan || 'PRO'}</strong> (${lic.expiry || 'Active'})${agencyName}`;
      } else {
        if (lockScreen) lockScreen.style.display = 'flex';
        if (mainForm) mainForm.style.display = 'none';
        if (strip) strip.style.display = 'none';
      }
    }

    updateLicenseStateUI();

    // Copy Device ID button in lock screen
    const copyDevBtn = document.getElementById('cdcms-copy-device-btn');
    if (copyDevBtn) {
      copyDevBtn.addEventListener('click', () => {
        const devId = typeof LicenseManager !== 'undefined' ? LicenseManager.getDeviceId() : '';
        navigator.clipboard.writeText(devId).then(() => {
          const orig = copyDevBtn.textContent;
          copyDevBtn.textContent = 'Copied!';
          setTimeout(() => { copyDevBtn.textContent = orig; }, 1200);
        });
      });
    }

    // License Activation Form Handlers
    const licSubmit = document.getElementById('cdcms-license-submit');
    const licInput = document.getElementById('cdcms-license-input');
    const licMsg = document.getElementById('cdcms-license-msg');
    const deactBtn = document.getElementById('cdcms-deactivate-btn');

    if (licSubmit && licInput) {
      licSubmit.addEventListener('click', async () => {
        const key = licInput.value.trim();
        if (!key) {
          if (licMsg) licMsg.innerHTML = '<span style="color: #f87171;">Please enter a license key.</span>';
          return;
        }
        if (typeof LicenseManager === 'undefined') {
          if (licMsg) licMsg.innerHTML = '<span style="color: #f87171;">License module not loaded.</span>';
          return;
        }

        licSubmit.disabled = true;
        licSubmit.textContent = 'Checking...';
        if (licMsg) licMsg.innerHTML = '<span style="color: #38bdf8;">Verifying with LicenseVault Cloud...</span>';

        try {
          const res = await LicenseManager.validateKeyAsync(key);
          if (res.valid) {
            LicenseManager.saveLicense(res);
            if (licMsg) licMsg.innerHTML = '<span style="color: #4ade80;">✔ License Activated Successfully!</span>';
            setTimeout(() => {
              updateLicenseStateUI();
            }, 500);
          } else {
            if (licMsg) licMsg.innerHTML = `<span style="color: #f87171;">✖ ${res.message}</span>`;
          }
        } catch (err) {
          if (licMsg) licMsg.innerHTML = `<span style="color: #f87171;">✖ Verification error: ${err.message}</span>`;
        } finally {
          licSubmit.disabled = false;
          licSubmit.textContent = '🔑 Activate';
        }
      });
    }

    if (deactBtn) {
      deactBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to change or deactivate the license on this browser?')) {
          if (typeof LicenseManager !== 'undefined') {
            LicenseManager.removeLicense();
          }
          updateLicenseStateUI();
        }
      });
    }

    // Draggable header
    makeDraggable(document.getElementById('cdcms-panel-drag'), document.getElementById('cdcms-blocker-root'));

    // Check if there was an ongoing job that needs to resume after page reload!
    setTimeout(() => {
      checkAndResumeJob();
    }, 600);
  }

  // Parse consumer list from textarea
  function parseConsumerList(text) {
    if (!text) return [];
    const items = text.split(/[\n,;\t\s]+/)
      .map(item => item.trim())
      .filter(item => item.length > 0 && /^\d+$/.test(item));
    // Remove duplicates while keeping order
    return [...new Set(items)];
  }

  // Sync reason options from the page
  function syncPageReasonOptions() {
    const pageSelect = DOMFinder.getBlockReasonSelect();
    const blockerSelect = document.getElementById('cdcms-block-reason');
    if (!pageSelect || !blockerSelect) return;

    // Check if options are already populated
    if (pageSelect.options && pageSelect.options.length > 1) {
      blockerSelect.innerHTML = '';
      let defaultSelected = false;
      for (const opt of pageSelect.options) {
        if (!opt.value && !opt.text.trim()) continue;
        const newOpt = document.createElement('option');
        newOpt.value = opt.value || opt.text;
        newOpt.textContent = opt.text;
        if (opt.text.toLowerCase().includes('nonkyc') || opt.selected) {
          newOpt.selected = true;
          defaultSelected = true;
        }
        blockerSelect.appendChild(newOpt);
      }
    }
  }

  // Add Log Entry to UI
  function addLog(consumerNo, status, message, type = 'info') {
    const logBox = document.getElementById('cdcms-log-box');
    const time = new Date().toLocaleTimeString();

    const item = document.createElement('div');
    item.className = `cdcms-log-item ${type}`;
    item.innerHTML = `
      <span class="cdcms-log-time">[${time}]</span>
      <span><strong>${consumerNo || ''}:</strong> ${message}</span>
    `;
    if (logBox) {
      logBox.appendChild(item);
      logBox.scrollTop = logBox.scrollHeight;
    }

    if (consumerNo) {
      logsData.push({
        consumerNo,
        status,
        message,
        time: new Date().toLocaleString()
      });
      try {
        localStorage.setItem('cdcms_blocker_logs', JSON.stringify(logsData));
      } catch (e) {}
    }
  }

  // Update Status and Counters
  function updateCounters(total, success, failed, remaining) {
    const elTot = document.getElementById('cdcms-stat-total');
    const elSuc = document.getElementById('cdcms-stat-success');
    const elFai = document.getElementById('cdcms-stat-failed');
    const elRem = document.getElementById('cdcms-stat-rem');
    const elBar = document.getElementById('cdcms-progress-bar');

    if (elTot) elTot.textContent = total;
    if (elSuc) elSuc.textContent = success;
    if (elFai) elFai.textContent = failed;
    if (elRem) elRem.textContent = remaining;

    const progress = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0;
    if (elBar) elBar.style.width = `${progress}%`;
  }

  // Trigger input change event
  function triggerChangeEvent(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Start Automation
  function startAutomation() {
    // Strict License Verification Guard
    const currentLic = typeof LicenseManager !== 'undefined' ? LicenseManager.getStoredLicense() : null;
    if (!currentLic || !currentLic.valid) {
      alert('🔒 Access Denied: Please activate a valid License Key to start bulk blocking.');
      const lockScreen = document.getElementById('cdcms-lock-screen');
      const mainForm = document.getElementById('cdcms-main-form');
      if (lockScreen) lockScreen.style.display = 'flex';
      if (mainForm) mainForm.style.display = 'none';
      return;
    }

    const textarea = document.getElementById('cdcms-consumer-list');
    const consumerList = parseConsumerList(textarea.value);

    if (consumerList.length === 0) {
      alert('Please paste at least one valid numeric Consumer Number in the box.');
      return;
    }

    // Save text so it never disappears
    localStorage.setItem('cdcms_consumer_raw_text', textarea.value);

    const delayMs = parseInt(document.getElementById('cdcms-delay').value, 10) || 2500;
    const selectedReasonText = document.getElementById('cdcms-block-reason').selectedOptions[0]?.text || '';
    const selectedReasonVal = document.getElementById('cdcms-block-reason').value || '';
    const remarksValue = document.getElementById('cdcms-remarks').value.trim() || 'ekyc pending';

    const job = {
      isRunning: true,
      isPaused: false,
      consumerList: consumerList,
      currentIndex: 0,
      total: consumerList.length,
      successCount: 0,
      failedCount: 0,
      selectedReasonVal,
      selectedReasonText,
      remarksValue,
      delayMs,
      stage: 'IDLE',
      currentConsumer: ''
    };
    saveJob(job);

    const startBtn = document.getElementById('cdcms-start-btn');
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const stopBtn = document.getElementById('cdcms-stop-btn');
    const statusIndicator = document.getElementById('cdcms-status-indicator');

    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = false;
    if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #16a34a;">● Running...</span>';

    updateCounters(job.total, 0, 0, job.total);
    addLog('', 'INFO', `Started bulk block for ${job.total} consumers.`, 'info');

    runNextInJob();
  }

  // Check and resume active job after page reload
  async function checkAndResumeJob() {
    const job = getSavedJob();
    if (!job || !job.isRunning) return;

    // Strict License Verification Guard
    const currentLic = typeof LicenseManager !== 'undefined' ? LicenseManager.getStoredLicense() : null;
    if (!currentLic || !currentLic.valid) {
      console.warn('[CDCMS Blocker] Cannot resume job: License invalid or expired.');
      job.isRunning = false;
      saveJob(job);
      return;
    }

    console.log('[CDCMS Blocker] Resuming active job from storage:', job);

    const startBtn = document.getElementById('cdcms-start-btn');
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const stopBtn = document.getElementById('cdcms-stop-btn');
    const statusIndicator = document.getElementById('cdcms-status-indicator');

    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = false;

    updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));

    await sleep(800);

    if (job.stage === 'FETCHING') {
      const consumerNo = job.currentConsumer;
      let alertMsg = lastCapturedAlert || DOMFinder.getMessageLabel();

      if (alertMsg) {
        lastCapturedAlert = '';
        job.failedCount++;
        addLog(consumerNo, 'FAILED', alertMsg, 'error');
        job.currentIndex++;
        job.stage = 'IDLE';
        saveJob(job);
        updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));

        const clearBtn = DOMFinder.getClearButton();
        if (clearBtn) clearBtn.click();
        await sleep(job.delayMs || 2500);
        runNextInJob();
        return;
      }

      const reasonSelect = DOMFinder.getBlockReasonSelect();
      const blockBtn = DOMFinder.getBlockButton();
      if (blockBtn && !blockBtn.disabled && reasonSelect && reasonSelect.options.length > 1) {
        await executeBlockStep(job);
        return;
      } else {
        job.failedCount++;
        addLog(consumerNo, 'FAILED', 'Details not loaded after fetch', 'error');
        job.currentIndex++;
        job.stage = 'IDLE';
        saveJob(job);
        updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
        const clearBtn = DOMFinder.getClearButton();
        if (clearBtn) clearBtn.click();
        await sleep(job.delayMs || 2500);
        runNextInJob();
        return;
      }
    } else if (job.stage === 'BLOCKING') {
      const consumerNo = job.currentConsumer;
      let alertMsg = lastCapturedAlert || DOMFinder.getMessageLabel();
      lastCapturedAlert = '';

      const lower = (alertMsg || '').toLowerCase();
      const hasSuccess = lower.includes('success') || lower.includes('has been blocked') || lower.includes('blocked successfully');
      const hasFailure = lower.includes('error') || lower.includes('failed') || lower.includes('pending') || 
                         lower.includes('already') || lower.includes('cannot') || lower.includes('not exist') || lower.includes('invalid');
      const isSuccess = (hasSuccess && !hasFailure) || (!alertMsg);

      if (isSuccess) {
        job.successCount++;
        addLog(consumerNo, 'SUCCESS', alertMsg || 'Blocked successfully', 'success');
      } else {
        job.failedCount++;
        addLog(consumerNo, 'FAILED', alertMsg || 'Block failed', 'error');
      }

      job.currentIndex++;
      job.stage = 'IDLE';
      saveJob(job);
      updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));

      const clearBtn = DOMFinder.getClearButton();
      if (clearBtn) clearBtn.click();
      await sleep(job.delayMs || 2500);
      runNextInJob();
      return;
    } else {
      runNextInJob();
    }
  }

  // Run next consumer in active job
  async function runNextInJob() {
    const job = getSavedJob();
    if (!job || !job.isRunning) return;

    const statusIndicator = document.getElementById('cdcms-status-indicator');

    if (job.isPaused) {
      if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #f59e0b;">⏸ Paused</span>';
      return;
    }

    if (job.currentIndex >= job.consumerList.length) {
      job.isRunning = false;
      saveJob(job);
      const startBtn = document.getElementById('cdcms-start-btn');
      const pauseBtn = document.getElementById('cdcms-pause-btn');
      const stopBtn = document.getElementById('cdcms-stop-btn');
      if (startBtn) startBtn.disabled = false;
      if (pauseBtn) pauseBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = true;
      if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #0284c7;">✔ Completed</span>';
      addLog('', 'INFO', `Finished! Total: ${job.total}, Blocked: ${job.successCount}, Failed: ${job.failedCount}`, 'info');
      return;
    }

    const consumerNo = job.consumerList[job.currentIndex];
    job.currentConsumer = consumerNo;
    saveJob(job);

    if (statusIndicator) {
      statusIndicator.innerHTML = `<span style="color: #16a34a;">● Processing (${job.currentIndex + 1}/${job.total}): ${consumerNo}</span>`;
    }

    lastCapturedAlert = '';
    lastCapturedConfirm = '';

    // Step 1: Input consumer number
    const consumerInput = DOMFinder.getConsumerNoInput();
    if (!consumerInput) {
      job.failedCount++;
      addLog(consumerNo, 'FAILED', 'Consumer No input not found on page', 'error');
      job.currentIndex++;
      saveJob(job);
      updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
      await sleep(job.delayMs || 2500);
      runNextInJob();
      return;
    }

    consumerInput.focus();
    consumerInput.value = consumerNo;
    triggerChangeEvent(consumerInput);
    await sleep(300);

    // Step 2: Set stage to FETCHING and save state before clicking Fetch
    job.stage = 'FETCHING';
    saveJob(job);

    const fetchBtn = DOMFinder.getFetchButton();
    if (!fetchBtn) {
      job.failedCount++;
      addLog(consumerNo, 'FAILED', 'Fetch button not found on page', 'error');
      job.currentIndex++;
      job.stage = 'IDLE';
      saveJob(job);
      updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
      await sleep(job.delayMs || 2500);
      runNextInJob();
      return;
    }

    fetchBtn.click();

    // If Fetch is AJAX (no reload), poll for result
    let waitIntervals = 0;
    while (waitIntervals < 14) {
      await sleep(250);
      waitIntervals++;

      const freshJob = getSavedJob();
      if (!freshJob || !freshJob.isRunning) return; // stopped

      let alertMsg = lastCapturedAlert || DOMFinder.getMessageLabel();
      if (alertMsg) {
        lastCapturedAlert = '';
        job.failedCount++;
        addLog(consumerNo, 'FAILED', alertMsg, 'error');
        job.currentIndex++;
        job.stage = 'IDLE';
        saveJob(job);
        updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));

        const clearBtn = DOMFinder.getClearButton();
        if (clearBtn) clearBtn.click();
        await sleep(job.delayMs || 2500);
        runNextInJob();
        return;
      }

      const reasonSelect = DOMFinder.getBlockReasonSelect();
      const blockBtn = DOMFinder.getBlockButton();
      if (blockBtn && !blockBtn.disabled && reasonSelect && reasonSelect.options.length > 1) {
        await executeBlockStep(job);
        return;
      }
    }
  }

  // Execute Block Step (Select reason, remarks, click block)
  async function executeBlockStep(job) {
    const consumerNo = job.currentConsumer;
    await sleep(400);

    // Step 4: Select Block Reason
    const reasonSelect = DOMFinder.getBlockReasonSelect();
    if (reasonSelect && reasonSelect.options.length > 0) {
      let matched = false;
      for (let j = 0; j < reasonSelect.options.length; j++) {
        const opt = reasonSelect.options[j];
        if (job.selectedReasonVal && opt.value === job.selectedReasonVal && opt.value !== 'auto') {
          reasonSelect.selectedIndex = j;
          matched = true;
          break;
        }
        if (job.selectedReasonText && opt.text.trim().toLowerCase().includes(job.selectedReasonText.trim().toLowerCase())) {
          reasonSelect.selectedIndex = j;
          matched = true;
          break;
        }
      }

      if (!matched) {
        for (let j = 0; j < reasonSelect.options.length; j++) {
          if (reasonSelect.options[j].text.toLowerCase().includes('nonkyc')) {
            reasonSelect.selectedIndex = j;
            matched = true;
            break;
          }
        }
      }

      triggerChangeEvent(reasonSelect);
      await sleep(300);
    }

    // Step 5: Fill Remarks
    const remarksInput = DOMFinder.getRemarksInput();
    if (remarksInput) {
      remarksInput.value = job.remarksValue || 'ekyc pending';
      triggerChangeEvent(remarksInput);
      await sleep(300);
    }

    // Step 6: Click Block
    job.stage = 'BLOCKING';
    saveJob(job);

    const blockBtn = DOMFinder.getBlockButton();
    if (!blockBtn) {
      job.failedCount++;
      addLog(consumerNo, 'FAILED', 'Block button not found', 'error');
      job.currentIndex++;
      job.stage = 'IDLE';
      saveJob(job);
      updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
      await sleep(job.delayMs || 2500);
      runNextInJob();
      return;
    }

    lastCapturedAlert = '';
    lastCapturedConfirm = '';
    blockBtn.click();

    // If Block is AJAX (no reload):
    let waitBlock = 0;
    while (waitBlock < 16) {
      await sleep(250);
      waitBlock++;

      const freshJob = getSavedJob();
      if (!freshJob || !freshJob.isRunning) return; // stopped

      let alertMsg = lastCapturedAlert || DOMFinder.getMessageLabel();
      if (alertMsg) {
        lastCapturedAlert = '';
        const lower = alertMsg.toLowerCase();
        const hasSuccess = lower.includes('success') || lower.includes('has been blocked') || lower.includes('blocked successfully');
        const hasFailure = lower.includes('error') || lower.includes('failed') || lower.includes('pending') || 
                           lower.includes('already') || lower.includes('cannot') || lower.includes('not exist') || lower.includes('invalid');
        const isSuccess = hasSuccess && !hasFailure;

        if (isSuccess) {
          job.successCount++;
          addLog(consumerNo, 'SUCCESS', alertMsg, 'success');
        } else {
          job.failedCount++;
          addLog(consumerNo, 'FAILED', alertMsg, 'error');
        }

        job.currentIndex++;
        job.stage = 'IDLE';
        saveJob(job);
        updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));

        const clearBtn = DOMFinder.getClearButton();
        if (clearBtn) clearBtn.click();
        await sleep(job.delayMs || 2500);
        runNextInJob();
        return;
      }
    }

    // Timed out with no alert
    job.successCount++;
    addLog(consumerNo, 'SUCCESS', 'Block submitted (No error returned)', 'success');
    job.currentIndex++;
    job.stage = 'IDLE';
    saveJob(job);
    updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));

    const clearBtn = DOMFinder.getClearButton();
    if (clearBtn) clearBtn.click();
    await sleep(job.delayMs || 2500);
    runNextInJob();
  }

  // Toggle Pause
  function togglePause() {
    const job = getSavedJob();
    if (!job) return;
    job.isPaused = !job.isPaused;
    saveJob(job);
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const statusIndicator = document.getElementById('cdcms-status-indicator');
    if (job.isPaused) {
      if (pauseBtn) {
        pauseBtn.innerHTML = '<span>▶</span> Resume';
        pauseBtn.className = 'cdcms-btn cdcms-btn-primary';
      }
      if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #f59e0b;">⏸ Paused</span>';
    } else {
      if (pauseBtn) {
        pauseBtn.innerHTML = '<span>⏸</span> Pause';
        pauseBtn.className = 'cdcms-btn cdcms-btn-warning';
      }
      if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #16a34a;">● Resuming...</span>';
      runNextInJob();
    }
  }

  // Stop Automation
  function stopAutomation() {
    const job = getSavedJob();
    if (job) {
      job.isRunning = false;
      saveJob(job);
    }
    const statusIndicator = document.getElementById('cdcms-status-indicator');
    if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #dc2626;">⏹ Stopped</span>';
    const startBtn = document.getElementById('cdcms-start-btn');
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const stopBtn = document.getElementById('cdcms-stop-btn');
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    addLog('', 'INFO', 'Process stopped by user.', 'info');
  }

  // Download CSV Report
  function downloadCSVReport() {
    if (logsData.length === 0) {
      alert('No logs available yet to download.');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Consumer No,Status,Message,Timestamp\r\n';

    logsData.forEach(row => {
      const cleanMsg = (row.message || '').replace(/"/g, '""');
      csvContent += `"${row.consumerNo}","${row.status}","${cleanMsg}","${row.time}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `CDCMS_Block_Report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Copy Failed Numbers
  function copyFailedNumbers() {
    const failedList = logsData
      .filter(row => row.status === 'FAILED' || row.status === 'ERROR')
      .map(row => row.consumerNo);

    if (failedList.length === 0) {
      alert('No failed consumer numbers to copy!');
      return;
    }

    const textToCopy = failedList.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert(`Copied ${failedList.length} failed consumer numbers to clipboard!`);
    });
  }

  // Make Element Draggable
  function makeDraggable(handle, container) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    handle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      container.style.top = (container.offsetTop - pos2) + "px";
      container.style.left = (container.offsetLeft - pos1) + "px";
      container.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createUI(false));
  } else {
    createUI(false);
  }

  // Listen for open commands from popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'OPEN_PANEL') {
        sessionStorage.removeItem('cdcms_blocker_closed');
        createUI(true); // Force open when user clicks icon
        const root = document.getElementById('cdcms-blocker-root');
        if (root) root.style.display = 'block';
        const panel = document.getElementById('cdcms-panel');
        const launcher = document.getElementById('cdcms-launcher-btn');
        if (panel) panel.style.display = 'flex';
        if (launcher) launcher.style.display = 'none';
        localStorage.setItem('cdcms_blocker_minimized', 'false');
        const txt = document.getElementById('cdcms-consumer-list');
        if (txt) txt.focus();
        sendResponse({ status: 'ok' });
      } else if (request.action === 'LICENSE_UPDATED') {
        const lockScreen = document.getElementById('cdcms-lock-screen');
        const mainForm = document.getElementById('cdcms-main-form');
        const strip = document.getElementById('cdcms-license-strip');
        const stripText = document.getElementById('cdcms-strip-text');
        const lic = typeof LicenseManager !== 'undefined' ? LicenseManager.getStoredLicense() : null;
        if (lic && lic.valid) {
          if (lockScreen) lockScreen.style.display = 'none';
          if (mainForm) mainForm.style.display = 'flex';
          if (strip) strip.style.display = 'flex';
          const agencyName = lic.company ? ` • ${lic.company}` : '';
          if (stripText) stripText.innerHTML = `🛡️ License Active: <strong>${lic.plan || 'PRO'}</strong> (${lic.expiry || 'Active'})${agencyName}`;
        } else {
          if (lockScreen) lockScreen.style.display = 'flex';
          if (mainForm) mainForm.style.display = 'none';
          if (strip) strip.style.display = 'none';
        }
        sendResponse({ status: 'ok' });
      }
    });
  }

  // Periodically check if CDCMS loaded dropdown or screen dynamically
  setInterval(() => {
    syncPageReasonOptions();
  }, 3000);

})();
