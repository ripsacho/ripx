const LIGHTWEIGHT_EXPORT_SCHEMA_VERSION = 'analytics-export/v2';

const EXPORT_SCHEMAS = Object.freeze({
  assignments: [
    { name: 'test_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'variant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'user_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'shop_domain', type: 'STRING', mode: 'NULLABLE' },
    { name: 'assigned_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'device', type: 'STRING', mode: 'NULLABLE' },
    { name: 'country', type: 'STRING', mode: 'NULLABLE' },
  ],
  events: [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'test_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'variant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'user_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'shop_domain', type: 'STRING', mode: 'NULLABLE' },
    { name: 'event_type', type: 'STRING', mode: 'NULLABLE' },
    { name: 'event_name', type: 'STRING', mode: 'NULLABLE' },
    { name: 'event_value', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'metadata', type: 'STRING', mode: 'NULLABLE' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
  tests: [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'shop_domain', type: 'STRING', mode: 'NULLABLE' },
    { name: 'name', type: 'STRING', mode: 'NULLABLE' },
    { name: 'description', type: 'STRING', mode: 'NULLABLE' },
    { name: 'type', type: 'STRING', mode: 'NULLABLE' },
    { name: 'status', type: 'STRING', mode: 'NULLABLE' },
    { name: 'goal', type: 'STRING', mode: 'NULLABLE' },
    { name: 'variants', type: 'STRING', mode: 'NULLABLE' },
    { name: 'holdout_percent', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'updated_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
  heatmap_events: [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'tenant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'test_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'variant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'shop_domain', type: 'STRING', mode: 'NULLABLE' },
    { name: 'page_url', type: 'STRING', mode: 'NULLABLE' },
    { name: 'page_key', type: 'STRING', mode: 'NULLABLE' },
    { name: 'event_type', type: 'STRING', mode: 'NULLABLE' },
    { name: 'x', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'y', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'scroll_depth', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'viewport_width', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'viewport_height', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'page_x', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'page_y', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'page_width', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'page_height', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'capture_version', type: 'STRING', mode: 'NULLABLE' },
    { name: 'page_height_source', type: 'STRING', mode: 'NULLABLE' },
    { name: 'scroll_container_detected', type: 'BOOLEAN', mode: 'NULLABLE' },
    { name: 'device', type: 'STRING', mode: 'NULLABLE' },
    { name: 'country', type: 'STRING', mode: 'NULLABLE' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
  guardrails: [
    { name: 'test_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'metric', type: 'STRING', mode: 'NULLABLE' },
    { name: 'threshold', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'status', type: 'STRING', mode: 'NULLABLE' },
    { name: 'evaluated_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
  funnels: [
    { name: 'test_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'variant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'shop_domain', type: 'STRING', mode: 'NULLABLE' },
    { name: 'funnel_mode', type: 'STRING', mode: 'NULLABLE' },
    { name: 'step_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'step_order', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'users', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'start_date', type: 'DATE', mode: 'NULLABLE' },
    { name: 'end_date', type: 'DATE', mode: 'NULLABLE' },
    { name: 'device', type: 'STRING', mode: 'NULLABLE' },
    { name: 'country', type: 'STRING', mode: 'NULLABLE' },
    { name: 'computed_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
  event_health: [
    { name: 'test_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'event_name', type: 'STRING', mode: 'NULLABLE' },
    { name: 'role', type: 'STRING', mode: 'NULLABLE' },
    { name: 'total_events', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'unique_users', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'first_seen', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'last_seen', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
  heatmap_daily_rollups: [
    { name: 'event_date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'shop_domain', type: 'STRING', mode: 'NULLABLE' },
    { name: 'test_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'variant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'page_key', type: 'STRING', mode: 'NULLABLE' },
    { name: 'event_type', type: 'STRING', mode: 'NULLABLE' },
    { name: 'device', type: 'STRING', mode: 'NULLABLE' },
    { name: 'country', type: 'STRING', mode: 'NULLABLE' },
    { name: 'event_count', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'last_seen_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
  analytics_daily_segments: [
    { name: 'date', type: 'DATE', mode: 'REQUIRED' },
    { name: 'test_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'shop_domain', type: 'STRING', mode: 'NULLABLE' },
    { name: 'variant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'variant_name', type: 'STRING', mode: 'NULLABLE' },
    { name: 'device', type: 'STRING', mode: 'NULLABLE' },
    { name: 'country', type: 'STRING', mode: 'NULLABLE' },
    { name: 'visitors', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'conversions', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'revenue', type: 'FLOAT', mode: 'NULLABLE' },
  ],
  checkout_diagnostics: [
    { name: 'test_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'variant_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'diagnostic_code', type: 'STRING', mode: 'NULLABLE' },
    { name: 'checkout_phase', type: 'STRING', mode: 'NULLABLE' },
    { name: 'metadata', type: 'STRING', mode: 'NULLABLE' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  ],
});

function getExportSchemaManifest() {
  return {
    version: '2026-05-05',
    lightweightSchemaVersion: LIGHTWEIGHT_EXPORT_SCHEMA_VERSION,
    format: 'bigquery',
    schemas: EXPORT_SCHEMAS,
    lightweightFormats: ['csv', 'json'],
  };
}

function validateExportSchemaManifest(manifest = getExportSchemaManifest()) {
  const errors = [];
  Object.entries(manifest.schemas || {}).forEach(([table, fields]) => {
    if (!Array.isArray(fields) || fields.length === 0) {
      errors.push(`${table} must define at least one field`);
    }
    fields.forEach(field => {
      if (!field.name || !field.type || !field.mode) {
        errors.push(`${table} contains an invalid field`);
      }
    });
  });
  return { valid: errors.length === 0, errors };
}

module.exports = {
  EXPORT_SCHEMAS,
  LIGHTWEIGHT_EXPORT_SCHEMA_VERSION,
  getExportSchemaManifest,
  validateExportSchemaManifest,
};
