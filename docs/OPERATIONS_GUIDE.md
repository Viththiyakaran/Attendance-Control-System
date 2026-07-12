# Scanner and operations guide

## Scanner routes

- Locked scanner: `/scanner`
- Live scanner: `/scanner/live`
- Pass display: `/?pass=TOKEN` or `/pass=TOKEN`

## Start a scanner station

1. An administrator sets the scanner PIN in Settings.
2. Gate staff open `/scanner` on the authorised device.
3. Enter the PIN and select **Unlock Scanner**.
4. Confirm the currently selected facility and availability.
5. Open the camera scanner and allow camera permission.

The scanner can also accept manual token entry when camera scanning is unavailable.

## Scan results

- Approved/check-in: access is valid and a check-in is recorded.
- Check-out: a second scan completes attendance.
- Outside time/not today/closed: logged as an access exception.
- Invalid or missing token: access denied.
- Expired/suspended/unapproved: access denied.
- Facility not authorised: access denied.

## Daily operation

- Lock the scanner when the station is unattended.
- Confirm the selected facility before scanning.
- Review Check-in Logs for successful events.
- Review Access Exceptions for denied or unusual attempts.
- Escalate repeated invalid-pass attempts to the manager.

## PIN changes

Changing the PIN affects future unlocks. A device with an existing unlocked browser session remains active until it is locked or its session is cleared.
