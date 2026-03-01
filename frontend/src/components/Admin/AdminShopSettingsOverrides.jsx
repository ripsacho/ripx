/**
 * AdminShopSettingsOverrides
 *
 * List and set admin overrides for shop settings (min sample, confidence, auto stop, webhook).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, DataTable, Text, BlockStack, TextField, EmptyState } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminShopSettingsOverrides() {
  const [shopDomain, setShopDomain] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'shop-settings-overrides', shopDomain],
    queryFn: async () => {
      const params = {};
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/shop-settings-overrides', params);
      return res.data?.data ?? res.data;
    },
  });
  const overrides = data?.overrides ?? [];
  const rows = overrides.map(o => [
    o.shopDomain ?? '—',
    o.overrides?.minSampleSize ?? '—',
    o.overrides?.confidenceLevel ?? '—',
    o.overrides?.autoStopEnabled !== null && o.overrides?.autoStopEnabled !== undefined
      ? String(o.overrides.autoStopEnabled)
      : '—',
    o.overrides?.outboundWebhookUrl ? '***' : '—',
    o.updatedAt ? new Date(o.updatedAt).toLocaleString() : '—',
  ]);
  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => refetch(),
          loading: isFetching,
        }}
      >
        <Card>
          <BlockStack gap="300">
            <TextField
              label="Shop domain"
              value={shopDomain}
              onChange={setShopDomain}
              placeholder="Filter (optional)"
              autoComplete="off"
            />
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : overrides.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No overrides"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    Use the API PUT /api/admin/shop-settings-overrides/:shopDomain to set overrides.
                  </p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Shop', 'Min sample', 'Confidence', 'Auto stop', 'Webhook', 'Updated']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: null, type: 'success' })}
          duration={3000}
        />
      )}
    </PageShell>
  );
}
