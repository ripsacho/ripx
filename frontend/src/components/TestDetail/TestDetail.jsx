/**
 * Test Detail (shared wizard edit view)
 */
import React, { useState, useCallback, useEffect } from 'react';
import { Page, Layout, Modal, Text, Icon, BlockStack, Checkbox } from '@shopify/polaris';
import {
  ChartLineIcon,
  DeleteIcon,
  DuplicateIcon,
  ExportIcon,
  LinkIcon,
  PlayIcon,
  StopCircleIcon,
  TargetIcon,
  ChartVerticalFilledIcon,
  XCircleIcon,
} from '@shopify/polaris-icons';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import Toast from '../Toast/Toast';
import PartyPop from '../PartyPop/PartyPop';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { apiPost, apiPut, unwrapData, getShopDomain } from '../../services';
import TestWizard from '../TestWizard/TestWizard';
import { PageShell } from '../Shared';
import {
  useTest,
  useStartTest,
  useStopTest,
  useDeleteTest,
  useInvalidateTests,
  usePersonalizeTest,
  useRolloutTest,
  useDisablePersonalization,
  useAppRoutes,
  testsListQueryKey,
  testDetailQueryKey,
} from '../../hooks';
import { useQueryClient } from '@tanstack/react-query';
import { getTestTypeDisplay, getVariantCount } from '../../utils/testType';
import {
  consumeFirstStartUltraCelebrationFlag,
  getCelebrationAnimationPreference,
  getCelebrationColorThemePreference,
  getCelebrationStylePreference,
} from '../../utils/preferences';
import styles from './TestDetail.module.css';

function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const routes = useAppRoutes();
  const [actionLoading, setActionLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [startCelebrationMode, setStartCelebrationMode] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [stopExpanded, setStopExpanded] = useState(false);
  const [rolloutConfigExpanded, setRolloutConfigExpanded] = useState(false);
  const [rolloutInitialPercent, setRolloutInitialPercent] = useState('25');
  const [rolloutDuration, setRolloutDuration] = useState(7);
  const [pageTitle, setPageTitle] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [preLaunchOpen, setPreLaunchOpen] = useState(false);
  const [preLaunchChecked, setPreLaunchChecked] = useState({
    hypothesis: false,
    goal: false,
    audience: false,
    tracking: false,
    staging: false,
  });

  const queryClient = useQueryClient();
  const invalidateTests = useInvalidateTests();
  const createdTest = location.state?.createdTest;
  const listTest = location.state?.listTest;
  const placeholderTest =
    createdTest?.id === id ? createdTest : listTest?.id === id ? listTest : undefined;
  const {
    data: test,
    isLoading: loading,
    isError,
    error,
  } = useTest(id, {
    placeholderData: placeholderTest,
  });

  // When navigating from create, list, or clone, pre-populate cache so we show correct variants immediately
  useEffect(() => {
    const shop = getShopDomain();
    const toCache = createdTest?.id === id ? createdTest : listTest?.id === id ? listTest : null;
    if (!toCache?.id) return;
    // Always set for created/cloned; for list set when we have variants (full data from GET /tests)
    const isFromCreateOrClone = toCache === createdTest;
    const isFromListWithVariants =
      toCache === listTest && Array.isArray(toCache.variants) && toCache.variants.length > 0;
    if (isFromCreateOrClone || isFromListWithVariants) {
      queryClient.setQueryData(testDetailQueryKey(shop, id), toCache);
    }
  }, [id, createdTest, listTest, queryClient]);

  useEffect(() => {
    if (!test?.id) return;
    const shop = getShopDomain();
    queryClient.setQueryData(testsListQueryKey(shop), old => {
      if (!Array.isArray(old)) return old;
      const idx = old.findIndex(t => t.id === test.id);
      if (idx < 0) return old;
      const next = [...old];
      next[idx] = test;
      return next;
    });
  }, [test, queryClient]);
  const startMutation = useStartTest();
  const stopMutation = useStopTest();
  const deleteMutation = useDeleteTest();
  const personalizeMutation = usePersonalizeTest();
  const rolloutMutation = useRolloutTest();
  const disablePersonalizationMutation = useDisablePersonalization();

  const handleTitleRender = useCallback(el => setPageTitle(el), []);
  const resolveCelebrationVariant = useCallback(preferred => {
    const userPref = getCelebrationAnimationPreference();
    if (userPref === 'off') return null;
    if (userPref === 'full' || userPref === 'subtle') return userPref;
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return 'subtle';
    }
    return preferred;
  }, []);
  const withUltraMilestone = useCallback(baseVariant => {
    if (baseVariant !== 'full') return baseVariant;
    return consumeFirstStartUltraCelebrationFlag() ? 'ultra' : baseVariant;
  }, []);

  const isStopped = test?.status === 'stopped' || test?.status === 'completed';
  const isPersonalized = test?.personalization_mode === 'personalized';
  const isRollout = test?.personalization_mode === 'rollout';
  const hasPersonalization = isPersonalized || isRollout;

  const handleStart = async () => {
    setPreLaunchOpen(false);
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await startMutation.mutateAsync(id);
      setSuccessMessage('Test started successfully.');
      setStartCelebrationMode(withUltraMilestone(resolveCelebrationVariant('full')));
    } catch (err) {
      setErrorMessage('Failed to start test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartClick = () => {
    setPreLaunchOpen(true);
  };

  const handleStop = async action => {
    setActionLoading(true);
    setErrorMessage(null);
    setStopExpanded(false);
    try {
      await stopMutation.mutateAsync(id);
      if (action === 'personalize') {
        await personalizeMutation.mutateAsync({ testId: id });
        setSuccessMessage('Test stopped. Winner applied to 100% of traffic.');
      } else if (action === 'rollout') {
        setRolloutInitialPercent('25');
        setRolloutDuration(7);
        setRolloutConfigExpanded(true);
      } else {
        setSuccessMessage('Test stopped');
      }
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to stop test'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRolloutSubmit = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    setRolloutConfigExpanded(false);
    try {
      const initialPercent = Math.min(100, Math.max(0, parseInt(rolloutInitialPercent, 10) || 25));
      const schedule = [
        { day: 0, percent: initialPercent },
        { day: rolloutDuration, percent: 100 },
      ];
      await rolloutMutation.mutateAsync({ testId: id, initialPercent, schedule });
      setSuccessMessage(
        `Rollout started at ${initialPercent}%. Will reach 100% in ${rolloutDuration} days.`
      );
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to start rollout'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handlePersonalize = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await personalizeMutation.mutateAsync({ testId: id });
      setSuccessMessage('Winner applied to 100% of traffic');
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to apply winner'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisablePersonalization = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await disablePersonalizationMutation.mutateAsync(id);
      setSuccessMessage('Personalization disabled');
    } catch (err) {
      setErrorMessage(
        err.response?.data?.details?.[0] || err.response?.data?.error || 'Failed to disable'
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      await deleteMutation.mutateAsync(id);
      navigate(routes.tests);
    } catch (err) {
      setErrorMessage('Failed to delete test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClone = async () => {
    setActionLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiPost(`/tests/${id}/clone`, {});
      const testData = unwrapData(response)?.test ?? unwrapData(response);
      if (testData?.id) {
        queryClient.setQueryData(testDetailQueryKey(getShopDomain(), testData.id), testData);
        invalidateTests();
        navigate(routes.testDetail(testData.id), { state: { createdTest: testData } });
      }
    } catch (err) {
      setErrorMessage('Failed to clone test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveCode = async codePayload => {
    const response = await apiPut(`/tests/${id}/variants/codes`, codePayload);
    const updatedTest = unwrapData(response)?.test ?? unwrapData(response);
    if (updatedTest) {
      queryClient.setQueryData(testDetailQueryKey(getShopDomain(), id), updatedTest);
    }
    invalidateTests(id);
    setSuccessMessage('Code saved successfully');
    setTimeout(() => setSuccessMessage(null), 3000);
    return updatedTest;
  };

  const handleSave = async (payload, options = {}) => {
    setSaveLoading(true);
    setErrorMessage(null);
    try {
      let response;
      if (options.useCodeEndpoint && (options.codePayload || payload?.variants)) {
        const codePayload = options.codePayload || {
          variants: payload.variants.map(variant => ({
            id: variant.id,
            name: variant.name,
            code: variant?.code ?? variant?.config?.code ?? '',
          })),
        };
        response = await apiPut(`/tests/${id}/variants/codes`, codePayload);
      } else {
        response = await apiPut(`/tests/${id}`, payload);
      }
      const updatedTest = unwrapData(response)?.test ?? unwrapData(response);
      if (updatedTest) {
        queryClient.setQueryData(testDetailQueryKey(getShopDomain(), id), updatedTest);
      }
      invalidateTests(id);
      if (!options.silent) {
        setSuccessMessage('Test updated successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } catch (err) {
      const details = err.response?.data?.details;
      const apiError = err.response?.data?.error;
      if (Array.isArray(details) && details.length > 0) {
        setErrorMessage(details.join('. '));
      } else if (apiError) {
        setErrorMessage(apiError);
      } else {
        setErrorMessage(err.message || 'Failed to update test');
      }
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <PageShell className={`${styles.detailPage} wizard-page`}>
        <Page title="Test Details">
          <LoadingSkeleton type="card" count={2} />
        </Page>
      </PageShell>
    );
  }

  const displayError =
    errorMessage ||
    (isError ? error?.response?.data?.error || error?.message || 'Failed to load test' : null);

  if (displayError && !test) {
    return (
      <PageShell
        className={`${styles.detailPage} wizard-page`}
        message={displayError}
        messageType="error"
        onCloseMessage={() => setErrorMessage(null)}
      >
        <Page title="Test Details" />
      </PageShell>
    );
  }

  if (!test) {
    return (
      <PageShell
        className={`${styles.detailPage} wizard-page`}
        message="Test not found"
        messageType="error"
        onCloseMessage={() => navigate(routes.tests)}
      >
        <Page title="Test Details" />
      </PageShell>
    );
  }

  const displayTitle = pageTitle ?? test.name ?? 'Unnamed Test';
  const testTypeLabel = getTestTypeDisplay(test).label;

  return (
    <PageShell className={`${styles.detailPage} wizard-page`}>
      <PartyPop
        active={!!startCelebrationMode}
        variant={startCelebrationMode || 'full'}
        styleMode={getCelebrationStylePreference()}
        palette={getCelebrationColorThemePreference()}
        onComplete={() => setStartCelebrationMode(null)}
      />
      <Toast
        message={displayError}
        type="error"
        onClose={() => setErrorMessage(null)}
        duration={5000}
      />
      <Toast
        message={successMessage}
        type="success"
        onClose={() => setSuccessMessage(null)}
        duration={3000}
      />
      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Delete test?"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: () => {
            setDeleteModal(false);
            handleDelete();
          },
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setDeleteModal(false),
          },
        ]}
      >
        <Modal.Section>
          <Text variant="bodyMd" as="p">
            This will permanently delete the test and its configuration.
          </Text>
        </Modal.Section>
      </Modal>

      <Modal
        open={preLaunchOpen}
        onClose={() => setPreLaunchOpen(false)}
        title="Pre-launch checklist"
        primaryAction={{
          content: 'Continue to start',
          onAction: handleStart,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setPreLaunchOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text variant="bodyMd" as="p" tone="subdued">
              Before going live, confirm the following (optional but recommended).
            </Text>
            <BlockStack gap="200">
              <Checkbox
                label="Hypothesis or goal is documented"
                checked={preLaunchChecked.hypothesis}
                onChange={v => setPreLaunchChecked(c => ({ ...c, hypothesis: v }))}
              />
              <Checkbox
                label="Primary goal and metrics are set"
                checked={preLaunchChecked.goal}
                onChange={v => setPreLaunchChecked(c => ({ ...c, goal: v }))}
              />
              <Checkbox
                label="Audience or targeting is configured"
                checked={preLaunchChecked.audience}
                onChange={v => setPreLaunchChecked(c => ({ ...c, audience: v }))}
              />
              <Checkbox
                label="Tracking and conversion events are verified"
                checked={preLaunchChecked.tracking}
                onChange={v => setPreLaunchChecked(c => ({ ...c, tracking: v }))}
              />
              <Checkbox
                label="Staging or QA run completed (e.g. force variation)"
                checked={preLaunchChecked.staging}
                onChange={v => setPreLaunchChecked(c => ({ ...c, staging: v }))}
              />
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Page title="" subtitle="">
        <div className={styles.detailLayout}>
          <div className={styles.detailHero}>
            <div className={styles.detailHeroInner}>
              <div className={styles.detailHeroContent}>
                <div className={styles.detailBreadcrumb}>
                  <button
                    type="button"
                    className={styles.detailBreadcrumbLink}
                    onClick={() => navigate(routes.tests)}
                  >
                    ← All Tests
                  </button>
                </div>
                <h1 className={styles.detailHeroTitle}>{displayTitle}</h1>
                <div className={styles.detailHeroPillsRow}>
                  <span
                    className={`${styles.detailStatusPill} ${
                      test.status === 'running'
                        ? styles.detailStatusRunning
                        : test.status === 'draft'
                          ? styles.detailStatusDraft
                          : styles.detailStatusStopped
                    }`}
                  >
                    {test.status === 'running'
                      ? 'Running'
                      : test.status === 'draft'
                        ? 'Draft'
                        : 'Stopped'}
                  </span>
                  <span className={styles.detailHeroMetaChip}>{testTypeLabel}</span>
                  {test.variants?.length > 0 && (
                    <span className={styles.detailHeroMetaChip}>
                      {getVariantCount(test)} variants
                    </span>
                  )}
                </div>
              </div>
              {!stopExpanded && !rolloutConfigExpanded && (
                <div className={styles.detailHeroActions}>
                  <div className={styles.detailHeroActionsStrip}>
                    <div
                      className={styles.detailHeroActionsRow1}
                      role="group"
                      aria-label="Test control"
                    >
                      <span className={styles.detailHeroRowLabel}>Control</span>
                      {test.status === 'running' ? (
                        <button
                          type="button"
                          className={`${styles.detailPrimaryBtn} ${styles.detailPrimaryBtnStop}`}
                          onClick={() => setStopExpanded(true)}
                          disabled={actionLoading}
                        >
                          <Icon source={StopCircleIcon} />
                          Stop Test
                        </button>
                      ) : test.status !== 'running' ? (
                        <button
                          type="button"
                          className={`${styles.detailPrimaryBtn} ${styles.detailPrimaryBtnStart}`}
                          onClick={handleStartClick}
                          disabled={actionLoading}
                        >
                          <Icon source={PlayIcon} />
                          Start Test
                        </button>
                      ) : null}
                      {hasPersonalization && !rolloutConfigExpanded && (
                        <>
                          <div className={styles.detailPersonalizationBadge}>
                            {isPersonalized ? (
                              <span className={styles.badgePersonalized}>
                                <Icon source={TargetIcon} /> Winner at 100%
                              </span>
                            ) : (
                              <span className={styles.badgeRollout}>
                                <Icon source={ChartVerticalFilledIcon} /> Rollout{' '}
                                {test?.effective_rollout_percent ?? test?.rollout_percent ?? 0}%
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className={styles.detailSecondaryBtn}
                            onClick={handleDisablePersonalization}
                            disabled={actionLoading}
                          >
                            <Icon source={XCircleIcon} />
                            Disable
                          </button>
                        </>
                      )}
                      {isStopped && !hasPersonalization && !rolloutConfigExpanded && (
                        <>
                          <button
                            type="button"
                            className={`${styles.detailSecondaryBtn} ${styles.detailSecondaryBtnPrimary}`}
                            onClick={handlePersonalize}
                            disabled={actionLoading}
                          >
                            <Icon source={TargetIcon} />
                            Personalize
                          </button>
                          <button
                            type="button"
                            className={styles.detailSecondaryBtn}
                            onClick={() => {
                              setRolloutInitialPercent('25');
                              setRolloutDuration(7);
                              setRolloutConfigExpanded(true);
                            }}
                            disabled={actionLoading}
                          >
                            <Icon source={ChartVerticalFilledIcon} />
                            Rollout
                          </button>
                        </>
                      )}
                    </div>
                    <div
                      className={styles.detailHeroActionsRow2}
                      role="group"
                      aria-label="Quick actions"
                    >
                      <span className={styles.detailHeroRowLabel}>Actions</span>
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={() => navigate(routes.testAnalytics(id))}
                      >
                        <Icon source={ChartLineIcon} />
                        View Analytics
                      </button>
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={() => navigate(routes.testExport(id))}
                      >
                        <Icon source={ExportIcon} />
                        Export
                      </button>
                      {test.type === 'offer' && (
                        <button
                          type="button"
                          className={styles.detailSecondaryBtn}
                          onClick={() => navigate(routes.testPromoLinks(id))}
                        >
                          <Icon source={LinkIcon} />
                          Promo Links
                        </button>
                      )}
                      <span className={styles.detailHeroRowDivider} aria-hidden />
                      <button
                        type="button"
                        className={styles.detailSecondaryBtn}
                        onClick={handleClone}
                        disabled={actionLoading}
                      >
                        <Icon source={DuplicateIcon} />
                        Clone
                      </button>
                      <button
                        type="button"
                        className={`${styles.detailSecondaryBtn} ${styles.detailSecondaryBtnDestructive}`}
                        onClick={() => setDeleteModal(true)}
                        disabled={actionLoading}
                      >
                        <Icon source={DeleteIcon} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {stopExpanded && (
                <div className={styles.stopInline}>
                  <div className={styles.stopInlineHeader}>
                    <span className={styles.stopInlineTitle}>What happens next?</span>
                    <button
                      type="button"
                      className={styles.stopInlineCancel}
                      onClick={() => setStopExpanded(false)}
                      aria-label="Cancel"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.stopInlineCards}>
                    <button
                      type="button"
                      className={`${styles.stopInlineCard} ${styles.stopInlineCardPersonalize}`}
                      onClick={() => handleStop('personalize')}
                      disabled={actionLoading}
                    >
                      <Icon source={TargetIcon} />
                      <span className={styles.stopInlineCardLabel}>Apply winner</span>
                      <span className={styles.stopInlineCardBadge}>Recommended</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.stopInlineCard} ${styles.stopInlineCardRollout}`}
                      onClick={() => handleStop('rollout')}
                      disabled={actionLoading}
                    >
                      <Icon source={ChartVerticalFilledIcon} />
                      <span className={styles.stopInlineCardLabel}>Gradual rollout</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.stopInlineCard} ${styles.stopInlineCardStop}`}
                      onClick={() => handleStop()}
                      disabled={actionLoading}
                    >
                      <Icon source={StopCircleIcon} />
                      <span className={styles.stopInlineCardLabel}>Just stop</span>
                    </button>
                  </div>
                </div>
              )}
              {rolloutConfigExpanded && (
                <div className={styles.rolloutInline}>
                  <div className={styles.rolloutInlineHeader}>
                    <span className={styles.rolloutInlineTitle}>Configure rollout</span>
                    <button
                      type="button"
                      className={styles.rolloutInlineCancel}
                      onClick={() => setRolloutConfigExpanded(false)}
                      aria-label="Cancel"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.rolloutInlineBody}>
                    <div className={styles.rolloutInlineRow}>
                      <span className={styles.rolloutInlineLabel}>Start at</span>
                      <div className={styles.rolloutInlinePresets}>
                        {[10, 25, 50, 75, 100].map(p => (
                          <button
                            key={p}
                            type="button"
                            className={`${styles.rolloutInlinePreset} ${Number(rolloutInitialPercent) === p ? styles.rolloutInlinePresetActive : ''}`}
                            onClick={() => setRolloutInitialPercent(String(p))}
                          >
                            {p}%
                          </button>
                        ))}
                      </div>
                      <input
                        type="range"
                        className={styles.rolloutInlineSlider}
                        min="5"
                        max="100"
                        step="5"
                        value={rolloutInitialPercent}
                        onChange={e => setRolloutInitialPercent(e.target.value)}
                      />
                      <span className={styles.rolloutInlineValue}>{rolloutInitialPercent}%</span>
                    </div>
                    <div className={styles.rolloutInlineRow}>
                      <span className={styles.rolloutInlineLabel}>Duration</span>
                      {[
                        { days: 3, label: '3d' },
                        { days: 7, label: '7d' },
                        { days: 14, label: '14d' },
                      ].map(({ days, label }) => (
                        <button
                          key={days}
                          type="button"
                          className={`${styles.rolloutInlineDuration} ${rolloutDuration === days ? styles.rolloutInlineDurationActive : ''}`}
                          onClick={() => setRolloutDuration(days)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className={styles.rolloutInlinePreview}>
                      <span>
                        {rolloutInitialPercent}% → 100% in {rolloutDuration} days
                      </span>
                      <div className={styles.rolloutInlineChart}>
                        <div
                          className={styles.rolloutInlineBar}
                          style={{
                            width: `${rolloutInitialPercent}%`,
                            background:
                              'linear-gradient(90deg, var(--futuristic-cyan), var(--futuristic-violet))',
                          }}
                        />
                      </div>
                    </div>
                    <div className={styles.rolloutInlineActions}>
                      <button
                        type="button"
                        className={styles.rolloutInlineBtnCancel}
                        onClick={() => setRolloutConfigExpanded(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.rolloutInlineBtnSubmit}
                        onClick={handleRolloutSubmit}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <span className={styles.rolloutSubmitSpinner} />
                        ) : (
                          'Start rollout'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Layout>
            <Layout.Section>
              <TestWizard
                key={`test-wizard-${test?.id}-${getVariantCount(test)}`}
                mode="edit"
                showTemplateStep={false}
                initialData={test}
                submitLabel="Save Changes"
                onSubmit={handleSave}
                onSaveCode={handleSaveCode}
                onCancel={() => navigate(routes.tests)}
                submitLoading={saveLoading}
                onTitleRender={handleTitleRender}
              />
            </Layout.Section>
          </Layout>
        </div>
      </Page>
    </PageShell>
  );
}

export default TestDetail;
