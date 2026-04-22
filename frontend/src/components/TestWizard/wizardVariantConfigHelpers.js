export const THEME_TEST_MODES = [
  'template_switch',
  'section_variant',
  'asset_flag',
  'theme_redirect',
];

export function isPriceLikeTestType(typeValue) {
  const t = String(typeValue || '')
    .toLowerCase()
    .trim();
  return t === 'price' || t === 'pricing';
}

export function isOfferLikeTestType(typeValue) {
  const t = String(typeValue || '')
    .toLowerCase()
    .trim();
  return t === 'offer';
}

export function normalizeOfferCodeToken(rawValue, fallback = 'VARIANT') {
  const token = String(rawValue || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  return token || String(fallback || 'VARIANT');
}

export function buildOfferValueToken(config = {}) {
  const discountType = String(config.discount_type || '')
    .trim()
    .toLowerCase();
  if (discountType === 'free_shipping') {
    return 'SHIP';
  }
  const rawValue = config.discount_value;
  const numericValue =
    rawValue !== null && rawValue !== undefined && rawValue !== '' ? Number(rawValue) : NaN;
  const valueToken = Number.isFinite(numericValue)
    ? String(numericValue).replace('.', '_')
    : discountType === 'fixed'
      ? 'FIXED'
      : 'PCT';
  if (discountType === 'fixed') {
    return `${valueToken}OFF`;
  }
  return `${valueToken}PCT`;
}

export function buildAutoOfferCodeName(testName, variantName, config = {}, index = 0) {
  const testToken = normalizeOfferCodeToken(testName, 'TEST').slice(0, 14);
  const variantToken = normalizeOfferCodeToken(variantName, `VAR${index + 1}`).slice(0, 14);
  const offerToken = normalizeOfferCodeToken(buildOfferValueToken(config), 'OFFER').slice(0, 14);
  return `RIPX-${testToken}-${variantToken}-${offerToken}`.slice(0, 48);
}

export function hasSavedPriceConfigValue(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  const mode = String(cfg.priceMode || 'fixed').toLowerCase();
  if (mode === 'fixed') {
    if (cfg.price !== null && cfg.price !== undefined && String(cfg.price).trim() !== '') {
      return true;
    }
  } else if (mode === 'amount') {
    if (
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      String(cfg.priceDelta).trim() !== ''
    ) {
      return true;
    }
  } else if (mode === 'percent') {
    if (
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      String(cfg.pricePercent).trim() !== ''
    ) {
      return true;
    }
  }
  if (cfg.byProduct && typeof cfg.byProduct === 'object' && Object.keys(cfg.byProduct).length > 0) {
    return true;
  }
  if (cfg.byVariant && typeof cfg.byVariant === 'object' && Object.keys(cfg.byVariant).length > 0) {
    return true;
  }
  return false;
}

export function getSavedPriceConfigIndices(variants) {
  if (!Array.isArray(variants)) return [];
  const indices = [];
  variants.forEach((variant, index) => {
    if (hasSavedPriceConfigValue(variant?.config || {})) {
      indices.push(index);
    }
  });
  return indices;
}

export function normalizeVariantPriceConfigShape(variant) {
  if (!variant || typeof variant !== 'object') {
    return variant;
  }
  const config = variant.config && typeof variant.config === 'object' ? { ...variant.config } : {};
  const rootKeys = [
    'priceMode',
    'price',
    'priceDelta',
    'pricePercent',
    'priceBase',
    'priceApplicationMethod',
    'nativeVariantId',
    'roundTo',
    'byProduct',
    'byVariant',
  ];
  let changed = false;
  rootKeys.forEach(key => {
    if (config[key] === undefined && variant[key] !== undefined) {
      config[key] = variant[key];
      changed = true;
    }
  });
  if (!changed && variant.config && typeof variant.config === 'object') {
    return variant;
  }
  return { ...variant, config };
}

export function enforceDirectPriceOverrideOnConfig(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }
  const next = {
    ...config,
    priceApplicationMethod: 'direct_price_override',
  };
  if (next.byProduct && typeof next.byProduct === 'object') {
    next.byProduct = Object.fromEntries(
      Object.entries(next.byProduct).map(([productId, override]) => {
        if (!override || typeof override !== 'object') return [productId, override];
        const productOverride = {
          ...override,
          priceApplicationMethod: 'direct_price_override',
        };
        if (productOverride.byVariant && typeof productOverride.byVariant === 'object') {
          productOverride.byVariant = Object.fromEntries(
            Object.entries(productOverride.byVariant).map(([variantKey, variantOverride]) => {
              if (!variantOverride || typeof variantOverride !== 'object') {
                return [variantKey, variantOverride];
              }
              return [
                variantKey,
                {
                  ...variantOverride,
                  priceApplicationMethod: 'direct_price_override',
                },
              ];
            })
          );
        }
        return [productId, productOverride];
      })
    );
  }
  if (next.byVariant && typeof next.byVariant === 'object') {
    next.byVariant = Object.fromEntries(
      Object.entries(next.byVariant).map(([variantKey, variantOverride]) => {
        if (!variantOverride || typeof variantOverride !== 'object') {
          return [variantKey, variantOverride];
        }
        return [
          variantKey,
          {
            ...variantOverride,
            priceApplicationMethod: 'direct_price_override',
          },
        ];
      })
    );
  }
  return next;
}

export function normalizeThemeMode(rawMode, fallbackMode = 'asset_flag') {
  const mode = String(rawMode || fallbackMode)
    .trim()
    .toLowerCase();
  return THEME_TEST_MODES.includes(mode) ? mode : fallbackMode;
}

export function normalizeThemeConfig(config, fallbackMode = 'asset_flag') {
  const source = config && typeof config === 'object' ? { ...config } : {};
  const themeMode = normalizeThemeMode(source.themeMode || source.theme_mode, fallbackMode);
  const themeTemplateHandle = String(
    source.themeTemplateHandle || source.theme_template_handle || source.template || ''
  ).trim();
  const themeId = String(source.themeId || source.theme_id || '').trim();
  const sectionId = String(source.sectionId || source.section_id || '').trim();
  const bodyClass = String(source.bodyClass || source.body_class || '').trim();
  const redirectUrl = String(
    source.url || source.themeRedirectUrl || source.theme_redirect_url || ''
  ).trim();

  const next = {
    ...source,
    themeMode,
  };

  if (themeTemplateHandle) {
    next.themeTemplateHandle = themeTemplateHandle;
    next.template = themeTemplateHandle;
  } else {
    delete next.themeTemplateHandle;
    delete next.theme_template_handle;
    if (next.template !== undefined) {
      next.template = '';
    }
  }

  if (themeId) {
    next.themeId = themeId;
  } else {
    delete next.themeId;
    delete next.theme_id;
  }

  if (sectionId) {
    next.sectionId = sectionId;
  } else {
    delete next.sectionId;
    delete next.section_id;
  }

  if (bodyClass) {
    next.bodyClass = bodyClass;
  } else {
    delete next.bodyClass;
    delete next.body_class;
  }

  if (redirectUrl) {
    next.url = redirectUrl;
  } else if (next.url !== undefined) {
    next.url = '';
  }

  delete next.theme_mode;
  delete next.theme_template_handle;
  delete next.themeRedirectUrl;
  delete next.theme_redirect_url;

  return next;
}
