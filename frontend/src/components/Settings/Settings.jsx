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
  Collapsible,
  Tooltip,
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
  InfoIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import { CONTENT_GAP, ROUTES, APP_META, STORAGE_KEYS } from '../../constants';
import styles from './Settings.module.css';
import { apiGet, apiPut, apiPost, apiDelete, isStandaloneMode, unwrapData } from '../../services';
import {
  getCheckoutExperienceTestInventory,
  summarizeCheckoutExperienceInventory,
} from '../../utils/checkoutReporting';
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

const OFFER_CHECKOUT_FUNCTION_TITLE = 'RipX Offer Checkout Function';
const CHECKOUT_DIAG_CACHE_PREFIX = 'ripx_checkout_diag_cache_v1:';
const CHECKOUT_DIAG_STALE_AFTER_MS = 15 * 60 * 1000;
const CHECKOUT_DIAG_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
const APP_SETTINGS_SECTION_IDS = [
  'installation',
  'general',
  'integrations',
  'presets',
  'appearance',
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

function getCheckoutDiagCacheKey(domain) {
  const normalized = String(domain || '')
    .trim()
    .toLowerCase();
  return normalized ? `${CHECKOUT_DIAG_CACHE_PREFIX}${normalized}` : null;
}

function readCheckoutDiagCache(domain) {
  if (typeof window === 'undefined') return null;
  const key = getCheckoutDiagCacheKey(domain);
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const checkedAt = String(parsed.checkedAt || '').trim();
    const data = parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
    if (!checkedAt || !data) return null;
    const checkedMs = new Date(checkedAt).getTime();
    if (!Number.isFinite(checkedMs)) return null;
    const ageMs = Date.now() - checkedMs;
    if (ageMs > CHECKOUT_DIAG_CACHE_MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { checkedAt, data, ageMs };
  } catch {
    return null;
  }
}

function writeCheckoutDiagCache(domain, checkedAt, data) {
  if (typeof window === 'undefined') return;
  const key = getCheckoutDiagCacheKey(domain);
  if (!key || !checkedAt || !data) return;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        checkedAt,
        data,
      })
    );
  } catch {
    // Ignore localStorage failures.
  }
}

/** Full app settings (inside /app/:domain) – installation, test config, webhooks, integrations, presets */
const TAB_CONFIG_APP = [
  { id: 'installation', label: 'Installation', icon: CodeIcon },
  { id: 'general', label: 'Test defaults', icon: SettingsIcon },
  { id: 'integrations', label: 'Connections', icon: ChartVerticalIcon },
  { id: 'presets', label: 'Targeting presets', icon: TargetIcon },
  { id: 'appearance', label: 'Appearance', icon: PaintBrushFlatIcon },
];

/** Account-level only (universal /settings) – theme/appearance; app-related config is in the app */
const TAB_CONFIG_ACCOUNT = [{ id: 'appearance', label: 'Appearance', icon: PaintBrushFlatIcon }];

/** Long-form help moved to tooltips on section titles */
const SECTION_HELP = {
  defaultsSnapshot:
    'Current defaults for new tests: sample size, confidence, auto-stop, and webhook behavior.',
  testConfiguration:
    'Applies to new tests. Use a preset for speed, or Customize for manual control.',
  webhooks: 'Send JSON to your endpoint when tests complete or reach significance.',
  apiKeyStandalone: 'This shop is connected with an API key. Use Connect to switch keys.',
  userPreferences:
    'Account-level preferences (notifications, dashboard defaults, theme schedule, export format) are in Profile.',
  analyticsData: 'Optional integrations: GA4 for event forwarding and BigQuery for exports.',
  integrationsSave: 'Save writes GA4 and BigQuery credentials and dataset settings.',
  targetingPresets: 'Saved targeting presets from the Test Wizard, reusable on new tests.',
  themeAppearance: 'Choose light, dark, or auto. For a custom schedule, use Profile → Preferences.',
};

function SectionTitleWithTip({
  title,
  tip,
  asHeading = 'h2',
  titleClassName,
  variant = 'headingMd',
  fontWeight,
}) {
  return (
    <div className={styles.sectionHeaderTitleRow}>
      <Text variant={variant} as={asHeading} className={titleClassName} fontWeight={fontWeight}>
        {title}
      </Text>
      <Tooltip content={tip}>
        <span className={styles.sectionHeaderTitleTip} tabIndex={0} aria-label={tip}>
          <Icon source={InfoIcon} />
        </span>
      </Tooltip>
    </div>
  );
}

function SettingsSectionLead({
  title,
  summary,
  badgeLabel,
  badgeTone = 'info',
  actionLabel,
  onAction,
}) {
  return (
    <div className={styles.settingsSectionLead}>
      <div className={styles.settingsSectionLeadCopy}>
        <div className={styles.settingsSectionLeadTitleRow}>
          <Text variant="headingSm" as="h2" className={styles.settingsSectionLeadTitle}>
            {title}
          </Text>
          {badgeLabel ? <Badge tone={badgeTone}>{badgeLabel}</Badge> : null}
        </div>
        <Text as="p" variant="bodySm" tone="subdued" className={styles.settingsSectionLeadSummary}>
          {summary}
        </Text>
      </div>
      {actionLabel && onAction ? (
        <div className={styles.settingsSectionLeadActions}>
          <Button size="slim" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

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
  const [checkoutDiagLastCheckedAt, setCheckoutDiagLastCheckedAt] = useState(null);
  const [_checkoutExperienceDiagLoading, setCheckoutExperienceDiagLoading] = useState(false);
  const [checkoutExperienceDiag, setCheckoutExperienceDiag] = useState(null);
  const [checkoutExperienceDiagError, setCheckoutExperienceDiagError] = useState(null);
  const [checkoutDiscountEnsuring, setCheckoutDiscountEnsuring] = useState(false);
  const [checkoutDiscountEnsureResult, setCheckoutDiscountEnsureResult] = useState(null);
  const [checkoutDiscountEnsureError, setCheckoutDiscountEnsureError] = useState(null);
  const [checkoutDiscountEnsureDebug, setCheckoutDiscountEnsureDebug] = useState(null);
  const [checkoutDiscountListCheck, setCheckoutDiscountListCheck] = useState(null);
  const [checkoutDiscountListCheckLoading, setCheckoutDiscountListCheckLoading] = useState(false);
  const [checkoutDiscountListCheckError, setCheckoutDiscountListCheckError] = useState(null);
  const [checkoutCartTransformEnsuring, setCheckoutCartTransformEnsuring] = useState(false);
  const [checkoutCartTransformEnsureResult, setCheckoutCartTransformEnsureResult] = useState(null);
  const [checkoutCartTransformEnsureError, setCheckoutCartTransformEnsureError] = useState(null);
  const [checkoutFullVerifyRunning, setCheckoutFullVerifyRunning] = useState(false);
  const [checkoutCustomizationTests, setCheckoutCustomizationTests] = useState([]);
  const [checkoutCustomizationTestsLoading, setCheckoutCustomizationTestsLoading] = useState(false);
  const [checkoutCustomizationTestsError, setCheckoutCustomizationTestsError] = useState(null);
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
    if (typeof window === 'undefined') return 'all';
    try {
      const saved = window.localStorage.getItem('ripx_settings_layout_mode_v1');
      return saved === 'tabbed' ? 'tabbed' : 'all';
    } catch {
      return 'all';
    }
  });
  const showAllAppSections = isAppSettings && settingsLayoutMode === 'all';
  const visibleTabEntries = useMemo(() => {
    const entries = TAB_CONFIG.map((tab, index) => ({ tab, index }));
    if (isAppSettings && isGuidedSetupMode && !showAllAppSections) {
      return entries.filter(entry => entry.tab.id === 'installation');
    }
    return entries;
  }, [TAB_CONFIG, isAppSettings, isGuidedSetupMode, showAllAppSections]);
  const [sectionRailCollapsed, setSectionRailCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('ripx_settings_section_rail_collapsed_v1') === '1';
    } catch {
      return false;
    }
  });
  const autoDiscountSetupHandledRef = useRef(false);
  const checkoutDiagAutoRefreshRef = useRef({});
  const settingsBodyRef = useRef(null);
  const appSectionNodesRef = useRef({});
  const [previewProbeTestId, setPreviewProbeTestId] = useState('');
  const [previewProbeVariant, setPreviewProbeVariant] = useState('');
  const [previewProbeLoading, setPreviewProbeLoading] = useState(false);
  const [previewProbeAutofillLoading, setPreviewProbeAutofillLoading] = useState(false);
  const [previewProbeResult, setPreviewProbeResult] = useState(null);
  const [previewProbeError, setPreviewProbeError] = useState(null);
  /** Installation → checkout card: keep primary actions visible; tuck tools & long copy here */
  const [installAdvancedOpen, setInstallAdvancedOpen] = useState(false);
  const [installDebugJsonOpen, setInstallDebugJsonOpen] = useState(false);
  const [installSnippetModalOpen, setInstallSnippetModalOpen] = useState(false);
  const [webhooksModalOpen, setWebhooksModalOpen] = useState(false);
  const isInstallDetailModalOpen =
    installSnippetModalOpen || installAdvancedOpen || installDebugJsonOpen;
  const [shopifyFnInventory, setShopifyFnInventory] = useState(null);
  const [shopifyFnInventoryLoading, setShopifyFnInventoryLoading] = useState(false);
  const [shopifyFnInventoryError, setShopifyFnInventoryError] = useState(null);
  const [activeAppSectionId, setActiveAppSectionId] = useState(APP_SETTINGS_SECTION_IDS[0]);
  const [activeRailTooltipId, setActiveRailTooltipId] = useState(null);
  const railTooltipTimerRef = useRef(null);
  const checkoutDiagRef = useRef(null);

  useEffect(() => {
    checkoutDiagRef.current = checkoutDiag;
  }, [checkoutDiag]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const modalClass = 'ripx-install-detail-modal-open';
    const root = document.documentElement;
    if (isInstallDetailModalOpen) {
      document.body.classList.add(modalClass);
      root?.classList.add(modalClass);
    } else {
      document.body.classList.remove(modalClass);
      root?.classList.remove(modalClass);
    }
    return () => {
      document.body.classList.remove(modalClass);
      root?.classList.remove(modalClass);
    };
  }, [isInstallDetailModalOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const overlayId = 'ripx-install-detail-modal-overlay';
    if (!isInstallDetailModalOpen) {
      const existing = document.getElementById(overlayId);
      if (existing) existing.remove();
      return undefined;
    }

    const ensureOverlay = () => {
      let overlay = document.getElementById(overlayId);
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'ripx-install-detail-modal-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
      }
    };

    ensureOverlay();
    const observer = new MutationObserver(() => {
      ensureOverlay();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const existing = document.getElementById(overlayId);
      if (existing) existing.remove();
    };
  }, [isInstallDetailModalOpen]);

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

  const fetchSettings = useCallback(async () => {
    setSettingsLoadError(false);
    try {
      setLoading(true);
      const response = await apiGet(
        '/settings',
        appSettingsDomain ? { domain: appSettingsDomain } : {}
      );
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
  }, [appSettingsDomain]);

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
      const res = await apiGet(
        '/settings/integrations',
        appSettingsDomain ? { domain: appSettingsDomain } : {}
      );
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
  }, [appSettingsDomain]);

  const fetchInstallation = useCallback(async () => {
    setInstallationLoading(true);
    setInstallationError(false);
    try {
      const res = await apiGet(
        '/settings/installation',
        appSettingsDomain ? { domain: appSettingsDomain } : {}
      );
      const data = unwrapData(res)?.installation ?? null;
      setInstallation(data);
      if (!data) setInstallationError(true);
    } catch {
      setInstallation(null);
      setInstallationError(true);
    } finally {
      setInstallationLoading(false);
    }
  }, [appSettingsDomain]);

  const fetchShopifyFnInventory = useCallback(async () => {
    if (!installation?.domain) return;
    setShopifyFnInventoryLoading(true);
    setShopifyFnInventoryError(null);
    try {
      const res = await apiGet('/settings/shopify-functions-inventory', {
        domain: installation.domain,
      });
      const data = unwrapData(res);
      setShopifyFnInventory(data);
      if (data && data.success === false && data.error) {
        setShopifyFnInventoryError(String(data.error));
      }
    } catch (e) {
      setShopifyFnInventoryError(e?.message || 'Could not load Shopify functions inventory');
      setShopifyFnInventory(null);
    } finally {
      setShopifyFnInventoryLoading(false);
    }
  }, [installation?.domain]);

  const runCheckoutExperienceDiagnostics = useCallback(async () => {
    if (!installation?.domain) return;
    setCheckoutExperienceDiagLoading(true);
    setCheckoutExperienceDiagError(null);
    try {
      const res = await apiGet('/settings/checkout-experience-diagnostics', {
        domain: installation.domain,
      });
      const data = unwrapData(res);
      if (!data || data.success === false) {
        throw new Error(data?.error || 'Invalid checkout experience diagnostics response');
      }
      setCheckoutExperienceDiag(data);
    } catch (e) {
      setCheckoutExperienceDiagError(
        e?.message || 'Could not load checkout experience diagnostics'
      );
      setCheckoutExperienceDiag(null);
    } finally {
      setCheckoutExperienceDiagLoading(false);
    }
  }, [installation?.domain]);

  const fetchCheckoutCustomizationTests = useCallback(async () => {
    if (!isAppSettings) return;
    setCheckoutCustomizationTestsLoading(true);
    setCheckoutCustomizationTestsError(null);
    try {
      const listRes = await apiGet('/tests');
      const listData = unwrapData(listRes);
      const tests = Array.isArray(listData?.tests)
        ? listData.tests
        : Array.isArray(listData)
          ? listData
          : [];
      setCheckoutCustomizationTests(tests);
    } catch (e) {
      setCheckoutCustomizationTests([]);
      setCheckoutCustomizationTestsError(
        e?.message || 'Could not load checkout customization tests'
      );
    } finally {
      setCheckoutCustomizationTestsLoading(false);
    }
  }, [isAppSettings]);

  const runCheckoutDiagnostics = useCallback(
    async (options = {}) => {
      const { silentError = false } = options || {};
      if (!installation?.domain) return;
      setCheckoutDiagLoading(true);
      setCheckoutDiagError(null);
      try {
        const res = await apiGet('/settings/checkout-price-diagnostics', {
          domain: installation.domain,
        });
        const data = unwrapData(res);
        if (!data || data.success === false) {
          throw new Error(data?.error || 'Invalid diagnostics response');
        }
        const checkedAt =
          typeof data?.timestamp === 'string' && data.timestamp.trim()
            ? data.timestamp.trim()
            : new Date().toISOString();
        setCheckoutDiag(data);
        setCheckoutDiagLastCheckedAt(checkedAt);
        writeCheckoutDiagCache(installation.domain, checkedAt, data);
        checkoutDiagAutoRefreshRef.current[String(installation.domain).toLowerCase()] = Date.now();
        await fetchShopifyFnInventory();
      } catch (e) {
        if (!(silentError && checkoutDiagRef.current)) {
          setCheckoutDiagError(e?.message || 'Could not load diagnostics');
        }
      } finally {
        setCheckoutDiagLoading(false);
      }
    },
    [installation?.domain, fetchShopifyFnInventory]
  );

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

  useEffect(() => {
    if (!isAppSettings) return;
    const domain = String(installation?.domain || '')
      .trim()
      .toLowerCase();
    if (!domain) {
      setCheckoutDiag(null);
      setCheckoutDiagLastCheckedAt(null);
      return;
    }
    const cached = readCheckoutDiagCache(domain);
    if (cached?.data) {
      setCheckoutDiag(cached.data);
      setCheckoutDiagLastCheckedAt(cached.checkedAt);
      setCheckoutDiagError(null);
      return;
    }
    setCheckoutDiag(null);
    setCheckoutDiagLastCheckedAt(null);
  }, [isAppSettings, installation?.domain]);

  useEffect(() => {
    if (!isAppSettings) return;
    const domain = String(installation?.domain || '')
      .trim()
      .toLowerCase();
    if (!domain || checkoutDiagLoading) return;

    const lastCheckedMs = checkoutDiagLastCheckedAt
      ? new Date(checkoutDiagLastCheckedAt).getTime()
      : NaN;
    const hasFreshTimestamp = Number.isFinite(lastCheckedMs);
    const ageMs = hasFreshTimestamp ? Date.now() - lastCheckedMs : Number.POSITIVE_INFINITY;
    const shouldAutoRefresh = ageMs > CHECKOUT_DIAG_STALE_AFTER_MS;
    if (!shouldAutoRefresh) return;

    const lastAutoAttempt = Number(checkoutDiagAutoRefreshRef.current[domain] || 0);
    if (Date.now() - lastAutoAttempt < 30000) return;
    checkoutDiagAutoRefreshRef.current[domain] = Date.now();
    runCheckoutDiagnostics({ silentError: true });
  }, [
    isAppSettings,
    installation?.domain,
    checkoutDiagLastCheckedAt,
    checkoutDiagLoading,
    runCheckoutDiagnostics,
  ]);

  useEffect(() => {
    if (!isAppSettings || !installation?.domain) return;
    runCheckoutExperienceDiagnostics();
  }, [isAppSettings, installation?.domain, runCheckoutExperienceDiagnostics]);

  useEffect(() => {
    if (!isAppSettings) return;
    fetchCheckoutCustomizationTests();
  }, [fetchCheckoutCustomizationTests, isAppSettings]);

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
      setMessage('App settings saved successfully');
      return true;
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to save app settings');
      return false;
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

  const handleTabNavKeyDown = useCallback(
    e => {
      if (isGuidedSetupMode) {
        return;
      }
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
    },
    [TAB_CONFIG.length, isGuidedSetupMode, selectedTab, setSelectedTab]
  );

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

  const storeHealth = useMemo(() => {
    const checks = [];
    const scriptDetected = installation?.scriptVerified === true;
    checks.push({
      key: 'script_detected',
      ok: scriptDetected,
      required: true,
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
      required: true,
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
      required: true,
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
      required: true,
      message:
        tenantRegistered === null
          ? 'Tenant registration status unavailable.'
          : tenantRegistered
            ? 'Shop tenant is registered.'
            : 'Shop tenant is not registered for this backend.',
    });

    const cartNativeStatus = String(
      installation?.instructions?.cartNative?.status ||
        checkoutDiag?.support?.cart_rendering?.level ||
        ''
    )
      .trim()
      .toLowerCase();
    const cartNativeInstalled =
      cartNativeStatus === 'native_installed' ||
      cartNativeStatus === 'ready' ||
      cartNativeStatus === 'native_supported';
    checks.push({
      key: 'cart_native_rendering',
      ok: cartNativeInstalled,
      required: false,
      message: cartNativeInstalled
        ? 'Cart native discount rendering markers are configured.'
        : 'Cart native discount rendering is not confirmed (JS fallback may still be used on this theme).',
    });

    const requiredChecks = checks.filter(c => c.required !== false);
    const ready = requiredChecks.every(c => c.ok);
    const supportLevel = !ready
      ? 'setup_incomplete'
      : cartNativeInstalled
        ? 'native_cart_checkout_aligned'
        : 'checkout_aligned_cart_fallback';
    return {
      ready,
      checks,
      failed: requiredChecks.filter(c => !c.ok),
      advisories: checks.filter(c => c.required === false && !c.ok),
      supportLevel,
    };
  }, [installation?.scriptVerified, installation?.instructions?.cartNative?.status, checkoutDiag]);

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
    return 'Setup incomplete: required checks are not passing yet (script, diagnostics, tenant, or running price test).';
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
    const passedRequired = requiredChecks.filter(item => item.ok).length;
    const failedRequired = requiredChecks.filter(item => !item.ok);
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
        tone: 'info',
        status: 'Review in test',
        summary:
          'Shipping checkout paths now report adapter-specific readiness per test, because automatic, discount-only, and manual strategies can differ by variant.',
        nextAction:
          'Open a shipping test and use Checkout readiness to confirm whether each variant is automatic, discount-only, or manual before launch.',
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
  const selectedSettingsPresetKey = useMemo(() => {
    const match = Object.entries(SETTINGS_PRESETS).find(([, preset]) => {
      return (
        Number(settings.minSampleSize) === Number(preset.minSampleSize) &&
        Math.abs(Number(settings.confidenceLevel) - Number(preset.confidenceLevel)) < 0.001 &&
        Boolean(settings.autoStopEnabled) === Boolean(preset.autoStopEnabled)
      );
    });
    return match?.[0] || null;
  }, [settings.minSampleSize, settings.confidenceLevel, settings.autoStopEnabled]);
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
  const selectedThemeLabel = useMemo(() => {
    return THEME_OPTIONS.find(option => option.value === theme)?.label || 'Light';
  }, [theme]);
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
      {
        id: 'appearance',
        label: 'Appearance',
        shortLabel: 'AP',
        status: 'neutral',
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
      appearance: 'Tune visual preferences and operator experience.',
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
      appearance: {
        label: selectedThemeLabel,
        status: 'neutral',
      },
    }),
    [
      configuredIntegrationCount,
      selectedSettingsPresetKey,
      selectedThemeLabel,
      setupComplete,
      targetingPresets,
    ]
  );

  const appSettingsSubtitleHelp =
    'Manage snippet and checkout setup, defaults, integrations, targeting presets, and appearance for this shop.';

  const metricTips = useMemo(
    () => ({
      activeSection: 'Currently selected tab.',
      store: 'Shop currently being configured.',
      connections: 'Connected GA4 and BigQuery integrations.',
      checks: 'Setup health checks for snippet, discount, and checkout alignment.',
    }),
    []
  );

  const installationHubPath = useMemo(() => {
    if (!appSettingsDomain) return ROUTES.SETTINGS;
    return `${ROUTES.appSettings(appSettingsDomain)}?tab=installation&guided_setup=1`;
  }, [appSettingsDomain]);
  const isInstallationSectionActive = isAppSettings && activeTabId === 'installation';
  const isFocusedInstallationMode =
    isAppSettings && isGuidedSetupMode && activeTabId === 'installation';
  const showInstallationSupportCards =
    (!isFocusedInstallationMode && !showAllAppSections) || installation?.platform !== 'shopify';

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
  const appearanceSectionSummary = useMemo(() => {
    return `${selectedThemeLabel} theme is active. Use Profile preferences only for custom scheduling.`;
  }, [selectedThemeLabel]);
  const presetsSectionSummary = useMemo(() => {
    if (targetingPresets.length === 0) {
      return 'No saved targeting presets yet. Create one in the Test Wizard when you want reusable targeting.';
    }
    return `${targetingPresets.length} saved targeting preset${
      targetingPresets.length === 1 ? '' : 's'
    } ready to reuse in the Test Wizard.`;
  }, [targetingPresets]);
  const installationCheckRows = useMemo(() => {
    if (!installation) return [];
    return [
      {
        id: 'script',
        title: 'Storefront script',
        tone: installation.scriptVerified ? 'success' : 'warning',
        status: installation.scriptVerified ? 'Detected' : 'Needs check',
        summary: installation.scriptVerified
          ? 'RipX script is loading on the storefront.'
          : 'Verify the storefront script/snippet is present and loading.',
        actionLabel: 'Check',
        onAction: () => runCheckoutDiagnostics(),
        loading: checkoutDiagLoading,
        disabled: checkoutDiagLoading || checkoutFullVerifyRunning,
        secondaryLabel: 'Snippet',
        onSecondaryAction: () => setInstallSnippetModalOpen(true),
      },
      {
        id: 'store-health',
        title: 'Store health',
        tone: storeHealth.ready ? 'success' : 'warning',
        status: storeHealth.ready ? 'Passing' : `${storeHealth.failed.length} issue(s)`,
        summary: storeHealth.ready
          ? 'Core installation checks are aligned for this store.'
          : storeHealth.failed[0]?.message || 'Run checks to see the current blocker.',
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
        id: 'offer-readiness',
        title: 'Offer checkout path',
        tone: checkoutDiscountAttached ? 'success' : 'warning',
        status: checkoutDiscountAttached ? 'Ready' : 'Needs install',
        summary: checkoutDiscountAttached
          ? 'Discount function is attached for Offer campaigns.'
          : 'Attach the RipX automatic discount so Shopify can execute the offer checkout path.',
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
    checkoutDiscountAttached,
    runCheckoutDiagnostics,
    runFullCheckoutVerification,
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
        summary: cartTransformInstalled
          ? 'Cart Transform is installed and ready for matrix-based Price tests.'
          : 'Install or verify the RipX cart transform for direct price override at cart and checkout.',
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
          ? 'Diagnostics passed for the current app URL and resolver configuration.'
          : 'Run diagnostics after changing URLs, scopes, secrets, or installed functions.',
        actionLabel: 'Run',
        onAction: () => runCheckoutDiagnostics(),
        loading: checkoutDiagLoading,
        disabled: checkoutDiagLoading || checkoutFullVerifyRunning,
        secondaryLabel: 'Advanced',
        onSecondaryAction: () => setInstallAdvancedOpen(true),
      },
      {
        id: 'discount-list',
        title: 'Discount list check',
        tone: checkoutDiscountListCheck?.inList ? 'success' : 'attention',
        status: checkoutDiscountListCheck?.inList ? 'Found in Shopify' : 'Not checked',
        summary: checkoutDiscountListCheck?.inList
          ? 'RipX discount is present in the Shopify automatic discount list.'
          : 'Confirm the attached discount is visible in Shopify after installation.',
        actionLabel: 'Check',
        onAction: () => runCheckoutDiscountListCheck(),
        loading: checkoutDiscountListCheckLoading,
        disabled:
          checkoutDiscountListCheckLoading || checkoutDiscountEnsuring || checkoutFullVerifyRunning,
        secondaryLabel: 'Debug',
        onSecondaryAction: () => setInstallDebugJsonOpen(true),
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
  ]);
  return (
    <PageShell
      message={message}
      messageType={message?.includes('Failed') ? 'error' : 'success'}
      onCloseMessage={() => setMessage(null)}
      messageDuration={message?.includes('Failed') ? 5000 : 3000}
      className={`${styles.settingsPage} ${layoutDensity === 'compact' ? styles.settingsDensityCompact : ''}`}
    >
      <Page title="" subtitle="">
        <div className={styles.settingsLayout}>
          <div className={styles.settingsPageColumn}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsShell}>
                <div className={styles.settingsShellHeaderRow}>
                  <div className={styles.settingsShellTitleGroup}>
                    <div className={styles.settingsShellIcon} aria-hidden>
                      <SettingsIcon />
                    </div>
                    <div className={styles.settingsShellTitleBlock}>
                      <h1 className={styles.settingsShellTitle}>
                        {isAppSettings ? 'App settings' : 'Account settings'}
                      </h1>
                      <div className={styles.settingsShellSubtitleRow}>
                        <p className={styles.settingsShellSubtitle}>
                          {isAppSettings
                            ? isFocusedInstallationMode || isInstallationSectionActive
                              ? 'Installation hub surfaces launch blockers first and keeps secondary setup details behind focused actions.'
                              : 'Setup, checkout, defaults, integrations, targeting presets, and appearance for this shop.'
                            : 'Theme and appearance. Open the app from Home for tests and installation.'}
                        </p>
                        {isAppSettings && (
                          <Tooltip content={appSettingsSubtitleHelp}>
                            <span
                              className={styles.settingsShellSubtitleHint}
                              tabIndex={0}
                              aria-label="More about app settings"
                            >
                              <Icon source={InfoIcon} />
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </div>
                  {isAppSettings && !isFocusedInstallationMode && (
                    <div className={styles.settingsShellBadges}>
                      <Badge tone={setupComplete ? 'success' : 'attention'}>
                        {setupComplete ? 'Setup ready' : 'Setup pending'}
                      </Badge>
                      <Badge tone={supportLevelBadgeTone}>Support: {supportLevelBadgeLabel}</Badge>
                      <Tooltip content={supportLevelHelpText}>
                        <span
                          className={styles.supportLevelHint}
                          role="note"
                          aria-label="Support level help"
                        >
                          Support details
                        </span>
                      </Tooltip>
                    </div>
                  )}
                </div>

                {isAppSettings && !isFocusedInstallationMode && (
                  <div
                    className={styles.settingsMetricsGrid}
                    role="region"
                    aria-label="Store overview"
                  >
                    <div className={styles.settingsMetricCell}>
                      <span className={styles.settingsMetricLabelWithTip}>
                        <span className={styles.settingsMetricLabel}>
                          {showAllAppSections ? 'View mode' : 'Active section'}
                        </span>
                        <Tooltip
                          content={
                            showAllAppSections
                              ? 'App Settings now uses a continuous layout with all sections visible.'
                              : metricTips.activeSection
                          }
                        >
                          <span
                            className={styles.settingsMetricTip}
                            tabIndex={0}
                            aria-label={
                              showAllAppSections
                                ? 'Continuous app settings layout'
                                : metricTips.activeSection
                            }
                          >
                            <Icon source={InfoIcon} />
                          </span>
                        </Tooltip>
                      </span>
                      <span className={styles.settingsMetricValue}>
                        <span className={styles.settingsMetricValueIcon} aria-hidden>
                          <Icon
                            source={
                              showAllAppSections
                                ? SettingsIcon
                                : activeTabMeta?.icon || SettingsIcon
                            }
                          />
                        </span>
                        <span>
                          {showAllAppSections ? 'All sections' : activeTabMeta?.label || 'Settings'}
                        </span>
                      </span>
                    </div>
                    <div className={styles.settingsMetricCell}>
                      <span className={styles.settingsMetricLabelWithTip}>
                        <span className={styles.settingsMetricLabel}>Store</span>
                        <Tooltip content={metricTips.store}>
                          <span
                            className={styles.settingsMetricTip}
                            tabIndex={0}
                            aria-label={metricTips.store}
                          >
                            <Icon source={InfoIcon} />
                          </span>
                        </Tooltip>
                      </span>
                      <span className={styles.settingsMetricValue} title={currentStoreLabel}>
                        {currentStoreLabel}
                      </span>
                    </div>
                    <div className={styles.settingsMetricCell}>
                      <span className={styles.settingsMetricLabelWithTip}>
                        <span className={styles.settingsMetricLabel}>Connections</span>
                        <Tooltip content={metricTips.connections}>
                          <span
                            className={styles.settingsMetricTip}
                            tabIndex={0}
                            aria-label={metricTips.connections}
                          >
                            <Icon source={InfoIcon} />
                          </span>
                        </Tooltip>
                      </span>
                      <span className={styles.settingsMetricValue}>
                        {configuredIntegrationCount}/{INTEGRATIONS_CONFIG.length}
                        <span className={styles.settingsMetricHint}>
                          {configuredIntegrationCount > 0 ? 'linked' : 'optional'}
                        </span>
                      </span>
                    </div>
                    <div className={styles.settingsMetricCell}>
                      <span className={styles.settingsMetricLabelWithTip}>
                        <span className={styles.settingsMetricLabel}>Checks</span>
                        <Tooltip content={metricTips.checks}>
                          <span
                            className={styles.settingsMetricTip}
                            tabIndex={0}
                            aria-label={metricTips.checks}
                          >
                            <Icon source={InfoIcon} />
                          </span>
                        </Tooltip>
                      </span>
                      <span className={styles.settingsMetricValue}>
                        {storeHealth.ready ? 'Passing' : `${storeHealth.failed.length} to fix`}
                      </span>
                    </div>
                  </div>
                )}
                {isAppSettings && showAllAppSections && !isFocusedInstallationMode && (
                  <div className={styles.settingsShellQuickNav}>
                    <Text as="span" variant="bodySm" className={styles.settingsShellQuickNavLabel}>
                      Jump to
                    </Text>
                    <div className={styles.settingsShellQuickNavScroll}>
                      <div className={styles.settingsShellQuickNavTrack}>
                        {appSettingsSectionIndex.map(section => (
                          <button
                            key={section.id}
                            type="button"
                            className={`${styles.settingsShellQuickNavChip} ${
                              activeAppSectionId === section.id
                                ? styles.settingsShellQuickNavChipActive
                                : ''
                            }`}
                            onClick={() => scrollToAppSection(section.id)}
                            aria-current={activeAppSectionId === section.id ? 'true' : undefined}
                          >
                            <span className={styles.settingsShellQuickNavChipMain}>
                              <span className={styles.settingsShellQuickNavChipLabel}>
                                {section.label}
                              </span>
                              <span className={styles.settingsShellQuickNavChipMeta}>
                                <span
                                  className={`${styles.settingsShellQuickNavChipDot} ${
                                    section.status === 'ok'
                                      ? styles.settingsShellQuickNavChipDotOk
                                      : section.status === 'warn'
                                        ? styles.settingsShellQuickNavChipDotWarn
                                        : styles.settingsShellQuickNavChipDotNeutral
                                  }`}
                                  aria-hidden="true"
                                />
                                {section.status === 'ok'
                                  ? section.id === 'installation'
                                    ? 'Ready'
                                    : section.id === 'integrations'
                                      ? 'Connected'
                                      : section.id === 'presets'
                                        ? 'Saved'
                                        : 'Available'
                                  : section.status === 'warn'
                                    ? 'Needs focus'
                                    : 'Available'}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              {isAppSettings && !isFocusedInstallationMode && !isInstallationSectionActive && (
                <div
                  className={styles.settingsCommandBar}
                  role="region"
                  aria-label="Workflow actions"
                >
                  <div className={styles.settingsCommandBarMeta}>
                    <Text as="p" variant="headingSm">
                      Setup workflow
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Use Installation for setup, verification, and checkout readiness. Use the
                      other sections for advanced configuration.
                    </Text>
                  </div>
                  <InlineStack
                    className={styles.settingsCommandBarActions}
                    gap="200"
                    wrap
                    blockAlign="center"
                  >
                    <Badge tone={setupComplete ? 'success' : 'warning'}>
                      {setupComplete ? 'Setup ready' : 'Setup pending'}
                    </Badge>
                    <Button size="slim" variant="primary" url={installationHubPath}>
                      Go to Installation
                    </Button>
                    <Button size="slim" onClick={() => runCheckoutDiagnostics()}>
                      Run checkout diagnostics
                    </Button>
                    <Button size="slim" onClick={() => runCheckoutExperienceDiagnostics()}>
                      Sync checkout UI status
                    </Button>
                  </InlineStack>
                </div>
              )}

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

              {settingsLoadError && (
                <Banner
                  tone="critical"
                  onDismiss={() => setSettingsLoadError(false)}
                  action={{ content: 'Retry', onAction: () => fetchSettings() }}
                >
                  Couldn&apos;t load app settings. Check your connection and try again. You can
                  still use Installation, Integrations, and other tabs.
                </Banner>
              )}
              {isGuidedSetupMode && (
                <Banner
                  tone="info"
                  title="Focused installation mode"
                  action={{ content: 'Exit guided mode', onAction: clearGuidedSetupMode }}
                >
                  <p>
                    Only the Installation section is shown in this mode so you can finish setup
                    faster. Exit focused mode to access the other settings sections.
                  </p>
                </Banner>
              )}
              {isAppSettings &&
                !setupComplete &&
                !isGuidedSetupMode &&
                !isInstallationSectionActive && (
                  <Banner tone="warning" title="Finish setup first for best results">
                    <p>
                      Complete the Installation hub before editing advanced settings.{' '}
                      <Link to={installationHubPath} className={styles.installDocLink}>
                        Go to Installation
                      </Link>
                    </p>
                  </Banner>
                )}
            </div>

            <main
              id="settings-main"
              ref={settingsBodyRef}
              className={styles.settingsBody}
              aria-label={isAppSettings ? 'App settings content' : 'Account settings content'}
            >
              {!showAllAppSections && (
                <div className={styles.settingsTabStickyWrap}>
                  <nav
                    className={`${styles.settingsTabBar} ${styles.settingsTopNav}`}
                    role="tablist"
                    aria-label={
                      isAppSettings ? 'App settings sections' : 'Account settings sections'
                    }
                    onKeyDown={handleTabNavKeyDown}
                  >
                    {visibleTabEntries.map(({ tab, index }) => {
                      const meta = isAppSettings ? tabStatusMeta[tab.id] : null;
                      const status = meta?.status || 'neutral';
                      const statusClass =
                        status === 'ok'
                          ? styles.settingsTabMetaDotOk
                          : status === 'warn'
                            ? styles.settingsTabMetaDotWarn
                            : styles.settingsTabMetaDotNeutral;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          tabIndex={selectedTab === index ? 0 : -1}
                          aria-selected={selectedTab === index}
                          aria-controls={`settings-panel-${tab.id}`}
                          id={`settings-tab-${tab.id}`}
                          className={`${styles.settingsTab} ${
                            selectedTab === index ? styles.settingsTabActive : ''
                          }`}
                          onClick={() => setSelectedTab(index)}
                          data-tab-status={status}
                        >
                          <span className={styles.settingsTabIcon}>
                            <Icon source={tab.icon} />
                          </span>
                          <span className={styles.settingsTabLabelWrap}>
                            <span className={styles.settingsTabLabel}>{tab.label}</span>
                            {meta?.label ? (
                              <span className={styles.settingsTabMeta}>
                                <span
                                  className={`${styles.settingsTabMetaDot} ${statusClass}`}
                                  aria-hidden="true"
                                />
                                {meta.label}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </nav>
                </div>
              )}
              <BlockStack gap={CONTENT_GAP}>
                {loading ? (
                  <div className={styles.settingsLoadingSkeleton}>
                    <div className={styles.loadingSkeletonCard} />
                    <div className={styles.loadingSkeletonCard} style={{ height: 200 }} />
                    <div className={styles.loadingSkeletonCard} style={{ height: 160 }} />
                  </div>
                ) : (
                  <div
                    className={`${styles.settingsWorkspace} ${
                      showAllAppSections ? styles.settingsWorkspaceWithRail : ''
                    } ${
                      showAllAppSections && sectionRailCollapsed
                        ? styles.settingsWorkspaceWithRailCollapsed
                        : ''
                    }`}
                  >
                    {showAllAppSections && (
                      <aside
                        className={`${styles.settingsRail} ${
                          sectionRailCollapsed ? styles.settingsRailCollapsed : ''
                        }`}
                        aria-label="App settings section index"
                      >
                        <div className={styles.settingsRailBlock}>
                          <div className={styles.settingsRailHeader}>
                            <Text as="p" variant="bodySm" className={styles.settingsRailTitle}>
                              Sections
                            </Text>
                            <button
                              type="button"
                              className={styles.settingsRailToggle}
                              onClick={() => setSectionRailCollapsed(prev => !prev)}
                              aria-label={
                                sectionRailCollapsed
                                  ? 'Expand section rail'
                                  : 'Collapse section rail'
                              }
                              title={sectionRailCollapsed ? 'Expand' : 'Collapse'}
                            >
                              <Icon
                                source={sectionRailCollapsed ? ChevronRightIcon : ChevronLeftIcon}
                              />
                              <span className={styles.settingsRailToggleLabel}>
                                {sectionRailCollapsed ? 'Expand' : 'Collapse'}
                              </span>
                            </button>
                          </div>
                          <div className={styles.settingsRailTabs}>
                            {appSettingsSectionIndex.map(section => {
                              const statusClass =
                                section.status === 'ok'
                                  ? styles.settingsRailStatusOk
                                  : section.status === 'warn'
                                    ? styles.settingsRailStatusWarn
                                    : styles.settingsRailStatusNeutral;
                              const railButton = (
                                <button
                                  type="button"
                                  className={`${styles.settingsRailTab} ${
                                    activeAppSectionId === section.id
                                      ? styles.settingsRailTabActive
                                      : ''
                                  }`}
                                  onClick={() => scrollToAppSection(section.id)}
                                  aria-current={
                                    activeAppSectionId === section.id ? 'true' : undefined
                                  }
                                  aria-label={section.label}
                                  title={sectionRailCollapsed ? undefined : section.label}
                                >
                                  <span className={styles.settingsRailTabLabel}>
                                    {sectionRailCollapsed ? section.shortLabel : section.label}
                                  </span>
                                  <span
                                    className={`${styles.settingsRailStatusDot} ${statusClass}`}
                                    aria-hidden="true"
                                  />
                                </button>
                              );
                              if (sectionRailCollapsed) {
                                return (
                                  <Tooltip
                                    key={section.id}
                                    content={section.label}
                                    preferredPosition="right"
                                    active={activeRailTooltipId === section.id}
                                  >
                                    <span
                                      className={`${styles.settingsRailTooltipWrap} ${
                                        activeRailTooltipId === section.id
                                          ? styles.settingsRailTooltipWrapActive
                                          : ''
                                      }`}
                                      onMouseEnter={() => scheduleRailTooltipOpen(section.id)}
                                      onMouseLeave={hideRailTooltip}
                                      onFocus={() => {
                                        clearRailTooltipTimer();
                                        setActiveRailTooltipId(section.id);
                                      }}
                                      onBlur={hideRailTooltip}
                                    >
                                      {railButton}
                                    </span>
                                  </Tooltip>
                                );
                              }
                              return <React.Fragment key={section.id}>{railButton}</React.Fragment>;
                            })}
                          </div>
                        </div>
                      </aside>
                    )}
                    <div
                      className={styles.settingsPanels}
                      role="region"
                      aria-live="polite"
                      aria-label={
                        isAppSettings ? 'App settings sections' : 'Account settings panel'
                      }
                    >
                      {!isFocusedInstallationMode && (
                        <div
                          className={`${styles.settingsContextStrip} ${
                            !showAllAppSections && isAppSettings && activeTabId === 'installation'
                              ? styles.settingsContextStripMinimal
                              : ''
                          }`}
                        >
                          {!(
                            !showAllAppSections &&
                            isAppSettings &&
                            activeTabId === 'installation'
                          ) && (
                            <Tooltip
                              content={
                                showAllAppSections
                                  ? 'All App Settings sections are visible in one organized page. Scroll to edit setup, defaults, integrations, targeting presets, and appearance without switching tabs.'
                                  : tabSummaries[activeTabId] ||
                                    'Tips and context for the tab you selected.'
                              }
                            >
                              <span className={styles.settingsContextTabHint} tabIndex={0}>
                                <span className={styles.settingsContextTabHintIcon} aria-hidden>
                                  <Icon source={InfoIcon} />
                                </span>
                                <span>
                                  {showAllAppSections ? 'About this page' : 'About this tab'}
                                </span>
                              </span>
                            </Tooltip>
                          )}
                          <div className={styles.settingsContextControls}>
                            {isAppSettings && !isGuidedSetupMode && (
                              <div className={styles.settingsContextControlGroup}>
                                <Tooltip content="Sections view is cleaner for day-to-day work. All sections keeps everything on one page for audits and bulk updates.">
                                  <span className={styles.settingsDensityGroup}>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      View
                                    </Text>
                                    <span
                                      className={styles.settingsMetricTip}
                                      tabIndex={0}
                                      aria-label="Choose between section tabs or one-page layout"
                                    >
                                      <Icon source={InfoIcon} />
                                    </span>
                                  </span>
                                </Tooltip>
                                <div className={styles.settingsContextToggleGroup}>
                                  <Button
                                    size="micro"
                                    pressed={settingsLayoutMode === 'tabbed'}
                                    onClick={() => setSettingsLayoutMode('tabbed')}
                                  >
                                    Sections
                                  </Button>
                                  <Button
                                    size="micro"
                                    pressed={settingsLayoutMode === 'all'}
                                    onClick={() => setSettingsLayoutMode('all')}
                                  >
                                    All sections
                                  </Button>
                                </div>
                              </div>
                            )}
                            <div className={styles.settingsContextControlGroup}>
                              <Tooltip content={densityHelp}>
                                <span className={styles.settingsDensityGroup}>
                                  <Text as="span" variant="bodySm" tone="subdued">
                                    Density
                                  </Text>
                                  <span
                                    className={styles.settingsMetricTip}
                                    tabIndex={0}
                                    aria-label={densityHelp}
                                  >
                                    <Icon source={InfoIcon} />
                                  </span>
                                </span>
                              </Tooltip>
                              <div className={styles.settingsContextToggleGroup}>
                                <Button
                                  size="micro"
                                  pressed={layoutDensity === 'comfortable'}
                                  onClick={() => setLayoutDensity('comfortable')}
                                >
                                  Comfortable
                                </Button>
                                <Button
                                  size="micro"
                                  pressed={layoutDensity === 'compact'}
                                  onClick={() => setLayoutDensity('compact')}
                                >
                                  Compact
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {isAppSettings && (showAllAppSections || activeTabId === 'installation') && (
                        <div
                          id="settings-panel-installation"
                          ref={node => setAppSectionNode('installation', node)}
                          data-app-section="installation"
                          role={showAllAppSections ? 'region' : 'tabpanel'}
                          aria-labelledby={
                            showAllAppSections ? undefined : 'settings-tab-installation'
                          }
                          aria-label={showAllAppSections ? 'Installation settings' : undefined}
                          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelInstallation}`}
                        >
                          {installation && (
                            <Card
                              className={`${styles.settingsPanelCard} ${styles.installHubCard}`}
                            >
                              <Box padding="500">
                                <BlockStack gap="400">
                                  <div className={styles.installHubHeader}>
                                    <div className={styles.installHubHeaderContent}>
                                      <Text variant="headingMd" as="h2">
                                        Smart setup hub
                                      </Text>
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        Work top to bottom: first confirm the store is ready, then
                                        enable only the checkout pieces you still need. Deeper
                                        details stay behind the row actions.
                                      </Text>
                                    </div>
                                    <InlineStack gap="200" wrap blockAlign="center">
                                      {checkoutDiagCheckedLabel && (
                                        <Badge tone={checkoutDiagIsStale ? 'attention' : 'success'}>
                                          {checkoutDiagIsStale
                                            ? 'Status may be stale'
                                            : 'Status fresh'}
                                        </Badge>
                                      )}
                                    </InlineStack>
                                  </div>
                                  <div className={styles.installHubGrid}>
                                    <div className={styles.installHubSection}>
                                      <div className={styles.installHubSectionHeader}>
                                        <Text variant="headingSm" as="h3">
                                          1. Verify store
                                        </Text>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Confirm the blockers first before installing anything
                                          else.
                                        </Text>
                                      </div>
                                      <BlockStack gap="200">
                                        {installationCheckRows.map(item => (
                                          <div key={item.id} className={styles.installHubRow}>
                                            <div className={styles.installHubRowMain}>
                                              <div className={styles.installHubRowTitle}>
                                                <Text
                                                  as="span"
                                                  variant="bodyMd"
                                                  fontWeight="semibold"
                                                >
                                                  {item.title}
                                                </Text>
                                                <Badge tone={item.tone}>{item.status}</Badge>
                                              </div>
                                              <Text as="p" variant="bodySm" tone="subdued">
                                                {item.summary}
                                              </Text>
                                            </div>
                                            <div className={styles.installHubRowActions}>
                                              <Button
                                                size="slim"
                                                onClick={item.onAction}
                                                loading={item.loading}
                                                disabled={item.disabled}
                                              >
                                                {item.actionLabel}
                                              </Button>
                                              {item.secondaryLabel && item.onSecondaryAction && (
                                                <Button
                                                  size="slim"
                                                  variant="plain"
                                                  onClick={item.onSecondaryAction}
                                                >
                                                  {item.secondaryLabel}
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </BlockStack>
                                    </div>
                                    <div className={styles.installHubSection}>
                                      <div className={styles.installHubSectionHeader}>
                                        <Text variant="headingSm" as="h3">
                                          2. Enable checkout path
                                        </Text>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Turn on only the missing checkout pieces for this store.
                                        </Text>
                                      </div>
                                      <BlockStack gap="200">
                                        {installationActionRows.map(item => (
                                          <div key={item.id} className={styles.installHubRow}>
                                            <div className={styles.installHubRowMain}>
                                              <div className={styles.installHubRowTitle}>
                                                <Text
                                                  as="span"
                                                  variant="bodyMd"
                                                  fontWeight="semibold"
                                                >
                                                  {item.title}
                                                </Text>
                                                <Badge tone={item.tone}>{item.status}</Badge>
                                              </div>
                                              <Text as="p" variant="bodySm" tone="subdued">
                                                {item.summary}
                                              </Text>
                                            </div>
                                            <div className={styles.installHubRowActions}>
                                              <Button
                                                size="slim"
                                                onClick={item.onAction}
                                                loading={item.loading}
                                                disabled={item.disabled}
                                              >
                                                {item.actionLabel}
                                              </Button>
                                              {item.secondaryLabel && item.onSecondaryAction && (
                                                <Button
                                                  size="slim"
                                                  variant="plain"
                                                  onClick={item.onSecondaryAction}
                                                >
                                                  {item.secondaryLabel}
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </BlockStack>
                                    </div>
                                  </div>
                                </BlockStack>
                              </Box>
                            </Card>
                          )}
                          {showInstallationSupportCards && (
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
                                            ? 'Load the app to finish setup and get your snippet.'
                                            : installation.platform === 'shopify'
                                              ? 'Paste once in your theme or app embed (head).'
                                              : "Add this script to your site's <head>."}
                                      </Text>
                                    </div>
                                  </div>

                                  {installationLoading ? (
                                    <div className={styles.installationSkeleton}>
                                      <div
                                        className={styles.loadingBlock}
                                        style={{ height: 48, marginBottom: '1rem' }}
                                      />
                                      <div
                                        className={styles.loadingBlock}
                                        style={{ height: 140 }}
                                      />
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
                                          ? "We couldn't load the storefront snippet. Retry, or reopen Installation after adding or reconnecting a domain."
                                          : 'Open Installation to load your storefront snippet and setup steps.'}
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
                                          Open app
                                        </Link>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className={styles.installSupportCompact}>
                                      <div className={styles.installSupportGrid}>
                                        <div className={styles.installSupportMetric}>
                                          <span className={styles.installSupportMetricLabel}>
                                            Snippet
                                          </span>
                                          <span className={styles.installSupportMetricValue}>
                                            Ready to copy
                                          </span>
                                        </div>
                                        <div className={styles.installSupportMetric}>
                                          <span className={styles.installSupportMetricLabel}>
                                            Script status
                                          </span>
                                          <span className={styles.installSupportMetricValue}>
                                            {installation.scriptVerified
                                              ? 'Detected on site'
                                              : 'Not verified yet'}
                                          </span>
                                        </div>
                                        <div className={styles.installSupportMetric}>
                                          <span className={styles.installSupportMetricLabel}>
                                            Optional helpers
                                          </span>
                                          <span className={styles.installSupportMetricValue}>
                                            {[
                                              Array.isArray(installation.instructions?.steps) &&
                                              installation.instructions.steps.length > 0
                                                ? 'Setup steps'
                                                : null,
                                              installation.instructions?.altMethod
                                                ? 'Alt embed'
                                                : null,
                                              installation.instructions?.cartNative
                                                ? 'Cart native'
                                                : null,
                                            ]
                                              .filter(Boolean)
                                              .join(' • ') || 'None'}
                                          </span>
                                        </div>
                                      </div>
                                      <div className={styles.installSupportCallout}>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Keep this tab focused on launch actions. Full snippet, alt
                                          embed, and cart-native instructions stay in the detail
                                          modal.
                                        </Text>
                                      </div>
                                      <InlineStack gap="200" wrap>
                                        <Button
                                          size="slim"
                                          onClick={() => setInstallSnippetModalOpen(true)}
                                        >
                                          Open snippet details
                                        </Button>
                                        <Button
                                          icon={ClipboardIcon}
                                          onClick={handleCopySnippet}
                                          variant="plain"
                                          size="slim"
                                        >
                                          {copiedSnippet ? 'Copied!' : 'Copy snippet'}
                                        </Button>
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
                                      </InlineStack>
                                    </div>
                                  )}
                                </BlockStack>
                              </Box>
                            </Card>
                          )}
                          {installation && showInstallationSupportCards && (
                            <Card className={`${styles.settingsPanelCard} ${styles.installSide}`}>
                              <Box padding="500">
                                <BlockStack gap={CONTENT_GAP}>
                                  <div className={styles.sectionHeader}>
                                    <div className={styles.sectionHeaderIcon}>
                                      <CodeIcon />
                                    </div>
                                    <div className={styles.sectionHeaderContent}>
                                      <Text variant="headingMd" as="h2">
                                        Setup helpers
                                      </Text>
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        Fallback install options for stores that need a manual
                                        assist.
                                      </Text>
                                    </div>
                                  </div>
                                  <div className={styles.panelCardBody}>
                                    <BlockStack gap="200">
                                      <div className={styles.installSupportItem}>
                                        <div className={styles.installSupportItemMain}>
                                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                                            Setup steps
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            {Array.isArray(installation.instructions?.steps) &&
                                            installation.instructions.steps.length > 0
                                              ? `${installation.instructions.steps.length} optional manual step(s) are available if needed.`
                                              : 'No extra manual steps are suggested right now.'}
                                          </Text>
                                        </div>
                                        <Badge
                                          tone={
                                            Array.isArray(installation.instructions?.steps) &&
                                            installation.instructions.steps.length > 0
                                              ? 'attention'
                                              : 'success'
                                          }
                                        >
                                          {Array.isArray(installation.instructions?.steps) &&
                                          installation.instructions.steps.length > 0
                                            ? `${installation.instructions.steps.length} available`
                                            : 'None'}
                                        </Badge>
                                      </div>
                                      <div className={styles.installSupportItem}>
                                        <div className={styles.installSupportItemMain}>
                                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                                            Alternative embed
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            {installation.instructions?.altMethod
                                              ? `${installation.instructions.altMethod} is available as a fallback path.`
                                              : 'No alternate embed method is configured for this store.'}
                                          </Text>
                                        </div>
                                        <Badge
                                          tone={
                                            installation.instructions?.altMethod
                                              ? 'attention'
                                              : 'success'
                                          }
                                        >
                                          {installation.instructions?.altMethod || 'Default only'}
                                        </Badge>
                                      </div>
                                      <div className={styles.installSupportItem}>
                                        <div className={styles.installSupportItemMain}>
                                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                                            Cart-native rendering
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            {installation.instructions?.cartNative?.summary ||
                                              'No cart-native theme assist is configured.'}
                                          </Text>
                                        </div>
                                        <Badge
                                          tone={
                                            installation.instructions?.cartNative?.status ===
                                            'manual_required'
                                              ? 'attention'
                                              : installation.instructions?.cartNative
                                                ? 'success'
                                                : 'info'
                                          }
                                        >
                                          {installation.instructions?.cartNative?.status ===
                                          'manual_required'
                                            ? 'Manual step'
                                            : installation.instructions?.cartNative
                                              ? 'Configured'
                                              : 'Not needed'}
                                        </Badge>
                                      </div>
                                      <InlineStack gap="200" wrap>
                                        <Button
                                          size="slim"
                                          onClick={() => setInstallSnippetModalOpen(true)}
                                        >
                                          Open install details
                                        </Button>
                                        <Button
                                          size="slim"
                                          variant="plain"
                                          onClick={() => setInstallAdvancedOpen(true)}
                                        >
                                          Open advanced tools
                                        </Button>
                                      </InlineStack>
                                    </BlockStack>
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
                                          Confirms your discount function and API can align checkout
                                          with price tests. Run checks after changing app URLs,
                                          secrets, or extensions.
                                        </Text>
                                      </div>
                                    </div>
                                    <div className={styles.checkoutDiagActionBar}>
                                      <div className={styles.checkoutHealthLead}>
                                        <div className={styles.checkoutHealthLeadMeta}>
                                          <div className={styles.checkoutHealthLeadMetric}>
                                            <span className={styles.checkoutHealthLeadLabel}>
                                              Launch status
                                            </span>
                                            <span className={styles.checkoutHealthLeadValue}>
                                              <Badge tone={checkoutLaunchTone}>
                                                {checkoutLaunchLabel}
                                              </Badge>
                                            </span>
                                          </div>
                                          <div className={styles.checkoutHealthLeadMetric}>
                                            <span className={styles.checkoutHealthLeadLabel}>
                                              Support mode
                                            </span>
                                            <span className={styles.checkoutHealthLeadValue}>
                                              <Badge tone={supportLevelBadgeTone}>
                                                {supportLevelBadgeLabel}
                                              </Badge>
                                            </span>
                                          </div>
                                          <div className={styles.checkoutHealthLeadMetric}>
                                            <span className={styles.checkoutHealthLeadLabel}>
                                              Last check
                                            </span>
                                            <span className={styles.checkoutHealthLeadValue}>
                                              {checkoutDiagCheckedLabel || 'Not run yet'}
                                            </span>
                                          </div>
                                        </div>
                                        {installation?.domain && (
                                          <Link
                                            to={ROUTES.appDocs(installation.domain)}
                                            className={styles.installDocLink}
                                          >
                                            Setup guide
                                          </Link>
                                        )}
                                      </div>
                                      <div className={styles.checkoutDiagActionGroups}>
                                        <InlineStack
                                          gap="300"
                                          blockAlign="center"
                                          wrap
                                          className={styles.checkoutDiagPrimaryActions}
                                        >
                                          <Button
                                            onClick={runFullCheckoutVerification}
                                            loading={checkoutFullVerifyRunning}
                                            disabled={
                                              checkoutFullVerifyRunning ||
                                              checkoutCartTransformEnsuring ||
                                              checkoutDiscountEnsuring ||
                                              checkoutDiagLoading
                                            }
                                            variant="primary"
                                          >
                                            Run full verify
                                          </Button>
                                          <Button
                                            onClick={runCheckoutDiagnostics}
                                            loading={checkoutDiagLoading}
                                            disabled={
                                              checkoutDiagLoading || checkoutFullVerifyRunning
                                            }
                                          >
                                            Run check now
                                          </Button>
                                        </InlineStack>
                                        <InlineStack
                                          gap="200"
                                          blockAlign="center"
                                          wrap
                                          className={styles.checkoutDiagSecondaryActions}
                                        >
                                          <Button
                                            size="slim"
                                            onClick={ensureCartTransform}
                                            loading={checkoutCartTransformEnsuring}
                                            disabled={
                                              checkoutCartTransformEnsuring ||
                                              checkoutFullVerifyRunning
                                            }
                                          >
                                            Install cart transform
                                          </Button>
                                          <Button
                                            size="slim"
                                            onClick={ensureCheckoutDiscount}
                                            loading={checkoutDiscountEnsuring}
                                            disabled={
                                              checkoutDiscountEnsuring || checkoutFullVerifyRunning
                                            }
                                          >
                                            Attach discount
                                          </Button>
                                          <Button
                                            size="slim"
                                            variant="plain"
                                            onClick={runCheckoutDiscountListCheck}
                                            loading={checkoutDiscountListCheckLoading}
                                            disabled={
                                              checkoutDiscountListCheckLoading ||
                                              checkoutDiscountEnsuring ||
                                              checkoutFullVerifyRunning
                                            }
                                          >
                                            Check discount list
                                          </Button>
                                        </InlineStack>
                                      </div>
                                      <InlineStack
                                        gap="200"
                                        blockAlign="center"
                                        wrap
                                        className={styles.checkoutDiagStatusRow}
                                      >
                                        {checkoutDiagCheckedLabel && (
                                          <>
                                            <Badge
                                              tone={checkoutDiagIsStale ? 'attention' : 'success'}
                                            >
                                              {checkoutDiagIsStale
                                                ? 'Status may be stale'
                                                : 'Status fresh'}
                                            </Badge>
                                            <Text as="span" variant="bodySm" tone="subdued">
                                              Last checked {checkoutDiagCheckedLabel}
                                            </Text>
                                          </>
                                        )}
                                        {(checkoutDiag || installation) && (
                                          <Badge tone={storeHealth.ready ? 'success' : 'warning'}>
                                            {storeHealth.ready
                                              ? 'Store health: PASS'
                                              : `Store health: FAIL (${storeHealth.failed.length})`}
                                          </Badge>
                                        )}
                                        {(checkoutDiag || installation) && (
                                          <Badge tone={supportLevelBadgeTone}>
                                            Support: {supportLevelBadgeLabel}
                                          </Badge>
                                        )}
                                        {(checkoutDiag || installation) && (
                                          <Tooltip content={supportLevelHelpText}>
                                            <span
                                              className={styles.supportLevelHint}
                                              role="note"
                                              aria-label="Support level help"
                                            >
                                              Support details
                                            </span>
                                          </Tooltip>
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
                                    </div>
                                    {(checkoutDiag || checkoutExperienceDiag || installation) && (
                                      <div className={styles.checkoutReadinessSection}>
                                        <div className={styles.checkoutReadinessHeader}>
                                          <Text variant="headingSm" as="h3">
                                            Checkout launch surfaces
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            Track checkout experience, offers, and shipping
                                            separately instead of relying on one generic setup
                                            status.
                                          </Text>
                                        </div>
                                        <div className={styles.checkoutReadinessList}>
                                          {checkoutExperienceReadiness.map(item => (
                                            <div
                                              key={item.id}
                                              className={styles.checkoutReadinessRow}
                                            >
                                              <div className={styles.checkoutReadinessRowMain}>
                                                <div className={styles.checkoutReadinessCardHeader}>
                                                  <Text
                                                    as="span"
                                                    variant="bodySm"
                                                    fontWeight="semibold"
                                                  >
                                                    {item.title}
                                                  </Text>
                                                  <Badge tone={item.tone}>{item.status}</Badge>
                                                </div>
                                                <Text as="p" variant="bodySm">
                                                  {item.summary}
                                                </Text>
                                              </div>
                                              <div className={styles.checkoutReadinessRowText}>
                                                <Text as="p" variant="bodySm" tone="subdued">
                                                  {item.nextAction}
                                                </Text>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                        {checkoutExperienceDiagError && (
                                          <Text as="p" variant="bodySm" tone="critical">
                                            {checkoutExperienceDiagError}
                                          </Text>
                                        )}
                                      </div>
                                    )}
                                    {isAppSettings && (
                                      <div className={styles.checkoutReadinessSection}>
                                        <div className={styles.checkoutReadinessHeader}>
                                          <Text variant="headingSm" as="h3">
                                            Checkout customization deployment
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            Deploy saved payment-method and delivery-method tests
                                            here. Dry run previews the Shopify action; Apply creates
                                            or updates the customization and RipX metafield.
                                          </Text>
                                        </div>
                                        <InlineStack gap="200" wrap>
                                          <Button
                                            size="slim"
                                            onClick={fetchCheckoutCustomizationTests}
                                            loading={checkoutCustomizationTestsLoading}
                                          >
                                            Refresh checkout tests
                                          </Button>
                                        </InlineStack>
                                        {checkoutCustomizationTestsError && (
                                          <Text as="p" variant="bodySm" tone="critical">
                                            {checkoutCustomizationTestsError}
                                          </Text>
                                        )}
                                        <div className={styles.checkoutReadinessSection}>
                                          <div className={styles.checkoutReadinessHeader}>
                                            <Text variant="headingSm" as="h4">
                                              Checkout experience inventory
                                            </Text>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              Review saved experience-phase tests and how many
                                              renderable checkout sections are already configured.
                                            </Text>
                                          </div>
                                          {checkoutExperienceInventory.length > 0 ? (
                                            <div className={styles.checkoutReadinessList}>
                                              {checkoutExperienceInventory.map(item => (
                                                <div
                                                  key={item.id}
                                                  className={styles.checkoutReadinessRow}
                                                >
                                                  <div className={styles.checkoutReadinessRowMain}>
                                                    <div
                                                      className={styles.checkoutReadinessCardHeader}
                                                    >
                                                      <Text
                                                        as="span"
                                                        variant="bodySm"
                                                        fontWeight="semibold"
                                                      >
                                                        {item.name}
                                                      </Text>
                                                      <InlineStack gap="200" wrap>
                                                        <Badge tone="info">Experience</Badge>
                                                        <Badge
                                                          tone={
                                                            item.totalRenderableSections > 0
                                                              ? 'success'
                                                              : 'warning'
                                                          }
                                                        >
                                                          {item.totalRenderableSections} section
                                                          {item.totalRenderableSections === 1
                                                            ? ''
                                                            : 's'}
                                                        </Badge>
                                                      </InlineStack>
                                                    </div>
                                                    <Text as="p" variant="bodySm">
                                                      {item.actionableVariants > 0
                                                        ? `${item.actionableVariants} treatment variant${item.actionableVariants === 1 ? '' : 's'} contain ${item.totalRenderableSections} renderable section${item.totalRenderableSections === 1 ? '' : 's'}.`
                                                        : 'No treatment variants contain renderable checkout sections yet.'}
                                                    </Text>
                                                  </div>
                                                  <div className={styles.checkoutReadinessRowText}>
                                                    <Text as="p" variant="bodySm" tone="subdued">
                                                      Status: {item.status}. Section types:{' '}
                                                      {item.sectionTypeLabels.length > 0
                                                        ? item.sectionTypeLabels.join(', ')
                                                        : 'Not configured yet'}
                                                      .
                                                    </Text>
                                                    <div
                                                      className={styles.checkoutReadinessRowActions}
                                                    >
                                                      <Button size="slim" url={item.detailPath}>
                                                        Open test
                                                      </Button>
                                                    </div>
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            !checkoutCustomizationTestsLoading && (
                                              <Text as="p" variant="bodySm" tone="subdued">
                                                No saved experience-phase checkout tests yet. Create
                                                one in Checkout Tests to start building
                                                section-based checkout content.
                                              </Text>
                                            )
                                          )}
                                        </div>
                                        {deployableCheckoutCustomizationTests.length > 0 ? (
                                          <div className={styles.checkoutReadinessList}>
                                            {deployableCheckoutCustomizationTests.map(item => {
                                              const isRunning =
                                                checkoutCustomizationAction?.testId === item.id;
                                              return (
                                                <div
                                                  key={item.id}
                                                  className={styles.checkoutReadinessRow}
                                                >
                                                  <div className={styles.checkoutReadinessRowMain}>
                                                    <div
                                                      className={styles.checkoutReadinessCardHeader}
                                                    >
                                                      <Text
                                                        as="span"
                                                        variant="bodySm"
                                                        fontWeight="semibold"
                                                      >
                                                        {item.name}
                                                      </Text>
                                                      <Badge tone="info">{item.phaseLabel}</Badge>
                                                    </div>
                                                    <Text as="p" variant="bodySm">
                                                      {item.actionableVariants > 0
                                                        ? `${item.actionableVariants} treatment variant${item.actionableVariants === 1 ? '' : 's'} configured for ${item.phaseLabel.toLowerCase()}.`
                                                        : `No actionable ${item.phaseLabel.toLowerCase()} variants are configured yet.`}
                                                    </Text>
                                                  </div>
                                                  <div className={styles.checkoutReadinessRowText}>
                                                    <Text as="p" variant="bodySm" tone="subdued">
                                                      Status: {item.status}. Open the test to edit
                                                      targeting or variant config before applying if
                                                      needed.
                                                    </Text>
                                                    <div
                                                      className={styles.checkoutReadinessRowActions}
                                                    >
                                                      <Button
                                                        size="slim"
                                                        onClick={() =>
                                                          handleEnsureCheckoutCustomizationFromSettings(
                                                            item.id,
                                                            false
                                                          )
                                                        }
                                                        disabled={Boolean(
                                                          checkoutCustomizationAction
                                                        )}
                                                        loading={
                                                          isRunning &&
                                                          checkoutCustomizationAction?.mode ===
                                                            'dry_run'
                                                        }
                                                      >
                                                        Dry run
                                                      </Button>
                                                      <Button
                                                        size="slim"
                                                        variant="primary"
                                                        onClick={() =>
                                                          handleEnsureCheckoutCustomizationFromSettings(
                                                            item.id,
                                                            true
                                                          )
                                                        }
                                                        disabled={Boolean(
                                                          checkoutCustomizationAction
                                                        )}
                                                        loading={
                                                          isRunning &&
                                                          checkoutCustomizationAction?.mode ===
                                                            'apply'
                                                        }
                                                      >
                                                        Apply
                                                      </Button>
                                                      <Button size="slim" url={item.detailPath}>
                                                        Open test
                                                      </Button>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          !checkoutCustomizationTestsLoading && (
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              No saved payment-method or delivery-method checkout
                                              tests are available yet. Create one in Checkout Tests,
                                              save it, then return here to deploy.
                                            </Text>
                                          )
                                        )}
                                      </div>
                                    )}
                                    {(checkoutDiag || installation) && (
                                      <div className={styles.checkoutReadinessSection}>
                                        <div className={styles.checkoutReadinessHeader}>
                                          <Text variant="headingSm" as="h3">
                                            Price & Offer readiness
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            Verify the direct pricing path (Price tests) and promo
                                            path (Offer tests) before launch.
                                          </Text>
                                        </div>
                                        <div className={styles.checkoutReadinessList}>
                                          {priceMethodReadiness.map(item => (
                                            <div
                                              key={item.id}
                                              className={styles.checkoutReadinessRow}
                                            >
                                              <div className={styles.checkoutReadinessRowMain}>
                                                <div className={styles.checkoutReadinessCardHeader}>
                                                  <Text
                                                    as="span"
                                                    variant="bodySm"
                                                    fontWeight="semibold"
                                                  >
                                                    {item.title}
                                                  </Text>
                                                  <Badge tone={item.tone}>{item.status}</Badge>
                                                </div>
                                                <Text as="p" variant="bodySm">
                                                  {item.summary}
                                                </Text>
                                              </div>
                                              <div className={styles.checkoutReadinessRowText}>
                                                <Text as="p" variant="bodySm" tone="subdued">
                                                  {item.nextAction}
                                                </Text>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {(checkoutDiag || installation) && (
                                      <div className={styles.checkoutDiagHealthSummary}>
                                        <div className={styles.checkoutDiagHealthHeader}>
                                          <div>
                                            <Text variant="headingSm" as="h3">
                                              Store health summary
                                            </Text>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              {checkoutHealthSnapshot.failedRequired.length > 0
                                                ? 'Review blockers first, then expand the check list only if you need detail.'
                                                : 'All required checks are passing. Advisories are optional improvements.'}
                                            </Text>
                                          </div>
                                          <div className={styles.checkoutHealthStatGrid}>
                                            <div className={styles.checkoutHealthStat}>
                                              <span className={styles.checkoutHealthStatLabel}>
                                                Passing
                                              </span>
                                              <span className={styles.checkoutHealthStatValue}>
                                                {checkoutHealthSnapshot.passedRequired}/
                                                {checkoutHealthSnapshot.requiredTotal}
                                              </span>
                                            </div>
                                            <div className={styles.checkoutHealthStat}>
                                              <span className={styles.checkoutHealthStatLabel}>
                                                Blockers
                                              </span>
                                              <span className={styles.checkoutHealthStatValue}>
                                                {checkoutHealthSnapshot.failedRequired.length}
                                              </span>
                                            </div>
                                            <div className={styles.checkoutHealthStat}>
                                              <span className={styles.checkoutHealthStatLabel}>
                                                Advisories
                                              </span>
                                              <span className={styles.checkoutHealthStatValue}>
                                                {checkoutHealthSnapshot.advisoryCount}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <details className={styles.checkoutDiagDetails}>
                                          <summary className={styles.checkoutDiagDetailsSummary}>
                                            Review individual checks ({storeHealth.checks.length})
                                          </summary>
                                          <BlockStack
                                            gap="150"
                                            className={styles.checkoutDiagDetailsList}
                                          >
                                            {storeHealth.checks.map(item => (
                                              <div
                                                key={item.key}
                                                className={styles.checkoutDiagCheckRow}
                                              >
                                                <Badge
                                                  tone={
                                                    item.ok
                                                      ? 'success'
                                                      : item.required === false
                                                        ? 'attention'
                                                        : 'critical'
                                                  }
                                                >
                                                  {item.ok
                                                    ? 'OK'
                                                    : item.required === false
                                                      ? 'Advisory'
                                                      : 'Fail'}
                                                </Badge>
                                                <Text
                                                  as="span"
                                                  variant="bodySm"
                                                  className={styles.checkoutDiagCheckMessage}
                                                >
                                                  {item.message}
                                                </Text>
                                              </div>
                                            ))}
                                          </BlockStack>
                                        </details>
                                      </div>
                                    )}

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
                                    {checkoutCartTransformEnsureError && (
                                      <Banner
                                        tone="critical"
                                        onDismiss={() => setCheckoutCartTransformEnsureError(null)}
                                      >
                                        {checkoutCartTransformEnsureError}
                                      </Banner>
                                    )}
                                    {checkoutCartTransformEnsureResult && (
                                      <Banner
                                        tone={
                                          checkoutCartTransformEnsureResult.assumedInstalled
                                            ? 'warning'
                                            : 'success'
                                        }
                                        onDismiss={() => setCheckoutCartTransformEnsureResult(null)}
                                      >
                                        {checkoutCartTransformEnsureResult.created
                                          ? 'RipX cart transform installed successfully.'
                                          : checkoutCartTransformEnsureResult.assumedInstalled
                                            ? 'RipX cart transform reported as already installed, but this is not verified (limited Shopify scope). Run diagnostics and inventory checks before relying on Direct Price Override.'
                                            : 'RipX cart transform already exists for this shop.'}{' '}
                                        {checkoutCartTransformEnsureResult.installCheckStatus
                                          ? `Install check: ${checkoutCartTransformEnsureResult.installCheckStatus}.`
                                          : ''}
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
                                        {checkoutDiscountEnsureResult.titleAdjusted
                                          ? 'A fallback title was used due to title conflict.'
                                          : ''}
                                        {checkoutDiscountEnsureResult.titleAdjusted ? ' ' : ''}
                                        {checkoutDiscountEnsureResult.status
                                          ? `Status: ${checkoutDiscountEnsureResult.status}.`
                                          : ''}
                                      </Banner>
                                    )}
                                    {checkoutDiscountListCheckError && (
                                      <Banner
                                        tone="critical"
                                        onDismiss={() => setCheckoutDiscountListCheckError(null)}
                                      >
                                        {checkoutDiscountListCheckError}
                                      </Banner>
                                    )}
                                    <Collapsible open={false} id="install-checkout-advanced">
                                      <BlockStack gap="400">
                                        <Divider />
                                        <div className={styles.checkoutDiagHealthSummary}>
                                          <Text variant="headingSm" as="h3">
                                            Preview probe
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            Resolve a variant via <code>/api/track/preview</code>.
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
                                              disabled={
                                                previewProbeAutofillLoading || previewProbeLoading
                                              }
                                            >
                                              Use running price test
                                            </Button>
                                            <Button
                                              onClick={runPreviewProbe}
                                              loading={previewProbeLoading}
                                              disabled={
                                                previewProbeLoading || previewProbeAutofillLoading
                                              }
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
                                                <strong>Mode:</strong>{' '}
                                                {previewProbeResult.priceMode || '—'}
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
                                        {checkoutDiscountEnsureDebug && (
                                          <div className={styles.checkoutDiagDebugBox}>
                                            <InlineStack align="space-between" blockAlign="center">
                                              <Text variant="headingSm" as="h3">
                                                Advanced ensure diagnostics
                                              </Text>
                                              <Button
                                                icon={ClipboardIcon}
                                                variant="plain"
                                                size="slim"
                                                onClick={() =>
                                                  handleCopy(
                                                    JSON.stringify(
                                                      {
                                                        ensuredAt: new Date().toISOString(),
                                                        storeHealth,
                                                        ensureResult: checkoutDiscountEnsureResult,
                                                        ensureDebug: checkoutDiscountEnsureDebug,
                                                        discountListCheck:
                                                          checkoutDiscountListCheck,
                                                        diagnosticsSummary:
                                                          checkoutDiag?.summary || null,
                                                      },
                                                      null,
                                                      2
                                                    ),
                                                    'Diagnostics JSON copied'
                                                  )
                                                }
                                              >
                                                Copy diagnostics JSON
                                              </Button>
                                            </InlineStack>
                                            {checkoutDiscountEnsureDebug.function && (
                                              <Text as="p" variant="bodySm" tone="subdued">
                                                Function:{' '}
                                                <code className={styles.checkoutDiagMono}>
                                                  {checkoutDiscountEnsureDebug.function.title ||
                                                    'unknown'}{' '}
                                                  (
                                                  {checkoutDiscountEnsureDebug.function.apiType ||
                                                    'unknown'}
                                                  )
                                                </code>
                                              </Text>
                                            )}
                                            {Array.isArray(
                                              checkoutDiscountEnsureDebug?.troubleshooting
                                                ?.attemptedTitles
                                            ) &&
                                              checkoutDiscountEnsureDebug.troubleshooting
                                                .attemptedTitles.length > 0 && (
                                                <Text as="p" variant="bodySm" tone="subdued">
                                                  Attempted titles:{' '}
                                                  <code className={styles.checkoutDiagMono}>
                                                    {checkoutDiscountEnsureDebug.troubleshooting.attemptedTitles.join(
                                                      ' | '
                                                    )}
                                                  </code>
                                                </Text>
                                              )}
                                            {Array.isArray(
                                              checkoutDiscountEnsureDebug.shopifyUserErrors
                                            ) &&
                                              checkoutDiscountEnsureDebug.shopifyUserErrors.length >
                                                0 && (
                                                <BlockStack gap="100">
                                                  <Text as="p" variant="bodySm">
                                                    Shopify create errors:
                                                  </Text>
                                                  {checkoutDiscountEnsureDebug.shopifyUserErrors.map(
                                                    (err, i) => (
                                                      <Text
                                                        as="p"
                                                        key={`create-err-${i}`}
                                                        variant="bodySm"
                                                      >
                                                        - {err?.message || 'Unknown'}{' '}
                                                        {err?.code ? `(${err.code})` : ''}
                                                      </Text>
                                                    )
                                                  )}
                                                </BlockStack>
                                              )}
                                            {Array.isArray(
                                              checkoutDiscountEnsureDebug.retryUserErrors
                                            ) &&
                                              checkoutDiscountEnsureDebug.retryUserErrors.length >
                                                0 && (
                                                <BlockStack gap="100">
                                                  <Text as="p" variant="bodySm">
                                                    Retry errors:
                                                  </Text>
                                                  {checkoutDiscountEnsureDebug.retryUserErrors.map(
                                                    (err, i) => (
                                                      <Text
                                                        as="p"
                                                        key={`retry-err-${i}`}
                                                        variant="bodySm"
                                                      >
                                                        - {err?.message || 'Unknown'}{' '}
                                                        {err?.code ? `(${err.code})` : ''}
                                                      </Text>
                                                    )
                                                  )}
                                                </BlockStack>
                                              )}
                                            {checkoutDiscountListCheck && (
                                              <Text as="p" variant="bodySm" tone="subdued">
                                                Shopify list check:{' '}
                                                <strong>
                                                  {checkoutDiscountListCheck.inList
                                                    ? `FOUND (${checkoutDiscountListCheck.matchedCount})`
                                                    : `NOT FOUND (${checkoutDiscountListCheck.inspectedCount} scanned)`}
                                                </strong>
                                              </Text>
                                            )}
                                          </div>
                                        )}
                                        <div className={styles.checkoutDiagVerifyBox}>
                                          <Text variant="headingSm" as="h3">
                                            Discount in Shopify
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            RipX keeps one automatic discount so checkout can call
                                            your function. After attaching, confirm{' '}
                                            <strong>{OFFER_CHECKOUT_FUNCTION_TITLE}</strong> appears
                                            in Shopify.
                                          </Text>
                                          <ol className={styles.checkoutDiagVerifyList}>
                                            <li>
                                              <strong>Create/attach RipX discount</strong> once,
                                              then <strong>Run check</strong>.
                                            </li>
                                            <li>
                                              In Shopify, confirm the RipX automatic discount is
                                              active.
                                            </li>
                                          </ol>
                                          <InlineStack gap="200" blockAlign="center" wrap>
                                            {shopifyAdminDiscountsUrl && (
                                              <Button url={shopifyAdminDiscountsUrl} external>
                                                Open Shopify discounts
                                              </Button>
                                            )}
                                            {checkoutDiscountEnsureResult?.discountId && (
                                              <Button
                                                icon={ClipboardIcon}
                                                variant="plain"
                                                onClick={() =>
                                                  handleCopy(
                                                    checkoutDiscountEnsureResult.discountId,
                                                    'Discount ID copied'
                                                  )
                                                }
                                              >
                                                Copy discount ID
                                              </Button>
                                            )}
                                            {checkoutDiscountEnsureResult?.status && (
                                              <Badge tone="success">
                                                Status: {checkoutDiscountEnsureResult.status}
                                              </Badge>
                                            )}
                                          </InlineStack>
                                          {checkoutDiscountEnsureResult?.discountId && (
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              Discount ID:{' '}
                                              <code className={styles.checkoutDiagMono}>
                                                {checkoutDiscountEnsureResult.discountId}
                                              </code>
                                            </Text>
                                          )}
                                          {checkoutDiscountListCheck && (
                                            <div className={styles.checkoutDiagListResult}>
                                              <Text as="p" variant="bodySm">
                                                <strong>List status:</strong>{' '}
                                                {checkoutDiscountListCheck.inList
                                                  ? 'Present in Shopify discount list'
                                                  : 'Not found in current Shopify automatic list'}
                                              </Text>
                                              {Array.isArray(
                                                checkoutDiscountListCheck.matchedDiscounts
                                              ) &&
                                                checkoutDiscountListCheck.matchedDiscounts.length >
                                                  0 &&
                                                checkoutDiscountListCheck.matchedDiscounts.map(
                                                  (d, i) => (
                                                    <Text
                                                      as="p"
                                                      key={`list-match-${i}`}
                                                      variant="bodySm"
                                                    >
                                                      - {d?.title || 'Untitled'} (
                                                      {d?.status || 'unknown'}){' '}
                                                      {d?.discountId ? `· ${d.discountId}` : ''}
                                                    </Text>
                                                  )
                                                )}
                                            </div>
                                          )}
                                        </div>
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
                                                {checkoutDiag.infrastructure.uses_https
                                                  ? 'yes'
                                                  : 'no'}
                                              </Text>
                                              <Text as="span" variant="bodySm">
                                                Secret required:{' '}
                                                {checkoutDiag.infrastructure
                                                  .checkout_price_secret_required
                                                  ? 'yes'
                                                  : 'no'}
                                              </Text>
                                              <Text as="span" variant="bodySm">
                                                Max lines / batch:{' '}
                                                {
                                                  checkoutDiag.infrastructure
                                                    .price_resolve_batch_max
                                                }
                                              </Text>
                                              <Text as="span" variant="bodySm">
                                                Max response (bytes):{' '}
                                                {checkoutDiag.infrastructure
                                                  .price_resolve_batch_response_max_bytes ?? '—'}
                                              </Text>
                                              <Text as="span" variant="bodySm">
                                                Compact batch JSON:{' '}
                                                {checkoutDiag.infrastructure
                                                  .batch_compact_response === false
                                                  ? 'no (full)'
                                                  : checkoutDiag.infrastructure
                                                        .batch_compact_response === true
                                                    ? 'yes'
                                                    : '—'}
                                              </Text>
                                              <Text as="span" variant="bodySm">
                                                Slow batch log (ms):{' '}
                                                {checkoutDiag.infrastructure
                                                  .price_batch_slow_log_ms ?? '—'}
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
                                                    <Text
                                                      as="span"
                                                      variant="bodySm"
                                                      className={styles.checkoutDiagCheckMessage}
                                                    >
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
                                    </Collapsible>
                                  </BlockStack>
                                </Box>
                              </Card>
                            )}

                          {installation &&
                            installation.platform === 'shopify' &&
                            !installationLoading &&
                            !installationError && (
                              <Card
                                className={`${styles.settingsPanelCard} ${styles.shopifyFnInventoryCard}`}
                              >
                                <Box padding="500">
                                  <BlockStack gap="400">
                                    <div className={styles.sectionHeader}>
                                      <div className={styles.sectionHeaderIcon}>
                                        <CodeIcon />
                                      </div>
                                      <div className={styles.sectionHeaderContent}>
                                        <Text variant="headingMd" as="h2">
                                          Shopify Functions (this app)
                                        </Text>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          RipX defines only two function extensions in this
                                          codebase: checkout discount and Cart Transform. Below is
                                          what Admin API returns for your store (validation /
                                          refresh).
                                        </Text>
                                      </div>
                                    </div>
                                    {shopifyFnInventoryError && (
                                      <Banner
                                        tone="critical"
                                        onDismiss={() => setShopifyFnInventoryError(null)}
                                      >
                                        {shopifyFnInventoryError}
                                      </Banner>
                                    )}
                                    {!shopifyFnInventory &&
                                      !shopifyFnInventoryLoading &&
                                      !shopifyFnInventoryError && (
                                        <Banner tone="info">
                                          <Text as="p" variant="bodySm">
                                            Tap <strong>Refresh validation</strong> to load
                                            functions from Shopify Admin. This is read-only and does
                                            not change your store.
                                          </Text>
                                        </Banner>
                                      )}
                                    {shopifyFnInventory?.success &&
                                      shopifyFnInventory?.summary?.totalFunctionsReturned === 0 && (
                                        <Banner tone="warning">
                                          <Text as="p" variant="bodySm">
                                            No functions were returned for this app on this store.
                                            Deploy extensions from your dev machine (
                                            <code className={styles.checkoutDiagMono}>
                                              shopify app deploy
                                            </code>
                                            ), then refresh. Confirm the app is installed on this
                                            development store.
                                          </Text>
                                        </Banner>
                                      )}
                                    {shopifyFnInventory?.readiness && (
                                      <InlineStack gap="200" wrap blockAlign="center">
                                        <Badge
                                          tone={
                                            shopifyFnInventory.readiness
                                              .discount_function_for_checkout
                                              ? 'success'
                                              : 'warning'
                                          }
                                        >
                                          Discount path:{' '}
                                          {shopifyFnInventory.readiness
                                            .discount_function_for_checkout
                                            ? 'ready'
                                            : 'not detected'}
                                        </Badge>
                                        <Badge
                                          tone={
                                            shopifyFnInventory.readiness
                                              .cart_transform_for_direct_price
                                              ? 'success'
                                              : 'warning'
                                          }
                                        >
                                          Direct price path:{' '}
                                          {shopifyFnInventory.readiness
                                            .cart_transform_for_direct_price
                                            ? 'ready'
                                            : 'not detected'}
                                        </Badge>
                                      </InlineStack>
                                    )}
                                    {((Array.isArray(shopifyFnInventory?.manifestNotes) &&
                                      shopifyFnInventory.manifestNotes.length > 0) ||
                                      (Array.isArray(shopifyFnInventory?.operationalNotes) &&
                                        shopifyFnInventory.operationalNotes.length > 0)) && (
                                      <Banner tone="info">
                                        <BlockStack gap="100">
                                          {Array.isArray(shopifyFnInventory?.manifestNotes) &&
                                            shopifyFnInventory.manifestNotes.map((n, i) => (
                                              <Text as="p" variant="bodySm" key={`mn-${i}`}>
                                                {n}
                                              </Text>
                                            ))}
                                          {Array.isArray(shopifyFnInventory?.operationalNotes) &&
                                            shopifyFnInventory.operationalNotes.map((n, i) => (
                                              <Text as="p" variant="bodySm" key={`on-${i}`}>
                                                {n}
                                              </Text>
                                            ))}
                                        </BlockStack>
                                      </Banner>
                                    )}
                                    <InlineStack gap="300" wrap blockAlign="center">
                                      <Button
                                        variant={!shopifyFnInventory ? 'primary' : undefined}
                                        onClick={fetchShopifyFnInventory}
                                        loading={shopifyFnInventoryLoading}
                                      >
                                        Refresh validation
                                      </Button>
                                      {shopifyFnInventory?.generatedAt && (
                                        <Text as="span" variant="bodySm" tone="subdued">
                                          Last fetch:{' '}
                                          {formatRelativeTime(shopifyFnInventory.generatedAt)}
                                        </Text>
                                      )}
                                      {shopifyFnInventory?.summary && (
                                        <Badge tone="info">
                                          {shopifyFnInventory.summary.totalFunctionsReturned}{' '}
                                          function
                                          {shopifyFnInventory.summary.totalFunctionsReturned === 1
                                            ? ''
                                            : 's'}{' '}
                                          in API list
                                        </Badge>
                                      )}
                                    </InlineStack>
                                    {shopifyFnInventoryLoading && (
                                      <InlineStack gap="200" blockAlign="center">
                                        <Spinner size="small" />
                                        <Text as="span" variant="bodySm" tone="subdued">
                                          Querying Shopify Admin (shopifyFunctions)…
                                        </Text>
                                      </InlineStack>
                                    )}
                                    {Array.isArray(shopifyFnInventory?.expectations) &&
                                      shopifyFnInventory.expectations.length > 0 && (
                                        <div>
                                          <Text variant="headingSm" as="h3">
                                            Expected vs detected
                                          </Text>
                                          <div className={styles.shopifyFnInventoryTableWrap}>
                                            <table className={styles.shopifyFnInventoryTable}>
                                              <thead>
                                                <tr>
                                                  <th scope="col">Role</th>
                                                  <th scope="col">Status</th>
                                                  <th scope="col">Matched function</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {shopifyFnInventory.expectations.map(row => (
                                                  <tr key={row.key}>
                                                    <td>
                                                      <Text
                                                        as="span"
                                                        variant="bodySm"
                                                        fontWeight="semibold"
                                                      >
                                                        {row.label}
                                                      </Text>
                                                      <Text as="p" variant="bodySm" tone="subdued">
                                                        {row.description}
                                                      </Text>
                                                    </td>
                                                    <td>
                                                      <Badge
                                                        tone={row.detected ? 'success' : 'warning'}
                                                      >
                                                        {row.detected ? 'Detected' : 'Missing'}
                                                      </Badge>
                                                      <Text as="p" variant="bodySm" tone="subdued">
                                                        {row.candidateCount} candidate
                                                        {row.candidateCount === 1 ? '' : 's'}
                                                      </Text>
                                                    </td>
                                                    <td>
                                                      {row.matchedFunction ? (
                                                        <>
                                                          <code className={styles.checkoutDiagMono}>
                                                            {row.matchedFunction.title || '—'}
                                                          </code>
                                                          <Text
                                                            as="p"
                                                            variant="bodySm"
                                                            tone="subdued"
                                                          >
                                                            {row.matchedFunction.apiType || '—'}
                                                          </Text>
                                                          <Text
                                                            as="p"
                                                            variant="bodySm"
                                                            tone="subdued"
                                                          >
                                                            ID: {row.matchedFunction.id || '—'}
                                                          </Text>
                                                        </>
                                                      ) : (
                                                        <Text
                                                          as="p"
                                                          variant="bodySm"
                                                          tone="subdued"
                                                        >
                                                          Deploy the matching extension, then
                                                          refresh.
                                                        </Text>
                                                      )}
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}
                                    {Array.isArray(shopifyFnInventory?.shopifyFunctions) &&
                                      shopifyFnInventory.shopifyFunctions.length > 0 && (
                                        <div>
                                          <Text variant="headingSm" as="h3">
                                            All functions returned (Admin API)
                                          </Text>
                                          <div className={styles.shopifyFnInventoryTableWrap}>
                                            <table className={styles.shopifyFnInventoryTable}>
                                              <thead>
                                                <tr>
                                                  <th scope="col">Title</th>
                                                  <th scope="col">API type</th>
                                                  <th scope="col">ID</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {shopifyFnInventory.shopifyFunctions.map(fn => (
                                                  <tr key={fn.id || fn.title}>
                                                    <td>{fn.title || '—'}</td>
                                                    <td>
                                                      <code className={styles.checkoutDiagMono}>
                                                        {fn.apiType || '—'}
                                                      </code>
                                                    </td>
                                                    <td>
                                                      <code className={styles.checkoutDiagMono}>
                                                        {fn.id || '—'}
                                                      </code>
                                                    </td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
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
                                    <Text as="p" variant="bodyMd">
                                      Checkout price alignment uses Shopify&apos;s discount function
                                      and only applies to Shopify stores. Standalone sites still run
                                      price tests via the storefront script.
                                    </Text>
                                  </Banner>
                                </Box>
                              </Card>
                            )}
                        </div>
                      )}

                      {isAppSettings && (showAllAppSections || activeTabId === 'general') && (
                        <div
                          id="settings-panel-general"
                          ref={node => setAppSectionNode('general', node)}
                          data-app-section="general"
                          role={showAllAppSections ? 'region' : 'tabpanel'}
                          aria-labelledby={showAllAppSections ? undefined : 'settings-tab-general'}
                          aria-label={showAllAppSections ? 'Test defaults settings' : undefined}
                          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelGeneral}`}
                        >
                          {showAllAppSections && (
                            <SettingsSectionLead
                              title="Test defaults"
                              summary={generalSectionSummary}
                              badgeLabel={
                                selectedSettingsPresetKey ? 'Preset aligned' : 'Custom mix'
                              }
                              badgeTone={selectedSettingsPresetKey ? 'success' : 'attention'}
                              actionLabel="Open only this section"
                              onAction={() => focusAppSection('general')}
                            />
                          )}
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
                                      <SectionTitleWithTip
                                        title="API Key"
                                        tip={SECTION_HELP.apiKeyStandalone}
                                      />
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        <Link to={ROUTES.CONNECT}>Connect</Link> to change keys, or
                                        clear storage and reload.
                                      </Text>
                                    </div>
                                  </div>
                                </BlockStack>
                              </Box>
                            </Card>
                          )}

                          <Card
                            className={`${styles.settingsPanelCard} ${styles.testConfigCard} ${
                              showAllAppSections ? styles.settingsPanelCardFull : ''
                            }`}
                          >
                            <Box padding="500">
                              <BlockStack gap="400">
                                <div className={styles.sectionHeaderWithAction}>
                                  <div className={styles.sectionHeader}>
                                    <div className={styles.sectionHeaderIcon}>
                                      <TargetIcon />
                                    </div>
                                    <div className={styles.sectionHeaderContent}>
                                      <SectionTitleWithTip
                                        title="Test configuration"
                                        tip={SECTION_HELP.testConfiguration}
                                      />
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        Set the default confidence, sample size, and stop behavior
                                        for new tests.
                                      </Text>
                                    </div>
                                  </div>
                                  <InlineStack gap="200" wrap blockAlign="center">
                                    <Button variant="primary" onClick={handleSave} loading={saving}>
                                      Save defaults
                                    </Button>
                                  </InlineStack>
                                </div>

                                <div className={styles.testConfigHero}>
                                  <div className={styles.testConfigHeroMain}>
                                    <span className={styles.configSubsection}>
                                      Defaults snapshot
                                    </span>
                                    <Text as="h3" variant="headingMd">
                                      {selectedSettingsPresetKey
                                        ? SETTINGS_PRESETS[selectedSettingsPresetKey]?.label ||
                                          'Preset aligned'
                                        : 'Custom defaults'}
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      {generalSectionSummary}
                                    </Text>
                                    <InlineStack gap="200" wrap>
                                      <Badge
                                        tone={selectedSettingsPresetKey ? 'success' : 'attention'}
                                      >
                                        {selectedSettingsPresetKey
                                          ? 'Preset aligned'
                                          : 'Custom mix'}
                                      </Badge>
                                      <Badge tone={settings.autoStopEnabled ? 'success' : 'info'}>
                                        {settings.autoStopEnabled
                                          ? 'Auto-stop on'
                                          : 'Manual stop review'}
                                      </Badge>
                                    </InlineStack>
                                  </div>
                                  <div className={styles.testConfigHeroMetrics}>
                                    {generalDefaultsOverview.map(item => (
                                      <div
                                        key={item.id}
                                        className={`${styles.settingsOverviewMetric} ${styles.testConfigOverviewMetric}`}
                                      >
                                        <span className={styles.settingsOverviewLabel}>
                                          {item.label}
                                        </span>
                                        <span className={styles.settingsOverviewValue}>
                                          {item.value}
                                        </span>
                                        <span className={styles.settingsOverviewHint}>
                                          {item.hint}
                                        </span>
                                      </div>
                                    ))}
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
                                            setMessage(
                                              err?.response?.data?.error || 'Failed to save'
                                            );
                                          } finally {
                                            setPresetApplyingKey(null);
                                          }
                                        }}
                                      >
                                        {presetApplyingKey === key ? (
                                          <span className={styles.presetCardLoading}>
                                            Applying…
                                          </span>
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
                                  <div className={styles.configCallout}>
                                    <span className={styles.configCalloutLabel}>
                                      Current operating mode
                                    </span>
                                    <span className={styles.configCalloutValue}>
                                      {selectedSettingsPresetKey
                                        ? SETTINGS_PRESETS[selectedSettingsPresetKey]?.label ||
                                          'Custom'
                                        : 'Custom'}
                                    </span>
                                    <span className={styles.configCalloutHint}>
                                      {selectedSettingsPresetKey
                                        ? 'You are aligned with one of RipX’s preset strategies.'
                                        : 'These values are customized beyond the standard presets.'}
                                    </span>
                                  </div>
                                  <div className={styles.configFieldGroups}>
                                    <div className={styles.configFieldGrid}>
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
                                              settings.minSampleSize ??
                                                DEFAULT_SETTINGS.minSampleSize
                                            )}
                                            onChange={value => {
                                              const num = parseInt(
                                                String(value).replace(/\D/g, ''),
                                                10
                                              );
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
                                                Math.abs(Number(settings.confidenceLevel) - value) <
                                                0.001
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
                                              settings.confidenceLevel ??
                                                DEFAULT_SETTINGS.confidenceLevel
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
                                    </div>

                                    <div className={styles.configFieldGroup}>
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

                                    <div className={styles.configFooterBar}>
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        These defaults apply to new tests only. Existing tests keep
                                        their current settings.
                                      </Text>
                                      <InlineStack gap="200" wrap>
                                        <Button
                                          variant="primary"
                                          onClick={handleSave}
                                          loading={saving}
                                        >
                                          Save defaults
                                        </Button>
                                      </InlineStack>
                                    </div>
                                  </div>
                                </div>
                              </BlockStack>
                            </Box>
                          </Card>
                          <div
                            className={`${styles.generalSideStack} ${
                              showAllAppSections ? styles.generalSideStackInline : ''
                            }`}
                          >
                            <Card
                              className={`${styles.settingsPanelCard} ${styles.generalSideCard} ${styles.generalCompactCard}`}
                            >
                              <Box padding="400">
                                <BlockStack gap="300">
                                  <div className={styles.sectionHeader}>
                                    <div className={styles.sectionHeaderIcon}>
                                      <ChartVerticalIcon />
                                    </div>
                                    <div className={styles.sectionHeaderContent}>
                                      <SectionTitleWithTip
                                        title="Webhook delivery"
                                        tip={SECTION_HELP.webhooks}
                                      />
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        Keep this off unless another system needs test lifecycle
                                        events from RipX.
                                      </Text>
                                    </div>
                                  </div>
                                  <div className={styles.configCallout}>
                                    <span className={styles.configCalloutLabel}>
                                      Delivery status
                                    </span>
                                    <span className={styles.configCalloutValue}>
                                      {webhookDeliveryStatus}
                                    </span>
                                    <span className={styles.configCalloutHint}>
                                      {String(settings.outboundWebhookUrl || '').trim()
                                        ? webhookEventsSummary
                                        : 'No webhook endpoint configured'}
                                    </span>
                                  </div>
                                  <InlineStack gap="200" wrap>
                                    <Button size="slim" onClick={() => setWebhooksModalOpen(true)}>
                                      Edit webhook delivery
                                    </Button>
                                  </InlineStack>
                                </BlockStack>
                              </Box>
                            </Card>

                            <Card
                              className={`${styles.settingsPanelCard} ${styles.generalSideCard} ${styles.quickLinksCard}`}
                            >
                              <Box padding="400">
                                <BlockStack gap="300">
                                  <div className={styles.sectionHeader}>
                                    <div className={styles.sectionHeaderIcon}>
                                      <SettingsIcon />
                                    </div>
                                    <div className={styles.sectionHeaderContent}>
                                      <SectionTitleWithTip
                                        title="User preferences"
                                        tip={SECTION_HELP.userPreferences}
                                      />
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        <Link
                                          to={ROUTES.PROFILE}
                                          className={styles.setupWizardLink}
                                        >
                                          Open Profile
                                        </Link>{' '}
                                        for notifications, theme, and dashboard.
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
                        </div>
                      )}

                      {isAppSettings && (showAllAppSections || activeTabId === 'integrations') && (
                        <div
                          id="settings-panel-integrations"
                          ref={node => setAppSectionNode('integrations', node)}
                          data-app-section="integrations"
                          role={showAllAppSections ? 'region' : 'tabpanel'}
                          aria-labelledby={
                            showAllAppSections ? undefined : 'settings-tab-integrations'
                          }
                          aria-label={showAllAppSections ? 'Integrations settings' : undefined}
                          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelIntegrations}`}
                        >
                          {showAllAppSections && (
                            <SettingsSectionLead
                              title="Connections"
                              summary={integrationsSectionSummary}
                              badgeLabel={`${configuredIntegrationCount}/${INTEGRATIONS_CONFIG.length} linked`}
                              badgeTone={configuredIntegrationCount > 0 ? 'success' : 'info'}
                              actionLabel="Open only this section"
                              onAction={() => focusAppSection('integrations')}
                            />
                          )}
                          {integrationsError && (
                            <div className={styles.settingsPanelBannerWrap}>
                              <Banner
                                tone="critical"
                                onDismiss={() => setIntegrationsError(false)}
                                action={{ content: 'Retry', onAction: () => fetchIntegrations() }}
                              >
                                Couldn&apos;t load integration status. Check your connection and
                                retry.
                              </Banner>
                            </div>
                          )}
                          {!showAllAppSections && (
                            <Card
                              className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull} ${styles.integrationsHeaderCard}`}
                            >
                              <Box padding="400">
                                <BlockStack gap="300">
                                  <div className={styles.sectionHeaderWithAction}>
                                    <div className={styles.sectionHeader}>
                                      <div
                                        className={`${styles.sectionHeaderIcon} ${styles.integrationsHeaderIcon}`}
                                      >
                                        <ChartVerticalIcon />
                                      </div>
                                      <div className={styles.sectionHeaderContent}>
                                        <SectionTitleWithTip
                                          title="Analytics & data"
                                          tip={SECTION_HELP.analyticsData}
                                        />
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
                                  <div className={styles.settingsOverviewGrid}>
                                    {integrationsOverview.map(item => (
                                      <div key={item.id} className={styles.settingsOverviewMetric}>
                                        <span className={styles.settingsOverviewLabel}>
                                          {item.label}
                                        </span>
                                        <span className={styles.settingsOverviewValue}>
                                          {item.value}
                                        </span>
                                        <span className={styles.settingsOverviewHint}>
                                          {item.hint}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </BlockStack>
                              </Box>
                            </Card>
                          )}

                          <div className={styles.integrationCardsRow}>
                            {INTEGRATIONS_CONFIG.map(
                              ({ key, title, Icon, iconClass, configHint }) => {
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
                                              <SectionTitleWithTip
                                                title={title}
                                                tip={
                                                  isLoading
                                                    ? 'Loading integration details…'
                                                    : (data?.hint ?? configHint)
                                                }
                                                asHeading="h3"
                                                titleClassName={styles.integrationCardTitle}
                                              />
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
                                                          onClick={() =>
                                                            handleBigQueryExport(false)
                                                          }
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
                                                <div className={styles.configHint}>
                                                  {configHint}
                                                </div>
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
                              }
                            )}
                          </div>
                          <Card
                            className={`${styles.settingsPanelCard} ${styles.settingsPanelCardFull} ${styles.integrationsSaveCard}`}
                          >
                            <Box padding="400">
                              <div className={styles.integrationsSaveBar}>
                                <div className={styles.integrationsSaveCopy}>
                                  <SectionTitleWithTip
                                    title="Finish changes"
                                    tip={SECTION_HELP.integrationsSave}
                                    asHeading="p"
                                    variant="bodySm"
                                    fontWeight="semibold"
                                  />
                                </div>
                                <InlineStack align="end" gap="300">
                                  <Button
                                    variant="primary"
                                    onClick={handleSaveIntegrations}
                                    loading={integrationsSaving}
                                  >
                                    Save integration settings
                                  </Button>
                                </InlineStack>
                              </div>
                            </Box>
                          </Card>
                        </div>
                      )}

                      {(showAllAppSections || activeTabId === 'appearance') && (
                        <div
                          id="settings-panel-appearance"
                          ref={node => setAppSectionNode('appearance', node)}
                          data-app-section="appearance"
                          role={showAllAppSections ? 'region' : 'tabpanel'}
                          aria-labelledby={
                            showAllAppSections ? undefined : 'settings-tab-appearance'
                          }
                          aria-label={showAllAppSections ? 'Appearance settings' : undefined}
                          className={`${styles.settingsContent} ${styles.settingsPanelLayout} ${styles.settingsPanelAppearance}`}
                        >
                          {showAllAppSections && (
                            <SettingsSectionLead
                              title="Appearance"
                              summary={appearanceSectionSummary}
                              badgeLabel={selectedThemeLabel}
                              badgeTone="info"
                              actionLabel="Open only this section"
                              onAction={() => focusAppSection('appearance')}
                            />
                          )}
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
                                    <SectionTitleWithTip
                                      title="Theme"
                                      tip={SECTION_HELP.themeAppearance}
                                    />
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      Custom schedule:{' '}
                                      <Link
                                        to={`${ROUTES.PROFILE}?tab=preferences`}
                                        className={styles.setupWizardLink}
                                      >
                                        Profile → Preferences
                                      </Link>
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
                                        <span className={styles.themePreviewLabel}>
                                          {opt.label}
                                        </span>
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
                                    <SectionTitleWithTip
                                      title="Targeting presets"
                                      tip={SECTION_HELP.targetingPresets}
                                    />
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
                                        No targeting presets yet. Open the app, create a test, and
                                        save your targeting as a preset in the Test Wizard to reuse
                                        it later.
                                      </p>
                                      <Link
                                        to={ROUTES.USER_PANEL}
                                        className={styles.presetsEmptyCta}
                                      >
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
                  </div>
                )}
                {!(isAppSettings && showAllAppSections) && (
                  <Card className={styles.aboutCard}>
                    <Box padding="400">
                      <div className={styles.aboutSection}>
                        <div className={styles.aboutTitleRow}>
                          <span className={styles.aboutTitle}>RipX</span>
                          <span className={styles.aboutBadge}>A/B Testing</span>
                        </div>
                        <div className={styles.aboutVersion}>Version {APP_META.VERSION}</div>
                        <p className={styles.aboutDesc}>
                          Centralized configuration for install health, test defaults, integrations,
                          and account appearance.
                        </p>
                      </div>
                    </Box>
                  </Card>
                )}
              </BlockStack>
            </main>
          </div>
        </div>
      </Page>

      <Modal
        open={webhooksModalOpen}
        onClose={() => setWebhooksModalOpen(false)}
        title="Webhook delivery"
        primaryAction={{
          content: 'Save webhook settings',
          onAction: async () => {
            const saved = await handleSave();
            if (saved) {
              setWebhooksModalOpen(false);
            }
          },
          loading: saving,
        }}
        secondaryActions={[
          {
            content: 'Close',
            onAction: () => setWebhooksModalOpen(false),
            disabled: saving,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodySm" tone="subdued">
              Send JSON to your endpoint only when another system needs RipX test lifecycle events.
            </Text>
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
            </FormLayout>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={installSnippetModalOpen}
        onClose={() => setInstallSnippetModalOpen(false)}
        title="Snippet details"
        size="large"
        primaryAction={{ content: 'Close', onAction: () => setInstallSnippetModalOpen(false) }}
      >
        <Modal.Section>
          <BlockStack gap="300" data-modal="settings-install-detail">
            <Text as="p" variant="bodySm" tone="subdued">
              Copy, verify, or share installation details without leaving the main setup hub.
            </Text>
            {installation?.scriptUrl && (
              <BlockStack gap="150">
                <Text variant="headingSm" as="h3">
                  Script URL
                </Text>
                <div className={styles.installModalCodeBlock}>
                  <code className={styles.checkoutDiagMono}>{installation.scriptUrl}</code>
                </div>
                <InlineStack gap="200" wrap>
                  <Button
                    size="slim"
                    onClick={() => handleCopy(installation.scriptUrl, 'URL copied')}
                  >
                    Copy URL
                  </Button>
                  <Button size="slim" variant="plain" onClick={runCheckoutDiagnostics}>
                    Check now
                  </Button>
                </InlineStack>
              </BlockStack>
            )}
            {installation?.snippetHtml && (
              <BlockStack gap="150">
                <Text variant="headingSm" as="h3">
                  HTML snippet
                </Text>
                <pre className={styles.checkoutDiagDebugBox}>
                  <code>{installation.snippetHtml}</code>
                </pre>
                <Button size="slim" onClick={handleCopySnippet}>
                  Copy full snippet
                </Button>
              </BlockStack>
            )}
            {Array.isArray(installation?.instructions?.steps) &&
              installation.instructions.steps.length > 0 && (
                <BlockStack gap="150">
                  <Text variant="headingSm" as="h3">
                    Install steps
                  </Text>
                  <ul className={styles.installSteps}>
                    {installation.instructions.steps.map((step, index) => (
                      <li key={`install-step-${index}`}>
                        <Text as="span" variant="bodySm">
                          {step}
                        </Text>
                      </li>
                    ))}
                  </ul>
                </BlockStack>
              )}
            {installation?.instructions?.altMethod && (
              <BlockStack gap="150">
                <Text variant="headingSm" as="h3">
                  Alternative embed
                </Text>
                <div className={styles.installModalInfoCard}>
                  <BlockStack gap="150">
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Badge tone="attention">{installation.instructions.altMethod}</Badge>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Use this when the default snippet path does not fit the theme setup.
                      </Text>
                    </InlineStack>
                    {installation.instructions.altSnippet && (
                      <pre className={styles.checkoutDiagDebugBox}>
                        <code>{installation.instructions.altSnippet}</code>
                      </pre>
                    )}
                    {installation.instructions.altSnippet && (
                      <Button
                        size="slim"
                        onClick={() =>
                          handleCopy(installation.instructions.altSnippet, 'Snippet copied')
                        }
                      >
                        Copy alternative snippet
                      </Button>
                    )}
                  </BlockStack>
                </div>
              </BlockStack>
            )}
            {installation?.instructions?.cartNative && (
              <BlockStack gap="150">
                <Text variant="headingSm" as="h3">
                  {installation.instructions.cartNative.heading || 'Cart native discount rendering'}
                </Text>
                <div className={styles.installModalInfoCard}>
                  <BlockStack gap="150">
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Badge
                        tone={
                          installation.instructions.cartNative.status === 'manual_required'
                            ? 'attention'
                            : 'success'
                        }
                      >
                        {installation.instructions.cartNative.status === 'manual_required'
                          ? 'Manual theme step required'
                          : 'Configured'}
                      </Badge>
                      {installation.instructions.cartNative.appBlockName && (
                        <Text as="span" variant="bodySm" tone="subdued">
                          App block: {installation.instructions.cartNative.appBlockName}
                        </Text>
                      )}
                    </InlineStack>
                    {installation.instructions.cartNative.summary && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        {installation.instructions.cartNative.summary}
                      </Text>
                    )}
                    {Array.isArray(installation.instructions.cartNative.steps) &&
                      installation.instructions.cartNative.steps.length > 0 && (
                        <ul className={styles.installSteps}>
                          {installation.instructions.cartNative.steps.map((step, index) => (
                            <li key={`cart-native-step-${index}`}>
                              <Text as="span" variant="bodySm">
                                {step}
                              </Text>
                            </li>
                          ))}
                        </ul>
                      )}
                    {installation.instructions.cartNative.lineSnippet && (
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          Cart line snippet
                        </Text>
                        <pre className={styles.checkoutDiagDebugBox}>
                          <code>{installation.instructions.cartNative.lineSnippet}</code>
                        </pre>
                        <Button
                          size="slim"
                          onClick={() =>
                            handleCopy(
                              installation.instructions.cartNative.lineSnippet,
                              'Cart line snippet copied'
                            )
                          }
                        >
                          Copy cart line snippet
                        </Button>
                      </BlockStack>
                    )}
                    {installation.instructions.cartNative.summarySnippet && (
                      <BlockStack gap="100">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          Cart summary snippet
                        </Text>
                        <pre className={styles.checkoutDiagDebugBox}>
                          <code>{installation.instructions.cartNative.summarySnippet}</code>
                        </pre>
                        <Button
                          size="slim"
                          onClick={() =>
                            handleCopy(
                              installation.instructions.cartNative.summarySnippet,
                              'Cart summary snippet copied'
                            )
                          }
                        >
                          Copy cart summary snippet
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                </div>
              </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={installAdvancedOpen}
        onClose={() => setInstallAdvancedOpen(false)}
        title="Advanced installation tools"
        size="large"
        primaryAction={{ content: 'Close', onAction: () => setInstallAdvancedOpen(false) }}
      >
        <Modal.Section>
          <BlockStack gap="300" data-modal="settings-install-detail">
            <Text as="p" variant="bodySm" tone="subdued">
              Power tools for verification, preview probing, and Shopify function inventory.
            </Text>
            <InlineStack gap="200" wrap>
              <Button onClick={runFullCheckoutVerification} loading={checkoutFullVerifyRunning}>
                Run full verify
              </Button>
              <Button onClick={runCheckoutDiagnostics} loading={checkoutDiagLoading}>
                Run diagnostics
              </Button>
              <Button onClick={fetchShopifyFnInventory} loading={shopifyFnInventoryLoading}>
                Refresh function inventory
              </Button>
            </InlineStack>
            <div className={styles.installAdvancedModalGrid}>
              <TextField
                label="Preview probe test ID"
                value={previewProbeTestId}
                onChange={setPreviewProbeTestId}
                autoComplete="off"
                placeholder="68cbfbe8-6bee-479c-acce-58d0d9ffd9fe"
              />
              <TextField
                label="Preview probe variant"
                value={previewProbeVariant}
                onChange={setPreviewProbeVariant}
                autoComplete="off"
                placeholder="Variant A"
              />
            </div>
            <InlineStack gap="200" wrap>
              <Button
                size="slim"
                onClick={autofillPreviewProbeFromRunningTest}
                loading={previewProbeAutofillLoading}
              >
                Use running test
              </Button>
              <Button size="slim" onClick={runPreviewProbe} loading={previewProbeLoading}>
                Run preview probe
              </Button>
              <Button
                size="slim"
                url={previewProbeUrl || undefined}
                external
                disabled={!previewProbeUrl}
              >
                Open preview URL
              </Button>
              {shopifyAdminDiscountsUrl && (
                <Button size="slim" url={shopifyAdminDiscountsUrl} external>
                  Open Shopify discounts
                </Button>
              )}
            </InlineStack>
            {previewProbeError && <Banner tone="critical">{previewProbeError}</Banner>}
            {previewProbeResult && (
              <div className={styles.checkoutDiagProbeResult}>
                <Text as="p" variant="bodySm">
                  <strong>Variant:</strong>{' '}
                  {previewProbeResult.variantName || previewProbeResult.variantId || '—'}
                </Text>
                <Text as="p" variant="bodySm">
                  <strong>Mode:</strong> {previewProbeResult.priceMode || '—'}
                </Text>
                <Text as="p" variant="bodySm">
                  <strong>Fixed price:</strong> {previewProbeResult.price ?? '—'}
                </Text>
              </div>
            )}
            {shopifyFnInventory?.summary && (
              <div className={styles.installModalInfoCard}>
                <Text variant="headingSm" as="h3">
                  Shopify Functions inventory
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {shopifyFnInventory.summary.totalFunctionsReturned} function(s) returned
                  {shopifyFnInventory.generatedAt
                    ? ` · updated ${formatRelativeTime(shopifyFnInventory.generatedAt)}`
                    : ''}
                </Text>
                {shopifyFnInventory.readiness && (
                  <InlineStack gap="200" wrap>
                    {typeof shopifyFnInventory.readiness === 'string' ? (
                      <Badge
                        tone={shopifyFnInventory.readiness === 'ready' ? 'success' : 'attention'}
                      >
                        {shopifyFnInventory.readiness}
                      </Badge>
                    ) : (
                      <>
                        <Badge
                          tone={
                            shopifyFnInventory.readiness.discount_function_for_checkout
                              ? 'success'
                              : 'attention'
                          }
                        >
                          Discount path:{' '}
                          {shopifyFnInventory.readiness.discount_function_for_checkout
                            ? 'ready'
                            : 'not detected'}
                        </Badge>
                        <Badge
                          tone={
                            shopifyFnInventory.readiness.cart_transform_for_direct_price
                              ? 'success'
                              : 'attention'
                          }
                        >
                          Direct price path:{' '}
                          {shopifyFnInventory.readiness.cart_transform_for_direct_price
                            ? 'ready'
                            : 'not detected'}
                        </Badge>
                      </>
                    )}
                  </InlineStack>
                )}
              </div>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={installDebugJsonOpen}
        onClose={() => setInstallDebugJsonOpen(false)}
        title="Debug JSON"
        size="large"
        primaryAction={{ content: 'Close', onAction: () => setInstallDebugJsonOpen(false) }}
      >
        <Modal.Section>
          <BlockStack gap="200" data-modal="settings-install-detail">
            <Text as="p" variant="bodySm" tone="subdued">
              Copy for support or internal troubleshooting. Redact secrets before sharing
              externally.
            </Text>
            <pre className={styles.checkoutDiagDebugBox}>
              {JSON.stringify({ checkoutDiag, shopifyFnInventory, storeHealth }, null, 2)}
            </pre>
            <InlineStack gap="200">
              <Button
                size="slim"
                onClick={() =>
                  handleCopy(
                    JSON.stringify({ checkoutDiag, shopifyFnInventory, storeHealth }, null, 2),
                    'Diagnostics JSON copied'
                  )
                }
              >
                Copy diagnostics JSON
              </Button>
            </InlineStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

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
