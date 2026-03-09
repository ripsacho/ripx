-- Ensure any tenant with a .myshopify.com domain has platform = 'shopify' (fixes mis-labelled as standalone)
-- Migration: 046_shopify_domains_platform_shopify.sql

UPDATE tenants
SET platform = 'shopify', updated_at = NOW()
WHERE LOWER(TRIM(domain)) LIKE '%.myshopify.com'
  AND (platform IS NULL OR platform != 'shopify');
