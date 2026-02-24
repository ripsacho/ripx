/**
 * AdminOverview
 *
 * Platform stats for admin dashboard with quick links to list pages.
 * Uses same MetricCard + grid as Dashboard for consistent UI.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Page, BlockStack, Text, InlineStack, Button, Badge } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { apiGet, getShopDomain, getApiKey } from '../../services';
import { PageShell } from '../Shared';
import { MetricCard, MetricGrid } from '../Shared';
import { ROUTES } from '../../constants';
import styles from './Admin.module.css';

const STAT_LINKS = {
  Users: ROUTES.ADMIN_USERS,
  Domains: ROUTES.ADMIN_DOMAINS,
  'Total tests': ROUTES.ADMIN_TESTS,
  'Active tests': `${ROUTES.ADMIN_TESTS}?status=running`,
  Conversions: null,
  Revenue: null,
};

export default function AdminOverview() {
  const navigate = useNavigate();
  const {
    data: stats,
    isLoading,
    isFetching,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await apiGet('/admin/stats');
      return res.data?.data ?? res.data;
    },
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const base = import.meta.env.VITE_API_URL || '';
      const res = await fetch(`${base}/api/health`, { credentials: 'include' });
      if (!res.ok) return { status: 'degraded', checks: {} };
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  const items = [
    { label: 'Users', value: stats?.totalUsers ?? 0, link: STAT_LINKS.Users, format: 'plain' },
    {
      label: 'Domains',
      value: stats?.totalDomains ?? 0,
      link: STAT_LINKS.Domains,
      format: 'plain',
    },
    {
      label: 'Total tests',
      value: stats?.totalTests ?? 0,
      link: STAT_LINKS['Total tests'],
      format: 'plain',
    },
    {
      label: 'Active tests',
      value: stats?.activeTests ?? 0,
      link: STAT_LINKS['Active tests'],
      format: 'plain',
    },
    { label: 'Conversions', value: stats?.totalConversions ?? 0, link: null, format: 'number' },
    { label: 'Revenue', value: stats?.totalRevenue ?? 0, link: null, format: 'currency' },
  ];

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  const healthUrl = `${import.meta.env.VITE_API_URL || ''}/api/health`;
  const handleExportAuditCsv = () => {
    const baseUrl = import.meta.env.VITE_API_URL || '/api';
    const url = `${baseUrl}/admin/audit-log/export?limit=5000`;
    const shop = getShopDomain();
    const apiKey = getApiKey();
    const headers = { Accept: 'text/csv' };
    if (apiKey) headers['X-RipX-API-Key'] = apiKey;
    if (shop) headers['X-Shopify-Shop-Domain'] = shop;
    fetch(url, { credentials: 'include', headers })
      .then(r => {
        if (!r.ok) throw new Error(r.statusText);
        return r.text();
      })
      .then(csv => {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'ripx-admin-audit-log.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => {});
  };

  return (
    <PageShell className={styles.adminPage}>
      <Page
        title="Admin overview"
        subtitle="Platform-wide metrics and quick actions. Click a stat to open the list."
        backAction={{ content: 'App', url: '/' }}
        primaryAction={{
          content: 'Refresh',
          icon: RefreshIcon,
          onAction: () => refetch(),
          loading: isFetching,
        }}
      >
        <BlockStack gap="400">
          <section className={styles.adminMainSection} aria-label="Overview summary">
            <Text as="p" variant="bodyMd" tone="subdued" className={styles.adminPageDescription}>
              Manage users, domains, tests, and audit log from the sidebar. Click a metric card to
              jump to that list.
            </Text>
            {lastUpdated && (
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                Last updated {lastUpdated}
              </Text>
            )}
          </section>
          <div className={styles.adminSectionHeading}>
            <Text as="h3" variant="headingSm">
              Platform metrics
            </Text>
          </div>
          {isLoading ? (
            <MetricGrid>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <MetricCard key={i} title="—" value="—" />
              ))}
            </MetricGrid>
          ) : (
            <MetricGrid>
              {items.map(({ label, value, link, format }) => {
                const card = (
                  <MetricCard
                    title={label}
                    value={value}
                    format={
                      format === 'currency' ? 'currency' : format === 'number' ? 'number' : 'plain'
                    }
                  />
                );
                return link ? (
                  <button
                    key={label}
                    type="button"
                    className={styles.adminStatCardLink}
                    onClick={() => navigate(link)}
                    aria-label={`View ${label}`}
                  >
                    {card}
                  </button>
                ) : (
                  <div key={label}>{card}</div>
                );
              })}
            </MetricGrid>
          )}
          <div className={styles.adminSectionHeading}>
            <Text as="h3" variant="headingSm">
              Quick actions
            </Text>
          </div>
          <div className={styles.adminSystemRow}>
            <InlineStack gap="300" wrap blockAlign="center">
              {!healthLoading && health && (
                <Badge tone={health.status === 'ok' ? 'success' : 'critical'}>
                  System {health.status === 'ok' ? 'OK' : 'Degraded'}
                  {health.checks?.db && ` · DB ${health.checks.db}`}
                  {health.checks?.redis &&
                    health.checks.redis !== 'skipped' &&
                    ` · Redis ${health.checks.redis}`}
                </Badge>
              )}
              <a
                href={healthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.adminHealthLink}
              >
                System health (DB, Redis)
              </a>
              <Button variant="plain" onClick={() => navigate(ROUTES.ADMIN_AUDIT)}>
                Audit log
              </Button>
              <Button variant="plain" onClick={handleExportAuditCsv}>
                Export audit CSV
              </Button>
            </InlineStack>
          </div>
        </BlockStack>
      </Page>
    </PageShell>
  );
}
