/**
 * Test Routes
 *
 * API endpoints for managing AB tests
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/asyncHandler');
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
const { getGlobalHoldoutPercent } = require('../services/experimentationPolicyService');
const notificationService = require('../services/notificationService');
const outboundWebhookService = require('../services/outboundWebhookService');
const { scheduleTestJobs } = require('../jobs/scheduledTestsProcessor');
const auditLogService = require('../services/auditLogService');
const conflictDetectionService = require('../services/conflictDetectionService');
const personalizationService = require('../services/personalizationService');
const {
  parseActivationStartOptions,
  applyActivationStartOptionsToTest,
  runActivationPreflight,
} = require('../services/testActivationService');
const { getTestAnalytics, getBatchVariantMetrics } = require('../models/analytics');
const { normalizeDomain } = require('../models/tenant');
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

function getExperimentGroupKey(test) {
  if (!test || typeof test !== 'object') {
    return '';
  }
  const raw = test.segments?.experiment_group ?? test.goal?.experiment_group ?? '';
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function extractVisualQaMetadata(test) {
  const goalVisualQa =
    test?.goal?.visual_qa && typeof test.goal.visual_qa === 'object' ? test.goal.visual_qa : {};
  const baselineId =
    String(goalVisualQa.baseline_id || goalVisualQa.baselineId || '').trim() || null;
  const checkedAt = String(goalVisualQa.checked_at || goalVisualQa.checkedAt || '').trim() || null;
  const required =
    goalVisualQa.required === true ||
    goalVisualQa.enabled === true ||
    test?.segments?.visual_qa_required === true;
  return {
    required: Boolean(required),
    baseline_id: baselineId,
    checked_at: checkedAt,
  };
}

function applyExperimentGroupToSegments(payload) {
  if (!payload || typeof payload !== 'object') {
    return;
  }
  if (payload.experiment_group === undefined) {
    return;
  }
  const raw = payload.experiment_group;
  const normalized = raw === null || raw === undefined ? '' : String(raw).trim().toLowerCase();
  const nextSegments =
    payload.segments && typeof payload.segments === 'object' ? payload.segments : {};
  if (!normalized) {
    delete nextSegments.experiment_group;
  } else {
    nextSegments.experiment_group = normalized;
  }
  payload.segments = nextSegments;
  delete payload.experiment_group;
}

function buildTestReportMarkdown(report) {
  const test = report?.test || {};
  const summary = report?.analytics?.summary || {};
  const significance = report?.analytics?.significance || {};
  const quality = report?.quality || {};
  const decision = report?.decision || {};
  const riskSignals = quality?.riskSignals || {};
  const visualQa = report?.policy?.visual_qa || {};
  const variants = Array.isArray(report?.analytics?.variants) ? report.analytics.variants : [];
  const lines = [
    `# ${test.name || 'A/B Test Report'}`,
    '',
    `- Test ID: ${test.id || ''}`,
    `- Type: ${test.type || ''}`,
    `- Status: ${test.status || ''}`,
    `- Generated at: ${report.generated_at || ''}`,
    '',
    '## Summary',
    '',
    `- Visitors: ${summary.totalVisitors ?? 0}`,
    `- Conversions: ${summary.totalConversions ?? 0}`,
    `- Revenue: ${summary.totalRevenue ?? 0}`,
    '',
    '## Quality',
    '',
    `- Score: ${quality.score ?? 0}/100`,
    `- Level: ${quality.level || 'unknown'}`,
    '',
    '## Significance',
    '',
    `- Significant: ${significance.significant ? 'Yes' : 'No'}`,
    `- Confidence: ${significance.confidence ?? 0}`,
    `- Message: ${significance.message || ''}`,
    '',
    '## Risk and rollout',
    '',
    `- Risk level: ${riskSignals.level || 'unknown'}`,
    `- Rollout action: ${decision.action || quality?.rolloutRecommendation?.action || 'n/a'}`,
    `- Guidance: ${decision.message || quality?.rolloutRecommendation?.message || ''}`,
    '',
    '## Visual QA',
    '',
    `- Required: ${visualQa.required ? 'Yes' : 'No'}`,
    `- Baseline ID: ${visualQa.baseline_id || 'n/a'}`,
    `- Checked at: ${visualQa.checked_at || 'n/a'}`,
    '',
    '## Variants',
    '',
  ];
  variants.forEach(variant => {
    lines.push(
      `- ${variant.name || variant.id || 'Variant'}: ${variant.conversions || 0} conversions / ${variant.visitors || 0} visitors (${variant.conversionRate || 0}%)`
    );
  });
  if (Array.isArray(quality.recommendations) && quality.recommendations.length > 0) {
    lines.push('', '## Recommendations', '');
    quality.recommendations.forEach(item => {
      lines.push(`- ${item}`);
    });
  }
  return lines.join('\n') + '\n';
}

function isPriceLikeTestType(type) {
  const t = String(type || '')
    .trim()
    .toLowerCase();
  return t === 'price' || t === 'pricing';
}

function parseTargetIds(targetIds, targetId) {
  let ids = targetIds;
  if (typeof ids === 'string') {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = null;
    }
  }
  if (Array.isArray(ids)) {
    return ids.filter(Boolean).map(v => String(v));
  }
  if (targetId !== undefined && targetId !== null && String(targetId).trim() !== '') {
    return [String(targetId)];
  }
  return [];
}

function normalizePriceMode(config) {
  const mode = String(config?.priceMode || '')
    .trim()
    .toLowerCase();
  if (mode) {
    return mode;
  }
  if (config?.price !== undefined && config?.price !== null && String(config.price).trim() !== '') {
    return 'fixed';
  }
  if (
    config?.priceDelta !== undefined &&
    config?.priceDelta !== null &&
    String(config.priceDelta).trim() !== ''
  ) {
    return 'amount';
  }
  if (
    config?.pricePercent !== undefined &&
    config?.pricePercent !== null &&
    String(config.pricePercent).trim() !== ''
  ) {
    return 'percent';
  }
  return 'control';
}

function hasAnyPriceSignal(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }
  const mode = normalizePriceMode(config);
  if (mode === 'control') {
    return false;
  }
  if (mode === 'fixed') {
    return (
      config.price !== undefined && config.price !== null && String(config.price).trim() !== ''
    );
  }
  if (mode === 'amount') {
    return (
      config.priceDelta !== undefined &&
      config.priceDelta !== null &&
      String(config.priceDelta).trim() !== ''
    );
  }
  if (mode === 'percent') {
    return (
      config.pricePercent !== undefined &&
      config.pricePercent !== null &&
      String(config.pricePercent).trim() !== ''
    );
  }
  return false;
}

function findWinnerVariant(test, analytics) {
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  if (variants.length === 0) {
    return null;
  }
  const winnerIdentity = analytics?.significance?.winner;
  if (winnerIdentity !== undefined && winnerIdentity !== null) {
    const winnerKey = String(winnerIdentity).trim();
    const matched = variants.find(v => {
      if (!v) {
        return false;
      }
      const id = v.id !== undefined && v.id !== null ? String(v.id).trim() : '';
      const name = v.name !== undefined && v.name !== null ? String(v.name).trim() : '';
      return winnerKey === id || winnerKey === name;
    });
    if (matched) {
      return matched;
    }
  }

  const analyticsRows = Array.isArray(analytics?.variants) ? analytics.variants : [];
  if (analyticsRows.length > 0) {
    const best = analyticsRows
      .map(a => ({
        id: a?.id !== undefined && a?.id !== null ? String(a.id).trim() : '',
        name: a?.name !== undefined && a?.name !== null ? String(a.name).trim() : '',
        conversions: Number(a?.conversions || 0),
      }))
      .sort((a, b) => b.conversions - a.conversions)[0];
    if (best) {
      const fromAnalytics = variants.find(v => {
        const id = v?.id !== undefined && v?.id !== null ? String(v.id).trim() : '';
        const name = v?.name !== undefined && v?.name !== null ? String(v.name).trim() : '';
        return (best.id && id === best.id) || (best.name && name === best.name);
      });
      if (fromAnalytics) {
        return fromAnalytics;
      }
    }
  }

  const priced = variants.find(v => hasAnyPriceSignal(v?.config || {}));
  if (priced) {
    return priced;
  }
  return variants[0] || null;
}

function csvEscape(value) {
  if (value === undefined || value === null) {
    return '';
  }
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildRolloutRows(test, winnerVariant) {
  const config =
    winnerVariant && winnerVariant.config && typeof winnerVariant.config === 'object'
      ? winnerVariant.config
      : {};
  const targetIds = parseTargetIds(test.target_ids, test.target_id);
  const globalConfig = { ...config };
  delete globalConfig.byProduct;
  delete globalConfig.byVariant;

  const common = {
    test_id: test.id,
    test_name: test.name,
    winner_variant_id:
      winnerVariant?.id !== undefined && winnerVariant?.id !== null ? String(winnerVariant.id) : '',
    winner_variant_name: winnerVariant?.name ? String(winnerVariant.name) : '',
    target_type: test.target_type || '',
    target_ids: targetIds.join('|'),
  };

  const toRow = (scope, cfg, productId = '', variantId = '') => ({
    ...common,
    scope,
    product_id: productId,
    variant_id: variantId,
    price_mode: normalizePriceMode(cfg),
    price: cfg?.price ?? '',
    price_delta: cfg?.priceDelta ?? '',
    price_percent: cfg?.pricePercent ?? '',
    price_base: cfg?.priceBase ?? '',
    round_to: cfg?.roundTo ?? '',
    price_application_method: cfg?.priceApplicationMethod ?? '',
    native_variant_id: cfg?.nativeVariantId ?? '',
  });

  const rows = [];
  if (hasAnyPriceSignal(globalConfig) || Object.keys(globalConfig).length > 0) {
    rows.push(toRow('global', globalConfig));
  }

  const byProduct =
    config.byProduct && typeof config.byProduct === 'object' ? config.byProduct : {};
  Object.entries(byProduct).forEach(([productId, productCfgRaw]) => {
    const productCfg =
      productCfgRaw && typeof productCfgRaw === 'object' ? { ...productCfgRaw } : productCfgRaw;
    if (!productCfg || typeof productCfg !== 'object') {
      return;
    }
    const byVariant =
      productCfg.byVariant && typeof productCfg.byVariant === 'object' ? productCfg.byVariant : {};
    delete productCfg.byVariant;
    const mergedProductCfg = { ...globalConfig, ...productCfg };
    rows.push(toRow('product', mergedProductCfg, productId, ''));

    Object.entries(byVariant).forEach(([variantId, variantCfgRaw]) => {
      if (!variantCfgRaw || typeof variantCfgRaw !== 'object') {
        return;
      }
      const mergedVariantCfg = { ...mergedProductCfg, ...variantCfgRaw };
      rows.push(toRow('product_variant', mergedVariantCfg, productId, variantId));
    });
  });

  const rootByVariant =
    config.byVariant && typeof config.byVariant === 'object' ? config.byVariant : {};
  Object.entries(rootByVariant).forEach(([variantId, variantCfgRaw]) => {
    if (!variantCfgRaw || typeof variantCfgRaw !== 'object') {
      return;
    }
    rows.push(toRow('variant', { ...globalConfig, ...variantCfgRaw }, '', variantId));
  });

  return rows;
}

function buildCsv(headers, rows) {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map(row => headers.map(h => csvEscape(row[h])).join(',')).join('\n');
  return `${head}\n${body}\n`;
}

function safeFileName(value) {
  const raw = String(value || 'price-test')
    .trim()
    .toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || 'price-test';
}

/** Ensure test has variant_count for consistent frontend display */
function ensureVariantCount(test) {
  if (!test) {
    return test;
  }
  const variants = test.variants || [];
  test.variant_count = Array.isArray(variants)
    ? variants.filter(v => v !== null && v !== undefined).length
    : 0;
  return test;
}

/**
 * POST /api/tests
 * Create a new AB test
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
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

    applyExperimentGroupToSegments(testData);

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
  })
);

/**
 * GET /api/tests/:id/price-rollout-csv
 * Export winning price configuration as CSV for rollout/import workflows.
 */
router.get(
  '/:id/price-rollout-csv',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!isPriceLikeTestType(test.type)) {
      return sendValidationError(res, ['Rollout CSV is available only for price tests.']);
    }

    let analytics = null;
    try {
      const analyticsService = require('../services/analytics');
      analytics = await analyticsService.getTestAnalytics(id, shopDomain);
    } catch (_err) {
      analytics = null;
    }

    const winnerVariant = findWinnerVariant(test, analytics);
    if (!winnerVariant) {
      return sendValidationError(res, [
        'Could not determine a winner variant to build rollout CSV.',
      ]);
    }

    const rows = buildRolloutRows(test, winnerVariant);
    if (!rows.length) {
      return sendValidationError(res, [
        'No price configuration found on the winner variant for CSV export.',
      ]);
    }

    const headers = [
      'test_id',
      'test_name',
      'winner_variant_id',
      'winner_variant_name',
      'target_type',
      'target_ids',
      'scope',
      'product_id',
      'variant_id',
      'price_mode',
      'price',
      'price_delta',
      'price_percent',
      'price_base',
      'round_to',
      'price_application_method',
      'native_variant_id',
    ];
    const csv = buildCsv(headers, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    const fileName = `${safeFileName(test.name)}-rollout-${stamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csv);
  })
);

/**
 * GET /api/tests
 * Get all tests for a shop
 */
function mergeVariantMetrics(variants, analytics) {
  if (!Array.isArray(analytics) || analytics.length === 0) {
    return variants.map(v => ({ ...v, visitors: 0, conversions: 0, revenue: 0 }));
  }
  const byId = new Map();
  const byName = new Map();
  analytics.forEach(a => {
    const id = a.variant_id !== null && a.variant_id !== undefined ? String(a.variant_id) : null;
    const name =
      a.variant_name !== null && a.variant_name !== undefined ? String(a.variant_name) : null;
    if (id) {
      byId.set(id, a);
    }
    if (name) {
      byName.set(name, a);
    }
  });
  return variants.map(v => {
    const vId =
      (v?.id ?? v?.variant_id) !== null && (v?.id ?? v?.variant_id) !== undefined
        ? String(v.id ?? v.variant_id)
        : null;
    const vName = v?.name !== null && v?.name !== undefined ? String(v.name) : null;
    const a =
      (vId && byId.get(vId)) ||
      (vName && byName.get(vName)) ||
      (vId && byName.get(vId)) ||
      (vName && byId.get(vId));
    return a
      ? {
          ...v,
          visitors: a.visitors || 0,
          conversions: a.conversions || 0,
          revenue: a.revenue || 0,
        }
      : { ...v, visitors: 0, conversions: 0, revenue: 0 };
  });
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    // Normalize shop domain for consistent matching (DB stores lowercase, e.g. makripon.myshopify.com)
    const rawShop = req.shopDomain;
    const shopDomain = normalizeDomain(rawShop) || rawShop;
    const status = req.query.status || null;

    let tests = await getTestsByShop(shopDomain, status);
    // Fallback: if normalized domain returns no tests, try raw (handles legacy/custom formats)
    if (tests.length === 0 && shopDomain !== rawShop) {
      tests = await getTestsByShop(rawShop, status);
    }

    // Batch fetch variant metrics (visitors, conversions, revenue) for all tests in 2 queries
    const testIds = tests.map(t => t.id);
    const analyticsShop =
      (tests[0] && (normalizeDomain(tests[0].shop_domain) || tests[0].shop_domain)) || shopDomain;
    let batchMetrics = new Map();
    try {
      batchMetrics = await getBatchVariantMetrics(testIds, analyticsShop);
      if (batchMetrics.size === 0 && tests.length > 0 && tests[0].shop_domain !== analyticsShop) {
        batchMetrics = await getBatchVariantMetrics(
          testIds,
          (tests[0] && tests[0].shop_domain) || shopDomain
        );
      }
    } catch (batchErr) {
      logger.debug('Batch analytics skipped', { error: batchErr.message });
    }

    const testsWithAnalytics = await Promise.all(
      tests.map(async test => {
        const enriched = enrichGoalWithTemplateKey(test);
        const variants = enriched.variants || [];
        let analytics = batchMetrics.get(test.id);
        if (!analytics || analytics.length === 0) {
          const testShop = normalizeDomain(test.shop_domain) || test.shop_domain || shopDomain;
          try {
            analytics = await getTestAnalytics(test.id, testShop);
            if (!Array.isArray(analytics) || analytics.length === 0) {
              analytics = await getTestAnalytics(test.id, shopDomain);
            }
          } catch {
            analytics = null;
          }
        }
        const variantsWithMetrics = mergeVariantMetrics(variants, analytics);
        const health = testHealthService.calculateHealthScore({
          ...enriched,
          variants: variantsWithMetrics,
        });
        const variantCount = variantsWithMetrics.filter(v => v !== null && v !== undefined).length;
        const result = {
          ...enriched,
          variants: variantsWithMetrics,
          health,
          quality_score: health.score,
          variant_count: variantCount,
        };
        if (test.personalization_mode === 'rollout') {
          result.effective_rollout_percent =
            personalizationService.getEffectiveRolloutPercent(test);
        }
        return result;
      })
    );

    return sendSuccess(res, HTTP_STATUS.OK, {
      tests: testsWithAnalytics,
      count: testsWithAnalytics.length,
    });
  })
);

/**
 * GET /api/tests/:id/report?format=json|markdown
 * Generate a concise performance + quality report for sharing.
 */
router.get(
  '/:id/report',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const format = String(req.query?.format || 'json')
      .trim()
      .toLowerCase();

    if (!['json', 'markdown', 'md'].includes(format)) {
      return res.status(400).json({ success: false, error: 'format must be json or markdown' });
    }

    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    if (!Array.isArray(test.variants)) {
      test.variants = [];
    }
    if (!test.goal || typeof test.goal !== 'object') {
      test.goal = {};
    }
    ensureVariantCount(test);

    let analytics = null;
    try {
      const analyticsService = require('../services/analytics');
      analytics = await analyticsService.getTestAnalytics(id, shopDomain);
    } catch {
      analytics = null;
    }
    const variantsWithMetrics = mergeVariantMetrics(test.variants, analytics);
    const health = testHealthService.calculateHealthScore({
      ...test,
      variants: variantsWithMetrics,
      significance: analytics?.significance || null,
    });

    const report = {
      generated_at: new Date().toISOString(),
      test: {
        id: test.id,
        name: test.name,
        type: test.type,
        status: test.status,
        target_type: test.target_type || null,
        target_id: test.target_id || null,
        target_ids: Array.isArray(test.target_ids) ? test.target_ids : [],
        started_at: test.started_at || null,
        stopped_at: test.stopped_at || null,
        created_at: test.created_at || null,
      },
      policy: {
        experiment_group: getExperimentGroupKey(test) || null,
        global_holdout_percent: await getGlobalHoldoutPercent(shopDomain),
        test_holdout_percent: Number(test.holdout_percent || 0),
        visual_qa: extractVisualQaMetadata(test),
      },
      quality: {
        score: health.score,
        level: health.healthLevel,
        color: health.healthColor,
        issues: health.issues || [],
        recommendations: health.recommendations || [],
        srm: health.srm || null,
        riskSignals: health.riskSignals || null,
        rolloutRecommendation: health.rolloutRecommendation || null,
      },
      decision: {
        action: health?.rolloutRecommendation?.action || null,
        risk_level: health?.riskSignals?.level || null,
        message: health?.rolloutRecommendation?.message || null,
        suggested_initial_percent: health?.rolloutRecommendation?.suggestedInitialPercent ?? null,
        suggested_duration_days: health?.rolloutRecommendation?.suggestedDurationDays ?? null,
      },
      analytics: {
        summary: analytics?.summary || {
          totalVisitors: 0,
          totalConversions: 0,
          totalRevenue: 0,
        },
        significance: analytics?.significance || {
          significant: false,
          pValue: 1,
          confidence: 0,
          message: 'Insufficient data',
        },
        revenueImpact: analytics?.revenueImpact || null,
        srm: analytics?.srm || null,
        variants: variantsWithMetrics || [],
      },
    };

    if (format === 'markdown' || format === 'md') {
      const markdown = buildTestReportMarkdown(report);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      return res.status(200).send(markdown);
    }
    return sendSuccess(res, HTTP_STATUS.OK, { report });
  })
);

/**
 * GET /api/tests/:id
 * Get a specific test
 */
router.get(
  '/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
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

    let variantMetrics = null;
    try {
      variantMetrics = await getTestAnalytics(id, shopDomain);
    } catch {
      variantMetrics = null;
    }
    const variantsWithMetrics = mergeVariantMetrics(
      Array.isArray(test.variants) ? test.variants : [],
      Array.isArray(variantMetrics) ? variantMetrics : []
    );
    test.variants = variantsWithMetrics;

    let analyticsReport = null;
    try {
      const analyticsService = require('../services/analytics');
      analyticsReport = await analyticsService.getTestAnalytics(id, shopDomain);
    } catch {
      analyticsReport = null;
    }

    // Calculate health score for the test
    const health = testHealthService.calculateHealthScore({
      ...test,
      variants: variantsWithMetrics,
      significance: analyticsReport?.significance || null,
    });
    test.health = health;
    test.quality_score = health.score;
    test.analytics_meta = {
      significance: analyticsReport?.significance || null,
      srm: analyticsReport?.srm || health?.srm || null,
      summary: analyticsReport?.summary || null,
    };

    // Add effective rollout percent for rollout tests (computed from schedule)
    if (test.personalization_mode === 'rollout') {
      test.effective_rollout_percent = personalizationService.getEffectiveRolloutPercent(test);
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    return sendSuccess(res, HTTP_STATUS.OK, { test });
  })
);

/**
 * PUT /api/tests/:id/variants/codes
 * Update variant codes only (no validation of name/type/etc)
 */
router.put(
  '/:id/variants/codes',
  validateTestId,
  asyncHandler(async (req, res) => {
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

      if (update && ('code' in update || 'customCss' in update || 'customJs' in update)) {
        const codeValue =
          update.code !== undefined && update.code !== null
            ? String(update.code)
            : existingVariant.config && existingVariant.config.code !== undefined
              ? existingVariant.config.code
              : '';
        const customCss =
          update.customCss !== undefined && update.customCss !== null
            ? String(update.customCss)
            : existingVariant.config && existingVariant.config.customCss !== undefined
              ? existingVariant.config.customCss
              : '';
        const customJs =
          update.customJs !== undefined && update.customJs !== null
            ? String(update.customJs)
            : existingVariant.config && existingVariant.config.customJs !== undefined
              ? existingVariant.config.customJs
              : '';
        const nextConfig = {
          ...(existingVariant.config && typeof existingVariant.config === 'object'
            ? existingVariant.config
            : {}),
          code: codeValue,
          customCss: customCss || undefined,
          customJs: customJs || undefined,
        };
        if (!nextConfig.customCss) {
          delete nextConfig.customCss;
        }
        if (!nextConfig.customJs) {
          delete nextConfig.customJs;
        }
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
  })
);

/**
 * PUT /api/tests/:id/variants/allocation
 * Update traffic allocation for variants
 */
router.put(
  '/:id/variants/allocation',
  validateTestId,
  asyncHandler(async (req, res) => {
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
  })
);

/**
 * PUT /api/tests/:id
 * Update a test
 */
router.put(
  '/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
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

    applyExperimentGroupToSegments(updates);

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
            if (matchedIncomingIndices.has(incomingIndex)) {
              return false;
            }
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
        const newVariants = updates.variants.filter(
          (_, incomingIndex) => !matchedIncomingIndices.has(incomingIndex)
        );
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

    if (
      updates.scheduled_start_at !== undefined ||
      updates.scheduled_stop_at !== undefined ||
      updates.auto_start !== undefined ||
      updates.auto_stop !== undefined
    ) {
      scheduleTestJobs(test);
    }
    auditLogService.log(shopDomain, {
      entityType: 'test',
      entityId: id,
      action: 'update',
      changes: Object.keys(updates),
    });

    logger.info('Test updated', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, { test }, SUCCESS_MESSAGES.TEST_UPDATED);
  })
);

/**
 * DELETE /api/tests/:id
 * Delete a test
 */
router.delete(
  '/:id',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const deleted = await deleteTest(id, shopDomain);

    if (!deleted) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test deleted', { testId: id, shopDomain });

    return sendSuccess(res, HTTP_STATUS.OK, {}, SUCCESS_MESSAGES.TEST_DELETED);
  })
);

/**
 * GET /api/tests/:id/preflight
 * Run pre-activation checks (compatibility, conflicts, canary, guardrails)
 */
router.get(
  '/:id/preflight',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const test = await getTestById(id, shopDomain);
    if (!test) {
      return sendNotFound(res, 'Test');
    }
    const preflight = await runActivationPreflight(test, shopDomain);
    return sendSuccess(res, HTTP_STATUS.OK, {
      test_id: id,
      preflight,
    });
  })
);

/**
 * POST /api/tests/:id/start
 * Start a test
 */
router.post(
  '/:id/start',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    const startOptions = parseActivationStartOptions(req.body || {});
    if (startOptions.errors.length > 0) {
      return sendValidationError(res, startOptions.errors);
    }

    const candidateTest = applyActivationStartOptionsToTest(existingTest, startOptions);
    const preflight = await runActivationPreflight(candidateTest, shopDomain);
    if (!preflight.ok && !startOptions.force) {
      return res.status(400).json({
        success: false,
        error: 'Activation preflight failed. Resolve issues or retry with force=true.',
        preflight,
      });
    }

    const activationUpdatePayload = {};
    if (startOptions.hasCanaryOverrides && candidateTest?.segments) {
      activationUpdatePayload.segments = candidateTest.segments;
    }
    if (startOptions?.visualQa?.hasOverrides && candidateTest?.goal) {
      activationUpdatePayload.goal = candidateTest.goal;
    }
    if (Object.keys(activationUpdatePayload).length > 0) {
      await updateTest(id, shopDomain, activationUpdatePayload);
    }

    const test = await abTestEngine.startTest(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    const forceApplied = Boolean(startOptions.force && !preflight.ok);
    const canaryPercent =
      startOptions.rampPercent !== null && startOptions.rampPercent !== undefined
        ? startOptions.rampPercent
        : (candidateTest?.segments?.traffic_ramp_percent ?? null);
    const canaryDays =
      startOptions.rampDays !== null && startOptions.rampDays !== undefined
        ? startOptions.rampDays
        : (candidateTest?.segments?.traffic_ramp_days ?? null);
    auditLogService.log(shopDomain, {
      entityType: 'test',
      entityId: id,
      action: 'start',
      changes: {
        forceApplied,
        forceReason: startOptions.forceReason || null,
        preflight: {
          ok: Boolean(preflight.ok),
          errors: Array.isArray(preflight.errors) ? preflight.errors.length : 0,
          warnings: Array.isArray(preflight.warnings) ? preflight.warnings.length : 0,
        },
        canary: {
          percent: canaryPercent,
          days: canaryDays,
        },
        visualQa: startOptions?.visualQa?.hasOverrides
          ? {
              baselineId: startOptions.visualQa.baselineId || null,
              checkedAtIso: startOptions.visualQa.checkedAtIso || null,
              required:
                startOptions.visualQa.required !== null &&
                startOptions.visualQa.required !== undefined
                  ? Boolean(startOptions.visualQa.required)
                  : null,
            }
          : null,
      },
    });
    logger.info('Test started', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      {
        test,
        preflight,
        activation: {
          force_applied: forceApplied,
          force_reason: startOptions.forceReason || null,
          canary_percent: canaryPercent,
          canary_days: canaryDays,
          visual_qa: {
            baseline_id:
              startOptions?.visualQa?.baselineId ||
              candidateTest?.goal?.visual_qa?.baseline_id ||
              null,
            checked_at:
              startOptions?.visualQa?.checkedAtIso ||
              candidateTest?.goal?.visual_qa?.checked_at ||
              null,
            required:
              startOptions?.visualQa?.required !== null &&
              startOptions?.visualQa?.required !== undefined
                ? Boolean(startOptions.visualQa.required)
                : Boolean(candidateTest?.goal?.visual_qa?.required),
          },
        },
      },
      SUCCESS_MESSAGES.TEST_STARTED
    );
  })
);

/**
 * POST /api/tests/:id/stop
 * Stop a test
 */
router.post(
  '/:id/stop',
  validateTestId,
  asyncHandler(async (req, res) => {
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
  })
);

/**
 * POST /api/tests/:id/personalize
 * Apply winning variant to 100% of traffic
 */
router.post(
  '/:id/personalize',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variantIndex } = req.body || {};

    try {
      const test = await personalizationService.applyPersonalization(id, shopDomain, {
        variantIndex:
          variantIndex !== null && variantIndex !== undefined ? Number(variantIndex) : undefined,
      });
      auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'personalize' });
      logger.info('Personalization applied', { testId: id, shopDomain });
      return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Winner applied to 100% of traffic');
    } catch (err) {
      if (err.message?.includes('not found')) {
        return sendNotFound(res, 'Test');
      }
      if (err.message?.includes('stopped') || err.message?.includes('No winner')) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }
  })
);

/**
 * POST /api/tests/:id/rollout
 * Start gradual rollout of winning variant
 */
router.post(
  '/:id/rollout',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variantIndex, initialPercent, schedule } = req.body || {};

    try {
      const test = await personalizationService.startRollout(id, shopDomain, {
        variantIndex:
          variantIndex !== null && variantIndex !== undefined ? Number(variantIndex) : undefined,
        initialPercent:
          initialPercent !== null && initialPercent !== undefined
            ? Number(initialPercent)
            : undefined,
        schedule: Array.isArray(schedule) ? schedule : undefined,
      });
      auditLogService.log(shopDomain, { entityType: 'test', entityId: id, action: 'rollout' });
      logger.info('Rollout started', { testId: id, shopDomain });
      return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Rollout started');
    } catch (err) {
      if (err.message?.includes('not found')) {
        return sendNotFound(res, 'Test');
      }
      if (err.message?.includes('stopped') || err.message?.includes('No winner')) {
        return sendValidationError(res, [err.message]);
      }
      throw err;
    }
  })
);

/**
 * POST /api/tests/:id/personalization/disable
 * Disable personalization/rollout
 */
router.post(
  '/:id/personalization/disable',
  validateTestId,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    try {
      const test = await personalizationService.disablePersonalization(id, shopDomain);
      auditLogService.log(shopDomain, {
        entityType: 'test',
        entityId: id,
        action: 'disable_personalization',
      });
      logger.info('Personalization disabled', { testId: id, shopDomain });
      return sendSuccess(res, HTTP_STATUS.OK, { test }, 'Personalization disabled');
    } catch (err) {
      if (err.message?.includes('not found')) {
        return sendNotFound(res, 'Test');
      }
      throw err;
    }
  })
);

/**
 * POST /api/tests/:id/clone
 * Clone a test
 */
router.post(
  '/:id/clone',
  validateTestId,
  asyncHandler(async (req, res) => {
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
  })
);

module.exports = router;
