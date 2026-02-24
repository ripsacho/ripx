/**
 * Analytics Model
 *
 * Database operations for test analytics
 */

const { query } = require('../utils/database');

class AnalyticsModel {
  /**
   * Track a conversion event
   * Deduplicates by order_id when present (storefront + webhook can both fire)
   *
   * @param {Object} eventData - Event data
   * @returns {Promise<Object|null>} Saved event or null if duplicate
   */
  async trackEvent(eventData) {
    const {
      test_id,
      variant_id,
      user_id,
      shop_domain,
      event_type = 'conversion',
      event_name = null,
      event_value = 0,
      metadata,
    } = eventData;

    const meta = metadata && typeof metadata === 'object' ? metadata : {};
    const orderId = meta.order_id != null ? String(meta.order_id) : null; // eslint-disable-line eqeqeq

    if (event_type === 'conversion' && orderId) {
      const dupSql = `
        SELECT 1 FROM events
        WHERE test_id = $1 AND user_id = $2 AND event_type = 'conversion'
          AND metadata->>'order_id' = $3
        LIMIT 1
      `;
      const dupResult = await query(dupSql, [test_id, user_id, orderId]);
      if (dupResult.rows.length > 0) {
        return null;
      }
    }

    const hasEventName = event_name && String(event_name).trim().length > 0;
    const columns = [
      'test_id',
      'variant_id',
      'user_id',
      'shop_domain',
      'event_type',
      'event_value',
      'metadata',
      'created_at',
    ];
    const values = [
      test_id,
      variant_id,
      user_id,
      shop_domain,
      event_type,
      event_value,
      JSON.stringify(meta),
    ];

    if (hasEventName) {
      columns.splice(6, 0, 'event_name');
      values.splice(6, 0, String(event_name).trim().substring(0, 100));
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `
      INSERT INTO events (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;

    const result = await query(sql, values);
    return result.rows[0];
  }

  /**
   * Get analytics for a test
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Object} options - Optional filters: { device, country }
   * @returns {Promise<Array>} Analytics by variant
   */
  async getTestAnalytics(testId, shopDomain, options = {}) {
    const { conversionWindowDays, conversionUrl } = options;

    const runQuery = async (device, country) => {
      const params = [testId, (shopDomain || '').toLowerCase().trim()];
      let paramIndex = 3;

      let visitorWhere = 'ta.test_id = $1 AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM($2))';
      if (device) {
        visitorWhere += ` AND ta.device = $${paramIndex}`;
        params.push(device);
        paramIndex += 1;
      }
      if (country) {
        visitorWhere += ` AND ta.country = $${paramIndex}`;
        params.push(country);
      }

      const visitorsSql = `
      SELECT 
        ta.variant_id,
        ta.variant_name,
        COUNT(DISTINCT ta.user_id) as visitors
      FROM test_assignments ta
      WHERE ${visitorWhere}
      GROUP BY ta.variant_id, ta.variant_name
    `;

      const convJoin =
        'JOIN test_assignments ta ON ta.test_id = e.test_id AND ta.user_id = e.user_id AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain)) AND ta.variant_id = e.variant_id';
      const conversionParams = [testId, (shopDomain || '').toLowerCase().trim()];
      let convIdx = 3;
      let convExtra = '';
      if (device) {
        convExtra += ` AND ta.device = $${convIdx}`;
        conversionParams.push(device);
        convIdx += 1;
      }
      if (country) {
        convExtra += ` AND ta.country = $${convIdx}`;
        conversionParams.push(country);
        convIdx += 1;
      }
      if (conversionWindowDays && conversionWindowDays > 0) {
        convExtra += ` AND e.created_at >= ta.assigned_at AND e.created_at <= ta.assigned_at + ($${convIdx} || ' days')::interval`;
        conversionParams.push(conversionWindowDays);
        convIdx += 1;
      }
      if (conversionUrl && String(conversionUrl).trim()) {
        const patterns = conversionUrl
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);
        if (patterns.length > 0) {
          const conditions = patterns.map((p, _i) => {
            conversionParams.push(`%${p}%`);
            return `(e.metadata->>'conversion_url')::text ILIKE $${conversionParams.length}`;
          });
          convExtra += ` AND (${conditions.join(' OR ')})`;
        }
      }

      const conversionsSql = `
      SELECT 
        e.variant_id,
        COUNT(DISTINCT e.user_id) as conversions,
        COALESCE(SUM(e.event_value), 0) as revenue
      FROM events e
      ${convJoin}
      WHERE e.test_id = $1 
        AND LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($2))
        AND e.event_type = 'conversion'
        ${convExtra}
      GROUP BY e.variant_id
    `;

      const [visitorsResult, conversionsResult] = await Promise.all([
        query(visitorsSql, params),
        query(conversionsSql, conversionParams),
      ]);

      const variantMap = {};
      visitorsResult.rows.forEach(row => {
        variantMap[row.variant_id] = {
          variant_id: row.variant_id,
          variant_name: row.variant_name,
          visitors: parseInt(row.visitors) || 0,
          conversions: 0,
          revenue: 0,
        };
      });

      conversionsResult.rows.forEach(row => {
        if (variantMap[row.variant_id]) {
          variantMap[row.variant_id].conversions = parseInt(row.conversions) || 0;
          variantMap[row.variant_id].revenue = parseFloat(row.revenue) || 0;
        }
      });

      return Object.values(variantMap);
    };

    const { device, country } = options;
    try {
      return runQuery(device, country);
    } catch (err) {
      if (
        (device || country) &&
        (err.message?.includes('device') || err.message?.includes('country'))
      ) {
        return runQuery(null, null);
      }
      throw err;
    }
  }

  /**
   * Get available segment values for breakdown (device, country)
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @returns {Promise<Object>} { devices: string[], countries: string[] }
   */
  async getSegmentBreakdownOptions(testId, shopDomain) {
    try {
      const devicesSql = `
        SELECT DISTINCT device FROM test_assignments
        WHERE test_id = $1 AND shop_domain = $2 AND device IS NOT NULL AND device != ''
        ORDER BY device
      `;
      const countriesSql = `
        SELECT DISTINCT country FROM test_assignments
        WHERE test_id = $1 AND shop_domain = $2 AND country IS NOT NULL AND country != ''
        ORDER BY country
      `;
      const [devicesResult, countriesResult] = await Promise.all([
        query(devicesSql, [testId, shopDomain]),
        query(countriesSql, [testId, shopDomain]),
      ]);
      return {
        devices: devicesResult.rows.map(r => r.device).filter(Boolean),
        countries: countriesResult.rows.map(r => r.country).filter(Boolean),
      };
    } catch (err) {
      return { devices: [], countries: [] };
    }
  }

  /**
   * Get event count by type
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {string} eventType - Event type
   * @returns {Promise<number>} Event count
   */
  async getEventCount(testId, shopDomain, eventType) {
    const sql = `
      SELECT COUNT(*) as count
      FROM events
      WHERE test_id = $1 
        AND shop_domain = $2
        AND event_type = $3
    `;

    const result = await query(sql, [testId, shopDomain, eventType]);
    return parseInt(result.rows[0].count) || 0;
  }

  /**
   * Get secondary/custom event metrics per variant
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {string[]} eventNames - Custom event names to aggregate
   * @param {Object} options - Optional filters: { device, country }
   * @returns {Promise<Object>} { eventName: { variant_id: { count, sum } } }
   */
  async getSecondaryEventMetrics(testId, shopDomain, eventNames = [], options = {}) {
    if (!eventNames || eventNames.length === 0) {
      return {};
    }

    const { device, country } = options;
    const result = {};

    for (const eventName of eventNames) {
      const safeName = String(eventName).trim().substring(0, 100);
      if (!safeName) {
        continue;
      }

      let sql;
      const params = [testId, shopDomain, safeName];

      if (device || country) {
        const joinClause =
          'JOIN test_assignments ta ON ta.test_id = e.test_id AND ta.user_id = e.user_id AND ta.shop_domain = e.shop_domain AND ta.variant_id = e.variant_id';
        const conditions = [
          'e.test_id = $1',
          'e.shop_domain = $2',
          "e.event_type = 'custom'",
          'e.event_name = $3',
        ];
        if (device) {
          conditions.push(`ta.device = $${params.length + 1}`);
          params.push(device);
        }
        if (country) {
          conditions.push(`ta.country = $${params.length + 1}`);
          params.push(country);
        }
        sql = `
          SELECT e.variant_id, COUNT(DISTINCT e.user_id) as count, COALESCE(SUM(e.event_value), 0) as sum
          FROM events e
          ${joinClause}
          WHERE ${conditions.join(' AND ')}
          GROUP BY e.variant_id
        `;
      } else {
        sql = `
          SELECT variant_id, COUNT(DISTINCT user_id) as count, COALESCE(SUM(event_value), 0) as sum
          FROM events
          WHERE test_id = $1 AND shop_domain = $2 AND event_type = 'custom' AND event_name = $3
          GROUP BY variant_id
        `;
      }

      try {
        const q = await query(sql, params);
        result[safeName] = {};
        q.rows.forEach(row => {
          result[safeName][row.variant_id] = {
            count: parseInt(row.count) || 0,
            sum: parseFloat(row.sum) || 0,
          };
        });
      } catch (err) {
        result[safeName] = {};
      }
    }

    return result;
  }

  /**
   * Get funnel metrics per variant (visitors → events → conversion)
   * Supports custom funnel_steps from test goal: [{ id, label, type, event_name? }]
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Object} options - { device, country, start_date, end_date, funnel_steps? }
   * @returns {Promise<Object>} { steps, byVariant: { variant_id: { stepId: count } } }
   */
  async getFunnelMetrics(testId, shopDomain, options = {}) {
    const defaultSteps = [
      { id: 'visitors', label: 'Visitors', type: 'visitors' },
      { id: 'add_to_cart', label: 'Add to Cart', type: 'event', event_name: 'add_to_cart' },
      { id: 'conversion', label: 'Purchase', type: 'conversion' },
    ];
    const steps =
      options.funnel_steps && Array.isArray(options.funnel_steps) && options.funnel_steps.length > 0
        ? options.funnel_steps
        : defaultSteps;

    const { device, country, start_date, end_date } = options;
    const params = [testId, shopDomain];
    let paramIndex = 3;

    let visitorWhere = 'ta.test_id = $1 AND ta.shop_domain = $2';
    if (device) {
      visitorWhere += ` AND ta.device = $${paramIndex}`;
      params.push(device);
      paramIndex += 1;
    }
    if (country) {
      visitorWhere += ` AND ta.country = $${paramIndex}`;
      params.push(country);
      paramIndex += 1;
    }
    if (start_date) {
      visitorWhere += ` AND ta.assigned_at >= $${paramIndex}`;
      params.push(start_date);
      paramIndex += 1;
    }
    if (end_date) {
      visitorWhere += ` AND ta.assigned_at < $${paramIndex}`;
      params.push(end_date);
      paramIndex += 1;
    }

    const visitorsSql = `
      SELECT variant_id, variant_name, COUNT(DISTINCT user_id) as count
      FROM test_assignments ta
      WHERE ${visitorWhere}
      GROUP BY variant_id, variant_name
    `;

    const eventSteps = steps.filter(s => s.type === 'event' && s.event_name);
    const conversionStep = steps.find(s => s.type === 'conversion');
    const conversionStepId = conversionStep?.id || 'conversion';

    const queries = [{ key: 'visitors', sql: visitorsSql, params }];
    eventSteps.forEach(step => {
      const p = [testId, shopDomain, step.event_name];
      const cond = [
        'e.test_id = $1',
        'e.shop_domain = $2',
        "e.event_type = 'custom'",
        'e.event_name = $3',
      ];
      if (device) {
        cond.push(`ta.device = $${p.length + 1}`);
        p.push(device);
      }
      if (country) {
        cond.push(`ta.country = $${p.length + 1}`);
        p.push(country);
      }
      if (start_date) {
        cond.push(`e.created_at >= $${p.length + 1}`);
        p.push(start_date);
      }
      if (end_date) {
        cond.push(`e.created_at < $${p.length + 1}`);
        p.push(end_date);
      }
      queries.push({
        key: step.id,
        sql: `SELECT e.variant_id, COUNT(DISTINCT e.user_id) as count FROM events e
          JOIN test_assignments ta ON ta.test_id = e.test_id AND ta.user_id = e.user_id AND ta.shop_domain = e.shop_domain AND ta.variant_id = e.variant_id
          WHERE ${cond.join(' AND ')} GROUP BY e.variant_id`,
        params: p,
      });
    });
    if (conversionStep) {
      const p = [testId, shopDomain];
      const cond = ['e.test_id = $1', 'e.shop_domain = $2', "e.event_type = 'conversion'"];
      if (device) {
        cond.push(`ta.device = $${p.length + 1}`);
        p.push(device);
      }
      if (country) {
        cond.push(`ta.country = $${p.length + 1}`);
        p.push(country);
      }
      if (start_date) {
        cond.push(`e.created_at >= $${p.length + 1}`);
        p.push(start_date);
      }
      if (end_date) {
        cond.push(`e.created_at < $${p.length + 1}`);
        p.push(end_date);
      }
      queries.push({
        key: conversionStepId,
        sql: `SELECT e.variant_id, COUNT(DISTINCT e.user_id) as count FROM events e
          JOIN test_assignments ta ON ta.test_id = e.test_id AND ta.user_id = e.user_id AND ta.shop_domain = e.shop_domain AND ta.variant_id = e.variant_id
          WHERE ${cond.join(' AND ')} GROUP BY e.variant_id`,
        params: p,
      });
    }

    const results = await Promise.all(queries.map(q => query(q.sql, q.params)));

    const byVariant = {};
    const variantNames = {};
    results[0].rows.forEach(row => {
      byVariant[row.variant_id] = { visitors: parseInt(row.count) || 0 };
      variantNames[row.variant_id] = row.variant_name;
    });
    for (let i = 1; i < results.length; i++) {
      const key = queries[i].key;
      results[i].rows.forEach(row => {
        if (byVariant[row.variant_id]) {
          byVariant[row.variant_id][key] = parseInt(row.count) || 0;
        }
      });
    }
    Object.keys(byVariant).forEach(vid => {
      const v = byVariant[vid];
      steps.forEach(s => {
        if (s.type === 'visitors') {
          return;
        }
        const k = s.id;
        if (v[k] === undefined) {
          v[k] = 0;
        }
      });
    });

    return {
      steps,
      byVariant,
      variantNames,
    };
  }

  /**
   * List events for a test with pagination and filters
   *
   * @param {string} testId - Test ID
   * @param {string} shopDomain - Shop domain
   * @param {Object} options - { limit, offset, event_type, event_name, variant_id, start_date, end_date }
   * @returns {Promise<{ events: Array, total: number }>}
   */
  async getEventsList(testId, shopDomain, options = {}) {
    const {
      limit = 50,
      offset = 0,
      event_type,
      event_name,
      variant_id,
      start_date,
      end_date,
    } = options;
    const conditions = ['e.test_id = $1', 'e.shop_domain = $2'];
    const params = [testId, shopDomain];
    let idx = 3;
    if (event_type) {
      conditions.push(`e.event_type = $${idx}`);
      params.push(event_type);
      idx += 1;
    }
    if (event_name) {
      conditions.push(`e.event_name = $${idx}`);
      params.push(event_name);
      idx += 1;
    }
    if (variant_id) {
      conditions.push(`e.variant_id = $${idx}`);
      params.push(variant_id);
      idx += 1;
    }
    if (start_date) {
      conditions.push(`e.created_at >= $${idx}`);
      params.push(start_date);
      idx += 1;
    }
    if (end_date) {
      conditions.push(`e.created_at < $${idx}`);
      params.push(end_date);
      idx += 1;
    }

    const countSql = `
      SELECT COUNT(*) as total FROM events e
      WHERE ${conditions.join(' AND ')}
    `;
    const listSql = `
      SELECT e.id, e.test_id, e.variant_id, e.user_id, e.event_type, e.event_name,
             e.event_value, e.metadata, e.created_at
      FROM events e
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    params.push(limit, offset);

    const [countResult, listResult] = await Promise.all([
      query(countSql, params.slice(0, -2)),
      query(listSql, params),
    ]);
    const total = parseInt(countResult.rows[0]?.total || 0, 10);
    const events = listResult.rows.map(row => ({
      id: row.id,
      test_id: row.test_id,
      variant_id: row.variant_id,
      user_id: row.user_id,
      event_type: row.event_type,
      event_name: row.event_name,
      event_value: parseFloat(row.event_value) || 0,
      metadata: row.metadata,
      created_at: row.created_at,
    }));
    return { events, total };
  }

  /**
   * Get distinct event types and names for a test (for filters)
   */
  async getEventTypesForTest(testId, shopDomain) {
    const sql = `
      SELECT DISTINCT event_type, event_name
      FROM events
      WHERE test_id = $1 AND shop_domain = $2
      ORDER BY event_type, event_name NULLS LAST
    `;
    const result = await query(sql, [testId, shopDomain]);
    const types = [...new Set(result.rows.map(r => r.event_type).filter(Boolean))];
    const names = [...new Set(result.rows.map(r => r.event_name).filter(Boolean))];
    return { types, names };
  }

  /**
   * Batch get variant metrics for multiple tests (visitors, conversions, revenue)
   * Used by dashboard to enrich tests list in a single query pair
   *
   * @param {string[]} testIds - Test IDs
   * @param {string} shopDomain - Shop domain (normalized)
   * @returns {Promise<Map<string, Array>>} Map of testId -> [{ variant_id, variant_name, visitors, conversions, revenue }]
   */
  async getBatchVariantMetrics(testIds, shopDomain) {
    if (!testIds || testIds.length === 0) {
      return new Map();
    }
    const domain = (shopDomain || '').toString().toLowerCase().trim();
    const placeholders = testIds.map((_, i) => `$${i + 2}`).join(', ');
    const params = [domain, ...testIds];

    const visitorsSql = `
      SELECT ta.test_id, ta.variant_id, ta.variant_name,
        COUNT(DISTINCT ta.user_id)::int as visitors
      FROM test_assignments ta
      WHERE LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM($1))
        AND ta.test_id IN (${placeholders})
      GROUP BY ta.test_id, ta.variant_id, ta.variant_name
    `;
    const conversionsSql = `
      SELECT e.test_id, e.variant_id,
        COUNT(DISTINCT e.user_id)::int as conversions,
        COALESCE(SUM(e.event_value), 0)::float as revenue
      FROM events e
      INNER JOIN test_assignments ta
        ON ta.test_id = e.test_id AND ta.user_id = e.user_id
        AND LOWER(TRIM(ta.shop_domain)) = LOWER(TRIM(e.shop_domain))
        AND ta.variant_id = e.variant_id
      WHERE LOWER(TRIM(e.shop_domain)) = LOWER(TRIM($1))
        AND e.test_id IN (${placeholders})
        AND e.event_type = 'conversion'
      GROUP BY e.test_id, e.variant_id
    `;

    const [visitorsResult, conversionsResult] = await Promise.all([
      query(visitorsSql, params),
      query(conversionsSql, params),
    ]);

    const byTest = new Map();
    visitorsResult.rows.forEach(row => {
      const tid = row.test_id;
      if (!byTest.has(tid)) {
        byTest.set(tid, new Map());
      }
      const vMap = byTest.get(tid);
      const vid =
        row.variant_id !== null && row.variant_id !== undefined ? String(row.variant_id) : null;
      const vname =
        row.variant_name !== null && row.variant_name !== undefined
          ? String(row.variant_name)
          : null;
      const entry = {
        variant_id: vid,
        variant_name: vname,
        visitors: parseInt(row.visitors, 10) || 0,
        conversions: 0,
        revenue: 0,
      };
      vMap.set(vid, entry);
      if (vname && vid !== vname) {
        vMap.set(vname, entry);
      }
    });
    conversionsResult.rows.forEach(row => {
      const tid = row.test_id;
      const vMap = byTest.get(tid);
      if (!vMap) {
        return;
      }
      const vid =
        row.variant_id !== null && row.variant_id !== undefined ? String(row.variant_id) : null;
      const entry = vMap.get(vid);
      if (entry) {
        entry.conversions = parseInt(row.conversions, 10) || 0;
        entry.revenue = parseFloat(row.revenue) || 0;
      }
    });

    const result = new Map();
    byTest.forEach((vMap, tid) => {
      const seen = new Set();
      const arr = [];
      vMap.forEach(v => {
        const key = v.variant_id ?? v.variant_name ?? '';
        if (key && !seen.has(key)) {
          seen.add(key);
          arr.push(v);
        }
      });
      result.set(tid, arr);
    });
    return result;
  }
}

const model = new AnalyticsModel();

module.exports = {
  trackEvent: data => model.trackEvent(data),
  getTestAnalytics: (testId, shop, opts) => model.getTestAnalytics(testId, shop, opts),
  getBatchVariantMetrics: (testIds, shop) => model.getBatchVariantMetrics(testIds, shop),
  getSegmentBreakdownOptions: (testId, shop) => model.getSegmentBreakdownOptions(testId, shop),
  getEventCount: (testId, shop, type) => model.getEventCount(testId, shop, type),
  getSecondaryEventMetrics: (testId, shop, names, opts) =>
    model.getSecondaryEventMetrics(testId, shop, names, opts),
  getFunnelMetrics: (testId, shop, opts) => model.getFunnelMetrics(testId, shop, opts),
  getEventsList: (testId, shop, opts) => model.getEventsList(testId, shop, opts),
  getEventTypesForTest: (testId, shop) => model.getEventTypesForTest(testId, shop),
};
