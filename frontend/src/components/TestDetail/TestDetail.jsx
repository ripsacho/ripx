/**
 * Test Detail (shared wizard edit view)
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Page,
  Layout,
  Modal,
  Text,
  Icon,
  BlockStack,
  Checkbox,
  TextField,
  Banner,
} from '@shopify/polaris';
import {
  ChartLineIcon,
  ClipboardIcon,
  DeleteIcon,
  DuplicateIcon,
  ExportIcon,
  LinkIcon,
  PlayIcon,
  StopCircleIcon,
  TargetIcon,
  ChartVerticalFilledIcon,
  XCircleIcon,
} from '@shopify/polaris-icons';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Toast from '../Toast/Toast';
import PartyPop from '../PartyPop/PartyPop';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { apiGet, apiPost, apiPut, apiRequest, unwrapData, getShopDomain } from '../../services';
import TestWizard from '../TestWizard/TestWizard';
import { PageShell } from '../Shared';
import {
  useTest,
  useStartTest,
  useStopTest,
  useDeleteTest,
  useInvalidateTests,
  usePersonalizeTest,
  useRolloutTest,
  useDisablePersonalization,
  useAppRoutes,
  testsListQueryKey,
  testDetailQueryKey,
} from '../../hooks';
import { useQueryClient } from '@tanstack/react-query';
import { getTestTypeDisplay, getVariantCount } from '../../utils/testType';
import {
  consumeFirstStartUltraCelebrationFlag,
  getCelebrationAnimationPreference,
  getCelebrationColorThemePreference,
  getCelebrationStylePreference,
} from '../../utils/preferences';
import styles from './TestDetail.module.css';

const PREFLIGHT_FILTERS_STORAGE_KEY = 'ripx.launchPreflightFilters.v1';
const DEFAULT_PREFLIGHT_FILTERS = {
  showErrors: true,
  showWarnings: true,
  showPassed: false,
};

function readStoredPreflightFilters() {
  if (typeof window === 'undefined') {
    return DEFAULT_PREFLIGHT_FILTERS;
  }
  try {
    const raw = window.localStorage.getItem(PREFLIGHT_FILTERS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PREFLIGHT_FILTERS;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return DEFAULT_PREFLIGHT_FILTERS;
    }
    return {
      showErrors:
        typeof parsed.showErrors === 'boolean'
          ? parsed.showErrors
          : DEFAULT_PREFLIGHT_FILTERS.showErrors,
      showWarnings:
        typeof parsed.showWarnings === 'boolean'
          ? parsed.showWarnings
          : DEFAULT_PREFLIGHT_FILTERS.showWarnings,
      showPassed:
        typeof parsed.showPassed === 'boolean'
          ? parsed.showPassed
          : DEFAULT_PREFLIGHT_FILTERS.showPassed,
    };
  } catch {
    return DEFAULT_PREFLIGHT_FILTERS;
  }
}

function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routes = useAppRoutes();
  const [actionLoading, setActionLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [startCelebrationMode, setStartCelebrationMode] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [stopExpanded, setStopExpanded] = useState(false);
  const [rolloutConfigExpanded, setRolloutConfigExpanded] = useState(false);
  const [rolloutInitialPercent, setRolloutInitialPercent] = useState('25');
  const [rolloutDuration, setRolloutDuration] = useState(7);
  const [pageTitle, setPageTitle] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [idsModalOpen, setIdsModalOpen] = useState(false);
  const [copyToast, setCopyToast] = useState(null);
  const [rolloutCsvLoading, setRolloutCsvLoading] = useState(false);
  const [reportDownloadLoading, setReportDownloadLoading] = useState(false);
  const [preLaunchOpen, setPreLaunchOpen] = useState(false);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState(null);
  const [forceStart, setForceStart] = useState(false);
  const [forceStartReason, setForceStartReason] = useState('');
  const [launchCanaryPercent, setLaunchCanaryPercent] = useState('');
  const [launchCanaryDays, setLaunchCanaryDays] = useState('');
  const [launchVisualQaRequired, setLaunchVisualQaRequired] = useState(false);
  const [launchVisualQaBaselineId, setLaunchVisualQaBaselineId] = useState('');
  const [launchVisualQaCheckedAt, setLaunchVisualQaCheckedAt] = useState('');
  const [showErrorPreflightChecks, setShowErrorPreflightChecks] = useState(
    () => readStoredPreflightFilters().showErrors
  );
  const [showWarningPreflightChecks, setShowWarningPreflightChecks] = useState(
    () => readStoredPreflightFilters().showWarnings
  );
  const [showPassedPreflightChecks, setShowPassedPreflightChecks] = useState(
    () => readStoredPreflightFilters().showPassed
  );
  const [preLaunchChecked, setPreLaunchChecked] = useState({
    hypothesis: false,
    goal: false,
    audience: false,
    tracking: false,
    staging: false,
  });

  const queryClient = useQueryClient();
  const invalidateTests = useInvalidateTests();
  const createdTest = location.state?.createdTest;
  const listTest = location.state?.listTest;
  const placeholderTest =
    createdTest?.id === id ? createdTest : listTest?.id === id ? listTest : undefined;
  const {
    data: test,
    isLoading: loading,
    isError,
    error,
  } = useTest(id, {
    placeholderData: placeholderTest,
  });

  // When navigating from create, list, or clone, pre-populate cache so we show correct variants immediately
  useEffect(() => {
    const shop = getShopDomain();
    const toCache = createdTest?.id === id ? createdTest : listTest?.id === id ? listTest : null;
    if (!toCache?.id) return;
    // Always set for created/cloned; for list set when we have variants (full data from GET /tests)
    const isFromCreateOrClone = toCache === createdTest;
    const isFromListWithVariants =
      toCache === listTest && Array.isArray(toCache.variants) && toCache.variants.length > 0;
    if (isFromCreateOrClone || isFromListWithVariants) {
      queryClient.setQueryData(testDetailQueryKey(shop, id), toCache);
    }
  }, [id, createdTest, listTest, queryClient]);

  useEffect(() => {
    if (!test?.id) return;
    const shop = getShopDomain();
    queryClient.setQueryData(testsListQueryKey(shop), old => {
      if (!Array.isArray(old)) return old;
      const idx = old.findIndex(t => t.id === test.id);
      if (idx < 0) return old;
      const next = [...old];
      next[idx] = test;
      return next;
    });
  }, [test, queryClient]);
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        PREFLIGHT_FILTERS_STORAGE_KEY,
        JSON.stringify({
          showErrors: showErrorPreflightChecks,
          showWarnings: showWarningPreflightChecks,
          showPassed: showPassedPreflightChecks,
        })
      );
    } catch {
      // Ignore storage errors in private mode or restricted contexts.
    }
  }, [showErrorPreflightChecks, showWarningPreflightChecks, showPassedPreflightChecks]);
  const startMutation = useStartTest();
  const stopMutation = useStopTest();
  const deleteMutation = useDeleteTest();
  const personalizeMutation = usePersonalizeTest();
  const rolloutMutation = useRolloutTest();
  const disablePersonalizationMutation = useDisablePersonalization();

  const handleTitleRender = useCallback(el => setPageTitle(el), []);
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

  const isStopped = test?.status === 'stopped' || test?.status === 'completed';
  const isPersonalized = test?.personalization_mode === 'personalized';
  const isRollout = test?.personalization_mode === 'rollout';
  const hasPersonalization = isPersonalized || isRollout;

  const summarizePreflight = useCallback(preflight => {
    if (!preflight || typeof preflight !== 'object') {
      return { errors: 0, warnings: 0, checks: 0 };
    }
    const checks = Array.isArray(preflight.checks) ? preflight.checks.length : 0;
    const errors = Array.isArray(preflight.errors) ? preflight.errors.length : 0;
    const warnings = Array.isArray(preflight.warnings) ? preflight.warnings.length : 0;
    return { errors, warnings, checks };
  }, []);

  const toDateInputValue = useCallback(value => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }, []);
  const groupedPreflightChecks = useMemo(() => {
    const checks = Array.isArray(preflightResult?.checks) ? preflightResult.checks : [];
    const grouped = { errors: [], warnings: [], ok: [] };
    checks.forEach(check => {
      const severity = String(check?.severity || 'ok').toLowerCase();
      if (severity === 'error') grouped.errors.push(check);
      else if (severity === 'warning') grouped.warnings.push(check);
      else grouped.ok.push(check);
    });
    return grouped;
  }, [preflightResult]);
  const visiblePreflightCheckCount =
    (showErrorPreflightChecks ? groupedPreflightChecks.errors.length : 0) +
    (showWarningPreflightChecks ? groupedPreflightChecks.warnings.length : 0) +
    (showPassedPreflightChecks ? groupedPreflightChecks.ok.length : 0);

  const handleRunPreflight = useCallback(async () => {
    setPreflightLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiGet(`/tests/${id}/preflight`);
      const payload = unwrapData(response);
      const preflight = payload?.preflight || null;
      setPreflightResult(preflight);
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
    } catch (err) {
      setErrorMessage(err?.response?.data?.error || err?.message || 'Failed to run preflight');
    } finally {
      setPreflightLoading(false);
    }
  }, [id, summarizePreflight]);

  const handleStart = async () => {
    const requiresForceReason = forceStart && String(forceStartReason || '').trim().length < 8;
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
    setPreLaunchOpen(false);
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const payload = {};
      if (forceStart) {
        payload.force = true;
        payload.force_reason = String(forceStartReason || '').trim();
      }
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
        testId: id,
        payload,
      });
      const result = unwrapData(response);
      if (result?.preflight) {
        setPreflightResult(result.preflight);
      }
      setSuccessMessage('Test started successfully.');
      setStartCelebrationMode(withUltraMilestone(resolveCelebrationVariant('full')));
    } catch (err) {
      const preflight = err?.response?.data?.preflight;
      if (preflight) {
        setPreflightResult(preflight);
      }
      setErrorMessage(
        err?.response?.data?.error ||
          err?.response?.data?.details?.[0] ||
          err?.message ||
          'Failed to start test'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartClick = () => {
    const existingVisualQa =
      test?.goal?.visual_qa && typeof test.goal.visual_qa === 'object' ? test.goal.visual_qa : {};
    setPreflightResult(null);
    setForceStart(false);
    setForceStartReason('');
    setLaunchCanaryPercent('');
    setLaunchCanaryDays('');
    setLaunchVisualQaRequired(
      Boolean(
        existingVisualQa.required || existingVisualQa.enabled || test?.segments?.visual_qa_required
      )
    );
    setLaunchVisualQaBaselineId(
      String(existingVisualQa.baseline_id || existingVisualQa.baselineId || '').trim()
    );
    setLaunchVisualQaCheckedAt(
      toDateInputValue(existingVisualQa.checked_at || existingVisualQa.checkedAt || '')
    );
    setPreLaunchOpen(true);
    handleRunPreflight();
  };

  const handleStop = async action => {
    setActionLoading(true);
    setErrorMessage(null);
    setStopExpanded(false);
    try {
      await stopMutation.mutateAsync(id);
      if (action === 'personalize') {
        await personalizeMutation.mutateAsync({ testId: id });
        setSuccessMessage('Test stopped. Winner applied to 100% of traffic.');
      } else if (action === 'rollout') {
        setRolloutInitialPercent('25');
        setRolloutDuration(7);
        setRolloutConfigExpanded(true);
      } else {
        setSuccessMessage('Test stopped');
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to stop test'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRolloutSubmit = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    setRolloutConfigExpanded(false);
    try {
      const initialPercent = Math.min(100, Math.max(0, parseInt(rolloutInitialPercent, 10) || 25));
      const schedule = [
        { day: 0, percent: initialPercent },
        { day: rolloutDuration, percent: 100 },
      ];
      await rolloutMutation.mutateAsync({ testId: id, initialPercent, schedule });
      setSuccessMessage(
        `Rollout started at ${initialPercent}%. Will reach 100% in ${rolloutDuration} days.`
      );
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to start rollout'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handlePersonalize = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await personalizeMutation.mutateAsync({ testId: id });
      setSuccessMessage('Winner applied to 100% of traffic');
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to apply winner'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisablePersonalization = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await disablePersonalizationMutation.mutateAsync(id);
      setSuccessMessage('Personalization disabled');
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to disable'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(id);
      navigate(routes.tests);
    } catch (err) {
      setErrorMessage('Failed to delete test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyValue = useCallback(async (raw, label) => {
    const text = raw === null || raw === undefined ? '' : String(raw);
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(`${label} copied`);
      setTimeout(() => setCopyToast(null), 2200);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopyToast(`${label} copied`);
        setTimeout(() => setCopyToast(null), 2200);
      } catch {
        setCopyToast('Could not copy');
        setTimeout(() => setCopyToast(null), 2200);
      }
    }
  }, []);

  const handleClone = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiPost(`/tests/${id}/clone`, {});
      const testData = unwrapData(response)?.test ?? unwrapData(response);
      if (testData?.id) {
        queryClient.setQueryData(testDetailQueryKey(getShopDomain(), testData.id), testData);
        invalidateTests();
        navigate(routes.testDetail(testData.id), { state: { createdTest: testData } });
      }
    } catch (err) {
      setErrorMessage('Failed to clone test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadRolloutCsv = useCallback(async () => {
    setRolloutCsvLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiRequest('GET', `/tests/${id}/price-rollout-csv`, null, {
        responseType: 'text',
        headers: { Accept: 'text/csv' },
        transformResponse: [data => data],
      });
      const csv = response?.data || '';
      const disposition = response?.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName = match?.[1] || `price-rollout-${id}.csv`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setSuccessMessage('Rollout CSV downloaded');
    } catch (err) {
      setErrorMessage(
        err?.response?.data?.details?.[0] ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to download rollout CSV'
      );
    } finally {
      setRolloutCsvLoading(false);
    }
  }, [id]);

  const handleDownloadReport = useCallback(async () => {
    setReportDownloadLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiRequest('GET', `/tests/${id}/report?format=markdown`, null, {
        responseType: 'text',
        headers: { Accept: 'text/markdown' },
        transformResponse: [data => data],
      });
      const markdown = response?.data || '';
      const disposition = response?.headers?.['content-disposition'] || '';
      const match = disposition.match(/filename="([^"]+)"/i);
      const fileName = match?.[1] || `test-report-${id}.md`;
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setSuccessMessage('Report downloaded');
    } catch (err) {
      setErrorMessage(
        err?.response?.data?.details?.[0] ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to download report'
      );
    } finally {
      setReportDownloadLoading(false);
    }
  }, [id]);

  const handleSaveCode = async codePayload => {
    const response = await apiPut(`/tests/${id}/variants/codes`, codePayload);
    const updatedTest = unwrapData(response)?.test ?? unwrapData(response);
    if (updatedTest) {
      queryClient.setQueryData(testDetailQueryKey(getShopDomain(), id), updatedTest);
    }
    invalidateTests(id);
    setSuccessMessage('Code saved successfully');
    setTimeout(() => setSuccessMessage(null), 3000);
    return updatedTest;
  };

  const handleSave = async (payload, options = {}) => {
    setSaveLoading(true);
    setErrorMessage(null);
    try {
      let response;
      if (options.useCodeEndpoint && (options.codePayload || payload?.variants)) {
        const codePayload = options.codePayload || {
          variants: payload.variants.map(variant => ({
            id: variant.id,
            name: variant.name,
            code: variant?.code ?? variant?.config?.code ?? '',
          })),
        };
        response = await apiPut(`/tests/${id}/variants/codes`, codePayload);
      } else {
        response = await apiPut(`/tests/${id}`, payload);
      }
      const updatedTest = unwrapData(response)?.test ?? unwrapData(response);
      if (updatedTest) {
        queryClient.setQueryData(testDetailQueryKey(getShopDomain(), id), updatedTest);
      }
      invalidateTests(id);
      if (!options.silent) {
        setSuccessMessage('Test updated successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      const details = err.response?.data?.details;
      const apiError = err.response?.data?.error;
      if (Array.isArray(details) && details.length > 0) {
        setErrorMessage(details.join('. '));
      } else if (apiError) {
        setErrorMessage(apiError);
      } else {
        setErrorMessage(err.message || 'Failed to update test');
      }
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <PageShell className={`${styles.detailPage} wizard-page`}>
        <Page title="Test Details">
          <LoadingSkeleton type="card" count={2} />
        </Page>
      </PageShell>
    );
  }

  const displayError =
    errorMessage ||
    (isError ? error?.response?.data?.error || error?.message || 'Failed to load test' : null);

  if (displayError && !test) {
    return (
      <PageShell
        className={`${styles.detailPage} wizard-page`}
        message={displayError}
        messageType="error"
        onCloseMessage={() => setErrorMessage(null)}
      >
        <Page title="Test Details" />
      </PageShell>
    );
  }

  if (!test) {
    return (
      <PageShell
        className={`${styles.detailPage} wizard-page`}
        message="Test not found"
        messageType="error"
        onCloseMessage={() => navigate(routes.tests)}
      >
        <Page title="Test Details" />
      </PageShell>
    );
  }

  const displayTitle = pageTitle ?? test.name ?? 'Unnamed Test';
  const testTypeLabel = getTestTypeDisplay(test).label;
  const preflightSummary = summarizePreflight(preflightResult);
  const forceReasonRequired = forceStart && String(forceStartReason || '').trim().length < 8;
  const visualQaRequiredButMissing =
    launchVisualQaRequired && String(launchVisualQaBaselineId || '').trim().length < 2;
  const health = test?.health || null;
  const srmDetected = Boolean(health?.srm?.detected || test?.analytics_meta?.srm?.detected);
  const riskLevel = String(health?.riskSignals?.level || '').toLowerCase();
  const rolloutRecommendation = health?.rolloutRecommendation || null;

  return (
    <PageShell className={`${styles.detailPage} wizard-page`}>
      <PartyPop
        active={!!startCelebrationMode}
        variant={startCelebrationMode || 'full'}
        styleMode={getCelebrationStylePreference()}
        palette={getCelebrationColorThemePreference()}
        onComplete={() => setStartCelebrationMode(null)}
      />
      <Toast
        message={displayError}
        type="error"
        onClose={() => setErrorMessage(null)}
        duration={5000}
      />
      <Toast
        message={successMessage}
        type="success"
        onClose={() => setSuccessMessage(null)}
        duration={3000}
      />
      <Toast
        message={copyToast}
        type="success"
        onClose={() => setCopyToast(null)}
        duration={2200}
      />
      <Modal
        open={idsModalOpen}
        onClose={() => setIdsModalOpen(false)}
        title="Test & variant IDs"
        secondaryActions={[
          {
            content: 'Close',
            onAction: () => setIdsModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <Text variant="bodySm" tone="subdued" as="p">
              Click any value to copy it to the clipboard. Use these IDs in APIs, scripts, or
              support tickets.
            </Text>
            <div className={styles.idsModalSection}>
              <Text variant="headingSm" as="h3">
                Test ID
              </Text>
              <button
                type="button"
                className={styles.idsModalCopyValue}
                onClick={() => handleCopyValue(test?.id, 'Test ID')}
                title="Copy test ID"
              >
                {test?.id !== undefined && test?.id !== null ? String(test.id) : '—'}
              </button>
            </div>
            <div className={styles.idsModalSection}>
              <Text variant="headingSm" as="h3">
                Variants
              </Text>
              {Array.isArray(test?.variants) && test.variants.length > 0 ? (
                <BlockStack gap="300">
                  {test.variants.map((v, index) => {
                    const displayName =
                      (typeof v?.name === 'string'
                        ? v.name.trim()
                        : String(v?.name ?? '').trim()) || `Variant ${index + 1}`;
                    const vid = v?.id !== undefined && v?.id !== null ? String(v.id) : '';
                    return (
                      <div key={`${vid}-${index}`} className={styles.idsModalVariantCard}>
                        <Text variant="bodySm" fontWeight="semibold" as="p">
                          {displayName}
                        </Text>
                        <div className={styles.idsModalVariantRows}>
                          <div className={styles.idsModalLabelRow}>
                            <span className={styles.idsModalFieldLabel}>Name</span>
                            <button
                              type="button"
                              className={styles.idsModalCopyValue}
                              onClick={() => handleCopyValue(displayName, 'Variant name')}
                              title="Copy variant name"
                            >
                              {displayName}
                            </button>
                          </div>
                          <div className={styles.idsModalLabelRow}>
                            <span className={styles.idsModalFieldLabel}>Variant ID</span>
                            <button
                              type="button"
                              className={styles.idsModalCopyValue}
                              onClick={() => handleCopyValue(vid || displayName, 'Variant ID')}
                              title="Copy variant ID"
                            >
                              {vid || '—'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </BlockStack>
              ) : (
                <Text variant="bodySm" tone="subdued" as="p">
                  No variants on this test yet.
                </Text>
              )}
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>
      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Delete test?"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: () => {
            setDeleteModal(false);
            handleDelete();
          },
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setDeleteModal(false),
          },
        ]}
      >
        <Modal.Section>
          <Text variant="bodyMd" as="p">
            This will permanently delete the test and its configuration.
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={preLaunchOpen}
        onClose={() => setPreLaunchOpen(false)}
        title="Launch safety check"
        primaryAction={{
          content: forceStart ? 'Force start test' : 'Start test',
          onAction: handleStart,
          loading: actionLoading,
          destructive: forceStart,
          disabled: forceReasonRequired || visualQaRequiredButMissing,
        }}
        secondaryActions={[
          {
            content: 'Run preflight',
            onAction: handleRunPreflight,
            loading: preflightLoading,
          },
          {
            content: 'Cancel',
            onAction: () => setPreLaunchOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text variant="bodyMd" as="p" tone="subdued">
              Run preflight before launch. You can optionally apply canary ramp overrides at start
              time.
            </Text>
            {preflightResult && (
              <Banner
                tone={
                  preflightSummary.errors > 0
                    ? 'critical'
                    : preflightSummary.warnings > 0
                      ? 'warning'
                      : 'success'
                }
                title={
                  preflightSummary.errors > 0
                    ? `Preflight blocked (${preflightSummary.errors} error${preflightSummary.errors > 1 ? 's' : ''})`
                    : preflightSummary.warnings > 0
                      ? `Preflight passed with ${preflightSummary.warnings} warning${preflightSummary.warnings > 1 ? 's' : ''}`
                      : 'Preflight passed'
                }
              >
                <Text as="p" variant="bodySm">
                  {preflightSummary.checks} checks evaluated.
                </Text>
              </Banner>
            )}
            {preflightResult &&
              Array.isArray(preflightResult.checks) &&
              preflightResult.checks.length > 0 && (
                <div
                  style={{
                    maxHeight: 180,
                    overflowY: 'auto',
                    border: '1px solid var(--p-color-border-subdued)',
                    borderRadius: 8,
                    padding: 10,
                  }}
                >
                  <BlockStack gap="200">
                    <BlockStack gap="100">
                      <Checkbox
                        label={`Show blocking errors (${groupedPreflightChecks.errors.length})`}
                        checked={showErrorPreflightChecks}
                        onChange={setShowErrorPreflightChecks}
                      />
                      <Checkbox
                        label={`Show warnings (${groupedPreflightChecks.warnings.length})`}
                        checked={showWarningPreflightChecks}
                        onChange={setShowWarningPreflightChecks}
                      />
                      <Checkbox
                        label={`Show passed checks (${groupedPreflightChecks.ok.length})`}
                        checked={showPassedPreflightChecks}
                        onChange={setShowPassedPreflightChecks}
                      />
                    </BlockStack>
                    {showErrorPreflightChecks && groupedPreflightChecks.errors.length > 0 && (
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="critical">
                          Blocking errors ({groupedPreflightChecks.errors.length})
                        </Text>
                        {groupedPreflightChecks.errors.map(check => (
                          <Text key={check.id || check.message} as="p" variant="bodySm">
                            <strong>Error:</strong> {check.message}
                          </Text>
                        ))}
                      </BlockStack>
                    )}
                    {showWarningPreflightChecks && groupedPreflightChecks.warnings.length > 0 && (
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm" fontWeight="semibold" tone="warning">
                          Warnings ({groupedPreflightChecks.warnings.length})
                        </Text>
                        {groupedPreflightChecks.warnings.map(check => (
                          <Text key={check.id || check.message} as="p" variant="bodySm">
                            <strong>Warn:</strong> {check.message}
                          </Text>
                        ))}
                      </BlockStack>
                    )}
                    {showPassedPreflightChecks && groupedPreflightChecks.ok.length > 0 && (
                      <BlockStack gap="100">
                        {groupedPreflightChecks.ok.map(check => (
                          <Text key={check.id || check.message} as="p" variant="bodySm">
                            <strong>OK:</strong> {check.message}
                          </Text>
                        ))}
                      </BlockStack>
                    )}
                    {visiblePreflightCheckCount === 0 && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        No checks match the current filters.
                      </Text>
                    )}
                  </BlockStack>
                </div>
              )}
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
                helpText="If set, overrides this launch with a start ramp percent."
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
                helpText="Used with canary percent to ramp to 100% over N days."
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
                checked={forceStart}
                onChange={setForceStart}
                helpText="Use only for emergency/controlled launches."
              />
              {forceStart && (
                <TextField
                  label="Force-start reason (required)"
                  value={forceStartReason}
                  onChange={setForceStartReason}
                  placeholder="Why is a forced launch needed?"
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
            <BlockStack gap="200">
              <Checkbox
                label="Hypothesis or goal is documented"
                checked={preLaunchChecked.hypothesis}
                onChange={v => setPreLaunchChecked(c => ({ ...c, hypothesis: v }))}
              />
              <Checkbox
                label="Primary goal and metrics are set"
                checked={preLaunchChecked.goal}
                onChange={v => setPreLaunchChecked(c => ({ ...c, goal: v }))}
              />
              <Checkbox
                label="Audience or targeting is configured"
                checked={preLaunchChecked.audience}
                onChange={v => setPreLaunchChecked(c => ({ ...c, audience: v }))}
              />
              <Checkbox
                label="Tracking and conversion events are verified"
                checked={preLaunchChecked.tracking}
                onChange={v => setPreLaunchChecked(c => ({ ...c, tracking: v }))}
              />
              <Checkbox
                label="Staging or QA run completed (e.g. force variation)"
                checked={preLaunchChecked.staging}
                onChange={v => setPreLaunchChecked(c => ({ ...c, staging: v }))}
              />
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Page title="" subtitle="">
        <div className={styles.detailLayout}>
          <div className={styles.detailHero}>
            <div className={styles.detailHeroInner}>
              <div className={styles.detailHeroContent}>
                <div className={styles.detailBreadcrumb}>
                  <button
                    type="button"
                    className={styles.detailBreadcrumbLink}
                    onClick={() => navigate(routes.tests)}
                  >
                    ← All Tests
                  </button>
                </div>
                <h1 className={styles.detailHeroTitle}>{displayTitle}</h1>
                <div className={styles.detailHeroPillsRow}>
                  <span
                    className={`${styles.detailStatusPill} ${
                      test.status === 'running'
                        ? styles.detailStatusRunning
                        : test.status === 'draft'
                          ? styles.detailStatusDraft
                          : styles.detailStatusStopped
                    }`}
                  >
                    {test.status === 'running'
                      ? 'Running'
                      : test.status === 'draft'
                        ? 'Draft'
                        : 'Stopped'}
                  </span>
                  <span className={styles.detailHeroMetaChip}>{testTypeLabel}</span>
                  {test.variants?.length > 0 && (
                    <span className={styles.detailHeroMetaChip}>
                      {getVariantCount(test)} variants
                    </span>
                  )}
                </div>
                {(srmDetected || riskLevel === 'high' || rolloutRecommendation?.action) && (
                  <div style={{ marginTop: 12, maxWidth: 760 }}>
                    {srmDetected && (
                      <Banner tone="critical" title="Sample ratio mismatch detected">
                        <Text as="p" variant="bodySm">
                          Traffic split deviates from expected allocation. Verify instrumentation
                          and bot filtering before rollout actions.
                        </Text>
                      </Banner>
                    )}
                    {!srmDetected && riskLevel === 'high' && (
                      <Banner tone="warning" title="High rollout risk">
                        <Text as="p" variant="bodySm">
                          {rolloutRecommendation?.message ||
                            'Current quality signals suggest delaying rollout decisions.'}
                        </Text>
                      </Banner>
                    )}
                    {!srmDetected && rolloutRecommendation?.action === 'canary_rollout' && (
                      <Banner tone="success" title="Controlled rollout recommended">
                        <Text as="p" variant="bodySm">
                          {rolloutRecommendation?.message}
                        </Text>
                      </Banner>
                    )}
                  </div>
                )}
              </div>
              {!stopExpanded && !rolloutConfigExpanded && (
                <div className={styles.detailHeroActions}>
                  <div className={styles.detailHeroActionsStrip}>
                    <div
                      className={styles.detailHeroActionsRow1}
                      role="group"
                      aria-label="Test control"
                    >
                      <span className={styles.detailHeroRowLabel}>Control</span>
                      {test.status === 'running' ? (
                        <button
                          type="button"
                          className={`${styles.detailPrimaryBtn} ${styles.detailPrimaryBtnStop}`}
                          onClick={() => setStopExpanded(true)}
                          disabled={actionLoading}
                        >
                          <Icon source={StopCircleIcon} />
                          Stop Test
                        </button>
                      ) : test.status !== 'running' ? (
                        <button
                          type="button"
                          className={`${styles.detailPrimaryBtn} ${styles.detailPrimaryBtnStart}`}
                          onClick={handleStartClick}
                          disabled={actionLoading}
                        >
                          <Icon source={PlayIcon} />
                          Start Test
                        </button>
                      ) : null}
                      {hasPersonalization && !rolloutConfigExpanded && (
                        <>
                          <div className={styles.detailPersonalizationBadge}>
                            {isPersonalized ? (
                              <span className={styles.badgePersonalized}>
                                <Icon source={TargetIcon} /> Winner at 100%
                              </span>
                            ) : (
                              <span className={styles.badgeRollout}>
                                <Icon source={ChartVerticalFilledIcon} /> Rollout{' '}
                                {test?.effective_rollout_percent ?? test?.rollout_percent ?? 0}%
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className={styles.detailSecondaryBtn}
                            onClick={handleDisablePersonalization}
                            disabled={actionLoading}
                          >
                            <Icon source={XCircleIcon} />
                            Disable
                          </button>
                        </>
                      )}
                      {isStopped && !hasPersonalization && !rolloutConfigExpanded && (
                        <>
                          <button
                            type="button"
                            className={`${styles.detailSecondaryBtn} ${styles.detailSecondaryBtnPrimary}`}
                            onClick={handlePersonalize}
                            disabled={actionLoading}
                          >
                            <Icon source={TargetIcon} />
                            Personalize
                          </button>
                          <button
                            type="button"
                            className={styles.detailSecondaryBtn}
                            onClick={() => {
                              setRolloutInitialPercent('25');
                              setRolloutDuration(7);
                              setRolloutConfigExpanded(true);
                            }}
                            disabled={actionLoading}
                          >
                            <Icon source={ChartVerticalFilledIcon} />
                            Rollout
                          </button>
                        </>
                      )}
                    </div>
                    <div
                      className={styles.detailHeroActionsRow2}
                      role="group"
                      aria-label="Quick actions"
                    >
                      <span className={styles.detailHeroRowLabel}>Actions</span>
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={() => navigate(routes.testAnalytics(id))}
                      >
                        <Icon source={ChartLineIcon} />
                        View Analytics
                      </button>
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={() => navigate(routes.testExport(id))}
                      >
                        <Icon source={ExportIcon} />
                        Export
                      </button>
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={handleDownloadReport}
                        disabled={reportDownloadLoading}
                        title="Download concise test report (Markdown)"
                      >
                        <Icon source={ExportIcon} />
                        {reportDownloadLoading ? 'Preparing report…' : 'Report (MD)'}
                      </button>
                      {(String(test?.type || '').toLowerCase() === 'price' ||
                        String(test?.type || '').toLowerCase() === 'pricing') &&
                        isStopped && (
                          <button
                            type="button"
                            className={styles.detailSecondaryBtn}
                            onClick={handleDownloadRolloutCsv}
                            disabled={rolloutCsvLoading}
                            title="Download winner price mapping CSV"
                          >
                            <Icon source={ExportIcon} />
                            {rolloutCsvLoading ? 'Preparing CSV…' : 'Rollout CSV'}
                          </button>
                        )}
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={() => setIdsModalOpen(true)}
                        title="View test ID and variant IDs; click a value to copy"
                      >
                        <Icon source={ClipboardIcon} />
                        Test &amp; variant IDs
                      </button>
                      {test.type === 'offer' && (
                        <button
                          type="button"
                          className={styles.detailSecondaryBtn}
                          onClick={() => navigate(routes.testPromoLinks(id))}
                        >
                          <Icon source={LinkIcon} />
                          Promo Links
                        </button>
                      )}
                      <span className={styles.detailHeroRowDivider} aria-hidden />
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={handleClone}
                        disabled={actionLoading}
                      >
                        <Icon source={DuplicateIcon} />
                        Clone
                      </button>
                      <button
                        type="button"
                        className={`${styles.detailSecondaryBtn} ${styles.detailSecondaryBtnDestructive}`}
                        onClick={() => setDeleteModal(true)}
                        disabled={actionLoading}
                      >
                        <Icon source={DeleteIcon} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {stopExpanded && (
                <div className={styles.stopInline}>
                  <div className={styles.stopInlineHeader}>
                    <span className={styles.stopInlineTitle}>What happens next?</span>
                    <button
                      type="button"
                      className={styles.stopInlineCancel}
                      onClick={() => setStopExpanded(false)}
                      aria-label="Cancel"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.stopInlineCards}>
                    <button
                      type="button"
                      className={`${styles.stopInlineCard} ${styles.stopInlineCardPersonalize}`}
                      onClick={() => handleStop('personalize')}
                      disabled={actionLoading}
                    >
                      <Icon source={TargetIcon} />
                      <span className={styles.stopInlineCardLabel}>Apply winner</span>
                      <span className={styles.stopInlineCardBadge}>Recommended</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.stopInlineCard} ${styles.stopInlineCardRollout}`}
                      onClick={() => handleStop('rollout')}
                      disabled={actionLoading}
                    >
                      <Icon source={ChartVerticalFilledIcon} />
                      <span className={styles.stopInlineCardLabel}>Gradual rollout</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.stopInlineCard} ${styles.stopInlineCardStop}`}
                      onClick={() => handleStop()}
                      disabled={actionLoading}
                    >
                      <Icon source={StopCircleIcon} />
                      <span className={styles.stopInlineCardLabel}>Just stop</span>
                    </button>
                  </div>
                </div>
              )}
              {rolloutConfigExpanded && (
                <div className={styles.rolloutInline}>
                  <div className={styles.rolloutInlineHeader}>
                    <span className={styles.rolloutInlineTitle}>Configure rollout</span>
                    <button
                      type="button"
                      className={styles.rolloutInlineCancel}
                      onClick={() => setRolloutConfigExpanded(false)}
                      aria-label="Cancel"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.rolloutInlineBody}>
                    <div className={styles.rolloutInlineRow}>
                      <span className={styles.rolloutInlineLabel}>Start at</span>
                      <div className={styles.rolloutInlinePresets}>
                        {[10, 25, 50, 75, 100].map(p => (
                          <button
                            key={p}
                            type="button"
                            className={`${styles.rolloutInlinePreset} ${Number(rolloutInitialPercent) === p ? styles.rolloutInlinePresetActive : ''}`}
                            onClick={() => setRolloutInitialPercent(String(p))}
                          >
                            {p}%
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        className={styles.rolloutInlineSlider}
                        min="5"
                        max="100"
                        step="5"
                        value={rolloutInitialPercent}
                        onChange={e => setRolloutInitialPercent(e.target.value)}
                      />
                      <span className={styles.rolloutInlineValue}>{rolloutInitialPercent}%</span>
                    </div>
                    <div className={styles.rolloutInlineRow}>
                      <span className={styles.rolloutInlineLabel}>Duration</span>
                      {[
                        { days: 3, label: '3d' },
                        { days: 7, label: '7d' },
                        { days: 14, label: '14d' },
                      ].map(({ days, label }) => (
                        <button
                          key={days}
                          type="button"
                          className={`${styles.rolloutInlineDuration} ${rolloutDuration === days ? styles.rolloutInlineDurationActive : ''}`}
                          onClick={() => setRolloutDuration(days)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className={styles.rolloutInlinePreview}>
                      <span>
                        {rolloutInitialPercent}% → 100% in {rolloutDuration} days
                      </span>
                      <div className={styles.rolloutInlineChart}>
                        <div
                          className={styles.rolloutInlineBar}
                          style={{
                            width: `${rolloutInitialPercent}%`,
                            background:
                              'linear-gradient(90deg, var(--futuristic-cyan), var(--futuristic-violet))',
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.rolloutInlineActions}>
                      <button
                        type="button"
                        className={styles.rolloutInlineBtnCancel}
                        onClick={() => setRolloutConfigExpanded(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.rolloutInlineBtnSubmit}
                        onClick={handleRolloutSubmit}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <span className={styles.rolloutSubmitSpinner} />
                        ) : (
                          'Start rollout'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Layout>
            <Layout.Section>
              <TestWizard
                key={`test-wizard-${test?.id}-${getVariantCount(test)}`}
                mode="edit"
                showTemplateStep={false}
                initialData={test}
                submitLabel="Save Changes"
                onSubmit={handleSave}
                onSaveCode={handleSaveCode}
                onCancel={() => navigate(routes.tests)}
                submitLoading={saveLoading}
                onTitleRender={handleTitleRender}
              />
            </Layout.Section>
          </Layout>
        </div>
      </Page>
    </PageShell>
  );
}

export default TestDetail;
