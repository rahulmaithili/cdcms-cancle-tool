/**
 * LicenseWala - Google OAuth Bridge for Chrome Extension
 * Runs on https://licensescript.netlify.app/* to capture Google ID tokens
 * English Only Implementation
 */

(function() {
  'use strict';

  function checkForAuthToken() {
    try {
      const hash = window.location.hash;
      if (hash && hash.includes('id_token=')) {
        const cleanHash = hash.startsWith('#') ? hash.substring(1) : hash;
        const params = new URLSearchParams(cleanHash);
        const idToken = params.get('id_token');

        if (idToken) {
          // Notify the Chrome extension background / popup / content scripts
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
              action: 'GOOGLE_AUTH_TOKEN_CAPTURED',
              id_token: idToken
            }, () => {
              // Ignore callback errors if receiver closed
            });
          }

          // Also store in chrome.storage.local for cross-context availability
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
              cdcms_google_id_token: idToken,
              cdcms_google_token_time: Date.now()
            });
          }

          // Render a clean, reassuring UI inside the auth popup window
          try {
            document.body.innerHTML = `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #ffffff; text-align: center; padding: 20px; box-sizing: border-box;">
                <div style="width: 52px; height: 52px; background: rgba(34, 197, 94, 0.2); border: 2px solid #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h2 style="margin: 0 0 8px 0; font-size: 18px; color: #ffffff;">Google Sign-In Successful!</h2>
                <p style="margin: 0; font-size: 13px; color: #94a3b8; max-width: 320px; line-height: 1.5;">Activating your license on HP Gas CDCMS Tool... This window will close automatically.</p>
              </div>
            `;
          } catch (e) {}

          // Automatically close the popup window after a brief moment
          setTimeout(() => {
            try { window.close(); } catch (e) {}
          }, 1200);
        }
      }
    } catch (err) {
      console.warn('[LicenseWala Bridge] Token capture error:', err);
    }
  }

  // Check immediately on load and on hashchange
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkForAuthToken);
  } else {
    checkForAuthToken();
  }
  window.addEventListener('hashchange', checkForAuthToken);
})();
