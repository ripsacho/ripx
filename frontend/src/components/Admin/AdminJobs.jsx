/**
 * AdminJobs
 *
 * Bull queue counts; Retry failed and Trigger (archive) actions. Phase 2.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, DataTable, BlockStack, Text, Badge, Button, InlineStack } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPost } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminJobs() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [actionQueue, setActionQueue] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: async () => {
      const res = await apiGet('/admin/jobs');
      return res.data?.data ?? res.data;
    },
    refetchInterval: 30 * 1000,
  });

  const retryMutation = useMutation({
    mutationFn: async queueName => {
      await apiPost(`/admin/jobs/${encodeURIComponent(queueName)}/retry-failed`, { limit: 50 });
    },
    onSuccess: (_, queueName) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      setToast({ message: `Retried failed jobs for ${queueName}`, type: 'success' });
      setActionQueue(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Retry failed',
        type: 'error',
      });
      setActionQueue(null);
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async queueName => {
      await apiPost(`/admin/jobs/${encodeURIComponent(queueName)}/trigger`, {});
    },
    onSuccess: (_, queueName) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
      setToast({ message: `Triggered ${queueName}`, type: 'success' });
      setActionQueue(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Trigger failed',
        type: 'error',
      });
      setActionQueue(null);
    },
  });

  const jobs = data?.jobs ?? [];

  const rows = jobs.map(j => [
    j.name,
    j.status === 'ok' ? (
      <Badge tone="success">OK</Badge>
    ) : j.status === 'error' ? (
      <Badge tone="critical">Error</Badge>
    ) : (
      <Badge tone="attention">Unavailable</Badge>
    ),
    j.waiting ?? 0,
    j.active ?? 0,
    j.completed ?? 0,
    j.failed ?? 0,
    j.error ? String(j.error).slice(0, 60) : '—',
    <InlineStack key={j.name} gap="200">
      {j.status === 'ok' && (j.failed ?? 0) > 0 && (
        <Button
          size="slim"
          onClick={() => {
            setActionQueue(j.name);
            retryMutation.mutate(j.name);
          }}
          loading={actionQueue === j.name && retryMutation.isPending}
        >
          Retry failed
        </Button>
      )}
      {j.status === 'ok' && j.name === 'archive-old-tests' && (
        <Button
          size="slim"
          tone="secondary"
          onClick={() => {
            setActionQueue(j.name);
            triggerMutation.mutate(j.name);
          }}
          loading={actionQueue === j.name && triggerMutation.isPending}
        >
          Trigger now
        </Button>
      )}
    </InlineStack>,
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
            <section className={styles.adminMainSection} aria-label="Jobs overview">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Waiting = pending; Active = in progress. Use Retry failed to re-queue failed jobs;
                Trigger now for archive-old-tests runs the archive job once.
              </Text>
            </section>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'numeric',
                    'numeric',
                    'numeric',
                    'numeric',
                    'text',
                    'text',
                  ]}
                  headings={[
                    'Queue',
                    'Status',
                    'Waiting',
                    'Active',
                    'Completed',
                    'Failed',
                    'Error',
                    'Actions',
                  ]}
                  rows={rows}
                />
              </div>
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
