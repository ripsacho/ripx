/**
 * Analytics Overview Component
 *
 * General analytics dashboard showing performance across all tests
 */

import React, { useState, useMemo } from 'react';
import {
  Page,
  Card,
  Layout,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  EmptyState,
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { useTests, useAppRoutes } from '../../hooks';
import { MetricCard, MetricGrid } from '../Shared';
import { getTestTypeDisplay, getVariantCount } from '../../utils/testType';
import pageShell from '../Shared/PageShell.module.css';
import styles from './AnalyticsOverview.module.css';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

function AnalyticsOverview() {
  const navigate = useNavigate();
  const routes = useAppRoutes();
  const [currentPage, setCurrentPage] = useState(1);
  const testsPerPage = 5;

  const { data: tests = [], isLoading: loading, isError, error, refetch: fetchTests } = useTests();

  const getStatusBadge = status => {
    const statusMap = {
      draft: { tone: 'info', label: 'Draft' },
      running: { tone: 'success', label: 'Running' },
      stopped: { tone: 'warning', label: 'Stopped' },
      completed: { tone: 'success', label: 'Completed' },
    };

    const config = statusMap[status] || { tone: 'info', label: status };
    return <Badge tone={config.tone}>{config.label}</Badge>;
  };

  const getHealthBadge = health => {
    if (!health) return null;
    const colorMap = {
      excellent: 'success',
      good: 'attention',
      fair: 'warning',
      poor: 'critical',
    };
    return (
      <InlineStack gap="100" align="start">
        <Badge tone={colorMap[health.healthLevel] || 'info'}>{health.score}/100</Badge>
      </InlineStack>
    );
  };

  // Calculate aggregate metrics (memoized)
  const aggregateMetrics = useMemo(
    () =>
      tests.reduce(
        (acc, test) => {
          if (test.variants && Array.isArray(test.variants)) {
            test.variants.forEach(variant => {
              acc.totalVisitors += variant.visitors || 0;
              acc.totalConversions += variant.conversions || 0;
              acc.totalRevenue += variant.revenue || 0;
            });
          }
          return acc;
        },
        { totalVisitors: 0, totalConversions: 0, totalRevenue: 0 }
      ),
    [tests]
  );

  const overallConversionRate = useMemo(
    () =>
      aggregateMetrics.totalVisitors > 0
        ? ((aggregateMetrics.totalConversions / aggregateMetrics.totalVisitors) * 100).toFixed(2)
        : 0,
    [aggregateMetrics]
  );

  const activeTests = tests.filter(t => (t.status || '').toLowerCase() === 'running').length;
  const completedTests = tests.filter(t => (t.status || '').toLowerCase() === 'completed').length;

  // Get paginated tests (memoized)
  const paginatedTests = useMemo(() => {
    const sortedTests = [...tests].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const startIndex = (currentPage - 1) * testsPerPage;
    return sortedTests.slice(startIndex, startIndex + testsPerPage);
  }, [tests, currentPage]);

  const totalPages = Math.ceil(tests.length / testsPerPage);

  const TestCard = ({ test }) => {
    const handleCardClick = () => {
      navigate(routes.testAnalytics(test.id));
    };

    // Calculate performance metrics
    const totalVisitors = test.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
    const totalConversions = test.variants?.reduce((sum, v) => sum + (v.conversions || 0), 0) || 0;
    const totalRevenue = test.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
    const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
    const variantCount = getVariantCount(test);

    const createdDate = test.created_at
      ? (() => {
          try {
            const d = new Date(test.created_at);
            return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
          } catch {
            return '—';
          }
        })()
      : '—';

    return (
      <div
        className={`${styles.testCard} test-card-overview`}
        data-status={test.status}
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleCardClick()}
      >
        <BlockStack gap="400">
          {/* Header Section - Synced with TestList */}
          <div className={styles.testCardHeader}>
            <div className={styles.testCardHeaderLeft}>
              <div className={styles.testCardIcon}>{getTestTypeDisplay(test).icon}</div>
              <div className={styles.testCardTitleBlock}>
                <span className={styles.testCardTitle}>
                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                    {test.name || 'Unnamed'}
                  </Text>
                </span>
                <Text variant="bodySm" color="subdued" as="p" className={styles.testCardMeta}>
                  {getTestTypeDisplay(test).label} • {variantCount} variant
                  {variantCount !== 1 ? 's' : ''} • Created {createdDate}
                </Text>
              </div>
            </div>
            <div className={styles.testCardBadges}>
              {getStatusBadge(test.status)}
              {getHealthBadge(test.health)}
            </div>
          </div>

          {/* Performance Metrics - Synced with TestList */}
          <div className={styles.testCardMetrics}>
            <div className={styles.testCardMetricsGrid}>
              <div className={styles.testCardMetric}>
                <span className={styles.testCardMetricLabel}>Visitors</span>
                <span className={styles.testCardMetricValue}>{totalVisitors.toLocaleString()}</span>
              </div>
              <div className={styles.testCardMetric}>
                <span className={styles.testCardMetricLabel}>Conversions</span>
                <span className={styles.testCardMetricValue}>
                  {totalConversions.toLocaleString()}
                </span>
              </div>
              <div className={styles.testCardMetric}>
                <span className={styles.testCardMetricLabel}>Rate</span>
                <span
                  className={`${styles.testCardMetricValue} ${
                    conversionRate > 5
                      ? styles.testCardMetricValueSuccess
                      : conversionRate > 2
                        ? ''
                        : styles.testCardMetricValueSubdued
                  }`}
                >
                  {conversionRate.toFixed(2)}%
                </span>
              </div>
              {totalRevenue > 0 && (
                <div className={styles.testCardMetric}>
                  <span className={styles.testCardMetricLabel}>Revenue</span>
                  <span
                    className={`${styles.testCardMetricValue} ${styles.testCardMetricValueSuccess}`}
                  >
                    $
                    {totalRevenue.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
              {totalVisitors === 0 && test.status === 'running' && (
                <div className={styles.testCardWaiting}>
                  <Text variant="bodySm" color="subdued" as="span">
                    Waiting for traffic...
                  </Text>
                </div>
              )}
            </div>
          </div>
        </BlockStack>
      </div>
    );
  };

  const chartData = tests
    .filter(
      test =>
        (test.status || '').toLowerCase() === 'running' && test.variants && test.variants.length > 0
    )
    .map(test => {
      const totalVisitors = test.variants.reduce((sum, v) => sum + (v.visitors || 0), 0);
      const totalConversions = test.variants.reduce((sum, v) => sum + (v.conversions || 0), 0);
      const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;

      return {
        name:
          (test.name || 'Unnamed').length > 15
            ? (test.name || 'Unnamed').substring(0, 15) + '...'
            : test.name || 'Unnamed',
        'Conversion Rate': parseFloat(conversionRate.toFixed(2)),
        Visitors: totalVisitors,
      };
    });

  if (loading) {
    return (
      <div className={`${pageShell.page} ${styles.overviewPage}`}>
        <Page title="" subtitle="">
          <BlockStack gap="400">
            <div className={styles.skeletonHero} />
            <div
              className="grid-responsive"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
              }}
            >
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={styles.skeletonMetric} />
              ))}
            </div>
            <div className={styles.emptyChart} style={{ minHeight: 280 }} />
          </BlockStack>
        </Page>
      </div>
    );
  }

  const errorMessage = isError
    ? error?.response?.data?.error || error?.message || 'Failed to load analytics'
    : null;

  if (errorMessage) {
    return (
      <div className={pageShell.page}>
        <Toast message={errorMessage} type="error" onClose={() => {}} duration={5000} />
        <Page
          title=""
          subtitle=""
          primaryAction={{
            content: 'Retry',
            onAction: () => fetchTests(),
          }}
        >
          <Card sectioned>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                {errorMessage} Check your connection and try again.
              </Text>
            </BlockStack>
          </Card>
        </Page>
      </div>
    );
  }

  return (
    <div className={`${pageShell.page} ${styles.overviewPage}`}>
      <Page title="" subtitle="">
        <div className={styles.overviewLayout}>
          <div className={styles.overviewHeader}>
            {/* Hero Section */}
            <section className={styles.heroSection}>
              <div className={styles.heroContent}>
                <div>
                  <h1 className={styles.heroTitle}>Analytics Overview</h1>
                  <p className={styles.heroSubtitle}>
                    Performance across all tests • {tests.length} test
                    {tests.length !== 1 ? 's' : ''} total
                  </p>
                </div>
                <div className={styles.heroQuickStats}>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatValue}>{activeTests}</span>
                    <span className={styles.heroStatLabel}>Active</span>
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatValue}>
                      {aggregateMetrics.totalVisitors.toLocaleString()}
                    </span>
                    <span className={styles.heroStatLabel}>Visitors</span>
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatValue}>
                      $
                      {aggregateMetrics.totalRevenue.toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </span>
                    <span className={styles.heroStatLabel}>Revenue</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className={styles.overviewContent}>
            <Layout>
              {/* Summary Metrics */}
              <Layout.Section>
                <MetricGrid>
                  <MetricCard
                    title="Total Tests"
                    value={tests.length}
                    subtitle={`${activeTests} active, ${completedTests} completed`}
                    tooltip="Total number of A/B tests"
                  />
                  <MetricCard
                    title="Total Visitors"
                    value={aggregateMetrics.totalVisitors.toLocaleString()}
                    subtitle="Across all tests"
                    tooltip="Total visitors across all test variants"
                  />
                  <MetricCard
                    title="Total Conversions"
                    value={aggregateMetrics.totalConversions.toLocaleString()}
                    subtitle={`${overallConversionRate}% conversion rate`}
                    tooltip="Total conversions across all tests"
                  />
                  <MetricCard
                    title="Total Revenue"
                    value={`$${aggregateMetrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    subtitle="From all tests"
                    tooltip="Total revenue from all variants"
                  />
                </MetricGrid>
              </Layout.Section>

              {/* Charts */}
              {chartData.length > 0 && (
                <Layout.Section>
                  <div className={`chart-container ${styles.chartCard}`}>
                    <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
                      Active Tests Performance
                    </Text>
                    <ResponsiveContainer width="100%" height={420}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                        <XAxis dataKey="name" stroke="var(--text-secondary)" />
                        <YAxis stroke="var(--text-secondary)" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '8px',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <Legend />
                        <Bar
                          dataKey="Conversion Rate"
                          fill="var(--accent-primary)"
                          radius={[8, 8, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Layout.Section>
              )}

              {chartData.length === 0 && tests.length > 0 && (
                <Layout.Section>
                  <div className="chart-container">
                    <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
                      Active Tests Performance
                    </Text>
                    <div className={styles.emptyChart}>
                      <Text variant="bodyMd" color="subdued" as="p">
                        No active tests with traffic yet. Start a test to see performance charts.
                      </Text>
                    </div>
                  </div>
                </Layout.Section>
              )}

              {/* All Tests Performance */}
              <Layout.Section>
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text variant="headingMd" as="h2">
                          All Tests Performance
                        </Text>
                        <Text variant="bodySm" color="subdued" as="p">
                          Showing {paginatedTests.length} of {tests.length} tests
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200">
                        <Button onClick={() => navigate(routes.tests)} variant="secondary">
                          View All Tests
                        </Button>
                        <Button onClick={() => navigate(routes.createTest)}>Create Test</Button>
                      </InlineStack>
                    </InlineStack>

                    {loading ? (
                      <LoadingSkeleton type="table" count={3} />
                    ) : tests.length === 0 ? (
                      <EmptyState
                        heading="Create your first AB test"
                        action={{
                          content: 'Create Test',
                          onAction: () => navigate(routes.createTest),
                        }}
                        image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                      >
                        <p>
                          Start optimizing your store by creating an AB test. Test prices, content,
                          shipping, and more to maximize conversions.
                        </p>
                      </EmptyState>
                    ) : (
                      <BlockStack gap="500">
                        {paginatedTests.map(test => (
                          <TestCard key={test.id} test={test} />
                        ))}

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <InlineStack align="center" blockAlign="center" gap="200">
                            <Button
                              plain
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                            >
                              Previous
                            </Button>
                            <Text variant="bodySm" color="subdued" as="span">
                              Page {currentPage} of {totalPages}
                            </Text>
                            <Button
                              plain
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage === totalPages}
                            >
                              Next
                            </Button>
                          </InlineStack>
                        )}
                      </BlockStack>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </div>
        </div>
      </Page>
    </div>
  );
}

export default AnalyticsOverview;
