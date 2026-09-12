/**
 * LicenseVault - Next-Gen Software Licensing & Activation Platform Client
 * Official Platform: https://licensescript.netlify.app/
 * Developed by Mr. Rahul Script
 * English Only Implementation
 */

const LicenseManager = (function() {
  'use strict';

  // LicenseVault Configuration
  const CONFIG = {
    PLATFORM_NAME: 'LicenseVault',
    PLATFORM_URL: 'https://licensescript.netlify.app/',
    VALIDATE_URL: 'https://licensescript.netlify.app/#validate-section',
    PRODUCTS_URL: 'https://licensescript.netlify.app/#products-section',
    GAS_API_URL: 'https://script.google.com/macros/s/AKfycbyniiGJoVV3_P2KKifUfw-8U8E-1EnYGEKpc3wByfdsmKKDKkedI87UR5nS4SUln3aE/exec',
    SECRET_SALT: 'RahulScript_SaaS_2026_HPGas_CDCMS_LicKey_Auth',
    STORAGE_KEY: 'cdcms_license_info',
    DEVICE_ID_KEY: 'cdcms_device_id',
    SUPPORT_WHATSAPP: '+917564948617',
    SUPPORT_EMAIL: 'life.rahulg@gmail.com'
  };

  /**
   * Generates or retrieves a unique persistent device ID for this browser.
   * Used by LicenseVault to bind 1 license key to 1 device.
   */
  function getDeviceId() {
    try {
      let id = localStorage.getItem(CONFIG.DEVICE_ID_KEY);
      if (!id) {
        const randA = Math.random().toString(36).substring(2, 8).toUpperCase();
        const randB = Math.random().toString(36).substring(2, 8).toUpperCase();
        const timeHex = Date.now().toString(16).toUpperCase();
        id = `LV-${randA}-${randB}-${timeHex.slice(-6)}`;
        localStorage.setItem(CONFIG.DEVICE_ID_KEY, id);
      }
      return id;
    } catch (e) {
      return 'LV-DEVICE-DEFAULT-01';
    }
  }

  /**
   * Cryptographic signature generator for offline license keys.
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
   * Generates a valid offline license key (used by admin or key generator).
   */
  function createLicenseKey(plan = 'PRO', expiryDateStr = '20271231') {
    const sig = generateSignature(plan.toUpperCase(), expiryDateStr, CONFIG.SECRET_SALT);
    return `RS-${plan.toUpperCase()}-${expiryDateStr}-${sig}`;
  }

  /**
   * Validates an offline cryptographic license key (RS-[PLAN]-[YYYYMMDD]-[SIG]).
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
          message: `License expired on ${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}. Please renew on LicenseVault.`
        };
      }

      const formattedExpiry = `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')}/${year}`;
      return {
        valid: true,
        status: 'active',
        plan: plan,
        expiry: formattedExpiry,
        expiryRaw: expiryStr,
        lifetime: false,
        key: cleanKey,
        name: 'Authorized User',
        company: 'Licensed HP Gas Agency',
        deviceId: getDeviceId(),
        source: 'Cryptographic Key',
        message: 'License Active'
      };
    } else {
      return {
        valid: true,
        status: 'active',
        plan: plan,
        expiry: 'Lifetime (No Expiry)',
        expiryRaw: '99991231',
        lifetime: true,
        key: cleanKey,
        name: 'Authorized User',
        company: 'Licensed HP Gas Agency',
        deviceId: getDeviceId(),
        source: 'Lifetime Cryptographic Key',
        message: 'Lifetime License Active'
      };
    }
  }

  /**
   * Online real-time verification against LicenseVault Cloud API.
   * Query: ?action=verify_license&licenseKey=...&deviceId=...
   */
  async function verifyOnline(keyString) {
    const cleanKey = (keyString || '').trim().toUpperCase();
    if (!cleanKey) {
      return { valid: false, message: 'Please enter a license key.' };
    }

    const deviceId = getDeviceId();
    const apiUrl = `${CONFIG.GAS_API_URL}?action=verify_license&licenseKey=${encodeURIComponent(cleanKey)}&deviceId=${encodeURIComponent(deviceId)}&t=${Date.now()}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      const response = await fetch(apiUrl, {
        method: 'GET',
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const result = await response.json();
      const status = (result.status || '').toLowerCase();

      if (status === 'active') {
        return {
          valid: true,
          status: 'active',
          key: cleanKey,
          name: result.name || 'Subscriber',
          company: result.company || 'Licensed Agency',
          expiry: result.expiry || 'Active',
          plan: result.plan || 'PRO',
          deviceId: deviceId,
          source: 'LicenseVault Cloud',
          message: 'License verified successfully on LicenseVault Cloud!'
        };
      } else if (status === 'pending' || status === 'pending_payment') {
        return {
          valid: false,
          status: 'pending',
          message: 'Payment verification pending. Admin approval is in progress on LicenseVault.'
        };
      } else if (status === 'expired') {
        return {
          valid: false,
          status: 'expired',
          expired: true,
          message: `License expired on ${result.expiry || 'previous term'}. Please renew your subscription on LicenseVault.`
        };
      } else if (status === 'blocked') {
        return {
          valid: false,
          status: 'blocked',
          message: 'License has been blocked by administrator. Please contact LicenseVault support.'
        };
      } else if (status === 'device_mismatch') {
        return {
          valid: false,
          status: 'device_mismatch',
          message: result.message || 'License is locked to another computer. Reset device lock on LicenseVault dashboard.'
        };
      } else {
        return {
          valid: false,
          status: 'invalid',
          message: result.message || 'License key is invalid or not found on LicenseVault.'
        };
      }
    } catch (err) {
      console.warn('[LicenseVault] Online verification failed (network/timeout):', err.message);
      return {
        valid: false,
        networkError: true,
        message: 'Could not connect to LicenseVault server. Checking offline fallback...'
      };
    }
  }

  /**
   * Dual-mode validator: Checks LicenseVault Cloud first, then falls back to offline cryptographic signature.
   */
  async function validateKeyAsync(keyString) {
    const cleanKey = (keyString || '').trim().toUpperCase();
    if (!cleanKey) {
      return { valid: false, message: 'Please enter a license key.' };
    }

    // 1. If key format is an offline cryptographic key (RS-...), test locally first
    if (cleanKey.startsWith('RS-')) {
      const offlineResult = validateOfflineKey(cleanKey);
      if (offlineResult.valid) {
        return offlineResult;
      }
    }

    // 2. Query LicenseVault Cloud API in real-time
    const onlineResult = await verifyOnline(cleanKey);
    if (onlineResult.valid) {
      return onlineResult;
    }

    // 3. If online returned network error, try offline check as fallback
    if (onlineResult.networkError) {
      const fallbackCheck = validateOfflineKey(cleanKey);
      if (fallbackCheck.valid) {
        return fallbackCheck;
      }
      return {
        valid: false,
        message: 'Network connection failed. Please check your internet connection and try again.'
      };
    }

    return onlineResult;
  }

  /**
   * Synchronous validation check (for instant local / cached verification).
   */
  function validateKey(keyString) {
    if (!keyString || typeof keyString !== 'string') {
      return { valid: false, message: 'Please enter a license key.' };
    }

    const cleanKey = keyString.trim().toUpperCase();

    // Check offline key format
    if (cleanKey.startsWith('RS-')) {
      return validateOfflineKey(cleanKey);
    }

    // Check cached active license
    const stored = getStoredLicense();
    if (stored && stored.key === cleanKey && stored.valid) {
      return stored;
    }

    return {
      valid: false,
      message: 'Cloud verification required. Click Activate to verify online with LicenseVault.'
    };
  }

  /**
   * Retrieves stored active license.
   */
  function getStoredLicense() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);

      // Re-verify expiry if date is present
      if (parsed.expiryRaw && parsed.expiryRaw !== '99991231') {
        const year = parseInt(parsed.expiryRaw.substring(0, 4), 10);
        const month = parseInt(parsed.expiryRaw.substring(4, 6), 10) - 1;
        const day = parseInt(parsed.expiryRaw.substring(6, 8), 10);
        const expiryDate = new Date(year, month, day, 23, 59, 59);
        if (new Date() > expiryDate) {
          return null;
        }
      } else if (parsed.expiry && parsed.expiry !== 'Lifetime (No Expiry)' && parsed.expiry !== 'Active') {
        const parsedDate = new Date(parsed.expiry);
        if (!isNaN(parsedDate.getTime()) && new Date() > parsedDate) {
          return null;
        }
      }

      return parsed;
    } catch (e) {
      return null;
    }
  }

  /**
   * Saves verified license data to persistent storage.
   */
  function saveLicense(licenseData) {
    try {
      const payload = {
        ...licenseData,
        lastVerifiedAt: Date.now(),
        deviceId: getDeviceId()
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(payload));
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [CONFIG.STORAGE_KEY]: payload });
      }
    } catch (e) {}
  }

  /**
   * Removes license (deactivation).
   */
  function removeLicense() {
    try {
      localStorage.removeItem(CONFIG.STORAGE_KEY);
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.remove([CONFIG.STORAGE_KEY]);
      }
    } catch (e) {}
  }

  return {
    CONFIG,
    getDeviceId,
    validateKey,
    validateKeyAsync,
    validateOfflineKey,
    verifyOnline,
    createLicenseKey,
    getStoredLicense,
    saveLicense,
    removeLicense
  };
})();

if (typeof window !== 'undefined') {
  window.LicenseManager = LicenseManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LicenseManager;
}
