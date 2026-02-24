/**
 * AdminAudit
 *
 * List audit log entries with entity/shop filters, pagination, CSV export, and refresh.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Page,
  Card,
  DataTable,
  Text,
  Button,
  BlockStack,
  Select,
  TextField,
  Box,
  EmptyState,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, getShopDomain, getApiKey } from '../../services';
import { PageShell } from '../Shared';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import styles from './Admin.module.css';

const PAGE_SIZE_OPTIONS = [50, 100, 200];
const ENTITY_OPTIONS = [
  { label: 'All entities', value: '' },
  { label: 'User', value: 'user' },
  { label: 'Tenant', value: 'tenant' },
  { label: 'Test', value: 'test' },
];

function formatRelativeTime(iso) {
  const d = new Date(iso);
  const now = Date.now();
  const sec = Math.floor((now - d.getTime()) / 1000);
  if (sec < 60) return 'Just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export default function AdminAudit() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [entityFilter, setEntityFilter] = useState('');
  const [shopFilter, setShopFilter] = useState('');

  const {
    data,
    isLoading,
    isFetching: _isFetching,
    refetch,
  } = useQuery({
    queryKey: ['admin', 'audit-log', page, pageSize, entityFilter, shopFilter],
    queryFn: async () => {
      const params = { limit: pageSize, offset: page * pageSize };
      if (entityFilter) params.entity_type = entityFilter;
      if (shopFilter.trim()) params.shop_domain = shopFilter.trim();
      const res = await apiGet('/admin/audit-log', params);
      return res.data?.data ?? res.data;
    },
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const rows = entries.map(e => [
    `${formatRelativeTime(e.createdAt)} (${new Date(e.createdAt).toLocaleString()})`,
    e.shopDomain,
    e.entityType,
    e.entityId || '—',
    e.action,
    e.actorId || e.userId || '—',
    e.changes ? JSON.stringify(e.changes) : '—',
  ]);

  const handleExportCsv = () => {
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const url = `${baseUrl}/admin/audit-log/export?limit=5000`;
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
        a.download = 'ripx-audit-log.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  };

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Audit log"
        subtitle="Admin and system actions. Filter by entity or shop; export for compliance."
        backAction={{ content: 'Admin', url: '/admin' }}
        primaryAction={{ content: 'Export CSV', onAction: handleExportCsv }}
        secondaryActions={[{ content: 'Refresh', icon: RefreshIcon, onAction: () => refetch() }]}
      >
        <Card>
          <BlockStack gap="300">
            <section className={styles.adminMainSection} aria-label="Page context">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Filter by entity type or shop domain. Export CSV for compliance or external
                analysis.
              </Text>
            </section>
            <div className={styles.adminToolbar}>
              <Box minWidth="140px">
                <Select
                  label="Entity type"
                  options={ENTITY_OPTIONS}
                  value={entityFilter}
                  onChange={v => {
                    setEntityFilter(v);
                    setPage(0);
                  }}
                />
              </Box>
              <Box minWidth="100px">
                <Select
                  label="Page size"
                  options={PAGE_SIZE_OPTIONS.map(n => ({ label: String(n), value: String(n) }))}
                  value={String(pageSize)}
                  onChange={v => {
                    setPageSize(parseInt(v, 10));
                    setPage(0);
                  }}
                />
              </Box>
              <TextField
                label="Shop / domain"
                value={shopFilter}
                onChange={setShopFilter}
                placeholder="Filter by domain"
                autoComplete="off"
              />
            </div>
            {isLoading ? (
              <div className={styles.adminTableWrap}>
                <LoadingSkeleton type="table" count={3} />
              </div>
            ) : entries.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading={
                    total === 0 && !entityFilter && !shopFilter?.trim()
                      ? 'No audit entries yet'
                      : 'No entries match your filters'
                  }
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {total === 0 && !entityFilter && !shopFilter?.trim()
                      ? 'Admin and user actions will be logged here.'
                      : 'Try changing the entity type or shop filter.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                  {total} {total !== 1 ? 'entries' : 'entry'} total
                </Text>
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                    headings={[
                      'Time',
                      'Shop/Domain',
                      'Entity',
                      'Entity ID',
                      'Action',
                      'Actor',
                      'Changes',
                    ]}
                    rows={rows}
                  />
                </div>
                {totalPages > 1 && (
                  <div className={styles.adminPagination}>
                    <Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      Previous
                    </Button>
                    <Text as="span" tone="subdued">
                      {page + 1} of {totalPages} ({total} total)
                    </Text>
                    <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </Page>
    </PageShell>
  );
}
