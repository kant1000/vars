-- Add kyc_rejection_reason to vendors table.
-- Populated by vendor-kyc-webhook on rejection, cleared by vendor-kyc-init on retry.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT;
