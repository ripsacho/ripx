/**
 * AdminDomains
 *
 * List domains (tenants) with status filter, search, suspend/unsuspend, domain detail modal, and refresh.
 */

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Page,
  Card,
  DataTable,
  Button,
  InlineStack,
  Badge,
  Text,
  BlockStack,
  Select,
  TextField,
  Box,
  EmptyState,
  Modal,
  Divider,
  Link,
} from '@shopify/polaris';
import { RefreshIcon, ViewIcon } from '@shopify/polaris-icons';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPut } from '../../services';
import Toast from '../Toast/Toast';
import { PageShell } from '../Shared';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { ROUTES } from '../../constants';
import styles from './Admin.module.css';

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
];

export default function AdminDomains() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('');
  const [domainSearch, setDomainSearch] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [detailDomain, setDetailDomain] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'domains'],
    queryFn: async () => {
      const res = await apiGet('/admin/domains');
      return res.data?.data ?? res.data;
    },
  });

  const { data: domainDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'domains', detailDomain],
    queryFn: async () => {
      const res = await apiGet(`/admin/domains/${encodeURIComponent(detailDomain)}`);
      return res.data?.data ?? res.data;
    },
    enabled: Boolean(detailDomain),
  });

  const filteredDomains = useMemo(() => {
    let list = data?.domains ?? [];
    if (statusFilter) {
      list = list.filter(d => (d.status || 'active') === statusFilter);
    }
    if (domainSearch.trim()) {
      const q = domainSearch.trim().toLowerCase();
      list = list.filter(d => (d.domain || '').toLowerCase().includes(q));
    }
    return list;
  }, [data?.domains, statusFilter, domainSearch]);

  const suspendMutation = useMutation({
    mutationFn: async ({ domain, action }) => {
      const path =
        action === 'suspend'
          ? `/admin/domains/${encodeURIComponent(domain)}/suspend`
          : `/admin/domains/${encodeURIComponent(domain)}/unsuspend`;
      await apiPut(path);
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
      setToast({
        message: action === 'suspend' ? 'Domain suspended' : 'Domain unsuspended',
        type: 'success',
      });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Action failed',
        type: 'error',
      });
    },
  });

  const openDetail = domain => setDetailDomain(domain);
  const closeDetail = () => setDetailDomain(null);

  const rows = filteredDomains.map(d => [
    d.domain,
    d.platform,
    d.status === 'suspended' ? (
      <Badge tone="critical">Suspended</Badge>
    ) : (
      <Badge tone="success">Active</Badge>
    ),
    d.testsCount,
    new Date(d.updatedAt).toLocaleDateString(),
    <InlineStack key={`actions-${d.domain}`} gap="200">
      <Button
        size="slim"
        variant="plain"
        icon={ViewIcon}
        onClick={() => openDetail(d.domain)}
        accessibilityLabel="View domain details"
      >
        View
      </Button>
      {d.status === 'suspended' ? (
        <Button
          size="slim"
          onClick={() => suspendMutation.mutate({ domain: d.domain, action: 'unsuspend' })}
        >
          Unsuspend
        </Button>
      ) : (
        <Button
          size="slim"
          tone="critical"
          onClick={() => suspendMutation.mutate({ domain: d.domain, action: 'suspend' })}
        >
          Suspend
        </Button>
      )}
    </InlineStack>,
  ]);

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Domains"
        subtitle="Tenant domains and status. View details, suspend or unsuspend access."
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
                Filter by status or search by domain. Use View for details, or Suspend/Unsuspend to
                control access.
              </Text>
            </section>
            <div className={styles.adminToolbar}>
              <Box minWidth="140px">
                <Select
                  label="Status"
                  options={STATUS_OPTIONS}
                  value={statusFilter}
                  onChange={setStatusFilter}
                />
              </Box>
              <TextField
                label="Domain"
                value={domainSearch}
                onChange={setDomainSearch}
                placeholder="Filter by domain"
                autoComplete="off"
              />
            </div>
            {isLoading ? (
              <div className={styles.adminTableWrap}>
                <LoadingSkeleton type="table" count={3} />
              </div>
            ) : filteredDomains.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading={
                    !data?.domains?.length ? 'No domains yet' : 'No domains match your filters'
                  }
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {!data?.domains?.length
                      ? 'Domains will appear here when stores connect or are onboarded.'
                      : 'Try changing the status filter or domain search.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                  {filteredDomains.length} domain{filteredDomains.length !== 1 ? 's' : ''} shown
                </Text>
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'numeric', 'text', 'text']}
                    headings={['Domain', 'Platform', 'Status', 'Tests', 'Updated', 'Actions']}
                    rows={rows}
                  />
                </div>
              </>
            )}
          </BlockStack>
        </Card>
      </Page>
      {detailDomain && (
        <Modal
          open
          onClose={closeDetail}
          title={`Domain: ${detailDomain}`}
          size="large"
          primaryAction={{
            content: domainDetail?.status === 'suspended' ? 'Unsuspend' : 'Suspend',
            destructive: domainDetail?.status !== 'suspended',
            onAction: () => {
              suspendMutation.mutate({
                domain: detailDomain,
                action: domainDetail?.status === 'suspended' ? 'unsuspend' : 'suspend',
              });
              queryClient.invalidateQueries({ queryKey: ['admin', 'domains', detailDomain] });
              closeDetail();
            },
          }}
          secondaryActions={[
            {
              content: 'View tests',
              onAction: () => {
                navigate(`${ROUTES.ADMIN_TESTS}?domain=${encodeURIComponent(detailDomain)}`);
                closeDetail();
              },
            },
          ]}
        >
          <Modal.Section>
            {detailLoading ? (
              <LoadingSkeleton type="text" count={5} />
            ) : domainDetail ? (
              <BlockStack gap="400">
                <InlineStack gap="800" wrap>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Platform
                    </Text>
                    <Text as="span" variant="bodyMd">
                      {domainDetail.platform || '—'}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Status
                    </Text>
                    {domainDetail.status === 'suspended' ? (
                      <Badge tone="critical">Suspended</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Total events
                    </Text>
                    <Text as="span" variant="bodyMd">
                      {domainDetail.totalEvents?.toLocaleString() ?? '—'}
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Total revenue
                    </Text>
                    <Text as="span" variant="bodyMd">
                      {typeof domainDetail.totalRevenue === 'number'
                        ? domainDetail.totalRevenue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })
                        : '—'}
                    </Text>
                  </BlockStack>
                </InlineStack>
                <Divider />
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Recent tests
                  </Text>
                  {domainDetail.recentTests?.length ? (
                    <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                      {domainDetail.recentTests.map(t => (
                        <li key={t.id} style={{ marginBottom: '0.25rem' }}>
                          <Link
                            url={`/tests/${t.id}`}
                            removeUnderline
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t.name || `Test ${t.id}`}
                          </Link>{' '}
                          <Badge tone={t.status === 'running' ? 'success' : 'info'}>
                            {t.status}
                          </Badge>
                          {t.type && (
                            <Text as="span" variant="bodySm" tone="subdued">
                              {' '}
                              · {t.type}
                            </Text>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No recent tests.
                    </Text>
                  )}
                </BlockStack>
              </BlockStack>
            ) : (
              <Text as="p" tone="subdued">
                Could not load domain details.
              </Text>
            )}
          </Modal.Section>
        </Modal>
      )}
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
