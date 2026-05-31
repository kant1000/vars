-- ============================================================
-- VARS — Transport Surcharge
-- Adds distance-based transport fee columns to bookings.
-- Adds RLS guards preventing client JWTs from writing these columns.
--
-- BASE_RADIUS_KM = 5. Any distance beyond 5 km from vendor zone centre
-- triggers a tiered surcharge. Tiers live in _shared/constants.ts.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS transport_fee_kobo         INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS distance_km                NUMERIC(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pre_transport_buffer_slots INTEGER      NOT NULL DEFAULT 0;

COMMENT ON COLUMN bookings.transport_fee_kobo IS
  'Distance-based surcharge in kobo added to the Paystack charge. 0 = no surcharge. Server-set only.';
COMMENT ON COLUMN bookings.distance_km IS
  'Straight-line km between customer location and vendor zone centre at booking time. Stored for audit and display.';
COMMENT ON COLUMN bookings.pre_transport_buffer_slots IS
  'Number of 30-min transport_buffer slots inserted before the booking start (0–2). Drives cancellation cleanup.';

-- ── RLS: lock these three columns against client JWT writes ─────────────────
-- The existing bookings_user_update and bookings_vendor_update policies have no
-- WITH CHECK clause, allowing clients to write any column. Recreate them with
-- correlated-subquery guards that freeze the surcharge columns.
-- Service role (createAdminClient in edge functions) bypasses RLS entirely.

DROP POLICY IF EXISTS "bookings_user_update" ON bookings;
CREATE POLICY "bookings_user_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND transport_fee_kobo IS NOT DISTINCT FROM
        (SELECT b.transport_fee_kobo FROM bookings b WHERE b.id = bookings.id)
    AND distance_km IS NOT DISTINCT FROM
        (SELECT b.distance_km FROM bookings b WHERE b.id = bookings.id)
    AND pre_transport_buffer_slots IS NOT DISTINCT FROM
        (SELECT b.pre_transport_buffer_slots FROM bookings b WHERE b.id = bookings.id)
  );

DROP POLICY IF EXISTS "bookings_vendor_update" ON bookings;
CREATE POLICY "bookings_vendor_update"
  ON bookings FOR UPDATE
  USING (auth.uid() = vendor_id)
  WITH CHECK (
    auth.uid() = vendor_id
    AND transport_fee_kobo IS NOT DISTINCT FROM
        (SELECT b.transport_fee_kobo FROM bookings b WHERE b.id = bookings.id)
    AND distance_km IS NOT DISTINCT FROM
        (SELECT b.distance_km FROM bookings b WHERE b.id = bookings.id)
    AND pre_transport_buffer_slots IS NOT DISTINCT FROM
        (SELECT b.pre_transport_buffer_slots FROM bookings b WHERE b.id = bookings.id)
  );
