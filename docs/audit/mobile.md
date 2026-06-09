# Mobile App Audit

Date: 2026-05-25

## Build Validation

- TypeScript passed.
- Android Expo export passed only when Hermes compiler execution was allowed outside the sandbox.
- Mobile lint fails in current environment due ESLint resolver `EPERM` scanning `C:\Users\Oluwaseyi`.

## Critical Findings

### P0: Payment WebView Treats Redirect As Success

The booking screen closes the Paystack WebView and navigates to bookings on any redirect away from checkout that is not detected as cancel/decline/close. It does not verify the transaction or wait for a booking row.

Impact: user may see no booking after paying, or may believe payment succeeded before webhook processing.

Fix: after checkout, poll/subscribe by Paystack reference to a server-side payment intent/booking status.

### P1: Booking Availability Is Client-Recomputed

The mobile app computes slots from `vendor_calendar` and `bookings`; server repeats checks but without DB locks. The UI can show stale availability under concurrency.

Fix: treat UI availability as advisory and use server reservation/intent locking.

### P1: Realtime Subscriptions Are Broad

Vendor tab subscribes to all booking changes then reloads. Live screen subscribes to booking and vendor changes. This can be costly and risks unnecessary data exposure.

Fix: filter subscriptions by booking/vendor/user where possible and add reconnect/backoff telemetry.

### P1: Location Tracking Is Foreground Polling

Vendor location updates use intervals while app screens are active. There is no robust background location capability, trip-state persistence, or offline queue guarantee for live tracking.

Fix: define product expectation: foreground-only tracking or implement audited background tracking with OS permissions and clear privacy controls.

### P1: Geolocation Spoofing Not Mitigated

Vendor auto-accept drift and live location depend on client-submitted coordinates.

Fix: add fraud heuristics, impossible-speed checks, device integrity where feasible, and operational review flags.

### P1: Offline Behavior Is Partial

There are retry/action queue utilities, but critical booking/payment/status flows still call `fetch` directly in several places.

Fix: centralize network calls with retry, idempotency keys, and visible pending states.

### P2: Secure Storage Is Reasonable But Web Fallback Is Weaker

Native uses SecureStore for Supabase sessions; web uses AsyncStorage.

Fix: acceptable for native, but avoid supporting sensitive web mobile flows unless cookie/session model is hardened.

## Flow Risks

- Vendor can accept/decline from stale booking cards; server rejects some stale states but UI recovery is inconsistent.
- Live tracking polling and Realtime can disagree.
- KYC WebView/init result depends on external webhook; pending screen polls every interval but local Deno/function testing is unavailable.
- Push notification setup exists via Expo config, but no end-to-end token registration audit was completed.

## Mobile Runtime Verdict

The app can build, but payment confirmation, offline/retry behavior, location trust, and realtime consistency are not production-grade for real-money dispatch.

