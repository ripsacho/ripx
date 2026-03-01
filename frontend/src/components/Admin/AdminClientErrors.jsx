/**
 * AdminClientErrors
 *
 * List storefront client errors (from POST /api/track/client-error). Dismiss/ack. Phase 4 §2.16.
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
  InlineStack,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, apiDelete, unwrapData } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import AdminPageLayout from './AdminPageLayout';
import styles from './Admin.module.css';

export default function AdminClientErrors() {
  const queryClient = useQueryClient();
  const [shopDomain, setShopDomain] = useState('');
  const [detail, setDetail] = useState(null);
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'client-errors', shopDomain],
    queryFn: async () => {
      const params = { limit: 100 };
      if (shopDomain.trim()) params.shop_domain = shopDomain.trim();
      const res = await apiGet('/admin/client-errors', params);
      return unwrapData(res);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: id => apiDelete(`/admin/client-errors/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'client-errors'] });
      setToast({ message: 'Error dismissed', type: 'success' });
      setDetail(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Dismiss failed',
        type: 'error',
      });
    },
  });

  const errors = data?.clientErrors ?? [];
  const rows = errors.map(e => [
    e.shopDomain ?? '—',
    (e.errorMessage ?? '').slice(0, 80) + ((e.errorMessage?.length ?? 0) > 80 ? '…' : ''),
    (e.url ?? '—').slice(0, 40) + ((e.url?.length ?? 0) > 40 ? '…' : ''),
    e.createdAt ? new Date(e.createdAt).toLocaleString() : '—',
    <InlineStack key={e.id} gap="200">
      <Button size="slim" onClick={() => setDetail(e)}>
        View
      </Button>
      <Button
        size="slim"
        tone="critical"
        onClick={() => deleteMutation.mutate(e.id)}
        loading={deleteMutation.isPending && deleteMutation.variables === e.id}
      >
        Dismiss
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
            ) : errors.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No client errors"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Errors reported from the storefront script will appear here.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                  headings={['Shop', 'Error', 'URL', 'Date', 'Actions']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </AdminPageLayout>
      {detail && (
        <Modal open onClose={() => setDetail(null)} title="Client error details" size="large">
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p">
                <strong>Shop:</strong> {detail.shopDomain}
              </Text>
              <Text as="p">
                <strong>Time:</strong>{' '}
                {detail.createdAt ? new Date(detail.createdAt).toLocaleString() : '—'}
              </Text>
              <Text as="p">
                <strong>Message:</strong> {detail.errorMessage}
              </Text>
              {detail.url && (
                <Text as="p">
                  <strong>URL:</strong> {detail.url}
                </Text>
              )}
              {detail.stack && (
                <>
                  <Text as="p" fontWeight="semibold">
                    Stack
                  </Text>
                  <pre
                    style={{
                      fontSize: '12px',
                      overflow: 'auto',
                      maxHeight: '200px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {detail.stack}
                  </pre>
                </>
              )}
              {detail.componentStack && (
                <>
                  <Text as="p" fontWeight="semibold">
                    Component stack
                  </Text>
                  <pre
                    style={{
                      fontSize: '12px',
                      overflow: 'auto',
                      maxHeight: '120px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {detail.componentStack}
                  </pre>
                </>
              )}
              {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                <>
                  <Text as="p" fontWeight="semibold">
                    Metadata
                  </Text>
                  <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '100px' }}>
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </>
              )}
              <Button
                tone="critical"
                onClick={() => deleteMutation.mutate(detail.id)}
                loading={deleteMutation.isPending}
              >
                Dismiss
              </Button>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
      {toast.message && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: null, type: 'success' })}
        />
      )}
    </PageShell>
  );
}
