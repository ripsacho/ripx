/**
 * Test Routes
 *
 * API endpoints for managing AB tests
 */

const express = require('express');
const router = express.Router();
const abTestEngine = require('../services/abTestEngine');
const testHealthService = require('../services/testHealthService');
const {
  createTest,
  getTestById,
  getTestsByShop,
  updateTest,
  deleteTest
} = require('../models/test');
const { sendSuccess, sendError, sendValidationError, sendNotFound } = require('../utils/response');
const { HTTP_STATUS, SUCCESS_MESSAGES, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');

/**
 * POST /api/tests
 * Create a new AB test
 */
router.post('/', async (req, res, next) => {
  try {
    const shopDomain = req.shopDomain;
    const testData = {
      ...req.body,
      shop_domain: shopDomain
    };

    logger.info('Creating test', { 
      shopDomain, 
      type: testData.type, 
      name: testData.name,
      hasVariants: !!testData.variants,
      variantCount: testData.variants?.length || 0
    });

    // Validate test configuration
    const validation = abTestEngine.validateTest(testData);

    if (!validation.isValid) {
      logger.warn('Test validation failed', { errors: validation.errors, testData: { name: testData.name, type: testData.type } });
      return sendValidationError(res, validation.errors);
    }

    // Create test
    const test = await createTest(testData);

    logger.info('Test created', { testId: test.id, shopDomain, type: test.type });

    return sendSuccess(
      res,
      HTTP_STATUS.CREATED,
      { test },
      SUCCESS_MESSAGES.TEST_CREATED
    );
  } catch (error) {
    logger.error('Error creating test', {
      error: error.message,
      stack: error.stack,
      shopDomain: req.shopDomain,
      testData: {
        name: req.body?.name,
        type: req.body?.type,
        hasVariants: !!req.body?.variants
      }
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

    // Calculate health scores for each test
    const testsWithHealth = tests.map(test => {
      const health = testHealthService.calculateHealthScore(test);
      return {
        ...test,
        health
      };
    });

    return sendSuccess(res, HTTP_STATUS.OK, {
      tests: testsWithHealth,
      count: testsWithHealth.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tests/:id
 * Get a specific test
 */
router.get('/:id', async (req, res, next) => {
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

    // Calculate health score for the test
    const health = testHealthService.calculateHealthScore(test);
    test.health = health;

    return sendSuccess(res, HTTP_STATUS.OK, { test });
  } catch (error) {
    logger.error('Error fetching test', { testId: id, shopDomain, error });
    next(error);
  }
});

/**
 * PUT /api/tests/:id
 * Update a test
 */
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const updates = req.body;

    // If updating test config, validate it
    if (updates.variants || updates.goal) {
      const existingTest = await getTestById(id, shopDomain);
      if (!existingTest) {
        return sendNotFound(res, 'Test');
      }

      const testData = { ...existingTest, ...updates };
      const validation = abTestEngine.validateTest(testData);

      if (!validation.isValid) {
        return sendValidationError(res, validation.errors);
      }
    }

    const test = await updateTest(id, shopDomain, updates);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test updated', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      { test },
      SUCCESS_MESSAGES.TEST_UPDATED
    );
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/tests/:id
 * Delete a test
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const deleted = await deleteTest(id, shopDomain);

    if (!deleted) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test deleted', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      {},
      SUCCESS_MESSAGES.TEST_DELETED
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tests/:id/start
 * Start a test
 */
router.post('/:id/start', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const test = await abTestEngine.startTest(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test started', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      { test },
      SUCCESS_MESSAGES.TEST_STARTED
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tests/:id/stop
 * Stop a test
 */
router.post('/:id/stop', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    const test = await abTestEngine.stopTest(id, shopDomain);

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Test stopped', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      { test },
      SUCCESS_MESSAGES.TEST_STOPPED
    );
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tests/:id/clone
 * Clone a test
 */
router.post('/:id/clone', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;

    // Get original test
    const originalTest = await getTestById(id, shopDomain);

    if (!originalTest) {
      return sendNotFound(res, 'Test');
    }

    // Create cloned test
    const clonedTestData = {
      shop_domain: shopDomain,
      name: `${originalTest.name} (Copy)`,
      type: originalTest.type,
      target_type: originalTest.target_type,
      target_id: originalTest.target_id,
      status: 'draft', // Always start cloned tests as draft
      goal: originalTest.goal,
      variants: originalTest.variants
    };

    // Validate cloned test
    const validation = abTestEngine.validateTest(clonedTestData);
    if (!validation.isValid) {
      return sendValidationError(res, validation.errors);
    }

    const clonedTest = await createTest(clonedTestData);

    logger.info('Test cloned', { 
      originalTestId: id, 
      clonedTestId: clonedTest.id, 
      shopDomain 
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

/**
 * PUT /api/tests/:id/variants/allocation
 * Update traffic allocation for variants
 */
router.put('/:id/variants/allocation', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variants } = req.body;

    if (!variants || !Array.isArray(variants)) {
      return sendValidationError(res, ['Variants array is required']);
    }

    // Get existing test
    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    // Update allocation for each variant
    const updatedVariants = existingTest.variants.map((existingVariant, index) => {
      // Try to find matching update by id, name, or index
      const update = variants.find((v, updateIndex) => {
        // Match by id if both have it
        if (v.id && existingVariant.id) {
          return v.id === existingVariant.id;
        }
        // Match by name if both have it
        if (v.name && existingVariant.name) {
          return v.name === existingVariant.name;
        }
        // Match by index as fallback
        return updateIndex === index;
      });
      
      if (update && update.allocation !== undefined) {
        return {
          ...existingVariant,
          allocation: update.allocation
        };
      }
      return existingVariant;
    });

    // Validate total allocation
    const totalAllocation = updatedVariants.reduce((sum, v) => sum + (v.allocation || 0), 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      return sendValidationError(res, [`Total allocation must equal 100%. Current: ${totalAllocation}%`]);
    }

    // Update test with new variants
    const test = await updateTest(id, shopDomain, { variants: updatedVariants });

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Traffic allocation updated', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      { test },
      'Traffic allocation updated successfully'
    );
  } catch (error) {
    logger.error('Error updating traffic allocation', { testId: id, error: error.message });
    next(error);
  }
});

/**
 * PUT /api/tests/:id/variants/codes
 * Update variant codes
 */
router.put('/:id/variants/codes', async (req, res, next) => {
  try {
    const { id } = req.params;
    const shopDomain = req.shopDomain;
    const { variants } = req.body;

    if (!variants || !Array.isArray(variants)) {
      return sendValidationError(res, ['Variants array is required']);
    }

    // Get existing test
    const existingTest = await getTestById(id, shopDomain);
    if (!existingTest) {
      return sendNotFound(res, 'Test');
    }

    // Update code for each variant
    const updatedVariants = existingTest.variants.map((existingVariant, index) => {
      // Try to find matching update by id, name, or index
      const update = variants.find((v, updateIndex) => {
        // Match by id if both have it
        if (v.id && existingVariant.id) {
          return v.id === existingVariant.id;
        }
        // Match by name if both have it
        if (v.name && existingVariant.name) {
          return v.name === existingVariant.name;
        }
        // Match by index as fallback
        return updateIndex === index;
      });
      
      if (update && update.code !== undefined) {
        return {
          ...existingVariant,
          code: update.code
        };
      }
      return existingVariant;
    });

    // Update test with new variants
    const test = await updateTest(id, shopDomain, { variants: updatedVariants });

    if (!test) {
      return sendNotFound(res, 'Test');
    }

    logger.info('Variant codes updated', { testId: id, shopDomain });

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      { test },
      'Variant codes updated successfully'
    );
  } catch (error) {
    logger.error('Error updating variant codes', { testId: id, error: error.message });
    next(error);
  }
});

module.exports = router;

