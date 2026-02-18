/**
 * Heatmap View - Click and scroll heatmap visualization
 */
import React, { useState, useEffect } from 'react';
import { Text, Select } from '@shopify/polaris';
import { apiGet } from '../../services';
import { getDefaultAnalyticsDateRange } from '../../utils/preferences';
import styles from './HeatmapView.module.css';

const GRID_SIZE = 10;

const DATE_RANGES = [
  { label: 'All time', value: '' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

function getSinceParam(value) {
  if (!value || value === '') return null;
  const days = parseInt(value, 10);
  if (isNaN(days)) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function HeatmapView({ testId, variants = [] }) {
  const [pages, setPages] = useState([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('all');
  const [dateRange, setDateRange] = useState(() => {
    const d = getDefaultAnalyticsDateRange();
    return d === 'all' ? '' : d;
  });
  const [clicks, setClicks] = useState([]);
  const [scrolls, setScrolls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!testId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedPage) params.set('page_url', selectedPage);
    if (selectedVariant && selectedVariant !== 'all') params.set('variant_id', selectedVariant);
    const since = getSinceParam(dateRange);
    if (since) params.set('since', since);
    apiGet(`/analytics/tests/${testId}/heatmap${params.toString() ? `?${params}` : ''}`)
      .then(res => {
        const data = res.data?.heatmap ?? res.data?.data?.heatmap ?? {};
        const newPages = data.pages ?? [];
        setPages(newPages);
        setClicks(data.clicks ?? []);
        setScrolls(data.scrolls ?? []);
        if (!selectedPage && newPages.length > 0) {
          setSelectedPage(newPages[0]);
        } else if (selectedPage && newPages.length > 0 && !newPages.includes(selectedPage)) {
          setSelectedPage(newPages[0]);
        }
      })
      .catch(() => {
        setClicks([]);
        setScrolls([]);
      })
      .finally(() => setLoading(false));
  }, [testId, selectedPage, selectedVariant, dateRange]);

  const variantOptions = [
    { label: 'All variants', value: 'all' },
    ...variants.map(v => ({ label: v.name, value: v.id })),
  ];

  const pageOptions = [
    { label: 'All pages', value: '' },
    ...pages.map(p => ({ label: p.length > 60 ? p.substring(0, 57) + '...' : p, value: p })),
  ];

  const filteredClicks =
    selectedVariant === 'all'
      ? clicks
      : clicks.filter(c => c.variant_id === selectedVariant);
  const aggregatedClicks = {};
  filteredClicks.forEach(c => {
    const key = `${c.x_bucket}-${c.y_bucket}`;
    aggregatedClicks[key] = (aggregatedClicks[key] || 0) + c.count;
  });
  const maxClick = Math.max(...Object.values(aggregatedClicks), 1);

  return (
    <div className={styles.heatmapSection}>
      <div className={styles.heatmapHeader}>
        <h2 className={styles.heatmapTitle}>Heatmap</h2>
        <p className={styles.heatmapSubtitle}>
          Click and scroll behavior by variant. Data is collected automatically from the storefront.
        </p>
        <div className={styles.heatmapFilters}>
          <Select
            label="Page"
            options={pageOptions}
            value={selectedPage}
            onChange={setSelectedPage}
          />
          <Select
            label="Variant"
            options={variantOptions}
            value={selectedVariant}
            onChange={setSelectedVariant}
          />
          <Select
            label="Date range"
            options={DATE_RANGES}
            value={dateRange}
            onChange={setDateRange}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.heatmapLoading}>
          <Text as="p" color="subdued">
            Loading heatmap data...
          </Text>
        </div>
      ) : clicks.length === 0 && scrolls.length === 0 ? (
        <div className={styles.heatmapEmpty}>
          <Text as="p" color="subdued">
            No heatmap data yet. Clicks and scrolls are recorded as visitors interact with the
            page.
          </Text>
        </div>
      ) : (
        <div className={styles.heatmapContent}>
          <div className={styles.heatmapGrid}>
            {clicks.length > 0 && (
              <div className={`${styles.heatmapBlock} ${scrolls.length === 0 ? styles.heatmapGridSingle : ''}`}>
                <h3 className={styles.heatmapBlockTitle}>Click heatmap</h3>
                <div
                  className={styles.heatmapClickGrid}
                  style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
                >
                  {Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
                    const y = Math.floor(i / GRID_SIZE);
                    const x = i % GRID_SIZE;
                    const count = aggregatedClicks[`${x}-${y}`] || 0;
                    const intensity = maxClick > 0 ? count / maxClick : 0;
                    return (
                      <div
                        key={i}
                        className={styles.heatmapClickCell}
                        style={{
                          background: `rgba(6, 182, 212, ${0.1 + intensity * 0.9})`,
                        }}
                        title={`${x * 10}-${(x + 1) * 10}%, ${y * 10}-${(y + 1) * 10}%: ${count} clicks`}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {scrolls.length > 0 && (
              <div className={`${styles.heatmapBlock} ${clicks.length === 0 ? styles.heatmapGridSingle : ''}`}>
                <h3 className={styles.heatmapBlockTitle}>Scroll depth</h3>
                <div className={styles.heatmapScrollWrapper}>
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(bucket => {
                    const count =
                      scrolls
                        .filter(
                          s =>
                            s.depth_bucket === bucket &&
                            (selectedVariant === 'all' || s.variant_id === selectedVariant)
                        )
                        .reduce((sum, s) => sum + s.count, 0) || 0;
                    const maxScroll = Math.max(...scrolls.map(s => s.count), 1);
                    const width = (count / maxScroll) * 100;
                    return (
                      <div key={bucket} className={styles.heatmapScrollRow}>
                        <span className={styles.heatmapScrollLabel}>{bucket}%</span>
                        <div className={styles.heatmapScrollBar}>
                          <div
                            className={styles.heatmapScrollFill}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className={styles.heatmapScrollCount}>{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default HeatmapView;
