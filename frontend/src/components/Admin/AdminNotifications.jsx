/**
 * AdminNotifications
 *
 * List system-wide and per-shop notifications; create announcement; delete.
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
  Select,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPost, apiDelete } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import styles from './Admin.module.css';

const SCOPE_OPTIONS = [
  { label: 'All (system-wide)', value: 'all' },
  { label: 'Shop', value: 'shop' },
];

export default function AdminNotifications() {
  const queryClient = useQueryClient();
  const [scopeFilter, setScopeFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [newScope, setNewScope] = useState('all');
  const [newShopDomain, setNewShopDomain] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'notifications', scopeFilter],
    queryFn: async () => {
      const params = { limit: 100 };
      if (scopeFilter) params.scope = scopeFilter;
      const res = await apiGet('/admin/notifications', params);
      return res.data?.data ?? res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiPost('/admin/notifications', {
        title: newTitle.trim(),
        message: newMessage.trim(),
        scope: newScope,
        shop_domain: newScope === 'shop' ? newShopDomain.trim() : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
      setToast({ message: 'Notification created', type: 'success' });
      setCreateOpen(false);
      setNewTitle('');
      setNewMessage('');
      setNewScope('all');
      setNewShopDomain('');
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Create failed',
        type: 'error',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: id => apiDelete(`/admin/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'notifications'] });
      setToast({ message: 'Notification deleted', type: 'success' });
      setDeleteId(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Delete failed',
        type: 'error',
      });
      setDeleteId(null);
    },
  });

  const notifications = data?.notifications ?? [];
  const rows = notifications.map(n => [
    n.shopDomain ?? '—',
    n.scope ?? 'shop',
    n.title ?? '—',
    (n.message || '').slice(0, 40) + ((n.message || '').length > 40 ? '…' : ''),
    n.read ? 'Yes' : 'No',
    n.createdAt ? new Date(n.createdAt).toLocaleString() : '—',
    <Button
      key={n.id}
      size="slim"
      tone="critical"
      onClick={() => setDeleteId(n.id)}
      loading={deleteId === n.id && deleteMutation.isPending}
    >
      Delete
    </Button>,
  ]);

  const handleCreate = () => {
    if (!newTitle.trim()) {
      setToast({ message: 'Title is required', type: 'error' });
      return;
    }
    if (newScope === 'shop' && !newShopDomain.trim()) {
      setToast({ message: 'Shop domain required for scope Shop', type: 'error' });
      return;
    }
    createMutation.mutate();
  };

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Notifications"
        subtitle="System-wide and per-shop notifications. Create announcement (all users) or per domain."
        backAction={{ content: 'Admin', url: '/admin' }}
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => refetch(),
          loading: isFetching,
        }}
        secondaryActions={[{ content: 'Create announcement', onAction: () => setCreateOpen(true) }]}
      >
        <Card>
          <BlockStack gap="300">
            <Select
              label="Scope filter"
              options={[{ label: 'All', value: '' }, ...SCOPE_OPTIONS]}
              value={scopeFilter}
              onChange={setScopeFilter}
            />
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : notifications.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No notifications"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    Create a system-wide announcement or list will show when notifications exist.
                  </p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                  headings={['Shop', 'Scope', 'Title', 'Message', 'Read', 'Created', 'Actions']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </Page>

      {createOpen && (
        <Modal
          open
          onClose={() => setCreateOpen(false)}
          title="Create notification"
          primaryAction={{
            content: 'Create',
            onAction: handleCreate,
            loading: createMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setCreateOpen(false) }]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <TextField
                label="Title"
                value={newTitle}
                onChange={setNewTitle}
                placeholder="Announcement title"
                autoComplete="off"
              />
              <TextField
                label="Message"
                value={newMessage}
                onChange={setNewMessage}
                placeholder="Optional message"
                multiline={2}
                autoComplete="off"
              />
              <Select
                label="Scope"
                options={SCOPE_OPTIONS}
                value={newScope}
                onChange={setNewScope}
              />
              {newScope === 'shop' && (
                <TextField
                  label="Shop domain"
                  value={newShopDomain}
                  onChange={setNewShopDomain}
                  placeholder="e.g. store.myshopify.com"
                  autoComplete="off"
                />
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {deleteId && (
        <Modal
          open
          onClose={() => setDeleteId(null)}
          title="Delete notification?"
          primaryAction={{
            content: 'Delete',
            destructive: true,
            onAction: () => deleteMutation.mutate(deleteId),
            loading: deleteMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setDeleteId(null) }]}
        >
          <Modal.Section>
            <Text as="p">
              This notification will be removed. Users who already saw it may have cached it.
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
