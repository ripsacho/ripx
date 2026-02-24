/**
 * Test Creator (wrapper for shared wizard)
 * UI matches Settings/Profile for consistency.
 */
import React from 'react';
import { Page } from '@shopify/polaris';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ProductIcon } from '@shopify/polaris-icons';
import { useQueryClient } from '@tanstack/react-query';
import { PageShell } from '../Shared';
import { apiPost, isStandaloneMode, unwrapData } from '../../services';
import { useInvalidateTests } from '../../hooks';
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

function TestCreator() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalidateTests = useInvalidateTests();
  const [searchParams] = useSearchParams();
  const rawTemplate = searchParams.get('type');
  const validSet = isStandaloneMode() ? STANDALONE_TEMPLATES : SHOPIFY_TEMPLATES;
  const templateType = rawTemplate && validSet.has(rawTemplate) ? rawTemplate : null;
  const initialTemplateForWizard =
    isStandaloneMode() && templateType && !STANDALONE_TEST_TYPE_IDS.includes(templateType)
      ? null
      : templateType;
  const testName = searchParams.get('name') || '';
  const testDescription = searchParams.get('description') || '';

  const initialData = {
    name: testName,
    description: testDescription,
  };

  const handleSubmit = async payload => {
    try {
      const response = await apiPost('/tests', payload);
      const testData = unwrapData(response)?.test ?? unwrapData(response);
      if (testData?.id) {
        // Pre-populate cache so TestDetail shows correct data immediately (avoids stale variant count)
        queryClient.setQueryData(['tests', testData.id], testData);
        invalidateTests();
        navigate(`/tests/${testData.id}`, { state: { createdTest: testData } });
      } else {
        throw new Error('Invalid response: test not returned');
      }
    } catch (err) {
      const details = err?.response?.data?.details;
      const message =
        Array.isArray(details) && details.length > 0
          ? details.join(' ')
          : err?.response?.data?.error || err?.message || 'Failed to create test';
      throw new Error(message);
    }
  };

  return (
    <PageShell className={`${styles.createPage} wizard-page`}>
      <Page title="" subtitle="">
        <div className={styles.createLayout}>
          <div className={styles.createHero}>
            <div className={styles.createHeroTop}>
              <div className={styles.createHeroBadge}>Step 1 of 5</div>
              <div className={styles.createHeroProgress} aria-hidden>
                {[1, 2, 3, 4, 5].map(i => (
                  <span
                    key={i}
                    className={`${styles.createHeroDot} ${i === 1 ? styles.createHeroDotActive : ''}`}
                  />
                ))}
              </div>
            </div>
            <div className={styles.createHeroMain}>
              <div className={styles.createHeroIcon}>
                <ProductIcon />
              </div>
              <div className={styles.createHeroText}>
                <h1 className={styles.createHeroTitle}>Create New Test</h1>
                <p className={styles.createHeroSubtitle}>
                  Choose a test type, set variants, and launch — we guide you through each step
                </p>
              </div>
            </div>
          </div>
          <div className={styles.createBody}>
            <TestWizard
              mode="create"
              showTemplateStep
              initialData={initialData}
              initialTemplate={initialTemplateForWizard}
              initialStep={initialTemplateForWizard ? 2 : 1}
              submitLabel="Create Test"
              onSubmit={handleSubmit}
              onCancel={() => navigate('/tests')}
            />
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default TestCreator;
