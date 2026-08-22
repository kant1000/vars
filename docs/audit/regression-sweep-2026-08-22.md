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

### Reschedule drops pre-booking transport buffers and orphans the old ones

- `customer-accept-reschedule/index.ts:72` calls `createTransportBuffers` (post-booking) but never `createPreTransportBuffers`, while `paystack-initialize/index.ts:330` calls both. The booking row already carries `pre_transport_buffer_slots`.
- `_shared/calendar.ts:25` only ever INSERTs. Nothing deletes buffers tied to the booking's *previous* time.

Net effect on an accepted reschedule: the 30–60 minute pre-travel buffer for distant customers is silently lost at the new time, and the old buffers stay in `vendor_calendar` blocking slots that are now free. A vendor can be booked back-to-back against a job needing an hour of travel, while separately losing availability they should have got back.

Note on framing: the file's last touch (24 Jun) *postdates* the surcharge migration (31 May), so this is not a clean "older than the feature" case. The reschedule path was updated for the post-booking half of the feature and never picked up the pre-booking half. Same class of defect, different route in.

**Not fixed here** — this is booking-lifecycle code, outside the location/auto-accept blast radius. It needs its own change and its own verification rather than being folded into a location feature.

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
