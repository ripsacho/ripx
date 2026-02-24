/**
 * Analytics Component
 *
 * Enhanced analytics dashboard with Intelligems-style metrics and visualizations
 */

import React, { useState, useEffect } from 'react';
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
  Icon,
} from '@shopify/polaris';
import {
  EyeFirstIcon,
  ExportIcon,
  LinkIcon,
  RefreshIcon,
  StarFilledIcon,
} from '@shopify/polaris-icons';
import { useParams, useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import pageShell from '../Shared/PageShell.module.css';
import styles from './Analytics.module.css';
import { getTestTypeDisplay } from '../../utils/testType';
import { setupDataTableButtonStyling } from '../../utils/dataTableStyles';
import { apiPut } from '../../services';
import { useAnalyticsDashboard, useInvalidateAnalytics } from '../../hooks';
import { MetricCard, MetricGrid, TooltipWrapper, CustomTabs } from '../Shared';
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Select } from '@shopify/polaris';
import HeatmapView from './HeatmapView';
import FunnelView from './FunnelView';
import EventExplorer from './EventExplorer';
import { CHART_PALETTE } from '../../constants';

const COLORS = CHART_PALETTE;

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  border: '1px solid rgba(6, 182, 212, 0.25)',
  borderRadius: '12px',
  padding: '12px 16px',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
  color: 'var(--text-primary)',
  backdropFilter: 'blur(12px)',
};

function Analytics() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [segmentDevice, setSegmentDevice] = useState('all');
  const [segmentCountry, setSegmentCountry] = useState('all');
  const [selectedTab, setSelectedTab] = useState(0);
  const [successMessage, setSuccessMessage] = useState(null);
  const [promoteError, setPromoteError] = useState(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteLoading, setPromoteLoading] = useState(false);

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
  const testInfo = data?.testInfo ?? null;
  const segmentOptions = data?.segments ?? { devices: [], countries: [] };

  useEffect(() => {
    if (!id || id === 'undefined') {
      navigate('/tests');
    }
  }, [id, navigate]);

  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [analytics]);

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
            { content: 'All Tests', onAction: () => navigate('/tests') },
            testInfo?.id
              ? {
                  content: testInfo.name || 'Test Details',
                  onAction: () => navigate(`/tests/${testInfo.id}`),
                }
              : { content: 'Test Details', onAction: () => navigate(`/tests/${id}`) },
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

  const chartData = variants.map((v, index) => ({
    name: v.name || `Variant ${index + 1}`,
    'Conversion Rate': parseFloat((v.conversionRate ?? 0).toFixed(2)),
    Revenue: parseFloat((v.revenue ?? 0).toFixed(2)),
    Visitors: v.visitors,
    Conversions: v.conversions,
    color: COLORS[index % COLORS.length],
  }));

  const pieData = variants.map((v, index) => ({
    name: v.name || `Variant ${index + 1}`,
    value: v.visitors ?? 0,
    color: COLORS[index % COLORS.length],
  }));

  const bestVariant = variants.reduce((best, current) => {
    if (!best) return current;
    return current.conversionRate > best.conversionRate ? current : best;
  }, null);

  const sig = analytics.significance;
  let winner = null;
  if (sig?.winner) {
    if (sig.winner === 'variantA') {
      winner = variants[0] || null;
    } else if (sig.winner === 'variantB') {
      winner = variants[1] || null;
    } else if (sig.winner === 'best' && (sig.winnerVariantId || sig.bestVariantId)) {
      winner = variants.find(v => v.id === (sig.winnerVariantId || sig.bestVariantId)) || null;
    }
  }

  const promoteCandidate = winner || bestVariant;

  const tableRows = variants.map((variant, index) => [
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
    `$${(variant.revenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `$${(variant.avgOrderValue ?? 0).toFixed(2)}`,
  ]);

  const totalVisitors = variants.reduce((sum, v) => sum + (v.visitors || 0), 0);
  const totalConversions = variants.reduce((sum, v) => sum + (v.conversions || 0), 0);
  const totalRevenue = variants.reduce((sum, v) => sum + (v.revenue || 0), 0);
  const overallConversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
  const targeting = testInfo?.segments || {};
  const targetingCountries =
    Array.isArray(targeting.countries) && targeting.countries.length > 0
      ? targeting.countries.join(', ')
      : 'All countries';
  const holdoutPercent = Number(testInfo?.holdout_percent || 0);
  const holdoutRemainder = Math.max(0, 100 - holdoutPercent);

  const handlePromoteWinner = async () => {
    if (!promoteCandidate) return;
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
                  onClick={() => navigate('/tests')}
                >
                  ← All Tests
                </button>
                <span className={styles.heroBreadcrumbSep}>/</span>
                <button
                  type="button"
                  className={styles.heroBreadcrumbLink}
                  onClick={() => navigate(`/tests/${id}`)}
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
                    {testInfo?.goal?.conversion_window_days && (
                      <span className={styles.heroBadge} style={{ marginLeft: 8 }}>
                        Window: {testInfo.goal.conversion_window_days}d
                      </span>
                    )}
                  </div>
                </div>
                <div className={styles.heroRight}>
                  <div className={styles.heroActions}>
                    <button
                      type="button"
                      className={`${styles.heroPrimaryBtn} ${styles.heroPrimaryBtnExport}`}
                      onClick={() => navigate(`/tests/${id}/export`)}
                    >
                      <Icon source={ExportIcon} />
                      Export Results
                    </button>
                    <div className={styles.heroActionsDivider} aria-hidden="true" />
                    <div className={styles.heroSecondaryBar}>
                      <button
                        type="button"
                        className={styles.heroSecondaryBtn}
                        onClick={() => navigate(`/tests/${id}`)}
                      >
                        <Icon source={EyeFirstIcon} />
                        View Details
                      </button>
                      {testInfo?.type === 'offer' && (
                        <button
                          type="button"
                          className={styles.heroSecondaryBtn}
                          onClick={() => navigate(`/tests/${id}/promo-links`)}
                        >
                          <Icon source={LinkIcon} />
                          Promo Links
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.heroSecondaryBtn}
                        onClick={fetchAnalytics}
                      >
                        <Icon source={RefreshIcon} />
                        Refresh
                      </button>
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
                        <Icon source={StarFilledIcon} />
                        Promote Winner
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
            </section>

            {/* Winner Banner */}
            {winner && (
              <div className={styles.winnerBanner}>
                <div className={styles.winnerIcon}>🏆</div>
                <div className={styles.winnerContent}>
                  <div className={styles.winnerTitle}>Winner: {winner.name}</div>
                  <div className={styles.winnerSubtitle}>
                    {(winner.conversionRate ?? 0).toFixed(2)}% conversion rate with{' '}
                    {analytics.significance?.lift ?? 0}% lift over control
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

            <div className={styles.tabsWrapper}>
              <CustomTabs
                tabs={[
                  { id: 'overview', content: 'Overview' },
                  { id: 'funnel', content: 'Funnel' },
                  { id: 'heatmap', content: 'Heatmap' },
                  { id: 'events', content: 'Events' },
                ]}
                selected={selectedTab}
                onSelect={setSelectedTab}
              >
                <Text variant="bodySm" color="subdued" as="p" fontWeight="regular">
                  {selectedTab === 0 && 'Full dashboard: metrics, charts, funnel, and heatmap'}
                  {selectedTab === 1 && 'Conversion funnel by variant with date range'}
                  {selectedTab === 2 && 'Click heatmap by device and time'}
                  {selectedTab === 3 && 'Browse and filter tracked events'}
                </Text>
              </CustomTabs>
            </div>

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
                        onChange={setSegmentDevice}
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
                        onChange={setSegmentCountry}
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
                        value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        subtitle="From all variants"
                        tooltip="Total revenue from all variants"
                      />
                      {winner && (
                        <MetricCard
                          title="Winner"
                          value={winner.name}
                          subtitle={`${analytics.significance.lift}% lift`}
                          variant="success"
                          tooltip="Statistically significant winning variant"
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

                  {/* Statistical Significance */}
                  {analytics.significance && (
                    <Layout.Section>
                      <Card>
                        <BlockStack gap="400">
                          <Text variant="headingLg" as="h2">
                            {analytics.significance.bayesian
                              ? 'Bayesian Analysis'
                              : 'Statistical Significance'}
                          </Text>

                          {analytics.significance.bayesian &&
                          analytics.significance.probToBeatControl ? (
                            <BlockStack gap="300">
                              <Text variant="bodySm" color="subdued" as="p">
                                Probability each variant beats control (conversion rate)
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
                                  This variant performed best with a {analytics.significance.lift}%
                                  lift and {(winner.conversionRate ?? 0).toFixed(2)}% conversion
                                  rate.
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
                        <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
                          Performance Over Time
                        </Text>
                        <ResponsiveContainer width="100%" height={420}>
                          <LineChart data={timeSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-primary)" />
                            <XAxis dataKey="name" stroke="var(--text-secondary)" />
                            <YAxis stroke="var(--text-secondary)" />
                            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                            <Legend />
                            {variants.map((variant, index) => (
                              <Line
                                key={variant.id}
                                type="monotone"
                                dataKey={`${variant.name}.conversionRate`}
                                name={`${variant.name} Conversion Rate`}
                                stroke={COLORS[index % COLORS.length]}
                                strokeWidth={2}
                                dot={{ r: 4 }}
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Layout.Section>
                  )}

                  {/* Charts */}
                  <Layout.Section>
                    <div className={`chart-container ${styles.chartCard}`}>
                      <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
                        Conversion Rate Comparison
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
                              dataKey="Conversion Rate"
                              fill="var(--accent-primary)"
                              radius={[8, 8, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className={styles.emptyChart}>
                          <Text variant="bodyMd" color="subdued" as="p">
                            No variant data yet. Run your test to see conversion rates.
                          </Text>
                        </div>
                      )}
                    </div>
                  </Layout.Section>

                  <Layout.Section secondary>
                    <div className={`chart-container ${styles.chartCard}`}>
                      <Text variant="headingLg" as="h2" style={{ marginBottom: '1.5rem' }}>
                        Traffic Distribution
                      </Text>
                      {totalVisitors > 0 ? (
                        <ResponsiveContainer width="100%" height={360}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              labelLine={false}
                              label={({ name, percent }) =>
                                `${name}: ${(percent * 100).toFixed(0)}%`
                              }
                              outerRadius={100}
                              fill="var(--accent-primary)"
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className={styles.emptyChart}>
                          <Text variant="bodyMd" color="subdued" as="p">
                            No traffic data yet. Start your test to see distribution.
                          </Text>
                        </div>
                      )}
                    </div>
                  </Layout.Section>

                  {/* Detailed Table */}
                  <Layout.Section>
                    <Card>
                      <BlockStack gap="400">
                        <Text variant="headingLg" as="h2">
                          Variant Performance Details
                        </Text>
                        <div className={styles.dataTableCard}>
                          <DataTable
                            columnContentTypes={[
                              'text',
                              'numeric',
                              'numeric',
                              'numeric',
                              'numeric',
                              'numeric',
                            ]}
                            headings={[
                              'Variant',
                              'Visitors',
                              'Conversions',
                              'Conversion Rate',
                              'Revenue',
                              'AOV',
                            ]}
                            rows={tableRows}
                          />
                        </div>
                      </BlockStack>
                    </Card>
                  </Layout.Section>

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
                              <Text variant="headingMd" as="h3">
                                {eventName.replace(/_/g, ' ')}
                              </Text>
                              <div className="grid-responsive">
                                {variants.map(variant => {
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
                                          {ev.count.toLocaleString()}
                                        </Text>
                                        <Text variant="bodySm" color="subdued" as="p">
                                          {(variant.visitors ?? 0) > 0
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

                  {/* Funnel Analysis */}
                  <Layout.Section>
                    <FunnelView
                      testId={id}
                      variants={variants}
                      segmentDevice={segmentDevice}
                      segmentCountry={segmentCountry}
                    />
                  </Layout.Section>

                  {/* Heatmap */}
                  <Layout.Section>
                    <HeatmapView testId={id} variants={variants} />
                  </Layout.Section>

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
                />
              </div>
            )}

            {/* Tab 2: Heatmap - Full width */}
            {selectedTab === 2 && (
              <div className={styles.fullWidthTabContent}>
                <HeatmapView testId={id} variants={variants} />
              </div>
            )}

            {/* Tab 3: Events - Full width */}
            {selectedTab === 3 && (
              <div className={styles.fullWidthTabContent}>
                <EventExplorer testId={id} variants={variants} />
              </div>
            )}
          </div>
        </div>
      </Page>

      <Modal
        open={promoteOpen && !!promoteCandidate}
        onClose={() => {
          setPromoteError(null);
          setPromoteOpen(false);
        }}
        title="Promote winner?"
        primaryAction={{
          content: 'Promote',
          onAction: handlePromoteWinner,
          loading: promoteLoading,
          disabled: !promoteCandidate,
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
          <Text as="p">
            This will set {promoteCandidate?.name || 'the leading variant'} to 100% traffic and all
            other variants to 0%.
          </Text>
        </Modal.Section>
      </Modal>
    </div>
  );
}

export default Analytics;
