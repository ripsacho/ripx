/**
 * Analytics Component
 *
 * Enhanced analytics dashboard with Intelligems-style metrics and visualizations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Page,
  Card,
  Layout,
  DataTable,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  ProgressBar,
  Modal,
  Banner,
  Button,
  Icon,
} from '@shopify/polaris';
import {
  EyeFirstIcon,
  ExportIcon,
  LinkIcon,
  RefreshIcon,
  StarFilledIcon,
} from '@shopify/polaris-icons';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Toast from '../Toast/Toast';
import pageShell from '../Shared/PageShell.module.css';
import styles from './Analytics.module.css';
import { getTestTypeDisplay } from '../../utils/testType';
import { setupDataTableButtonStyling } from '../../utils/dataTableStyles';
import { apiPut } from '../../services';
import { useAnalyticsDashboard, useInvalidateAnalytics, useAppRoutes } from '../../hooks';
import { coerceAnalyticsSegment, coerceAnalyticsTab } from '../../hooks/analyticsQueryString';
import { MetricCard, MetricGrid, TooltipWrapper } from '../Shared';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Select } from '@shopify/polaris';
import HeatmapView from './HeatmapView';
import FunnelView from './FunnelView';
import EventExplorer from './EventExplorer';
import { CHART_PALETTE } from '../../constants';
import {
  CHECKOUT_SECTION_EVENT_DEFINITIONS,
  formatCheckoutSectionEventLabel,
  formatCheckoutSectionTypeLabel,
} from '../../utils/checkoutReporting';
import {
  formatGoalBusinessMetricValue,
  getGoalBusinessMetricValue,
  getGoalCogsProfit,
  getGoalMetricLabel,
  resolveGoalMetricSelections,
} from '../../utils/goalMetricConfig';

const COLORS = CHART_PALETTE;
const ANALYTICS_TABS = ['overview', 'funnel', 'heatmap', 'events'];
const TAB_INDEX_BY_PARAM = ANALYTICS_TABS.reduce((acc, tab, index) => {
  acc[tab] = index;
  return acc;
}, {});

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid rgba(6, 182, 212, 0.25)',
  borderRadius: '12px',
  padding: '12px 16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
  color: 'var(--text-primary)',
  backdropFilter: 'blur(12px)',
};

const PRIMARY_METRIC_LABELS = {
  aov: 'Average order value',
  average_order_value: 'Average order value',
  conversion_rate: 'Conversion rate',
  conversions: 'Conversions',
  profit_per_visitor: 'Profit per visitor',
  revenue: 'Revenue',
  revenue_per_visitor: 'Revenue per visitor',
};

const TIME_SERIES_METRIC_OPTIONS = [
  { label: 'Conversion rate', value: 'conversionRate' },
  { label: 'Revenue', value: 'revenue' },
  { label: 'Revenue / visitor', value: 'revenuePerVisitor' },
  { label: 'Cumulative lift', value: 'cumulativeLift' },
  { label: 'Visitors', value: 'visitors' },
  { label: 'Conversions', value: 'conversions' },
];

const TIME_SERIES_METRIC_LABELS = TIME_SERIES_METRIC_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

function formatCurrency(value) {
  return `$${(Number(value) || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeAnalyticsEventName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

function formatCompactNumber(value) {
  return (Number(value) || 0).toLocaleString(undefined, {
    notation: Math.abs(Number(value) || 0) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  });
}

function formatSignedPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'N/A';
  }
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(1)}%`;
}

function getCheckoutDiagnosticRepair(reason) {
  const normalized = String(reason || '')
    .trim()
    .toLowerCase();
  const repairs = {
    assignment_fetch_failed:
      'Check assignment URL, tunnel/deploy URL, secret alignment, and shop domain.',
    no_assignment:
      'Confirm the test is running and checkout cart attributes include the test context.',
    no_renderable_checkout_sections:
      'Add enabled content to at least one non-control checkout section.',
    collection_products_not_hydrated:
      'Verify read_products scope, selected collection GIDs, and Admin API product access.',
    cart_line_api_unavailable:
      'Keep product lists display-only or confirm checkout cart-line changes are available.',
    discount_code_api_unavailable:
      'Confirm discount-code changes are permitted in this checkout context.',
    discount_code_apply_failed:
      'Verify the generated discount code exists and applies to this cart.',
    discount_code_apply_exception: 'Review checkout extension logs and discount API availability.',
  };
  return (
    repairs[normalized] || 'Review the checkout runtime event metadata for the failing section.'
  );
}

function getCheckoutProductRepair(row = {}) {
  const failures = Number(row.addFailures) || 0;
  const attempts = Number(row.addAttempts) || 0;
  const impressions = Number(row.impressions) || 0;
  if (failures > 0) {
    return 'High failed adds: verify merchandise IDs, product availability, and cart-line API support.';
  }
  if (attempts === 0 && impressions > 20) {
    return 'No add attempts yet: test stronger product copy, action label, or product relevance.';
  }
  if ((Number(row.clickRate) || 0) < 1 && impressions > 50) {
    return 'Low click rate: review product rank, badge, price copy, and offer strategy.';
  }
  return 'Healthy enough for monitoring; compare against section and variant-level lift.';
}

function getConfiguredVariant(testInfo, variant) {
  const configuredVariants = Array.isArray(testInfo?.variants) ? testInfo.variants : [];
  return configuredVariants.find(item => {
    const configuredId = item?.id ?? item?.variant_id;
    return (
      (configuredId !== undefined && String(configuredId) === String(variant.id)) ||
      (item?.name && variant?.name && String(item.name) === String(variant.name))
    );
  });
}

function getEffectAxisPosition(value, maxAbs) {
  if (!Number.isFinite(Number(value)) || !maxAbs) return 50;
  return Math.max(0, Math.min(100, 50 + (Number(value) / maxAbs) * 50));
}

function Analytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const routes = useAppRoutes();
  const [segmentDevice, setSegmentDevice] = useState(() => searchParams.get('device') || 'all');
  const [segmentCountry, setSegmentCountry] = useState(() => searchParams.get('country') || 'all');
  const [selectedTab, setSelectedTab] = useState(
    () => TAB_INDEX_BY_PARAM[searchParams.get('tab')] ?? 0
  );
  const [successMessage, setSuccessMessage] = useState(null);
  const [promoteError, setPromoteError] = useState(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState(false);
  const [reportRefreshSignal, setReportRefreshSignal] = useState(0);
  const [timeSeriesMetric, setTimeSeriesMetric] = useState('conversionRate');

  const invalidateAnalytics = useInvalidateAnalytics(id);
  const {
    data,
    isLoading: loading,
    isError,
    error,
    refetch: fetchAnalytics,
  } = useAnalyticsDashboard(id, segmentDevice, segmentCountry);

  const analytics = data?.analytics ?? null;
  const timeSeries = data?.timeSeries ?? null;
  const timeSeriesAnnotations = data?.timeSeriesAnnotations ?? [];
  const testInfo = data?.testInfo ?? null;
  const decision = data?.decision ?? null;
  const segmentOptions = data?.segments ?? { devices: [], countries: [] };
  const segmentBreakdowns = data?.segmentBreakdowns ?? { device: [], country: [] };
  const cohorts = data?.cohorts ?? [];

  useEffect(() => {
    if (!id || id === 'undefined') {
      navigate(routes.tests);
    }
  }, [id, navigate, routes.tests]);

  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [analytics]);

  const updateAnalyticsSearch = useCallback(
    updates => {
      setSearchParams(
        current => {
          const next = new URLSearchParams(current);
          Object.entries(updates).forEach(([key, value]) => {
            if (!value || value === 'all') {
              next.delete(key);
            } else {
              next.set(key, value);
            }
          });
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const handleSelectTab = tabIndex => {
    setSelectedTab(tabIndex);
    updateAnalyticsSearch({ tab: ANALYTICS_TABS[tabIndex] || 'overview' });
  };

  const handleSegmentDeviceChange = value => {
    setSegmentDevice(value);
    updateAnalyticsSearch({ device: value });
  };

  const handleSegmentCountryChange = value => {
    setSegmentCountry(value);
    updateAnalyticsSearch({ country: value });
  };

  const handleRefreshReports = useCallback(() => {
    setReportRefreshSignal(value => value + 1);
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const tabSlug = coerceAnalyticsTab(tabParam, ANALYTICS_TABS);
    const nextTab = TAB_INDEX_BY_PARAM[tabSlug] ?? 0;
    if (tabParam && tabParam !== tabSlug) {
      updateAnalyticsSearch({ tab: 'overview' });
    }
    if (selectedTab !== nextTab) {
      setSelectedTab(nextTab);
    }
    const nextDevice = searchParams.get('device') || 'all';
    const nextCountry = searchParams.get('country') || 'all';
    if (segmentDevice !== nextDevice) {
      setSegmentDevice(nextDevice);
    }
    if (segmentCountry !== nextCountry) {
      setSegmentCountry(nextCountry);
    }
  }, [searchParams, segmentCountry, segmentDevice, selectedTab, updateAnalyticsSearch]);

  useEffect(() => {
    const validDevices = new Set(segmentOptions.devices || []);
    const validCountries = new Set(segmentOptions.countries || []);
    const next = {};
    if (
      segmentDevice !== 'all' &&
      validDevices.size > 0 &&
      coerceAnalyticsSegment(segmentDevice, segmentOptions.devices) === 'all'
    ) {
      setSegmentDevice('all');
      next.device = 'all';
    }
    if (
      segmentCountry !== 'all' &&
      validCountries.size > 0 &&
      coerceAnalyticsSegment(segmentCountry, segmentOptions.countries) === 'all'
    ) {
      setSegmentCountry('all');
      next.country = 'all';
    }
    if (Object.keys(next).length > 0) {
      updateAnalyticsSearch(next);
    }
  }, [
    segmentOptions.devices,
    segmentOptions.countries,
    segmentDevice,
    segmentCountry,
    updateAnalyticsSearch,
  ]);

  if (loading) {
    return (
      <div className={`${pageShell.page} ${styles.analyticsPage}`}>
        <Page title="Loading analytics">
          <BlockStack gap="400">
            <div className={styles.skeletonHero} />
            <div className={styles.statsGrid}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className={styles.skeletonMetric} />
              ))}
            </div>
            <div className={styles.skeletonChart} />
          </BlockStack>
        </Page>
      </div>
    );
  }

  const errorMessage = isError
    ? error?.response?.data?.error || error?.message || 'Failed to load analytics'
    : null;

  if (errorMessage || (!loading && !analytics)) {
    return (
      <div className={pageShell.page}>
        <Toast
          message={errorMessage || 'No analytics data available'}
          type="error"
          onClose={() => {}}
          duration={5000}
        />
        <Page
          title={testInfo?.name || 'Test Analytics'}
          subtitle="Analytics"
          breadcrumbs={[
            { content: 'All Tests', onAction: () => navigate(routes.tests) },
            testInfo?.id
              ? {
                  content: testInfo.name || 'Test Details',
                  onAction: () => navigate(routes.testDetail(testInfo.id)),
                }
              : { content: 'Test Details', onAction: () => navigate(routes.testDetail(id)) },
          ]}
          primaryAction={{
            content: 'Retry',
            onAction: () => fetchAnalytics(),
          }}
        >
          <Card sectioned>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                {errorMessage || 'No analytics data available.'} Check that the test has run and has
                visitor data.
              </Text>
            </BlockStack>
          </Card>
        </Page>
      </div>
    );
  }

  const variants = Array.isArray(analytics?.variants) ? analytics.variants : [];
  const analyticsError = analytics?.error;
  const checkoutSectionEventNames = Array.isArray(analytics?.checkoutSectionEventNames)
    ? analytics.checkoutSectionEventNames
    : [];
  const checkoutAdvanced = analytics?.checkoutAdvanced || null;
  const checkoutJourneySteps = Array.isArray(checkoutAdvanced?.journeySteps)
    ? checkoutAdvanced.journeySteps
    : [];
  const checkoutSectionRows = Array.isArray(checkoutAdvanced?.sectionPerformanceRows)
    ? checkoutAdvanced.sectionPerformanceRows
    : [];
  const checkoutProductRows = Array.isArray(checkoutAdvanced?.productPerformanceRows)
    ? checkoutAdvanced.productPerformanceRows
    : [];
  const hasCheckoutAdvancedSignals = Boolean(
    checkoutAdvanced &&
    (checkoutSectionRows.length > 0 ||
      checkoutProductRows.length > 0 ||
      Number(checkoutAdvanced?.signalTotals?.totalCheckoutEvents || 0) > 0)
  );
  const checkoutDiagnosticRows = Array.isArray(checkoutAdvanced?.diagnostics)
    ? checkoutAdvanced.diagnostics
    : [];
  const checkoutMethodActionRows = Array.isArray(checkoutAdvanced?.methodActions)
    ? checkoutAdvanced.methodActions
    : [];
  const checkoutMaxJourneyTotal = Math.max(
    1,
    ...checkoutJourneySteps.map(step => Number(step.total) || 0)
  );
  const goalConfig =
    testInfo?.goal && typeof testInfo.goal === 'string'
      ? (() => {
          try {
            return JSON.parse(testInfo.goal);
          } catch (_) {
            return {};
          }
        })()
      : testInfo?.goal || {};
  const secondaryGoalConfigByEvent = new Map(
    (Array.isArray(goalConfig.secondary) ? goalConfig.secondary : [])
      .map(goal => {
        const eventName = typeof goal === 'object' ? goal.event_name || goal.eventName : goal;
        return eventName
          ? [eventName, typeof goal === 'object' ? goal : { event_name: eventName }]
          : null;
      })
      .filter(Boolean)
  );
  const { primaryMetric, secondaryMetric } = resolveGoalMetricSelections(goalConfig);
  const primaryMetricLabel =
    PRIMARY_METRIC_LABELS[primaryMetric] || getGoalMetricLabel(primaryMetric);
  const secondaryMetricLabel = secondaryMetric
    ? PRIMARY_METRIC_LABELS[secondaryMetric] || getGoalMetricLabel(secondaryMetric)
    : null;
  const isConversionPrimaryMetric =
    primaryMetric === 'conversion_rate' || primaryMetric === 'conversions';
  const significanceContextLabel = isConversionPrimaryMetric
    ? secondaryMetricLabel
      ? `conversion-rate inference with ${secondaryMetricLabel.toLowerCase()} secondary readout`
      : 'conversion-rate inference'
    : secondaryMetricLabel
      ? `primary metric leader with ${secondaryMetricLabel.toLowerCase()} secondary readout`
      : 'primary metric leader with conversion-rate inference';
  const variantsWithBusinessMetrics = variants.map(variant => {
    const visitors = Number(variant.visitors) || 0;
    const revenue = Number(variant.revenue) || 0;
    const profit = getGoalCogsProfit(variant, goalConfig);
    return {
      ...variant,
      revenuePerVisitor:
        Number(variant.revenuePerVisitor) || (visitors > 0 ? revenue / visitors : 0),
      profit,
      profitPerVisitor: Number(variant.profitPerVisitor) || (visitors > 0 ? profit / visitors : 0),
      primaryMetricValue: getGoalBusinessMetricValue(variant, primaryMetric, goalConfig),
      secondaryMetricValue: secondaryMetric
        ? getGoalBusinessMetricValue(variant, secondaryMetric, goalConfig)
        : null,
    };
  });

  const chartData = variantsWithBusinessMetrics.map((v, index) => ({
    name: v.name || `Variant ${index + 1}`,
    'Conversion Rate': parseFloat((v.conversionRate ?? 0).toFixed(2)),
    Revenue: parseFloat((v.revenue ?? 0).toFixed(2)),
    'Primary Metric': parseFloat((v.primaryMetricValue ?? 0).toFixed(2)),
    Visitors: v.visitors,
    Conversions: v.conversions,
    color: COLORS[index % COLORS.length],
  }));

  const bestVariant = variantsWithBusinessMetrics.reduce((best, current) => {
    if (!best) return current;
    return current.primaryMetricValue > best.primaryMetricValue ? current : best;
  }, null);

  const sig = analytics.significance;
  let winner = null;
  if (sig?.winner) {
    if (sig.winner === 'variantA') {
      winner = variantsWithBusinessMetrics[0] || null;
    } else if (sig.winner === 'variantB') {
      winner = variantsWithBusinessMetrics[1] || null;
    } else if (sig.winner === 'best' && (sig.winnerVariantId || sig.bestVariantId)) {
      winner =
        variantsWithBusinessMetrics.find(
          v => v.id === (sig.winnerVariantId || sig.bestVariantId)
        ) || null;
    }
  }

  const promoteCandidate = winner || bestVariant;

  const tableRows = variantsWithBusinessMetrics.map((variant, index) => {
    const row = [
      <InlineStack key={variant.id || `v-${index}`} gap="200" align="start">
        <div
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            backgroundColor: COLORS[index % COLORS.length],
            marginTop: '4px',
          }}
        />
        <Text variant="bodyMd" fontWeight="semibold" as="span">
          {variant.name}
        </Text>
        {promoteCandidate && variant.id === promoteCandidate.id && (
          <Badge tone={winner ? 'success' : 'info'}>{winner ? 'Winner' : 'Leading'}</Badge>
        )}
      </InlineStack>,
      (variant.visitors ?? 0).toLocaleString(),
      (variant.conversions ?? 0).toLocaleString(),
      `${(variant.conversionRate ?? 0).toFixed(2)}%`,
      formatCurrency(variant.revenue),
      formatCurrency(variant.revenuePerVisitor),
      formatCurrency(variant.profitPerVisitor),
      formatCurrency(variant.avgOrderValue),
      formatGoalBusinessMetricValue(variant.primaryMetricValue, primaryMetric),
    ];
    if (secondaryMetric) {
      row.push(formatGoalBusinessMetricValue(variant.secondaryMetricValue, secondaryMetric));
    }
    return row;
  });
  const variantTableHeadings = [
    'Variant',
    'Visitors',
    'Conversions',
    'Conversion Rate',
    'Revenue',
    'RPV',
    'PPV',
    'AOV',
    'Primary Metric',
  ];
  if (secondaryMetric) {
    variantTableHeadings.push(secondaryMetricLabel);
  }
  const variantTableColumnTypes = [
    'text',
    'numeric',
    'numeric',
    'numeric',
    'numeric',
    'numeric',
    'numeric',
    'numeric',
    'numeric',
  ];
  if (secondaryMetric) {
    variantTableColumnTypes.push('numeric');
  }

  const totalVisitors = variants.reduce((sum, v) => sum + (v.visitors || 0), 0);
  const totalConversions = variants.reduce((sum, v) => sum + (v.conversions || 0), 0);
  const totalRevenue = variants.reduce((sum, v) => sum + (v.revenue || 0), 0);
  const totalProfit = variantsWithBusinessMetrics.reduce((sum, v) => sum + (v.profit || 0), 0);
  const overallConversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
  const overallRevenuePerVisitor = totalVisitors > 0 ? totalRevenue / totalVisitors : 0;
  const overallProfitPerVisitor = totalVisitors > 0 ? totalProfit / totalVisitors : 0;
  const overallAov = totalConversions > 0 ? totalRevenue / totalConversions : 0;
  const targeting = testInfo?.segments || {};
  const targetingCountries =
    Array.isArray(targeting.countries) && targeting.countries.length > 0
      ? targeting.countries.join(', ')
      : 'All countries';
  const holdoutPercent = Number(testInfo?.holdout_percent || 0);
  const holdoutRemainder = Math.max(0, 100 - holdoutPercent);
  const controlVariant =
    variantsWithBusinessMetrics.find(v => String(v.name || '').toLowerCase() === 'control') ||
    variantsWithBusinessMetrics[0] ||
    null;
  const leaderLift =
    promoteCandidate && controlVariant && promoteCandidate.id !== controlVariant.id
      ? controlVariant.primaryMetricValue
        ? ((promoteCandidate.primaryMetricValue - controlVariant.primaryMetricValue) /
            Math.abs(controlVariant.primaryMetricValue)) *
          100
        : null
      : null;
  const expectedEqualAllocation =
    variantsWithBusinessMetrics.length > 0 ? 100 / variantsWithBusinessMetrics.length : 0;
  const allocationRows = variantsWithBusinessMetrics.map((variant, index) => {
    const configuredVariant = getConfiguredVariant(testInfo, variant);
    const expectedAllocation = Number(
      configuredVariant?.allocation ??
        configuredVariant?.traffic_allocation ??
        variant.allocation ??
        expectedEqualAllocation
    );
    const observedAllocation =
      totalVisitors > 0 ? ((Number(variant.visitors) || 0) / totalVisitors) * 100 : 0;
    return {
      id: variant.id || `variant-${index}`,
      name: variant.name || `Variant ${index + 1}`,
      visitors: Number(variant.visitors) || 0,
      expectedAllocation: Number.isFinite(expectedAllocation)
        ? expectedAllocation
        : expectedEqualAllocation,
      observedAllocation,
      delta:
        observedAllocation -
        (Number.isFinite(expectedAllocation) ? expectedAllocation : expectedEqualAllocation),
      color: COLORS[index % COLORS.length],
    };
  });
  const maxVariantVisitors = Math.max(1, ...allocationRows.map(row => row.visitors));
  const variantScorecards = variantsWithBusinessMetrics.map((variant, index) => {
    const visitors = Number(variant.visitors) || 0;
    const conversions = Number(variant.conversions) || 0;
    const conversionRate = Number(variant.conversionRate) || 0;
    const controlMetric = Number(controlVariant?.primaryMetricValue) || 0;
    const lift =
      controlVariant && variant.id !== controlVariant.id && controlMetric !== 0
        ? ((Number(variant.primaryMetricValue) - controlMetric) / Math.abs(controlMetric)) * 100
        : null;
    return {
      id: variant.id || `variant-score-${index}`,
      name: variant.name || `Variant ${index + 1}`,
      color: COLORS[index % COLORS.length],
      visitors,
      conversions,
      conversionRate,
      primaryMetricValue: Number(variant.primaryMetricValue) || 0,
      secondaryMetricValue:
        secondaryMetric && variant.secondaryMetricValue !== null
          ? Number(variant.secondaryMetricValue) || 0
          : null,
      revenuePerVisitor: Number(variant.revenuePerVisitor) || 0,
      profitPerVisitor: Number(variant.profitPerVisitor) || 0,
      lift,
      isLeader: promoteCandidate?.id === variant.id,
      isControl: controlVariant?.id === variant.id,
    };
  });
  const totalGoalEventRows = Object.values(analytics.secondaryEventStats || {}).reduce(
    (sum, stats) => sum + (Number(stats?.totalEvents) || 0),
    0
  );
  const detectedEventNames = analytics.secondaryEventNames?.length || 0;
  const segmentScopeLabel = [
    segmentDevice && segmentDevice !== 'all' ? `Device: ${segmentDevice}` : null,
    segmentCountry && segmentCountry !== 'all' ? `Country: ${segmentCountry}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const configuredGoalCount = Array.isArray(goalConfig.secondary) ? goalConfig.secondary.length : 0;
  const configuredGoalEventNames = new Set(
    (Array.isArray(goalConfig.secondary) ? goalConfig.secondary : [])
      .map(goal =>
        normalizeAnalyticsEventName(
          typeof goal === 'object' ? goal.event_name || goal.eventName : goal
        )
      )
      .filter(Boolean)
  );
  const detectedGoalStats = Array.from(configuredGoalEventNames).filter(
    eventName => (Number(analytics.secondaryEventStats?.[eventName]?.totalEvents) || 0) > 0
  ).length;
  const configuredFunnelSteps = Array.isArray(goalConfig.funnel_steps)
    ? goalConfig.funnel_steps.length
    : 0;
  const funnelSignalCount = analytics.secondaryEventNames?.length || detectedGoalStats;
  const funnelReady =
    totalVisitors > 0 &&
    (configuredFunnelSteps > 0 || funnelSignalCount > 0 || totalConversions > 0);
  const reportPreviewCards = [
    {
      key: 'funnel',
      title: 'Funnel Snapshot',
      label: funnelReady ? 'Ready' : 'Needs signal',
      value: configuredFunnelSteps
        ? `${configuredFunnelSteps} steps`
        : `${totalConversions.toLocaleString()} conversions`,
      detail: funnelReady
        ? 'Open the full funnel to inspect step drop-offs by variant.'
        : 'Configure funnel steps or collect conversion events to unlock drop-off charts.',
      tabIndex: 1,
      tone: funnelReady ? 'good' : 'warn',
      bars: [
        { label: 'Visitors', value: totalVisitors },
        { label: 'Conversions', value: totalConversions },
      ],
    },
    {
      key: 'heatmap',
      title: 'Heatmap Snapshot',
      label: totalVisitors > 0 ? 'Collecting' : 'Waiting',
      value: totalVisitors > 0 ? `${totalVisitors.toLocaleString()} visitors` : 'No traffic',
      detail:
        'Open the heatmap for click density, scroll depth, screenshots, and page-level behavior.',
      tabIndex: 2,
      tone: totalVisitors > 0 ? 'good' : 'neutral',
      bars: [
        { label: 'Traffic', value: totalVisitors },
        { label: 'Events', value: totalGoalEventRows },
      ],
    },
    {
      key: 'events',
      title: 'Event Signal Snapshot',
      label: configuredGoalCount ? `${detectedGoalStats}/${configuredGoalCount}` : 'No goals',
      value: `${formatCompactNumber(totalGoalEventRows)} rows`,
      detail: configuredGoalCount
        ? 'Open Events to review collection health, snippets, and per-variant event distribution.'
        : 'Add goal events to unlock signal scorecards and event health graphs.',
      tabIndex: 3,
      tone: configuredGoalCount && detectedGoalStats >= configuredGoalCount ? 'good' : 'warn',
      bars: [
        { label: 'Detected', value: detectedGoalStats },
        { label: 'Configured', value: configuredGoalCount || detectedEventNames },
      ],
    },
  ];
  const chartTimeSeries = Array.isArray(timeSeries)
    ? timeSeries.map(point => {
        const nextPoint = { ...point };
        variants.forEach(variant => {
          const variantName = variant.name;
          const bucket = variantName ? point?.[variantName] : null;
          if (bucket && typeof bucket === 'object') {
            const visitors = Number(bucket.visitors) || 0;
            const revenue = Number(bucket.revenue) || 0;
            nextPoint[variantName] = {
              ...bucket,
              revenuePerVisitor: visitors > 0 ? revenue / visitors : 0,
            };
          }
        });
        return nextPoint;
      })
    : [];
  const annotationsByDate = new Map(
    chartTimeSeries.map(point => [point.date, point.name || point.date])
  );
  const chartAnnotations = Array.isArray(timeSeriesAnnotations)
    ? timeSeriesAnnotations
        .map(annotation => ({
          ...annotation,
          x: annotationsByDate.get(annotation.date),
        }))
        .filter(annotation => annotation.x)
        .slice(0, 6)
    : [];
  const segmentComparisonRows = [
    ...(segmentBreakdowns.device || []).map(row => ({ ...row, group: 'Device' })),
    ...(segmentBreakdowns.country || []).map(row => ({ ...row, group: 'Country' })),
  ]
    .filter(row => row.totalVisitors > 0)
    .sort((a, b) => b.totalVisitors - a.totalVisitors)
    .slice(0, 8);
  const maxSegmentVisitors = Math.max(
    1,
    ...segmentComparisonRows.map(row => Number(row.totalVisitors) || 0)
  );
  const cohortRows = Array.isArray(cohorts)
    ? cohorts
        .filter(row => Number(row.visitors) > 0)
        .slice(-12)
        .map(row => ({
          ...row,
          conversionRate: Number(row.conversionRate) || 0,
          visitors: Number(row.visitors) || 0,
          conversions: Number(row.conversions) || 0,
        }))
    : [];
  const maxCohortVisitors = Math.max(1, ...cohortRows.map(row => row.visitors));
  const reportReadiness = [
    {
      label: 'Overview',
      tabIndex: 0,
      status: totalVisitors > 0 ? 'Ready' : 'Waiting',
      detail: `${totalVisitors.toLocaleString()} visitors`,
      ready: totalVisitors > 0,
    },
    {
      label: 'Funnel',
      tabIndex: 1,
      status: funnelReady ? 'Tracking' : totalVisitors > 0 ? 'Needs steps' : 'Waiting',
      detail: configuredFunnelSteps
        ? `${configuredFunnelSteps} configured steps`
        : funnelSignalCount
          ? `${funnelSignalCount} event signals`
          : `${totalConversions.toLocaleString()} conversions`,
      ready: funnelReady,
    },
    {
      label: 'Heatmap',
      tabIndex: 2,
      status: totalVisitors > 0 ? 'Open' : 'Waiting',
      detail: totalVisitors > 0 ? 'inspect page behavior' : 'needs traffic first',
      ready: false,
    },
    {
      label: 'Events',
      tabIndex: 3,
      status: configuredGoalCount ? `${detectedGoalStats}/${configuredGoalCount}` : 'No goals',
      detail: configuredGoalCount ? 'configured detected' : 'add goals to report',
      ready: configuredGoalCount === 0 ? false : detectedGoalStats >= configuredGoalCount,
    },
  ];
  const readyReportCount = reportReadiness.filter(report => report.ready).length;
  const activeReport = reportReadiness[selectedTab] || reportReadiness[0];
  const activeReportDescription = [
    selectedTab === 0 &&
      'Summary dashboard with scorecards, traffic quality, charts, and report previews',
    selectedTab === 1 && 'Conversion funnel by variant with date range',
    selectedTab === 2 && 'Click and scroll heatmap by page, variant, and date',
    selectedTab === 3 && 'Browse and filter tracked events',
  ].find(Boolean);
  const analyticsHealthScore = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        (totalVisitors > 0 ? 30 : 0) +
          (totalConversions > 0 ? 20 : 0) +
          (analytics.srm?.detected ? 0 : 20) +
          (configuredGoalCount > 0
            ? Math.min(20, (detectedGoalStats / Math.max(1, configuredGoalCount)) * 20)
            : 10) +
          (winner ? 10 : 0)
      )
    )
  );
  const analyticsHealthLabel =
    analyticsHealthScore >= 85
      ? 'Decision ready'
      : analyticsHealthScore >= 65
        ? 'Healthy'
        : analyticsHealthScore >= 35
          ? 'Building evidence'
          : 'Needs data';
  const promotionReadiness = decision?.promotionReadiness || null;
  const promotionBlockers = Array.isArray(promotionReadiness?.blockers)
    ? promotionReadiness.blockers
    : [];
  const promotionWarnings = Array.isArray(promotionReadiness?.warnings)
    ? promotionReadiness.warnings
    : [];
  const promotionBlocked = promotionBlockers.length > 0;
  const confidenceInterval = sig?.confidenceInterval || {};
  const controlConversionRate = Number(controlVariant?.conversionRate) || 0;
  const effectRows = variantScorecards
    .filter(card => !card.isControl)
    .map((card, index) => {
      const ciKey = index === 0 ? 'variantB' : `variant${index + 2}`;
      const ci = confidenceInterval?.[ciKey];
      const ciLow =
        ci && controlConversionRate > 0
          ? ((Number(ci.low) - controlConversionRate) / Math.abs(controlConversionRate)) * 100
          : null;
      const ciHigh =
        ci && controlConversionRate > 0
          ? ((Number(ci.high) - controlConversionRate) / Math.abs(controlConversionRate)) * 100
          : null;
      return {
        ...card,
        ciLow: Number.isFinite(ciLow) ? ciLow : null,
        ciHigh: Number.isFinite(ciHigh) ? ciHigh : null,
        evidenceLabel:
          card.lift === null
            ? 'Needs baseline'
            : winner?.id === card.id
              ? 'Significant winner'
              : Math.abs(card.lift) >= 5
                ? 'Directional'
                : 'Flat',
      };
    });
  const effectMaxAbs = Math.max(
    10,
    ...effectRows.flatMap(row => [
      Math.abs(Number(row.lift) || 0),
      Math.abs(Number(row.ciLow) || 0),
      Math.abs(Number(row.ciHigh) || 0),
    ])
  );
  const sampleSizeStatus = decision?.statistics?.sampleSize?.status || 'unknown';
  const sampleSizeTotal = Number(decision?.statistics?.sampleSize?.totalVisitors) || totalVisitors;
  const sampleSizeMinimum =
    Number(decision?.statistics?.sampleSize?.minimumRecommendedVisitors) || 500;
  const sampleSizeProgress = Math.min(
    100,
    sampleSizeMinimum > 0 ? (sampleSizeTotal / sampleSizeMinimum) * 100 : 0
  );
  const guardrailVisualRows = Array.isArray(decision?.guardrails?.metrics)
    ? decision.guardrails.metrics.flatMap(metric =>
        (metric.variants || []).map(variant => ({
          id: `${metric.id || metric.metric}-${variant.variantId}`,
          label: metric.label || metric.metric,
          variantName: variant.variantName || variant.variantId,
          lift: Number(variant.relativeLift) || 0,
          breached: Boolean(variant.breached),
          direction: metric.direction || 'increase',
          threshold: Number(metric.threshold) || 0,
          reason: variant.reason || metric.breachReasons?.[0] || '',
          pValue: variant.pValue,
          confidenceInterval: variant.confidenceInterval,
          method: variant.method,
        }))
      )
    : [];
  const guardrailMaxAbs = Math.max(
    10,
    ...guardrailVisualRows.map(row => Math.abs(row.lift)),
    ...guardrailVisualRows.map(row => Math.abs(row.threshold))
  );

  const handlePromoteWinner = async () => {
    if (!promoteCandidate) return;
    if (promotionBlocked) {
      setPromoteError('Promotion is blocked by decision readiness checks.');
      return;
    }
    setPromoteLoading(true);
    setPromoteError(null);
    try {
      const allocations = variants.map(variant => ({
        id: variant.id,
        name: variant.name,
        allocation: variant.id === promoteCandidate.id ? 100 : 0,
      }));
      await apiPut(`/tests/${id}/variants/allocation`, { variants: allocations });
      setSuccessMessage(`Promoted ${promoteCandidate.name} to 100% traffic`);
      setPromoteOpen(false);
      invalidateAnalytics();
      await fetchAnalytics();
    } catch (err) {
      setPromoteError(err?.response?.data?.error || err?.message || 'Failed to promote winner');
    } finally {
      setPromoteLoading(false);
    }
  };

  const statusBadgeClass =
    testInfo?.status === 'running'
      ? styles.heroBadgeRunning
      : testInfo?.status === 'completed'
        ? styles.heroBadgeCompleted
        : styles.heroBadgeStopped;

  return (
    <div className={`${pageShell.page} ${styles.analyticsPage}`} data-page="analytics">
      <Toast
        message={errorMessage || promoteError}
        type="error"
        onClose={() => setPromoteError(null)}
        duration={5000}
      />
      {successMessage && (
        <Toast
          message={successMessage}
          type="success"
          onClose={() => setSuccessMessage(null)}
          duration={4000}
        />
      )}

      <Page title="" subtitle="" fullWidth>
        <div className={styles.analyticsLayout}>
          {analyticsError && (
            <Banner tone="warning" onDismiss={() => {}}>
              {analyticsError}
            </Banner>
          )}
          <div className={styles.analyticsHeader}>
            {/* Hero Section */}
            <section className={styles.heroSection}>
              <div className={styles.heroBreadcrumb}>
                <button
                  type="button"
                  className={styles.heroBreadcrumbLink}
                  onClick={() => navigate(routes.tests)}
                >
                  ← All Tests
                </button>
                <span className={styles.heroBreadcrumbSep}>/</span>
                <button
                  type="button"
                  className={styles.heroBreadcrumbLink}
                  onClick={() => navigate(routes.testDetail(id))}
                >
                  Test Details
                </button>
              </div>
              <div className={styles.heroContent}>
                <div className={styles.heroLeft}>
                  <h1 className={styles.heroTitle}>{testInfo?.name || 'Test Analytics'}</h1>
                  <p className={styles.heroSubtitle}>
                    {getTestTypeDisplay(testInfo || {}).label} • Analytics
                  </p>
                  <div className={styles.heroMeta}>
                    <span className={statusBadgeClass}>
                      {(testInfo?.status || 'stopped').charAt(0).toUpperCase() +
                        (testInfo?.status || 'stopped').slice(1)}
                    </span>
                    {testInfo?.started_at &&
                      testInfo?.stopped_at &&
                      (() => {
                        const days = Math.max(
                          1,
                          Math.round(
                            (new Date(testInfo.stopped_at) - new Date(testInfo.started_at)) /
                              (24 * 60 * 60 * 1000)
                          )
                        );
                        return (
                          <span className={styles.heroBadge} style={{ marginLeft: 8 }}>
                            Duration: {days}d
                          </span>
                        );
                      })()}
                    {testInfo?.started_at &&
                      !testInfo?.stopped_at &&
                      testInfo?.status === 'running' &&
                      (() => {
                        const days = Math.max(
                          0,
                          Math.round(
                            (Date.now() - new Date(testInfo.started_at)) / (24 * 60 * 60 * 1000)
                          )
                        );
                        return (
                          <span className={styles.heroBadge} style={{ marginLeft: 8 }}>
                            Running: {days}d
                          </span>
                        );
                      })()}
                    {goalConfig?.conversion_window_days && (
                      <span className={styles.heroBadge} style={{ marginLeft: 8 }}>
                        Window: {goalConfig.conversion_window_days}d
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.heroRight}>
                  <div className={styles.heroActions} role="group" aria-label="Analytics actions">
                    <button
                      type="button"
                      className={`${styles.heroPrimaryBtn} ${styles.heroPrimaryBtnExport}`}
                      onClick={() => navigate(routes.testExport(id))}
                    >
                      <span className={styles.heroActionIcon}>
                        <Icon source={ExportIcon} />
                      </span>
                      <span className={styles.heroActionCopy}>
                        <span>Export</span>
                        <small>CSV / JSON</small>
                      </span>
                    </button>
                    <div
                      className={styles.heroUtilityCluster}
                      role="group"
                      aria-label="View and refresh"
                    >
                      <button
                        type="button"
                        className={styles.heroSecondaryBtn}
                        onClick={() => navigate(routes.testDetail(id))}
                      >
                        <span className={styles.heroActionIcon}>
                          <Icon source={EyeFirstIcon} />
                        </span>
                        <span>Details</span>
                      </button>
                      {testInfo?.type === 'offer' && (
                        <button
                          type="button"
                          className={styles.heroSecondaryBtn}
                          onClick={() => navigate(routes.testPromoLinks(id))}
                        >
                          <span className={styles.heroActionIcon}>
                            <Icon source={LinkIcon} />
                          </span>
                          <span>Links</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.heroSecondaryBtn}
                        onClick={handleRefreshReports}
                      >
                        <span className={styles.heroActionIcon}>
                          <Icon source={RefreshIcon} />
                        </span>
                        <span>Refresh</span>
                      </button>
                    </div>
                    <div
                      className={styles.heroPromoteWrap}
                      role="group"
                      aria-label="Winner promotion"
                    >
                      <button
                        type="button"
                        className={`${styles.heroSecondaryBtn} ${styles.heroSecondaryBtnPromote}`}
                        onClick={
                          promoteCandidate
                            ? () => {
                                setPromoteError(null);
                                setPromoteOpen(true);
                              }
                            : undefined
                        }
                        disabled={!promoteCandidate}
                      >
                        <span className={styles.heroActionIcon}>
                          <Icon source={StarFilledIcon} />
                        </span>
                        <span className={styles.heroActionCopy}>
                          <span>Promote</span>
                          <small>{promoteCandidate ? 'Winner ready' : 'No winner yet'}</small>
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className={styles.heroQuickStats}>
                    <div className={styles.heroStat}>
                      <span className={styles.heroStatValue}>{totalVisitors.toLocaleString()}</span>
                      <span className={styles.heroStatLabel}>Visitors</span>
                    </div>
                    <div className={styles.heroStat}>
                      <span className={styles.heroStatValue}>
                        {totalConversions.toLocaleString()}
                      </span>
                      <span className={styles.heroStatLabel}>Conversions</span>
                    </div>
                    <div className={styles.heroStat}>
                      <span className={styles.heroStatValue}>
                        $
                        {totalRevenue.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })}
                      </span>
                      <span className={styles.heroStatLabel}>Revenue</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.commandCenter} aria-label="Analytics report command center">
                <div className={styles.commandCenterMain}>
                  <div className={styles.commandHealth}>
                    <div
                      className={styles.commandHealthGauge}
                      style={{ '--analytics-health-score': `${analyticsHealthScore}%` }}
                      role="meter"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={analyticsHealthScore}
                      aria-label={`Analytics health score ${analyticsHealthScore} out of 100`}
                    >
                      <span>{analyticsHealthScore}</span>
                    </div>
                    <div>
                      <span className={styles.commandEyebrow}>Analytics Health</span>
                      <strong>{analyticsHealthLabel}</strong>
                      <small>
                        {readyReportCount}/{reportReadiness.length} reports ready ·{' '}
                        {primaryMetricLabel}
                      </small>
                    </div>
                  </div>
                  <div className={styles.commandScopeGrid}>
                    <span>
                      Scope <strong>{segmentScopeLabel || 'All traffic'}</strong>
                    </span>
                    <span>
                      Primary <strong>{primaryMetricLabel}</strong>
                    </span>
                    {secondaryMetricLabel ? (
                      <span>
                        Secondary <strong>{secondaryMetricLabel}</strong>
                      </span>
                    ) : null}
                    <span>
                      Leader{' '}
                      <strong>
                        {promoteCandidate
                          ? `${promoteCandidate.name}${leaderLift !== null ? ` (${leaderLift > 0 ? '+' : ''}${leaderLift.toFixed(1)}%)` : ''}`
                          : 'No leader yet'}
                      </strong>
                    </span>
                  </div>
                </div>
                <div className={styles.reportNavigationPanel}>
                  <div className={styles.reportNavigationHeader}>
                    <span className={styles.commandEyebrow}>Reports</span>
                    <strong>{activeReport.label}</strong>
                    <small>{activeReportDescription}</small>
                  </div>
                  <div
                    className={styles.reportReadinessGrid}
                    role="navigation"
                    aria-label="Analytics reports"
                  >
                    {reportReadiness.map(report => (
                      <button
                        key={report.label}
                        type="button"
                        className={`${styles.reportReadinessCard} ${
                          selectedTab === report.tabIndex ? styles.reportReadinessCardActive : ''
                        }`}
                        onClick={() => handleSelectTab(report.tabIndex)}
                        aria-current={selectedTab === report.tabIndex ? 'page' : undefined}
                        aria-pressed={selectedTab === report.tabIndex}
                        aria-label={`${report.label} report. ${report.status}. ${report.detail}`}
                      >
                        <span
                          className={report.ready ? styles.reportReadyDot : styles.reportWaitingDot}
                        />
                        <span>
                          <strong>{report.label}</strong>
                          <small>{report.detail}</small>
                        </span>
                        <em>{report.status}</em>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Winner Banner */}
            {winner && (
              <div className={styles.winnerBanner}>
                <div className={styles.winnerIcon} aria-hidden="true">
                  🏆
                </div>
                <div className={styles.winnerContent}>
                  <div className={styles.winnerTitle}>Winner: {winner.name}</div>
                  <div className={styles.winnerSubtitle}>
                    {primaryMetricLabel}:{' '}
                    {formatGoalBusinessMetricValue(winner.primaryMetricValue, primaryMetric)}
                    {secondaryMetric && winner.secondaryMetricValue !== null ? (
                      <>
                        {' '}
                        · {secondaryMetricLabel}:{' '}
                        {formatGoalBusinessMetricValue(
                          winner.secondaryMetricValue,
                          secondaryMetric
                        )}
                      </>
                    ) : null}{' '}
                    · {significanceContextLabel}
                  </div>
                </div>
              </div>
            )}

            {/* Sample Ratio Mismatch (SRM) warning - data quality alert */}
            {analytics.srm?.detected && (
              <div className={styles.srmBannerWrap}>
                <Banner tone="warning" title="Sample ratio mismatch detected">
                  <Text as="p" variant="bodySm">
                    {analytics.srm.message ||
                      'Traffic split deviates from expected allocation. This may indicate tracking issues, bot traffic, or assignment skew. Verify your implementation before trusting results.'}
                  </Text>
                </Banner>
              </div>
            )}

            {/* Compact Filter Bar */}
            {(segmentOptions.devices?.length > 0 || segmentOptions.countries?.length > 0) && (
              <div className={styles.filterBar}>
                <TooltipWrapper content="Filter analytics by device type or country">
                  <span className={styles.filterBarLabel}>Segment</span>
                </TooltipWrapper>
                <div className={styles.filterBarSelects}>
                  {segmentOptions.devices?.length > 0 && (
                    <div>
                      <Select
                        label="Device"
                        labelHidden
                        options={[
                          { label: 'All devices', value: 'all' },
                          ...segmentOptions.devices.map(d => ({
                            label: d.charAt(0).toUpperCase() + d.slice(1),
                            value: d,
                          })),
                        ]}
                        value={segmentDevice}
                        onChange={handleSegmentDeviceChange}
                      />
                    </div>
                  )}
                  {segmentOptions.countries?.length > 0 && (
                    <div>
                      <Select
                        label="Country"
                        labelHidden
                        options={[
                          { label: 'All countries', value: 'all' },
                          ...segmentOptions.countries.map(c => ({
                            label: c,
                            value: c,
                          })),
                        ]}
                        value={segmentCountry}
                        onChange={handleSegmentCountryChange}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={styles.analyticsContent}>
            {/* Tab 0: Overview - Full dashboard */}
            {selectedTab === 0 && (
              <Layout>
                <>
                  {/* Summary Metrics */}
                  <Layout.Section>
                    <MetricGrid className={styles.statsGrid}>
                      <MetricCard
                        title="Total Visitors"
                        value={totalVisitors.toLocaleString()}
                        subtitle="Across all variants"
                        tooltip="Total unique visitors across all test variants"
                      />
                      <MetricCard
                        title="Total Conversions"
                        value={totalConversions.toLocaleString()}
                        subtitle={`${overallConversionRate.toFixed(2)}% conversion rate`}
                        tooltip="Total conversions (purchases or goal completions)"
                      />
                      <MetricCard
                        title="Total Revenue"
                        value={formatCurrency(totalRevenue)}
                        subtitle="From all variants"
                        tooltip="Total revenue from all variants"
                      />
                      <MetricCard
                        title="Revenue / Visitor"
                        value={formatCurrency(overallRevenuePerVisitor)}
                        subtitle="Blends purchase rate and order value"
                        tooltip="Revenue per visitor (RPV): total revenue divided by total visitors"
                      />
                      <MetricCard
                        title="Profit / Visitor"
                        value={formatCurrency(overallProfitPerVisitor)}
                        subtitle={
                          goalConfig?.cogs?.enabled ? 'COGS-adjusted' : 'Revenue until COGS is set'
                        }
                        tooltip="Profit per visitor (PPV): COGS-adjusted profit divided by visitors"
                      />
                      <MetricCard
                        title="Average Order Value"
                        value={formatCurrency(overallAov)}
                        subtitle="Revenue per conversion"
                        tooltip="Average order value (AOV): total revenue divided by conversions"
                      />
                      {winner && (
                        <MetricCard
                          title="Winner"
                          value={winner.name}
                          subtitle={`${primaryMetricLabel}: ${formatGoalBusinessMetricValue(winner.primaryMetricValue, primaryMetric)}`}
                          variant="success"
                          tooltip="Winning or leading variant for the selected primary metric"
                        />
                      )}
                      {winner &&
                        (() => {
                          const control =
                            variants.find(
                              v =>
                                v.id !== winner.id && (v.name === 'Control' || v.name === 'control')
                            ) ||
                            variants.find(v => v.id !== winner.id) ||
                            variants[0];
                          if (!control || control.id === winner.id) return null;
                          const cVis = control.visitors || 1;
                          const wVis = winner.visitors || 1;
                          const cRev = control.revenue ?? 0;
                          const wRev = winner.revenue ?? 0;
                          const controlRpv = cVis > 0 ? cRev / cVis : 0;
                          const winnerRpv = wVis > 0 ? wRev / wVis : 0;
                          const incrementalPerVisitor = winnerRpv - controlRpv;
                          const testDays =
                            testInfo?.started_at && testInfo?.stopped_at
                              ? Math.max(
                                  1,
                                  (new Date(testInfo.stopped_at) - new Date(testInfo.started_at)) /
                                    (24 * 60 * 60 * 1000)
                                )
                              : testInfo?.started_at
                                ? Math.max(
                                    1,
                                    (Date.now() - new Date(testInfo.started_at)) /
                                      (24 * 60 * 60 * 1000)
                                  )
                                : 30;
                          const monthlyVisitors =
                            testDays > 0 ? (totalVisitors / testDays) * 30 : totalVisitors;
                          const projected30Day = incrementalPerVisitor * monthlyVisitors;
                          return (
                            <MetricCard
                              title="Revenue impact (30d)"
                              value={`$${Math.round(projected30Day).toLocaleString()}`}
                              subtitle="Projected if winner promoted"
                              tooltip="Estimated additional revenue over 30 days if winning variant gets 100% traffic"
                            />
                          );
                        })()}
                    </MetricGrid>
                  </Layout.Section>

                  <Layout.Section>
                    <div className={styles.variantScoreboard}>
                      <div className={styles.visualSectionHeader}>
                        <div>
                          <Text variant="headingLg" as="h2">
                            Variant Scoreboard
                          </Text>
                          <Text variant="bodySm" color="subdued" as="p">
                            Decision-ready comparison of primary metric, lift, revenue quality, and
                            conversion health.
                          </Text>
                        </div>
                        <Badge tone={winner ? 'success' : 'info'}>
                          {winner ? 'Winner detected' : 'Directional leader'}
                        </Badge>
                      </div>
                      <div className={styles.variantScoreGrid}>
                        {variantScorecards.map(card => (
                          <div
                            key={card.id}
                            className={`${styles.variantScoreCard} ${
                              card.isLeader ? styles.variantScoreCardLeader : ''
                            }`}
                            style={{ '--variant-score-color': card.color }}
                          >
                            <div className={styles.variantScoreHeader}>
                              <span className={styles.variantScoreDot} />
                              <strong>{card.name}</strong>
                              <Badge
                                tone={
                                  card.isLeader ? 'success' : card.isControl ? 'info' : 'attention'
                                }
                              >
                                {card.isLeader
                                  ? 'Leader'
                                  : card.isControl
                                    ? 'Control'
                                    : formatSignedPercent(card.lift)}
                              </Badge>
                            </div>
                            <div className={styles.variantScoreMetric}>
                              <span>{primaryMetricLabel}</span>
                              <strong>
                                {formatGoalBusinessMetricValue(
                                  card.primaryMetricValue,
                                  primaryMetric
                                )}
                              </strong>
                              <small>
                                {card.isControl
                                  ? 'Baseline'
                                  : `${formatSignedPercent(card.lift)} vs control`}
                              </small>
                            </div>
                            {secondaryMetric && card.secondaryMetricValue !== null ? (
                              <div className={styles.variantScoreSecondaryMetric}>
                                <span>{secondaryMetricLabel}</span>
                                <strong>
                                  {formatGoalBusinessMetricValue(
                                    card.secondaryMetricValue,
                                    secondaryMetric
                                  )}
                                </strong>
                              </div>
                            ) : null}
                            <div className={styles.variantScoreBars}>
                              <span>
                                <em>Visitors</em>
                                <i
                                  style={{
                                    width: `${Math.max(4, (card.visitors / maxVariantVisitors) * 100)}%`,
                                  }}
                                />
                                <b>{card.visitors.toLocaleString()}</b>
                              </span>
                              <span>
                                <em>Conversion rate</em>
                                <i
                                  style={{
                                    width: `${Math.max(4, Math.min(100, card.conversionRate * 8))}%`,
                                  }}
                                />
                                <b>{card.conversionRate.toFixed(2)}%</b>
                              </span>
                            </div>
                            <div className={styles.variantScoreFooter}>
                              <span>
                                <small>RPV</small>
                                <strong>{formatCurrency(card.revenuePerVisitor)}</strong>
                              </span>
                              <span>
                                <small>PPV</small>
                                <strong>{formatCurrency(card.profitPerVisitor)}</strong>
                              </span>
                              <span>
                                <small>Conv.</small>
                                <strong>{card.conversions.toLocaleString()}</strong>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Layout.Section>

                  <Layout.Section>
                    <div className={styles.reportPreviewGrid}>
                      {reportPreviewCards.map(card => {
                        const maxBarValue = Math.max(
                          1,
                          ...card.bars.map(item => Number(item.value) || 0)
                        );
                        return (
                          <button
                            key={card.key}
                            type="button"
                            className={`${styles.reportPreviewCard} ${styles[`reportPreviewCard_${card.tone}`] || ''}`}
                            onClick={() => handleSelectTab(card.tabIndex)}
                          >
                            <span className={styles.reportPreviewTopline}>
                              <strong>{card.title}</strong>
                              <em>{card.label}</em>
                            </span>
                            <span className={styles.reportPreviewValue}>{card.value}</span>
                            <span className={styles.reportPreviewDetail}>{card.detail}</span>
                            <span className={styles.reportPreviewBars} aria-hidden="true">
                              {card.bars.map(item => (
                                <span key={item.label}>
                                  <small>{item.label}</small>
                                  <i
                                    style={{
                                      width: `${Math.max(4, ((Number(item.value) || 0) / maxBarValue) * 100)}%`,
                                    }}
                                  />
                                </span>
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Layout.Section>

                  <Layout.Section>
                    <div className={styles.decisionVisualDeck}>
                      <div className={styles.visualSectionHeader}>
                        <div>
                          <Text variant="headingLg" as="h2">
                            Experiment Decision Map
                          </Text>
                          <Text variant="bodySm" color="subdued" as="p">
                            Lift, statistical health, traffic quality, and guardrail risk in one
                            graphical decision view.
                          </Text>
                        </div>
                        <Badge
                          tone={
                            promotionBlocked
                              ? 'critical'
                              : promotionReadiness?.canPromote
                                ? 'success'
                                : 'warning'
                          }
                        >
                          {promotionBlocked
                            ? 'Investigate'
                            : promotionReadiness?.canPromote
                              ? 'Ready to promote'
                              : 'Keep running'}
                        </Badge>
                      </div>

                      <div className={styles.decisionVisualGrid}>
                        <div className={styles.effectPlotCard}>
                          <div className={styles.effectPlotHeader}>
                            <span>
                              <strong>Lift vs Control</strong>
                              <small>{primaryMetricLabel} comparison with zero baseline</small>
                            </span>
                            <em>
                              {sig?.pValue !== undefined ? `p=${sig.pValue}` : 'No p-value yet'}
                            </em>
                          </div>
                          {effectRows.length > 0 ? (
                            <div className={styles.effectPlotRows}>
                              {effectRows.map(row => {
                                const pointPosition = getEffectAxisPosition(row.lift, effectMaxAbs);
                                const lowPosition = getEffectAxisPosition(
                                  row.ciLow ?? row.lift,
                                  effectMaxAbs
                                );
                                const highPosition = getEffectAxisPosition(
                                  row.ciHigh ?? row.lift,
                                  effectMaxAbs
                                );
                                const bandLeft = Math.min(lowPosition, highPosition);
                                const bandWidth = Math.max(2, Math.abs(highPosition - lowPosition));
                                return (
                                  <div key={row.id} className={styles.effectPlotRow}>
                                    <span>
                                      <strong>{row.name}</strong>
                                      <small>{row.evidenceLabel}</small>
                                    </span>
                                    <div className={styles.effectPlotTrack}>
                                      <i className={styles.effectZeroLine} />
                                      <i
                                        className={styles.effectConfidenceBand}
                                        style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
                                      />
                                      <b
                                        className={
                                          row.lift >= 0
                                            ? styles.effectPointGood
                                            : styles.effectPointBad
                                        }
                                        style={{ left: `${pointPosition}%` }}
                                      />
                                    </div>
                                    <em>{formatSignedPercent(row.lift)}</em>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className={styles.effectEmpty}>
                              Add a treatment variant to show effect size vs control.
                            </p>
                          )}
                        </div>

                        <div className={styles.decisionHealthCard}>
                          <span className={styles.decisionHealthEyebrow}>Readiness cockpit</span>
                          <strong>{analyticsHealthLabel}</strong>
                          <div className={styles.decisionHealthMeter}>
                            <i style={{ width: `${analyticsHealthScore}%` }} />
                          </div>
                          <div className={styles.decisionHealthRows}>
                            <span>
                              <small>Sample size</small>
                              <b>{sampleSizeStatus}</b>
                              <i>
                                <em style={{ width: `${sampleSizeProgress}%` }} />
                              </i>
                            </span>
                            <span>
                              <small>SRM</small>
                              <b>{analytics.srm?.detected ? 'Detected' : 'Clear'}</b>
                              <i>
                                <em style={{ width: analytics.srm?.detected ? '35%' : '100%' }} />
                              </i>
                            </span>
                            <span>
                              <small>Guardrails</small>
                              <b>{decision?.guardrails?.status || 'not configured'}</b>
                              <i>
                                <em
                                  style={{
                                    width:
                                      decision?.guardrails?.status === 'breached' ? '35%' : '100%',
                                  }}
                                />
                              </i>
                            </span>
                          </div>
                        </div>
                      </div>

                      {guardrailVisualRows.length > 0 && (
                        <div className={styles.guardrailMatrix}>
                          <div className={styles.guardrailMatrixHeader}>
                            <span>
                              <strong>Guardrail Matrix</strong>
                              <small>Risk movement by metric and variant</small>
                            </span>
                            <Badge
                              tone={
                                decision?.guardrails?.status === 'breached' ? 'critical' : 'success'
                              }
                            >
                              {decision?.guardrails?.status === 'breached'
                                ? 'Breach found'
                                : 'Clear'}
                            </Badge>
                          </div>
                          <div className={styles.guardrailRows}>
                            {guardrailVisualRows.slice(0, 6).map(row => {
                              const liftPosition = getEffectAxisPosition(row.lift, guardrailMaxAbs);
                              const thresholdPosition = getEffectAxisPosition(
                                row.threshold,
                                guardrailMaxAbs
                              );
                              return (
                                <div key={row.id} className={styles.guardrailRow}>
                                  <span>
                                    <strong>{row.label}</strong>
                                    <small>
                                      {row.variantName}
                                      {Number.isFinite(Number(row.pValue))
                                        ? ` · p=${Number(row.pValue).toFixed(4)}`
                                        : ''}
                                    </small>
                                  </span>
                                  <div className={styles.guardrailTrack}>
                                    <i className={styles.effectZeroLine} />
                                    <i
                                      className={styles.guardrailThreshold}
                                      style={{ left: `${thresholdPosition}%` }}
                                    />
                                    <b
                                      className={
                                        row.breached
                                          ? styles.guardrailPointBad
                                          : styles.guardrailPointGood
                                      }
                                      style={{ left: `${liftPosition}%` }}
                                      title={
                                        row.reason ||
                                        `${formatSignedPercent(row.lift)} ${row.direction}`
                                      }
                                    />
                                  </div>
                                  <em>
                                    {formatSignedPercent(row.lift)}
                                    {row.confidenceInterval
                                      ? ` CI ${formatSignedPercent(row.confidenceInterval.relativeLow)} to ${formatSignedPercent(row.confidenceInterval.relativeHigh)}`
                                      : ''}
                                  </em>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </Layout.Section>

                  <Layout.Section>
                    <div className={styles.analyticsSectionCard}>
                      <BlockStack gap="300">
                        <Text variant="headingMd" as="h3">
                          Targeting & Holdout
                        </Text>
                        <Text variant="bodySm" color="subdued" as="p">
                          {`${targeting.device || 'all'} device, ${targeting.customer || 'all'} customers, ${targetingCountries}`}
                        </Text>
                        <BlockStack gap="200">
                          <InlineStack align="space-between">
                            <Text variant="bodySm" as="span">
                              Holdout
                            </Text>
                            <Text variant="bodySm" as="span">
                              {holdoutPercent}%
                            </Text>
                          </InlineStack>
                          <ProgressBar progress={holdoutPercent} size="small" />
                          <Text variant="bodySm" color="subdued" as="span">
                            {holdoutRemainder}% of traffic remains eligible for test variants
                          </Text>
                        </BlockStack>
                      </BlockStack>
                    </div>
                  </Layout.Section>

                  {decision && (
                    <Layout.Section>
                      <Card>
                        <BlockStack gap="400">
                          <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                              <Text variant="headingLg" as="h2">
                                Decision Quality
                              </Text>
                              <Text variant="bodySm" color="subdued" as="p">
                                Trust checks for SRM, guardrails, sample size, and ordered funnel
                                readiness.
                              </Text>
                            </BlockStack>
                            <InlineStack gap="200" blockAlign="center">
                              <Badge
                                tone={
                                  decision.guardrails?.status === 'breached' ||
                                  decision.statistics?.srm?.detected
                                    ? 'critical'
                                    : decision.statistics?.sampleSize?.status === 'healthy'
                                      ? 'success'
                                      : 'warning'
                                }
                              >
                                {decision.guardrails?.status === 'breached'
                                  ? 'Guardrail breached'
                                  : decision.statistics?.srm?.detected
                                    ? 'SRM detected'
                                    : decision.statistics?.sampleSize?.status === 'healthy'
                                      ? 'Healthy'
                                      : 'Needs more data'}
                              </Badge>
                              <Button onClick={() => setDecisionOpen(true)}>
                                Readiness details
                              </Button>
                            </InlineStack>
                          </InlineStack>
                          <div className={styles.decisionGrid}>
                            <div className={styles.decisionTile}>
                              <Text variant="bodySm" color="subdued" as="p">
                                SRM
                              </Text>
                              <Text variant="headingMd" as="p">
                                {decision.statistics?.srm?.detected ? 'Detected' : 'Clear'}
                              </Text>
                            </div>
                            <div className={styles.decisionTile}>
                              <Text variant="bodySm" color="subdued" as="p">
                                Guardrails
                              </Text>
                              <Text variant="headingMd" as="p">
                                {decision.guardrails?.configured || 0} configured
                              </Text>
                            </div>
                            <div className={styles.decisionTile}>
                              <Text variant="bodySm" color="subdued" as="p">
                                CUPED
                              </Text>
                              <Text variant="headingMd" as="p">
                                {decision.statistics?.cuped?.status === 'ready_for_covariates'
                                  ? 'Ready'
                                  : 'Needs covariates'}
                              </Text>
                            </div>
                            <div className={styles.decisionTile}>
                              <Text variant="bodySm" color="subdued" as="p">
                                Funnel mode
                              </Text>
                              <Text variant="headingMd" as="p">
                                {decision.funnel?.orderedScaffold?.mode === 'ordered_sequence'
                                  ? 'Sequenced'
                                  : 'Step counts'}
                              </Text>
                            </div>
                            <div className={styles.decisionTile}>
                              <Text variant="bodySm" color="subdued" as="p">
                                Promotion
                              </Text>
                              <Text variant="headingMd" as="p">
                                {promotionReadiness?.status === 'blocked'
                                  ? 'Blocked'
                                  : promotionReadiness?.status === 'ready'
                                    ? 'Ready'
                                    : 'Review'}
                              </Text>
                            </div>
                          </div>
                          {(promotionBlockers.length > 0 || promotionWarnings.length > 0) && (
                            <Banner
                              tone={promotionBlockers.length > 0 ? 'critical' : 'warning'}
                              title={
                                promotionBlockers.length > 0
                                  ? 'Promotion needs fixes first'
                                  : 'Review before promotion'
                              }
                            >
                              <BlockStack gap="100">
                                {[...promotionBlockers, ...promotionWarnings]
                                  .slice(0, 4)
                                  .map(item => (
                                    <Text
                                      key={`${item.code}-${item.label}`}
                                      as="p"
                                      variant="bodySm"
                                    >
                                      <strong>{item.label}:</strong> {item.detail}
                                    </Text>
                                  ))}
                              </BlockStack>
                            </Banner>
                          )}
                          {decision.recommendations?.length > 0 && (
                            <Banner tone="info">{decision.recommendations.join(' ')}</Banner>
                          )}
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  )}

                  {/* Statistical Significance */}
                  {analytics.significance && (
                    <Layout.Section>
                      <Card>
                        <BlockStack gap="400">
                          <Text variant="headingLg" as="h2">
                            {analytics.significance.bayesian
                              ? analytics.significance.probabilityLabel || 'Directional Probability'
                              : isConversionPrimaryMetric
                                ? 'Statistical Significance'
                                : 'Conversion-Based Significance'}
                          </Text>
                          {!isConversionPrimaryMetric && (
                            <Text variant="bodySm" color="subdued" as="p">
                              Your primary metric is {primaryMetricLabel.toLowerCase()}, but this
                              inference block is still based on conversion rate. Use it as evidence
                              quality context alongside the primary metric comparison.
                            </Text>
                          )}
                          {analytics.significance.comparisonGuidance && (
                            <Banner tone="info" title="Multi-variant guidance">
                              <Text as="p" variant="bodySm">
                                {analytics.significance.comparisonGuidance}
                              </Text>
                            </Banner>
                          )}

                          {analytics.significance.bayesian &&
                          analytics.significance.probToBeatControl ? (
                            <BlockStack gap="300">
                              <Text variant="bodySm" color="subdued" as="p">
                                {analytics.significance.probabilityNote ||
                                  'Directional probability each variant beats control on conversion rate.'}
                              </Text>
                              <div className={styles.bayesianGrid}>
                                {analytics.significance.probToBeatControl.map((item, idx) => (
                                  <div key={item.variantId || idx} className={styles.bayesianCard}>
                                    <Text variant="bodySm" fontWeight="semibold" as="p">
                                      {item.variantName || item.variantId}
                                    </Text>
                                    <Text variant="headingMd" as="p">
                                      {(item.probabilityToBeatControl * 100).toFixed(1)}%
                                    </Text>
                                    <Text variant="bodySm" color="subdued" as="p">
                                      {item.probabilityToBeatControl >= 0.95
                                        ? 'Strong evidence'
                                        : item.probabilityToBeatControl >= 0.8
                                          ? 'Likely better'
                                          : 'Inconclusive'}
                                    </Text>
                                  </div>
                                ))}
                              </div>
                            </BlockStack>
                          ) : (
                            <MetricGrid>
                              <MetricCard
                                title="P-Value"
                                value={analytics.significance.pValue}
                                subtitle={
                                  analytics.significance.pValue < 0.05
                                    ? 'Statistically significant'
                                    : 'Not yet significant'
                                }
                              />
                              <MetricCard
                                title="Confidence Level"
                                value={`${analytics.significance.confidence}%`}
                                subtitle="Confidence interval"
                              />
                              {analytics.significance.lift && (
                                <MetricCard
                                  title="Lift"
                                  value={`${analytics.significance.lift > 0 ? '+' : ''}${analytics.significance.lift}%`}
                                  subtitle="Improvement over control"
                                  variant={analytics.significance.lift > 0 ? 'success' : 'warning'}
                                />
                              )}
                            </MetricGrid>
                          )}

                          {winner && (
                            <Card sectioned>
                              <BlockStack gap="200">
                                <Text variant="bodyMd" fontWeight="semibold" as="p">
                                  🏆 Winner: {winner.name}
                                </Text>
                                <Text variant="bodySm" as="p">
                                  This variant is leading on {primaryMetricLabel.toLowerCase()} at{' '}
                                  {formatGoalBusinessMetricValue(
                                    winner.primaryMetricValue,
                                    primaryMetric
                                  )}
                                  . Conversion rate is still shown for statistical context.
                                </Text>
                              </BlockStack>
                            </Card>
                          )}
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  )}

                  {/* Time-Series Chart */}
                  {timeSeries && timeSeries.length > 0 && (
                    <Layout.Section>
                      <div className={`chart-container ${styles.chartCard}`}>
                        <div className={styles.chartHeaderWithControl}>
                          <div>
                            <Text variant="headingLg" as="h2">
                              Performance Over Time
                            </Text>
                            <Text variant="bodySm" color="subdued" as="p">
                              Switch the trend view to match the metric you are evaluating.
                            </Text>
                          </div>
                          <div className={styles.chartMetricSelect}>
                            <Select
                              label="Trend metric"
                              options={TIME_SERIES_METRIC_OPTIONS}
                              value={timeSeriesMetric}
                              onChange={setTimeSeriesMetric}
                            />
                          </div>
                        </div>
                        <ResponsiveContainer width="100%" height={420}>
                          <LineChart data={chartTimeSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                            <XAxis dataKey="name" stroke="var(--text-secondary)" />
                            <YAxis stroke="var(--text-secondary)" />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Legend />
                            {chartAnnotations.map(annotation => (
                              <ReferenceLine
                                key={`${annotation.type}-${annotation.date}`}
                                x={annotation.x}
                                stroke="var(--accent-primary)"
                                strokeDasharray="4 4"
                                label={{ value: annotation.label, position: 'insideTopRight' }}
                              />
                            ))}
                            {variants.map((variant, index) => (
                              <Line
                                key={variant.id}
                                type="monotone"
                                dataKey={`${variant.name}.${timeSeriesMetric}`}
                                name={`${variant.name} ${TIME_SERIES_METRIC_LABELS[timeSeriesMetric]}`}
                                stroke={COLORS[index % COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 4 }}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                        {chartAnnotations.length > 0 && (
                          <div className={styles.chartAnnotationList}>
                            {chartAnnotations.map(annotation => (
                              <span key={`${annotation.type}-${annotation.date}-chip`}>
                                <b>{annotation.label}</b>
                                <small>{annotation.date}</small>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Layout.Section>
                  )}

                  {/* Charts */}
                  <Layout.Section>
                    <div className={`chart-container ${styles.chartCard}`}>
                      <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
                        {primaryMetricLabel} Comparison
                      </Text>
                      {chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={420}>
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                            <XAxis dataKey="name" stroke="var(--text-secondary)" />
                            <YAxis stroke="var(--text-secondary)" />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Legend />
                            <Bar
                              dataKey="Primary Metric"
                              name={primaryMetricLabel}
                              fill="var(--accent-primary)"
                              radius={[8, 8, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className={styles.emptyChart}>
                          <Text variant="bodyMd" color="subdued" as="p">
                            No variant data yet. Run your test to see primary metric results.
                          </Text>
                        </div>
                      )}
                    </div>
                  </Layout.Section>

                  <Layout.Section secondary>
                    <div className={`chart-container ${styles.chartCard}`}>
                      <div className={styles.visualSectionHeader}>
                        <div>
                          <Text variant="headingLg" as="h2">
                            Traffic Quality
                          </Text>
                          <Text variant="bodySm" color="subdued" as="p">
                            Expected allocation vs observed visitor split. This replaces the pie
                            chart with an SRM-focused split view.
                          </Text>
                        </div>
                        <Badge tone={analytics.srm?.detected ? 'critical' : 'success'}>
                          {analytics.srm?.detected ? 'SRM risk' : 'Split healthy'}
                        </Badge>
                      </div>
                      {totalVisitors > 0 ? (
                        <div className={styles.trafficQualityPanel}>
                          <div
                            className={styles.trafficSplitBars}
                            aria-label="Expected and observed traffic allocation"
                          >
                            <div>
                              <span>Expected</span>
                              <div>
                                {allocationRows.map(row => (
                                  <i
                                    key={`expected-${row.id}`}
                                    style={{
                                      width: `${Math.max(0, Math.min(100, row.expectedAllocation))}%`,
                                      background: row.color,
                                    }}
                                    title={`${row.name}: ${row.expectedAllocation.toFixed(1)}% expected`}
                                  />
                                ))}
                              </div>
                            </div>
                            <div>
                              <span>Observed</span>
                              <div>
                                {allocationRows.map(row => (
                                  <i
                                    key={`observed-${row.id}`}
                                    style={{
                                      width: `${Math.max(0, Math.min(100, row.observedAllocation))}%`,
                                      background: row.color,
                                    }}
                                    title={`${row.name}: ${row.observedAllocation.toFixed(1)}% observed`}
                                  />
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className={styles.trafficAllocationRows}>
                            {allocationRows.map(row => (
                              <div key={row.id} className={styles.trafficAllocationRow}>
                                <span style={{ '--traffic-row-color': row.color }}>
                                  <i />
                                  <strong>{row.name}</strong>
                                </span>
                                <em>{row.visitors.toLocaleString()} visitors</em>
                                <small>{row.expectedAllocation.toFixed(1)}% target</small>
                                <b
                                  className={Math.abs(row.delta) > 5 ? styles.trafficDeltaWarn : ''}
                                >
                                  {formatSignedPercent(row.delta)}
                                </b>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className={styles.emptyChart}>
                          <Text variant="bodyMd" color="subdued" as="p">
                            No traffic data yet. Start your test to see expected vs observed split.
                          </Text>
                        </div>
                      )}
                    </div>
                  </Layout.Section>

                  {(segmentComparisonRows.length > 0 || cohortRows.length > 0) && (
                    <Layout.Section>
                      <div className={styles.phaseThreeGrid}>
                        {segmentComparisonRows.length > 0 && (
                          <div className={styles.phaseThreeCard}>
                            <div className={styles.phaseThreeHeader}>
                              <span>
                                <strong>Segment Comparison</strong>
                                <small>Device and country slices from backend breakdown APIs</small>
                              </span>
                              <Badge tone="info">Phase 3</Badge>
                            </div>
                            <div className={styles.segmentComparisonRows}>
                              {segmentComparisonRows.map(row => (
                                <div
                                  key={`${row.group}-${row.value}`}
                                  className={styles.segmentComparisonRow}
                                >
                                  <span>
                                    <strong>{row.value}</strong>
                                    <small>{row.group}</small>
                                  </span>
                                  <div>
                                    <i
                                      style={{
                                        width: `${Math.max(4, (row.totalVisitors / maxSegmentVisitors) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <em>{row.totalVisitors.toLocaleString()} visitors</em>
                                  <b>{Number(row.conversionRate || 0).toFixed(2)}%</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {cohortRows.length > 0 && (
                          <div className={styles.phaseThreeCard}>
                            <div className={styles.phaseThreeHeader}>
                              <span>
                                <strong>Assignment Cohorts</strong>
                                <small>Weekly conversion health by first exposure cohort</small>
                              </span>
                              <Badge tone="info">Backend powered</Badge>
                            </div>
                            <div className={styles.cohortRows}>
                              {cohortRows.map(row => (
                                <div
                                  key={`${row.cohortPeriod}-${row.variantId}`}
                                  className={styles.cohortRow}
                                >
                                  <span>
                                    <strong>{row.cohortPeriod}</strong>
                                    <small>{row.variantName}</small>
                                  </span>
                                  <div>
                                    <i
                                      style={{
                                        width: `${Math.max(4, (row.visitors / maxCohortVisitors) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <em>{row.conversions.toLocaleString()} conv.</em>
                                  <b>{row.conversionRate.toFixed(2)}%</b>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Layout.Section>
                  )}

                  {/* Detailed Table */}
                  <Layout.Section>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingLg" as="h2">
                          Variant Performance Details
                        </Text>
                        <div className={styles.dataTableCard}>
                          <DataTable
                            columnContentTypes={variantTableColumnTypes}
                            headings={variantTableHeadings}
                            rows={tableRows}
                          />
                        </div>
                      </BlockStack>
                    </Card>
                  </Layout.Section>

                  {/* Checkout Output Intelligence */}
                  {checkoutSectionEventNames.length > 0 && (
                    <Layout.Section>
                      <Card>
                        <BlockStack gap="400">
                          <div className={styles.visualSectionHeader}>
                            <div>
                              <Text variant="headingLg" as="h2">
                                Checkout Output Intelligence
                              </Text>
                              <Text variant="bodySm" color="subdued" as="p">
                                Advanced checkout signals separated from purchase conversions, with
                                journey, section, diagnostics, and customization output views.
                              </Text>
                            </div>
                            <Badge tone="info">
                              {checkoutAdvanced?.phase
                                ? checkoutAdvanced.phase.replace(/_/g, ' ')
                                : 'checkout'}
                            </Badge>
                          </div>

                          {checkoutAdvanced?.signalTotals && (
                            <div className={styles.checkoutSignalSummary}>
                              <div>
                                <span>Total checkout events</span>
                                <strong>
                                  {Number(
                                    checkoutAdvanced.signalTotals.totalCheckoutEvents || 0
                                  ).toLocaleString()}
                                </strong>
                              </div>
                              <div>
                                <span>Signal types</span>
                                <strong>
                                  {Number(
                                    checkoutAdvanced.signalTotals.uniqueCheckoutSignals || 0
                                  ).toLocaleString()}
                                </strong>
                              </div>
                              <div>
                                <span>Tracked sections</span>
                                <strong>
                                  {Number(
                                    checkoutAdvanced.signalTotals.sectionsTracked || 0
                                  ).toLocaleString()}
                                </strong>
                              </div>
                            </div>
                          )}

                          {checkoutJourneySteps.length > 0 && (
                            <div className={styles.checkoutJourneyGrid}>
                              {checkoutJourneySteps.map(step => (
                                <div key={step.id} className={styles.checkoutJourneyStep}>
                                  <InlineStack align="space-between" blockAlign="center" gap="200">
                                    <Text variant="headingSm" as="h3">
                                      {step.label}
                                    </Text>
                                    <Badge tone={step.total > 0 ? 'success' : 'attention'}>
                                      {Number(step.total || 0).toLocaleString()}
                                    </Badge>
                                  </InlineStack>
                                  <div className={styles.checkoutJourneyTrack}>
                                    <span
                                      style={{
                                        width: `${Math.min(
                                          100,
                                          (Number(step.total || 0) / checkoutMaxJourneyTotal) * 100
                                        )}%`,
                                      }}
                                    />
                                  </div>
                                  <Text variant="bodySm" color="subdued" as="p">
                                    Leader:{' '}
                                    {step.leader?.variantName
                                      ? `${step.leader.variantName} (${(
                                          step.leader.rate || 0
                                        ).toFixed(1)}%)`
                                      : 'No signal yet'}
                                  </Text>
                                </div>
                              ))}
                            </div>
                          )}

                          {checkoutSectionRows.length > 0 && (
                            <BlockStack gap="250">
                              <Text variant="headingMd" as="h3">
                                Section Performance Matrix
                              </Text>
                              <div className={styles.checkoutSectionMatrix}>
                                {checkoutSectionRows.slice(0, 6).map(row => (
                                  <div
                                    key={`${row.sectionId}-${row.sectionType}`}
                                    className={styles.checkoutSectionMatrixRow}
                                  >
                                    <div>
                                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                                        {row.sectionId}
                                      </Text>
                                      <Text variant="bodySm" color="subdued" as="p">
                                        {formatCheckoutSectionTypeLabel(row.sectionType)}
                                      </Text>
                                    </div>
                                    <div>
                                      <span>Views</span>
                                      <strong>
                                        {Number(row.impressions || 0).toLocaleString()}
                                      </strong>
                                    </div>
                                    <div>
                                      <span>CTA CTR</span>
                                      <strong>{(Number(row.ctr) || 0).toFixed(1)}%</strong>
                                    </div>
                                    <div>
                                      <span>Offer apply</span>
                                      <strong>
                                        {(Number(row.offerApplyRate) || 0).toFixed(1)}%
                                      </strong>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </BlockStack>
                          )}

                          {checkoutProductRows.length > 0 && (
                            <BlockStack gap="250">
                              <Text variant="headingMd" as="h3">
                                Product List Output
                              </Text>
                              <div className={styles.checkoutSectionMatrix}>
                                {checkoutProductRows.slice(0, 8).map(row => (
                                  <div
                                    key={`${row.sectionId}-${row.productId}-${row.analyticsKey || ''}`}
                                    className={`${styles.checkoutSectionMatrixRow} ${styles.checkoutSectionMatrixRowProducts}`}
                                  >
                                    <div>
                                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                                        {row.analyticsKey ||
                                          String(row.productId || 'Product').replace(/.*\//, '')}
                                      </Text>
                                      <Text variant="bodySm" color="subdued" as="p">
                                        {String(row.sourceMode || 'manual').replace(/_/g, ' ')} ·{' '}
                                        {String(row.strategy || 'strategy').replace(/_/g, ' ')} ·{' '}
                                        rank {row.rank || '-'}
                                      </Text>
                                    </div>
                                    <div>
                                      <strong>
                                        {Number(row.impressions || 0).toLocaleString()}
                                      </strong>
                                      <span>views</span>
                                    </div>
                                    <div>
                                      <strong>{(Number(row.clickRate) || 0).toFixed(1)}%</strong>
                                      <span>click rate</span>
                                    </div>
                                    <div>
                                      <strong>
                                        {(Number(row.addSuccessRate) || 0).toFixed(1)}%
                                      </strong>
                                      <span>add success</span>
                                    </div>
                                    <div>
                                      <strong>
                                        {Number(row.addFailures || 0).toLocaleString()}
                                      </strong>
                                      <span>failed adds</span>
                                    </div>
                                    <div className={styles.checkoutMatrixInsight}>
                                      <span>next action</span>
                                      <strong>{getCheckoutProductRepair(row)}</strong>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </BlockStack>
                          )}

                          {(checkoutDiagnosticRows.length > 0 ||
                            checkoutMethodActionRows.length > 0 ||
                            hasCheckoutAdvancedSignals) && (
                            <div className={styles.checkoutOpsGrid}>
                              {hasCheckoutAdvancedSignals && (
                                <div className={styles.checkoutOpsCard}>
                                  <Text variant="headingMd" as="h3">
                                    Checkout Analytics Scope
                                  </Text>
                                  <Text variant="bodySm" color="subdued" as="p">
                                    Checkout signal tables use checkout event metadata and
                                    assignment joins for device or country filters. If a checkout
                                    event cannot be matched to an assignment row, filtered views may
                                    under-count it.
                                  </Text>
                                </div>
                              )}
                              {checkoutDiagnosticRows.length > 0 && (
                                <div className={styles.checkoutOpsCard}>
                                  <Text variant="headingMd" as="h3">
                                    Runtime Diagnostics
                                  </Text>
                                  {checkoutDiagnosticRows.slice(0, 4).map((row, rowIndex) => (
                                    <div
                                      key={`${row.reason || 'diagnostic'}-${rowIndex}`}
                                      className={styles.checkoutOpsRow}
                                    >
                                      <span>{String(row.reason || '').replace(/_/g, ' ')}</span>
                                      <strong>{Number(row.count || 0).toLocaleString()}</strong>
                                      <em>{getCheckoutDiagnosticRepair(row.reason)}</em>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {checkoutMethodActionRows.length > 0 && (
                                <div className={styles.checkoutOpsCard}>
                                  <Text variant="headingMd" as="h3">
                                    Customization Actions
                                  </Text>
                                  {checkoutMethodActionRows.slice(0, 4).map(row => (
                                    <div
                                      key={`${row.eventName}-${row.action}`}
                                      className={styles.checkoutOpsRow}
                                    >
                                      <span>{String(row.action || '').replace(/_/g, ' ')}</span>
                                      <strong>{Number(row.count || 0).toLocaleString()}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          <BlockStack gap="200">
                            <Text variant="headingMd" as="h3">
                              Signal Cards
                            </Text>
                            {checkoutSectionEventNames.map(eventName => (
                              <BlockStack key={eventName} gap="200">
                                <Text variant="bodyMd" fontWeight="semibold" as="p">
                                  {formatCheckoutSectionEventLabel(eventName)}
                                </Text>
                                <Text variant="bodySm" color="subdued" as="p">
                                  {CHECKOUT_SECTION_EVENT_DEFINITIONS[eventName]?.description ||
                                    'Checkout engagement signal.'}
                                </Text>
                                <div className="grid-responsive">
                                  {variants.map(variant => {
                                    const ev = variant.checkoutSectionEvents?.[eventName] || {
                                      count: 0,
                                      sum: 0,
                                      rate: 0,
                                    };
                                    return (
                                      <Card key={`${variant.id}-${eventName}`} sectioned>
                                        <BlockStack gap="100">
                                          <Text variant="bodySm" color="subdued" as="p">
                                            {variant.name}
                                          </Text>
                                          <Text variant="headingLg" as="p" fontWeight="bold">
                                            {ev.count.toLocaleString()}
                                          </Text>
                                          <Text variant="bodySm" color="subdued" as="p">
                                            {(variant.visitors ?? 0) > 0
                                              ? `${(ev.rate ?? 0).toFixed(2)}% of visitors`
                                              : 'No visitors yet'}
                                          </Text>
                                        </BlockStack>
                                      </Card>
                                    );
                                  })}
                                </div>
                              </BlockStack>
                            ))}
                          </BlockStack>
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  )}

                  {/* Secondary Events */}
                  {analytics.secondaryEventNames?.length > 0 && (
                    <Layout.Section>
                      <Card>
                        <BlockStack gap="400">
                          <Text variant="headingLg" as="h2">
                            Secondary Events
                          </Text>
                          <Text variant="bodySm" color="subdued" as="p">
                            Additional events tracked per variant. Use{' '}
                            <code
                              style={{
                                fontSize: '0.8em',
                                background: 'var(--bg-tertiary)',
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              RipX.trackEvent(testId, &apos;event_name&apos;, value)
                            </code>{' '}
                            in your theme.
                          </Text>
                          {analytics.secondaryEventNames.map(eventName => (
                            <BlockStack key={eventName} gap="200">
                              {(() => {
                                const eventGoalConfig =
                                  secondaryGoalConfigByEvent.get(eventName) || {};
                                const aggregation = eventGoalConfig.aggregation || 'count';
                                const role =
                                  eventGoalConfig.metric_role === 'guardrail'
                                    ? 'Guardrail'
                                    : eventGoalConfig.metric_role === 'primary'
                                      ? 'Primary candidate'
                                      : 'Secondary';
                                return (
                                  <InlineStack align="space-between" blockAlign="center" gap="200">
                                    <Text variant="headingMd" as="h3">
                                      {(eventGoalConfig.label || eventName).replace(/_/g, ' ')}
                                    </Text>
                                    <Badge tone={role === 'Guardrail' ? 'attention' : 'info'}>
                                      {aggregation === 'sum' ? 'Sum value' : role}
                                    </Badge>
                                  </InlineStack>
                                );
                              })()}
                              <div className="grid-responsive">
                                {variants.map(variant => {
                                  const eventGoalConfig =
                                    secondaryGoalConfigByEvent.get(eventName) || {};
                                  const useSum = eventGoalConfig.aggregation === 'sum';
                                  const ev = variant.secondaryEvents?.[eventName] || {
                                    count: 0,
                                    sum: 0,
                                    rate: 0,
                                  };
                                  return (
                                    <Card key={variant.id} sectioned>
                                      <BlockStack gap="100">
                                        <Text variant="bodySm" color="subdued" as="p">
                                          {variant.name}
                                        </Text>
                                        <Text variant="headingLg" as="p" fontWeight="bold">
                                          {useSum
                                            ? Number(ev.sum || 0).toLocaleString(undefined, {
                                                maximumFractionDigits: 2,
                                              })
                                            : ev.count.toLocaleString()}
                                        </Text>
                                        <Text variant="bodySm" color="subdued" as="p">
                                          {useSum
                                            ? `${ev.count.toLocaleString()} event users`
                                            : (variant.visitors ?? 0) > 0
                                              ? `${(ev.rate ?? 0).toFixed(2)}% rate`
                                              : '—'}
                                        </Text>
                                      </BlockStack>
                                    </Card>
                                  );
                                })}
                              </div>
                            </BlockStack>
                          ))}
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  )}

                  {/* Revenue Impact */}
                  {analytics.revenueImpact && (
                    <Layout.Section>
                      <Card>
                        <BlockStack gap="400">
                          <Text variant="headingLg" as="h2">
                            Revenue Impact Analysis
                          </Text>

                          <div className="grid-responsive">
                            <Card sectioned>
                              <BlockStack gap="200">
                                <Text variant="bodyMd" color="subdued" as="p">
                                  Control Revenue
                                </Text>
                                <Text variant="heading2xl" as="h2" fontWeight="bold">
                                  $
                                  {(analytics.revenueImpact.controlRevenue ?? 0).toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}
                                </Text>
                              </BlockStack>
                            </Card>

                            <Card sectioned>
                              <BlockStack gap="200">
                                <Text variant="bodyMd" color="subdued" as="p">
                                  Test Revenue
                                </Text>
                                <Text variant="heading2xl" as="h2" fontWeight="bold">
                                  $
                                  {(analytics.revenueImpact.testRevenue ?? 0).toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    }
                                  )}
                                </Text>
                              </BlockStack>
                            </Card>

                            <Card sectioned>
                              <BlockStack gap="200">
                                <Text variant="bodyMd" color="subdued" as="p">
                                  Revenue Impact
                                </Text>
                                <Text
                                  variant="heading2xl"
                                  as="h2"
                                  fontWeight="bold"
                                  color={
                                    (analytics.revenueImpact.impact ?? 0) > 0
                                      ? 'success'
                                      : 'critical'
                                  }
                                >
                                  ${(analytics.revenueImpact.impact ?? 0) > 0 ? '+' : ''}
                                  {(analytics.revenueImpact.impact ?? 0).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </Text>
                                <Text variant="bodySm" color="subdued" as="p">
                                  {(analytics.revenueImpact.impactPercent ?? 0) > 0 ? '+' : ''}
                                  {(analytics.revenueImpact.impactPercent ?? 0).toFixed(2)}% change
                                </Text>
                              </BlockStack>
                            </Card>
                          </div>
                        </BlockStack>
                      </Card>
                    </Layout.Section>
                  )}
                </>
              </Layout>
            )}

            {/* Tab 1: Funnel - Full width */}
            {selectedTab === 1 && (
              <div className={styles.fullWidthTabContent}>
                <FunnelView
                  testId={id}
                  variants={variants}
                  segmentDevice={segmentDevice}
                  segmentCountry={segmentCountry}
                  searchParams={searchParams}
                  updateAnalyticsSearch={updateAnalyticsSearch}
                  refreshSignal={reportRefreshSignal}
                />
              </div>
            )}

            {/* Tab 2: Heatmap - Full width */}
            {selectedTab === 2 && (
              <div className={styles.fullWidthTabContent}>
                <HeatmapView
                  testId={id}
                  variants={variants}
                  segmentDevice={segmentDevice}
                  segmentCountry={segmentCountry}
                  searchParams={searchParams}
                  updateAnalyticsSearch={updateAnalyticsSearch}
                  refreshSignal={reportRefreshSignal}
                />
              </div>
            )}

            {/* Tab 3: Events - Full width */}
            {selectedTab === 3 && (
              <div className={styles.fullWidthTabContent}>
                <EventExplorer
                  testId={id}
                  variants={variants}
                  goalConfig={goalConfig}
                  eventStats={analytics.secondaryEventStats || {}}
                  segmentDevice={segmentDevice}
                  segmentCountry={segmentCountry}
                  searchParams={searchParams}
                  updateAnalyticsSearch={updateAnalyticsSearch}
                  refreshSignal={reportRefreshSignal}
                />
              </div>
            )}
          </div>
        </div>
      </Page>

      <Modal
        open={decisionOpen}
        onClose={() => setDecisionOpen(false)}
        title="Decision readiness"
        primaryAction={{
          content: 'Close',
          onAction: () => setDecisionOpen(false),
        }}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Review the checks that determine whether this test is ready for a traffic change.
            </Text>
            <MetricGrid>
              <MetricCard
                title="Visitors"
                value={(
                  promotionReadiness?.checks?.totalVisitors || totalVisitors
                ).toLocaleString()}
                subtitle={decision?.statistics?.sampleSize?.status || 'unknown'}
              />
              <MetricCard
                title="Runtime"
                value={`${promotionReadiness?.checks?.runtimeDays || 0}d`}
                subtitle={`${promotionReadiness?.checks?.minimumRuntimeDays || 7}d recommended`}
              />
              <MetricCard
                title="Guardrails"
                value={decision?.guardrails?.status || 'not configured'}
                subtitle={`${decision?.guardrails?.configured || 0} configured`}
              />
            </MetricGrid>
            {[...promotionBlockers, ...promotionWarnings].length > 0 ? (
              <BlockStack gap="200">
                {[...promotionBlockers, ...promotionWarnings].map(item => (
                  <Banner
                    key={`${item.code}-${item.label}`}
                    tone={promotionBlockers.includes(item) ? 'critical' : 'warning'}
                    title={item.label}
                  >
                    <Text as="p" variant="bodySm">
                      {item.detail}
                    </Text>
                  </Banner>
                ))}
              </BlockStack>
            ) : (
              <Banner tone="success" title="No blockers detected">
                <Text as="p" variant="bodySm">
                  This test has no current decision-readiness blockers in the active segment scope.
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={promoteOpen && !!promoteCandidate}
        onClose={() => {
          setPromoteError(null);
          setPromoteOpen(false);
        }}
        title="Promote winner?"
        primaryAction={{
          content: promotionBlocked ? 'Promotion blocked' : 'Promote',
          onAction: handlePromoteWinner,
          loading: promoteLoading,
          disabled: !promoteCandidate || promotionBlocked,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => {
              setPromoteError(null);
              setPromoteOpen(false);
            },
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              This will set {promoteCandidate?.name || 'the leading variant'} to 100% traffic and
              all other variants to 0%.
            </Text>
            {promotionBlockers.length > 0 && (
              <Banner tone="critical" title="Promotion blocked">
                <BlockStack gap="100">
                  {promotionBlockers.map(item => (
                    <Text key={`${item.code}-${item.label}`} as="p" variant="bodySm">
                      <strong>{item.label}:</strong> {item.detail}
                    </Text>
                  ))}
                </BlockStack>
              </Banner>
            )}
            {promotionBlockers.length === 0 && promotionWarnings.length > 0 && (
              <Banner tone="warning" title="Review warnings">
                <BlockStack gap="100">
                  {promotionWarnings.map(item => (
                    <Text key={`${item.code}-${item.label}`} as="p" variant="bodySm">
                      <strong>{item.label}:</strong> {item.detail}
                    </Text>
                  ))}
                </BlockStack>
              </Banner>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </div>
  );
}

export default Analytics;
