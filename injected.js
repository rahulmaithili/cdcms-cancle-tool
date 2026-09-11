// Intercept window.alert and window.confirm to allow automated execution without modal blocking
(function() {
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;

  window.cdcmasLastAlertMessage = '';

  window.alert = function(msg) {
    console.log('[CDCMS Blocker Alert Intercepted]:', msg);
    window.cdcmasLastAlertMessage = msg || '';
    window.postMessage({
      source: 'CDCMS_BLOCKER_INJECTED',
      type: 'ALERT_TRIGGERED',
      message: String(msg)
    }, '*');
    // We suppress the blocking native dialog so automation doesn't pause
    return true;
  };

  window.confirm = function(msg) {
    console.log('[CDCMS Blocker Confirm Intercepted]:', msg);
    window.cdcmasLastAlertMessage = msg || '';
    window.postMessage({
      source: 'CDCMS_BLOCKER_INJECTED',
      type: 'CONFIRM_TRIGGERED',
      message: String(msg)
    }, '*');
    // Automatically confirm yes to block
    return true;
  };
})();
