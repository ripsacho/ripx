/**
 * AdminUsers
 *
 * List users (shop domains) with status filter, search, lock/unlock, and refresh.
 */

import React, { useState } from 'react';
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
} from '@shopify/polaris';
import { RefreshIcon, ViewIcon } from '@shopify/polaris-icons';
import { apiGet, apiPut, apiPost, getShopDomain, getApiKey } from '../../services';
import Toast from '../Toast/Toast';
import { PageShell } from '../Shared';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import styles from './Admin.module.css';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Locked', value: 'locked' },
];

const ROLE_OPTIONS = [
  { label: 'No admin role', value: '' },
  { label: 'Admin', value: 'admin' },
  { label: 'Superadmin', value: 'superadmin' },
];

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalUser, setRoleModalUser] = useState(null);
  const [roleModalValue, setRoleModalValue] = useState('');
  const [detailUser, setDetailUser] = useState(null);
  const [impersonateResult, setImpersonateResult] = useState(null);
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'users', page, pageSize, statusFilter, search],
    queryFn: async () => {
      const params = { limit: pageSize, offset: page * pageSize };
      if (statusFilter) params.status = statusFilter;
      if (search) params.q = search;
      const res = await apiGet('/admin/users', params);
      return res.data?.data ?? res.data;
    },
  });

  const lockMutation = useMutation({
    mutationFn: async ({ shopDomain, action }) => {
      const path =
        action === 'lock'
          ? `/admin/users/${encodeURIComponent(shopDomain)}/lock`
          : `/admin/users/${encodeURIComponent(shopDomain)}/unlock`;
      await apiPut(path);
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setToast({ message: action === 'lock' ? 'User locked' : 'User unlocked', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Action failed',
        type: 'error',
      });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async ({ shopDomain, role }) => {
      await apiPut(`/admin/users/${encodeURIComponent(shopDomain)}/role`, { role: role || null });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setToast({ message: 'Role updated', type: 'success' });
      setRoleModalOpen(false);
      setRoleModalUser(null);
      setRoleModalValue('');
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Failed to update role',
        type: 'error',
      });
    },
  });

  const { data: userDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'users', detailUser],
    queryFn: async () => {
      const res = await apiGet(`/admin/users/${encodeURIComponent(detailUser)}`);
      return res.data?.data ?? res.data;
    },
    enabled: Boolean(detailUser),
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const handleExportCsv = () => {
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('q', search);
    const url = `${baseUrl}/admin/users/export${params.toString() ? `?${params.toString()}` : ''}`;
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
        a.download = 'ripx-admin-users.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => setToast({ message: 'Export failed', type: 'error' }));
  };
  const rows = users.map(u => [
    u.shopDomain,
    u.email || '—',
    u.firstName || u.lastName ? [u.firstName, u.lastName].filter(Boolean).join(' ') : '—',
    u.role ? <Badge tone="info">{u.role}</Badge> : '—',
    u.status === 'locked' ? (
      <Badge tone="critical">Locked</Badge>
    ) : (
      <Badge tone="success">Active</Badge>
    ),
    new Date(u.createdAt).toLocaleDateString(),
    <InlineStack key={`actions-${u.shopDomain}`} gap="200" wrap>
      <Button
        size="slim"
        variant="plain"
        icon={ViewIcon}
        onClick={() => setDetailUser(u.shopDomain)}
        accessibilityLabel="View user details"
      >
        View
      </Button>
      <Button
        size="slim"
        onClick={() => {
          setRoleModalUser(u);
          setRoleModalValue(u.role || '');
          setRoleModalOpen(true);
        }}
      >
        Set role
      </Button>
      {u.status === 'locked' ? (
        <Button
          size="slim"
          onClick={() => lockMutation.mutate({ shopDomain: u.shopDomain, action: 'unlock' })}
        >
          Unlock
        </Button>
      ) : (
        <Button
          size="slim"
          tone="critical"
          onClick={() => lockMutation.mutate({ shopDomain: u.shopDomain, action: 'lock' })}
        >
          Lock
        </Button>
      )}
    </InlineStack>,
  ]);

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(0);
  };

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Users"
        subtitle="View, search, and manage user accounts. Set roles, lock or unlock, and export to CSV."
        backAction={{ content: 'Admin', url: '/admin' }}
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => refetch(),
          loading: isFetching,
        }}
        secondaryActions={[{ content: 'Export CSV', onAction: handleExportCsv }]}
      >
        <Card>
          <BlockStack gap="300">
            <section className={styles.adminMainSection} aria-label="Page context">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Filter by status or search by domain or email. Use Set role, Lock, or Unlock from
                the table.
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
                label="Search"
                value={searchInput}
                onChange={setSearchInput}
                placeholder="Domain or email"
                autoComplete="off"
                onBlur={applySearch}
                clearButton
                onClearButtonClick={() => {
                  setSearchInput('');
                  setSearch('');
                }}
              />
              <Box paddingBlockStart="400">
                <Button onClick={applySearch}>Apply</Button>
              </Box>
            </div>
            {isLoading ? (
              <div className={styles.adminTableWrap}>
                <LoadingSkeleton type="table" count={3} />
              </div>
            ) : users.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading={
                    total === 0 && !search && !statusFilter
                      ? 'No users yet'
                      : 'No users match your filters'
                  }
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {total === 0 && !search && !statusFilter
                      ? 'Users will appear here once they sign up or connect a store.'
                      : 'Try changing the status filter or search term.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                  {total} user{total !== 1 ? 's' : ''} found
                </Text>
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                    headings={['Domain', 'Email', 'Name', 'Role', 'Status', 'Created', 'Actions']}
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
      {detailUser && (
        <Modal
          open
          onClose={() => {
            setDetailUser(null);
            setImpersonateResult(null);
          }}
          title={`User: ${detailUser}`}
          size="large"
        >
          <Modal.Section>
            {detailLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : userDetail ? (
              <BlockStack gap="400">
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Profile
                  </Text>
                  <Text as="p" variant="bodyMd">
                    {[
                      userDetail.profile?.email,
                      [userDetail.profile?.firstName, userDetail.profile?.lastName]
                        .filter(Boolean)
                        .join(' '),
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Role / Status
                  </Text>
                  <InlineStack gap="200">
                    {userDetail.role ? (
                      <Badge tone="info">{userDetail.role}</Badge>
                    ) : (
                      <Text as="span">No admin role</Text>
                    )}
                    {userDetail.status === 'locked' ? (
                      <Badge tone="critical">Locked</Badge>
                    ) : (
                      <Badge tone="success">Active</Badge>
                    )}
                  </InlineStack>
                </BlockStack>
                {userDetail.account && Object.keys(userDetail.account).length > 0 && (
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Account
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {JSON.stringify(userDetail.account)}
                    </Text>
                  </BlockStack>
                )}
                {userDetail.preferences && Object.keys(userDetail.preferences).length > 0 && (
                  <BlockStack gap="100">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Preferences
                    </Text>
                    <Text as="p" variant="bodyMd">
                      {JSON.stringify(userDetail.preferences)}
                    </Text>
                  </BlockStack>
                )}
                <InlineStack gap="400">
                  <Text as="span" variant="bodySm" tone="subdued">
                    Created{' '}
                    {userDetail.createdAt ? new Date(userDetail.createdAt).toLocaleString() : '—'}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Updated{' '}
                    {userDetail.updatedAt ? new Date(userDetail.updatedAt).toLocaleString() : '—'}
                  </Text>
                </InlineStack>
                <Box paddingBlockStart="200">
                  <InlineStack gap="200">
                    <Button
                      variant="secondary"
                      size="slim"
                      onClick={() => {
                        const baseUrl = import.meta.env.VITE_API_URL || '/api';
                        const url = `${baseUrl}/admin/users/${encodeURIComponent(detailUser)}/export`;
                        const shop = getShopDomain();
                        const apiKey = getApiKey();
                        const headers = { Accept: 'application/json' };
                        if (apiKey) headers['X-RipX-API-Key'] = apiKey;
                        if (shop) headers['X-Shopify-Shop-Domain'] = shop;
                        fetch(url, { credentials: 'include', headers })
                          .then(r => {
                            if (!r.ok) throw new Error(r.statusText);
                            return r.json();
                          })
                          .then(data => {
                            const payload = data?.data ?? data;
                            const blob = new Blob([JSON.stringify(payload, null, 2)], {
                              type: 'application/json',
                            });
                            const a = document.createElement('a');
                            a.href = URL.createObjectURL(blob);
                            a.download = `ripx-user-export-${detailUser.replace(/[^a-z0-9.-]/gi, '_')}.json`;
                            a.click();
                            URL.revokeObjectURL(a.href);
                            setToast({ message: 'User data exported', type: 'success' });
                          })
                          .catch(() => setToast({ message: 'Export failed', type: 'error' }));
                      }}
                    >
                      Export data (GDPR)
                    </Button>
                    <Button
                      variant="secondary"
                      size="slim"
                      onClick={async () => {
                        setImpersonateLoading(true);
                        setImpersonateResult(null);
                        try {
                          const res = await apiPost('/admin/impersonate', {
                            shop_domain: detailUser,
                          });
                          const payload = res?.data?.data ?? res?.data ?? res;
                          setImpersonateResult({
                            token: payload.token,
                            expiresIn: payload.expiresIn,
                            impersonated_shop: payload.impersonated_shop || detailUser,
                          });
                        } catch (e) {
                          setToast({
                            message:
                              e?.response?.data?.error || e?.message || 'Impersonation failed',
                            type: 'error',
                          });
                        } finally {
                          setImpersonateLoading(false);
                        }
                      }}
                      loading={impersonateLoading}
                    >
                      Impersonate (get token)
                    </Button>
                  </InlineStack>
                  {impersonateResult && (
                    <Box paddingBlockStart="300">
                      <BlockStack gap="200">
                        <Text as="p" variant="bodySm" tone="subdued">
                          Short-lived token (valid {impersonateResult.expiresIn}s). Use as
                          Authorization: Bearer &lt;token&gt; to act as this shop.
                        </Text>
                        <InlineStack gap="200">
                          <Text as="p" variant="bodySm">
                            {impersonateResult.token.slice(0, 24)}… (
                            {impersonateResult.token.length} chars)
                          </Text>
                          <Button
                            size="slim"
                            onClick={() => {
                              navigator.clipboard.writeText(impersonateResult.token);
                              setToast({ message: 'Token copied to clipboard', type: 'success' });
                            }}
                          >
                            Copy token
                          </Button>
                          <Button size="slim" onClick={() => setImpersonateResult(null)}>
                            Dismiss
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  )}
                </Box>
              </BlockStack>
            ) : (
              <Text as="p" tone="subdued">
                Could not load user.
              </Text>
            )}
          </Modal.Section>
        </Modal>
      )}
      {roleModalOpen && roleModalUser && (
        <Modal
          open={roleModalOpen}
          onClose={() => {
            setRoleModalOpen(false);
            setRoleModalUser(null);
            setRoleModalValue('');
          }}
          title="Set user role"
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" tone="subdued">
                User: {roleModalUser.shopDomain}
              </Text>
              <Select
                label="Role"
                options={ROLE_OPTIONS}
                value={roleModalValue}
                onChange={setRoleModalValue}
              />
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={() =>
                    roleMutation.mutate({
                      shopDomain: roleModalUser.shopDomain,
                      role: roleModalValue || null,
                    })
                  }
                  loading={roleMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  onClick={() => {
                    setRoleModalOpen(false);
                    setRoleModalUser(null);
                    setRoleModalValue('');
                  }}
                >
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
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
