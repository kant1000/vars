-- Migration 013: Add category enum to disputes table
-- Admin can instantly triage disputes by category without reading free-text reason.

CREATE TYPE dispute_category AS ENUM (
  'vendor_no_show',
  'vendor_very_late',
  'service_not_completed',
  'service_quality_poor',
  'wrong_service',
  'other'
);

ALTER TABLE disputes
  ADD COLUMN category dispute_category;

COMMENT ON COLUMN disputes.category IS
  'Structured category selected by user. NULL for disputes raised before this migration.';
