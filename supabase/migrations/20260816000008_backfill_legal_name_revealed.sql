-- Backfill: bookings that already reached on_way (paid) before
-- legal_name_revealed existed never got the flag flipped retroactively —
-- confirmed 1 existing row via query. Uses gate_charged_at (falls back to
-- on_way_at) as a reasonable stand-in for the real, unrecorded reveal time,
-- same pattern as 20260816000005_backfill_kyc_verified_at.sql.

UPDATE bookings
   SET legal_name_revealed = TRUE,
       legal_name_reveal_at = COALESCE(gate_charged_at, on_way_at, NOW())
 WHERE gate_fired = TRUE
   AND status IN ('on_way', 'arrived', 'service_rendered', 'completed')
   AND legal_name_revealed = FALSE;
