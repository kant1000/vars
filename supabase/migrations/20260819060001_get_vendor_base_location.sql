-- Transport-fee distance was being measured against vendors.auto_accept_zone_lat/lng
-- (an unrelated, opt-in, ephemeral field for the auto-accept feature) instead of the
-- vendor's actual base location. Expose base_location as plain lat/lng so callers can
-- haversine it directly, mirroring the ST_Y/ST_X extraction already used by
-- get_nearby_vendors.
CREATE FUNCTION public.get_vendor_base_location(p_vendor_id uuid)
RETURNS TABLE(lat double precision, lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER
AS $function$
  SELECT ST_Y(base_location::geometry), ST_X(base_location::geometry)
  FROM vendors
  WHERE id = p_vendor_id;
$function$;

GRANT EXECUTE ON FUNCTION public.get_vendor_base_location(uuid) TO anon, authenticated;
