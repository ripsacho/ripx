-- Multi-goal and custom events support
-- event_name: for custom events (e.g. add_to_cart, newsletter_signup)
-- event_type remains for system types: conversion, view, click, etc.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_name VARCHAR(100);

-- Index for analytics queries (test + variant + event type/name)
CREATE INDEX IF NOT EXISTS idx_events_analytics
  ON events (test_id, variant_id, event_type);

-- Partial index for custom event lookups
CREATE INDEX IF NOT EXISTS idx_events_custom_by_test
  ON events (test_id, event_name)
  WHERE event_name IS NOT NULL AND event_name != '';

COMMENT ON COLUMN events.event_name IS 'Custom event identifier (e.g. add_to_cart, newsletter_signup). NULL for conversion.';
