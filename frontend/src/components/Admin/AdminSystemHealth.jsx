/**
 * AdminSystemHealth
 *
 * Human-readable view of GET /health (same payload load balancers use). Raw JSON stays on /health.
 */

import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  BlockStack,
  InlineGrid,
  Text,
  Badge,
  Banner,
  Button,
  Spinner,
} from '@shopify/polaris';
import { RefreshIcon } from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import AdminPageLayout from './AdminPageLayout';
import { getHealthUrl } from '../../services/api';
import styles from './Admin.module.css';

function formatUptime(seconds) {
  if (
    seconds === null ||
    seconds === undefined ||
    typeof seconds !== 'number' ||
    Number.isNaN(seconds)
  ) {
    return '—';
  }
  if (seconds < 60) return `${seconds}s`;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function checkTone(value) {
  if (value === 'ok') return 'success';
  if (value === 'error') return 'critical';
  if (value === 'skipped') return 'info';
  return 'attention';
}

function statusTone(status) {
  if (status === 'ok') return 'success';
  if (status === 'shutting_down') return 'warning';
  return 'critical';
}

export default function AdminSystemHealth() {
  const healthUrl = getHealthUrl();

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['admin', 'health'],
    queryFn: async () => {
      const res = await fetch(healthUrl, { credentials: 'include' });
      let body = null;
      try {
        body = await res.json();
      } catch {
        throw new Error('Could not parse health response');
      }
      if (!body || typeof body !== 'object') {
        throw new Error('Invalid health response');
      }
      return { ...body, httpStatus: res.status };
    },
    refetchInterval: 30 * 1000,
  });

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

  const overallStatus = data?.status;
  const httpStatus = data?.httpStatus;

  const metaItems = useMemo(() => {
    if (!data) return [];
    const rows = [
      {
        label: 'Version',
        value: data.version !== null && data.version !== undefined ? String(data.version) : '—',
      },
      { label: 'Uptime', value: formatUptime(data.uptime) },
      {
        label: 'Timestamp',
        value: data.timestamp ? new Date(data.timestamp).toLocaleString() : '—',
      },
    ];
    if (httpStatus !== null && httpStatus !== undefined) {
      rows.push({ label: 'HTTP status', value: String(httpStatus) });
    }
    return rows;
  }, [data, httpStatus]);

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
          <section className={styles.adminMainSection} aria-label="About system health">
            <Text as="p" variant="bodyMd" tone="subdued" className={styles.adminPageDescription}>
              Full snapshot from <code className={styles.adminInlineCode}>/api/health</code> (or{' '}
              <code className={styles.adminInlineCode}>/health</code> on the API host). For probes,
              prefer <code className={styles.adminInlineCode}>/live</code> (no DB) and{' '}
              <code className={styles.adminInlineCode}>/ready</code> (DB + Redis, minimal JSON).
            </Text>
            {lastRefreshed && (
              <Text as="p" variant="bodySm" tone="subdued" className={styles.adminPageSubtitle}>
                Last refreshed {lastRefreshed}
                {isFetching ? ' · Updating…' : ''}
              </Text>
            )}
          </section>

          {isError && (
            <Banner tone="critical" title="Could not load health">
              {error?.message || 'Request failed. Check the API URL and try Refresh.'}
            </Banner>
          )}

          {!isLoading && !isError && httpStatus >= 400 && (
            <Banner tone="warning" title="Non-success HTTP status">
              The server returned HTTP {httpStatus}. Orchestrators may treat this instance as
              unhealthy even though a JSON body was returned.
            </Banner>
          )}

          {!isLoading && !isError && data?.maintenance && (
            <Banner tone="warning" title="Maintenance mode is on">
              {data.maintenanceMessage ||
                'Track and script may be limited. Adjust settings under Maintenance.'}
            </Banner>
          )}

          {!isLoading && !isError && data?.announcementBanner && (
            <Banner tone="info" title="Announcement banner (active)">
              {data.announcementBanner}
            </Banner>
          )}

          {isLoading ? (
            <div className={styles.adminOverviewLoading}>
              <Spinner size="large" />
              <Text as="p" variant="bodySm" tone="subdued">
                Loading health…
              </Text>
            </div>
          ) : !isError ? (
            <>
              <Card>
                <BlockStack gap="400">
                  <InlineGrid columns={{ xs: 1, sm: 2 }} gap="400">
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingSm">
                        Overall
                      </Text>
                      <div>
                        <Badge tone={statusTone(overallStatus)}>
                          {overallStatus === 'ok'
                            ? 'Operational'
                            : overallStatus === 'shutting_down'
                              ? 'Shutting down'
                              : overallStatus === 'degraded'
                                ? 'Degraded'
                                : String(overallStatus || 'Unknown')}
                        </Badge>
                      </div>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text as="h2" variant="headingSm">
                        Dependencies
                      </Text>
                      <BlockStack gap="200">
                        <div className={styles.adminHealthCheckRow}>
                          <Text as="span" variant="bodyMd">
                            Database
                          </Text>
                          <Badge tone={checkTone(data.checks?.db)}>
                            {data.checks?.db ?? 'unknown'}
                          </Badge>
                        </div>
                        <div className={styles.adminHealthCheckRow}>
                          <Text as="span" variant="bodyMd">
                            Redis
                          </Text>
                          <Badge tone={checkTone(data.checks?.redis)}>
                            {data.checks?.redis ?? 'unknown'}
                          </Badge>
                        </div>
                      </BlockStack>
                    </BlockStack>
                  </InlineGrid>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    Instance
                  </Text>
                  <BlockStack gap="200">
                    {metaItems.map(row => (
                      <div key={row.label} className={styles.adminHealthMetaRow}>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {row.label}
                        </Text>
                        <Text as="span" variant="bodyMd" fontWeight="medium">
                          {row.value}
                        </Text>
                      </div>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>

              <div className={styles.adminHealthActions}>
                <Button
                  variant="secondary"
                  onClick={() => {
                    window.open(healthUrl, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Open raw JSON
                </Button>
              </div>
            </>
          ) : null}
        </BlockStack>
      </AdminPageLayout>
    </PageShell>
  );
}
