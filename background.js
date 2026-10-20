/**
 * LicenseWala - Background Service Worker for HP Gas CDCMS Tool
 * Manages Google Sign-In Window and Periodic License Re-checks
 * English Only Implementation
 */

let authWindowId = null;

// Listen to messages from content script, popup, or auth_bridge
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_GOOGLE_LOGIN') {
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const clientId = '17079355400-krquge8l14g0vjp3tbsqmjrkdmh2repk.apps.googleusercontent.com';
    const redirectUri = 'https://licensescript.netlify.app/auth/callback';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20email%20profile&nonce=${nonce}&prompt=select_account`;

    // Open a dedicated centered popup window for Google login
    chrome.windows.create({
      url: authUrl,
      type: 'popup',
      width: 520,
      height: 640,
      focused: true
    }, (win) => {
      if (win) {
        authWindowId = win.id;
      }
      sendResponse({ status: 'launched', windowId: win ? win.id : null });
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === 'GOOGLE_AUTH_TOKEN_CAPTURED') {
    // If the auth window is still open, close it
    if (authWindowId !== null) {
      chrome.windows.remove(authWindowId, () => {
        authWindowId = null;
      });
    }

    // Broadcast captured token to all open extension views/tabs
    chrome.storage.local.set({
      cdcms_google_id_token: request.id_token,
      cdcms_google_token_time: Date.now()
    }, () => {
      sendResponse({ status: 'token_saved' });
    });
    return true;
  }

  if (request.action === 'RELOAD_EXTENSION') {
    chrome.runtime.reload();
  }
});

// Intercept redirect tab in background if user logged in via full tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('licensescript.netlify.app') && changeInfo.url.includes('id_token=')) {
    try {
      const urlObj = new URL(changeInfo.url);
      const hash = urlObj.hash ? urlObj.hash.substring(1) : '';
      const params = new URLSearchParams(hash);
      const idToken = params.get('id_token');

      if (idToken) {
        chrome.storage.local.set({
          cdcms_google_id_token: idToken,
          cdcms_google_token_time: Date.now()
        }, () => {
          // If this tab was part of our popup window, close it
          if (authWindowId) {
            chrome.windows.remove(authWindowId, () => {
              authWindowId = null;
            });
          } else {
            chrome.tabs.remove(tabId);
          }
        });
      }
    } catch (e) {
      console.warn('[Background] Tab URL parse error:', e);
    }
  }
});
