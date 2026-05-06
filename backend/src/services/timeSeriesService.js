/**
 * Time-Series Analytics Service
 *
 * Handles daily aggregation and time-series analytics
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

function normalizeShopDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isExpectedRollupUnavailable(error = {}) {
  const message = String(error.message || '');
  return (
    error.code === '42883' ||
    error.code === '42P01' ||
    message.includes('refresh_analytics_daily_segments')
  );
}

function normalApproxDifferenceInterval(
  controlRate,
  variantRate,
  controlVisitors,
  variantVisitors
) {
  if (controlVisitors <= 0 || variantVisitors <= 0) {
    return { absoluteLow: 0, absoluteHigh: 0, relativeLow: 0, relativeHigh: 0 };
  }
  const variance =
    (controlRate * (1 - controlRate)) / controlVisitors +
    (variantRate * (1 - variantRate)) / variantVisitors;
  const margin = 1.96 * Math.sqrt(Math.max(0, variance));
  const absoluteLift = variantRate - controlRate;
  return {
    absoluteLow: (absoluteLift - margin) * 100,
    absoluteHigh: (absoluteLift + margin) * 100,
    relativeLow: controlRate > 0 ? ((absoluteLift - margin) / controlRate) * 100 : 0,
    relativeHigh: controlRate > 0 ? ((absoluteLift + margin) / controlRate) * 100 : 0,
  };
}

function addCumulativeEffects(chartRows, options = {}) {
  const totalsByVariant = new Map();
  const controlVariantName = options.controlVariantName;
  return chartRows.map(point => {
    const variantNames = Object.keys(point).filter(key => key !== 'date' && key !== 'name');
    variantNames.forEach(variantName => {
      const bucket = point[variantName];
      if (!bucket || typeof bucket !== 'object') {
        return;
      }
      const previous = totalsByVariant.get(variantName) || {
        visitors: 0,
        conversions: 0,
        revenue: 0,
      };
      const visitors = previous.visitors + (Number(bucket.visitors) || 0);
      const conversions = previous.conversions + (Number(bucket.conversions) || 0);
      const revenue = previous.revenue + (Number(bucket.revenue) || 0);
      totalsByVariant.set(variantName, { visitors, conversions, revenue });
    });

    const controlName =
      controlVariantName && totalsByVariant.has(controlVariantName)
        ? controlVariantName
        : variantNames.find(name => totalsByVariant.has(name));
    const controlTotals = totalsByVariant.get(controlName) || {
      visitors: 0,
      conversions: 0,
      revenue: 0,
    };
    const controlRate =
      controlTotals.visitors > 0 ? controlTotals.conversions / controlTotals.visitors : 0;

    variantNames.forEach(variantName => {
      const bucket = point[variantName];
      const totals = totalsByVariant.get(variantName) || {
        visitors: 0,
        conversions: 0,
        revenue: 0,
      };
      const rate = totals.visitors > 0 ? totals.conversions / totals.visitors : 0;
      const absoluteLift = (rate - controlRate) * 100;
      const cumulativeLift = controlRate > 0 ? ((rate - controlRate) / controlRate) * 100 : 0;
      const interval = normalApproxDifferenceInterval(
        controlRate,
        rate,
        controlTotals.visitors,
        totals.visitors
      );
      point[variantName] = {
        ...bucket,
        cumulativeVisitors: totals.visitors,
        cumulativeConversions: totals.conversions,
        cumulativeRevenue: totals.revenue,
        cumulativeConversionRate: rate * 100,
        cumulativeAbsoluteLift: absoluteLift,
        cumulativeLift,
        cumulativeCiLow: interval.relativeLow,
        cumulativeCiHigh: interval.relativeHigh,
        cumulativeAbsoluteCiLow: interval.absoluteLow,
        cumulativeAbsoluteCiHigh: interval.absoluteHigh,
      };
    });
    return point;
  });
}

class TimeSeriesService {
  /**
   * Get time-series data for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @returns {Promise<Array>} Time-series data
   */
  async getTimeSeriesData(testId, shopDomain, startDate = null, endDate = null) {
    let sql = `
      SELECT 
        ad.date,
        ad.variant_id,
        ad.variant_name,
        ad.visitors,
        ad.conversions,
        ad.revenue,
        CASE 
          WHEN ad.visitors > 0 THEN (ad.conversions::DECIMAL / ad.visitors * 100)
          ELSE 0
        END as conversion_rate
      FROM analytics_daily ad
      INNER JOIN tests t ON t.id = ad.test_id
      WHERE ad.test_id = $1 AND LOWER(TRIM(t.shop_domain)) = LOWER(TRIM($2))
    `;

    const params = [testId, normalizeShopDomain(shopDomain)];

    if (startDate) {
      sql += ' AND ad.date >= $3';
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND ad.date <= $${params.length + 1}`;
      params.push(endDate);
    }

    sql += ' ORDER BY ad.date ASC, ad.variant_name ASC';

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Aggregate daily analytics (should be run daily via cron)
   *
   * @param {Date} date - Date to aggregate (defaults to yesterday)
   * @returns {Promise<void>}
   */
  async aggregateDailyAnalytics(date = null) {
    const targetDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Get all active tests with their variants
    const testsSql = `
      SELECT t.id as test_id, t.shop_domain, t.variants
      FROM tests t
      WHERE t.status = 'running'
    `;

    const testsResult = await query(testsSql);

    for (const test of testsResult.rows) {
      // Parse variants to get all variant_id and variant_name (include holdout if present)
      let variants = [];
      try {
        const v =
          typeof test.variants === 'string' ? JSON.parse(test.variants) : test.variants || [];
        variants = Array.isArray(v) ? v : [];
      } catch {
        variants = [];
      }
      const variantList = variants
        .filter(v => v && (v.id || v.variant_id) && v.name)
        .map(v => ({ id: v.id || v.variant_id, name: v.name }));

      if (variantList.length === 0) {
        continue;
      }

      for (const variant of variantList) {
        const variantId = String(variant.id);
        const variantName = String(variant.name);

        // Get visitors assigned on this date for this variant
        const visitorsSql = `
          SELECT COUNT(DISTINCT user_id) as visitors
          FROM test_assignments
          WHERE test_id = $1 AND variant_id = $2 AND (assigned_at AT TIME ZONE 'UTC')::date = $3
        `;
        const visitorsResult = await query(visitorsSql, [test.test_id, variantId, dateStr]);
        const visitors = parseInt(visitorsResult.rows[0]?.visitors || 0, 10);

        // Get conversions for this variant and date (JOIN ensures only assigned users)
        const conversionsSql = `
          SELECT 
            COUNT(DISTINCT e.user_id) as conversions,
            COALESCE(SUM(e.event_value), 0) as revenue
          FROM events e
          INNER JOIN test_assignments ta ON ta.test_id = e.test_id AND ta.user_id = e.user_id AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain)) AND ta.variant_id = e.variant_id
          WHERE e.test_id = $1
            AND e.variant_id = $2
            AND e.event_type = 'conversion'
            AND (e.created_at AT TIME ZONE 'UTC')::date = $3
        `;

        const conversionsResult = await query(conversionsSql, [test.test_id, variantId, dateStr]);

        const conversions = parseInt(conversionsResult.rows[0]?.conversions || 0, 10);
        const revenue = parseFloat(conversionsResult.rows[0]?.revenue || 0);

        // Insert or update daily analytics (ensures row exists even when visitors=0)
        const upsertSql = `
          INSERT INTO analytics_daily (
            test_id, variant_id, variant_name, date, 
            visitors, conversions, revenue
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (test_id, variant_id, date)
          DO UPDATE SET
            visitors = EXCLUDED.visitors,
            conversions = EXCLUDED.conversions,
            revenue = EXCLUDED.revenue,
            updated_at = NOW()
        `;

        await query(upsertSql, [
          test.test_id,
          variantId,
          variantName,
          dateStr,
          visitors,
          conversions,
          revenue,
        ]);
      }
    }

    // Keep segmented dashboard rollups in sync from the same official Node aggregation path.
    try {
      await query('SELECT refresh_analytics_daily_segments($1::date)', [dateStr]);
    } catch (error) {
      // Migration 063 may not be installed yet in older environments; analytics_daily remains authoritative.
      if (isExpectedRollupUnavailable(error)) {
        logger.warn('Segmented analytics rollup refresh unavailable', {
          date: dateStr,
          error: error.message,
        });
      } else {
        logger.error('Segmented analytics rollup refresh failed', error);
      }
    }
  }

  /**
   * Get aggregated time-series data formatted for charts
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Array>} Chart-ready data
   */
  async getSegmentedChartRows(testId, shopDomain, options = {}) {
    const { device, country, start_date, end_date } = options;
    const normalizedShopDomain = normalizeShopDomain(shopDomain);
    const visitorParams = [testId, normalizedShopDomain];
    const visitorWhere = [
      'ta.test_id = $1',
      'LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM($2))',
      'ta.assigned_at IS NOT NULL',
    ];
    if (device) {
      visitorParams.push(device);
      visitorWhere.push(`ta.device = $${visitorParams.length}`);
    }
    if (country) {
      visitorParams.push(country);
      visitorWhere.push(`ta.country = $${visitorParams.length}`);
    }
    if (start_date) {
      visitorParams.push(start_date);
      visitorWhere.push(`ta.assigned_at >= $${visitorParams.length}`);
    }
    if (end_date) {
      visitorParams.push(end_date);
      visitorWhere.push(`ta.assigned_at < $${visitorParams.length}`);
    }

    const conversionParams = [testId, normalizedShopDomain];
    const conversionWhere = [
      'e.test_id = $1',
      'LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($2))',
      "e.event_type = 'conversion'",
    ];
    if (device) {
      conversionParams.push(device);
      conversionWhere.push(`ta.device = $${conversionParams.length}`);
    }
    if (country) {
      conversionParams.push(country);
      conversionWhere.push(`ta.country = $${conversionParams.length}`);
    }
    if (start_date) {
      conversionParams.push(start_date);
      conversionWhere.push(`e.created_at >= $${conversionParams.length}`);
    }
    if (end_date) {
      conversionParams.push(end_date);
      conversionWhere.push(`e.created_at < $${conversionParams.length}`);
    }
    if (options.conversionWindowDays && options.conversionWindowDays > 0) {
      conversionParams.push(options.conversionWindowDays);
      conversionWhere.push(
        `e.created_at >= ta.assigned_at AND e.created_at <= ta.assigned_at + ($${conversionParams.length} || ' days')::interval`
      );
    }
    if (options.conversionUrl && String(options.conversionUrl).trim()) {
      const urlConditions = String(options.conversionUrl)
        .split(',')
        .map(pattern => pattern.trim())
        .filter(Boolean)
        .map(pattern => {
          conversionParams.push(`%${pattern}%`);
          return `(e.metadata->>'conversion_url')::text ILIKE $${conversionParams.length}`;
        });
      if (urlConditions.length > 0) {
        conversionWhere.push(`(${urlConditions.join(' OR ')})`);
      }
    }

    const visitorsSql = `
      SELECT
        (ta.assigned_at AT TIME ZONE 'UTC')::date as date,
        ta.variant_id,
        MAX(ta.variant_name) as variant_name,
        COUNT(DISTINCT ta.user_id) as visitors
      FROM test_assignments ta
      WHERE ${visitorWhere.join(' AND ')}
      GROUP BY (ta.assigned_at AT TIME ZONE 'UTC')::date, ta.variant_id
    `;
    const conversionsSql = `
      SELECT
        (e.created_at AT TIME ZONE 'UTC')::date as date,
        e.variant_id,
        MAX(ta.variant_name) as variant_name,
        COUNT(DISTINCT e.user_id) as conversions,
        COALESCE(SUM(e.event_value), 0) as revenue
      FROM events e
      INNER JOIN test_assignments ta ON ta.test_id = e.test_id AND ta.user_id = e.user_id AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain)) AND ta.variant_id = e.variant_id
      WHERE ${conversionWhere.join(' AND ')}
      GROUP BY (e.created_at AT TIME ZONE 'UTC')::date, e.variant_id
    `;

    const [visitorsResult, conversionsResult] = await Promise.all([
      query(visitorsSql, visitorParams),
      query(conversionsSql, conversionParams),
    ]);

    const rowsByKey = new Map();
    const ensureRow = row => {
      const dateKey =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date).split('T')[0];
      const key = `${dateKey}:${row.variant_id}`;
      if (!rowsByKey.has(key)) {
        rowsByKey.set(key, {
          date: row.date,
          variant_id: row.variant_id,
          variant_name: row.variant_name || row.variant_id,
          visitors: 0,
          conversions: 0,
          revenue: 0,
          conversion_rate: 0,
        });
      }
      return rowsByKey.get(key);
    };
    visitorsResult.rows.forEach(row => {
      const item = ensureRow(row);
      item.visitors = parseInt(row.visitors, 10) || 0;
      item.variant_name = row.variant_name || item.variant_name;
    });
    conversionsResult.rows.forEach(row => {
      const item = ensureRow(row);
      item.conversions = parseInt(row.conversions, 10) || 0;
      item.revenue = parseFloat(row.revenue) || 0;
      item.variant_name = row.variant_name || item.variant_name;
    });

    return Array.from(rowsByKey.values())
      .map(row => ({
        ...row,
        conversion_rate: row.visitors > 0 ? (row.conversions / row.visitors) * 100 : 0,
      }))
      .sort(
        (a, b) =>
          new Date(a.date) - new Date(b.date) ||
          String(a.variant_name).localeCompare(b.variant_name)
      );
  }

  async getSegmentedRollupRows(testId, shopDomain, options = {}) {
    const { device, country, start_date, end_date } = options;
    const params = [testId, normalizeShopDomain(shopDomain)];
    const where = ['test_id = $1', 'LOWER(TRIM(shop_domain)) = LOWER(TRIM($2))'];
    if (device) {
      params.push(device);
      where.push(`device = $${params.length}`);
    }
    if (country) {
      params.push(country);
      where.push(`country = $${params.length}`);
    }
    if (start_date) {
      params.push(start_date);
      where.push(`date >= $${params.length}`);
    }
    if (end_date) {
      params.push(end_date);
      where.push(`date < $${params.length}`);
    }

    const sql = `
      SELECT
        date,
        variant_id,
        variant_name,
        SUM(visitors)::integer as visitors,
        SUM(conversions)::integer as conversions,
        COALESCE(SUM(revenue), 0) as revenue,
        CASE
          WHEN SUM(visitors) > 0 THEN (SUM(conversions)::DECIMAL / SUM(visitors) * 100)
          ELSE 0
        END as conversion_rate
      FROM analytics_daily_segments
      WHERE ${where.join(' AND ')}
      GROUP BY date, variant_id, variant_name
      ORDER BY date ASC, variant_name ASC
    `;

    try {
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      if (isExpectedRollupUnavailable(error)) {
        logger.warn(
          'Segmented analytics rollup table unavailable, falling back to raw time-series',
          {
            testId,
            shopDomain: normalizeShopDomain(shopDomain),
            error: error.message,
          }
        );
      } else {
        logger.error(
          'Segmented analytics rollup query failed, falling back to raw time-series',
          error
        );
      }
      return [];
    }
  }

  async getChartData(testId, shopDomain, options = {}) {
    const hasScopedOptions = Boolean(
      options.device ||
      options.country ||
      options.start_date ||
      options.end_date ||
      options.conversionWindowDays ||
      options.conversionUrl
    );
    let rawData;
    if (hasScopedOptions) {
      const canUseSegmentRollup = !options.conversionWindowDays && !options.conversionUrl;
      rawData = canUseSegmentRollup
        ? await this.getSegmentedRollupRows(testId, shopDomain, options)
        : [];
      if (rawData.length === 0) {
        rawData = await this.getSegmentedChartRows(testId, shopDomain, options);
      }
    } else {
      rawData = await this.getTimeSeriesData(testId, shopDomain);
    }

    // Group by date and format for charts
    const dateMap = {};

    rawData.forEach(row => {
      const dateKey =
        row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date).split('T')[0];

      if (!dateMap[dateKey]) {
        dateMap[dateKey] = {
          date: dateKey,
          name: new Date(dateKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        };
      }

      dateMap[dateKey][row.variant_name] = {
        visitors: row.visitors,
        conversions: row.conversions,
        revenue: parseFloat(row.revenue),
        conversionRate: parseFloat(row.conversion_rate),
      };
    });

    return addCumulativeEffects(Object.values(dateMap), options);
  }
}

module.exports = new TimeSeriesService();
