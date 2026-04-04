/**
 * Test List Component
 *
 * Full test list page with advanced filtering and search.
 * UI matches Settings/Profile for consistency.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  Page,
  Card,
  Button,
  Badge,
  EmptyState,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  Modal,
  TextField,
  Select,
  Icon,
} from '@shopify/polaris';
import {
  DataTableIcon,
  PlusIcon,
  PlayIcon,
  StopCircleIcon,
  DuplicateIcon,
  DeleteIcon,
  ChartLineIcon,
  ViewIcon,
} from '@shopify/polaris-icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Toast from '../Toast/Toast';
import PartyPop from '../PartyPop/PartyPop';
import { apiPost } from '../../services';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { PageShell } from '../Shared';
import {
  useTests,
  useStartTest,
  useStopTest,
  useDeleteTest,
  useInvalidateTests,
  useAppRoutes,
} from '../../hooks';
import { TEST_STATUS_OPTIONS, PERSONALIZATION_MODES } from '../../constants';
import { getTestTypeDisplay, getVariantCount } from '../../utils/testType';
import {
  consumeFirstStartUltraCelebrationFlag,
  getCelebrationAnimationPreference,
  getCelebrationColorThemePreference,
  getCelebrationStylePreference,
} from '../../utils/preferences';
import styles from './TestList.module.css';

function TestList() {
  const [selectedTests, setSelectedTests] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState(['all']);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [viewMode, setViewMode] = useState('list');
  const [actionLoading, setActionLoading] = useState({});
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [startCelebrationMode, setStartCelebrationMode] = useState(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewFilter = searchParams.get('view') || 'all';
  const routes = useAppRoutes();
  const resolveCelebrationVariant = useCallback(preferred => {
    const userPref = getCelebrationAnimationPreference();
    if (userPref === 'off') return null;
    if (userPref === 'full' || userPref === 'subtle') return userPref;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return 'subtle';
    }
    return preferred;
  }, []);
  const withUltraMilestone = useCallback(baseVariant => {
    if (baseVariant !== 'full') return baseVariant;
    return consumeFirstStartUltraCelebrationFlag() ? 'ultra' : baseVariant;
  }, []);

  const invalidateTests = useInvalidateTests();
  const { data: tests = [], isLoading: loading, isError, error, refetch: _fetchTests } = useTests();
  const startMutation = useStartTest();
  const stopMutation = useStopTest();
  const deleteMutation = useDeleteTest();

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

  // Bulk action handlers
  const handleBulkStart = useCallback(async () => {
    if (selectedTests.length === 0) return;
    setBulkActionLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all(selectedTests.map(testId => startMutation.mutateAsync(testId)));
      setSelectedTests([]);
      setSuccessMessage(
        selectedTests.length === 1
          ? 'Test started successfully.'
          : `${selectedTests.length} tests started successfully.`
      );
      setStartCelebrationMode(
        withUltraMilestone(resolveCelebrationVariant(selectedTests.length > 1 ? 'subtle' : 'full'))
      );
    } catch (err) {
      setErrorMessage('Failed to start some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, startMutation, resolveCelebrationVariant, withUltraMilestone]);

  const handleBulkStop = useCallback(async () => {
    if (selectedTests.length === 0) return;
    setBulkActionLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all(selectedTests.map(testId => stopMutation.mutateAsync(testId)));
      setSelectedTests([]);
    } catch (err) {
      setErrorMessage('Failed to stop some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, stopMutation]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedTests.length === 0) return;
    setBulkActionLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all(selectedTests.map(testId => deleteMutation.mutateAsync(testId)));
      setSelectedTests([]);
      setDeleteModal(false);
    } catch (err) {
      setErrorMessage('Failed to delete some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, deleteMutation]);

  const handleBulkClone = useCallback(async () => {
    if (selectedTests.length === 0) return;
    setBulkActionLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all(selectedTests.map(testId => apiPost(`/tests/${testId}/clone`, {})));
      setSelectedTests([]);
      invalidateTests();
    } catch (err) {
      setErrorMessage('Failed to clone some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, invalidateTests]);

  // Individual test action handlers
  const handleTestStart = useCallback(
    async (testId, e) => {
      e.stopPropagation();
      setActionLoading(prev => ({ ...prev, [testId]: true }));
      setErrorMessage(null);
      try {
        await startMutation.mutateAsync(testId);
        setSuccessMessage('Test started successfully.');
        setStartCelebrationMode(withUltraMilestone(resolveCelebrationVariant('full')));
      } catch (err) {
        setErrorMessage(err.response?.data?.error || 'Failed to start test');
      } finally {
        setActionLoading(prev => ({ ...prev, [testId]: false }));
      }
    },
    [startMutation, resolveCelebrationVariant, withUltraMilestone]
  );

  const handleTestStop = useCallback(
    async (testId, e) => {
      e.stopPropagation();
      setActionLoading(prev => ({ ...prev, [testId]: true }));
      setErrorMessage(null);
      try {
        await stopMutation.mutateAsync(testId);
      } catch (err) {
        setErrorMessage(err.response?.data?.error || 'Failed to stop test');
      } finally {
        setActionLoading(prev => ({ ...prev, [testId]: false }));
      }
    },
    [stopMutation]
  );

  const _handleSelectionChange = useCallback(selected => {
    setSelectedTests(selected);
  }, []);

  // Filter and sort tests
  const filteredAndSortedTests = useMemo(() => {
    let filtered = tests;

    // Filter by view (personalization)
    if (viewFilter === 'personalization') {
      filtered = filtered.filter(t =>
        [PERSONALIZATION_MODES.PERSONALIZED, PERSONALIZATION_MODES.ROLLOUT].includes(
          t.personalization_mode || ''
        )
      );
    }

    // Filter by status
    if (!statusFilter.includes('all')) {
      filtered = filtered.filter(test => statusFilter.includes(test.status));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(test => {
        const nameMatch = test.name?.toLowerCase().includes(query);
        const typeDisplay = getTestTypeDisplay(test).label;
        const typeMatch =
          test.type?.toLowerCase().includes(query) || typeDisplay?.toLowerCase().includes(query);
        const descriptionMatch = test.description?.toLowerCase().includes(query);
        const statusMatch = test.status?.toLowerCase().includes(query);

        return nameMatch || typeMatch || descriptionMatch || statusMatch;
      });
    }

    // Sort tests
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'created_asc':
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case 'created_desc':
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        case 'status_asc':
          return (a.status || '').localeCompare(b.status || '');
        case 'status_desc':
          return (b.status || '').localeCompare(a.status || '');
        case 'visitors_desc': {
          const aVisitors = a.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
          const bVisitors = b.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
          return bVisitors - aVisitors;
        }
        case 'revenue_desc': {
          const aRevenue = a.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
          const bRevenue = b.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
          return bRevenue - aRevenue;
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [tests, statusFilter, searchQuery, sortBy, viewFilter]);

  // Test Card Component
  const TestCard = ({ test, isSelected, onSelect, viewMode }) => {
    const handleCardClick = e => {
      // Don't navigate if clicking checkbox, action buttons, or control buttons
      if (
        e.target.closest('.test-card-checkbox') ||
        e.target.closest('.test-card-actions') ||
        e.target.closest('.test-control-buttons')
      ) {
        return;
      }
      navigate(routes.testDetail(test.id), { state: { listTest: test } });
    };

    const isLoading = actionLoading[test.id] || false;

    // Calculate performance metrics
    const totalVisitors = test.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
    const totalConversions = test.variants?.reduce((sum, v) => sum + (v.conversions || 0), 0) || 0;
    const totalRevenue = test.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
    const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors) * 100 : 0;
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

    return (
      <div
        className={`test-list-card ${styles.testListCard} ${viewMode || 'list'} ${isSelected ? 'selected' : ''}`}
        data-status={test.status}
        onClick={handleCardClick}
      >
        <BlockStack gap="400">
          {/* Header with Checkbox */}
          <div className={styles.testListCardHeader}>
            <div className={styles.testListCardHeaderLeft}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={e => {
                  e.stopPropagation();
                  onSelect(test.id, e.target.checked);
                }}
                className={`${styles.testListCheckbox} test-card-checkbox`}
                onClick={e => e.stopPropagation()}
                aria-label={`Select ${test.name || 'test'}`}
              />
              <div className={styles.testListCardIcon}>{getTestTypeDisplay(test).icon}</div>
              <div className={styles.testListCardTitleBlock}>
                <span className={styles.testListCardTitle}>
                  <Text variant="bodyMd" fontWeight="semibold" as="span">
                    {test.name || 'Unnamed'}
                  </Text>
                </span>
                <Text variant="bodySm" color="subdued" as="p" className={styles.testListCardMeta}>
                  {getTestTypeDisplay(test).label} • {variantCount} variant
                  {variantCount !== 1 ? 's' : ''} • Created {createdDate}
                </Text>
              </div>
            </div>
            <div className={styles.testListCardBadges}>
              {getStatusBadge(test.status)}
              {test.personalization_mode === PERSONALIZATION_MODES.PERSONALIZED && (
                <Badge tone="success">Winner 100%</Badge>
              )}
              {test.personalization_mode === PERSONALIZATION_MODES.ROLLOUT && (
                <Badge tone="attention">
                  Rollout {Number(test.effective_rollout_percent ?? test.rollout_percent ?? 0)}%
                </Badge>
              )}
              {getHealthBadge(test.health)}
            </div>
          </div>

          {/* Test Control Actions Bar */}
          <div className="test-control-actions-bar" onClick={e => e.stopPropagation()}>
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" color="subdued" as="span">
                Quick Actions
              </Text>
              <div className="test-control-buttons">
                {test.status === 'draft' && (
                  <button
                    type="button"
                    className="test-control-button test-control-play"
                    onClick={e => handleTestStart(test.id, e)}
                    disabled={isLoading}
                    title="Start Test"
                    aria-label="Start Test"
                  >
                    {isLoading ? (
                      <span className="test-control-spinner"></span>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M4 2L12 8L4 14V2Z" fill="currentColor" />
                        </svg>
                        <span>Start</span>
                      </>
                    )}
                  </button>
                )}
                {test.status === 'running' && (
                  <>
                    <button
                      type="button"
                      className="test-control-button test-control-pause"
                      onClick={e => handleTestStop(test.id, e)}
                      disabled={isLoading}
                      title="Pause Test"
                      aria-label="Pause Test"
                    >
                      {isLoading ? (
                        <span className="test-control-spinner"></span>
                      ) : (
                        <>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect x="5" y="3" width="2.5" height="10" rx="1" fill="currentColor" />
                            <rect
                              x="8.5"
                              y="3"
                              width="2.5"
                              height="10"
                              rx="1"
                              fill="currentColor"
                            />
                          </svg>
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="test-control-button test-control-stop"
                      onClick={e => handleTestStop(test.id, e)}
                      disabled={isLoading}
                      title="Stop Test"
                      aria-label="Stop Test"
                    >
                      {isLoading ? (
                        <span className="test-control-spinner"></span>
                      ) : (
                        <>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
                          </svg>
                          <span>Stop</span>
                        </>
                      )}
                    </button>
                  </>
                )}
                {(test.status === 'stopped' || test.status === 'completed') && (
                  <button
                    type="button"
                    className="test-control-button test-control-play"
                    onClick={e => handleTestStart(test.id, e)}
                    disabled={isLoading}
                    title="Restart Test"
                    aria-label="Restart Test"
                  >
                    {isLoading ? (
                      <span className="test-control-spinner"></span>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path d="M4 2L12 8L4 14V2Z" fill="currentColor" />
                        </svg>
                        <span>Restart</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </InlineStack>
          </div>

          {/* Performance Metrics */}
          <div className={styles.testListCardMetrics}>
            {totalVisitors > 0 ? (
              <div className={styles.testListCardMetricsGrid}>
                <div className={styles.testListCardMetric}>
                  <span className={styles.testListCardMetricLabel}>Visitors</span>
                  <span className={styles.testListCardMetricValue}>
                    {totalVisitors.toLocaleString()}
                  </span>
                </div>
                <div className={styles.testListCardMetric}>
                  <span className={styles.testListCardMetricLabel}>Conversions</span>
                  <span className={styles.testListCardMetricValue}>
                    {totalConversions.toLocaleString()}
                  </span>
                </div>
                <div className={styles.testListCardMetric}>
                  <span className={styles.testListCardMetricLabel}>Rate</span>
                  <span
                    className={`${styles.testListCardMetricValue} ${
                      conversionRate > 5
                        ? styles.testListCardMetricValueSuccess
                        : conversionRate > 2
                          ? ''
                          : styles.testListCardMetricValueSubdued
                    }`}
                  >
                    {conversionRate.toFixed(2)}%
                  </span>
                </div>
                {totalRevenue > 0 && (
                  <div className={styles.testListCardMetric}>
                    <span className={styles.testListCardMetricLabel}>Revenue</span>
                    <span
                      className={`${styles.testListCardMetricValue} ${styles.testListCardMetricValueSuccess}`}
                    >
                      $
                      {totalRevenue.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.testListCardMetricsGrid}>
                <div className={styles.testListCardMetric}>
                  <span className={styles.testListCardMetricLabel}>Visitors</span>
                  <span className={styles.testListCardMetricValue}>0</span>
                </div>
                <div className={styles.testListCardMetric}>
                  <span className={styles.testListCardMetricLabel}>Conversions</span>
                  <span className={styles.testListCardMetricValue}>0</span>
                </div>
                <div className={styles.testListCardMetric}>
                  <span className={styles.testListCardMetricLabel}>Rate</span>
                  <span
                    className={`${styles.testListCardMetricValue} ${styles.testListCardMetricValueSubdued}`}
                  >
                    0.00%
                  </span>
                </div>
                {test.status === 'running' && (
                  <div className={styles.testListCardWaiting}>
                    <Text variant="bodySm" color="subdued" as="span">
                      Waiting for traffic...
                    </Text>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div
            className={`${styles.cardActions} test-card-actions`}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className={styles.cardActionLink}
              onClick={() => navigate(routes.testAnalytics(test.id))}
            >
              <Icon source={ChartLineIcon} />
              View Analytics
            </button>
            <button
              type="button"
              className={`${styles.cardActionLink} ${styles.cardActionLinkPrimary}`}
              onClick={() => navigate(routes.testDetail(test.id), { state: { listTest: test } })}
            >
              <Icon source={ViewIcon} />
              View Details
            </button>
          </div>
        </BlockStack>
      </div>
    );
  };

  const handleCardSelect = useCallback((testId, checked) => {
    if (checked) {
      setSelectedTests(prev => [...prev, testId]);
    } else {
      setSelectedTests(prev => prev.filter(id => id !== testId));
    }
  }, []);

  const handleSelectAll = useCallback(
    checked => {
      if (checked) {
        setSelectedTests(filteredAndSortedTests.map(t => t.id));
      } else {
        setSelectedTests([]);
      }
    },
    [filteredAndSortedTests]
  );

  const statusOptions = TEST_STATUS_OPTIONS;
  const personalizationCount = tests.filter(t =>
    [PERSONALIZATION_MODES.PERSONALIZED, PERSONALIZATION_MODES.ROLLOUT].includes(
      t.personalization_mode || ''
    )
  ).length;

  const hasActiveFilters =
    searchQuery ||
    (statusFilter.length > 0 && !statusFilter.includes('all')) ||
    viewFilter !== 'all';

  const sortOptions = [
    { label: 'Newest First', value: 'created_desc' },
    { label: 'Oldest First', value: 'created_asc' },
    { label: 'Name (A-Z)', value: 'name_asc' },
    { label: 'Name (Z-A)', value: 'name_desc' },
    { label: 'Status (A-Z)', value: 'status_asc' },
    { label: 'Most Visitors', value: 'visitors_desc' },
    { label: 'Most Revenue', value: 'revenue_desc' },
  ];

  const filterControl = (
    <div className="advanced-filter-bar">
      <BlockStack gap="400">
        {/* Top Row: Search and View Toggle */}
        <InlineStack align="space-between" blockAlign="center" wrap>
          <div style={{ flex: '1', minWidth: '300px', maxWidth: '500px' }}>
            <TextField
              label=""
              labelHidden
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="🔍 Search tests by name, type, or description..."
              clearButton
              onClearButtonClick={() => setSearchQuery('')}
              autoComplete="off"
            />
          </div>
          <InlineStack gap="300" align="end" blockAlign="center">
            <div style={{ minWidth: '180px' }}>
              <Select
                label=""
                labelHidden
                options={sortOptions}
                value={sortBy}
                onChange={setSortBy}
              />
            </div>
            <div className="view-toggle-group">
              <button
                type="button"
                className={`view-toggle-button ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
                aria-label="List View"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="12" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
                <span>List</span>
              </button>
              <button
                type="button"
                className={`view-toggle-button ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
                aria-label="Grid View"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    x="1"
                    y="1"
                    width="6"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <rect
                    x="9"
                    y="1"
                    width="6"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <rect
                    x="1"
                    y="9"
                    width="6"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <rect
                    x="9"
                    y="9"
                    width="6"
                    height="6"
                    rx="1"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    fill="none"
                  />
                </svg>
                <span>Grid</span>
              </button>
            </div>
          </InlineStack>
        </InlineStack>

        {/* View Chips: All | Personalization */}
        <InlineStack gap="200" align="start" blockAlign="center" wrap>
          <Text variant="bodySm" fontWeight="medium" as="span">
            View:
          </Text>
          <div className="filter-status-buttons">
            <InlineStack gap="100" align="start" blockAlign="center">
              <button
                type="button"
                onClick={() => setSearchParams({})}
                className={`status-filter-button ${viewFilter === 'all' ? 'active' : ''}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSearchParams({ view: 'personalization' })}
                className={`status-filter-button ${viewFilter === 'personalization' ? 'active' : ''}`}
              >
                Personalization
                {personalizationCount > 0 && (
                  <span className={styles.viewChipBadge}>{personalizationCount}</span>
                )}
              </button>
            </InlineStack>
          </div>
        </InlineStack>

        {/* Bottom Row: Status Filters */}
        <InlineStack gap="200" align="start" blockAlign="center" wrap>
          <Text variant="bodySm" fontWeight="medium" as="span">
            Filter by status:
          </Text>
          <div className="filter-status-buttons">
            <InlineStack gap="100" align="start" blockAlign="center">
              {statusOptions.map(option => {
                const isSelected = statusFilter.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (option.value === 'all') {
                        setStatusFilter(['all']);
                      } else {
                        const newFilter = statusFilter.includes('all')
                          ? [option.value]
                          : isSelected
                            ? statusFilter.filter(f => f !== option.value)
                            : [...statusFilter.filter(f => f !== 'all'), option.value];
                        setStatusFilter(newFilter.length > 0 ? newFilter : ['all']);
                      }
                    }}
                    className={`status-filter-button ${isSelected ? 'active' : ''}`}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </InlineStack>
          </div>
          {hasActiveFilters && (
            <Button
              plain
              onClick={() => {
                setStatusFilter(['all']);
                setSearchQuery('');
                setSearchParams({});
              }}
              size="small"
            >
              Clear all filters
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </div>
  );

  return (
    <PageShell className={styles.testsPage}>
      <PartyPop
        active={!!startCelebrationMode}
        variant={startCelebrationMode || 'full'}
        styleMode={getCelebrationStylePreference()}
        palette={getCelebrationColorThemePreference()}
        onComplete={() => setStartCelebrationMode(null)}
      />
      <Toast
        message={
          errorMessage ||
          (isError
            ? error?.response?.data?.error || error?.message || 'Failed to load tests'
            : null)
        }
        type="error"
        onClose={() => setErrorMessage(null)}
        duration={5000}
      />
      {successMessage && (
        <Toast
          message={successMessage}
          type="success"
          onClose={() => setSuccessMessage(null)}
          duration={3000}
        />
      )}

      <Page title="" subtitle="">
        <div className={styles.testsLayout}>
          <div className={styles.testsHero}>
            <div className={styles.testsHeroIcon}>
              <DataTableIcon />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className={styles.testsHeroTitle}>
                {viewFilter === 'personalization' ? 'Personalization & Rollout' : 'All Tests'}
              </h1>
              <p className={styles.testsHeroSubtitle}>
                {viewFilter === 'personalization'
                  ? `${filteredAndSortedTests.length} personalized or rollout ${filteredAndSortedTests.length === 1 ? 'test' : 'tests'}`
                  : `${filteredAndSortedTests.length} of ${tests.length} ${tests.length === 1 ? 'test' : 'tests'}${hasActiveFilters ? ' (filtered)' : ''}`}
              </p>
            </div>
            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.createTestBtn}
                onClick={() => navigate(routes.createTest)}
              >
                <Icon source={PlusIcon} />
                Create Test
              </button>
              {selectedTests.length > 0 && (
                <>
                  <div className={styles.heroActionsDivider} aria-hidden="true" />
                  <div className={styles.selectedBulkBar}>
                    <span className={styles.selectedCountBadge}>
                      {selectedTests.length} selected
                    </span>
                    <div className={styles.bulkActionButtons}>
                      <button
                        type="button"
                        className={`${styles.bulkActionBtn} ${styles.bulkActionBtnStart}`}
                        onClick={handleBulkStart}
                        disabled={bulkActionLoading}
                      >
                        {bulkActionLoading ? (
                          <span className={styles.bulkActionSpinner} />
                        ) : (
                          <Icon source={PlayIcon} />
                        )}
                        Start
                      </button>
                      <button
                        type="button"
                        className={`${styles.bulkActionBtn} ${styles.bulkActionBtnStop}`}
                        onClick={handleBulkStop}
                        disabled={bulkActionLoading}
                      >
                        {bulkActionLoading ? (
                          <span className={styles.bulkActionSpinner} />
                        ) : (
                          <Icon source={StopCircleIcon} />
                        )}
                        Stop
                      </button>
                      <button
                        type="button"
                        className={`${styles.bulkActionBtn} ${styles.bulkActionBtnClone}`}
                        onClick={handleBulkClone}
                        disabled={bulkActionLoading}
                      >
                        {bulkActionLoading ? (
                          <span className={styles.bulkActionSpinner} />
                        ) : (
                          <Icon source={DuplicateIcon} />
                        )}
                        Clone
                      </button>
                      <button
                        type="button"
                        className={`${styles.bulkActionBtn} ${styles.bulkActionBtnDelete}`}
                        onClick={() => setDeleteModal(true)}
                        disabled={bulkActionLoading}
                      >
                        <Icon source={DeleteIcon} />
                        Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className={styles.testsBody}>
            <Layout>
              <Layout.Section>
                <Card>
                  <BlockStack gap="500">
                    {loading ? (
                      <LoadingSkeleton type="table" count={5} />
                    ) : tests.length === 0 ? (
                      <EmptyState
                        heading="Run your first experiment"
                        action={{
                          content: 'Create test',
                          onAction: () => navigate(routes.createTest),
                        }}
                        image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                      >
                        <p>
                          Measure impact with clear assignment and reporting: price tests, content,
                          shipping, and more. RipX tracks variants and significance so you can roll
                          out winners with confidence.
                        </p>
                      </EmptyState>
                    ) : (
                      <>
                        {filterControl}

                        {/* Select All Checkbox */}
                        {filteredAndSortedTests.length > 0 && (
                          <label className={styles.selectAllBar} htmlFor="test-list-select-all">
                            <input
                              type="checkbox"
                              id="test-list-select-all"
                              className={styles.testListCheckbox}
                              checked={
                                selectedTests.length === filteredAndSortedTests.length &&
                                filteredAndSortedTests.length > 0
                              }
                              onChange={e => handleSelectAll(e.target.checked)}
                              aria-label={`Select all ${filteredAndSortedTests.length} tests`}
                            />
                            <span className={styles.selectAllLabel}>
                              Select all{' '}
                              <span className={styles.selectAllCount}>
                                {filteredAndSortedTests.length}{' '}
                                {filteredAndSortedTests.length === 1 ? 'test' : 'tests'}
                              </span>
                            </span>
                          </label>
                        )}

                        {/* Grid or List View */}
                        {filteredAndSortedTests.length === 0 ? (
                          <EmptyState
                            heading={
                              viewFilter === 'personalization'
                                ? 'No personalized or rollout tests'
                                : 'No tests found'
                            }
                            action={
                              viewFilter === 'personalization'
                                ? {
                                    content: 'View All Tests',
                                    onAction: () => setSearchParams({}),
                                  }
                                : {
                                    content: 'Create Test',
                                    onAction: () => navigate(routes.createTest),
                                  }
                            }
                          >
                            <p>
                              {viewFilter === 'personalization'
                                ? 'Stop a running test and choose "Apply winner" or "Gradual rollout" to add tests here.'
                                : 'Try adjusting your filters or create a new test.'}
                            </p>
                          </EmptyState>
                        ) : viewMode === 'grid' ? (
                          <div className={`test-list-grid ${styles.testListGrid}`}>
                            {filteredAndSortedTests.map(test => (
                              <TestCard
                                key={test.id}
                                test={test}
                                isSelected={selectedTests.includes(test.id)}
                                onSelect={handleCardSelect}
                                viewMode="grid"
                              />
                            ))}
                          </div>
                        ) : (
                          <div className={styles.testListList}>
                            <BlockStack gap="400">
                              {filteredAndSortedTests.map(test => (
                                <TestCard
                                  key={test.id}
                                  test={test}
                                  isSelected={selectedTests.includes(test.id)}
                                  onSelect={handleCardSelect}
                                  viewMode="list"
                                />
                              ))}
                            </BlockStack>
                          </div>
                        )}
                      </>
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </div>
        </div>

        <Modal
          open={deleteModal}
          onClose={() => setDeleteModal(false)}
          title="Delete Tests"
          primaryAction={{
            content: 'Delete',
            destructive: true,
            onAction: handleBulkDelete,
            loading: bulkActionLoading,
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setDeleteModal(false),
            },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to delete {selectedTests.length} test
              {selectedTests.length !== 1 ? 's' : ''}? This action cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>
      </Page>
    </PageShell>
  );
}

export default TestList;
