/**
 * AdminAudit
 *
 * List audit log entries with entity/shop filters, pagination, CSV export, and refresh.
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  Text,
  Button,
  BlockStack,
  Select,
  TextField,
  Box,
  EmptyState,
  Banner,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, getShopDomain, getApiKey, getApiBaseUrl } from '../../services';
import { PageShell } from '../Shared';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import AdminPageLayout from './AdminPageLayout';
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
  const [tenantIdFilter, setTenantIdFilter] = useState('');
  const [tenantDomainFilter, setTenantDomainFilter] = useState('');

  const { data: domainsData } = useQuery({
    queryKey: ['admin', 'domains'],
    queryFn: async () => {
      const res = await apiGet('/admin/domains');
      return res.data?.data ?? res.data;
    },
  });
  const domains = domainsData?.domains ?? [];
  const tenantOptions = [
    { label: 'All tenants', value: '' },
    ...domains.map(d => ({ label: `${d.domain} (${d.platform || 'standalone'})`, value: d.id })),
  ];

  const {
    data,
    isLoading,
    isFetching: _isFetching,
    refetch,
    error: auditError,
  } = useQuery({
    queryKey: [
      'admin',
      'audit-log',
      page,
      pageSize,
      entityFilter,
      shopFilter,
      tenantIdFilter,
      tenantDomainFilter,
    ],
    queryFn: async () => {
      const params = { limit: pageSize, offset: page * pageSize };
      if (entityFilter) params.entity_type = entityFilter;
      if (shopFilter.trim()) params.shop_domain = shopFilter.trim();
      const tenantId = tenantIdFilter.trim() || tenantDomainFilter || '';
      if (tenantId) params.tenant_id = tenantId;
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
    e.tenantId ? String(e.tenantId).slice(0, 8) + '…' : '—',
    e.entityType,
    e.entityId || '—',
    e.action,
    e.actorId || e.userId || '—',
    e.changes ? JSON.stringify(e.changes) : '—',
  ]);

  const exportTenantId = tenantIdFilter.trim() || tenantDomainFilter || '';
  const handleExportCsv = () => {
    const baseUrl = getApiBaseUrl();
    const exportParams = new URLSearchParams({ limit: '5000' });
    if (entityFilter) exportParams.set('entity_type', entityFilter);
    if (shopFilter.trim()) exportParams.set('shop_domain', shopFilter.trim());
    if (exportTenantId) exportParams.set('tenant_id', exportTenantId);
    const url = `${baseUrl}/admin/audit-log/export?${exportParams.toString()}`;
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
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout
        primaryAction={{ content: 'Export CSV', onAction: handleExportCsv }}
        secondaryActions={[{ content: 'Refresh', icon: RefreshIcon, onAction: () => refetch() }]}
      >
        <Card>
          <BlockStack gap="300">
            <section className={styles.adminMainSection} aria-label="Page context">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Filter by entity type, shop domain, or tenant. Export CSV for compliance or external
                analysis.
              </Text>
            </section>
            {auditError && (
              <Banner tone="critical" onDismiss={() => refetch()}>
                {auditError?.response?.data?.error ||
                  auditError?.message ||
                  'Failed to load audit log.'}
              </Banner>
            )}
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
              <Box minWidth="200px">
                <Select
                  label="Tenant (domain)"
                  options={tenantOptions}
                  value={tenantDomainFilter}
                  onChange={v => {
                    setTenantDomainFilter(v);
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
              <TextField
                label="Tenant ID (UUID)"
                value={tenantIdFilter}
                onChange={v => {
                  setTenantIdFilter(v);
                  setPage(0);
                }}
                placeholder="Or paste tenant UUID"
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
                    total === 0 &&
                    !entityFilter &&
                    !shopFilter?.trim() &&
                    !tenantIdFilter?.trim() &&
                    !tenantDomainFilter
                      ? 'No audit entries yet'
                      : 'No entries match your filters'
                  }
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {total === 0 &&
                    !entityFilter &&
                    !shopFilter?.trim() &&
                    !tenantIdFilter?.trim() &&
                    !tenantDomainFilter
                      ? 'Admin and user actions will be logged here.'
                      : 'Try changing the entity type, tenant, or shop domain filter.'}
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
                    columnContentTypes={[
                      'text',
                      'text',
                      'text',
                      'text',
                      'text',
                      'text',
                      'text',
                      'text',
                    ]}
                    headings={[
                      'Time',
                      'Shop/Domain',
                      'Tenant ID',
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
      </AdminPageLayout>
    </PageShell>
  );
}
