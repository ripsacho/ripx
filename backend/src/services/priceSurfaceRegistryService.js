const { query } = require('../utils/database');
const { normalizePriceSurfaceMappings } = require('../utils/priceSurfaceRegistry');

async function getShopPriceSurfaceMappings(shopDomain) {
  if (!shopDomain || !String(shopDomain).trim()) {
    return [];
  }
  const result = await query(
    `SELECT price_surface_mappings
     FROM shop_settings
     WHERE shop_domain = $1`,
    [String(shopDomain).trim().toLowerCase()]
  );
  const row = result.rows[0];
  if (!row || row.price_surface_mappings === null || row.price_surface_mappings === undefined) {
    return [];
  }
  return normalizePriceSurfaceMappings(row.price_surface_mappings);
}

async function saveShopPriceSurfaceMappings(shopDomain, mappings) {
  if (!shopDomain || !String(shopDomain).trim()) {
    throw new Error('Shop domain required');
  }
  const normalized = normalizePriceSurfaceMappings(mappings).slice(0, 25);
  await query(
    `INSERT INTO shop_settings (shop_domain, price_surface_mappings, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (shop_domain)
     DO UPDATE SET
       price_surface_mappings = EXCLUDED.price_surface_mappings,
       updated_at = NOW()`,
    [String(shopDomain).trim().toLowerCase(), JSON.stringify(normalized)]
  );
  return normalized;
}

module.exports = {
  getShopPriceSurfaceMappings,
  saveShopPriceSurfaceMappings,
};
