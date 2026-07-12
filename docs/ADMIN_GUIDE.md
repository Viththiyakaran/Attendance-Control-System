# Administrator guide

## Routes

| Page | Route |
|---|---|
| Login | `/admin` |
| Dashboard | `/admin/dashboard` |
| Applications | `/admin/applications` |
| Application review | `/admin/applications/:applicationId` |
| Residents | `/admin/users` |
| Facilities | `/admin/facilities` |
| Payments | `/admin/payments` |
| Scanner stations | `/admin/scanner-stations` |
| Check-in logs | `/admin/check-in-logs` |
| Access exceptions | `/admin/access-exceptions` |
| Reports | `/admin/reports` |
| Notifications | `/admin/notifications` |
| Settings | `/admin/settings` |

## Application review

Open **Applications**, apply filters, and select **Review**. The dedicated review page retains list search, status, submitted-date filter, and pagination when returning.

Review tabs:

- **Overview:** applicant details and saved facility-price snapshot.
- **Documents:** Qatar ID and payment proof, initially blurred.
- **Verification:** submitted/extracted comparisons and seven required checks.
- **Activity:** status dates, notes, notification status, and QR generation status.

Approval stays disabled until all required checks are complete. Approval and rejection use confirmation dialogs and prevent duplicate actions while processing.

## Facilities

Facilities support monthly, per-booking, and free pricing. Configure currency, minimum months, maximum months, schedule, days, location, and active state. Editing opens a right-side drawer. Delete is under the row menu. The list is paginated on desktop and mobile.

Changing a facility price affects new applications only. Existing reviews use their saved price snapshots.

## Residents

The Residents page contains approved and suspended records, membership expiry, facilities, QR status, and actions for viewing, resending passes, suspending, or archiving.

## Payments

The Payments page shows verification status, submitted total, reference, and a link to the application review. Totals are derived from submitted application snapshots.

## Reports

- Attendance report with date/facility/status filters and printable PDF.
- Payment report with printable PDF.
- Accounts dashboard with monthly QAR revenue, current activity, payment filters, pagination, CSV, and PDF export.
- Qatar ID values are masked in account reports.

## Notifications

Notification records represent email delivery logs. Open details, mark individual records as read, or mark all as read. The header badge shows unread records rather than a fixed count.

## Settings

- Upload or reset the public logo.
- Set a 4–8 digit scanner PIN.
- Review connection and system information.

For Qatar operation, use `Asia/Qatar`, QAR, and `DD-MM-YYYY` as organizational conventions. The application displays dates consistently as `DD-MM-YYYY`; stored timestamps and native date-filter values remain ISO-compatible.
