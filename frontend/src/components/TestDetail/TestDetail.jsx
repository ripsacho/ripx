/**
 * Test Detail (shared wizard edit view)
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
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
  ChevronDownIcon,
  ClipboardIcon,
  DeleteIcon,
  DuplicateIcon,
  ExportIcon,
  LinkIcon,
  MenuHorizontalIcon,
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
import { BlockingOverlay, PageShell } from '../Shared';
import {
  useTest,
  useStartTest,
  useStopTest,
  useDeleteTest,
  useInvalidateTests,
  usePersonalizeTest,
  useRolloutTest,
  usePublishWinnerPricesToShopify,
  useDisablePersonalization,
  useAppRoutes,
  testsListQueryKey,
  testDetailQueryKey,
} from '../../hooks';
import { useQueryClient } from '@tanstack/react-query';
import { getTestTypeDisplay, getVariantCount } from '../../utils/testType';
import { formatPreflightCheckMessage } from '../../utils/preflightHints';
import {
  buildLaunchPreflightView,
  launchPreflightHeadline,
} from '../../utils/preflightPresentation';
import LaunchPreflightPanel from '../LaunchPreflight/LaunchPreflightPanel';
import {
  consumeFirstStartUltraCelebrationFlag,
  getCelebrationAnimationPreference,
  getCelebrationColorThemePreference,
  getCelebrationStylePreference,
} from '../../utils/preferences';
import styles from './TestDetail.module.css';

const UNSAVED_TEST_DETAIL_MESSAGE =
  'You have unsaved test changes. Leave this page and lose those changes?';

function DetailActionMenuItem({
  icon,
  label,
  description,
  onAction,
  disabled,
  destructive,
  primary,
}) {
  return (
    <button
      type="button"
      className={`${styles.detailActionMenuItem} ${primary ? styles.detailActionMenuItemPrimary : ''} ${destructive ? styles.detailActionMenuItemDanger : ''}`}
      onClick={onAction}
      disabled={disabled}
    >
      <span className={styles.detailActionMenuIcon}>
        <Icon source={icon} />
      </span>
      <span className={styles.detailActionMenuCopy}>
        <span className={styles.detailActionMenuLabel}>{label}</span>
        {description ? (
          <span className={styles.detailActionMenuDescription}>{description}</span>
        ) : null}
      </span>
    </button>
  );
}

function getStaleCarrierCallbackToastMessage(diagnosticsPayload) {
  const checks = Array.isArray(diagnosticsPayload?.diagnostics?.live_resource_checks)
    ? diagnosticsPayload.diagnostics.live_resource_checks
    : [];
  const staleCheck = checks.find(item => item?.live_resource?.callback_matches === false);
  const urls = diagnosticsPayload?.diagnostics?.urls || {};
  const expected =
    staleCheck?.live_resource?.expected_callback_url ||
    urls.carrier_callback_url ||
    'the current RipX app URL';
  const live = staleCheck?.live_resource?.callback_url || 'an older tunnel URL';
  const appUrl = urls.app_url || expected;
  return `Shipping setup needs re-apply: Shopify still has ${live}, but RipX expects ${expected}. If you restarted shopify app dev, run "npm run dev:switch-tunnel -- ${appUrl}", then click Save changes again.`;
}

function applyShippingDiagnosticsToast(payload, setShippingExecutionToast) {
  const readiness = payload?.diagnostics?.readiness || {};
  const carrierCount = Number(readiness.live_carrier_services_found || 0);
  const pendingCarrierCount = Number(readiness.pending_carrier_services || 0);
  const customizationCount = Number(readiness.live_delivery_customizations_found || 0);
  const staleCallbacks = Number(readiness.stale_carrier_callbacks || 0);
  const missingBindings = Number(readiness.missing_carrier_profile_bindings || 0);
  const rateNameWarnings = Number(readiness.rate_name_collision_warnings || 0);
  const latestCallbackSeen = Boolean(readiness.latest_carrier_callback_seen);
  const latestCallbackRatesCount = Number(readiness.latest_carrier_callback_rates_count ?? 0);
  const multiRateVariants = Number(readiness.multi_rate_variants || 0);
  const conflicts = Number(readiness.running_shipping_conflicts || 0);

  if (staleCallbacks > 0) {
    setShippingExecutionToast({
      type: 'error',
      message: getStaleCarrierCallbackToastMessage(payload),
      duration: 8000,
    });
    return;
  }
  if (pendingCarrierCount > 0 && carrierCount === 0) {
    setShippingExecutionToast({
      type: 'info',
      message:
        'No live CarrierService exists for the current shipping config yet. Click Save changes to create it, then verify checkout once more.',
      duration: 7000,
    });
    return;
  }
  if (missingBindings > 0) {
    setShippingExecutionToast({
      type: 'info',
      message:
        'CarrierService exists, but it is not attached to a Shopify delivery profile/zone yet. Pick scope from Current Shopify setup (Use as scope), then click Save changes again.',
    });
    return;
  }
  if (rateNameWarnings > 0) {
    setShippingExecutionToast({
      type: 'info',
      message:
        'Shipping setup is live, but at least one RipX rate name matches an existing Shopify rate. Rename one of them if checkout hides the price or subline.',
      duration: 7000,
    });
    return;
  }
  if (carrierCount > 0 && !latestCallbackSeen) {
    setShippingExecutionToast({
      type: 'info',
      message:
        'CarrierService is configured, but no recent Shopify checkout callback was recorded for this test.',
    });
    return;
  }
  if (multiRateVariants > 0 && latestCallbackSeen && latestCallbackRatesCount <= 1) {
    setShippingExecutionToast({
      type: 'info',
      message:
        'Multi-rate variant is configured, but latest checkout callback returned only one rate. Check per-rate priority/amount conditions and assignment targeting.',
    });
    return;
  }
  if (carrierCount === 0 && customizationCount === 0) {
    setShippingExecutionToast({
      type: 'info',
      message: 'No live Shopify shipping resources found yet. Save changes to run shipping sync.',
    });
    return;
  }
  if (conflicts > 0) {
    setShippingExecutionToast({
      type: 'info',
      message: `Shipping setup found, but ${conflicts} other running shipping test${conflicts === 1 ? '' : 's'} may conflict.`,
    });
    return;
  }
  setShippingExecutionToast({
    type: 'success',
    message: `Shipping setup checked: ${carrierCount} carrier service${carrierCount === 1 ? '' : 's'} and ${customizationCount} delivery customization${customizationCount === 1 ? '' : 's'} found.`,
  });
}

function stringifyApiDetail(detail) {
  if (detail === null || detail === undefined || detail === '') {
    return '';
  }
  if (typeof detail === 'string') {
    return detail;
  }
  if (typeof detail === 'number' || typeof detail === 'boolean') {
    return String(detail);
  }
  if (Array.isArray(detail)) {
    return detail.map(stringifyApiDetail).filter(Boolean).join('. ');
  }
  if (typeof detail === 'object') {
    const parts = [
      detail.message,
      detail.error,
      detail.status,
      detail.code,
      detail.field
        ? `Field: ${Array.isArray(detail.field) ? detail.field.join('.') : detail.field}`
        : '',
    ]
      .map(stringifyApiDetail)
      .filter(Boolean);
    if (parts.length > 0) {
      return parts.join('. ');
    }
    try {
      return JSON.stringify(detail);
    } catch {
      return 'Unexpected API error detail.';
    }
  }
  return String(detail);
}

function getApiErrorMessage(error, fallback) {
  const details = error?.response?.data?.details;
  const detailMessage = stringifyApiDetail(details);
  return (
    detailMessage ||
    stringifyApiDetail(error?.response?.data?.error) ||
    stringifyApiDetail(error?.response?.data) ||
    stringifyApiDetail(error?.message) ||
    fallback
  );
}

function normalizeToastPayload(payload, fallbackType = 'info') {
  if (!payload) {
    return null;
  }
  if (typeof payload === 'string') {
    return { type: fallbackType, message: payload };
  }
  if (typeof payload !== 'object') {
    return { type: fallbackType, message: stringifyApiDetail(payload) };
  }
  const message =
    stringifyApiDetail(payload.message) ||
    stringifyApiDetail(payload.error) ||
    stringifyApiDetail(payload.detail) ||
    stringifyApiDetail(payload.details) ||
    'Unexpected notification detail.';
  return {
    ...payload,
    type: typeof payload.type === 'string' ? payload.type : fallbackType,
    message,
    ...(payload.title !== undefined ? { title: stringifyApiDetail(payload.title) } : {}),
    ...(payload.detail !== undefined ? { detail: stringifyApiDetail(payload.detail) } : {}),
  };
}

function getShippingExecutionFailureMessage(payload, fallback = 'Shipping execution failed') {
  const actions = Array.isArray(payload?.execution_result?.actions)
    ? payload.execution_result.actions
    : [];
  const failedAction = actions.find(action => {
    const status = String(action?.status || '').trim();
    return status === 'failed' || status.endsWith('_profile_binding_failed');
  });
  const detail =
    failedAction?.details?.message ||
    failedAction?.details?.user_errors ||
    failedAction?.details?.profile_binding?.message ||
    failedAction?.message ||
    null;
  const detailMessage = stringifyApiDetail(detail);
  if (detailMessage) {
    return detailMessage;
  }
  const failedCount = Number(payload?.execution_result?.summary?.failed_count || 0);
  return failedCount > 0
    ? `Shipping execution finished with ${failedCount} failure${failedCount === 1 ? '' : 's'}.`
    : fallback;
}

const SHIPPING_SAVE_PROGRESS_STEPS = [
  { id: 'check', label: 'Check shipping setup plan' },
  { id: 'preview', label: 'Preview shipping setup changes' },
  { id: 'apply', label: 'Apply shipping setup to Shopify' },
];

function buildShippingSaveProgress(activeStepId, failedStepId = '') {
  const activeIndex = SHIPPING_SAVE_PROGRESS_STEPS.findIndex(step => step.id === activeStepId);
  const failedIndex = SHIPPING_SAVE_PROGRESS_STEPS.findIndex(step => step.id === failedStepId);
  return SHIPPING_SAVE_PROGRESS_STEPS.map((step, index) => {
    if (failedIndex >= 0) {
      if (index < failedIndex) return { label: step.label, state: 'complete' };
      if (index === failedIndex) return { label: step.label, state: 'error' };
      return { label: step.label, state: 'pending' };
    }
    if (activeIndex < 0) {
      return { label: step.label, state: 'pending' };
    }
    if (index < activeIndex) return { label: step.label, state: 'complete' };
    if (index === activeIndex) return { label: step.label, state: 'active' };
    return { label: step.label, state: 'pending' };
  });
}

function buildShippingSaveProgressComplete() {
  return SHIPPING_SAVE_PROGRESS_STEPS.map(step => ({ label: step.label, state: 'complete' }));
}

function isRequestTimeoutError(error) {
  const message = String(error?.message || error?.response?.data?.error || '')
    .trim()
    .toLowerCase();
  const code = String(error?.code || '')
    .trim()
    .toLowerCase();
  return (
    code === 'econnaborted' || message.includes('timeout') || message.includes('request timeout')
  );
}

function DetailActionMenuSection({ title, children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className={styles.detailActionMenuSection}>
      <span className={styles.detailActionMenuSectionTitle}>{title}</span>
      <div className={styles.detailActionMenuItems}>{items}</div>
    </div>
  );
}

function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routes = useAppRoutes();
  const [actionLoading, setActionLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [startCelebrationMode, setStartCelebrationMode] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [stopExpanded, setStopExpanded] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [rolloutConfigExpanded, setRolloutConfigExpanded] = useState(false);
  const [rolloutInitialPercent, setRolloutInitialPercent] = useState('25');
  const [rolloutDuration, setRolloutDuration] = useState(7);
  const [pageTitle, setPageTitle] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [idsModalOpen, setIdsModalOpen] = useState(false);
  const [copyToast, setCopyToast] = useState(null);
  const [rolloutCsvLoading, setRolloutCsvLoading] = useState(false);
  const [reportDownloadLoading, setReportDownloadLoading] = useState(false);
  const [, setShippingExecutionReport] = useState(null);
  const [shippingExecutionToast, setRawShippingExecutionToast] = useState(null);
  const setShippingExecutionToast = useCallback(nextToast => {
    setRawShippingExecutionToast(currentToast => {
      const resolvedToast = typeof nextToast === 'function' ? nextToast(currentToast) : nextToast;
      return normalizeToastPayload(resolvedToast);
    });
  }, []);
  const [shippingDiagnosticsBlockingVisible, setShippingDiagnosticsBlockingVisible] =
    useState(false);
  const [shippingBlockingOverlayState, setShippingBlockingOverlayState] = useState({
    title: '',
    message: '',
    accessibilityLabel: '',
    steps: [],
  });
  const [detailInsightPanels, setDetailInsightPanels] = useState({
    readiness: true,
  });
  const [checkoutReadinessLoading, setCheckoutReadinessLoading] = useState(false);
  const [checkoutReadinessReport, setCheckoutReadinessReport] = useState(null);
  const [checkoutCustomizationLoading, setCheckoutCustomizationLoading] = useState(false);
  const [preLaunchOpen, setPreLaunchOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishConfirmMode, setPublishConfirmMode] = useState('publish_only');
  const [publishPreviewLoading, setPublishPreviewLoading] = useState(false);
  const [publishPreview, setPublishPreview] = useState(null);
  const [publishPreviewError, setPublishPreviewError] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState(null);
  const [forceStart, setForceStart] = useState(false);
  const [forceStartReason, setForceStartReason] = useState('');
  const [launchCanaryPercent, setLaunchCanaryPercent] = useState('');
  const [launchCanaryDays, setLaunchCanaryDays] = useState('');
  const [launchVisualQaRequired, setLaunchVisualQaRequired] = useState(false);
  const [launchVisualQaBaselineId, setLaunchVisualQaBaselineId] = useState('');
  const [launchVisualQaCheckedAt, setLaunchVisualQaCheckedAt] = useState('');
  const [preLaunchChecked, setPreLaunchChecked] = useState({
    hypothesis: false,
    goal: false,
    audience: false,
    tracking: false,
    staging: false,
  });
  const actionsMenuRef = useRef(null);

  const updateShippingBlockingOverlay = useCallback(next => {
    setShippingBlockingOverlayState(current => {
      const patch = typeof next === 'function' ? next(current) : next;
      return {
        title: '',
        message: '',
        accessibilityLabel: '',
        steps: [],
        ...(current || {}),
        ...(patch || {}),
      };
    });
  }, []);

  const queryClient = useQueryClient();
  const invalidateTests = useInvalidateTests();
  const confirmDiscardUnsavedChanges = useCallback(() => {
    if (!hasUnsavedChanges) {
      return true;
    }
    if (!window.confirm(UNSAVED_TEST_DETAIL_MESSAGE)) {
      return false;
    }
    setHasUnsavedChanges(false);
    return true;
  }, [hasUnsavedChanges]);
  const guardedNavigate = useCallback(
    (...args) => {
      if (!confirmDiscardUnsavedChanges()) {
        return;
      }
      navigate(...args);
    },
    [confirmDiscardUnsavedChanges, navigate]
  );
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = event => {
      event.preventDefault();
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleDocumentClick = event => {
      const anchor = event.target?.closest?.('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') || '';
      if (!href || href.startsWith('#')) return;
      const nextUrl = new URL(href, window.location.href);
      if (nextUrl.href === window.location.href) return;
      if (window.confirm(UNSAVED_TEST_DETAIL_MESSAGE)) {
        setHasUnsavedChanges(false);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener('click', handleDocumentClick, true);
    return () => document.removeEventListener('click', handleDocumentClick, true);
  }, [hasUnsavedChanges]);
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    window.history.pushState(
      { ...(window.history.state || {}), ripxTestDetailGuard: true },
      '',
      window.location.href
    );
    const handlePopState = () => {
      if (!window.confirm(UNSAVED_TEST_DETAIL_MESSAGE)) {
        window.history.pushState(
          { ...(window.history.state || {}), ripxTestDetailGuard: true },
          '',
          window.location.href
        );
        return;
      }
      setHasUnsavedChanges(false);
      window.removeEventListener('popstate', handlePopState);
      window.history.back();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasUnsavedChanges]);
  const createdTest = location.state?.createdTest;
  const listTest = location.state?.listTest;
  const placeholderTest =
    createdTest?.id === id ? createdTest : listTest?.id === id ? listTest : undefined;
  const {
    data: test,
    isLoading: loading,
    isError,
    error,
    refetch: refetchTest,
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
    if (typeof window === 'undefined' || !id) return undefined;
    let cancelled = false;
    const refreshDetail = () => {
      if (cancelled) return;
      queryClient.invalidateQueries({ queryKey: testDetailQueryKey(getShopDomain(), id) });
      refetchTest?.();
    };
    window.addEventListener('pageshow', refreshDetail);
    document.addEventListener('visibilitychange', refreshDetail);
    return () => {
      cancelled = true;
      window.removeEventListener('pageshow', refreshDetail);
      document.removeEventListener('visibilitychange', refreshDetail);
    };
  }, [id, queryClient, refetchTest]);

  useEffect(() => {
    if (!actionsMenuOpen) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        setActionsMenuOpen(false);
      }
    };
    const handlePointerDown = event => {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(event.target)) {
        setActionsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [actionsMenuOpen]);

  const startMutation = useStartTest();
  const stopMutation = useStopTest();
  const deleteMutation = useDeleteTest();
  const personalizeMutation = usePersonalizeTest();
  const rolloutMutation = useRolloutTest();
  const publishWinnerPricesMutation = usePublishWinnerPricesToShopify();
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
  const isDraft = test?.status === 'draft';
  const isPersonalized = test?.personalization_mode === 'personalized';
  const isRollout = test?.personalization_mode === 'rollout';
  const hasPersonalization = isPersonalized || isRollout;
  const isPriceLikeTest =
    String(test?.type || '').toLowerCase() === 'price' ||
    String(test?.type || '').toLowerCase() === 'pricing';
  const isOfferTest = String(test?.type || '').toLowerCase() === 'offer';
  const isCheckoutTest = String(test?.type || '').toLowerCase() === 'checkout';
  const normalizedTestType = String(test?.type || '')
    .trim()
    .toLowerCase();
  const isShippingTest =
    normalizedTestType === 'shipping' || normalizedTestType.includes('shipping');
  const isThemeLikeTest =
    ['theme', 'template'].includes(normalizedTestType) || normalizedTestType.includes('theme');
  const isContentLikeTest =
    ['content', 'onsite-edit', 'split-url'].includes(normalizedTestType) ||
    normalizedTestType.includes('onsite') ||
    normalizedTestType.includes('split');
  const shippingApplyScopeGate = useMemo(() => {
    if (!isShippingTest) {
      return { blocked: false, missingVariants: [] };
    }
    const variants = Array.isArray(test?.variants) ? test.variants : [];
    const missingVariants = variants
      .map((variant, index) => {
        const config = variant?.config && typeof variant.config === 'object' ? variant.config : {};
        const strategy = String(config.strategy || '')
          .trim()
          .toLowerCase();
        const isControlLike =
          index === 0 || /^control(\s|$)/i.test(String(variant?.name || '').trim());
        if (isControlLike || strategy === 'control') {
          return null;
        }
        if (!['flat_rate', 'carrier_quote'].includes(strategy)) {
          return null;
        }
        const displayMode = String(
          config.shipping_display_mode || config.shippingDisplayMode || config.display_mode || ''
        )
          .trim()
          .toLowerCase();
        const requiresProfileScope =
          displayMode === 'replace_existing_methods' || config.replace_existing_rates === true;
        if (!requiresProfileScope) {
          return null;
        }
        const scope =
          config.shipping_scope && typeof config.shipping_scope === 'object'
            ? config.shipping_scope
            : {};
        const profileId = String(scope.profile_id || config.profile_id || '').trim();
        const locationGroupId = String(scope.location_group_id || '').trim();
        const zoneId = String(scope.zone_id || '').trim();
        if (profileId && locationGroupId && zoneId) {
          return null;
        }
        return {
          index,
          name: String(variant?.name || `Variant ${index + 1}`).trim() || `Variant ${index + 1}`,
        };
      })
      .filter(Boolean);
    return {
      blocked: missingVariants.length > 0,
      missingVariants,
    };
  }, [isShippingTest, test?.variants]);
  const supportsCheckoutReadiness =
    isPriceLikeTest || isOfferTest || isCheckoutTest || isShippingTest;
  const checkoutReadinessLabel = isCheckoutTest ? 'Checkout readiness' : 'Launch readiness';
  const toDateInputValue = useCallback(value => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
  }, []);
  const handleRunPreflight = useCallback(async () => {
    setPreflightLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiGet(`/tests/${id}/preflight`);
      const payload = unwrapData(response);
      const preflight = payload?.preflight || null;
      setPreflightResult(preflight);
      const view = buildLaunchPreflightView(preflight);
      if (view.blocked) {
        setErrorMessage(launchPreflightHeadline(view));
      } else {
        setSuccessMessage(launchPreflightHeadline(view));
      }
    } catch (err) {
      setErrorMessage(err?.response?.data?.error || err?.message || 'Failed to run preflight');
    } finally {
      setPreflightLoading(false);
    }
  }, [id]);

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

  const openPublishConfirm = async mode => {
    setPublishConfirmMode(mode);
    setPublishPreview(null);
    setPublishPreviewError(null);
    setPublishConfirmOpen(true);
    setPublishPreviewLoading(true);
    try {
      const response = await publishWinnerPricesMutation.mutateAsync({
        testId: id,
        dryRun: true,
      });
      const preview = unwrapData(response)?.publish || null;
      setPublishPreview(preview);
    } catch (err) {
      setPublishPreviewError(
        err.response?.data?.details?.[0] ||
          err.response?.data?.error ||
          'Could not estimate Shopify updates'
      );
    } finally {
      setPublishPreviewLoading(false);
    }
  };

  const handleConfirmPublishToShopify = async () => {
    const stopFirst = publishConfirmMode === 'stop_and_publish';
    setActionLoading(true);
    setErrorMessage(null);
    try {
      if (stopFirst) {
        await stopMutation.mutateAsync(id);
      }
      const response = await publishWinnerPricesMutation.mutateAsync({ testId: id });
      const publish = unwrapData(response)?.publish;
      const updatedCount = Number(publish?.summary?.updated_count || 0);
      setSuccessMessage(
        updatedCount > 0
          ? `${stopFirst ? 'Test stopped. ' : ''}Winner personalized and ${updatedCount} Shopify variant price${updatedCount === 1 ? '' : 's'} updated.`
          : `${stopFirst ? 'Test stopped. ' : ''}Winner personalized. Shopify prices were already in sync.`
      );
      setPublishConfirmOpen(false);
      setPublishPreview(null);
      setPublishPreviewError(null);
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] ||
          err.response?.data?.error ||
          'Failed to personalize and publish Shopify prices'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async action => {
    if (action === 'personalize_publish_shopify') {
      setStopExpanded(false);
      await openPublishConfirm('stop_and_publish');
      return;
    }
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

  const handlePersonalizeAndPublish = async () => {
    await openPublishConfirm('publish_only');
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

  const runHeaderAction = useCallback(action => {
    setActionsMenuOpen(false);
    if (typeof action === 'function') action();
  }, []);

  const refreshTestAfterShippingExecution = useCallback(async () => {
    try {
      const response = await apiGet(`/tests/${id}`);
      const updatedTest = unwrapData(response)?.test ?? unwrapData(response);
      if (updatedTest?.id) {
        const shop = getShopDomain();
        queryClient.setQueryData(testDetailQueryKey(shop, id), updatedTest);
        queryClient.setQueryData(testsListQueryKey(shop), old =>
          Array.isArray(old)
            ? old.map(item => (item.id === updatedTest.id ? updatedTest : item))
            : old
        );
      }
      invalidateTests(id);
      return true;
    } catch {
      invalidateTests(id);
      return false;
    }
  }, [id, invalidateTests, queryClient]);

  const handleCheckoutReadiness = useCallback(async () => {
    setCheckoutReadinessLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiGet(`/tests/${id}/checkout/readiness`);
      setCheckoutReadinessReport(unwrapData(response));
    } catch (err) {
      setErrorMessage(
        err?.response?.data?.details?.[0] ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to load checkout readiness'
      );
    } finally {
      setCheckoutReadinessLoading(false);
    }
  }, [id]);

  const handleEnsureCheckoutCustomization = useCallback(
    async apply => {
      setCheckoutCustomizationLoading(true);
      setErrorMessage(null);
      try {
        const response = await apiPost(`/tests/${id}/checkout/customization/ensure`, {
          apply: Boolean(apply),
          dry_run: !apply,
        });
        const payload = unwrapData(response);
        const label = apply
          ? 'Checkout customization applied.'
          : 'Checkout customization dry run complete.';
        setSuccessMessage(payload?.message || label);
        setTimeout(() => setSuccessMessage(null), 3500);
      } catch (err) {
        setErrorMessage(
          err?.response?.data?.details?.[0] ||
            err?.response?.data?.error ||
            err?.message ||
            'Failed to ensure checkout customization'
        );
      } finally {
        setCheckoutCustomizationLoading(false);
      }
    },
    [id]
  );

  const toggleDetailInsightPanel = useCallback(key => {
    setDetailInsightPanels(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleSaveCode = async codePayload => {
    const response = await apiPut(`/tests/${id}/variants/codes`, codePayload);
    const updatedTest = unwrapData(response)?.test ?? unwrapData(response);
    if (updatedTest) {
      queryClient.setQueryData(testDetailQueryKey(getShopDomain(), id), updatedTest);
    }
    invalidateTests(id);
    setHasUnsavedChanges(false);
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
        response = await apiPut(`/tests/${id}/variants/codes`, codePayload, { timeout: 120000 });
      } else if (isDraft) {
        response = await apiPut(`/tests/${id}/draft`, payload, { timeout: 120000 });
      } else {
        response = await apiPut(`/tests/${id}`, payload, { timeout: 120000 });
      }
      const updatedTest = unwrapData(response)?.test ?? unwrapData(response);
      if (updatedTest) {
        queryClient.setQueryData(testDetailQueryKey(getShopDomain(), id), updatedTest);
      }
      invalidateTests(id);
      setHasUnsavedChanges(false);
      const shouldRunShippingSaveFlow =
        isShippingTest && !isDraft && !options.silent && !options.skipShippingSync;
      if (shouldRunShippingSaveFlow) {
        const syncStartedAt = Date.now();
        const minimumBlockingMs = 1500;
        let shippingFlowHadError = false;
        flushSync(() => {
          updateShippingBlockingOverlay({
            title: 'Saving shipping setup changes…',
            message: 'Running check, preview, and apply automatically.',
            accessibilityLabel: 'Saving shipping setup changes',
            steps: buildShippingSaveProgress('check'),
          });
          setShippingDiagnosticsBlockingVisible(true);
        });
        setShippingExecutionToast({
          type: 'info',
          message: 'Shipping changes saved. Running check, preview, and apply automatically…',
          duration: 0,
        });
        try {
          try {
            const checkResponse = await apiGet(
              `/tests/${id}/shipping/diagnostics`,
              {},
              { timeout: 120000 }
            );
            const checkPayload = unwrapData(checkResponse);
          } catch (checkError) {
            const timedOut = isRequestTimeoutError(checkError);
            const message = getApiErrorMessage(
              checkError,
              'Could not check shipping setup before sync.'
            );
            setShippingExecutionToast({
              type: timedOut ? 'info' : 'warning',
              message: timedOut
                ? 'Shipping check timed out. Continuing with preview/apply sync.'
                : `Shipping check could not complete (${message}). Continuing with preview/apply sync.`,
              duration: 7000,
            });
          }

          updateShippingBlockingOverlay({
            title: 'Previewing shipping setup…',
            message: 'Validating planned Shopify changes before apply.',
            accessibilityLabel: 'Previewing shipping setup',
            steps: buildShippingSaveProgress('preview'),
          });
          const previewResponse = await apiPost(
            `/tests/${id}/shipping/execute`,
            {
              apply: false,
              dry_run: true,
            },
            { timeout: 120000 }
          );
          const previewPayload = unwrapData(previewResponse);
          setShippingExecutionReport(previewPayload);
          const previewFailedCount = Number(
            previewPayload?.execution_result?.summary?.failed_count || 0
          );
          if (previewFailedCount > 0 || previewPayload?.has_failures) {
            shippingFlowHadError = true;
            const failureMessage = getShippingExecutionFailureMessage(
              previewPayload,
              'Shipping changes saved, but preview found issues before apply.'
            );
            updateShippingBlockingOverlay({
              title: 'Shipping setup needs attention',
              message: failureMessage,
              accessibilityLabel: 'Shipping setup needs attention',
              steps: buildShippingSaveProgress('', 'preview'),
            });
            setShippingExecutionToast({
              type: 'error',
              message: failureMessage,
              duration: 8000,
            });
            return;
          }

          if (shippingApplyScopeGate.blocked) {
            shippingFlowHadError = true;
            const missingNames = shippingApplyScopeGate.missingVariants
              .slice(0, 2)
              .map(item => item.name)
              .join(', ');
            const scopeMessage = `Shipping sync is waiting for Profile Scope + zone on ${missingNames}${
              shippingApplyScopeGate.missingVariants.length > 2 ? '…' : ''
            }. Open Shipping Variant Config, use Current Shopify setup → Use as scope, then save again.`;
            updateShippingBlockingOverlay({
              title: 'Shipping apply is blocked',
              message: scopeMessage,
              accessibilityLabel: 'Shipping apply is blocked',
              steps: buildShippingSaveProgress('', 'apply'),
            });
            setShippingExecutionToast({
              type: 'info',
              message: `Changes saved. ${scopeMessage}`,
              duration: 9000,
            });
            return;
          }

          updateShippingBlockingOverlay({
            title: 'Applying shipping setup…',
            message: 'Updating Shopify resources with this shipping revision.',
            accessibilityLabel: 'Applying shipping setup',
            steps: buildShippingSaveProgress('apply'),
          });
          const applyResponse = await apiPost(
            `/tests/${id}/shipping/execute`,
            {
              apply: true,
              dry_run: false,
            },
            { timeout: 120000 }
          );
          const applyPayload = unwrapData(applyResponse);
          setShippingExecutionReport(applyPayload);
          const applyFailedCount = Number(
            applyPayload?.execution_result?.summary?.failed_count || 0
          );
          if (applyFailedCount > 0 || applyPayload?.has_failures) {
            shippingFlowHadError = true;
            const failureMessage = getShippingExecutionFailureMessage(
              applyPayload,
              'Shipping changes saved, but Shopify sync needs attention.'
            );
            updateShippingBlockingOverlay({
              title: 'Shipping apply needs attention',
              message: failureMessage,
              accessibilityLabel: 'Shipping apply needs attention',
              steps: buildShippingSaveProgress('', 'apply'),
            });
            setShippingExecutionToast({
              type: 'error',
              message: failureMessage,
              duration: 8000,
            });
            return;
          }

          await refreshTestAfterShippingExecution();
          updateShippingBlockingOverlay({
            title: 'Shipping sync complete',
            message: 'Check, preview, and apply finished successfully.',
            accessibilityLabel: 'Shipping sync complete',
            steps: buildShippingSaveProgressComplete(),
          });
          try {
            const diagnosticsResponse = await apiGet(
              `/tests/${id}/shipping/diagnostics`,
              {},
              { timeout: 120000 }
            );
            const diagnosticsPayload = unwrapData(diagnosticsResponse);
            applyShippingDiagnosticsToast(diagnosticsPayload, setShippingExecutionToast);
          } catch {
            setShippingExecutionToast({
              type: 'success',
              message: 'Shipping changes saved and synced to Shopify.',
            });
          }
        } catch (applyError) {
          shippingFlowHadError = true;
          updateShippingBlockingOverlay({
            title: 'Shipping sync could not complete',
            message: getApiErrorMessage(
              applyError,
              'Shipping changes saved. Could not complete the automatic shipping sync.'
            ),
            accessibilityLabel: 'Shipping sync could not complete',
            steps: buildShippingSaveProgress('', 'apply'),
          });
          setShippingExecutionToast({
            type: 'info',
            message: getApiErrorMessage(
              applyError,
              'Shipping changes saved. Automatic shipping sync failed, so check shipping diagnostics.'
            ),
            duration: 8000,
          });
        } finally {
          const elapsedMs = Date.now() - syncStartedAt;
          const waitMs = Math.max(0, minimumBlockingMs - elapsedMs);
          if (waitMs > 0) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
          if (shippingFlowHadError) {
            await new Promise(resolve => setTimeout(resolve, 850));
          } else {
            await new Promise(resolve => setTimeout(resolve, 450));
          }
          setShippingDiagnosticsBlockingVisible(false);
          updateShippingBlockingOverlay({
            title: '',
            message: '',
            accessibilityLabel: '',
            steps: [],
          });
        }
      }
      if (!options.silent) {
        setSuccessMessage(isDraft ? 'Draft saved successfully' : 'Test updated successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to update test'));
      throw err;
    } finally {
      setSaveLoading(false);
    }
  };

  const shippingBlockingOverlay = (
    <BlockingOverlay
      open={shippingDiagnosticsBlockingVisible}
      title={shippingBlockingOverlayState.title || 'Updating shipping setup…'}
      message={
        shippingBlockingOverlayState.message || 'Please wait while shipping setup is processed.'
      }
      accessibilityLabel={
        shippingBlockingOverlayState.accessibilityLabel || 'Updating shipping setup'
      }
      steps={shippingBlockingOverlayState.steps}
    />
  );

  if (loading) {
    return (
      <>
        {shippingBlockingOverlay}
        <PageShell className={`${styles.detailPage} wizard-page`}>
          <Page title="Test Details">
            <LoadingSkeleton type="card" count={2} />
          </Page>
        </PageShell>
      </>
    );
  }

  const displayError =
    stringifyApiDetail(errorMessage) ||
    (isError ? getApiErrorMessage(error, 'Failed to load test') : null);

  if (displayError && !test) {
    return (
      <>
        {shippingBlockingOverlay}
        <PageShell
          className={`${styles.detailPage} wizard-page`}
          message={displayError}
          messageType="error"
          onCloseMessage={() => setErrorMessage(null)}
        >
          <Page
            title="Test Details"
            backAction={{ content: 'Tests', onAction: () => guardedNavigate(routes.tests) }}
          >
            <Layout>
              <Layout.Section>
                <Banner
                  tone="critical"
                  title="Could not load this test"
                  action={{ content: 'Retry', onAction: () => refetchTest?.() }}
                  secondaryAction={{
                    content: 'Back to tests',
                    onAction: () => guardedNavigate(routes.tests),
                  }}
                >
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      {displayError}
                    </Text>
                    {id ? (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Test ID: {id}
                      </Text>
                    ) : null}
                  </BlockStack>
                </Banner>
              </Layout.Section>
            </Layout>
          </Page>
        </PageShell>
      </>
    );
  }

  if (!test) {
    return (
      <>
        {shippingBlockingOverlay}
        <PageShell
          className={`${styles.detailPage} wizard-page`}
          message="Test not found"
          messageType="error"
          onCloseMessage={() => guardedNavigate(routes.tests)}
        >
          <Page title="Test Details" />
        </PageShell>
      </>
    );
  }

  const displayTitle = pageTitle ?? test.name ?? 'Unnamed Test';
  const testTypeLabel = getTestTypeDisplay(test).label;
  const forceReasonRequired = forceStart && String(forceStartReason || '').trim().length < 8;
  const visualQaRequiredButMissing =
    launchVisualQaRequired && String(launchVisualQaBaselineId || '').trim().length < 2;
  const health = test?.health || null;
  const srmDetected = Boolean(health?.srm?.detected || test?.analytics_meta?.srm?.detected);
  const riskLevel = String(health?.riskSignals?.level || '').toLowerCase();
  const rolloutRecommendation = health?.rolloutRecommendation || null;
  const publishSummary = publishPreview?.summary || {};
  const previewWouldUpdate = Number(
    publishSummary.would_update_count ?? publishSummary.updated_count ?? 0
  );
  const previewScannedVariants = Number(publishSummary.variants_scanned || 0);
  const previewScannedProducts = Number(publishSummary.products_scanned || 0);
  const previewExcludedProducts = Number(publishSummary.products_skipped_excluded || 0);
  const checkoutPhaseLabel = (() => {
    const raw = String(test?.goal?.checkout_phase || 'experience')
      .trim()
      .toLowerCase();
    if (raw === 'payment_method') return 'Payment methods';
    if (raw === 'delivery_method') return 'Delivery methods';
    return 'Experience block';
  })();
  const hasDeployableCheckoutCustomizationPhase =
    checkoutPhaseLabel === 'Payment methods' || checkoutPhaseLabel === 'Delivery methods';
  const checkoutReadinessSummary = checkoutReadinessReport?.summary || null;
  const checkoutReadinessChecks = Array.isArray(checkoutReadinessReport?.checks)
    ? checkoutReadinessReport.checks
    : [];
  const checkoutReadinessHighlights = checkoutReadinessChecks
    .filter(item => item?.ok === false)
    .sort((left, right) => {
      const leftWeight = left?.severity === 'error' ? 0 : 1;
      const rightWeight = right?.severity === 'error' ? 0 : 1;
      return leftWeight - rightWeight;
    })
    .slice(0, 4);
  const checkoutReadinessTone =
    checkoutReadinessSummary?.status === 'ready'
      ? 'success'
      : checkoutReadinessSummary?.status === 'blocked'
        ? 'critical'
        : 'warning';
  const capabilityEntries = Object.entries(checkoutReadinessReport?.capabilities || {})
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' '),
      level: String(value.level || '').trim() || 'unknown',
      summary: String(value.summary || '').trim(),
    }));

  return (
    <>
      {shippingBlockingOverlay}
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
          message={shippingExecutionToast?.message}
          type={shippingExecutionToast?.type || 'success'}
          onClose={() => setShippingExecutionToast(null)}
          duration={shippingExecutionToast?.duration ?? 4000}
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
          open={publishConfirmOpen}
          onClose={() => {
            if (actionLoading) return;
            setPublishConfirmOpen(false);
          }}
          title={
            publishConfirmMode === 'stop_and_publish'
              ? 'Stop test and publish winner prices?'
              : 'Publish winner prices to Shopify?'
          }
          primaryAction={{
            content:
              publishConfirmMode === 'stop_and_publish' ? 'Stop + publish' : 'Publish to Shopify',
            onAction: handleConfirmPublishToShopify,
            loading: actionLoading,
            disabled: publishPreviewLoading || !!publishPreviewError,
            destructive: false,
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setPublishConfirmOpen(false),
              disabled: actionLoading,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text variant="bodyMd" as="p" tone="subdued">
                This action applies the winner for traffic personalization and writes matching
                prices into your Shopify catalog variants.
              </Text>
              {publishPreviewLoading && (
                <Banner tone="info">
                  <Text as="p" variant="bodySm">
                    Estimating impacted products and variants…
                  </Text>
                </Banner>
              )}
              {publishPreviewError && (
                <Banner tone="critical">
                  <Text as="p" variant="bodySm">
                    {publishPreviewError}
                  </Text>
                </Banner>
              )}
              {!publishPreviewLoading && !publishPreviewError && publishPreview && (
                <Banner tone="warning">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm">
                      Products scanned: <strong>{previewScannedProducts}</strong>
                    </Text>
                    <Text as="p" variant="bodySm">
                      Variants scanned: <strong>{previewScannedVariants}</strong>
                    </Text>
                    <Text as="p" variant="bodySm">
                      Variants to update: <strong>{previewWouldUpdate}</strong>
                    </Text>
                    {previewExcludedProducts > 0 && (
                      <Text as="p" variant="bodySm">
                        Excluded products skipped: <strong>{previewExcludedProducts}</strong>
                      </Text>
                    )}
                  </BlockStack>
                </Banner>
              )}
            </BlockStack>
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
              <LaunchPreflightPanel preflightResult={preflightResult} loading={preflightLoading} />
              <details className={styles.launchAdvancedOptions}>
                <summary>Advanced launch options</summary>
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
              </details>
              <details className={styles.launchChecklist}>
                <summary>Pre-launch checklist (optional)</summary>
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
              </details>
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
                      onClick={() => guardedNavigate(routes.tests)}
                    >
                      ← All Tests
                    </button>
                    <div className={styles.detailHeroTopBadges}>
                      <span className={styles.detailHeroMetaKicker}>Test</span>
                      <span
                        className={`${styles.detailStatusPill} ${
                          test.status === 'running'
                            ? styles.detailStatusRunning
                            : test.status === 'draft'
                              ? styles.detailStatusDraft
                              : styles.detailStatusStopped
                        }`}
                      >
                        <span className={styles.detailStatusDot} aria-hidden="true" />
                        {test.status === 'running'
                          ? 'Running'
                          : test.status === 'draft'
                            ? 'Draft'
                            : 'Stopped'}
                      </span>
                      <span className={styles.detailHeroMetaChip}>
                        <span className={styles.detailHeroMetaLabel}>Type</span>
                        {testTypeLabel}
                      </span>
                      {test.variants?.length > 0 && (
                        <span className={styles.detailHeroMetaChip}>
                          <span className={styles.detailHeroMetaLabel}>Variants</span>
                          {getVariantCount(test)} variants
                        </span>
                      )}
                    </div>
                  </div>
                  <h1 className={styles.detailHeroTitle}>{displayTitle}</h1>
                  {(srmDetected ||
                    riskLevel === 'high' ||
                    rolloutRecommendation?.action === 'canary_rollout') && (
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
                            StopTest
                          </button>
                        ) : test.status !== 'running' ? (
                          <button
                            type="button"
                            className={`${styles.detailPrimaryBtn} ${styles.detailPrimaryBtnStart}`}
                            onClick={handleStartClick}
                            disabled={actionLoading}
                          >
                            <Icon source={PlayIcon} />
                            StartTest
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
                          </>
                        )}
                      </div>
                      <div
                        className={styles.detailHeroActionsRow2}
                        role="group"
                        aria-label="Quick actions"
                      >
                        <span className={styles.detailHeroRowLabel}>Actions</span>
                        <div className={styles.detailActionsMenuWrap} ref={actionsMenuRef}>
                          <button
                            type="button"
                            className={styles.detailActionsMenuTrigger}
                            onClick={() => setActionsMenuOpen(open => !open)}
                            aria-expanded={actionsMenuOpen}
                            aria-haspopup="menu"
                          >
                            <span className={styles.detailActionsMenuTriggerIcon}>
                              <span className={styles.detailActionsMenuDesktopIcon}>
                                <Icon source={ChartVerticalFilledIcon} />
                              </span>
                              <span className={styles.detailActionsMenuMobileIcon}>
                                <Icon source={MenuHorizontalIcon} />
                              </span>
                            </span>
                            <span className={styles.detailActionsMenuTriggerCopy}>
                              <span className={styles.detailActionsMenuTriggerLabel}>
                                CommandCenter
                              </span>
                              <span className={styles.detailActionsMenuTriggerHint}>
                                Insights, readiness, growth, manage
                              </span>
                            </span>
                            <span
                              className={`${styles.detailActionsMenuChevron} ${
                                actionsMenuOpen ? styles.detailActionsMenuChevronOpen : ''
                              }`}
                              aria-hidden="true"
                            >
                              <Icon source={ChevronDownIcon} />
                            </span>
                          </button>
                          {actionsMenuOpen && (
                            <div className={styles.detailActionsMenuPanel} role="menu">
                              <DetailActionMenuSection title="Insights">
                                <DetailActionMenuItem
                                  icon={ChartLineIcon}
                                  label="Analytics"
                                  description="Open performance and variant metrics."
                                  onAction={() =>
                                    runHeaderAction(() => guardedNavigate(routes.testAnalytics(id)))
                                  }
                                />
                                <DetailActionMenuItem
                                  icon={ExportIcon}
                                  label="Export"
                                  description="Open full export options."
                                  onAction={() =>
                                    runHeaderAction(() => guardedNavigate(routes.testExport(id)))
                                  }
                                />
                                <DetailActionMenuItem
                                  icon={ExportIcon}
                                  label={reportDownloadLoading ? 'PreparingReport…' : 'ReportMD'}
                                  description="Download a concise markdown report."
                                  disabled={reportDownloadLoading}
                                  onAction={() => runHeaderAction(handleDownloadReport)}
                                />
                                <DetailActionMenuItem
                                  icon={ClipboardIcon}
                                  label="IDs"
                                  description="View and copy test or variant IDs."
                                  onAction={() => runHeaderAction(() => setIdsModalOpen(true))}
                                />
                              </DetailActionMenuSection>

                              <DetailActionMenuSection title="Readiness">
                                {supportsCheckoutReadiness && (
                                  <DetailActionMenuItem
                                    icon={TargetIcon}
                                    label={
                                      checkoutReadinessLoading
                                        ? 'Checking…'
                                        : checkoutReadinessLabel
                                    }
                                    description="Check checkout launch readiness."
                                    disabled={checkoutReadinessLoading || actionLoading}
                                    onAction={() => runHeaderAction(handleCheckoutReadiness)}
                                  />
                                )}
                                {isCheckoutTest && (
                                  <DetailActionMenuItem
                                    icon={LinkIcon}
                                    label="CheckoutDocs"
                                    description="Open checkout setup documentation."
                                    onAction={() =>
                                      runHeaderAction(() =>
                                        guardedNavigate(`${routes.docs}#checkout-studio`)
                                      )
                                    }
                                  />
                                )}
                                {isPriceLikeTest && (
                                  <DetailActionMenuItem
                                    icon={LinkIcon}
                                    label="PriceDocs"
                                    description="Open price testing documentation."
                                    onAction={() =>
                                      runHeaderAction(() =>
                                        guardedNavigate(`${routes.docs}#price-testing`)
                                      )
                                    }
                                  />
                                )}
                                {isOfferTest && (
                                  <DetailActionMenuItem
                                    icon={LinkIcon}
                                    label="OfferDocs"
                                    description="Open offer testing documentation."
                                    onAction={() =>
                                      runHeaderAction(() =>
                                        guardedNavigate(`${routes.docs}#offer-testing`)
                                      )
                                    }
                                  />
                                )}
                                {isShippingTest && (
                                  <DetailActionMenuItem
                                    icon={LinkIcon}
                                    label="ShippingDocs"
                                    description="Open shipping testing documentation."
                                    onAction={() =>
                                      runHeaderAction(() =>
                                        guardedNavigate(`${routes.docs}#shipping-tests`)
                                      )
                                    }
                                  />
                                )}
                                {isThemeLikeTest && (
                                  <DetailActionMenuItem
                                    icon={LinkIcon}
                                    label="ThemeDocs"
                                    description="Open theme and template testing documentation."
                                    onAction={() =>
                                      runHeaderAction(() =>
                                        guardedNavigate(`${routes.docs}#theme-template-tests`)
                                      )
                                    }
                                  />
                                )}
                                {isContentLikeTest && (
                                  <DetailActionMenuItem
                                    icon={LinkIcon}
                                    label="ContentDocs"
                                    description="Open onsite edit and split URL documentation."
                                    onAction={() =>
                                      runHeaderAction(() =>
                                        guardedNavigate(`${routes.docs}#onsite-split-url`)
                                      )
                                    }
                                  />
                                )}
                                {isCheckoutTest && hasDeployableCheckoutCustomizationPhase && (
                                  <>
                                    <DetailActionMenuItem
                                      icon={ChartVerticalFilledIcon}
                                      label={
                                        checkoutCustomizationLoading
                                          ? 'Running…'
                                          : 'CustomizationDryRun'
                                      }
                                      description="Preview Shopify checkout customization changes."
                                      disabled={checkoutCustomizationLoading || actionLoading}
                                      onAction={() =>
                                        runHeaderAction(() =>
                                          handleEnsureCheckoutCustomization(false)
                                        )
                                      }
                                    />
                                    <DetailActionMenuItem
                                      icon={LinkIcon}
                                      label={
                                        checkoutCustomizationLoading
                                          ? 'Applying…'
                                          : 'ApplyCustomization'
                                      }
                                      description="Create or update Shopify checkout customization."
                                      disabled={checkoutCustomizationLoading || actionLoading}
                                      primary
                                      onAction={() =>
                                        runHeaderAction(() =>
                                          handleEnsureCheckoutCustomization(true)
                                        )
                                      }
                                    />
                                  </>
                                )}
                                {isShippingTest && (
                                  <>
                                    {shippingApplyScopeGate.blocked && (
                                      <DetailActionMenuItem
                                        icon={TargetIcon}
                                        label="Open Shipping Variant Config"
                                        description="Open the editor and use Current Shopify setup → Use as scope."
                                        disabled={actionLoading}
                                        onAction={() =>
                                          runHeaderAction(() =>
                                            guardedNavigate(routes.testEditor(id))
                                          )
                                        }
                                      />
                                    )}
                                  </>
                                )}
                              </DetailActionMenuSection>

                              <DetailActionMenuSection title="Growth">
                                {hasPersonalization && !rolloutConfigExpanded && (
                                  <DetailActionMenuItem
                                    icon={XCircleIcon}
                                    label="DisablePersonalization"
                                    description="Return this test to normal traffic handling."
                                    disabled={actionLoading}
                                    onAction={() => runHeaderAction(handleDisablePersonalization)}
                                  />
                                )}
                                {isStopped && !hasPersonalization && !rolloutConfigExpanded && (
                                  <>
                                    <DetailActionMenuItem
                                      icon={TargetIcon}
                                      label="Personalize"
                                      description="Apply the winner to all eligible traffic."
                                      disabled={actionLoading}
                                      primary
                                      onAction={() => runHeaderAction(handlePersonalize)}
                                    />
                                    <DetailActionMenuItem
                                      icon={ChartVerticalFilledIcon}
                                      label="Rollout"
                                      description="Configure a controlled canary rollout."
                                      disabled={actionLoading}
                                      onAction={() =>
                                        runHeaderAction(() => {
                                          setRolloutInitialPercent('25');
                                          setRolloutDuration(7);
                                          setRolloutConfigExpanded(true);
                                        })
                                      }
                                    />
                                    {isPriceLikeTest && (
                                      <DetailActionMenuItem
                                        icon={LinkIcon}
                                        label="PersonalizeShopify"
                                        description="Apply winner to traffic and write Shopify prices."
                                        disabled={actionLoading}
                                        onAction={() =>
                                          runHeaderAction(handlePersonalizeAndPublish)
                                        }
                                      />
                                    )}
                                  </>
                                )}
                                {(String(test?.type || '').toLowerCase() === 'price' ||
                                  String(test?.type || '').toLowerCase() === 'pricing') &&
                                  isStopped && (
                                    <>
                                      <DetailActionMenuItem
                                        icon={LinkIcon}
                                        label="PublishToShopify"
                                        description="Apply winner to traffic and write catalog prices."
                                        disabled={actionLoading}
                                        onAction={() =>
                                          runHeaderAction(handlePersonalizeAndPublish)
                                        }
                                      />
                                      <DetailActionMenuItem
                                        icon={ExportIcon}
                                        label={rolloutCsvLoading ? 'PreparingCSV…' : 'RolloutCSV'}
                                        description="Download winner price mapping CSV."
                                        disabled={rolloutCsvLoading}
                                        onAction={() => runHeaderAction(handleDownloadRolloutCsv)}
                                      />
                                    </>
                                  )}
                                {test.type === 'offer' && (
                                  <DetailActionMenuItem
                                    icon={LinkIcon}
                                    label="PromoLinks"
                                    description="Open offer promo links."
                                    onAction={() =>
                                      runHeaderAction(() =>
                                        guardedNavigate(routes.testPromoLinks(id))
                                      )
                                    }
                                  />
                                )}
                              </DetailActionMenuSection>

                              <DetailActionMenuSection title="Manage">
                                <DetailActionMenuItem
                                  icon={DuplicateIcon}
                                  label="Clone"
                                  description="Create a copy of this test."
                                  disabled={actionLoading}
                                  onAction={() => runHeaderAction(handleClone)}
                                />
                                <DetailActionMenuItem
                                  icon={DeleteIcon}
                                  label="Delete"
                                  description="Permanently delete this test."
                                  disabled={actionLoading}
                                  destructive
                                  onAction={() => runHeaderAction(() => setDeleteModal(true))}
                                />
                              </DetailActionMenuSection>
                            </div>
                          )}
                        </div>
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
                      {isPriceLikeTest && (
                        <button
                          type="button"
                          className={`${styles.stopInlineCard} ${styles.stopInlineCardPersonalize}`}
                          onClick={() => handleStop('personalize_publish_shopify')}
                          disabled={actionLoading}
                          title="Stop test, apply winner to traffic, and write prices to Shopify catalog"
                        >
                          <Icon source={LinkIcon} />
                          <span className={styles.stopInlineCardLabel}>Apply winner + Shopify</span>
                          <span className={styles.stopInlineCardBadge}>Catalog update</span>
                        </button>
                      )}
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
                  submitLabel={isDraft ? 'Save Draft' : 'Save Changes'}
                  onSubmit={handleSave}
                  onSaveCode={handleSaveCode}
                  onCancel={() => guardedNavigate(routes.tests)}
                  onDirtyChange={setHasUnsavedChanges}
                  submitLoading={saveLoading}
                  onTitleRender={handleTitleRender}
                  onRefreshTest={refreshTestAfterShippingExecution}
                />
              </Layout.Section>
            </Layout>

            {!isShippingTest && supportsCheckoutReadiness && checkoutReadinessSummary && (
              <div className={styles.detailPostWizardPanels}>
                <div className={styles.detailPostWizardHeader}>
                  <span className={styles.detailPostWizardHeaderIcon} aria-hidden>
                    <Icon source={ChartVerticalFilledIcon} />
                  </span>
                  <div className={styles.detailPostWizardHeaderCopy}>
                    <Text as="h3" variant="headingSm">
                      Launch support
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Check launch readiness without interrupting the editor.
                    </Text>
                  </div>
                </div>
                <div className={styles.detailInsightPanel}>
                  <button
                    type="button"
                    className={styles.detailInsightToggle}
                    onClick={() => toggleDetailInsightPanel('readiness')}
                    aria-expanded={detailInsightPanels.readiness}
                  >
                    <span className={styles.detailInsightToggleMeta}>
                      <span className={styles.detailInsightToggleTitle}>
                        {checkoutReadinessLabel}
                      </span>
                      <span className={styles.detailInsightToggleSummary}>
                        {checkoutReadinessSummary.status || 'unknown'} status,{' '}
                        {checkoutReadinessSummary.blockers ?? 0} blockers,{' '}
                        {checkoutReadinessSummary.warnings ?? 0} warnings
                      </span>
                    </span>
                    <span
                      className={`${styles.detailInsightChevron} ${
                        detailInsightPanels.readiness ? styles.detailInsightChevronOpen : ''
                      }`}
                    >
                      <Icon source={ChevronDownIcon} />
                    </span>
                  </button>
                  {detailInsightPanels.readiness && (
                    <div className={`${styles.detailInsightBody} ${styles.checkoutReadinessPanel}`}>
                      <Banner title={checkoutReadinessLabel} tone={checkoutReadinessTone}>
                        <BlockStack gap="300">
                          <Text as="p" variant="bodySm">
                            {checkoutReadinessSummary.headline}
                          </Text>
                          <div className={styles.checkoutReadinessMetaRow}>
                            <span className={styles.checkoutReadinessPill}>
                              Status: {checkoutReadinessSummary.status || 'unknown'}
                            </span>
                            <span className={styles.checkoutReadinessPill}>
                              Passed: {checkoutReadinessSummary.checks_passed ?? 0}/
                              {checkoutReadinessSummary.checks_total ?? 0}
                            </span>
                            <span className={styles.checkoutReadinessPill}>
                              Blockers: {checkoutReadinessSummary.blockers ?? 0}
                            </span>
                            <span className={styles.checkoutReadinessPill}>
                              Warnings: {checkoutReadinessSummary.warnings ?? 0}
                            </span>
                          </div>
                          {capabilityEntries.length > 0 && (
                            <div className={styles.checkoutReadinessCapabilities}>
                              {capabilityEntries.map(entry => (
                                <div key={entry.key} className={styles.checkoutReadinessCapability}>
                                  <span className={styles.checkoutReadinessCapabilityLabel}>
                                    {entry.label}
                                  </span>
                                  <span className={styles.checkoutReadinessCapabilityLevel}>
                                    {entry.level.replace(/_/g, ' ')}
                                  </span>
                                  {entry.summary ? (
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      {entry.summary}
                                    </Text>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                          {checkoutReadinessSummary.next_action && (
                            <Text as="p" variant="bodySm" tone="subdued">
                              Next: {checkoutReadinessSummary.next_action}
                            </Text>
                          )}
                          {checkoutReadinessHighlights.length > 0 && (
                            <div className={styles.checkoutReadinessChecks}>
                              {checkoutReadinessHighlights.map(item => (
                                <div
                                  key={item.id}
                                  className={`${styles.checkoutReadinessCheck} ${
                                    item.severity === 'error'
                                      ? styles.checkoutReadinessCheckError
                                      : styles.checkoutReadinessCheckWarning
                                  }`}
                                >
                                  {formatPreflightCheckMessage({
                                    message: item.message,
                                    action_path: item.action_path,
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </BlockStack>
                      </Banner>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Page>
      </PageShell>
    </>
  );
}

export default TestDetail;
