# Deployment and configuration

## Requirements

- Node.js 18 or newer
- npm
- Firebase project with Firestore and Storage
- Netlify site
- Gmail account with two-factor authentication and an App Password

## Local development

```bash
npm install
npm start
```

The local server runs at `http://localhost:5173` and supports SPA fallback routes. If Gmail variables are present in the local environment, the local server can invoke the email function.

## Production build

```bash
npm run build
```

The build script recreates `dist/` and copies the static application, seed utility, configuration, and assets.

## Netlify

`netlify.toml` defines:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- SPA redirects to `index.html`

Required environment variables:

```text
GMAIL_USER
GMAIL_APP_PASSWORD
```

Use a Gmail App Password, not the normal account password. Never commit secrets.

## Firebase

The Firebase web configuration is currently included in `app.js`. Configure Firestore and Storage rules before production. Collections are documented in [DATA_MODEL.md](DATA_MODEL.md).

Recommended indexes depend on future server-side queries; the current client loads collections and filters locally.

## Payment configuration

Replace placeholder bank details in `payment-config.js` before production. Confirm the Fawran number, account name, account number, bank, SWIFT, IBAN, and bank QR image.

## Release procedure

1. Confirm no secrets or real identity documents are committed.
2. Run `node --check app.js`.
3. Run `npm run build`.
4. Test the workflows in [TESTING.md](TESTING.md).
5. Commit and push to the deployment branch.
6. Verify Netlify build and function logs.
7. Run a controlled application, approval email, QR scan, and report export.
