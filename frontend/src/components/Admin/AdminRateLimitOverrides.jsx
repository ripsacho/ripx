/**
 * AdminRateLimitOverrides
 *
 * List and set per-domain rate limit overrides (track_max, api_max). Stored in key_value_store.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Page, Card, DataTable, Text, BlockStack, TextField, EmptyState } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import styles from './Admin.module.css';

export default function AdminRateLimitOverrides() {
  const [shopDomain, setShopDomain] = useState('');
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'rate-limit-overrides'],
    queryFn: async () => {
      const res = await apiGet('/admin/rate-limit-overrides');
      return res.data?.data ?? res.data;
    },
  });
  const overrides = data?.overrides ?? [];
  const filtered =
    shopDomain.trim() === ''
      ? overrides
      : overrides.filter(o =>
          String(o.shopDomain || '')
            .toLowerCase()
            .includes(shopDomain.trim().toLowerCase())
        );
  const rows = filtered.map(o => [
    o.shopDomain ?? '—',
    o.trackMax ?? '—',
    o.apiMax ?? '—',
    o.updatedAt ? new Date(o.updatedAt).toLocaleString() : '—',
  ]);
  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Rate limit overrides"
        subtitle="Per-domain track_max and api_max (key_value_store). Apply via backend when supported."
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
            ) : filtered.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No rate limit overrides"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    Use PUT /api/admin/rate-limit-overrides/:shopDomain with body track_max,
                    api_max.
                  </p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'numeric', 'numeric', 'text']}
                  headings={['Shop', 'Track max', 'API max', 'Updated']}
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
