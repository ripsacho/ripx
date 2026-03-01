/**
 * AdminConflicts
 *
 * List overlapping running tests (same target) per domain.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, DataTable, Text, BlockStack, TextField, EmptyState } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminConflicts() {
  const [shopDomain, setShopDomain] = useState('');
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'conflicts', shopDomain],
    queryFn: async () => {
      const params = {};
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/conflicts', params);
      return res.data?.data ?? res.data;
    },
  });
  const conflicts = data?.conflicts ?? [];
  const rows = conflicts.map(c => [
    c.shopDomain ?? '—',
    c.testName1 ?? '—',
    c.testId1 ? `${c.testId1.slice(0, 8)}…` : '—',
    c.testName2 ?? '—',
    c.testId2 ? `${c.testId2.slice(0, 8)}…` : '—',
    `${c.targetType || 'any'}${c.targetId ? `: ${c.targetId}` : ''}`,
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
            ) : conflicts.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No conflicts"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>No overlapping running tests found.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Shop', 'Test 1', 'ID', 'Test 2', 'ID', 'Target']}
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
