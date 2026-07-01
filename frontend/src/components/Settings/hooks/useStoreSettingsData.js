import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiGet, unwrapData } from '../../../services';
import { isStorefrontRuntimeReady } from '../../../utils/storefrontSetupStatus';
import { DEFAULT_SETTINGS, DEFAULT_INTEGRATION_CONFIG } from '../config/settingsConstants';
import {
  readCheckoutDiagCache,
  writeCheckoutDiagCache,
  CHECKOUT_DIAG_STALE_AFTER_MS,
} from '../utils/checkoutDiagCache';
import { buildStoreHealth } from '../utils/buildStoreHealth';

/**
 * Loads core store settings payloads used across Store settings tabs.
 */
export function useStoreSettingsData({ isAppSettings, appSettingsDomain }) {
  const [settings, setSettings] = useState({ ...DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [settingsLoadError, setSettingsLoadError] = useState(false);
  const [targetingPresets, setTargetingPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [integrations, setIntegrations] = useState(null);
  const [integrationsError, setIntegrationsError] = useState(false);
  const [integrationConfig, setIntegrationConfig] = useState({ ...DEFAULT_INTEGRATION_CONFIG });
  const [installation, setInstallation] = useState(null);
  const [installationLoading, setInstallationLoading] = useState(true);
  const [installationError, setInstallationError] = useState(false);
  const [checkoutDiagLoading, setCheckoutDiagLoading] = useState(false);
  const [checkoutDiag, setCheckoutDiag] = useState(null);
  const [checkoutDiagError, setCheckoutDiagError] = useState(null);
  const [checkoutDiagLastCheckedAt, setCheckoutDiagLastCheckedAt] = useState(null);
  const [checkoutExperienceDiagLoading, setCheckoutExperienceDiagLoading] = useState(false);
  const [checkoutExperienceDiag, setCheckoutExperienceDiag] = useState(null);
  const [checkoutExperienceDiagError, setCheckoutExperienceDiagError] = useState(null);
  const [shopifyFnInventory, setShopifyFnInventory] = useState(null);
  const [shopifyFnInventoryLoading, setShopifyFnInventoryLoading] = useState(false);
  const [shopifyFnInventoryError, setShopifyFnInventoryError] = useState(null);
  const [checkoutCustomizationTests, setCheckoutCustomizationTests] = useState([]);
  const [checkoutCustomizationTestsLoading, setCheckoutCustomizationTestsLoading] = useState(false);
  const [checkoutCustomizationTestsError, setCheckoutCustomizationTestsError] = useState(null);

  const checkoutDiagAutoRefreshRef = useRef({});
  const checkoutDiagRef = useRef(null);

  useEffect(() => {
    checkoutDiagRef.current = checkoutDiag;
  }, [checkoutDiag]);

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
      let liveSetupStatus = null;
      if (data?.platform === 'shopify' && data?.domain) {
        try {
          const statusRes = await apiGet('/shopify/setup/status', { domain: data.domain });
          liveSetupStatus = statusRes?.data || statusRes || null;
        } catch {
          liveSetupStatus = null;
        }
      }
      setInstallation(
        data
          ? {
              ...data,
              liveSetupStatus,
              scriptVerified:
                data.scriptVerified === true || isStorefrontRuntimeReady(liveSetupStatus),
            }
          : null
      );
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

  const storeHealth = useMemo(
    () => buildStoreHealth(installation, checkoutDiag),
    [installation, checkoutDiag]
  );

  return {
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
  };
}
