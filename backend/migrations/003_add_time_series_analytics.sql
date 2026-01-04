-- Time-Series Analytics Table
-- Stores daily aggregated analytics data for tests

CREATE TABLE IF NOT EXISTS analytics_daily (
  id SERIAL PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL,
  variant_name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  visitors INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue DECIMAL(10, 2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(test_id, variant_id, date)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_analytics_daily_test_date ON analytics_daily(test_id, date);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_variant ON analytics_daily(variant_id);

-- Function to aggregate daily analytics
CREATE OR REPLACE FUNCTION aggregate_daily_analytics()
RETURNS void AS $$
BEGIN
  -- Insert or update daily analytics for yesterday
  INSERT INTO analytics_daily (test_id, variant_id, variant_name, date, visitors, conversions, revenue)
  SELECT 
    ta.test_id,
    ta.variant_id,
    ta.variant_name,
    CURRENT_DATE - INTERVAL '1 day' as date,
    COUNT(DISTINCT ta.user_id) as visitors,
    COUNT(DISTINCT CASE WHEN e.event_type = 'conversion' THEN e.user_id END) as conversions,
    COALESCE(SUM(CASE WHEN e.event_type = 'conversion' THEN e.event_value ELSE 0 END), 0) as revenue
  FROM test_assignments ta
  LEFT JOIN events e ON e.test_id = ta.test_id 
    AND e.variant_id = ta.variant_id 
    AND e.user_id = ta.user_id
    AND DATE(e.created_at) = CURRENT_DATE - INTERVAL '1 day'
  WHERE DATE(ta.created_at) = CURRENT_DATE - INTERVAL '1 day'
    OR (e.id IS NOT NULL AND DATE(e.created_at) = CURRENT_DATE - INTERVAL '1 day')
  GROUP BY ta.test_id, ta.variant_id, ta.variant_name
  ON CONFLICT (test_id, variant_id, date) 
  DO UPDATE SET
    visitors = EXCLUDED.visitors,
    conversions = EXCLUDED.conversions,
    revenue = EXCLUDED.revenue,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

