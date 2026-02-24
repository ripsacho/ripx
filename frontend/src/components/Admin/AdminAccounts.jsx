/**
 * AdminAccounts
 *
 * List multi-store accounts; view account detail (domains).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Page,
  Card,
  DataTable,
  Button,
  Text,
  BlockStack,
  Modal,
  EmptyState,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { PageShell } from '../Shared';
import styles from './Admin.module.css';

export default function AdminAccounts() {
  const [detailId, setDetailId] = useState(null);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'accounts'],
    queryFn: async () => {
      const res = await apiGet('/admin/accounts', { limit: 100, offset: 0 });
      return res.data?.data ?? res.data;
    },
  });
  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'accounts', detailId],
    queryFn: async () => {
      const res = await apiGet(`/admin/accounts/${detailId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!detailId,
  });
  const accounts = data?.accounts ?? [];
  const rows = accounts.map(a => [
    a.name ?? '—',
    a.apiKeyPrefix ?? '—',
    a.domainCount ?? 0,
    a.createdAt ? new Date(a.createdAt).toLocaleString() : '—',
    <Button key={a.id} size="slim" onClick={() => setDetailId(a.id)}>
      View
    </Button>,
  ]);
  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Accounts"
        subtitle="Multi-store accounts (API key–based)."
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
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : accounts.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading="No accounts"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Accounts are created when standalone multi-store users register.</p>
                </EmptyState>
              </div>
            ) : (
              <div className={styles.adminTableWrap}>
                <DataTable
                  columnContentTypes={['text', 'text', 'numeric', 'text', 'text']}
                  headings={['Name', 'API key prefix', 'Domains', 'Created', 'Actions']}
                  rows={rows}
                />
              </div>
            )}
          </BlockStack>
        </Card>
      </Page>
      {detailId && (
        <Modal
          open
          onClose={() => setDetailId(null)}
          title={detailLoading ? 'Account' : (detail?.name ?? 'Account')}
        >
          <Modal.Section>
            {detailLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : detail ? (
              <BlockStack gap="300">
                <Text as="p">
                  <strong>ID:</strong> {detail.id}
                </Text>
                <Text as="p">
                  <strong>Name:</strong> {detail.name}
                </Text>
                <Text as="p">
                  <strong>API key prefix:</strong> {detail.apiKeyPrefix ?? '—'}
                </Text>
                <Text as="p">
                  <strong>Domains:</strong>
                </Text>
                {detail.domains?.length ? (
                  <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                    {detail.domains.map(d => (
                      <li key={d.id}>
                        {d.domain} ({d.platform})
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Text as="p" tone="subdued">
                    None
                  </Text>
                )}
              </BlockStack>
            ) : null}
          </Modal.Section>
        </Modal>
      )}
    </PageShell>
  );
}
