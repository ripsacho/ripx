/**
 * AdminTests
 *
 * List all tests with status/domain filters, pagination, stop action, refresh, and empty state.
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Page,
  Card,
  DataTable,
  Button,
  Badge,
  Text,
  Select,
  TextField,
  Box,
  BlockStack,
  EmptyState,
  InlineStack,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPut, unwrapData } from '../../services';
import { ROUTES } from '../../constants';
import Toast from '../Toast/Toast';
import { PageShell } from '../Shared';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import styles from './Admin.module.css';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Running', value: 'running' },
  { label: 'Draft', value: 'draft' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Completed', value: 'completed' },
];

const TYPE_OPTIONS = [
  { label: 'All types', value: '' },
  { label: 'AB test', value: 'ab' },
  { label: 'Shipping', value: 'shipping' },
  { label: 'Offer', value: 'offer' },
  { label: 'Checkout', value: 'checkout' },
  { label: 'Personalization', value: 'personalization' },
];

export default function AdminTests() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const statusFromUrl = searchParams.get('status') || '';
  const domainFromUrl = searchParams.get('domain') || '';
  const [statusFilter, setStatusFilter] = useState(statusFromUrl);
  const [typeFilter, setTypeFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState(domainFromUrl);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState({ message: null, type: 'success' });

  useEffect(() => {
    if (statusFromUrl && statusFilter !== statusFromUrl) setStatusFilter(statusFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from URL only when URL changes
  }, [statusFromUrl]);
  useEffect(() => {
    if (domainFromUrl && domainFilter !== domainFromUrl) setDomainFilter(domainFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from URL only when URL changes
  }, [domainFromUrl]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'tests', statusFilter, typeFilter, domainFilter, page, pageSize],
    queryFn: async () => {
      const params = { limit: pageSize, offset: page * pageSize };
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (domainFilter) params.domain = domainFilter.trim();
      const res = await apiGet('/admin/tests', params);
      return unwrapData(res);
    },
  });

  const stopMutation = useMutation({
    mutationFn: async testId => {
      await apiPut(`/admin/tests/${testId}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'tests'] });
      setToast({ message: 'Test stopped', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Failed to stop test',
        type: 'error',
      });
    },
  });

  const tests = data?.tests ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const rows = tests.map(t => [
    t.name,
    t.shopDomain,
    t.type,
    t.status === 'running' ? <Badge tone="success">Running</Badge> : <Badge>{t.status}</Badge>,
    t.variantCount,
    new Date(t.updatedAt).toLocaleDateString(),
    <InlineStack key={`actions-${t.id}`} gap="200" blockAlign="center">
      <Button size="slim" url={ROUTES.TEST_DETAIL(t.id)}>
        View
      </Button>
      {t.status === 'running' && (
        <Button
          size="slim"
          tone="critical"
          onClick={() => stopMutation.mutate(t.id)}
          loading={stopMutation.isPending}
        >
          Stop
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Tests"
        subtitle="All tests across domains. Filter by status, type, or domain; view or stop tests."
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
            <section className={styles.adminMainSection} aria-label="Page context">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Filter by status, type, or domain. Open a test to view details or stop it from the
                table.
              </Text>
            </section>
            <div className={styles.adminToolbar}>
              <Box minWidth="140px">
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={v => {
                    setStatusFilter(v);
                    setPage(0);
                  }}
                />
              </Box>
              <Box minWidth="140px">
                <Select
                  label="Type"
                  options={TYPE_OPTIONS}
                  value={typeFilter}
                  onChange={v => {
                    setTypeFilter(v);
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
                label="Domain"
                value={domainFilter}
                onChange={setDomainFilter}
                placeholder="Filter by shop domain"
                autoComplete="off"
              />
            </div>
            {isLoading ? (
              <div className={styles.adminTableWrap}>
                <LoadingSkeleton type="table" count={3} />
              </div>
            ) : tests.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading={
                    total === 0 && !statusFilter && !typeFilter && !domainFilter?.trim()
                      ? 'No tests yet'
                      : 'No tests match your filters'
                  }
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {total === 0 && !statusFilter && !typeFilter && !domainFilter?.trim()
                      ? 'Tests will appear here when stores create experiments.'
                      : 'Try changing the status, type, or domain filter.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                  {total} test{total !== 1 ? 's' : ''} found
                </Text>
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'numeric', 'text', 'text']}
                    headings={[
                      'Name',
                      'Domain',
                      'Type',
                      'Status',
                      'Variants',
                      'Updated',
                      'Actions',
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
