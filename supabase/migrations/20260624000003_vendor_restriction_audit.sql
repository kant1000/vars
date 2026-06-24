-- ============================================================
-- Migration: Vendor restriction audit fields
--
-- Adds restriction_lifted_at and restriction_lifted_by to vendors
-- so the admin action records who lifted a restriction and when.
-- ============================================================

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS restriction_lifted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restriction_lifted_by  TEXT;

COMMENT ON COLUMN vendors.restriction_lifted_at IS
  'When the restriction was lifted by admin. NULL while restricted or before first lift.';
COMMENT ON COLUMN vendors.restriction_lifted_by IS
  'Admin user reference (email or id) who lifted the restriction.';
