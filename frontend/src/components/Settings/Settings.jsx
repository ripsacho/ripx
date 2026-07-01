/**
 * Settings Component
 *
 * Polished settings UI with tabs, integration cards, and user-friendly controls
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import { Card, BlockStack, Box, Button, InlineStack, Text } from '@shopify/polaris';
import { SettingsIcon } from '@shopify/polaris-icons';
import { ROUTES } from '../../constants';
import styles from './Settings.module.css';
import { apiGet, apiPut, apiPost, apiDelete, isStandaloneMode, unwrapData } from '../../services';
import { buildPreviewUrl, ensureShopifyPreviewBootstrapUrl } from '../../utils/previewUrl';
import {
  getCheckoutExperienceTestInventory,
  summarizeCheckoutExperienceInventory,
} from '../../utils/checkoutReporting';
import { useStoreSettingsData } from './hooks/useStoreSettingsData';
import {
  INTEGRATIONS_CONFIG,
  SETTINGS_PRESETS,
  DEFAULT_SETTINGS,
  WEBHOOK_EVENT_CHOICES,
  APP_SETTINGS_SECTION_IDS,
} from './config/settingsConstants';
import {
  TAB_CONFIG_APP,
  TAB_CONFIG_ACCOUNT,
  tabIndexFromSearchParams,
  filterVisibleTabEntries,
  createTabNavKeyDownHandler,
} from './config/settingsTabs';
import { formatRelativeTime } from './utils/formatRelativeTime';
import { buildSettingsSystemsMetrics } from './utils/buildSettingsSystemsMetrics';
import { CHECKOUT_DIAG_STALE_AFTER_MS } from './utils/checkoutDiagCache';
import { resolveSettingsPresetKey } from './utils/storeHealthChecks';
import { SettingsPageShell } from './SettingsPageShell';
import { SettingsTabIntro } from './primitives/SettingsTabIntro';
import { SettingsSectionLead } from './primitives/SettingsSectionLead';
import {
  StoreSettingsStoreSetupSection,
  StoreSettingsTestingDefaultsSection,
  StoreSettingsIntegrationsSection,
  StoreSettingsTargetingPresetsSection,
  StoreSettingsAdvancedSection,
} from './sections';
import { WebhooksSettingsModal } from './modals/WebhooksSettingsModal';
import { InstallSnippetModal } from './modals/InstallSnippetModal';
import { DeletePresetModal } from './modals/DeletePresetModal';

const OFFER_CHECKOUT_FUNCTION_TITLE = 'RipX Offer Checkout Function';

function normalizeCheckoutPhaseValue(rawValue) {
  const value = String(rawValue || 'experience')
    .trim()
    .toLowerCase();
  return ['experience', 'payment_method', 'delivery_method'].includes(value) ? value : 'experience';
}

function getCheckoutPhaseDisplayLabel(rawValue) {
  const phase = normalizeCheckoutPhaseValue(rawValue);
  if (phase === 'payment_method') return 'Payment methods';
  if (phase === 'delivery_method') return 'Delivery methods';
  return 'Experience block';
}

function Settings() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAppSettings = /^\/app\/[^/]+\/settings$/.test(location.pathname);
  const appSettingsDomain = useMemo(() => {
    const match = location.pathname.match(/^\/app\/([^/]+)\/settings$/);
    if (!match || !match[1]) return '';
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }, [location.pathname]);
  const isGuidedSetupMode =
    isAppSettings && String(searchParams.get('guided_setup') || '').trim() === '1';
  const TAB_CONFIG = isAppSettings ? TAB_CONFIG_APP : TAB_CONFIG_ACCOUNT;
  const TAB_IDS = useMemo(() => TAB_CONFIG.map(t => t.id), [TAB_CONFIG]);

  const [selectedTab, setSelectedTabState] = useState(() =>
    tabIndexFromSearchParams(searchParams, TAB_CONFIG)
  );

  useEffect(() => {
    const prev = document.title;
    document.title = isAppSettings ? 'Store settings - RipX' : 'Account settings - RipX';
    return () => {
      document.title = prev;
    };
  }, [isAppSettings]);

  const setSelectedTab = useCallback(
    index => {
      const i = Math.max(0, Math.min(index, TAB_CONFIG.length - 1));
      setSelectedTabState(i);
      const id = TAB_IDS[i];
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (id === 'installation') next.delete('tab');
          else next.set('tab', id);
          if (isGuidedSetupMode && id !== 'installation') {
            next.delete('guided_setup');
            next.delete('source');
          }
          return next;
        },
        { replace: true }
      );
    },
    [isGuidedSetupMode, setSearchParams, TAB_CONFIG.length, TAB_IDS]
  );

  const clearGuidedSetupMode = useCallback(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('guided_setup');
        next.delete('source');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  useEffect(() => {
    const index = tabIndexFromSearchParams(searchParams, TAB_CONFIG);
    setSelectedTabState(index);
  }, [searchParams, TAB_CONFIG]);

  const {
    settings,
    setSettings,
    loading,
    settingsLoadError,
    setSettingsLoadError,
    fetchSettings,
    targetingPresets,
    presetsLoading,
    fetchPresets,
    integrations,
    integrationsError,
    setIntegrationsError,
    integrationConfig,
    setIntegrationConfig,
    fetchIntegrations,
    installation,
    installationLoading,
    installationError,
    fetchInstallation,
    checkoutDiag,
    checkoutDiagLoading,
    checkoutDiagError,
    checkoutDiagLastCheckedAt,
    checkoutExperienceDiag,
    checkoutExperienceDiagLoading,
    checkoutExperienceDiagError,
    shopifyFnInventory,
    shopifyFnInventoryLoading,
    shopifyFnInventoryError,
    fetchShopifyFnInventory,
    checkoutCustomizationTests,
    checkoutCustomizationTestsLoading,
    checkoutCustomizationTestsError,
    setCheckoutCustomizationTestsError,
    fetchCheckoutCustomizationTests,
    runCheckoutDiagnostics,
    runCheckoutExperienceDiagnostics,
    storeHealth,
  } = useStoreSettingsData({ isAppSettings, appSettingsDomain });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [deletePresetId, setDeletePresetId] = useState(null);
  const [integrationsRefreshing, setIntegrationsRefreshing] = useState(false);
  const [integrationsSaving, setIntegrationsSaving] = useState(false);
  const [bigQueryExporting, setBigQueryExporting] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [webhookError, setWebhookError] = useState(null);
  const [presetApplyingKey, setPresetApplyingKey] = useState(null);
  const [deletePresetLoading, setDeletePresetLoading] = useState(false);
  const [checkoutDiscountEnsuring, setCheckoutDiscountEnsuring] = useState(false);
  const [checkoutDiscountEnsureResult, setCheckoutDiscountEnsureResult] = useState(null);
  const [checkoutDiscountEnsureError, setCheckoutDiscountEnsureError] = useState(null);
  const [checkoutDiscountEnsureDebug, setCheckoutDiscountEnsureDebug] = useState(null);
  const [checkoutDiscountListCheck, setCheckoutDiscountListCheck] = useState(null);
  const [checkoutDiscountListCheckLoading, setCheckoutDiscountListCheckLoading] = useState(false);
  const [checkoutDiscountListCheckError, setCheckoutDiscountListCheckError] = useState(null);
  const [shopSessionResetting, setShopSessionResetting] = useState(false);
  const [shopInstallLinkOpening, setShopInstallLinkOpening] = useState(false);
  const [checkoutCartTransformEnsuring, setCheckoutCartTransformEnsuring] = useState(false);
  const [checkoutCartTransformEnsureResult, setCheckoutCartTransformEnsureResult] = useState(null);
  const [checkoutCartTransformEnsureError, setCheckoutCartTransformEnsureError] = useState(null);
  const [checkoutFullVerifyRunning, setCheckoutFullVerifyRunning] = useState(false);
  const [checkoutCustomizationAction, setCheckoutCustomizationAction] = useState(null);
  const [layoutDensity, setLayoutDensity] = useState(() => {
    if (typeof window === 'undefined') return 'compact';
    try {
      const saved = window.localStorage.getItem('ripx_settings_density_v1');
      return saved === 'comfortable' ? 'comfortable' : 'compact';
    } catch {
      return 'compact';
    }
  });
  const [settingsLayoutMode, setSettingsLayoutMode] = useState(() => {
    if (typeof window === 'undefined') return 'tabbed';
    try {
      const saved = window.localStorage.getItem('ripx_settings_layout_mode_v1');
      return saved === 'all' ? 'all' : 'tabbed';
    } catch {
      return 'all';
    }
  });
  const showAllAppSections = isAppSettings && settingsLayoutMode === 'all';
  const visibleTabEntries = useMemo(
    () =>
      filterVisibleTabEntries(TAB_CONFIG, {
        isAppSettings,
        isGuidedSetupMode,
        showAllAppSections,
      }),
    [TAB_CONFIG, isAppSettings, isGuidedSetupMode, showAllAppSections]
  );
  const [sectionRailCollapsed, setSectionRailCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('ripx_settings_section_rail_collapsed_v1') === '1';
    } catch {
      return false;
    }
  });
  const autoDiscountSetupHandledRef = useRef(false);
  const settingsBodyRef = useRef(null);
  const appSectionNodesRef = useRef({});
  const [previewProbeTestId, setPreviewProbeTestId] = useState('');
  const [previewProbeVariant, setPreviewProbeVariant] = useState('');
  const [previewProbeLoading, setPreviewProbeLoading] = useState(false);
  const [previewProbeAutofillLoading, setPreviewProbeAutofillLoading] = useState(false);
  const [previewProbeResult, setPreviewProbeResult] = useState(null);
  const [previewProbeError, setPreviewProbeError] = useState(null);
  /** Installation → checkout card: keep primary actions visible; tuck tools & long copy here */
  const [installSnippetModalOpen, setInstallSnippetModalOpen] = useState(false);
  const [webhooksModalOpen, setWebhooksModalOpen] = useState(false);
  const [activeAppSectionId, setActiveAppSectionId] = useState(APP_SETTINGS_SECTION_IDS[0]);
  const [activeRailTooltipId, setActiveRailTooltipId] = useState(null);
  const railTooltipTimerRef = useRef(null);

  useEffect(() => {
    if (!isGuidedSetupMode) return;
    if (settingsLayoutMode !== 'tabbed') {
      setSettingsLayoutMode('tabbed');
    }
    const installationIndex = TAB_IDS.indexOf('installation');
    if (installationIndex >= 0 && selectedTab !== installationIndex) {
      setSelectedTab(installationIndex);
    }
  }, [isGuidedSetupMode, settingsLayoutMode, TAB_IDS, selectedTab, setSelectedTab]);

  useEffect(() => {
    if (!isAppSettings) return;
    if (String(searchParams.get('install_snippet') || '') !== '1') return;
    const installationIndex = TAB_IDS.indexOf('installation');
    if (installationIndex >= 0 && selectedTab !== installationIndex) {
      setSelectedTab(installationIndex);
    }
    setInstallSnippetModalOpen(true);
  }, [isAppSettings, searchParams, selectedTab, setSelectedTab, TAB_IDS]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('ripx_settings_density_v1', layoutDensity);
    } catch {
      // Ignore persistence failures.
    }
  }, [layoutDensity]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!isAppSettings) {
        window.localStorage.removeItem('ripx_settings_layout_mode_v1');
        return;
      }
      window.localStorage.setItem('ripx_settings_layout_mode_v1', settingsLayoutMode);
    } catch {
      // Ignore persistence failures.
    }
  }, [isAppSettings, settingsLayoutMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        'ripx_settings_section_rail_collapsed_v1',
        sectionRailCollapsed ? '1' : '0'
      );
    } catch {
      // Ignore persistence failures.
    }
  }, [sectionRailCollapsed]);

  const clearRailTooltipTimer = useCallback(() => {
    if (railTooltipTimerRef.current) {
      clearTimeout(railTooltipTimerRef.current);
      railTooltipTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearRailTooltipTimer();
    };
  }, [clearRailTooltipTimer]);

  useEffect(() => {
    if (!sectionRailCollapsed) {
      clearRailTooltipTimer();
      setActiveRailTooltipId(null);
    }
  }, [sectionRailCollapsed, clearRailTooltipTimer]);

  const ensureCartTransform = useCallback(async () => {
    if (!installation?.domain) return;
    setCheckoutCartTransformEnsuring(true);
    setCheckoutCartTransformEnsureError(null);
    setCheckoutCartTransformEnsureResult(null);
    try {
      const res = await apiPost('/settings/cart-transform/ensure', {});
      const data = unwrapData(res);
      if (!data || data.success === false) {
        throw new Error(data?.error || 'Could not install/verify RipX cart transform');
      }
      setCheckoutCartTransformEnsureResult({
        created: data.created === true,
        assumedInstalled: data.assumedInstalled === true,
        installCheckStatus: data?.installCheck?.status || null,
        installCheckReason: data?.installCheck?.reason || null,
        functionTitle: data?.function?.title || 'RipX cart transform',
      });
      await runCheckoutDiagnostics();
    } catch (e) {
      const apiError = e?.response?.data || null;
      const baseMessage =
        apiError?.error || e?.message || 'Could not install/verify cart transform';
      const userErrors = Array.isArray(apiError?.details?.shopifyUserErrors)
        ? apiError.details.shopifyUserErrors
            .map(err => String(err?.message || '').trim())
            .filter(Boolean)
        : [];
      setCheckoutCartTransformEnsureError(
        userErrors.length > 0 ? `${baseMessage}. Shopify: ${userErrors.join(' ; ')}` : baseMessage
      );
    } finally {
      setCheckoutCartTransformEnsuring(false);
    }
  }, [installation?.domain, runCheckoutDiagnostics]);

  const ensureCheckoutDiscount = useCallback(async () => {
    if (!installation?.domain) return;
    setCheckoutDiscountEnsuring(true);
    setCheckoutDiscountEnsureError(null);
    setCheckoutDiscountEnsureResult(null);
    setCheckoutDiscountEnsureDebug(null);
    setCheckoutDiscountListCheckError(null);
    try {
      const res = await apiPost('/settings/checkout-price-discount/ensure', {
        title: OFFER_CHECKOUT_FUNCTION_TITLE,
      });
      const data = unwrapData(res);
      if (!data || data.success === false || !data.discount) {
        throw new Error(data?.error || 'Could not create/attach RipX automatic discount');
      }
      setCheckoutDiscountEnsureResult({
        created: data.created === true,
        titleAdjusted: data.titleAdjusted === true,
        discountId: data.discount.discountId || null,
        title: data.discount.title || OFFER_CHECKOUT_FUNCTION_TITLE,
        status: data.discount.status || null,
      });
      setCheckoutDiscountListCheck(data?.listCheck || null);
      setCheckoutDiscountEnsureDebug({
        function: data?.function || null,
        troubleshooting: data?.troubleshooting || null,
        shopifyUserErrors: [],
        retryUserErrors: [],
      });
      // Refresh diagnostics after successful creation/attach.
      runCheckoutDiagnostics();
    } catch (e) {
      const apiError = e?.response?.data || null;
      const baseMessage =
        apiError?.error || e?.message || 'Could not create/attach RipX automatic discount';
      const functionLabel = apiError?.details?.function
        ? `${apiError.details.function.title || 'Unknown function'} (${apiError.details.function.apiType || 'unknown'})`
        : null;
      const userErrors = Array.isArray(apiError?.details?.shopifyUserErrors)
        ? apiError.details.shopifyUserErrors
            .map(err => {
              const msg = String(err?.message || '').trim();
              const code = String(err?.code || '').trim();
              const field = String(err?.field || '').trim();
              if (!msg && !code && !field) return '';
              const parts = [msg];
              if (code) parts.push(`code=${code}`);
              if (field) parts.push(`field=${field}`);
              return parts.filter(Boolean).join(' | ');
            })
            .filter(Boolean)
        : [];
      const detailParts = [];
      if (functionLabel) detailParts.push(`Function: ${functionLabel}`);
      if (userErrors.length > 0) detailParts.push(`Shopify: ${userErrors.join(' ; ')}`);
      setCheckoutDiscountEnsureError(
        detailParts.length > 0 ? `${baseMessage}. ${detailParts.join('. ')}` : baseMessage
      );
      setCheckoutDiscountEnsureDebug({
        function: apiError?.details?.function || null,
        troubleshooting: apiError?.details?.troubleshooting || null,
        shopifyUserErrors: Array.isArray(apiError?.details?.shopifyUserErrors)
          ? apiError.details.shopifyUserErrors
          : [],
        retryUserErrors: Array.isArray(apiError?.details?.retryUserErrors)
          ? apiError.details.retryUserErrors
          : [],
      });
      setCheckoutDiscountListCheck(null);
    } finally {
      setCheckoutDiscountEnsuring(false);
    }
  }, [installation?.domain, runCheckoutDiagnostics]);

  const runCheckoutDiscountListCheck = useCallback(async () => {
    if (!installation?.domain) return;
    setCheckoutDiscountListCheckLoading(true);
    setCheckoutDiscountListCheckError(null);
    try {
      const res = await apiGet('/settings/checkout-price-discount/status', {
        title: OFFER_CHECKOUT_FUNCTION_TITLE,
        discount_id: String(checkoutDiscountEnsureResult?.discountId || '').trim() || undefined,
      });
      const data = unwrapData(res);
      if (!data || data.success === false) {
        throw new Error(data?.error || 'Could not verify discount list status');
      }
      setCheckoutDiscountListCheck({
        inList: Boolean(data.inList),
        matchedCount: Number(data.matchedCount || 0),
        matchedDiscounts: Array.isArray(data.matchedDiscounts) ? data.matchedDiscounts : [],
        inspectedCount: Number(data.inspectedCount || 0),
      });
    } catch (e) {
      setCheckoutDiscountListCheckError(
        e?.message || 'Could not verify if discount appears in Shopify list'
      );
    } finally {
      setCheckoutDiscountListCheckLoading(false);
    }
  }, [installation?.domain, checkoutDiscountEnsureResult?.discountId]);

  const runFullCheckoutVerification = useCallback(async () => {
    if (!installation?.domain) return;
    setCheckoutFullVerifyRunning(true);
    try {
      await ensureCartTransform();
      await ensureCheckoutDiscount();
      await runCheckoutDiagnostics();
      setMessage('Full checkout verification completed');
    } finally {
      setCheckoutFullVerifyRunning(false);
    }
  }, [installation?.domain, ensureCartTransform, ensureCheckoutDiscount, runCheckoutDiagnostics]);

  const openShopifyInstallLink = useCallback(async () => {
    const shopDomain = String(installation?.domain || '')
      .trim()
      .toLowerCase();
    if (!shopDomain || !shopDomain.endsWith('.myshopify.com')) return false;
    setShopInstallLinkOpening(true);
    try {
      const callbackBase =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : undefined;
      const res = await apiGet('/auth/install-link', {
        shop: shopDomain,
        ...(callbackBase ? { callback_base: callbackBase } : {}),
      });
      const payload = unwrapData(res);
      const installUrl = String(payload?.url || '').trim();
      if (!installUrl) {
        throw new Error('Install link was empty');
      }
      if (typeof window !== 'undefined') {
        const popup = window.open(installUrl, '_blank', 'noopener,noreferrer');
        if (!popup) {
          window.location.href = installUrl;
        }
      }
      return true;
    } catch (e) {
      setMessage(`Failed to open install link: ${e?.message || 'Unknown error'}`);
      return false;
    } finally {
      setShopInstallLinkOpening(false);
    }
  }, [installation?.domain]);

  const resetShopSessionForReinstall = useCallback(async () => {
    const shopDomain = String(installation?.domain || '').trim();
    if (!shopDomain) return;
    const confirmed = window.confirm(
      `Reset stored Shopify session for ${shopDomain}?\n\nAfter this, uninstall and reinstall the app to re-authorize with a fresh token.`
    );
    if (!confirmed) return;
    setShopSessionResetting(true);
    try {
      const res = await apiPost(
        '/settings/shop-session/reset',
        {},
        {
          params: { domain: shopDomain },
        }
      );
      const data = unwrapData(res);
      const deleted = data?.deleted === true;
      setMessage(
        deleted
          ? `Shopify session reset for ${shopDomain}. Reinstall the app from your install link.`
          : `No stored Shopify session found for ${shopDomain}. You can proceed with reinstall.`
      );
      await fetchInstallation();
      await runCheckoutDiagnostics({ silentError: true });
      if (deleted) {
        await openShopifyInstallLink();
      }
    } catch (e) {
      setMessage(`Failed to reset Shopify session: ${e?.message || 'Unknown error'}`);
    } finally {
      setShopSessionResetting(false);
    }
  }, [installation?.domain, fetchInstallation, runCheckoutDiagnostics, openShopifyInstallLink]);

  const runPreviewProbe = useCallback(async () => {
    const testId = String(previewProbeTestId || '').trim();
    const variant = String(previewProbeVariant || '').trim();
    const shopDomain = String(installation?.domain || '').trim();
    if (!shopDomain) {
      setPreviewProbeError('Store domain missing for probe.');
      return;
    }
    if (!testId) {
      setPreviewProbeError('Enter a test ID.');
      return;
    }
    if (!variant) {
      setPreviewProbeError('Enter a variant ID/name.');
      return;
    }
    setPreviewProbeLoading(true);
    setPreviewProbeError(null);
    setPreviewProbeResult(null);
    try {
      const res = await apiGet('/track/preview', {
        test_id: testId,
        shop_domain: shopDomain,
        variant_id: variant,
        variant_name: variant,
      });
      const data = unwrapData(res);
      if (!data || data.success === false || !data.variant) {
        throw new Error(data?.error || 'Preview probe returned empty variant');
      }
      const cfg =
        data.variant.config && typeof data.variant.config === 'object' ? data.variant.config : {};
      setPreviewProbeResult({
        variantId: data.variant.variantId || null,
        variantName: data.variant.variantName || null,
        priceMode: cfg.priceMode || null,
        price: cfg.price ?? null,
        priceDelta: cfg.priceDelta ?? null,
        pricePercent: cfg.pricePercent ?? null,
      });
    } catch (e) {
      setPreviewProbeError(e?.message || 'Preview probe failed');
    } finally {
      setPreviewProbeLoading(false);
    }
  }, [installation?.domain, previewProbeTestId, previewProbeVariant]);

  const autofillPreviewProbeFromRunningTest = useCallback(async () => {
    setPreviewProbeAutofillLoading(true);
    setPreviewProbeError(null);
    try {
      const listRes = await apiGet('/tests');
      const listData = unwrapData(listRes);
      const tests = Array.isArray(listData?.tests)
        ? listData.tests
        : Array.isArray(listData)
          ? listData
          : [];
      const runningPriceTests = tests.filter(t => {
        const type = String(t?.type || '').toLowerCase();
        const status = String(t?.status || '').toLowerCase();
        return (type === 'price' || type === 'pricing') && status === 'running';
      });
      if (runningPriceTests.length === 0) {
        throw new Error('No running price test found for this shop.');
      }

      const picked = runningPriceTests[0];
      let variants = Array.isArray(picked?.variants) ? picked.variants : [];
      if (variants.length === 0 && picked?.id) {
        const detailRes = await apiGet(`/tests/${picked.id}`);
        const detailData = unwrapData(detailRes);
        const detailTest = detailData?.test ?? detailData;
        variants = Array.isArray(detailTest?.variants) ? detailTest.variants : [];
      }

      const candidate =
        variants.find(v => {
          const mode = String(v?.config?.priceMode || '').toLowerCase();
          if (mode === 'control') return false;
          const name = String(v?.name || '').toLowerCase();
          return name !== 'control';
        }) || variants.find(v => v && (v.id || v.name));

      if (!picked?.id || !candidate) {
        throw new Error('Running test found, but no usable variant could be resolved.');
      }

      const candidateIdOrName =
        candidate.id !== undefined && candidate.id !== null && String(candidate.id).trim()
          ? String(candidate.id).trim()
          : String(candidate.name || '').trim();

      setPreviewProbeTestId(String(picked.id));
      setPreviewProbeVariant(candidateIdOrName);
      setMessage('Preview probe autofilled from current running price test');
    } catch (e) {
      setPreviewProbeError(e?.message || 'Could not autofill from running price test');
    } finally {
      setPreviewProbeAutofillLoading(false);
    }
  }, []);

  const handleRefreshIntegrations = useCallback(async () => {
    setIntegrationsRefreshing(true);
    try {
      await fetchIntegrations();
      setMessage('Integration status refreshed');
    } finally {
      setIntegrationsRefreshing(false);
    }
  }, [fetchIntegrations]);

  const handleCopy = useCallback(async (text, successMsg = 'Copied') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage(successMsg);
    } catch {
      setMessage('Failed to copy');
    }
  }, []);

  const handleCopySnippet = useCallback(async () => {
    if (!installation?.snippetHtml) return;
    await handleCopy(installation.snippetHtml, 'Snippet copied to clipboard');
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 2000);
  }, [installation, handleCopy]);

  const handleCloseInstallSnippetModal = useCallback(() => {
    setInstallSnippetModalOpen(false);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('install_snippet');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const handleSaveIntegrations = useCallback(async () => {
    setIntegrationsSaving(true);
    setMessage(null);
    try {
      await apiPut('/settings/integrations', {
        ga4MeasurementId: integrationConfig.ga4MeasurementId.trim() || undefined,
        ga4ApiSecret:
          integrationConfig.ga4ApiSecret &&
          integrationConfig.ga4ApiSecret !== '••••••••' &&
          integrationConfig.ga4ApiSecret !== ''
            ? integrationConfig.ga4ApiSecret
            : undefined,
        bigqueryProjectId: integrationConfig.bigqueryProjectId.trim() || undefined,
        bigqueryDataset: integrationConfig.bigqueryDataset.trim() || undefined,
        bigqueryCredentials: integrationConfig.bigqueryCredentials.trim()
          ? integrationConfig.bigqueryCredentials
          : undefined,
      });
      setMessage('Integration settings saved');
      await fetchIntegrations();
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.message || 'Failed to save';
      setMessage(errMsg);
    } finally {
      setIntegrationsSaving(false);
    }
  }, [integrationConfig, fetchIntegrations]);

  const handleBigQueryExport = async (full = false) => {
    setBigQueryExporting(true);
    setMessage(null);
    try {
      const res = await apiPost(`/analytics/bigquery/export?full=${full}`, {});
      const data = unwrapData(res);
      if (data?.skipped) {
        setMessage(data.error || 'BigQuery export not configured');
      } else {
        const count = data?.exported ?? 0;
        const tables = data?.tables?.length ? data.tables.join(', ') : null;
        const msg =
          count > 0
            ? `Export complete. ${count} row${count !== 1 ? 's' : ''} to ${tables || 'BigQuery'}.`
            : `Export complete. No new data to sync.`;
        setMessage(msg);
        await fetchIntegrations();
      }
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.message || 'BigQuery export failed';
      setMessage(errMsg);
    } finally {
      setBigQueryExporting(false);
    }
  };

  const handleSave = async () => {
    setWebhookError(null);
    const webhookUrl = (settings.outboundWebhookUrl || '').trim();
    if (webhookUrl) {
      try {
        new URL(webhookUrl);
      } catch {
        setWebhookError('Please enter a valid URL (e.g. https://...)');
        return false;
      }
    }
    const minSize = Math.max(
      10,
      Math.min(10000, parseInt(settings.minSampleSize, 10) || DEFAULT_SETTINGS.minSampleSize)
    );
    const conf = Math.max(
      0.8,
      Math.min(0.99, parseFloat(settings.confidenceLevel) || DEFAULT_SETTINGS.confidenceLevel)
    );
    const payload = {
      ...settings,
      minSampleSize: minSize,
      confidenceLevel: conf,
      outboundWebhookUrl: webhookUrl || '',
      outboundWebhookEvents:
        Array.isArray(settings.outboundWebhookEvents) && settings.outboundWebhookEvents.length > 0
          ? settings.outboundWebhookEvents
          : DEFAULT_SETTINGS.outboundWebhookEvents,
    };
    setSaving(true);
    setMessage(null);
    try {
      await apiPut('/settings', payload);
      setSettings(payload);
      setMessage('Store settings saved successfully');
      return true;
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to save store settings');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const activeTabId = TAB_IDS[selectedTab];
  const focusAppSection = useCallback(
    sectionId => {
      const nextTabIndex = TAB_IDS.indexOf(sectionId);
      if (nextTabIndex < 0) return;
      setSettingsLayoutMode('tabbed');
      setSelectedTab(nextTabIndex);
      const container = settingsBodyRef.current;
      if (container) {
        container.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [TAB_IDS, setSelectedTab]
  );
  const setAppSectionNode = useCallback((sectionId, node) => {
    if (node) {
      appSectionNodesRef.current[sectionId] = node;
      return;
    }
    delete appSectionNodesRef.current[sectionId];
  }, []);

  const getSectionOffsetTop = useCallback((container, target) => {
    if (!container || !target) return 0;
    let offset = 0;
    let current = target;
    while (current && current !== container) {
      offset += current.offsetTop || 0;
      current = current.offsetParent;
    }
    return offset;
  }, []);

  const scrollToAppSection = useCallback(
    sectionId => {
      const container = settingsBodyRef.current;
      const target = appSectionNodesRef.current[sectionId];
      if (!container || !target) return;
      const stickyOffset = 96;
      const nextTop = getSectionOffsetTop(container, target) - stickyOffset;
      container.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
      setActiveAppSectionId(sectionId);
    },
    [getSectionOffsetTop]
  );

  const scheduleRailTooltipOpen = useCallback(
    sectionId => {
      clearRailTooltipTimer();
      railTooltipTimerRef.current = setTimeout(() => {
        setActiveRailTooltipId(sectionId);
      }, 180);
    },
    [clearRailTooltipTimer]
  );

  const hideRailTooltip = useCallback(() => {
    clearRailTooltipTimer();
    setActiveRailTooltipId(null);
  }, [clearRailTooltipTimer]);

  useEffect(() => {
    if (!isAppSettings || loading || !showAllAppSections) return;
    const container = settingsBodyRef.current;
    if (!container) return;

    const updateActiveSection = () => {
      const anchorTop = container.scrollTop + 112;
      let activeSection = APP_SETTINGS_SECTION_IDS[0];
      let bestDelta = -Infinity;
      let firstAhead = null;

      APP_SETTINGS_SECTION_IDS.forEach(id => {
        const node = appSectionNodesRef.current[id];
        if (!node) return;
        const delta = getSectionOffsetTop(container, node) - anchorTop;
        if (delta <= 0 && delta > bestDelta) {
          bestDelta = delta;
          activeSection = id;
        }
        if (delta > 0 && (!firstAhead || delta < firstAhead.delta)) {
          firstAhead = { id, delta };
        }
      });

      if (bestDelta === -Infinity && firstAhead?.id) {
        activeSection = firstAhead.id;
      }

      setActiveAppSectionId(prev => (prev === activeSection ? prev : activeSection));
    };

    updateActiveSection();
    container.addEventListener('scroll', updateActiveSection, { passive: true });
    window.addEventListener('resize', updateActiveSection);
    return () => {
      container.removeEventListener('scroll', updateActiveSection);
      window.removeEventListener('resize', updateActiveSection);
    };
  }, [getSectionOffsetTop, isAppSettings, loading, showAllAppSections]);

  const handleTabNavKeyDown = createTabNavKeyDownHandler({
    isGuidedSetupMode,
    tabCount: TAB_CONFIG.length,
    selectedTab,
    setSelectedTab,
  });

  useEffect(() => {
    if (!isAppSettings) return;
    if (autoDiscountSetupHandledRef.current) return;
    if (String(searchParams.get('auto_discount_setup') || '').trim() !== '1') return;
    if (!installation?.domain) return;

    autoDiscountSetupHandledRef.current = true;
    const installationTabIndex = TAB_IDS.indexOf('installation');
    if (installationTabIndex >= 0 && selectedTab !== installationTabIndex) {
      setSelectedTab(installationTabIndex);
    }

    (async () => {
      await ensureCartTransform();
      await ensureCheckoutDiscount();
      await runCheckoutDiagnostics();
    })();

    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('auto_discount_setup');
        return next;
      },
      { replace: true }
    );
  }, [
    isAppSettings,
    searchParams,
    installation?.domain,
    TAB_IDS,
    selectedTab,
    setSelectedTab,
    ensureCartTransform,
    ensureCheckoutDiscount,
    runCheckoutDiagnostics,
    setSearchParams,
  ]);

  const formatPresetSegments = p => {
    const seg = p?.segments || {};
    const parts = [
      seg.device && seg.device !== 'all' && `Device: ${seg.device}`,
      seg.customer && seg.customer !== 'all' && `Customer: ${seg.customer}`,
      Array.isArray(seg.countries) &&
        seg.countries.length > 0 &&
        `Countries: ${seg.countries.join(', ')}`,
    ]
      .filter(Boolean)
      .join(' · ');
    return parts || 'All segments';
  };

  const configuredIntegrationCount = useMemo(() => {
    if (!integrations) return 0;
    return INTEGRATIONS_CONFIG.reduce(
      (count, { key }) => count + (integrations?.[key]?.configured ? 1 : 0),
      0
    );
  }, [integrations]);

  const previewProbeUrl = useMemo(() => {
    const shopDomain = String(installation?.domain || '').trim();
    const testId = String(previewProbeTestId || '').trim();
    const variant = String(previewProbeVariant || '').trim();
    if (!shopDomain || !testId || !variant) return '';
    const directPreviewUrl = buildPreviewUrl({
      baseUrl: `https://${shopDomain}/`,
      testId,
      variantId: variant,
      variantName: variant,
      tenantDomain: shopDomain,
    });
    return ensureShopifyPreviewBootstrapUrl(directPreviewUrl);
  }, [installation?.domain, previewProbeTestId, previewProbeVariant]);

  const shopifyAdminDiscountsUrl = useMemo(() => {
    const domain = String(installation?.domain || '')
      .trim()
      .toLowerCase();
    if (!domain.endsWith('.myshopify.com')) return '';
    const handle = domain.replace(/\.myshopify\.com$/, '');
    if (!handle) return '';
    return `https://admin.shopify.com/store/${handle}/discounts`;
  }, [installation?.domain]);

  const checkoutDiscountAttached = useMemo(() => {
    const idFromEnsure = String(checkoutDiscountEnsureResult?.discountId || '').trim();
    if (idFromEnsure) return true;
    const statusFromEnsure = String(checkoutDiscountEnsureResult?.status || '')
      .trim()
      .toLowerCase();
    if (statusFromEnsure === 'active' || statusFromEnsure === 'enabled') return true;
    const discountCheck = Array.isArray(checkoutDiag?.checklist)
      ? checkoutDiag.checklist.find(item => {
          const key = String(item?.id || item?.key || '').toLowerCase();
          return key.includes('discount');
        })
      : null;
    return Boolean(discountCheck?.ok);
  }, [checkoutDiscountEnsureResult, checkoutDiag?.checklist]);
  const shopifyAdminAuthFailed = useMemo(() => {
    const checks = Array.isArray(checkoutDiag?.checklist) ? checkoutDiag.checklist : [];
    return checks.some(item => {
      const key = String(item?.id || item?.key || '')
        .trim()
        .toLowerCase();
      const message = String(item?.message || '')
        .trim()
        .toLowerCase();
      return (
        (key.includes('shopify_admin_api_auth') && item?.ok === false) ||
        message.includes('stored access token (401)') ||
        message.includes('invalid api key or access token') ||
        message.includes('unrecognized login')
      );
    });
  }, [checkoutDiag?.checklist]);

  const setupComplete = useMemo(
    () => Boolean(isAppSettings && storeHealth.ready && checkoutDiscountAttached),
    [isAppSettings, storeHealth.ready, checkoutDiscountAttached]
  );
  const supportLevelHelpText = useMemo(() => {
    if (storeHealth.supportLevel === 'native_cart_checkout_aligned') {
      return 'Native cart + checkout: checkout discounts are aligned and cart theme integration is detected.';
    }
    if (storeHealth.supportLevel === 'checkout_aligned_cart_fallback') {
      return 'Checkout aligned + cart fallback: checkout discount path is healthy, but native cart rendering is not confirmed on this theme yet.';
    }
    return 'Setup incomplete: required checks are not passing yet (script, blocking diagnostics, or tenant registration).';
  }, [storeHealth.supportLevel]);
  const supportLevelBadgeTone =
    storeHealth.supportLevel === 'native_cart_checkout_aligned'
      ? 'success'
      : storeHealth.supportLevel === 'checkout_aligned_cart_fallback'
        ? 'attention'
        : 'warning';
  const supportLevelBadgeLabel =
    storeHealth.supportLevel === 'native_cart_checkout_aligned'
      ? 'Native cart + checkout'
      : storeHealth.supportLevel === 'checkout_aligned_cart_fallback'
        ? 'Checkout aligned + cart fallback'
        : 'Setup incomplete';
  const checkoutHealthSnapshot = useMemo(() => {
    const requiredChecks = storeHealth.checks.filter(item => item.required !== false);
    const passedRequired = requiredChecks.filter(item => item.ok || item.advisory === true).length;
    const failedRequired = requiredChecks.filter(item => !item.ok && item.advisory !== true);
    return {
      passedRequired,
      requiredTotal: requiredChecks.length,
      failedRequired,
      advisoryCount: storeHealth.advisories.length,
    };
  }, [storeHealth]);
  const checkoutLaunchTone = setupComplete
    ? 'success'
    : checkoutHealthSnapshot.failedRequired.length > 0
      ? 'warning'
      : 'attention';
  const checkoutLaunchLabel = setupComplete
    ? 'Launch ready'
    : checkoutHealthSnapshot.failedRequired.length > 0
      ? `${checkoutHealthSnapshot.failedRequired.length} blocker(s)`
      : 'Needs review';
  const checkoutDiagCheckedLabel = useMemo(
    () => formatRelativeTime(checkoutDiagLastCheckedAt),
    [checkoutDiagLastCheckedAt]
  );
  const checkoutDiagIsStale = useMemo(() => {
    if (!checkoutDiagLastCheckedAt) return true;
    const checkedMs = new Date(checkoutDiagLastCheckedAt).getTime();
    if (!Number.isFinite(checkedMs)) return true;
    return Date.now() - checkedMs > CHECKOUT_DIAG_STALE_AFTER_MS;
  }, [checkoutDiagLastCheckedAt]);
  const priceMethodReadiness = useMemo(() => {
    const discountFunctionAvailable =
      checkoutDiag?.infrastructure?.discount_function_available === true;
    const cartTransformAvailable =
      checkoutDiag?.infrastructure?.cart_transform_function_available === true;
    const cartTransformInstalled = checkoutDiag?.infrastructure?.cart_transform_installed === true;
    const cartTransformInstallCheckStatus = String(
      checkoutDiag?.infrastructure?.cart_transform_install_check_status || ''
    )
      .trim()
      .toLowerCase();
    const scriptDetected = installation?.scriptVerified === true;
    const directPriceReady = cartTransformAvailable && cartTransformInstalled;
    const directPriceUnknown =
      cartTransformAvailable && cartTransformInstallCheckStatus === 'scope_missing';

    return [
      {
        id: 'price_direct_override',
        title: 'Price tests (Direct Price Override)',
        tone: directPriceReady ? 'success' : 'warning',
        status: directPriceReady
          ? 'Ready'
          : directPriceUnknown
            ? 'Unknown install state'
            : cartTransformAvailable
              ? 'Needs install'
              : 'Needs deploy',
        summary: directPriceReady
          ? 'Cart Transform is deployed and installed, so Price tests can apply direct unit prices at cart and checkout.'
          : directPriceUnknown
            ? 'Cart Transform function is deployed, but install state could not be verified with current app scopes.'
            : cartTransformAvailable
              ? 'Cart Transform function is deployed but not installed on this shop yet.'
              : 'Cart Transform function is not detected yet, so Price tests cannot apply direct checkout price overrides reliably.',
        nextAction: directPriceReady
          ? 'Use Price tests for lower or higher selling prices. Configure per-product and per-variant values in the matrix.'
          : directPriceUnknown
            ? 'Re-open/re-install the app with read_cart_transforms scope, then run diagnostics again.'
            : cartTransformAvailable
              ? 'Click "Install/ensure cart transform" in this section, then rerun diagnostics.'
              : 'Deploy and activate RipX Cart Transform first, then rerun diagnostics.',
      },
      {
        id: 'offer_discount_path',
        title: 'Offer tests (Discount function)',
        tone:
          checkoutDiag?.summary?.overall_ok && discountFunctionAvailable ? 'success' : 'warning',
        status:
          checkoutDiag?.summary?.overall_ok && discountFunctionAvailable ? 'Ready' : 'Needs setup',
        summary:
          checkoutDiag?.summary?.overall_ok && discountFunctionAvailable
            ? 'Discount function infrastructure is healthy for promo and offer campaigns.'
            : 'Offer checkout path needs the RipX discount function attached and diagnostics passing.',
        nextAction:
          checkoutDiag?.summary?.overall_ok && discountFunctionAvailable
            ? 'Use Offer tests for discount messaging, promo campaigns, and free-shipping incentives.'
            : 'Attach the RipX discount function in this screen, then verify again.',
      },
      {
        id: 'legacy_compatibility',
        title: 'Legacy compatibility',
        tone: scriptDetected ? 'attention' : 'warning',
        status: scriptDetected ? 'Supported (legacy)' : 'Script missing',
        summary: scriptDetected
          ? 'Legacy checkout methods from older tests remain readable, but new Price tests are saved as Direct Price Override.'
          : 'Storefront script is not confirmed, so legacy fallback behaviors are not guaranteed.',
        nextAction:
          'Keep older tests running as-is during migration. Create new promo campaigns with Offer tests and new pricing campaigns with the matrix-based Price tests.',
      },
    ];
  }, [checkoutDiag, installation?.scriptVerified]);
  const checkoutExperienceInventory = useMemo(() => {
    return getCheckoutExperienceTestInventory(checkoutCustomizationTests).map(item => ({
      ...item,
      detailPath:
        isAppSettings && installation?.domain
          ? ROUTES.appTestDetail(installation.domain, item.id)
          : ROUTES.TEST_DETAIL(item.id),
    }));
  }, [checkoutCustomizationTests, installation?.domain, isAppSettings]);
  const checkoutExperienceInventorySummary = useMemo(() => {
    return summarizeCheckoutExperienceInventory(checkoutExperienceInventory);
  }, [checkoutExperienceInventory]);
  const checkoutExperienceReadiness = useMemo(() => {
    const summary = checkoutExperienceDiag?.summary || null;
    const checks = Array.isArray(checkoutExperienceDiag?.checklist)
      ? checkoutExperienceDiag.checklist
      : [];
    const blockers = checks.filter(
      item => item?.ok === false && String(item?.severity || '').toLowerCase() === 'error'
    ).length;
    const warnings = checks.filter(
      item => item?.ok === false && String(item?.severity || '').toLowerCase() !== 'error'
    ).length;
    const supportLevel = String(
      checkoutExperienceDiag?.support?.checkout_ui_extension?.level || ''
    ).toLowerCase();
    const savedExperienceSummary =
      checkoutExperienceInventorySummary.testCount > 0
        ? `${checkoutExperienceInventorySummary.testCount} saved experience test${checkoutExperienceInventorySummary.testCount === 1 ? '' : 's'} with ${checkoutExperienceInventorySummary.renderableSections} renderable section${checkoutExperienceInventorySummary.renderableSections === 1 ? '' : 's'} across ${checkoutExperienceInventorySummary.actionableVariants} treatment variant${checkoutExperienceInventorySummary.actionableVariants === 1 ? '' : 's'}.`
        : 'No saved checkout experience tests yet.';
    return [
      {
        id: 'checkout_experience',
        title: 'Checkout experience',
        tone:
          summary?.overall_ok || supportLevel === 'ready'
            ? 'success'
            : blockers > 0
              ? 'critical'
              : 'warning',
        status:
          summary?.overall_ok || supportLevel === 'ready'
            ? 'Ready'
            : blockers > 0
              ? 'Blocked'
              : 'Needs sync',
        summary:
          `${checkoutExperienceDiag?.support?.checkout_ui_extension?.summary || 'Verify the checkout UI extension config before launching content-based checkout tests.'} ${savedExperienceSummary}`.trim(),
        nextAction:
          blockers > 0
            ? 'Set app URLs/secrets and redeploy the checkout UI extension before launch.'
            : warnings > 0
              ? 'Run the checkout UI config sync command and rebuild the extension so Settings, Wizard, and Test Detail agree.'
              : checkoutExperienceInventorySummary.testCount > 0
                ? 'Open a saved experience test below to refine sections, then launch trust, reassurance, and offer-message experiments at checkout.'
                : 'Create a Checkout Test in the Experience phase to launch trust, reassurance, and offer-message experiments at checkout.',
      },
      {
        id: 'payment_methods',
        title: 'Payment methods',
        tone: shopifyFnInventory?.readiness?.payment_customization_for_checkout
          ? 'success'
          : 'warning',
        status: shopifyFnInventory?.readiness?.payment_customization_for_checkout
          ? 'Ready'
          : 'Needs deploy',
        summary: shopifyFnInventory?.readiness?.payment_customization_for_checkout
          ? 'Payment customization capability is visible in Shopify function inventory.'
          : 'Payment-method experiments need the RipX payment customization function deployed on the shop.',
        nextAction: shopifyFnInventory?.readiness?.payment_customization_for_checkout
          ? 'Create checkout tests in the Payment methods phase to hide, rename, or reorder payment options.'
          : 'Deploy the RipX payment customization extension, then reopen Settings to verify it is visible to Admin API.',
      },
      {
        id: 'delivery_methods',
        title: 'Delivery methods',
        tone: shopifyFnInventory?.readiness?.delivery_customization_for_checkout
          ? 'success'
          : 'warning',
        status: shopifyFnInventory?.readiness?.delivery_customization_for_checkout
          ? 'Ready'
          : 'Needs deploy',
        summary: shopifyFnInventory?.readiness?.delivery_customization_for_checkout
          ? 'Delivery customization capability is visible in Shopify function inventory.'
          : 'Delivery-method experiments need the RipX delivery customization function deployed on the shop.',
        nextAction: shopifyFnInventory?.readiness?.delivery_customization_for_checkout
          ? 'Use delivery-method phases for hide/rename/reorder experiments; keep shipping price/rate tests on the shipping surface.'
          : 'Deploy the RipX delivery customization extension before launching delivery-method experiments.',
      },
      {
        id: 'offer_path',
        title: 'Offer path',
        tone:
          checkoutDiag?.summary?.overall_ok &&
          checkoutDiag?.infrastructure?.discount_function_available === true
            ? 'success'
            : 'warning',
        status:
          checkoutDiag?.summary?.overall_ok &&
          checkoutDiag?.infrastructure?.discount_function_available === true
            ? 'Ready'
            : 'Needs setup',
        summary:
          checkoutDiag?.summary?.overall_ok &&
          checkoutDiag?.infrastructure?.discount_function_available === true
            ? 'Discount function configuration is aligned for offer and promo paths.'
            : 'Offer tests still depend on the RipX discount function being attached and healthy.',
        nextAction:
          checkoutDiag?.summary?.overall_ok &&
          checkoutDiag?.infrastructure?.discount_function_available === true
            ? 'Launch offer campaigns with checkout discount-code or auto-apply flows.'
            : 'Attach the RipX discount function, then rerun diagnostics before launching offer tests.',
      },
      {
        id: 'shipping_path',
        title: 'Shipping path',
        tone:
          checkoutDiag?.infrastructure?.discount_function_available === true ||
          shopifyFnInventory?.readiness?.delivery_customization_for_checkout
            ? 'info'
            : 'warning',
        status:
          checkoutDiag?.infrastructure?.discount_function_available === true ||
          shopifyFnInventory?.readiness?.delivery_customization_for_checkout
            ? 'Partial readiness'
            : 'Needs prerequisites',
        summary:
          checkoutDiag?.infrastructure?.discount_function_available === true ||
          shopifyFnInventory?.readiness?.delivery_customization_for_checkout
            ? 'At least one Shopify shipping execution path is visible. Exact readiness still depends on the selected strategy, CarrierService/profile bindings, and per-test diagnostics.'
            : 'Shipping tests need a compatible Shopify execution path: discount function for shipping discounts, delivery customization for method changes, or manual carrier setup.',
        nextAction:
          checkoutDiag?.infrastructure?.discount_function_available === true ||
          shopifyFnInventory?.readiness?.delivery_customization_for_checkout
            ? 'Open a shipping test, select control methods, run diagnostics, then dry run before apply.'
            : 'Run checkout diagnostics and deploy the relevant Shopify extensions or configure carrier/manual setup before launching shipping variants.',
      },
    ];
  }, [
    checkoutDiag,
    checkoutExperienceDiag,
    checkoutExperienceInventorySummary,
    shopifyFnInventory,
  ]);
  const deployableCheckoutCustomizationTests = useMemo(() => {
    return (Array.isArray(checkoutCustomizationTests) ? checkoutCustomizationTests : [])
      .filter(
        test =>
          String(test?.type || '')
            .trim()
            .toLowerCase() === 'checkout'
      )
      .map(test => {
        const phase = normalizeCheckoutPhaseValue(test?.goal?.checkout_phase);
        if (phase !== 'payment_method' && phase !== 'delivery_method') {
          return null;
        }
        const variants = Array.isArray(test?.variants) ? test.variants : [];
        const actionableVariants = variants.filter((variant, index) => {
          if (index === 0 || /^control\b/i.test(String(variant?.name || '').trim())) {
            return false;
          }
          const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
          const rawList =
            phase === 'payment_method' ? cfg.payment_method_names : cfg.delivery_method_names;
          const items = Array.isArray(rawList)
            ? rawList.filter(Boolean)
            : String(rawList || '')
                .split(/\n|,/)
                .map(item => item.trim())
                .filter(Boolean);
          return items.length > 0;
        }).length;
        return {
          id: test?.id || null,
          name: String(test?.name || 'Untitled checkout test').trim(),
          status: String(test?.status || 'draft').trim() || 'draft',
          phase,
          phaseLabel: getCheckoutPhaseDisplayLabel(phase),
          actionableVariants,
          detailPath:
            isAppSettings && installation?.domain
              ? ROUTES.appTestDetail(installation.domain, test.id)
              : ROUTES.TEST_DETAIL(test.id),
        };
      })
      .filter(item => item?.id);
  }, [checkoutCustomizationTests, installation?.domain, isAppSettings]);
  const handleEnsureCheckoutCustomizationFromSettings = useCallback(
    async (testId, apply) => {
      if (!testId) return;
      setCheckoutCustomizationAction({
        testId,
        mode: apply ? 'apply' : 'dry_run',
      });
      setCheckoutCustomizationTestsError(null);
      try {
        const response = await apiPost(`/tests/${testId}/checkout/customization/ensure`, {
          apply: Boolean(apply),
          dry_run: !apply,
        });
        const payload = unwrapData(response);
        setMessage(
          payload?.message ||
            (apply
              ? 'Checkout customization applied successfully'
              : 'Checkout customization dry run completed')
        );
        if (apply) {
          fetchCheckoutCustomizationTests();
        }
      } catch (err) {
        setMessage(
          `Failed to ensure checkout customization: ${
            err?.response?.data?.details?.[0] ||
            err?.response?.data?.error ||
            err?.message ||
            'Unknown error'
          }`
        );
      } finally {
        setCheckoutCustomizationAction(null);
      }
    },
    [fetchCheckoutCustomizationTests]
  );
  const selectedSettingsPresetKey = useMemo(
    () => resolveSettingsPresetKey(settings, SETTINGS_PRESETS),
    [settings.minSampleSize, settings.confidenceLevel, settings.autoStopEnabled]
  );
  const generalDefaultsOverview = useMemo(
    () => [
      {
        id: 'preset',
        label: 'Operating mode',
        value: selectedSettingsPresetKey
          ? SETTINGS_PRESETS[selectedSettingsPresetKey]?.label || 'Custom'
          : 'Custom',
        hint: selectedSettingsPresetKey
          ? 'Matches one of the quick presets'
          : 'Uses a custom mix of defaults',
      },
      {
        id: 'sample',
        label: 'Minimum sample',
        value: `${Number(settings.minSampleSize || DEFAULT_SETTINGS.minSampleSize)}`,
        hint: 'Visitors required before results are shown',
      },
      {
        id: 'confidence',
        label: 'Confidence target',
        value: `${Math.round(
          Number(settings.confidenceLevel || DEFAULT_SETTINGS.confidenceLevel) * 100
        )}%`,
        hint: 'Higher values wait for stronger evidence',
      },
      {
        id: 'autostop',
        label: 'Auto-stop',
        value: settings.autoStopEnabled ? 'Enabled' : 'Manual',
        hint: settings.autoStopEnabled
          ? 'Tests can stop automatically when a winner is clear'
          : 'Operators review and stop tests manually',
      },
    ],
    [
      selectedSettingsPresetKey,
      settings.minSampleSize,
      settings.confidenceLevel,
      settings.autoStopEnabled,
    ]
  );
  const integrationsOverview = useMemo(() => {
    const ga4Configured = integrations?.ga4?.configured === true;
    const bigQueryConfigured = integrations?.bigquery?.configured === true;
    const lastExport = integrations?.bigquery?.lastExportAt || null;
    const lastExportLabel = formatRelativeTime(lastExport);

    return [
      {
        id: 'connections',
        label: 'Connected tools',
        value: `${configuredIntegrationCount}/${INTEGRATIONS_CONFIG.length}`,
        hint:
          configuredIntegrationCount > 0
            ? 'Live analytics destinations configured'
            : 'No destinations connected yet',
      },
      {
        id: 'ga4',
        label: 'GA4',
        value: ga4Configured ? 'Active' : 'Not configured',
        hint: ga4Configured
          ? 'Measurement forwarding is enabled'
          : 'Add Measurement ID and API secret',
      },
      {
        id: 'bigquery',
        label: 'BigQuery',
        value: bigQueryConfigured ? 'Configured' : 'Not configured',
        hint: bigQueryConfigured
          ? `Last export ${lastExportLabel || 'not run yet'}`
          : 'Connect GCP project, dataset, and service account',
      },
    ];
  }, [configuredIntegrationCount, integrations]);
  const appSettingsSectionIndex = useMemo(
    () => [
      {
        id: 'installation',
        label: 'Installation',
        shortLabel: 'IN',
        status: setupComplete ? 'ok' : 'warn',
      },
      {
        id: 'general',
        label: 'Test defaults',
        shortLabel: 'TD',
        status: 'neutral',
      },
      {
        id: 'integrations',
        label: 'Connections',
        shortLabel: 'CN',
        status: configuredIntegrationCount > 0 ? 'ok' : 'neutral',
      },
      {
        id: 'presets',
        label: 'Targeting presets',
        shortLabel: 'PR',
        status: Array.isArray(targetingPresets) && targetingPresets.length > 0 ? 'ok' : 'neutral',
      },
    ],
    [setupComplete, configuredIntegrationCount, targetingPresets]
  );
  const activeTabMeta = TAB_CONFIG[selectedTab] || null;
  const currentStoreLabel =
    String(appSettingsDomain || installation?.domain || '').trim() || 'Not detected';
  const tabSummaries = useMemo(
    () => ({
      installation: setupComplete
        ? 'Install, discount attach, and diagnostics are synchronized.'
        : 'Complete discount attach and checks to finish setup.',
      general: 'Configure sample size, confidence level, and webhook behavior.',
      integrations:
        configuredIntegrationCount > 0
          ? `${configuredIntegrationCount} integration(s) configured and active.`
          : 'Connect GA4 or BigQuery to activate external analytics flow.',
      presets: `${Array.isArray(targetingPresets) ? targetingPresets.length : 0} saved targeting preset(s).`,
      advanced: 'Diagnostics, preview probes, function inventory, and JSON export for support.',
      account:
        'Personal theme and display preferences live in Profile. Store settings live inside each store.',
    }),
    [setupComplete, configuredIntegrationCount, targetingPresets]
  );
  const tabStatusMeta = useMemo(
    () => ({
      installation: {
        label: setupComplete ? 'Ready' : 'Needs setup',
        status: setupComplete ? 'ok' : 'warn',
      },
      general: {
        label: selectedSettingsPresetKey
          ? SETTINGS_PRESETS[selectedSettingsPresetKey]?.label || 'Preset'
          : 'Custom',
        status: selectedSettingsPresetKey ? 'ok' : 'neutral',
      },
      integrations: {
        label: configuredIntegrationCount > 0 ? `${configuredIntegrationCount} linked` : 'Optional',
        status: configuredIntegrationCount > 0 ? 'ok' : 'neutral',
      },
      presets: {
        label: `${Array.isArray(targetingPresets) ? targetingPresets.length : 0} saved`,
        status: Array.isArray(targetingPresets) && targetingPresets.length > 0 ? 'ok' : 'neutral',
      },
      advanced: {
        label: 'Support tools',
        status: 'neutral',
      },
    }),
    [configuredIntegrationCount, selectedSettingsPresetKey, setupComplete, targetingPresets]
  );

  const appSettingsSubtitleHelp =
    'Manage store setup, testing defaults, integrations, targeting presets, and advanced troubleshooting for this shop.';

  const metricTips = useMemo(
    () => ({
      activeSection: 'Currently selected tab.',
      store: 'Shop currently being configured.',
      connections: 'Connected GA4 and BigQuery integrations.',
      checks: 'Setup health checks for snippet, discount, and checkout alignment.',
    }),
    []
  );

  const systemsMetrics = useMemo(() => {
    if (!isAppSettings) return [];
    return buildSettingsSystemsMetrics({
      storeHealth,
      checkoutDiagLastCheckedAt,
      checkoutDiagLoading,
      configuredIntegrationCount,
      integrationsTotal: INTEGRATIONS_CONFIG.length,
      setupComplete,
      formatRelativeTime,
    });
  }, [
    isAppSettings,
    storeHealth,
    checkoutDiagLastCheckedAt,
    checkoutDiagLoading,
    configuredIntegrationCount,
    setupComplete,
  ]);

  const showSystemsMetrics = isAppSettings && !settingsLoadError;

  const installationHubPath = useMemo(() => {
    if (!appSettingsDomain) return ROUTES.PROFILE_ACCOUNT;
    return `${ROUTES.appSettings(appSettingsDomain)}?tab=installation&guided_setup=1`;
  }, [appSettingsDomain]);
  const isInstallationSectionActive = isAppSettings && activeTabId === 'installation';
  const isFocusedInstallationMode =
    isAppSettings && isGuidedSetupMode && activeTabId === 'installation';
  const showInstallationSupportCards =
    !installation ||
    installationLoading ||
    installationError ||
    installation.platform !== 'shopify';

  const densityHelp = 'Comfortable adds more spacing. Compact shows more on screen.';
  const generalSectionSummary = useMemo(() => {
    const operatingMode = selectedSettingsPresetKey
      ? SETTINGS_PRESETS[selectedSettingsPresetKey]?.label || 'Custom'
      : 'Custom';
    const sampleSize = Number(settings.minSampleSize || DEFAULT_SETTINGS.minSampleSize);
    const confidence = Math.round(
      Number(settings.confidenceLevel || DEFAULT_SETTINGS.confidenceLevel) * 100
    );
    return `${operatingMode} mode with ${sampleSize} minimum visitors, ${confidence}% confidence, and ${
      settings.autoStopEnabled ? 'auto-stop enabled' : 'manual stop only'
    }.`;
  }, [
    selectedSettingsPresetKey,
    settings.minSampleSize,
    settings.confidenceLevel,
    settings.autoStopEnabled,
  ]);
  const webhookEventsSummary = useMemo(() => {
    const selectedValues =
      Array.isArray(settings.outboundWebhookEvents) && settings.outboundWebhookEvents.length > 0
        ? settings.outboundWebhookEvents
        : DEFAULT_SETTINGS.outboundWebhookEvents;
    const labels = WEBHOOK_EVENT_CHOICES.filter(choice =>
      selectedValues.includes(choice.value)
    ).map(choice => choice.label);
    return labels.join(', ') || 'No events selected';
  }, [settings.outboundWebhookEvents]);
  const webhookDeliveryStatus = useMemo(() => {
    return String(settings.outboundWebhookUrl || '').trim() ? 'Enabled' : 'Disabled';
  }, [settings.outboundWebhookUrl]);
  const integrationsSectionSummary = useMemo(() => {
    if (configuredIntegrationCount === 0) {
      return 'No external analytics destinations are connected yet. Add GA4 or BigQuery only when you need them.';
    }
    return `${configuredIntegrationCount}/${INTEGRATIONS_CONFIG.length} destinations connected. GA4 is ${
      integrations?.ga4?.configured ? 'active' : 'not configured'
    } and BigQuery is ${integrations?.bigquery?.configured ? 'configured' : 'not configured'}.`;
  }, [configuredIntegrationCount, integrations]);
  const presetsSectionSummary = useMemo(() => {
    if (targetingPresets.length === 0) {
      return 'No saved targeting presets yet. Create one in the Test Wizard when you want reusable targeting.';
    }
    return `${targetingPresets.length} saved targeting preset${
      targetingPresets.length === 1 ? '' : 's'
    } ready to reuse in the Test Wizard.`;
  }, [targetingPresets]);
  const handleApplyPreset = useCallback(
    async (key, preset) => {
      setPresetApplyingKey(key);
      const next = {
        ...settings,
        minSampleSize: preset.minSampleSize,
        confidenceLevel: preset.confidenceLevel,
        autoStopEnabled: preset.autoStopEnabled,
      };
      setSettings(next);
      setMessage(`Applying "${preset.label}"…`);
      try {
        await apiPut('/settings', next);
        setMessage(`"${preset.label}" preset saved`);
      } catch (err) {
        setMessage(err?.response?.data?.error || 'Failed to apply preset');
      } finally {
        setPresetApplyingKey(null);
      }
    },
    [settings]
  );

  const handleCopyDiagnosticsJson = useCallback(() => {
    handleCopy(
      JSON.stringify({ checkoutDiag, shopifyFnInventory, storeHealth }, null, 2),
      'Diagnostics JSON copied'
    );
  }, [checkoutDiag, shopifyFnInventory, storeHealth, handleCopy]);

  const focusAdvancedTab = useCallback(() => {
    focusAppSection('advanced');
  }, [focusAppSection]);

  const installationCheckRows = useMemo(() => {
    if (!installation) return [];
    return [
      {
        id: 'script',
        title: 'Storefront script',
        tone: installation.scriptVerified ? 'success' : 'warning',
        status: installation.scriptVerified ? 'Detected' : 'Needs check',
        summary: installation.scriptVerified ? 'Loading on storefront.' : 'Verify script install.',
        actionLabel: 'Check',
        onAction: () => runCheckoutDiagnostics(),
        loading: checkoutDiagLoading,
        disabled: checkoutDiagLoading || checkoutFullVerifyRunning,
        secondaryLabel: 'Head script',
        onSecondaryAction: () => setInstallSnippetModalOpen(true),
      },
      {
        id: 'store-health',
        title: 'Store health',
        tone: storeHealth.ready ? 'success' : 'warning',
        status: storeHealth.ready ? 'Passing' : `${storeHealth.failed.length} issue(s)`,
        summary: storeHealth.ready
          ? 'Required checks pass.'
          : storeHealth.failed[0]?.message || 'Run checks.',
        actionLabel: 'Run',
        onAction: () => runFullCheckoutVerification(),
        loading: checkoutFullVerifyRunning,
        disabled:
          checkoutFullVerifyRunning ||
          checkoutCartTransformEnsuring ||
          checkoutDiscountEnsuring ||
          checkoutDiagLoading,
      },
      {
        id: 'shop-session-reset',
        title: 'Reinstall auth reset',
        tone: shopifyAdminAuthFailed ? 'critical' : 'attention',
        status: shopifyAdminAuthFailed ? 'Auth refresh required' : 'Manual recovery',
        summary: shopifyAdminAuthFailed
          ? 'Detected Shopify Admin token/auth failure. Reset and reinstall to refresh OAuth.'
          : 'Use this before reinstall when token/session looks stale.',
        actionLabel: 'Reset session',
        onAction: () => resetShopSessionForReinstall(),
        actionTooltip:
          'Deletes the stored Shopify token/session for this shop. Use this before reinstall when auth is stale.',
        loading: shopSessionResetting,
        disabled:
          shopSessionResetting ||
          shopInstallLinkOpening ||
          checkoutDiagLoading ||
          checkoutDiscountEnsuring ||
          checkoutCartTransformEnsuring ||
          checkoutFullVerifyRunning,
        secondaryLabel: 'Open install link',
        onSecondaryAction: () => openShopifyInstallLink(),
        secondaryTooltip:
          'Opens the shop-specific install link so you can re-authorize immediately after reset.',
      },
      {
        id: 'offer-readiness',
        title: 'Offer checkout path',
        tone: checkoutDiscountAttached ? 'success' : 'warning',
        status: checkoutDiscountAttached ? 'Ready' : 'Needs install',
        summary: checkoutDiscountAttached ? 'Offer path attached.' : 'Attach automatic discount.',
        actionLabel: 'Install',
        onAction: () => ensureCheckoutDiscount(),
        loading: checkoutDiscountEnsuring,
        disabled: checkoutDiscountEnsuring || checkoutFullVerifyRunning,
      },
    ];
  }, [
    installation,
    storeHealth,
    checkoutDiagLoading,
    checkoutFullVerifyRunning,
    checkoutCartTransformEnsuring,
    checkoutDiscountEnsuring,
    shopSessionResetting,
    shopInstallLinkOpening,
    shopifyAdminAuthFailed,
    checkoutDiscountAttached,
    runCheckoutDiagnostics,
    runFullCheckoutVerification,
    resetShopSessionForReinstall,
    openShopifyInstallLink,
    ensureCheckoutDiscount,
  ]);
  const cartTransformDetectedInInventory =
    shopifyFnInventory?.readiness?.cart_transform_for_direct_price === true;
  const cartTransformInstalled =
    checkoutDiag?.infrastructure?.cart_transform_installed === true &&
    cartTransformDetectedInInventory;
  const installationActionRows = useMemo(() => {
    if (!installation || installation.platform !== 'shopify') return [];
    return [
      {
        id: 'cart-transform',
        title: 'Direct price override',
        tone: cartTransformInstalled ? 'success' : 'warning',
        status: cartTransformInstalled ? 'Installed' : 'Needs install',
        summary: cartTransformInstalled ? 'Price override ready.' : 'Install cart transform.',
        actionLabel: 'Install',
        onAction: () => ensureCartTransform(),
        loading: checkoutCartTransformEnsuring,
        disabled: checkoutCartTransformEnsuring || checkoutFullVerifyRunning,
      },
      {
        id: 'diagnostics',
        title: 'Checkout diagnostics',
        tone: checkoutDiag?.summary?.overall_ok ? 'success' : 'attention',
        status: checkoutDiag?.summary?.overall_ok ? 'Passing' : 'Needs review',
        summary: checkoutDiag?.summary?.overall_ok
          ? 'Diagnostics passed.'
          : 'Run after URL/scope changes.',
        actionLabel: 'Run',
        onAction: () => runCheckoutDiagnostics(),
        loading: checkoutDiagLoading,
        disabled: checkoutDiagLoading || checkoutFullVerifyRunning,
        secondaryLabel: 'Advanced',
        onSecondaryAction: () => focusAdvancedTab(),
      },
      {
        id: 'discount-list',
        title: 'Discount list check',
        tone: checkoutDiscountListCheck?.inList ? 'success' : 'attention',
        status: checkoutDiscountListCheck?.inList ? 'Found in Shopify' : 'Not checked',
        summary: checkoutDiscountListCheck?.inList ? 'Discount found.' : 'Confirm in Shopify.',
        actionLabel: 'Check',
        onAction: () => runCheckoutDiscountListCheck(),
        loading: checkoutDiscountListCheckLoading,
        disabled:
          checkoutDiscountListCheckLoading || checkoutDiscountEnsuring || checkoutFullVerifyRunning,
        secondaryLabel: 'Debug',
        onSecondaryAction: () => focusAdvancedTab(),
      },
    ];
  }, [
    installation,
    cartTransformInstalled,
    checkoutDiag,
    checkoutDiagLoading,
    checkoutFullVerifyRunning,
    checkoutDiscountListCheck,
    checkoutDiscountListCheckLoading,
    checkoutDiscountEnsuring,
    checkoutCartTransformEnsuring,
    ensureCartTransform,
    runCheckoutDiagnostics,
    runCheckoutDiscountListCheck,
    focusAdvancedTab,
  ]);
  const installationChecklistRows = useMemo(
    () => [
      ...installationCheckRows.map(item => ({ ...item, group: 'Verify' })),
      ...installationActionRows.map(item => ({ ...item, group: 'Install' })),
    ],
    [installationActionRows, installationCheckRows]
  );
  const storeSetupProgress = useMemo(() => {
    const total = installationChecklistRows.length;
    const completed = installationChecklistRows.filter(item => item.tone === 'success').length;
    return { completed, total };
  }, [installationChecklistRows]);
  return (
    <SettingsPageShell
      pageShell={{
        message,
        messageType: message?.includes('Failed') ? 'error' : 'success',
        onCloseMessage: () => setMessage(null),
        messageDuration: message?.includes('Failed') ? 5000 : 3000,
        layoutDensityClass: layoutDensity === 'compact' ? styles.settingsDensityCompact : '',
      }}
      header={{
        isAppSettings,
        title: isAppSettings ? 'Store settings' : 'Account settings',
        subtitle: isAppSettings
          ? isFocusedInstallationMode || isInstallationSectionActive
            ? 'Install, verify, launch.'
            : 'Store setup and defaults.'
          : 'Personal preferences live in Profile.',
        subtitleHelp: appSettingsSubtitleHelp,
        showSetupBadge: isAppSettings && !isFocusedInstallationMode && !isInstallationSectionActive,
        setupComplete,
        showSystemsMetrics,
        systemsMetrics,
        onSystemsMetricSelect: focusAppSection,
        showQuickNav:
          isAppSettings &&
          showAllAppSections &&
          !isFocusedInstallationMode &&
          !isInstallationSectionActive,
        quickNavSections: appSettingsSectionIndex,
        activeAppSectionId,
        onQuickNavSelect: scrollToAppSection,
        showAccountFallback: !isAppSettings,
        settingsLoadError,
        onDismissLoadError: () => setSettingsLoadError(false),
        onRetrySettings: fetchSettings,
        isGuidedSetupMode,
        onClearGuidedSetup: clearGuidedSetupMode,
        showSetupFirstBanner:
          isAppSettings && !setupComplete && !isGuidedSetupMode && !isInstallationSectionActive,
        installationHubPath,
      }}
      mainRef={settingsBodyRef}
      isAppSettings={isAppSettings}
      showTabBar={!showAllAppSections}
      tabBar={{
        visibleTabEntries,
        selectedTab,
        tabStatusMeta,
        onSelectTab: setSelectedTab,
        onKeyDown: handleTabNavKeyDown,
      }}
      loading={loading}
      showAllAppSections={showAllAppSections}
      sectionRailCollapsed={sectionRailCollapsed}
      rail={{
        collapsed: sectionRailCollapsed,
        onToggleCollapsed: () => setSectionRailCollapsed(prev => !prev),
        sections: appSettingsSectionIndex,
        activeSectionId: activeAppSectionId,
        onSelectSection: scrollToAppSection,
        activeTooltipId: activeRailTooltipId,
        onScheduleTooltipOpen: scheduleRailTooltipOpen,
        onHideTooltip: hideRailTooltip,
        onFocusTooltip: setActiveRailTooltipId,
        onClearTooltipTimer: clearRailTooltipTimer,
      }}
      showDisplayOptions={!isFocusedInstallationMode}
      displayOptions={{
        isAppSettings,
        isGuidedSetupMode,
        settingsLayoutMode,
        onSettingsLayoutModeChange: setSettingsLayoutMode,
        layoutDensity,
        onLayoutDensityChange: setLayoutDensity,
      }}
      tabIntro={
        !showAllAppSections && activeTabMeta ? (
          <SettingsTabIntro
            eyebrow={activeTabMeta.eyebrow}
            title={activeTabMeta.label}
            description={activeTabMeta.description}
          />
        ) : null
      }
      showAboutCard={!(isAppSettings && showAllAppSections)}
      modals={
        <>
          <WebhooksSettingsModal
            open={webhooksModalOpen}
            onClose={() => setWebhooksModalOpen(false)}
            settings={settings}
            onSettingsChange={setSettings}
            webhookError={webhookError}
            onWebhookErrorChange={setWebhookError}
            onSave={handleSave}
            saving={saving}
          />
          <InstallSnippetModal
            open={installSnippetModalOpen}
            onClose={handleCloseInstallSnippetModal}
            installation={installation}
            onCopy={handleCopy}
            onCopySnippet={handleCopySnippet}
            onRunCheckoutDiagnostics={runCheckoutDiagnostics}
          />
          <DeletePresetModal
            open={!!deletePresetId}
            loading={deletePresetLoading}
            onClose={() => !deletePresetLoading && setDeletePresetId(null)}
            onConfirm={async () => {
              if (!deletePresetId) return;
              setDeletePresetLoading(true);
              try {
                await apiDelete(`/targeting-presets/${deletePresetId}`);
                await fetchPresets();
                setDeletePresetId(null);
              } catch (err) {
                setMessage(err?.response?.data?.error || 'Failed to delete');
              } finally {
                setDeletePresetLoading(false);
              }
            }}
          />
        </>
      }
    >
      {!isAppSettings && activeTabId === 'account' && (
        <div
          id="settings-panel-account"
          role="tabpanel"
          aria-labelledby="settings-tab-account"
          className={`${styles.settingsContent} ${styles.settingsPanelLayout}`}
        >
          <Card className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}>
            <Box padding="500">
              <BlockStack gap="400">
                <div className={styles.sectionHeader}>
                  <div className={styles.sectionHeaderIcon}>
                    <SettingsIcon />
                  </div>
                  <div className={styles.sectionHeaderContent}>
                    <Text variant="headingMd" as="h2">
                      Account settings moved to the right scope
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Use Profile for user-specific appearance and display preferences. Open a store
                      from Home for per-store installation, defaults, integrations, and targeting
                      presets.
                    </Text>
                  </div>
                </div>
                <InlineStack gap="200" wrap>
                  <Link to={ROUTES.PROFILE_APPEARANCE} className={styles.quickLinkBtn}>
                    Profile appearance
                  </Link>
                  <Link to={ROUTES.USER_PANEL} className={styles.quickLinkBtn}>
                    Open stores
                  </Link>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </div>
      )}

      {isAppSettings && (showAllAppSections || activeTabId === 'installation') && (
        <div
          id="settings-panel-installation"
          ref={node => setAppSectionNode('installation', node)}
          data-app-section="installation"
          role={showAllAppSections ? 'region' : 'tabpanel'}
          aria-labelledby={showAllAppSections ? undefined : 'settings-tab-installation'}
          aria-label={showAllAppSections ? 'Store setup settings' : undefined}
          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelInstallation}`}
        >
          <StoreSettingsStoreSetupSection
            showAllAppSections={showAllAppSections}
            installation={installation}
            installationLoading={installationLoading}
            installationError={installationError}
            setupComplete={setupComplete}
            storeSetupProgress={storeSetupProgress}
            installationChecklistRows={installationChecklistRows}
            storeHealth={storeHealth}
            checkoutLaunchTone={checkoutLaunchTone}
            checkoutLaunchLabel={checkoutLaunchLabel}
            checkoutDiagCheckedLabel={checkoutDiagCheckedLabel}
            checkoutDiagIsStale={checkoutDiagIsStale}
            onOpenAdvanced={focusAdvancedTab}
            onOpenSnippetModal={() => setInstallSnippetModalOpen(true)}
            onFetchInstallation={fetchInstallation}
            showInstallationSupportCards={showInstallationSupportCards}
            copiedSnippet={copiedSnippet}
            onCopySnippet={handleCopySnippet}
            onCopy={handleCopy}
          />
        </div>
      )}

      {isAppSettings && (showAllAppSections || activeTabId === 'general') && (
        <div
          id="settings-panel-general"
          ref={node => setAppSectionNode('general', node)}
          data-app-section="general"
          role={showAllAppSections ? 'region' : 'tabpanel'}
          aria-labelledby={showAllAppSections ? undefined : 'settings-tab-general'}
          aria-label={showAllAppSections ? 'Testing defaults settings' : undefined}
          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelGeneral}`}
        >
          {showAllAppSections && (
            <SettingsSectionLead
              title="Testing defaults"
              summary={generalSectionSummary}
              badgeLabel={selectedSettingsPresetKey ? 'Preset aligned' : 'Custom mix'}
              badgeTone={selectedSettingsPresetKey ? 'success' : 'attention'}
              actionLabel="Open only this section"
              onAction={() => focusAppSection('general')}
            />
          )}
          <StoreSettingsTestingDefaultsSection
            showAllAppSections={showAllAppSections}
            showStandaloneApiKey={isStandaloneMode()}
            settings={settings}
            onSettingsChange={setSettings}
            saving={saving}
            onSave={handleSave}
            selectedSettingsPresetKey={selectedSettingsPresetKey}
            generalSectionSummary={generalSectionSummary}
            generalDefaultsOverview={generalDefaultsOverview}
            presetApplyingKey={presetApplyingKey}
            onApplyPreset={handleApplyPreset}
            webhookDeliveryStatus={webhookDeliveryStatus}
            webhookEventsSummary={webhookEventsSummary}
            onOpenWebhooksModal={() => setWebhooksModalOpen(true)}
          />
        </div>
      )}

      {isAppSettings && (showAllAppSections || activeTabId === 'integrations') && (
        <div
          id="settings-panel-integrations"
          ref={node => setAppSectionNode('integrations', node)}
          data-app-section="integrations"
          role={showAllAppSections ? 'region' : 'tabpanel'}
          aria-labelledby={showAllAppSections ? undefined : 'settings-tab-integrations'}
          aria-label={showAllAppSections ? 'Integrations settings' : undefined}
          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelIntegrations}`}
        >
          {showAllAppSections && (
            <SettingsSectionLead
              title="Integrations"
              summary={integrationsSectionSummary}
              badgeLabel={`${configuredIntegrationCount}/${INTEGRATIONS_CONFIG.length}`}
              badgeTone={configuredIntegrationCount > 0 ? 'success' : 'info'}
              actionLabel="Open only this section"
              onAction={() => focusAppSection('integrations')}
            />
          )}
          <StoreSettingsIntegrationsSection
            showAllAppSections={showAllAppSections}
            integrationsError={integrationsError}
            onDismissIntegrationsError={() => setIntegrationsError(false)}
            onRetryIntegrations={fetchIntegrations}
            configuredIntegrationCount={configuredIntegrationCount}
            integrationsRefreshing={integrationsRefreshing}
            onRefreshIntegrations={handleRefreshIntegrations}
            integrationsOverview={integrationsOverview}
            integrations={integrations}
            integrationConfig={integrationConfig}
            onIntegrationConfigChange={setIntegrationConfig}
            integrationsSaving={integrationsSaving}
            onSaveIntegrations={handleSaveIntegrations}
            bigQueryExporting={bigQueryExporting}
            onBigQueryExport={handleBigQueryExport}
          />
        </div>
      )}

      {isAppSettings && (showAllAppSections || activeTabId === 'presets') && (
        <div
          id="settings-panel-presets"
          ref={node => setAppSectionNode('presets', node)}
          data-app-section="presets"
          role={showAllAppSections ? 'region' : 'tabpanel'}
          aria-labelledby={showAllAppSections ? undefined : 'settings-tab-presets'}
          aria-label={showAllAppSections ? 'Targeting presets settings' : undefined}
          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelPresets}`}
        >
          {showAllAppSections && (
            <SettingsSectionLead
              title="Targeting presets"
              summary={presetsSectionSummary}
              badgeLabel={`${targetingPresets.length}`}
              badgeTone={targetingPresets.length > 0 ? 'success' : 'info'}
              actionLabel="Open only this section"
              onAction={() => focusAppSection('presets')}
            />
          )}
          <StoreSettingsTargetingPresetsSection
            showAllAppSections={showAllAppSections}
            presetsLoading={presetsLoading}
            targetingPresets={targetingPresets}
            formatPresetSegments={formatPresetSegments}
            onDeletePreset={setDeletePresetId}
            appSettingsDomain={appSettingsDomain}
          />
        </div>
      )}

      {isAppSettings && (showAllAppSections || activeTabId === 'advanced') && (
        <div
          id="settings-panel-advanced"
          ref={node => setAppSectionNode('advanced', node)}
          data-app-section="advanced"
          role={showAllAppSections ? 'region' : 'tabpanel'}
          aria-labelledby={showAllAppSections ? undefined : 'settings-tab-advanced'}
          aria-label={showAllAppSections ? 'Advanced settings' : undefined}
          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelAdvanced} ${styles.settingsTabAdvanced}`}
        >
          {showAllAppSections && (
            <SettingsSectionLead
              title="Advanced"
              summary="Diagnostics, preview probes, and JSON export for support."
              badgeLabel="Support"
              badgeTone="info"
              actionLabel="Open only this section"
              onAction={() => focusAppSection('advanced')}
            />
          )}
          <StoreSettingsAdvancedSection
            currentStoreLabel={currentStoreLabel}
            supportLevelHelpText={supportLevelHelpText}
            checkoutExperienceReadiness={checkoutExperienceReadiness}
            checkoutExperienceDiagError={checkoutExperienceDiagError}
            checkoutExperienceDiagLoading={checkoutExperienceDiagLoading}
            onRunCheckoutExperienceDiagnostics={runCheckoutExperienceDiagnostics}
            onRunFullCheckoutVerification={runFullCheckoutVerification}
            checkoutFullVerifyRunning={checkoutFullVerifyRunning}
            onRunCheckoutDiagnostics={runCheckoutDiagnostics}
            checkoutDiagLoading={checkoutDiagLoading}
            onRefreshFunctionInventory={fetchShopifyFnInventory}
            shopifyFnInventoryLoading={shopifyFnInventoryLoading}
            shopifyFnInventoryError={shopifyFnInventoryError}
            previewProbeTestId={previewProbeTestId}
            onPreviewProbeTestIdChange={setPreviewProbeTestId}
            previewProbeVariant={previewProbeVariant}
            onPreviewProbeVariantChange={setPreviewProbeVariant}
            onAutofillPreviewProbe={autofillPreviewProbeFromRunningTest}
            previewProbeAutofillLoading={previewProbeAutofillLoading}
            onRunPreviewProbe={runPreviewProbe}
            previewProbeLoading={previewProbeLoading}
            previewProbeUrl={previewProbeUrl}
            previewProbeError={previewProbeError}
            previewProbeResult={previewProbeResult}
            shopifyAdminDiscountsUrl={shopifyAdminDiscountsUrl}
            shopifyFnInventory={shopifyFnInventory}
            checkoutDiag={checkoutDiag}
            storeHealth={storeHealth}
            onCopyDiagnosticsJson={handleCopyDiagnosticsJson}
            formatRelativeTime={formatRelativeTime}
          />
        </div>
      )}
    </SettingsPageShell>
  );
}

export default Settings;
