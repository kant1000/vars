-- btree_gist adds GiST operator classes for scalar types (uuid, int, text, etc.)
-- required for exclusion constraints that mix uuid = with tstzrange &&
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings ADD COLUMN slot_range tstzrange;

UPDATE bookings
SET slot_range = tstzrange(
  scheduled_at,
  scheduled_at + make_interval(mins => service_duration_blocks * 30),
  '[)'
);

CREATE OR REPLACE FUNCTION bookings_set_slot_range()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.slot_range := tstzrange(
    NEW.scheduled_at,
    NEW.scheduled_at + make_interval(mins => NEW.service_duration_blocks * 30),
    '[)'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_slot_range_trigger
  BEFORE INSERT OR UPDATE OF scheduled_at, service_duration_blocks
  ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_set_slot_range();

CREATE INDEX bookings_vendor_slot_range_gist
  ON bookings USING gist (vendor_id, slot_range);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_no_overlapping_slots
  EXCLUDE USING gist (vendor_id WITH =, slot_range WITH &&)
  WHERE (status NOT IN ('cancelled', 'expired', 'disputed', 'completed'));
