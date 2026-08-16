-- Close a duplicate-NIN gap: vendors never stores the raw NIN (deliberate
-- PII-minimization decision, see vendor-kyc-verify/index.ts), which means
-- there was never anywhere to check whether the same NIN had already
-- verified a different vendor account. The same NIN + selfie could pass
-- KYC on unlimited vendor accounts.
--
-- Adds a one-way HMAC hash of the NIN (never the NIN itself) plus a partial
-- UNIQUE index scoped to kyc_status = 'verified'. A vendor re-verifying
-- their own already-verified NIN just rewrites the same hash to the same
-- row (no conflict — same-row UPDATE). needs_review/rejected/pending rows
-- are excluded, so a vendor parked outside 'verified' never permanently
-- squats a hash. See vendor-kyc-verify/index.ts (computes the hash) and
-- vendor-kyc-webhook/index.ts (enforces + reacts to a collision).

ALTER TABLE vendors ADD COLUMN kyc_nin_hash TEXT;
COMMENT ON COLUMN vendors.kyc_nin_hash IS
  'HMAC-SHA-256(NIN, NIN_HASH_PEPPER), hex — never the raw NIN. Used only to detect the same NIN verifying multiple vendor accounts.';

CREATE UNIQUE INDEX uq_vendors_kyc_nin_hash_verified
  ON vendors (kyc_nin_hash)
  WHERE kyc_status = 'verified' AND kyc_nin_hash IS NOT NULL;
