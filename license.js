// License Management & Cryptographic Validation Module
// Developed by Mr. Rahul Script - Business Automation Solutions

const LicenseManager = (function() {
  'use strict';

  // Secret Salt for cryptographic signature verification
  const SECRET_SALT = 'RahulScript_SaaS_2026_HPGas_CDCMS_LicKey_Auth';
  const STORAGE_KEY = 'cdcms_license_info';

  // Simple and fast hash function for signature verification
  function generateSignature(plan, expiryDate, salt) {
    const raw = `${plan}:${expiryDate}:${salt}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Hex 8-character string
    const hex1 = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0');
    // Secondary hash for 12-character high collision resistance
    let hash2 = 5381;
    for (let i = raw.length - 1; i >= 0; i--) {
      hash2 = ((hash2 << 5) + hash2) + raw.charCodeAt(i);
      hash2 = hash2 & hash2;
    }
    const hex2 = Math.abs(hash2).toString(16).toUpperCase().padStart(6, '0');
    return (hex1 + hex2).substring(0, 10);
  }

  // Generate a valid license key (Used by generator and SaaS)
  function createLicenseKey(plan = 'PRO', expiryDateStr = '20271231') {
    const sig = generateSignature(plan.toUpperCase(), expiryDateStr, SECRET_SALT);
    return `RS-${plan.toUpperCase()}-${expiryDateStr}-${sig}`;
  }

  // Validate a license key string
  function validateKey(keyString) {
    if (!keyString || typeof keyString !== 'string') {
      return { valid: false, message: 'Please enter a license key' };
    }

    const cleanKey = keyString.trim().toUpperCase();

    // Check Format: RS-[PLAN]-[YYYYMMDD]-[SIG]
    const parts = cleanKey.split('-');
    if (parts.length !== 4 || parts[0] !== 'RS') {
      return { valid: false, message: 'Invalid License Key format' };
    }

    const plan = parts[1];
    const expiryStr = parts[2];
    const signature = parts[3];

    // Verify signature
    const expectedSig = generateSignature(plan, expiryStr, SECRET_SALT);
    if (signature !== expectedSig) {
      return { valid: false, message: 'Invalid License Key signature' };
    }

    // Check expiry
    if (expiryStr !== '99991231') { // 99991231 is Lifetime
      const year = parseInt(expiryStr.substring(0, 4), 10);
      const month = parseInt(expiryStr.substring(4, 6), 10) - 1;
      const day = parseInt(expiryStr.substring(6, 8), 10);
      const expiryDate = new Date(year, month, day, 23, 59, 59);

      if (isNaN(expiryDate.getTime())) {
        return { valid: false, message: 'Invalid expiry date in key' };
      }

      if (new Date() > expiryDate) {
        return { 
          valid: false, 
          expired: true, 
          message: `License expired on ${day.toString().padStart(2,'0')}/${(month+1).toString().padStart(2,'0')}/${year}. Please contact Mr. Rahul Script to renew.` 
        };
      }

      const formattedExpiry = `${day.toString().padStart(2,'0')}/${(month+1).toString().padStart(2,'0')}/${year}`;
      return {
        valid: true,
        plan: plan,
        expiry: formattedExpiry,
        expiryRaw: expiryStr,
        lifetime: false,
        key: cleanKey,
        message: 'License Active'
      };
    } else {
      return {
        valid: true,
        plan: plan,
        expiry: 'Lifetime (No Expiry)',
        expiryRaw: '99991231',
        lifetime: true,
        key: cleanKey,
        message: 'Lifetime License Active'
      };
    }
  }

  // Get current stored license
  function getStoredLicense() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      // Re-verify expiry every time
      const check = validateKey(parsed.key);
      if (check.valid) {
        return { ...parsed, ...check };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Save license
  function saveLicense(licenseData) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(licenseData));
    } catch (e) {}
  }

  // Remove license
  function removeLicense() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  return {
    validateKey,
    createLicenseKey,
    getStoredLicense,
    saveLicense,
    removeLicense,
    SECRET_SALT
  };
})();

if (typeof window !== 'undefined') {
  window.LicenseManager = LicenseManager;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LicenseManager;
}
