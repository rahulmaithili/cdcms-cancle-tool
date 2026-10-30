# HP Gas CDCMS Automation Tool

> Bulk consumer blocking (CM-16) and PFMS beneficiary retrigger (CM-43)
> on the HP Gas CDCMS portal — paste a list, and the tool works through
> it for you.

![Version](https://img.shields.io/badge/version-1.3.3-blue)
![Manifest](https://img.shields.io/badge/manifest-V3-green)
![License](https://img.shields.io/badge/license-LicenseWala%20Subscription-purple)

---

## What it does

HP Gas distributors often need to block hundreds of consumers at once,
or retrigger PFMS beneficiary records one by one. Doing that by hand on
the CDCMS portal is slow and error-prone.

**HP Gas CDCMS Automation Tool** automates both jobs:

- **CM-16 Block Consumer** — pastes consumer numbers, fetches each
  consumer's details, selects the block reason, fills the remarks, and
  confirms the block automatically.
- **CM-43 PFMS Beneficiary Retrigger** — retriggers beneficiary records
  in bulk on the PFMS screen.
- **Business-rule aware** — if CDCMS reports a problem for a consumer
  (for example a pending booking), that consumer is marked `FAILED`,
  the form is cleared, and the run continues with the next consumer
  instead of freezing.
- **Built for 50+ batches** — every item has its own timeout, so one
  slow portal response can no longer stall the whole batch forever.

## Features

- **Bulk lists** — paste consumer numbers separated by line, space, or
  comma.
- **Automatic block flow** — Fetch → Block Reason
  (`NonKYC-NCTC-NonGIU Block`) → Remarks (`ekyc pending`) → Block →
  Confirm, all automatic.
- **Per-item delay** — configurable delay between items (default 2.5s)
  so the portal is never hammered.
- **Live statistics** — Total, Blocked (Success), Failed, and
  Remaining counters, progress bar, and a live activity log.
- **Pause, Resume, Stop** — full control mid-run, plus a 1-click batch
  reset to start a fresh list instantly.
- **Reporting** — one-click CSV / Excel export, and one-click copy of
  failed consumer numbers.
- **ASP.NET PostBack resilience** — job progress, pasted lists, and
  logs survive the portal's full-page reloads.
- **License protected** — the tool activates with a LicenseWala
  subscription license key and locks automatically when the license
  expires, is revoked, or is blocked by the administrator.

## Installation

1. Download this repository (Code → Download ZIP) and extract it, or
   clone it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the extracted folder.
5. Open the CDCMS portal — the tool panel appears on the CM-16 / CM-43
   pages. Activate it with your LicenseWala license key.

## Keeping it updated

The extension checks GitHub for new versions and shows an
`Update Available` banner when one is released. To update in one click,
double-click **`update.bat`** in the extension folder, then click the
Reload icon for the extension on `chrome://extensions`.

## License activation

A valid **LicenseWala subscription license** is required. Keys are
issued from the LicenseWala portal
([licensescript.netlify.app](https://licensescript.netlify.app/)).

- Enter your key in the tool panel → **Activate**.
- The key is verified online against the LicenseWala server, together
  with an anonymous device identifier (one device per license).
- The license is re-verified every 30 minutes while the tool runs. If
  the license expires, is revoked, or is blocked by the administrator,
  the tool locks immediately and shows a renewal prompt. Your lists and
  logs stay safe and are restored as soon as a valid license is
  activated again.
- Network problems do not lock you out instantly: a short grace period
  (max 24 hours from the last successful verification) covers temporary
  outages.

> Only LicenseWala-issued keys work. Older offline/emergency keys are
> no longer accepted — if you hold one, replace it with a LicenseWala
> key from the portal.

## Privacy

- Consumer numbers and run logs are processed on the CDCMS portal
  pages only; they are stored locally in your browser.
- No data is sold, no advertisers, no third-party tracking.
- Only the license key and an anonymous device identifier are sent to
  the LicenseWala server, solely for license verification.

## Project layout

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest (permissions, content scripts, icons). |
| `license.js` | License activation, device binding, and re-verification. |
| `content.js` / panel scripts | CM-16 block + CM-43 retrigger automation on CDCMS pages. |
| `update.bat` | 1-click updater (pulls the latest code from GitHub). |

## Changelog

### v1.3.3

- License verification is now server-only: the old offline/emergency
  key path and its generator page are removed, and stored offline keys
  are rejected.
- Re-verification interval tightened from 3 hours to 30 minutes; a
  server verdict of invalid / expired / revoked / locked now locks the
  tool at the next item instead of letting the run continue.

### v1.3.2

- Fixed the 50+ batch stall: the CM-16 fetch-wait loop had no timeout,
  so one slow portal response froze the batch forever at "Processing".
  Items now time out to `FAILED` and the batch continues.
- Activity log growth capped (200 visible / 500 stored) so long runs
  stay fast.
- Design polish: panel scroll clipping, narrow-screen overflow, row
  wrapping, and version strings read from the manifest.

### v1.3.1 and earlier

- Bulk CM-16 blocking + CM-43 PFMS retrigger, business-rule failure
  handling, pause/resume/stop, CSV/Excel reports, GitHub update
  checker, and `update.bat` 1-click updater.

## Support

- License keys and subscriptions: [LicenseWala portal](https://licensescript.netlify.app/)
- WhatsApp: [+91 75649 48617](https://wa.me/917564948617)
- Email: [life.rahulg@gmail.com](mailto:life.rahulg@gmail.com)

---

Built for LPG distributors running HP Gas CDCMS.
