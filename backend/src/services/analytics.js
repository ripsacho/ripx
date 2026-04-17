/**
 * Analytics Service
 *
 * Handles analytics calculations for AB tests:
 * - Conversion rates
 * - Statistical significance
 * - Revenue impact
 * - Confidence intervals
 */

const { query } = require('../utils/database');
const { getTestAnalytics, getSecondaryEventMetrics } = require('../models/analytics');
const { getTestById } = require('../models/test');
const { STATISTICAL_THRESHOLD, SETTINGS_BOUNDS } = require('../constants');

const CHECKOUT_SECTION_EVENT_NAMES = Object.freeze([
  'checkout_section_impression',
  'checkout_section_cta_click',
  'checkout_section_offer_apply',
]);

class AnalyticsService {
  /**
   * Calculate conversion rate
   *
   * @param {number} conversions - Number of conversions
   * @param {number} visitors - Number of visitors
   * @returns {number} Conversion rate as percentage
   */
  calculateConversionRate(conversions, visitors) {
    const v = Number(visitors) || 0;
    const c = Number(conversions) || 0;
    if (v <= 0 || !Number.isFinite(c)) {
      return 0;
    }
    return (c / v) * 100;
  }

  /**
   * Calculate statistical significance using Z-test or Fisher's exact (small samples)
   *
   * @param {Object} variantA - Control variant data
   * @param {Object} variantB - Test variant data
   * @param {Object} options - { significanceThreshold: 0.05 }
   * @returns {Object} Significance results
   */
  calculateSignificance(variantA, variantB, options = {}) {
    const n1 = Number(variantA?.visitors) || 0;
    const n2 = Number(variantB?.visitors) || 0;
    const x1 = Number(variantA?.conversions) || 0;
    const x2 = Number(variantB?.conversions) || 0;
    const threshold = Number(options.significanceThreshold) || STATISTICAL_THRESHOLD.P_VALUE;

    if (n1 <= 0 || n2 <= 0 || !Number.isFinite(x1) || !Number.isFinite(x2)) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        confidenceInterval: null,
        message: 'Insufficient data',
      };
    }

    const p1 = x1 / n1;
    const p2 = x2 / n2;
    const totalN = n1 + n2;
    const totalX = x1 + x2;
    const p = totalX / totalN;
    const q = 1 - p;

    // Use Fisher's exact for small samples (expected cell count < 5)
    const expectedMin = Math.min(n1 * p, n1 * q, n2 * p, n2 * q);
    const useFisher = totalN < 30 || expectedMin < 5;

    let pValue;
    if (useFisher) {
      pValue = this._fisherExactTwoTailed(x1, n1 - x1, x2, n2 - x2);
      pValue = Math.min(1, Math.max(0, pValue));
    } else {
      const se = Math.sqrt(p * q * (1 / n1 + 1 / n2));
      if (se === 0) {
        return {
          significant: false,
          pValue: 1,
          confidence: 0,
          confidenceInterval: null,
          message: 'Cannot calculate significance',
        };
      }
      const z = (p1 - p2) / se;
      pValue = 2 * (1 - this.normalCDF(Math.abs(z)));
    }

    const confidence = (1 - pValue) * 100;
    const significant = pValue < threshold;
    const lift = p1 > 0 ? ((p2 - p1) / p1) * 100 : 0;
    let winner = null;
    if (significant) {
      winner = p2 > p1 ? 'variantB' : 'variantA';
    }

    // Wilson score 95% confidence interval for lift (variantB vs variantA)
    const ciA = this._wilsonScoreInterval(x1, n1, 0.95);
    const ciB = this._wilsonScoreInterval(x2, n2, 0.95);

    return {
      significant,
      pValue: Math.round(pValue * 10000) / 10000,
      confidence: Math.round(confidence * 100) / 100,
      lift: Math.round(lift * 100) / 100,
      winner,
      zScore: !useFisher
        ? Math.round(((p1 - p2) / Math.sqrt(p * q * (1 / n1 + 1 / n2))) * 100) / 100
        : null,
      method: useFisher ? 'fisher' : 'ztest',
      confidenceInterval: {
        variantA: ciA,
        variantB: ciB,
      },
    };
  }

  /**
   * Fisher's exact test (two-tailed) for 2x2 contingency table
   * Hypergeometric distribution for a, b, c, d
   */
  _fisherExactTwoTailed(a, b, c, d) {
    const n = a + b + c + d;
    const r1 = a + b;
    const c1 = a + c;
    const minA = Math.max(0, r1 + c1 - n);
    const maxA = Math.min(r1, c1);

    let p = 0;
    const logChoose = (n, k) => {
      if (k < 0 || k > n) {
        return -Infinity;
      }
      let r = 0;
      for (let i = 0; i < k; i++) {
        r += Math.log(n - i) - Math.log(i + 1);
      }
      return r;
    };

    const prob = aVal => {
      const bVal = r1 - aVal;
      const cVal = c1 - aVal;
      const dVal = n - r1 - cVal;
      if (bVal < 0 || cVal < 0 || dVal < 0) {
        return 0;
      }
      return Math.exp(logChoose(r1, aVal) + logChoose(n - r1, cVal) - logChoose(n, c1));
    };

    const pObs = prob(a);
    for (let k = minA; k <= maxA; k++) {
      if (prob(k) <= pObs + 1e-10) {
        p += prob(k);
      }
    }
    return Math.min(1, p);
  }

  /**
   * Wilson score interval for proportion
   * @returns {{ low: number, high: number }} as percentage 0-100
   */
  _wilsonScoreInterval(x, n, conf = 0.95) {
    if (n <= 0) {
      return { low: 0, high: 0 };
    }
    const z = conf === 0.95 ? 1.96 : conf === 0.99 ? 2.576 : 1.96;
    const p = x / n;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const margin = (z / denom) * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    return {
      low: Math.max(0, Math.round((center - margin) * 10000) / 100),
      high: Math.min(100, Math.round((center + margin) * 10000) / 100),
    };
  }

  /**
   * Normal cumulative distribution function approximation
   *
   * @param {number} z - Z-score
   * @returns {number} Cumulative probability
   */
  normalCDF(z) {
    // Approximation using error function
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  /**
   * Error function approximation
   *
   * @param {number} x - Input value
   * @returns {number} Error function value
   */
  erf(x) {
    // Abramowitz and Stegun approximation
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Calculate revenue impact
   *
   * @param {Object} variantA - Control variant
   * @param {Object} variantB - Test variant
   * @returns {Object} Revenue impact
   */
  calculateRevenueImpact(variantA, variantB) {
    const revenueA = Number(variantA?.revenue) || 0;
    const revenueB = Number(variantB?.revenue) || 0;
    const visitorsA = Number(variantA?.visitors) || 0;
    const visitorsB = Number(variantB?.visitors) || 0;

    const rpvA = visitorsA > 0 && Number.isFinite(revenueA) ? revenueA / visitorsA : 0;
    const rpvB = visitorsB > 0 && Number.isFinite(revenueB) ? revenueB / visitorsB : 0;

    const impact = revenueB - revenueA;
    const impactPercent = revenueA > 0 ? (impact / revenueA) * 100 : 0;

    return {
      controlRevenue: revenueA,
      testRevenue: revenueB,
      impact: Math.round(impact * 100) / 100,
      impactPercent: Math.round(impactPercent * 100) / 100,
      revenuePerVisitor: {
        control: Math.round(rpvA * 100) / 100,
        test: Math.round(rpvB * 100) / 100,
      },
    };
  }

  _getBuiltInCheckoutEventNames(test = {}) {
    const type = String(test?.type || '')
      .trim()
      .toLowerCase();
    const checkoutPhase = String(test?.goal?.checkout_phase || '')
      .trim()
      .toLowerCase();
    if (type !== 'checkout' || checkoutPhase !== 'experience') {
      return [];
    }
    return [...CHECKOUT_SECTION_EVENT_NAMES];
  }

  /**
   * Sample Ratio Mismatch (SRM) detection
   * Detects if observed traffic split deviates significantly from expected allocation.
   * SRM indicates data quality issues (e.g. bot traffic, tracking bugs, assignment skew).
   *
   * @param {Array} variants - Variants with visitors and allocation
   * @param {number} totalVisitors - Total visitors across all variants
   * @returns {Object} { detected: boolean, pValue: number, chiSquare: number, message?: string }
   */
  detectSampleRatioMismatch(variants, totalVisitors) {
    if (!variants || variants.length < 2 || totalVisitors < 100) {
      return { detected: false, pValue: 1, chiSquare: 0 };
    }

    let chiSquare = 0;
    const df = variants.length - 1;

    for (const v of variants) {
      const observed = v.visitors || 0;
      const expectedPercent = (v.allocation || 0) / 100;
      const expected = totalVisitors * expectedPercent;
      if (expected > 0) {
        chiSquare += Math.pow(observed - expected, 2) / expected;
      }
    }

    // Chi-square to p-value (approximation for df=1,2,...)
    const pValue = this._chiSquareToPValue(chiSquare, df);
    const detected = pValue < 0.001; // Industry standard threshold for SRM

    return {
      detected,
      pValue: Math.round(pValue * 10000) / 10000,
      chiSquare: Math.round(chiSquare * 100) / 100,
      message: detected
        ? 'Sample ratio mismatch detected. Traffic split deviates from expected—check for tracking issues or bot traffic.'
        : null,
    };
  }

  /**
   * Multi-variant significance (chi-square test + pairwise winner)
   * For A/B/C tests: chi-square for homogeneity, then pairwise vs control for winner
   *
   * @param {Array} variants - All variants with visitors, conversions
   * @param {Object} options - { significanceThreshold: 0.05 }
   * @returns {Object} Significance results
   */
  calculateMultiVariantSignificance(variants, options = {}) {
    const threshold = Number(options.significanceThreshold) || STATISTICAL_THRESHOLD.P_VALUE;
    if (!variants || variants.length < 2) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        method: 'chi2',
        message: 'Insufficient data',
      };
    }

    const totalN = variants.reduce((s, v) => s + (Number(v.visitors) || 0), 0);
    const totalX = variants.reduce((s, v) => s + (Number(v.conversions) || 0), 0);
    const pPooled = totalN > 0 ? totalX / totalN : 0;

    if (totalN <= 0 || !Number.isFinite(pPooled)) {
      return {
        significant: false,
        pValue: 1,
        confidence: 0,
        method: 'chi2',
        message: 'Insufficient data',
      };
    }

    // Chi-square test for homogeneity (2xk contingency: converted vs not, by variant)
    let chiSquare = 0;
    for (const v of variants) {
      const n = Number(v.visitors) || 0;
      const x = Number(v.conversions) || 0;
      if (n <= 0) {
        continue;
      }
      const expectedConverted = n * pPooled;
      const expectedNot = n * (1 - pPooled);
      if (expectedConverted > 0.5) {
        chiSquare += Math.pow(x - expectedConverted, 2) / expectedConverted;
      }
      if (expectedNot > 0.5) {
        chiSquare += Math.pow(n - x - expectedNot, 2) / expectedNot;
      }
    }

    const df = Math.max(1, variants.length - 1);
    const pValue = this._chiSquareToPValue(chiSquare, df);
    const significant = pValue < threshold;

    // Winner: best conversion rate; if significant, compare best vs control (variant 0)
    const control = variants[0];
    const sorted = [...variants].sort((a, b) => {
      const rateA = (a.visitors || 0) > 0 ? (a.conversions || 0) / a.visitors : 0;
      const rateB = (b.visitors || 0) > 0 ? (b.conversions || 0) / b.visitors : 0;
      return rateB - rateA;
    });
    const best = sorted[0];
    let winner = null;
    let pairwisePValue = null;

    if (significant && best && control && best.id !== control.id) {
      const pairSig = this.calculateSignificance(control, best, {
        significanceThreshold: threshold,
      });
      pairwisePValue = pairSig.pValue;
      if (pairSig.significant && pairSig.winner === 'variantB') {
        winner = 'best';
      }
    }

    const confidence = (1 - pValue) * 100;
    const controlRate =
      (control?.visitors || 0) > 0 ? ((control?.conversions || 0) / control.visitors) * 100 : 0;
    const bestRate =
      (best?.visitors || 0) > 0 ? ((best?.conversions || 0) / best.visitors) * 100 : 0;
    const lift = controlRate > 0 ? ((bestRate - controlRate) / controlRate) * 100 : 0;

    return {
      significant,
      pValue: Math.round(pValue * 10000) / 10000,
      confidence: Math.round(confidence * 100) / 100,
      lift: Math.round(lift * 100) / 100,
      winner: winner === 'best' ? 'best' : null,
      winnerVariantId: winner === 'best' ? best?.id : null,
      bestVariantId: best?.id ?? null,
      method: 'chi2',
      chiSquare: Math.round(chiSquare * 100) / 100,
      pairwisePValue,
      confidenceInterval: null,
    };
  }

  /**
   * Chi-square to p-value (upper tail P(X > chiSquare))
   * For df=1: chiSquare = z^2, so p = 2*(1 - normCDF(sqrt(chiSquare)))
   * For df>1: Wilson-Hilferty approximation
   */
  _chiSquareToPValue(chiSquare, df) {
    if (chiSquare <= 0 || df <= 0) {
      return 1;
    }
    if (df === 1) {
      const z = Math.sqrt(chiSquare);
      return 2 * (1 - this.normalCDF(z));
    }
    // Wilson-Hilferty: (chiSquare/df)^(1/3) ~ N(1-2/(9*df), 2/(9*df))
    const u = Math.pow(chiSquare / df, 1 / 3);
    const mu = 1 - 2 / (9 * df);
    const sigma = Math.sqrt(2 / (9 * df));
    const z = (u - mu) / sigma;
    return 1 - this.normalCDF(z);
  }

  /**
   * Extract secondary event names from goal config (backward compatible)
   *
   * @param {Object} goal - Test goal config
   * @returns {string[]} Event names
   */
  _getSecondaryEventNames(goal) {
    if (!goal || typeof goal !== 'object') {
      return [];
    }
    if (Array.isArray(goal.secondary)) {
      return goal.secondary.map(s => s?.event_name || s?.eventName).filter(Boolean);
    }
    return [];
  }

  /**
   * Get comprehensive analytics for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Object} options - Optional segment filters: { device, country }
   * @returns {Promise<Object>} Complete analytics
   */
  async getTestAnalytics(testId, shopDomain, options = {}) {
    // Fetch test first for goal config (conversion window, conversion URL, secondary events)
    let test = null;
    try {
      test = await getTestById(testId, shopDomain);
    } catch {
      // Ignore
    }

    const goal = test?.goal || {};
    const conversionWindowDays =
      options.conversionWindowDays ?? goal.conversion_window_days ?? null;
    const conversionUrl = options.conversionUrl ?? goal.conversion_url ?? null;

    const rawData = await getTestAnalytics(testId, shopDomain, {
      ...options,
      conversionWindowDays: conversionWindowDays || null,
      conversionUrl:
        conversionUrl && String(conversionUrl).trim() ? String(conversionUrl).trim() : null,
    });

    const secondaryEventNames = goal ? this._getSecondaryEventNames(goal) : [];
    const checkoutSectionEventNames = this._getBuiltInCheckoutEventNames(test);
    const eventNamesForMetrics = Array.from(
      new Set([...secondaryEventNames, ...checkoutSectionEventNames])
    );
    let eventMetrics = {};
    if (eventNamesForMetrics.length > 0) {
      eventMetrics = await getSecondaryEventMetrics(
        testId,
        shopDomain,
        eventNamesForMetrics,
        options
      );
    }

    // Calculate metrics for each variant
    const variants = (rawData || []).map(variant => {
      const v = {
        id: variant.variant_id,
        name: variant.variant_name,
        visitors: variant.visitors || 0,
        conversions: variant.conversions || 0,
        conversionRate: this.calculateConversionRate(
          variant.conversions || 0,
          variant.visitors || 0
        ),
        revenue: variant.revenue || 0,
        avgOrderValue: variant.conversions > 0 ? (variant.revenue || 0) / variant.conversions : 0,
        secondaryEvents: {},
        checkoutSectionEvents: {},
      };
      secondaryEventNames.forEach(eventName => {
        const data = eventMetrics[eventName]?.[variant.variant_id];
        v.secondaryEvents[eventName] = {
          count: data?.count ?? 0,
          sum: data?.sum ?? 0,
          rate: v.visitors > 0 ? ((data?.count ?? 0) / v.visitors) * 100 : 0,
        };
      });
      checkoutSectionEventNames.forEach(eventName => {
        const data = eventMetrics[eventName]?.[variant.variant_id];
        v.checkoutSectionEvents[eventName] = {
          count: data?.count ?? 0,
          sum: data?.sum ?? 0,
          rate: v.visitors > 0 ? ((data?.count ?? 0) / v.visitors) * 100 : 0,
        };
      });
      return v;
    });

    if (!rawData || rawData.length < 2) {
      const totalVisitors = variants.reduce((sum, v) => sum + (v.visitors || 0), 0);
      return {
        error: 'Insufficient data for analysis',
        variants,
        secondaryEventNames,
        checkoutSectionEventNames,
        significance: {
          significant: false,
          pValue: 1,
          confidence: 0,
          message:
            rawData?.length === 1 ? 'Need at least 2 variants to compare' : 'No variants with data',
        },
        summary: {
          totalVisitors,
          totalConversions: variants.reduce((sum, v) => sum + (v.conversions || 0), 0),
          totalRevenue: variants.reduce((sum, v) => sum + (v.revenue || 0), 0),
        },
      };
    }

    // Calculate significance (frequentist) or Bayesian probability to beat control
    const analysisMethod = goal.analysis_method || 'frequentist';
    let significanceThreshold = STATISTICAL_THRESHOLD.P_VALUE;
    try {
      const settingsRes = await query(
        'SELECT confidence_level FROM shop_settings WHERE shop_domain = $1',
        [shopDomain]
      );
      const conf =
        Number(settingsRes.rows[0]?.confidence_level) || SETTINGS_BOUNDS.DEFAULT_CONFIDENCE_LEVEL;
      significanceThreshold = 1 - conf;
    } catch {
      // Use default
    }
    let significance;
    if (variants.length === 2) {
      significance = this.calculateSignificance(variants[0], variants[1], {
        significanceThreshold,
      });
    } else if (variants.length > 2) {
      significance = this.calculateMultiVariantSignificance(variants, { significanceThreshold });
    } else {
      significance = { significant: false, pValue: 1, confidence: 0, message: 'Insufficient data' };
    }

    if (analysisMethod === 'bayesian') {
      const control = variants[0];
      const probToBeatControl = variants.map(v => {
        if (v.id === control.id) {
          return { variantId: v.id, variantName: v.name, probabilityToBeatControl: 0.5 };
        }
        const pA = control.conversions / Math.max(1, control.visitors);
        const pB = v.conversions / Math.max(1, v.visitors);
        const nA = control.visitors;
        const nB = v.visitors;
        const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
        const z = se > 0 ? (pB - pA) / se : 0;
        // P(B beats A) = Φ(z) where z = (pB-pA)/SE (normal approximation)
        const prob = this.normalCDF(z);
        return {
          variantId: v.id,
          variantName: v.name,
          probabilityToBeatControl: Math.round(prob * 1000) / 1000,
        };
      });
      significance = { ...significance, bayesian: true, probToBeatControl };
    }

    // Calculate revenue impact
    const revenueImpact = this.calculateRevenueImpact(variants[0], variants[1]);

    // Sample Ratio Mismatch (SRM) detection - data quality check
    const totalVisitors = variants.reduce((sum, v) => sum + v.visitors, 0);
    const holdoutPercent = test?.holdout_percent ?? 0;
    const variantsWithAllocation = variants.map(v => {
      if (v.id === 'holdout' || v.name === 'Holdout') {
        return { ...v, allocation: holdoutPercent || 100 / variants.length };
      }
      const testVariant = (test?.variants || []).find(tv => tv?.id === v.id || tv?.name === v.name);
      return { ...v, allocation: testVariant?.allocation ?? 100 / variants.length };
    });
    const srm = this.detectSampleRatioMismatch(variantsWithAllocation, totalVisitors);

    return {
      testId,
      variants,
      significance,
      analysisMethod: analysisMethod || 'frequentist',
      revenueImpact,
      secondaryEventNames,
      checkoutSectionEventNames,
      srm,
      summary: {
        totalVisitors,
        totalConversions: variants.reduce((sum, v) => sum + v.conversions, 0),
        totalRevenue: variants.reduce((sum, v) => sum + v.revenue, 0),
      },
    };
  }
}

module.exports = new AnalyticsService();
