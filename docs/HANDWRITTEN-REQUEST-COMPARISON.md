# Handwritten request comparison

This document maps the photographed handwritten requirements to the final system behaviour.

| # | Requested item | Implemented behaviour |
|---|---|---|
| 1 | Prevent repeat registration by customer QID, but allow a parent email to be used for children | Qatar ID is the unique resident key. Pending or approved records with the same QID are detected. Email addresses are not treated as unique, so one parent email may be used for multiple children with different QIDs. |
| 2 | Upload QID and bank-transfer/payment photos | The public application requires Qatar ID and payment-proof uploads. Assisted registration also supports optional JPG, PNG, or PDF evidence for both. |
| 3 | Admin extends payment/access for later months, including cash | Users / Residents now has **Extend access**. The manager chooses each facility, its own month or booking quantity, the future start date, and Bank transfer, Cash, or Complimentary handling. |
| 4 | Monthly account summary and PDF or Excel | Reports includes year and month filters, selected-period totals, user payment details, Excel-compatible CSV export, and PDF export. |
| 5 | Today summary by facility, including people currently inside | Dashboard Facility Usage shows visits, currently-inside count, and denied attempts for each facility when **Today** is selected. Check-in Logs and Access Exceptions provide the detailed audit records. |
| 6 | Password-protect facility closing/editing | Saving facility edits, enabling/disabling a facility, and deleting a facility require manager-password confirmation. |
| 7 | Remove DOB from manual entry | Assisted Registration no longer collects or validates date of birth. Public application and document verification behaviour remain unchanged. |
| 8 | Show payment/access start and end dates | Resident desktop and mobile records display the access period. Each manually selected facility stores its own start and expiry dates. |
| 9 | Monthly selector for account review and Excel creation | The account report has Month and Year selectors. The exported Excel-compatible CSV contains the currently selected period and filters. |
| 10 | Advance payments and future service dates; QR only valid in that period | Assisted extension accepts a future start date and calculates each facility expiry from its selected duration. The resident keeps the same QR token, but scanner access is granted only when the scanned facility is within its saved start/end period. An internal extension note is optional. |

## Example

Ahmed already has an active QR pass. The manager adds:

- Gym for 1 month, starting 01-08-2026.
- Swimming for 3 months, starting 01-08-2026.

The system creates two facility access periods and one payment-history record. Ahmed keeps the same QR code. At the Gym scanner the QR stops granting Gym access after the one-month Gym period; at the Swimming scanner it remains valid until the end of the three-month Swimming period.

## Operational safeguards

- Payment amounts are calculated from saved facility-price snapshots.
- Existing payment history is not recalculated after facility prices change.
- Manual extensions are recorded separately for financial reporting.
- Manager changes to facility configuration require password confirmation.
- Qatar ID and payment files remain subject to the configured upload type and size limits.
