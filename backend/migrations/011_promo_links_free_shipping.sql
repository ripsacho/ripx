-- Allow 'free_shipping' discount type in promo_links (used by offer tests)
ALTER TABLE promo_links DROP CONSTRAINT IF EXISTS valid_discount_type;
ALTER TABLE promo_links ADD CONSTRAINT valid_discount_type
  CHECK (discount_type IN ('percentage', 'fixed', 'free_shipping'));
