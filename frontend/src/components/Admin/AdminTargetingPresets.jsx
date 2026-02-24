/**
 * AdminTargetingPresets
 *
 * List targeting presets (all shops or filter by shop). View JSON, delete with audit.
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
  InlineStack,
  TextField,
  Modal,
  EmptyState,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiDelete } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import styles from './Admin.module.css';

export default function AdminTargetingPresets() {
  const queryClient = useQueryClient();
  const [shopDomain, setShopDomain] = useState('');
  const [viewPreset, setViewPreset] = useState(null);
  const [deletePreset, setDeletePreset] = useState(null);
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'targeting-presets', shopDomain],
    queryFn: async () => {
      const params = {};
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/targeting-presets', params);
      return res.data?.data ?? res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async id => {
      await apiDelete(`/admin/targeting-presets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'targeting-presets'] });
      setToast({ message: 'Preset deleted', type: 'success' });
      setDeletePreset(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Delete failed',
        type: 'error',
      });
    },
  });

  const presets = data?.presets ?? [];
  const rows = presets.map(p => [
    p.shopDomain ?? '—',
    p.name ?? '—',
    p.createdAt ? new Date(p.createdAt).toLocaleString() : '—',
    <InlineStack key={p.id} gap="200">
      <Button size="slim" onClick={() => setViewPreset(p)}>
        View JSON
      </Button>
      <Button
        size="slim"
        tone="critical"
        onClick={() => setDeletePreset(p)}
        loading={deleteMutation.isPending && deletePreset?.id === p.id}
      >
        Delete
      </Button>
    </InlineStack>,
  ]);

  const jsonPreview = viewPreset
    ? JSON.stringify(
        {
          segments: viewPreset.segments,
          goal: viewPreset.goal,
          variants: viewPreset.variants,
        },
        null,
        2
      )
    : '';

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Targeting presets"
        subtitle="Saved segment/config presets per shop. Delete is audited."
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
            <section className={styles.adminMainSection} aria-label="Filters">
              <TextField
                label="Shop domain"
                value={shopDomain}
                onChange={setShopDomain}
                placeholder="Filter by shop (optional)"
                autoComplete="off"
              />
            </section>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : presets.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No targeting presets"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Presets are created from the app when users save targeting configurations.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text']}
                  headings={['Shop', 'Name', 'Created', 'Actions']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </Page>

      {viewPreset && (
        <Modal
          open
          onClose={() => setViewPreset(null)}
          title={`Preset: ${viewPreset.name}`}
          size="large"
        >
          <Modal.Section>
            <pre
              style={{
                margin: 0,
                padding: 'var(--p-space-300)',
                background: 'var(--p-color-bg-surface-secondary)',
                borderRadius: 'var(--p-border-radius-200)',
                overflow: 'auto',
                maxHeight: '60vh',
                fontSize: '12px',
              }}
            >
              {jsonPreview}
            </pre>
          </Modal.Section>
        </Modal>
      )}

      {deletePreset && (
        <Modal
          open
          onClose={() => setDeletePreset(null)}
          title="Delete preset?"
          primaryAction={{
            content: 'Delete',
            destructive: true,
            onAction: () => deleteMutation.mutate(deletePreset.id),
            loading: deleteMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setDeletePreset(null) }]}
        >
          <Modal.Section>
            <Text as="p">
              Delete &quot;{deletePreset.name}&quot; for {deletePreset.shopDomain}? This action is
              logged in the audit log.
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
