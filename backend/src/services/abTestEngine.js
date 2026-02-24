/**
 * AB Test Engine
 *
 * Core engine for managing AB tests. Handles:
 * - Variant selection and assignment
 * - Traffic allocation
 * - Test validation
 * - Session persistence
 */

const crypto = require('crypto');
const {
  getTestAssignment,
  getTestAssignmentsBatch,
  saveTestAssignment,
} = require('../models/testAssignment');
const { getTestById, getTestsByIds } = require('../models/test');
const personalizationService = require('./personalizationService');

class ABTestEngine {
  /**
   * Check if test should serve variants (running OR personalized/rollout)
   */
  _shouldServeTest(test) {
    if (!test) {
      return false;
    }
    if (test.status === 'running') {
      return true;
    }
    const mode = test.personalization_mode;
    if (mode === 'personalized') {
      return true;
    }
    if (mode === 'rollout') {
      const percent = personalizationService.getEffectiveRolloutPercent(test);
      return percent > 0;
    }
    return false;
  }

  /**
   * Get winner variant for personalized/rollout tests
   */
  _getWinnerVariant(test) {
    if (!test?.variants?.length) {
      return null;
    }
    const idx = test.winner_variant_index ?? 0;
    const variant = test.variants[idx];
    return variant || null;
  }

  /**
   * Get or assign a variant for a user
   *
   * @param {string} testId - The test ID
   * @param {string} userId - User identifier (cookie, session, etc.)
   * @param {string} shopDomain - Shopify shop domain
   * @returns {Promise<Object>} Variant assignment
   */
  async getVariant(testId, userId, shopDomain, context = {}) {
    try {
      // Get test details
      const test = await getTestById(testId, shopDomain);

      if (!test || !this._shouldServeTest(test)) {
        return null;
      }

      // Personalization/rollout: serve winner to eligible users
      if (test.status !== 'running') {
        const winner = this._getWinnerVariant(test);
        if (!winner) {
          return null;
        }

        if (test.personalization_mode === 'personalized') {
          return {
            variantId: winner.id,
            variantName: winner.name,
            isNewAssignment: false,
            config: winner.config || {},
          };
        }

        if (test.personalization_mode === 'rollout') {
          const percent = personalizationService.getEffectiveRolloutPercent(test);
          if (percent <= 0) {
            return null;
          }
          const hash = crypto.createHash('md5').update(userId).digest('hex');
          const bucket = parseInt(hash.substring(0, 8), 16) % 100;
          if (bucket >= percent) {
            return null; // User sees control (no variant)
          }
          return {
            variantId: winner.id,
            variantName: winner.name,
            isNewAssignment: false,
            config: winner.config || {},
          };
        }
      }

      if (!this.isUserEligible(test, context)) {
        return null;
      }

      // Traffic ramp: only assign to X% of users, ramping to 100% over 7 days
      const rampPercent = test.segments?.traffic_ramp_percent;
      if (
        rampPercent !== null &&
        rampPercent !== undefined &&
        rampPercent > 0 &&
        rampPercent < 100
      ) {
        // eslint-disable-line eqeqeq
        const startedAt = test.started_at ? new Date(test.started_at) : null;
        const rampDays = 7;
        let effectivePercent = rampPercent;
        if (startedAt) {
          const daysSinceStart = (Date.now() - startedAt.getTime()) / (24 * 60 * 60 * 1000);
          effectivePercent = Math.min(
            100,
            rampPercent + (daysSinceStart / rampDays) * (100 - rampPercent)
          );
        }
        const hash = crypto.createHash('md5').update(userId).digest('hex');
        const bucket = parseInt(hash.substring(0, 8), 16) % 100;
        if (bucket >= effectivePercent) {
          return null;
        }
      }

      // Check if user already has an assignment
      const existingAssignment = await getTestAssignment(testId, userId, shopDomain);

      if (existingAssignment) {
        const variantMap = this._buildVariantMap(test.variants);
        const matchedVariant =
          variantMap.get(existingAssignment.variant_id) ??
          variantMap.get(existingAssignment.variant_name) ??
          (test.variants || []).find(
            v =>
              v?.id === existingAssignment.variant_id || v?.name === existingAssignment.variant_name
          );
        return {
          variantId: existingAssignment.variant_id,
          variantName: existingAssignment.variant_name,
          isNewAssignment: false,
          config: matchedVariant?.config || {},
        };
      }

      // Select variant based on traffic allocation
      const variant = this.selectVariant(test.variants, userId, test.holdout_percent || 0);
      if (!variant) {
        return null;
      }

      // Save assignment (include device/country for segment breakdown)
      // Use variant.id || variant.name so we never store undefined (variants from templates may lack id)
      const variantId = variant.id ?? variant.name;
      if (!variantId) {
        const logger = require('../utils/logger');
        logger.warn('Variant has no id or name, skipping assignment', { testId, variant });
        return null;
      }
      await saveTestAssignment({
        test_id: testId,
        user_id: userId,
        shop_domain: shopDomain,
        variant_id: String(variantId),
        variant_name: variant.name || String(variantId),
        assigned_at: new Date(),
        device: context.device || null,
        country: context.country || null,
      });

      return {
        variantId: String(variantId),
        variantName: variant.name || String(variantId),
        isNewAssignment: true,
        config: variant.config || {},
      };
    } catch (error) {
      const logger = require('../utils/logger');
      logger.error('Error in getVariant', { error: error.message, testId, userId, shopDomain });
      throw error;
    }
  }

  /**
   * Select a variant based on traffic allocation
   * Uses consistent hashing to ensure even distribution
   *
   * @param {Array} variants - Array of test variants
   * @param {string} userId - User identifier
   * @returns {Object} Selected variant
   */
  selectVariant(variants, userId, holdoutPercent = 0) {
    if (!variants || variants.length === 0) {
      return null;
    }
    // Create a hash from userId
    const hash = crypto
      .createHash('md5')
      .update(String(userId || ''))
      .digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);

    // Calculate cumulative allocation percentages
    let cumulative = 0;
    const randomBucket = (hashInt % 10000) / 100; // 0-100 range with two decimals

    if (holdoutPercent > 0 && randomBucket < holdoutPercent) {
      return {
        id: 'holdout',
        name: 'Holdout',
        allocation: holdoutPercent,
        config: {},
      };
    }

    const remainingPercent = 100 - holdoutPercent;
    const random = randomBucket - holdoutPercent; // 0 - remainingPercent

    for (const variant of variants) {
      cumulative += (variant.allocation / 100) * remainingPercent;
      if (random < cumulative) {
        return variant;
      }
    }

    // Fallback to last variant
    return variants[variants.length - 1];
  }

  /**
   * Build Map for O(1) variant lookup by id or name
   * @param {Array} variants
   * @returns {Map<string, Object>}
   */
  _buildVariantMap(variants) {
    const map = new Map();
    for (const v of variants || []) {
      if (v?.id) {
        map.set(v.id, v);
      }
      if (v?.name && !map.has(v.name)) {
        map.set(v.name, v);
      }
    }
    return map;
  }

  /**
   * Get variants for a user across multiple tests (batch, 2 DB queries instead of 2N)
   *
   * @param {string[]} testIds - Test IDs
   * @param {string} userId - User identifier
   * @param {string} shopDomain - Shop domain
   * @param {Object} context - Base user context for targeting
   * @param {Object} [contextOverrides] - Per-test context overrides, e.g. { testId: { js_targeting_passed: true } }
   * @returns {Promise<Object>} { [testId]: variant }
   */
  async getVariantsBatch(testIds, userId, shopDomain, context = {}, contextOverrides = {}) {
    const ids = [...new Set((testIds || []).filter(Boolean))];
    if (ids.length === 0) {
      return {};
    }

    const [testsMap, assignmentsMap] = await Promise.all([
      getTestsByIds(ids, shopDomain),
      getTestAssignmentsBatch(userId, shopDomain, ids),
    ]);

    const result = {};
    const toSave = [];

    for (const testId of ids) {
      const test = testsMap.get(testId);
      if (!test || test.status !== 'running') {
        continue;
      }
      const testContext = { ...context, ...(contextOverrides[testId] || {}) };
      if (!this.isUserEligible(test, testContext)) {
        continue;
      }

      const rampPercent = test.segments?.traffic_ramp_percent;
      if (
        rampPercent !== null &&
        rampPercent !== undefined &&
        rampPercent > 0 &&
        rampPercent < 100
      ) {
        const startedAt = test.started_at ? new Date(test.started_at) : null;
        const rampDays = 7;
        let effectivePercent = rampPercent;
        if (startedAt) {
          const daysSinceStart = (Date.now() - startedAt.getTime()) / (24 * 60 * 60 * 1000);
          effectivePercent = Math.min(
            100,
            rampPercent + (daysSinceStart / rampDays) * (100 - rampPercent)
          );
        }
        const hash = crypto
          .createHash('md5')
          .update(String(userId || ''))
          .digest('hex');
        const bucket = parseInt(hash.substring(0, 8), 16) % 100;
        if (bucket >= effectivePercent) {
          continue;
        }
      }

      const existingAssignment = assignmentsMap.get(testId);
      if (existingAssignment) {
        const variantMap = this._buildVariantMap(test.variants);
        const matchedVariant =
          variantMap.get(existingAssignment.variant_id) ??
          variantMap.get(existingAssignment.variant_name) ??
          (test.variants || []).find(
            v =>
              v?.id === existingAssignment.variant_id || v?.name === existingAssignment.variant_name
          );
        result[testId] = {
          variantId: existingAssignment.variant_id,
          variantName: existingAssignment.variant_name,
          isNewAssignment: false,
          config: matchedVariant?.config || {},
        };
        continue;
      }

      const variant = this.selectVariant(test.variants, userId, test.holdout_percent || 0);
      if (!variant) {
        continue;
      }

      result[testId] = {
        variantId: variant.id,
        variantName: variant.name,
        isNewAssignment: true,
        config: variant.config || {},
      };
      toSave.push({
        test_id: testId,
        user_id: userId,
        shop_domain: shopDomain,
        variant_id: variant.id,
        variant_name: variant.name,
        assigned_at: new Date(),
        device: context.device || null,
        country: context.country || null,
      });
    }

    await Promise.all(toSave.map(a => saveTestAssignment(a)));

    return result;
  }

  /**
   * Check if user-agent looks like a bot/crawler
   */
  _isBotUserAgent(ua) {
    if (!ua || typeof ua !== 'string') {
      return false;
    }
    const u = ua.toLowerCase();
    const botPatterns = [
      'bot',
      'crawler',
      'spider',
      'slurp',
      'googlebot',
      'bingbot',
      'yandexbot',
      'baiduspider',
      'facebookexternalhit',
      'twitterbot',
      'rogerbot',
      'linkedinbot',
      'embedly',
      'quora link preview',
      'showyoubot',
      'outbrain',
      'pinterest',
      'slackbot',
      'vkshare',
      'w3c_validator',
      'whatsapp',
      'duckduckbot',
      'applebot',
      'semrushbot',
      'ahrefsbot',
      'mj12bot',
      'dotbot',
      'petalbot',
      'bytespider',
    ];
    return botPatterns.some(p => u.includes(p));
  }

  /**
   * Check if IP looks internal (private ranges, localhost)
   */
  _isInternalIP(ip) {
    if (!ip || typeof ip !== 'string') {
      return false;
    }
    const trimmed = ip.trim();
    if (trimmed === '127.0.0.1' || trimmed === '::1' || trimmed === 'localhost') {
      return true;
    }
    if (
      /^10\./.test(trimmed) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(trimmed) ||
      /^192\.168\./.test(trimmed)
    ) {
      return true;
    }
    return false;
  }

  /**
   * Check if user meets segmentation criteria
   */
  isUserEligible(test, context = {}) {
    const segments = test.segments || {};

    // Exclude bots by user-agent
    if (segments.exclude_bots === true && context.user_agent) {
      if (this._isBotUserAgent(context.user_agent)) {
        return false;
      }
    }

    // Exclude internal IPs (office/VPN)
    if (segments.exclude_internal_ips === true && context.user_ip) {
      if (this._isInternalIP(context.user_ip)) {
        return false;
      }
    }

    // JS targeting: evaluated client-side, result passed in context
    const jsTargeting = segments.js_targeting;
    if (jsTargeting && jsTargeting.enabled && jsTargeting.code) {
      const passed = context.js_targeting_passed;
      if (passed === false) {
        return false;
      }
    }

    // Page rules: multiple include/exclude URL patterns with match_type
    const pageRules = segments.page_rules;
    if (Array.isArray(pageRules) && pageRules.length > 0 && context.current_url) {
      const url = String(context.current_url);
      const matchUrl = rule => {
        const pattern = rule.pattern || '';
        const matchType = rule.match_type || 'regex';
        switch (matchType) {
          case 'contains':
            return url.includes(pattern);
          case 'starts_with':
            return url.startsWith(pattern);
          case 'ends_with':
            return url.endsWith(pattern);
          case 'equals':
            return url === pattern;
          case 'regex':
          default:
            try {
              return new RegExp(pattern).test(url);
            } catch {
              return url.includes(pattern);
            }
        }
      };
      const excludes = pageRules.filter(r => r.type === 'exclude');
      const includes = pageRules.filter(r => r.type === 'include');
      for (const r of excludes) {
        if (matchUrl(r)) {
          return false;
        }
      }
      if (includes.length > 0) {
        const anyMatch = includes.some(matchUrl);
        if (!anyMatch) {
          return false;
        }
      }
    } else {
      // Legacy: single url_pattern
      const urlPattern = segments.url_pattern;
      if (urlPattern && urlPattern.trim() && context.current_url) {
        try {
          const re = new RegExp(urlPattern.trim());
          if (!re.test(String(context.current_url))) {
            return false;
          }
        } catch {
          return false;
        }
      }
    }

    // Device rules: multiple include/exclude
    const deviceRules = segments.device_rules;
    if (Array.isArray(deviceRules) && deviceRules.length > 0 && context.device) {
      const dev = String(context.device).toLowerCase();
      const excludes = deviceRules.filter(r => r.type === 'exclude' && r.value === dev);
      if (excludes.length > 0) {
        return false;
      }
      const includes = deviceRules.filter(r => r.type === 'include');
      if (includes.length > 0) {
        const anyMatch = includes.some(r => r.value === dev);
        if (!anyMatch) {
          return false;
        }
      }
    } else {
      // Legacy: single device
      const device = (segments.device || 'all').toLowerCase();
      if (device !== 'all' && context.device && context.device.toLowerCase() !== device) {
        return false;
      }
    }

    // Audience rules: multiple include/exclude (customer, country)
    const audienceRules = segments.audience_rules;
    if (Array.isArray(audienceRules) && audienceRules.length > 0) {
      const includesByField = {};
      for (const r of audienceRules) {
        if (r.type === 'exclude') {
          if (r.field === 'customer' && context.customer) {
            const match =
              String(context.customer).toLowerCase() === String(r.value || '').toLowerCase();
            if (match) {
              return false;
            }
          } else if (r.field === 'country' && context.country) {
            const countries = Array.isArray(r.value) ? r.value : [r.value];
            const countrySet = new Set(countries.map(c => String(c).toLowerCase()));
            if (countrySet.has(String(context.country).toLowerCase())) {
              return false;
            }
          }
        } else if (r.type === 'include') {
          if (!includesByField[r.field]) {
            includesByField[r.field] = [];
          }
          includesByField[r.field].push(r);
        }
      }
      for (const [field, rules] of Object.entries(includesByField)) {
        if (field === 'customer') {
          const ctxVal = String(context.customer || '').toLowerCase();
          const anyMatch = rules.some(r => String(r.value || '').toLowerCase() === ctxVal);
          if (!anyMatch && rules.length > 0) {
            return false;
          }
        } else if (field === 'country') {
          const ctxVal = String(context.country || '').toLowerCase();
          const anyMatch = rules.some(r => {
            const vals = Array.isArray(r.value) ? r.value : [r.value];
            const valSet = new Set(vals.map(v => String(v).toLowerCase()));
            return valSet.has(ctxVal);
          });
          if (!anyMatch && rules.length > 0) {
            return false;
          }
        }
      }
    } else {
      // Legacy: single customer and countries
      const customer = (segments.customer || 'all').toLowerCase();
      const countries = Array.isArray(segments.countries) ? segments.countries : [];
      if (customer !== 'all' && context.customer && context.customer.toLowerCase() !== customer) {
        return false;
      }
      if (countries.length > 0 && context.country) {
        const countrySet = new Set(countries.map(c => String(c).toLowerCase()));
        if (!countrySet.has(String(context.country).toLowerCase())) {
          return false;
        }
      }
    }

    // Advanced targeting: traffic source
    const trafficSource = (segments.traffic_source || 'all').toLowerCase();
    if (trafficSource !== 'all' && context.traffic_source) {
      const ctxSource = String(context.traffic_source).toLowerCase();
      if (ctxSource !== trafficSource) {
        return false;
      }
    }

    // Advanced targeting: minimum sessions
    const minSessions = segments.min_sessions;
    if (minSessions !== null && minSessions !== undefined && minSessions > 0) {
      const sessionCount = Number(context.session_count);
      if (Number.isNaN(sessionCount) || sessionCount < minSessions) {
        return false;
      }
    }

    // Custom targeting rules (AND combined)
    const customRules = segments.custom_rules;
    if (Array.isArray(customRules) && customRules.length > 0) {
      for (const rule of customRules) {
        if (!rule || !rule.field || rule.value === null || rule.value === undefined) {
          continue;
        }
        const field = String(rule.field).toLowerCase();
        const op = (rule.operator || 'equals').toLowerCase();
        const val = rule.value;
        const ctxVal = context[field] ?? context[`utm_${field.replace('utm_', '')}`] ?? '';

        const matches = (() => {
          const strCtx = String(ctxVal || '').toLowerCase();
          const strVal = String(val || '').toLowerCase();
          if (op === 'equals') {
            return strCtx === strVal;
          }
          if (op === 'contains') {
            return strCtx.includes(strVal);
          }
          if (op === 'regex') {
            try {
              return new RegExp(val).test(ctxVal);
            } catch {
              return false;
            }
          }
          if (op === 'in' && Array.isArray(val)) {
            const valSet = new Set(val.map(v => String(v).toLowerCase()));
            return valSet.has(strCtx);
          }
          return false;
        })();

        if (!matches) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Validate test configuration
   *
   * @param {Object} testConfig - Test configuration
   * @returns {Object} Validation result
   */
  validateTest(testConfig) {
    const errors = [];

    // Check test name
    if (!testConfig.name || testConfig.name.trim().length === 0) {
      errors.push('Test name is required');
    }

    // Check test type
    const validTypes = [
      'price',
      'content',
      'shipping',
      'offer',
      'theme',
      'checkout',
      'combination',
    ];
    if (!validTypes.includes(testConfig.type)) {
      errors.push(`Test type must be one of: ${validTypes.join(', ')}`);
    }

    // Check variants
    if (!testConfig.variants || testConfig.variants.length < 2) {
      errors.push('At least 2 variants are required');
    }

    // Check allocation percentages
    if (testConfig.variants) {
      const totalAllocation = testConfig.variants.reduce(
        (sum, v) => sum + (Number(v.allocation) || 0),
        0
      );

      if (Math.abs(totalAllocation - 100) > 0.01) {
        errors.push('Variant allocations must sum to 100%');
      }

      // Check each variant has required fields
      testConfig.variants.forEach((variant, index) => {
        if (!variant.name) {
          errors.push(`Variant ${index + 1} must have a name`);
        }
        // Config is optional, but ensure it exists (can be empty object)
        if (variant.config === undefined) {
          variant.config = {};
        }
      });
    }

    const holdoutPercent = testConfig.holdout_percent;
    if (holdoutPercent !== undefined && holdoutPercent !== null) {
      const holdoutValue = Number(holdoutPercent);
      if (Number.isNaN(holdoutValue) || holdoutValue < 0 || holdoutValue > 50) {
        errors.push('Holdout percent must be between 0 and 50');
      }
    }

    if (testConfig.segments) {
      const { device, customer, countries, traffic_source, url_pattern, min_sessions } =
        testConfig.segments;
      const validDevices = ['all', 'desktop', 'mobile'];
      const validCustomers = ['all', 'new', 'returning'];
      const validTrafficSources = ['all', 'organic', 'paid', 'social', 'email', 'referral'];

      if (device && !validDevices.includes(String(device).toLowerCase())) {
        errors.push('Segment device must be one of: all, desktop, mobile');
      }

      if (customer && !validCustomers.includes(String(customer).toLowerCase())) {
        errors.push('Segment customer must be one of: all, new, returning');
      }

      if (countries !== undefined && countries !== null) {
        if (!Array.isArray(countries)) {
          errors.push('Segment countries must be an array of country codes');
        }
      }

      if (traffic_source && !validTrafficSources.includes(String(traffic_source).toLowerCase())) {
        errors.push(
          'Segment traffic_source must be one of: all, organic, paid, social, email, referral'
        );
      }

      if (
        url_pattern !== null &&
        url_pattern !== undefined &&
        url_pattern !== '' &&
        typeof url_pattern === 'string'
      ) {
        try {
          new RegExp(url_pattern.trim());
        } catch {
          errors.push('Segment url_pattern must be a valid regex');
        }
      }

      if (min_sessions !== undefined && min_sessions !== null && min_sessions !== '') {
        const n = Number(min_sessions);
        if (Number.isNaN(n) || n < 0) {
          errors.push('Segment min_sessions must be a non-negative number');
        }
      }
    }

    // Check goal configuration
    if (!testConfig.goal || !testConfig.goal.type) {
      errors.push('Test goal is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if test has reached statistical significance
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Significance result
   */
  async checkStatisticalSignificance(testId, shopDomain) {
    // Get analytics and calculate significance
    const analyticsService = require('./analytics');
    const analytics = await analyticsService.getTestAnalytics(testId, shopDomain);
    return (
      analytics.significance || {
        significant: false,
        pValue: 1,
        confidence: 0,
        message: 'Insufficient data',
      }
    );
  }

  /**
   * Start a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Updated test
   */
  async startTest(testId, shopDomain) {
    const { updateTestStatus } = require('../models/test');
    return updateTestStatus(testId, shopDomain, 'running');
  }

  /**
   * Stop a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} Updated test
   */
  async stopTest(testId, shopDomain) {
    const { updateTestStatus } = require('../models/test');
    return updateTestStatus(testId, shopDomain, 'stopped');
  }
}

module.exports = new ABTestEngine();
