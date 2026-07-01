/**
 * Test Creator (wrapper for shared wizard)
 * UI matches Settings/Profile for consistency.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Page } from '@shopify/polaris';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { ProductIcon } from '@shopify/polaris-icons';
import { useQueryClient } from '@tanstack/react-query';
import { PageShell } from '../Shared';
import { apiPost, apiPut, isStandaloneMode, unwrapData } from '../../services';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import { useInvalidateTests, useAppRoutes, useTest, testDetailQueryKey } from '../../hooks';
import { getShopDomain } from '../../services';
import { STANDALONE_TEST_TYPE_IDS } from '../../constants';
import TestWizard from '../TestWizard/TestWizard';
import styles from './TestCreator.module.css';

const SHOPIFY_TEMPLATES = new Set([
  'price',
  'pricing',
  'content',
  'onsite-edit',
  'split-url',
  'template',
  'theme',
  'shipping',
  'offer',
  'checkout',
  'combination',
]);
const STANDALONE_TEMPLATES = new Set(['content', 'onsite-edit', 'split-url']);
const CREATE_WIZARD_TOTAL_STEPS = 6;
const UNSAVED_CREATE_TEST_MESSAGE =
  'You have unsaved test changes. Leave this page and lose those changes?';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getApiErrorMessage(err, fallback) {
  const details = err?.response?.data?.details;
  if (Array.isArray(details) && details.length > 0) {
    return details.join(' ');
  }
  return err?.response?.data?.error || err?.message || fallback;
}

function TestCreator() {
  const navigate = useNavigate();
  const { domain: routeDomain } = useParams();
  const queryClient = useQueryClient();
  const invalidateTests = useInvalidateTests();
  const routes = useAppRoutes();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawDraftIdFromUrl = String(
    searchParams.get('draftId') || searchParams.get('draft_id') || ''
  )
    .trim()
    .toLowerCase();
  const draftIdFromUrl = UUID_PATTERN.test(rawDraftIdFromUrl) ? rawDraftIdFromUrl : '';
  const [draftTestId, setDraftTestId] = useState(draftIdFromUrl || null);
  const [draftSaveLoading, setDraftSaveLoading] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { data: loadedDraft } = useTest(draftIdFromUrl, {
    enabled: Boolean(draftIdFromUrl),
  });
  const rawTemplate = String(searchParams.get('type') || '')
    .trim()
    .toLowerCase();
  const rawTestTypeId = String(
    searchParams.get('testTypeId') || searchParams.get('test_type_id') || ''
  )
    .trim()
    .toLowerCase();
  const isShopifyFromRoute = routeDomain && isShopifyStoreDomain(routeDomain);
  const standaloneMode = !isShopifyFromRoute && isStandaloneMode();
  const validSet = standaloneMode ? STANDALONE_TEMPLATES : SHOPIFY_TEMPLATES;
  const requestedTemplate =
    rawTestTypeId && validSet.has(rawTestTypeId)
      ? rawTestTypeId
      : rawTemplate && validSet.has(rawTemplate)
        ? rawTemplate
        : null;
  const initialTemplateForWizard =
    standaloneMode && requestedTemplate && !STANDALONE_TEST_TYPE_IDS.includes(requestedTemplate)
      ? null
      : requestedTemplate;
  const testName = searchParams.get('name') || '';
  const testDescription = searchParams.get('description') || '';
  const canUseLoadedDraft = loadedDraft?.id && loadedDraft.status === 'draft';
  const loadedDraftTemplate =
    canUseLoadedDraft && loadedDraft?.goal?.template_key
      ? String(loadedDraft.goal.template_key).trim().toLowerCase()
      : canUseLoadedDraft && loadedDraft?.type
        ? String(loadedDraft.type).trim().toLowerCase()
        : null;
  const resolvedInitialTemplate =
    loadedDraftTemplate && validSet.has(loadedDraftTemplate)
      ? loadedDraftTemplate
      : initialTemplateForWizard;

  const initialData = useMemo(
    () =>
      canUseLoadedDraft
        ? loadedDraft
        : {
            name: testName,
            description: testDescription,
          },
    [canUseLoadedDraft, loadedDraft, testName, testDescription]
  );

  useEffect(() => {
    if (draftIdFromUrl) {
      setDraftTestId(draftIdFromUrl);
    }
  }, [draftIdFromUrl]);

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
      if (window.confirm(UNSAVED_CREATE_TEST_MESSAGE)) {
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
      { ...(window.history.state || {}), ripxCreateTestGuard: true },
      '',
      window.location.href
    );

    const handlePopState = () => {
      if (!window.confirm(UNSAVED_CREATE_TEST_MESSAGE)) {
        window.history.pushState(
          { ...(window.history.state || {}), ripxCreateTestGuard: true },
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

  const cacheDraftTest = useCallback(
    testData => {
      if (!testData?.id) return;
      queryClient.setQueryData(testDetailQueryKey(getShopDomain(), testData.id), testData);
      invalidateTests(testData.id);
    },
    [invalidateTests, queryClient]
  );

  const handleSaveDraft = async payload => {
    setDraftSaveLoading(true);
    try {
      const response = draftTestId
        ? await apiPut(`/tests/${draftTestId}/draft`, payload, { timeout: 120000 })
        : await apiPost('/tests/drafts', payload, { timeout: 120000 });
      const testData = unwrapData(response)?.test ?? unwrapData(response);
      if (!testData?.id) {
        throw new Error('Invalid response: draft not returned');
      }
      setDraftTestId(testData.id);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set('draftId', testData.id);
      nextParams.delete('draft_id');
      setSearchParams(nextParams, { replace: true });
      setHasUnsavedChanges(false);
      cacheDraftTest(testData);
      return testData;
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Failed to save draft'));
    } finally {
      setDraftSaveLoading(false);
    }
  };

  const handleSubmit = async payload => {
    try {
      const response = draftTestId
        ? await apiPut(`/tests/${draftTestId}`, payload, { timeout: 120000 })
        : await apiPost('/tests', payload, { timeout: 120000 });
      const testData = unwrapData(response)?.test ?? unwrapData(response);
      if (testData?.id) {
        // Pre-populate cache so TestDetail shows correct data immediately (avoids stale variant count)
        queryClient.setQueryData(testDetailQueryKey(getShopDomain(), testData.id), testData);
        invalidateTests();
        setHasUnsavedChanges(false);
        navigate(routes.testDetail(testData.id), { state: { createdTest: testData } });
      } else {
        throw new Error('Invalid response: test not returned');
      }
    } catch (err) {
      throw new Error(getApiErrorMessage(err, 'Failed to create test'));
    }
  };

  const handleCancel = () => {
    if (hasUnsavedChanges && !window.confirm(UNSAVED_CREATE_TEST_MESSAGE)) {
      return;
    }
    setHasUnsavedChanges(false);
    navigate(routes.tests);
  };

  return (
    <PageShell className={`${styles.createPage} wizard-page`}>
      <Page title="" subtitle="">
        <div className={styles.createLayout}>
          <div className={styles.createHero}>
            <div className={styles.createHeroTop}>
              <div className={styles.createHeroBadge}>Step 1 of {CREATE_WIZARD_TOTAL_STEPS}</div>
              <div className={styles.createHeroProgress} aria-hidden>
                {Array.from({ length: CREATE_WIZARD_TOTAL_STEPS }, (_, index) => index + 1).map(
                  i => (
                    <span
                      key={i}
                      className={`${styles.createHeroDot} ${i === 1 ? styles.createHeroDotActive : ''}`}
                    />
                  )
                )}
              </div>
            </div>
            <div className={styles.createHeroMain}>
              <div className={styles.createHeroIcon}>
                <ProductIcon />
              </div>
              <div className={styles.createHeroText}>
                <h1 className={styles.createHeroTitle}>Create New Test</h1>
                <p className={styles.createHeroSubtitle}>
                  Choose a test type, configure variants, then save it for launch readiness review
                </p>
              </div>
            </div>
          </div>
          <div className={styles.createBody}>
            <TestWizard
              mode="create"
              showTemplateStep
              initialData={initialData}
              initialTemplate={resolvedInitialTemplate}
              initialStep={resolvedInitialTemplate ? 2 : 1}
              submitLabel="Save Test"
              onSubmit={handleSubmit}
              onSaveDraft={handleSaveDraft}
              draftSaveLoading={draftSaveLoading}
              onDirtyChange={setHasUnsavedChanges}
              onCancel={handleCancel}
            />
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default TestCreator;
