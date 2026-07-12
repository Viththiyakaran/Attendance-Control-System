# Security and privacy

## Current limitations

The current administrator login uses credentials defined in browser-delivered JavaScript and stores authentication state in session storage. This is not secure production authentication. Scanner authorization is also a browser session after PIN validation.

## Required production hardening

1. Replace administrator login with Firebase Authentication.
2. Store manager roles as verified custom claims or protected role documents.
3. Enforce authorization in Firestore and Storage Security Rules.
4. Restrict email-function CORS to the production domain.
5. Require authenticated/authorized function calls.
6. Move sensitive approval and scanner validation operations to trusted server functions.
7. Rate-limit login, PIN, email, and scanning requests.
8. Rotate the scanner PIN and Gmail App Password regularly.
9. Configure retention and deletion policies for Qatar ID and payment documents.
10. Enable audit logging and alerting for approval, rejection, deletion, and access exceptions.

## Sensitive data

Qatar ID numbers, identity images, contact details, addresses, payment proof, and access logs are personal data. Apply least-privilege access, encryption in transit/at rest, documented retention, and controlled deletion.

Reports mask Qatar IDs, but application review intentionally reveals sensitive documents to authorized managers. Do not expose review routes without server-enforced authorization.

## Secrets

- Keep `GMAIL_APP_PASSWORD` only in Netlify environment variables.
- Do not commit service-account keys.
- Firebase web configuration is not a secret; Security Rules provide protection.
- Replace placeholder/default operational credentials before deployment.

## Qatar operation

Confirm applicable Qatar privacy, employment, community, and record-retention requirements with the organization’s legal or compliance owner before processing real residents’ identity data.
