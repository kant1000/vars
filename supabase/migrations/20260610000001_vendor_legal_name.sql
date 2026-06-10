-- Migration: Vendor legal name from KYC
--
-- 1. Adds kyc_legal_name to vendors
--    Set by vendor-kyc-webhook only; vendor cannot write it (same RLS pattern
--    used for profile_image_url in 20260531000001_vendor_trust_layer).
-- 2. Replaces vendors_update_own to lock the new column.

-- ============================================================
-- 1. Column
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS kyc_legal_name TEXT;

COMMENT ON COLUMN vendors.kyc_legal_name IS 'Legal name extracted from Youverify ID check. Set by vendor-kyc-webhook. Locked — client writes blocked by RLS.';

-- ============================================================
-- 2. RLS: replace vendors_update_own to lock kyc_legal_name
-- ============================================================

DROP POLICY "vendors_update_own" ON vendors;

CREATE POLICY "vendors_update_own"
  ON vendors FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND profile_image_url IS NOT DISTINCT FROM
        (SELECT v.profile_image_url FROM vendors v WHERE v.id = auth.uid())
    AND profile_image_raw_url IS NOT DISTINCT FROM
        (SELECT v.profile_image_raw_url FROM vendors v WHERE v.id = auth.uid())
    AND profile_image_locked IS NOT DISTINCT FROM
        (SELECT v.profile_image_locked FROM vendors v WHERE v.id = auth.uid())
    AND kyc_legal_name IS NOT DISTINCT FROM
        (SELECT v.kyc_legal_name FROM vendors v WHERE v.id = auth.uid())
  );
