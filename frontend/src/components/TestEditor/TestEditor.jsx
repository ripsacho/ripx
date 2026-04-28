/**
 * Test Editor – Visual + Code editor
 *
 * Preview iframe + variant CSS/JS code pane. Persists customCss/customJs to variant config;
 * storefront script applies them when the test runs.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  Card,
  TextField,
  Button,
  Tabs,
  Text,
  Banner,
  Box,
  InlineStack,
  BlockStack,
} from '@shopify/polaris';
import { ArrowLeftIcon } from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import {
  apiGet,
  apiPut,
  unwrapData,
  getShopDomain,
  getPreviewDomain,
  getApiBaseUrl,
} from '../../services';
import {
  buildPreviewUrl,
  buildPreviewDocumentUrl,
  resolvePreviewBaseUrl,
} from '../../utils/previewUrl';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import { useAppRoutes } from '../../hooks';
import Toast from '../Toast/Toast';
import styles from './TestEditor.module.css';

export default function TestEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const routes = useAppRoutes();
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoadState, setPreviewLoadState] = useState(null); // 'loading' | 'loaded' | 'error'
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [customCssByVariant, setCustomCssByVariant] = useState({});
  const [customJsByVariant, setCustomJsByVariant] = useState({});
  const [toast, setToast] = useState({ message: null, type: 'success' });
  const [previewRefreshKey, setPreviewRefreshKey] = useState(0);

  useEffect(() => {
    if (!id || id === 'undefined') {
      navigate(routes.tests);
      return;
    }
    apiGet(`/tests/${id}`)
      .then(res => {
        const data = unwrapData(res);
        const t = data?.test ?? data;
        setTest(t);
        if (t?.variants?.length) {
          const css = {};
          const js = {};
          t.variants.forEach((v, i) => {
            css[i] = v.config?.customCss ?? '';
            js[i] = v.config?.customJs ?? '';
          });
          setCustomCssByVariant(css);
          setCustomJsByVariant(js);
        }
      })
      .catch(() => setTest(null))
      .finally(() => setLoading(false));
  }, [id, navigate, routes.tests]);

  const variants = test?.variants || [];
  const safeIndex = Math.min(Math.max(0, selectedVariantIndex), Math.max(0, variants.length - 1));

  useEffect(() => {
    if (variants.length > 0 && selectedVariantIndex >= variants.length) {
      setSelectedVariantIndex(variants.length - 1);
    }
  }, [variants.length, selectedVariantIndex]);

  const handleTabSelect = useCallback(
    idOrIndex => {
      const index = typeof idOrIndex === 'number' ? idOrIndex : parseInt(String(idOrIndex), 10);
      const next = Number.isNaN(index)
        ? 0
        : Math.min(Math.max(0, index), Math.max(0, variants.length - 1));
      setSelectedVariantIndex(next);
    },
    [variants.length]
  );

  const handleSave = useCallback(async () => {
    if (!test?.variants?.length) return;
    setSaving(true);
    try {
      const variantsPayload = test.variants.map((v, i) => ({
        id: v.id,
        name: v.name,
        code: v.code ?? v.config?.code ?? '',
        customCss: customCssByVariant[i] ?? '',
        customJs: customJsByVariant[i] ?? '',
      }));
      await apiPut(`/tests/${id}/variants/codes`, { variants: variantsPayload });
      setToast({ message: 'Variant code saved', type: 'success' });
      setPreviewRefreshKey(k => k + 1);
    } catch (err) {
      setToast({
        message: err?.response?.data?.error || err?.message || 'Failed to save',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [test, id, customCssByVariant, customJsByVariant]);

  const updateVariantCode = useCallback((index, field, value) => {
    const i = typeof index === 'number' ? index : parseInt(String(index), 10) || 0;
    if (field === 'customCss') {
      setCustomCssByVariant(prev => ({ ...prev, [i]: value }));
    } else {
      setCustomJsByVariant(prev => ({ ...prev, [i]: value }));
    }
  }, []);

  const handlePreviewLoad = useCallback(() => {
    setPreviewLoadState('loaded');
  }, []);

  const handlePreviewError = useCallback(() => {
    setPreviewLoadState('error');
  }, []);

  const currentVariant = test?.variants?.[safeIndex];
  const effectiveBaseUrl = resolvePreviewBaseUrl({
    variantUrl: currentVariant?.config?.url,
    overrideUrl:
      (previewUrl && previewUrl.trim()) ||
      (test?.segments?.visual_editor_preview_url ?? '').trim() ||
      null,
    domain: test?.shop_domain || getPreviewDomain() || getShopDomain() || undefined,
    path: '/',
  });
  const previewIframeSrc =
    effectiveBaseUrl && id && currentVariant
      ? (() => {
          const directPreviewUrl =
            buildPreviewUrl({
              baseUrl: effectiveBaseUrl,
              testId: id,
              variantId: currentVariant.id || currentVariant.name || `variant-${safeIndex + 1}`,
              variantName: currentVariant.name || `Variant ${safeIndex + 1}`,
              tenantDomain: test?.shop_domain || null,
              visualEditor: true,
            }) || '';
          const effectiveDomain = test?.shop_domain || getPreviewDomain() || getShopDomain() || '';
          if (!isShopifyStoreDomain(effectiveDomain)) {
            return directPreviewUrl;
          }
          return (
            buildPreviewDocumentUrl({
              apiBaseUrl: getApiBaseUrl(),
              previewUrl: directPreviewUrl,
              visualEditor: true,
            }) || directPreviewUrl
          );
        })()
      : '';
  const visualPickerUrl = previewIframeSrc
    ? (() => {
        try {
          const url = new URL(
            previewIframeSrc,
            typeof window !== 'undefined' && window.location?.origin
              ? window.location.origin
              : 'https://preview.invalid'
          );
          url.searchParams.set('ab_visual_editor', '1');
          url.searchParams.set('ab_visual_picker', '1');
          return url.toString();
        } catch {
          return previewIframeSrc.includes('?')
            ? `${previewIframeSrc}&ab_visual_editor=1&ab_visual_picker=1`
            : `${previewIframeSrc}?ab_visual_editor=1&ab_visual_picker=1`;
        }
      })()
    : '';

  useEffect(() => {
    if (!previewIframeSrc) {
      setPreviewLoadState(null);
      return;
    }
    setPreviewLoadState('loading');
  }, [previewIframeSrc]);

  useEffect(() => {
    if (previewLoadState !== 'loading') return;
    const t = setTimeout(() => {
      setPreviewLoadState(prev => (prev === 'loading' ? 'error' : prev));
    }, 3000);
    return () => clearTimeout(t);
  }, [previewLoadState]);

  useEffect(() => {
    function handleMessage(event) {
      try {
        if (
          event.data?.type === 'ripx-visual-editor-ready' ||
          event.data?.type === 'ripx-visual-picker-ready'
        ) {
          setPreviewLoadState('loaded');
          if (event.data.type === 'ripx-visual-picker-ready') {
            setToast({ message: 'Visual picker ready', type: 'success' });
          }
          return;
        }
        if (event.data?.type === 'ripx-preview-error') {
          setPreviewLoadState('error');
          return;
        }
        if (
          event.data?.type === 'ripx-visual-selector' &&
          typeof event.data.selector === 'string'
        ) {
          const sel = event.data.selector.trim();
          if (sel && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(sel).then(
              () => setToast({ message: `Selector copied: ${sel}`, type: 'success' }),
              () => setToast({ message: `Selector: ${sel}`, type: 'info' })
            );
          } else {
            setToast({ message: `Selector: ${sel}`, type: 'info' });
          }
        }
      } catch (_) {
        // Ignore malformed or cross-origin messages
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (loading || !test) {
    return (
      <PageShell>
        <Page title="Editor">
          <Text as="p" color="subdued">
            {loading ? 'Loading test...' : 'Test not found.'}
          </Text>
        </Page>
      </PageShell>
    );
  }

  const tabs = variants.map((v, i) => ({
    id: String(i),
    content: v.name || `Variant ${i + 1}`,
  }));

  return (
    <PageShell>
      <Page
        title="Visual & Code Editor"
        backAction={{
          content: 'Test',
          onAction: () => navigate(routes.testDetail(id)),
          icon: ArrowLeftIcon,
        }}
      >
        <BlockStack gap="400">
          <Banner tone="info">
            Edit CSS and JavaScript per variant. Changes apply on the storefront when the test runs.
            Enter a preview URL below to see the target page in the iframe (optional). Some sites
            block embedding; you can still edit and save code.
          </Banner>

          <div className={styles.editorLayout}>
            <Layout>
              <Layout.Section>
                <Card className={styles.previewCard}>
                  <div className={styles.previewCardAccent} aria-hidden />
                  <BlockStack gap="300">
                    <TextField
                      label="Preview URL"
                      value={previewUrl}
                      onChange={setPreviewUrl}
                      placeholder={
                        effectiveBaseUrl || 'https://your-site.com/ or full URL to preview'
                      }
                      autoComplete="url"
                      helpText="Base URL of the page to preview. Leave empty to use the test’s default. Preview shows the selected variant’s saved code; save to see changes."
                    />
                    <Box
                      paddingBlockStart="200"
                      minHeight="420px"
                      background="bg-surface-secondary"
                      borderRadius="200"
                      className={styles.previewBox}
                    >
                      {previewIframeSrc ? (
                        <>
                          <div className={styles.previewToolbar}>
                            {/* The picker tab needs window.opener so it can post selected selectors back. */}
                            {/* eslint-disable-next-line react/jsx-no-target-blank */}
                            <a
                              href={visualPickerUrl || previewIframeSrc}
                              target="_blank"
                              rel="opener"
                              className={styles.previewOpenEditorBtn}
                              aria-label="Open visual editor on your page"
                            >
                              Open visual editor
                            </a>
                            <span className={styles.previewToolbarHint}>
                              Opens your page in a new tab. Click any element to select it—selector
                              copies to clipboard.
                            </span>
                            <button
                              type="button"
                              className={styles.previewCopyLink}
                              onClick={() => {
                                try {
                                  navigator.clipboard.writeText(previewIframeSrc).then(
                                    () => setToast({ message: 'Link copied', type: 'success' }),
                                    () => setToast({ message: 'Could not copy', type: 'critical' })
                                  );
                                } catch (_) {
                                  setToast({ message: 'Could not copy', type: 'critical' });
                                }
                              }}
                            >
                              Copy link
                            </button>
                          </div>
                          <iframe
                            key={`preview-${previewRefreshKey}-${safeIndex}`}
                            title={`Preview: ${currentVariant?.name || `Variant ${safeIndex + 1}`}`}
                            src={previewIframeSrc}
                            className={styles.previewIframe}
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            onLoad={handlePreviewLoad}
                            onError={handlePreviewError}
                          />
                          {previewLoadState === 'loaded' && (
                            <div className={styles.previewBadge}>
                              <Text as="span" variant="bodySm" tone="success">
                                {currentVariant?.name || `Variant ${safeIndex + 1}`} — preview
                                loaded
                              </Text>
                            </div>
                          )}
                          {previewLoadState === 'error' && (
                            <div className={styles.previewError} role="alert">
                              <Text as="p" tone="subdued" variant="bodySm">
                                This page can&apos;t be embedded. Use{' '}
                                <strong>Open visual editor</strong> above to edit on your page in a
                                new tab.
                              </Text>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className={styles.previewPlaceholder}>
                          <Text as="p" color="subdued">
                            {effectiveBaseUrl
                              ? 'Select a variant and ensure the storefront loads the RipX script to see preview.'
                              : 'Enter a preview URL above or use a test that has a store/shop domain. The page must load the RipX script.'}
                          </Text>
                          <Text as="p" variant="bodySm" color="subdued">
                            Preview shows the selected variant’s saved CSS/JS. Save your edits to
                            update the preview.
                          </Text>
                        </div>
                      )}
                    </Box>
                  </BlockStack>
                </Card>
              </Layout.Section>
              <Layout.Section variant="oneThird">
                <Card className={styles.codeCard}>
                  <div className={styles.codeCardAccent} aria-hidden />
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd" className={styles.codeCardTitle}>
                      Variant code
                    </Text>
                    <Tabs tabs={tabs} selected={safeIndex} onSelect={handleTabSelect}>
                      {currentVariant && (
                        <BlockStack gap="300">
                          <TextField
                            label="CSS"
                            value={customCssByVariant[safeIndex] ?? ''}
                            onChange={v => updateVariantCode(safeIndex, 'customCss', v)}
                            multiline={8}
                            placeholder="/* Custom CSS for this variant */"
                            autoComplete="off"
                            className={styles.codeField}
                          />
                          <TextField
                            label="JavaScript"
                            value={customJsByVariant[safeIndex] ?? ''}
                            onChange={v => updateVariantCode(safeIndex, 'customJs', v)}
                            multiline={8}
                            placeholder="// Custom JS for this variant"
                            autoComplete="off"
                            className={styles.codeField}
                          />
                          <InlineStack align="end" blockAlign="center">
                            <Button variant="primary" onClick={handleSave} loading={saving}>
                              Save code
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      )}
                    </Tabs>
                  </BlockStack>
                </Card>
              </Layout.Section>
            </Layout>
          </div>
        </BlockStack>

        {toast.message && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast({ message: null, type: 'success' })}
          />
        )}
      </Page>
    </PageShell>
  );
}
