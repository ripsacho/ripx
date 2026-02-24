/**
 * AdminWebhooks
 *
 * List outbound webhook config per shop (URL masked). Override via Key-value or shop_settings.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Page, Card, DataTable, Text, BlockStack, TextField, EmptyState } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import styles from './Admin.module.css';

export default function AdminWebhooks() {
  const [shopDomain, setShopDomain] = useState('');
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'webhooks', shopDomain],
    queryFn: async () => {
      const params = {};
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/webhooks', params);
      return res.data?.data ?? res.data;
    },
  });
  const webhooks = data?.webhooks ?? [];
  const rows = webhooks.map(w => [
    w.shopDomain ?? '—',
    w.webhookUrlMasked ?? '—',
    Array.isArray(w.webhookEvents) ? w.webhookEvents.join(', ') : '—',
    w.updatedAt ? new Date(w.updatedAt).toLocaleString() : '—',
  ]);
  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Outbound webhooks"
        subtitle="Per-shop webhook URL (masked) and events. Override via Settings in app or admin API."
        backAction={{ content: 'Admin', url: '/admin' }}
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
            ) : webhooks.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No webhook config"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Shops with outbound webhooks configured will appear here.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text']}
                  headings={['Shop', 'URL (masked)', 'Events', 'Updated']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </Page>
    </PageShell>
  );
}
