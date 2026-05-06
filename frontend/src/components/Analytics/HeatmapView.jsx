/**
 * Heatmap View - Click and scroll heatmap visualization
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Text, Select, TextField, Button, Banner } from '@shopify/polaris';
import { apiGet, apiPut } from '../../services';
import { getDefaultAnalyticsDateRange } from '../../utils/preferences';
import styles from './HeatmapView.module.css';

const GRID_SIZE = 10;

const DATE_RANGES = [
  { label: 'All time', value: '' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

const OVERLAY_DISPLAY_MODES = [
  { label: 'Hybrid', value: 'hybrid' },
  { label: 'Density', value: 'density' },
  { label: 'Points', value: 'points' },
  { label: 'Scroll depth', value: 'scroll' },
];

const OVERLAY_ZOOM_OPTIONS = [
  { label: 'Fit width', value: 'fit' },
  { label: '100%', value: '1' },
  { label: '125%', value: '1.25' },
  { label: '150%', value: '1.5' },
];

const SCROLL_DEPTH_BUCKETS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

function getSinceParam(value) {
  if (!value || value === '') return null;
  const days = parseInt(value, 10);
  if (isNaN(days)) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

function getDateRangeLabel(value) {
  return DATE_RANGES.find(range => range.value === value)?.label || 'Custom range';
}

function formatSeenAt(value) {
  if (!value) return 'No data yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No data yet';
  return date.toLocaleString();
}

function HeatmapView({
  testId,
  variants = [],
  segmentDevice = 'all',
  segmentCountry = 'all',
  searchParams,
  updateAnalyticsSearch,
  refreshSignal = 0,
}) {
  const [pages, setPages] = useState([]);
  const [pageStats, setPageStats] = useState([]);
  const [selectedPage, setSelectedPage] = useState(() => searchParams?.get('heatmap_page') || '');
  const [selectedVariant, setSelectedVariant] = useState(
    () => searchParams?.get('heatmap_variant') || 'all'
  );
  const [dateRange, setDateRange] = useState(() => {
    const fromUrl = searchParams?.get('heatmap_range');
    if (fromUrl !== null) return fromUrl;
    const d = getDefaultAnalyticsDateRange();
    return d === 'all' ? '' : d;
  });
  const [clicks, setClicks] = useState([]);
  const [scrolls, setScrolls] = useState([]);
  const [overlay, setOverlay] = useState(null);
  const [collectionStats, setCollectionStats] = useState(null);
  const [heatmapSegmentOptions, setHeatmapSegmentOptions] = useState({
    devices: [],
    countries: [],
  });
  const [rollupSummary, setRollupSummary] = useState(null);
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const [screenshotError, setScreenshotError] = useState(false);
  const [screenshotDimensions, setScreenshotDimensions] = useState(null);
  const [screenshotInput, setScreenshotInput] = useState('');
  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [screenshotSaveError, setScreenshotSaveError] = useState('');
  const [overlayDisplayMode, setOverlayDisplayMode] = useState('hybrid');
  const [overlayZoom, setOverlayZoom] = useState('1');
  const [overlayViewportWidth, setOverlayViewportWidth] = useState(0);
  const [overlayViewportHeight, setOverlayViewportHeight] = useState(0);
  const [overlayScroll, setOverlayScroll] = useState({ top: 0, left: 0 });
  const overlayViewportRef = useRef(null);
  const overlayDensityCanvasRef = useRef(null);

  useEffect(() => {
    const nextPage = searchParams?.get('heatmap_page') || '';
    const nextVariant = searchParams?.get('heatmap_variant') || 'all';
    const nextRange = searchParams?.get('heatmap_range');
    if (selectedPage !== nextPage) setSelectedPage(nextPage);
    if (selectedVariant !== nextVariant) setSelectedVariant(nextVariant);
    if (nextRange !== null && dateRange !== nextRange) setDateRange(nextRange);
  }, [searchParams, dateRange, selectedPage, selectedVariant]);

  const loadHeatmap = useCallback(() => {
    if (!testId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedPage) params.set('page_key', selectedPage);
    if (selectedVariant && selectedVariant !== 'all') params.set('variant_id', selectedVariant);
    if (segmentDevice && segmentDevice !== 'all') params.set('device', segmentDevice);
    if (segmentCountry && segmentCountry !== 'all') params.set('country', segmentCountry);
    const since = getSinceParam(dateRange);
    if (since) params.set('since', since);
    apiGet(`/analytics/tests/${testId}/heatmap${params.toString() ? `?${params}` : ''}`)
      .then(res => {
        const data = res.data?.heatmap ?? res.data?.data?.heatmap ?? {};
        const newPages = data.pages ?? [];
        setPages(newPages);
        setPageStats(Array.isArray(data.pageStats) ? data.pageStats : []);
        setClicks(data.clicks ?? []);
        setScrolls(data.scrolls ?? []);
        setOverlay(data.overlay ?? null);
        setCollectionStats(data.collectionStats ?? null);
        setHeatmapSegmentOptions(data.segmentOptions ?? { devices: [], countries: [] });
        setRollupSummary(data.rollupSummary ?? null);
        setScreenshotUrl(data.screenshotUrl ?? null);
        setScreenshotError(false);
        setError('');
        if (selectedPage && newPages.length > 0 && !newPages.includes(selectedPage)) {
          setSelectedPage(newPages[0]);
          updateAnalyticsSearch?.({ heatmap_page: newPages[0] });
        } else if (selectedPage && newPages.length === 0) {
          setSelectedPage('');
          updateAnalyticsSearch?.({ heatmap_page: 'all' });
        }
      })
      .catch(() => {
        setPages([]);
        setPageStats([]);
        setClicks([]);
        setScrolls([]);
        setOverlay(null);
        setCollectionStats(null);
        setHeatmapSegmentOptions({ devices: [], countries: [] });
        setRollupSummary(null);
        setScreenshotUrl(null);
        setScreenshotError(false);
        setError('Heatmap data could not be loaded. Try again or check tracking setup.');
      })
      .finally(() => setLoading(false));
  }, [
    testId,
    selectedPage,
    selectedVariant,
    dateRange,
    segmentDevice,
    segmentCountry,
    updateAnalyticsSearch,
  ]);

  useEffect(() => {
    loadHeatmap();
  }, [loadHeatmap, refreshSignal]);

  const handleSelectedPageChange = value => {
    setSelectedPage(value);
    updateAnalyticsSearch?.({ heatmap_page: value });
  };
  const handleSelectedVariantChange = value => {
    setSelectedVariant(value);
    updateAnalyticsSearch?.({ heatmap_variant: value });
  };
  const handleDateRangeChange = value => {
    setDateRange(value);
    updateAnalyticsSearch?.({ heatmap_range: value || 'all' });
  };

  useEffect(() => {
    setScreenshotInput(screenshotUrl || '');
    setScreenshotDimensions(null);
  }, [screenshotUrl, selectedPage]);

  useEffect(() => {
    const node = overlayViewportRef.current;
    if (!node) return undefined;
    const updateViewportSize = () => {
      setOverlayViewportWidth(node.clientWidth || 0);
      setOverlayViewportHeight(node.clientHeight || 0);
    };
    updateViewportSize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportSize);
      return () => window.removeEventListener('resize', updateViewportSize);
    }
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [overlay, screenshotUrl]);

  const handleSaveScreenshot = async nextValue => {
    if (!selectedPage || !testId || savingScreenshot) return;
    setSavingScreenshot(true);
    try {
      const url = String(nextValue !== undefined ? nextValue : screenshotInput || '').trim();
      const selectedPageStats = pageStats.find(
        page => (page.page_key || page.page_url) === selectedPage
      );
      const res = await apiPut(`/analytics/tests/${testId}/heatmap/screenshot`, {
        page_url: selectedPageStats?.page_url || selectedPage,
        screenshot_url: url,
      });
      const saved = res.data?.screenshot_url || null;
      setScreenshotUrl(saved);
      setScreenshotError(false);
      setScreenshotSaveError('');
      setScreenshotInput(saved || '');
    } catch (_) {
      setScreenshotSaveError('Could not save screenshot URL. Check the URL and try again.');
    } finally {
      setSavingScreenshot(false);
    }
  };

  const variantOptions = [
    { label: 'All variants', value: 'all' },
    ...(variants || []).map((v, i) => ({
      label: v.name || `Variant ${i + 1}`,
      value: v.id || v.name || `v-${i}`,
    })),
  ];

  const pageOptions = [
    { label: 'All pages', value: '' },
    ...(pageStats.length > 0
      ? pageStats
      : (pages || []).map(page => ({ page_key: page, page_url: page }))
    )
      .filter(
        p => p !== null && p !== undefined && String(p.page_key || p.page_url || '').trim() !== ''
      )
      .map(p => {
        const value = p.page_key || p.page_url;
        const labelSource = String(p.page_key || p.page_url);
        const stats = pageStats.find(page => (page.page_key || page.page_url) === value) || p;
        const countLabel = stats?.count ? ` (${Number(stats.count).toLocaleString()})` : '';
        const label = labelSource.length > 60 ? labelSource.substring(0, 57) + '...' : labelSource;
        return { label: `${label}${countLabel}`, value };
      }),
  ];
  const selectedPageStats = pageStats.find(
    page => (page.page_key || page.page_url) === selectedPage
  );
  const selectedPageLabel = selectedPage || 'All pages';
  const selectedRawPageUrl = selectedPageStats?.page_url || '';
  const selectedVariantLabel =
    selectedVariant === 'all'
      ? 'All variants'
      : variantOptions.find(option => option.value === selectedVariant)?.label || selectedVariant;
  const activeSegments = [
    segmentDevice && segmentDevice !== 'all' ? `Device: ${segmentDevice}` : null,
    segmentCountry && segmentCountry !== 'all' ? `Country: ${segmentCountry}` : null,
  ].filter(Boolean);
  const segmentScopeLabel = activeSegments.length > 0 ? activeSegments.join(' · ') : 'All segments';

  const filteredClicks =
    selectedVariant === 'all' ? clicks : clicks.filter(c => c.variant_id === selectedVariant);
  const aggregatedClicks = {};
  filteredClicks.forEach(c => {
    const key = `${c.x_bucket}-${c.y_bucket}`;
    aggregatedClicks[key] = (aggregatedClicks[key] || 0) + c.count;
  });
  const maxClick = Math.max(...Object.values(aggregatedClicks), 1);
  const totalClicks = filteredClicks.reduce((sum, click) => sum + (Number(click.count) || 0), 0);
  const hottestCell = Object.entries(aggregatedClicks).reduce(
    (best, [key, count]) => (count > best.count ? { key, count } : best),
    { key: '', count: 0 }
  );
  const topClickCells = Object.entries(aggregatedClicks)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, count]) => {
      const [x, y] = key.split('-').map(Number);
      return {
        key,
        count,
        label: `${x * 10}-${(x + 1) * 10}% across, ${y * 10}-${(y + 1) * 10}% down`,
      };
    });
  const hotspotLabel = hottestCell.key
    ? `${Number(hottestCell.key.split('-')[0]) * 10}-${(Number(hottestCell.key.split('-')[0]) + 1) * 10}% x, ${
        Number(hottestCell.key.split('-')[1]) * 10
      }-${(Number(hottestCell.key.split('-')[1]) + 1) * 10}% y`
    : 'No clicks yet';
  const filteredScrolls =
    selectedVariant === 'all' ? scrolls : scrolls.filter(s => s.variant_id === selectedVariant);
  const scrollCountsByBucket = new Map();
  filteredScrolls.forEach(scroll => {
    scrollCountsByBucket.set(
      scroll.depth_bucket,
      (scrollCountsByBucket.get(scroll.depth_bucket) || 0) + (Number(scroll.count) || 0)
    );
  });
  const maxScroll = Math.max(...Array.from(scrollCountsByBucket.values()), 1);
  const totalScrollSamples = filteredScrolls.reduce(
    (sum, scroll) => sum + (Number(scroll.count) || 0),
    0
  );
  const bottomScrollCount = scrollCountsByBucket.get(100) || 0;
  const bottomReachRate =
    totalScrollSamples > 0 ? (bottomScrollCount / totalScrollSamples) * 100 : 0;
  const reach50Count = [50, 60, 70, 80, 90, 100].reduce(
    (sum, bucket) => sum + (scrollCountsByBucket.get(bucket) || 0),
    0
  );
  const reach75Count = [80, 90, 100].reduce(
    (sum, bucket) => sum + (scrollCountsByBucket.get(bucket) || 0),
    0
  );
  const reach50Rate = totalScrollSamples > 0 ? (reach50Count / totalScrollSamples) * 100 : 0;
  const reach75Rate = totalScrollSamples > 0 ? (reach75Count / totalScrollSamples) * 100 : 0;
  const renderedOverlayPoints = overlay?.points?.length ? Math.min(overlay.points.length, 500) : 0;
  const heatmapHasSegment =
    (segmentDevice && segmentDevice !== 'all') || (segmentCountry && segmentCountry !== 'all');
  const heatmapDeviceSegments = Array.isArray(heatmapSegmentOptions.devices)
    ? heatmapSegmentOptions.devices
    : [];
  const heatmapCountrySegments = Array.isArray(heatmapSegmentOptions.countries)
    ? heatmapSegmentOptions.countries
    : [];
  const selectedHeatmapDevice =
    segmentDevice && segmentDevice !== 'all'
      ? heatmapDeviceSegments.find(item => item.value === segmentDevice)
      : null;
  const selectedHeatmapCountry =
    segmentCountry && segmentCountry !== 'all'
      ? heatmapCountrySegments.find(item => item.value === segmentCountry)
      : null;
  const selectedSegmentHasHeatmapCoverage =
    (!segmentDevice || segmentDevice === 'all' || !!selectedHeatmapDevice) &&
    (!segmentCountry || segmentCountry === 'all' || !!selectedHeatmapCountry);
  const heatmapSegmentCoverageLabel = [
    heatmapDeviceSegments.length ? `${heatmapDeviceSegments.length} device groups` : null,
    heatmapCountrySegments.length ? `${heatmapCountrySegments.length} country groups` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const clickFocusRate =
    totalClicks > 0 ? ((Number(hottestCell.count) || 0) / totalClicks) * 100 : 0;
  const activeClickCells = Object.values(aggregatedClicks).filter(
    count => Number(count) > 0
  ).length;
  const clickCoverageRate = (activeClickCells / (GRID_SIZE * GRID_SIZE)) * 100;
  const topClickZones = Object.entries(aggregatedClicks)
    .map(([key, count]) => ({ key, count: Number(count) || 0 }))
    .filter(item => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const totalCollectionEvents =
    Number(collectionStats?.totalEvents) || totalClicks + totalScrollSamples || 0;
  const selectedPageEvents = Number(selectedPageStats?.count) || 0;
  const selectedPageShare =
    totalCollectionEvents > 0 && selectedPageEvents > 0
      ? (selectedPageEvents / totalCollectionEvents) * 100
      : 0;
  const collectionFreshness = collectionStats?.lastSeen || selectedPageStats?.last_seen || null;
  const signalQuality =
    totalClicks >= 100 && totalScrollSamples >= 100
      ? 'Strong'
      : totalClicks + totalScrollSamples >= 50
        ? 'Building'
        : 'Early';
  const controlVariant =
    (variants || []).find(variant => String(variant.name || '').toLowerCase() === 'control') ||
    (variants || [])[0] ||
    null;
  const comparisonVariant =
    selectedVariant && selectedVariant !== 'all'
      ? (variants || []).find(variant => variant.id === selectedVariant)
      : (variants || []).find(variant => variant.id !== controlVariant?.id);
  const comparisonClickCount = clicks
    .filter(click => click.variant_id === comparisonVariant?.id)
    .reduce((sum, click) => sum + (Number(click.count) || 0), 0);
  const controlClickCount = clicks
    .filter(click => click.variant_id === controlVariant?.id)
    .reduce((sum, click) => sum + (Number(click.count) || 0), 0);
  const comparisonClickDelta =
    controlClickCount > 0
      ? ((comparisonClickCount - controlClickCount) / controlClickCount) * 100
      : null;
  const rollupEventCount = Number(rollupSummary?.totalEvents) || 0;
  const overlayMode = overlay?.overlayMode || 'legacy-viewport';
  const overlayModeLabel =
    overlayMode === 'full-page'
      ? 'Full-page overlay'
      : overlayMode === 'partial-full-page'
        ? 'Partial full-page coverage'
        : 'Viewport-only legacy data';
  const overlayModeHint =
    overlayMode === 'full-page'
      ? 'Clicks use document-level coordinates, so points can appear across the full screenshot height.'
      : overlayMode === 'partial-full-page'
        ? 'New clicks use full-page coordinates. Older clicks are still shown in the first viewport.'
        : 'Older clicks only include viewport percentages, so points are projected into the first viewport.';
  const overlayReferenceLabel =
    overlay?.referenceWidth && overlay?.referenceHeight
      ? `${Number(overlay.referenceWidth).toLocaleString()} x ${Number(overlay.referenceHeight).toLocaleString()}`
      : 'Pending';
  const overlayDisplayWidth =
    screenshotDimensions?.width || Number(overlay?.referenceWidth) || 1280;
  const overlayDisplayHeight =
    screenshotDimensions?.height || Number(overlay?.referenceHeight) || 720;
  const overlayScale =
    overlayZoom === 'fit'
      ? Math.min(
          1,
          Math.max(0.2, ((overlayViewportWidth || overlayDisplayWidth) - 24) / overlayDisplayWidth)
        )
      : Number(overlayZoom) || 1;
  const overlayScaledWidth = Math.max(1, Math.round(overlayDisplayWidth * overlayScale));
  const overlayScaledHeight = Math.max(1, Math.round(overlayDisplayHeight * overlayScale));
  const showDensityOverlay = overlayDisplayMode === 'density' || overlayDisplayMode === 'hybrid';
  const showPointOverlay = overlayDisplayMode === 'points' || overlayDisplayMode === 'hybrid';
  const showScrollDepthOverlay = overlayDisplayMode === 'scroll';
  const overlayQuality = overlay?.quality || {};
  const screenshotDimensionMismatch =
    Boolean(screenshotDimensions && overlay?.referenceWidth && overlay?.referenceHeight) &&
    (Math.abs(screenshotDimensions.width - overlay.referenceWidth) / overlay.referenceWidth >
      0.08 ||
      Math.abs(screenshotDimensions.height - overlay.referenceHeight) / overlay.referenceHeight >
        0.08);
  const heatmapQualityBadges = [
    {
      label: overlayModeLabel,
      tone:
        overlayMode === 'full-page'
          ? 'good'
          : overlayMode === 'partial-full-page'
            ? 'warn'
            : 'neutral',
    },
    totalClicks < 50 ? { label: 'Low sample', tone: 'warn' } : null,
    overlayQuality.dimensionMismatch || screenshotDimensionMismatch
      ? { label: 'Dimension mismatch', tone: 'warn' }
      : null,
    !screenshotUrl ? { label: 'Screenshot missing', tone: 'warn' } : null,
    heatmapHasSegment && !selectedSegmentHasHeatmapCoverage
      ? { label: 'Segment sparse', tone: 'warn' }
      : null,
  ].filter(Boolean);
  const heatmapQualityNotes = [
    overlayQuality.dimensionMismatch
      ? `Captured page dimensions vary from ${overlayQuality.pageWidthRange?.min || '?'} x ${
          overlayQuality.pageHeightRange?.min || '?'
        } to ${overlayQuality.pageWidthRange?.max || '?'} x ${overlayQuality.pageHeightRange?.max || '?'}.`
      : null,
    screenshotDimensionMismatch
      ? 'Screenshot dimensions differ from the selected overlay reference, so verify visible alignment before acting.'
      : null,
    overlayQuality.skippedPointCount
      ? `${Number(overlayQuality.skippedPointCount).toLocaleString()} malformed overlay rows were skipped.`
      : null,
    overlayMode === 'partial-full-page'
      ? 'This view mixes new full-page rows with older viewport-only rows.'
      : null,
  ].filter(Boolean);
  const overlayLegendLowLabel = showScrollDepthOverlay ? 'Low reach' : 'Low';
  const overlayLegendHighLabel = showScrollDepthOverlay ? 'High reach' : 'High';
  const scrollDepthBands = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map(bucket => {
    const reachedCount = SCROLL_DEPTH_BUCKETS.filter(depth => depth <= 100)
      .filter(depth => depth >= bucket)
      .reduce((sum, depth) => sum + (scrollCountsByBucket.get(depth) || 0), 0);
    const reachRate = totalScrollSamples > 0 ? reachedCount / totalScrollSamples : 0;
    return {
      bucket,
      reachRate,
      label: `${Math.round(reachRate * 100)}% reached ${bucket}% depth`,
    };
  });

  useEffect(() => {
    const canvas = overlayDensityCanvasRef.current;
    if (!canvas || !overlay?.points?.length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(overlayDisplayWidth * dpr));
    canvas.height = Math.max(1, Math.round(overlayDisplayHeight * dpr));
    canvas.style.width = `${overlayDisplayWidth}px`;
    canvas.style.height = `${overlayDisplayHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, overlayDisplayWidth, overlayDisplayHeight);
    if (!showDensityOverlay) return;
    const maxCount = Math.max(...overlay.points.map(p => Number(p.count) || 0), 1);
    ctx.globalCompositeOperation = 'lighter';
    overlay.points.slice(0, 1000).forEach(point => {
      const count = Number(point.count) || 0;
      const intensity = Math.min(1, count / maxCount);
      const x = (Number(point.x) / (overlay.referenceWidth || 1280)) * overlayDisplayWidth;
      const y = (Number(point.y) / (overlay.referenceHeight || 720)) * overlayDisplayHeight;
      const radius = 34 + intensity * 62;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgba(255, 45, 85, ${0.28 + intensity * 0.34})`);
      gradient.addColorStop(0.42, `rgba(255, 149, 0, ${0.14 + intensity * 0.26})`);
      gradient.addColorStop(0.76, `rgba(6, 182, 212, ${0.06 + intensity * 0.16})`);
      gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }, [overlay, overlayDisplayWidth, overlayDisplayHeight, overlayDisplayMode, showDensityOverlay]);

  return (
    <div className={styles.heatmapSection}>
      <div className={styles.heatmapHeader}>
        <h2 className={styles.heatmapTitle}>Heatmap</h2>
        <p className={styles.heatmapSubtitle}>
          Click and scroll behavior by variant. Data is collected automatically from the storefront.
        </p>
        {heatmapHasSegment ? (
          <div className={styles.heatmapBanner}>
            <Banner tone="info" title="Heatmap is filtered by available segment data">
              <Text as="p" variant="bodySm">
                New heatmap events include device and storefront country where available. Older rows
                collected before this update may not appear in segmented heatmap views.
              </Text>
            </Banner>
          </div>
        ) : null}
        {heatmapHasSegment && !selectedSegmentHasHeatmapCoverage ? (
          <div className={styles.heatmapBanner}>
            <Banner tone="warning" title="No heatmap events have this segment yet">
              <Text as="p" variant="bodySm">
                The global analytics filter is active, but this heatmap scope has not collected
                matching heatmap rows yet. Try All segments or wait for new storefront activity.
              </Text>
            </Banner>
          </div>
        ) : null}
        {!selectedPage ? (
          <div className={styles.heatmapBanner}>
            <Banner tone="info" title="All pages are combined">
              <Text as="p" variant="bodySm">
                Select a page URL for a screenshot overlay. The grid below can combine many page
                layouts, so use it for broad click density only.
              </Text>
            </Banner>
          </div>
        ) : null}
        <div className={styles.heatmapFilters}>
          <Select
            label="Page"
            options={pageOptions}
            value={selectedPage}
            onChange={handleSelectedPageChange}
          />
          <Select
            label="Variant"
            options={variantOptions}
            value={selectedVariant}
            onChange={handleSelectedVariantChange}
          />
          <Select
            label="Date range"
            options={DATE_RANGES}
            value={dateRange}
            onChange={handleDateRangeChange}
          />
        </div>
        <div className={styles.heatmapScopeBar} aria-label="Current heatmap scope">
          <span>
            Page <strong>{selectedPageLabel}</strong>
          </span>
          <span>
            Variant <strong>{selectedVariantLabel}</strong>
          </span>
          <span>
            Date <strong>{getDateRangeLabel(dateRange)}</strong>
          </span>
          <span>
            Segment <strong>{segmentScopeLabel}</strong>
          </span>
          <span>
            Heatmap coverage <strong>{heatmapSegmentCoverageLabel || 'Collecting'}</strong>
          </span>
        </div>
        {selectedRawPageUrl && selectedRawPageUrl !== selectedPage ? (
          <p className={styles.heatmapScopeHint}>Representative URL: {selectedRawPageUrl}</p>
        ) : null}
      </div>

      {loading ? (
        <div className={styles.heatmapLoading}>
          <Text as="p" tone="subdued">
            Loading heatmap data...
          </Text>
        </div>
      ) : error ? (
        <div className={styles.heatmapEmpty}>
          <Banner tone="critical" title="Heatmap unavailable">
            <div className={styles.heatmapBannerStack}>
              <Text as="p" variant="bodySm">
                {error}
              </Text>
              <Button onClick={loadHeatmap}>Retry</Button>
            </div>
          </Banner>
        </div>
      ) : clicks.length === 0 && scrolls.length === 0 ? (
        <div className={styles.heatmapEmpty}>
          <div className={styles.heatmapBannerStack}>
            <Text as="p" tone="subdued">
              {heatmapHasSegment && !selectedSegmentHasHeatmapCoverage
                ? 'No heatmap events match this segment yet. Heatmap filters now check real heatmap event coverage so empty segmented views are easier to trust.'
                : 'No heatmap data yet. Clicks and scrolls are recorded as visitors interact with the page.'}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Stored heatmap URLs are privacy-safe page paths, and screenshot overlays use the
              representative page path for this scope.
            </Text>
          </div>
        </div>
      ) : (
        <div className={styles.heatmapContent}>
          <div className={styles.heatmapInsightGrid}>
            <div className={styles.heatmapInsightCard}>
              <span>Clicks</span>
              <strong>{totalClicks.toLocaleString()}</strong>
              <small>
                {hottestCell.count ? `Hotspot: ${hotspotLabel}` : 'Waiting for click data'}
              </small>
            </div>
            <div className={styles.heatmapInsightCard}>
              <span>Scroll Samples</span>
              <strong>{totalScrollSamples.toLocaleString()}</strong>
              <small>{bottomReachRate.toFixed(1)}% reached the bottom bucket</small>
            </div>
            <div className={styles.heatmapInsightCard}>
              <span>Overlay Points</span>
              <strong>{renderedOverlayPoints.toLocaleString()}</strong>
              <small>
                {overlay?.points?.length > 500
                  ? `Top 500 of ${overlay.points.length.toLocaleString()} rendered`
                  : 'Rendered from aggregated click points'}
              </small>
            </div>
            <div className={styles.heatmapInsightCard}>
              <span>Click Focus</span>
              <strong>{clickFocusRate.toFixed(1)}%</strong>
              <small>
                {activeClickCells} active cells, {clickCoverageRate.toFixed(0)}% grid coverage
              </small>
            </div>
            <div className={styles.heatmapInsightCard}>
              <span>Deep Scroll</span>
              <strong>{reach75Rate.toFixed(1)}%</strong>
              <small>{reach50Rate.toFixed(1)}% reached at least halfway</small>
            </div>
            <div className={styles.heatmapInsightCard}>
              <span>Signal Quality</span>
              <strong>{signalQuality}</strong>
              <small>Last event: {formatSeenAt(collectionFreshness)}</small>
            </div>
            <div className={styles.heatmapInsightCard}>
              <span>Segment Coverage</span>
              <strong>{heatmapSegmentCoverageLabel || 'Pending'}</strong>
              <small>
                {selectedSegmentHasHeatmapCoverage
                  ? 'Current filter has heatmap rows'
                  : 'Switch to All segments for broader evidence'}
              </small>
            </div>
            <div className={styles.heatmapInsightCard}>
              <span>Rollup Rows</span>
              <strong>
                {rollupSummary?.available ? rollupEventCount.toLocaleString() : 'Pending'}
              </strong>
              <small>
                {rollupSummary?.available
                  ? `Daily summary through ${formatSeenAt(rollupSummary.lastSeenAt)}`
                  : 'Raw data is powering this scope'}
              </small>
            </div>
          </div>
          <div className={styles.heatmapIntelligencePanel}>
            <div className={styles.heatmapIntelligenceHeader}>
              <div>
                <h3>Heatmap Intelligence</h3>
                <p>Quality, coverage, and concentration for the active reporting scope.</p>
              </div>
              <span>{totalCollectionEvents.toLocaleString()} collected rows</span>
            </div>
            <div className={styles.heatmapIntelligenceGrid}>
              <div>
                <span>Page Coverage</span>
                <strong>
                  {Number(collectionStats?.pageCount || pageStats.length || 0).toLocaleString()}
                </strong>
                <small>
                  {selectedPage
                    ? `${selectedPageShare.toFixed(1)}% of scoped rows on this page`
                    : 'Normalized pages in this view'}
                </small>
              </div>
              <div>
                <span>Variant Coverage</span>
                <strong>{Number(collectionStats?.variantCount || 0).toLocaleString()}</strong>
                <small>{selectedVariantLabel}</small>
              </div>
              <div>
                <span>Viewport Baseline</span>
                <strong>
                  {collectionStats?.avgViewportWidth && collectionStats?.avgViewportHeight
                    ? `${collectionStats.avgViewportWidth} x ${collectionStats.avgViewportHeight}`
                    : 'Pending'}
                </strong>
                <small>Average captured viewport</small>
              </div>
              <div>
                <span>Top Zones</span>
                <strong>
                  {topClickZones.length > 0
                    ? `${topClickZones[0].count.toLocaleString()} clicks`
                    : 'Pending'}
                </strong>
                <small>
                  {topClickZones.length > 0
                    ? topClickZones.map(zone => zone.key.replace('-', ',')).join(' · ')
                    : 'Need more clicks'}
                </small>
              </div>
            </div>
          </div>
          {controlVariant && comparisonVariant && controlVariant.id !== comparisonVariant.id && (
            <div className={styles.heatmapIntelligencePanel}>
              <div className={styles.heatmapIntelligenceHeader}>
                <div>
                  <h3>Variant Heatmap Comparison</h3>
                  <p>Quick contrast between control and the selected or first test variant.</p>
                </div>
                <span>
                  {comparisonVariant.name || comparisonVariant.id} vs{' '}
                  {controlVariant.name || controlVariant.id}
                </span>
              </div>
              <div className={styles.heatmapIntelligenceGrid}>
                <div>
                  <span>Control Clicks</span>
                  <strong>{controlClickCount.toLocaleString()}</strong>
                  <small>{controlVariant.name || controlVariant.id}</small>
                </div>
                <div>
                  <span>Variant Clicks</span>
                  <strong>{comparisonClickCount.toLocaleString()}</strong>
                  <small>{comparisonVariant.name || comparisonVariant.id}</small>
                </div>
                <div>
                  <span>Click Delta</span>
                  <strong>
                    {comparisonClickDelta === null
                      ? 'Pending'
                      : `${comparisonClickDelta > 0 ? '+' : ''}${comparisonClickDelta.toFixed(1)}%`}
                  </strong>
                  <small>Based on current page, segment, and date scope</small>
                </div>
                <div>
                  <span>Action Hint</span>
                  <strong>
                    {comparisonClickDelta !== null && Math.abs(comparisonClickDelta) > 25
                      ? 'Review'
                      : 'Stable'}
                  </strong>
                  <small>
                    {comparisonClickDelta !== null && Math.abs(comparisonClickDelta) > 25
                      ? 'Large engagement shift detected'
                      : 'No large click shift yet'}
                  </small>
                </div>
              </div>
            </div>
          )}
          {overlay && overlay.points && overlay.points.length > 0 && (
            <div className={styles.heatmapBlock}>
              <div className={styles.heatmapOverlayHeader}>
                <div>
                  <h3 className={styles.heatmapBlockTitle}>Heatmap over page</h3>
                  <p className={styles.heatmapOverlayHint}>
                    {screenshotUrl
                      ? overlayModeHint
                      : 'Add a full-page screenshot URL below for this page to display clicks over the full image.'}
                  </p>
                </div>
                <span className={styles.heatmapOverlayBadge}>{overlayModeLabel}</span>
              </div>
              <p className={styles.heatmapOverlayHint}>
                Reference canvas: {overlayReferenceLabel}. Full-page rows:{' '}
                {Number(overlay.fullPagePointCount || 0).toLocaleString()}; legacy rows:{' '}
                {Number(overlay.legacyPointCount || 0).toLocaleString()}.
              </p>
              <div className={styles.heatmapOverlayControls}>
                <div className={styles.heatmapOverlayInput}>
                  <TextField
                    label="Page screenshot URL"
                    value={screenshotInput}
                    onChange={setScreenshotInput}
                    autoComplete="off"
                    placeholder="https://.../page-screenshot.png"
                    disabled={!selectedPage || savingScreenshot}
                  />
                </div>
                <div className={styles.heatmapOverlayActions}>
                  <Button
                    onClick={handleSaveScreenshot}
                    loading={savingScreenshot}
                    disabled={!selectedPage}
                  >
                    Save image
                  </Button>
                  {screenshotUrl ? (
                    <Button
                      tone="critical"
                      variant="plain"
                      onClick={() => handleSaveScreenshot('')}
                      disabled={savingScreenshot || !selectedPage}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              {screenshotSaveError ? (
                <div className={styles.heatmapOverlayError}>
                  <Banner tone="critical" title="Screenshot URL not saved">
                    <Text as="p" variant="bodySm">
                      {screenshotSaveError}
                    </Text>
                  </Banner>
                </div>
              ) : null}
              {screenshotError ? (
                <div className={styles.heatmapOverlayError}>
                  <Banner tone="warning" title="Screenshot could not be loaded">
                    <Text as="p" variant="bodySm">
                      The heatmap points are still shown. Check that the screenshot URL is public
                      and reachable.
                    </Text>
                  </Banner>
                </div>
              ) : null}
              <div className={styles.heatmapOverlayToolBar}>
                <div className={styles.heatmapOverlaySelect}>
                  <Select
                    label="Overlay mode"
                    options={OVERLAY_DISPLAY_MODES}
                    value={overlayDisplayMode}
                    onChange={setOverlayDisplayMode}
                  />
                </div>
                <div className={styles.heatmapOverlaySelect}>
                  <Select
                    label="Zoom"
                    options={OVERLAY_ZOOM_OPTIONS}
                    value={overlayZoom}
                    onChange={setOverlayZoom}
                  />
                </div>
                <div className={styles.heatmapOverlayLegend} aria-label="Heatmap intensity legend">
                  <span>{overlayLegendLowLabel}</span>
                  <span className={styles.heatmapOverlayLegendRamp} aria-hidden />
                  <span>{overlayLegendHighLabel}</span>
                </div>
                <div className={styles.heatmapQualityBadges} aria-label="Heatmap quality signals">
                  {heatmapQualityBadges.map(badge => (
                    <span
                      key={badge.label}
                      className={`${styles.heatmapQualityBadge} ${styles[`heatmapQualityBadge_${badge.tone}`] || ''}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              </div>
              {heatmapQualityNotes.length > 0 ? (
                <div className={styles.heatmapQualityNotes}>
                  {heatmapQualityNotes.map(note => (
                    <span key={note}>{note}</span>
                  ))}
                </div>
              ) : null}
              <div
                ref={overlayViewportRef}
                className={styles.heatmapOverlayViewport}
                tabIndex={0}
                aria-label="Scrollable full-page heatmap preview"
                onScroll={event =>
                  setOverlayScroll({
                    top: event.currentTarget.scrollTop,
                    left: event.currentTarget.scrollLeft,
                  })
                }
              >
                <div
                  className={styles.heatmapOverlayScaledContent}
                  style={{
                    width: `${overlayScaledWidth}px`,
                    height: `${overlayScaledHeight}px`,
                  }}
                >
                  <div
                    className={styles.heatmapOverlayWrap}
                    style={{
                      width: `${overlayDisplayWidth}px`,
                      height: `${overlayDisplayHeight}px`,
                      transform: `scale(${overlayScale})`,
                    }}
                  >
                    {screenshotUrl && !screenshotError ? (
                      <img
                        src={screenshotUrl}
                        alt="Page screenshot for click heatmap overlay"
                        className={styles.heatmapOverlayImg}
                        onLoad={event => {
                          const img = event.currentTarget;
                          if (img.naturalWidth && img.naturalHeight) {
                            setScreenshotDimensions({
                              width: img.naturalWidth,
                              height: img.naturalHeight,
                            });
                          }
                        }}
                        onError={() => setScreenshotError(true)}
                      />
                    ) : (
                      <div className={styles.heatmapOverlayPlaceholder} aria-hidden>
                        <span>Page screenshot</span>
                        <span className={styles.heatmapOverlayPlaceholderHint}>
                          Paste a screenshot URL above and save
                        </span>
                      </div>
                    )}
                    <canvas
                      ref={overlayDensityCanvasRef}
                      className={`${styles.heatmapOverlayDensityCanvas} ${!showDensityOverlay ? styles.heatmapOverlayHidden : ''}`}
                      aria-hidden
                    />
                    {showScrollDepthOverlay ? (
                      <div className={styles.heatmapScrollDepthOverlay} aria-hidden>
                        {scrollDepthBands.map(band => (
                          <div
                            key={band.bucket}
                            className={styles.heatmapScrollDepthBand}
                            style={{
                              top: `${band.bucket}%`,
                              height: '10%',
                              opacity: 0.18 + band.reachRate * 0.5,
                            }}
                            title={band.label}
                          />
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.heatmapOverlayCanvas}>
                      {showPointOverlay
                        ? (() => {
                            const maxCount = Math.max(...overlay.points.map(p => p.count), 1);
                            return overlay.points.slice(0, 500).map((p, i) => {
                              const intensity = Math.min(1, p.count / maxCount);
                              const size = Math.round(16 + intensity * 26);
                              const xPct = ((p.x / (overlay.referenceWidth || 1280)) * 100).toFixed(
                                2
                              );
                              const yPct = ((p.y / (overlay.referenceHeight || 720)) * 100).toFixed(
                                2
                              );
                              return (
                                <div
                                  key={`${p.x}-${p.y}-${i}`}
                                  className={styles.heatmapOverlayPoint}
                                  style={{
                                    left: `${xPct}%`,
                                    top: `${yPct}%`,
                                    opacity: 0.3 + intensity * 0.7,
                                    width: `${size}px`,
                                    height: `${size}px`,
                                    transform: 'translate(-50%, -50%)',
                                  }}
                                  title={`${p.count} clicks`}
                                />
                              );
                            });
                          })()
                        : null}
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className={styles.heatmapMiniMap}
                aria-label="Jump within full-page heatmap minimap"
                onClick={event => {
                  const viewport = overlayViewportRef.current;
                  if (!viewport) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const xRatio = (event.clientX - rect.left) / Math.max(rect.width, 1);
                  const yRatio = (event.clientY - rect.top) / Math.max(rect.height, 1);
                  viewport.scrollTo({
                    left: Math.max(0, overlayScaledWidth * xRatio - viewport.clientWidth / 2),
                    top: Math.max(0, overlayScaledHeight * yRatio - viewport.clientHeight / 2),
                    behavior: 'smooth',
                  });
                }}
              >
                <div
                  className={styles.heatmapMiniMapWindow}
                  style={{
                    left: `${Math.min(92, (overlayScroll.left / Math.max(overlayScaledWidth, 1)) * 100)}%`,
                    top: `${Math.min(92, (overlayScroll.top / Math.max(overlayScaledHeight, 1)) * 100)}%`,
                    width: `${Math.max(8, Math.min(100, (overlayViewportWidth / Math.max(overlayScaledWidth, 1)) * 100))}%`,
                    height: `${Math.max(8, Math.min(100, (overlayViewportHeight / Math.max(overlayScaledHeight, 1)) * 100))}%`,
                  }}
                />
                {overlay.points.slice(0, 90).map((point, index) => (
                  <span
                    key={`${point.x}-${point.y}-mini-${index}`}
                    style={{
                      left: `${((point.x / (overlay.referenceWidth || 1280)) * 100).toFixed(2)}%`,
                      top: `${((point.y / (overlay.referenceHeight || 720)) * 100).toFixed(2)}%`,
                    }}
                  />
                ))}
              </button>
            </div>
          )}

          {topClickCells.length > 0 && (
            <div className={styles.heatmapBlock}>
              <h3 className={styles.heatmapBlockTitle}>Top click regions</h3>
              <div className={styles.heatmapRegionList}>
                {topClickCells.map(cell => (
                  <div key={cell.key}>
                    <span>{cell.label}</span>
                    <strong>{cell.count.toLocaleString()} clicks</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.heatmapGrid}>
            {clicks.length > 0 && (
              <div
                className={`${styles.heatmapBlock} ${scrolls.length === 0 ? styles.heatmapGridSingle : ''}`}
              >
                <h3 className={styles.heatmapBlockTitle}>Click heatmap</h3>
                <div
                  className={styles.heatmapClickGrid}
                  role="img"
                  aria-label={`Click heatmap grid with ${totalClicks.toLocaleString()} clicks. Hotspot: ${hotspotLabel}.`}
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
              <div
                className={`${styles.heatmapBlock} ${clicks.length === 0 ? styles.heatmapGridSingle : ''}`}
              >
                <h3 className={styles.heatmapBlockTitle}>Scroll depth</h3>
                <div className={styles.heatmapScrollWrapper}>
                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map(bucket => {
                    const count = scrollCountsByBucket.get(bucket) || 0;
                    const width = (count / maxScroll) * 100;
                    return (
                      <div key={bucket} className={styles.heatmapScrollRow}>
                        <span className={styles.heatmapScrollLabel}>
                          {bucket === 100 ? '100%+' : `${bucket}%`}
                        </span>
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
