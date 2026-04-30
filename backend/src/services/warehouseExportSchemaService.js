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
    { name: 'type', type: 'STRING', mode: 'NULLABLE' },
    { name: 'status', type: 'STRING', mode: 'NULLABLE' },
    { name: 'goal', type: 'STRING', mode: 'NULLABLE' },
    { name: 'variants', type: 'STRING', mode: 'NULLABLE' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
    { name: 'updated_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
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
    { name: 'step_id', type: 'STRING', mode: 'NULLABLE' },
    { name: 'step_order', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'users', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'computed_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
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
    version: '2026-04-30',
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
  getExportSchemaManifest,
  validateExportSchemaManifest,
};
