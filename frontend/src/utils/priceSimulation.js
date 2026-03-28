export function toProductIdKey(id) {
  if (id === undefined || id === null || id === '') return '';
  const s = String(id).trim();
  const m = s.match(/Product\/(\d+)/);
  if (m) return m[1];
  return s.replace(/\D/g, '') || s;
}

export function toVariantIdKey(id) {
  if (id === undefined || id === null || id === '') return '';
  const s = String(id).trim();
  const m = s.match(/ProductVariant\/\s*(\d+)/i) || s.match(/\b(\d{10,})\b/);
  if (m) return m[1];
  return s;
}

function parseRoundTo(roundTo) {
  if (roundTo === undefined || roundTo === null || roundTo === '') return 0;
  const n = typeof roundTo === 'number' ? roundTo : Number.parseFloat(String(roundTo).trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function applyRoundTo(price, roundToVal) {
  if (!Number.isFinite(price)) return null;
  let out = Math.max(0, Math.round(price * 100) / 100);
  if (roundToVal > 0) {
    out = Math.round(out / roundToVal) * roundToVal;
    out = Math.max(0, Math.round(out * 100) / 100);
  }
  return out;
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasModeValue(cfg, mode) {
  if (!cfg || typeof cfg !== 'object') return false;
  const m = String(mode || '').toLowerCase();
  if (m === 'fixed')
    return cfg.price !== null && cfg.price !== undefined && String(cfg.price).trim() !== '';
  if (m === 'amount')
    return (
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      String(cfg.priceDelta).trim() !== ''
    );
  if (m === 'percent')
    return (
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      String(cfg.pricePercent).trim() !== ''
    );
  if (m === 'control') return true;
  return false;
}

function normalizeMergedPriceConfig(baseCfg, mergedCfg) {
  const base = baseCfg && typeof baseCfg === 'object' ? baseCfg : {};
  const merged = mergedCfg && typeof mergedCfg === 'object' ? { ...mergedCfg } : { ...base };
  const mergedMode = String(merged.priceMode || 'fixed').toLowerCase();
  if (hasModeValue(merged, mergedMode)) return merged;
  const baseMode = String(base.priceMode || 'fixed').toLowerCase();
  if (!hasModeValue(base, baseMode)) return merged;
  merged.priceMode = baseMode;
  if (baseMode === 'fixed') merged.price = base.price;
  if (baseMode === 'amount') {
    merged.priceDelta = base.priceDelta;
    merged.priceBase = base.priceBase || merged.priceBase;
  }
  if (baseMode === 'percent') {
    merged.pricePercent = base.pricePercent;
    merged.priceBase = base.priceBase || merged.priceBase;
  }
  if (
    base.roundTo !== undefined &&
    base.roundTo !== null &&
    (merged.roundTo === undefined || merged.roundTo === null)
  ) {
    merged.roundTo = base.roundTo;
  }
  return merged;
}

export function getEffectivePriceConfig(cfg, productId, variantId) {
  if (!cfg || typeof cfg !== 'object') return cfg || {};
  const byProduct = cfg.byProduct;
  if (!byProduct || typeof byProduct !== 'object') return cfg;

  const pid = toProductIdKey(productId);
  const gid = pid ? `gid://shopify/Product/${pid}` : '';
  const productOverride =
    byProduct[productId] || byProduct[pid] || (gid ? byProduct[gid] : null) || null;
  if (!productOverride || typeof productOverride !== 'object') {
    return cfg;
  }

  const merged = {};
  Object.keys(cfg).forEach(key => {
    if (key !== 'byProduct') merged[key] = cfg[key];
  });
  Object.keys(productOverride).forEach(key => {
    if (key !== 'byVariant') merged[key] = productOverride[key];
  });

  const byVariant = productOverride.byVariant;
  if (!byVariant || typeof byVariant !== 'object' || !variantId) {
    return normalizeMergedPriceConfig(cfg, merged);
  }

  const vkey = toVariantIdKey(variantId);
  const vgid = vkey ? `gid://shopify/ProductVariant/${vkey}` : '';
  const variantOverride =
    byVariant[variantId] || byVariant[vkey] || (vgid ? byVariant[vgid] : null) || null;
  if (variantOverride && typeof variantOverride === 'object') {
    Object.keys(variantOverride).forEach(key => {
      merged[key] = variantOverride[key];
    });
  }
  return normalizeMergedPriceConfig(cfg, merged);
}

function isCompareAtBaseConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  const mode = String(cfg.priceMode || 'fixed').toLowerCase();
  const base = String(cfg.priceBase || 'price').toLowerCase();
  return (mode === 'amount' || mode === 'percent') && base === 'compare_at';
}

export function configUsesCompareAtBase(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (isCompareAtBaseConfig(cfg)) return true;
  const byProduct = cfg.byProduct;
  if (!byProduct || typeof byProduct !== 'object') return false;
  return Object.values(byProduct).some(productOverride => {
    if (!productOverride || typeof productOverride !== 'object') return false;
    if (isCompareAtBaseConfig(productOverride)) return true;
    const byVariant = productOverride.byVariant;
    if (!byVariant || typeof byVariant !== 'object') return false;
    return Object.values(byVariant).some(variantOverride => isCompareAtBaseConfig(variantOverride));
  });
}

export function computeEffectivePrice(cfg, catalogPrice, options = {}) {
  if (!Number.isFinite(Number(catalogPrice))) return null;
  const catalog = Number(catalogPrice);
  const mode = String(cfg?.priceMode || 'fixed').toLowerCase();
  const compareAt = toOptionalNumber(options.compareAtPrice);
  const basis = isCompareAtBaseConfig(cfg) ? compareAt : catalog;

  let raw = catalog;
  if (mode === 'fixed') {
    if (cfg?.price !== undefined && cfg?.price !== null && cfg?.price !== '') {
      const fixed = Number(cfg.price);
      if (!Number.isFinite(fixed)) return null;
      raw = fixed;
    }
  } else if (mode === 'amount') {
    if (!Number.isFinite(basis)) return null;
    if (cfg?.priceDelta !== undefined && cfg?.priceDelta !== null && cfg?.priceDelta !== '') {
      const delta = Number(cfg.priceDelta);
      if (!Number.isFinite(delta)) return null;
      raw = basis + delta;
    }
  } else if (mode === 'percent') {
    if (!Number.isFinite(basis)) return null;
    if (cfg?.pricePercent !== undefined && cfg?.pricePercent !== null && cfg?.pricePercent !== '') {
      const pct = Number(cfg.pricePercent);
      if (!Number.isFinite(pct)) return null;
      raw = basis * (1 - pct / 100);
    }
  }

  return applyRoundTo(raw, parseRoundTo(cfg?.roundTo));
}

function formatPrice(n) {
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}

function formatProductLabel(id) {
  if (!id) return 'All targeted products';
  const m = String(id).match(/Product\/(\d+)/);
  return m ? `Product ${m[1]}` : String(id);
}

function formatVariantLabel(id) {
  if (!id) return '';
  const m = String(id).match(/ProductVariant\/(\d+)/);
  return m ? m[1] : String(id);
}

export function buildPriceSimulationRows({
  variants,
  catalogPrice,
  compareAtPrice = null,
  targetType,
  targetProductIds = [],
  maxRows = 24,
}) {
  if (!Array.isArray(variants) || variants.length === 0 || !Number.isFinite(Number(catalogPrice))) {
    return { rows: [], truncated: false, hasVariantOverrideRows: false };
  }

  const scenarioMap = new Map();
  const addScenario = (productId, variantId) => {
    const pKey = toProductIdKey(productId || '__default');
    const vKey = toVariantIdKey(variantId || '');
    const key = `${pKey}::${vKey}`;
    if (scenarioMap.has(key)) return;
    const isDefault = !productId && !variantId;
    const label = isDefault
      ? 'All targeted products'
      : variantId
        ? `${formatProductLabel(productId)} / SKU ${formatVariantLabel(variantId)}`
        : formatProductLabel(productId);
    scenarioMap.set(key, {
      key,
      label,
      productId: productId || null,
      variantId: variantId || null,
    });
  };

  addScenario(null, null);

  if (targetType === 'product' && Array.isArray(targetProductIds)) {
    targetProductIds.filter(Boolean).forEach(pid => addScenario(pid, null));
  }

  variants.forEach(v => {
    const byProduct = v?.config?.byProduct;
    if (!byProduct || typeof byProduct !== 'object') return;
    Object.keys(byProduct).forEach(pid => {
      const pCfg = byProduct[pid];
      if (!pCfg || typeof pCfg !== 'object') return;
      const byVariant = pCfg.byVariant;
      if (!byVariant || typeof byVariant !== 'object') return;
      Object.keys(byVariant).forEach(vid => addScenario(pid, vid));
    });
  });

  const scenarios = [...scenarioMap.values()];
  const truncated = scenarios.length > maxRows;
  const selected = scenarios.slice(0, maxRows);
  const compareAtNumeric = toOptionalNumber(compareAtPrice);
  let hasCompareAtBase = false;
  let hasMissingCompareAt = false;

  const rows = selected.map(s => {
    const prices = variants.map(v => {
      const effCfg = getEffectivePriceConfig(v?.config || {}, s.productId, s.variantId);
      if (isCompareAtBaseConfig(effCfg)) {
        hasCompareAtBase = true;
        if (!Number.isFinite(compareAtNumeric)) {
          hasMissingCompareAt = true;
        }
      }
      const price = computeEffectivePrice(effCfg, catalogPrice, {
        compareAtPrice: compareAtNumeric,
      });
      return formatPrice(price);
    });
    return {
      id: s.key,
      label: s.label,
      productId: s.productId,
      variantId: s.variantId,
      prices,
    };
  });

  return {
    rows,
    truncated,
    hasVariantOverrideRows: selected.some(r => !!r.variantId),
    hasCompareAtBase,
    hasMissingCompareAt,
  };
}

function escapeCsvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildPriceSimulationCsv({ rows, variantNames = [] }) {
  const header = ['Scenario', ...variantNames.map(v => v || 'Variant')];
  const lines = [header.map(escapeCsvCell).join(',')];
  (rows || []).forEach(row => {
    const cells = [row?.label || '', ...(row?.prices || [])];
    lines.push(cells.map(escapeCsvCell).join(','));
  });
  return `${lines.join('\n')}\n`;
}
