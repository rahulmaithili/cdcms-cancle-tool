# HP Gas CDCMS Consumer Auto-Blocker Tool 🚀

A high-performance Chrome Extension for bulk consumer blocking automation on the **HP Gas CDCMS** portal (`Consumer Management / Block Consumer`, ScreenCode `CM-16`).

Integrated with the **[LicenseVault Platform](https://licensescript.netlify.app/)** for secure SaaS licensing, hardware/device binding, auto-expiry management, and instant activation.

---

## 🌟 Key Features

- **100% Automated Workflow**:
  - Automatically inputs Consumer Number.
  - Clicks `Fetch` and waits for details to load.
  - Automatically selects Block Reason (`NonKYC-NCTC-NonGIU Block`).
  - Automatically fills Remarks with `ekyc pending`.
  - Clicks `Block` and confirms the action.
- **LicenseVault Cloud Integration**:
  - Validates licenses in real-time against the [LicenseVault Platform](https://licensescript.netlify.app/).
  - **Device ID Hardware Binding**: Locks each license to a single computer/browser to prevent unauthorized sharing.
  - **Offline Cryptographic Fallback**: Supports `RS-[PLAN]-[YYYYMMDD]-[SIG]` keys for zero downtime even during server maintenance.
- **ASP.NET PostBack Resilience**:
  - Preserves automation job progress across ASP.NET full-page reloads.
  - Remembers pasted consumer lists and activity logs so work is never lost.
- **Smart HP Gas Business Rule Validation**:
  - Detects pending refill orders or cash memo blocks (`"One booking is pending against the consumer. 145"`).
  - Flags problematic consumers as `FAILED`, automatically clears the form, and seamlessly continues with the next consumer.
- **Live Statistics & Controls**:
  - Real-time counters: `Total`, `Blocked (Success)`, `Failed`, and `Remaining`.
  - Live progress bar and activity log.
  - Full `Pause`, `Resume`, and `Stop` controls.
- **Reporting & Export**:
  - One-click CSV / Excel report export.
  - One-click copy for failed consumer numbers.

---

## 🔐 Licensing & Activation (LicenseVault)

### Official License Portal
Visit the official LicenseVault platform to purchase licenses, check activation status, or manage subscriptions:
- **Platform URL**: [https://licensescript.netlify.app/](https://licensescript.netlify.app/)
- **License Validator**: [https://licensescript.netlify.app/#validate-section](https://licensescript.netlify.app/#validate-section)
- **Subscription Plans**: [https://licensescript.netlify.app/#pricing-section](https://licensescript.netlify.app/#pricing-section)

### How Clients Activate the Extension:
1. Open the **HP Gas CDCMS** portal or click the extension icon.
2. If unlicensed, the lock screen displays the unique **Device ID** for the browser.
3. Paste the assigned License Key (e.g. `CDCMS-XXXX-XXXX-...` or `RS-PRO-...`) into the input box.
4. Click **🔑 Activate**.
5. The extension validates the license with the LicenseVault Cloud in real-time, binds the Device ID, and unlocks the full blocking interface.

---

## 🔑 Admin Offline License Generator

For administrator issuance of emergency or offline keys:
1. Open [`license_generator.html`](file:///C:/Users/USER/Videos/Cdcmas%20consumer%20block%20tool/license_generator.html) in Google Chrome.
2. Enter the Client/Agency name.
3. Select validity: `1 Month`, `3 Months`, `6 Months`, `1 Year`, or `Lifetime`.
4. Click **⚡ Generate License Key**.
5. Share directly via the **WhatsApp Share** button.

---

## 🛠️ Chrome Installation Guide

1. Open **Google Chrome**.
2. Navigate to: `chrome://extensions` in the address bar.
3. Turn **ON** **"Developer mode"** in the top-right corner.
4. Click **"Load unpacked"** in the top-left corner.
5. Select this directory:
   `C:\Users\USER\Videos\Cdcmas consumer block tool`
6. The extension **"HP Gas CDCMS Consumer Auto-Blocker"** will be installed immediately.

---

## 📋 Step-by-Step Usage Guide

1. **Log in to HP Gas CDCMS**:
   - Go to `Consumer Management / Block Consumer` (ScreenCode: `CM-16`).
2. **Open the Tool**:
   - Click the floating **`⚡ CDCMS Auto-Blocker`** pill button on the screen or click the extension icon in your Chrome toolbar.
3. **Paste Consumer Numbers**:
   - Paste consumer numbers into the list area (one per line, space, or comma separated).
4. **Configure & Start**:
   - Block Reason: `NonKYC-NCTC-NonGIU Block` (default auto-selected).
   - Remarks: `ekyc pending` (default pre-filled).
   - Click **▶ Start Blocking**.
5. **Download Report**:
   - When finished, click **📥 Download Report (CSV)** for auditing and records.

---

## 🧪 Offline Testing Simulator

To test all automation and licensing capabilities without logging into CDCMS:
1. Open [`test_cdcms_page.html`](file:///C:/Users/USER/Videos/Cdcmas%20consumer%20block%20tool/test_cdcms_page.html) in your Chrome browser.
2. Activate your license using a valid key.
3. Paste test consumer numbers (e.g. `825558`, `825559`, `825560`, `999999`) and click **Start Blocking**.

---

## 👤 Developer & Official Support

- **Developer**: **Mr. Rahul Script**
- **Domain**: Official Copyright & Technical Support • Business Automation Solutions
- **Platform**: [LicenseVault](https://licensescript.netlify.app/)
- **WhatsApp**: [+91 75649 48617](https://wa.me/917564948617)
- **Email**: [life.rahulg@gmail.com](mailto:life.rahulg@gmail.com)

