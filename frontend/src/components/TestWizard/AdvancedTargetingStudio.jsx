import React from 'react';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Checkbox,
  InlineStack,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { SaveIcon } from '@shopify/polaris-icons';
import AdvancedTargetingRail from './AdvancedTargetingRail';
import {
  ADVANCED_STUDIO_SECTIONS,
  getAdvancedStudioSectionMeta,
  JS_TARGETING_SNIPPETS,
} from './advancedTargeting';
import {
  countCustomAudienceConditions,
  resolveCustomRuleGroupsFromSegments,
} from './customAudienceRules';

export default function AdvancedTargetingStudio({
  styles,
  formData,
  setFormData,
  setIsDirty,
  activeSection = 'safety',
  onSelectSection,
  targetingPresets = [],
  loadedPresetId = '',
  onLoadedPresetIdChange,
  onOpenSavePreset,
  antiFlickerRecommendedMode = 'balanced',
  antiFlickerRecommendationReason = '',
  onAntiFlickerApplied,
  onJumpToAudienceCustom,
  showAudienceCustomLink = true,
}) {
  const segments = formData?.segments || {};
  const customRuleCount = countCustomAudienceConditions(
    resolveCustomRuleGroupsFromSegments(segments)
  );
  const pageRuleCount = (segments.page_rules || []).length;
  const sectionMeta = getAdvancedStudioSectionMeta(formData, activeSection);

  const updateSegments = patch => {
    setIsDirty?.(true);
    setFormData(prev => ({
      ...prev,
      segments: {
        ...prev.segments,
        ...patch,
      },
    }));
  };

  const renderSafetySection = () => (
    <div className={styles.safetyCombinedCard}>
      <div className={styles.safetySubsection}>
        <span className={styles.safetySubsectionTitle}>Guardrail</span>
        <p className={styles.safetySubsectionHint}>Auto-stop if any variant drops below control.</p>
        <div className={styles.guardrailCard}>
          <Checkbox
            label="Enable guardrail"
            checked={formData.guardrail_config?.enabled || false}
            onChange={value =>
              setFormData(prev => ({
                ...prev,
                guardrail_config: {
                  ...prev.guardrail_config,
                  enabled: value,
                  minDropPercent: prev.guardrail_config?.minDropPercent ?? 10,
                },
              }))
            }
            helpText="Stop test when any variant drops below threshold vs control"
          />
          {formData.guardrail_config?.enabled ? (
            <div style={{ marginTop: 12 }}>
              <TextField
                label="Min. drop % to trigger"
                type="number"
                value={String(formData.guardrail_config?.minDropPercent ?? 10)}
                onChange={value =>
                  setFormData(prev => ({
                    ...prev,
                    guardrail_config: {
                      ...prev.guardrail_config,
                      minDropPercent: parseInt(value, 10) || 10,
                    },
                  }))
                }
                min={5}
                max={50}
                suffix="%"
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className={styles.safetySubsection}>
        <span className={styles.safetySubsectionTitle}>Data quality</span>
        <p className={styles.safetySubsectionHint}>
          Exclude bots, internal traffic, or ramp gradually.
        </p>
        <div className={styles.dataQualityPresets}>
          <button
            type="button"
            className={`${styles.dataQualityPresetBtn} ${
              segments.exclude_bots && segments.exclude_internal_ips
                ? styles.dataQualityPresetBtnActive
                : ''
            }`}
            onClick={() =>
              updateSegments({
                exclude_bots: true,
                exclude_internal_ips: true,
              })
            }
          >
            <span className={styles.dataQualityPresetLabel}>Recommended</span>
            <span className={styles.dataQualityPresetDesc}>Exclude bots + internal IPs</span>
          </button>
        </div>
        <BlockStack gap="200">
          <Checkbox
            label="Exclude bot traffic"
            checked={segments.exclude_bots || false}
            onChange={value => updateSegments({ exclude_bots: value })}
            helpText="Filter crawlers and bots by user-agent"
          />
          <Checkbox
            label="Exclude internal IPs"
            checked={segments.exclude_internal_ips || false}
            onChange={value => updateSegments({ exclude_internal_ips: value })}
            helpText="Filter office/VPN traffic"
          />
          <TextField
            label="Traffic ramp %"
            type="number"
            value={segments.traffic_ramp_percent ?? ''}
            onChange={value => updateSegments({ traffic_ramp_percent: value })}
            placeholder="0"
            min={0}
            max={100}
            suffix="%"
            helpText="Start at this % and ramp to 100%. 0 = no ramp."
            autoComplete="off"
          />
          <TextField
            label="Ramp duration (days)"
            type="number"
            value={String(segments.traffic_ramp_days ?? 7)}
            onChange={value => updateSegments({ traffic_ramp_days: value })}
            min={1}
            max={30}
            suffix="days"
            helpText="How long to move from ramp % to 100% traffic."
            autoComplete="off"
          />
          <Select
            label="Variation anti-flicker mode"
            options={[
              {
                label: 'Balanced (recommended) - hide for content/offer tests only',
                value: 'balanced',
              },
              {
                label: 'Strict - hide for all tests (strongest flicker protection)',
                value: 'strict',
              },
            ]}
            value={segments.anti_flicker_mode || 'balanced'}
            onChange={value =>
              updateSegments({
                anti_flicker_mode: value === 'strict' ? 'strict' : 'balanced',
              })
            }
            helpText="Strict reduces control flash further but can increase blank-screen time slightly."
          />
          <InlineStack align="start" gap="200" blockAlign="center">
            <button
              type="button"
              onClick={() => {
                updateSegments({ anti_flicker_mode: antiFlickerRecommendedMode });
                onAntiFlickerApplied?.(antiFlickerRecommendedMode);
              }}
              style={{
                padding: 0,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
              title={`Apply recommended mode: ${antiFlickerRecommendedMode}`}
            >
              <Badge tone={antiFlickerRecommendedMode === 'strict' ? 'warning' : 'success'}>
                Best for this test type: {antiFlickerRecommendedMode}
              </Badge>
            </button>
            <Text as="span" variant="bodySm" tone="subdued">
              {antiFlickerRecommendationReason}
            </Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone="subdued">
            Tip: Use <strong>Balanced</strong> for most price tests to protect speed. Use{' '}
            <strong>Strict</strong> for visual/content tests where even brief control flashes are
            unacceptable.
          </Text>
        </BlockStack>
      </div>
    </div>
  );

  const renderOverridesSection = () => (
    <BlockStack gap="300">
      {pageRuleCount > 0 ? (
        <Banner tone="info">
          Page rules from the Page section take precedence over the legacy URL regex below.
        </Banner>
      ) : null}
      <TextField
        label="URL pattern (regex)"
        value={segments.url_pattern === ' ' ? '' : segments.url_pattern || ''}
        onChange={value => updateSegments({ url_pattern: value })}
        placeholder="e.g. /products/.* or /collections/sale"
        helpText="Optional override when page rules are not configured."
        autoComplete="off"
      />
      <TextField
        label="Min. sessions per visitor"
        type="number"
        value={segments.min_sessions ?? ''}
        onChange={value => updateSegments({ min_sessions: value })}
        placeholder="0"
        min={0}
        helpText="Only include visitors with at least this many sessions. 0 = everyone."
        autoComplete="off"
      />
      {showAudienceCustomLink ? (
        <div className={styles.advancedAudienceBridgeCard}>
          <div>
            <Text as="h5" variant="headingSm">
              Custom audience conditions
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Field-based URL, UTM, device, and country rules live under Audience → Custom.
            </Text>
          </div>
          <InlineStack gap="200" blockAlign="center">
            {customRuleCount > 0 ? (
              <Badge tone="info">
                {customRuleCount} condition{customRuleCount === 1 ? '' : 's'}
              </Badge>
            ) : (
              <Badge>None</Badge>
            )}
            <Button onClick={onJumpToAudienceCustom}>Edit in Audience</Button>
          </InlineStack>
        </div>
      ) : null}
    </BlockStack>
  );

  const renderCodeSection = () => (
    <BlockStack gap="300">
      <Checkbox
        label="Enable JavaScript targeting"
        checked={segments.js_targeting?.enabled || false}
        onChange={enabled =>
          setFormData(prev => ({
            ...prev,
            segments: {
              ...prev.segments,
              js_targeting: {
                ...prev.segments?.js_targeting,
                enabled,
                code: prev.segments?.js_targeting?.code || 'return window.innerWidth > 768;',
              },
            },
          }))
        }
        helpText="Return true to include the visitor. Helpers: getDeviceType(), getCountryCode(), getTrafficSource()."
      />
      {segments.js_targeting?.enabled ? (
        <>
          <div className={styles.advancedSnippetRow}>
            {JS_TARGETING_SNIPPETS.map(snippet => (
              <button
                key={snippet.id}
                type="button"
                className={styles.advancedSnippetBtn}
                onClick={() =>
                  updateSegments({
                    js_targeting: {
                      ...segments.js_targeting,
                      enabled: true,
                      code: snippet.code,
                    },
                  })
                }
              >
                {snippet.label}
              </button>
            ))}
          </div>
          <TextField
            label="JavaScript code (must return boolean)"
            value={segments.js_targeting?.code || ''}
            onChange={code =>
              setFormData(prev => ({
                ...prev,
                segments: {
                  ...prev.segments,
                  js_targeting: {
                    ...prev.segments?.js_targeting,
                    enabled: true,
                    code,
                  },
                },
              }))
            }
            placeholder="return window.innerWidth > 768; // desktop only"
            multiline={8}
            autoComplete="off"
          />
        </>
      ) : null}
    </BlockStack>
  );

  const renderPresetsSection = () => (
    <div className={styles.presetRow}>
      {targetingPresets.length > 0 ? (
        <div className={styles.presetSelectWrap}>
          <Select
            label="Load preset"
            value={loadedPresetId}
            options={[
              { label: 'Select a preset...', value: '' },
              ...targetingPresets.map(preset => ({
                label: preset.name,
                value: preset.id,
              })),
            ]}
            onChange={id => {
              onLoadedPresetIdChange?.(id || '');
              if (!id) {
                return;
              }
              const preset = targetingPresets.find(item => item.id === id);
              if (!preset) {
                return;
              }
              setFormData(prev => {
                const next = { ...prev };
                if (preset.segments) {
                  next.segments = {
                    ...prev.segments,
                    ...preset.segments,
                    countries: preset.segments.countries
                      ? [...(preset.segments.countries || [])]
                      : prev.segments?.countries || [],
                  };
                }
                if (preset.goal && typeof preset.goal === 'object') {
                  next.goal = { ...prev.goal, ...preset.goal };
                }
                if (
                  preset.variants &&
                  Array.isArray(preset.variants) &&
                  preset.variants.length > 0
                ) {
                  next.variants = preset.variants.map(variant => ({ ...variant }));
                }
                return next;
              });
              setIsDirty?.(true);
            }}
          />
        </div>
      ) : (
        <Text as="p" variant="bodySm" tone="subdued">
          Save your current targeting bundle to reuse it on future tests.
        </Text>
      )}
      <Button variant="secondary" onClick={onOpenSavePreset} icon={SaveIcon}>
        Save as preset
      </Button>
    </div>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'overrides':
        return renderOverridesSection();
      case 'code':
        return renderCodeSection();
      case 'presets':
        return renderPresetsSection();
      case 'safety':
      default:
        return renderSafetySection();
    }
  };

  return (
    <div className={styles.advancedStudioWorkspace}>
      <AdvancedTargetingRail
        styles={styles}
        formData={formData}
        activeSection={activeSection}
        onSelectSection={onSelectSection}
      />
      <div
        className={styles.advancedStudioDetail}
        role="tabpanel"
        id={`advanced-studio-panel-${activeSection}`}
        aria-labelledby={`advanced-studio-tab-${activeSection}`}
      >
        <div className={styles.advancedStudioDetailHeader}>
          <div>
            <span className={styles.advancedStudioDetailEyebrow}>{sectionMeta.state}</span>
            <Text as="h5" variant="headingSm">
              {ADVANCED_STUDIO_SECTIONS.find(section => section.id === activeSection)?.label}
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              {sectionMeta.detail}
            </Text>
          </div>
        </div>
        <div className={styles.advancedStudioDetailBody}>{renderActiveSection()}</div>
      </div>
    </div>
  );
}
