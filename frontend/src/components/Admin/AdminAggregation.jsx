/**
 * AdminAggregation
 *
 * View last run of daily analytics aggregation; trigger run now.
 */

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Text, BlockStack } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPost } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminAggregation() {
  const queryClient = useQueryClient();
  const [toast, setToast] = React.useState({ message: null, type: 'success' });
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'aggregation'],
    queryFn: async () => {
      const res = await apiGet('/admin/aggregation');
      return res.data?.data ?? res.data;
    },
  });
  const triggerMutation = useMutation({
    mutationFn: () => apiPost('/admin/aggregation/trigger', {}),
    onSuccess: res => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'aggregation'] });
      const lastRun = res?.data?.lastRun ?? res?.data?.data?.lastRun;
      setToast({
        message: lastRun
          ? `Triggered. Last run: ${new Date(lastRun).toLocaleString()}`
          : 'Triggered',
        type: 'success',
      });
      refetch();
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Trigger failed',
        type: 'error',
      });
    },
  });
  const lastRun = data?.lastRun ?? null;
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
          <BlockStack gap="400">
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : (
              <>
                <Text as="p">
                  <strong>Last run:</strong>{' '}
                  {lastRun ? new Date(lastRun).toLocaleString() : 'Never'}
                </Text>
                <Button
                  variant="primary"
                  onClick={() => triggerMutation.mutate()}
                  loading={triggerMutation.isPending}
                >
                  Trigger aggregation now (yesterday)
                </Button>
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
          duration={toast.type === 'error' ? 5000 : 4000}
        />
      )}
    </PageShell>
  );
}
