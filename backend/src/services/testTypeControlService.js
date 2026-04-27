const { query } = require('../utils/database');
const { normalizeDomain } = require('../models/tenant');

const TEST_TYPE_RULE_GLOBAL_PREFIX = 'test_type.rule.global.';
const TEST_TYPE_RULE_STORE_PREFIX = 'test_type.rule.store.';
const LEGACY_TEST_TYPE_ENABLED_PREFIX = 'test_type.enabled.';
const LEGACY_TEST_TYPE_MESSAGE_PREFIX = 'test_type.message.';

const GLOBAL_MODES = new Set(['enabled', 'disabled', 'hidden']);
const STORE_MODES = new Set(['inherit', 'enabled', 'disabled', 'hidden']);

const TEST_TYPE_DEFINITIONS = Object.freeze([
  {
    key: 'onsite-edit',
    label: 'Onsite Edit',
    description: 'Edit or hide storefront content without theme changes.',
  },
  {
    key: 'split-url',
    label: 'Split URL',
    description: 'Send traffic to alternate URLs for landing-page experiments.',
  },
  {
    key: 'template',
    label: 'Template',
    description: 'Compare different templates or layouts for the same page.',
  },
  {
    key: 'theme',
    label: 'Theme',
    description: 'Run broader visual theme or section-level design experiments.',
  },
  {
    key: 'pricing',
    label: 'Pricing',
    description: 'Test price changes and direct price override experiences.',
  },
  {
    key: 'shipping',
    label: 'Shipping',
    description: 'Test shipping rates, thresholds, and delivery execution paths.',
  },
  {
    key: 'offer',
    label: 'Offer',
    description: 'Test promotional offers and checkout discount experiences.',
  },
  {
    key: 'checkout',
    label: 'Checkout',
    description: 'Run checkout-specific experiences and customizations.',
  },
  {
    key: 'combination',
    label: 'Combination',
    description: 'Combine multiple test dimensions in one experiment.',
  },
]);

const KNOWN_TEST_TYPE_KEYS = new Set(TEST_TYPE_DEFINITIONS.map(def => def.key));

function normalizeTestTypeKey(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  if (!key) {
    return '';
  }
  if (key === 'price') {
    return 'pricing';
  }
  if (key === 'content') {
    return 'onsite-edit';
  }
  return key;
}

function resolveTemplateKeyFromPayload(payload = {}) {
  const goalTemplateKey =
    payload?.goal && typeof payload.goal === 'object' ? payload.goal.template_key : null;
  const raw =
    payload?.template_key ??
    payload?.templateKey ??
    payload?.test_type_id ??
    payload?.testTypeId ??
    goalTemplateKey ??
    payload?.type;
  return normalizeTestTypeKey(raw);
}

function sanitizeMessage(value) {
  return String(value || '').trim();
}

function defaultGlobalRule() {
  return { mode: 'enabled', message: '' };
}

function defaultStoreRule() {
  return { mode: 'inherit', message: '' };
}

function buildGlobalRuleMap() {
  return Object.fromEntries(TEST_TYPE_DEFINITIONS.map(def => [def.key, defaultGlobalRule()]));
}

function buildStoreRuleMap() {
  return Object.fromEntries(TEST_TYPE_DEFINITIONS.map(def => [def.key, defaultStoreRule()]));
}

function coerceMode(value, allowedModes, fallbackMode) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return allowedModes.has(normalized) ? normalized : fallbackMode;
}

function parseRuleValue(rawValue, { allowInherit }) {
  const fallback = allowInherit ? defaultStoreRule() : defaultGlobalRule();
  if (rawValue === undefined || rawValue === null) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(String(rawValue));
    if (!parsed || typeof parsed !== 'object') {
      return fallback;
    }
    return {
      mode: coerceMode(parsed.mode, allowInherit ? STORE_MODES : GLOBAL_MODES, fallback.mode),
      message: sanitizeMessage(parsed.message),
    };
  } catch {
    return fallback;
  }
}

function serializeRuleValue(rule, { allowInherit }) {
  const fallback = allowInherit ? defaultStoreRule() : defaultGlobalRule();
  const normalizedRule = {
    mode: coerceMode(rule?.mode, allowInherit ? STORE_MODES : GLOBAL_MODES, fallback.mode),
    message: sanitizeMessage(rule?.message),
  };
  return JSON.stringify(normalizedRule);
}

function buildGlobalRuleKey(typeKey) {
  return `${TEST_TYPE_RULE_GLOBAL_PREFIX}${typeKey}`;
}

function buildStoreRuleKey(domain, typeKey) {
  return `${TEST_TYPE_RULE_STORE_PREFIX}${domain}.${typeKey}`;
}

function extractTrailingTypeKey(fullKey, prefix) {
  return normalizeTestTypeKey(String(fullKey || '').slice(prefix.length));
}

function applyLegacyRows(globalRules, rows = []) {
  for (const row of rows) {
    const key = String(row?.key || '');
    if (key.startsWith(LEGACY_TEST_TYPE_ENABLED_PREFIX)) {
      const typeKey = extractTrailingTypeKey(key, LEGACY_TEST_TYPE_ENABLED_PREFIX);
      if (!KNOWN_TEST_TYPE_KEYS.has(typeKey)) {
        continue;
      }
      const normalizedValue = String(row?.value || '')
        .trim()
        .toLowerCase();
      globalRules[typeKey] = {
        ...globalRules[typeKey],
        mode:
          normalizedValue === 'false' || normalizedValue === '0'
            ? 'disabled'
            : globalRules[typeKey].mode,
      };
    } else if (key.startsWith(LEGACY_TEST_TYPE_MESSAGE_PREFIX)) {
      const typeKey = extractTrailingTypeKey(key, LEGACY_TEST_TYPE_MESSAGE_PREFIX);
      if (!KNOWN_TEST_TYPE_KEYS.has(typeKey)) {
        continue;
      }
      globalRules[typeKey] = {
        ...globalRules[typeKey],
        message: sanitizeMessage(row?.value),
      };
    }
  }
}

function applyRuleRows(ruleMap, rows = [], { prefix, allowInherit }) {
  for (const row of rows) {
    const key = String(row?.key || '');
    if (!key.startsWith(prefix)) {
      continue;
    }
    const typeKey = extractTrailingTypeKey(key, prefix);
    if (!KNOWN_TEST_TYPE_KEYS.has(typeKey)) {
      continue;
    }
    ruleMap[typeKey] = parseRuleValue(row?.value, { allowInherit });
  }
}

function buildEffectiveRule(globalRule, storeRule) {
  const effectiveMode = storeRule.mode === 'inherit' ? globalRule.mode : storeRule.mode;
  const effectiveMessage =
    effectiveMode === 'disabled' ? sanitizeMessage(storeRule.message || globalRule.message) : '';
  return {
    mode: effectiveMode,
    message: effectiveMessage,
    enabled: effectiveMode === 'enabled',
    hidden: effectiveMode === 'hidden',
    visible: effectiveMode !== 'hidden',
  };
}

async function getTestTypeControlSnapshot({ domain } = {}) {
  const normalizedDomain = normalizeDomain(domain) || '';
  const params = [
    `${TEST_TYPE_RULE_GLOBAL_PREFIX}%`,
    `${LEGACY_TEST_TYPE_ENABLED_PREFIX}%`,
    `${LEGACY_TEST_TYPE_MESSAGE_PREFIX}%`,
  ];
  let sql = `
    SELECT key, value
    FROM key_value_store
    WHERE key LIKE $1 OR key LIKE $2 OR key LIKE $3
  `;
  if (normalizedDomain) {
    params.push(`${TEST_TYPE_RULE_STORE_PREFIX}${normalizedDomain}.%`);
    sql += ' OR key LIKE $4';
  }

  const globalRules = buildGlobalRuleMap();
  const storeRules = buildStoreRuleMap();

  try {
    const result = await query(sql, params);
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    applyLegacyRows(globalRules, rows);
    applyRuleRows(globalRules, rows, {
      prefix: TEST_TYPE_RULE_GLOBAL_PREFIX,
      allowInherit: false,
    });
    if (normalizedDomain) {
      applyRuleRows(storeRules, rows, {
        prefix: `${TEST_TYPE_RULE_STORE_PREFIX}${normalizedDomain}.`,
        allowInherit: true,
      });
    }
  } catch (error) {
    if (!String(error?.message || '').includes('does not exist')) {
      throw error;
    }
  }

  const types = TEST_TYPE_DEFINITIONS.map(def => {
    const global = globalRules[def.key] || defaultGlobalRule();
    const store = storeRules[def.key] || defaultStoreRule();
    return {
      ...def,
      global,
      store,
      effective: buildEffectiveRule(global, store),
    };
  });

  return {
    domain: normalizedDomain || null,
    types,
    globalRules,
    storeRules,
  };
}

async function getResolvedTestTypeRule(typeKey, { domain } = {}) {
  const normalizedTypeKey = normalizeTestTypeKey(typeKey);
  if (!KNOWN_TEST_TYPE_KEYS.has(normalizedTypeKey)) {
    return null;
  }
  const snapshot = await getTestTypeControlSnapshot({ domain });
  return snapshot.types.find(type => type.key === normalizedTypeKey) || null;
}

module.exports = {
  TEST_TYPE_DEFINITIONS,
  KNOWN_TEST_TYPE_KEYS,
  TEST_TYPE_RULE_GLOBAL_PREFIX,
  TEST_TYPE_RULE_STORE_PREFIX,
  normalizeTestTypeKey,
  resolveTemplateKeyFromPayload,
  serializeRuleValue,
  buildGlobalRuleKey,
  buildStoreRuleKey,
  getTestTypeControlSnapshot,
  getResolvedTestTypeRule,
};
