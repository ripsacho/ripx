export const TEST_TYPE_CONTROL_MODE_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'hidden', label: 'Hidden' },
];

export const TEST_TYPE_STORE_OVERRIDE_MODE_OPTIONS = [
  { value: 'inherit', label: 'Inherit global' },
  ...TEST_TYPE_CONTROL_MODE_OPTIONS,
];

export const TEST_TYPE_DEFINITIONS = [
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
];

export const TEST_TYPE_DEFINITIONS_MAP = Object.fromEntries(
  TEST_TYPE_DEFINITIONS.map(def => [def.key, def])
);

export function normalizeTestTypeKey(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  if (!key) {
    return '';
  }
  if (key === 'price') {
    return 'pricing';
  }
  return key;
}

export function getDefaultTestTypeState() {
  return Object.fromEntries(
    TEST_TYPE_DEFINITIONS.map(def => [def.key, { mode: 'enabled', message: '' }])
  );
}

export function getDefaultStoreOverrideState() {
  return Object.fromEntries(
    TEST_TYPE_DEFINITIONS.map(def => [def.key, { mode: 'inherit', message: '' }])
  );
}
