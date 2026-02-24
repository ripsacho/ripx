/**
 * AdminShopSessions
 *
 * List Shopify shop sessions; revoke to force re-auth.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Page,
  Card,
  DataTable,
  Button,
  Text,
  BlockStack,
  TextField,
  Modal,
  EmptyState,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiDelete } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import styles from './Admin.module.css';

export default function AdminShopSessions() {
  const queryClient = useQueryClient();
  const [shopDomain, setShopDomain] = useState('');
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'shop-sessions', shopDomain],
    queryFn: async () => {
      const params = {};
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/shop-sessions', params);
      return res.data?.data ?? res.data;
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async domain => {
      await apiDelete(`/admin/shop-sessions/${encodeURIComponent(domain)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'shop-sessions'] });
      setToast({ message: 'Session revoked', type: 'success' });
      setRevokeTarget(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Revoke failed',
        type: 'error',
      });
      setRevokeTarget(null);
    },
  });
  const sessions = data?.sessions ?? [];
  const rows = sessions.map(s => [
    s.shopDomain ?? '—',
    s.scope ?? '—',
    s.installedAt ? new Date(s.installedAt).toLocaleString() : '—',
    s.updatedAt ? new Date(s.updatedAt).toLocaleString() : '—',
    <Button
      key={s.shopDomain}
      size="slim"
      tone="critical"
      onClick={() => setRevokeTarget(s.shopDomain)}
      loading={revokeTarget === s.shopDomain && deleteMutation.isPending}
    >
      Revoke
    </Button>,
  ]);
  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Shop sessions"
        subtitle="Shopify OAuth sessions. Revoke forces re-auth on next request."
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
            ) : sessions.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No shop sessions"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Sessions appear when shops complete Shopify OAuth.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Shop', 'Scope', 'Installed', 'Updated', 'Actions']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </Page>
      {revokeTarget && (
        <Modal
          open
          onClose={() => setRevokeTarget(null)}
          title="Revoke session?"
          primaryAction={{
            content: 'Revoke',
            destructive: true,
            onAction: () => deleteMutation.mutate(revokeTarget),
            loading: deleteMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setRevokeTarget(null) }]}
        >
          <Modal.Section>
            <Text as="p">
              Revoking {revokeTarget} will require the shop to re-authenticate on next use.
            </Text>
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
