/**
 * Funnel View - Advanced conversion funnel visualization
 *
 * Features: Recharts FunnelChart, date range filter, side-by-side comparison,
 * empty-state guidance, loading skeleton, export support.
 */
import React, { useState, useEffect } from 'react';
import { BlockStack, Text, Select, Banner } from '@shopify/polaris';
import { apiGet } from '../../services';
import { getDefaultAnalyticsDateRange } from '../../utils/preferences';
import { CHART_PALETTE, FUNNEL_STEP_COLORS } from '../../constants';
import styles from './FunnelView.module.css';
import {
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

const COLORS = CHART_PALETTE;

const DATE_RANGES = [
  { label: 'All time', value: 'all' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

function getDateRangeParams(value) {
  if (!value || value === 'all') return {};
  const days = parseInt(value, 10);
  if (isNaN(days)) return {};
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const endNext = new Date(end);
  endNext.setDate(endNext.getDate() + 1);
  return {
    start_date: start.toISOString().split('T')[0],
    end_date: endNext.toISOString().split('T')[0],
  };
}

function FunnelSkeleton() {
  return (
    <div className={styles.funnelSection}>
      <div className={styles.funnelHeader}>
        <div className={styles.funnelHeaderLeft}>
          <div style={{ width: 180, height: 24, background: 'var(--bg-tertiary)', borderRadius: 4 }} />
          <div style={{ width: 280, height: 16, background: 'var(--bg-tertiary)', borderRadius: 4 }} />
        </div>
        <div style={{ width: 140, height: 36, background: 'var(--bg-tertiary)', borderRadius: 8 }} />
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

function FunnelView({ testId, variants = [], segmentDevice = 'all', segmentCountry = 'all' }) {
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState('');
  const [dateRange, setDateRange] = useState(() => getDefaultAnalyticsDateRange());
  const [viewMode, setViewMode] = useState('single'); // 'single' | 'compare'

  useEffect(() => {
    if (!testId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
    if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
    const dateParams = getDateRangeParams(dateRange);
    if (dateParams.start_date) params.set('start_date', dateParams.start_date);
    if (dateParams.end_date) params.set('end_date', dateParams.end_date);
    apiGet(`/analytics/tests/${testId}/funnel${params.toString() ? `?${params}` : ''}`)
      .then(res => {
        const data = res.data?.funnel || res.data?.data?.funnel;
        setFunnel(data || null);
        if (data?.byVariant && Object.keys(data.byVariant).length > 0) {
          setSelectedVariant(prev => (prev && data.byVariant[prev] ? prev : Object.keys(data.byVariant)[0]));
        }
      })
      .catch(() => setFunnel(null))
      .finally(() => setLoading(false));
  }, [testId, segmentDevice, segmentCountry, dateRange]);

  if (loading) {
    return <FunnelSkeleton />;
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
                    <code>RipX.trackEvent(testId, &apos;add_to_cart&apos;)</code> on the add-to-cart button
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
  const selectedData =
    selectedVariant && funnel.byVariant[selectedVariant]
      ? funnel.byVariant[selectedVariant]
      : funnel.byVariant[variantIds[0]];
  const funnelData = buildFunnelData(selectedData, steps);

  const addToCartStep = steps.find(s => s.id === 'add_to_cart');
  const hasZeroAddToCart = addToCartStep && variantIds.some(vid => (funnel.byVariant[vid][addToCartStep.id] || 0) === 0);
  const totalVisitors = variantIds.reduce((s, vid) => s + (funnel.byVariant[vid].visitors || 0), 0);

  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload?.[0]) return null;
    const entry = payload[0].payload;
    const prev = funnelData[funnelData.indexOf(entry) - 1];
    const dropOff =
      prev && prev.value > 0 ? `${(((prev.value - entry.value) / prev.value) * 100).toFixed(1)}% drop-off` : null;
    return (
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          {entry.name}: {entry.value.toLocaleString()}
        </Text>
        {dropOff && (
          <Text as="p" variant="bodySm" color="subdued">
            {dropOff}
          </Text>
        )}
      </div>
    );
  };

  const SingleFunnelChart = ({ data, height = 320 }) => (
    <ResponsiveContainer width="100%" height={height}>
      <FunnelChart data={data} layout="centric" margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
        <Tooltip content={<CustomTooltip />} />
        <Funnel dataKey="value" nameKey="name" isAnimationActive>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
          ))}
          <LabelList dataKey="name" position="center" fill="#fff" stroke="none" style={{ fontWeight: 600, fontSize: 14 }} />
          <LabelList
            dataKey="value"
            position="center"
            fill="#fff"
            stroke="none"
            style={{ fontWeight: 400, fontSize: 12 }}
            formatter={val => (val !== null && val !== undefined ? Number(val).toLocaleString() : '0')}
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
          <p className={styles.funnelSubtitle}>
            Visitors → Add to Cart → Purchase. Compare variant performance.
          </p>
        </div>
        <div className={styles.funnelFilters}>
          <Select
            label="Date range"
            labelHidden
            options={DATE_RANGES}
            value={dateRange}
            onChange={setDateRange}
          />
          <Select
            label="Variant"
            labelHidden
            options={variantOptions}
            value={selectedVariant || variantIds[0]}
            onChange={setSelectedVariant}
          />
          <button
            type="button"
            className={styles.funnelCompareBtn}
            onClick={() => setViewMode(m => (m === 'single' ? 'compare' : 'single'))}
          >
            {viewMode === 'single' ? 'Compare all' : 'Single view'}
          </button>
        </div>
      </div>

      {hasZeroAddToCart && totalVisitors > 0 && (
        <div className={styles.funnelBanner}>
          <Banner tone="warning" title="Add to Cart has no data">
            <Text as="p" variant="bodySm">
              Add <code>RipX.trackEvent(testId, &apos;add_to_cart&apos;)</code> to your add-to-cart button to track this step.
            </Text>
          </Banner>
        </div>
      )}

      {viewMode === 'single' ? (
        <div className={styles.funnelChartWrapper}>
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
              <div key={variantId} className={styles.funnelVariantCard}>
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

      <div className={styles.funnelStatsGrid}>
        {variantIds.map((variantId, idx) => {
          const data = funnel.byVariant[variantId];
          const name = getVariantName(variantId);
          const color = COLORS[idx % COLORS.length];
          const visitors = data.visitors || 0;
          const addToCart = data.add_to_cart || 0;
          const conversion = data.conversion || 0;
          const cartRate = visitors > 0 ? ((addToCart / visitors) * 100).toFixed(1) : '0';
          const purchaseRate = visitors > 0 ? ((conversion / visitors) * 100).toFixed(1) : '0';
          const cartToPurchaseRate = addToCart > 0 ? ((conversion / addToCart) * 100).toFixed(1) : '0';

          return (
            <div key={variantId} className={styles.funnelStatCard}>
              <div className={styles.funnelStatCardHeader}>
                <div
                  className={styles.funnelStatCardDot}
                  style={{ backgroundColor: color }}
                />
                <h3 className={styles.funnelStatCardTitle}>{name}</h3>
              </div>
              <div className={styles.funnelStatCardValues}>
                <span className={styles.funnelStatCardValue}>Visitors → Cart: {cartRate}%</span>
                <span className={styles.funnelStatCardValue}>Cart → Purchase: {cartToPurchaseRate}%</span>
                <span className={styles.funnelStatCardHighlight}>Overall: {purchaseRate}% conversion</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FunnelView;
