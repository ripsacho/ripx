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
import { apiGet, apiPut, unwrapData } from '../../services';
import { ROUTES } from '../../constants';
import Toast from '../Toast/Toast';
import styles from './TestEditor.module.css';

export default function TestEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoadState, setPreviewLoadState] = useState(null); // 'loading' | 'loaded' | 'error'
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [customCssByVariant, setCustomCssByVariant] = useState({});
  const [customJsByVariant, setCustomJsByVariant] = useState({});
  const [toast, setToast] = useState({ message: null, type: 'success' });

  useEffect(() => {
    if (!id || id === 'undefined') {
      navigate(ROUTES.TESTS);
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
  }, [id, navigate]);

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

  useEffect(() => {
    if (!previewUrl) {
      setPreviewLoadState(null);
      return;
    }
    setPreviewLoadState('loading');
  }, [previewUrl]);

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

  const currentVariant = variants[safeIndex];
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
          onAction: () => navigate(ROUTES.TEST_DETAIL(id)),
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
                      placeholder="https://your-store.com/products/..."
                      autoComplete="url"
                      helpText="Storefront URL to preview. Leave empty to only edit code."
                    />
                    <Box
                      paddingBlockStart="200"
                      minHeight="420px"
                      background="bg-surface-secondary"
                      borderRadius="200"
                      className={styles.previewBox}
                    >
                      {previewUrl ? (
                        <>
                          <iframe
                            title="Preview"
                            src={previewUrl}
                            className={styles.previewIframe}
                            sandbox="allow-scripts allow-same-origin"
                            onLoad={handlePreviewLoad}
                            onError={handlePreviewError}
                          />
                          {previewLoadState === 'loaded' && (
                            <div className={styles.previewBadge}>
                              <Text as="span" variant="bodySm" tone="success">
                                Preview loaded
                              </Text>
                            </div>
                          )}
                          {previewLoadState === 'error' && (
                            <div className={styles.previewError}>
                              <Text as="p" tone="critical">
                                This page cannot be embedded (blocked by the site). You can still
                                edit and save code.
                              </Text>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className={styles.previewPlaceholder}>
                          <Text as="p" color="subdued">
                            Enter a preview URL above to load the target page.
                          </Text>
                          <Text as="p" variant="bodySm" color="subdued">
                            Or edit CSS/JS in the panel and save — changes apply on the storefront.
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
