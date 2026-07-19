# Technical architecture

## Overview

The project is a single-page application with browser-side routing. `index.html` contains the application views, `app.js` contains state and business behavior, and page-specific CSS files provide responsive styling.

```text
Browser SPA
  ├─ Firebase Firestore (records and settings)
  ├─ Firebase Storage (identity and payment documents)
  └─ Netlify Function
       └─ Gmail SMTP (email and QR attachment)
```

## Important files

| File | Responsibility |
|---|---|
| `index.html` | Public, admin, and scanner page structure |
| `app.js` | Routing, state, validation, pricing, reviews, scanner, and reports |
| `styles.css` | Shared/public/scanner styling |
| `admin-dashboard.css` | Admin page styling and responsive layouts |
| `customer-wizard.css` | Application wizard styling |
| `payment-config.js` | Bank and payment-display configuration |
| `netlify/functions/send-email.js` | SMTP delivery and QR image generation |
| `server.js` | Local static server and local function adapter |
| `scripts/build-netlify.js` | Copies deployable assets into `dist/` |
| `firebase-seed.*` | Development data-seeding utility |

## State and persistence

On startup, the app loads Firestore collections in parallel. It merges facility defaults, normalizes legacy fields, and stores a local backup under `facility-access-system-v1`. Firestore is authoritative when available; local storage is a fallback.

Default facilities use deterministic document IDs so simultaneous first-time loads cannot seed multiple copies. During loading, exact duplicate facility records are consolidated. Resident access-period, price-snapshot, and attendance-log references are moved to the retained facility before duplicate documents are removed. Records sharing a name but containing different schedules, pricing, or status are not automatically merged.

Session flags:

- `facility-admin-auth`: administrator browser session.
- `facility-scanner-auth`: unlocked scanner browser session.

## Routing

Routing uses `history.pushState`, `history.replaceState`, and a `popstate` handler. Netlify redirects unknown paths to `index.html`, allowing direct loading of SPA routes.

## Pricing safety

Facility prices are stored as decimal strings. Calculations convert values to minor currency units before multiplication to reduce unsafe floating-point behavior. Each application stores line-item and final-total snapshots.

## Document handling

Images are resized/compressed in the browser. Uploads normally go to Firebase Storage. A small inline Firestore fallback is available when Storage fails; larger files fail rather than being embedded.

## QR and email

Approval creates a random pass token. The email function generates a high-error-correction QR PNG, adds an HTS badge, and sends both HTML/text email through Gmail SMTP.

## Reports

Printable reports open a new browser window and invoke the print dialog. CSV export creates a browser Blob. Report data is calculated from application and attendance records already loaded into state.
