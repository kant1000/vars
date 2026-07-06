-- Normalise vendor_leads.phone to E.164 format.
--
-- Rules applied (in order):
--   1. Numbers already starting with + → strip all non-digits after the + (handles spaces/dashes)
--   2. Local Nigerian 11-digit (0 + 10 digits starting with 7/8/9) → replace 0 with +234
--   3. 10-digit missing leading 0 (starts with 7/8/9) → prefix with +234
--   4. Anything else → left unchanged (flagged via the verification query below)

UPDATE vendor_leads
SET phone = cleaned.normalized
FROM (
  SELECT
    id,
    CASE
      WHEN phone LIKE '+%'
        THEN '+' || regexp_replace(substring(phone FROM 2), '[^\d]', '', 'g')
      WHEN regexp_replace(phone, '[^\d]', '', 'g') ~ '^0[789]\d{9}$'
        THEN '+234' || substring(regexp_replace(phone, '[^\d]', '', 'g') FROM 2)
      WHEN regexp_replace(phone, '[^\d]', '', 'g') ~ '^[789]\d{9}$'
        THEN '+234' || regexp_replace(phone, '[^\d]', '', 'g')
      ELSE phone
    END AS normalized
  FROM vendor_leads
) AS cleaned
WHERE vendor_leads.id = cleaned.id;

-- Verification: any remaining non-E.164 rows will show up here.
-- Expected result: empty (or only the one anomalous entry starting with 88).
-- SELECT id, phone FROM vendor_leads WHERE phone !~ '^\+[1-9]\d{6,14}$';
