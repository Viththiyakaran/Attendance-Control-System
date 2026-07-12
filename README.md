# Facility Access & Attendance System

A responsive facility-access platform for resident applications, payment verification, QR access passes, gate scanning, attendance tracking, and management reporting.

Live site: [clinquant-faun-77644a.netlify.app](https://clinquant-faun-77644a.netlify.app)

## Capabilities

- Public multi-step facility application and renewal wizard
- Facility pricing loaded from Firestore with submission-time price snapshots
- Qatar ID and payment-proof uploads
- Dedicated administrator review routes with document verification
- Approval, rejection, email delivery, and QR-pass generation
- PIN-protected gate scanner with check-in/check-out logging
- Facility, resident, payment, notification, and exception management
- Attendance, payment, monthly revenue, CSV, and printable PDF reports
- Responsive desktop, tablet, and mobile interfaces

## Technology

- Vanilla HTML, CSS, and JavaScript
- Firebase Firestore and Firebase Storage
- Netlify hosting and Netlify Functions
- Nodemailer with Gmail SMTP
- QRCode and PNGJS for emailed QR-pass images

## Quick start

```bash
npm install
npm start
```

Open `http://localhost:5173`.

Production build:

```bash
npm run build
```

The build is written to `dist/`.

## Documentation

- [Documentation index](docs/README.md)
- [User guide](docs/USER_GUIDE.md)
- [Workflow examples](docs/WORKFLOW_EXAMPLES.md)
- [Administrator guide](docs/ADMIN_GUIDE.md)
- [Scanner and operations guide](docs/OPERATIONS_GUIDE.md)
- [Technical architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Deployment and configuration](docs/DEPLOYMENT.md)
- [Security and privacy](docs/SECURITY.md)
- [Testing and release checklist](docs/TESTING.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Important production note

The current administrator login is implemented in client-side code and session storage. It is suitable for demonstration only. Before production use, replace it with Firebase Authentication and server-enforced role authorization. See [Security and privacy](docs/SECURITY.md).

## Licence

See [LICENSE](LICENSE).
