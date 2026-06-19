-- Adds 'needs_review' to kyc_status_enum.
-- Used when Youverify signals a pass but the webhook payload and GET API fallback
-- both fail to return the face image or legal name. Vendor stays unverified;
-- admin resolves manually using the Youverify dashboard.
ALTER TYPE kyc_status_enum ADD VALUE IF NOT EXISTS 'needs_review';
