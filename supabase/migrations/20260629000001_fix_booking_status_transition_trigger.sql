-- Fix: check_booking_status_transition was SECURITY DEFINER, which means
-- current_user always returns the function owner (postgres), not the calling
-- role. PostgREST's SET LOCAL ROLE service_role is invisible inside SECURITY
-- DEFINER context. Changing to SECURITY INVOKER lets current_user reflect the
-- actual calling role so service_role edge functions can make any transition.
CREATE OR REPLACE FUNCTION public.check_booking_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
AS $function$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- PostgREST sets LOCAL ROLE to 'service_role' for service_role key requests.
  -- With SECURITY INVOKER, current_user reflects that SET ROLE — unlike SECURITY
  -- DEFINER where current_user always returns the function owner (postgres).
  -- Also allow postgres (direct SQL, migrations) and supabase_admin.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  -- JWT clients: only the three vendor progress transitions are permitted
  IF (OLD.status = 'accepted'   AND NEW.status = 'on_way') OR
     (OLD.status = 'on_way'     AND NEW.status = 'arrived') OR
     (OLD.status = 'arrived'    AND NEW.status = 'service_rendered') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid booking status transition from "%" to "%" — use the appropriate edge function.',
    OLD.status, NEW.status;
END;
$function$;
