import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Collapsible,
  InlineStack,
  Modal,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { ChevronDownIcon } from '@shopify/polaris-icons';
import { Icon } from '@shopify/polaris';
import { apiGet, apiPut, unwrapData } from '../../services/api';
import { TooltipWrapper } from '../Shared';
import {
  MAX_PRICE_SURFACE_MAPPINGS,
  PRICE_SURFACE_ROLES,
  PRICE_SURFACES,
  analyzePriceSurfaceRegistryGaps,
  applyRecommendedPriceSurfaceDefaults,
  buildPriceSurfaceRegistryStatus,
  createEmptyPriceSurfaceMapping,
  normalizePriceSurfaceMappings,
  normalizePriceSurfaceMappingsForEditor,
  summarizePriceSurfaceRegistry,
  validatePriceSurfaceMappingsForEditor,
} from '../../utils/priceSurfaceRegistry';
import {
  PRICE_SURFACE_THEME_PACKS,
  mergeThemePackMappings,
} from '../../utils/priceSurfaceThemePacks';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import { resolveStorefrontPasswordForPreview } from '../../utils/previewUrl';

function buildSurfaceOptions() {
  return PRICE_SURFACES.map(value => ({ label: value.toUpperCase(), value }));
}

function buildRoleOptions() {
  return PRICE_SURFACE_ROLES.map(value => ({ label: value.replace(/_/g, ' '), value }));
}

function buildMappingKey(row) {
  return `${row.surface}:${row.role}:${row.selector}`;
}

function PriceSurfaceMappingRows({
  rows,
  styles,
  scope,
  onUpdate,
  onRemove,
  duplicateKeys,
  getPickerLaunchUrl,
  pickTarget,
  onBeginVisualPick,
}) {
  if (rows.length === 0) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        No selectors yet. Use Pick PDP or Pick PLP, or add a row.
      </Text>
    );
  }

  return (
    <div className={styles.priceSurfaceMappingTable}>
      <div className={styles.priceSurfaceMappingHeaderRow} aria-hidden>
        <span>Surface</span>
        <span>Role</span>
        <span>Selector</span>
        <span>Actions</span>
      </div>
      {rows.map((row, index) => {
        const duplicate = row.selector.trim() && duplicateKeys.has(buildMappingKey(row));
        const launchUrl = getPickerLaunchUrl?.(row.surface || 'pdp') || '';
        const isPicking =
          pickTarget?.scope === scope && pickTarget?.index === index && Boolean(launchUrl);
        return (
          <div
            key={row.id || `${scope}-surface-${index}`}
            className={styles.priceSurfaceMappingGridRow}
          >
            <Select
              label="Surface"
              labelHidden
              options={buildSurfaceOptions()}
              value={row.surface}
              onChange={value => onUpdate(index, { surface: value })}
            />
            <Select
              label="Role"
              labelHidden
              options={buildRoleOptions()}
              value={row.role}
              onChange={value => onUpdate(index, { role: value })}
            />
            <div className={styles.priceSurfaceSelectorField}>
              <TextField
                label="Selector"
                labelHidden
                value={row.selector}
                onChange={value => onUpdate(index, { selector: value })}
                autoComplete="off"
                placeholder=".product__price"
                error={duplicate ? 'Duplicate selector.' : undefined}
              />
            </div>
            <InlineStack gap="100" wrap={false} blockAlign="center">
              <Checkbox
                label="On"
                labelHidden
                checked={row.enabled !== false}
                onChange={checked => onUpdate(index, { enabled: checked })}
              />
              <Button
                size="slim"
                variant={isPicking ? 'primary' : 'secondary'}
                disabled={!launchUrl}
                onClick={() => onBeginVisualPick(scope, index)}
              >
                {isPicking ? 'Picking' : 'Pick'}
              </Button>
              <Button size="slim" tone="critical" variant="plain" onClick={() => onRemove(index)}>
                Remove
              </Button>
            </InlineStack>
          </div>
        );
      })}
    </div>
  );
}

export default function PriceSurfaceMappingsPanel({
  styles,
  testMappings,
  visualEditorSelector = '',
  shopDomain = '',
  storefrontPassword = '',
  onStorefrontPasswordChange,
  pickerLaunchUrl = '',
  getPickerLaunchUrl,
  pickTarget = null,
  onBeginVisualPick,
  onCancelVisualPick,
  onPrepareVisualPick,
  onRegisterShopPickHandler,
  onTestMappingsChange,
  onStatusChange,
  expandRequestToken = 0,
  settingsHref = '',
}) {
  const [shopMappings, setShopMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingShop, setSavingShop] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [activeScopeTab, setActiveScopeTab] = useState('test');
  const [previewPickError, setPreviewPickError] = useState('');
  const [pickerModalOpen, setPickerModalOpen] = useState(false);
  const [pickerModalUrl, setPickerModalUrl] = useState('');

  const resolvePickerLaunchUrl = useCallback(
    surface => {
      if (typeof getPickerLaunchUrl === 'function') {
        return getPickerLaunchUrl(surface) || '';
      }
      return pickerLaunchUrl || '';
    },
    [getPickerLaunchUrl, pickerLaunchUrl]
  );

  const loadShopMappings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiGet('/settings/price-surfaces');
      const data = unwrapData(response);
      setShopMappings(normalizePriceSurfaceMappingsForEditor(data?.mappings));
    } catch (loadError) {
      setError(loadError?.message || 'Could not load shop price surface mappings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShopMappings();
  }, [loadShopMappings]);

  useEffect(() => {
    if (!onRegisterShopPickHandler) {
      return undefined;
    }
    onRegisterShopPickHandler((index, patch) => {
      setShopMappings(prev =>
        normalizePriceSurfaceMappingsForEditor(prev).map((row, idx) =>
          idx === index ? applyRecommendedPriceSurfaceDefaults({ ...row, ...patch }) : row
        )
      );
      setNotice('Shop selector captured. Save shop defaults to persist.');
    });
    return () => onRegisterShopPickHandler(null);
  }, [onRegisterShopPickHandler]);

  useEffect(() => {
    if (pickTarget) {
      setExpanded(true);
    }
  }, [pickTarget]);

  useEffect(() => {
    if (expandRequestToken > 0) {
      setExpanded(true);
    }
  }, [expandRequestToken]);

  const closePickerModal = useCallback(() => {
    setPickerModalOpen(false);
    setPickerModalUrl('');
  }, []);

  useEffect(() => {
    if (!pickTarget && pickerModalOpen) {
      closePickerModal();
    }
  }, [pickTarget, pickerModalOpen, closePickerModal]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    if (pickerModalOpen) {
      document.body.classList.add('ripx-price-surface-picker-modal-open');
    } else {
      document.body.classList.remove('ripx-price-surface-picker-modal-open');
    }
    return () => document.body.classList.remove('ripx-price-surface-picker-modal-open');
  }, [pickerModalOpen]);

  useEffect(() => {
    if (!pickerModalOpen || typeof window === 'undefined') {
      return undefined;
    }
    const onMessage = event => {
      const data = event?.data;
      if (!data) {
        return;
      }
      if (data.type === 'ripx-close-price-picker') {
        closePickerModal();
        onCancelVisualPick?.();
        return;
      }
      if (data.type !== 'ripx-visual-selector') {
        return;
      }
      if (typeof data.selector === 'string' && data.selector.trim()) {
        closePickerModal();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [pickerModalOpen, closePickerModal, onCancelVisualPick]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const onMessage = event => {
      const data = event?.data;
      if (!data || data.type !== 'ripx-preview-error' || data.source !== 'ripx-preview-document') {
        return;
      }
      const message = String(data.message || '').trim();
      if (!message) {
        return;
      }
      if (/password/i.test(message)) {
        setPreviewPickError(message);
        setExpanded(true);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const updateTestMapping = (index, patch) => {
    const next = normalizePriceSurfaceMappingsForEditor(testMappings).map((entry, idx) => {
      if (idx !== index) {
        return entry;
      }
      return applyRecommendedPriceSurfaceDefaults({ ...entry, ...patch });
    });
    onTestMappingsChange(next);
  };

  const addTestMapping = (overrides = {}) => {
    const current = normalizePriceSurfaceMappingsForEditor(testMappings);
    if (current.length >= MAX_PRICE_SURFACE_MAPPINGS) {
      setError(`You can save up to ${MAX_PRICE_SURFACE_MAPPINGS} test mappings.`);
      return;
    }
    onTestMappingsChange([...current, createEmptyPriceSurfaceMapping(overrides)]);
    setError('');
    setExpanded(true);
    setActiveScopeTab('test');
  };

  const removeTestMapping = index => {
    onTestMappingsChange(
      normalizePriceSurfaceMappingsForEditor(testMappings).filter((_, idx) => idx !== index)
    );
  };

  const updateShopMapping = (index, patch) => {
    setShopMappings(
      normalizePriceSurfaceMappingsForEditor(shopMappings).map((entry, idx) => {
        if (idx !== index) {
          return entry;
        }
        return applyRecommendedPriceSurfaceDefaults({ ...entry, ...patch });
      })
    );
    setNotice('');
  };

  const addShopMapping = (overrides = {}) => {
    const current = normalizePriceSurfaceMappingsForEditor(shopMappings);
    if (current.length >= MAX_PRICE_SURFACE_MAPPINGS) {
      setError(`You can save up to ${MAX_PRICE_SURFACE_MAPPINGS} shop mappings.`);
      return;
    }
    setShopMappings([...current, createEmptyPriceSurfaceMapping(overrides)]);
    setNotice('');
    setError('');
    setExpanded(true);
    setActiveScopeTab('shop');
  };

  const removeShopMapping = index => {
    setShopMappings(
      normalizePriceSurfaceMappingsForEditor(shopMappings).filter((_, idx) => idx !== index)
    );
    setNotice('');
  };

  const saveShopDefaults = async () => {
    setSavingShop(true);
    setError('');
    setNotice('');
    try {
      const response = await apiPut('/settings/price-surfaces', {
        mappings: normalizePriceSurfaceMappings(shopMappings),
      });
      const data = unwrapData(response);
      setShopMappings(normalizePriceSurfaceMappingsForEditor(data?.mappings));
      setNotice('Shop defaults saved.');
    } catch (saveError) {
      setError(saveError?.message || 'Could not save shop price surface mappings.');
    } finally {
      setSavingShop(false);
    }
  };

  const beginVisualPick = async (scope, index) => {
    if (!onBeginVisualPick) {
      return;
    }
    const rows = scope === 'test' ? testRows : shopRows;
    const row = rows[index];
    const launchUrl = resolvePickerLaunchUrl(row?.surface || 'pdp');
    if (!launchUrl) {
      return;
    }
    if (onPrepareVisualPick) {
      const ready = await onPrepareVisualPick();
      if (!ready) {
        return;
      }
    }
    onBeginVisualPick({ scope, index });
    setPickerModalUrl(launchUrl);
    setPickerModalOpen(true);
  };

  const testRows = normalizePriceSurfaceMappingsForEditor(testMappings);
  const shopRows = normalizePriceSurfaceMappingsForEditor(shopMappings);
  const duplicateKeys = useMemo(() => {
    const counts = new Map();
    [...testRows, ...shopRows].forEach(row => {
      if (!row.selector.trim()) {
        return;
      }
      const key = buildMappingKey(row);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([key]) => key));
  }, [testRows, shopRows]);

  const coverageSummary = useMemo(
    () => summarizePriceSurfaceRegistry(testRows, shopRows),
    [testRows, shopRows]
  );
  const coverageGaps = useMemo(
    () => analyzePriceSurfaceRegistryGaps(testRows, shopRows),
    [testRows, shopRows]
  );
  const registryStatus = useMemo(
    () =>
      buildPriceSurfaceRegistryStatus(testRows, shopRows, {
        picking: Boolean(pickTarget),
      }),
    [testRows, shopRows, pickTarget]
  );
  const validationWarnings = useMemo(
    () => [
      ...validatePriceSurfaceMappingsForEditor(testRows).map(message => `Test: ${message}`),
      ...validatePriceSurfaceMappingsForEditor(shopRows).map(message => `Shop: ${message}`),
    ],
    [testRows, shopRows]
  );

  const visualSelector = String(visualEditorSelector || '').trim();
  const defaultPickerReady = Boolean(resolvePickerLaunchUrl('pdp'));
  const shopHost = String(shopDomain || '').trim();
  const showStorefrontPasswordField = shopHost ? isShopifyStoreDomain(shopHost) : false;
  const resolvedStorefrontPassword = resolveStorefrontPasswordForPreview(
    shopHost,
    storefrontPassword
  );
  const needsStorefrontPassword =
    showStorefrontPasswordField && defaultPickerReady && !resolvedStorefrontPassword;
  const hasIssues = Boolean(error || coverageGaps.length > 0 || validationWarnings.length > 0);
  const activeRows = activeScopeTab === 'test' ? testRows : shopRows;
  const settingsLink = String(settingsHref || '').trim();

  useEffect(() => {
    onStatusChange?.(registryStatus);
  }, [onStatusChange, registryStatus]);

  const startQuickPick = async (scope, surface) => {
    if (needsStorefrontPassword) {
      setPreviewPickError(
        'Enter your Shopify storefront password below, then pick again. It is stored for this browser session only.'
      );
      setExpanded(true);
      return;
    }
    const rows = scope === 'test' ? testRows : shopRows;
    const emptyIndex = rows.findIndex(row => !String(row.selector || '').trim());
    if (emptyIndex >= 0) {
      await beginVisualPick(scope, emptyIndex);
      return;
    }
    if (rows.length >= MAX_PRICE_SURFACE_MAPPINGS) {
      setError(`You can save up to ${MAX_PRICE_SURFACE_MAPPINGS} mappings.`);
      return;
    }
    const created = createEmptyPriceSurfaceMapping({ surface, role: 'regular', source: 'visual' });
    const nextIndex = rows.length;
    if (scope === 'test') {
      onTestMappingsChange([...rows, created]);
    } else {
      setShopMappings([...rows, created]);
    }
    if (onPrepareVisualPick) {
      const ready = await onPrepareVisualPick();
      if (!ready) {
        return;
      }
    }
    if (onBeginVisualPick) {
      onBeginVisualPick({ scope, index: nextIndex });
    }
    const launchUrl = resolvePickerLaunchUrl(surface);
    if (launchUrl) {
      setPickerModalUrl(launchUrl);
      setPickerModalOpen(true);
    }
    setExpanded(true);
  };

  const handleHeaderQuickPick = event => {
    event.stopPropagation();
    setExpanded(true);
    setActiveScopeTab('test');
    startQuickPick('test', 'pdp');
  };

  const handleHeaderExpand = event => {
    event.stopPropagation();
    setExpanded(true);
  };

  const applyThemePack = (scope, packKey) => {
    const rows = scope === 'test' ? testRows : shopRows;
    const merged = mergeThemePackMappings(rows, packKey);
    if (scope === 'test') {
      onTestMappingsChange(merged);
    } else {
      setShopMappings(merged);
      setNotice(`Applied ${PRICE_SURFACE_THEME_PACKS[packKey].label}. Save to persist.`);
    }
    setError('');
    setExpanded(true);
  };

  const addVisualEditorSelector = () => {
    if (!visualSelector) {
      return;
    }
    addTestMapping({ surface: 'pdp', role: 'regular', selector: visualSelector, source: 'visual' });
  };

  return (
    <div
      id="price-surface-mapping"
      className={`${styles.priceSurfacePanel} ${styles.priceSurfacePanelCompact}`}
    >
      <div className={styles.priceSurfaceHeaderRow}>
        <button
          type="button"
          className={`${styles.priceSurfaceHeaderToggle} ${expanded ? styles.priceSurfaceHeaderToggleOpen : ''}`}
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
        >
          <span className={styles.priceSurfaceHeaderMain}>
            <Text as="span" variant="bodySm" fontWeight="semibold">
              Theme price mapping
            </Text>
            <Badge tone={registryStatus.tone} size="small">
              {registryStatus.label}
            </Badge>
            {pickTarget ? (
              <Badge tone="attention" size="small">
                Picking
              </Badge>
            ) : null}
          </span>
          <TooltipWrapper content="Map where RipX paints test prices on PDP and listing cards. Test overrides run before shop defaults.">
            <span className={styles.priceSurfaceHeaderHint}>{registryStatus.hint}</span>
          </TooltipWrapper>
          <span className={styles.priceSurfaceHeaderChevron} aria-hidden>
            <Icon source={ChevronDownIcon} />
          </span>
        </button>
        {!expanded ? (
          <div className={styles.priceSurfaceHeaderActions}>
            {defaultPickerReady ? (
              <Button size="slim" variant="plain" onClick={handleHeaderQuickPick}>
                Pick PDP
              </Button>
            ) : null}
            <Button size="slim" variant="plain" onClick={handleHeaderExpand}>
              Map
            </Button>
          </div>
        ) : null}
      </div>

      {!expanded && hasIssues ? (
        <div className={styles.priceSurfaceCollapsedStatus}>
          {error ? (
            <Text as="span" tone="critical">
              {error}
            </Text>
          ) : null}
          {!error && coverageGaps.length > 0 ? (
            <Text as="span" tone="caution">
              {coverageGaps[0].message}
            </Text>
          ) : null}
        </div>
      ) : null}

      <Collapsible open={expanded} transition={{ duration: '200ms', timingFunction: 'ease' }}>
        <div className={styles.priceSurfaceBody}>
          {pickTarget ? (
            <div className={styles.priceSurfaceInlineStatus}>
              <Text as="span" variant="bodySm">
                Click a price in the preview panel below.
              </Text>
              {onCancelVisualPick ? (
                <Button variant="plain" size="slim" onClick={onCancelVisualPick}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ) : null}
          {!defaultPickerReady ? (
            <Text as="p" variant="bodySm" tone="subdued">
              Connect a shop or set a preview URL to use the visual picker.
            </Text>
          ) : null}
          {showStorefrontPasswordField && onStorefrontPasswordChange ? (
            <TextField
              label="Storefront password"
              type="password"
              value={storefrontPassword}
              onChange={value => {
                setPreviewPickError('');
                onStorefrontPasswordChange(value);
              }}
              autoComplete="off"
              helpText="Required for password-protected Shopify stores before Pick PDP/PLP opens preview. Saved for this browser session only."
            />
          ) : null}
          {needsStorefrontPassword ? (
            <Banner tone="warning" title="Storefront password required">
              <p>
                This shop is behind Shopify&apos;s storefront password. Enter it above, then use
                Pick PDP or Pick PLP again.
              </p>
            </Banner>
          ) : null}
          {previewPickError && !needsStorefrontPassword ? (
            <Banner tone="critical" title="Preview could not load">
              <p>{previewPickError}</p>
            </Banner>
          ) : null}
          {error ? (
            <Banner tone="critical" title="Price surfaces">
              <p>{error}</p>
            </Banner>
          ) : null}
          {notice ? (
            <Banner tone="success" title="Saved">
              <p>{notice}</p>
            </Banner>
          ) : null}
          {validationWarnings.length > 0 ? (
            <Text as="p" variant="bodySm" tone="caution">
              {validationWarnings.slice(0, 2).join(' ')}
            </Text>
          ) : null}
          {coverageSummary.length > 0 ? (
            <div className={styles.priceSurfaceChipRow}>
              {coverageSummary.slice(0, 4).map(entry => (
                <Badge key={`${entry.surface}-${entry.role}`} size="small">
                  {entry.surface.toUpperCase()} {entry.role.replace(/_/g, ' ')}:{' '}
                  {entry.selectors.length}
                </Badge>
              ))}
            </div>
          ) : null}
          {registryStatus.coverageMatrix?.length > 0 ? (
            <div className={styles.priceSurfaceChipRow}>
              {registryStatus.coverageMatrix
                .filter(row => row.severity === 'high' || row.severity === 'medium')
                .map(row => (
                  <Badge
                    key={`readiness-${row.surface}-${row.role}`}
                    size="small"
                    tone={row.configured ? 'success' : 'warning'}
                  >
                    {row.surface.toUpperCase()} {row.role.replace(/_/g, ' ')}
                  </Badge>
                ))}
            </div>
          ) : null}

          <div className={styles.priceSurfaceTabRow}>
            <button
              type="button"
              className={`${styles.priceSurfaceTab} ${activeScopeTab === 'test' ? styles.priceSurfaceTabActive : ''}`}
              onClick={() => setActiveScopeTab('test')}
            >
              Test overrides
            </button>
            <button
              type="button"
              className={`${styles.priceSurfaceTab} ${activeScopeTab === 'shop' ? styles.priceSurfaceTabActive : ''}`}
              onClick={() => setActiveScopeTab('shop')}
            >
              Shop defaults
            </button>
          </div>

          {activeScopeTab === 'shop' ? (
            <Text as="p" variant="bodySm" tone="subdued">
              Shop defaults apply to every price test. Test overrides win when both are set.
              {settingsLink ? (
                <>
                  {' '}
                  <a href={settingsLink} className={styles.priceSurfaceSettingsLink}>
                    Open app settings
                  </a>
                </>
              ) : null}
            </Text>
          ) : null}

          {activeScopeTab === 'test' ? (
            <PriceSurfaceMappingRows
              rows={activeRows}
              styles={styles}
              scope="test"
              onUpdate={updateTestMapping}
              onRemove={removeTestMapping}
              duplicateKeys={duplicateKeys}
              getPickerLaunchUrl={resolvePickerLaunchUrl}
              pickTarget={pickTarget}
              onBeginVisualPick={beginVisualPick}
            />
          ) : loading ? (
            <Text as="p" variant="bodySm" tone="subdued">
              Loading shop defaults…
            </Text>
          ) : (
            <PriceSurfaceMappingRows
              rows={activeRows}
              styles={styles}
              scope="shop"
              onUpdate={updateShopMapping}
              onRemove={removeShopMapping}
              duplicateKeys={duplicateKeys}
              getPickerLaunchUrl={resolvePickerLaunchUrl}
              pickTarget={pickTarget}
              onBeginVisualPick={beginVisualPick}
            />
          )}

          <InlineStack gap="150" wrap>
            {activeScopeTab === 'test' ? (
              <>
                <Button size="slim" onClick={() => addTestMapping()}>
                  Add row
                </Button>
                <Button
                  size="slim"
                  variant="plain"
                  disabled={!defaultPickerReady}
                  onClick={() => startQuickPick('test', 'pdp')}
                >
                  Pick PDP
                </Button>
                <Button
                  size="slim"
                  variant="plain"
                  disabled={!defaultPickerReady}
                  onClick={() => startQuickPick('test', 'plp')}
                >
                  Pick PLP
                </Button>
                <Button
                  size="slim"
                  variant="plain"
                  disabled={!defaultPickerReady}
                  onClick={() => startQuickPick('test', 'cart')}
                >
                  Pick cart
                </Button>
                <Button
                  size="slim"
                  variant="plain"
                  disabled={!defaultPickerReady}
                  onClick={() => startQuickPick('test', 'search')}
                >
                  Pick search
                </Button>
                {visualSelector ? (
                  <Button size="slim" variant="plain" onClick={addVisualEditorSelector}>
                    Use visual selector
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <Button size="slim" onClick={() => addShopMapping()} disabled={loading}>
                  Add row
                </Button>
                <Button size="slim" variant="plain" onClick={() => applyThemePack('shop', 'dawn')}>
                  Dawn pack
                </Button>
                <Button
                  size="slim"
                  variant="plain"
                  onClick={() => applyThemePack('shop', 'legacy')}
                >
                  Legacy pack
                </Button>
                <Button
                  size="slim"
                  loading={savingShop}
                  onClick={saveShopDefaults}
                  disabled={loading}
                >
                  Save shop defaults
                </Button>
              </>
            )}
          </InlineStack>
        </div>
      </Collapsible>
      <Modal
        open={pickerModalOpen}
        onClose={() => {
          closePickerModal();
          onCancelVisualPick?.();
        }}
        title="Pick a price on your storefront"
        size="large"
      >
        <div data-price-surface-picker-modal className={styles.priceSurfacePickerModal}>
          <Text as="p" variant="bodySm" tone="subdued">
            Click a price in the preview. The selector is sent back to Theme price mapping
            automatically. Store links stay inside this preview so picking does not break.
          </Text>
          {pickerModalUrl ? (
            <iframe
              title="RipX price surface picker"
              src={pickerModalUrl}
              className={styles.priceSurfacePickerIframe}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
