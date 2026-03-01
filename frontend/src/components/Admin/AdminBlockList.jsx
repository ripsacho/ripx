/**
 * AdminBlockList
 *
 * Block list: domains that get 403 on script/track. Uses key_value_store keys block_list.<domain>.
 * Phase 3.
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
import { apiGet, apiPut, apiDelete } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const BLOCK_PREFIX = 'block_list.';

export default function AdminBlockList() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'kv', BLOCK_PREFIX],
    queryFn: async () => {
      const res = await apiGet('/admin/kv', { prefix: BLOCK_PREFIX });
      return res.data?.data ?? res.data;
    },
  });

  const putMutation = useMutation({
    mutationFn: async ({ domain, message }) => {
      const key = BLOCK_PREFIX + domain.trim().toLowerCase();
      await apiPut(`/admin/kv/${encodeURIComponent(key)}`, { value: message || '' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kv'] });
      setToast({ message: 'Domain added to block list', type: 'success' });
      setAddOpen(false);
      setNewDomain('');
      setNewMessage('');
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Failed to add',
        type: 'error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async key => {
      await apiDelete(`/admin/kv/${encodeURIComponent(key)}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kv'] });
      setToast({ message: 'Domain removed from block list', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Delete failed',
        type: 'error',
      });
    },
  });

  const keys = data?.keys ?? [];
  const rows = keys.map(k => {
    const domain = k.key.startsWith(BLOCK_PREFIX) ? k.key.slice(BLOCK_PREFIX.length) : k.key;
    return [
      domain,
      k.valuePreview ?? '—',
      <Button
        key={k.key}
        size="slim"
        tone="critical"
        onClick={() => deleteMutation.mutate(k.key)}
        loading={deleteMutation.isPending}
      >
        Remove
      </Button>,
    ];
  });

  const handleAdd = () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) {
      setToast({ message: 'Enter a domain', type: 'error' });
      return;
    }
    putMutation.mutate({ domain, message: newMessage.trim() });
  };

  return (
    <PageShell className={`${styles.adminPage} ${styles.adminPageWithHero}`}>
      <AdminPageLayout
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => refetch(),
          loading: isFetching,
        }}
        secondaryActions={[{ content: 'Add domain', onAction: () => setAddOpen(true) }]}
      >
        <Card>
          <BlockStack gap="300">
            <section className={styles.adminMainSection} aria-label="Block list">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Add a domain (e.g. store.myshopify.com) to block all track/script requests from that
                domain. Optional message is returned in the 403 response. Changes are audited.
              </Text>
            </section>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : keys.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No blocked domains"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Add a domain to block track and script requests from that domain.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text']}
                  headings={['Domain', 'Message', 'Actions']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>

      {addOpen && (
        <Modal
          open
          onClose={() => {
            setAddOpen(false);
            setNewDomain('');
            setNewMessage('');
          }}
          title="Add domain to block list"
          primaryAction={{
            content: 'Add',
            onAction: handleAdd,
            loading: putMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setAddOpen(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <TextField
                label="Domain"
                value={newDomain}
                onChange={setNewDomain}
                placeholder="e.g. store.myshopify.com"
                autoComplete="off"
              />
              <TextField
                label="Message (optional)"
                value={newMessage}
                onChange={setNewMessage}
                placeholder="Shown in 403 response"
                autoComplete="off"
              />
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
