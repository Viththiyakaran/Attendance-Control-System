# Documentation index

| Audience | Document | Purpose |
|---|---|---|
| Residents | [User guide](USER_GUIDE.md) | Applications, renewals, documents, payments, and QR passes |
| Everyone | [Workflow examples](WORKFLOW_EXAMPLES.md) | End-to-end scenarios for applications, added facilities, QR scanning, and emails |
| Managers | [Administrator guide](ADMIN_GUIDE.md) | Reviews, facilities, residents, payments, notifications, settings, and reports |
| Gate staff | [Operations guide](OPERATIONS_GUIDE.md) | Scanner setup, scanning, access results, and incident handling |
| Developers | [Technical architecture](TECHNICAL_ARCHITECTURE.md) | Components, routes, state, integrations, and code structure |
| Developers | [Data model](DATA_MODEL.md) | Firestore collections and important fields |
| DevOps | [Deployment](DEPLOYMENT.md) | Local setup, Firebase, email, Netlify, and release steps |
| Owners | [Security](SECURITY.md) | Risks, privacy controls, and production hardening |
| QA | [Testing](TESTING.md) | Functional, responsive, accessibility, and release checks |
| Support | [Troubleshooting](TROUBLESHOOTING.md) | Common failures and corrective actions |

## System workflow

1. A resident completes an application or renewal.
2. The system saves identity, requested facilities, documents, and a price snapshot.
3. A manager reviews documents and completes seven verification checks.
4. Approval creates an access token, QR pass, resident access dates, and email log.
5. Gate staff scan the QR pass and the system records attendance or an exception.
6. Managers review payments, attendance, monthly revenue, and operational reports.
