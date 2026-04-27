-- Migration 016: Booking status transition guard
-- Prevents JWT clients from making invalid status jumps on bookings.
-- Edge functions run as service_role and bypass this check entirely.
-- The only status changes JWT clients (vendors) make directly are the
-- three in-progress transitions: accepted→on_way, on_way→arrived,
-- arrived→service_rendered. Everything else (accept, cancel, dispute,
-- settle, reschedule) goes through edge functions with admin client.

CREATE OR REPLACE FUNCTION check_booking_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- No change to status — always allow
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Service role (edge functions) — unrestricted
  IF current_setting('role', TRUE) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- JWT clients: only the three vendor progress transitions are permitted
  IF (OLD.status = 'accepted'         AND NEW.status = 'on_way') OR
     (OLD.status = 'on_way'           AND NEW.status = 'arrived') OR
     (OLD.status = 'arrived'          AND NEW.status = 'service_rendered') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid booking status transition from "%" to "%" — use the appropriate edge function.',
    OLD.status, NEW.status;
END;
$$;

CREATE TRIGGER trg_booking_status_transition
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_booking_status_transition();

COMMENT ON FUNCTION check_booking_status_transition IS
  'Blocks invalid status jumps from JWT clients. Service role (edge functions) bypass freely.
   Valid JWT transitions: accepted→on_way, on_way→arrived, arrived→service_rendered.';
