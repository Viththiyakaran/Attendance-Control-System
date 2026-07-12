# Testing and release checklist

## Automated checks

```bash
node --check app.js
npm run build
git diff --check
```

There is currently no automated unit or end-to-end test suite. Add one before high-risk production changes.

## Resident workflow

- Validate required personal fields and 11-digit Qatar ID.
- Validate Qatar phone formatting and email.
- Verify active facility pricing and min/max months.
- Verify monthly, per-booking, and free totals.
- Reject unsupported or oversized documents.
- Submit a new application and renewal.
- Confirm the success screen and saved price snapshot.

## Administrator workflow

- Login redirect and unauthorized-route protection.
- Application search/filter/pagination restoration.
- Document blur/reveal, zoom, rotate, fullscreen, and download.
- All seven verification checks required before approval.
- Approval/rejection dialogs and duplicate-action prevention.
- Resident, facility, payment, notification, and report pagination.
- Facility add/edit/enable/disable/delete and pricing validation.
- Notification read count and mark-all behavior.
- Account filters, monthly totals, CSV, and PDF exports.

## Scanner workflow

- Incorrect/correct PIN handling.
- Camera permission and manual token entry.
- Approved check-in and check-out.
- Invalid, expired, suspended, wrong-facility, and outside-time results.
- Lock behavior and attendance/exception log creation.

## Responsive and accessibility

- Test widths around 360, 768, 1024, and 1440 pixels.
- Confirm tables switch to mobile cards where designed.
- Confirm drawers/dialogs fit without hidden actions.
- Navigate using keyboard only.
- Check visible focus, labels, status text, and contrast.

## Deployment smoke test

- Direct-load every documented route.
- Verify Firebase reads/writes and Storage upload.
- Verify approval email and QR image.
- Verify scanner event and reports on the deployed domain.
