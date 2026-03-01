/**
 * AdminUsageExport
 *
 * Phase 3: Usage export by domain (visitors, events, conversions, revenue, test count)
 * for a date range. Export as JSON (preview) or CSV (download).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  Button,
  InlineStack,
  Text,
  BlockStack,
  TextField,
  Box,
  EmptyState,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, getShopDomain, getApiKey } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminUsageExport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [appliedRange, setAppliedRange] = useState({ start: '', end: '' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'usage-export', appliedRange.start, appliedRange.end],
    queryFn: async () => {
      const params = { format: 'json' };
      if (appliedRange.start) params.start_date = appliedRange.start;
      if (appliedRange.end) params.end_date = appliedRange.end;
      const res = await apiGet('/admin/usage-export', params);
      const body = res.data;
      return body?.usage ?? body?.data?.usage ?? [];
    },
    enabled: true,
  });

  const usage = Array.isArray(data) ? data : [];
  const hasRange = appliedRange.start || appliedRange.end;

  const handleApply = () => {
    setAppliedRange({ start: startDate.trim(), end: endDate.trim() });
  };

  const handleExportCsv = () => {
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const params = new URLSearchParams({ format: 'csv' });
    if (appliedRange.start) params.set('start_date', appliedRange.start);
    if (appliedRange.end) params.set('end_date', appliedRange.end);
    const url = `${baseUrl}/admin/usage-export?${params.toString()}`;
    const shop = getShopDomain();
    const apiKey = getApiKey();
    const headers = { Accept: 'text/csv' };
    if (apiKey) headers['X-RipX-API-Key'] = apiKey;
    if (shop) headers['X-Shopify-Shop-Domain'] = shop;
    fetch(url, { credentials: 'include', headers })
      .then(r => {
        if (!r.ok) throw new Error(r.statusText);
        return r.text();
      })
      .then(csv => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ripx-usage-export.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        setToast({ message: 'CSV downloaded', type: 'success' });
      })
      .catch(() => setToast({ message: 'Export failed', type: 'error' }));
  };

  const rows = usage.map(u => [
    u.shop_domain ?? '—',
    u.visitors ?? 0,
    u.events ?? 0,
    u.conversions ?? 0,
    typeof u.revenue === 'number' ? u.revenue.toFixed(2) : String(u.revenue ?? '0'),
    u.test_count ?? 0,
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
        secondaryActions={[{ content: 'Download CSV', onAction: handleExportCsv }]}
      >
        <Card>
          <BlockStack gap="300">
            <section className={styles.adminMainSection} aria-label="Usage export">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Optionally set a date range (YYYY-MM-DD). Leave empty for all-time. Apply to
                preview; use Download CSV to export.
              </Text>
            </section>
            <InlineStack gap="300" blockAlign="center">
              <Box minWidth="160px">
                <TextField
                  label="Start date"
                  value={startDate}
                  onChange={setStartDate}
                  placeholder="YYYY-MM-DD"
                  autoComplete="off"
                />
              </Box>
              <Box minWidth="160px">
                <TextField
                  label="End date"
                  value={endDate}
                  onChange={setEndDate}
                  placeholder="YYYY-MM-DD"
                  autoComplete="off"
                />
              </Box>
              <Box paddingBlockStart="400">
                <Button onClick={handleApply}>Apply</Button>
              </Box>
            </InlineStack>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : usage.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading={hasRange ? 'No usage in range' : 'No usage data yet'}
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {hasRange
                      ? 'Try a different date range or leave both empty for all-time.'
                      : 'Usage will appear once domains have tests, assignments, and events.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                  {usage.length} domain{usage.length !== 1 ? 's' : ''}
                  {hasRange && appliedRange.start && ` from ${appliedRange.start}`}
                  {hasRange && appliedRange.end && ` to ${appliedRange.end}`}
                </Text>
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={[
                      'text',
                      'numeric',
                      'numeric',
                      'numeric',
                      'numeric',
                      'numeric',
                    ]}
                    headings={['Domain', 'Visitors', 'Events', 'Conversions', 'Revenue', 'Tests']}
                    rows={rows}
                  />
                </div>
              </>
            )}
          </BlockStack>
        </Card>
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
