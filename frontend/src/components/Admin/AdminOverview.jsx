/**
 * AdminOverview
 *
 * Platform stats for admin dashboard with quick links to list pages.
 * Uses same MetricCard + grid as Dashboard for consistent UI.
 */

import React, { useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BlockStack, Text, Badge, Banner, Spinner } from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import {
  apiGet,
  getShopDomain,
  getApiKey,
  unwrapData,
  getHealthUrl,
  getApiBaseUrl,
} from '../../services';
import { PageShell } from '../Shared';
import { MetricCard, MetricGrid } from '../Shared';
import { ROUTES } from '../../constants';
import AdminPageLayout from './AdminPageLayout';
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
  const quickActionsRef = useRef(null);
  const quickActionsScrollRef = useRef({ isDragging: false, startX: 0, startScrollLeft: 0 });
  const quickActionsDidDragRef = useRef(false);

  const onQuickActionsMouseDown = useCallback(e => {
    if (!quickActionsRef.current || e.button !== 0) return;
    if (e.target.closest('a') || e.target.closest('button')) return;
    quickActionsDidDragRef.current = false;
    quickActionsScrollRef.current = {
      isDragging: true,
      startX: e.clientX,
      startScrollLeft: quickActionsRef.current.scrollLeft,
    };
  }, []);

  const onQuickActionsMouseMove = useCallback(e => {
    const ref = quickActionsScrollRef.current;
    if (!ref.isDragging || !quickActionsRef.current) return;
    quickActionsDidDragRef.current = true;
    const dx = ref.startX - e.clientX;
    quickActionsRef.current.scrollLeft = ref.startScrollLeft + dx;
  }, []);

  const onQuickActionsMouseUp = useCallback(() => {
    quickActionsScrollRef.current.isDragging = false;
  }, []);

  useEffect(() => {
    const onMove = e => {
      if (quickActionsScrollRef.current.isDragging) onQuickActionsMouseMove(e);
    };
    const onUp = () => {
      if (quickActionsScrollRef.current.isDragging) onQuickActionsMouseUp();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onQuickActionsMouseMove, onQuickActionsMouseUp]);

  useEffect(() => {
    const el = quickActionsRef.current;
    if (!el) return;
    const onWheel = e => {
      if (e.deltaY !== 0) {
        el.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const {
    data: stats,
    isLoading,
    isFetching,
    isError: statsError,
    error: statsErrorDetail,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await apiGet('/admin/stats');
      return unwrapData(res) ?? res?.data ?? {};
    },
    retry: (failureCount, error) => {
      const status = error?.response?.status;
      if (status === 403 || status === 401) return false;
      return failureCount < 2;
    },
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const res = await fetch(getHealthUrl(), { credentials: 'include' });
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

  const healthUrl = getHealthUrl();
  const handleExportAuditCsv = () => {
    const baseUrl = getApiBaseUrl();
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

  const statsMessage =
    statsErrorDetail?.response?.data?.error ||
    statsErrorDetail?.message ||
    'Could not load platform stats.';

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
        <BlockStack gap="400">
          {statsError && (
            <Banner tone="warning" onDismiss={() => {}}>
              {statsMessage} Metrics below may show zero. Click Refresh to retry.
            </Banner>
          )}
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
            <div className={styles.adminOverviewLoading}>
              <Spinner size="large" />
              <Text as="p" variant="bodySm" tone="subdued">
                Loading platform metrics…
              </Text>
            </div>
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
          <div className={styles.adminQuickActionsWrap}>
            <span className={styles.adminQuickActionsLabel}>Jump to</span>
            <div
              ref={quickActionsRef}
              className={styles.adminQuickActionsList}
              aria-label="Quick actions (scroll or drag horizontally)"
              onMouseDown={onQuickActionsMouseDown}
            >
              {!healthLoading && health && (
                <span className={styles.adminQuickActionItem}>
                  <Badge tone={health.status === 'ok' ? 'success' : 'critical'}>
                    System {health.status === 'ok' ? 'OK' : 'Degraded'}
                    {health.checks?.db && ` · DB ${health.checks.db}`}
                    {health.checks?.redis &&
                      health.checks.redis !== 'skipped' &&
                      ` · Redis ${health.checks.redis}`}
                  </Badge>
                </span>
              )}
              <span className={styles.adminQuickActionItem}>
                <a
                  href={healthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.adminQuickActionLink}
                >
                  System health
                </a>
              </span>
              <span className={styles.adminQuickActionItem}>
                <button
                  type="button"
                  className={styles.adminQuickActionBtn}
                  onClick={() => navigate(ROUTES.ADMIN_AUDIT)}
                >
                  Audit log
                </button>
              </span>
              <span className={styles.adminQuickActionItem}>
                <button
                  type="button"
                  className={styles.adminQuickActionBtn}
                  onClick={handleExportAuditCsv}
                >
                  Export audit CSV
                </button>
              </span>
            </div>
          </div>
        </BlockStack>
      </AdminPageLayout>
    </PageShell>
  );
}
