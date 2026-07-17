# Workflow examples

This document explains the expected system behavior through a realistic resident scenario.

## Scenario 1: Ahmed applies for Gym

Ahmed opens `/apply` and enters:

```text
Name: Ahmed Hassan
Qatar ID: 28475612345
Contact: +974 5512 3456
Address: Villa 24, Al Wakrah
Facility: Gym
Duration: 3 months
Monthly price: QAR 100
```

The system calculates:

```text
Gym: QAR 100 × 3 months = QAR 300
Total: QAR 300
```

Ahmed uploads his Qatar ID and QAR 300 payment proof. The application and original price snapshot are saved with status **Pending**.

### Submission email

The system creates an application-received email containing the application reference, requested facility, total, and pending status.

## Scenario 2: Manager reviews and approves Gym

The manager opens `/admin/applications/:applicationId`, reviews both documents, compares identity values, and completes all seven verification checks.

When the manager confirms approval, the system:

1. Changes the application to **Approved**.
2. Records the approval date in `DD-MM-YYYY` format for display.
3. Creates Ahmed's resident access record.
4. Generates a unique QR token and pass link.
5. Stores Gym access and membership dates.
6. Sends or logs the approval email with the QR pass.
7. Adds QAR 300 to verified revenue.

## Scenario 3: Ahmed scans at Gym

Gate staff select Gym at the scanner. Ahmed presents his QR pass.

The scanner checks:

- QR token exists and belongs to Ahmed.
- Ahmed is approved and not suspended.
- Gym is included in Ahmed's access.
- Gym membership has not expired.
- Gym is active and currently available.

If every check passes, the system records a Gym check-in. A later scan records check-out.

## Scenario 4: Ahmed adds Tennis one month later

Ahmed applies again with the same email and Qatar ID. The system recognizes the existing approved resident and treats the submission as a facility addition or renewal request.

Example request:

```text
Existing access: Gym
New facility: Tennis
Tennis duration: 2 months
Tennis price: QAR 100 per month
New payment: QAR 200
Request status: Renewal Pending
```

Ahmed's existing Gym access remains active while Tennis is reviewed. The Tennis request saves its own submitted price snapshot.

### Facility-addition submission email

Ahmed receives a renewal/application-received email showing Tennis, QAR 200, the reference, and pending review status.

## Scenario 5: Manager approves Tennis

The manager verifies the Tennis payment and approves the request. The system should merge Tennis into Ahmed's existing resident permissions without creating a second resident account.

Ahmed continues using the **same QR token and QR code**. The approval email should explain that Tennis was added and that the existing QR pass remains valid. The QR image may be attached again for convenience, but its token should not change.

Recommended membership representation:

```text
Ahmed Hassan
QR token: unchanged

Gym
  Start: 12-07-2026
  Expiry: 12-10-2026
  Status: Active

Tennis
  Start: 12-08-2026
  Expiry: 12-10-2026
  Status: Active
```

Each facility should eventually have an independent start date, expiry date, status, price, duration, and source application. The current data model mainly has one overall access expiry, so independent facility membership dates are a recommended future enhancement.

## Scenario 6: Same QR at different scanning points

Ahmed uses the same QR everywhere. The selected scanner facility determines the authorization check.

### Gym scanner

```text
QR valid: Yes
Gym membership active: Yes
Result: Access approved
```

### Tennis scanner

```text
QR valid: Yes
Tennis membership active: Yes
Result: Access approved
```

### Swimming Pool scanner

```text
QR valid: Yes
Swimming Pool membership: Missing
Result: Access denied
```

The QR identifies Ahmed. It does not automatically authorize every facility.

## Scenario 7: Payment mismatch or rejection

If the expected Tennis payment is QAR 200 but the proof shows QAR 100, the manager rejects the request and enters a reason.

```text
Reason: Payment amount does not match the calculated total.
Expected: QAR 200
Payment proof: QAR 100
```

Ahmed's existing Gym access and QR remain unchanged. Tennis is not added. The rejection email explains the reason and required correction.

## Email trigger matrix

| Event | Email | QR behavior |
|---|---|---|
| New application submitted | Application received | No QR yet |
| Facility addition submitted | Renewal/addition received | Existing QR remains active |
| New resident approved | Approval with QR pass | New QR token generated |
| Additional facility approved | Facility access approved | Existing QR token retained |
| Application rejected | Rejection/requires attention | Existing approved access remains unchanged |
| Resident or facility access suspended | Suspension notice | QR denied for affected access |
| QR revoked/replaced | Replacement notice | Old token invalid; new QR generated |
| Facility nearing expiry | Reminder at 30 days, 7 days, and expiry | QR remains valid until expiry |

The current application implements/logs submission, renewal receipt, approval/QR, and rejection emails. Automated expiry reminders and fully facility-specific membership emails require additional implementation.

## Scenario 8: Manager creates assisted access

If Ahmed cannot use the public form, the manager opens **Users / Residents**, selects **Add resident**, verifies Ahmed's identity directly, and enters his details. The manager selects the approved facilities and access dates, records a verified payment or complimentary-access reason, and provides an internal explanation for creating the record manually.

The system blocks duplicate Qatar IDs and email addresses. After confirmation it creates an approved resident record, generates a QR token, records that the manager created the access, and optionally emails the QR pass to Ahmed. The QR follows the same facility, status, schedule, and expiry checks as a QR created from a public application.

## When a new QR is required

A new QR should only be issued when:

- The existing QR is compromised.
- The manager explicitly revokes it.
- Ahmed requests a replacement.
- Security policy requires token rotation.

Adding or renewing a facility should normally update permissions behind the existing QR rather than create a new token.
