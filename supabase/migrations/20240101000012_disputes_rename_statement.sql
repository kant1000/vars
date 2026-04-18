-- Rename disputes.statement → disputes.reason (if not already done)
-- No-op if the column is already named 'reason'.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'disputes' AND column_name = 'statement'
  ) THEN
    ALTER TABLE disputes RENAME COLUMN statement TO reason;
  END IF;
END $$;
