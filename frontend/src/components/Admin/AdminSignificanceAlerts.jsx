/**
 * AdminSignificanceAlerts
 *
 * List significance alerts; reset (delete) so notification can re-trigger.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
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
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminSignificanceAlerts() {
  const queryClient = useQueryClient();
  const [shopDomain, setShopDomain] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'significance-alerts', shopDomain],
    queryFn: async () => {
      const params = { limit: 100 };
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/significance-alerts', params);
      return res.data?.data ?? res.data;
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async ({ testId, shopDomain: domain }) => {
      await apiDelete('/admin/significance-alerts', {
        params: { test_id: testId, shop_domain: domain },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'significance-alerts'] });
      setToast({ message: 'Alert reset', type: 'success' });
      setResetTarget(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Reset failed',
        type: 'error',
      });
      setResetTarget(null);
    },
  });
  const alerts = data?.alerts ?? [];
  const rows = alerts.map(a => [
    a.shopDomain ?? '—',
    a.testId ? `${a.testId.slice(0, 8)}…` : '—',
    a.winnerVariantName ?? '—',
    a.lift !== null && a.lift !== undefined ? `${Number(a.lift)}%` : '—',
    a.pValue !== null && a.pValue !== undefined ? String(a.pValue) : '—',
    a.alertedAt ? new Date(a.alertedAt).toLocaleString() : '—',
    <Button
      key={`${a.testId}-${a.shopDomain}`}
      size="slim"
      tone="critical"
      onClick={() => setResetTarget({ testId: a.testId, shopDomain: a.shopDomain })}
      loading={resetTarget?.testId === a.testId && deleteMutation.isPending}
    >
      Reset
    </Button>,
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
            ) : alerts.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No significance alerts"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Alerts are created when tests reach statistical significance.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Shop', 'Test', 'Winner', 'Lift', 'p-value', 'Alerted', 'Actions']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>
      {resetTarget && (
        <Modal
          open
          onClose={() => setResetTarget(null)}
          title="Reset alert?"
          primaryAction={{
            content: 'Reset',
            destructive: true,
            onAction: () => deleteMutation.mutate(resetTarget),
            loading: deleteMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setResetTarget(null) }]}
        >
          <Modal.Section>
            <Text as="p">
              This removes the alert so the significance notification can be sent again for this
              test.
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
