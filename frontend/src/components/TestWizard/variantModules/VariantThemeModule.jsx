import React from 'react';
import { Banner, BlockStack, Card, FormLayout, Select, Text, TextField } from '@shopify/polaris';

import { normalizeThemeConfig, normalizeThemeMode } from '../wizardVariantConfigHelpers';

export default function VariantThemeModule({ formData, setFormData, selectedTemplate }) {
  return (
    <BlockStack gap="400">
      <Banner tone="info" title="Theme test contract">
        <Text as="p" variant="bodySm">
          RipX applies theme variants deterministically by exposing normalized theme metadata on the
          storefront (`data-ripx-*` attributes + `ripx:theme-variant` event). Configure
          mode-specific fields below so each variant is explicit and production-safe.
        </Text>
      </Banner>
      <Text variant="bodyMd" color="subdued" as="p">
        Use <strong>Template switch</strong> for template-handle experiments,{' '}
        <strong>Section variant</strong> for section-targeted rollouts, and{' '}
        <strong>Asset flag</strong> when your theme code reads a body class/attribute switch. Use{' '}
        <strong>Theme redirect</strong> for full-page or full-theme reroute experiments.
      </Text>
      {(formData.variants || []).map((variant, index) => (
        <Card key={`theme-${index}`} sectioned>
          <BlockStack gap="300">
            <Text variant="headingSm" as="h4" fontWeight="semibold">
              {variant.name}
            </Text>
            {(() => {
              const fallbackMode =
                selectedTemplate === 'template' ? 'template_switch' : 'asset_flag';
              const cfg =
                variant?.config && typeof variant.config === 'object' ? variant.config : {};
              const mode = normalizeThemeMode(cfg.themeMode || cfg.theme_mode, fallbackMode);
              const templateHandle = String(
                cfg.themeTemplateHandle || cfg.theme_template_handle || cfg.template || ''
              );
              const themeId = String(cfg.themeId || cfg.theme_id || '');
              const sectionId = String(cfg.sectionId || cfg.section_id || '');
              const bodyClass = String(cfg.bodyClass || cfg.body_class || '');
              const redirectUrl = String(
                cfg.url || cfg.themeRedirectUrl || cfg.theme_redirect_url || ''
              );
              const requiresTemplateHandle = mode === 'template_switch';
              const requiresSectionId = mode === 'section_variant';
              const requiresRedirectUrl = mode === 'theme_redirect';

              const updateThemeConfig = patch => {
                const next = [...(formData.variants || [])];
                const prevConfig =
                  next[index]?.config && typeof next[index].config === 'object'
                    ? next[index].config
                    : {};
                const mergedConfig = { ...prevConfig, ...patch };
                next[index] = {
                  ...next[index],
                  config: normalizeThemeConfig(mergedConfig, fallbackMode),
                };
                setFormData({ ...formData, variants: next });
              };

              return (
                <FormLayout>
                  <Select
                    label={`${variant.name} mode`}
                    options={[
                      { label: 'Template switch', value: 'template_switch' },
                      { label: 'Section variant', value: 'section_variant' },
                      { label: 'Asset flag', value: 'asset_flag' },
                      { label: 'Theme redirect', value: 'theme_redirect' },
                    ]}
                    value={mode}
                    onChange={value => updateThemeConfig({ themeMode: value })}
                    helpText="Defines how storefront runtime should apply this variant."
                  />
                  {(requiresTemplateHandle || requiresSectionId) && (
                    <TextField
                      label={`${variant.name} template handle${requiresTemplateHandle ? '' : ' (optional)'}`}
                      value={templateHandle}
                      onChange={value =>
                        updateThemeConfig({ themeTemplateHandle: value, template: value })
                      }
                      placeholder="e.g. product.alternate"
                      helpText={
                        requiresTemplateHandle
                          ? 'Required for template-switch mode.'
                          : 'Optional template context for section-level variants.'
                      }
                      autoComplete="off"
                    />
                  )}
                  {requiresSectionId && (
                    <TextField
                      label={`${variant.name} section ID`}
                      value={sectionId}
                      onChange={value => updateThemeConfig({ sectionId: value })}
                      placeholder="e.g. main-product or hero-banner"
                      helpText="Required for section-variant mode."
                      autoComplete="off"
                    />
                  )}
                  {requiresRedirectUrl && (
                    <TextField
                      label={`${variant.name} redirect URL`}
                      value={redirectUrl}
                      onChange={value => updateThemeConfig({ url: value })}
                      placeholder="/pages/redesign-v2 or https://example.com/pages/redesign-v2"
                      helpText="Required for theme-redirect mode."
                      autoComplete="off"
                    />
                  )}
                  <TextField
                    label={`${variant.name} body class (optional)`}
                    value={bodyClass}
                    onChange={value => updateThemeConfig({ bodyClass: value })}
                    placeholder="e.g. ripx-theme-v2"
                    helpText="Added to body so your theme assets can switch behavior safely."
                    autoComplete="off"
                  />
                  <TextField
                    label={`${variant.name} theme ID (optional)`}
                    value={themeId}
                    onChange={value => updateThemeConfig({ themeId: value })}
                    placeholder="e.g. 123456789"
                    helpText="Optional metadata when variants map across multiple themes."
                    autoComplete="off"
                  />
                </FormLayout>
              );
            })()}
          </BlockStack>
        </Card>
      ))}
    </BlockStack>
  );
}
