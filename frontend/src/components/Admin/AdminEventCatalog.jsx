/**
 * AdminEventCatalog
 *
 * List distinct event_type / event_name with counts (data discovery).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Page, Card, DataTable, Text, BlockStack, TextField, EmptyState } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import styles from './Admin.module.css';

export default function AdminEventCatalog() {
  const [shopDomain, setShopDomain] = useState('');
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'event-catalog', shopDomain],
    queryFn: async () => {
      const params = { limit: 200 };
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/event-catalog', params);
      return res.data?.data ?? res.data;
    },
  });
  const events = data?.events ?? [];
  const rows = events.map(e => [
    e.shopDomain ?? '—',
    e.eventType ?? '—',
    e.eventName ?? '(none)',
    String(e.count ?? 0),
  ]);
  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Event catalog"
        subtitle="Distinct event types and names with counts (data discovery)."
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
            ) : events.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No events"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Events appear here once tracking data exists.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'numeric']}
                  headings={['Shop', 'Event type', 'Event name', 'Count']}
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
