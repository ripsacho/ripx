/**
 * Targeting Preset Model
 *
 * Saved segment configurations for reuse across tests
 */

const { query } = require('../utils/database');
const { normalizeSegments } = require('../utils/segments');

async function getPresetsByShop(shopDomain) {
  const sql = `
    SELECT id, shop_domain, name, segments, goal, variants, created_at
    FROM targeting_presets
    WHERE shop_domain = $1
    ORDER BY name ASC
  `;
  const result = await query(sql, [shopDomain]);
  return result.rows.map(row => ({
    ...row,
    segments: typeof row.segments === 'string' ? JSON.parse(row.segments) : row.segments,
    goal: row.goal && (typeof row.goal === 'string' ? JSON.parse(row.goal) : row.goal),
    variants:
      row.variants && (typeof row.variants === 'string' ? JSON.parse(row.variants) : row.variants),
  }));
}

async function createPreset(shopDomain, name, segments, goal = null, variants = null) {
  const normalized = normalizeSegments(segments) || {};
  const goalJson = goal && typeof goal === 'object' ? JSON.stringify(goal) : null;
  const variantsJson =
    variants && Array.isArray(variants) && variants.length > 0 ? JSON.stringify(variants) : null;
  const sql = `
    INSERT INTO targeting_presets (shop_domain, name, segments, goal, variants)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (shop_domain, name) DO UPDATE SET
      segments = EXCLUDED.segments,
      goal = EXCLUDED.goal,
      variants = EXCLUDED.variants,
      created_at = NOW()
    RETURNING *
  `;
  const result = await query(sql, [
    shopDomain,
    name,
    JSON.stringify(normalized),
    goalJson,
    variantsJson,
  ]);
  const row = result.rows[0];
  return {
    ...row,
    segments: typeof row.segments === 'string' ? JSON.parse(row.segments) : row.segments,
    goal: row.goal && (typeof row.goal === 'string' ? JSON.parse(row.goal) : row.goal),
    variants:
      row.variants && (typeof row.variants === 'string' ? JSON.parse(row.variants) : row.variants),
  };
}

async function deletePreset(id, shopDomain) {
  const sql = `
    DELETE FROM targeting_presets
    WHERE id = $1 AND shop_domain = $2
    RETURNING id
  `;
  const result = await query(sql, [id, shopDomain]);
  return result.rows.length > 0;
}

module.exports = {
  getPresetsByShop,
  createPreset,
  deletePreset,
};
