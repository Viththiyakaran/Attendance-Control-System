# Facility Access & Attendance System

Small web app for managing facility access, Qatar ID verification, QR pass email delivery, and gate attendance scanning.

## Main Features

- Public user registration with email, villa number, requested facilities, and Qatar ID upload.
- Admin dashboard for approving, rejecting, and deleting users.
- Admin can add, update, delete, open, and close facilities.
- Approved users receive an email with an HTS QR pass.
- Gate Scanner validates QR passes and records check-in / check-out.
- Scanner uses a PIN before access.
- Attendance report supports date filters, weekly/monthly views, and PDF export.
- Dashboard shows facility usage and approved users by facility.

## User Workflow

1. User opens the Registration page.
2. User enters email and villa number.
3. User selects requested activities.
4. User uploads Qatar ID.
5. Application is saved as Pending.
6. Admin reviews the Qatar ID.
7. Admin enters/validates full name, Qatar ID number, DOB, and facility access.
8. Admin approves the user.
9. System sends an email with QR pass.
10. Gate staff scan the QR pass to check the user in or out.

## Admin Access

Default admin login:

```text
Email: admin@facility.local
Password: admin123
```

## Gate Scanner Access

Default scanner PIN:

```text
1234
```

After unlocking, the scanner can open the camera and scan QR passes. If the camera cannot read the QR, staff can enter the pass token manually.

## Email Sending

Email is sent using a Netlify Function with Gmail SMTP.

Required Netlify environment variables:

```text
GMAIL_USER
GMAIL_APP_PASSWORD
```

The Gmail password must be a Google App Password, not the normal Gmail account password.

## Firebase

Firebase is used for:

- Firestore database
- Qatar ID file storage
- Users
- Facilities
- Attendance logs
- Email logs

Main Firestore collections:

```text
users
facilities
attendance_logs
email_logs
```

## Hosting

The app is hosted on Netlify.

Important files for deployment:

```text
index.html
styles.css
app.js
package.json
netlify.toml
netlify/functions/send-email.js
firebase-seed.html
firebase-seed.js
```

## Local Development

Run locally:

```bash
node server.js
```

Open:

```text
http://localhost:5173
```

Note: Email sending does not work from the simple local server. Email works on Netlify because the Netlify Function runs there.

## Current Live Site

```text
https://clinquant-faun-77644a.netlify.app
```

## Notes

- QR pass links are public for the approved user, but attendance is recorded only by the Gate Scanner.
- Gate Scanner requires PIN access.
- Check-in plays one beep.
- Check-out plays two beeps.
- For production use, stronger admin authentication and stricter Firebase security rules should be added.
