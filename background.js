/**
 * LicenseWala - Background Service Worker for HP Gas CDCMS Tool
 * Manages Google Sign-In Window and Cross-Tab License Updates
 * English Only Implementation
 */

let authWindowId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Triggered when user clicks "Sign in with Google" in popup or content script
  if (request.action === 'START_GOOGLE_LOGIN') {
    // Initiate Google Sign-In via the website's Supabase OAuth endpoint
    // This uses the authorized redirect URI registered in Google Cloud Console
    const targetRedirect = 'https://licensescript.netlify.app/account';
    const authUrl = `https://wyeejbncddpxhwtijkjt.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(targetRedirect)}`;

    chrome.windows.create({
      url: authUrl,
      type: 'popup',
      width: 520,
      height: 650,
      focused: true
    }, (win) => {
      if (win) {
        authWindowId = win.id;
      }
      sendResponse({ status: 'launched', windowId: win ? win.id : null });
    });
    return true;
  }

  // License Key captured from user's account on website
  if (request.action === 'LICENSE_KEY_CAPTURED') {
    if (authWindowId !== null) {
      setTimeout(() => {
        if (authWindowId !== null) {
          chrome.windows.remove(authWindowId, () => {
            authWindowId = null;
          });
        }
      }, 1400);
    }

    chrome.storage.local.set({
      cdcms_captured_key: request.key,
      cdcms_captured_email: request.email || '',
      cdcms_captured_name: request.customer_name || '',
      cdcms_captured_time: Date.now()
    }, () => {
      sendResponse({ status: 'key_saved' });
    });
    return true;
  }

  // Google ID token captured from hash (if present)
  if (request.action === 'GOOGLE_AUTH_TOKEN_CAPTURED') {
    if (authWindowId !== null) {
      setTimeout(() => {
        if (authWindowId !== null) {
          chrome.windows.remove(authWindowId, () => {
            authWindowId = null;
          });
        }
      }, 1400);
    }

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

// Close popup window if user finishes in a tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && changeInfo.url.includes('licensescript.netlify.app/account')) {
    // If auth window is currently tracking this tab, let auth_bridge inspect and close
  }
});

// Clean up stored window ID if user closes auth popup manually
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === authWindowId) {
    authWindowId = null;
  }
});
