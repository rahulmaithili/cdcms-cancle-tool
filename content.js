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
  let activeMode = 'CM-16';

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
    },

    // PFMS Beneficiary Retrigger DOM Finders (ScreenCode CM-43)
    getPfmsConsumerNoInput: function() {
      // 1. Common IDs for PFMS Consumer No input
      const byId = document.querySelector('input[id*="ConsumerNo" i], input[name*="ConsumerNo" i], input[id*="txtConsumer" i]');
      if (byId && byId.offsetParent !== null && !byId.disabled && !byId.readOnly) return byId;

      // 2. Look near text "Consumer No"
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        if (node.nodeValue && node.nodeValue.toLowerCase().includes('consumer no')) {
          const container = node.parentElement.closest('tr, td, div, p');
          if (container) {
            const inp = container.querySelector('input[type="text"], input:not([type])');
            if (inp && inp.offsetParent !== null) return inp;
            const next = container.nextElementSibling;
            if (next) {
              const nextInp = next.querySelector('input[type="text"], input:not([type])');
              if (nextInp && nextInp.offsetParent !== null) return nextInp;
            }
          }
        }
      }
      return DOMFinder.getConsumerNoInput();
    },

    getPfmsSearchButton: function() {
      // 1. By ID / Name
      const byId = document.querySelector('input[id*="btnSearch" i], button[id*="btnSearch" i], [name*="btnSearch" i], input[id*="Search" i]');
      if (byId && byId.offsetParent !== null) return byId;

      // 2. By Value or Text
      const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button');
      for (const btn of buttons) {
        const val = (btn.value || btn.innerText || '').trim().toLowerCase();
        if (val === 'search' || val.startsWith('search')) {
          if (btn.offsetParent !== null) return btn;
        }
      }
      return null;
    },

    getPfmsRetriggerButton: function() {
      // 1. By Value or Text containing "retrigger"
      const buttons = document.querySelectorAll('input[type="button"], input[type="submit"], button, a.btn');
      for (const btn of buttons) {
        const val = (btn.value || btn.innerText || '').trim().toLowerCase();
        if (val.includes('retrigger')) {
          if (btn.offsetParent !== null) return btn;
        }
      }

      // 2. By ID / Name
      const byId = document.querySelector('[id*="Retrigger" i], [name*="Retrigger" i], [id*="btnPFMS" i]');
      if (byId && byId.offsetParent !== null) return byId;

      return null;
    }
  };

  // Helper sleep
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Check if current page is on HP Gas CDCMS portal or test simulator
  function isCdcmsPortal() {
    const url = window.location.href.toLowerCase();
    const host = window.location.hostname.toLowerCase();
    return host.includes('hpcl.co.in') || 
           host.includes('cdcms') || 
           url.includes('dcms') || 
           url.includes('consumermanagement') ||
           url.includes('test_cdcms_page');
  }

  // Detect which screen the user is currently on (CM-16 Block Consumer or CM-43 PFMS Retrigger)
  function detectPageScreen() {
    // 1. Must be on HP Gas CDCMS portal or test simulator (Never on google, youtube, other sites)
    if (!isCdcmsPortal()) {
      return null;
    }

    const url = window.location.href.toLowerCase();
    const pageText = (document.body ? (document.body.innerText || '') : '');
    const pageHtml = (document.body ? (document.body.innerHTML || '') : '');

    // Test simulator page support
    if (url.includes('test_cdcms_page')) {
      const v43 = document.getElementById('viewCm43');
      if (v43 && v43.style.display !== 'none') return 'CM-43';
      return 'CM-16';
    }

    // 2. CM-43: PFMS Beneficiary Retrigger (Must strictly match CDCMS CM-43 screen)
    const hasCm43Code = /screencode\s*\(?\s*cm-?43\s*\)?/i.test(pageText) || 
                        /screencode\s*\(?\s*cm-?43\s*\)?/i.test(pageHtml);
    const hasCm43Url = url.includes('pfmsbeneficiaryretrigger') || 
                       (url.includes('pfms') && url.includes('retrigger'));
    const hasPfmsRetriggerBtn = DOMFinder.getPfmsRetriggerButton() !== null || 
                                /retrigger\s*pfms\s*request/i.test(pageText);

    if (hasCm43Code || hasCm43Url || (hasPfmsRetriggerBtn && /pfms/i.test(pageText))) {
      return 'CM-43';
    }

    // 3. CM-16: Block Consumer (Must strictly match CDCMS CM-16 screen)
    const hasCm16Code = /screencode\s*\(?\s*cm-?16\s*\)?/i.test(pageText) || 
                        /screencode\s*\(?\s*cm-?16\s*\)?/i.test(pageHtml);
    const hasCm16Url = url.includes('blockconsumer') || 
                       url.includes('block_consumer') || 
                       url.includes('consumerblock');
    const hasBlockReason = /block\s*reason/i.test(pageText) || 
                          DOMFinder.getBlockReasonSelect() !== null;
    const hasBlockHeader = /consumer\s*management\/block\s*consumer/i.test(pageText);

    if (hasCm16Code || hasCm16Url || hasBlockHeader || (hasBlockReason && DOMFinder.getConsumerNoInput() !== null)) {
      return 'CM-16';
    }

    // Not on CM-16 or CM-43 (e.g. Order Booking OF-02, Distributor Data, Home, Reports)
    return null;
  }

  // Strict check: ONLY return true for CM-16 or CM-43 screens!
  function isSupportedPage() {
    return detectPageScreen() !== null;
  }

  // Dynamically check and update visibility when navigating inside CDCMS portal
  function checkAndUpdateScreenVisibility() {
    const screen = detectPageScreen();
    const root = document.getElementById('cdcms-blocker-root');

    if (!screen) {
      // User navigated to another tab/page (e.g. Order Booking, Home, other websites) -> Remove completely from DOM!
      if (root) {
        root.remove();
      }
      return;
    }

    // User is on CM-16 or CM-43 screen
    const isClosed = sessionStorage.getItem('cdcms_blocker_closed') === 'true';
    if (!isClosed) {
      if (!root) {
        createUI(false);
      } else {
        if (root.style.display === 'none') {
          root.style.display = 'block';
        }
        if (screen !== activeMode) {
          switchMode(screen);
        }
      }
    }
  }

  // Minimize floating panel to bottom-right pill
  function minimizeToBottom() {
    const root = document.getElementById('cdcms-blocker-root');
    const panel = document.getElementById('cdcms-panel');
    const launcher = document.getElementById('cdcms-launcher-btn');
    if (!root || !panel || !launcher) return;

    panel.style.display = 'none';
    launcher.style.display = 'flex';
    root.classList.add('cdcms-minimized');
    localStorage.setItem('cdcms_blocker_minimized', 'true');
  }

  // Restore floating panel from bottom-right pill to top/main position
  function restoreFromBottom() {
    const root = document.getElementById('cdcms-blocker-root');
    const panel = document.getElementById('cdcms-panel');
    const launcher = document.getElementById('cdcms-launcher-btn');
    if (!root || !panel || !launcher) return;

    launcher.style.display = 'none';
    panel.style.display = 'flex';
    root.classList.remove('cdcms-minimized');
    root.style.bottom = 'auto';
    if (!root.style.top || root.style.top === 'auto') {
      root.style.top = '60px';
    }
    localStorage.setItem('cdcms_blocker_minimized', 'false');
    sessionStorage.removeItem('cdcms_blocker_closed');
    updateLicenseStateUI();
    syncPageReasonOptions();
  }

  // Premium SVG Icons map (Lightweight vector icons replacing emojis)
  const ICONS = {
    BOLT: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
    PLAY: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>',
    PAUSE: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    STOP: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    RESET: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    DOWNLOAD: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    COPY: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    GITHUB: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>',
    REFRESH: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    SHIELD: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>',
    LOCK: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    ALERT: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    KEY: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-2-2-4 4 2 2-5 5a2.12 2.12 0 0 0 3 3l5-5 2 2 4-4-2-2 3.5-3.5z"/></svg>',
    USER: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    WHATSAPP: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.888 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L0 24l6.335-1.662c1.746.953 3.71 1.456 5.711 1.457h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
    MAIL: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
    SEARCH: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    EXTERNAL: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
    CHEVRON_UP: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    CLOSE: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    MINUS: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    CHECK: '<svg class="cdcms-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  };

  // Build Floating UI Panel
  function createUI(forceOpen = false) {
    // Only open on supported CDCMS screens unless explicitly requested by user
    if (!forceOpen && !isSupportedPage()) {
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

    // Auto-detect screen or restore saved mode preference
    const detectedScreen = detectPageScreen();
    if (detectedScreen) {
      activeMode = detectedScreen;
    } else {
      activeMode = localStorage.getItem('cdcms_active_screen_mode') || 'CM-16';
    }

    if (document.getElementById('cdcms-blocker-root')) {
      const existing = document.getElementById('cdcms-blocker-root');
      existing.style.display = 'block';
      if (forceOpen) {
        restoreFromBottom();
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
    if (isMinimized && !forceOpen) {
      root.classList.add('cdcms-minimized');
    }

    root.innerHTML = `
      <div id="cdcms-launcher-btn" style="display: ${launcherStyle}; cursor: pointer;" title="Click to open HP Gas CDCMS Auto-Blocker">
        <div class="cdcms-dock-content">
          <div class="cdcms-dock-sub">MR.RAHUL SCRIPTS</div>
          <div class="cdcms-dock-main">
            ${logoIconUrl ? `<img src="${logoIconUrl}" class="cdcms-launcher-logo" alt="RS" />` : ''}
            <span id="cdcms-launcher-label">${ICONS.BOLT} CDCMS Auto-Blocker</span>
          </div>
        </div>
        <div class="cdcms-dock-actions">
          <span class="cdcms-dock-chevron" title="Click to expand">${ICONS.CHEVRON_UP}</span>
          <span id="cdcms-launcher-close" title="Close completely (Hide from screen)">${ICONS.CLOSE}</span>
        </div>
      </div>

      <div id="cdcms-panel" style="display: ${panelStyle};">
        <div class="cdcms-panel-header" id="cdcms-panel-drag">
          <div class="cdcms-header-title">
            ${logoIconUrl ? `<img src="${logoIconUrl}" class="cdcms-logo-icon" alt="RS" />` : ''}
            <span id="cdcms-panel-title">${activeMode === 'CM-43' ? 'HP Gas PFMS Retrigger' : 'HP Gas CDCMS Blocker'}</span>
            <span class="cdcms-badge" id="cdcms-screen-badge">${activeMode}</span>
            <span class="cdcms-badge" id="cdcms-ver-badge" style="background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); font-size: 10px;" title="Extension Version">v1.2.0</span>
          </div>
          <div class="cdcms-header-actions">
            <button class="cdcms-btn-icon" id="cdcms-min-btn" title="Minimize to bottom badge">${ICONS.MINUS}</button>
            <button class="cdcms-btn-icon" id="cdcms-close-btn" title="Close completely (Hide from page)" style="font-weight: bold; font-size: 14px; margin-left: 4px; color: #f87171;">${ICONS.CLOSE}</button>
          </div>
        </div>

        <div class="cdcms-panel-body">
          <!-- License Status Strip -->
          <div id="cdcms-license-strip" class="cdcms-license-strip" style="display: none;">
            <span id="cdcms-strip-text">${ICONS.SHIELD} License: Checking...</span>
            <button id="cdcms-deactivate-btn" class="cdcms-lic-btn-change">Change Key</button>
          </div>

          <!-- Software Version & Live Update Bar (Always Visible) -->
          <div id="cdcms-github-bar" class="cdcms-github-bar">
            <div class="cdcms-gh-info">
              <span class="cdcms-gh-tag">Version:</span>
              <span id="cdcms-gh-cur-ver" class="cdcms-gh-ver">v1.2.0</span>
              <span id="cdcms-gh-status-text" class="cdcms-gh-status-text">• Up to date</span>
            </div>
            <div class="cdcms-gh-btns">
              <button type="button" id="cdcms-check-gh-btn" class="cdcms-gh-btn" title="Check for latest update" style="display: inline-flex; align-items: center; gap: 4px;">${ICONS.REFRESH} Check Update</button>
            </div>
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
              <button id="cdcms-license-submit" class="cdcms-lock-btn" style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">${ICONS.KEY} Activate</button>
            </div>
            <div id="cdcms-license-msg" class="cdcms-lock-status"></div>

            <div style="display: flex; gap: 8px; width: 100%; margin-top: 10px;">
              <a href="https://licensescript.netlify.app/#pricing-section" target="_blank" class="cdcms-lock-wa-btn" style="flex: 1; text-align: center; text-decoration: none; justify-content: center; background: rgba(2, 132, 199, 0.2); border: 1px solid #0284c7; color: #38bdf8; font-size: 11px;">
                ${ICONS.EXTERNAL} Get on LicenseVault
              </a>
              <a href="https://licensescript.netlify.app/#validate-section" target="_blank" class="cdcms-lock-wa-btn" style="flex: 1; text-align: center; text-decoration: none; justify-content: center; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255,255,255,0.2); color: #e2e8f0; font-size: 11px;">
                ${ICONS.SEARCH} Verify on Web
              </a>
            </div>

            <a href="https://wa.me/917564948617?text=Hello%20Mr.%20Rahul%20Script,%20I%20need%20a%20License%20Key%20for%20HP%20Gas%20CDCMS%20Blocker" target="_blank" class="cdcms-lock-wa-btn" style="margin-top: 8px; width: 100%; box-sizing: border-box; justify-content: center;">
              ${ICONS.WHATSAPP} WhatsApp Support (+917564948617)
            </a>
          </div>

          <!-- Main Automation Form (Unlocked on Active License) -->
          <div id="cdcms-main-form" style="display: none; flex-direction: column; gap: 12px;">
            <!-- Dual Mode Tabs -->
            <div class="cdcms-mode-tabs" id="cdcms-mode-tabs">
              <button type="button" class="cdcms-mode-tab ${activeMode === 'CM-16' ? 'active' : ''}" data-mode="CM-16">
                ${ICONS.SHIELD} Block Consumer (CM-16)
              </button>
              <button type="button" class="cdcms-mode-tab ${activeMode === 'CM-43' ? 'active' : ''}" data-mode="CM-43">
                ${ICONS.REFRESH} PFMS Retrigger (CM-43)
              </button>
            </div>

            <div class="cdcms-form-group">
              <div class="cdcms-label">
                <span>Consumer Numbers (Paste List)</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span id="cdcms-total-count" style="color: #0284c7;">0 numbers</span>
                  <button type="button" id="cdcms-quick-clear-btn" class="cdcms-clear-link" title="Clear text and reset for new batch" style="display: inline-flex; align-items: center; gap: 3px;">${ICONS.CLOSE} Clear Box</button>
                </div>
              </div>
              <textarea id="cdcms-consumer-list" class="cdcms-textarea" placeholder="Paste Consumer Numbers here (one per line, comma or space separated)&#10;825558&#10;825559&#10;825560..."></textarea>
            </div>

            <!-- Block options row (Hidden in CM-43 PFMS mode) -->
            <div id="cdcms-block-options-row" class="cdcms-row-2" style="display: ${activeMode === 'CM-43' ? 'none' : 'grid'};">
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
                ${ICONS.PLAY} <span id="cdcms-start-btn-text">${activeMode === 'CM-43' ? 'Start Retrigger' : 'Start Blocking'}</span>
              </button>
              <button id="cdcms-pause-btn" class="cdcms-btn cdcms-btn-warning" disabled>
                ${ICONS.PAUSE} Pause
              </button>
              <button id="cdcms-stop-btn" class="cdcms-btn cdcms-btn-danger" disabled>
                ${ICONS.STOP} Stop
              </button>
              <button id="cdcms-reset-btn" class="cdcms-btn cdcms-btn-reset" title="Reset all data to paste a new consumer batch">
                ${ICONS.RESET} Reset
              </button>
            </div>

            <div class="cdcms-stats-grid">
              <div class="cdcms-stat-item">
                <span class="cdcms-stat-val" id="cdcms-stat-total">0</span>
                <span class="cdcms-stat-lbl">Total</span>
              </div>
              <div class="cdcms-stat-item">
                <span class="cdcms-stat-val success" id="cdcms-stat-success">0</span>
                <span class="cdcms-stat-lbl" id="cdcms-stat-lbl-success">${activeMode === 'CM-43' ? 'Retriggered' : 'Blocked'}</span>
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
                ${ICONS.DOWNLOAD} Download Report (CSV)
              </button>
              <button id="cdcms-copy-failed" class="cdcms-btn cdcms-btn-secondary">
                ${ICONS.COPY} Copy Failed List
              </button>
              <button id="cdcms-reset-footer-btn" class="cdcms-btn cdcms-btn-secondary" style="color: #dc2626; border-color: #fca5a5;" title="Clear all data and reset form">
                ${ICONS.RESET} Reset All Data
              </button>
            </div>
          </div>

          <!-- Developer Branding & Support Section -->
          <div class="cdcms-dev-brand">
            <div class="cdcms-dev-badge">
              ${ICONS.USER} Developed by <strong>Mr. Rahul Script</strong>
            </div>
            <div class="cdcms-dev-subtext">
              Official Copyright & Technical Support • Business Automation Solutions
            </div>
            <div class="cdcms-contact-row">
              <a href="https://wa.me/917564948617" target="_blank" class="cdcms-contact-pill cdcms-contact-whatsapp">
                ${ICONS.WHATSAPP} WhatsApp: +917564948617
              </a>
              <a href="mailto:life.rahulg@gmail.com" class="cdcms-contact-pill cdcms-contact-email">
                ${ICONS.MAIL} Email: life.rahulg@gmail.com
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

  // Update license display state across all panels and launcher
  function updateLicenseStateUI() {
    const lockScreen = document.getElementById('cdcms-lock-screen');
    const mainForm = document.getElementById('cdcms-main-form');
    const strip = document.getElementById('cdcms-license-strip');
    const stripText = document.getElementById('cdcms-strip-text');
    const deviceIdEl = document.getElementById('cdcms-lock-device-id');
    const lockTitle = lockScreen ? lockScreen.querySelector('.cdcms-lock-title') : null;
    const lockSubtitle = lockScreen ? lockScreen.querySelector('.cdcms-lock-subtitle') : null;
    const launcherLabel = document.getElementById('cdcms-launcher-label');

    if (deviceIdEl && typeof LicenseManager !== 'undefined') {
      deviceIdEl.textContent = LicenseManager.getDeviceId();
    }

    const licStatus = typeof LicenseManager !== 'undefined' ? LicenseManager.checkLicenseStatus() : null;

    if (licStatus && licStatus.valid && licStatus.status === 'active') {
      // ACTIVE STATE: Unlock cancel/block page
      if (lockScreen) lockScreen.style.display = 'none';
      if (mainForm) mainForm.style.display = 'flex';
      if (strip) strip.style.display = 'flex';
      const agencyName = licStatus.company ? ` • ${licStatus.company}` : '';
      const remainingStr = licStatus.lifetime ? 'Lifetime' : `${licStatus.remainingDays} days left - till ${licStatus.formattedExpiry}`;
      if (stripText) stripText.innerHTML = `${ICONS.SHIELD} License Active: <strong>${licStatus.plan || 'PRO'}</strong> (${remainingStr})${agencyName}`;
      if (launcherLabel && !launcherLabel.textContent.includes('Blocking')) {
        launcherLabel.innerHTML = `${ICONS.BOLT} CDCMS Auto-Blocker`;
      }
    } else if (licStatus && licStatus.status === 'expired') {
      // EXPIRED STATE: Lock completely and prompt to renew
      if (lockScreen) lockScreen.style.display = 'flex';
      if (mainForm) mainForm.style.display = 'none';
      if (strip) strip.style.display = 'none';
      if (lockTitle) lockTitle.innerHTML = `<span style="color: #ef4444; display: inline-flex; align-items: center; gap: 4px;">${ICONS.ALERT} License Expired</span>`;
      if (lockSubtitle) lockSubtitle.innerHTML = `<span style="color: #fca5a5;">Your access expired on <strong>${licStatus.formattedExpiry}</strong>.<br>Please renew your subscription on LicenseVault or contact Mr. Rahul Script to continue.</span>`;
      if (launcherLabel) launcherLabel.innerHTML = `${ICONS.ALERT} License Expired`;
      stopAutomation();
    } else {
      // UNLICENSED STATE: Keep locked
      if (lockScreen) lockScreen.style.display = 'flex';
      if (mainForm) mainForm.style.display = 'none';
      if (strip) strip.style.display = 'none';
      if (lockTitle) lockTitle.textContent = 'License Activation Required';
      if (lockSubtitle) lockSubtitle.textContent = 'Please enter your LicenseVault key to unlock bulk blocking for this agency.';
      if (launcherLabel) launcherLabel.innerHTML = `${ICONS.LOCK} Activate License`;
    }
  }

  // Switch between CM-16 (Block Consumer) and CM-43 (PFMS Beneficiary Retrigger) modes
  function switchMode(newMode) {
    activeMode = newMode;
    localStorage.setItem('cdcms_active_screen_mode', newMode);

    const tabs = document.querySelectorAll('.cdcms-mode-tab');
    tabs.forEach(tab => {
      if (tab.getAttribute('data-mode') === newMode) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    const panelTitle = document.getElementById('cdcms-panel-title');
    const screenBadge = document.getElementById('cdcms-screen-badge');
    const blockRow = document.getElementById('cdcms-block-options-row');
    const startBtnText = document.getElementById('cdcms-start-btn-text');
    const statLblSuccess = document.getElementById('cdcms-stat-lbl-success');
    const launcherLabel = document.getElementById('cdcms-launcher-label');

    if (newMode === 'CM-43') {
      if (panelTitle) panelTitle.textContent = 'HP Gas PFMS Retrigger';
      if (screenBadge) screenBadge.textContent = 'CM-43';
      if (blockRow) blockRow.style.display = 'none';
      if (startBtnText) startBtnText.textContent = 'Start Retrigger';
      if (statLblSuccess) statLblSuccess.textContent = 'Retriggered';
      if (launcherLabel && !launcherLabel.textContent.includes('Retriggering') && !launcherLabel.textContent.includes('Blocking')) {
        launcherLabel.innerHTML = `${ICONS.REFRESH} PFMS Retrigger`;
      }
    } else {
      if (panelTitle) panelTitle.textContent = 'HP Gas CDCMS Blocker';
      if (screenBadge) screenBadge.textContent = 'CM-16';
      if (blockRow) blockRow.style.display = 'grid';
      if (startBtnText) startBtnText.textContent = 'Start Blocking';
      if (statLblSuccess) statLblSuccess.textContent = 'Blocked';
      if (launcherLabel && !launcherLabel.textContent.includes('Retriggering') && !launcherLabel.textContent.includes('Blocking')) {
        launcherLabel.innerHTML = `${ICONS.BOLT} CDCMS Auto-Blocker`;
      }
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

    // Dual Mode Switcher Tabs
    const modeTabs = document.querySelectorAll('.cdcms-mode-tab');
    modeTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode');
        if (mode && mode !== activeMode) {
          switchMode(mode);
        }
      });
    });

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

    // Toggle Open/Minimize (Supports bottom-pill minimization)
    launcher.addEventListener('click', restoreFromBottom);
    minBtn.addEventListener('click', minimizeToBottom);

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
    startBtn.addEventListener('click', () => {
      if (activeMode === 'CM-43') {
        startPfmsAutomation();
      } else {
        startAutomation();
      }
    });
    pauseBtn.addEventListener('click', togglePause);
    stopBtn.addEventListener('click', stopAutomation);

    // Reset Data Buttons
    const resetBtn = document.getElementById('cdcms-reset-btn');
    const quickClearBtn = document.getElementById('cdcms-quick-clear-btn');
    const resetFooterBtn = document.getElementById('cdcms-reset-footer-btn');

    if (resetBtn) resetBtn.addEventListener('click', () => resetAllData(true));
    if (quickClearBtn) quickClearBtn.addEventListener('click', () => resetAllData(false));
    if (resetFooterBtn) resetFooterBtn.addEventListener('click', () => resetAllData(true));

    // Download CSV
    downloadBtn.addEventListener('click', downloadCSVReport);

    // Copy Failed
    copyFailedBtn.addEventListener('click', copyFailedNumbers);

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

    // GitHub Check Update Button in Panel
    const ghCheckBtn = document.getElementById('cdcms-check-gh-btn');
    if (ghCheckBtn) {
      ghCheckBtn.addEventListener('click', () => {
        checkGitHubUpdates(true);
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
            if (licMsg) licMsg.innerHTML = `<span style="color: #4ade80; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CHECK} License Activated Successfully!</span>`;
            setTimeout(() => {
              updateLicenseStateUI();
            }, 500);
          } else {
            if (licMsg) licMsg.innerHTML = `<span style="color: #f87171; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CLOSE} ${res.message}</span>`;
          }
        } catch (err) {
          if (licMsg) licMsg.innerHTML = `<span style="color: #f87171; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CLOSE} Verification error: ${err.message}</span>`;
        } finally {
          licSubmit.disabled = false;
          licSubmit.innerHTML = `${ICONS.KEY} Activate`;
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

    // Periodically check license status and auto-lock if expired
    setInterval(() => {
      updateLicenseStateUI();
    }, 15000);

    // Check if there was an ongoing job that needs to resume after page reload!
    setTimeout(() => {
      checkAndResumeJob();
    }, 600);

    // Check updates in background
    checkGitHubUpdates(false);
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
      alert('Access Denied: Please activate a valid License Key to start bulk blocking.');
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
      mode: 'CM-16',
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

    // Auto-minimize down to the bottom pill so user has a full unobstructed view of the page
    minimizeToBottom();

    runNextInJob();
  }

  // Start PFMS Automation (CM-43)
  function startPfmsAutomation() {
    // Strict License Verification Guard
    const currentLic = typeof LicenseManager !== 'undefined' ? LicenseManager.getStoredLicense() : null;
    if (!currentLic || !currentLic.valid) {
      alert('Access Denied: Please activate a valid License Key to start PFMS retriggering.');
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

    const job = {
      mode: 'CM-43',
      isRunning: true,
      isPaused: false,
      consumerList: consumerList,
      currentIndex: 0,
      total: consumerList.length,
      successCount: 0,
      failedCount: 0,
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
    if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #16a34a;">● Retriggering...</span>';

    updateCounters(job.total, 0, 0, job.total);
    addLog('', 'INFO', `Started PFMS Retrigger for ${job.total} consumers.`, 'info');

    // Auto-minimize down to the bottom pill so user has a full unobstructed view of the page
    minimizeToBottom();

    runNextPfmsJob();
  }

  // Run next consumer in PFMS Retrigger active job
  async function runNextPfmsJob() {
    const job = getSavedJob();
    if (!job || !job.isRunning) return;

    const statusIndicator = document.getElementById('cdcms-status-indicator');
    const launcherBtn = document.getElementById('cdcms-launcher-btn');
    const launcherLabel = document.getElementById('cdcms-launcher-label');

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
      if (statusIndicator) statusIndicator.innerHTML = `<span style="color: #0284c7; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CHECK} PFMS Completed</span>`;
      addLog('', 'INFO', `Finished PFMS! Total: ${job.total}, Retriggered: ${job.successCount}, Failed: ${job.failedCount}`, 'info');

      if (launcherBtn) launcherBtn.classList.remove('is-running');
      if (launcherLabel) launcherLabel.innerHTML = `${ICONS.CHECK} Retriggered (${job.successCount} OK, ${job.failedCount} Fail)`;
      return;
    }

    const consumerNo = job.consumerList[job.currentIndex];
    job.currentConsumer = consumerNo;
    saveJob(job);

    if (statusIndicator) {
      statusIndicator.innerHTML = `<span style="color: #16a34a;">● Processing (${job.currentIndex + 1}/${job.total}): ${consumerNo}</span>`;
    }

    if (launcherBtn) launcherBtn.classList.add('is-running');
    if (launcherLabel) {
      launcherLabel.innerHTML = `${ICONS.REFRESH} Retriggering (${job.currentIndex + 1}/${job.total})`;
    }

    lastCapturedAlert = '';
    lastCapturedConfirm = '';

    // Step 1: Input Consumer No
    const consumerInput = DOMFinder.getPfmsConsumerNoInput();
    if (!consumerInput) {
      job.failedCount++;
      addLog(consumerNo, 'FAILED', 'Consumer No input not found on page', 'error');
      job.currentIndex++;
      saveJob(job);
      updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
      await sleep(job.delayMs || 2500);
      runNextPfmsJob();
      return;
    }

    consumerInput.focus();
    consumerInput.value = consumerNo;
    triggerChangeEvent(consumerInput);
    await sleep(300);

    // Step 2: Set stage to PFMS_SEARCHING and click Search
    job.stage = 'PFMS_SEARCHING';
    saveJob(job);

    const searchBtn = DOMFinder.getPfmsSearchButton();
    if (!searchBtn) {
      job.failedCount++;
      addLog(consumerNo, 'FAILED', 'Search button not found on page', 'error');
      job.currentIndex++;
      job.stage = 'IDLE';
      saveJob(job);
      updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
      await sleep(job.delayMs || 2500);
      runNextPfmsJob();
      return;
    }

    searchBtn.click();

    // If Search is AJAX (no reload), poll for result
    let waitIntervals = 0;
    while (waitIntervals < 16) {
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
        await sleep(job.delayMs || 2500);
        runNextPfmsJob();
        return;
      }

      const retriggerBtn = DOMFinder.getPfmsRetriggerButton();
      if (retriggerBtn && !retriggerBtn.disabled) {
        await executePfmsRetriggerStep(job);
        return;
      }
    }

    // Retrigger button did not appear within timeout
    job.failedCount++;
    addLog(consumerNo, 'FAILED', 'Retrigger button not found after Search', 'error');
    job.currentIndex++;
    job.stage = 'IDLE';
    saveJob(job);
    updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
    await sleep(job.delayMs || 2500);
    runNextPfmsJob();
  }

  // Execute PFMS Retrigger Step (Click Retrigger PFMS Request)
  async function executePfmsRetriggerStep(job) {
    const consumerNo = job.currentConsumer;
    await sleep(400);

    const retriggerBtn = DOMFinder.getPfmsRetriggerButton();
    if (!retriggerBtn) {
      job.failedCount++;
      addLog(consumerNo, 'FAILED', 'Retrigger button not found', 'error');
      job.currentIndex++;
      job.stage = 'IDLE';
      saveJob(job);
      updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
      await sleep(job.delayMs || 2500);
      runNextPfmsJob();
      return;
    }

    job.stage = 'PFMS_RETRIGGERING';
    saveJob(job);

    lastCapturedAlert = '';
    lastCapturedConfirm = '';
    retriggerBtn.click();

    // If Retrigger is AJAX (no reload):
    let waitRetrigger = 0;
    while (waitRetrigger < 16) {
      await sleep(250);
      waitRetrigger++;

      const freshJob = getSavedJob();
      if (!freshJob || !freshJob.isRunning) return; // stopped

      let alertMsg = lastCapturedAlert || DOMFinder.getMessageLabel();
      if (alertMsg) {
        lastCapturedAlert = '';
        const lower = alertMsg.toLowerCase();
        const hasSuccess = lower.includes('success') || lower.includes('retrigger') || lower.includes('initiated') || lower.includes('processed');
        const hasFailure = lower.includes('error') || lower.includes('failed') || lower.includes('not allow') || lower.includes('already');
        const isSuccess = (hasSuccess && !hasFailure) || (!hasFailure && !hasSuccess);

        if (isSuccess) {
          job.successCount++;
          addLog(consumerNo, 'SUCCESS', alertMsg || 'PFMS Retriggered successfully', 'success');
        } else {
          job.failedCount++;
          addLog(consumerNo, 'FAILED', alertMsg, 'error');
        }

        job.currentIndex++;
        job.stage = 'IDLE';
        saveJob(job);
        updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
        await sleep(job.delayMs || 2500);
        runNextPfmsJob();
        return;
      }
    }

    // Timed out with no alert - consider success
    job.successCount++;
    addLog(consumerNo, 'SUCCESS', 'PFMS Retrigger submitted', 'success');
    job.currentIndex++;
    job.stage = 'IDLE';
    saveJob(job);
    updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
    await sleep(job.delayMs || 2500);
    runNextPfmsJob();
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

    if (job.mode === 'CM-43') {
      switchMode('CM-43');
    } else {
      switchMode('CM-16');
    }

    const startBtn = document.getElementById('cdcms-start-btn');
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const stopBtn = document.getElementById('cdcms-stop-btn');
    const statusIndicator = document.getElementById('cdcms-status-indicator');

    if (startBtn) startBtn.disabled = true;
    if (pauseBtn) pauseBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = false;

    updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));

    await sleep(800);

    // Resume CM-43 (PFMS Retrigger)
    if (job.mode === 'CM-43') {
      if (job.stage === 'PFMS_SEARCHING') {
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
          await sleep(job.delayMs || 2500);
          runNextPfmsJob();
          return;
        }

        const retriggerBtn = DOMFinder.getPfmsRetriggerButton();
        if (retriggerBtn && !retriggerBtn.disabled) {
          await executePfmsRetriggerStep(job);
          return;
        } else {
          job.failedCount++;
          addLog(consumerNo, 'FAILED', 'Retrigger button not found after page reload', 'error');
          job.currentIndex++;
          job.stage = 'IDLE';
          saveJob(job);
          updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
          await sleep(job.delayMs || 2500);
          runNextPfmsJob();
          return;
        }
      } else if (job.stage === 'PFMS_RETRIGGERING') {
        const consumerNo = job.currentConsumer;
        let alertMsg = lastCapturedAlert || DOMFinder.getMessageLabel();
        lastCapturedAlert = '';

        const lower = (alertMsg || '').toLowerCase();
        const hasSuccess = lower.includes('success') || lower.includes('retrigger') || lower.includes('initiated');
        const hasFailure = lower.includes('error') || lower.includes('failed') || lower.includes('already') || lower.includes('not allow');
        const isSuccess = (hasSuccess && !hasFailure) || (!alertMsg);

        if (isSuccess) {
          job.successCount++;
          addLog(consumerNo, 'SUCCESS', alertMsg || 'PFMS Retriggered successfully', 'success');
        } else {
          job.failedCount++;
          addLog(consumerNo, 'FAILED', alertMsg || 'PFMS Retrigger failed', 'error');
        }

        job.currentIndex++;
        job.stage = 'IDLE';
        saveJob(job);
        updateCounters(job.total, job.successCount, job.failedCount, Math.max(0, job.total - job.currentIndex));
        await sleep(job.delayMs || 2500);
        runNextPfmsJob();
        return;
      } else {
        runNextPfmsJob();
        return;
      }
    }

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
      if (statusIndicator) statusIndicator.innerHTML = `<span style="color: #0284c7; display: inline-flex; align-items: center; gap: 4px;">${ICONS.CHECK} Completed</span>`;
      addLog('', 'INFO', `Finished! Total: ${job.total}, Blocked: ${job.successCount}, Failed: ${job.failedCount}`, 'info');

      const launcherBtn = document.getElementById('cdcms-launcher-btn');
      const launcherLabel = document.getElementById('cdcms-launcher-label');
      if (launcherBtn) launcherBtn.classList.remove('is-running');
      if (launcherLabel) launcherLabel.innerHTML = `${ICONS.CHECK} Finished (${job.successCount} OK, ${job.failedCount} Fail)`;
      return;
    }

    const consumerNo = job.consumerList[job.currentIndex];
    job.currentConsumer = consumerNo;
    saveJob(job);

    if (statusIndicator) {
      statusIndicator.innerHTML = `<span style="color: #16a34a;">● Processing (${job.currentIndex + 1}/${job.total}): ${consumerNo}</span>`;
    }

    const launcherBtn = document.getElementById('cdcms-launcher-btn');
    const launcherLabel = document.getElementById('cdcms-launcher-label');
    if (launcherBtn) launcherBtn.classList.add('is-running');
    if (launcherLabel) {
      launcherLabel.innerHTML = `${ICONS.BOLT} Blocking (${job.currentIndex + 1}/${job.total})`;
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
    const launcherBtn = document.getElementById('cdcms-launcher-btn');
    const launcherLabel = document.getElementById('cdcms-launcher-label');

    if (job.isPaused) {
      if (pauseBtn) {
        pauseBtn.innerHTML = `${ICONS.PLAY} Resume`;
        pauseBtn.className = 'cdcms-btn cdcms-btn-primary';
      }
      if (statusIndicator) statusIndicator.innerHTML = `<span style="color: #f59e0b; display: inline-flex; align-items: center; gap: 4px;">${ICONS.PAUSE} Paused</span>`;
      if (launcherBtn) launcherBtn.classList.remove('is-running');
      if (launcherLabel) launcherLabel.innerHTML = `${ICONS.PAUSE} Paused (${job.currentIndex + 1}/${job.total})`;
    } else {
      if (pauseBtn) {
        pauseBtn.innerHTML = `${ICONS.PAUSE} Pause`;
        pauseBtn.className = 'cdcms-btn cdcms-btn-warning';
      }
      if (statusIndicator) statusIndicator.innerHTML = '<span style="color: #16a34a;">● Resuming...</span>';
      if (launcherBtn) launcherBtn.classList.add('is-running');
      if (launcherLabel) {
        launcherLabel.innerHTML = (job.mode === 'CM-43')
          ? `${ICONS.REFRESH} Retriggering (${job.currentIndex + 1}/${job.total})`
          : `${ICONS.BOLT} Blocking (${job.currentIndex + 1}/${job.total})`;
      }
      if (job.mode === 'CM-43') {
        runNextPfmsJob();
      } else {
        runNextInJob();
      }
    }
  }

  // Stop Automation
  function stopAutomation() {
    const job = getSavedJob();
    if (job) {
      job.isRunning = false;
      job.isPaused = false;
      saveJob(job);
    }
    const statusIndicator = document.getElementById('cdcms-status-indicator');
    if (statusIndicator) statusIndicator.innerHTML = `<span style="color: #dc2626; display: inline-flex; align-items: center; gap: 4px;">${ICONS.STOP} Stopped</span>`;
    const startBtn = document.getElementById('cdcms-start-btn');
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const stopBtn = document.getElementById('cdcms-stop-btn');
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) pauseBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = true;
    addLog('', 'INFO', 'Process stopped by user.', 'info');

    const launcherBtn = document.getElementById('cdcms-launcher-btn');
    const launcherLabel = document.getElementById('cdcms-launcher-label');
    if (launcherBtn) launcherBtn.classList.remove('is-running');
    if (launcherLabel) {
      launcherLabel.innerHTML = (activeMode === 'CM-43')
        ? `${ICONS.REFRESH} PFMS Retrigger`
        : `${ICONS.BOLT} CDCMS Auto-Blocker`;
    }
  }

  // Reset all data and clear form for a new batch
  function resetAllData(promptUser = true) {
    if (promptUser && logsData.length > 0) {
      const confirmReset = confirm('Are you sure you want to reset all data and clear the consumer list for a new batch?');
      if (!confirmReset) return;
    }

    // 1. Stop any active job
    const job = getSavedJob();
    if (job && job.isRunning) {
      job.isRunning = false;
      saveJob(null);
    } else {
      saveJob(null);
    }

    // 2. Clear textarea and saved consumer raw text
    const textarea = document.getElementById('cdcms-consumer-list');
    if (textarea) {
      textarea.value = '';
      textarea.focus();
    }
    localStorage.removeItem('cdcms_consumer_raw_text');

    // 3. Reset total count indicator
    const totalCount = document.getElementById('cdcms-total-count');
    if (totalCount) {
      totalCount.textContent = '0 numbers';
    }

    // 4. Reset counters & progress bar
    updateCounters(0, 0, 0, 0);
    const elBar = document.getElementById('cdcms-progress-bar');
    if (elBar) elBar.style.width = '0%';

    // 5. Clear activity logs
    logsData = [];
    localStorage.removeItem('cdcms_blocker_logs');
    const logBox = document.getElementById('cdcms-log-box');
    if (logBox) {
      logBox.innerHTML = `
        <div class="cdcms-log-item info">
          <span class="cdcms-log-time">[System]</span>
          <span>Data reset complete. Paste new consumer numbers and click Start.</span>
        </div>
      `;
    }

    // 6. Reset status indicator
    const statusIndicator = document.getElementById('cdcms-status-indicator');
    if (statusIndicator) {
      statusIndicator.innerHTML = '<span style="color: #64748b;">Ready</span>';
    }

    // 7. Reset action buttons state
    const startBtn = document.getElementById('cdcms-start-btn');
    const pauseBtn = document.getElementById('cdcms-pause-btn');
    const stopBtn = document.getElementById('cdcms-stop-btn');
    if (startBtn) startBtn.disabled = false;
    if (pauseBtn) {
      pauseBtn.disabled = true;
      pauseBtn.innerHTML = '<span>⏸</span> Pause';
      pauseBtn.className = 'cdcms-btn cdcms-btn-warning';
    }
    if (stopBtn) stopBtn.disabled = true;

    // 8. Clear CDCMS webpage inputs if present
    const pageConsumerInp = (activeMode === 'CM-43')
      ? DOMFinder.getPfmsConsumerNoInput()
      : DOMFinder.getConsumerNoInput();
    if (pageConsumerInp) {
      pageConsumerInp.value = '';
    }
    const clearBtn = DOMFinder.getClearButton();
    if (clearBtn && activeMode === 'CM-16') {
      clearBtn.click();
    }
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

    const prefix = (activeMode === 'CM-43') ? 'PFMS_Retrigger_Report_' : 'CDCMS_Block_Report_';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${prefix}${new Date().toISOString().slice(0, 10)}.csv`);
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

  // Version comparator for GitHub releases
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

  // Check GitHub for new releases / updates
  async function checkGitHubUpdates(isManual = false) {
    const btn = document.getElementById('cdcms-check-gh-btn');
    const statusText = document.getElementById('cdcms-gh-status-text');
    const banner = document.getElementById('cdcms-update-banner');
    const verLabel = document.getElementById('cdcms-update-ver-label');
    const curVerEl = document.getElementById('cdcms-gh-cur-ver');
    const badgeVerEl = document.getElementById('cdcms-ver-badge');

    const currentVersion = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest)
      ? chrome.runtime.getManifest().version
      : '1.2.0';

    if (curVerEl) curVerEl.textContent = `v${currentVersion}`;
    if (badgeVerEl) badgeVerEl.textContent = `v${currentVersion}`;

    if (isManual) {
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `${ICONS.REFRESH} Checking...`;
      }
      if (statusText) {
        statusText.textContent = '• Checking updates...';
        statusText.style.color = '#0284c7';
      }
    }

    try {
      const res = await fetch(`https://raw.githubusercontent.com/rahulmaithili/cdcms-cancle-tool/main/manifest.json?t=${Date.now()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const remoteVersion = data.version;

      if (compareVersions(remoteVersion, currentVersion) > 0) {
        if (statusText) {
          statusText.textContent = `• New v${remoteVersion} Available! (Run update.bat in tool folder)`;
          statusText.style.color = '#16a34a';
        }
      } else {
        if (statusText) {
          statusText.textContent = isManual ? '• Latest version installed!' : '• Up to date';
          statusText.style.color = '#16a34a';
        }
        if (isManual) {
          setTimeout(() => {
            if (statusText) statusText.textContent = '• Up to date';
          }, 4000);
        }
      }
    } catch (e) {
      if (isManual && statusText) {
        statusText.textContent = '• Check failed (offline)';
        statusText.style.color = '#ef4444';
      }
    } finally {
      if (isManual && btn) {
        btn.disabled = false;
        btn.innerHTML = `${ICONS.REFRESH} Check Update`;
      }
    }
  }

  // Listen to cross-context license synchronization events
  if (typeof window !== 'undefined') {
    window.addEventListener('cdcms_license_synced', () => {
      updateLicenseStateUI();
    });
  }

  // Initialize once DOM is ready and unified storage is synchronized
  async function initApp() {
    if (typeof LicenseManager !== 'undefined' && LicenseManager.ready) {
      await LicenseManager.ready();
    }
    checkAndUpdateScreenVisibility();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initApp());
  } else {
    initApp();
  }

  // Listen for open commands from popup
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'OPEN_PANEL') {
        const screen = detectPageScreen();
        if (!screen) {
          sendResponse({ status: 'unsupported_page' });
          return;
        }
        sessionStorage.removeItem('cdcms_blocker_closed');
        createUI(true); // Force open when user clicks icon
        restoreFromBottom();
        const root = document.getElementById('cdcms-blocker-root');
        if (root) root.style.display = 'block';
        const txt = document.getElementById('cdcms-consumer-list');
        if (txt) txt.focus();
        sendResponse({ status: 'ok' });
      } else if (request.action === 'LICENSE_UPDATED') {
        if (typeof LicenseManager !== 'undefined' && LicenseManager.ready) {
          LicenseManager.ready().then(() => updateLicenseStateUI());
        } else {
          updateLicenseStateUI();
        }
        sendResponse({ status: 'ok' });
      }
    });
  }

  // Periodically check if CDCMS loaded dropdown or changed screen dynamically
  setInterval(() => {
    checkAndUpdateScreenVisibility();
    syncPageReasonOptions();
  }, 1000);

  window.addEventListener('popstate', checkAndUpdateScreenVisibility);
  window.addEventListener('hashchange', checkAndUpdateScreenVisibility);

})();
