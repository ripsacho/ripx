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
  TextField,
  Select,
  Banner,
} from '@shopify/polaris';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Toast from '../Toast/Toast';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { useTests, useAppRoutes, useAnalyticsOverview } from '../../hooks';
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

const OVERVIEW_METRIC_OPTIONS = [
  { label: 'Conversion Rate', value: 'conversionRate' },
  { label: 'Visitors', value: 'visitors' },
  { label: 'Revenue', value: 'revenue' },
  { label: 'Revenue Per Visitor', value: 'revenuePerVisitor' },
  { label: 'Health Score', value: 'healthScore' },
];

const STATUS_FILTER_OPTIONS = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Draft', value: 'draft' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Completed', value: 'completed' },
  { label: 'Needs Attention', value: 'attention' },
  { label: 'Winner Ready', value: 'winnerReady' },
];

const SORT_OPTIONS = [
  { label: 'Newest First', value: 'created' },
  { label: 'Most Visitors', value: 'visitors' },
  { label: 'Highest Revenue', value: 'revenue' },
  { label: 'Best Conversion Rate', value: 'conversionRate' },
  { label: 'Needs Attention', value: 'attention' },
];

function formatCurrency(value, digits = 0) {
  return `$${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatPercent(value) {
  return `${(Number(value) || 0).toFixed(2)}%`;
}

function coerceOption(value, options, fallback) {
  return options.some(option => option.value === value) ? value : fallback;
}

function pickOverviewMetric(row = {}, metric = 'conversionRate') {
  return Number(row[metric]) || 0;
}

function AnalyticsOverview() {
  const navigate = useNavigate();
  const routes = useAppRoutes();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(1);
  const testsPerPage = 5;

  const { data: tests = [], isLoading: loading, isError, error, refetch: fetchTests } = useTests();
  const {
    data: portfolioOverview = null,
    isLoading: overviewLoading,
    isError: overviewError,
    refetch: refetchOverview,
  } = useAnalyticsOverview();
  const searchQuery = searchParams.get('q') || '';
  const statusFilter = coerceOption(
    searchParams.get('status') || 'all',
    STATUS_FILTER_OPTIONS,
    'all'
  );
  const sortBy = coerceOption(searchParams.get('sort') || 'created', SORT_OPTIONS, 'created');
  const chartMetric = coerceOption(
    searchParams.get('metric') || 'conversionRate',
    OVERVIEW_METRIC_OPTIONS,
    'conversionRate'
  );

  const updateOverviewParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all' || (key === 'sort' && value === 'created')) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    setSearchParams(next, { replace: true });
    setCurrentPage(1);
  };

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
  const overviewById = useMemo(() => {
    const map = new Map();
    (portfolioOverview?.tests || []).forEach(row => {
      map.set(row.id, row);
    });
    return map;
  }, [portfolioOverview]);
  const portfolioTotals = portfolioOverview?.totals || {
    tests: tests.length,
    visitors: aggregateMetrics.totalVisitors,
    conversions: aggregateMetrics.totalConversions,
    revenue: aggregateMetrics.totalRevenue,
    conversionRate: Number(overallConversionRate) || 0,
    winnerReady: 0,
    needsTraffic: 0,
    srmRisks: 0,
    guardrailRisks: 0,
    needsAttention: 0,
    statusCounts: {},
  };
  const nextAction = portfolioOverview?.nextAction || null;

  // Get paginated tests (memoized)
  const paginatedTests = useMemo(() => {
    const filteredTests = tests.filter(test => {
      const summary = overviewById.get(test.id);
      const status = String(test.status || '').toLowerCase();
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        String(test.name || '')
          .toLowerCase()
          .includes(query) ||
        String(test.type || '')
          .toLowerCase()
          .includes(query);
      const matchesStatus =
        statusFilter === 'all' ||
        status === statusFilter ||
        (statusFilter === 'attention' && summary?.attentionReasons?.length > 0) ||
        (statusFilter === 'winnerReady' && summary?.winnerReady);
      return matchesQuery && matchesStatus;
    });
    const sortedTests = [...filteredTests].sort((a, b) => {
      const aSummary = overviewById.get(a.id) || {};
      const bSummary = overviewById.get(b.id) || {};
      if (sortBy === 'attention') {
        return (bSummary.attentionReasons?.length || 0) - (aSummary.attentionReasons?.length || 0);
      }
      if (['visitors', 'revenue', 'conversionRate'].includes(sortBy)) {
        return (Number(bSummary[sortBy]) || 0) - (Number(aSummary[sortBy]) || 0);
      }
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    const startIndex = (currentPage - 1) * testsPerPage;
    return sortedTests.slice(startIndex, startIndex + testsPerPage);
  }, [tests, overviewById, searchQuery, statusFilter, sortBy, currentPage]);

  const filteredCount = useMemo(
    () =>
      tests.filter(test => {
        const summary = overviewById.get(test.id);
        const status = String(test.status || '').toLowerCase();
        const query = searchQuery.trim().toLowerCase();
        const matchesQuery =
          !query ||
          String(test.name || '')
            .toLowerCase()
            .includes(query) ||
          String(test.type || '')
            .toLowerCase()
            .includes(query);
        const matchesStatus =
          statusFilter === 'all' ||
          status === statusFilter ||
          (statusFilter === 'attention' && summary?.attentionReasons?.length > 0) ||
          (statusFilter === 'winnerReady' && summary?.winnerReady);
        return matchesQuery && matchesStatus;
      }).length,
    [tests, overviewById, searchQuery, statusFilter]
  );

  const totalPages = Math.ceil(filteredCount / testsPerPage);

  const TestCard = ({ test }) => {
    const summary = overviewById.get(test.id) || {};
    const handleCardClick = () => {
      navigate(routes.testAnalytics(test.id));
    };
    const handleQuickAction = (event, path) => {
      event.stopPropagation();
      navigate(path);
    };

    // Calculate performance metrics
    const totalVisitors =
      summary.visitors ?? test.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) ?? 0;
    const totalConversions =
      summary.conversions ?? test.variants?.reduce((sum, v) => sum + (v.conversions || 0), 0) ?? 0;
    const totalRevenue =
      summary.revenue ?? test.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) ?? 0;
    const conversionRate =
      summary.conversionRate ?? (totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0);
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
    const testStatus = String(test.status || '').toLowerCase();

    return (
      <div className={`${styles.testCard} test-card-overview`} data-status={test.status}>
        <BlockStack gap="400">
          {/* Header Section - Synced with TestList */}
          <div
            className={styles.testCardHeader}
            onClick={handleCardClick}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                handleCardClick();
              }
            }}
          >
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
              {summary.winnerReady && <Badge tone="success">Winner Ready</Badge>}
              {summary.attentionReasons?.length > 0 && (
                <Badge tone="critical">Needs Attention</Badge>
              )}
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
              {totalVisitors === 0 && testStatus === 'running' && (
                <div className={styles.testCardWaiting}>
                  <Text variant="bodySm" color="subdued" as="span">
                    Waiting for traffic...
                  </Text>
                </div>
              )}
            </div>
          </div>
          {summary.attentionReasons?.length > 0 && (
            <div className={styles.testCardAlerts}>
              {summary.attentionReasons.slice(0, 3).map((reason, index) => (
                <span key={`${reason}-${index}`}>{reason}</span>
              ))}
            </div>
          )}
          <div className={styles.testCardActions}>
            <Button
              size="slim"
              onClick={event => handleQuickAction(event, routes.testAnalytics(test.id))}
            >
              Analytics
            </Button>
            <Button
              size="slim"
              onClick={event =>
                handleQuickAction(event, `${routes.testAnalytics(test.id)}?tab=funnel`)
              }
            >
              Funnel
            </Button>
            <Button
              size="slim"
              onClick={event =>
                handleQuickAction(event, `${routes.testAnalytics(test.id)}?tab=heatmap`)
              }
            >
              Heatmap
            </Button>
            <Button
              size="slim"
              onClick={event => handleQuickAction(event, routes.testExport(test.id))}
            >
              Export
            </Button>
          </div>
        </BlockStack>
      </div>
    );
  };

  const chartData = portfolioOverview?.chartData?.length
    ? portfolioOverview.chartData.map(row => ({
        ...row,
        'Selected Metric': pickOverviewMetric(row, chartMetric),
      }))
    : tests
        .filter(
          test =>
            (test.status || '').toLowerCase() === 'running' &&
            test.variants &&
            test.variants.length > 0
        )
        .map(test => {
          const totalVisitors = test.variants.reduce((sum, v) => sum + (v.visitors || 0), 0);
          const totalConversions = test.variants.reduce((sum, v) => sum + (v.conversions || 0), 0);
          const revenue = test.variants.reduce((sum, v) => sum + (Number(v.revenue) || 0), 0);
          const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
          const row = {
            visitors: totalVisitors,
            conversions: totalConversions,
            revenue,
            conversionRate,
            revenuePerVisitor: totalVisitors > 0 ? revenue / totalVisitors : 0,
            healthScore: Number(test.health?.score ?? test.quality_score) || 0,
          };

          return {
            name:
              (test.name || 'Unnamed').length > 15
                ? (test.name || 'Unnamed').substring(0, 15) + '...'
                : test.name || 'Unnamed',
            ...row,
            'Selected Metric': pickOverviewMetric(row, chartMetric),
          };
        });
  const statusRows = portfolioOverview?.statusRows || [];
  const typeRows = portfolioOverview?.typeRows || [];
  const maxStatusCount = Math.max(1, ...statusRows.map(row => Number(row.count) || 0));
  const maxTypeCount = Math.max(1, ...typeRows.map(row => Number(row.count) || 0));
  const readinessStages = [
    {
      label: 'Draft',
      value: portfolioTotals.statusCounts?.draft || 0,
      detail: 'Ideas ready to launch',
      tone: 'neutral',
    },
    {
      label: 'Running',
      value: portfolioTotals.statusCounts?.running || activeTests,
      detail: 'Collecting exposure data',
      tone: 'active',
    },
    {
      label: 'Healthy',
      value: portfolioOverview?.readiness?.healthyRunning || 0,
      detail: 'Running without risk flags',
      tone: 'good',
    },
    {
      label: 'Winner Ready',
      value: portfolioTotals.winnerReady || 0,
      detail: 'Likely rollout candidates',
      tone: 'winner',
    },
  ];
  const maxReadinessStage = Math.max(1, ...readinessStages.map(stage => Number(stage.value) || 0));
  const totalRiskFlags =
    (portfolioTotals.needsAttention || 0) +
    (portfolioTotals.srmRisks || 0) +
    (portfolioTotals.guardrailRisks || 0);
  const riskLevel =
    totalRiskFlags === 0
      ? 'Clear'
      : totalRiskFlags <= 2
        ? 'Watch'
        : totalRiskFlags <= 5
          ? 'Elevated'
          : 'High';
  const riskScore = Math.min(100, totalRiskFlags * 18);
  const performanceMapRows = (portfolioOverview?.topTests || []).slice(0, 6).map(row => ({
    ...row,
    visualSize: Math.max(36, Math.min(92, 36 + Math.sqrt(Number(row.visitors) || 0) * 1.2)),
    visualLift: Math.max(-35, Math.min(35, Number(row.bestVariant?.liftVsControl) || 0)),
  }));
  const portfolioMixRows = typeRows.slice(0, 8).map((row, index) => ({
    ...row,
    color: ['#06b6d4', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#6366f1', '#ec4899'][
      index % 8
    ],
    share: portfolioTotals.tests > 0 ? (Number(row.count) / portfolioTotals.tests) * 100 : 0,
  }));

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
            content: 'retry',
            onAction: () => {
              fetchTests();
              refetchOverview();
            },
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
                    Portfolio performance, decision readiness, and report shortcuts across{' '}
                    {portfolioTotals.tests || tests.length} test
                    {(portfolioTotals.tests || tests.length) !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className={styles.heroQuickStats}>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatValue}>
                      {portfolioTotals.statusCounts?.running || activeTests}
                    </span>
                    <span className={styles.heroStatLabel}>Active</span>
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatValue}>
                      {portfolioTotals.visitors.toLocaleString()}
                    </span>
                    <span className={styles.heroStatLabel}>Visitors</span>
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatValue}>
                      {formatCurrency(portfolioTotals.revenue)}
                    </span>
                    <span className={styles.heroStatLabel}>Revenue</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className={styles.overviewContent}>
            <Layout>
              {overviewError && (
                <Layout.Section>
                  <Banner tone="warning" title="Portfolio Analytics Summary Could Not Refresh">
                    <Text as="p" variant="bodySm">
                      The page is showing test-list fallback metrics. Retry to refresh readiness,
                      risks, and leaderboard data.
                    </Text>
                    <div style={{ marginTop: '0.75rem' }}>
                      <Button onClick={() => refetchOverview()}>Retry Portfolio Summary</Button>
                    </div>
                  </Banner>
                </Layout.Section>
              )}
              <Layout.Section>
                <div className={styles.commandCenter}>
                  <div className={styles.commandCenterMain}>
                    <div>
                      <span className={styles.commandEyebrow}>Analytics Command Center</span>
                      <h2>What Needs Action Now</h2>
                      <p>
                        Use this page as the portfolio layer: find ready winners, data quality
                        risks, low-traffic tests, and the reports worth opening next.
                      </p>
                    </div>
                    <div className={styles.commandActionCard}>
                      <span>Next Best Action</span>
                      <strong>
                        {nextAction
                          ? nextAction.winnerReady
                            ? 'Review winner'
                            : nextAction.attentionReasons?.[0] || 'Open test'
                          : tests.length === 0
                            ? 'Create your first test'
                            : 'Portfolio healthy'}
                      </strong>
                      <small>{nextAction?.name || 'No urgent analytics issues detected.'}</small>
                      <Button
                        onClick={() =>
                          nextAction
                            ? navigate(routes.testAnalytics(nextAction.id))
                            : navigate(routes.createTest)
                        }
                      >
                        {nextAction ? 'Open analytics' : 'Create test'}
                      </Button>
                    </div>
                  </div>
                  <div className={styles.commandMetricGrid}>
                    {[
                      {
                        label: 'Decision Ready',
                        value: portfolioTotals.winnerReady || 0,
                        detail: 'Tests with a likely winner',
                        tone: 'good',
                      },
                      {
                        label: 'Needs Traffic',
                        value: portfolioTotals.needsTraffic || 0,
                        detail: 'Running below sample target',
                        tone: 'warn',
                      },
                      {
                        label: 'SRM Risks',
                        value: portfolioTotals.srmRisks || 0,
                        detail: 'Allocation mismatch checks',
                        tone: portfolioTotals.srmRisks ? 'bad' : 'good',
                      },
                      {
                        label: 'Guardrail Risks',
                        value: portfolioTotals.guardrailRisks || 0,
                        detail: 'Potential business metric risk',
                        tone: portfolioTotals.guardrailRisks ? 'bad' : 'good',
                      },
                    ].map(item => (
                      <div
                        key={item.label}
                        className={`${styles.commandMetric} ${styles[`commandMetric_${item.tone}`]}`}
                      >
                        <span>{item.label}</span>
                        <strong>{item.value.toLocaleString()}</strong>
                        <small>{item.detail}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </Layout.Section>

              <Layout.Section>
                <div className={styles.visualCommandDeck}>
                  <div className={styles.readinessFlowCard}>
                    <div className={styles.sectionTitleRow}>
                      <div>
                        <Text variant="headingMd" as="h2">
                          Experiment Readiness Flow
                        </Text>
                        <Text variant="bodySm" color="subdued" as="p">
                          A visual path from test ideas to rollout candidates.
                        </Text>
                      </div>
                      <Badge tone={portfolioTotals.winnerReady ? 'success' : 'info'}>
                        {portfolioTotals.winnerReady || 0} ready
                      </Badge>
                    </div>
                    <div className={styles.readinessFlow}>
                      {readinessStages.map((stage, index) => (
                        <div
                          key={stage.label}
                          className={`${styles.readinessStage} ${styles[`readinessStage_${stage.tone}`]}`}
                        >
                          <span>{stage.label}</span>
                          <strong>{stage.value.toLocaleString()}</strong>
                          <div aria-hidden="true">
                            <i
                              style={{
                                width: `${Math.max(6, (stage.value / maxReadinessStage) * 100)}%`,
                              }}
                            />
                          </div>
                          <small>{stage.detail}</small>
                          {index < readinessStages.length - 1 && <b aria-hidden="true" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={styles.riskRadarCard}>
                    <div className={styles.sectionTitleRow}>
                      <div>
                        <Text variant="headingMd" as="h2">
                          Risk Radar
                        </Text>
                        <Text variant="bodySm" color="subdued" as="p">
                          Portfolio quality signals that can block confident decisions.
                        </Text>
                      </div>
                      <Badge tone={totalRiskFlags > 0 ? 'warning' : 'success'}>{riskLevel}</Badge>
                    </div>
                    <div className={styles.riskRadarBody}>
                      <div
                        className={styles.riskOrb}
                        style={{ '--risk-score': `${riskScore}%` }}
                        aria-label={`${riskLevel} analytics risk level`}
                      >
                        <strong>{riskLevel}</strong>
                        <span>{totalRiskFlags} flags</span>
                      </div>
                      <div className={styles.riskSignalRows}>
                        {[
                          ['Needs Attention', portfolioTotals.needsAttention || 0],
                          ['SRM Risk', portfolioTotals.srmRisks || 0],
                          ['Guardrail Risk', portfolioTotals.guardrailRisks || 0],
                          ['Needs Traffic', portfolioTotals.needsTraffic || 0],
                        ].map(([label, value]) => (
                          <div key={label} className={styles.riskSignalRow}>
                            <span>{label}</span>
                            <div>
                              <i style={{ width: `${Math.min(100, Math.max(4, value * 20))}%` }} />
                            </div>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {performanceMapRows.length > 0 && (
                    <div className={styles.performanceMapCard}>
                      <div className={styles.sectionTitleRow}>
                        <div>
                          <Text variant="headingMd" as="h2">
                            Portfolio Performance Map
                          </Text>
                          <Text variant="bodySm" color="subdued" as="p">
                            Larger bubbles have more traffic; vertical position reflects conversion
                            rate.
                          </Text>
                        </div>
                        <Badge tone="info">Top Tests</Badge>
                      </div>
                      <div className={styles.performanceMap} aria-label="Top tests performance map">
                        {performanceMapRows.map((row, index) => (
                          <button
                            key={row.id}
                            type="button"
                            className={styles.performanceBubble}
                            style={{
                              '--bubble-size': `${row.visualSize}px`,
                              '--bubble-left': `${Math.min(88, 8 + index * 15)}%`,
                              '--bubble-bottom': `${Math.min(78, Math.max(12, row.conversionRate * 8))}%`,
                            }}
                            onClick={() => navigate(routes.testAnalytics(row.id))}
                            title={`${row.name}: ${formatPercent(row.conversionRate)}, ${row.visitors.toLocaleString()} visitors`}
                          >
                            <span>{row.name.slice(0, 2).toUpperCase()}</span>
                          </button>
                        ))}
                        <div className={styles.performanceMapAxis}>
                          <span>Lower Rate</span>
                          <span>Higher Rate</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Layout.Section>

              {/* Summary Metrics */}
              <Layout.Section>
                <MetricGrid>
                  <MetricCard
                    title="Total Tests"
                    value={portfolioTotals.tests || tests.length}
                    subtitle={`${activeTests} active, ${completedTests} completed`}
                    tooltip="Total number of A/B tests"
                  />
                  <MetricCard
                    title="Total Visitors"
                    value={portfolioTotals.visitors.toLocaleString()}
                    subtitle="Across All Tests"
                    tooltip="Total visitors across all test variants"
                  />
                  <MetricCard
                    title="Total Conversions"
                    value={portfolioTotals.conversions.toLocaleString()}
                    subtitle={`${formatPercent(portfolioTotals.conversionRate)} conversion rate`}
                    tooltip="Total conversions across all tests"
                  />
                  <MetricCard
                    title="Total Revenue"
                    value={formatCurrency(portfolioTotals.revenue, 2)}
                    subtitle="From All Tests"
                    tooltip="Total revenue from all variants"
                  />
                </MetricGrid>
              </Layout.Section>

              {portfolioMixRows.length > 0 && (
                <Layout.Section>
                  <div className={styles.portfolioMixCard}>
                    <div className={styles.sectionTitleRow}>
                      <div>
                        <Text variant="headingMd" as="h2">
                          Portfolio Mix
                        </Text>
                        <Text variant="bodySm" color="subdued" as="p">
                          Test-type composition across this store&apos;s experiment portfolio.
                        </Text>
                      </div>
                      <Badge tone="info">{portfolioMixRows.length} types</Badge>
                    </div>
                    <div className={styles.portfolioMixVisual}>
                      <div
                        className={styles.portfolioMixStack}
                        aria-label="Portfolio type distribution"
                      >
                        {portfolioMixRows.map(row => (
                          <i
                            key={row.type}
                            style={{
                              width: `${Math.max(5, row.share)}%`,
                              background: row.color,
                            }}
                            title={`${row.type}: ${row.count} tests`}
                          />
                        ))}
                      </div>
                      <div className={styles.portfolioMixRows}>
                        {portfolioMixRows.map(row => (
                          <div key={row.type} className={styles.portfolioMixRow}>
                            <span style={{ '--mix-color': row.color }}>
                              <i />
                              <strong>{row.type}</strong>
                            </span>
                            <div>
                              <b
                                style={{
                                  width: `${Math.max(5, (row.count / maxTypeCount) * 100)}%`,
                                }}
                              />
                            </div>
                            <em>{row.count}</em>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Layout.Section>
              )}

              {statusRows.length > 0 && (
                <Layout.Section>
                  <div className={styles.statusPipeline}>
                    <div className={styles.sectionTitleRow}>
                      <div>
                        <Text variant="headingMd" as="h2">
                          Readiness Pipeline
                        </Text>
                        <Text variant="bodySm" color="subdued" as="p">
                          Status distribution across the experiment portfolio.
                        </Text>
                      </div>
                      {overviewLoading && <Badge tone="info">Refreshing</Badge>}
                    </div>
                    <div className={styles.statusRows}>
                      {statusRows.map(row => (
                        <div key={row.status} className={styles.statusRow}>
                          <span>{row.status}</span>
                          <div>
                            <i
                              style={{
                                width: `${Math.max(5, (row.count / maxStatusCount) * 100)}%`,
                              }}
                            />
                          </div>
                          <strong>{row.count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </Layout.Section>
              )}

              {/* Charts */}
              {chartData.length > 0 && (
                <Layout.Section>
                  <div className={`chart-container ${styles.chartCard}`}>
                    <div className={styles.chartHeader}>
                      <div>
                        <Text variant="headingLg" as="h2">
                          Active Tests Performance
                        </Text>
                        <Text variant="bodySm" color="subdued" as="p">
                          Compare running experiments by the metric that matters right now.
                        </Text>
                      </div>
                      <div className={styles.chartMetricSelect}>
                        <Select
                          label="Chart Metric"
                          options={OVERVIEW_METRIC_OPTIONS}
                          value={chartMetric}
                          onChange={value => updateOverviewParam('metric', value)}
                        />
                      </div>
                    </div>
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
                          dataKey="Selected Metric"
                          name={
                            OVERVIEW_METRIC_OPTIONS.find(option => option.value === chartMetric)
                              ?.label
                          }
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

              {(portfolioOverview?.attentionQueue?.length > 0 ||
                portfolioOverview?.topTests?.length > 0) && (
                <Layout.Section>
                  <div className={styles.insightGrid}>
                    {portfolioOverview?.attentionQueue?.length > 0 && (
                      <div className={styles.insightCard}>
                        <div className={styles.sectionTitleRow}>
                          <div>
                            <Text variant="headingMd" as="h2">
                              Needs Attention
                            </Text>
                            <Text variant="bodySm" color="subdued" as="p">
                              Highest-impact tests with analytics quality or decision risks.
                            </Text>
                          </div>
                          <Badge tone="critical">
                            {portfolioOverview.attentionQueue.length} flagged
                          </Badge>
                        </div>
                        <div className={styles.insightRows}>
                          {portfolioOverview.attentionQueue.slice(0, 5).map(row => (
                            <button
                              key={row.id}
                              type="button"
                              className={styles.insightRow}
                              onClick={() => navigate(routes.testAnalytics(row.id))}
                            >
                              <span>
                                <strong>{row.name}</strong>
                                <small>{row.attentionReasons.join(' • ')}</small>
                              </span>
                              <b>{row.visitors.toLocaleString()} visitors</b>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {portfolioOverview?.topTests?.length > 0 && (
                      <div className={styles.insightCard}>
                        <div className={styles.sectionTitleRow}>
                          <div>
                            <Text variant="headingMd" as="h2">
                              Top Tests
                            </Text>
                            <Text variant="bodySm" color="subdued" as="p">
                              Revenue and conversion leaders worth reviewing.
                            </Text>
                          </div>
                          <Badge tone="success">Leaderboard</Badge>
                        </div>
                        <div className={styles.insightRows}>
                          {portfolioOverview.topTests.slice(0, 5).map(row => (
                            <button
                              key={row.id}
                              type="button"
                              className={styles.insightRow}
                              onClick={() => navigate(routes.testAnalytics(row.id))}
                            >
                              <span>
                                <strong>{row.name}</strong>
                                <small>{formatPercent(row.conversionRate)} conversion rate</small>
                              </span>
                              <b>{formatCurrency(row.revenue)}</b>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
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
                          Showing {paginatedTests.length} of {filteredCount} matching tests
                        </Text>
                      </BlockStack>
                      <InlineStack gap="200">
                        <Button onClick={() => navigate(routes.tests)} variant="secondary">
                          View All Tests
                        </Button>
                        <Button onClick={() => navigate(routes.createTest)}>Create Test</Button>
                      </InlineStack>
                    </InlineStack>

                    <div className={styles.filterPanel}>
                      <TextField
                        label="Search Tests"
                        value={searchQuery}
                        onChange={value => updateOverviewParam('q', value)}
                        autoComplete="off"
                        placeholder="Search by test name or type"
                      />
                      <Select
                        label="Status"
                        options={STATUS_FILTER_OPTIONS}
                        value={statusFilter}
                        onChange={value => updateOverviewParam('status', value)}
                      />
                      <Select
                        label="Sort By"
                        options={SORT_OPTIONS}
                        value={sortBy}
                        onChange={value => updateOverviewParam('sort', value)}
                      />
                    </div>

                    {loading ? (
                      <LoadingSkeleton type="table" count={3} />
                    ) : tests.length === 0 ? (
                      <EmptyState
                        heading="Create Your First AB Test"
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
                        {paginatedTests.length > 0 ? (
                          paginatedTests.map(test => <TestCard key={test.id} test={test} />)
                        ) : (
                          <div className={styles.emptyChart}>
                            <Text variant="bodyMd" color="subdued" as="p">
                              No tests match the current analytics filters.
                            </Text>
                          </div>
                        )}

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
