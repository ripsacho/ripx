export const AUDIENCE_SOURCE_OPTIONS = [
  { label: 'All Sources', value: 'all' },
  { label: 'Direct', value: 'direct' },
  { label: 'Email', value: 'email' },
  { label: 'Referral', value: 'referral' },
  { label: 'Organic Social', value: 'organic_social' },
  { label: 'Paid Social', value: 'paid_social' },
  { label: 'Organic Search', value: 'organic_search' },
  { label: 'Paid Search', value: 'paid_search' },
  { label: 'Paid Shopping', value: 'paid_shopping' },
  { label: 'SMS', value: 'sms' },
  { label: 'Google', value: 'google' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'Organic (group)', value: 'organic' },
  { label: 'Paid (group)', value: 'paid' },
  { label: 'Social (group)', value: 'social' },
];

export const TRAFFIC_SOURCE_RULE_OPTIONS = AUDIENCE_SOURCE_OPTIONS.filter(
  option => option.value !== 'all'
);

const TRAFFIC_SOURCE_LABELS = new Map(
  AUDIENCE_SOURCE_OPTIONS.map(option => [option.value, option.label])
);

export function createEmptyTrafficSourceRule(type = 'include', value = 'direct') {
  return {
    type: type === 'exclude' ? 'exclude' : 'include',
    value: String(value || 'direct')
      .trim()
      .toLowerCase(),
  };
}

export function normalizeTrafficSourceRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }
  const allowed = new Set(TRAFFIC_SOURCE_RULE_OPTIONS.map(option => option.value));
  return rules
    .filter(rule => rule && typeof rule === 'object')
    .map(rule => ({
      type: String(rule.type || 'include').toLowerCase() === 'exclude' ? 'exclude' : 'include',
      value: String(rule.value || '')
        .trim()
        .toLowerCase(),
    }))
    .filter(rule => allowed.has(rule.value));
}

export function hydrateTrafficSourceSegments(segments = {}) {
  const next = { ...segments };
  const normalizedRules = normalizeTrafficSourceRules(next.traffic_source_rules);
  if (normalizedRules.length > 0) {
    next.traffic_source_rules = normalizedRules;
    next.traffic_source = 'all';
    return next;
  }

  const legacy = String(next.traffic_source || 'all')
    .trim()
    .toLowerCase();
  if (legacy && legacy !== 'all') {
    next.traffic_source = 'all';
    next.traffic_source_rules = [{ type: 'include', value: legacy }];
  } else {
    next.traffic_source = 'all';
    delete next.traffic_source_rules;
  }
  return next;
}

export function syncTrafficSourceSegments(segments = {}, rules = []) {
  const normalizedRules = normalizeTrafficSourceRules(rules);
  const next = { ...segments, traffic_source: 'all' };
  if (normalizedRules.length > 0) {
    next.traffic_source_rules = normalizedRules;
  } else {
    delete next.traffic_source_rules;
  }
  return next;
}

export function hasTrafficSourceTargeting(segments = {}) {
  return normalizeTrafficSourceRules(segments.traffic_source_rules).length > 0;
}

export function summarizeTrafficSourceRules(rules = []) {
  const normalized = normalizeTrafficSourceRules(rules);
  if (normalized.length === 0) {
    return '';
  }
  const includes = normalized.filter(rule => rule.type === 'include');
  const excludes = normalized.filter(rule => rule.type === 'exclude');
  const formatRule = rule => TRAFFIC_SOURCE_LABELS.get(rule.value) || rule.value.replace(/_/g, ' ');
  const parts = [];
  if (includes.length > 0) {
    parts.push(`Include ${includes.map(formatRule).join(', ')}`);
  }
  if (excludes.length > 0) {
    parts.push(`Exclude ${excludes.map(formatRule).join(', ')}`);
  }
  return parts.join(' · ');
}

export function validateTrafficSourceRules(rules = []) {
  const normalized = normalizeTrafficSourceRules(rules);
  const errors = [];
  const seen = new Set();
  normalized.forEach((rule, index) => {
    const key = `${rule.type}:${rule.value}`;
    if (seen.has(key)) {
      errors.push(`Source site rule ${index + 1} duplicates another rule.`);
    }
    seen.add(key);
  });
  return errors;
}
