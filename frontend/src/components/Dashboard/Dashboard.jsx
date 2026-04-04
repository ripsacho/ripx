/**
 * Dashboard Component
 *
 * Futuristic command center with advanced metrics and experiment launch
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Page, Button, Badge, BlockStack, InlineStack, Text } from '@shopify/polaris';
import {
  ChartLineIcon,
  PlayIcon,
  StopCircleIcon,
  RefreshIcon,
  SortAscendingIcon,
} from '@shopify/polaris-icons';
import { Link, useNavigate } from 'react-router-dom';
import { setupDataTableButtonStyling } from '../../utils/dataTableStyles';
import Toast from '../Toast/Toast';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { MetricCard } from '../Shared';
import { getTestTypeDisplay, getVariantCount } from '../../utils/testType';
import pageShell from '../Shared/PageShell.module.css';
import styles from './Dashboard.module.css';
import {
  useTests,
  useDashboardStats,
  useAnimatedCounter,
  useCursorGlow,
  useAppRoutes,
} from '../../hooks';
import { isStandaloneMode, getShopDomain } from '../../services';
import ProgressRing from './ProgressRing';

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTimeAgo(ms) {
  if (ms === null || ms === undefined || Number.isNaN(new Date(ms).getTime())) return '—';
  const sec = Math.floor((Date.now() - new Date(ms).getTime()) / 1000);
  if (sec < 0) return 'just now';
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function formatCompact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function getTimeBasedGradient() {
  const h = new Date().getHours();
  if (h < 12) return 'morning'; // Warm sunrise
  if (h < 18) return 'afternoon'; // Bright day
  return 'evening'; // Cool dusk
}

const STATUS_FILTERS = ['all', 'running', 'stopped', 'completed', 'draft'];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'visitors', label: 'Most visitors' },
  { value: 'conversion', label: 'Highest conversion' },
  { value: 'name', label: 'Name A–Z' },
];

function Dashboard() {
  const [currentPage, setCurrentPage] = useState(1);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('recent');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandSelected, setCommandSelected] = useState(0);
  const [neonMode, setNeonMode] = useState(false);
  const commandInputRef = useRef(null);
  const cursorGlow = useCursorGlow(true);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 10000);
    return () => clearInterval(id);
  }, []);
  const testsPerPage = 5;
  const navigate = useNavigate();
  const routes = useAppRoutes();
  const activeShopDomain = getShopDomain();

  useEffect(() => {
    setCurrentPage(1);
    setStatusFilter('all');
    setSortBy('recent');
    setErrorDismissed(false);
    setCommandPaletteOpen(false);
  }, [activeShopDomain]);

  const {
    data: tests = [],
    isLoading: loading,
    isError,
    error,
    refetch: fetchTests,
    dataUpdatedAt,
    isFetching,
  } = useTests();

  const { data: apiStats, isLoading: _statsLoading, refetch: fetchStats } = useDashboardStats();

  // Auto-refresh when active tests (every 30s)
  const activeCount = (tests || []).filter(
    t => (t.status || '').toLowerCase() === 'running'
  ).length;
  useEffect(() => {
    if (activeCount > 0) {
      const id = setInterval(() => {
        fetchTests();
        fetchStats();
      }, 30_000);
      return () => clearInterval(id);
    }
  }, [activeCount, fetchTests, fetchStats]);

  // Command palette ⌘K / Ctrl+K
  useEffect(() => {
    const handle = e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(open => {
          if (!open) {
            setCommandQuery('');
            setCommandSelected(0);
            setTimeout(() => commandInputRef.current?.focus(), 50);
          }
          return !open;
        });
      }
      if (e.key === 'Escape') setCommandPaletteOpen(false);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  const {
    stats,
    bestPerformer,
    typeBreakdown,
    typeDistribution,
    readyForReview,
    avgConversionRate,
    recentActivity,
  } = useMemo(() => {
    const fromApi = !!apiStats;
    const s = fromApi
      ? {
          totalTests: Number(apiStats.totalTests) || 0,
          activeTests: Number(apiStats.activeTests) || 0,
          totalVisitors: Number(apiStats.totalVisitors) || 0,
          totalRevenue: Number(apiStats.totalRevenue) || 0,
        }
      : (tests || []).reduce(
          (acc, test) => {
            acc.totalTests += 1;
            if ((test.status || '').toLowerCase() === 'running') acc.activeTests += 1;
            if (test.variants?.length) {
              test.variants.forEach(v => {
                acc.totalVisitors += v.visitors || 0;
                acc.totalRevenue += v.revenue || 0;
              });
            }
            return acc;
          },
          { totalTests: 0, activeTests: 0, totalVisitors: 0, totalRevenue: 0 }
        );
    let best = null;
    if (tests?.length > 0) {
      const withRates = tests
        .filter(t => t.variants?.length && t.variants.some(v => (v.visitors || 0) > 0))
        .map(t => {
          const visitors = t.variants.reduce((sum, v) => sum + (v.visitors || 0), 0);
          const conversions = t.variants.reduce((sum, v) => sum + (v.conversions || 0), 0);
          const rate = visitors > 0 ? (conversions / visitors) * 100 : 0;
          return { test: t, rate, visitors };
        })
        .filter(x => x.visitors >= 50);
      if (withRates.length > 0) {
        best = withRates.reduce((a, b) => (a.rate > b.rate ? a : b));
      }
    }
    const breakdown = {};
    (tests || []).forEach(t => {
      const label = getTestTypeDisplay(t).label;
      breakdown[label] = (breakdown[label] || 0) + 1;
    });
    const typeBreakdown = Object.entries(breakdown)
      .map(([label, count]) => `${count} ${label}`)
      .join(', ');
    const typeDistribution = Object.entries(breakdown).map(([label, count]) => ({
      label,
      count,
      pct: s.totalTests > 0 ? (count / s.totalTests) * 100 : 0,
    }));
    const readyForReview = (tests || []).filter(t => {
      const status = (t.status || '').toLowerCase();
      if (status !== 'completed' && status !== 'stopped') return false;
      const visitors = (t.variants || []).reduce((sum, v) => sum + (v.visitors || 0), 0);
      return visitors >= 100;
    });
    const totalConversions = fromApi
      ? Number(apiStats.totalConversions) || 0
      : (tests || []).reduce(
          (acc, t) => acc + (t.variants || []).reduce((sum, v) => sum + (v.conversions || 0), 0),
          0
        );
    const avgConversionRate = fromApi
      ? Number(apiStats.avgConversionRate) || 0
      : s.totalVisitors > 0
        ? (totalConversions / s.totalVisitors) * 100
        : 0;
    const recentActivity = [...(tests || [])]
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)
      )
      .slice(0, 5)
      .map(t => ({
        test: t,
        type:
          t.status === 'running'
            ? 'started'
            : t.status === 'completed' || t.status === 'stopped'
              ? 'ended'
              : 'updated',
        at: t.updated_at || t.created_at,
      }));
    return {
      stats: s,
      bestPerformer: best,
      typeBreakdown,
      typeDistribution,
      readyForReview,
      avgConversionRate,
      recentActivity,
    };
  }, [tests, apiStats]);

  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [tests]);

  useEffect(() => {
    if (isError) setErrorDismissed(false);
  }, [isError]);

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

  // Filter, sort, and paginate tests
  const { paginatedTests, filteredCount } = useMemo(() => {
    let filtered = [...tests];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => (t.status || '').toLowerCase() === statusFilter);
    }
    const getVisitors = t => (t.variants || []).reduce((s, v) => s + (v.visitors || 0), 0);
    const getConversion = t => {
      const v = getVisitors(t);
      const c = (t.variants || []).reduce((s, x) => s + (x.conversions || 0), 0);
      return v > 0 ? (c / v) * 100 : 0;
    };
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'recent') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === 'visitors') return getVisitors(b) - getVisitors(a);
      if (sortBy === 'conversion') return getConversion(b) - getConversion(a);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });
    const startIndex = (currentPage - 1) * testsPerPage;
    return {
      paginatedTests: sorted.slice(startIndex, startIndex + testsPerPage),
      filteredCount: sorted.length,
    };
  }, [tests, currentPage, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredCount / testsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, sortBy]);

  // Animated counters for hero stats
  const animatedActive = useAnimatedCounter(stats.activeTests, 800, !loading);
  const animatedVisitors = useAnimatedCounter(stats.totalVisitors, 1000, !loading);
  const animatedRevenue = useAnimatedCounter(stats.totalRevenue, 1000, !loading);

  // Command palette items (must be before early return - hooks rules)
  const allCommandItems = useMemo(() => {
    const base = [
      {
        id: 'new',
        label: 'Create new test',
        shortcut: 'N',
        onSelect: () => {
          setCommandPaletteOpen(false);
          navigate(routes.createTest);
        },
      },
      {
        id: 'all',
        label: 'View all tests',
        shortcut: 'T',
        onSelect: () => {
          setCommandPaletteOpen(false);
          navigate(routes.tests);
        },
      },
      {
        id: 'setup',
        label: 'Setup wizard',
        shortcut: 'S',
        onSelect: () => {
          setCommandPaletteOpen(false);
          navigate(routes.setup);
        },
      },
      {
        id: 'analytics',
        label: 'Analytics overview',
        shortcut: 'A',
        onSelect: () => {
          setCommandPaletteOpen(false);
          navigate(routes.analytics);
        },
      },
      {
        id: 'refresh',
        label: 'Refresh dashboard',
        shortcut: 'R',
        onSelect: () => {
          setCommandPaletteOpen(false);
          fetchTests();
          fetchStats();
        },
      },
    ];
    const testItems = (tests || []).slice(0, 5).map(t => ({
      id: `test-${t.id}`,
      label: t.name,
      sublabel: `${getTestTypeDisplay(t).label} • ${t.status}`,
      onSelect: () => {
        setCommandPaletteOpen(false);
        navigate(routes.testDetail(t.id));
      },
    }));
    return testItems.length
      ? [...base, { id: 'sep', label: '—', isSep: true }, ...testItems]
      : base;
  }, [tests, navigate, fetchTests, fetchStats, routes]);
  const filteredCommandItems = useMemo(() => {
    const q = commandQuery.trim().toLowerCase();
    if (!q) return allCommandItems.filter(x => !x.isSep);
    return allCommandItems.filter(
      x => !x.isSep && (x.label?.toLowerCase().includes(q) || x.sublabel?.toLowerCase().includes(q))
    );
  }, [commandQuery, allCommandItems]);
  const safeSelected = Math.min(commandSelected, Math.max(0, filteredCommandItems.length - 1));

  const runCommandAction = useCallback(item => {
    if (item?.onSelect) item.onSelect();
  }, []);

  useEffect(() => {
    setCommandSelected(0);
  }, [commandQuery]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const handle = e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCommandSelected(s => Math.min(s + 1, filteredCommandItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCommandSelected(s => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' && filteredCommandItems[safeSelected]?.onSelect) {
        e.preventDefault();
        runCommandAction(filteredCommandItems[safeSelected]);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [commandPaletteOpen, filteredCommandItems, safeSelected, runCommandAction]);

  const TestCard = ({ test }) => {
    const handleCardClick = () =>
      navigate(routes.testDetail(test.id), { state: { listTest: test } });
    const handleAction = (e, fn) => {
      e.stopPropagation();
      fn();
    };

    const totalVisitors = test.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
    const totalConversions = test.variants?.reduce((sum, v) => sum + (v.conversions || 0), 0) || 0;
    const totalRevenue = test.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
    const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
    const variantCount = getVariantCount(test);

    return (
      <div
        className={`test-card-overview ${styles.testCardFuturistic}`}
        data-status={test.status}
        onClick={handleCardClick}
      >
        <div className="test-card-header">
          <div className="test-card-icon-wrap">
            <span className="test-card-icon">{getTestTypeDisplay(test).icon}</span>
          </div>
          <div className="test-card-title-block">
            <Text variant="bodyMd" fontWeight="semibold" as="span" className="test-card-name">
              {test.name}
            </Text>
            <Text variant="bodySm" color="subdued" as="p" className="test-card-meta">
              {getTestTypeDisplay(test).label} • {variantCount} variant
              {variantCount !== 1 ? 's' : ''} • Created{' '}
              {test.created_at ? new Date(test.created_at).toLocaleDateString() : '—'}
            </Text>
          </div>
          <div className="test-card-badges">
            {getStatusBadge(test.status)}
            {getHealthBadge(test.health)}
          </div>
        </div>

        {/* Hover quick actions */}
        <div className={styles.testCardActions}>
          <button
            type="button"
            className={styles.testCardActionBtn}
            onClick={e => handleAction(e, () => navigate(routes.testAnalytics(test.id)))}
            aria-label="View analytics"
          >
            <ChartLineIcon />
          </button>
          {test.status === 'running' ? (
            <button
              type="button"
              className={styles.testCardActionBtn}
              onClick={e =>
                handleAction(e, () =>
                  navigate(routes.testDetail(test.id), { state: { listTest: test } })
                )
              }
              aria-label="View test"
            >
              <StopCircleIcon />
            </button>
          ) : (
            <button
              type="button"
              className={styles.testCardActionBtn}
              onClick={e =>
                handleAction(e, () =>
                  navigate(routes.testDetail(test.id), { state: { listTest: test } })
                )
              }
              aria-label="View test"
            >
              <PlayIcon />
            </button>
          )}
        </div>

        {totalVisitors > 0 && (
          <div className="test-card-metrics">
            <div className="test-card-metric">
              <span className="test-card-metric-label">Visitors</span>
              <span className="test-card-metric-value">{totalVisitors.toLocaleString()}</span>
            </div>
            <div className="test-card-metric">
              <span className="test-card-metric-label">Conversions</span>
              <span className="test-card-metric-value">{totalConversions.toLocaleString()}</span>
            </div>
            <div className="test-card-metric">
              <span className="test-card-metric-label">Rate</span>
              <span
                className={`test-card-metric-value test-card-metric-rate ${
                  conversionRate > 5 ? 'success' : conversionRate > 2 ? 'base' : 'subdued'
                }`}
              >
                {conversionRate.toFixed(2)}%
              </span>
            </div>
            {totalRevenue > 0 && (
              <div className="test-card-metric">
                <span className="test-card-metric-label">Revenue</span>
                <span className="test-card-metric-value success">
                  $
                  {totalRevenue.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
          </div>
        )}

        {totalVisitors === 0 && test.status === 'running' && (
          <div className="test-card-waiting">
            <Text variant="bodySm" color="subdued" as="p">
              Waiting for traffic...
            </Text>
          </div>
        )}
      </div>
    );
  };

  if (loading && tests.length === 0) {
    return (
      <div className={`${pageShell.page} ${styles.dashboardPage}`}>
        <div className={styles.gradientMesh} aria-hidden="true">
          <div className={styles.gradientBlob1} />
          <div className={styles.gradientBlob2} />
          <div className={styles.gradientBlob3} />
        </div>
        <Page title="">
          <BlockStack gap="400">
            <div className={styles.skeletonHero} />
            <div className={styles.bentoGrid}>
              <div className={`${styles.skeletonCard} ${styles.skeletonBentoLaunch}`} />
              <div className={`${styles.skeletonCard} ${styles.skeletonBentoMetrics}`} />
              <div className={`${styles.skeletonCard} ${styles.skeletonBentoRecent}`} />
              <div className={`${styles.skeletonCard} ${styles.skeletonBentoTips}`} />
            </div>
          </BlockStack>
        </Page>
      </div>
    );
  }

  const errorMessage =
    isError && !errorDismissed
      ? error?.response?.data?.error || error?.message || 'Failed to load tests'
      : null;

  const timeGradient = getTimeBasedGradient();

  return (
    <div
      className={`${pageShell.page} ${styles.dashboardPage} ${neonMode ? styles.neonMode : ''}`}
      data-time-gradient={timeGradient}
    >
      {/* Cursor glow */}
      {cursorGlow.visible && (
        <div
          className={styles.cursorGlow}
          style={{
            left: cursorGlow.pos.x,
            top: cursorGlow.pos.y,
          }}
          aria-hidden="true"
        />
      )}

      {/* Scan line overlay */}
      <div className={styles.scanLines} aria-hidden="true" />

      {/* Floating particles */}
      <div className={styles.particles} aria-hidden="true">
        {[...Array(12)].map((_, i) => (
          <div key={i} className={styles.particle} style={{ '--i': i }} />
        ))}
      </div>

      {/* Animated gradient mesh + morphing blob */}
      <div className={styles.gradientMesh} aria-hidden="true">
        <div className={styles.gradientBlob1} />
        <div className={styles.gradientBlob2} />
        <div className={styles.gradientBlob3} />
        <div className={styles.morphingBlob} />
      </div>

      {/* Neon mode toggle */}
      <button
        type="button"
        className={styles.neonToggle}
        onClick={() => setNeonMode(m => !m)}
        title={neonMode ? 'Disable neon mode' : 'Enable neon mode'}
        aria-label={neonMode ? 'Disable neon mode' : 'Enable neon mode'}
      >
        {neonMode ? '✦' : '◇'}
      </button>

      {/* Floating Action Button */}
      <button
        type="button"
        className={`${styles.fab} ${styles.rippleBtn} ${activeCount > 0 ? styles.fabActive : ''}`}
        onClick={() => navigate(routes.createTest)}
        aria-label="Create new test"
        title="Create test"
      >
        {activeCount > 0 && (
          <span className={styles.fabBadge} aria-label={`${activeCount} active tests`}>
            {activeCount}
          </span>
        )}
        <span className={styles.fabIcon}>+</span>
        <span className={styles.fabLabel}>New test</span>
      </button>

      <Toast
        message={errorMessage}
        type="error"
        onClose={() => setErrorDismissed(true)}
        duration={5000}
      />

      {commandPaletteOpen && (
        <div className={styles.commandPaletteOverlay} onClick={() => setCommandPaletteOpen(false)}>
          <div className={styles.commandPalette} onClick={e => e.stopPropagation()}>
            <div className={styles.commandPaletteSearch}>
              <input
                ref={commandInputRef}
                type="search"
                placeholder="Search actions or tests..."
                value={commandQuery}
                onChange={e => setCommandQuery(e.target.value)}
                className={styles.commandPaletteInput}
                autoComplete="off"
                aria-label="Search commands"
              />
            </div>
            <div className={styles.commandPaletteList}>
              {filteredCommandItems.length === 0 ? (
                <div className={styles.commandPaletteEmpty}>No results</div>
              ) : (
                <>
                  {filteredCommandItems.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      className={`${styles.commandPaletteItem} ${i === safeSelected ? styles.commandPaletteItemActive : ''}`}
                      onClick={() => runCommandAction(a)}
                      onMouseEnter={() => setCommandSelected(i)}
                    >
                      <span>
                        {a.label}
                        {a.sublabel && (
                          <span className={styles.commandPaletteSublabel}>{a.sublabel}</span>
                        )}
                      </span>
                      {a.shortcut && <kbd className={styles.commandPaletteKbd}>⌘{a.shortcut}</kbd>}
                    </button>
                  ))}
                  <div className={styles.commandPaletteFooter}>
                    <span>↑↓ Navigate</span>
                    <span>Enter Select</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Page title="">
        <div className={styles.dashboardContent}>
          {/* Hero Section */}
          <section
            className={`${styles.heroSection} ${styles[`heroTime${timeGradient.charAt(0).toUpperCase() + timeGradient.slice(1)}`]}`}
          >
            <div className={styles.heroGlowAccent} aria-hidden="true" />
            <div className={styles.noiseOverlay} aria-hidden="true" />
            <div className={styles.heroContent}>
              <div className={styles.heroLeft}>
                <div className={styles.heroTitleRow}>
                  <div className={styles.heroIconWrap}>
                    <ChartLineIcon />
                  </div>
                  <div className={styles.heroTitleWrap}>
                    <h1 className={styles.heroTitle}>Dashboard</h1>
                    <span className={styles.heroTitleTag}>Command center</span>
                  </div>
                  <span
                    className={stats.activeTests > 0 ? styles.heroBadge : styles.heroBadgeInactive}
                  >
                    {stats.activeTests > 0 ? '● Live' : '○ Idle'}
                  </span>
                  {stats.totalTests > 0 && (
                    <span className={styles.heroActivePct}>
                      {Math.round((stats.activeTests / stats.totalTests) * 100)}% active
                    </span>
                  )}
                </div>
                <p className={styles.heroSubtitle}>
                  {getTimeGreeting()} • {stats.totalTests} test{stats.totalTests !== 1 ? 's' : ''}{' '}
                  total
                  {typeBreakdown && ` • ${typeBreakdown}`}
                </p>
                {(stats.activeTests > 0 || bestPerformer) && (
                  <div className={styles.insightBanner}>
                    {stats.activeTests > 0 && (
                      <span>
                        {stats.activeTests} test{stats.activeTests !== 1 ? 's' : ''} collecting data
                      </span>
                    )}
                    {stats.activeTests > 0 && bestPerformer && (
                      <span className={styles.insightDot}>•</span>
                    )}
                    {bestPerformer && (
                      <span>
                        Best performer:{' '}
                        <button
                          type="button"
                          className={styles.insightLink}
                          onClick={() =>
                            navigate(routes.testDetail(bestPerformer.test.id), {
                              state: { listTest: bestPerformer.test },
                            })
                          }
                        >
                          {bestPerformer.test.name}
                        </button>{' '}
                        ({bestPerformer.rate.toFixed(1)}% conv.)
                      </span>
                    )}
                  </div>
                )}
                <div className={styles.lastUpdated}>
                  {activeCount > 0 && (
                    <span className={styles.liveIndicator} title="Auto-refreshing every 30s">
                      Live
                    </span>
                  )}
                  <button
                    type="button"
                    className={`${styles.refreshBtn} ${isFetching ? styles.refreshSpinning : ''}`}
                    onClick={() => {
                      fetchTests();
                      fetchStats();
                    }}
                    disabled={isFetching}
                    aria-label="Refresh data"
                  >
                    <RefreshIcon />
                  </button>
                  <Text variant="bodySm" color="subdued" as="span">
                    Updated {formatTimeAgo(dataUpdatedAt)}
                  </Text>
                  <button
                    type="button"
                    className={styles.cmdKHint}
                    onClick={() => setCommandPaletteOpen(true)}
                    title="Quick actions"
                  >
                    ⌘K
                  </button>
                </div>
                <div className={styles.heroQuickLinks}>
                  <Link to={routes.setup} className={styles.heroQuickLink}>
                    Setup
                  </Link>
                  <span className={styles.heroQuickLinkDivider} aria-hidden="true" />
                  <Link to={routes.analytics} className={styles.heroQuickLink}>
                    Analytics
                  </Link>
                  <span className={styles.heroQuickLinkDivider} aria-hidden="true" />
                  <Link to={routes.settings} className={styles.heroQuickLink}>
                    App settings
                  </Link>
                  <span className={styles.heroQuickLinkDivider} aria-hidden="true" />
                  <Link to={routes.tests} className={styles.heroQuickLink}>
                    All Tests
                  </Link>
                </div>
              </div>
              <div className={styles.heroStatsRow}>
                <div className={styles.heroQuickStats}>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatIcon} aria-hidden="true">
                      ▶
                    </span>
                    <span className={styles.heroStatValue}>{animatedActive}</span>
                    <span className={styles.heroStatLabel}>Active</span>
                    {stats.totalTests > 0 && (
                      <div className={styles.heroStatBar}>
                        <div
                          className={styles.heroStatBarFill}
                          style={{ width: `${(stats.activeTests / stats.totalTests) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatIcon} aria-hidden="true">
                      👁
                    </span>
                    <span className={styles.heroStatValue}>
                      {stats.totalVisitors >= 1000
                        ? formatCompact(animatedVisitors)
                        : animatedVisitors.toLocaleString()}
                    </span>
                    <span className={styles.heroStatLabel}>Visitors</span>
                  </div>
                  <div className={styles.heroStat}>
                    <span className={styles.heroStatIcon} aria-hidden="true">
                      ↑
                    </span>
                    <span className={styles.heroStatValue}>
                      $
                      {stats.totalRevenue >= 1000
                        ? formatCompact(Math.round(animatedRevenue))
                        : animatedRevenue.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                    </span>
                    <span className={styles.heroStatLabel}>Revenue</span>
                  </div>
                  {stats.totalVisitors > 0 && (
                    <div className={styles.heroStat}>
                      <span className={styles.heroStatIcon} aria-hidden="true">
                        %
                      </span>
                      <span className={styles.heroStatValue}>{avgConversionRate.toFixed(2)}%</span>
                      <span className={styles.heroStatLabel}>Conv. Rate</span>
                    </div>
                  )}
                </div>
                <div className={styles.heroProgressWrap}>
                  <ProgressRing
                    value={stats.activeTests}
                    max={Math.max(stats.totalTests, 1)}
                    size={72}
                    strokeWidth={5}
                  />
                  <span className={styles.heroProgressLabel}>Active</span>
                </div>
              </div>
            </div>
          </section>

          {/* Ready for review banner */}
          {readyForReview.length > 0 && (
            <div className={styles.readyForReviewBanner}>
              <span className={styles.readyForReviewIcon}>📊</span>
              <div>
                <strong>
                  {readyForReview.length} test{readyForReview.length !== 1 ? 's' : ''} ready for
                  review
                </strong>
                <span className={styles.readyForReviewDesc}>
                  {' '}
                  — Analyze results and promote winners
                </span>
              </div>
              <Button size="slim" onClick={() => navigate(routes.tests)}>
                Review now
              </Button>
            </div>
          )}

          {/* Milestone badges */}
          {stats.totalTests > 0 && (
            <div className={styles.milestoneRow}>
              {stats.totalTests >= 1 && (
                <span className={styles.milestoneBadge} title="First experiment">
                  🚀 First test
                </span>
              )}
              {stats.totalTests >= 5 && (
                <span className={styles.milestoneBadge} title="5 experiments">
                  ⭐ 5 tests
                </span>
              )}
              {stats.totalTests >= 10 && (
                <span className={styles.milestoneBadge} title="Power user">
                  🏆 10 tests
                </span>
              )}
              {stats.totalVisitors >= 1000 && (
                <span className={styles.milestoneBadge} title="1K visitors">
                  👥 1K visitors
                </span>
              )}
            </div>
          )}

          {/* Bento Grid Layout */}
          <div className={styles.bentoGrid}>
            {/* Launch Experiment - Featured (2fr) */}
            <div className={`${styles.sectionCard} ${styles.bentoLaunch} ${styles.cardElevated}`}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIcon}>🚀</span>
                  Launch Experiment
                </h2>
                <p className={styles.sectionSubtitle}>Choose a test type to get started</p>
              </div>
              <div className={styles.quickStartGrid}>
                {!isStandaloneMode() && (
                  <>
                    <button
                      type="button"
                      className={`${styles.quickStartBtn} ${styles.quickStartPricing} ${styles.rippleBtn}`}
                      onClick={() => {
                        const params = new URLSearchParams({
                          type: 'pricing',
                          testTypeId: 'pricing',
                        });
                        navigate(
                          routes.createTest + (params.toString() ? `?${params.toString()}` : '')
                        );
                      }}
                    >
                      <span className={styles.quickStartIcon}>💰</span>
                      <span className={styles.quickStartLabel}>Pricing</span>
                      <span className={styles.quickStartDesc}>Test price points</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.quickStartBtn} ${styles.quickStartShipping} ${styles.rippleBtn}`}
                      onClick={() => {
                        const params = new URLSearchParams({
                          type: 'shipping',
                          testTypeId: 'shipping',
                        });
                        navigate(
                          routes.createTest + (params.toString() ? `?${params.toString()}` : '')
                        );
                      }}
                    >
                      <span className={styles.quickStartIcon}>🚚</span>
                      <span className={styles.quickStartLabel}>Shipping</span>
                      <span className={styles.quickStartDesc}>Test shipping rates</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.quickStartBtn} ${styles.quickStartOffer} ${styles.rippleBtn}`}
                      onClick={() => {
                        const params = new URLSearchParams({ type: 'offer', testTypeId: 'offer' });
                        navigate(
                          routes.createTest + (params.toString() ? `?${params.toString()}` : '')
                        );
                      }}
                    >
                      <span className={styles.quickStartIcon}>🎁</span>
                      <span className={styles.quickStartLabel}>Offer</span>
                      <span className={styles.quickStartDesc}>Test discounts</span>
                    </button>
                    <Link
                      to={routes.createTest}
                      className={`${styles.quickStartBtn} ${styles.quickStartMore} ${styles.rippleBtn}`}
                    >
                      <span className={styles.quickStartIcon}>⋯</span>
                      <span className={styles.quickStartLabel}>More types</span>
                      <span className={styles.quickStartDesc}>Checkout, theme, combo...</span>
                    </Link>
                  </>
                )}
                <button
                  type="button"
                  className={`${styles.quickStartBtn} ${styles.quickStartContent} ${styles.rippleBtn}`}
                  onClick={() => {
                    const params = new URLSearchParams({
                      type: 'content',
                      testTypeId: 'onsite-edit',
                    });
                    navigate(
                      routes.createTest + (params.toString() ? `?${params.toString()}` : '')
                    );
                  }}
                >
                  <span className={styles.quickStartIcon}>✏️</span>
                  <span className={styles.quickStartLabel}>Onsite Edit</span>
                  <span className={styles.quickStartDesc}>Edit page elements</span>
                </button>
                <button
                  type="button"
                  className={`${styles.quickStartBtn} ${styles.quickStartMore} ${styles.rippleBtn}`}
                  onClick={() => {
                    const params = new URLSearchParams({
                      type: 'content',
                      testTypeId: 'split-url',
                    });
                    navigate(
                      routes.createTest + (params.toString() ? `?${params.toString()}` : '')
                    );
                  }}
                >
                  <span className={styles.quickStartIcon}>🔀</span>
                  <span className={styles.quickStartLabel}>Split URL</span>
                  <span className={styles.quickStartDesc}>Send visitors to alternate URLs</span>
                </button>
                {isStandaloneMode() && (
                  <Link
                    to={routes.createTest}
                    className={`${styles.quickStartBtn} ${styles.quickStartMore} ${styles.rippleBtn}`}
                  >
                    <span className={styles.quickStartIcon}>⋯</span>
                    <span className={styles.quickStartLabel}>Create test</span>
                    <span className={styles.quickStartDesc}>Choose type in wizard</span>
                  </Link>
                )}
              </div>
            </div>

            {/* Activity bridge + Recent Activity */}
            <div className={styles.bentoBridge}>
              <div className={styles.bridgeLine} aria-hidden="true" />
              <div className={styles.bridgeContent}>
                <span className={styles.bridgeStat}>
                  {activeCount > 0 ? (
                    <>
                      <span className={styles.bridgeDot} />
                      {activeCount} active
                    </>
                  ) : (
                    <span className={styles.bridgeMuted}>No active tests</span>
                  )}
                </span>
                <span className={styles.bridgeDivider} aria-hidden="true" />
                <span className={styles.bridgeStat}>Updated {formatTimeAgo(dataUpdatedAt)}</span>
                {readyForReview.length > 0 && (
                  <>
                    <span className={styles.bridgeDivider} aria-hidden="true" />
                    <span className={styles.bridgeHighlight}>
                      {readyForReview.length} ready for review
                    </span>
                  </>
                )}
              </div>
              {recentActivity.length > 0 && (
                <div className={styles.recentActivityStrip}>
                  <span className={styles.recentActivityLabel}>Recent:</span>
                  {recentActivity.slice(0, 4).map(({ test, type }) => (
                    <button
                      key={test.id}
                      type="button"
                      className={styles.recentActivityItem}
                      onClick={() => navigate(routes.testDetail(test.id))}
                      title={test.name}
                    >
                      <span className={styles.recentActivityItemText}>
                        {getTestTypeDisplay(test).icon}{' '}
                        {(test.name || '').length > 24
                          ? `${(test.name || '').slice(0, 24)}…`
                          : test.name || 'Unnamed'}
                      </span>
                      <span className={styles.recentActivityType}>
                        {type === 'started' ? '▶' : type === 'ended' ? '■' : '•'}
                      </span>
                    </button>
                  ))}
                  {recentActivity.length > 4 && (
                    <button
                      type="button"
                      className={styles.recentActivityViewAll}
                      onClick={() => navigate(routes.tests)}
                    >
                      View all
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Metrics - Compact (1fr) */}
            <div className={`${styles.sectionCard} ${styles.bentoMetrics} ${styles.cardElevated}`}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIcon}>📊</span>
                  Overview
                </h2>
                <p className={styles.sectionSubtitle}>Key metrics at a glance</p>
              </div>
              <div className={`${styles.bentoMetricsGrid} ${styles.dataStream}`}>
                <MetricCard
                  title="Total Tests"
                  value={stats.totalTests}
                  subtitle={`${stats.activeTests} active`}
                  tooltip="Total number of A/B tests created"
                  animated
                  format="plain"
                />
                <MetricCard
                  title="Active Tests"
                  value={stats.activeTests}
                  subtitle="Currently running"
                  tooltip="Tests currently collecting data"
                  animated
                  format="plain"
                />
                <MetricCard
                  title="Total Visitors"
                  value={stats.totalVisitors}
                  subtitle="Across all tests"
                  tooltip="Total visitors across all test variants"
                  animated
                  format="number"
                />
                <MetricCard
                  title="Revenue Impact"
                  value={stats.totalRevenue}
                  subtitle="From tests"
                  tooltip="Total revenue from all test variants"
                  animated
                  format="currency"
                />
              </div>
              {typeDistribution.length > 0 && (
                <div className={styles.typeDistribution}>
                  <Text variant="bodySm" fontWeight="medium" as="p" color="subdued">
                    Test types
                  </Text>
                  <div className={styles.typeDistributionBars}>
                    {typeDistribution.map(({ label, pct }) => (
                      <div key={label} className={styles.typeDistributionRow}>
                        <span className={styles.typeDistributionLabel}>{label}</span>
                        <div className={styles.typeDistributionBarWrap}>
                          <div
                            className={styles.typeDistributionBar}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={styles.typeDistributionPct}>{pct.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Recent Tests (2fr) */}
            <div className={`${styles.sectionCard} ${styles.bentoRecent} ${styles.cardElevated}`}>
              <div className={styles.actionsBar}>
                <BlockStack gap="100">
                  <h2 className={styles.sectionTitle}>
                    <span className={styles.sectionIcon}>🧪</span>
                    Recent Tests
                  </h2>
                  <p className={styles.sectionSubtitle}>
                    Showing {paginatedTests.length} of {filteredCount} tests
                    {statusFilter !== 'all' && ` (filtered by ${statusFilter})`}
                  </p>
                </BlockStack>
                <InlineStack gap="200">
                  <Button onClick={() => navigate(routes.tests)} variant="secondary">
                    View All Tests
                  </Button>
                  <Button onClick={() => navigate(routes.createTest)}>Create Test</Button>
                </InlineStack>
              </div>

              {tests.length > 0 && (
                <div className={styles.filterSortBar}>
                  <div className={styles.statusFilterBar}>
                    {STATUS_FILTERS.map(f => (
                      <button
                        key={f}
                        type="button"
                        className={`${styles.statusFilterBtn} ${statusFilter === f ? styles.statusFilterActive : ''}`}
                        onClick={() => setStatusFilter(f)}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                  <div className={styles.sortDropdown}>
                    <SortAscendingIcon />
                    <select
                      value={sortBy}
                      onChange={e => setSortBy(e.target.value)}
                      className={styles.sortSelect}
                      aria-label="Sort tests by"
                    >
                      {SORT_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <div className={styles.recentTestsList}>
                {loading ? (
                  <LoadingSkeleton type="table" count={3} />
                ) : tests.length === 0 ? (
                  <div className={styles.emptyStateAdvanced}>
                    <div className={styles.emptyStateIcon}>🧪</div>
                    <h3 className={styles.emptyStateTitle}>Run your first experiment</h3>
                    <p className={styles.emptyStateDesc}>
                      The wizard walks you through type, variants, and launch. RipX assigns traffic,
                      measures outcomes, and surfaces significance so you can ship what works —
                      pricing, content, shipping, and more.
                    </p>
                    <div className={styles.emptyStateActions}>
                      <Button onClick={() => navigate(routes.createTest)} size="large">
                        Create test
                      </Button>
                      <Button onClick={() => navigate(routes.createTest)} variant="plain">
                        Open test wizard
                      </Button>
                    </div>
                  </div>
                ) : filteredCount === 0 ? (
                  <div className={styles.emptyStateAdvanced}>
                    <p className={styles.emptyStateDesc}>
                      No tests match &quot;{statusFilter}&quot;. Try a different filter.
                    </p>
                    <Button onClick={() => setStatusFilter('all')} variant="secondary">
                      Show all tests
                    </Button>
                  </div>
                ) : (
                  <BlockStack gap="400">
                    {paginatedTests.map(test => (
                      <TestCard key={test.id} test={test} />
                    ))}

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className={styles.pagination}>
                        <button
                          type="button"
                          className={styles.paginationBtn}
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          aria-label="Previous page"
                        >
                          ←
                        </button>
                        <span className={styles.paginationInfo}>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          className={styles.paginationBtn}
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          aria-label="Next page"
                        >
                          →
                        </button>
                      </div>
                    )}
                  </BlockStack>
                )}
              </div>
            </div>

            {/* Tips Sidebar (1fr) */}
            <div className={`${styles.tipsCard} ${styles.cardElevated}`}>
              <div className={styles.tipsHeader}>
                <h2 className={styles.sectionTitle}>
                  <span className={styles.sectionIcon}>💡</span>
                  Tips & Best Practices
                </h2>
                <p className={styles.sectionSubtitle}>Get the most from your experiments</p>
              </div>
              <div className={styles.tipsList}>
                <div className={styles.tipItem}>
                  <span className={styles.tipIcon}>📊</span>
                  <div>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Sample Size Matters
                    </Text>
                    <Text variant="bodySm" color="subdued" as="p">
                      Wait for at least 100 visitors per variant before making decisions.
                    </Text>
                  </div>
                </div>
                <div className={styles.tipItem}>
                  <span className={styles.tipIcon}>⏱️</span>
                  <div>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Test Duration
                    </Text>
                    <Text variant="bodySm" color="subdued" as="p">
                      Run tests for at least 1-2 weeks to account for weekly patterns.
                    </Text>
                  </div>
                </div>
                <div className={styles.tipItem}>
                  <span className={styles.tipIcon}>🎯</span>
                  <div>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      One Variable at a Time
                    </Text>
                    <Text variant="bodySm" color="subdued" as="p">
                      Test one variable per experiment for clear, actionable results.
                    </Text>
                  </div>
                </div>
                <div className={styles.tipItem}>
                  <span className={styles.tipIcon}>📈</span>
                  <div>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      Statistical Significance
                    </Text>
                    <Text variant="bodySm" color="subdued" as="p">
                      Aim for 95% confidence before declaring a winner. Check analytics for
                      significance indicators.
                    </Text>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Page>
    </div>
  );
}

export default Dashboard;
