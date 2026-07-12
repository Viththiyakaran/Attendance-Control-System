# Troubleshooting

## Firebase data does not load

- Check browser console errors.
- Confirm internet connectivity and Firebase project configuration.
- Verify Firestore rules permit the intended operation.
- Confirm collection names match [DATA_MODEL.md](DATA_MODEL.md).

The app may display its local backup when Firebase loading fails; this does not confirm that cloud writes are working.

## Document upload fails

- Confirm the file is JPG, PNG, WebP, or PDF and no larger than 5 MB.
- Verify Firebase Storage is enabled and its rules allow the upload.
- Small files may use the inline fallback; large files require Storage.

## Email is pending or failed

- Confirm `GMAIL_USER` and `GMAIL_APP_PASSWORD` are set in Netlify.
- Use a Gmail App Password with two-factor authentication.
- Review Netlify Function logs and Gmail security notifications.
- Confirm the recipient and SMTP quota.

## Camera does not open

- Grant camera permission.
- Use HTTPS on deployed environments.
- Close other applications using the camera.
- Use manual token entry as a temporary fallback.

## QR pass is rejected

- Confirm the resident remains approved and not expired/suspended.
- Confirm the pass belongs to the selected facility.
- Confirm facility status, operating day, and time.
- Check Access Exceptions for the exact rejection reason.

## Direct route returns 404

- Confirm Netlify deployed the redirects from `netlify.toml`.
- Run through the provided local server rather than opening `index.html` directly.

## Report totals appear incorrect

- Revenue includes verified/approved payment records.
- Existing applications use saved submission price snapshots.
- Confirm status, year, and search filters.
- Confirm legacy records contain `totalQar` and appropriate timestamps.
