-- AB Testing App Database Schema
-- PostgreSQL Schema

-- Tests table
CREATE TABLE IF NOT EXISTS tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_domain VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'price', 'content', 'shipping', 'offer', 'theme'
    target_type VARCHAR(50), -- 'product', 'collection', 'page', 'theme'
    target_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'running', 'stopped', 'completed'
    goal JSONB NOT NULL, -- { type: 'conversion', metric: 'revenue' }
    variants JSONB NOT NULL, -- Array of variant configurations
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    stopped_at TIMESTAMP,
    
    CONSTRAINT valid_status CHECK (status IN ('draft', 'running', 'stopped', 'completed'))
);

-- Test assignments table (tracks which variant each user sees)
CREATE TABLE IF NOT EXISTS test_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    shop_domain VARCHAR(255) NOT NULL,
    variant_id VARCHAR(255) NOT NULL,
    variant_name VARCHAR(255) NOT NULL,
    assigned_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(test_id, user_id, shop_domain)
);

-- Events table (tracks conversions and interactions)
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
    variant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    shop_domain VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'conversion', 'view', 'click', etc.
    event_value DECIMAL(10, 2) DEFAULT 0, -- Revenue value for conversions
    metadata JSONB, -- Additional event data
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tests_shop_domain ON tests(shop_domain);
CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);
CREATE INDEX IF NOT EXISTS idx_test_assignments_test_id ON test_assignments(test_id);
CREATE INDEX IF NOT EXISTS idx_test_assignments_user ON test_assignments(user_id, shop_domain);
CREATE INDEX IF NOT EXISTS idx_events_test_id ON events(test_id);
CREATE INDEX IF NOT EXISTS idx_events_variant_id ON events(variant_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id, shop_domain);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS update_tests_updated_at ON tests;
CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON tests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

