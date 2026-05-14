export const ADVANCED_STUDIO_SECTIONS = [
  {
    id: 'safety',
    label: 'Safety & quality',
    group: 'Protection',
    hint: 'Guardrails, traffic quality, rollout',
  },
  {
    id: 'overrides',
    label: 'URL & sessions',
    group: 'Refinement',
    hint: 'Legacy URL regex and session floor',
  },
  {
    id: 'code',
    label: 'JavaScript',
    group: 'Expert',
    hint: 'Client-side eligibility code',
  },
  {
    id: 'presets',
    label: 'Presets',
    group: 'Expert',
    hint: 'Save and reuse targeting bundles',
  },
];

export const ADVANCED_STUDIO_GROUPS = ADVANCED_STUDIO_SECTIONS.reduce((groups, section) => {
  const existing = groups.find(group => group.label === section.group);
  if (existing) {
    existing.values.push(section.id);
    return groups;
  }
  groups.push({ label: section.group, values: [section.id] });
  return groups;
}, []);

export const JS_TARGETING_SNIPPETS = [
  {
    id: 'desktop',
    label: 'Desktop width',
    code: 'return window.innerWidth > 768;',
  },
  {
    id: 'mobile',
    label: 'Mobile width',
    code: 'return window.innerWidth <= 768;',
  },
  {
    id: 'cart',
    label: 'Cart has items',
    code: 'return Boolean(window.Shopify?.cart?.item_count > 0);',
  },
];

function hasUrlOverride(segments = {}) {
  const pattern = segments.url_pattern;
  return Boolean(pattern && pattern !== ' ' && String(pattern).trim() !== '');
}

function hasSessionFloor(segments = {}) {
  const raw = segments.min_sessions;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return false;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0;
}

function hasSafetyActivity(formData = {}) {
  const segments = formData.segments || {};
  return (
    Boolean(formData.guardrail_config?.enabled) ||
    Boolean(segments.exclude_internal_ips) ||
    Boolean(segments.exclude_bots) ||
    (Number(segments.traffic_ramp_percent) || 0) > 0 ||
    String(segments.anti_flicker_mode || 'balanced') === 'strict'
  );
}

function hasOverrideActivity(formData = {}) {
  const segments = formData.segments || {};
  return hasUrlOverride(segments) || hasSessionFloor(segments);
}

function hasCodeActivity(formData = {}) {
  return Boolean(formData.segments?.js_targeting?.enabled);
}

function hasPresetActivity() {
  return false;
}

export function getAdvancedStudioSectionMeta(formData = {}, sectionId) {
  switch (sectionId) {
    case 'safety':
      return {
        configured: hasSafetyActivity(formData),
        state: hasSafetyActivity(formData) ? 'Configured' : 'Defaults',
        detail: hasSafetyActivity(formData)
          ? 'Guardrails or rollout filters active'
          : 'Recommended defaults',
      };
    case 'overrides':
      return {
        configured: hasOverrideActivity(formData),
        state: hasOverrideActivity(formData) ? 'Override' : 'Inherited',
        detail: hasOverrideActivity(formData)
          ? 'URL regex or session floor set'
          : 'Uses page and audience targeting',
      };
    case 'code':
      return {
        configured: hasCodeActivity(formData),
        state: hasCodeActivity(formData) ? 'Active' : 'Off',
        detail: hasCodeActivity(formData) ? 'Custom JS eligibility' : 'No custom code',
      };
    case 'presets':
      return {
        configured: hasPresetActivity(formData),
        state: 'Utility',
        detail: 'Load or save targeting bundles',
      };
    default:
      return { configured: false, state: 'Ready', detail: '' };
  }
}

export function advancedSectionHasActivity(formData = {}) {
  const segments = formData.segments || {};
  return (
    hasSafetyActivity(formData) ||
    hasOverrideActivity(formData) ||
    hasCodeActivity(formData) ||
    (segments.device_rules || []).length > 0 ||
    (segments.audience_rules || []).length > 0
  );
}

export function buildAdvancedSummary(formData = {}) {
  const segments = formData.segments || {};
  const configured = [
    Boolean(formData.guardrail_config?.enabled),
    Boolean(segments.exclude_internal_ips),
    Boolean(segments.exclude_bots),
    (Number(segments.traffic_ramp_percent) || 0) > 0,
    String(segments.anti_flicker_mode || 'balanced') === 'strict',
    hasOverrideActivity(formData),
    Boolean(segments.js_targeting?.enabled),
    (segments.device_rules || []).length > 0,
    (segments.audience_rules || []).length > 0,
  ].filter(Boolean).length;

  if (configured === 0) {
    return 'Defaults';
  }
  return `${configured} control${configured === 1 ? '' : 's'} active`;
}
