/**
 * AdminSupportTickets
 *
 * List support tickets for admin triage; sortable columns; filter by status; update status; bulk close/resolve.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  DataTable,
  Button,
  Text,
  BlockStack,
  Select,
  EmptyState,
  Checkbox,
  InlineStack,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiPatch, apiPost } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
  { label: 'Resolved', value: 'resolved' },
];

const BULK_ACTIONS = [
  { label: 'Close selected', value: 'close' },
  { label: 'Resolve selected', value: 'resolve' },
];

export default function AdminSupportTickets() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('');
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'support-tickets', statusFilter],
    queryFn: async () => {
      const params = { limit: 100, sort: 'created_at', order: 'desc' };
      if (statusFilter) params.status = statusFilter;
      const res = await apiGet('/admin/support-tickets', params);
      const payload = res.data?.data ?? res.data;
      return payload;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }) => apiPatch(`/admin/support-tickets/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      setToast({ message: 'Status updated', type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Update failed',
        type: 'error',
      });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ ticketIds, action }) =>
      apiPost('/admin/support-tickets/bulk', { ticketIds, action }),
    onSuccess: (_, { ticketIds }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'support-tickets'] });
      setSelectedIds([]);
      setBulkAction('');
      setToast({ message: `Updated ${ticketIds.length} ticket(s)`, type: 'success' });
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Bulk update failed',
        type: 'error',
      });
    },
  });

  const tickets = data?.tickets ?? [];
  const total = data?.total ?? 0;

  const handleBulkApply = () => {
    if (!bulkAction || selectedIds.length === 0) return;
    bulkMutation.mutate({ ticketIds: selectedIds, action: bulkAction });
  };

  const toggleSelectAll = checked => {
    setSelectedIds(checked ? tickets.map(t => t.id) : []);
  };
  const toggleSelect = (id, checked) => {
    setSelectedIds(prev => (checked ? [...prev, id] : prev.filter(i => i !== id)));
  };

  const rows = tickets.map(t => [
    <Checkbox
      key={`cb-${t.id}`}
      label=""
      labelHidden
      checked={selectedIds.includes(t.id)}
      onChange={checked => toggleSelect(t.id, checked)}
    />,
    String(t.id).slice(0, 8),
    t.email ?? '—',
    (t.subject || '—').slice(0, 50) + ((t.subject || '').length > 50 ? '…' : ''),
    t.category ?? '—',
    t.status ?? '—',
    t.shop_domain ?? '—',
    t.created_at ? new Date(t.created_at).toLocaleString() : '—',
    <InlineStack key={`act-${t.id}`} gap="100" wrap={false}>
      {t.status !== 'open' && (
        <Button
          size="slim"
          variant="plain"
          onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'open' })}
          disabled={updateStatusMutation.isPending}
        >
          Open
        </Button>
      )}
      {t.status !== 'closed' && (
        <Button
          size="slim"
          variant="plain"
          onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'closed' })}
          disabled={updateStatusMutation.isPending}
        >
          Close
        </Button>
      )}
      {t.status !== 'resolved' && (
        <Button
          size="slim"
          variant="plain"
          onClick={() => updateStatusMutation.mutate({ id: t.id, status: 'resolved' })}
          disabled={updateStatusMutation.isPending}
        >
          Resolve
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
            <InlineStack gap="300" blockAlign="center" wrap>
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={statusFilter}
                onChange={setStatusFilter}
              />
              {selectedIds.length > 0 && (
                <>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {selectedIds.length} selected
                  </Text>
                  <Select
                    label="Bulk action"
                    options={BULK_ACTIONS}
                    value={bulkAction}
                    onChange={setBulkAction}
                  />
                  <Button
                    size="slim"
                    variant="primary"
                    onClick={handleBulkApply}
                    loading={bulkMutation.isPending}
                  >
                    Apply
                  </Button>
                  <Button size="slim" variant="plain" onClick={() => setSelectedIds([])}>
                    Clear
                  </Button>
                </>
              )}
            </InlineStack>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : tickets.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No support tickets"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Tickets from the Support page (Contact us) will appear here for triage.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                    'text',
                  ]}
                  headings={[
                    <Checkbox
                      key="all"
                      label=""
                      labelHidden
                      checked={selectedIds.length === tickets.length && tickets.length > 0}
                      onChange={toggleSelectAll}
                    />,
                    'ID',
                    'Email',
                    'Subject',
                    'Category',
                    'Status',
                    'Shop',
                    'Created',
                    'Actions',
                  ]}
                  rows={rows}
                />
              </div>
            )}
            {total > 0 && (
              <Text as="p" variant="bodySm" tone="subdued">
                Showing {tickets.length} of {total} ticket(s).
              </Text>
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
