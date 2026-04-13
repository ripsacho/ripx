/**
 * AdminFeatureFlags
 *
 * Toggle feature flags stored as flag.* in key_value_store. Phase 2.
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  BlockStack,
  Text,
  Checkbox,
  Banner,
  TextField,
  Button,
  InlineStack,
} from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const KNOWN_FLAGS = [
  { key: 'flag.heatmaps', label: 'Heatmaps', description: 'Enable heatmap events and HeatmapView' },
  { key: 'flag.export', label: 'Export', description: 'Enable CSV/JSON/BigQuery export' },
  { key: 'flag.ga4', label: 'GA4', description: 'Enable GA4 forwarding' },
  { key: 'flag.bigquery', label: 'BigQuery', description: 'Enable BigQuery export job' },
  { key: 'flag.webhooks', label: 'Webhooks', description: 'Enable outbound webhooks' },
  {
    key: 'flag.personalization',
    label: 'Personalization',
    description: 'Enable personalization/rollout tests',
  },
  {
    key: 'flag.significance_alerts',
    label: 'Significance alerts',
    description: 'Enable significance notifications',
  },
  { key: 'flag.guardrails', label: 'Guardrails', description: 'Enable guardrail auto-stop' },
  {
    key: 'flag.scheduled_tests',
    label: 'Scheduled tests',
    description: 'Enable scheduled start/stop',
  },
];
const TEST_TYPE_TOGGLE_PREFIX = 'test_type.enabled.';
const TEST_TYPE_MESSAGE_PREFIX = 'test_type.message.';
const KNOWN_TEST_TYPES = [
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}onsite-edit`,
    label: 'Onsite Edit',
    description: 'Enable or disable Onsite Edit test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}split-url`,
    label: 'Split URL',
    description: 'Enable or disable Split URL test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}template`,
    label: 'Template',
    description: 'Enable or disable Template test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}theme`,
    label: 'Theme',
    description: 'Enable or disable Theme test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}pricing`,
    label: 'Pricing',
    description: 'Enable or disable Pricing test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}shipping`,
    label: 'Shipping',
    description: 'Enable or disable Shipping test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}offer`,
    label: 'Offer',
    description: 'Enable or disable Offer test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}checkout`,
    label: 'Checkout',
    description: 'Enable or disable Checkout test creation',
  },
  {
    key: `${TEST_TYPE_TOGGLE_PREFIX}combination`,
    label: 'Combination',
    description: 'Enable or disable Combination test creation',
  },
];

export default function AdminFeatureFlags() {
  const queryClient = useQueryClient();
  const [toast, setToast] = React.useState({ message: null, type: 'success' });
  const [testTypeMessageDrafts, setTestTypeMessageDrafts] = React.useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'kv', 'flag.'],
    queryFn: async () => {
      const res = await apiGet('/admin/kv', { prefix: 'flag.' });
      return res.data?.data ?? res.data;
    },
  });
  const { data: testTypeData, isLoading: isLoadingTestTypes } = useQuery({
    queryKey: ['admin', 'kv', 'test_type.'],
    queryFn: async () => {
      const res = await apiGet('/admin/kv', { prefix: 'test_type.' });
      return res.data?.data ?? res.data;
    },
  });

  const putMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      await apiPut(`/admin/kv/${encodeURIComponent(key)}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kv'] });
      setToast({ message: 'Flag updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Update failed',
        type: 'error',
      });
    },
  });

  const parseBoolean = value => {
    const normalized = String(value ?? '')
      .replace(/…$/, '')
      .trim()
      .toLowerCase();
    if (!normalized) return null;
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return null;
  };

  const keysMap = React.useMemo(() => {
    const list = data?.keys ?? [];
    const map = {};
    list.forEach(k => {
      map[k.key] = parseBoolean(k.valuePreview) === true;
    });
    return map;
  }, [data]);
  const { testTypeMap, testTypeMessages } = React.useMemo(() => {
    const list = testTypeData?.keys ?? [];
    const map = {};
    const messages = {};
    list.forEach(k => {
      const key = String(k.key || '');
      if (key.startsWith(TEST_TYPE_TOGGLE_PREFIX)) {
        map[key] = parseBoolean(k.valuePreview);
      } else if (key.startsWith(TEST_TYPE_MESSAGE_PREFIX)) {
        messages[key] = String(k.valuePreview ?? '')
          .replace(/…$/, '')
          .trim();
      }
    });
    return { testTypeMap: map, testTypeMessages: messages };
  }, [testTypeData]);
  const getMessageDraft = React.useCallback(
    key => {
      if (Object.prototype.hasOwnProperty.call(testTypeMessageDrafts, key)) {
        return testTypeMessageDrafts[key];
      }
      return testTypeMessages[key] || '';
    },
    [testTypeMessageDrafts, testTypeMessages]
  );

  const handleToggle = (key, checked) => {
    putMutation.mutate({ key, value: checked ? 'true' : 'false' });
  };
  const handleMessageSave = (key, rawValue) => {
    putMutation.mutate(
      { key, value: String(rawValue || '').trim() },
      {
        onSuccess: () => {
          setToast({ message: 'Test type message updated', type: 'success' });
          queryClient.invalidateQueries({ queryKey: ['admin', 'kv'] });
        },
      }
    );
  };

  const rows = KNOWN_FLAGS.map(f => [
    f.key,
    f.label,
    f.description,
    <Checkbox
      key={f.key}
      label=""
      labelHidden
      checked={keysMap[f.key] === true}
      onChange={checked => handleToggle(f.key, checked)}
      disabled={putMutation.isPending}
    />,
  ]);
  const testTypeRows = KNOWN_TEST_TYPES.map(t => {
    const explicitValue = testTypeMap[t.key];
    const isEnabled = explicitValue !== false;
    const testTypeKey = String(t.key).replace(TEST_TYPE_TOGGLE_PREFIX, '');
    const messageKey = `${TEST_TYPE_MESSAGE_PREFIX}${testTypeKey}`;
    const messageValue = getMessageDraft(messageKey);
    return [
      t.key,
      t.label,
      t.description,
      <Checkbox
        key={t.key}
        label=""
        labelHidden
        checked={isEnabled}
        onChange={checked => handleToggle(t.key, checked)}
        disabled={putMutation.isPending}
      />,
      <InlineStack key={`${t.key}-msg`} gap="200" wrap={false} blockAlign="center">
        <div style={{ minWidth: 240 }}>
          <TextField
            label=""
            labelHidden
            value={messageValue}
            onChange={value =>
              setTestTypeMessageDrafts(prev => ({
                ...prev,
                [messageKey]: value,
              }))
            }
            placeholder="Optional unavailable reason"
            autoComplete="off"
            disabled={putMutation.isPending}
          />
        </div>
        <Button
          size="slim"
          onClick={() => handleMessageSave(messageKey, messageValue)}
          disabled={putMutation.isPending}
        >
          Save
        </Button>
      </InlineStack>,
    ];
  });

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout>
        <BlockStack gap="400">
          <Banner tone="info">
            These flags are stored as key_value_store keys. The app and backend read them to enable
            or disable features. You can also edit raw keys under Key-value store.
          </Banner>
          <Card>
            <BlockStack gap="300">
              <section className={styles.adminMainSection} aria-label="Feature flags">
                <Text
                  as="p"
                  variant="bodySm"
                  tone="subdued"
                  className={styles.adminPageDescription}
                >
                  Turn a flag on to set value to &quot;true&quot;, off for &quot;false&quot;.
                  Changes are audited.
                </Text>
              </section>
              {isLoading ? (
                <Text as="p" tone="subdued">
                  Loading…
                </Text>
              ) : (
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text']}
                    headings={['Key', 'Label', 'Description', 'Enabled']}
                    rows={rows}
                  />
                </div>
              )}
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="300">
              <section className={styles.adminMainSection} aria-label="Test type availability">
                <Text
                  as="p"
                  variant="bodySm"
                  tone="subdued"
                  className={styles.adminPageDescription}
                >
                  Control which test types can be created in the wizard. If disabled, the type is
                  marked unavailable and creation is blocked.
                </Text>
              </section>
              {isLoadingTestTypes ? (
                <Text as="p" tone="subdued">
                  Loading…
                </Text>
              ) : (
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                    headings={['Key', 'Test type', 'Description', 'Enabled', 'Unavailable message']}
                    rows={testTypeRows}
                  />
                </div>
              )}
            </BlockStack>
          </Card>
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
    </PageShell>
  );
}
