-- Rename disputes.statement → disputes.reason
-- The edge function (dispute-raise) and admin panel both reference the column
-- as "reason"; the original migration named it "statement". This aligns them.

ALTER TABLE disputes RENAME COLUMN statement TO reason;
