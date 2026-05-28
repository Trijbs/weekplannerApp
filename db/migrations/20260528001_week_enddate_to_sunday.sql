-- Extend all existing week end dates from Friday to Sunday (+2 days).
-- This allows Saturday and Sunday to be part of the same week record.
UPDATE weeks
SET end_date = (end_date::date + interval '2 days')::text
WHERE end_date IS NOT NULL
  AND extract(dow FROM end_date::date) = 5; -- 5 = Friday
