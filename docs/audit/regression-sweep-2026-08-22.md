# Historical Feature Regression Sweep — 22 August 2026

Ran as Part 0 of the vendor location bar / auto-accept zone collapse work.

**Method:** history-driven, not file-age-driven. Used `git log -1 --format=%ad -- <file>` to find each module's last-touch date, then checked its assumptions against the rule-changing events that landed afterwards: transport surcharge and pre-booking buffers (`20260531000002`), vendor trust layer (`20260531000001`), taxonomy V2 and online-visibility filtering (`20260603*`), the payment-gate model, and `session_location` discovery (`20260817010001`).

**Rationale:** the two bugs found immediately before this sweep (stale `vendor_current_lat/lng`, and the wrong-field transport fee in `991f6d6`) shared one shape — older code holding an assumption a later feature invalidated. Neither was found by looking for bugs. This sweep made that search deliberate.

---

## Confirmed bug — IN SCOPE, fixed in this branch

### Stale vendor coordinates can fire a real Paystack charge

- `vendor-update-location/index.ts:80` writes `vendor_current_lat/lng` **only** while a booking is `on_way`, never clears them afterwards, and never writes `vendor_location_updated_at` (the column exists but nothing populates it).
- `send-reminders/index.ts:282` runs proximity gate detection against those coordinates with a **null check only, no staleness check**.
- On a proximity match it calls `paystack-gate` (line 303), which **charges the customer**.

So coordinates left over from a previous job can satisfy the proximity test for a later booking, firing the payment gate before the vendor has actually set off. Money moves on stale data.

**Fix:** write `vendor_location_updated_at` on every ping, and have `send-reminders` reject coordinates older than a freshness threshold. This is why the column is kept rather than dropped in the collapse migration.

## Confirmed bug — OUT OF SCOPE, logged only

### Reschedule drops the pre-booking transport buffer at the new time

**Correction (22 Aug, second pass):** the version of this finding written during the sweep also claimed old buffers get orphaned at the booking's previous time. That claim doesn't hold up and is retracted below — see "What does NOT happen" for why. Retracting it here rather than quietly fixing the doc, since the sweep's whole premise is catching stale assumptions, including my own.

**What actually happens:**

- Reschedule is only reachable from `PENDING`: `vendor-suggest-reschedule/index.ts:44` hard-rejects any other status, both server-side (the real guard) and in the client UI.
- A `PENDING` booking has never had transport buffers created for it. Buffer creation happens exactly twice in the codebase: `paystack-initialize` (only on the auto-accept path, which produces an `ACCEPTED` booking, never `PENDING`) and `paystack-capture` (vendor manually accepting a `PENDING` booking, which also produces `ACCEPTED`). Confirmed by reading every call site of `createTransportBuffers`/`createPreTransportBuffers` — there are only these two, plus the one in `customer-accept-reschedule` itself.
- So a booking that reaches `RESCHEDULED_PENDING` carries zero rows in `vendor_calendar`. There is nothing at its "previous time" to orphan.
- `customer-accept-reschedule/index.ts:73` is therefore the **first** time this booking's buffers are ever created — same moment `paystack-capture` would have done it on a non-rescheduled booking. It calls `createTransportBuffers` (post-booking) but never `createPreTransportBuffers`, even though the booking row already carries `pre_transport_buffer_slots` from the original `paystack-initialize` calculation (that value doesn't change on reschedule — it's driven by customer/vendor distance, not by time of day).

**What does NOT happen:** no orphaned buffers, no duplicate rows, no stale block left blocking a freed slot. `_shared/calendar.ts` only ever INSERTs, which is fine here specifically because there is nothing pre-existing to clean up on this path — the "nothing deletes old buffers" observation was true but not a defect, since it's never exercised.

**Actual, narrower bug:** a rescheduled booking with `transport_fee_kobo > 0` (customer beyond the 5 km base radius) gets its post-service buffer but not its pre-service travel buffer at the new time. A vendor can be booked back-to-back right up against a job that needs 30–60 minutes of travel to reach. Same class of defect as `991f6d6` — code written for one half of the transport-surcharge feature, updated for the model change, but not extended to cover the second helper that shipped alongside it.

**Status: FIXED**, separately from the location/auto-accept branch — commit `40b4146`, deployed to `customer-accept-reschedule`. See scope below for what was implemented.

### Scope of the fix (implemented)

1. `customer-accept-reschedule/index.ts`: select `pre_transport_buffer_slots` and `transport_fee_kobo` alongside the fields already fetched, and call `createPreTransportBuffers(supabase, booking.vendor_id, booking_id, booking.suggested_scheduled_at, booking.pre_transport_buffer_slots)` right after the existing `createTransportBuffers` call — same pattern `paystack-capture` already uses for a non-rescheduled accept. Guard on `pre_transport_buffer_slots > 0` isn't strictly needed since the helper already no-ops at 0, but matching `paystack-capture`'s call shape keeps the two paths visually identical for the next reader.
2. No deletion logic needed (per the correction above) — keep the fix to the one missing call, don't add cleanup machinery for a case that doesn't occur.
3. Verification: create a booking whose customer location is >5 km from the vendor (so `pre_transport_buffer_slots >= 1`), have the vendor suggest a reschedule, accept it as the customer, then assert `vendor_calendar` holds both a `transport_buffer` row before the new `scheduled_at` and one after — not just the post one. Also assert row count is exactly what's expected (no duplicates), since this path's whole risk profile is "did the second helper actually get called," not race conditions.
4. Out of scope, not addressed: whether pre-buffer slot count should be recalculated on reschedule if the vendor's `base_location` changed between the original booking and the reschedule (possible now that `base_location` is vendor-editable, see the location-bar branch). `pre_transport_buffer_slots` is a snapshot from booking creation and reschedule doesn't touch distance at all — noted here for whoever next touches this path, not a reason it blocked this fix.

**What was actually done:** step 1 as scoped, no deletion logic added (step 2's reasoning held). End-to-end verification (step 3) wasn't run against production — creating a real booking, vendor-suggested reschedule, and customer acceptance requires live auth/OTP flows that couldn't be safely fabricated outside the real app. Confidence instead comes from the diff being a near-exact structural match to `paystack-capture`'s already-proven call shape (same guard, same two calls, same argument order), plus a schema check confirming `bookings.pre_transport_buffer_slots` exists as selected. Real verification is still owed the first time an out-of-radius booking actually gets rescheduled in production — worth a quick `vendor_calendar` check on that booking when it happens.

## Confirmed dead code — removed in this branch

- `vendors.live_location`, `vendors.live_location_updated_at` — zero code references anywhere, zero populated rows in production. Superseded by `vendor_current_lat/lng`.

## Intentional legacy / divergence — documented, no action

- `bookings.grace_cancelled` is declared in `20240101000005_auto_accept.sql` but **does not exist in the live database** and is referenced by zero code. Nothing to drop. The applied migration is off-limits per CLAUDE.md, so the divergence is recorded here instead. Grace-period cancellation works off `auto_accept_grace_expires_at`, which does exist and is used.
- `block_state_enum` still contains `auto_accept`. README already notes it as deprecated and no longer written or checked.

## No issue found

| Module | Last touched | Checked against | Result |
|---|---|---|---|
| `paystack-cancel` | 2026-06-24 | Payment-gate model | Current. Correctly branches on `gate_fired` and deletes transport buffers on pre-gate cancel. |
| `vendor-suggest-reschedule` | 2026-05-11 | Transport surcharge, gate model | No transport/gate handling needed: it only operates on `PENDING` bookings, which have no buffers yet and no fired gate. Initial grep-based suspicion was wrong; reading the file resolved it. |
| `submit-review` | 2026-05-15 | Taxonomy V2, trust layer, discovery badges | Current. Delegates `avg_rating`/`total_reviews` to the DB trigger in `20240101000001_indexes_rls_triggers.sql:538`, which recomputes from all reviews. |
| `photo-consent-expire` / `-respond` | 2026-04-18 | `portfolio_photos_v2` | Current. Already reads the v2 columns (`consent_state`, `booking_id`). |

## Method note for next time

Grep alone produced one false positive (`vendor-suggest-reschedule` looked stale because it had no transport/buffer references, but correctly needs none). Last-touch date plus a grep is a candidate generator, not a verdict. Every finding above was confirmed or dismissed by reading the file against the specific migration that changed its assumptions.
