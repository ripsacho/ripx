const shippingCarrierCallbackTrace = [];

function recordShippingCarrierCallbackTrace(entry = {}) {
  const traceEntry = {
    at: new Date().toISOString(),
    test_id: entry.test_id || null,
    variant_id: entry.variant_id || null,
    variant_index: entry.variant_index || null,
    config_revision: entry.config_revision || null,
    strategy: entry.strategy || null,
    amount: entry.amount ?? null,
    currency: entry.currency || null,
    rates_count: Number(entry.rates_count || 0),
    rates: Array.isArray(entry.rates)
      ? entry.rates.slice(0, 10).map(rate => ({
          service_name: rate?.service_name || null,
          description: rate?.description || '',
          service_code: rate?.service_code || null,
          currency: rate?.currency || null,
          total_price: rate?.total_price || null,
          min_delivery_date: rate?.min_delivery_date || null,
          max_delivery_date: rate?.max_delivery_date || null,
        }))
      : [],
    assignment_required: Boolean(entry.assignment_required),
    assignment_matches:
      entry.assignment_matches === null || entry.assignment_matches === undefined
        ? null
        : Boolean(entry.assignment_matches),
    assignment_diagnostics:
      entry.assignment_diagnostics && typeof entry.assignment_diagnostics === 'object'
        ? {
            attributes_count: Number(entry.assignment_diagnostics.attributes_count || 0),
            ripx_test_values: Array.isArray(entry.assignment_diagnostics.ripx_test_values)
              ? entry.assignment_diagnostics.ripx_test_values.slice(0, 5)
              : [],
            ripx_variant_values: Array.isArray(entry.assignment_diagnostics.ripx_variant_values)
              ? entry.assignment_diagnostics.ripx_variant_values.slice(0, 5)
              : [],
            expected_test_id: entry.assignment_diagnostics.expected_test_id || null,
            expected_variant_values: Array.isArray(
              entry.assignment_diagnostics.expected_variant_values
            )
              ? entry.assignment_diagnostics.expected_variant_values.slice(0, 5)
              : [],
          }
        : null,
    request_shape: entry.request_shape || {},
  };
  shippingCarrierCallbackTrace.push(traceEntry);
  while (shippingCarrierCallbackTrace.length > 80) {
    shippingCarrierCallbackTrace.shift();
  }
  return traceEntry;
}

function getShippingCarrierCallbackTrace({ testId = null, limit = 25 } = {}) {
  const normalizedTestId = String(testId || '').trim();
  const max = Math.max(1, Math.min(80, Number(limit) || 25));
  return shippingCarrierCallbackTrace
    .filter(entry => !normalizedTestId || String(entry.test_id || '') === normalizedTestId)
    .slice(-max)
    .reverse();
}

module.exports = {
  recordShippingCarrierCallbackTrace,
  getShippingCarrierCallbackTrace,
};
