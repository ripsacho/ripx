/**
 * AdminFeatureFlags
 *
 * Toggle feature flags stored as flag.* in key_value_store. Phase 2.
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Card, DataTable, BlockStack, Text, Checkbox, Banner } from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
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

export default function AdminFeatureFlags() {
  const queryClient = useQueryClient();
  const [toast, setToast] = React.useState({ message: null, type: 'success' });

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'kv', 'flag.'],
    queryFn: async () => {
      const res = await apiGet('/admin/kv', { prefix: 'flag.' });
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

  const keysMap = React.useMemo(() => {
    const list = data?.keys ?? [];
    const map = {};
    list.forEach(k => {
      const v =
        k.valuePreview !== null && k.valuePreview !== undefined
          ? String(k.valuePreview).replace(/…$/, '').trim()
          : '';
      map[k.key] = v.toLowerCase() === 'true';
    });
    return map;
  }, [data]);

  const handleToggle = (key, checked) => {
    putMutation.mutate({ key, value: checked ? 'true' : 'false' });
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

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Feature flags"
        subtitle="Global flags stored in key-value store (flag.*). Toggle to enable or disable features."
        backAction={{ content: 'Admin', url: '/admin' }}
      >
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
        </BlockStack>
      </Page>
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
