/**
 * AdminPromoLinks
 *
 * List promo links (test, token, domain, expires); revoke by test or domain. Phase 3.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Page,
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
import { apiGet, apiPost } from '../../services';
import { PageShell } from '../Shared';
import Toast from '../Toast/Toast';
import styles from './Admin.module.css';

export default function AdminPromoLinks() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [domainFilter, setDomainFilter] = useState('');
  const [revokeModal, setRevokeModal] = useState(null);
  const [toast, setToast] = useState({ message: null, type: 'success' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'promo-links', page, pageSize, domainFilter],
    queryFn: async () => {
      const params = { limit: pageSize, offset: page * pageSize };
      if (domainFilter.trim()) params.shop_domain = domainFilter.trim();
      const res = await apiGet('/admin/promo-links', params);
      return res.data?.data ?? res.data;
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ testId, shopDomain }) => {
      await apiPost('/admin/promo-links/revoke', {
        test_id: testId || undefined,
        shop_domain: shopDomain || undefined,
      });
    },
    onSuccess: data => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'promo-links'] });
      const revoked = data?.data?.revoked ?? data?.revoked ?? 0;
      setToast({ message: `Revoked ${revoked} link(s)`, type: 'success' });
      setRevokeModal(null);
    },
    onError: err => {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Revoke failed',
        type: 'error',
      });
    },
  });

  const links = data?.promoLinks ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const rows = links.map(l => [
    l.shopDomain,
    l.testId?.slice(0, 8) + '…' || '—',
    l.token?.slice(0, 12) + '…' || '—',
    l.name || '—',
    l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : '—',
    l.usesCount ?? 0,
    l.createdAt ? new Date(l.createdAt).toLocaleString() : '—',
    <InlineStack key={l.id} gap="200">
      <Button
        size="slim"
        tone="critical"
        onClick={() =>
          setRevokeModal({
            testId: l.testId,
            shopDomain: null,
            label: `test ${l.testId?.slice(0, 8)}`,
          })
        }
      >
        Revoke test
      </Button>
      <Button
        size="slim"
        tone="critical"
        onClick={() =>
          setRevokeModal({
            testId: null,
            shopDomain: l.shopDomain,
            label: `domain ${l.shopDomain}`,
          })
        }
      >
        Revoke domain
      </Button>
    </InlineStack>,
  ]);

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Promo links"
        subtitle="List and revoke promo links by test or domain. Revoking by domain removes all links for that shop."
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
            <section className={styles.adminMainSection} aria-label="Promo links">
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageDescription}>
                Filter by shop domain or leave empty to see all. Revoke by test (this test only) or
                by domain (all links for that shop). Actions are audited.
              </Text>
            </section>
            <InlineStack gap="300" blockAlign="center">
              <Box minWidth="200px">
                <TextField
                  label="Shop domain"
                  value={domainFilter}
                  onChange={setDomainFilter}
                  placeholder="e.g. store.myshopify.com"
                  autoComplete="off"
                />
              </Box>
              <Box paddingBlockStart="400">
                <Button onClick={() => setPage(0)}>Apply</Button>
              </Box>
            </InlineStack>
            {isLoading ? (
              <Text as="p" tone="subdued">
                Loading…
              </Text>
            ) : links.length === 0 ? (
              <div className={styles.adminEmptyState}>
                <EmptyState
                  heading={
                    total === 0 && !domainFilter.trim() ? 'No promo links' : 'No links match'
                  }
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>
                    {total === 0 && !domainFilter.trim()
                      ? 'Promo links are created from offer tests. They will appear here.'
                      : 'Try a different domain filter.'}
                  </p>
                </EmptyState>
              </div>
            ) : (
              <>
                <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                  {total} link{total !== 1 ? 's' : ''}
                </Text>
                <div className={styles.adminTableWrap}>
                  <DataTable
                    columnContentTypes={[
                      'text',
                      'text',
                      'text',
                      'text',
                      'text',
                      'numeric',
                      'text',
                      'text',
                    ]}
                    headings={[
                      'Domain',
                      'Test',
                      'Token',
                      'Name',
                      'Expires',
                      'Uses',
                      'Created',
                      'Actions',
                    ]}
                    rows={rows}
                  />
                </div>
                {totalPages > 1 && (
                  <div className={styles.adminPagination}>
                    <Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                      Previous
                    </Button>
                    <Text as="span" tone="subdued">
                      {page + 1} of {totalPages} ({total} total)
                    </Text>
                    <Button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </BlockStack>
        </Card>
      </Page>

      {revokeModal && (
        <Modal
          open
          onClose={() => setRevokeModal(null)}
          title="Revoke promo links?"
          primaryAction={{
            content: 'Revoke',
            destructive: true,
            onAction: () => {
              revokeMutation.mutate({
                testId: revokeModal.testId,
                shopDomain: revokeModal.shopDomain,
              });
            },
            loading: revokeMutation.isPending,
          }}
          secondaryActions={[{ content: 'Cancel', onAction: () => setRevokeModal(null) }]}
        >
          <Modal.Section>
            <Text as="p">
              This will revoke all promo links for {revokeModal.label}. They will no longer apply
              discounts. This cannot be undone.
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
