/**
 * LicenseWala - Software Licensing & Activation Platform Client
 * Official Platform: https://licensescript.netlify.app/
 * Developer Integration: Google Sign-In & License Key Verification
 * English Only Implementation
 */

const LicenseManager = (function() {
  'use strict';

  // LicenseWala Official Configuration
  const CONFIG = {
    PLATFORM_NAME: 'LicenseWala',
    PLATFORM_URL: 'https://licensescript.netlify.app',
    GOOGLE_CLIENT_ID: '17079355400-krquge8l14g0vjp3tbsqmjrkdmh2repk.apps.googleusercontent.com',
    GOOGLE_VERIFY_URL: 'https://licensescript.netlify.app/api/google-verify',
    KEY_VERIFY_URL: 'https://licensescript.netlify.app/api/verify-license',
    PRICING_URL: 'https://licensescript.netlify.app/pricing',
    ACCOUNT_URL: 'https://licensescript.netlify.app/account',
    PRODUCT_SLUG: 'cdcms-pro',
    DEVICE_NAME: 'HP Gas CDCMS Blocker',
    STORAGE_KEY: 'cdcms_license_info',
    DEVICE_ID_KEY: 'cdcms_device_id',
    GOOGLE_TOKEN_KEY: 'cdcms_google_id_token',
    SECRET_SALT: 'RahulScript_SaaS_2026_HPGas_CDCMS_LicKey_Auth',
    MAX_OFFLINE_GRACE_MS: 24 * 60 * 60 * 1000, // 24 hours offline limit
    RECHECK_INTERVAL_MS: 3 * 60 * 60 * 1000,    // Re-verify every 3 hours
    SUPPORT_WHATSAPP: '+917564948617',
    SUPPORT_EMAIL: 'life.rahulg@gmail.com'
  };

  // Shared in-memory cache
  let cachedDeviceId = null;
  let cachedLicense = null;
  let isReady = false;
  let readyResolvers = [];
  let isReverifying = false;

  function ready() {
    return new Promise((resolve) => {
      if (isReady) return resolve();
      readyResolvers.push(resolve);
    });
  }

  function notifyReady() {
    isReady = true;
    while (readyResolvers.length > 0) {
      const r = readyResolvers.shift();
      try { r(); } catch (e) {}
    }
  }

  // 1. Synchronous fallback from localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      cachedDeviceId = localStorage.getItem(CONFIG.DEVICE_ID_KEY) || null;
      const rawLic = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (rawLic) {
        cachedLicense = JSON.parse(rawLic);
      }
    }
  } catch (e) {}

  // 2. Master Synchronization with chrome.storage.local
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get([CONFIG.DEVICE_ID_KEY, CONFIG.STORAGE_KEY], (items) => {
      try {
        if (items && items[CONFIG.DEVICE_ID_KEY]) {
          cachedDeviceId = items[CONFIG.DEVICE_ID_KEY];
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(CONFIG.DEVICE_ID_KEY, cachedDeviceId);
          }
        } else if (cachedDeviceId) {
          chrome.storage.local.set({ [CONFIG.DEVICE_ID_KEY]: cachedDeviceId });
        } else {
          // Generate persistent Hardware ID (HWID)
          const randA = Math.random().toString(36).substring(2, 8).toUpperCase();
          const randB = Math.random().toString(36).substring(2, 8).toUpperCase();
          const timeHex = Date.now().toString(16).toUpperCase();
          cachedDeviceId = `LW-HWID-${randA}-${randB}-${timeHex.slice(-6)}`;
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(CONFIG.DEVICE_ID_KEY, cachedDeviceId);
          }
          chrome.storage.local.set({ [CONFIG.DEVICE_ID_KEY]: cachedDeviceId });
        }

        if (items && items[CONFIG.STORAGE_KEY]) {
          cachedLicense = items[CONFIG.STORAGE_KEY];
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cachedLicense));
          }
        } else if (cachedLicense) {
          chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: cachedLicense });
        }
      } catch (err) {
        console.warn('[LicenseWala] Storage sync error:', err);
      } finally {
        notifyReady();
      }
    });

    // Real-time synchronization across popup, background, and content tabs
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          if (changes[CONFIG.DEVICE_ID_KEY]) {
            cachedDeviceId = changes[CONFIG.DEVICE_ID_KEY].newValue || cachedDeviceId;
            if (typeof localStorage !== 'undefined' && cachedDeviceId) {
              localStorage.setItem(CONFIG.DEVICE_ID_KEY, cachedDeviceId);
            }
          }
          if (changes[CONFIG.STORAGE_KEY]) {
            cachedLicense = changes[CONFIG.STORAGE_KEY].newValue || null;
            if (typeof localStorage !== 'undefined') {
              if (cachedLicense) {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cachedLicense));
              } else {
                localStorage.removeItem(CONFIG.STORAGE_KEY);
              }
            }
            if (typeof window !== 'undefined' && window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('cdcms_license_synced', { detail: cachedLicense }));
            }
          }
          // Listen for token captured by auth_bridge
          if (changes[CONFIG.GOOGLE_TOKEN_KEY] && changes[CONFIG.GOOGLE_TOKEN_KEY].newValue) {
            const capturedToken = changes[CONFIG.GOOGLE_TOKEN_KEY].newValue;
            verifyGoogleIdToken(capturedToken).then(res => {
              if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('cdcms_google_login_completed', { detail: res }));
              }
            }).catch(() => {});
          }
        }
      });
    }
  } else {
    notifyReady();
  }

  /**
   * Generates or retrieves a persistent HWID (hardware/machine fingerprint).
   */
  function getDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    try {
      let id = (typeof localStorage !== 'undefined') ? localStorage.getItem(CONFIG.DEVICE_ID_KEY) : null;
      if (!id) {
        const randA = Math.random().toString(36).substring(2, 8).toUpperCase();
        const randB = Math.random().toString(36).substring(2, 8).toUpperCase();
        const timeHex = Date.now().toString(16).toUpperCase();
        id = `LW-HWID-${randA}-${randB}-${timeHex.slice(-6)}`;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(CONFIG.DEVICE_ID_KEY, id);
        }
      }
      cachedDeviceId = id;
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [CONFIG.DEVICE_ID_KEY]: id });
      }
      return id;
    } catch (e) {
      return 'LW-HWID-DEFAULT-01';
    }
  }

  /**
   * Triggers the Google Sign-in flow via Chrome runtime message to background worker.
   */
  function startGoogleSignIn() {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        // Fallback: Open auth URL in new tab/window
        const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
        const redirectUri = 'https://licensescript.netlify.app/auth/callback';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CONFIG.GOOGLE_CLIENT_ID}&response_type=id_token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=openid%20email%20profile&nonce=${nonce}&prompt=select_account`;
        window.open(authUrl, 'LicenseWalaAuth', 'width=520,height=640');
        resolve({ status: 'opened_window' });
        return;
      }

      chrome.runtime.sendMessage({ action: 'START_GOOGLE_LOGIN' }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(response || { status: 'launched' });
      });
    });
  }

  /**
   * Path A: Verify Google ID Token against LicenseWala server.
   * POST https://licensescript.netlify.app/api/google-verify
   * Body: { id_token, hwid, product_slug }
   */
  async function verifyGoogleIdToken(idToken) {
    if (!idToken || typeof idToken !== 'string') {
      return { valid: false, message: 'Invalid Google authentication token.' };
    }

    const hwid = getDeviceId();
    const payload = {
      id_token: idToken.trim(),
      hwid: hwid,
      product_slug: CONFIG.PRODUCT_SLUG
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(CONFIG.GOOGLE_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const result = await response.json().catch(() => ({}));

      // Rate limited
      if (response.status === 429) {
        return {
          valid: false,
          status: 'rate_limited',
          message: 'Too many requests. Please wait a minute and retry.'
        };
      }

      // Invalid token or unverified email
      if (response.status === 401) {
        return {
          valid: false,
          status: 'unauthorized',
          message: result.message || 'Google authentication expired. Please sign in again.'
        };
      }

      // Active or Grace license
      if (result.active === true) {
        const isGrace = result.status === 'grace';
        const isTrial = result.type === 'trial' || result.trial === true;

        const licenseData = {
          valid: true,
          active: true,
          status: isGrace ? 'grace' : 'active',
          type: isTrial ? 'trial' : 'paid',
          trial: isTrial,
          email: result.email || '',
          customer_name: result.customer_name || 'Customer',
          product_name: result.product_name || 'CDCMS Multi-Tool Suite (PRO)',
          plan_name: result.plan_name || (isTrial ? 'Free Trial' : 'Pro Plan'),
          license_key: result.license_key || '',
          expiry_date: result.expiry_date || result.trial_ends_at || '',
          days_left: typeof result.days_left === 'number' ? result.days_left : 30,
          max_devices: result.max_devices || 1,
          renew_url: result.renew_url || CONFIG.PRICING_URL,
          portal_url: result.portal_url || CONFIG.ACCOUNT_URL,
          message: result.message || (isGrace ? 'License in 3-day grace period. Please renew.' : 'License activated via Google sign-in.'),
          lastVerifiedAt: Date.now(),
          deviceId: hwid,
          authMethod: 'google',
          idToken: idToken // Saved to allow silent background re-verifications while valid
        };

        saveLicense(licenseData);
        return licenseData;
      }

      // License not active (expired, trial_expired, no_license, device_mismatch, etc.)
      const reason = result.reason || 'inactive';
      let message = result.message || '';

      if (!message) {
        switch (reason) {
          case 'expired':
            message = `License expired on ${result.expiry_date || 'earlier date'}. Please renew your plan.`;
            break;
          case 'trial_expired':
            message = 'Your 7-day free trial has expired. Please upgrade to a Pro plan to continue.';
            break;
          case 'no_license':
          case 'no_account':
            message = 'No active license found for this Google account. Choose a plan or activate trial.';
            break;
          case 'device_mismatch':
            message = 'Maximum device limit reached. Please reset your device binding on your LicenseWala account.';
            break;
          case 'locked':
          case 'paused':
          case 'revoked':
            message = 'Your license account is locked or suspended. Please contact LicenseWala support.';
            break;
          default:
            message = 'License verification failed. Please try again.';
            break;
        }
      }

      return {
        valid: false,
        active: false,
        status: reason,
        reason: reason,
        email: result.email || '',
        expiry_date: result.expiry_date || '',
        renew_url: result.renew_url || CONFIG.PRICING_URL,
        portal_url: result.portal_url || CONFIG.ACCOUNT_URL,
        message: message
      };
    } catch (err) {
      console.warn('[LicenseWala] Google verify network error:', err.message);
      return {
        valid: false,
        networkError: true,
        message: 'Could not connect to LicenseWala server. Please check your internet connection.'
      };
    }
  }

  /**
   * Path B: Verify License Key directly against LicenseWala server.
   * POST https://licensescript.netlify.app/api/verify-license
   * Body: { key, hwid, deviceName }
   */
  async function verifyLicenseKey(keyString) {
    const cleanKey = (keyString || '').trim().toUpperCase();
    if (!cleanKey) {
      return { valid: false, message: 'Please enter a license key.' };
    }

    // Emergency offline check for offline-signed keys (RS-...) if provided
    if (cleanKey.startsWith('RS-')) {
      const offlineRes = validateOfflineKey(cleanKey);
      if (offlineRes.valid) {
        saveLicense(offlineRes);
        return offlineRes;
      }
    }

    const hwid = getDeviceId();
    const payload = {
      key: cleanKey,
      hwid: hwid,
      deviceName: CONFIG.DEVICE_NAME
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(CONFIG.KEY_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const result = await response.json().catch(() => ({}));

      if (result.valid === true || result.status === 'active' || result.status === 'grace') {
        const isGrace = result.status === 'grace';
        const isTrial = result.trial === true || cleanKey.startsWith('LW-TRIAL-');

        const licenseData = {
          valid: true,
          active: true,
          status: isGrace ? 'grace' : 'active',
          type: isTrial ? 'trial' : 'paid',
          trial: isTrial,
          plan_name: result.plan_name || (isTrial ? 'Free Trial' : 'Pro Plan'),
          product_name: result.product_name || 'CDCMS Multi-Tool Suite (PRO)',
          license_key: cleanKey,
          key: cleanKey,
          days_left: typeof result.days_left === 'number' ? result.days_left : 30,
          expiry_date: result.expires_at || result.trial_ends_at || '',
          renew_url: result.renewal_url || result.renew_url || CONFIG.PRICING_URL,
          portal_url: result.portal_url || CONFIG.ACCOUNT_URL,
          message: result.message || (isGrace ? 'License in 3-day grace period. Please renew.' : 'License active!'),
          lastVerifiedAt: Date.now(),
          deviceId: hwid,
          authMethod: 'key'
        };

        saveLicense(licenseData);
        return licenseData;
      }

      // Expired / Invalid
      const reason = result.status || 'invalid';
      let message = result.message || '';
      if (!message) {
        if (reason === 'expired') {
          message = 'License key has expired. Please renew on LicenseWala.';
        } else if (reason === 'device_mismatch') {
          message = 'Key is already bound to another machine. Please reset device lock on website.';
        } else {
          message = 'Invalid License Key. Please check and try again.';
        }
      }

      return {
        valid: false,
        active: false,
        status: reason,
        reason: reason,
        renew_url: result.renewal_url || result.renew_url || CONFIG.PRICING_URL,
        message: message
      };
    } catch (err) {
      console.warn('[LicenseWala] Key verify network error:', err.message);
      // Fallback: Check if we have an active offline grace session for this key
      const current = checkLicenseStatus();
      if (current && current.valid && current.key === cleanKey) {
        return current;
      }
      return {
        valid: false,
        networkError: true,
        message: 'Could not connect to LicenseWala server. Please check your internet connection.'
      };
    }
  }

  /**
   * Cryptographic signature generator for offline license keys (emergency fallback).
   */
  function generateSignature(plan, expiryDate, salt) {
    const raw = `${plan}:${expiryDate}:${salt}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const hex1 = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    let hash2 = 5381;
    for (let i = raw.length - 1; i >= 0; i--) {
      hash2 = ((hash2 << 5) + hash2) + raw.charCodeAt(i);
      hash2 = hash2 & hash2;
    }
    const hex2 = Math.abs(hash2).toString(16).toUpperCase().padStart(6, '0');
    return (hex1 + hex2).substring(0, 10);
  }

  /**
   * Validates an offline cryptographic backup key (RS-[PLAN]-[YYYYMMDD]-[SIG]).
   */
  function validateOfflineKey(keyString) {
    if (!keyString || typeof keyString !== 'string') {
      return { valid: false, message: 'Please enter a license key.' };
    }

    const cleanKey = keyString.trim().toUpperCase();
    const parts = cleanKey.split('-');
    if (parts.length !== 4 || parts[0] !== 'RS') {
      return { valid: false, message: 'Invalid License Key format.' };
    }

    const plan = parts[1];
    const expiryStr = parts[2];
    const signature = parts[3];

    const expectedSig = generateSignature(plan, expiryStr, CONFIG.SECRET_SALT);
    if (signature !== expectedSig) {
      return { valid: false, message: 'Invalid License Key signature.' };
    }

    if (expiryStr !== '99991231') {
      const year = parseInt(expiryStr.substring(0, 4), 10);
      const month = parseInt(expiryStr.substring(4, 6), 10) - 1;
      const day = parseInt(expiryStr.substring(6, 8), 10);
      const expiryDate = new Date(year, month, day, 23, 59, 59);

      if (isNaN(expiryDate.getTime())) {
        return { valid: false, message: 'Invalid expiry date encoded in key.' };
      }

      if (new Date() > expiryDate) {
        return {
          valid: false,
          expired: true,
          status: 'expired',
          renew_url: CONFIG.PRICING_URL,
          message: `License expired on ${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}. Please renew on LicenseWala.`
        };
      }

      const formattedExpiry = `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`;
      const diffMs = expiryDate.getTime() - Date.now();
      const remainingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      return {
        valid: true,
        active: true,
        status: 'active',
        type: 'paid',
        plan_name: plan,
        expiry_date: formattedExpiry,
        days_left: remainingDays,
        key: cleanKey,
        license_key: cleanKey,
        customer_name: 'Authorized User',
        deviceId: getDeviceId(),
        source: 'Offline Signature',
        lastVerifiedAt: Date.now(),
        message: 'License Active'
      };
    } else {
      return {
        valid: true,
        active: true,
        status: 'active',
        type: 'paid',
        plan_name: plan,
        expiry_date: 'Lifetime (No Expiry)',
        days_left: 9999,
        lifetime: true,
        key: cleanKey,
        license_key: cleanKey,
        customer_name: 'Authorized User',
        deviceId: getDeviceId(),
        source: 'Lifetime Signature',
        lastVerifiedAt: Date.now(),
        message: 'Lifetime License Active'
      };
    }
  }

  /**
   * Robust date parser for all date formats.
   */
  function parseExpiryDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return null;
    const s = dateStr.trim();
    if (s === '99991231' || s.toLowerCase().includes('lifetime')) {
      return new Date(9999, 11, 31, 23, 59, 59);
    }
    if (/^\d{8}$/.test(s)) {
      const y = parseInt(s.substring(0, 4), 10);
      const m = parseInt(s.substring(4, 6), 10) - 1;
      const d = parseInt(s.substring(6, 8), 10);
      return new Date(y, m, d, 23, 59, 59);
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) {
      const parts = s.split('/');
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      return new Date(y, m, d, 23, 59, 59);
    }
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
      const parts = s.split('T')[0].split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d, 23, 59, 59);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Formats a date object as DD/MM/YYYY.
   */
  function formatDate(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Evaluates the current license status.
   * Handles active, grace, trial, expired, offline grace, and unlicensed states.
   */
  function checkLicenseStatus() {
    try {
      let parsed = cachedLicense;
      if (!parsed && typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (raw) parsed = JSON.parse(raw);
      }

      if (!parsed || (!parsed.valid && !parsed.active)) {
        return {
          status: 'unlicensed',
          valid: false,
          active: false,
          renew_url: CONFIG.PRICING_URL,
          portal_url: CONFIG.ACCOUNT_URL,
          message: 'Sign in with your LicenseWala account or enter a license key to unlock.'
        };
      }

      // Check Offline Grace Period (Max 24 hours from last successful check)
      const lastCheck = parsed.lastVerifiedAt || 0;
      const offlineElapsed = Date.now() - lastCheck;
      if (lastCheck > 0 && offlineElapsed > CONFIG.MAX_OFFLINE_GRACE_MS) {
        return {
          ...parsed,
          status: 'offline_expired',
          valid: false,
          active: false,
          renew_url: CONFIG.PRICING_URL,
          message: 'Offline limit reached (24 hours). Please connect to the internet to verify your license.'
        };
      }

      // Paid license inside 3-day grace period
      if (parsed.status === 'grace') {
        return {
          ...parsed,
          status: 'grace',
          valid: true,
          active: true,
          grace: true,
          remainingDays: 0,
          formattedExpiry: parsed.expiry_date || 'Grace Period',
          renew_url: parsed.renew_url || CONFIG.PRICING_URL,
          message: parsed.message || 'License expired! 3-day grace period active. Please renew now.'
        };
      }

      // Check explicit expiry if date available
      const expDate = parseExpiryDate(parsed.expiry_date || parsed.expiry);
      if (expDate) {
        const diffMs = expDate.getTime() - Date.now();
        const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffMs <= 0 || daysLeft <= 0) {
          const isTrial = parsed.type === 'trial' || parsed.trial === true;
          return {
            ...parsed,
            status: isTrial ? 'trial_expired' : 'expired',
            valid: false,
            active: false,
            expired: true,
            remainingDays: 0,
            formattedExpiry: formatDate(expDate),
            renew_url: parsed.renew_url || CONFIG.PRICING_URL,
            message: isTrial
              ? 'Your 7-day free trial has expired. Please buy a plan on LicenseWala.'
              : `License expired on ${formatDate(expDate)}. Please renew on LicenseWala.`
          };
        }

        return {
          ...parsed,
          status: 'active',
          valid: true,
          active: true,
          remainingDays: daysLeft,
          formattedExpiry: formatDate(expDate),
          renew_url: parsed.renew_url || CONFIG.PRICING_URL,
          message: parsed.message || `Active License: ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`
        };
      }

      // Default active
      if (parsed.valid || parsed.active) {
        return {
          ...parsed,
          status: 'active',
          valid: true,
          active: true,
          remainingDays: typeof parsed.days_left === 'number' ? parsed.days_left : 30,
          formattedExpiry: parsed.expiry_date || 'Active',
          renew_url: parsed.renew_url || CONFIG.PRICING_URL,
          message: parsed.message || 'License Active'
        };
      }

      return {
        status: 'unlicensed',
        valid: false,
        active: false,
        renew_url: CONFIG.PRICING_URL,
        message: 'Please activate your license on LicenseWala.'
      };
    } catch (e) {
      return {
        status: 'unlicensed',
        valid: false,
        active: false,
        renew_url: CONFIG.PRICING_URL,
        message: 'Could not read license. Please sign in again.'
      };
    }
  }

  /**
   * Retrieves active license. Returns object ONLY if active.
   */
  function getStoredLicense() {
    const status = checkLicenseStatus();
    if (status && status.valid && status.active) {
      return status;
    }
    return null;
  }

  /**
   * Saves verified license data to persistent storage across popup & content scripts.
   */
  function saveLicense(licenseData) {
    try {
      const payload = {
        ...licenseData,
        lastVerifiedAt: Date.now(),
        deviceId: getDeviceId()
      };
      cachedLicense = payload;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: payload });
      }
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('cdcms_license_synced', { detail: payload }));
      }
    } catch (e) {}
  }

  /**
   * Removes license (deactivation) across all storage locations.
   */
  function removeLicense() {
    try {
      cachedLicense = null;
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove([CONFIG.STORAGE_KEY, CONFIG.GOOGLE_TOKEN_KEY]);
      }
      if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('cdcms_license_synced', { detail: null }));
      }
    } catch (e) {}
  }

  /**
   * Background re-verification of the license on start or periodic schedule.
   */
  async function reverifyInBackground() {
    if (isReverifying) return;
    const lic = getStoredLicense();
    if (!lic) return;

    isReverifying = true;
    try {
      if (lic.authMethod === 'key' && (lic.key || lic.license_key)) {
        await verifyLicenseKey(lic.key || lic.license_key);
      } else if (lic.idToken) {
        await verifyGoogleIdToken(lic.idToken);
      }
    } catch (e) {
      console.warn('[LicenseWala] Background reverify check skipped:', e.message);
    } finally {
      isReverifying = false;
    }
  }

  // Auto trigger background re-verification after start
  setTimeout(() => {
    reverifyInBackground();
  }, 4000);

  // Periodic reverify interval
  setInterval(() => {
    reverifyInBackground();
  }, CONFIG.RECHECK_INTERVAL_MS);

  return {
    CONFIG,
    ready,
    getDeviceId,
    startGoogleSignIn,
    verifyGoogleIdToken,
    verifyLicenseKey,
    validateKeyAsync: verifyLicenseKey, // Backward compatibility alias
    validateOfflineKey,
    checkLicenseStatus,
    getStoredLicense,
    saveLicense,
    removeLicense,
    reverifyInBackground,
    parseExpiryDate,
    formatDate
  };
})();

if (typeof window !== 'undefined') {
  window.LicenseManager = LicenseManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LicenseManager;
}
