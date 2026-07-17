# Data model

Firestore collection and field names must remain compatible with the current application.

## `users`

Core fields:

- `id`, `fullName`, `email`, `contactNumber`, `villaNumber`
- `qidNumber`, `dob`
- `status`, `applicationType`, `renewalOf`
- `createdAt`, `approvedAt`, `rejectedAt`
- `requestedFacilities`, `facilityMonths`, `accessMonths`
- `facilityAccessPeriods` for facility-specific start and expiry dates
- `facilityPriceSnapshot`, `monthlyTotalQar`, `totalQar`, `totalMinor`
- `qatarId`, `paymentProof`
- `token`, `accessStartAt`, `accessEndAt`, `lastQrPassSentAt`

Price snapshot item:

```json
{
  "facilityId": "facility-id",
  "facilityName": "Gym",
  "pricingType": "monthly",
  "unitPriceAtSubmission": "100.00",
  "selectedMonths": 3,
  "lineTotal": "300.00",
  "currency": "QAR"
}
```

Facility access period item:

```json
{
  "facilityId": "facility-id",
  "facilityName": "Gym",
  "accessStartAt": "2026-07-17",
  "accessEndAt": "2026-08-17",
  "selectedMonths": 1
}
```

Typical statuses include Pending, Renewal Pending, Approved, Rejected, Suspended, and Archived.

## `facilities`

- `id`, `name`, `location`, `timing`, `days`, `open`
- `pricingType`: `monthly`, `per_booking`, or `free`
- `monthlyPrice`, `bookingPrice`, `currency`
- `minimumMonths`, `maximumMonths`

## `attendance_logs`

- `id`, `userId`, `facilityId`, `facilityName`
- `checkInAt`, `checkOutAt`
- `state`, `scanResult`

## `email_logs`

- `id`, `to`, `subject`, `body`, `createdAt`
- `status`, delivery metadata, and `readAt`
- Optional pass-related fields used for approval email delivery

## `app_settings`

The `branding` document stores the public logo name/data and hashed scanner PIN.

## Compatibility

The application normalizes several legacy field forms when loading. The scanner uses `facilityAccessPeriods` when present. Existing residents without this field continue using the resident-level `accessStartAt` and `accessEndAt` fields. Avoid renaming collections or fields without a migration and compatibility update.
