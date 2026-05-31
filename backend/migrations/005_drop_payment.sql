-- 005_drop_payment.sql
-- Removes the payment verification system entirely.
-- Replaced by league-based access control (see 004).

ALTER TABLE users
  DROP COLUMN IF EXISTS payment_status,
  DROP COLUMN IF EXISTS payment_screenshot_url,
  DROP COLUMN IF EXISTS payment_notes,
  DROP COLUMN IF EXISTS payment_approved_at;
