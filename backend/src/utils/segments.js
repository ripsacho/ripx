/**
 * Segment Normalization Utilities
 *
 * Normalizes and validates targeting segment data for AB tests.
 */

/**
 * Normalize segments object for storage
 *
 * @param {Object} segments - Raw segments from request
 * @returns {Object|null} Normalized segments or null if invalid
 */
function normalizeProductIds(input) {
  let source = input;
  if (typeof source === 'string') {
    source = source
      .split(/[\n,]+/)
      .map(value => value.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(source)) {
    return [];
  }
  return Array.from(
    new Set(
      source
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .map(value => {
          if (value.startsWith('gid://')) {
            return value;
          }
          const numeric = value.replace(/\D/g, '');
          return numeric ? `gid://shopify/Product/${numeric}` : value;
        })
    )
  );
}

function normalizeSegments(segments) {
  if (!segments || typeof segments !== 'object') {
    return null;
  }

  const device = segments.device ? String(segments.device).toLowerCase() : 'all';
  const customer = segments.customer ? String(segments.customer).toLowerCase() : 'all';
  let countries = segments.countries;

  if (typeof countries === 'string') {
    countries = countries
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(countries)) {
    countries = [];
  }

  const result = { device, customer, countries };
  const excludedProductIds = normalizeProductIds(segments.excluded_product_ids);
  if (excludedProductIds.length > 0) {
    result.excluded_product_ids = excludedProductIds;
  }

  if (segments.traffic_source && typeof segments.traffic_source === 'string') {
    result.traffic_source = segments.traffic_source.toLowerCase();
  }
  if (segments.url_pattern && typeof segments.url_pattern === 'string') {
    result.url_pattern = segments.url_pattern.trim() || null;
  }
  if (
    segments.min_sessions !== undefined &&
    segments.min_sessions !== null &&
    segments.min_sessions !== ''
  ) {
    const n = Number(segments.min_sessions);
    result.min_sessions = !Number.isNaN(n) && n >= 0 ? n : null;
  }

  if (Array.isArray(segments.custom_rules) && segments.custom_rules.length > 0) {
    result.custom_rules = segments.custom_rules.filter(
      r => r && typeof r.field === 'string' && r.value != null // eslint-disable-line eqeqeq
    );
  }

  // Page rules: multiple include/exclude URL patterns with match_type
  const VALID_MATCH_TYPES = ['regex', 'contains', 'starts_with', 'ends_with', 'equals'];
  if (Array.isArray(segments.page_rules) && segments.page_rules.length > 0) {
    const filtered = segments.page_rules
      .filter(r => r && typeof r.type === 'string' && r.pattern != null && String(r.pattern).trim()) // eslint-disable-line eqeqeq
      .map(r => {
        const matchType =
          r.match_type && VALID_MATCH_TYPES.includes(String(r.match_type).toLowerCase())
            ? String(r.match_type).toLowerCase()
            : 'regex';
        return {
          type: String(r.type || 'include').toLowerCase(),
          pattern: String(r.pattern).trim(),
          match_type: matchType,
        };
      });
    result.page_rules = filtered;
  }

  // Device rules: multiple include/exclude devices
  if (Array.isArray(segments.device_rules) && segments.device_rules.length > 0) {
    result.device_rules = segments.device_rules
      .filter(
        r =>
          r &&
          typeof r.type === 'string' &&
          ['desktop', 'mobile'].includes(String(r.value || '').toLowerCase())
      )
      .map(r => ({ type: r.type.toLowerCase(), value: String(r.value).toLowerCase() }));
  }

  // Audience rules: multiple include/exclude (customer type or countries)
  if (Array.isArray(segments.audience_rules) && segments.audience_rules.length > 0) {
    result.audience_rules = segments.audience_rules
      .filter(
        r => r && typeof r.type === 'string' && r.field && r.value != null // eslint-disable-line eqeqeq
      )
      .map(r => {
        const rule = { type: r.type.toLowerCase(), field: String(r.field).toLowerCase() };
        if (rule.field === 'customer') {
          rule.value = String(r.value || '').toLowerCase();
        } else if (rule.field === 'country') {
          rule.value = Array.isArray(r.value)
            ? r.value.map(String).filter(Boolean)
            : String(r.value || '')
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
        }
        return rule;
      });
  }

  // JS targeting: custom code evaluated client-side
  if (
    segments.js_targeting &&
    typeof segments.js_targeting === 'object' &&
    segments.js_targeting.enabled
  ) {
    const code =
      typeof segments.js_targeting.code === 'string' ? segments.js_targeting.code.trim() : '';
    if (code) {
      result.js_targeting = { enabled: true, code };
    }
  }

  // Exclude internal IPs (office/VPN patterns)
  if (segments.exclude_internal_ips === true) {
    result.exclude_internal_ips = true;
  }

  // Exclude bot traffic (user-agent based)
  if (segments.exclude_bots === true) {
    result.exclude_bots = true;
  }

  // Traffic ramp: start at X% and ramp to 100% over time (0 = no ramp)
  if (
    segments.traffic_ramp_percent !== undefined &&
    segments.traffic_ramp_percent !== null &&
    segments.traffic_ramp_percent !== ''
  ) {
    const n = Number(segments.traffic_ramp_percent);
    result.traffic_ramp_percent = !Number.isNaN(n) && n >= 0 && n <= 100 ? n : null;
  }
  if (
    segments.traffic_ramp_days !== undefined &&
    segments.traffic_ramp_days !== null &&
    segments.traffic_ramp_days !== ''
  ) {
    const n = Number(segments.traffic_ramp_days);
    result.traffic_ramp_days = !Number.isNaN(n) && n >= 1 && n <= 30 ? Math.round(n) : null;
  }

  // Visual editor: preview URL and element selector (persisted for Config step)
  if (
    typeof segments.visual_editor_preview_url === 'string' &&
    segments.visual_editor_preview_url.trim()
  ) {
    result.visual_editor_preview_url = segments.visual_editor_preview_url.trim();
  }
  if (
    typeof segments.visual_editor_selector === 'string' &&
    segments.visual_editor_selector.trim()
  ) {
    result.visual_editor_selector = segments.visual_editor_selector.trim();
  }

  const MAX_VISUAL_EDITOR_RULES = 5;
  const POSITIONS = ['after', 'before', 'afterbegin', 'beforeend'];
  const MUTATION_TYPES = ['none', 'hide', 'show', 'set_text', 'set_attr', 'set_style'];
  if (Array.isArray(segments.visual_editor_rules) && segments.visual_editor_rules.length > 0) {
    result.visual_editor_rules = segments.visual_editor_rules
      .slice(0, MAX_VISUAL_EDITOR_RULES)
      .map(r => {
        const base = {
          selector: '',
          css: '',
          js: '',
          position: 'after',
          mutation_type: 'none',
          mutation_text: '',
          mutation_attribute: '',
          mutation_attribute_value: '',
          mutation_style: '',
        };
        if (!r || typeof r !== 'object') {
          return base;
        }
        const mutationType = String(r.mutation_type || 'none')
          .toLowerCase()
          .trim();
        return {
          selector: typeof r.selector === 'string' ? r.selector.trim() : '',
          css: typeof r.css === 'string' ? r.css.trim() : '',
          js: typeof r.js === 'string' ? r.js.trim() : '',
          position: POSITIONS.includes(r.position) ? r.position : 'after',
          mutation_type: MUTATION_TYPES.includes(mutationType) ? mutationType : 'none',
          mutation_text:
            r.mutation_text === undefined || r.mutation_text === null
              ? ''
              : String(r.mutation_text),
          mutation_attribute:
            typeof r.mutation_attribute === 'string' ? r.mutation_attribute.trim() : '',
          mutation_attribute_value:
            r.mutation_attribute_value === undefined || r.mutation_attribute_value === null
              ? ''
              : String(r.mutation_attribute_value),
          mutation_style: typeof r.mutation_style === 'string' ? r.mutation_style.trim() : '',
        };
      });
  }

  // Storefront anti-flicker strategy (per-test): balanced (default) or strict.
  const antiFlickerModeRaw = String(segments.anti_flicker_mode || '')
    .toLowerCase()
    .trim();
  if (antiFlickerModeRaw === 'strict') {
    result.anti_flicker_mode = 'strict';
  } else if (antiFlickerModeRaw === 'balanced') {
    result.anti_flicker_mode = 'balanced';
  }

  return result;
}

module.exports = {
  normalizeSegments,
};
