/**
 * AdminWebhookEvents
 *
 * List incoming webhook events (idempotency log). Filters: shop_domain, topic.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Page, Card, DataTable, Text, BlockStack, TextField, EmptyState } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import styles from './Admin.module.css';

export default function AdminWebhookEvents() {
  const [shopDomain, setShopDomain] = useState('');
  const [topic, setTopic] = useState('');
  const [limit] = useState(100);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'webhook-events', shopDomain, topic, limit],
    queryFn: async () => {
      const params = { limit };
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      if (topic.trim()) params.topic = topic.trim();
      const res = await apiGet('/admin/webhook-events', params);
      return res.data?.data ?? res.data;
    },
  });

  const events = data?.events ?? [];
  const rows = events.map(e => [
    e.shopDomain ?? '—',
    e.topic ?? '—',
    e.webhookId ?? '—',
    e.payloadHash ? String(e.payloadHash).slice(0, 12) + '…' : '—',
    e.receivedAt ? new Date(e.receivedAt).toLocaleString() : '—',
  ]);

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Webhook events"
        subtitle="Incoming webhook idempotency log (Shopify and other). Filter by shop or topic."
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
            <section className={styles.adminMainSection} aria-label="Filters">
              <div className={styles.adminFilters}>
                <TextField
                  label="Shop domain"
                  value={shopDomain}
                  onChange={setShopDomain}
                  placeholder="e.g. store.myshopify.com"
                  autoComplete="off"
                />
                <TextField
                  label="Topic"
                  value={topic}
                  onChange={setTopic}
                  placeholder="e.g. APP_UNINSTALLED"
                  autoComplete="off"
                />
              </div>
            </section>
            <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
              Shows the most recent webhook events received (for idempotency). Not the payload body.
            </Text>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : events.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No webhook events"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Events will appear here when webhooks are received.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Shop', 'Topic', 'Webhook ID', 'Payload hash', 'Received at']}
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
