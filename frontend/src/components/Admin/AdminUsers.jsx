/**
 * AdminUsers
 *
 * List users: Email users (standalone) with Pending/Accepted/Rejected, or Store users (Shopify) with Active/Locked.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
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
import {
  RefreshIcon,
  ViewIcon,
  CheckCircleIcon,
  XCircleIcon,
  LockIcon,
} from '@shopify/polaris-icons';
import { apiGet, apiPut, apiPost, getShopDomain, getApiKey, getApiBaseUrl } from '../../services';
import { useAdminMe } from '../../hooks';
import { ADMIN_PERMISSIONS } from '../../constants/roles';
import Toast from '../Toast/Toast';
import { PageShell } from '../Shared';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const USER_LIST_VIEW = [
  { label: 'Email users', value: 'email' },
  { label: 'Store users', value: 'store' },
];
const EMAIL_STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Accepted (active)', value: 'accepted' },
  { label: 'Rejected', value: 'rejected' },
];
const STORE_STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Locked', value: 'locked' },
];

const ROLE_OPTIONS = [
  { label: 'No admin role', value: '' },
  { label: 'Collaborator (view only)', value: 'collaborator' },
  { label: 'Admin', value: 'admin' },
  { label: 'Superadmin', value: 'superadmin' },
];

function safeExportFilename(s) {
  return String(s).replace(/[^a-z0-9.-]/gi, '_');
}

function formatKeyLabel(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

function UserDetailModalContent({
  userDetail,
  detailUser,
  setToast,
  setImpersonateResult,
  setImpersonateLoading,
  impersonateResult,
  impersonateLoading,
  canExportUser,
  canImpersonate,
  canSetRole,
  onSaveRole,
  roleSaving,
  roleOptions,
  styles,
}) {
  const [editingRole, setEditingRole] = React.useState(userDetail?.role ?? '');
  React.useEffect(() => {
    setEditingRole(userDetail?.role ?? '');
  }, [userDetail?.role]);
  const domains = Array.isArray(userDetail.domains) ? userDetail.domains : [];
  const domainCount = domains.length;
  const profileSummary =
    [
      userDetail.profile?.email,
      [userDetail.profile?.firstName, userDetail.profile?.lastName].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(' · ') || '—';
  const isEmail = detailUser.includes('@');

  return (
    <div className={styles.adminUserModalBody}>
      <header className={styles.adminUserModalHeader}>
        <div className={styles.adminUserModalHeaderTop}>
          <span className={styles.adminUserModalIdentity}>{detailUser}</span>
          <span className={styles.adminUserModalTypePill}>
            {isEmail ? 'Email account' : 'Store account'}
          </span>
        </div>
        <div className={styles.adminUserModalBadges}>
          {userDetail.role ? (
            <Badge tone="info">{userDetail.role}</Badge>
          ) : (
            <Badge tone="default">No admin role</Badge>
          )}
          {userDetail.status === 'locked' ? (
            <Badge tone="critical">Locked</Badge>
          ) : (
            <Badge tone="success">Active</Badge>
          )}
        </div>
      </header>

      {canSetRole && roleOptions && (
        <section className={styles.adminUserModalSectionCard}>
          <h3 className={styles.adminUserModalSectionTitle}>Platform role</h3>
          <InlineStack gap="300" blockAlign="end">
            <div style={{ minWidth: 160 }}>
              <Select
                label="Role"
                labelInline
                options={roleOptions}
                value={editingRole}
                onChange={setEditingRole}
              />
            </div>
            <Button
              variant="primary"
              size="slim"
              loading={roleSaving}
              onClick={() => onSaveRole(editingRole || null)}
            >
              Save role
            </Button>
          </InlineStack>
        </section>
      )}

      <div className={styles.adminUserModalBodyInner}>
        <section className={styles.adminUserModalSectionCard}>
          <div className={styles.adminUserModalSectionHead}>
            <h3 className={styles.adminUserModalSectionTitle}>Connected domains</h3>
            {domainCount > 0 && (
              <span className={styles.adminUserModalSectionCount}>{domainCount}</span>
            )}
          </div>
          {domainCount > 0 ? (
            <div className={styles.adminUserModalDomainsCard}>
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text']}
                  headings={['Domain', 'Type', 'Verified']}
                  rows={domains.map(d => [
                    d.domain,
                    d.domainType || (d.platform === 'shopify' ? 'Shopify' : 'Standalone'),
                    d.verifiedAt ? (
                      <Badge tone="success">{new Date(d.verifiedAt).toLocaleDateString()}</Badge>
                    ) : (
                      <Badge tone="attention">Pending</Badge>
                    ),
                  ])}
                />
              </div>
            </div>
          ) : (
            <div className={styles.adminUserModalDomainsEmpty}>
              <Text as="p" variant="bodySm" tone="subdued">
                No domains connected yet.
              </Text>
            </div>
          )}
        </section>

        <section className={styles.adminUserModalSectionCard}>
          <h3 className={styles.adminUserModalSectionTitle}>Profile &amp; timeline</h3>
          <div className={styles.adminUserModalSummaryGrid}>
            <div className={styles.adminUserModalSummaryBlock}>
              <Text as="span" variant="bodySm" tone="subdued">
                Profile
              </Text>
              <Text as="p" variant="bodyMd">
                {profileSummary}
              </Text>
            </div>
            <div className={styles.adminUserModalSummaryBlock}>
              <Text as="span" variant="bodySm" tone="subdued">
                Timeline
              </Text>
              <dl className={styles.adminUserModalKeyValue}>
                <dt>Created</dt>
                <dd>
                  {userDetail.createdAt ? new Date(userDetail.createdAt).toLocaleString() : '—'}
                </dd>
                <dt>Updated</dt>
                <dd>
                  {userDetail.updatedAt ? new Date(userDetail.updatedAt).toLocaleString() : '—'}
                </dd>
              </dl>
            </div>
          </div>
        </section>
      </div>

      {((userDetail.account && Object.keys(userDetail.account).length > 0) ||
        (userDetail.preferences && Object.keys(userDetail.preferences).length > 0)) && (
        <section className={styles.adminUserModalSectionCard}>
          <h3 className={styles.adminUserModalSectionTitle}>Account &amp; preferences</h3>
          <div className={styles.adminUserModalKeyValueList}>
            {userDetail.account &&
              Object.entries(userDetail.account).map(([k, v]) => (
                <div key={k} className={styles.adminUserModalKeyValueRow}>
                  <span className={styles.adminUserModalKey}>{formatKeyLabel(k)}</span>
                  <span className={styles.adminUserModalVal}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            {userDetail.preferences &&
              Object.entries(userDetail.preferences).map(([k, v]) => (
                <div key={`pref-${k}`} className={styles.adminUserModalKeyValueRow}>
                  <span className={styles.adminUserModalKey}>{formatKeyLabel(k)}</span>
                  <span className={styles.adminUserModalVal}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

      <section className={styles.adminUserModalSectionCard}>
        <h3 className={styles.adminUserModalSectionTitle}>Actions</h3>
        <div className={styles.adminUserModalActions}>
          {canExportUser && (
            <Button
              variant="secondary"
              size="slim"
              onClick={() => {
                const baseUrl = getApiBaseUrl();
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
                    a.download = `ripx-user-export-${safeExportFilename(detailUser)}.json`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                    setToast({ message: 'User data exported', type: 'success' });
                  })
                  .catch(() => setToast({ message: 'Export failed', type: 'error' }));
              }}
            >
              Export data (GDPR)
            </Button>
          )}
          {canImpersonate && (
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
                    message: e?.response?.data?.error || e?.message || 'Impersonation failed',
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
          )}
        </div>
        {canImpersonate && impersonateResult && (
          <div className={styles.adminUserModalTokenBlock}>
            <Text as="p" variant="bodySm" tone="subdued" className={styles.adminUserModalTokenHint}>
              Token valid for {impersonateResult.expiresIn}s. Use as Authorization: Bearer
              &lt;token&gt;
            </Text>
            <div className={styles.adminUserModalTokenCode}>
              <code>{impersonateResult.token}</code>
            </div>
            <InlineStack gap="200" wrap>
              <Button
                size="slim"
                onClick={() => {
                  navigator.clipboard.writeText(impersonateResult.token);
                  setToast({ message: 'Token copied to clipboard', type: 'success' });
                }}
              >
                Copy token
              </Button>
              <Button size="slim" variant="secondary" onClick={() => setImpersonateResult(null)}>
                Dismiss
              </Button>
            </InlineStack>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [listView, setListView] = useState('email');
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

  const { can, isSuperadmin, data: adminMeData } = useAdminMe();
  const currentUserIdentifier = (adminMeData?.adminId || '').toString().trim().toLowerCase();
  const roleOptionsForSetRole = isSuperadmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter(o => o.value !== 'superadmin');
  const isCurrentUser = identifier =>
    !!(
      identifier &&
      currentUserIdentifier &&
      currentUserIdentifier === (identifier || '').toString().trim().toLowerCase()
    );

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'users', page, pageSize, statusFilter, search],
    queryFn: async () => {
      const params = { limit: pageSize, offset: page * pageSize };
      if (statusFilter) params.status = statusFilter;
      if (search) params.q = search;
      const res = await apiGet('/admin/users', params);
      return res.data?.data ?? res.data;
    },
    enabled: listView === 'store',
  });

  const {
    data: standaloneData,
    isLoading: standaloneLoading,
    isFetching: standaloneFetching,
    refetch: refetchStandalone,
  } = useQuery({
    queryKey: ['admin', 'standalone-users', page, pageSize, statusFilter, search],
    queryFn: async () => {
      const params = { limit: pageSize, offset: page * pageSize };
      if (statusFilter) params.status = statusFilter;
      if (search) params.q = search;
      const res = await apiGet('/admin/standalone-users', params);
      return res.data?.data ?? res.data;
    },
    enabled: listView === 'email',
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
      const isByEmail = detailUser && String(detailUser).includes('@');
      try {
        if (isByEmail) {
          const res = await apiGet('/admin/user-detail-by-email', { email: detailUser });
          const body = res?.data;
          if (body && typeof body === 'object' && body.success !== false && !body.error) {
            return body;
          }
          return null;
        }
        const res = await apiGet(`/admin/users/${encodeURIComponent(detailUser)}`);
        const body = res?.data;
        if (body && typeof body === 'object' && body.success !== false && !body.error) {
          return body;
        }
        return null;
      } catch (err) {
        return null;
      }
    },
    enabled: Boolean(detailUser),
  });

  const {
    data: pendingData,
    isLoading: pendingLoading,
    refetch: refetchPending,
  } = useQuery({
    queryKey: ['admin', 'pending-users'],
    queryFn: async () => {
      const res = await apiGet('/admin/pending-users');
      return res.data?.data ?? res.data;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async userId => {
      await apiPost(`/admin/accept-user/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'standalone-users'] });
      setToast({ message: 'User accepted', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Accept failed',
        type: 'error',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async userId => {
      await apiPost(`/admin/reject-user/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'pending-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'standalone-users'] });
      setToast({ message: 'User rejected', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Reject failed',
        type: 'error',
      });
    },
  });

  const pendingUsers = pendingData?.users ?? [];
  const users = listView === 'email' ? (standaloneData?.users ?? []) : (data?.users ?? []);
  const total = listView === 'email' ? (standaloneData?.total ?? 0) : (data?.total ?? 0);
  const totalPages = Math.ceil(total / pageSize);
  const isLoadingList = listView === 'email' ? standaloneLoading : isLoading;
  const isFetchingList = listView === 'email' ? standaloneFetching : isFetching;
  const statusOptions = listView === 'email' ? EMAIL_STATUS_OPTIONS : STORE_STATUS_OPTIONS;

  const handleExportCsv = () => {
    const baseUrl = getApiBaseUrl();
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
  const rows =
    listView === 'email'
      ? users.map(u => [
          u.email || '—',
          u.status === 'pending' ? (
            <Badge tone="attention">Pending</Badge>
          ) : u.status === 'rejected' ? (
            <Badge tone="critical">Rejected</Badge>
          ) : (
            <Badge tone="success">Accepted</Badge>
          ),
          u.role ? (
            <Badge tone={u.role === 'superadmin' ? 'attention' : 'info'}>{u.role}</Badge>
          ) : (
            '—'
          ),
          u.emailVerifiedAt ? (
            <Badge tone="success">Yes</Badge>
          ) : (
            <Badge tone="attention">No</Badge>
          ),
          u.acceptedAt ? new Date(u.acceptedAt).toLocaleDateString() : '—',
          u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—',
          <Button
            key={`view-${u.id}`}
            size="slim"
            variant="plain"
            icon={ViewIcon}
            onClick={() => setDetailUser(u.email || '')}
            accessibilityLabel="View domains"
          >
            View
          </Button>,
          <div key={`actions-${u.id}`} className={styles.adminListActionsWrap}>
            <div className={styles.adminListActions}>
              {can(ADMIN_PERMISSIONS.USERS_SET_ROLE) && !isCurrentUser(u.email) && (
                <Button
                  size="slim"
                  variant="plain"
                  onClick={() => {
                    setRoleModalUser({ identifier: u.email, email: u.email });
                    setRoleModalValue(u.role || '');
                    setRoleModalOpen(true);
                  }}
                >
                  Set role
                </Button>
              )}
              {u.status === 'pending' && (
                <>
                  <Button
                    size="slim"
                    variant="primary"
                    icon={CheckCircleIcon}
                    onClick={() => acceptMutation.mutate(u.id)}
                    loading={acceptMutation.isPending && acceptMutation.variables === u.id}
                  >
                    Accept
                  </Button>
                  <Button
                    size="slim"
                    tone="critical"
                    icon={XCircleIcon}
                    onClick={() => rejectMutation.mutate(u.id)}
                    loading={rejectMutation.isPending && rejectMutation.variables === u.id}
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>,
        ])
      : users.map(u => [
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
          <Button
            key={`view-${u.shopDomain}`}
            size="slim"
            variant="plain"
            icon={ViewIcon}
            onClick={() => setDetailUser(u.shopDomain)}
            accessibilityLabel="View domains"
          >
            View {(u.domainCount ?? 0) > 0 ? `(${u.domainCount})` : ''}
          </Button>,
          <div key={`actions-${u.shopDomain}`} className={styles.adminListActionsWrap}>
            <div className={styles.adminListActions}>
              <Button
                size="slim"
                variant="plain"
                icon={ViewIcon}
                onClick={() => setDetailUser(u.shopDomain)}
                accessibilityLabel="View user details"
              >
                Details
              </Button>
              {can(ADMIN_PERMISSIONS.USERS_SET_ROLE) && !isCurrentUser(u.shopDomain) && (
                <Button
                  size="slim"
                  variant="plain"
                  onClick={() => {
                    setRoleModalUser(u);
                    setRoleModalValue(u.role || '');
                    setRoleModalOpen(true);
                  }}
                >
                  Set role
                </Button>
              )}
              {can(ADMIN_PERMISSIONS.USERS_LOCK) &&
                (u.status === 'locked' ? (
                  <Button
                    size="slim"
                    icon={LockIcon}
                    onClick={() =>
                      lockMutation.mutate({ shopDomain: u.shopDomain, action: 'unlock' })
                    }
                  >
                    Unlock
                  </Button>
                ) : (
                  <Button
                    size="slim"
                    tone="critical"
                    icon={LockIcon}
                    variant="plain"
                    onClick={() =>
                      lockMutation.mutate({ shopDomain: u.shopDomain, action: 'lock' })
                    }
                  >
                    Lock
                  </Button>
                ))}
            </div>
          </div>,
        ]);

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(0);
  };

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => {
            refetch();
            refetchPending();
            refetchStandalone();
          },
          loading: isFetchingList,
        }}
        secondaryActions={
          can(ADMIN_PERMISSIONS.USERS_EXPORT)
            ? [{ content: 'Export CSV', onAction: handleExportCsv }]
            : undefined
        }
      >
        <BlockStack gap="400">
          {pendingUsers.length > 0 && (
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Pending registrations
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Email sign-up requests awaiting approval. Accept to allow sign-in; reject to deny.
                </Text>
                {pendingLoading ? (
                  <LoadingSkeleton type="table" count={2} />
                ) : (
                  <div className={styles.adminTableWrap}>
                    <DataTable
                      columnContentTypes={['text', 'text', 'text', 'text']}
                      headings={['Email', 'Email verified', 'Registered', 'Actions']}
                      rows={pendingUsers.map(p => [
                        p.email || '—',
                        p.email_verified_at ? (
                          <Badge tone="success">Yes</Badge>
                        ) : (
                          <Badge tone="attention">Pending</Badge>
                        ),
                        p.created_at ? new Date(p.created_at).toLocaleString() : '—',
                        <div key={p.id} className={styles.adminListActionsWrap}>
                          <div className={styles.adminListActions}>
                            <Button
                              size="slim"
                              variant="primary"
                              icon={CheckCircleIcon}
                              onClick={() => acceptMutation.mutate(p.id)}
                              loading={
                                acceptMutation.isPending && acceptMutation.variables === p.id
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              size="slim"
                              tone="critical"
                              icon={XCircleIcon}
                              onClick={() => rejectMutation.mutate(p.id)}
                              loading={
                                rejectMutation.isPending && rejectMutation.variables === p.id
                              }
                            >
                              Reject
                            </Button>
                          </div>
                        </div>,
                      ])}
                    />
                  </div>
                )}
              </BlockStack>
            </Card>
          )}
          <Card>
            <BlockStack gap="300">
              <section className={styles.adminMainSection} aria-label="Page context">
                <Text
                  as="p"
                  variant="bodySm"
                  tone="subdued"
                  className={styles.adminPageDescription}
                >
                  {listView === 'email'
                    ? 'Email (standalone) users. Role column shows platform permission (Collaborator = view only, Admin = full user management). Use Set role to assign Collaborator or Admin; only superadmins can assign Superadmin.'
                    : 'Store (Shopify) users. Filter by status or search by domain or email. Use Set role to assign Collaborator or Admin, or Lock/Unlock from the table.'}
                </Text>
              </section>
              <div className={styles.adminListToolbar}>
                <Box minWidth="140px">
                  <Select
                    label="List"
                    options={USER_LIST_VIEW}
                    value={listView}
                    onChange={v => {
                      setListView(v);
                      setStatusFilter('');
                      setPage(0);
                    }}
                  />
                </Box>
                <Box minWidth="130px">
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={statusFilter}
                    onChange={v => {
                      setStatusFilter(v);
                      setPage(0);
                    }}
                  />
                </Box>
                <Box minWidth="90px">
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
                <Box minWidth="180px">
                  <TextField
                    label="Search"
                    value={searchInput}
                    onChange={setSearchInput}
                    placeholder={listView === 'email' ? 'Email' : 'Domain or email'}
                    autoComplete="off"
                    onBlur={applySearch}
                    clearButton
                    onClearButtonClick={() => {
                      setSearchInput('');
                      setSearch('');
                    }}
                  />
                </Box>
                <div className={styles.adminListToolbarActions}>
                  <Button variant="primary" size="slim" onClick={applySearch}>
                    Apply filters
                  </Button>
                </div>
              </div>
              {isLoadingList ? (
                <div className={styles.adminTableWrap}>
                  <LoadingSkeleton type="table" count={3} />
                </div>
              ) : users.length === 0 ? (
                <div className={styles.adminEmptyState}>
                  <EmptyState
                    heading={
                      total === 0 && !search && !statusFilter
                        ? listView === 'email'
                          ? 'No email users yet'
                          : 'No users yet'
                        : 'No users match your filters'
                    }
                    image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                  >
                    <p>
                      {total === 0 && !search && !statusFilter
                        ? listView === 'email'
                          ? 'Email users will appear here once they register. Pending users need approval above.'
                          : 'Store users appear here when someone connects a Shopify store. Use the List dropdown above to switch to "Email users" for standalone registrations.'
                        : 'Try changing the status filter or search term.'}
                    </p>
                  </EmptyState>
                </div>
              ) : (
                <>
                  <div className={styles.adminUsersTableSummary}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {total} user{total !== 1 ? 's' : ''} found
                    </Text>
                  </div>
                  <div className={styles.adminTableWrap}>
                    <DataTable
                      columnContentTypes={
                        listView === 'email'
                          ? ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']
                          : ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text']
                      }
                      headings={
                        listView === 'email'
                          ? [
                              'Email',
                              'Status',
                              'Role',
                              'Email verified',
                              'Accepted at',
                              'Created',
                              'Domains',
                              'Actions',
                            ]
                          : [
                              'Domain',
                              'Email',
                              'Name',
                              'Role',
                              'Status',
                              'Created',
                              'Domains',
                              'Actions',
                            ]
                      }
                      rows={rows}
                    />
                  </div>
                  {totalPages > 1 && (
                    <div className={styles.adminListPagination}>
                      <Button disabled={page === 0} onClick={() => setPage(p => p - 1)} size="slim">
                        Previous
                      </Button>
                      <span className={styles.adminListPaginationInfo}>
                        Page {page + 1} of {totalPages} · {total} total
                      </span>
                      <Button
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage(p => p + 1)}
                        size="slim"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </>
              )}
            </BlockStack>
          </Card>
        </BlockStack>
      </AdminPageLayout>
      {detailUser && (
        <Modal
          open
          onClose={() => {
            setDetailUser(null);
            setImpersonateResult(null);
          }}
          title="User details"
          size="large"
        >
          <div className={styles.adminUserModal} data-modal="user-detail">
            <Modal.Section>
              {detailLoading ? (
                <div className={styles.adminUserModalBody}>
                  <div className={styles.adminUserModalState}>
                    <Text as="p" tone="subdued" variant="bodyMd">
                      Loading user…
                    </Text>
                  </div>
                </div>
              ) : userDetail ? (
                <UserDetailModalContent
                  userDetail={userDetail}
                  detailUser={detailUser}
                  setToast={setToast}
                  setImpersonateResult={setImpersonateResult}
                  setImpersonateLoading={setImpersonateLoading}
                  impersonateResult={impersonateResult}
                  impersonateLoading={impersonateLoading}
                  canExportUser={can(ADMIN_PERMISSIONS.USERS_EXPORT)}
                  canImpersonate={can(ADMIN_PERMISSIONS.IMPERSONATE)}
                  canSetRole={can(ADMIN_PERMISSIONS.USERS_SET_ROLE) && !isCurrentUser(detailUser)}
                  onSaveRole={role =>
                    roleMutation.mutate({ shopDomain: detailUser, role: role || null })
                  }
                  roleSaving={roleMutation.isPending}
                  roleOptions={roleOptionsForSetRole}
                  styles={styles}
                />
              ) : (
                <div className={styles.adminUserModalBody}>
                  <div className={styles.adminUserModalState}>
                    <Text as="p" tone="subdued" variant="bodyMd">
                      Could not load user.
                    </Text>
                  </div>
                </div>
              )}
            </Modal.Section>
          </div>
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
            <BlockStack gap="400">
              <div className={styles.adminModalRoleUserCard}>
                {roleModalUser.identifier ?? roleModalUser.shopDomain ?? roleModalUser.email}
              </div>
              <Select
                label="Role"
                options={roleOptionsForSetRole}
                value={roleModalValue}
                onChange={setRoleModalValue}
              />
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={() =>
                    roleMutation.mutate({
                      shopDomain:
                        roleModalUser.identifier ?? roleModalUser.shopDomain ?? roleModalUser.email,
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
