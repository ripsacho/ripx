-- System-wide notifications: scope 'shop' (per shop) or 'all' (announcement to all). shop_domain '*' = all.
-- Migration: 031_add_notifications_scope.sql

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scope VARCHAR(50) DEFAULT 'shop';
