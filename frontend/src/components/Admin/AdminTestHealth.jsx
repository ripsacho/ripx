/**
 * AdminTestHealth
 *
 * List tests with health score (SRM, sample size, allocation, etc.). Filter by domain, status, health level.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  Text,
  BlockStack,
  TextField,
  Badge,
  EmptyState,
  Select,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const HEALTH_OPTIONS = [
  { label: 'All levels', value: '' },
  { label: 'Poor', value: 'poor' },
  { label: 'Fair', value: 'fair' },
  { label: 'Good', value: 'good' },
  { label: 'Excellent', value: 'excellent' },
];
const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Running', value: 'running' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Completed', value: 'completed' },
];

export default function AdminTestHealth() {
  const [shopDomain, setShopDomain] = useState('');
  const [status, setStatus] = useState('');
  const [healthLevel, setHealthLevel] = useState('');
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'test-health', shopDomain, status, healthLevel],
    queryFn: async () => {
      const params = { limit: 100 };
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      if (status) params.status = status;
      if (healthLevel) params.health_level = healthLevel;
      const res = await apiGet('/admin/test-health', params);
      return res.data?.data ?? res.data;
    },
  });
  const tests = data?.tests ?? [];
  const rows = tests.map(t => [
    t.shopDomain ?? '—',
    t.name ?? '—',
    t.status ?? '—',
    t.startedAt ? new Date(t.startedAt).toLocaleDateString() : '—',
    t.healthScore ?? 0,
    <Badge
      key={t.id}
      tone={
        t.healthColor === 'critical'
          ? 'critical'
          : t.healthColor === 'warning'
            ? 'attention'
            : 'success'
      }
    >
      {t.healthLevel ?? '—'}
    </Badge>,
    Array.isArray(t.issues) && t.issues.length > 0 ? t.issues.slice(0, 2).join('; ') : '—',
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
            <div className={styles.adminFilters}>
              <TextField
                label="Shop domain"
                value={shopDomain}
                onChange={setShopDomain}
                placeholder="Filter (optional)"
                autoComplete="off"
              />
              <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
              <Select
                label="Health level"
                options={HEALTH_OPTIONS}
                value={healthLevel}
                onChange={setHealthLevel}
              />
            </div>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : tests.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No tests"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Tests with running/stopped/completed status appear here.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text', 'text']}
                  headings={['Shop', 'Test', 'Status', 'Started', 'Score', 'Level', 'Issues']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>
    </PageShell>
  );
}
