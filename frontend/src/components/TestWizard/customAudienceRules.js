import { hasTrafficSourceTargeting, summarizeTrafficSourceRules } from './trafficSourceTargeting';

export const CUSTOM_RULE_OPERATORS = [
  { label: 'equals', value: 'equals' },
  { label: 'contains', value: 'contains' },
  { label: 'regex', value: 'regex' },
  { label: 'in list', value: 'in' },
];

export const CUSTOM_RULE_OPERATOR_HINTS = {
  equals: 'Matches exactly (case-insensitive).',
  contains: 'Visitor value must include this text.',
  regex: 'JavaScript regular expression tested against the visitor value.',
  in: 'Visitor value must match one of the comma-separated items.',
};

export const CUSTOM_RULE_PREVIEW_FIELD_HINTS = {
  current_url: 'Full page URL for this visit, including query parameters.',
  referrer: 'Previous page URL when the visitor arrived.',
  utm_source: 'utm_source query parameter from the landing URL.',
  utm_medium: 'utm_medium query parameter from the landing URL.',
  device: 'RipX device bucket for this visit (desktop or mobile).',
  country: 'ISO 3166-1 alpha-2 country code from the visit.',
  traffic_source: 'RipX traffic source bucket inferred for this visit.',
  operating_system: 'Visitor operating system bucket inferred for this visit.',
};

export const CUSTOM_RULE_FIELDS = [
  {
    value: 'utm_source',
    label: 'UTM source',
    hint: 'utm_source query parameter',
    valueKind: 'text',
    placeholder: 'google',
    operators: ['equals', 'contains', 'regex', 'in'],
  },
  {
    value: 'utm_medium',
    label: 'UTM medium',
    hint: 'utm_medium query parameter',
    valueKind: 'text',
    placeholder: 'email',
    operators: ['equals', 'contains', 'regex', 'in'],
  },
  {
    value: 'current_url',
    label: 'Current URL',
    hint: 'Full page URL for this visit',
    valueKind: 'text',
    placeholder: '/collections/sale',
    operators: ['equals', 'contains', 'regex', 'in'],
  },
  {
    value: 'referrer',
    label: 'Referrer',
    hint: 'Previous page URL',
    valueKind: 'text',
    placeholder: 'google.com',
    operators: ['equals', 'contains', 'regex', 'in'],
  },
  {
    value: 'device',
    label: 'Device',
    hint: 'desktop or mobile',
    valueKind: 'device',
    operators: ['equals', 'in'],
  },
  {
    value: 'country',
    label: 'Country',
    hint: 'ISO 3166-1 alpha-2 code',
    valueKind: 'country',
    placeholder: 'US',
    operators: ['equals', 'in'],
  },
  {
    value: 'traffic_source',
    label: 'Traffic source',
    hint: 'RipX traffic source bucket',
    valueKind: 'traffic_source',
    operators: ['equals', 'in'],
  },
  {
    value: 'operating_system',
    label: 'Operating system',
    hint: 'Visitor OS bucket',
    valueKind: 'operating_system',
    operators: ['equals', 'in'],
  },
];

export const CUSTOM_RULE_DEVICE_OPTIONS = [
  { label: 'Desktop', value: 'desktop' },
  { label: 'Mobile', value: 'mobile' },
];

export const CUSTOM_RULE_TRAFFIC_SOURCE_OPTIONS = [
  { label: 'Direct', value: 'direct' },
  { label: 'Email', value: 'email' },
  { label: 'Referral', value: 'referral' },
  { label: 'Organic social', value: 'organic_social' },
  { label: 'Paid social', value: 'paid_social' },
  { label: 'Organic search', value: 'organic_search' },
  { label: 'Paid search', value: 'paid_search' },
  { label: 'Paid shopping', value: 'paid_shopping' },
  { label: 'SMS', value: 'sms' },
  { label: 'Google', value: 'google' },
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'YouTube', value: 'youtube' },
];

export const CUSTOM_RULE_OS_OPTIONS = [
  { label: 'Windows', value: 'windows' },
  { label: 'macOS', value: 'macos' },
  { label: 'iOS', value: 'ios' },
  { label: 'Android', value: 'android' },
  { label: 'Linux', value: 'linux' },
  { label: 'Other', value: 'other' },
];

export const CUSTOM_RULE_TEMPLATES = [
  {
    id: 'email-us',
    label: 'US email traffic',
    description: 'UTM medium email and country US',
    rules: [
      { field: 'utm_medium', operator: 'equals', value: 'email' },
      { field: 'country', operator: 'equals', value: 'US' },
    ],
  },
  {
    id: 'desktop-organic-search',
    label: 'Desktop organic search',
    description: 'Desktop visitors from organic search',
    rules: [
      { field: 'device', operator: 'equals', value: 'desktop' },
      { field: 'traffic_source', operator: 'equals', value: 'organic_search' },
    ],
  },
  {
    id: 'paid-social-landing',
    label: 'Paid social landing',
    description: 'Paid social traffic bucket',
    rules: [{ field: 'traffic_source', operator: 'equals', value: 'paid_social' }],
  },
  {
    id: 'na-paid-search',
    label: 'North America paid search',
    description: 'US or CA visitors from paid search',
    rules: [
      { field: 'country', operator: 'in', value: ['US', 'CA'] },
      { field: 'traffic_source', operator: 'equals', value: 'paid_search' },
    ],
  },
  {
    id: 'mobile-ios',
    label: 'Mobile iOS',
    description: 'Mobile device and iOS operating system',
    rules: [
      { field: 'device', operator: 'equals', value: 'mobile' },
      { field: 'operating_system', operator: 'equals', value: 'ios' },
    ],
  },
];

export const CUSTOM_RULE_SAMPLE_PROFILES = [
  {
    id: 'paid-search-desktop',
    label: 'Paid search desktop',
    tooltip: 'Google CPC landing on desktop in the United States.',
    context: {
      current_url: 'https://store.example.com/products/widget?utm_source=google&utm_medium=cpc',
      referrer: 'https://www.google.com/',
      utm_source: 'google',
      utm_medium: 'cpc',
      device: 'desktop',
      country: 'US',
      traffic_source: 'paid_search',
      operating_system: 'macos',
    },
  },
  {
    id: 'email-returning',
    label: 'Email campaign',
    tooltip: 'Newsletter email traffic on mobile from the United Kingdom.',
    context: {
      current_url: 'https://store.example.com/collections/sale?utm_medium=email',
      referrer: 'https://mail.example.com/',
      utm_source: 'newsletter',
      utm_medium: 'email',
      device: 'mobile',
      country: 'GB',
      traffic_source: 'email',
      operating_system: 'ios',
    },
  },
  {
    id: 'organic-social',
    label: 'Organic social',
    tooltip: 'Instagram referral on mobile from Canada.',
    context: {
      current_url: 'https://store.example.com/',
      referrer: 'https://www.instagram.com/',
      utm_source: 'instagram',
      utm_medium: 'social',
      device: 'mobile',
      country: 'CA',
      traffic_source: 'organic_social',
      operating_system: 'android',
    },
  },
];

export const DEFAULT_CUSTOM_RULE_PREVIEW_CONTEXT = {
  current_url: 'https://store.example.com/products/widget?utm_source=google&utm_medium=cpc',
  referrer: 'https://www.google.com/',
  utm_source: 'google',
  utm_medium: 'cpc',
  device: 'desktop',
  country: 'US',
  traffic_source: 'paid_search',
  operating_system: 'macos',
};

const FIELD_BY_VALUE = new Map(CUSTOM_RULE_FIELDS.map(field => [field.value, field]));
const OPERATOR_LABELS = new Map(CUSTOM_RULE_OPERATORS.map(op => [op.value, op.label]));

export function getCustomRuleFieldDefinition(field) {
  return FIELD_BY_VALUE.get(String(field || '').toLowerCase()) || CUSTOM_RULE_FIELDS[0];
}

export function getCustomRuleOperatorOptions(field) {
  const definition = getCustomRuleFieldDefinition(field);
  const allowed = new Set(definition.operators || CUSTOM_RULE_OPERATORS.map(op => op.value));
  return CUSTOM_RULE_OPERATORS.filter(op => allowed.has(op.value));
}

export function getCustomRuleOperatorHint(operator) {
  return CUSTOM_RULE_OPERATOR_HINTS[String(operator || 'equals').toLowerCase()] || '';
}

export function getCustomRulePreviewFieldHint(field) {
  return CUSTOM_RULE_PREVIEW_FIELD_HINTS[String(field || '').toLowerCase()] || '';
}

export function createEmptyCustomRule(overrides = {}) {
  return {
    field: 'utm_source',
    operator: 'equals',
    value: '',
    ...overrides,
  };
}

export function createEmptyCustomRuleGroup(match = 'all', overrides = {}) {
  return {
    match: match === 'any' ? 'any' : 'all',
    rules: [createEmptyCustomRule()],
    ...overrides,
  };
}

export function normalizeCustomRuleGroupMatch(match) {
  return String(match || 'all').toLowerCase() === 'any' ? 'any' : 'all';
}

export function normalizeCustomRuleGroups(groups, fallbackRules) {
  const source = groups;
  if (!Array.isArray(source) || source.length === 0) {
    const rules = normalizeCustomRules(fallbackRules);
    return rules.length > 0 ? [{ match: 'all', rules }] : [];
  }

  return source
    .filter(group => group && typeof group === 'object')
    .map(group => {
      const match = normalizeCustomRuleGroupMatch(group.match);
      const rules = normalizeCustomRules(group.rules);
      return rules.length > 0 ? { match, rules } : null;
    })
    .filter(Boolean);
}

export function resolveCustomRuleGroupsFromSegments(segments = {}) {
  if (Array.isArray(segments.custom_rule_groups) && segments.custom_rule_groups.length > 0) {
    return normalizeCustomRuleGroups(segments.custom_rule_groups);
  }
  return normalizeCustomRuleGroups([], segments.custom_rules);
}

export function exportLegacyCustomRules(groups) {
  const normalized = normalizeCustomRuleGroups(groups);
  if (normalized.length === 1 && normalized[0].match === 'all') {
    return normalized[0].rules;
  }
  return [];
}

export function syncSegmentsCustomAudience(segments = {}, groups) {
  const normalizedGroups = normalizeCustomRuleGroups(groups);
  const legacyRules = exportLegacyCustomRules(normalizedGroups);
  const next = { ...segments };

  if (normalizedGroups.length > 0) {
    next.custom_rule_groups = normalizedGroups;
  } else {
    delete next.custom_rule_groups;
  }

  if (legacyRules.length > 0) {
    next.custom_rules = legacyRules;
  } else {
    delete next.custom_rules;
  }

  return next;
}

export function flattenCustomRulesFromGroups(groups) {
  return normalizeCustomRuleGroups(groups).flatMap(group => group.rules);
}

export function countCustomAudienceConditions(groups) {
  return flattenCustomRulesFromGroups(groups).length;
}

export function hasCustomAudienceRules(segments = {}) {
  return resolveCustomRuleGroupsFromSegments(segments).length > 0;
}

export function normalizeCustomRuleValue(operator, value) {
  const op = String(operator || 'equals').toLowerCase();
  if (op === 'in') {
    if (Array.isArray(value)) {
      return value.map(item => String(item || '').trim()).filter(Boolean);
    }
    return String(value || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .join(', ');
  }
  return typeof value === 'string' ? value : String(value ?? '');
}

export function normalizeCustomRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }
  return rules
    .filter(rule => rule && typeof rule === 'object')
    .map(rule => {
      const field = String(rule.field || 'utm_source').toLowerCase();
      const operator = String(rule.operator || 'equals').toLowerCase();
      const definition = getCustomRuleFieldDefinition(field);
      const allowedOperators = new Set(definition.operators || ['equals']);
      const normalizedOperator = allowedOperators.has(operator) ? operator : 'equals';
      const value = normalizeCustomRuleValue(normalizedOperator, rule.value);
      return {
        field,
        operator: normalizedOperator,
        value,
      };
    })
    .filter(rule => {
      if (Array.isArray(rule.value)) {
        return rule.value.length > 0;
      }
      return String(rule.value ?? '').trim() !== '';
    });
}

export function formatCustomRuleValue(rule) {
  if (Array.isArray(rule?.value)) {
    return rule.value.join(', ');
  }
  if (typeof rule?.value === 'string') {
    return rule.value;
  }
  return String(rule?.value ?? '');
}

export function describeCustomRule(rule) {
  const field = getCustomRuleFieldDefinition(rule?.field);
  const operator =
    OPERATOR_LABELS.get(String(rule?.operator || 'equals').toLowerCase()) || 'equals';
  const value = formatCustomRuleValue(rule);
  return `${field.label} ${operator} ${value || '…'}`;
}

export function validateCustomRules(rules, labelPrefix = 'Custom audience rule') {
  if (!Array.isArray(rules) || rules.length === 0) {
    return [];
  }
  const errors = [];
  rules.forEach((rule, index) => {
    const field = getCustomRuleFieldDefinition(rule?.field);
    const operator = String(rule?.operator || 'equals').toLowerCase();
    const value = normalizeCustomRuleValue(operator, rule?.value);
    const label = `${labelPrefix} ${index + 1}`;
    if (Array.isArray(value) ? value.length === 0 : String(value ?? '').trim() === '') {
      errors.push(`${label}: enter a value for ${field.label.toLowerCase()}.`);
      return;
    }
    if (operator === 'regex') {
      try {
        // eslint-disable-next-line no-new
        new RegExp(Array.isArray(value) ? value.join('|') : value);
      } catch {
        errors.push(`${label}: regex pattern is invalid.`);
      }
    }
    if (field.valueKind === 'country' && operator !== 'regex') {
      const values = Array.isArray(value) ? value : [value];
      const invalid = values.filter(code => !/^[A-Za-z]{2}$/.test(String(code).trim()));
      if (invalid.length > 0) {
        errors.push(`${label}: country codes must be two letters (for example US, GB).`);
      }
    }
  });
  return errors;
}

export function validateCustomRuleGroups(groups) {
  const normalized = normalizeCustomRuleGroups(groups);
  if (normalized.length === 0) {
    return [];
  }

  const errors = [];
  normalized.forEach((group, groupIndex) => {
    const groupLabel =
      normalized.length > 1 ? `Custom audience group ${groupIndex + 1}` : 'Custom audience';
    errors.push(...validateCustomRules(group.rules, `${groupLabel} rule`));
    if (group.match === 'any' && group.rules.length < 2) {
      errors.push(`${groupLabel}: add at least two conditions for an OR group.`);
    }
  });
  return errors;
}

function readContextValue(context, field) {
  const key = String(field || '').toLowerCase();
  if (!context || typeof context !== 'object') {
    return '';
  }
  if (context[key] !== undefined && context[key] !== null) {
    return context[key];
  }
  if (key.startsWith('utm_')) {
    return context[key] ?? context.utm?.[key.replace('utm_', '')] ?? '';
  }
  return '';
}

export function matchesCustomRule(rule, context = {}) {
  if (!rule || !rule.field) {
    return true;
  }
  const operator = String(rule.operator || 'equals').toLowerCase();
  const value = rule.value;
  const contextValue = readContextValue(context, rule.field);
  const normalizedContext = String(contextValue || '').toLowerCase();
  const normalizedValue = String(value || '').toLowerCase();

  if (operator === 'equals') {
    return normalizedContext === normalizedValue;
  }
  if (operator === 'contains') {
    return normalizedContext.includes(normalizedValue);
  }
  if (operator === 'regex') {
    try {
      return new RegExp(value).test(String(contextValue || ''));
    } catch {
      return false;
    }
  }
  if (operator === 'in') {
    const values = Array.isArray(value) ? value : [value];
    const valueSet = new Set(values.map(item => String(item).toLowerCase()));
    return valueSet.has(normalizedContext);
  }
  return false;
}

export function matchesCustomRuleGroup(group, context = {}) {
  const normalized = normalizeCustomRuleGroups([group]);
  if (normalized.length === 0) {
    return true;
  }
  const { match, rules } = normalized[0];
  if (rules.length === 0) {
    return true;
  }
  if (match === 'any') {
    return rules.some(rule => matchesCustomRule(rule, context));
  }
  return rules.every(rule => matchesCustomRule(rule, context));
}

export function matchesCustomAudienceRuleGroups(groups, context = {}) {
  const normalized = normalizeCustomRuleGroups(groups);
  if (normalized.length === 0) {
    return true;
  }
  return normalized.every(group => matchesCustomRuleGroup(group, context));
}

export function matchesCustomAudienceRules(rules, context = {}, groups) {
  if (Array.isArray(groups) && groups.length > 0) {
    return matchesCustomAudienceRuleGroups(groups, context);
  }
  const normalized = normalizeCustomRules(rules);
  if (normalized.length === 0) {
    return true;
  }
  return normalized.every(rule => matchesCustomRule(rule, context));
}

export function summarizeCustomRules(rules) {
  const normalized = normalizeCustomRules(rules);
  if (normalized.length === 0) {
    return 'No custom conditions';
  }
  if (normalized.length === 1) {
    return describeCustomRule(normalized[0]);
  }
  return `${normalized.length} AND conditions`;
}

export function summarizeCustomRuleGroups(groups) {
  const normalized = normalizeCustomRuleGroups(groups);
  if (normalized.length === 0) {
    return 'No custom conditions';
  }
  if (normalized.length === 1) {
    const group = normalized[0];
    if (group.match === 'any') {
      if (group.rules.length === 1) {
        return describeCustomRule(group.rules[0]);
      }
      return `${group.rules.length} OR conditions`;
    }
    return summarizeCustomRules(group.rules);
  }

  const parts = normalized.map(group => {
    if (group.match === 'any') {
      if (group.rules.length === 1) {
        return describeCustomRule(group.rules[0]);
      }
      return `${group.rules.length} OR conditions`;
    }
    if (group.rules.length === 1) {
      return describeCustomRule(group.rules[0]);
    }
    return `${group.rules.length} AND conditions`;
  });
  return parts.join(' AND ');
}

const STANDARD_TRAFFIC_SOURCE_LABELS = new Map(
  CUSTOM_RULE_TRAFFIC_SOURCE_OPTIONS.map(option => [option.value, option.label])
);
STANDARD_TRAFFIC_SOURCE_LABELS.set('organic', 'Organic');
STANDARD_TRAFFIC_SOURCE_LABELS.set('paid', 'Paid');
STANDARD_TRAFFIC_SOURCE_LABELS.set('social', 'Social');

const STANDARD_OPERATING_SYSTEM_LABELS = new Map(
  CUSTOM_RULE_OS_OPTIONS.map(option => [option.value, option.label])
);

export function summarizeStandardAudienceSegments(segments = {}, countriesSummary = '') {
  const device = segments.device || 'all';
  const customer = segments.customer || 'all';
  const countries = Array.isArray(segments.countries) ? segments.countries : [];
  const trafficSource = segments.traffic_source || 'all';
  const operatingSystem = segments.operating_system || 'all';
  const parts = [];

  if (device !== 'all') {
    parts.push(device === 'desktop' ? 'Desktop' : 'Mobile');
  }
  if (customer !== 'all') {
    parts.push(customer === 'new' ? 'New' : 'Returning');
  }
  if (countries.length > 0) {
    parts.push(countriesSummary || `${countries.length} countries`);
  }
  if (hasTrafficSourceTargeting(segments)) {
    parts.push(summarizeTrafficSourceRules(segments.traffic_source_rules));
  } else if (trafficSource !== 'all') {
    parts.push(
      STANDARD_TRAFFIC_SOURCE_LABELS.get(String(trafficSource).toLowerCase()) ||
        String(trafficSource).replace(/_/g, ' ')
    );
  }
  if (operatingSystem !== 'all') {
    parts.push(
      STANDARD_OPERATING_SYSTEM_LABELS.get(String(operatingSystem).toLowerCase()) ||
        String(operatingSystem)
    );
  }

  if (parts.length === 0) {
    return 'All visitors';
  }
  return parts.join(' · ');
}

export function summarizeAudienceTargeting(segments = {}, countriesSummary = '') {
  const customGroups = resolveCustomRuleGroupsFromSegments(segments);
  const standardSummary = summarizeStandardAudienceSegments(segments, countriesSummary);
  const customSummary = customGroups.length > 0 ? summarizeCustomRuleGroups(customGroups) : '';

  if (customSummary && standardSummary !== 'All visitors') {
    return `${standardSummary} + ${customSummary}`;
  }
  if (customSummary) {
    return customSummary;
  }
  return standardSummary;
}

export function describeCustomRulesLogic(rules) {
  const normalized = normalizeCustomRules(rules);
  if (normalized.length === 0) {
    return 'No custom audience conditions configured.';
  }
  return normalized.map(rule => describeCustomRule(rule)).join(' AND ');
}

export function describeCustomAudienceGroupsLogic(groups) {
  const normalized = normalizeCustomRuleGroups(groups);
  if (normalized.length === 0) {
    return 'No custom audience conditions configured.';
  }

  return normalized
    .map(group => {
      const join = group.match === 'any' ? ' OR ' : ' AND ';
      const description = group.rules.map(rule => describeCustomRule(rule)).join(join);
      return normalized.length > 1 ? `(${description})` : description;
    })
    .join(' AND ');
}

export function moveCustomRuleAt(rules, index, direction) {
  if (!Array.isArray(rules)) {
    return [];
  }
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= rules.length) {
    return rules;
  }
  const next = [...rules];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function duplicateCustomRuleAt(rules, index) {
  if (!Array.isArray(rules) || !rules[index]) {
    return rules || [];
  }
  const next = [...rules];
  next.splice(index + 1, 0, { ...rules[index] });
  return next;
}

export function getCustomRuleWarnings(rules, segments = {}, groups) {
  const warnings = [];
  const list =
    Array.isArray(groups) && groups.length > 0
      ? flattenCustomRulesFromGroups(groups)
      : Array.isArray(rules)
        ? rules
        : [];
  const fields = list.map(rule => String(rule?.field || '').toLowerCase());
  const signature = rule =>
    `${String(rule?.field || '').toLowerCase()}|${String(rule?.operator || 'equals').toLowerCase()}|${formatCustomRuleValue(rule)}`;

  if (segments.device && segments.device !== 'all' && fields.includes('device')) {
    warnings.push(
      'Standard audience already filters device. A custom device rule may be redundant.'
    );
  }
  if ((segments.countries || []).length > 0 && fields.includes('country')) {
    warnings.push(
      'Standard audience already limits countries. Custom country rules stack on top of that list.'
    );
  }
  if (hasTrafficSourceTargeting(segments) && fields.includes('traffic_source')) {
    warnings.push(
      'Standard audience already filters traffic source. Custom traffic source rules may overlap.'
    );
  }
  if (
    segments.operating_system &&
    segments.operating_system !== 'all' &&
    fields.includes('operating_system')
  ) {
    warnings.push(
      'Standard audience already filters operating system. Custom OS rules may overlap.'
    );
  }

  const seen = new Set();
  list.forEach((rule, index) => {
    const key = signature(rule);
    if (!key || key.endsWith('|')) {
      return;
    }
    if (seen.has(key)) {
      warnings.push(`Condition ${index + 1} duplicates another custom rule.`);
    }
    seen.add(key);
  });

  const normalizedGroups = normalizeCustomRuleGroups(groups);
  normalizedGroups.forEach((group, groupIndex) => {
    if (group.match === 'any' && group.rules.length < 2) {
      warnings.push(
        normalizedGroups.length > 1
          ? `Group ${groupIndex + 1} is set to OR but only has one condition.`
          : 'OR groups need at least two conditions to be meaningful.'
      );
    }
  });

  return Array.from(new Set(warnings));
}

export function evaluateCustomAudienceGroupsDetailed(groups, context = {}) {
  return normalizeCustomRuleGroups(groups).map((group, groupIndex) => ({
    groupIndex,
    match: group.match,
    groupMatches: matchesCustomRuleGroup(group, context),
    rules: evaluateCustomRulesDetailed(group.rules, context),
  }));
}

export function evaluateCustomRuleRow(rule, context = {}) {
  const operator = String(rule?.operator || 'equals').toLowerCase();
  const value = normalizeCustomRuleValue(operator, rule?.value);
  const hasValue = Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '';

  if (!hasValue) {
    return { status: 'incomplete', label: 'Needs value' };
  }

  const validationError = validateCustomRules([rule])[0];
  if (validationError) {
    return { status: 'invalid', label: validationError.replace(/^Custom audience rule 1: /, '') };
  }

  return {
    status: matchesCustomRule({ field: rule.field, operator, value }, context)
      ? 'match'
      : 'no-match',
    label: matchesCustomRule({ field: rule.field, operator, value }, context)
      ? 'Matches sample'
      : 'Fails sample',
  };
}

export function evaluateCustomRulesDetailed(rules, context = {}) {
  return (Array.isArray(rules) ? rules : []).map((rule, index) => ({
    index,
    rule,
    field: getCustomRuleFieldDefinition(rule?.field),
    description: describeCustomRule(rule),
    evaluation: evaluateCustomRuleRow(rule, context),
  }));
}
