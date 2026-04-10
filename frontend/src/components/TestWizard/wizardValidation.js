/**
 * Test Wizard validation (pure functions)
 *
 * Step-by-step validation rules for the create/edit test wizard.
 * Extracted so rules can be unit-tested without React or TestWizard.
 *
 * @param {number} stepId - Current step id (1-based)
 * @param {Object} options
 * @param {{ template?: number, traffic: number, targeting: number, goal: number, code: number, review: number }} options.stepIds - From getStepIds(showTemplateStep)
 * @param {number|undefined} options.reviewStepId - steps[steps.length - 1]?.id
 * @param {Object} options.formData - Current form state
 * @param {Object} [options.initialData] - Initial test data (edit mode)
 * @param {boolean} options.showTemplateStep - Whether template step is shown
 * @param {string} [options.selectedTemplate] - Selected template key
 * @param {string[]} [options.cssValidationErrors] - CSS validation messages
 * @param {string[]} [options.jsValidationErrors] - JS validation messages
 * @returns {string[]} List of error messages for the step
 */
export function getWizardStepErrors(stepId, options) {
  const {
    stepIds,
    reviewStepId,
    formData = {},
    initialData = {},
    showTemplateStep,
    selectedTemplate,
    cssValidationErrors = [],
    jsValidationErrors = [],
  } = options;

  const errors = [];

  /** Returns true if config has a valid price/discount value for price test variants */
  function configHasPrice(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    const mode = (cfg.priceMode || 'fixed').toLowerCase();
    const hasFixed =
      mode === 'fixed' &&
      cfg.price !== null &&
      cfg.price !== undefined &&
      (typeof cfg.price === 'number'
        ? Number.isFinite(cfg.price)
        : String(cfg.price).trim() !== '');
    const hasAmount =
      mode === 'amount' &&
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      (typeof cfg.priceDelta === 'number'
        ? Number.isFinite(cfg.priceDelta)
        : String(cfg.priceDelta).trim() !== '');
    const hasPercent =
      mode === 'percent' &&
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      (typeof cfg.pricePercent === 'number'
        ? Number.isFinite(cfg.pricePercent)
        : String(cfg.pricePercent).trim() !== '');
    return hasFixed || hasAmount || hasPercent;
  }

  function validatePriceRange(cfg, label, detailedPercentMessage = true) {
    if (!cfg || typeof cfg !== 'object') return;
    const mode = (cfg.priceMode || 'fixed').toLowerCase();
    if (mode === 'fixed' && cfg.price !== null && cfg.price !== undefined && cfg.price !== '') {
      const n = Number(cfg.price);
      if (Number.isNaN(n) || n < 0) {
        errors.push(`${label}: fixed price must be 0 or greater.`);
      }
    }
    if (
      mode === 'amount' &&
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      cfg.priceDelta !== ''
    ) {
      const n = Number(cfg.priceDelta);
      if (Number.isNaN(n)) {
        errors.push(`${label}: amount must be a valid number.`);
      }
    }
    if (
      mode === 'percent' &&
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      cfg.pricePercent !== ''
    ) {
      const n = Number(cfg.pricePercent);
      if (Number.isNaN(n) || n < -100 || n > 100) {
        errors.push(
          detailedPercentMessage
            ? `${label}: percent must be between -100 and 100 (negative = increase, positive = discount).`
            : `${label}: percent must be between -100 and 100.`
        );
      }
    }
  }

  function isLikelyControlVariant(variant, index) {
    const name = String(variant?.name || '')
      .trim()
      .toLowerCase();
    if (index === 0) return true;
    return name === 'control' || name.startsWith('control ');
  }

  function isValidOfferCodeName(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return true;
    if (value.length > 48) return false;
    return /^[A-Za-z0-9_-]+$/.test(value);
  }

  function normalizeProductIdValue(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return '';
    const gidMatch = value.match(/Product\/(\d+)/i);
    if (gidMatch && gidMatch[1]) return gidMatch[1];
    return value.replace(/\D/g, '') || value;
  }

  function normalizeProductIdList(raw) {
    let source = raw;
    if (typeof source === 'string') {
      source = source
        .split(/[\n,]+/)
        .map(value => value.trim())
        .filter(Boolean);
    }
    if (!Array.isArray(source)) return [];
    return Array.from(new Set(source.map(item => normalizeProductIdValue(item)).filter(Boolean)));
  }

  function normalizeThemeMode(rawMode, fallbackMode = 'asset_flag') {
    const mode = String(rawMode || fallbackMode)
      .trim()
      .toLowerCase();
    return ['template_switch', 'section_variant', 'asset_flag', 'theme_redirect'].includes(mode)
      ? mode
      : fallbackMode;
  }

  function getThemeConfigParts(cfg = {}, fallbackMode = 'asset_flag') {
    const config = cfg && typeof cfg === 'object' ? cfg : {};
    const mode = normalizeThemeMode(config.themeMode || config.theme_mode, fallbackMode);
    const templateHandle = String(
      config.themeTemplateHandle || config.theme_template_handle || config.template || ''
    ).trim();
    const sectionId = String(config.sectionId || config.section_id || '').trim();
    const bodyClass = String(config.bodyClass || config.body_class || '').trim();
    const themeId = String(config.themeId || config.theme_id || '').trim();
    const redirectUrl = String(
      config.url || config.themeRedirectUrl || config.theme_redirect_url || ''
    ).trim();
    return {
      mode,
      templateHandle,
      sectionId,
      bodyClass,
      themeId,
      redirectUrl,
    };
  }

  // Step 1 (template step) – only when showTemplateStep
  if (showTemplateStep && stepId === 1) {
    const nameToCheck = formData.name?.trim() || initialData?.name?.trim();
    if (!nameToCheck) errors.push('Test name is required.');
    if (!selectedTemplate) errors.push('Select a test type to continue.');
  }

  // Goal step
  if (stepId === stepIds.goal) {
    const nameToCheck = formData.name?.trim() || initialData?.name?.trim();
    if (!nameToCheck) errors.push('Test name is required.');
    if (!formData.goal?.metric) {
      errors.push('Select a success metric (Revenue, Conversion, or AOV).');
    }
    const cogs = formData.goal?.cogs;
    if (cogs?.enabled) {
      const cogsVal = Number(cogs.value);
      if (cogs.type === 'percentage' && (Number.isNaN(cogsVal) || cogsVal < 0 || cogsVal > 100)) {
        errors.push('COGS percentage must be between 0 and 100.');
      }
      if (cogs.type === 'fixed_per_order' && (Number.isNaN(cogsVal) || cogsVal < 0)) {
        errors.push('COGS per order must be 0 or greater.');
      }
    }
  }

  // Targeting step
  if (stepId === stepIds.targeting) {
    const templateKeyTargeting = String(
      selectedTemplate || formData.goal?.template_key || formData.type || ''
    )
      .trim()
      .toLowerCase();
    const isCommerceTargetingTest = ['price', 'pricing', 'offer'].includes(templateKeyTargeting);
    const targetType = formData.target_type || initialData?.target_type;
    const pageRules = formData.segments?.page_rules || initialData?.segments?.page_rules || [];
    const hasCustomScope = pageRules.length > 0;
    const hasTargetId =
      (formData.target_id && formData.target_id.trim()) ||
      (Array.isArray(formData.target_ids) && formData.target_ids.length > 0) ||
      (initialData?.target_id && initialData.target_id.trim()) ||
      (Array.isArray(initialData?.target_ids) && initialData.target_ids.length > 0);
    const needsTargetId =
      targetType &&
      targetType !== '' &&
      targetType !== 'all' &&
      targetType !== 'homepage' &&
      targetType !== 'cart' &&
      targetType !== 'checkout' &&
      targetType !== 'all-products' &&
      targetType !== 'all-collections';
    if (!hasCustomScope && needsTargetId && !hasTargetId) {
      errors.push('Target ID is required for the selected target type.');
    }
    if (isCommerceTargetingTest) {
      const excludedProductIds = normalizeProductIdList(
        formData.segments?.excluded_product_ids ?? initialData?.segments?.excluded_product_ids
      );
      if (targetType === 'product') {
        const selectedProductIds = normalizeProductIdList([
          ...(Array.isArray(formData.target_ids) ? formData.target_ids : []),
          formData.target_id,
          ...(Array.isArray(initialData?.target_ids) ? initialData.target_ids : []),
          initialData?.target_id,
        ]);
        const overlap = selectedProductIds.filter(id => excludedProductIds.includes(id));
        if (overlap.length > 0) {
          errors.push(
            'Some selected products are also in the excluded products list. Remove overlaps before continuing.'
          );
        }
      }
    }
    const holdoutValue = Number(formData.holdout_percent);
    if (!Number.isNaN(holdoutValue) && (holdoutValue < 0 || holdoutValue > 50)) {
      errors.push('Holdout percent must be between 0 and 50.');
    }
    const rampPercentRaw = formData.segments?.traffic_ramp_percent;
    if (
      rampPercentRaw !== undefined &&
      rampPercentRaw !== null &&
      String(rampPercentRaw).trim() !== ''
    ) {
      const rampPercent = Number(rampPercentRaw);
      if (Number.isNaN(rampPercent) || rampPercent < 0 || rampPercent > 100) {
        errors.push('Traffic ramp percent must be between 0 and 100.');
      } else if (rampPercent > 0 && rampPercent < 100) {
        const rampDaysRaw = formData.segments?.traffic_ramp_days;
        const rampDays = Number(rampDaysRaw);
        if (!Number.isFinite(rampDays) || rampDays < 1 || rampDays > 30) {
          errors.push('Traffic ramp days must be between 1 and 30 when ramp % is enabled.');
        }
      }
    }
  }

  // Traffic step: only validate allocation. Variant price config is required on Code and Review.
  if (stepId === stepIds.traffic) {
    const totalAllocation = (formData.variants || []).reduce(
      (sum, v) => sum + (v.allocation || 0),
      0
    );
    if (Math.abs(totalAllocation - 100) > 0.01) {
      errors.push(
        `Total traffic allocation must equal 100%. Current: ${totalAllocation.toFixed(2)}%.`
      );
    }
    // Price test on Traffic: validate only numeric ranges when user has entered values (no blocking "must have price" here)
    const templateKey = selectedTemplate || formData.goal?.template_key || formData.type || '';
    const isPriceTestTraffic =
      templateKey === 'price' ||
      templateKey === 'pricing' ||
      (typeof templateKey === 'string' && templateKey.toLowerCase() === 'price');
    if (isPriceTestTraffic && Array.isArray(formData.variants)) {
      formData.variants.forEach((v, i) => {
        const cfg = v?.config || {};
        validatePriceRange(cfg, v?.name || `Variant ${i + 1}`, true);
      });
      // Per-product / per-variant overrides: validate nested numeric ranges only
      formData.variants.forEach((v, i) => {
        const byProduct = v?.config?.byProduct;
        if (!byProduct || typeof byProduct !== 'object') return;
        Object.entries(byProduct).forEach(([productId, override]) => {
          validatePriceRange(
            override,
            `${v?.name || `Variant ${i + 1}`}: per-product override (${productId})`,
            true
          );
          const byVariant = override?.byVariant;
          if (!byVariant || typeof byVariant !== 'object') return;
          Object.entries(byVariant).forEach(([vKey, vCfg]) => {
            if (!vCfg || typeof vCfg !== 'object') return;
            validatePriceRange(
              vCfg,
              `${v?.name || `Variant ${i + 1}`}: per-variant override (${vKey})`,
              true
            );
          });
        });
      });
    }
  }

  // Code step
  if (stepId === stepIds.code) {
    if (cssValidationErrors.length > 0) {
      errors.push('Fix CSS syntax errors before continuing.');
    }
    if (jsValidationErrors.length > 0) {
      errors.push('Fix JavaScript syntax errors before continuing.');
    }
    const templateKeyCode = selectedTemplate || formData.goal?.template_key || formData.type || '';
    const isPriceTest =
      templateKeyCode === 'price' ||
      templateKeyCode === 'pricing' ||
      (typeof templateKeyCode === 'string' && templateKeyCode.toLowerCase() === 'price');
    const isOfferTest = selectedTemplate === 'offer' || formData.type === 'offer';
    const isCommerceScopeTest = isPriceTest || isOfferTest;
    if (isCommerceScopeTest && formData.target_type === 'product') {
      const hasTargetId =
        (formData.target_id && String(formData.target_id).trim()) ||
        (Array.isArray(formData.target_ids) && formData.target_ids.length > 0);
      if (!hasTargetId) {
        errors.push(
          `${isOfferTest ? 'Offer' : 'Price'} test is set to "Selected products only" but no products are selected. Select at least one product in Product scope.`
        );
      }
    }
    if (isPriceTest && Array.isArray(formData.variants)) {
      let hasNonControlWithPriceCode = false;
      formData.variants.forEach((v, i) => {
        const cfg = v?.config || {};
        const mode = (cfg.priceMode || 'fixed').toLowerCase();
        const isControl =
          mode === 'fixed' &&
          (cfg.price === null || cfg.price === undefined || String(cfg.price).trim() === '');
        if (!isControl && configHasPrice(cfg)) {
          hasNonControlWithPriceCode = true;
        }
        validatePriceRange(cfg, v?.name || `Variant ${i + 1}`, true);
      });
      formData.variants.forEach((v, i) => {
        const byProduct = v?.config?.byProduct;
        if (!byProduct || typeof byProduct !== 'object') return;
        Object.entries(byProduct).forEach(([productId, override]) => {
          validatePriceRange(
            override,
            `${v?.name || `Variant ${i + 1}`}: per-product override (${productId})`,
            true
          );
          const byVariant = override?.byVariant;
          if (!byVariant || typeof byVariant !== 'object') return;
          Object.entries(byVariant).forEach(([vKey, vCfg]) => {
            validatePriceRange(
              vCfg,
              `${v?.name || `Variant ${i + 1}`}: per-variant override (${vKey})`,
              true
            );
          });
        });
      });
      if (formData.variants.length > 1 && !hasNonControlWithPriceCode) {
        errors.push(
          'At least one test variant (non-control) must have a price configured. Go to Traffic step → Variant configuration.'
        );
      }
    }
    // Split-URL: non-empty url must be valid
    const isSplitUrl =
      selectedTemplate === 'split-url' ||
      (formData.variants || []).some(v => 'url' in (v?.config || {}));
    if (isSplitUrl && Array.isArray(formData.variants)) {
      formData.variants.forEach((v, i) => {
        const url = (v?.config?.url ?? '').toString().trim();
        if (!url) return;
        try {
          new URL(url, 'https://example.com');
        } catch (_) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: enter a valid URL (e.g. https://yoursite.com/pages/landing).`
          );
        }
      });
    }
    // Offer: discount value validation
    if (isOfferTest && Array.isArray(formData.variants)) {
      let hasNonControlWithOfferCode = false;
      formData.variants.forEach((v, i) => {
        const cfg = v?.config || {};
        const dtype = (cfg.discount_type || 'percent').toLowerCase();
        const val = cfg.discount_value;
        const isControl = isLikelyControlVariant(v, i);
        if (!isValidOfferCodeName(cfg.discount_code_name ?? cfg.discountCodeName)) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: discount code name must be <= 48 characters and use letters, numbers, "-" or "_".`
          );
        }
        if (!['percent', 'fixed', 'free_shipping'].includes(dtype)) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: discount type must be percent, fixed, or free_shipping.`
          );
          return;
        }
        if (dtype === 'free_shipping') {
          if (!isControl) {
            hasNonControlWithOfferCode = true;
          }
          return;
        }
        if (val !== null && val !== undefined && val !== '') {
          const n = Number(val);
          if (Number.isNaN(n) || n < 0) {
            errors.push(`${v?.name || `Variant ${i + 1}`}: discount value must be 0 or greater.`);
          } else if (dtype === 'percent' && n > 100) {
            errors.push(
              `${v?.name || `Variant ${i + 1}`}: percent discount must be between 0 and 100.`
            );
          } else if (!isControl) {
            hasNonControlWithOfferCode = true;
          }
        }
      });
      if (formData.variants.length > 1 && !hasNonControlWithOfferCode) {
        errors.push(
          'At least one offer variant (non-control) must include a valid discount or free-shipping config.'
        );
      }
    }

    const templateKeyTheme = String(
      selectedTemplate || formData.goal?.template_key || formData.type || ''
    )
      .trim()
      .toLowerCase();
    const isThemeTest =
      templateKeyTheme === 'theme' || templateKeyTheme === 'template' || formData.type === 'theme';
    if (isThemeTest && Array.isArray(formData.variants)) {
      const fallbackMode = templateKeyTheme === 'template' ? 'template_switch' : 'asset_flag';
      let hasActionableThemeVariant = false;
      formData.variants.forEach((v, i) => {
        const cfg = v?.config || {};
        const { mode, templateHandle, sectionId, bodyClass, themeId, redirectUrl } =
          getThemeConfigParts(cfg, fallbackMode);
        const isControl = isLikelyControlVariant(v, i);
        if (mode === 'template_switch' && !templateHandle && !isControl) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: template handle is required for template switch mode.`
          );
        }
        if (mode === 'section_variant' && !sectionId && !isControl) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: section ID is required for section variant mode.`
          );
        }
        if (mode === 'theme_redirect' && !redirectUrl && !isControl) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: redirect URL is required for theme redirect mode.`
          );
        }
        if (mode === 'theme_redirect' && redirectUrl) {
          try {
            new URL(redirectUrl, 'https://example.com');
          } catch (_) {
            errors.push(`${v?.name || `Variant ${i + 1}`}: enter a valid redirect URL.`);
          }
        }
        const hasSignal = Boolean(
          templateHandle || sectionId || bodyClass || themeId || redirectUrl
        );
        if (!isControl && hasSignal) {
          hasActionableThemeVariant = true;
        }
      });
      if (formData.variants.length > 1 && !hasActionableThemeVariant) {
        errors.push(
          'Add theme configuration to at least one test variant (template handle, section ID, body class, or theme ID).'
        );
      }
    }
  }

  // Review step
  if (reviewStepId !== undefined && reviewStepId !== null && stepId === reviewStepId) {
    const nameToCheck = formData.name?.trim() || initialData?.name?.trim();
    if (!nameToCheck) errors.push('Test name is required.');
    if (!formData.goal?.metric && !initialData?.goal?.metric) {
      errors.push('Select a success metric in the Goal & Metrics step.');
    }
    const cogsReview = formData.goal?.cogs;
    if (cogsReview?.enabled) {
      const v = Number(cogsReview.value);
      if (cogsReview.type === 'percentage' && (Number.isNaN(v) || v < 0 || v > 100)) {
        errors.push('COGS percentage must be between 0 and 100.');
      }
      if (cogsReview.type === 'fixed_per_order' && (Number.isNaN(v) || v < 0)) {
        errors.push('COGS per order must be 0 or greater.');
      }
    }
    const totalAllocation = (formData.variants || []).reduce((s, v) => s + (v.allocation || 0), 0);
    if (Math.abs(totalAllocation - 100) > 0.01) {
      errors.push(`Traffic allocation must equal 100%. Current: ${totalAllocation.toFixed(1)}%.`);
    }
    // Price test: same variant price validation on review + at least one non-control with price
    const templateKeyReview =
      formData.type || formData.goal?.template_key || selectedTemplate || '';
    const isPriceTestReview =
      templateKeyReview === 'price' ||
      templateKeyReview === 'pricing' ||
      (typeof templateKeyReview === 'string' && templateKeyReview.toLowerCase() === 'price');
    if (isPriceTestReview && Array.isArray(formData.variants)) {
      let hasNonControlWithPriceReview = false;
      formData.variants.forEach((v, i) => {
        const cfg = v?.config || {};
        const mode = (cfg.priceMode || 'fixed').toLowerCase();
        const isControl =
          mode === 'fixed' &&
          (cfg.price === null || cfg.price === undefined || String(cfg.price).trim() === '');
        if (!isControl && configHasPrice(cfg)) {
          hasNonControlWithPriceReview = true;
        }
        validatePriceRange(cfg, v?.name || `Variant ${i + 1}`, false);
      });
      if (formData.variants.length > 1 && !hasNonControlWithPriceReview) {
        errors.push(
          'At least one test variant (non-control) must have a price configured. Go to Traffic step → Variant configuration to set prices.'
        );
      }
      // Per-product / per-variant overrides: validate nested price config on review
      formData.variants.forEach((v, i) => {
        const byProduct = v?.config?.byProduct;
        if (!byProduct || typeof byProduct !== 'object') return;
        Object.entries(byProduct).forEach(([_productId, override]) => {
          validatePriceRange(
            override,
            `${v?.name || `Variant ${i + 1}`}: per-product override (${_productId})`,
            false
          );
          const byVariant = override?.byVariant;
          if (!byVariant || typeof byVariant !== 'object') return;
          Object.entries(byVariant).forEach(([vKey, vCfg]) => {
            validatePriceRange(
              vCfg,
              `${v?.name || `Variant ${i + 1}`}: per-variant override (${vKey})`,
              false
            );
          });
        });
      });
    }
    const targetType = formData.target_type || initialData?.target_type;
    const pageRules = formData.segments?.page_rules || initialData?.segments?.page_rules || [];
    const hasCustomScope = pageRules.length > 0;
    const hasTargetId =
      (formData.target_id && formData.target_id.trim()) ||
      (Array.isArray(formData.target_ids) && formData.target_ids.length > 0) ||
      (initialData?.target_id && initialData.target_id.trim()) ||
      (Array.isArray(initialData?.target_ids) && initialData.target_ids.length > 0);
    const needsTargetIdReview =
      targetType &&
      targetType !== '' &&
      !['all', 'homepage', 'cart', 'checkout', 'all-products', 'all-collections'].includes(
        targetType
      );
    if (!hasCustomScope && needsTargetIdReview && !hasTargetId) {
      errors.push('Target ID is required for the selected scope in the Targeting step.');
    }
    const isCommerceReview =
      ['price', 'pricing', 'offer'].includes(
        String(selectedTemplate || formData.goal?.template_key || formData.type || '')
          .trim()
          .toLowerCase()
      ) && String(targetType || '').toLowerCase() === 'product';
    if (isCommerceReview) {
      const selectedProductIds = normalizeProductIdList([
        ...(Array.isArray(formData.target_ids) ? formData.target_ids : []),
        formData.target_id,
        ...(Array.isArray(initialData?.target_ids) ? initialData.target_ids : []),
        initialData?.target_id,
      ]);
      const excludedProductIds = normalizeProductIdList(
        formData.segments?.excluded_product_ids ?? initialData?.segments?.excluded_product_ids
      );
      const overlap = selectedProductIds.filter(id => excludedProductIds.includes(id));
      if (overlap.length > 0) {
        errors.push(
          'Targeting has selected products that are also excluded. Remove overlaps before starting.'
        );
      }
    }
    // Split-URL URL format
    const reviewTemplateKey = String(
      selectedTemplate || formData.goal?.template_key || formData.type || ''
    )
      .trim()
      .toLowerCase();
    const isThemeLikeReview = reviewTemplateKey === 'theme' || reviewTemplateKey === 'template';
    const isSplitUrlReview =
      !isThemeLikeReview &&
      (formData.variants || []).some(v => (v?.config?.url ?? '').toString().trim());
    if (isSplitUrlReview && Array.isArray(formData.variants)) {
      formData.variants.forEach((v, i) => {
        const url = (v?.config?.url ?? '').toString().trim();
        if (!url) return;
        try {
          new URL(url, 'https://example.com');
        } catch (_) {
          errors.push(`${v?.name || `Variant ${i + 1}`}: enter a valid URL for Split URL test.`);
        }
      });
    }
    // Offer discount value
    const isOfferReview = (formData.type || '').toLowerCase() === 'offer';
    if (isOfferReview && Array.isArray(formData.variants)) {
      let hasNonControlWithOfferReview = false;
      formData.variants.forEach((v, i) => {
        const cfg = v?.config || {};
        const dtype = (cfg.discount_type || 'percent').toLowerCase();
        const val = cfg.discount_value;
        const isControl = isLikelyControlVariant(v, i);
        if (!isValidOfferCodeName(cfg.discount_code_name ?? cfg.discountCodeName)) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: discount code name must be <= 48 characters and use letters, numbers, "-" or "_".`
          );
        }
        if (!['percent', 'fixed', 'free_shipping'].includes(dtype)) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: discount type must be percent, fixed, or free_shipping.`
          );
          return;
        }
        if (dtype === 'free_shipping') {
          if (!isControl) {
            hasNonControlWithOfferReview = true;
          }
          return;
        }
        if (val !== null && val !== undefined && val !== '') {
          const n = Number(val);
          if (Number.isNaN(n) || n < 0)
            errors.push(`${v?.name || `Variant ${i + 1}`}: discount value must be ≥ 0.`);
          else if (dtype === 'percent' && n > 100)
            errors.push(`${v?.name || `Variant ${i + 1}`}: percent discount must be 0–100.`);
          else if (!isControl) hasNonControlWithOfferReview = true;
        }
      });
      if (formData.variants.length > 1 && !hasNonControlWithOfferReview) {
        errors.push(
          'At least one offer variant (non-control) must include a valid discount or free-shipping config.'
        );
      }
    }

    const templateKeyThemeReview = String(
      selectedTemplate || formData.goal?.template_key || formData.type || ''
    )
      .trim()
      .toLowerCase();
    const isThemeReview =
      templateKeyThemeReview === 'theme' ||
      templateKeyThemeReview === 'template' ||
      formData.type === 'theme';
    if (isThemeReview && Array.isArray(formData.variants)) {
      const fallbackMode = templateKeyThemeReview === 'template' ? 'template_switch' : 'asset_flag';
      let hasActionableThemeVariant = false;
      formData.variants.forEach((v, i) => {
        const cfg = v?.config || {};
        const { mode, templateHandle, sectionId, bodyClass, themeId, redirectUrl } =
          getThemeConfigParts(cfg, fallbackMode);
        const isControl = isLikelyControlVariant(v, i);
        if (mode === 'template_switch' && !templateHandle && !isControl) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: template handle is required for template switch mode.`
          );
        }
        if (mode === 'section_variant' && !sectionId && !isControl) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: section ID is required for section variant mode.`
          );
        }
        if (mode === 'theme_redirect' && !redirectUrl && !isControl) {
          errors.push(
            `${v?.name || `Variant ${i + 1}`}: redirect URL is required for theme redirect mode.`
          );
        }
        if (mode === 'theme_redirect' && redirectUrl) {
          try {
            new URL(redirectUrl, 'https://example.com');
          } catch (_) {
            errors.push(`${v?.name || `Variant ${i + 1}`}: enter a valid redirect URL.`);
          }
        }
        const hasSignal = Boolean(
          templateHandle || sectionId || bodyClass || themeId || redirectUrl
        );
        if (!isControl && hasSignal) {
          hasActionableThemeVariant = true;
        }
      });
      if (formData.variants.length > 1 && !hasActionableThemeVariant) {
        errors.push(
          'Add theme configuration to at least one test variant (template handle, section ID, body class, or theme ID).'
        );
      }
    }
  }

  return errors;
}
