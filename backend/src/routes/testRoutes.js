/**
 * Test Routes
 *
 * API endpoints for managing AB tests
 */

const express = require('express');
const router = express.Router();
const validators = require('../utils/validators');
const abTestEngine = require('../services/abTestEngine');

/** Validate :id param is a valid UUID */
const validateTestId = (req, res, next) => {
  const id = req.params?.id;
  if (!id || !validators.isValidUUID(id)) {
    return res.status(400).json({ success: false, error: 'Invalid test ID format' });
  }
  next();
};
const testHealthService = require('../services/testHealthService');
const {
  createTest,
  getTestById,
  getTestsByShop,
  updateTest,
  deleteTest,
} = require('../models/test');
const { sendSuccess, sendValidationError, sendNotFound } = require('../utils/response');
const { HTTP_STATUS, SUCCESS_MESSAGES } = require('../constants');
const { normalizeSegments } = require('../utils/segments');
const { enrichGoalWithTemplateKey } = require('../utils/testType');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');
const { scheduleTestJobs } = require('../jobs/scheduledTestsProcessor');
const auditLogService = require('../services/auditLogService');
const conflictDetectionService = require('../services/conflictDetectionService');
const personalizationService = require('../services/personalizationService');
const { getTestAnalytics } = require('../models/analytics');
const logger = require('../utils/logger');

function normalizeHoldout(value) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return { error: 'Holdout percent must be a number' };
  }
  return { value: parsed };
}

/** Ensure test has variant_count for consistent frontend display */
function ensureVariantCount(test) {
  if (!test) {return test;}
  const variants = test.variants || [];
  test.variant_count = Array.isArray(variants) ? variants.filter(v => v !== null && v !== undefined).length : 0;
  return test;
}

/**
 * POST /api/tests
 * Create a new AB test
 */
router.post('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const testData = {
      ...req.body,
      shop_domain: shopDomain,
    };

    if (testData.scheduled_start_at === '') {
      testData.scheduled_start_at = null;
    }
    if (testData.scheduled_stop_at === '') {
      testData.scheduled_stop_at = null;
    }

    if (testData.description !== undefined && testData.description !== null) {
      if (typeof testData.description !== 'string') {
        return sendValidationError(res, ['Description must be a string']);
      }
      const trimmedDescription = testData.description.trim();
      testData.description = trimmedDescription.length > 0 ? trimmedDescription : null;
    }

    if (testData.segments !== undefined) {
      testData.segments = normalizeSegments(testData.segments);
    }

    if (testData.holdout_percent !== undefined) {
      const holdoutResult = normalizeHoldout(testData.holdout_percent);
      if (holdoutResult.error) {
        return sendValidationError(res, [holdoutResult.error]);
      }
      testData.holdout_percent = holdoutResult.value;
    }

    logger.info('Creating test', {
      shopDomain,
      type: testData.type,
      name: testData.name,
      hasVariants: !!testData.variants,
      variantCount: testData.variants?.length || 0,
    });

    // Validate test configuration
    const validation = abTestEngine.validateTest(testData);

    if (!validation.isValid) {
      logger.warn('Test validation failed', {
        errors: validation.errors,
        testData: { name: testData.name, type: testData.type },
      });
      return sendValidationError(res, validation.errors);
    }

    const conflicts = await conflictDetectionService.findConflicts(shopDomain, null, testData);
    if (conflicts.length > 0) {
      logger.warn('Potential test conflict', {
        newTest: testData.name,
        conflicting: conflicts.map(c => c.name),
      });
    }

    // Create test
    const test = await createTest(testData);
    ensureVariantCount(test);

    scheduleTestJobs(test);
    auditLogService.log(shopDomain, { entityType: 'test', entityId: test.id, action: 'create' });

    logger.info('Test created', { testId: test.id, shopDomain, type: test.type });

    const payload = { test };
    if (conflicts.length > 0) {
      payload.conflicts = conflicts.map(c => ({ id: c.id, name: c.name }));
      payload.warning = 'Overlapping tests may affect results';
    }
    return sendSuccess(res, HTTP_STATUS.CREATED, payload, SUCCESS_MESSAGES.TEST_CREATED);
  } catch (error) {
    logger.error('Error creating test', {
      error: error.message,
      stack: error.stack,
      shopDomain: req.shopDomain,
      testData: {
        name: req.body?.name,
        type: req.body?.type,
        hasVariants: !!req.body?.variants,
      },
    });
    next(error);
  }
});

/**
 * GET /api/tests
 * Get all tests for a shop
 */
router.get('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const status = req.query.status || null;

    const tests = await getTestsByShop(shopDomain, status);

    // Enrich each test with variant analytics (visitors, conversions, revenue) for dashboard
    const testsWithAnalytics = await Promise.all(
      tests.map(async (test) => {
        const enriched = enrichGoalWithTemplateKey(test);
        const variants = enriched.variants || [];
        let variantsWithMetrics = variants;

        try {
          const analytics = await getTestAnalytics(test.id, shopDomain);
          if (Array.isArray(analytics) && analytics.length > 0) {
            const analyticsByVariant = new Map();
            analytics.forEach((a) => {
              const id = a.variant_id;
              const name = a.variant_name;
              if (id !== null && id !== undefined) {analyticsByVariant.set(String(id), a);}
              if (name !== null && name !== undefined) {analyticsByVariant.set(String(name), a);}
            });
            variantsWithMetrics = variants.map((v) => {
              const vId = v?.id !== null && v?.id !== undefined ? String(v.id) : null;
              const vName = v?.name !== null && v?.name !== undefined ? String(v.name) : null;
              const a = (vId && analyticsByVariant.get(vId)) || (vName && analyticsByVariant.get(vName));
              return a
                ? { ...v, visitors: a.visitors || 0, conversions: a.conversions || 0, revenue: a.revenue || 0 }
                : { ...v, visitors: 0, conversions: 0, revenue: 0 };
            });
          }
        } catch (err) {
          logger.debug('Analytics enrichment skipped for test', { testId: test.id, error: err.message });
        }

        const health = testHealthService.calculateHealthScore({ ...enriched, variants: variantsWithMetrics });
        const variantCount = Array.isArray(variantsWithMetrics) ? variantsWithMetrics.filter((v) => v !== null && v !== undefined).length : 0;
        const result = { ...enriched, variants: variantsWithMetrics, health, variant_count: variantCount };
        if (test.personalization_mode === 'rollout') {
          result.effective_rollout_percent = personalizationService.getEffectiveRolloutPercent(test);
        }
        return result;
      })
    );

    return sendSuccess(res, HTTP_STATUS.OK, {
      tests: testsWithAnalytics,
      count: testsWithAnalytics.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tests/:id
 * Get a specific test
 */
router.get('/:id', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const test = await getTestById(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    // Ensure variants and goal are properly formatted
    if (!test.variants || !Array.isArray(test.variants)) {
      test.variants = [];
    }
    if (!test.goal || typeof test.goal !== 'object') {
      test.goal = {};
    }

    // Enrich goal with template_key for display (backfill for legacy tests)
    const enriched = enrichGoalWithTemplateKey(test);
    if (enriched.goal && enriched.goal.template_key) {
      test.goal = enriched.goal;
    }

    ensureVariantCount(test);

    // Calculate health score for the test
    const health = testHealthService.calculateHealthScore(test);
    test.health = health;

    // Add effective rollout percent for rollout tests (computed from schedule)
    if (test.personalization_mode === 'rollout') {
      test.effective_rollout_percent = personalizationService.getEffectiveRolloutPercent(test);
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    return sendSuccess(res, HTTP_STATUS.OK, { test });
  } catch (error) {
    logger.error('Error fetching test', { testId: req.params?.id, shopDomain: req.shopDomain, error });
    next(error);
  }
});

/**
 * PUT /api/tests/:id/variants/codes
 * Update variant codes only (no validation of name/type/etc)
 */
router.put('/:id/variants/codes', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variants } = req.body;

    if (!variants || !Array.isArray(variants)) {
      return sendValidationError(res, ['Variants array is required']);
    }

    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    const hasCode = variants.some(v => v.code && String(v.code).trim().length > 0);
    logger.info('Saving variant codes', {
      testId: id,
      shopDomain,
      variantCount: variants.length,
      hasCode,
    });

    const updatedVariants = existingTest.variants.map((existingVariant, index) => {
      const update = variants.find((v, updateIndex) => {
        if (v.id && existingVariant.id) {
          return v.id === existingVariant.id;
        }
        if (v.name && existingVariant.name) {
          return v.name === existingVariant.name;
        }
        return updateIndex === index;
      });

      if (update && 'code' in update) {
        const codeValue =
          update.code !== undefined && update.code !== null ? String(update.code) : '';
        const nextConfig = {
          ...(existingVariant.config && typeof existingVariant.config === 'object'
            ? existingVariant.config
            : {}),
          code: codeValue,
        };
        return {
          ...existingVariant,
          code: codeValue,
          config: nextConfig,
        };
      }
      return existingVariant;
    });

    let test = await updateTest(id, shopDomain, { variants: updatedVariants });
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    test = enrichGoalWithTemplateKey(test);
    ensureVariantCount(test);

    logger.info('Variant codes updated', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Variant codes updated successfully');
  } catch (error) {
    logger.error('Error updating variant codes', { testId: req.params?.id, error: error.message });
    next(error);
  }
});

/**
 * PUT /api/tests/:id/variants/allocation
 * Update traffic allocation for variants
 */
router.put('/:id/variants/allocation', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variants } = req.body;

    if (!variants || !Array.isArray(variants)) {
      return sendValidationError(res, ['Variants array is required']);
    }

    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    const updatedVariants = existingTest.variants.map((existingVariant, index) => {
      const update = variants.find((v, updateIndex) => {
        if (v.id && existingVariant.id) {
          return v.id === existingVariant.id;
        }
        if (v.name && existingVariant.name) {
          return v.name === existingVariant.name;
        }
        return updateIndex === index;
      });

      if (update && update.allocation !== undefined) {
        return {
          ...existingVariant,
          allocation: update.allocation,
        };
      }
      return existingVariant;
    });

    const totalAllocation = updatedVariants.reduce((sum, v) => sum + (v.allocation || 0), 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      return sendValidationError(res, [
        `Total traffic allocation must equal 100%. Current: ${totalAllocation}%`,
      ]);
    }

    let test = await updateTest(id, shopDomain, { variants: updatedVariants });
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    test = enrichGoalWithTemplateKey(test);
    ensureVariantCount(test);

    logger.info('Traffic allocation updated', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Traffic allocation updated successfully');
  } catch (error) {
    logger.error('Error updating traffic allocation', {
      testId: req.params?.id,
      shopDomain: req.shopDomain,
      error: error.message,
    });
    next(error);
  }
});

/**
 * PUT /api/tests/:id
 * Update a test
 */
router.put('/:id', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const updates = req.body;

    if (updates.scheduled_start_at === '') {
      updates.scheduled_start_at = null;
    }
    if (updates.scheduled_stop_at === '') {
      updates.scheduled_stop_at = null;
    }

    if (updates.description !== undefined) {
      if (updates.description !== null && typeof updates.description !== 'string') {
        return sendValidationError(res, ['Description must be a string']);
      }
      if (typeof updates.description === 'string') {
        const trimmedDescription = updates.description.trim();
        updates.description = trimmedDescription.length > 0 ? trimmedDescription : null;
      }
    }

    if (updates.segments !== undefined) {
      updates.segments = normalizeSegments(updates.segments);
    }

    if (updates.holdout_percent !== undefined) {
      const holdoutResult = normalizeHoldout(updates.holdout_percent);
      if (holdoutResult.error) {
        return sendValidationError(res, [holdoutResult.error]);
      }
      updates.holdout_percent = holdoutResult.value;
    }

    // If updating test config, validate it and preserve existing code
    if (updates.variants || updates.goal) {
      const existingTest = await getTestById(id, shopDomain);
      if (!existingTest) {
        return sendNotFound(res, 'Test');
      }

      if (updates.variants && Array.isArray(updates.variants)) {
        const matchedIncomingIndices = new Set();
        const mergedVariants = existingTest.variants.map((existingVariant, index) => {
          const incoming = updates.variants.find((variant, incomingIndex) => {
            if (matchedIncomingIndices.has(incomingIndex)) {return false;}
            if (variant?.id && existingVariant?.id && variant.id === existingVariant.id) {
              return true;
            }
            if (variant?.name && existingVariant?.name && variant.name === existingVariant.name) {
              return true;
            }
            return incomingIndex === index;
          });

          if (!incoming) {
            return existingVariant;
          }

          matchedIncomingIndices.add(updates.variants.indexOf(incoming));
          const hasCodeProp = Object.prototype.hasOwnProperty.call(incoming, 'code');
          const nextCode = hasCodeProp ? incoming.code : existingVariant.code;
          const nextConfig = incoming.config
            ? { ...(existingVariant.config || {}), ...incoming.config }
            : existingVariant.config || {};

          return {
            ...existingVariant,
            ...incoming,
            ...(nextCode !== undefined ? { code: nextCode } : {}),
            ...(Object.keys(nextConfig).length > 0 ? { config: nextConfig } : {}),
          };
        });

        // Append new variants that don't match any existing (user added variants)
        const newVariants = updates.variants.filter((_, incomingIndex) => !matchedIncomingIndices.has(incomingIndex));
        const allVariants = [...mergedVariants, ...newVariants];
        // Ensure allocations are numbers (JSON may send strings)
        updates.variants = allVariants.map(v => ({
          ...v,
          allocation: Number(v.allocation) || 0,
        }));
      }

      const testData = { ...existingTest, ...updates };
      const validation = abTestEngine.validateTest(testData);

      if (!validation.isValid) {
        return sendValidationError(res, validation.errors);
      }
    }

    let test = await updateTest(id, shopDomain, updates);

    if (!test) {
      return sendNotFound(res, 'Test');
    }
    test = enrichGoalWithTemplateKey(test);
    ensureVariantCount(test);

    if (updates.scheduled_start_at !== undefined || updates.scheduled_stop_at !== undefined || updates.auto_start !== undefined || updates.auto_stop !== undefined) {
      scheduleTestJobs(test);
    }
    auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'update', changes: Object.keys(updates) });

    logger.info('Test updated', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, SUCCESS_MESSAGES.TEST_UPDATED);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tests/:id
 * Delete a test
 */
router.delete('/:id', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const deleted = await deleteTest(id, shopDomain);

    if (!deleted) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test deleted', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, {}, SUCCESS_MESSAGES.TEST_DELETED);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tests/:id/start
 * Start a test
 */
router.post('/:id/start', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const test = await abTestEngine.startTest(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test started', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, SUCCESS_MESSAGES.TEST_STARTED);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tests/:id/stop
 * Stop a test
 */
router.post('/:id/stop', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const test = await abTestEngine.stopTest(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    let analytics = null;
    try {
      const analyticsService = require('../services/analytics');
      analytics = await analyticsService.getTestAnalytics(id, shopDomain);
      const winner = analytics?.significance?.winner
        ? analytics?.variants?.find(v => v.id === analytics.significance.winner)?.name
        : null;
      await notificationService.createInAppNotification(shopDomain, {
        type: 'test_complete',
        title: `Test complete: ${test.name}`,
        message: winner
          ? `Winner: ${winner} · Confidence: ${analytics?.significance?.confidence ?? 0}%`
          : 'Test has been stopped.',
        data: { testId: id, testName: test.name },
      });
    } catch (notifErr) {
      logger.warn('Failed to create stop notification', { testId: id, error: notifErr.message });
    }

    try {
      await outboundWebhookService.fireWebhook(shopDomain, 'test_complete', {
        testId: id,
        testName: test.name,
        analytics: analytics?.variants,
        significance: analytics?.significance,
      });
    } catch (whErr) {
      logger.warn('Outbound webhook failed', { testId: id, error: whErr.message });
    }

    auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'stop' });
    logger.info('Test stopped', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, SUCCESS_MESSAGES.TEST_STOPPED);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tests/:id/personalize
 * Apply winning variant to 100% of traffic
 */
router.post('/:id/personalize', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variantIndex } = req.body || {};

    const test = await personalizationService.applyPersonalization(id, shopDomain, {
      variantIndex: variantIndex !== null && variantIndex !== undefined ? Number(variantIndex) : undefined,
    });

    auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'personalize' });
    logger.info('Personalization applied', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Winner applied to 100% of traffic');
  } catch (error) {
    if (error.message?.includes('not found')) {
      return sendNotFound(res, 'Test');
    }
    if (error.message?.includes('stopped') || error.message?.includes('No winner')) {
      return sendValidationError(res, [error.message]);
    }
    next(error);
  }
});

/**
 * POST /api/tests/:id/rollout
 * Start gradual rollout of winning variant
 */
router.post('/:id/rollout', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variantIndex, initialPercent, schedule } = req.body || {};

    const test = await personalizationService.startRollout(id, shopDomain, {
      variantIndex: variantIndex !== null && variantIndex !== undefined ? Number(variantIndex) : undefined,
      initialPercent: initialPercent !== null && initialPercent !== undefined ? Number(initialPercent) : undefined,
      schedule: Array.isArray(schedule) ? schedule : undefined,
    });

    auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'rollout' });
    logger.info('Rollout started', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Rollout started');
  } catch (error) {
    if (error.message?.includes('not found')) {
      return sendNotFound(res, 'Test');
    }
    if (error.message?.includes('stopped') || error.message?.includes('No winner')) {
      return sendValidationError(res, [error.message]);
    }
    next(error);
  }
});

/**
 * POST /api/tests/:id/personalization/disable
 * Disable personalization/rollout
 */
router.post('/:id/personalization/disable', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const test = await personalizationService.disablePersonalization(id, shopDomain);

    auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'disable_personalization' });
    logger.info('Personalization disabled', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Personalization disabled');
  } catch (error) {
    if (error.message?.includes('not found')) {
      return sendNotFound(res, 'Test');
    }
    next(error);
  }
});

/**
 * POST /api/tests/:id/clone
 * Clone a test
 */
router.post('/:id/clone', validateTestId, async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    // Get original test and enrich goal with template_key
    const originalTest = await getTestById(id, shopDomain);

    if (!originalTest) {
      return sendNotFound(res, 'Test');
    }

    const enrichedOriginal = enrichGoalWithTemplateKey(originalTest);

    // Create cloned test (include segments, holdout, guardrail, scheduling)
    const clonedTestData = {
      shop_domain: shopDomain,
      name: `${originalTest.name} (Copy)`,
      description: originalTest.description || null,
      type: originalTest.type,
      target_type: originalTest.target_type,
      target_id: originalTest.target_id,
      target_ids: originalTest.target_ids || null,
      status: 'draft', // Always start cloned tests as draft
      goal: enrichedOriginal.goal,
      variants: originalTest.variants,
      segments: originalTest.segments || {},
      holdout_percent: originalTest.holdout_percent ?? 0,
      guardrail_config: originalTest.guardrail_config || null,
      scheduled_start_at: null,
      scheduled_stop_at: null,
      auto_start: false,
      auto_stop: false,
      timezone: originalTest.timezone || 'UTC',
    };

    // Validate cloned test
    const validation = abTestEngine.validateTest(clonedTestData);
    if (!validation.isValid) {
      return sendValidationError(res, validation.errors);
    }

    const clonedTest = await createTest(clonedTestData);
    ensureVariantCount(clonedTest);

    logger.info('Test cloned', {
      originalTestId: id,
      clonedTestId: clonedTest.id,
      shopDomain,
    });

    return sendSuccess(
      res,
      HTTP_STATUS.CREATED,
      { test: clonedTest },
      SUCCESS_MESSAGES.TEST_CLONED
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
