-- Advanced Features Schema
-- Additional tables for promo links, notifications, and targeting

-- Promo Links table
CREATE TABLE IF NOT EXISTS promo_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    variant_id VARCHAR(255) NOT NULL,
    shop_domain VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    discount_type VARCHAR(50) NOT NULL, -- 'percentage' or 'fixed'
    discount_value DECIMAL(10, 2) NOT NULL,
    target_type VARCHAR(50), -- 'product', 'collection', 'cart'
    target_id VARCHAR(255),
    expires_at TIMESTAMP,
    max_uses INTEGER,
    uses_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_discount_type CHECK (discount_type IN ('percentage', 'fixed'))
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'test_complete', 'significance', 'error'
    title VARCHAR(255) NOT NULL,
    message TEXT,
    data JSONB,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Test targeting configuration (stored in tests table as JSONB, but can be separate)
-- This is already handled in the tests.goal JSONB field

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promo_links_test_id ON promo_links(test_id);
CREATE INDEX IF NOT EXISTS idx_promo_links_token ON promo_links(token);
CREATE INDEX IF NOT EXISTS idx_promo_links_shop ON promo_links(shop_domain);
CREATE INDEX IF NOT EXISTS idx_notifications_shop ON notifications(shop_domain);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

