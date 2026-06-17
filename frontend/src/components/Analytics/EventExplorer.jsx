/**
 * Event Explorer - Browse and filter events for a test
 *
 * Advanced event management: filter by type, name, variant, date range.
 * Pagination, copy event ID, metadata viewer.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  InlineStack,
  Select,
  DataTable,
  Badge,
  Button,
  Banner,
  Pagination,
  SkeletonBodyText,
} from '@shopify/polaris';
import { DuplicateIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { getDefaultAnalyticsDateRange } from '../../utils/preferences';
import {
  CHECKOUT_SECTION_EVENT_DEFINITIONS,
  formatCheckoutSectionEventLabel,
  getCheckoutSectionEventContext,
  isCheckoutSectionEventName,
} from '../../utils/checkoutReporting';
import styles from './EventExplorer.module.css';

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

const PAGE_SIZE = 25;

function normalizeGoalEventName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

function getGoalEventName(goal) {
  if (!goal) return '';
  return normalizeGoalEventName(
    typeof goal === 'object' ? goal.event_name || goal.eventName || '' : goal
  );
}

function getGoalEventLabel(goal, eventName) {
  const label =
    typeof goal === 'object'
      ? goal.label || goal.name || goal.event_label || goal.eventLabel || ''
      : '';
  return String(label || eventName || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function getGoalEventRole(goal) {
  const role = String(typeof goal === 'object' ? goal.metric_role || goal.metricRole || '' : '');
  if (role === 'guardrail') return 'Guardrail';
  if (role === 'diagnostic') return 'Diagnostic';
  return 'Secondary';
}

function getGoalEventSnippet(testId, goal) {
  const eventName = getGoalEventName(goal) || 'event_key';
  const aggregation = typeof goal === 'object' ? goal.aggregation || 'count' : 'count';
  const parameterName = typeof goal === 'object' ? goal.parameter_name || goal.parameterName : '';
  if (aggregation === 'sum') {
    return `RipX.trackEvent('${testId || 'TEST_ID'}', '${eventName}', Number(${parameterName || 'value'} || 0), { source: 'theme' });`;
  }
  return `RipX.trackEvent('${testId || 'TEST_ID'}', '${eventName}', 0, { source: 'theme' });`;
}

function formatNumber(value, options = {}) {
  return (Number(value) || 0).toLocaleString(undefined, options);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00%';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function formatSeenAt(value) {
  return value ? new Date(value).toLocaleString() : 'Never';
}

function getLiftStatus(goal, lift) {
  if (!Number.isFinite(lift)) {
    return { label: 'No Baseline', tone: 'info' };
  }
  const role = getGoalEventRole(goal);
  if (role !== 'Guardrail') {
    if (lift > 0) return { label: 'Improving', tone: 'success' };
    if (lift < 0) return { label: 'Down', tone: 'attention' };
    return { label: 'Flat', tone: 'info' };
  }
  const direction = String(goal?.direction || 'increase');
  const threshold = Math.abs(Number(goal?.min_relative_lift ?? 10));
  const breached = direction === 'decrease' ? lift > threshold : lift < -threshold;
  return breached
    ? { label: 'Guardrail Breach', tone: 'critical' }
    : { label: 'Guardrail OK', tone: 'success' };
}

function normalCDF(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
        t *
        Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

function getEvidenceStatus(goal, controlVariant, variant, metric = {}) {
  if (!controlVariant || controlVariant.id === variant.id || goal.aggregation === 'sum') {
    return null;
  }
  const controlMetric = controlVariant.secondaryEvents?.[goal.event_name] || {};
  const controlVisitors = Number(controlVariant.visitors) || 0;
  const variantVisitors = Number(variant.visitors) || 0;
  const controlCount = Number(controlMetric.count) || 0;
  const variantCount = Number(metric.count) || 0;
  if (controlVisitors <= 0 || variantVisitors <= 0) {
    return { label: 'Needs Visitors', tone: 'info' };
  }
  const pooled = (controlCount + variantCount) / (controlVisitors + variantVisitors);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / controlVisitors + 1 / variantVisitors));
  if (!Number.isFinite(se) || se <= 0) {
    return { label: 'Needs More Data', tone: 'info' };
  }
  const z = variantCount / variantVisitors - controlCount / controlVisitors;
  const pValue = 2 * (1 - normalCDF(Math.abs(z / se)));
  const confidence = Math.max(0, Math.min(99.9, (1 - pValue) * 100));
  if (pValue < 0.05) {
    return { label: `${confidence.toFixed(1)}% Evidence`, tone: 'success' };
  }
  if (pValue < 0.2) {
    return { label: `${confidence.toFixed(1)}% Directional`, tone: 'attention' };
  }
  return { label: `${confidence.toFixed(1)}% Early`, tone: 'info' };
}

function getTrendBuckets(stats = {}, aggregation = 'count') {
  const byDate = new Map();
  (Array.isArray(stats.trend) ? stats.trend : []).forEach(point => {
    if (!point?.date) return;
    const previous = byDate.get(point.date) || 0;
    const value =
      aggregation === 'sum'
        ? Number(point.sum) || 0
        : Number(point.uniqueUsers || point.totalEvents) || 0;
    byDate.set(point.date, previous + value);
  });
  const buckets = Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-10);
  const max = Math.max(1, ...buckets.map(bucket => bucket.value));
  return buckets.map(bucket => ({
    ...bucket,
    height: Math.max(8, Math.round((bucket.value / max) * 100)),
  }));
}

function getCollectionDays(stats = {}) {
  if (!stats.firstSeen || !stats.lastSeen) return 0;
  const first = new Date(stats.firstSeen);
  const last = new Date(stats.lastSeen);
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return 0;
  return Math.max(1, Math.ceil((last - first) / (24 * 60 * 60 * 1000)) + 1);
}

function getEventVisualBuckets(reports = []) {
  const byDate = new Map();
  reports.forEach(report => {
    (Array.isArray(report.stats?.trend) ? report.stats.trend : []).forEach(point => {
      if (!point?.date) return;
      byDate.set(point.date, (byDate.get(point.date) || 0) + (Number(point.totalEvents) || 0));
    });
  });
  const buckets = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, value]) => ({ date, value }));
  const max = Math.max(1, ...buckets.map(bucket => bucket.value));
  return buckets.map(bucket => ({
    ...bucket,
    height: Math.max(8, Math.round((bucket.value / max) * 100)),
  }));
}

function getVariantDistributionRows(report = {}) {
  const rows = Array.isArray(report.variantRows) ? report.variantRows : [];
  const values = rows.map(row =>
    report.goal?.aggregation === 'sum'
      ? Number(row.metric?.sum) || 0
      : Number(row.metric?.count) || 0
  );
  const max = Math.max(1, ...values);
  return rows.map((row, index) => ({
    ...row,
    graphValue: values[index],
    width: Math.max(4, Math.round((values[index] / max) * 100)),
  }));
}

function getEventTrendMomentum(buckets = []) {
  if (!Array.isArray(buckets) || buckets.length < 4) {
    return { label: 'Learning', value: 0, tone: 'info' };
  }
  const midpoint = Math.floor(buckets.length / 2);
  const previous = buckets
    .slice(0, midpoint)
    .reduce((sum, bucket) => sum + (Number(bucket.value) || 0), 0);
  const recent = buckets
    .slice(midpoint)
    .reduce((sum, bucket) => sum + (Number(bucket.value) || 0), 0);
  if (previous <= 0 && recent > 0) {
    return { label: 'New Signal', value: 100, tone: 'success' };
  }
  if (previous <= 0) {
    return { label: 'Learning', value: 0, tone: 'info' };
  }
  const value = ((recent - previous) / previous) * 100;
  if (value > 20) return { label: 'Accelerating', value, tone: 'success' };
  if (value < -20) return { label: 'Cooling', value, tone: 'attention' };
  return { label: 'Stable', value, tone: 'info' };
}

function getEventAttentionItems(reports = []) {
  const now = Date.now();
  return reports
    .map(report => {
      const lastSeen = report.stats?.lastSeen ? new Date(report.stats.lastSeen).getTime() : null;
      const stale = lastSeen ? now - lastSeen > 3 * 24 * 60 * 60 * 1000 : false;
      const lowVolume =
        (Number(report.stats?.totalEvents) || 0) > 0 &&
        (Number(report.stats?.totalEvents) || 0) < 20;
      const guardrail = report.goal?.roleLabel === 'Guardrail';
      let reason = '';
      let severity = 0;
      if (!report.detected) {
        reason = 'Waiting for first event';
        severity = 4;
      } else if (stale) {
        reason = 'No recent collection';
        severity = 3;
      } else if (guardrail && lowVolume) {
        reason = 'Guardrail needs more rows';
        severity = 2;
      } else if (lowVolume) {
        reason = 'Low event volume';
        severity = 1;
      }
      return {
        eventName: report.goal.event_name,
        label: report.goal.label,
        role: report.goal.roleLabel,
        reason,
        severity,
        rows: Number(report.stats?.totalEvents) || 0,
      };
    })
    .filter(item => item.severity > 0)
    .sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label))
    .slice(0, 5);
}

function EventExplorer({
  testId,
  variants = [],
  goalConfig = {},
  eventStats = {},
  segmentDevice = 'all',
  segmentCountry = 'all',
  searchParams,
  updateAnalyticsSearch,
  refreshSignal = 0,
}) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [eventTypes, setEventTypes] = useState([]);
  const [eventNames, setEventNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [page, setPage] = useState(() => Number(searchParams?.get('events_page')) || 1);
  const [eventType, setEventType] = useState(() => searchParams?.get('events_type') || 'all');
  const [eventName, setEventName] = useState(() => searchParams?.get('events_name') || 'all');
  const [variantFilter, setVariantFilter] = useState(
    () => searchParams?.get('events_variant') || 'all'
  );
  const [dateRange, setDateRange] = useState(
    () => searchParams?.get('events_range') || getDefaultAnalyticsDateRange()
  );
  const [copiedId, setCopiedId] = useState(null);
  const [copiedSnippet, setCopiedSnippet] = useState(null);

  const fetchEvents = useCallback(async () => {
    if (!testId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', PAGE_SIZE);
      params.set('offset', (page - 1) * PAGE_SIZE);
      if (eventType && eventType !== 'all') params.set('event_type', eventType);
      if (eventName && eventName !== 'all') params.set('event_name', eventName);
      if (variantFilter && variantFilter !== 'all') params.set('variant_id', variantFilter);
      if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
      if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
      const dateParams = getDateRangeParams(dateRange);
      if (dateParams.start_date) params.set('start_date', dateParams.start_date);
      if (dateParams.end_date) params.set('end_date', dateParams.end_date);

      const res = await apiGet(`/analytics/tests/${testId}/events?${params}`);
      const data = res.data?.data ?? res.data ?? {};
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
      setEventTypes(Array.isArray(data.eventTypes) ? data.eventTypes : []);
      setEventNames(Array.isArray(data.eventNames) ? data.eventNames : []);
      setFetchError('');
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (import.meta.env.DEV) console.error('EventExplorer fetch error:', err);
      setEvents([]);
      setTotal(0);
      setEventTypes([]);
      setEventNames([]);
      setFetchError('Event data could not be loaded. Check tracking setup or retry the request.');
    } finally {
      setLoading(false);
    }
  }, [testId, page, eventType, eventName, variantFilter, segmentDevice, segmentCountry, dateRange]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents, refreshSignal]);

  useEffect(() => {
    const nextPage = Number(searchParams?.get('events_page')) || 1;
    const nextType = searchParams?.get('events_type') || 'all';
    const nextName = searchParams?.get('events_name') || 'all';
    const nextVariant = searchParams?.get('events_variant') || 'all';
    const nextRange = searchParams?.get('events_range') || getDefaultAnalyticsDateRange();
    if (page !== nextPage) setPage(nextPage);
    if (eventType !== nextType) setEventType(nextType);
    if (eventName !== nextName) setEventName(nextName);
    if (variantFilter !== nextVariant) setVariantFilter(nextVariant);
    if (dateRange !== nextRange) setDateRange(nextRange);
  }, [searchParams, dateRange, eventName, eventType, page, variantFilter]);

  const setEventsFilter = updates => {
    updateAnalyticsSearch?.(updates);
  };

  const getVariantName = vid => variants.find(v => v.id === vid)?.name || vid;
  const hasCheckoutSectionSignals = eventNames.some(isCheckoutSectionEventName);
  const configuredGoalEvents = Array.isArray(goalConfig?.secondary)
    ? goalConfig.secondary.reduce((items, goal) => {
        const eventNameValue = getGoalEventName(goal);
        if (!eventNameValue || items.some(item => item.event_name === eventNameValue)) {
          return items;
        }
        items.push({
          ...(typeof goal === 'object' ? goal : { event_name: eventNameValue }),
          event_name: eventNameValue,
          label: getGoalEventLabel(goal, eventNameValue),
          roleLabel: getGoalEventRole(goal),
          aggregation: typeof goal === 'object' ? goal.aggregation || 'count' : 'count',
          direction: typeof goal === 'object' ? goal.direction || 'increase' : 'increase',
          min_relative_lift:
            typeof goal === 'object' ? (goal.min_relative_lift ?? goal.minRelativeLift) : undefined,
        });
        return items;
      }, [])
    : [];
  const trackedEventNameSet = new Set(eventNames);
  const configuredEventNameSet = new Set(configuredGoalEvents.map(goal => goal.event_name));
  const detectedConfiguredCount = configuredGoalEvents.filter(goal =>
    trackedEventNameSet.has(goal.event_name)
  ).length;
  const waitingConfiguredCount = Math.max(0, configuredGoalEvents.length - detectedConfiguredCount);
  const combinedEventNames = Array.from(new Set([...eventNames, ...configuredEventNameSet]));
  const controlVariant =
    variants.find(variant => String(variant.name || '').toLowerCase() === 'control') ||
    variants[0] ||
    null;
  const goalEventReportRows = configuredGoalEvents.map(goal => {
    const stats = eventStats?.[goal.event_name] || {};
    const controlEvent = controlVariant?.secondaryEvents?.[goal.event_name] || {};
    const controlValue =
      goal.aggregation === 'sum' ? Number(controlEvent.sum) || 0 : Number(controlEvent.rate) || 0;
    const variantRows = variants.map(variant => {
      const metric = variant.secondaryEvents?.[goal.event_name] || { count: 0, sum: 0, rate: 0 };
      const value = goal.aggregation === 'sum' ? Number(metric.sum) || 0 : Number(metric.rate) || 0;
      const lift =
        controlVariant && variant.id !== controlVariant.id && controlValue !== 0
          ? ((value - controlValue) / Math.abs(controlValue)) * 100
          : null;
      const status = getLiftStatus(goal, lift);
      const evidence = getEvidenceStatus(goal, controlVariant, variant, metric);
      return { variant, metric, value, lift, status, evidence };
    });
    const collectionDays = getCollectionDays(stats);
    return {
      goal,
      stats,
      variantRows,
      collectionDays,
      trendBuckets: getTrendBuckets(stats, goal.aggregation),
      detected: (stats.totalEvents || 0) > 0 || trackedEventNameSet.has(goal.event_name),
      sourceLabel:
        Array.isArray(stats.sources) && stats.sources.length
          ? `${stats.sources[0].source} / ${stats.sources[0].triggerType}`
          : 'No source yet',
    };
  });
  const eventVisualBuckets = getEventVisualBuckets(goalEventReportRows);
  const totalGoalEventRows = goalEventReportRows.reduce(
    (sum, report) => sum + (Number(report.stats.totalEvents) || 0),
    0
  );
  const totalGoalEventUsers = goalEventReportRows.reduce(
    (sum, report) => sum + (Number(report.stats.uniqueUsers) || 0),
    0
  );
  const roleVisualRows = ['Secondary', 'Guardrail', 'Diagnostic'].map(role => {
    const count = goalEventReportRows.filter(report => report.goal.roleLabel === role).length;
    const detectedCount = goalEventReportRows.filter(
      report => report.goal.roleLabel === role && report.detected
    ).length;
    return { role, count, detectedCount };
  });
  const maxRoleCount = Math.max(1, ...roleVisualRows.map(row => row.count));
  const topEventRows = goalEventReportRows
    .map(report => ({
      eventName: report.goal.event_name,
      label: report.goal.label,
      totalEvents: Number(report.stats.totalEvents) || 0,
      uniqueUsers: Number(report.stats.uniqueUsers) || 0,
    }))
    .sort((a, b) => b.totalEvents - a.totalEvents)
    .slice(0, 5);
  const maxTopEventRows = Math.max(1, ...topEventRows.map(row => row.totalEvents));
  const eventMomentum = getEventTrendMomentum(eventVisualBuckets);
  const attentionItems = getEventAttentionItems(goalEventReportRows);
  const signalScore =
    configuredGoalEvents.length > 0
      ? Math.round(
          Math.min(
            100,
            Math.max(
              0,
              (detectedConfiguredCount / configuredGoalEvents.length) * 70 +
                Math.min(20, totalGoalEventRows / 25) +
                (waitingConfiguredCount === 0 ? 10 : 0)
            )
          )
        )
      : 0;
  const signalScoreLabel =
    signalScore >= 85
      ? 'Excellent'
      : signalScore >= 65
        ? 'Healthy'
        : signalScore >= 35
          ? 'Building'
          : 'Needs Setup';

  const handleCopyId = id => {
    navigator.clipboard?.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleCopySnippet = (eventNameValue, snippet) => {
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopiedSnippet(eventNameValue);
      setTimeout(() => setCopiedSnippet(null), 2000);
    });
  };

  const rows = events.map(ev => {
    const context = getCheckoutSectionEventContext(ev);
    return [
      <InlineStack key={`${ev.id}-actions`} gap="200" align="center" blockAlign="center">
        <Button
          variant="plain"
          icon={DuplicateIcon}
          accessibilityLabel="Copy event ID"
          onClick={() => handleCopyId(ev.id)}
        >
          {copiedId === ev.id ? 'Copied!' : ''}
        </Button>
        <Text variant="bodySm" as="span" tone="subdued">
          {ev.id ? `${ev.id.slice(0, 8)}…` : '—'}
        </Text>
      </InlineStack>,
      <Badge
        key={`${ev.id}-badge`}
        tone={
          isCheckoutSectionEventName(ev.event_name)
            ? 'attention'
            : ev.event_type === 'conversion'
              ? 'success'
              : 'info'
        }
      >
        {ev.event_type}
      </Badge>,
      <div key={`${ev.id}-event`} className={styles.eventsCellStack}>
        <Text as="span" variant="bodySm" fontWeight="semibold">
          {formatCheckoutSectionEventLabel(ev.event_name)}
        </Text>
        {ev.event_name ? (
          <Text as="span" variant="bodySm" tone="subdued">
            {ev.event_name}
          </Text>
        ) : null}
      </div>,
      <div key={`${ev.id}-context`} className={styles.eventsCellStack}>
        <Text as="span" variant="bodySm">
          {context.summary || '—'}
        </Text>
        {context.hasSectionContext ? (
          <Text as="span" variant="bodySm" tone="subdued">
            Phase: {context.checkoutPhase.replace(/_/g, ' ')}
          </Text>
        ) : null}
      </div>,
      getVariantName(ev.variant_id),
      ev.user_id ? `${ev.user_id.slice(0, 12)}${ev.user_id.length > 12 ? '…' : ''}` : '—',
      ev.event_type === 'conversion'
        ? `$${Number(ev.event_value || 0).toFixed(2)}`
        : (ev.event_value ?? '—'),
      ev.created_at ? new Date(ev.created_at).toLocaleString() : '—',
    ];
  });

  const variantOptions = [
    { label: 'All variants', value: 'all' },
    ...variants.map(v => ({ label: v.name, value: v.id })),
  ];

  const combinedEventTypes = Array.from(
    new Set([...eventTypes, ...(configuredGoalEvents.length > 0 ? ['custom'] : [])])
  );
  const typeOptions = [
    { label: 'All types', value: 'all' },
    ...combinedEventTypes.map(t => ({ label: t, value: t })),
  ];

  const nameOptions = [
    { label: 'All events', value: 'all' },
    ...combinedEventNames.map(n => ({
      label: configuredEventNameSet.has(n)
        ? `${getGoalEventLabel(
            configuredGoalEvents.find(goal => goal.event_name === n),
            n
          )}${trackedEventNameSet.has(n) ? '' : ' (waiting)'}`
        : isCheckoutSectionEventName(n)
          ? formatCheckoutSectionEventLabel(n)
          : n,
      value: n,
    })),
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className={styles.eventsSection}>
      <div className={styles.eventsHeader}>
        <h2 className={styles.eventsTitle}>Event Explorer</h2>
        <p className={styles.eventsSubtitle}>
          Browse and filter tracked events. Use for debugging and validation.
          {lastUpdatedAt ? ` Last updated ${lastUpdatedAt.toLocaleTimeString()}.` : ''}
        </p>
      </div>

      {fetchError && (
        <div className={styles.eventsSetupCard}>
          <Banner tone="critical" title="Events failed to load">
            <InlineStack gap="300" align="space-between" blockAlign="center">
              <Text as="p" variant="bodySm">
                {fetchError}
              </Text>
              <Button onClick={fetchEvents}>Retry</Button>
            </InlineStack>
          </Banner>
        </div>
      )}

      <div className={styles.eventsSetupCard}>
        <h3 className={styles.eventsSetupTitle}>Event Collection Health</h3>
        <p className={styles.eventsSetupDesc}>
          Validate that every event selected in Goals & Metrics is either detected in reporting or
          has a ready tracking snippet for your theme.
        </p>
        <div className={styles.eventsHealthGrid}>
          <div className={styles.eventsHealthCard}>
            <span>Configured</span>
            <strong>{configuredGoalEvents.length}</strong>
            <small>Goal events selected for this test</small>
          </div>
          <div className={styles.eventsHealthCard}>
            <span>Detected</span>
            <strong>{detectedConfiguredCount}</strong>
            <small>Events already received by reporting</small>
          </div>
          <div className={styles.eventsHealthCard}>
            <span>Waiting</span>
            <strong>{waitingConfiguredCount}</strong>
            <small>Events selected but not seen yet</small>
          </div>
          <div className={styles.eventsHealthCard}>
            <span>Rows</span>
            <strong>{total.toLocaleString()}</strong>
            <small>Tracked event rows in current filters</small>
          </div>
        </div>
        {goalEventReportRows.length > 0 ? (
          <div className={styles.eventsVisualDashboard}>
            <div className={styles.eventsVisualHeader}>
              <span>
                <strong>Event Signal Graphs</strong>
                <small>Advanced view of volume, role coverage, and top goal-event activity.</small>
              </span>
              <Badge tone={waitingConfiguredCount > 0 ? 'attention' : 'success'}>
                {waitingConfiguredCount > 0 ? `${waitingConfiguredCount} Waiting` : 'All Detected'}
              </Badge>
            </div>
            <div className={styles.eventsVisualGrid}>
              <div className={styles.eventsVisualCard}>
                <div className={styles.eventsVisualCardHeader}>
                  <span>Goal Event Volume</span>
                  <strong>{formatNumber(totalGoalEventRows)}</strong>
                </div>
                <div
                  className={styles.eventsVisualTrend}
                  role="img"
                  aria-label={`Goal event volume trend with ${formatNumber(totalGoalEventRows)} total rows and ${eventMomentum.label.toLowerCase()} momentum.`}
                >
                  {eventVisualBuckets.length ? (
                    eventVisualBuckets.map(bucket => (
                      <span
                        key={bucket.date}
                        title={`${bucket.date}: ${formatNumber(bucket.value)}`}
                        style={{ '--event-visual-height': `${bucket.height}%` }}
                      />
                    ))
                  ) : (
                    <em>Waiting for daily activity</em>
                  )}
                </div>
                <small>
                  {formatNumber(totalGoalEventUsers)} unique users across configured events
                </small>
              </div>
              <div className={`${styles.eventsVisualCard} ${styles.eventsScoreCard}`}>
                <div className={styles.eventsVisualCardHeader}>
                  <span>Signal Score</span>
                  <strong>{signalScore}</strong>
                </div>
                <div
                  className={styles.eventsSignalGauge}
                  style={{ '--event-signal-score': `${signalScore}%` }}
                  aria-label={`Event signal score ${signalScore} out of 100`}
                >
                  <span>{signalScore}/100</span>
                  <strong>{signalScoreLabel}</strong>
                </div>
                <small>
                  {eventMomentum.label}: {formatPercent(eventMomentum.value)} recent momentum
                </small>
              </div>
              <div className={styles.eventsVisualCard}>
                <div className={styles.eventsVisualCardHeader}>
                  <span>Role Coverage</span>
                  <strong>
                    {detectedConfiguredCount}/{configuredGoalEvents.length}
                  </strong>
                </div>
                <div
                  className={styles.eventsRoleGraph}
                  role="img"
                  aria-label={`Role coverage graph with ${roleVisualRows
                    .map(row => `${row.detectedCount} of ${row.count} ${row.role}`)
                    .join(', ')} detected.`}
                >
                  {roleVisualRows.map(row => (
                    <div key={row.role} className={styles.eventsRoleRow}>
                      <span>{row.role}</span>
                      <div>
                        <i style={{ width: `${Math.max(4, (row.count / maxRoleCount) * 100)}%` }} />
                      </div>
                      <strong>
                        {row.detectedCount}/{row.count}
                      </strong>
                    </div>
                  ))}
                </div>
                <small>Detected vs configured by event role</small>
              </div>
              <div className={styles.eventsVisualCard}>
                <div className={styles.eventsVisualCardHeader}>
                  <span>Top Events</span>
                  <strong>{topEventRows.length}</strong>
                </div>
                <div
                  className={styles.eventsTopGraph}
                  role="img"
                  aria-label={`Top goal events by activity: ${
                    topEventRows.map(row => `${row.label} ${row.totalEvents}`).join(', ') ||
                    'no activity yet'
                  }.`}
                >
                  {topEventRows.length ? (
                    topEventRows.map(row => (
                      <div key={row.eventName} className={styles.eventsTopRow}>
                        <span title={row.eventName}>{row.label}</span>
                        <div>
                          <i
                            style={{
                              width: `${Math.max(4, (row.totalEvents / maxTopEventRows) * 100)}%`,
                            }}
                          />
                        </div>
                        <strong>{formatNumber(row.totalEvents)}</strong>
                      </div>
                    ))
                  ) : (
                    <em>No event volume yet</em>
                  )}
                </div>
                <small>Highest collected configured events</small>
              </div>
            </div>
            <div className={styles.eventsAttentionMatrix}>
              <div className={styles.eventsAttentionHeader}>
                <span>
                  <strong>Attention Matrix</strong>
                  <small>
                    Priority event reporting issues based on collection freshness and volume.
                  </small>
                </span>
                <Badge tone={attentionItems.length ? 'attention' : 'success'}>
                  {attentionItems.length ? `${attentionItems.length} Needs Review` : 'No Issues'}
                </Badge>
              </div>
              {attentionItems.length ? (
                <div className={styles.eventsAttentionRows}>
                  {attentionItems.map(item => (
                    <button
                      key={item.eventName}
                      type="button"
                      className={styles.eventsAttentionRow}
                      onClick={() => {
                        setEventType('custom');
                        setEventName(item.eventName);
                        setPage(1);
                        setEventsFilter({
                          events_type: 'custom',
                          events_name: item.eventName,
                          events_page: 'all',
                        });
                      }}
                    >
                      <span>
                        <strong>{item.label}</strong>
                        <code>{item.eventName}</code>
                      </span>
                      <em>{item.role}</em>
                      <small>{item.reason}</small>
                      <b>{formatNumber(item.rows)} rows</b>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.eventsAttentionEmpty}>
                  All configured event reports are collecting normally.
                </p>
              )}
            </div>
          </div>
        ) : null}
        {goalEventReportRows.length > 0 && (
          <div className={styles.eventsGoalReport}>
            <div className={styles.eventsGoalReportHeader}>
              <span>
                <strong>Goal Events Report</strong>
                <small>
                  Counts, rates, lift, guardrail status, and collection timing by variant.
                </small>
              </span>
            </div>
            <div className={styles.eventsGoalReportGrid}>
              {goalEventReportRows.map(report => (
                <div key={report.goal.event_name} className={styles.eventsGoalReportCard}>
                  <div className={styles.eventsGoalReportTitle}>
                    <span>
                      <strong>{report.goal.label}</strong>
                      <code>{report.goal.event_name}</code>
                    </span>
                    <Badge tone={report.detected ? 'success' : 'attention'}>
                      {report.detected ? 'Detected' : 'Waiting'}
                    </Badge>
                  </div>
                  <div className={styles.eventsGoalReportMeta}>
                    <Badge tone={report.goal.roleLabel === 'Guardrail' ? 'attention' : 'info'}>
                      {report.goal.roleLabel}
                    </Badge>
                    <Badge tone="info">
                      {report.goal.aggregation === 'sum' ? 'Sum Value' : 'Unique Users'}
                    </Badge>
                    <span>{report.sourceLabel}</span>
                  </div>
                  <div className={styles.eventsGoalTiming}>
                    <span>First Seen: {formatSeenAt(report.stats.firstSeen)}</span>
                    <span>Last Seen: {formatSeenAt(report.stats.lastSeen)}</span>
                  </div>
                  <div className={styles.eventsGoalDiagnostics}>
                    <span>
                      <strong>{formatNumber(report.stats.totalEvents)}</strong>
                      Rows
                    </span>
                    <span>
                      <strong>{formatNumber(report.stats.uniqueUsers)}</strong>
                      Users
                    </span>
                    <span>
                      <strong>{report.collectionDays || '—'}</strong>
                      Days
                    </span>
                    {report.goal.aggregation === 'sum' ? (
                      <span>
                        <strong>
                          {formatNumber(report.stats.sum, { maximumFractionDigits: 2 })}
                        </strong>
                        Sum
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.eventsGoalTrend}>
                    <div className={styles.eventsGoalTrendHeader}>
                      <span>Daily Trend</span>
                      <small>
                        {report.trendBuckets.length
                          ? `${report.trendBuckets.length} recent day${report.trendBuckets.length === 1 ? '' : 's'}`
                          : 'Waiting for data'}
                      </small>
                    </div>
                    <div className={styles.eventsGoalTrendBars}>
                      {report.trendBuckets.length ? (
                        report.trendBuckets.map(bucket => (
                          <span
                            key={bucket.date}
                            title={`${bucket.date}: ${formatNumber(bucket.value, {
                              maximumFractionDigits: 2,
                            })}`}
                            style={{ '--event-trend-height': `${bucket.height}%` }}
                          />
                        ))
                      ) : (
                        <em>No trend yet</em>
                      )}
                    </div>
                  </div>
                  {Array.isArray(report.stats.sources) && report.stats.sources.length > 0 ? (
                    <div className={styles.eventsGoalSources}>
                      {report.stats.sources.slice(0, 3).map(source => (
                        <span key={`${source.source}-${source.triggerType}`}>
                          {source.source} / {source.triggerType}
                          <strong>{formatNumber(source.count)}</strong>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className={styles.eventsVariantDistribution}>
                    <div className={styles.eventsVariantDistributionHeader}>
                      <span>Variant Distribution</span>
                      <small>
                        {report.goal.aggregation === 'sum'
                          ? 'Sum value by variant'
                          : 'Event users by variant'}
                      </small>
                    </div>
                    {getVariantDistributionRows(report).map(row => (
                      <div
                        key={`${report.goal.event_name}-${row.variant.id}-distribution`}
                        className={styles.eventsVariantDistributionRow}
                      >
                        <span>{row.variant.name}</span>
                        <div>
                          <i style={{ width: `${row.width}%` }} />
                        </div>
                        <strong>
                          {formatNumber(row.graphValue, { maximumFractionDigits: 2 })}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className={styles.eventsGoalVariantGrid}>
                    {report.variantRows.map(row => (
                      <div
                        key={`${report.goal.event_name}-${row.variant.id}`}
                        className={styles.eventsGoalVariantCard}
                      >
                        <span>{row.variant.name}</span>
                        <strong>
                          {report.goal.aggregation === 'sum'
                            ? formatNumber(row.metric.sum, { maximumFractionDigits: 2 })
                            : `${formatNumber(row.metric.count)} users`}
                        </strong>
                        <small>
                          {report.goal.aggregation === 'sum'
                            ? `${formatNumber(row.metric.count)} event users`
                            : `${(Number(row.metric.rate) || 0).toFixed(2)}% of visitors`}
                        </small>
                        {row.lift !== null && (
                          <Badge tone={row.status.tone}>
                            {row.status.label}: {formatPercent(row.lift)}
                          </Badge>
                        )}
                        {row.evidence ? (
                          <Badge tone={row.evidence.tone}>{row.evidence.label}</Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {configuredGoalEvents.length > 0 ? (
          <div className={styles.eventsTrackingGrid}>
            {configuredGoalEvents.map(goal => {
              const snippet = getGoalEventSnippet(testId, goal);
              const detected = trackedEventNameSet.has(goal.event_name);
              return (
                <div key={goal.event_name} className={styles.eventsTrackingCard}>
                  <div className={styles.eventsTrackingHeader}>
                    <span>
                      <strong>{goal.label}</strong>
                      <code>{goal.event_name}</code>
                    </span>
                    <Badge tone={detected ? 'success' : 'attention'}>
                      {detected ? 'Detected' : 'Waiting'}
                    </Badge>
                  </div>
                  <div className={styles.eventsTrackingMeta}>
                    <Badge tone={goal.roleLabel === 'Guardrail' ? 'attention' : 'info'}>
                      {goal.roleLabel}
                    </Badge>
                    <Badge tone="info">
                      {goal.aggregation === 'sum' ? 'Sum Value' : 'Unique Users'}
                    </Badge>
                  </div>
                  <div className={styles.eventsSetupCode}>
                    <pre>{snippet}</pre>
                  </div>
                  <InlineStack gap="200" align="space-between" blockAlign="center" wrap>
                    <Button
                      size="slim"
                      onClick={() => {
                        setEventType('custom');
                        setEventName(goal.event_name);
                        setPage(1);
                        setEventsFilter({
                          events_type: 'custom',
                          events_name: goal.event_name,
                          events_page: 'all',
                        });
                      }}
                    >
                      View Event
                    </Button>
                    <Button
                      size="slim"
                      variant="plain"
                      onClick={() => handleCopySnippet(goal.event_name, snippet)}
                    >
                      {copiedSnippet === goal.event_name ? 'Copied' : 'Copy Snippet'}
                    </Button>
                  </InlineStack>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className={styles.eventsSetupCode}>
              <pre>{`// Add to cart
          document.querySelector('[name="add"]').addEventListener('click', () => {
  RipX.trackEvent('${testId || 'TEST_ID'}', 'add_to_cart');
          });`}</pre>
            </div>
            <p className={styles.eventsSetupHint}>
              Select event goals in the Test Wizard to get per-event reporting health and snippets.
            </p>
          </>
        )}
      </div>

      {hasCheckoutSectionSignals && (
        <div className={styles.eventsSignalCard}>
          <h3 className={styles.eventsSetupTitle}>Checkout section signals detected</h3>
          <p className={styles.eventsSetupDesc}>
            These are built-in RipX checkout experience events, so you can validate section render
            and engagement without adding custom theme code.
          </p>
          <div className={styles.eventsSignalList}>
            {eventNames.filter(isCheckoutSectionEventName).map(name => (
              <span key={name} className={styles.eventsSignalChip}>
                {formatCheckoutSectionEventLabel(name)}
                {CHECKOUT_SECTION_EVENT_DEFINITIONS[name]?.description
                  ? ` - ${CHECKOUT_SECTION_EVENT_DEFINITIONS[name].description}`
                  : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={styles.eventsFilters}>
        <Select
          label="Date range"
          options={DATE_RANGES}
          value={dateRange}
          onChange={value => {
            setDateRange(value);
            setPage(1);
            setEventsFilter({ events_range: value, events_page: 'all' });
          }}
        />
        <Select
          label="Event type"
          options={typeOptions}
          value={eventType}
          onChange={value => {
            setEventType(value);
            setPage(1);
            setEventsFilter({ events_type: value, events_page: 'all' });
          }}
        />
        <Select
          label="Event name"
          options={nameOptions}
          value={eventName}
          onChange={value => {
            setEventName(value);
            setPage(1);
            setEventsFilter({ events_name: value, events_page: 'all' });
          }}
        />
        <Select
          label="Variant"
          options={variantOptions}
          value={variantFilter}
          onChange={value => {
            setVariantFilter(value);
            setPage(1);
            setEventsFilter({ events_variant: value, events_page: 'all' });
          }}
        />
      </div>

      <div className={styles.eventsContent}>
        {loading ? (
          <SkeletonBodyText lines={10} />
        ) : events.length === 0 ? (
          <div className={styles.eventsEmpty}>
            <Text as="p" tone="subdued">
              No events found. Events appear once the storefront script tracks conversions or custom
              events.
            </Text>
          </div>
        ) : (
          <>
            <div className={styles.eventsTableWrapper}>
              <DataTable
                columnContentTypes={[
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                  'text',
                ]}
                headings={['ID', 'Type', 'Event', 'Context', 'Variant', 'User', 'Value', 'Time']}
                rows={rows}
              />
            </div>
            {totalPages > 1 && (
              <div className={styles.eventsPagination}>
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => {
                    const next = Math.max(1, page - 1);
                    setPage(next);
                    setEventsFilter({ events_page: next === 1 ? 'all' : String(next) });
                  }}
                  hasNext={page < totalPages}
                  onNext={() => {
                    const next = Math.min(totalPages, page + 1);
                    setPage(next);
                    setEventsFilter({ events_page: next === 1 ? 'all' : String(next) });
                  }}
                  label={`Page ${page} of ${totalPages}`}
                />
              </div>
            )}
            <p className={styles.eventsFooter}>
              Showing {events.length} of {total} events
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default EventExplorer;
