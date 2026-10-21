/**
 * LicenseWala - Auth & License Bridge for Chrome Extension
 * Runs on https://licensescript.netlify.app/*
 * Seamlessly captures Google Sign-In and License Key for HP Gas CDCMS Tool
 * English Only Implementation
 */

(function() {
  'use strict';

  const SUPABASE_CONFIG = {
    URL: 'https://wyeejbncddpxhwtijkjt.supabase.co',
    ANON_KEY: 'sb_publishable_VfUVN_NPMbe9OudO5ZonPw_kMKaub_u',
    STORAGE_KEY: 'sb-wyeejbncddpxhwtijkjt-auth-token'
  };

  let isHandlingCapture = false;

  // Render a clean notification inside popup when license is captured
  function showSuccessScreen(email, key) {
    try {
      const maskedKey = key ? `${key.substring(0, 7)}••••••••${key.slice(-4)}` : 'Active';
      document.body.innerHTML = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #ffffff; text-align: center; padding: 24px; box-sizing: border-box;">
          <div style="width: 56px; height: 56px; background: rgba(34, 197, 94, 0.2); border: 2px solid #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 style="margin: 0 0 8px 0; font-size: 19px; color: #ffffff; font-weight: 700;">License Activated!</h2>
          <p style="margin: 0 0 12px 0; font-size: 13px; color: #94a3b8; max-width: 320px; line-height: 1.5;">Connected account: <strong style="color: #38bdf8;">${email || 'Google Account'}</strong></p>
          <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 6px 14px; font-family: monospace; font-size: 12px; color: #4ade80; margin-bottom: 14px;">${maskedKey}</div>
          <p style="margin: 0; font-size: 12px; color: #64748b;">Closing window and unlocking HP Gas CDCMS Blocker...</p>
        </div>
      `;
    } catch (e) {}

    setTimeout(() => {
      try { window.close(); } catch (e) {}
    }, 1500);
  }

  // Notify extension runtime and local storage of captured license
  function notifyExtension(key, email, name) {
    if (isHandlingCapture) return;
    isHandlingCapture = true;

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'LICENSE_KEY_CAPTURED',
          key: key,
          email: email,
          customer_name: name
        }, () => {});
      }

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          cdcms_captured_key: key,
          cdcms_captured_email: email,
          cdcms_captured_time: Date.now()
        });
      }

      showSuccessScreen(email, key);
    } catch (err) {
      console.warn('[LicenseWala Bridge] Notification error:', err);
    }
  }

  // Query user licenses from Supabase using user's access token
  async function fetchUserLicense(accessToken, userId) {
    try {
      const url = `${SUPABASE_CONFIG.URL}/rest/v1/licenses?select=*,product:products(*),plan:plans(*)&customer_id=eq.${userId}&order=created_at.desc`;
      const res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_CONFIG.ANON_KEY,
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!res.ok) return null;
      let data = await res.json();

      // If user has no license yet, call trial endpoint to initialize 7-day free trial
      if ((!data || data.length === 0) && window.location.origin.includes('licensescript.netlify.app')) {
        try {
          await fetch('/.netlify/functions/trial-license', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({})
          });

          // Re-fetch after trial creation
          const retryRes = await fetch(url, {
            headers: {
              'apikey': SUPABASE_CONFIG.ANON_KEY,
              'Authorization': `Bearer ${accessToken}`
            }
          });
          if (retryRes.ok) {
            data = await retryRes.json();
          }
        } catch (trialErr) {
          console.warn('[LicenseWala Bridge] Trial init error:', trialErr);
        }
      }

      if (Array.isArray(data) && data.length > 0) {
        const active = data.find(l => l.status === 'active') || data[0];
        return active.license_key || null;
      }
      return null;
    } catch (e) {
      console.warn('[LicenseWala Bridge] License query error:', e);
      return null;
    }
  }

  // Scan localStorage for active Supabase session
  async function checkSupabaseSession() {
    try {
      const raw = localStorage.getItem(SUPABASE_CONFIG.STORAGE_KEY);
      if (!raw) return false;

      const session = JSON.parse(raw);
      const accessToken = session?.access_token;
      const user = session?.user;

      if (accessToken && user && user.id) {
        const email = user.email || '';
        const name = user.user_metadata?.full_name || user.user_metadata?.name || '';
        const licenseKey = await fetchUserLicense(accessToken, user.id);

        if (licenseKey) {
          notifyExtension(licenseKey, email, name);
          return true;
        }
      }
    } catch (e) {
      console.warn('[LicenseWala Bridge] Session check error:', e);
    }
    return false;
  }

  // Scan DOM on account page for license key pattern (LW-...)
  function checkDomForLicenseKey() {
    try {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while (node = walker.nextNode()) {
        const text = (node.nodeValue || '').trim();
        const match = text.match(/\bLW-[A-Z0-9-]{8,}\b/);
        if (match) {
          const foundKey = match[0];
          notifyExtension(foundKey, '', '');
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  // Also check URL hash for explicit tokens
  function checkUrlHash() {
    try {
      const hash = window.location.hash;
      if (hash && hash.includes('id_token=')) {
        const clean = hash.startsWith('#') ? hash.substring(1) : hash;
        const params = new URLSearchParams(clean);
        const idToken = params.get('id_token');
        if (idToken) {
          if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ action: 'GOOGLE_AUTH_TOKEN_CAPTURED', id_token: idToken }, () => {});
          }
          if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            chrome.storage.local.set({ cdcms_google_id_token: idToken, cdcms_google_token_time: Date.now() });
          }
          showSuccessScreen('', 'Google ID Token');
          return true;
        }
      }
    } catch (e) {}
    return false;
  }

  async function performInspection() {
    if (checkUrlHash()) return;
    const sessionFound = await checkSupabaseSession();
    if (sessionFound) return;
    checkDomForLicenseKey();
  }

  // Run immediately and periodically check as page loads React components
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performInspection);
  } else {
    performInspection();
  }

  window.addEventListener('hashchange', performInspection);

  // Monitor DOM changes for dynamically loaded license dashboard
  const observer = new MutationObserver(() => {
    if (!isHandlingCapture) {
      performInspection();
    }
  });

  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // Periodic poll for 15 seconds to ensure fast capture
  let pollCount = 0;
  const pollInterval = setInterval(() => {
    pollCount++;
    if (isHandlingCapture || pollCount > 30) {
      clearInterval(pollInterval);
      return;
    }
    performInspection();
  }, 500);

})();
