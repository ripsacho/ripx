const conflictDetectionService = require('./conflictDetectionService');
const { getShopSession } = require('../models/shopSession');
const { getTestsByShop } = require('../models/test');
const {
  buildTestCheckoutReadiness,
  supportsCheckoutReadiness,
} = require('./checkoutReadinessService');
const { evaluateShopifyConnectionHealth } = require('./shopifyConnectionHealth');
const {
  runStorefrontSetupProbe,
  requiresStorefrontRuntimeForTest,
} = require('./storefrontSetupService');

const MAX_CANARY_DAYS = 30;
const DEFAULT_CANARY_DAYS = 7;
const MIN_FORCE_REASON_LENGTH = 8;

function toLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getExperimentGroupKey(test) {
  if (!test || typeof test !== 'object') {
    return '';
  }
  const raw =
    test.segments?.experiment_group ?? test.goal?.experiment_group ?? test.experiment_group;
  return toLower(raw);
}

function isThemeFamilyTest(test) {
  const type = toLower(test?.type);
  const templateKey = toLower(test?.goal?.template_key);
  return type === 'theme' || templateKey === 'theme' || templateKey === 'template';
}

function normalizeThemeMode(rawMode, fallbackMode = 'asset_flag') {
  const fallback = ['template_switch', 'section_variant', 'asset_flag', 'theme_redirect'].includes(
    toLower(fallbackMode)
  )
    ? toLower(fallbackMode)
    : 'asset_flag';
  const mode = toLower(rawMode || fallback);
  return ['template_switch', 'section_variant', 'asset_flag', 'theme_redirect'].includes(mode)
    ? mode
    : fallback;
}

function isLikelyControlVariant(variant, index) {
  const name = toLower(variant?.name);
  return index === 0 || name === 'control' || name.startsWith('control ');
}

function parseOptionalNumber(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { hasValue: false, value: null };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { hasValue: true, error: 'Must be a valid number', value: null };
  }
  return { hasValue: true, value: n };
}

function parseOptionalText(raw) {
  if (raw === undefined || raw === null) {
    return { hasValue: false, value: '' };
  }
  const value = String(raw).trim();
  if (!value) {
    return { hasValue: false, value: '' };
  }
  return { hasValue: true, value };
}

function parseOptionalBoolean(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { hasValue: false, value: null };
  }
  if (raw === true || raw === 'true' || raw === 1 || raw === '1') {
    return { hasValue: true, value: true };
  }
  if (raw === false || raw === 'false' || raw === 0 || raw === '0') {
    return { hasValue: true, value: false };
  }
  return { hasValue: true, error: 'Must be true or false', value: null };
}

function parseDateOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }
  return dt;
}

function isSupportedThemeMode(rawMode) {
  const mode = toLower(rawMode);
  return (
    mode === 'template_switch' ||
    mode === 'section_variant' ||
    mode === 'asset_flag' ||
    mode === 'theme_redirect'
  );
}

function buildThemeParitySignature(config = {}, fallbackMode = 'asset_flag') {
  const cfg = config && typeof config === 'object' ? config : {};
  const parts = extractThemeConfigParts(cfg, fallbackMode);
  return JSON.stringify({
    mode: parts.mode,
    templateHandle: parts.templateHandle.toLowerCase(),
    sectionId: parts.sectionId,
    bodyClass: parts.bodyClass,
    themeId: parts.themeId,
    redirectUrl: parts.redirectUrl,
    code: String(cfg.code || '').trim(),
    customCss: String(cfg.customCss || '').trim(),
    customJs: String(cfg.customJs || '').trim(),
  });
}

function isValidThemeTemplateHandle(handle) {
  return /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/.test(String(handle || '').trim());
}

function isValidThemeSectionId(sectionId) {
  return /^[a-zA-Z0-9._:-]+$/.test(String(sectionId || '').trim());
}

function getTemplateAlignmentHintsByTargetType(targetType) {
  const tt = toLower(targetType);
  if (tt === 'homepage') {
    return ['index'];
  }
  if (['product', 'all-products', 'all_products', 'specific_products'].includes(tt)) {
    return ['product'];
  }
  if (['collection', 'all-collections', 'all_collections'].includes(tt)) {
    return ['collection'];
  }
  if (tt === 'cart') {
    return ['cart'];
  }
  if (tt === 'article') {
    return ['article'];
  }
  if (tt === 'blog') {
    return ['blog'];
  }
  return [];
}

function parseActivationStartOptions(payload = {}) {
  const rawPercent =
    payload.canary_percent !== undefined ? payload.canary_percent : payload.traffic_ramp_percent;
  const rawDays =
    payload.canary_days !== undefined ? payload.canary_days : payload.traffic_ramp_days;
  const force = payload.force === true || payload.force === 'true';
  const parsedForceReason = parseOptionalText(payload.force_reason ?? payload.forceReason);
  const parsedVisualQaBaselineId = parseOptionalText(
    payload.visual_qa_baseline_id ??
      payload.visualQaBaselineId ??
      payload?.visual_qa?.baseline_id ??
      payload?.visual_qa?.baselineId
  );
  const parsedVisualQaCheckedAt = parseOptionalText(
    payload.visual_qa_checked_at ??
      payload.visualQaCheckedAt ??
      payload?.visual_qa?.checked_at ??
      payload?.visual_qa?.checkedAt
  );
  const parsedVisualQaRequired = parseOptionalBoolean(
    payload.visual_qa_required ??
      payload.visualQaRequired ??
      payload?.visual_qa?.required ??
      payload?.visual_qa?.enabled
  );

  const parsedPercent = parseOptionalNumber(rawPercent);
  const parsedDays = parseOptionalNumber(rawDays);
  const errors = [];

  let rampPercent = null;
  if (parsedPercent.hasValue) {
    if (parsedPercent.error) {
      errors.push(`canary_percent: ${parsedPercent.error}`);
    } else if (parsedPercent.value < 0 || parsedPercent.value > 100) {
      errors.push('canary_percent must be between 0 and 100');
    } else {
      rampPercent = Math.round(parsedPercent.value * 100) / 100;
    }
  }

  let rampDays = null;
  if (parsedDays.hasValue) {
    if (parsedDays.error) {
      errors.push(`canary_days: ${parsedDays.error}`);
    } else if (parsedDays.value < 1 || parsedDays.value > MAX_CANARY_DAYS) {
      errors.push(`canary_days must be between 1 and ${MAX_CANARY_DAYS}`);
    } else {
      rampDays = Math.round(parsedDays.value);
    }
  }

  const hasCanaryOverrides = parsedPercent.hasValue || parsedDays.hasValue;
  if (
    hasCanaryOverrides &&
    rampPercent !== null &&
    rampPercent > 0 &&
    rampPercent < 100 &&
    !rampDays
  ) {
    rampDays = DEFAULT_CANARY_DAYS;
  }
  if (force && !parsedForceReason.hasValue) {
    errors.push('force_reason is required when force=true');
  } else if (force && parsedForceReason.value.length < MIN_FORCE_REASON_LENGTH) {
    errors.push(`force_reason must be at least ${MIN_FORCE_REASON_LENGTH} characters`);
  }
  if (parsedVisualQaRequired.error) {
    errors.push(`visual_qa_required: ${parsedVisualQaRequired.error}`);
  }
  if (parsedVisualQaBaselineId.hasValue) {
    if (!/^[a-zA-Z0-9._:-]{2,120}$/.test(parsedVisualQaBaselineId.value)) {
      errors.push(
        'visual_qa_baseline_id must be 2-120 chars using letters, numbers, dot, underscore, colon, or hyphen'
      );
    }
  }
  let visualQaCheckedAtIso = null;
  if (parsedVisualQaCheckedAt.hasValue) {
    const parsedCheckedAt = parseDateOrNull(parsedVisualQaCheckedAt.value);
    if (!parsedCheckedAt) {
      errors.push('visual_qa_checked_at must be a valid date/time');
    } else {
      visualQaCheckedAtIso = parsedCheckedAt.toISOString();
    }
  }
  if (parsedVisualQaCheckedAt.hasValue && !parsedVisualQaBaselineId.hasValue) {
    errors.push('visual_qa_baseline_id is required when visual_qa_checked_at is provided');
  }
  const hasVisualQaOverrides =
    parsedVisualQaBaselineId.hasValue ||
    parsedVisualQaCheckedAt.hasValue ||
    parsedVisualQaRequired.hasValue;

  return {
    force,
    forceReason: parsedForceReason.value || null,
    errors,
    hasCanaryOverrides,
    rampPercent,
    rampDays,
    visualQa: {
      hasOverrides: hasVisualQaOverrides,
      baselineId: parsedVisualQaBaselineId.hasValue ? parsedVisualQaBaselineId.value : null,
      checkedAtIso: visualQaCheckedAtIso,
      required: parsedVisualQaRequired.hasValue ? parsedVisualQaRequired.value : null,
    },
  };
}

function applyActivationStartOptionsToTest(test, options = {}) {
  const hasCanaryOverrides = Boolean(options.hasCanaryOverrides);
  const hasVisualQaOverrides = Boolean(options?.visualQa?.hasOverrides);
  if (!test || typeof test !== 'object' || (!hasCanaryOverrides && !hasVisualQaOverrides)) {
    return test;
  }
  const nextSegments =
    test.segments && typeof test.segments === 'object' ? { ...test.segments } : {};
  if (hasCanaryOverrides && options.rampPercent !== null && options.rampPercent !== undefined) {
    nextSegments.traffic_ramp_percent = options.rampPercent;
    if (options.rampPercent <= 0 || options.rampPercent >= 100) {
      delete nextSegments.traffic_ramp_days;
    } else if (options.rampDays) {
      nextSegments.traffic_ramp_days = options.rampDays;
    }
  } else if (hasCanaryOverrides && options.rampDays) {
    nextSegments.traffic_ramp_days = options.rampDays;
  }
  const nextGoal = test.goal && typeof test.goal === 'object' ? { ...test.goal } : {};
  if (hasVisualQaOverrides) {
    const currentVisualQa =
      nextGoal.visual_qa && typeof nextGoal.visual_qa === 'object' ? { ...nextGoal.visual_qa } : {};
    if (options.visualQa.baselineId) {
      currentVisualQa.baseline_id = options.visualQa.baselineId;
    }
    if (options.visualQa.checkedAtIso) {
      currentVisualQa.checked_at = options.visualQa.checkedAtIso;
    }
    if (options.visualQa.required !== null && options.visualQa.required !== undefined) {
      currentVisualQa.required = options.visualQa.required;
      currentVisualQa.enabled = Boolean(options.visualQa.required);
      nextSegments.visual_qa_required = Boolean(options.visualQa.required);
    }
    nextGoal.visual_qa = currentVisualQa;
  }
  return {
    ...test,
    segments: nextSegments,
    goal: nextGoal,
  };
}

function addCheck(preflight, check) {
  preflight.checks.push(check);
  if (!check.ok) {
    if (check.severity === 'error') {
      preflight.errors.push(check);
    } else if (check.severity === 'warning') {
      preflight.warnings.push(check);
    }
  }
}

function extractThemeConfigParts(config = {}, fallbackMode = 'asset_flag') {
  const cfg = config && typeof config === 'object' ? config : {};
  const rawMode = cfg.themeMode || cfg.theme_mode;
  const mode = normalizeThemeMode(cfg.themeMode || cfg.theme_mode, fallbackMode);
  const templateHandle = String(
    cfg.themeTemplateHandle || cfg.theme_template_handle || cfg.template || ''
  ).trim();
  const sectionId = String(cfg.sectionId || cfg.section_id || '').trim();
  const bodyClass = String(cfg.bodyClass || cfg.body_class || '').trim();
  const themeId = String(cfg.themeId || cfg.theme_id || '').trim();
  const redirectUrl = String(
    cfg.url || cfg.themeRedirectUrl || cfg.theme_redirect_url || ''
  ).trim();
  const hasSignal = Boolean(
    templateHandle ||
    sectionId ||
    bodyClass ||
    themeId ||
    redirectUrl ||
    String(cfg.code || '').trim() ||
    String(cfg.customCss || '').trim() ||
    String(cfg.customJs || '').trim() ||
    (Array.isArray(cfg.visual_editor_rules) && cfg.visual_editor_rules.length > 0)
  );
  return {
    rawMode: rawMode === undefined || rawMode === null ? '' : String(rawMode).trim(),
    mode,
    templateHandle,
    sectionId,
    bodyClass,
    themeId,
    redirectUrl,
    hasSignal,
  };
}

async function runActivationPreflight(test, shopDomain) {
  const preflight = {
    ok: true,
    checks: [],
    errors: [],
    warnings: [],
  };

  if (!test || typeof test !== 'object') {
    addCheck(preflight, {
      id: 'test_exists',
      ok: false,
      severity: 'error',
      message: 'Test not found for activation preflight.',
    });
    preflight.ok = false;
    return preflight;
  }

  const status = toLower(test.status || 'draft');
  const canStart = ['draft', 'stopped', 'completed'].includes(status);
  addCheck(preflight, {
    id: 'status_startable',
    ok: canStart,
    severity: canStart ? 'ok' : 'error',
    message: canStart
      ? `Test status "${status}" can be started.`
      : `Test status "${status}" cannot be started.`,
  });

  const variants = Array.isArray(test.variants) ? test.variants : [];
  addCheck(preflight, {
    id: 'variants_minimum',
    ok: variants.length >= 2,
    severity: variants.length >= 2 ? 'ok' : 'error',
    message:
      variants.length >= 2
        ? 'At least two variants configured.'
        : 'At least two variants are required.',
  });

  const allocationSum = variants.reduce(
    (sum, variant) => sum + (Number(variant?.allocation) || 0),
    0
  );
  const allocationsOk = Math.abs(allocationSum - 100) <= 0.01;
  addCheck(preflight, {
    id: 'allocation_100',
    ok: allocationsOk,
    severity: allocationsOk ? 'ok' : 'error',
    message: allocationsOk
      ? 'Traffic allocation sums to 100%.'
      : `Traffic allocation must sum to 100% (current: ${allocationSum.toFixed(2)}%).`,
  });

  const rampPercent = Number(test?.segments?.traffic_ramp_percent);
  const hasRampPercent = Number.isFinite(rampPercent) && rampPercent > 0 && rampPercent < 100;
  const validRampPercent =
    test?.segments?.traffic_ramp_percent === undefined ||
    test?.segments?.traffic_ramp_percent === null ||
    test?.segments?.traffic_ramp_percent === '' ||
    (Number.isFinite(rampPercent) && rampPercent >= 0 && rampPercent <= 100);
  addCheck(preflight, {
    id: 'canary_percent_valid',
    ok: validRampPercent,
    severity: validRampPercent ? 'ok' : 'error',
    message: validRampPercent
      ? hasRampPercent
        ? `Canary ramp enabled at ${rampPercent}% start traffic.`
        : 'Canary ramp percent is valid.'
      : 'traffic_ramp_percent must be between 0 and 100.',
  });

  const rampDaysRaw = Number(test?.segments?.traffic_ramp_days);
  const rampDays =
    Number.isFinite(rampDaysRaw) && rampDaysRaw > 0 ? rampDaysRaw : DEFAULT_CANARY_DAYS;
  const validRampDays =
    !hasRampPercent ||
    test?.segments?.traffic_ramp_days === undefined ||
    test?.segments?.traffic_ramp_days === null ||
    test?.segments?.traffic_ramp_days === '' ||
    (Number.isFinite(rampDaysRaw) && rampDaysRaw >= 1 && rampDaysRaw <= MAX_CANARY_DAYS);
  addCheck(preflight, {
    id: 'canary_days_valid',
    ok: validRampDays,
    severity: validRampDays ? 'ok' : 'error',
    message: validRampDays
      ? hasRampPercent
        ? `Canary reaches 100% over ${Math.round(rampDays)} day(s).`
        : 'Canary ramp days are valid.'
      : `traffic_ramp_days must be between 1 and ${MAX_CANARY_DAYS}.`,
  });

  const guardrailEnabled = Boolean(test?.guardrail_config?.enabled);
  addCheck(preflight, {
    id: 'guardrail_enabled',
    ok: guardrailEnabled,
    severity: guardrailEnabled ? 'ok' : 'warning',
    message: guardrailEnabled
      ? 'Guardrail auto-stop is enabled.'
      : 'Guardrail is disabled. Consider enabling auto-stop before launch.',
  });

  if (shopDomain) {
    const oauthSession = await getShopSession(shopDomain).catch(() => null);
    const oauthHealth = await evaluateShopifyConnectionHealth({
      shopDomain,
      accessToken: oauthSession?.access_token || null,
      sessionScope: oauthSession?.scope || null,
    });
    addCheck(preflight, {
      id: 'shopify_oauth_health',
      ok: oauthHealth.connected,
      severity: oauthHealth.connected ? 'ok' : 'error',
      message:
        oauthHealth.connection?.message ||
        (oauthHealth.connected
          ? 'Shopify OAuth session is valid.'
          : 'Shopify OAuth session is not valid for this store.'),
      meta: oauthHealth.tokenHealth
        ? {
            code: oauthHealth.connection?.code,
            missing_scopes: oauthHealth.tokenHealth.missingScopes,
          }
        : undefined,
    });
    const missingScopes = Array.isArray(oauthHealth.tokenHealth?.missingScopes)
      ? oauthHealth.tokenHealth.missingScopes
      : [];
    if (missingScopes.length > 0 && oauthHealth.tokenHealth?.valid === true) {
      addCheck(preflight, {
        id: 'shopify_oauth_scopes',
        ok: false,
        severity: 'warning',
        message: `Shop token is missing ${missingScopes.length} scope(s): ${missingScopes.join(', ')}. Re-authorize from My domains (incognito install link) after \`npm run shopify:deploy:production:safe\` and releasing the app version.`,
        meta: { missing_scopes: missingScopes },
      });
    }
  }

  if (shopDomain && requiresStorefrontRuntimeForTest(test)) {
    try {
      const storefrontProbe = await runStorefrontSetupProbe(shopDomain);
      const runtimeReady = storefrontProbe.storefrontRuntimeReady === true;
      const embedNote = storefrontProbe.embedStatus?.note;
      const testType = toLower(test?.type);
      const strictStorefront =
        testType === 'price' ||
        testType === 'pricing' ||
        testType === 'offer' ||
        testType === 'shipping';
      const proxyScriptReady = storefrontProbe.proxyStatus?.scriptDetected === true;
      const runtimeOk =
        runtimeReady || (proxyScriptReady && storefrontProbe.embedStatus?.via === 'app_proxy');
      addCheck(preflight, {
        id: 'storefront_runtime_ready',
        ok: runtimeOk,
        severity: runtimeOk ? 'ok' : strictStorefront ? 'error' : 'warning',
        message: runtimeOk
          ? storefrontProbe.embedStatus?.via === 'app_proxy'
            ? embedNote || 'Storefront runtime is ready (App Proxy script verified).'
            : 'Storefront runtime is ready (App Proxy and theme embed verified).'
          : storefrontProbe.proxyStatus?.scriptDetected === false
            ? 'App Proxy script is not reachable at /apps/ripx/script.js. Open Settings → Installation to fix App Proxy and theme embed before relying on live assignment.'
            : 'Theme app embed was not detected on the storefront homepage. Enable RipX under Online Store → Themes → Customize → App embeds, or confirm App Proxy is configured in Settings → Installation.',
        meta: {
          storefront_runtime_ready: runtimeReady,
          embed_via: storefrontProbe.embedStatus?.via || null,
          password_protected: Boolean(storefrontProbe.embedStatus?.passwordProtected),
        },
      });
    } catch (error) {
      addCheck(preflight, {
        id: 'storefront_runtime_ready',
        ok: false,
        severity: 'warning',
        message: `Could not verify storefront runtime (${String(error?.message || error)}).`,
      });
    }
  }

  if (isThemeFamilyTest(test)) {
    const templateKey = toLower(test?.goal?.template_key);
    const fallbackMode = templateKey === 'template' ? 'template_switch' : 'asset_flag';
    const nonControlModeSet = new Set();
    let hasTemplateSwitchVariant = false;
    let hasActionableVariant = false;
    const targetType = toLower(test?.target_type);
    const templateAlignmentHints = getTemplateAlignmentHintsByTargetType(targetType);
    let controlSignature = null;
    let controlName = 'Control';
    let nonControlCount = 0;
    let nonControlDifferentCount = 0;
    const redirectOrigins = new Set();
    const redirectCrossOrigin = [];
    const templateSwitchHandles = [];
    const sectionVariantIds = [];
    variants.forEach((variant, index) => {
      const isControl = isLikelyControlVariant(variant, index);
      const cfg = variant?.config || {};
      const parts = extractThemeConfigParts(cfg, fallbackMode);
      const signature = buildThemeParitySignature(cfg, fallbackMode);
      if (isControl && controlSignature === null) {
        controlSignature = signature;
        controlName = variant?.name || 'Control';
      }
      if (!isControl) {
        nonControlCount += 1;
        if (controlSignature !== null && signature !== controlSignature) {
          nonControlDifferentCount += 1;
        }
      }
      if (!isControl && parts.rawMode && !isSupportedThemeMode(parts.rawMode)) {
        addCheck(preflight, {
          id: `theme_mode_${index + 1}`,
          ok: false,
          severity: 'error',
          message: `${variant?.name || `Variant ${index + 1}`}: unsupported theme mode "${parts.rawMode}".`,
        });
      }
      if (!isControl && parts.mode === 'template_switch' && !parts.templateHandle) {
        addCheck(preflight, {
          id: `theme_template_${index + 1}`,
          ok: false,
          severity: 'error',
          message: `${variant?.name || `Variant ${index + 1}`}: template handle required for template switch mode.`,
        });
      }
      if (!isControl && parts.mode === 'template_switch' && parts.templateHandle) {
        templateSwitchHandles.push(parts.templateHandle.toLowerCase());
      }
      if (
        !isControl &&
        parts.mode === 'template_switch' &&
        parts.templateHandle &&
        !isValidThemeTemplateHandle(parts.templateHandle)
      ) {
        addCheck(preflight, {
          id: `theme_template_format_${index + 1}`,
          ok: false,
          severity: 'error',
          message: `${variant?.name || `Variant ${index + 1}`}: template handle "${parts.templateHandle}" is not valid.`,
        });
      }
      if (
        !isControl &&
        parts.mode === 'template_switch' &&
        parts.templateHandle &&
        templateAlignmentHints.length > 0 &&
        !templateAlignmentHints.some(prefix =>
          parts.templateHandle.toLowerCase().startsWith(prefix)
        )
      ) {
        addCheck(preflight, {
          id: `theme_template_target_alignment_${index + 1}`,
          ok: false,
          severity: 'warning',
          message: `${variant?.name || `Variant ${index + 1}`}: template handle "${parts.templateHandle}" may not align with target_type "${targetType}".`,
          meta: { expected_prefixes: templateAlignmentHints },
        });
      }
      if (!isControl && parts.mode === 'section_variant' && !parts.sectionId) {
        addCheck(preflight, {
          id: `theme_section_${index + 1}`,
          ok: false,
          severity: 'error',
          message: `${variant?.name || `Variant ${index + 1}`}: section ID required for section variant mode.`,
        });
      }
      if (!isControl && parts.mode === 'section_variant' && parts.sectionId) {
        sectionVariantIds.push(parts.sectionId);
      }
      if (
        !isControl &&
        parts.mode === 'section_variant' &&
        parts.sectionId &&
        !isValidThemeSectionId(parts.sectionId)
      ) {
        addCheck(preflight, {
          id: `theme_section_format_${index + 1}`,
          ok: false,
          severity: 'error',
          message: `${variant?.name || `Variant ${index + 1}`}: section ID "${parts.sectionId}" is not valid.`,
        });
      }
      if (
        !isControl &&
        parts.mode === 'section_variant' &&
        parts.sectionId &&
        parts.sectionId.length < 4
      ) {
        addCheck(preflight, {
          id: `theme_section_length_${index + 1}`,
          ok: false,
          severity: 'warning',
          message: `${variant?.name || `Variant ${index + 1}`}: section ID "${parts.sectionId}" is unusually short.`,
        });
      }
      if (!isControl && parts.mode === 'theme_redirect' && !parts.redirectUrl) {
        addCheck(preflight, {
          id: `theme_redirect_${index + 1}`,
          ok: false,
          severity: 'error',
          message: `${variant?.name || `Variant ${index + 1}`}: redirect URL required for theme redirect mode.`,
        });
      }
      if (!isControl && parts.mode === 'theme_redirect' && parts.redirectUrl) {
        try {
          const baseHost = String(shopDomain || 'example.com').trim() || 'example.com';
          const parsed = new URL(parts.redirectUrl, `https://${baseHost}`);
          if (parts.redirectUrl.startsWith('http://') || parts.redirectUrl.startsWith('https://')) {
            const expectedOrigin = `https://${baseHost}`;
            if (parsed.origin !== expectedOrigin) {
              redirectCrossOrigin.push({
                name: variant?.name || `Variant ${index + 1}`,
                url: parts.redirectUrl,
              });
            }
          }
          redirectOrigins.add(parsed.pathname || '/');
        } catch (_err) {
          addCheck(preflight, {
            id: `theme_redirect_format_${index + 1}`,
            ok: false,
            severity: 'error',
            message: `${variant?.name || `Variant ${index + 1}`}: redirect URL "${parts.redirectUrl}" is not valid.`,
          });
        }
      }
      if (!isControl && parts.hasSignal) {
        hasActionableVariant = true;
        nonControlModeSet.add(parts.mode);
      }
      if (!isControl && parts.mode === 'template_switch') {
        hasTemplateSwitchVariant = true;
      }
    });
    addCheck(preflight, {
      id: 'theme_actionable_variant',
      ok: hasActionableVariant || variants.length <= 1,
      severity: hasActionableVariant || variants.length <= 1 ? 'ok' : 'error',
      message:
        hasActionableVariant || variants.length <= 1
          ? 'Theme test has actionable non-control variant config.'
          : 'Add at least one non-control theme variant signal (template/section/body class/theme id/code).',
    });

    const themeScopeRecommended = ['homepage', 'all', 'all-pages', 'all_pages', ''].includes(
      targetType
    );
    addCheck(preflight, {
      id: 'theme_scope_recommended',
      ok: themeScopeRecommended,
      severity: themeScopeRecommended ? 'ok' : 'warning',
      message: themeScopeRecommended
        ? 'Theme test scope looks compatible.'
        : `Theme tests usually target homepage/sitewide. Current target_type is "${targetType || 'unknown'}".`,
    });
    const modeParityOk = nonControlModeSet.size <= 1;
    addCheck(preflight, {
      id: 'theme_mode_parity',
      ok: modeParityOk,
      severity: modeParityOk ? 'ok' : 'warning',
      message: modeParityOk
        ? 'Theme mode parity is consistent across actionable variants.'
        : 'Actionable variants mix multiple theme modes. Keep one mode per test when possible.',
    });
    if (templateSwitchHandles.length > 1) {
      const templateDistinctCount = new Set(templateSwitchHandles).size;
      addCheck(preflight, {
        id: 'theme_template_handle_diversity',
        ok: templateDistinctCount > 1,
        severity: templateDistinctCount > 1 ? 'ok' : 'warning',
        message:
          templateDistinctCount > 1
            ? 'Template-switch handle diversity looks good.'
            : 'All template-switch variants use the same template handle. Consider different handles for stronger contrast.',
      });
    }
    if (sectionVariantIds.length > 1) {
      const sectionDistinctCount = new Set(sectionVariantIds).size;
      addCheck(preflight, {
        id: 'theme_section_id_diversity',
        ok: sectionDistinctCount > 1,
        severity: sectionDistinctCount > 1 ? 'ok' : 'warning',
        message:
          sectionDistinctCount > 1
            ? 'Section-variant IDs provide diversified section targets.'
            : 'All section-variant IDs are the same. Confirm this is intentional.',
      });
    }
    const hasParityDifference =
      nonControlCount === 0 || controlSignature === null || nonControlDifferentCount > 0;
    addCheck(preflight, {
      id: 'theme_control_parity',
      ok: hasParityDifference,
      severity: hasParityDifference ? 'ok' : 'error',
      message: hasParityDifference
        ? 'At least one non-control variant differs from control theme artifact signature.'
        : `All non-control variants are identical to ${controlName}. Update theme config/code so traffic has a meaningful variant.`,
    });
    if (redirectCrossOrigin.length > 0) {
      addCheck(preflight, {
        id: 'theme_redirect_origin_parity',
        ok: false,
        severity: 'warning',
        message:
          'One or more theme-redirect variants use cross-origin URLs. Same-store paths are recommended for parity and attribution.',
        meta: { variants: redirectCrossOrigin },
      });
    } else {
      addCheck(preflight, {
        id: 'theme_redirect_origin_parity',
        ok: true,
        severity: 'ok',
        message: 'Theme redirect origin parity check passed.',
      });
    }
    if (
      redirectOrigins.size === 1 &&
      nonControlModeSet.has('theme_redirect') &&
      redirectOrigins.size > 0
    ) {
      addCheck(preflight, {
        id: 'theme_redirect_path_diversity',
        ok: false,
        severity: 'warning',
        message:
          'All theme-redirect variants route to the same path. Consider distinct destinations to maximize test contrast.',
      });
    } else if (nonControlModeSet.has('theme_redirect')) {
      addCheck(preflight, {
        id: 'theme_redirect_path_diversity',
        ok: true,
        severity: 'ok',
        message: 'Theme redirect path diversity looks good.',
      });
    }
    const templateTargetTypeSuspicious =
      hasTemplateSwitchVariant &&
      ['all-products', 'all_products', 'product', 'collection', 'specific_products'].includes(
        targetType
      );
    addCheck(preflight, {
      id: 'theme_template_target_integrity',
      ok: !templateTargetTypeSuspicious,
      severity: templateTargetTypeSuspicious ? 'warning' : 'ok',
      message: templateTargetTypeSuspicious
        ? 'Template-switch variants usually should not target product-scoped traffic only.'
        : 'Template/target integrity checks passed.',
    });

    const visualQaConfig =
      test?.goal?.visual_qa && typeof test.goal.visual_qa === 'object'
        ? test.goal.visual_qa
        : test?.segments?.visual_qa && typeof test.segments.visual_qa === 'object'
          ? test.segments.visual_qa
          : null;
    const visualQaRequired =
      visualQaConfig?.required === true ||
      visualQaConfig?.enabled === true ||
      test?.segments?.visual_qa_required === true;
    const visualQaBaselineId = String(
      visualQaConfig?.baseline_id || visualQaConfig?.baselineId || ''
    ).trim();
    const visualQaCheckedAtRaw =
      visualQaConfig?.checked_at || visualQaConfig?.checkedAt || visualQaConfig?.last_checked_at;
    const visualQaCheckedAt = parseDateOrNull(visualQaCheckedAtRaw);
    if (visualQaRequired && !visualQaBaselineId) {
      addCheck(preflight, {
        id: 'theme_visual_qa_baseline_required',
        ok: false,
        severity: 'error',
        message: 'Visual QA baseline is required but no baseline_id is configured.',
      });
    } else if (!visualQaRequired && !visualQaBaselineId) {
      addCheck(preflight, {
        id: 'theme_visual_qa_baseline_recommended',
        ok: false,
        severity: 'warning',
        message:
          'Consider configuring visual QA baseline metadata (goal.visual_qa.baseline_id) for theme launch confidence.',
      });
    } else if (visualQaBaselineId) {
      addCheck(preflight, {
        id: 'theme_visual_qa_baseline_present',
        ok: true,
        severity: 'ok',
        message: `Visual QA baseline configured (${visualQaBaselineId}).`,
      });
    }
    if (visualQaCheckedAtRaw && !visualQaCheckedAt) {
      addCheck(preflight, {
        id: 'theme_visual_qa_checked_at_format',
        ok: false,
        severity: 'warning',
        message: 'visual_qa.checked_at is not a valid date format.',
      });
    } else if (visualQaCheckedAt) {
      const qaAgeDays = Math.floor(
        (Date.now() - visualQaCheckedAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const qaIsFresh = qaAgeDays <= 30;
      addCheck(preflight, {
        id: 'theme_visual_qa_recency',
        ok: qaIsFresh,
        severity: qaIsFresh ? 'ok' : 'warning',
        message: qaIsFresh
          ? `Visual QA check is recent (${qaAgeDays} day(s) ago).`
          : `Visual QA check is stale (${qaAgeDays} day(s) ago). Re-run visual QA before launch.`,
      });
    }
  }

  if (supportsCheckoutReadiness(test)) {
    const fallbackSession = shopDomain ? await getShopSession(shopDomain).catch(() => null) : null;
    const accessToken = fallbackSession?.access_token || '';
    const readiness = await buildTestCheckoutReadiness({
      test,
      shopDomain,
      accessToken,
    }).catch(error => ({
      summary: { status: 'blocked' },
      checks: [
        {
          id: 'checkout_readiness_lookup_failed',
          ok: false,
          severity: 'error',
          message: String(error?.message || 'Checkout readiness could not be resolved.'),
        },
      ],
    }));
    const failedReadinessChecks = Array.isArray(readiness?.checks)
      ? readiness.checks.filter(item => item?.ok === false)
      : [];
    if (failedReadinessChecks.length === 0) {
      addCheck(preflight, {
        id: 'checkout_launch_readiness',
        ok: true,
        severity: 'ok',
        message: readiness?.summary?.headline || 'Checkout launch readiness checks passed.',
        meta: { status: readiness?.summary?.status || 'ready' },
      });
    } else {
      failedReadinessChecks.forEach(item => {
        addCheck(preflight, {
          id: item.id || 'checkout_readiness_item',
          ok: false,
          severity: item.severity === 'error' ? 'error' : 'warning',
          message: item.message,
          meta: item.action_path ? { action_path: item.action_path } : undefined,
        });
      });
    }
  }

  const experimentGroup = getExperimentGroupKey(test);
  if (experimentGroup && shopDomain) {
    const runningTests = await getTestsByShop(shopDomain, 'running');
    const groupConflicts = runningTests.filter(candidate => {
      if (!candidate || String(candidate.id) === String(test.id)) {
        return false;
      }
      return getExperimentGroupKey(candidate) === experimentGroup;
    });
    addCheck(preflight, {
      id: 'experiment_group_conflicts',
      ok: groupConflicts.length === 0,
      severity: groupConflicts.length === 0 ? 'ok' : 'warning',
      message:
        groupConflicts.length === 0
          ? 'No active experiment-group conflicts.'
          : `Another running test shares experiment group "${experimentGroup}".`,
      meta:
        groupConflicts.length > 0
          ? { conflicts: groupConflicts.map(item => ({ id: item.id, name: item.name })) }
          : undefined,
    });
  }

  if (shopDomain) {
    const overlapConflicts = await conflictDetectionService.findConflicts(
      shopDomain,
      test.id,
      test
    );
    addCheck(preflight, {
      id: 'target_overlap_conflicts',
      ok: overlapConflicts.length === 0,
      severity: overlapConflicts.length === 0 ? 'ok' : 'warning',
      message:
        overlapConflicts.length === 0
          ? 'No overlapping running target conflicts detected.'
          : `Found ${overlapConflicts.length} overlapping running test(s).`,
      meta:
        overlapConflicts.length > 0
          ? { conflicts: overlapConflicts.map(item => ({ id: item.id, name: item.name })) }
          : undefined,
    });
  }

  preflight.ok = preflight.errors.length === 0;
  return preflight;
}

module.exports = {
  DEFAULT_CANARY_DAYS,
  MAX_CANARY_DAYS,
  parseActivationStartOptions,
  applyActivationStartOptionsToTest,
  runActivationPreflight,
  isThemeFamilyTest,
};
