/**
 * Funnel View - Advanced conversion funnel visualization
 *
 * Features: Recharts FunnelChart, date range filter, side-by-side comparison,
 * empty-state guidance, loading skeleton, export support.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { BlockStack, Text, Select, Banner, Button } from '@shopify/polaris';
import { apiGet } from '../../services';
import { getDefaultAnalyticsDateRange } from '../../utils/preferences';
import { CHART_PALETTE, FUNNEL_STEP_COLORS } from '../../constants';
import styles from './FunnelView.module.css';
import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  getApiErrorMessage,
  getDateRangeParams,
  normalizeFunnelVariantParam,
} from './funnelViewUtils';

const COLORS = CHART_PALETTE;

const DATE_RANGES = [
  { label: 'All time', value: 'all' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

const FUNNEL_MODE_OPTIONS = [
  { label: 'Step reach', value: 'step_reach', hint: 'Independent step health' },
  { label: 'Ordered path', value: 'ordered', hint: 'Strict user sequence' },
];

function FunnelSkeleton() {
  return (
    <div className={styles.funnelSection}>
      <div className={styles.funnelHeader}>
        <div className={styles.funnelHeaderLeft}>
          <div
            style={{ width: 180, height: 24, background: 'var(--bg-tertiary)', borderRadius: 4 }}
          />
          <div
            style={{ width: 280, height: 16, background: 'var(--bg-tertiary)', borderRadius: 4 }}
          />
        </div>
        <div
          style={{ width: 140, height: 36, background: 'var(--bg-tertiary)', borderRadius: 8 }}
        />
      </div>
      <div className={styles.funnelChartWrapper}>
        <div style={{ height: 320, background: 'var(--bg-tertiary)', borderRadius: 12 }} />
      </div>
      <div className={styles.funnelStatsGrid}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 80, background: 'var(--bg-tertiary)', borderRadius: 12 }} />
        ))}
      </div>
    </div>
  );
}

function FunnelView({
  testId,
  variants = [],
  segmentDevice = 'all',
  segmentCountry = 'all',
  searchParams,
  updateAnalyticsSearch,
  refreshSignal = 0,
}) {
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(() =>
    normalizeFunnelVariantParam(searchParams)
  );
  const [dateRange, setDateRange] = useState(
    () => searchParams?.get('funnel_range') || getDefaultAnalyticsDateRange()
  );
  const [viewMode, setViewMode] = useState(() => searchParams?.get('funnel_view') || 'single'); // 'single' | 'compare'
  const [funnelMode, setFunnelMode] = useState(
    () => searchParams?.get('funnel_mode') || 'step_reach'
  );
  const [error, setError] = useState('');

  useEffect(() => {
    const nextRange = searchParams?.get('funnel_range') || getDefaultAnalyticsDateRange();
    const nextView = searchParams?.get('funnel_view') || 'single';
    const nextMode = searchParams?.get('funnel_mode') || 'step_reach';
    const nextVariant = normalizeFunnelVariantParam(searchParams);
    if (dateRange !== nextRange) setDateRange(nextRange);
    if (viewMode !== nextView) setViewMode(nextView === 'compare' ? 'compare' : 'single');
    if (funnelMode !== nextMode) setFunnelMode(nextMode === 'ordered' ? 'ordered' : 'step_reach');
    setSelectedVariant(prev => (prev !== nextVariant ? nextVariant : prev));
  }, [searchParams]);

  const handleDateRangeChange = value => {
    setDateRange(value);
    updateAnalyticsSearch?.({ funnel_range: value });
  };
  const handleFunnelModeChange = value => {
    setFunnelMode(value);
    updateAnalyticsSearch?.({ funnel_mode: value === 'ordered' ? 'ordered' : 'all' });
  };
  const handleSelectedVariantChange = value => {
    setSelectedVariant(value);
    updateAnalyticsSearch?.({ funnel_variant: value });
  };
  const handleViewModeToggle = () => {
    const next = viewMode === 'single' ? 'compare' : 'single';
    setViewMode(next);
    updateAnalyticsSearch?.({ funnel_view: next === 'compare' ? 'compare' : 'all' });
  };

  const loadFunnel = useCallback(() => {
    if (!testId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
    if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
    const dateParams = getDateRangeParams(dateRange);
    if (dateParams.start_date) params.set('start_date', dateParams.start_date);
    if (dateParams.end_date) params.set('end_date', dateParams.end_date);
    if (funnelMode === 'ordered') params.set('funnel_mode', 'ordered');
    apiGet(`/analytics/tests/${testId}/funnel${params.toString() ? `?${params}` : ''}`)
      .then(res => {
        const data = res.data?.funnel || res.data?.data?.funnel;
        setFunnel(data || null);
        setError('');
        if (data?.byVariant && Object.keys(data.byVariant).length > 0) {
          setSelectedVariant(prev => {
            const next = prev && data.byVariant[prev] ? prev : Object.keys(data.byVariant)[0];
            return next;
          });
        }
      })
      .catch(error => {
        setFunnel(null);
        setError(getApiErrorMessage(error));
      })
      .finally(() => setLoading(false));
  }, [testId, segmentDevice, segmentCountry, dateRange, funnelMode, updateAnalyticsSearch]);

  useEffect(() => {
    loadFunnel();
  }, [loadFunnel, refreshSignal]);

  if (loading) {
    return <FunnelSkeleton />;
  }

  if (error) {
    return (
      <div className={styles.funnelSection}>
        <div className={styles.funnelHeader}>
          <div className={styles.funnelHeaderLeft}>
            <h2 className={styles.funnelTitle}>Conversion Funnel</h2>
          </div>
        </div>
        <div className={styles.funnelEmpty}>
          <Banner tone="critical" title="Funnel unavailable">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                {error}
              </Text>
              <Button onClick={loadFunnel}>Retry</Button>
            </BlockStack>
          </Banner>
        </div>
      </div>
    );
  }

  if (!funnel || !funnel.byVariant || Object.keys(funnel.byVariant).length === 0) {
    return (
      <div className={styles.funnelSection}>
        <div className={styles.funnelHeader}>
          <div className={styles.funnelHeaderLeft}>
            <h2 className={styles.funnelTitle}>Conversion Funnel</h2>
          </div>
        </div>
        <div className={styles.funnelEmpty}>
          <Banner tone="info" title="No funnel data yet">
            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                Funnel data appears once visitors and events are tracked. Ensure:
              </Text>
              <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                <li>
                  <Text as="span" variant="bodySm">
                    <strong>Visitors</strong> – Storefront script assigns variants automatically
                  </Text>
                </li>
                <li>
                  <Text as="span" variant="bodySm">
                    <strong>Add to Cart</strong> – Call{' '}
                    <code>RipX.trackEvent(testId, &apos;add_to_cart&apos;)</code> on the add-to-cart
                    button
                  </Text>
                </li>
                <li>
                  <Text as="span" variant="bodySm">
                    <strong>Purchase</strong> – Fired via order webhook or storefront checkout
                  </Text>
                </li>
              </ul>
            </BlockStack>
          </Banner>
        </div>
      </div>
    );
  }

  const variantIds = Object.keys(funnel.byVariant);

  const getVariantName = variantId =>
    funnel.variantNames?.[variantId] || variants.find(v => v.id === variantId)?.name || `Variant`;

  const buildFunnelData = (variantData, steps) => {
    if (!steps || steps.length === 0) return [];
    return steps.map((step, idx) => ({
      name: step.label || step.id,
      value: variantData?.[step.id] ?? 0,
      fill: FUNNEL_STEP_COLORS[idx % FUNNEL_STEP_COLORS.length],
    }));
  };

  const variantOptions = variantIds.map(vid => ({
    label: getVariantName(vid),
    value: vid,
  }));

  const steps = funnel.steps || [
    { id: 'visitors', label: 'Visitors' },
    { id: 'add_to_cart', label: 'Add to Cart' },
    { id: 'conversion', label: 'Purchase' },
  ];
  const visitorStep =
    steps.find(step => step.type === 'visitors' || step.id === 'visitors') || steps[0];
  const conversionStep =
    steps.find(step => step.type === 'conversion') ||
    steps.find(step => step.id === 'conversion') ||
    steps[steps.length - 1];
  const firstActionStep =
    steps.find(step => step.id !== visitorStep?.id && step.id !== conversionStep?.id) || steps[1];
  const funnelSubtitle = steps.map(step => step.label || step.id).join(' → ');
  const firstActionEventKey = firstActionStep?.event_name || firstActionStep?.id || 'event_name';
  const selectedData =
    selectedVariant && funnel.byVariant[selectedVariant]
      ? funnel.byVariant[selectedVariant]
      : funnel.byVariant[variantIds[0]];
  const funnelData = buildFunnelData(selectedData, steps);
  const selectedVariantName = getVariantName(selectedVariant || variantIds[0]);
  const selectedVisitorCount = Number(selectedData?.[visitorStep?.id || 'visitors']) || 0;
  const selectedConversionCount = Number(selectedData?.[conversionStep?.id]) || 0;
  const selectedCompletionRate =
    selectedVisitorCount > 0 ? (selectedConversionCount / selectedVisitorCount) * 100 : 0;
  const stepDiagnostics = steps.map((step, index) => {
    const count = Number(selectedData?.[step.id]) || 0;
    const previous = index > 0 ? Number(selectedData?.[steps[index - 1].id]) || 0 : null;
    const visitorShare = selectedVisitorCount > 0 ? (count / selectedVisitorCount) * 100 : 0;
    const delta = previous !== null ? previous - count : 0;
    const dropRate = previous > 0 ? (delta / previous) * 100 : 0;
    const nonMonotone = previous !== null && count > previous;
    return {
      step,
      count,
      visitorShare,
      delta,
      dropRate,
      nonMonotone,
    };
  });
  const bottleneck = stepDiagnostics
    .slice(1)
    .reduce(
      (worst, current) => (current.dropRate > (worst?.dropRate || 0) ? current : worst),
      null
    );
  const hasNonMonotoneSteps = stepDiagnostics.some(item => item.nonMonotone);
  const funnelWarnings = Array.isArray(funnel.warnings) ? funnel.warnings : [];
  const isOrderedFunnel = Boolean(funnel?.semantics?.ordered);
  const modeName = isOrderedFunnel ? 'Ordered Path' : 'Step Reach';
  const modeHelp = isOrderedFunnel
    ? 'Users must reach each step after the previous step'
    : 'Unique users per step, not strict ordered paths';
  const accessibleStepSummary = stepDiagnostics
    .map(
      item =>
        `${item.step.label || item.step.id}: ${item.count.toLocaleString()} users, ${item.visitorShare.toFixed(1)}% of visitors`
    )
    .join('; ');
  const variantDiagnostics = variantIds
    .map(variantId => {
      const data = funnel.byVariant[variantId] || {};
      const visitors = Number(data[visitorStep?.id || 'visitors']) || 0;
      const conversion = Number(data[conversionStep?.id]) || 0;
      const completionRate = visitors > 0 ? (conversion / visitors) * 100 : 0;
      const drops = steps.slice(1).map((step, stepIndex) => {
        const previousStep = steps[stepIndex];
        const previous = Number(data[previousStep.id]) || 0;
        const current = Number(data[step.id]) || 0;
        return {
          step,
          dropRate: previous > 0 ? ((previous - current) / previous) * 100 : 0,
          nonMonotone: current > previous,
        };
      });
      const largestDrop = drops.reduce(
        (worst, current) => (current.dropRate > (worst?.dropRate || 0) ? current : worst),
        null
      );
      return {
        variantId,
        name: getVariantName(variantId),
        visitors,
        conversion,
        completionRate,
        largestDrop,
        hasNonMonotone: drops.some(drop => drop.nonMonotone),
      };
    })
    .sort((a, b) => b.completionRate - a.completionRate)
    .map((item, index) => ({ ...item, rank: index + 1 }));
  const topVariant = variantDiagnostics[0] || null;

  const hasZeroActionStep =
    firstActionStep &&
    variantIds.some(vid => (funnel.byVariant[vid][firstActionStep.id] || 0) === 0);
  const totalStepVisitors = variantIds.reduce(
    (sum, vid) => sum + (Number(funnel.byVariant[vid]?.[visitorStep?.id || 'visitors']) || 0),
    0
  );

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null;
    const entry = payload[0].payload;
    const prev = funnelData[funnelData.indexOf(entry) - 1];
    const dropOff =
      prev && prev.value > 0
        ? `${(((prev.value - entry.value) / prev.value) * 100).toFixed(1)}% drop-off`
        : null;
    return (
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
        role="tooltip"
      >
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {entry.name}: {entry.value.toLocaleString()}
        </Text>
        {dropOff && (
          <Text as="p" variant="bodySm" tone="subdued">
            {dropOff}
          </Text>
        )}
      </div>
    );
  };

  const SingleFunnelChart = ({ data, height = 320 }) => (
    <ResponsiveContainer width="100%" height={height}>
      <FunnelChart
        data={data}
        layout="centric"
        margin={{ top: 20, right: 40, bottom: 20, left: 40 }}
      >
        <Tooltip content={<CustomTooltip />} />
        <Funnel dataKey="value" nameKey="name" isAnimationActive>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.fill}
              stroke="rgba(255,255,255,0.3)"
              strokeWidth={1}
            />
          ))}
          <LabelList
            dataKey="name"
            position="center"
            fill="#fff"
            stroke="none"
            style={{ fontWeight: 600, fontSize: 14 }}
          />
          <LabelList
            dataKey="value"
            position="center"
            fill="#fff"
            stroke="none"
            style={{ fontWeight: 400, fontSize: 12 }}
            formatter={val =>
              val !== null && val !== undefined ? Number(val).toLocaleString() : '0'
            }
          />
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );

  return (
    <div className={styles.funnelSection}>
      <div className={styles.funnelHeader}>
        <div className={styles.funnelHeaderLeft}>
          <h2 className={styles.funnelTitle}>Conversion Funnel</h2>
          <p className={styles.funnelSubtitle}>{funnelSubtitle}. Compare variant performance.</p>
        </div>
        <div className={styles.funnelFilters}>
          <Select
            label="Date range"
            labelHidden
            options={DATE_RANGES}
            value={dateRange}
            onChange={handleDateRangeChange}
          />
          <div className={styles.funnelModeToggle} role="group" aria-label="Funnel mode">
            {FUNNEL_MODE_OPTIONS.map(option => (
              <button
                key={option.value}
                type="button"
                className={`${styles.funnelModeButton} ${
                  funnelMode === option.value ? styles.funnelModeButtonActive : ''
                }`}
                aria-pressed={funnelMode === option.value}
                title={option.hint}
                onClick={() => handleFunnelModeChange(option.value)}
              >
                <span>{option.label}</span>
                <small>{option.hint}</small>
              </button>
            ))}
          </div>
          <Select
            label="Variant"
            labelHidden
            options={variantOptions}
            value={selectedVariant || variantIds[0]}
            onChange={handleSelectedVariantChange}
          />
          <button
            type="button"
            className={styles.funnelCompareBtn}
            aria-pressed={viewMode === 'compare'}
            onClick={handleViewModeToggle}
          >
            {viewMode === 'single' ? 'Compare all' : 'Single view'}
          </button>
        </div>
      </div>

      {isOrderedFunnel ? (
        <div className={styles.funnelBanner}>
          <Banner tone="info" title="Ordered path mode is stricter">
            <Text as="p" variant="bodySm">
              Each step only counts users who reached the previous step first. Use this when the
              path order matters; use Step reach when you want independent step health.
            </Text>
          </Banner>
        </div>
      ) : null}

      {hasZeroActionStep && totalStepVisitors > 0 && (
        <div className={styles.funnelBanner}>
          <Banner
            tone="warning"
            title={`${firstActionStep.label || firstActionStep.id} has no data`}
          >
            <Text as="p" variant="bodySm">
              Add <code>{`RipX.trackEvent(testId, '${firstActionEventKey}')`}</code> where this
              funnel step happens so reporting can track{' '}
              {isOrderedFunnel ? 'the ordered path' : 'the full path'}.
            </Text>
          </Banner>
        </div>
      )}

      <div className={styles.funnelInsightGrid}>
        <div className={styles.funnelInsightCard}>
          <span>Selected Variant</span>
          <strong>{selectedVariantName}</strong>
          <small>{selectedVisitorCount.toLocaleString()} visitors in this view</small>
        </div>
        <div className={styles.funnelInsightCard}>
          <span>Completion</span>
          <strong>{selectedCompletionRate.toFixed(1)}%</strong>
          <small>
            {selectedConversionCount.toLocaleString()} reached{' '}
            {conversionStep?.label || 'conversion'}
          </small>
        </div>
        <div className={styles.funnelInsightCard}>
          <span>Largest Drop</span>
          <strong>{bottleneck ? `${bottleneck.dropRate.toFixed(1)}%` : '—'}</strong>
          <small>
            {bottleneck ? `Before ${bottleneck.step.label || bottleneck.step.id}` : 'No drop yet'}
          </small>
        </div>
        <div className={styles.funnelInsightCard}>
          <span>Top Variant</span>
          <strong>{topVariant?.name || '—'}</strong>
          <small>
            {topVariant
              ? `${topVariant.completionRate.toFixed(1)}% completion rate`
              : 'No variant data'}
          </small>
        </div>
        <div className={styles.funnelInsightCard}>
          <span>Mode</span>
          <strong>{modeName}</strong>
          <small>{modeHelp}</small>
        </div>
      </div>

      {((hasNonMonotoneSteps && !isOrderedFunnel) || funnelWarnings.length > 0) && (
        <div className={styles.funnelBanner}>
          <Banner
            tone={funnelWarnings.length > 0 ? 'warning' : 'info'}
            title="Funnel interpretation note"
          >
            <BlockStack gap="150">
              {hasNonMonotoneSteps && !isOrderedFunnel ? (
                <Text as="p" variant="bodySm">
                  Some later steps have more users than earlier steps. This is expected in
                  step-reach mode because each step is counted independently.
                </Text>
              ) : null}
              {funnelWarnings.map(warning => (
                <Text key={`${warning.code}-${warning.stepId}`} as="p" variant="bodySm">
                  {warning.message}
                </Text>
              ))}
            </BlockStack>
          </Banner>
        </div>
      )}

      {viewMode === 'single' ? (
        <div
          className={styles.funnelChartWrapper}
          role="img"
          aria-label={`Funnel chart for ${selectedVariantName}: ${selectedConversionCount.toLocaleString()} users reached ${conversionStep?.label || 'conversion'} from ${selectedVisitorCount.toLocaleString()} visitors. ${accessibleStepSummary}.`}
        >
          <div className={styles.funnelChartSingle}>
            <SingleFunnelChart data={funnelData} height={380} />
          </div>
        </div>
      ) : (
        <div className={styles.funnelCompareGrid}>
          {variantIds.map((variantId, idx) => {
            const data = funnel.byVariant[variantId];
            const name = getVariantName(variantId);
            const chartData = buildFunnelData(data, steps);
            return (
              <div
                key={variantId}
                className={styles.funnelVariantCard}
                role="img"
                aria-label={`Funnel chart for ${name}: ${Number(data?.[conversionStep?.id]) || 0} users reached ${conversionStep?.label || 'conversion'} from ${Number(data?.[visitorStep?.id || 'visitors']) || 0} visitors.`}
              >
                <div className={styles.funnelVariantCardHeader}>
                  <div
                    className={styles.funnelVariantDot}
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <h3 className={styles.funnelVariantName}>{name}</h3>
                </div>
                <div className={styles.funnelVariantChart}>
                  <SingleFunnelChart data={chartData} height={220} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {funnel.stepLatency && (
        <div className={styles.funnelBanner}>
          <Banner
            tone={funnel.stepLatency.available ? 'info' : 'warning'}
            title={
              funnel.stepLatency.available
                ? 'Step latency diagnostics'
                : 'Step latency not available yet'
            }
          >
            <Text as="p" variant="bodySm">
              {funnel.stepLatency.reason ||
                'Latency diagnostics show the median time users take between funnel steps.'}
            </Text>
          </Banner>
        </div>
      )}

      <div className={styles.funnelStepTable}>
        <div className={styles.funnelStepTableHeader}>
          <span>Step Diagnostics</span>
          <small>Counts are unique users reached at each step in the selected variant.</small>
        </div>
        <table className={styles.funnelDataTable}>
          <caption className={styles.srOnly}>Step diagnostics for {selectedVariantName}</caption>
          <thead>
            <tr>
              <th scope="col">Step</th>
              <th scope="col">Users</th>
              <th scope="col">Visitor share</th>
              <th scope="col">Drop from previous</th>
            </tr>
          </thead>
          <tbody>
            {stepDiagnostics.map((item, index) => (
              <tr
                key={item.step.id}
                className={item.nonMonotone ? styles.funnelStepRowWarning : ''}
              >
                <th scope="row">
                  <span className={styles.funnelStepIndex}>{index + 1}</span>
                  <span className={styles.funnelStepName}>
                    <strong>{item.step.label || item.step.id}</strong>
                    <small>{item.step.type || 'event'}</small>
                  </span>
                </th>
                <td>
                  <strong>{item.count.toLocaleString()}</strong>
                  <small>users</small>
                </td>
                <td>
                  <strong>{item.visitorShare.toFixed(1)}%</strong>
                  <small>of visitors</small>
                </td>
                <td>
                  <strong>{index === 0 ? '—' : `${item.dropRate.toFixed(1)}%`}</strong>
                  <small>{item.nonMonotone ? 'higher than previous' : 'drop from previous'}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.funnelVariantLeaderboard}>
        <div className={styles.funnelStepTableHeader}>
          <span>Variant Funnel Ranking</span>
          <small>Ranks variants by selected funnel completion rate.</small>
        </div>
        <div className={styles.funnelLeaderboardRows}>
          {variantDiagnostics.map(item => (
            <button
              key={item.variantId}
              type="button"
              className={`${styles.funnelLeaderboardRow} ${
                item.variantId === (selectedVariant || variantIds[0])
                  ? styles.funnelLeaderboardRowActive
                  : ''
              }`}
              aria-current={
                item.variantId === (selectedVariant || variantIds[0]) ? 'true' : undefined
              }
              onClick={() => handleSelectedVariantChange(item.variantId)}
            >
              <span className={styles.funnelStepIndex}>{item.rank}</span>
              <span className={styles.funnelStepName}>
                <strong>{item.name}</strong>
                <small>{item.visitors.toLocaleString()} visitors</small>
              </span>
              <span>
                <strong>{item.completionRate.toFixed(1)}%</strong>
                <small>completion</small>
              </span>
              <span>
                <strong>
                  {item.largestDrop ? `${item.largestDrop.dropRate.toFixed(1)}%` : '—'}
                </strong>
                <small>
                  {item.largestDrop
                    ? `largest drop before ${item.largestDrop.step.label || item.largestDrop.step.id}`
                    : 'no drop'}
                </small>
              </span>
              <span>
                <strong>{item.hasNonMonotone ? 'Check' : 'Clean'}</strong>
                <small>{item.hasNonMonotone ? 'independent step signal' : 'monotone reach'}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.funnelStatsGrid}>
        {variantIds.map((variantId, idx) => {
          const data = funnel.byVariant[variantId];
          const name = getVariantName(variantId);
          const color = COLORS[idx % COLORS.length];
          const visitors = data[visitorStep?.id || 'visitors'] || 0;
          const firstAction = data[firstActionStep?.id] || 0;
          const conversion = data[conversionStep?.id] || 0;
          const actionRate = visitors > 0 ? ((firstAction / visitors) * 100).toFixed(1) : '0';
          const conversionRate = visitors > 0 ? ((conversion / visitors) * 100).toFixed(1) : '0';
          const actionToConversionRate =
            firstAction > 0 ? ((conversion / firstAction) * 100).toFixed(1) : '0';

          return (
            <div key={variantId} className={styles.funnelStatCard}>
              <div className={styles.funnelStatCardHeader}>
                <div className={styles.funnelStatCardDot} style={{ backgroundColor: color }} />
                <h3 className={styles.funnelStatCardTitle}>{name}</h3>
              </div>
              <div className={styles.funnelStatCardValues}>
                <span className={styles.funnelStatCardValue}>
                  {visitorStep?.label || 'Visitors'} → {firstActionStep?.label || 'Next'}:{' '}
                  {actionRate}%
                </span>
                <span className={styles.funnelStatCardValue}>
                  {firstActionStep?.label || 'Next'} → {conversionStep?.label || 'Conversion'}:{' '}
                  {actionToConversionRate}%
                </span>
                <span className={styles.funnelStatCardHighlight}>
                  Overall: {conversionRate}% conversion
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FunnelView;
