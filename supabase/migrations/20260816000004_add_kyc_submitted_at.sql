-- Fix: vendors.kyc_status defaults to 'pending' (NOT NULL) at row creation, so
-- a brand-new vendor who has never touched step 4 already has kyc_status =
-- 'pending' — indistinguishable from a vendor who genuinely completed a
-- verification attempt and is awaiting/processing the Youverify result. The onboarding resume
-- routing (getVendorOnboardingStep, apps/mobile/lib/vendorOnboarding.ts) checked
-- kyc_status === 'pending' to show the "verifying" screen, so it fired for
-- every vendor immediately after adding services, skipping step 4 (bank + KYC)
-- entirely. step-4-kyc.tsx's own resume logic (line ~72) had the same bug: it
-- checked `!data.kyc_status`, which can never be true since the column is
-- NOT NULL — so its "bank done, KYC never submitted, resume at KYC substep"
-- branch was dead code.
--
-- kyc_submitted_at is NULL until vendor-kyc-verify receives a definitive
-- Youverify NIN/selfie response, giving routing/resume logic an unambiguous
-- signal that a real verification attempt happened.

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS kyc_submitted_at TIMESTAMPTZ;

COMMENT ON COLUMN vendors.kyc_submitted_at IS 'Set when vendor-kyc-verify receives a real Youverify NIN/selfie response. NULL means KYC was never actually submitted, regardless of kyc_status default.';
