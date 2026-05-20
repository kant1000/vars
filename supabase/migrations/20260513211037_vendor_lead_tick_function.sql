-- ============================================================
-- VARS — Migration: vendor_lead_tick_function (initial)
-- First implementation of vendor_lead_tick().
-- Superseded by later migrations in this series.
-- ============================================================

CREATE OR REPLACE FUNCTION vendor_lead_tick()
RETURNS TABLE(transitions integer, queued integer)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT 0, 0;
END;
$$;

GRANT EXECUTE ON FUNCTION vendor_lead_tick() TO service_role;
