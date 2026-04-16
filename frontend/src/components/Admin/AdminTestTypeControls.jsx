import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Modal,
  Select,
  Text,
  TextField,
  Badge,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPut } from '../../services';
import { ROUTES } from '../../constants';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';
import {
  TEST_TYPE_CONTROL_MODE_OPTIONS,
  TEST_TYPE_STORE_OVERRIDE_MODE_OPTIONS,
  TEST_TYPE_DEFINITIONS,
  getDefaultStoreOverrideState,
  getDefaultTestTypeState,
  normalizeTestTypeKey,
} from '../../utils/testTypeControls';

const LEGACY_TEST_TYPE_ENABLED_PREFIX = 'test_type.enabled.';
const LEGACY_TEST_TYPE_MESSAGE_PREFIX = 'test_type.message.';
const TEST_TYPE_RULE_GLOBAL_PREFIX = 'test_type.rule.global.';
const TEST_TYPE_RULE_STORE_PREFIX = 'test_type.rule.store.';

function parseRuleValue(rawValue, fallbackMode) {
  try {
    const parsed = JSON.parse(String(rawValue || ''));
    if (!parsed || typeof parsed !== 'object') {
      return { mode: fallbackMode, message: '' };
    }
    return {
      mode:
        String(parsed.mode || fallbackMode)
          .trim()
          .toLowerCase() || fallbackMode,
      message: String(parsed.message || '').trim(),
    };
  } catch {
    return { mode: fallbackMode, message: '' };
  }
}

function buildGlobalRules(globalKeys = []) {
  const next = getDefaultTestTypeState();
  globalKeys.forEach(item => {
    const key = String(item?.key || '').trim();
    const value = String(item?.valuePreview ?? item?.value ?? '')
      .replace(/…$/, '')
      .trim();
    if (key.startsWith(LEGACY_TEST_TYPE_ENABLED_PREFIX)) {
      const typeKey = normalizeTestTypeKey(key.slice(LEGACY_TEST_TYPE_ENABLED_PREFIX.length));
      if (!next[typeKey]) {
        return;
      }
      const normalized = value.toLowerCase();
      next[typeKey] = {
        ...next[typeKey],
        mode: normalized === 'false' || normalized === '0' ? 'disabled' : next[typeKey].mode,
      };
    } else if (key.startsWith(LEGACY_TEST_TYPE_MESSAGE_PREFIX)) {
      const typeKey = normalizeTestTypeKey(key.slice(LEGACY_TEST_TYPE_MESSAGE_PREFIX.length));
      if (!next[typeKey]) {
        return;
      }
      next[typeKey] = {
        ...next[typeKey],
        message: value,
      };
    } else if (key.startsWith(TEST_TYPE_RULE_GLOBAL_PREFIX)) {
      const typeKey = normalizeTestTypeKey(key.slice(TEST_TYPE_RULE_GLOBAL_PREFIX.length));
      if (!next[typeKey]) {
        return;
      }
      next[typeKey] = parseRuleValue(value, 'enabled');
    }
  });
  return next;
}

function buildStoreRules(storeKeys = [], selectedDomain) {
  const next = getDefaultStoreOverrideState();
  if (!selectedDomain) {
    return next;
  }
  const prefix = `${TEST_TYPE_RULE_STORE_PREFIX}${selectedDomain}.`;
  storeKeys.forEach(item => {
    const key = String(item?.key || '').trim();
    const value = String(item?.valuePreview ?? item?.value ?? '')
      .replace(/…$/, '')
      .trim();
    if (!key.startsWith(prefix)) {
      return;
    }
    const typeKey = normalizeTestTypeKey(key.slice(prefix.length));
    if (!next[typeKey]) {
      return;
    }
    next[typeKey] = parseRuleValue(value, 'inherit');
  });
  return next;
}

function getEffectiveRule(globalRule, storeRule) {
  const mode =
    storeRule?.mode === 'inherit' ? globalRule?.mode || 'enabled' : storeRule?.mode || 'enabled';
  const message =
    mode === 'disabled' ? String(storeRule?.message || globalRule?.message || '').trim() : '';
  return {
    mode,
    message,
    hidden: mode === 'hidden',
    enabled: mode === 'enabled',
  };
}

function getModeBadgeTone(mode) {
  if (mode === 'hidden') {
    return 'critical';
  }
  if (mode === 'disabled') {
    return 'warning';
  }
  return 'success';
}

function buildRuleValue(mode, message) {
  return JSON.stringify({
    mode,
    message: String(message || '').trim(),
  });
}

function matchesSearch(type, searchValue) {
  const query = String(searchValue || '')
    .trim()
    .toLowerCase();
  if (!query) {
    return true;
  }
  return [type.label, type.key, type.description].some(value =>
    String(value || '')
      .toLowerCase()
      .includes(query)
  );
}

function isGlobalRuleChanged(rule) {
  return (
    String(rule?.mode || 'enabled') !== 'enabled' || Boolean(String(rule?.message || '').trim())
  );
}

function isStoreRuleChanged(rule) {
  return (
    String(rule?.mode || 'inherit') !== 'inherit' || Boolean(String(rule?.message || '').trim())
  );
}

function compareStoreTypes(a, b) {
  const aChanged = isStoreRuleChanged(a.storeDraft);
  const bChanged = isStoreRuleChanged(b.storeDraft);
  if (aChanged !== bChanged) {
    return aChanged ? -1 : 1;
  }
  const aSeverity = a.effective.mode === 'hidden' ? 0 : a.effective.mode === 'disabled' ? 1 : 2;
  const bSeverity = b.effective.mode === 'hidden' ? 0 : b.effective.mode === 'disabled' ? 1 : 2;
  if (aSeverity !== bSeverity) {
    return aSeverity - bSeverity;
  }
  return String(a.label || '').localeCompare(String(b.label || ''));
}

function TestTypeRuleEditor({
  label,
  description,
  modeOptions,
  modeValue,
  messageValue,
  saveLabel,
  saveDisabled,
  onModeChange,
  onMessageChange,
  onSave,
  status,
  compact = false,
}) {
  return (
    <Card>
      <BlockStack gap={compact ? '200' : '300'}>
        <InlineStack align="space-between" blockAlign="start" wrap gap="300">
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              {label}
            </Text>
            {!compact ? (
              <Text as="p" tone="subdued">
                {description}
              </Text>
            ) : null}
          </BlockStack>
          {status}
        </InlineStack>
        <InlineStack align="start" gap="300" wrap>
          <div style={{ minWidth: 220, flex: '1 1 220px' }}>
            <Select label="Mode" options={modeOptions} value={modeValue} onChange={onModeChange} />
          </div>
          <div style={{ minWidth: 280, flex: '2 1 320px' }}>
            <TextField
              label="Unavailable message"
              value={messageValue}
              onChange={onMessageChange}
              autoComplete="off"
              placeholder="Optional message shown when disabled"
            />
          </div>
          <div style={{ alignSelf: 'end' }}>
            <Button
              variant="primary"
              size={compact ? 'slim' : 'medium'}
              onClick={onSave}
              disabled={saveDisabled}
            >
              {saveLabel}
            </Button>
          </div>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

export default function AdminTestTypeControls() {
  const queryClient = useQueryClient();
  const [selectedDomain, setSelectedDomain] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [globalDrafts, setGlobalDrafts] = useState({});
  const [storeDrafts, setStoreDrafts] = useState({});
  const [searchValue, setSearchValue] = useState('');
  const [globalModeFilter, setGlobalModeFilter] = useState('all');
  const [storeModeFilter, setStoreModeFilter] = useState('all');
  const [globalBulkMode, setGlobalBulkMode] = useState('disabled');
  const [globalBulkMessage, setGlobalBulkMessage] = useState('');
  const [storeBulkMode, setStoreBulkMode] = useState('inherit');
  const [storeBulkMessage, setStoreBulkMessage] = useState('');
  const [showOnlyChangedGlobal, setShowOnlyChangedGlobal] = useState(false);
  const [showOnlyChangedStore, setShowOnlyChangedStore] = useState(false);
  const [viewMode, setViewMode] = useState('detailed');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const domainsQuery = useQuery({
    queryKey: ['admin', 'domains', 'test-type-controls'],
    queryFn: async () => {
      const res = await apiGet('/admin/domains');
      return res.data?.data ?? res.data;
    },
  });

  const controlsQuery = useQuery({
    queryKey: ['admin', 'test-type-controls', selectedDomain],
    queryFn: async () => {
      const globalPromise = apiGet('/admin/kv', { prefix: 'test_type.' });
      const storePromise = selectedDomain
        ? apiGet('/admin/kv', { prefix: `${TEST_TYPE_RULE_STORE_PREFIX}${selectedDomain}.` })
        : Promise.resolve({ data: { data: { keys: [] } } });
      const [globalRes, storeRes] = await Promise.all([globalPromise, storePromise]);
      return {
        global: globalRes.data?.data ?? globalRes.data,
        store: storeRes.data?.data ?? storeRes.data,
      };
    },
  });

  const domainOptions = useMemo(() => {
    const domains = Array.isArray(domainsQuery.data?.domains) ? domainsQuery.data.domains : [];
    return [
      { label: 'Select a store', value: '' },
      ...domains.map(domain => ({
        label: domain.domain,
        value: domain.domain,
      })),
    ];
  }, [domainsQuery.data]);

  const globalRules = useMemo(() => {
    const keys = Array.isArray(controlsQuery.data?.global?.keys)
      ? controlsQuery.data.global.keys
      : [];
    return buildGlobalRules(keys);
  }, [controlsQuery.data]);

  const storeRules = useMemo(() => {
    const keys = Array.isArray(controlsQuery.data?.store?.keys)
      ? controlsQuery.data.store.keys
      : [];
    return buildStoreRules(keys, selectedDomain);
  }, [controlsQuery.data, selectedDomain]);

  const mutation = useMutation({
    mutationFn: async payload => {
      const updates = Array.isArray(payload?.updates) ? payload.updates : [payload];
      await Promise.all(
        updates.map(update =>
          apiPut(`/admin/kv/${encodeURIComponent(update.key)}`, { value: update.value })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'test-type-controls'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'kv'] });
      setToast({ message: 'Test type controls updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Update failed',
        type: 'error',
      });
    },
  });

  const handleSaveGlobal = typeKey => {
    const draft = globalDrafts[typeKey] || globalRules[typeKey] || { mode: 'enabled', message: '' };
    mutation.mutate({
      key: `${TEST_TYPE_RULE_GLOBAL_PREFIX}${typeKey}`,
      value: buildRuleValue(draft.mode, draft.message),
    });
  };

  const handleSaveStore = typeKey => {
    if (!selectedDomain) {
      return;
    }
    const draft = storeDrafts[typeKey] || storeRules[typeKey] || { mode: 'inherit', message: '' };
    mutation.mutate({
      key: `${TEST_TYPE_RULE_STORE_PREFIX}${selectedDomain}.${typeKey}`,
      value: buildRuleValue(draft.mode, draft.message),
    });
  };

  const typeRows = useMemo(
    () =>
      TEST_TYPE_DEFINITIONS.map(type => {
        const globalDraft = globalDrafts[type.key] ||
          globalRules[type.key] || {
            mode: 'enabled',
            message: '',
          };
        const storeDraft = storeDrafts[type.key] ||
          storeRules[type.key] || {
            mode: 'inherit',
            message: '',
          };
        const effective = getEffectiveRule(globalRules[type.key], storeDraft);
        return {
          ...type,
          globalDraft,
          storeDraft,
          effective,
        };
      }),
    [globalDrafts, globalRules, storeDrafts, storeRules]
  );

  const filteredGlobalTypes = useMemo(
    () =>
      typeRows.filter(type => {
        if (!matchesSearch(type, searchValue)) {
          return false;
        }
        if (showOnlyChangedGlobal && !isGlobalRuleChanged(type.globalDraft)) {
          return false;
        }
        if (globalModeFilter !== 'all' && type.globalDraft.mode !== globalModeFilter) {
          return false;
        }
        return true;
      }),
    [typeRows, searchValue, showOnlyChangedGlobal, globalModeFilter]
  );

  const filteredStoreTypes = useMemo(
    () =>
      [...typeRows]
        .filter(type => {
          if (!matchesSearch(type, searchValue)) {
            return false;
          }
          if (showOnlyChangedStore && !isStoreRuleChanged(type.storeDraft)) {
            return false;
          }
          if (storeModeFilter === 'all') {
            return true;
          }
          if (storeModeFilter === 'inherit') {
            return type.storeDraft.mode === 'inherit';
          }
          if (storeModeFilter === 'effective-hidden') {
            return type.effective.mode === 'hidden';
          }
          if (storeModeFilter === 'effective-disabled') {
            return type.effective.mode === 'disabled';
          }
          if (storeModeFilter === 'effective-enabled') {
            return type.effective.mode === 'enabled';
          }
          return type.storeDraft.mode === storeModeFilter;
        })
        .sort(compareStoreTypes),
    [typeRows, searchValue, showOnlyChangedStore, storeModeFilter]
  );

  const globalSummary = useMemo(() => {
    const counts = { enabled: 0, disabled: 0, hidden: 0 };
    typeRows.forEach(type => {
      counts[type.globalDraft.mode] = (counts[type.globalDraft.mode] || 0) + 1;
    });
    return counts;
  }, [typeRows]);

  const storeSummary = useMemo(() => {
    const counts = { inherit: 0, enabled: 0, disabled: 0, hidden: 0 };
    typeRows.forEach(type => {
      counts[type.storeDraft.mode] = (counts[type.storeDraft.mode] || 0) + 1;
    });
    return counts;
  }, [typeRows]);

  const changedSummary = useMemo(() => {
    let globalChanged = 0;
    let storeChanged = 0;
    typeRows.forEach(type => {
      if (isGlobalRuleChanged(type.globalDraft)) {
        globalChanged += 1;
      }
      if (isStoreRuleChanged(type.storeDraft)) {
        storeChanged += 1;
      }
    });
    return { globalChanged, storeChanged };
  }, [typeRows]);

  const handleApplyBulkGlobal = () => {
    if (filteredGlobalTypes.length === 0) {
      return;
    }
    mutation.mutate({
      updates: filteredGlobalTypes.map(type => ({
        key: `${TEST_TYPE_RULE_GLOBAL_PREFIX}${type.key}`,
        value: buildRuleValue(globalBulkMode, globalBulkMessage),
      })),
    });
    setGlobalDrafts(prev => {
      const next = { ...prev };
      filteredGlobalTypes.forEach(type => {
        next[type.key] = { mode: globalBulkMode, message: globalBulkMessage };
      });
      return next;
    });
  };

  const handleApplyBulkStore = () => {
    if (!selectedDomain || filteredStoreTypes.length === 0) {
      return;
    }
    mutation.mutate({
      updates: filteredStoreTypes.map(type => ({
        key: `${TEST_TYPE_RULE_STORE_PREFIX}${selectedDomain}.${type.key}`,
        value: buildRuleValue(storeBulkMode, storeBulkMessage),
      })),
    });
    setStoreDrafts(prev => {
      const next = { ...prev };
      filteredStoreTypes.forEach(type => {
        next[type.key] = { mode: storeBulkMode, message: storeBulkMessage };
      });
      return next;
    });
  };

  const handleResetShownStoreToInherit = () => {
    if (!selectedDomain || filteredStoreTypes.length === 0) {
      return;
    }
    mutation.mutate({
      updates: filteredStoreTypes.map(type => ({
        key: `${TEST_TYPE_RULE_STORE_PREFIX}${selectedDomain}.${type.key}`,
        value: buildRuleValue('inherit', ''),
      })),
    });
    setStoreDrafts(prev => {
      const next = { ...prev };
      filteredStoreTypes.forEach(type => {
        next[type.key] = { mode: 'inherit', message: '' };
      });
      return next;
    });
  };

  const openResetConfirm = () => {
    if (!selectedDomain || filteredStoreTypes.length === 0) {
      return;
    }
    setResetConfirmOpen(true);
  };

  const applyShortcut = shortcut => {
    if (shortcut === 'global-hidden') {
      setGlobalModeFilter('hidden');
      setShowOnlyChangedGlobal(false);
      return;
    }
    if (shortcut === 'global-disabled') {
      setGlobalModeFilter('disabled');
      setShowOnlyChangedGlobal(false);
      return;
    }
    if (shortcut === 'store-hidden') {
      setStoreModeFilter('effective-hidden');
      setShowOnlyChangedStore(false);
      return;
    }
    if (shortcut === 'store-disabled') {
      setStoreModeFilter('effective-disabled');
      setShowOnlyChangedStore(false);
      return;
    }
    if (shortcut === 'store-changed') {
      setShowOnlyChangedStore(true);
      return;
    }
    if (shortcut === 'global-changed') {
      setShowOnlyChangedGlobal(true);
    }
  };

  const clearFilters = () => {
    setSearchValue('');
    setGlobalModeFilter('all');
    setStoreModeFilter('all');
    setShowOnlyChangedGlobal(false);
    setShowOnlyChangedStore(false);
  };

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => controlsQuery.refetch(),
          loading: controlsQuery.isFetching,
        }}
      >
        <BlockStack gap="400">
          <Banner tone="info">
            Use <strong>Enabled</strong> to allow test creation, <strong>Disabled</strong> to keep
            the type visible but blocked with a message, and <strong>Hidden</strong> to remove it
            from the wizard completely. Store overrides inherit from global until you change them.
          </Banner>

          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Search and filters
              </Text>
              <div className={styles.adminFilters}>
                <div style={{ minWidth: 240, flex: '2 1 280px' }}>
                  <TextField
                    label="Search test types"
                    value={searchValue}
                    onChange={setSearchValue}
                    autoComplete="off"
                    placeholder="Search by name, key, or description"
                  />
                </div>
                <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                  <Select
                    label="Global mode"
                    value={globalModeFilter}
                    onChange={setGlobalModeFilter}
                    options={[
                      { label: 'All global modes', value: 'all' },
                      ...TEST_TYPE_CONTROL_MODE_OPTIONS,
                    ]}
                  />
                </div>
                <div style={{ minWidth: 180, flex: '0 1 180px' }}>
                  <Select
                    label="View mode"
                    value={viewMode}
                    onChange={setViewMode}
                    options={[
                      { label: 'Detailed cards', value: 'detailed' },
                      { label: 'Compact cards', value: 'compact' },
                    ]}
                  />
                </div>
                <div style={{ minWidth: 190, flex: '0 1 190px' }}>
                  <Checkbox
                    label="Show only changed global"
                    checked={showOnlyChangedGlobal}
                    onChange={setShowOnlyChangedGlobal}
                  />
                </div>
                <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                  <Select
                    label="Store view"
                    value={storeModeFilter}
                    onChange={setStoreModeFilter}
                    options={[
                      { label: 'All store rules', value: 'all' },
                      ...TEST_TYPE_STORE_OVERRIDE_MODE_OPTIONS,
                      { label: 'Effective enabled', value: 'effective-enabled' },
                      { label: 'Effective disabled', value: 'effective-disabled' },
                      { label: 'Effective hidden', value: 'effective-hidden' },
                    ]}
                  />
                </div>
                <div style={{ minWidth: 190, flex: '0 1 190px' }}>
                  <Checkbox
                    label="Show only changed store"
                    checked={showOnlyChangedStore}
                    onChange={setShowOnlyChangedStore}
                  />
                </div>
                <div style={{ alignSelf: 'end' }}>
                  <Button onClick={clearFilters}>Clear filters</Button>
                </div>
              </div>
              <InlineStack gap="200" wrap>
                <Button size="slim" onClick={() => applyShortcut('global-disabled')}>
                  Global disabled
                </Button>
                <Button size="slim" onClick={() => applyShortcut('global-hidden')}>
                  Global hidden
                </Button>
                <Button size="slim" onClick={() => applyShortcut('global-changed')}>
                  Global changed
                </Button>
                <Button size="slim" onClick={() => applyShortcut('store-disabled')}>
                  Store disabled
                </Button>
                <Button size="slim" onClick={() => applyShortcut('store-hidden')}>
                  Store hidden
                </Button>
                <Button size="slim" onClick={() => applyShortcut('store-changed')}>
                  Store changed
                </Button>
              </InlineStack>
              <InlineStack gap="200" wrap>
                <Badge tone="success">{`${globalSummary.enabled} global enabled`}</Badge>
                <Badge tone="warning">{`${globalSummary.disabled} global disabled`}</Badge>
                <Badge tone="critical">{`${globalSummary.hidden} global hidden`}</Badge>
                <Badge>{`${changedSummary.globalChanged} global changed`}</Badge>
                <Badge>{`${filteredGlobalTypes.length} shown`}</Badge>
                {selectedDomain ? (
                  <>
                    <Badge>{`${storeSummary.inherit} inherit`}</Badge>
                    <Badge tone="success">{`${storeSummary.enabled} store enabled`}</Badge>
                    <Badge tone="warning">{`${storeSummary.disabled} store disabled`}</Badge>
                    <Badge tone="critical">{`${storeSummary.hidden} store hidden`}</Badge>
                    <Badge>{`${changedSummary.storeChanged} store changed`}</Badge>
                  </>
                ) : null}
              </InlineStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Global test type policy
                  </Text>
                  <Text as="p" tone="subdued" className={styles.adminPageDescription}>
                    These rules apply everywhere unless a specific store overrides them.
                  </Text>
                </BlockStack>
                <InlineStack gap="200" wrap>
                  <div style={{ minWidth: 180 }}>
                    <Select
                      label="Bulk mode"
                      options={TEST_TYPE_CONTROL_MODE_OPTIONS}
                      value={globalBulkMode}
                      onChange={setGlobalBulkMode}
                    />
                  </div>
                  <div style={{ minWidth: 240 }}>
                    <TextField
                      label="Bulk unavailable message"
                      value={globalBulkMessage}
                      onChange={setGlobalBulkMessage}
                      autoComplete="off"
                      placeholder="Optional bulk message"
                    />
                  </div>
                  <div style={{ alignSelf: 'end' }}>
                    <Button
                      onClick={handleApplyBulkGlobal}
                      disabled={mutation.isPending || filteredGlobalTypes.length === 0}
                    >
                      {`Apply to ${filteredGlobalTypes.length} shown`}
                    </Button>
                  </div>
                </InlineStack>
              </InlineStack>
              <BlockStack gap="300">
                {filteredGlobalTypes.map(type => {
                  const draft = type.globalDraft;
                  return (
                    <TestTypeRuleEditor
                      key={`global-${type.key}`}
                      label={type.label}
                      description={type.description}
                      modeOptions={TEST_TYPE_CONTROL_MODE_OPTIONS}
                      modeValue={draft.mode}
                      messageValue={draft.message}
                      saveLabel="Save global"
                      saveDisabled={mutation.isPending}
                      onModeChange={value =>
                        setGlobalDrafts(prev => ({
                          ...prev,
                          [type.key]: { ...draft, mode: value },
                        }))
                      }
                      onMessageChange={value =>
                        setGlobalDrafts(prev => ({
                          ...prev,
                          [type.key]: { ...draft, message: value },
                        }))
                      }
                      onSave={() => handleSaveGlobal(type.key)}
                      compact={viewMode === 'compact'}
                      status={
                        <Badge tone={getModeBadgeTone(draft.mode)}>
                          {draft.mode === 'hidden' ? 'Hidden everywhere' : draft.mode}
                        </Badge>
                      }
                    />
                  );
                })}
                {filteredGlobalTypes.length === 0 ? (
                  <Banner tone="info">No test types match the current search and filters.</Banner>
                ) : null}
              </BlockStack>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Store-specific overrides
                  </Text>
                  <Text as="p" tone="subdued" className={styles.adminPageDescription}>
                    Override the global policy for one store without changing the others.
                  </Text>
                </BlockStack>
                <div style={{ minWidth: 280, flex: '0 1 320px' }}>
                  <Select
                    label="Store"
                    options={domainOptions}
                    value={selectedDomain}
                    onChange={value => {
                      setSelectedDomain(value);
                      setStoreDrafts({});
                    }}
                  />
                </div>
              </InlineStack>

              {!selectedDomain ? (
                <Banner tone="info">
                  Pick a store to manage its overrides. If left on <strong>Inherit global</strong>,
                  the store will keep using the global test type policy.
                </Banner>
              ) : (
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                    <BlockStack gap="100">
                      <Text as="p" tone="subdued" className={styles.adminPageDescription}>
                        Bulk actions apply to the test types currently shown for{' '}
                        <strong>{selectedDomain}</strong>.
                      </Text>
                      <Text as="p" tone="subdued" className={styles.adminPageDescription}>
                        Changed overrides are listed first so active store-level customizations stay
                        visible.
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200" wrap>
                      <div style={{ minWidth: 180 }}>
                        <Select
                          label="Bulk override"
                          options={TEST_TYPE_STORE_OVERRIDE_MODE_OPTIONS}
                          value={storeBulkMode}
                          onChange={setStoreBulkMode}
                        />
                      </div>
                      <div style={{ minWidth: 240 }}>
                        <TextField
                          label="Bulk override message"
                          value={storeBulkMessage}
                          onChange={setStoreBulkMessage}
                          autoComplete="off"
                          placeholder="Optional bulk message"
                        />
                      </div>
                      <div style={{ alignSelf: 'end' }}>
                        <Button
                          onClick={handleApplyBulkStore}
                          disabled={mutation.isPending || filteredStoreTypes.length === 0}
                        >
                          {`Apply to ${filteredStoreTypes.length} shown`}
                        </Button>
                      </div>
                      <div style={{ alignSelf: 'end' }}>
                        <Button
                          tone="critical"
                          onClick={openResetConfirm}
                          disabled={mutation.isPending || filteredStoreTypes.length === 0}
                        >
                          {`Reset ${filteredStoreTypes.length} shown to inherit`}
                        </Button>
                      </div>
                    </InlineStack>
                  </InlineStack>
                  {filteredStoreTypes.map(type => {
                    const storeDraft = type.storeDraft;
                    const effective = type.effective;
                    const statusLabel =
                      storeDraft.mode === 'inherit'
                        ? `Inheriting ${effective.mode}`
                        : `Override: ${storeDraft.mode}`;
                    return (
                      <TestTypeRuleEditor
                        key={`store-${type.key}`}
                        label={type.label}
                        description={type.description}
                        modeOptions={TEST_TYPE_STORE_OVERRIDE_MODE_OPTIONS}
                        modeValue={storeDraft.mode}
                        messageValue={storeDraft.message}
                        saveLabel="Save override"
                        saveDisabled={mutation.isPending}
                        onModeChange={value =>
                          setStoreDrafts(prev => ({
                            ...prev,
                            [type.key]: { ...storeDraft, mode: value },
                          }))
                        }
                        onMessageChange={value =>
                          setStoreDrafts(prev => ({
                            ...prev,
                            [type.key]: { ...storeDraft, message: value },
                          }))
                        }
                        onSave={() => handleSaveStore(type.key)}
                        compact={viewMode === 'compact'}
                        status={
                          <InlineStack gap="200" wrap>
                            <Badge tone={getModeBadgeTone(effective.mode)}>{statusLabel}</Badge>
                            <Badge
                              tone={
                                effective.hidden
                                  ? 'critical'
                                  : effective.enabled
                                    ? 'success'
                                    : 'warning'
                              }
                            >
                              Effective: {effective.mode}
                            </Badge>
                          </InlineStack>
                        }
                      />
                    );
                  })}
                  {filteredStoreTypes.length === 0 ? (
                    <Banner tone="info">
                      No store overrides match the current search and filters.
                    </Banner>
                  ) : null}
                </BlockStack>
              )}
            </BlockStack>
          </Card>

          <Banner>
            The old test-type toggles under{' '}
            <Button url={ROUTES.ADMIN_FEATURE_FLAGS} variant="plain">
              Feature flags
            </Button>{' '}
            are now superseded by this screen. Global disable rules are still read automatically so
            existing configuration keeps working.
          </Banner>
        </BlockStack>
      </AdminPageLayout>
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: null, type: 'success' })}
          duration={toast.type === 'error' ? 5000 : 3000}
        />
      )}
      <Modal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset shown overrides to inherit?"
        primaryAction={{
          content: `Reset ${filteredStoreTypes.length} shown`,
          destructive: true,
          onAction: () => {
            setResetConfirmOpen(false);
            handleResetShownStoreToInherit();
          },
          disabled: mutation.isPending || filteredStoreTypes.length === 0,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setResetConfirmOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            This will reset the currently shown overrides for{' '}
            <strong>{selectedDomain || 'the selected store'}</strong> back to{' '}
            <strong>inherit global</strong>.
          </Text>
        </Modal.Section>
      </Modal>
    </PageShell>
  );
}
