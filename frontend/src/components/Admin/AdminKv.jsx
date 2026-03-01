/**
 * AdminKv
 *
 * Key-value store: list keys (optional prefix), view/edit value, delete. Phase 2.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  Button,
  InlineStack,
  Text,
  BlockStack,
  TextField,
  Modal,
  EmptyState,
  Box,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPut, apiDelete } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminKv() {
  const queryClient = useQueryClient();
  const [prefix, setPrefix] = useState('');
  const [prefixInput, setPrefixInput] = useState('');
  const [editKey, setEditKey] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [deleteKey, setDeleteKey] = useState(null);
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'kv', prefix],
    queryFn: async () => {
      const params = prefix ? { prefix } : {};
      const res = await apiGet('/admin/kv', params);
      return res.data?.data ?? res.data;
    },
  });

  const putMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      await apiPut(`/admin/kv/${encodeURIComponent(key)}`, { value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'kv'] });
      setToast({ message: 'Key saved', type: 'success' });
      setEditKey(null);
      setEditValue('');
      setNewKeyName('');
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Save failed',
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
      setToast({ message: 'Key deleted', type: 'success' });
      setDeleteKey(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Delete failed',
        type: 'error',
      });
    },
  });

  const keys = data?.keys ?? [];
  const total = data?.total ?? 0;

  const openEdit = () => {
    setEditKey('');
    setEditValue('');
    setNewKeyName('');
  };

  const rows = keys.map(k => [
    k.key,
    k.valuePreview ?? '—',
    k.updatedAt ? new Date(k.updatedAt).toLocaleString() : '—',
    <InlineStack key={k.key} gap="200" wrap>
      <Button
        size="slim"
        variant="plain"
        onClick={async () => {
          const res = await apiGet(`/admin/kv/${encodeURIComponent(k.key)}`);
          const d = res.data?.data ?? res.data;
          setEditKey(k.key);
          setEditValue(d?.value ?? '');
          setNewKeyName('');
        }}
      >
        View / Edit
      </Button>
      <Button size="slim" tone="critical" onClick={() => setDeleteKey(k.key)}>
        Delete
      </Button>
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
        secondaryActions={[{ content: 'Add key', onAction: openEdit }]}
      >
        <Card>
          <BlockStack gap="300">
            <section className={styles.adminMainSection} aria-label="Key-value store">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Filter by prefix (e.g. flag. or config.) or leave empty for all keys. Changes are
                audited.
              </Text>
            </section>
            <InlineStack gap="300" blockAlign="center">
              <Box minWidth="200px">
                <TextField
                  label="Prefix filter"
                  value={prefixInput}
                  onChange={setPrefixInput}
                  placeholder="e.g. flag. or config."
                  autoComplete="off"
                />
              </Box>
              <Box paddingBlockStart="400">
                <Button onClick={() => setPrefix(prefixInput.trim())}>Apply</Button>
              </Box>
            </InlineStack>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : keys.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading={total === 0 && !prefix ? 'No keys yet' : 'No keys match the prefix'}
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {total === 0 && !prefix
                      ? 'Add a key (e.g. config.maintenance_mode or flag.heatmaps) to get started.'
                      : 'Try a different prefix or clear the filter.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                  {total} key{total !== 1 ? 's' : ''}
                </Text>
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text']}
                    headings={['Key', 'Value (preview)', 'Updated', 'Actions']}
                    rows={rows}
                  />
                </div>
              </>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>

      {editKey !== null && (
        <Modal
          open
          onClose={() => {
            setEditKey(null);
            setEditValue('');
            setNewKeyName('');
          }}
          title={editKey ? `Edit: ${editKey}` : 'Add key'}
          primaryAction={{
            content: 'Save',
            onAction: () => {
              const keyToSave = editKey || newKeyName.trim();
              if (!keyToSave) {
                setToast({ message: 'Enter a key name', type: 'error' });
                return;
              }
              putMutation.mutate({ key: keyToSave, value: editValue });
            },
            loading: putMutation.isPending,
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => {
                setEditKey(null);
                setEditValue('');
                setNewKeyName('');
              },
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              {editKey === '' && (
                <TextField
                  label="Key"
                  value={newKeyName}
                  onChange={setNewKeyName}
                  placeholder="e.g. config.maintenance_mode"
                  autoComplete="off"
                />
              )}
              <TextField
                label="Value"
                value={editValue}
                onChange={setEditValue}
                multiline={4}
                autoComplete="off"
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {deleteKey && (
        <Modal
          open
          onClose={() => setDeleteKey(null)}
          title="Delete key?"
          primaryAction={{
            content: 'Delete',
            destructive: true,
            onAction: () => deleteMutation.mutate(deleteKey),
            loading: deleteMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setDeleteKey(null) }]}
        >
          <Modal.Section>
            <Text as="p">
              Permanently delete key <strong>{deleteKey}</strong>? This cannot be undone.
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
