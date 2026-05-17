/**
 * Test List Component
 *
 * Full test list page with advanced filtering and search.
 * UI matches Settings/Profile for consistency.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Page,
  Card,
  Button,
  Badge,
  Checkbox,
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
import { apiGet, apiPost, unwrapData } from '../../services';
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
import { getCheckoutPhaseDisplay, getTestTypeDisplay, getVariantCount } from '../../utils/testType';
import {
  consumeFirstStartUltraCelebrationFlag,
  getCelebrationAnimationPreference,
  getCelebrationColorThemePreference,
  getCelebrationStylePreference,
} from '../../utils/preferences';
import LaunchPreflightPanel from '../LaunchPreflight/LaunchPreflightPanel';
import styles from './TestList.module.css';

function TestList() {
  const PREFLIGHT_BADGE_FETCH_LIMIT = 20;
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
  const [launchModalOpen, setLaunchModalOpen] = useState(false);
  const [launchTest, setLaunchTest] = useState(null);
  const [launchPreflightLoading, setLaunchPreflightLoading] = useState(false);
  const [launchPreflightResult, setLaunchPreflightResult] = useState(null);
  const [launchForceStart, setLaunchForceStart] = useState(false);
  const [launchForceReason, setLaunchForceReason] = useState('');
  const [launchCanaryPercent, setLaunchCanaryPercent] = useState('');
  const [launchCanaryDays, setLaunchCanaryDays] = useState('');
  const [launchVisualQaRequired, setLaunchVisualQaRequired] = useState(false);
  const [launchVisualQaBaselineId, setLaunchVisualQaBaselineId] = useState('');
  const [launchVisualQaCheckedAt, setLaunchVisualQaCheckedAt] = useState('');
  const [launchActionLoading, setLaunchActionLoading] = useState(false);
  const [preflightStatusById, setPreflightStatusById] = useState({});
  const preflightRequestedRef = useRef(new Set());
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
  const summarizePreflight = useCallback(preflight => {
    if (!preflight || typeof preflight !== 'object') {
      return { checks: 0, errors: 0, warnings: 0 };
    }
    return {
      checks: Array.isArray(preflight.checks) ? preflight.checks.length : 0,
      errors: Array.isArray(preflight.errors) ? preflight.errors.length : 0,
      warnings: Array.isArray(preflight.warnings) ? preflight.warnings.length : 0,
    };
  }, []);
  const toDateInputValue = useCallback(value => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }, []);

  const derivePreflightCardStatus = useCallback(
    preflight => {
      const summary = summarizePreflight(preflight);
      if (summary.errors > 0) {
        return { state: 'blocked', summary };
      }
      if (summary.warnings > 0) {
        return { state: 'warning', summary };
      }
      return { state: 'ready', summary };
    },
    [summarizePreflight]
  );

  const runLaunchPreflight = useCallback(
    async testId => {
      if (!testId) return null;
      setLaunchPreflightLoading(true);
      setErrorMessage(null);
      try {
        const response = await apiGet(`/tests/${testId}/preflight`);
        const data = unwrapData(response);
        const preflight = data?.preflight || null;
        setLaunchPreflightResult(preflight);
        const cardStatus = derivePreflightCardStatus(preflight);
        setPreflightStatusById(prev => ({
          ...prev,
          [testId]: {
            ...cardStatus,
            checkedAt: Date.now(),
          },
        }));
        const summary = summarizePreflight(preflight);
        if (summary.errors > 0) {
          setErrorMessage(`Preflight found ${summary.errors} blocking issue(s).`);
        } else {
          setSuccessMessage(
            summary.warnings > 0
              ? `Preflight passed with ${summary.warnings} warning(s).`
              : 'Preflight passed with no blocking issues.'
          );
        }
        return preflight;
      } catch (err) {
        setPreflightStatusById(prev => ({
          ...prev,
          [testId]: {
            state: 'error',
            summary: null,
            checkedAt: Date.now(),
          },
        }));
        setErrorMessage(err?.response?.data?.error || err?.message || 'Failed to run preflight');
        return null;
      } finally {
        setLaunchPreflightLoading(false);
      }
    },
    [derivePreflightCardStatus, summarizePreflight]
  );

  const openLaunchModal = useCallback(
    test => {
      if (!test?.id) return;
      const existingVisualQa =
        test?.goal?.visual_qa && typeof test.goal.visual_qa === 'object' ? test.goal.visual_qa : {};
      setLaunchTest(test);
      setLaunchModalOpen(true);
      setLaunchPreflightResult(null);
      setLaunchForceStart(false);
      setLaunchForceReason('');
      setLaunchCanaryPercent('');
      setLaunchCanaryDays('');
      setLaunchVisualQaRequired(
        Boolean(
          existingVisualQa.required ||
          existingVisualQa.enabled ||
          test?.segments?.visual_qa_required
        )
      );
      setLaunchVisualQaBaselineId(
        String(existingVisualQa.baseline_id || existingVisualQa.baselineId || '').trim()
      );
      setLaunchVisualQaCheckedAt(
        toDateInputValue(existingVisualQa.checked_at || existingVisualQa.checkedAt || '')
      );
      runLaunchPreflight(test.id);
    },
    [runLaunchPreflight, toDateInputValue]
  );

  const handleLaunchStart = useCallback(async () => {
    if (!launchTest?.id) return;
    const requiresForceReason =
      launchForceStart && String(launchForceReason || '').trim().length < 8;
    if (requiresForceReason) {
      setErrorMessage('Add a force-start reason (minimum 8 characters) before launching.');
      return;
    }
    if (launchVisualQaRequired && String(launchVisualQaBaselineId || '').trim().length < 2) {
      setErrorMessage(
        'Add a visual QA baseline ID before launch when visual QA requirement is enabled.'
      );
      return;
    }
    setLaunchActionLoading(true);
    setErrorMessage(null);
    try {
      const payload = {};
      if (launchForceStart) payload.force = true;
      if (launchForceStart) payload.force_reason = String(launchForceReason || '').trim();
      if (String(launchCanaryPercent || '').trim() !== '') {
        payload.canary_percent = Number(launchCanaryPercent);
      }
      if (String(launchCanaryDays || '').trim() !== '') {
        payload.canary_days = Number(launchCanaryDays);
      }
      if (launchVisualQaRequired) {
        payload.visual_qa_required = true;
      }
      if (String(launchVisualQaBaselineId || '').trim() !== '') {
        payload.visual_qa_baseline_id = String(launchVisualQaBaselineId).trim();
      }
      if (String(launchVisualQaCheckedAt || '').trim() !== '') {
        payload.visual_qa_checked_at = launchVisualQaCheckedAt;
      }

      const response = await startMutation.mutateAsync({
        testId: launchTest.id,
        payload,
      });
      const data = unwrapData(response);
      if (data?.preflight) {
        setLaunchPreflightResult(data.preflight);
        const cardStatus = derivePreflightCardStatus(data.preflight);
        setPreflightStatusById(prev => ({
          ...prev,
          [launchTest.id]: {
            ...cardStatus,
            checkedAt: Date.now(),
          },
        }));
      }
      setLaunchModalOpen(false);
      setSuccessMessage('Test started successfully.');
      setStartCelebrationMode(withUltraMilestone(resolveCelebrationVariant('full')));
    } catch (err) {
      const preflight = err?.response?.data?.preflight;
      if (preflight) {
        setLaunchPreflightResult(preflight);
        const cardStatus = derivePreflightCardStatus(preflight);
        setPreflightStatusById(prev => ({
          ...prev,
          [launchTest.id]: {
            ...cardStatus,
            checkedAt: Date.now(),
          },
        }));
      }
      setErrorMessage(
        err?.response?.data?.error || err?.response?.data?.details?.[0] || 'Failed to start test'
      );
    } finally {
      setLaunchActionLoading(false);
    }
  }, [
    launchTest,
    launchForceStart,
    launchForceReason,
    launchCanaryPercent,
    launchCanaryDays,
    launchVisualQaRequired,
    launchVisualQaBaselineId,
    launchVisualQaCheckedAt,
    derivePreflightCardStatus,
    startMutation,
    resolveCelebrationVariant,
    withUltraMilestone,
  ]);

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
    const hasSrm = Boolean(health?.srm?.detected);
    const riskLevel = String(health?.riskSignals?.level || '').toLowerCase();
    const rolloutAction = String(health?.rolloutRecommendation?.action || '').toLowerCase();
    return (
      <InlineStack gap="100" align="start">
        <Badge tone={colorMap[health.healthLevel] || 'info'}>{health.score}/100</Badge>
        {hasSrm && <Badge tone="critical">SRM</Badge>}
        {riskLevel === 'high' && <Badge tone="critical">High risk</Badge>}
        {rolloutAction === 'canary_rollout' && <Badge tone="attention">Rollout ready</Badge>}
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
    (test, e) => {
      e.stopPropagation();
      openLaunchModal(test);
    },
    [openLaunchModal]
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
        const checkoutPhaseDisplay = getCheckoutPhaseDisplay(test);
        const typeMatch =
          test.type?.toLowerCase().includes(query) ||
          typeDisplay?.toLowerCase().includes(query) ||
          checkoutPhaseDisplay?.toLowerCase().includes(query);
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

  useEffect(() => {
    const candidates = filteredAndSortedTests
      .filter(test => test?.id && test.status !== 'running')
      .slice(0, PREFLIGHT_BADGE_FETCH_LIMIT)
      .map(test => test.id)
      .filter(id => !preflightRequestedRef.current.has(id));

    if (candidates.length === 0) {
      return;
    }

    let cancelled = false;
    candidates.forEach(id => {
      preflightRequestedRef.current.add(id);
      setPreflightStatusById(prev => ({
        ...prev,
        [id]: {
          state: prev[id]?.state || 'loading',
          summary: prev[id]?.summary || null,
          checkedAt: prev[id]?.checkedAt || null,
        },
      }));
    });

    Promise.all(
      candidates.map(async id => {
        try {
          const response = await apiGet(`/tests/${id}/preflight`);
          const data = unwrapData(response);
          const preflight = data?.preflight || null;
          const cardStatus = derivePreflightCardStatus(preflight);
          return { id, ...cardStatus, checkedAt: Date.now() };
        } catch {
          return { id, state: 'error', summary: null, checkedAt: Date.now() };
        }
      })
    ).then(results => {
      if (cancelled) {
        return;
      }
      setPreflightStatusById(prev => {
        const next = { ...prev };
        results.forEach(item => {
          next[item.id] = {
            state: item.state,
            summary: item.summary,
            checkedAt: item.checkedAt,
          };
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [derivePreflightCardStatus, filteredAndSortedTests]);

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
    const checkoutPhaseDisplay = getCheckoutPhaseDisplay(test);
    const preflightStatus =
      test.status === 'running'
        ? { state: 'running', summary: null }
        : preflightStatusById[test.id] || { state: 'idle', summary: null };

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
                <div className={styles.testListCardMetaRow}>
                  <Text variant="bodySm" color="subdued" as="p" className={styles.testListCardMeta}>
                    {getTestTypeDisplay(test).label} • {variantCount} variant
                    {variantCount !== 1 ? 's' : ''} • Created {createdDate}
                  </Text>
                  {checkoutPhaseDisplay ? <Badge tone="info">{checkoutPhaseDisplay}</Badge> : null}
                </div>
              </div>
            </div>
            <div className={styles.testListCardBadges}>
              {getStatusBadge(test.status)}
              {preflightStatus.state === 'running' && <Badge tone="success">Live</Badge>}
              {preflightStatus.state === 'loading' && <Badge tone="info">Preflight…</Badge>}
              {preflightStatus.state === 'ready' && <Badge tone="success">Start ready</Badge>}
              {preflightStatus.state === 'warning' && (
                <Badge tone="warning">
                  Start warn
                  {preflightStatus.summary?.warnings > 0
                    ? ` (${preflightStatus.summary.warnings})`
                    : ''}
                </Badge>
              )}
              {preflightStatus.state === 'blocked' && (
                <Badge tone="critical">
                  Start blocked
                  {preflightStatus.summary?.errors > 0
                    ? ` (${preflightStatus.summary.errors})`
                    : ''}
                </Badge>
              )}
              {preflightStatus.state === 'error' && <Badge tone="attention">Preflight n/a</Badge>}
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
                    onClick={e => handleTestStart(test, e)}
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
                    onClick={e => handleTestStart(test, e)}
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
  const forceReasonRequired = launchForceStart && String(launchForceReason || '').trim().length < 8;
  const visualQaRequiredButMissing =
    launchVisualQaRequired && String(launchVisualQaBaselineId || '').trim().length < 2;

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
          open={launchModalOpen}
          onClose={() => setLaunchModalOpen(false)}
          title={`Launch safety check${launchTest?.name ? `: ${launchTest.name}` : ''}`}
          primaryAction={{
            content: launchForceStart ? 'Force start test' : 'Start test',
            onAction: handleLaunchStart,
            loading: launchActionLoading,
            destructive: launchForceStart,
            disabled: forceReasonRequired || visualQaRequiredButMissing,
          }}
          secondaryActions={[
            {
              content: 'Run preflight',
              onAction: () => runLaunchPreflight(launchTest?.id),
              loading: launchPreflightLoading,
            },
            {
              content: 'Cancel',
              onAction: () => setLaunchModalOpen(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <LaunchPreflightPanel preflightResult={launchPreflightResult} />
              <BlockStack gap="200">
                <TextField
                  label="Canary percent override (optional)"
                  type="number"
                  value={launchCanaryPercent}
                  onChange={setLaunchCanaryPercent}
                  placeholder="e.g. 10"
                  min={0}
                  max={100}
                  suffix="%"
                  autoComplete="off"
                />
                <TextField
                  label="Canary days override (optional)"
                  type="number"
                  value={launchCanaryDays}
                  onChange={setLaunchCanaryDays}
                  placeholder="e.g. 7"
                  min={1}
                  max={30}
                  suffix="days"
                  autoComplete="off"
                />
                <Checkbox
                  label="Visual QA baseline required for this launch"
                  checked={launchVisualQaRequired}
                  onChange={setLaunchVisualQaRequired}
                  helpText="When enabled, launch requires baseline metadata and preflight enforces it."
                />
                <TextField
                  label="Visual QA baseline ID (optional)"
                  value={launchVisualQaBaselineId}
                  onChange={setLaunchVisualQaBaselineId}
                  placeholder="e.g. home-v2-desktop"
                  autoComplete="off"
                  error={
                    visualQaRequiredButMissing
                      ? 'Baseline ID is required when visual QA requirement is enabled.'
                      : undefined
                  }
                />
                <TextField
                  label="Visual QA checked at (optional)"
                  type="date"
                  value={launchVisualQaCheckedAt}
                  onChange={setLaunchVisualQaCheckedAt}
                  autoComplete="off"
                  helpText="Date of latest visual QA verification for this launch."
                />
                <Checkbox
                  label="Force start even if preflight has blocking errors"
                  checked={launchForceStart}
                  onChange={setLaunchForceStart}
                  helpText="Use only for emergency or controlled launches."
                />
                {launchForceStart && (
                  <TextField
                    label="Force-start reason (required)"
                    value={launchForceReason}
                    onChange={setLaunchForceReason}
                    placeholder="Why are you bypassing preflight blockers?"
                    autoComplete="off"
                    multiline={2}
                    maxLength={500}
                    error={
                      forceReasonRequired
                        ? 'Provide at least 8 characters so this action is auditable.'
                        : undefined
                    }
                  />
                )}
              </BlockStack>
            </BlockStack>
          </Modal.Section>
        </Modal>

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
