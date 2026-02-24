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
  Pagination,
  SkeletonBodyText,
} from '@shopify/polaris';
import { DuplicateIcon } from '@shopify/polaris-icons';
import { apiGet } from '../../services';
import { getDefaultAnalyticsDateRange } from '../../utils/preferences';
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

function EventExplorer({ testId, variants = [] }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [eventTypes, setEventTypes] = useState([]);
  const [eventNames, setEventNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('all');
  const [eventName, setEventName] = useState('all');
  const [variantFilter, setVariantFilter] = useState('all');
  const [dateRange, setDateRange] = useState(() => getDefaultAnalyticsDateRange());
  const [copiedId, setCopiedId] = useState(null);

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
      const dateParams = getDateRangeParams(dateRange);
      if (dateParams.start_date) params.set('start_date', dateParams.start_date);
      if (dateParams.end_date) params.set('end_date', dateParams.end_date);

      const res = await apiGet(`/analytics/tests/${testId}/events?${params}`);
      const data = res.data?.data ?? res.data ?? {};
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
      setEventTypes(Array.isArray(data.eventTypes) ? data.eventTypes : []);
      setEventNames(Array.isArray(data.eventNames) ? data.eventNames : []);
    } catch (err) {
      if (import.meta.env.DEV) console.error('EventExplorer fetch error:', err);
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [testId, page, eventType, eventName, variantFilter, dateRange]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const getVariantName = vid => variants.find(v => v.id === vid)?.name || vid;

  const handleCopyId = id => {
    navigator.clipboard?.writeText(id).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const rows = events.map(ev => [
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
    <Badge key={`${ev.id}-badge`} tone={ev.event_type === 'conversion' ? 'success' : 'info'}>
      {ev.event_type}
    </Badge>,
    ev.event_name || '—',
    getVariantName(ev.variant_id),
    ev.user_id?.slice(0, 12) + (ev.user_id?.length > 12 ? '…' : ''),
    ev.event_type === 'conversion'
      ? `$${Number(ev.event_value || 0).toFixed(2)}`
      : (ev.event_value ?? '—'),
    ev.created_at ? new Date(ev.created_at).toLocaleString() : '—',
  ]);

  const variantOptions = [
    { label: 'All variants', value: 'all' },
    ...variants.map(v => ({ label: v.name, value: v.id })),
  ];

  const typeOptions = [
    { label: 'All types', value: 'all' },
    ...eventTypes.map(t => ({ label: t, value: t })),
  ];

  const nameOptions = [
    { label: 'All events', value: 'all' },
    ...eventNames.map(n => ({ label: n, value: n })),
  ];

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div className={styles.eventsSection}>
      <div className={styles.eventsHeader}>
        <h2 className={styles.eventsTitle}>Event Explorer</h2>
        <p className={styles.eventsSubtitle}>
          Browse and filter tracked events. Use for debugging and validation.
        </p>
      </div>

      <div className={styles.eventsSetupCard}>
        <h3 className={styles.eventsSetupTitle}>Event setup guide</h3>
        <p className={styles.eventsSetupDesc}>
          Add tracking to your theme. Replace <code>TEST_ID</code> with your test ID.
        </p>
        <div className={styles.eventsSetupCode}>
          <pre>{`// Add to cart
          document.querySelector('[name="add"]').addEventListener('click', () => {
            RipX.trackEvent('TEST_ID', 'add_to_cart');
          });

          // Newsletter signup
          form.addEventListener('submit', () => {
            RipX.trackEvent('TEST_ID', 'newsletter_signup');
          });`}</pre>
        </div>
        <p className={styles.eventsSetupHint}>
          Common events: add_to_cart, view_content, newsletter_signup, signup, form_submit
        </p>
      </div>

      <div className={styles.eventsFilters}>
        <Select
          label="Date range"
          options={DATE_RANGES}
          value={dateRange}
          onChange={setDateRange}
        />
        <Select
          label="Event type"
          options={typeOptions}
          value={eventType}
          onChange={setEventType}
        />
        <Select
          label="Event name"
          options={nameOptions}
          value={eventName}
          onChange={setEventName}
        />
        <Select
          label="Variant"
          options={variantOptions}
          value={variantFilter}
          onChange={setVariantFilter}
        />
      </div>

      <div className={styles.eventsContent}>
        {loading ? (
          <SkeletonBodyText lines={10} />
        ) : events.length === 0 ? (
          <div className={styles.eventsEmpty}>
            <Text as="p" color="subdued">
              No events found. Events appear once the storefront script tracks conversions or custom
              events.
            </Text>
          </div>
        ) : (
          <>
            <div className={styles.eventsTableWrapper}>
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text', 'text']}
                headings={['ID', 'Type', 'Event', 'Variant', 'User', 'Value', 'Time']}
                rows={rows}
              />
            </div>
            {totalPages > 1 && (
              <div className={styles.eventsPagination}>
                <Pagination
                  hasPrevious={page > 1}
                  onPrevious={() => setPage(p => Math.max(1, p - 1))}
                  hasNext={page < totalPages}
                  onNext={() => setPage(p => Math.min(totalPages, p + 1))}
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
