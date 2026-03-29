/**
 * Settings Component
 *
 * Polished settings UI with tabs, integration cards, and user-friendly controls
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams, useLocation } from 'react-router-dom';
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Modal,
  Badge,
  Checkbox,
  ChoiceList,
  Box,
  Select,
  Icon,
  Banner,
  Spinner,
  Divider,
} from '@shopify/polaris';
import {
  ChartVerticalIcon,
  DataTableIcon,
  DeleteIcon,
  TargetIcon,
  CodeIcon,
  ClipboardIcon,
  PaintBrushFlatIcon,
  SettingsIcon,
} from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import { CONTENT_GAP, ROUTES, APP_META, STORAGE_KEYS } from '../../constants';
import styles from './Settings.module.css';
import { apiGet, apiPut, apiPost, apiDelete, isStandaloneMode, unwrapData } from '../../services';
import { getSavedTheme, updateTheme } from '../../utils/theme';

const WEBHOOK_EVENT_CHOICES = [
  { label: 'When test completes', value: 'test_complete' },
  { label: 'When significance is reached', value: 'significance' },
];

/** Integration card config: key, title, icon component, iconClass */
const INTEGRATIONS_CONFIG = [
  {
    key: 'ga4',
    title: 'Google Analytics 4',
    Icon: ChartVerticalIcon,
    iconClass: 'ga4',
    configHint:
      'Get Measurement ID and API secret from GA4 Admin → Data Streams → Web stream → Measurement Protocol API secrets.',
  },
  {
    key: 'bigquery',
    title: 'BigQuery',
    Icon: DataTableIcon,
    iconClass: 'bigquery',
    configHint: 'Paste your Google Cloud service account JSON key for BigQuery export.',
  },
];

/** One-click presets for autonomous configuration */
const SETTINGS_PRESETS = {
  recommended: {
    label: 'Recommended',
    description: 'Best for most stores — balanced speed and accuracy',
    minSampleSize: 100,
    confidenceLevel: 0.95,
    autoStopEnabled: true,
  },
  conservative: {
    label: 'Conservative',
    description: 'Higher certainty — waits for more data before declaring winners',
    minSampleSize: 500,
    confidenceLevel: 0.99,
    autoStopEnabled: true,
  },
  aggressive: {
    label: 'Fast',
    description: 'Quick results — lower sample size, faster decisions',
    minSampleSize: 50,
    confidenceLevel: 0.9,
    autoStopEnabled: true,
  },
};

/** Quick-select values for common use cases */
const SAMPLE_SIZE_QUICK = [50, 100, 250, 500, 1000];
const CONFIDENCE_QUICK = [
  { label: '90%', value: 0.9 },
  { label: '95%', value: 0.95 },
  { label: '99%', value: 0.99 },
];

/** Default settings values - single source for initial state and validation */
const DEFAULT_SETTINGS = {
  minSampleSize: 100,
  confidenceLevel: 0.95,
  autoStopEnabled: true,
  outboundWebhookUrl: '',
  outboundWebhookEvents: ['test_complete', 'significance'],
};

/** Default integration form state */
const DEFAULT_INTEGRATION_CONFIG = {
  ga4MeasurementId: '',
  ga4ApiSecret: '',
  bigqueryProjectId: '',
  bigqueryDataset: 'ripx_analytics',
  bigqueryCredentials: '',
};

/** Theme options - single source of truth for Appearance tab */
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', preview: 'light' },
  { value: 'dark', label: 'Dark', preview: 'dark' },
  { value: 'auto', label: 'Auto (by time of day)', preview: 'auto' },
  { value: 'custom', label: 'Custom schedule', preview: 'auto' },
];

const THEME_VALUES = THEME_OPTIONS.map(o => o.value);

/** Format ISO date to relative time (e.g. "2 hours ago") */
function formatRelativeTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  if (hours < 24) return `${hours} hr ago`;
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return d.toLocaleDateString();
}

/** Full app settings (inside /app/:domain) – installation, test config, webhooks, integrations, presets */
const TAB_CONFIG_APP = [
  { id: 'installation', label: 'Installation', icon: CodeIcon },
  { id: 'general', label: 'Test defaults', icon: SettingsIcon },
  { id: 'integrations', label: 'Connections', icon: ChartVerticalIcon },
  { id: 'presets', label: 'Audience presets', icon: TargetIcon },
  { id: 'appearance', label: 'Appearance', icon: PaintBrushFlatIcon },
];

/** Account-level only (universal /settings) – theme/appearance; app-related config is in the app */
const TAB_CONFIG_ACCOUNT = [{ id: 'appearance', label: 'Appearance', icon: PaintBrushFlatIcon }];

function tabIndexFromSearchParams(searchParams, tabConfig) {
  const tab = searchParams.get('tab');
  const ids = tabConfig.map(t => t.id);
  const i = ids.indexOf(tab);
  return i >= 0 ? i : 0;
}

function Settings() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAppSettings = /^\/app\/[^/]+\/settings$/.test(location.pathname);
  const TAB_CONFIG = isAppSettings ? TAB_CONFIG_APP : TAB_CONFIG_ACCOUNT;
  const TAB_IDS = useMemo(() => TAB_CONFIG.map(t => t.id), [TAB_CONFIG]);

  const [selectedTab, setSelectedTabState] = useState(() =>
    tabIndexFromSearchParams(searchParams, TAB_CONFIG)
  );

  useEffect(() => {
    const prev = document.title;
    document.title = isAppSettings ? 'App settings - RipX' : 'Account settings - RipX';
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
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams, TAB_CONFIG.length, TAB_IDS]
  );

  useEffect(() => {
    const index = tabIndexFromSearchParams(searchParams, TAB_CONFIG);
    setSelectedTabState(index);
  }, [searchParams, TAB_CONFIG]);
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [settingsLoadError, setSettingsLoadError] = useState(false);
  const [targetingPresets, setTargetingPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [deletePresetId, setDeletePresetId] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [integrationsError, setIntegrationsError] = useState(false);
  const [integrationConfig, setIntegrationConfig] = useState({ ...DEFAULT_INTEGRATION_CONFIG });
  const [integrationsRefreshing, setIntegrationsRefreshing] = useState(false);
  const [integrationsSaving, setIntegrationsSaving] = useState(false);
  const [bigQueryExporting, setBigQueryExporting] = useState(false);
  const [installation, setInstallation] = useState(null);
  const [installationLoading, setInstallationLoading] = useState(true);
  const [installationError, setInstallationError] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = getSavedTheme();
    return THEME_VALUES.includes(saved) ? saved : THEME_OPTIONS[0].value;
  });
  const [webhookError, setWebhookError] = useState(null);
  const [presetApplyingKey, setPresetApplyingKey] = useState(null);
  const [deletePresetLoading, setDeletePresetLoading] = useState(false);
  const [checkoutDiagLoading, setCheckoutDiagLoading] = useState(false);
  const [checkoutDiag, setCheckoutDiag] = useState(null);
  const [checkoutDiagError, setCheckoutDiagError] = useState(null);
  const [checkoutDiscountEnsuring, setCheckoutDiscountEnsuring] = useState(false);
  const [checkoutDiscountEnsureResult, setCheckoutDiscountEnsureResult] = useState(null);
  const [checkoutDiscountEnsureError, setCheckoutDiscountEnsureError] = useState(null);
  const autoDiscountSetupHandledRef = useRef(false);
  const [previewProbeTestId, setPreviewProbeTestId] = useState('');
  const [previewProbeVariant, setPreviewProbeVariant] = useState('');
  const [previewProbeLoading, setPreviewProbeLoading] = useState(false);
  const [previewProbeAutofillLoading, setPreviewProbeAutofillLoading] = useState(false);
  const [previewProbeResult, setPreviewProbeResult] = useState(null);
  const [previewProbeError, setPreviewProbeError] = useState(null);

  const fetchSettings = useCallback(async () => {
    setSettingsLoadError(false);
    try {
      setLoading(true);
      const response = await apiGet('/settings');
      const raw = unwrapData(response);
      const data = raw?.settings ?? raw;
      if (data) {
        setSettings({
          minSampleSize: data.minSampleSize ?? DEFAULT_SETTINGS.minSampleSize,
          confidenceLevel: data.confidenceLevel ?? DEFAULT_SETTINGS.confidenceLevel,
          autoStopEnabled: data.autoStopEnabled !== false,
          outboundWebhookUrl: data.outboundWebhookUrl ?? DEFAULT_SETTINGS.outboundWebhookUrl,
          outboundWebhookEvents:
            Array.isArray(data.outboundWebhookEvents) && data.outboundWebhookEvents.length > 0
              ? data.outboundWebhookEvents
              : DEFAULT_SETTINGS.outboundWebhookEvents,
        });
      }
    } catch (err) {
      setSettingsLoadError(true);
      if (import.meta.env.DEV) {
        console.error('Error fetching settings:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPresets = useCallback(async () => {
    setPresetsLoading(true);
    try {
      const res = await apiGet('/targeting-presets');
      setTargetingPresets(unwrapData(res)?.presets ?? []);
    } catch {
      setTargetingPresets([]);
    } finally {
      setPresetsLoading(false);
    }
  }, []);

  const fetchIntegrations = useCallback(async () => {
    setIntegrationsError(false);
    try {
      const res = await apiGet('/settings/integrations');
      const data = unwrapData(res);
      setIntegrations(data?.integrations || null);
      if (data?.config) {
        setIntegrationConfig({
          ga4MeasurementId: data.config.ga4MeasurementId || '',
          ga4ApiSecret: data.config.ga4ApiSecret || '',
          bigqueryProjectId: data.config.bigqueryProjectId || '',
          bigqueryDataset:
            data.config.bigqueryDataset || DEFAULT_INTEGRATION_CONFIG.bigqueryDataset,
          bigqueryCredentials: data.config.bigqueryCredentials || '',
        });
      }
    } catch {
      setIntegrations(null);
      setIntegrationConfig({ ...DEFAULT_INTEGRATION_CONFIG });
      setIntegrationsError(true);
    }
  }, []);

  const fetchInstallation = useCallback(async () => {
    setInstallationLoading(true);
    setInstallationError(false);
    try {
      const res = await apiGet('/settings/installation');
      const data = unwrapData(res)?.installation ?? null;
      setInstallation(data);
      if (!data) setInstallationError(true);
    } catch {
      setInstallation(null);
      setInstallationError(true);
    } finally {
      setInstallationLoading(false);
    }
  }, []);

  const runCheckoutDiagnostics = useCallback(async () => {
    if (!installation?.domain) return;
    setCheckoutDiagLoading(true);
    setCheckoutDiagError(null);
    setCheckoutDiag(null);
    try {
      const res = await apiGet('/settings/checkout-price-diagnostics');
      const data = unwrapData(res);
      if (!data || data.success === false) {
        throw new Error(data?.error || 'Invalid diagnostics response');
      }
      setCheckoutDiag(data);
    } catch (e) {
      setCheckoutDiagError(e?.message || 'Could not load diagnostics');
    } finally {
      setCheckoutDiagLoading(false);
    }
  }, [installation?.domain]);

  const ensureCheckoutDiscount = useCallback(async () => {
    if (!installation?.domain) return;
    setCheckoutDiscountEnsuring(true);
    setCheckoutDiscountEnsureError(null);
    setCheckoutDiscountEnsureResult(null);
    try {
      const res = await apiPost('/settings/checkout-price-discount/ensure', {
        title: 'RipX Price Test Function',
      });
      const data = unwrapData(res);
      if (!data || data.success === false || !data.discount) {
        throw new Error(data?.error || 'Could not create/attach RipX automatic discount');
      }
      setCheckoutDiscountEnsureResult({
        created: data.created === true,
        discountId: data.discount.discountId || null,
        title: data.discount.title || 'RipX Price Test Function',
        status: data.discount.status || null,
      });
      // Refresh diagnostics after successful creation/attach.
      runCheckoutDiagnostics();
    } catch (e) {
      setCheckoutDiscountEnsureError(
        e?.message || 'Could not create/attach RipX automatic discount'
      );
    } finally {
      setCheckoutDiscountEnsuring(false);
    }
  }, [installation?.domain, runCheckoutDiagnostics]);

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
    setIntegrationsError(false);
    try {
      await fetchIntegrations();
      setMessage('Integration status refreshed');
    } finally {
      setIntegrationsRefreshing(false);
    }
  }, [fetchIntegrations]);

  useEffect(() => {
    if (!isAppSettings) setLoading(false);
  }, [isAppSettings]);

  useEffect(() => {
    if (isAppSettings) fetchSettings();
  }, [isAppSettings, fetchSettings]);

  useEffect(() => {
    if (isAppSettings) fetchPresets();
  }, [isAppSettings, fetchPresets]);

  useEffect(() => {
    if (isAppSettings) fetchIntegrations();
  }, [isAppSettings, fetchIntegrations]);

  useEffect(() => {
    if (isAppSettings) fetchInstallation();
  }, [isAppSettings, fetchInstallation]);

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
        return;
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
      setMessage('App settings saved successfully');
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to save app settings');
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = value => {
    const valid = THEME_VALUES.includes(value) ? value : THEME_OPTIONS[0].value;
    setTheme(valid);
    if (valid !== 'custom') {
      updateTheme(valid);
      setMessage('Theme updated');
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
        const prefs = saved ? JSON.parse(saved) : {};
        const start = prefs.customThemeStart ?? 7;
        const end = prefs.customThemeEnd ?? 19;
        updateTheme('custom', { start, end });
        setMessage('Custom theme applied. Adjust schedule in Profile → Preferences.');
      } catch {
        updateTheme('custom', { start: 7, end: 19 });
        setMessage('Custom theme applied. Adjust schedule in Profile → Preferences.');
      }
    }
  };

  const activeTabId = TAB_IDS[selectedTab];

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

  const storeHealth = useMemo(() => {
    const checks = [];
    const scriptDetected = installation?.scriptVerified === true;
    checks.push({
      key: 'script_detected',
      ok: scriptDetected,
      message: scriptDetected
        ? 'Storefront script detected on store theme.'
        : 'Storefront script not detected on theme embed/snippet.',
    });

    const failedChecklist = Array.isArray(checkoutDiag?.checklist)
      ? checkoutDiag.checklist.filter(item => !item?.ok)
      : [];
    const diagReady = failedChecklist.length === 0;
    const firstFailedDiagMessage = failedChecklist[0]?.message || null;
    checks.push({
      key: 'checkout_diag',
      ok: diagReady,
      message: diagReady
        ? 'Checkout diagnostics passed.'
        : `Checkout diagnostics has issues.${firstFailedDiagMessage ? ` First: ${firstFailedDiagMessage}` : ''}`,
    });

    const runningPriceTests =
      checkoutDiag?.shop?.running_price_tests === null ||
      checkoutDiag?.shop?.running_price_tests === undefined
        ? null
        : Number(checkoutDiag.shop.running_price_tests);
    const hasRunningPriceTest = runningPriceTests === null ? null : runningPriceTests > 0;
    checks.push({
      key: 'running_price_test',
      ok: hasRunningPriceTest === null ? false : hasRunningPriceTest,
      message:
        hasRunningPriceTest === null
          ? 'Running price-test count unavailable.'
          : hasRunningPriceTest
            ? `Running price tests found (${runningPriceTests}).`
            : 'No running price test found for this shop.',
    });

    const tenantRegistered =
      checkoutDiag?.shop?.tenant_registered === undefined ||
      checkoutDiag?.shop?.tenant_registered === null
        ? null
        : Boolean(checkoutDiag.shop.tenant_registered);
    checks.push({
      key: 'tenant_registered',
      ok: tenantRegistered === null ? false : tenantRegistered,
      message:
        tenantRegistered === null
          ? 'Tenant registration status unavailable.'
          : tenantRegistered
            ? 'Shop tenant is registered.'
            : 'Shop tenant is not registered for this backend.',
    });

    const ready = checks.every(c => c.ok);
    return {
      ready,
      checks,
      failed: checks.filter(c => !c.ok),
    };
  }, [installation?.scriptVerified, checkoutDiag]);

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
    const base = `https://${shopDomain}/`;
    const params = new URLSearchParams({
      ab_preview: '1',
      ab_preview_test: testId,
      ab_preview_variant: variant,
      ab_preview_variant_name: variant,
    });
    return `${base}?${params.toString()}`;
  }, [installation?.domain, previewProbeTestId, previewProbeVariant]);

  return (
    <PageShell
      message={message}
      messageType={message?.includes('Failed') ? 'error' : 'success'}
      onCloseMessage={() => setMessage(null)}
      messageDuration={message?.includes('Failed') ? 5000 : 3000}
      className={styles.settingsPage}
    >
      <Page title="" subtitle="">
        <div className={styles.settingsLayout}>
          <div className={styles.settingsHeader}>
            <div className={styles.settingsHero}>
              <div className={styles.settingsHeroIcon}>
                <SettingsIcon />
              </div>
              <div>
                <h1 className={styles.settingsHeroTitle}>
                  {isAppSettings ? 'App settings' : 'Account settings'}
                </h1>
                <p className={styles.settingsHeroSubtitle}>
                  {isAppSettings
                    ? 'Installation, test defaults, webhooks, integrations, and appearance for this store'
                    : 'Theme and appearance. For test configuration and installation, open the app.'}
                </p>
              </div>
            </div>

            <div className={styles.settingsOverviewGrid}>
              <Card className={styles.settingsPanelCard}>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Active section
                    </Text>
                    <Text as="p" variant="headingSm">
                      {TAB_CONFIG[selectedTab]?.label || 'Settings'}
                    </Text>
                  </BlockStack>
                </Box>
              </Card>
              {isAppSettings && (
                <>
                  <Card className={styles.settingsPanelCard}>
                    <Box padding="400">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Store readiness
                          </Text>
                          <Badge tone={storeHealth.ready ? 'success' : 'attention'}>
                            {storeHealth.ready ? 'Healthy' : 'Needs attention'}
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {storeHealth.ready
                            ? 'Installation and diagnostics look good.'
                            : `${storeHealth.failed.length} check${storeHealth.failed.length === 1 ? '' : 's'} need action.`}
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                  <Card className={styles.settingsPanelCard}>
                    <Box padding="400">
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center">
                          <Text as="p" variant="bodySm" tone="subdued">
                            Connected services
                          </Text>
                          <Badge tone={configuredIntegrationCount > 0 ? 'success' : 'info'}>
                            {configuredIntegrationCount}/{INTEGRATIONS_CONFIG.length}
                          </Badge>
                        </InlineStack>
                        <Text as="p" variant="bodySm" tone="subdued">
                          GA4 and BigQuery connections for reporting workflows.
                        </Text>
                      </BlockStack>
                    </Box>
                  </Card>
                </>
              )}
              <Card className={styles.settingsPanelCard}>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Quick navigation
                    </Text>
                    <InlineStack gap="200" wrap>
                      {isAppSettings && (
                        <>
                          <Button
                            size="slim"
                            onClick={() => {
                              const i = TAB_IDS.indexOf('installation');
                              if (i >= 0) setSelectedTab(i);
                            }}
                          >
                            Installation
                          </Button>
                          <Button
                            size="slim"
                            onClick={() => {
                              const i = TAB_IDS.indexOf('integrations');
                              if (i >= 0) setSelectedTab(i);
                            }}
                          >
                            Connections
                          </Button>
                        </>
                      )}
                      <Button
                        size="slim"
                        onClick={() => {
                          const i = TAB_IDS.indexOf('appearance');
                          if (i >= 0) setSelectedTab(i);
                        }}
                      >
                        Appearance
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Box>
              </Card>
            </div>

            {!isAppSettings && (
              <Card className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text variant="bodyMd" as="p">
                      Test configuration, installation snippet, webhooks, integrations, and
                      targeting presets are available in the app. Open a store from Home to
                      configure them.
                    </Text>
                    <Link to={ROUTES.USER_PANEL} className={styles.quickLinkBtn}>
                      Open app
                    </Link>
                  </BlockStack>
                </Box>
              </Card>
            )}

            <nav
              className={styles.settingsTabBar}
              role="tablist"
              aria-label={isAppSettings ? 'App settings sections' : 'Account settings sections'}
              onKeyDown={e => {
                const count = TAB_CONFIG.length;
                if (e.key === 'ArrowLeft' && selectedTab > 0) {
                  e.preventDefault();
                  setSelectedTab(selectedTab - 1);
                } else if (e.key === 'ArrowRight' && selectedTab < count - 1) {
                  e.preventDefault();
                  setSelectedTab(selectedTab + 1);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  setSelectedTab(0);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  setSelectedTab(count - 1);
                }
              }}
            >
              {TAB_CONFIG.map((tab, i) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  tabIndex={selectedTab === i ? 0 : -1}
                  aria-selected={selectedTab === i}
                  aria-controls={`settings-panel-${tab.id}`}
                  id={`settings-tab-${tab.id}`}
                  className={`${styles.settingsTab} ${selectedTab === i ? styles.settingsTabActive : ''}`}
                  onClick={() => setSelectedTab(i)}
                >
                  <span className={styles.settingsTabIcon}>
                    <Icon source={tab.icon} />
                  </span>
                  {tab.label}
                </button>
              ))}
            </nav>

            {settingsLoadError && (
              <Banner
                tone="critical"
                onDismiss={() => setSettingsLoadError(false)}
                action={{ content: 'Retry', onAction: () => fetchSettings() }}
              >
                Couldn&apos;t load app settings. Check your connection and try again. You can still
                use Installation, Integrations, and other tabs.
              </Banner>
            )}
          </div>

          <main
            id="settings-main"
            className={styles.settingsBody}
            aria-label={isAppSettings ? 'App settings content' : 'Account settings content'}
          >
            <BlockStack gap={CONTENT_GAP}>
              {loading ? (
                <div className={styles.settingsLoadingSkeleton}>
                  <div className={styles.loadingSkeletonCard} />
                  <div className={styles.loadingSkeletonCard} style={{ height: 200 }} />
                  <div className={styles.loadingSkeletonCard} style={{ height: 160 }} />
                </div>
              ) : (
                <div
                  className={styles.settingsPanels}
                  role="region"
                  aria-live="polite"
                  aria-label={isAppSettings ? 'App settings panel' : 'Account settings panel'}
                >
                  {isAppSettings && activeTabId === 'installation' && (
                    <div
                      id="settings-panel-installation"
                      role="tabpanel"
                      aria-labelledby="settings-tab-installation"
                      className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelInstallation}`}
                    >
                      <Card
                        className={`${styles.settingsPanelCard} ${styles.installMain} ${styles.storefrontSnippetCard}`}
                      >
                        <Box padding="500">
                          <BlockStack gap="400">
                            <div className={styles.snippetSectionHeader}>
                              <div className={styles.snippetSectionHeaderIcon}>
                                <CodeIcon />
                              </div>
                              <div className={styles.snippetSectionHeaderContent}>
                                <Text
                                  variant="headingMd"
                                  as="h2"
                                  className={styles.snippetSectionTitle}
                                >
                                  Storefront Snippet
                                </Text>
                                {installation && (
                                  <div className={styles.snippetBadges}>
                                    <span className={styles.snippetPlatformBadge}>
                                      {installation.platform === 'shopify'
                                        ? 'Shopify'
                                        : 'Standalone'}
                                    </span>
                                    {installation.scriptVerified && (
                                      <span
                                        className={styles.snippetVerifiedBadge}
                                        title="Script detected on your site"
                                      >
                                        Script detected
                                      </span>
                                    )}
                                  </div>
                                )}
                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                  className={styles.snippetSectionDesc}
                                >
                                  {installationLoading
                                    ? 'Loading your installation details…'
                                    : installationError || !installation
                                      ? 'Get your snippet and setup steps from the Setup Wizard below.'
                                      : installation.platform === 'shopify'
                                        ? 'Copy the snippet below. For guided setup, use the Setup Wizard.'
                                        : "Add this script to your site's <head> — one copy, done."}
                                </Text>
                              </div>
                            </div>

                            {installationLoading ? (
                              <div className={styles.installationSkeleton}>
                                <div
                                  className={styles.loadingBlock}
                                  style={{ height: 48, marginBottom: '1rem' }}
                                />
                                <div className={styles.loadingBlock} style={{ height: 140 }} />
                                <div
                                  className={styles.loadingBlock}
                                  style={{ height: 32, marginTop: '1.5rem' }}
                                />
                                <div
                                  className={styles.loadingBlock}
                                  style={{ height: 40, marginTop: '0.5rem' }}
                                />
                              </div>
                            ) : installationError || !installation ? (
                              <div className={styles.installationEmpty}>
                                <div className={styles.installationEmptyIcon}>
                                  <CodeIcon />
                                </div>
                                <Text as="p" variant="bodyMd" tone="subdued">
                                  {installationError
                                    ? "We couldn't load the installation snippet. Use the Setup Wizard to get your script and steps, or retry if you just added a domain."
                                    : 'Get your storefront snippet and setup steps from the Setup Wizard.'}
                                </Text>
                                <div className={styles.installationEmptyActions}>
                                  {installationError && (
                                    <Button size="slim" onClick={() => fetchInstallation()}>
                                      Retry
                                    </Button>
                                  )}
                                  <Link
                                    to={ROUTES.USER_PANEL}
                                    className={styles.installationEmptyCta}
                                  >
                                    Open app (Setup Wizard)
                                  </Link>
                                </div>
                              </div>
                            ) : (
                              <div className={styles.snippetSection}>
                                <div className={styles.snippetBlock}>
                                  <div className={styles.snippetBlockHeader}>
                                    <span className={styles.snippetBlockLabel}>
                                      <CodeIcon />
                                      HTML snippet
                                    </span>
                                    <Button
                                      icon={ClipboardIcon}
                                      onClick={handleCopySnippet}
                                      variant="primary"
                                      size="slim"
                                      className={styles.snippetCopyBtn}
                                    >
                                      {copiedSnippet ? 'Copied!' : 'Copy snippet'}
                                    </Button>
                                  </div>
                                  <div className={styles.snippetCodeWrap}>
                                    <pre className={styles.snippetPre}>
                                      <code>{installation.snippetHtml}</code>
                                    </pre>
                                  </div>
                                </div>

                                <div className={styles.snippetSubsection}>
                                  <div className={styles.snippetSubsectionHeader}>
                                    <span className={styles.snippetSubsectionLabel}>
                                      Script URL
                                    </span>
                                  </div>
                                  <div
                                    className={`${styles.snippetBlock} ${styles.snippetBlockInline}`}
                                  >
                                    <code className={styles.snippetUrl}>
                                      {installation.scriptUrl}
                                    </code>
                                    <div className={styles.snippetUrlActions}>
                                      <Button
                                        icon={ClipboardIcon}
                                        onClick={() =>
                                          handleCopy(installation.scriptUrl, 'URL copied')
                                        }
                                        variant="plain"
                                        size="slim"
                                      >
                                        Copy URL
                                      </Button>
                                      <Button
                                        url={installation.scriptUrl}
                                        external
                                        variant="plain"
                                        size="slim"
                                      >
                                        Test script
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </BlockStack>
                        </Box>
                      </Card>
                      {installation && (
                        <Card className={`${styles.settingsPanelCard} ${styles.installSide}`}>
                          <Box padding="500">
                            <BlockStack gap={CONTENT_GAP}>
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionHeaderIcon}>
                                  <CodeIcon />
                                </div>
                                <div className={styles.sectionHeaderContent}>
                                  <Text variant="headingMd" as="h2">
                                    Setup & Alternative
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Step-by-step instructions and alternative installation methods.
                                  </Text>
                                </div>
                              </div>
                              <div className={styles.panelCardBody}>
                                {installation.instructions?.steps &&
                                  installation.instructions.steps.length > 0 && (
                                    <>
                                      <Text variant="headingSm" as="h3">
                                        Setup steps
                                      </Text>
                                      <ol className={styles.installSteps}>
                                        {installation.instructions.steps.map((step, i) => (
                                          <li key={i}>
                                            <Text as="span" variant="bodyMd">
                                              {step}
                                            </Text>
                                          </li>
                                        ))}
                                      </ol>
                                    </>
                                  )}
                                {installation.instructions?.altMethod && (
                                  <>
                                    <Text variant="headingSm" as="h3">
                                      Alternative: {installation.instructions.altMethod}
                                    </Text>
                                    <div
                                      className={`${styles.snippetBlock} ${styles.snippetBlockAlt}`}
                                    >
                                      <pre className={styles.snippetPre}>
                                        <code>{installation.instructions.altSnippet}</code>
                                      </pre>
                                      <Button
                                        icon={ClipboardIcon}
                                        onClick={() =>
                                          handleCopy(
                                            installation.instructions.altSnippet,
                                            'Snippet copied'
                                          )
                                        }
                                        variant="plain"
                                        size="slim"
                                      >
                                        Copy
                                      </Button>
                                    </div>
                                  </>
                                )}
                                {!installation.instructions?.steps?.length &&
                                  !installation.instructions?.altMethod && (
                                    <Text as="p" variant="bodyMd" tone="subdued">
                                      For guided setup, open the app and use the Setup Wizard from
                                      the sidebar.
                                    </Text>
                                  )}
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>
                      )}

                      {installation &&
                        installation.platform === 'shopify' &&
                        !installationLoading &&
                        !installationError && (
                          <Card
                            className={`${styles.settingsPanelCard} ${styles.checkoutDiagCard}`}
                          >
                            <Box padding="500">
                              <BlockStack gap="400">
                                <div className={styles.sectionHeader}>
                                  <div className={styles.sectionHeaderIcon}>
                                    <TargetIcon />
                                  </div>
                                  <div className={styles.sectionHeaderContent}>
                                    <Text variant="headingMd" as="h2">
                                      Checkout price test health
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      Verifies your RipX API is ready for the Shopify Discount
                                      Function that aligns <strong>charged</strong> checkout prices
                                      with running price tests (Plus / network access + app
                                      extension). Run this after changing <code>APP_URL</code> or
                                      secrets.
                                    </Text>
                                  </div>
                                </div>
                                <InlineStack gap="300" blockAlign="center">
                                  <Button
                                    onClick={runCheckoutDiagnostics}
                                    loading={checkoutDiagLoading}
                                    disabled={checkoutDiagLoading}
                                  >
                                    Run check
                                  </Button>
                                  <Button
                                    onClick={ensureCheckoutDiscount}
                                    loading={checkoutDiscountEnsuring}
                                    disabled={checkoutDiscountEnsuring}
                                  >
                                    Create/attach RipX discount
                                  </Button>
                                  {(checkoutDiag || installation) && (
                                    <Badge tone={storeHealth.ready ? 'success' : 'warning'}>
                                      {storeHealth.ready
                                        ? 'Store health: PASS'
                                        : `Store health: FAIL (${storeHealth.failed.length})`}
                                    </Badge>
                                  )}
                                  {checkoutDiag?.summary && (
                                    <Badge
                                      tone={
                                        checkoutDiag.summary.overall_ok
                                          ? 'success'
                                          : checkoutDiag.summary.overall_status === 'error'
                                            ? 'critical'
                                            : 'warning'
                                      }
                                    >
                                      {checkoutDiag.summary.overall_ok
                                        ? 'All checks passed'
                                        : `${checkoutDiag.summary.checks_passed}/${checkoutDiag.summary.checks_total} checks OK`}
                                    </Badge>
                                  )}
                                </InlineStack>
                                {(checkoutDiag || installation) && (
                                  <div className={styles.checkoutDiagHealthSummary}>
                                    <Text variant="headingSm" as="h3">
                                      Store health summary
                                    </Text>
                                    <BlockStack gap="150">
                                      {storeHealth.checks.map(item => (
                                        <div key={item.key} className={styles.checkoutDiagCheckRow}>
                                          <Badge tone={item.ok ? 'success' : 'critical'}>
                                            {item.ok ? 'OK' : 'Fail'}
                                          </Badge>
                                          <Text as="span" variant="bodySm">
                                            {item.message}
                                          </Text>
                                        </div>
                                      ))}
                                    </BlockStack>
                                  </div>
                                )}
                                <Divider />
                                <div className={styles.checkoutDiagHealthSummary}>
                                  <Text variant="headingSm" as="h3">
                                    Preview probe
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Check if this shop/domain can resolve a specific test variant
                                    via <code>/api/track/preview</code>.
                                  </Text>
                                  <div className={styles.checkoutDiagProbeGrid}>
                                    <TextField
                                      label="Test ID"
                                      value={previewProbeTestId}
                                      onChange={setPreviewProbeTestId}
                                      autoComplete="off"
                                      placeholder="68cbfbe8-6bee-479c-acce-58d0d9ffd9fe"
                                    />
                                    <TextField
                                      label="Variant ID or name"
                                      value={previewProbeVariant}
                                      onChange={setPreviewProbeVariant}
                                      autoComplete="off"
                                      placeholder="Variant A"
                                    />
                                  </div>
                                  <InlineStack gap="300" blockAlign="center">
                                    <Button
                                      onClick={autofillPreviewProbeFromRunningTest}
                                      loading={previewProbeAutofillLoading}
                                      disabled={previewProbeAutofillLoading || previewProbeLoading}
                                    >
                                      Use running price test
                                    </Button>
                                    <Button
                                      onClick={runPreviewProbe}
                                      loading={previewProbeLoading}
                                      disabled={previewProbeLoading || previewProbeAutofillLoading}
                                    >
                                      Run preview probe
                                    </Button>
                                    <Button
                                      url={previewProbeUrl || undefined}
                                      external
                                      disabled={!previewProbeUrl}
                                    >
                                      Open preview URL
                                    </Button>
                                    {previewProbeResult && (
                                      <Badge tone="success">Preview resolve: PASS</Badge>
                                    )}
                                  </InlineStack>
                                  {previewProbeError && (
                                    <Banner
                                      tone="critical"
                                      onDismiss={() => setPreviewProbeError(null)}
                                    >
                                      {previewProbeError}
                                    </Banner>
                                  )}
                                  {previewProbeResult && (
                                    <div className={styles.checkoutDiagProbeResult}>
                                      <Text as="p" variant="bodySm">
                                        <strong>Variant:</strong>{' '}
                                        {previewProbeResult.variantName ||
                                          previewProbeResult.variantId ||
                                          '—'}
                                      </Text>
                                      <Text as="p" variant="bodySm">
                                        <strong>Mode:</strong> {previewProbeResult.priceMode || '—'}
                                      </Text>
                                      <Text as="p" variant="bodySm">
                                        <strong>Fixed price:</strong>{' '}
                                        {previewProbeResult.price ?? '—'}
                                      </Text>
                                      <Text as="p" variant="bodySm">
                                        <strong>Delta:</strong>{' '}
                                        {previewProbeResult.priceDelta ?? '—'}
                                      </Text>
                                      <Text as="p" variant="bodySm">
                                        <strong>Percent:</strong>{' '}
                                        {previewProbeResult.pricePercent ?? '—'}
                                      </Text>
                                    </div>
                                  )}
                                </div>
                                {checkoutDiagLoading && (
                                  <InlineStack gap="200" blockAlign="center">
                                    <Spinner size="small" />
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      Checking API configuration…
                                    </Text>
                                  </InlineStack>
                                )}
                                {checkoutDiagError && (
                                  <Banner
                                    tone="critical"
                                    onDismiss={() => setCheckoutDiagError(null)}
                                  >
                                    {checkoutDiagError}
                                  </Banner>
                                )}
                                {checkoutDiscountEnsureError && (
                                  <Banner
                                    tone="critical"
                                    onDismiss={() => setCheckoutDiscountEnsureError(null)}
                                  >
                                    {checkoutDiscountEnsureError}
                                  </Banner>
                                )}
                                {checkoutDiscountEnsureResult && (
                                  <Banner
                                    tone="success"
                                    onDismiss={() => setCheckoutDiscountEnsureResult(null)}
                                  >
                                    {checkoutDiscountEnsureResult.created
                                      ? 'RipX automatic discount created successfully.'
                                      : 'RipX automatic discount already exists and is attached.'}{' '}
                                    {checkoutDiscountEnsureResult.status
                                      ? `Status: ${checkoutDiscountEnsureResult.status}.`
                                      : ''}
                                  </Banner>
                                )}
                                {checkoutDiag?.infrastructure && (
                                  <>
                                    <Divider />
                                    <Text variant="headingSm" as="h3">
                                      Batch resolver
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      Shopify calls this URL from your discount function (
                                      {checkoutDiag.infrastructure.batch_url_source}).
                                    </Text>
                                    <div className={styles.checkoutDiagMono}>
                                      {checkoutDiag.infrastructure.batch_resolve_url ||
                                        '(not configured)'}
                                    </div>
                                    <InlineStack gap="200" wrap>
                                      <Text as="span" variant="bodySm">
                                        HTTPS:{' '}
                                        {checkoutDiag.infrastructure.uses_https ? 'yes' : 'no'}
                                      </Text>
                                      <Text as="span" variant="bodySm">
                                        Secret required:{' '}
                                        {checkoutDiag.infrastructure.checkout_price_secret_required
                                          ? 'yes'
                                          : 'no'}
                                      </Text>
                                      <Text as="span" variant="bodySm">
                                        Max lines / batch:{' '}
                                        {checkoutDiag.infrastructure.price_resolve_batch_max}
                                      </Text>
                                      <Text as="span" variant="bodySm">
                                        Max response (bytes):{' '}
                                        {checkoutDiag.infrastructure
                                          .price_resolve_batch_response_max_bytes ?? '—'}
                                      </Text>
                                      <Text as="span" variant="bodySm">
                                        Compact batch JSON:{' '}
                                        {checkoutDiag.infrastructure.batch_compact_response ===
                                        false
                                          ? 'no (full)'
                                          : checkoutDiag.infrastructure.batch_compact_response ===
                                              true
                                            ? 'yes'
                                            : '—'}
                                      </Text>
                                      <Text as="span" variant="bodySm">
                                        Slow batch log (ms):{' '}
                                        {checkoutDiag.infrastructure.price_batch_slow_log_ms ?? '—'}
                                      </Text>
                                    </InlineStack>
                                    {checkoutDiag.shop && (
                                      <Text as="p" variant="bodySm">
                                        Running <strong>price</strong> tests for this shop:{' '}
                                        <strong>
                                          {checkoutDiag.shop.running_price_tests ?? '—'}
                                        </strong>
                                      </Text>
                                    )}
                                  </>
                                )}
                                {Array.isArray(checkoutDiag?.checklist) &&
                                  checkoutDiag.checklist.length > 0 && (
                                    <>
                                      <Divider />
                                      <Text variant="headingSm" as="h3">
                                        Checklist
                                      </Text>
                                      <BlockStack gap="200">
                                        {checkoutDiag.checklist.map(item => (
                                          <div
                                            key={item.id}
                                            className={styles.checkoutDiagCheckRow}
                                          >
                                            <Badge
                                              tone={
                                                item.ok
                                                  ? 'success'
                                                  : item.severity === 'error'
                                                    ? 'critical'
                                                    : 'warning'
                                              }
                                            >
                                              {item.ok ? 'OK' : 'Fix'}
                                            </Badge>
                                            <Text as="span" variant="bodySm">
                                              {item.message}
                                            </Text>
                                          </div>
                                        ))}
                                      </BlockStack>
                                    </>
                                  )}
                                {Array.isArray(checkoutDiag?.recommendations) &&
                                  checkoutDiag.recommendations.length > 0 && (
                                    <>
                                      <Divider />
                                      <Text variant="headingSm" as="h3">
                                        Next steps
                                      </Text>
                                      <ul className={styles.installSteps}>
                                        {checkoutDiag.recommendations.map((line, i) => (
                                          <li key={i}>
                                            <Text as="span" variant="bodySm">
                                              {line}
                                            </Text>
                                          </li>
                                        ))}
                                      </ul>
                                    </>
                                  )}
                              </BlockStack>
                            </Box>
                          </Card>
                        )}

                      {installation &&
                        installation.platform === 'standalone' &&
                        !installationLoading &&
                        !installationError && (
                          <Card
                            className={`${styles.settingsPanelCard} ${styles.checkoutDiagCard}`}
                          >
                            <Box padding="500">
                              <Banner tone="info">
                                <BlockStack gap="200">
                                  <Text as="p" variant="bodyMd">
                                    <strong>Checkout price alignment</strong> (matching charged
                                    checkout to a price test) uses Shopify&apos;s Discount Function
                                    API and applies to <strong>Shopify</strong> stores, not
                                    standalone sites. On standalone, RipX still runs price tests on
                                    your storefront via the script.
                                  </Text>
                                </BlockStack>
                              </Banner>
                            </Box>
                          </Card>
                        )}
                    </div>
                  )}

                  {isAppSettings && activeTabId === 'general' && (
                    <div
                      id="settings-panel-general"
                      role="tabpanel"
                      aria-labelledby="settings-tab-general"
                      className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelGeneral}`}
                    >
                      {isStandaloneMode() && (
                        <Card
                          className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}
                        >
                          <Box padding="400">
                            <BlockStack gap={CONTENT_GAP}>
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionHeaderIcon}>
                                  <SettingsIcon />
                                </div>
                                <div className={styles.sectionHeaderContent}>
                                  <Text variant="headingMd" as="h2">
                                    API Key
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Connected via API key. To use a different key, go to{' '}
                                    <Link to={ROUTES.CONNECT}>Connect</Link> or clear storage and
                                    reload.
                                  </Text>
                                </div>
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>
                      )}

                      <Card className={`${styles.settingsPanelCard} ${styles.testConfigCard}`}>
                        <Box padding="500">
                          <BlockStack gap="400">
                            <div className={styles.sectionHeader}>
                              <div className={styles.sectionHeaderIcon}>
                                <TargetIcon />
                              </div>
                              <div className={styles.sectionHeaderContent}>
                                <Text variant="headingMd" as="h2">
                                  Test Configuration
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Choose a preset or customize. Settings apply to all new tests.
                                </Text>
                              </div>
                            </div>

                            <div className={styles.testConfigPresets}>
                              <span className={styles.configSubsection}>Quick presets</span>
                              <div className={styles.presetCardsGrid}>
                                {Object.entries(SETTINGS_PRESETS).map(([key, preset]) => (
                                  <button
                                    key={key}
                                    type="button"
                                    disabled={presetApplyingKey !== null}
                                    className={`${styles.presetCard} ${key === 'recommended' ? styles.presetCardRecommended : ''}`}
                                    onClick={async () => {
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
                                        setMessage(err?.response?.data?.error || 'Failed to save');
                                      } finally {
                                        setPresetApplyingKey(null);
                                      }
                                    }}
                                  >
                                    {presetApplyingKey === key ? (
                                      <span className={styles.presetCardLoading}>Applying…</span>
                                    ) : (
                                      <>
                                        <span className={styles.presetCardLabel}>
                                          {preset.label}
                                        </span>
                                        <span className={styles.presetCardDesc}>
                                          {preset.description}
                                        </span>
                                        <span className={styles.presetCardMeta}>
                                          {preset.minSampleSize} visitors ·{' '}
                                          {Math.round(preset.confidenceLevel * 100)}% confidence
                                        </span>
                                      </>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className={styles.testConfigCustom}>
                              <span className={styles.configSubsection}>Customize</span>
                              <div className={styles.configFieldGroups}>
                                <div className={styles.configFieldGroup}>
                                  <Text
                                    variant="bodySm"
                                    fontWeight="semibold"
                                    as="span"
                                    className={styles.configFieldLabel}
                                  >
                                    Minimum Sample Size
                                  </Text>
                                  <div className={styles.configQuickSelect}>
                                    {SAMPLE_SIZE_QUICK.map(n => (
                                      <Button
                                        key={n}
                                        size="slim"
                                        pressed={settings.minSampleSize === n}
                                        onClick={() =>
                                          setSettings({ ...settings, minSampleSize: n })
                                        }
                                      >
                                        {n}
                                      </Button>
                                    ))}
                                  </div>
                                  <div className={styles.configTextField}>
                                    <TextField
                                      label="Or enter custom (10–10,000)"
                                      type="number"
                                      value={String(
                                        settings.minSampleSize ?? DEFAULT_SETTINGS.minSampleSize
                                      )}
                                      onChange={value => {
                                        const num = parseInt(String(value).replace(/\D/g, ''), 10);
                                        setSettings({
                                          ...settings,
                                          minSampleSize: Number.isFinite(num)
                                            ? Math.max(10, Math.min(10000, num))
                                            : DEFAULT_SETTINGS.minSampleSize,
                                        });
                                      }}
                                      helpText="Minimum visitors before showing results"
                                      min={10}
                                      max={10000}
                                      autoComplete="off"
                                    />
                                  </div>
                                </div>

                                <div className={styles.configFieldGroup}>
                                  <Text
                                    variant="bodySm"
                                    fontWeight="semibold"
                                    as="span"
                                    className={styles.configFieldLabel}
                                  >
                                    Confidence Level
                                  </Text>
                                  <div className={styles.configQuickSelect}>
                                    {CONFIDENCE_QUICK.map(({ label, value }) => (
                                      <Button
                                        key={value}
                                        size="slim"
                                        pressed={
                                          Math.abs(Number(settings.confidenceLevel) - value) < 0.001
                                        }
                                        onClick={() =>
                                          setSettings({ ...settings, confidenceLevel: value })
                                        }
                                      >
                                        {label}
                                      </Button>
                                    ))}
                                  </div>
                                  <div className={styles.configTextField}>
                                    <TextField
                                      label="Or enter custom (0.8–0.99)"
                                      type="number"
                                      value={String(
                                        settings.confidenceLevel ?? DEFAULT_SETTINGS.confidenceLevel
                                      )}
                                      onChange={value => {
                                        const num = parseFloat(
                                          String(value).replace(/[^\d.]/g, '')
                                        );
                                        setSettings({
                                          ...settings,
                                          confidenceLevel: Number.isFinite(num)
                                            ? Math.max(0.8, Math.min(0.99, num))
                                            : DEFAULT_SETTINGS.confidenceLevel,
                                        });
                                      }}
                                      helpText="Higher = more conservative, waits for stronger evidence"
                                      min={0.8}
                                      max={1}
                                      step={0.01}
                                      autoComplete="off"
                                    />
                                  </div>
                                </div>

                                <div className={styles.configAutoStop}>
                                  <Checkbox
                                    label="Auto-stop when winner is clear"
                                    helpText="Automatically stop tests when statistical significance is reached — recommended for most users"
                                    checked={settings.autoStopEnabled}
                                    onChange={checked =>
                                      setSettings({ ...settings, autoStopEnabled: checked })
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          </BlockStack>
                        </Box>
                      </Card>

                      <Card className={`${styles.settingsPanelCard}`}>
                        <Box padding="400">
                          <BlockStack gap={CONTENT_GAP}>
                            <div className={styles.sectionHeader}>
                              <div className={styles.sectionHeaderIcon}>
                                <ChartVerticalIcon />
                              </div>
                              <div className={styles.sectionHeaderContent}>
                                <Text variant="headingMd" as="h2">
                                  Webhooks
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Send events to your server when tests complete or reach
                                  significance. The button below saves both webhook settings and
                                  test defaults (sample size, confidence, auto-stop).
                                </Text>
                              </div>
                            </div>
                            <div className={styles.panelCardBody}>
                              <FormLayout>
                                <TextField
                                  label="Webhook URL"
                                  value={settings.outboundWebhookUrl}
                                  onChange={value => {
                                    setSettings({ ...settings, outboundWebhookUrl: value });
                                    setWebhookError(null);
                                  }}
                                  helpText="Leave empty to disable. Must be a valid URL when set."
                                  placeholder="https://your-server.com/webhook"
                                  autoComplete="off"
                                  error={webhookError}
                                />
                                <ChoiceList
                                  title="Send webhook when"
                                  choices={WEBHOOK_EVENT_CHOICES}
                                  selected={settings.outboundWebhookEvents}
                                  onChange={selected =>
                                    setSettings({
                                      ...settings,
                                      outboundWebhookEvents: selected.length
                                        ? selected
                                        : DEFAULT_SETTINGS.outboundWebhookEvents,
                                    })
                                  }
                                  allowMultiple
                                />

                                <Box paddingBlockStart="400">
                                  <Button variant="primary" onClick={handleSave} loading={saving}>
                                    Save settings
                                  </Button>
                                </Box>
                              </FormLayout>
                            </div>
                          </BlockStack>
                        </Box>
                      </Card>

                      <Card
                        className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull} ${styles.quickLinksCard}`}
                      >
                        <Box padding="400">
                          <BlockStack gap="300">
                            <div className={styles.sectionHeader}>
                              <div className={styles.sectionHeaderIcon}>
                                <SettingsIcon />
                              </div>
                              <div className={styles.sectionHeaderContent}>
                                <Text variant="headingMd" as="h2">
                                  User Preferences
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Notifications, dashboard defaults, theme (custom schedule), and
                                  export format are in{' '}
                                  <Link to={ROUTES.PROFILE} className={styles.setupWizardLink}>
                                    Profile
                                  </Link>{' '}
                                  — Account (notifications), Preferences (theme, dashboard, editor).
                                </Text>
                              </div>
                            </div>
                            <InlineStack gap="200" wrap>
                              <Link to={ROUTES.PROFILE} className={styles.quickLinkBtn}>
                                Open Profile
                              </Link>
                            </InlineStack>
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>
                  )}

                  {isAppSettings && activeTabId === 'integrations' && (
                    <div
                      id="settings-panel-integrations"
                      role="tabpanel"
                      aria-labelledby="settings-tab-integrations"
                      className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelIntegrations}`}
                    >
                      {integrationsError && (
                        <div className={styles.settingsPanelBannerWrap}>
                          <Banner
                            tone="critical"
                            onDismiss={() => setIntegrationsError(false)}
                            action={{ content: 'Retry', onAction: () => fetchIntegrations() }}
                          >
                            Couldn&apos;t load integration status. Check your connection and retry.
                          </Banner>
                        </div>
                      )}
                      <Card
                        className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull} ${styles.integrationsHeaderCard}`}
                      >
                        <Box padding="400">
                          <div className={styles.sectionHeaderWithAction}>
                            <div className={styles.sectionHeader}>
                              <div
                                className={`${styles.sectionHeaderIcon} ${styles.integrationsHeaderIcon}`}
                              >
                                <ChartVerticalIcon />
                              </div>
                              <div className={styles.sectionHeaderContent}>
                                <Text variant="headingMd" as="h2">
                                  Analytics & Data
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Connect GA4 and BigQuery to unify analytics and run advanced
                                  queries.
                                </Text>
                              </div>
                            </div>
                            <Button
                              variant="plain"
                              onClick={handleRefreshIntegrations}
                              loading={integrationsRefreshing}
                              accessibilityLabel="Refresh integration status"
                            >
                              Refresh status
                            </Button>
                          </div>
                        </Box>
                      </Card>

                      <div className={styles.integrationCardsRow}>
                        {INTEGRATIONS_CONFIG.map(({ key, title, Icon, iconClass, configHint }) => {
                          const data = integrations?.[key];
                          const configured = data?.configured;
                          const lastExport = key === 'bigquery' ? data?.lastExportAt : null;
                          const lastExportLabel = formatRelativeTime(lastExport);
                          const isLoading = integrations === null;
                          return (
                            <Card
                              key={key}
                              className={`${styles.settingsPanelCard} ${styles.integrationCardWrapper} ${configured ? styles.integrationCardConnected : ''}`}
                            >
                              <Box padding="400">
                                <BlockStack gap={CONTENT_GAP}>
                                  <div className={styles.sectionHeader}>
                                    <div
                                      className={`${styles.sectionHeaderIcon} ${styles.integrationIcon} ${styles[iconClass]}`}
                                    >
                                      <Icon />
                                    </div>
                                    <div
                                      className={`${styles.sectionHeaderContent} ${styles.integrationCardHeader}`}
                                    >
                                      <div className={styles.integrationCardTitleRow}>
                                        <Text
                                          variant="headingMd"
                                          as="h2"
                                          className={styles.integrationCardTitle}
                                        >
                                          {title}
                                        </Text>
                                        {!isLoading && (
                                          <Badge
                                            tone={configured ? 'success' : 'info'}
                                            className={styles.integrationCardBadge}
                                          >
                                            {key === 'ga4'
                                              ? configured
                                                ? 'Active'
                                                : 'Not configured'
                                              : configured
                                                ? 'Configured'
                                                : 'Not configured'}
                                          </Badge>
                                        )}
                                      </div>
                                      <Text
                                        as="p"
                                        variant="bodySm"
                                        tone="subdued"
                                        className={styles.integrationCardHint}
                                      >
                                        {isLoading ? 'Loading…' : (data?.hint ?? configHint)}
                                      </Text>
                                    </div>
                                  </div>
                                  <div className={styles.panelCardBody}>
                                    {isLoading ? (
                                      <div
                                        className={styles.loadingBlock}
                                        style={{ height: 60, marginTop: '0.5rem' }}
                                      />
                                    ) : (
                                      <>
                                        {key === 'ga4' && (
                                          <FormLayout>
                                            <TextField
                                              label="Measurement ID"
                                              value={integrationConfig.ga4MeasurementId}
                                              onChange={v =>
                                                setIntegrationConfig(c => ({
                                                  ...c,
                                                  ga4MeasurementId: v,
                                                }))
                                              }
                                              placeholder="G-XXXXXXXXXX"
                                              autoComplete="off"
                                            />
                                            <TextField
                                              label="API Secret"
                                              type="password"
                                              value={integrationConfig.ga4ApiSecret}
                                              onChange={v =>
                                                setIntegrationConfig(c => ({
                                                  ...c,
                                                  ga4ApiSecret: v,
                                                }))
                                              }
                                              placeholder={
                                                integrationConfig.ga4ApiSecret === '••••••••'
                                                  ? '••••••••'
                                                  : 'Enter API secret'
                                              }
                                              autoComplete="off"
                                              helpText="From GA4 Admin → Data Streams → Measurement Protocol"
                                            />
                                          </FormLayout>
                                        )}
                                        {key === 'bigquery' && (
                                          <FormLayout>
                                            <TextField
                                              label="Project ID"
                                              value={integrationConfig.bigqueryProjectId}
                                              onChange={v =>
                                                setIntegrationConfig(c => ({
                                                  ...c,
                                                  bigqueryProjectId: v,
                                                }))
                                              }
                                              placeholder="your-gcp-project"
                                              autoComplete="off"
                                            />
                                            <TextField
                                              label="Dataset"
                                              value={integrationConfig.bigqueryDataset}
                                              onChange={v =>
                                                setIntegrationConfig(c => ({
                                                  ...c,
                                                  bigqueryDataset: v,
                                                }))
                                              }
                                              placeholder="ripx_analytics"
                                              autoComplete="off"
                                            />
                                            <TextField
                                              label="Service Account JSON"
                                              value={
                                                integrationConfig.bigqueryCredentials ===
                                                '[configured]'
                                                  ? ''
                                                  : integrationConfig.bigqueryCredentials
                                              }
                                              onChange={v =>
                                                setIntegrationConfig(c => ({
                                                  ...c,
                                                  bigqueryCredentials: v,
                                                }))
                                              }
                                              placeholder={
                                                integrationConfig.bigqueryCredentials ===
                                                '[configured]'
                                                  ? '[Already configured — leave blank to keep]'
                                                  : 'Paste full JSON key'
                                              }
                                              multiline={4}
                                              autoComplete="off"
                                              helpText="Paste the full JSON from GCP Service Account key file"
                                            />
                                            {configured && (
                                              <>
                                                <p className={styles.integrationLastExport}>
                                                  Last export:{' '}
                                                  <strong
                                                    {...(!lastExportLabel && {
                                                      'data-subdued': true,
                                                    })}
                                                  >
                                                    {lastExportLabel || 'Never'}
                                                  </strong>
                                                </p>
                                                <div className={styles.integrationActions}>
                                                  <Button
                                                    variant="primary"
                                                    onClick={() => handleBigQueryExport(false)}
                                                    loading={bigQueryExporting}
                                                  >
                                                    Export incremental
                                                  </Button>
                                                  <Button
                                                    onClick={() => handleBigQueryExport(true)}
                                                    loading={bigQueryExporting}
                                                  >
                                                    Full export
                                                  </Button>
                                                </div>
                                              </>
                                            )}
                                          </FormLayout>
                                        )}
                                        {!configured && (
                                          <div className={styles.configHint}>{configHint}</div>
                                        )}
                                        {configured && key === 'ga4' && (
                                          <div className={styles.integrationActiveNote}>
                                            Events are forwarded automatically
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </BlockStack>
                              </Box>
                            </Card>
                          );
                        })}
                      </div>
                      <Card
                        className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull} ${styles.integrationsSaveCard}`}
                      >
                        <Box padding="400">
                          <InlineStack align="end" gap="300">
                            <Button
                              variant="primary"
                              onClick={handleSaveIntegrations}
                              loading={integrationsSaving}
                            >
                              Save integration settings
                            </Button>
                          </InlineStack>
                        </Box>
                      </Card>
                    </div>
                  )}

                  {activeTabId === 'appearance' && (
                    <div
                      id="settings-panel-appearance"
                      role="tabpanel"
                      aria-labelledby="settings-tab-appearance"
                      className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelAppearance}`}
                    >
                      <Card
                        className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}
                      >
                        <Box padding="500">
                          <BlockStack gap="400">
                            <div className={styles.sectionHeader}>
                              <div className={styles.sectionHeaderIcon}>
                                <PaintBrushFlatIcon />
                              </div>
                              <div className={styles.sectionHeaderContent}>
                                <Text variant="headingMd" as="h2">
                                  Theme
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Choose how the app looks. Auto switches by time of day. For a
                                  custom schedule (e.g. dark after 7pm), use{' '}
                                  <Link
                                    to={`${ROUTES.PROFILE}?tab=preferences`}
                                    className={styles.setupWizardLink}
                                  >
                                    Profile → Preferences
                                  </Link>
                                  .
                                </Text>
                              </div>
                            </div>
                            <div className={styles.panelCardBody}>
                              <div className={styles.themePreviewGrid}>
                                {THEME_OPTIONS.map(opt => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    className={`${styles.themePreviewCard} ${theme === opt.value ? styles.themePreviewCardActive : ''}`}
                                    onClick={() => handleThemeChange(opt.value)}
                                    aria-pressed={theme === opt.value}
                                    aria-label={`Theme: ${opt.label}`}
                                  >
                                    <div
                                      className={`${styles.themePreviewSwatch} ${styles[`themePreviewSwatch_${opt.preview}`]}`}
                                    />
                                    <span className={styles.themePreviewLabel}>{opt.label}</span>
                                  </button>
                                ))}
                              </div>
                              <div className={styles.themeSelectFallback}>
                                <Text as="span" variant="bodySm" tone="subdued">
                                  Or choose from dropdown:
                                </Text>
                                <div className={styles.themeSelectWrap}>
                                  <Select
                                    label="Theme"
                                    labelHidden
                                    options={THEME_OPTIONS.map(({ value, label }) => ({
                                      value,
                                      label,
                                    }))}
                                    value={theme}
                                    onChange={handleThemeChange}
                                  />
                                </div>
                              </div>
                            </div>
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>
                  )}

                  {isAppSettings && activeTabId === 'presets' && (
                    <div
                      id="settings-panel-presets"
                      role="tabpanel"
                      aria-labelledby="settings-tab-presets"
                      className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelPresets}`}
                    >
                      <Card
                        className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull}`}
                      >
                        <Box padding="400">
                          <BlockStack gap={CONTENT_GAP}>
                            <div className={styles.sectionHeader}>
                              <div className={styles.sectionHeaderIcon}>
                                <TargetIcon />
                              </div>
                              <div className={styles.sectionHeaderContent}>
                                <Text variant="headingMd" as="h2">
                                  Targeting Presets
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Saved segment presets for reuse when creating tests. Save
                                  targeting as a preset in the test wizard.
                                </Text>
                              </div>
                            </div>
                            <div className={styles.panelCardBody}>
                              {presetsLoading ? (
                                <div className={styles.presetsLoading}>
                                  <div
                                    className={styles.loadingBlock}
                                    style={{ height: 56, marginBottom: '0.75rem' }}
                                  />
                                  <div className={styles.loadingBlock} style={{ height: 56 }} />
                                </div>
                              ) : targetingPresets.length > 0 ? (
                                <div className={styles.presetsGrid}>
                                  {targetingPresets.map(p => (
                                    <div key={p.id} className={styles.presetCardItem}>
                                      <div className={styles.presetCardContent}>
                                        <div className={styles.presetName}>{p.name}</div>
                                        <div className={styles.presetSegments}>
                                          {formatPresetSegments(p)}
                                        </div>
                                      </div>
                                      <Button
                                        variant="plain"
                                        tone="critical"
                                        onClick={() => setDeletePresetId(p.id)}
                                        icon={DeleteIcon}
                                      >
                                        Delete
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className={styles.presetsEmpty}>
                                  <div className={styles.presetsEmptyIcon}>
                                    <TargetIcon />
                                  </div>
                                  <p className={styles.presetsEmptyText}>
                                    No targeting presets yet. Open the app, create a test, and save
                                    your targeting as a preset in the Test Wizard to reuse it later.
                                  </p>
                                  <Link to={ROUTES.USER_PANEL} className={styles.presetsEmptyCta}>
                                    Open app
                                  </Link>
                                </div>
                              )}
                            </div>
                          </BlockStack>
                        </Box>
                      </Card>
                    </div>
                  )}
                </div>
              )}
              <Card className={styles.aboutCard}>
                <Box padding="400">
                  <div className={styles.aboutSection}>
                    <div className={styles.aboutTitleRow}>
                      <span className={styles.aboutTitle}>RipX</span>
                      <span className={styles.aboutBadge}>A/B Testing</span>
                    </div>
                    <div className={styles.aboutVersion}>Version {APP_META.VERSION}</div>
                    <p className={styles.aboutDesc}>
                      Centralized configuration for install health, test defaults, integrations, and
                      account appearance.
                    </p>
                  </div>
                </Box>
              </Card>
            </BlockStack>
          </main>
        </div>
      </Page>

      <Modal
        open={!!deletePresetId}
        onClose={() => !deletePresetLoading && setDeletePresetId(null)}
        title="Delete preset?"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          loading: deletePresetLoading,
          onAction: async () => {
            if (!deletePresetId) return;
            setDeletePresetLoading(true);
            try {
              await apiDelete(`/targeting-presets/${deletePresetId}`);
              setTargetingPresets(prev => prev.filter(p => p.id !== deletePresetId));
              setDeletePresetId(null);
            } catch (err) {
              setMessage(err?.response?.data?.error || 'Failed to delete');
            } finally {
              setDeletePresetLoading(false);
            }
          },
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setDeletePresetId(null),
            disabled: deletePresetLoading,
          },
        ]}
      />
    </PageShell>
  );
}

export default Settings;
