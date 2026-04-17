const shopifyService = require('./shopifyService');

function normalizeLower(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function toStringArray(input) {
  if (Array.isArray(input)) {
    return input
      .map(item => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 50);
  }
  return String(input || '')
    .split(/\n|,/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function normalizeCheckoutPhase(test = {}) {
  const value = normalizeLower(test?.goal?.checkout_phase || 'experience');
  return ['experience', 'payment_method', 'delivery_method'].includes(value) ? value : 'experience';
}

function isCheckoutCustomizationPhase(test = {}) {
  const type = normalizeLower(test?.type);
  if (type && type !== 'checkout') {
    return false;
  }
  const phase = normalizeCheckoutPhase(test);
  return phase === 'payment_method' || phase === 'delivery_method';
}

function getPhaseDetails(phase) {
  if (phase === 'payment_method') {
    return {
      apiTypeNeedle: 'payment_customization',
      listField: 'paymentCustomizations',
      ownerType: 'PaymentCustomization',
      mutationName: 'paymentCustomization',
      createMutationName: 'paymentCustomizationCreate',
      updateMutationName: 'paymentCustomizationUpdate',
      inputType: 'PaymentCustomizationInput!',
      responseErrorKey: 'PaymentCustomizationError',
      namespace: 'payment-customization',
      key: 'function-configuration',
      targetField: 'payment_method_names',
      actionField: 'payment_action',
      renameField: 'payment_rename_to',
      titleLabel: 'payment customization',
    };
  }
  return {
    apiTypeNeedle: 'delivery_customization',
    listField: 'deliveryCustomizations',
    ownerType: 'DeliveryCustomization',
    mutationName: 'deliveryCustomization',
    createMutationName: 'deliveryCustomizationCreate',
    updateMutationName: 'deliveryCustomizationUpdate',
    inputType: 'DeliveryCustomizationInput!',
    responseErrorKey: 'DeliveryCustomizationError',
    namespace: 'delivery-customization',
    key: 'function-configuration',
    targetField: 'delivery_method_names',
    actionField: 'delivery_action',
    renameField: 'delivery_rename_to',
    titleLabel: 'delivery customization',
  };
}

function buildCustomizationTitle(test = {}, phase) {
  const suffix = phase === 'payment_method' ? 'Payment methods' : 'Delivery methods';
  const testName = String(test?.name || 'Checkout test').trim();
  const testId = String(test?.id || '').trim();
  const uniqueSuffix = testId ? ` · ${testId.slice(0, 8)}` : '';
  return `RipX ${suffix} · ${testName}${uniqueSuffix}`.slice(0, 255);
}

function buildVariantRules(test = {}, phase) {
  const details = getPhaseDetails(phase);
  const variants = Array.isArray(test?.variants) ? test.variants : [];
  return variants
    .map((variant, index) => {
      const isControl = index === 0 || /^control\b/i.test(String(variant?.name || '').trim());
      if (isControl) {
        return null;
      }
      const cfg = variant?.config && typeof variant.config === 'object' ? variant.config : {};
      const methodNames = toStringArray(cfg[details.targetField]);
      if (methodNames.length === 0) {
        return null;
      }
      const action = normalizeLower(cfg[details.actionField] || 'hide');
      const renameTo = String(cfg[details.renameField] || '').trim();
      if (action === 'rename' && !renameTo) {
        throw new Error(
          `${variant?.name || `Variant ${index + 1}`}: rename target is required when ${details.titleLabel} action is set to rename.`
        );
      }
      return {
        variant_id: String(variant?.id || variant?.name || `variant-${index}`).trim(),
        variant_name: String(variant?.name || `Variant ${index + 1}`).trim(),
        action: ['hide', 'rename', 'reorder'].includes(action) ? action : 'hide',
        method_names: methodNames,
        rename_to: renameTo,
      };
    })
    .filter(Boolean);
}

function buildCheckoutCustomizationConfig(test = {}) {
  const phase = normalizeCheckoutPhase(test);
  if (!isCheckoutCustomizationPhase(test)) {
    throw new Error(
      'Checkout customization deployment is available only for payment or delivery phases.'
    );
  }
  const rules = buildVariantRules(test, phase);
  if (rules.length === 0) {
    throw new Error(
      'At least one non-control variant must target payment or delivery methods before deployment.'
    );
  }
  return {
    phase,
    test_id: String(test?.id || '').trim() || null,
    test_name: String(test?.name || '').trim() || null,
    assignment_keys: {
      test: '_ripx_price_test',
      variant: '_ripx_variant',
    },
    variant_rules: rules,
  };
}

function toGraphqlUserErrors(errors) {
  return Array.isArray(errors)
    ? errors
        .map(item => ({
          field: Array.isArray(item?.field) ? item.field.join('.') : item?.field || null,
          message: String(item?.message || '').trim(),
          code: item?.code || null,
        }))
        .filter(item => item.message)
    : [];
}

async function fetchShopifyFunctions(shopDomain, accessToken) {
  const query = `
    query ripxCheckoutCustomizationFunctions {
      shopifyFunctions(first: 50) {
        nodes {
          id
          title
          apiType
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, query);
  return response?.data?.shopifyFunctions?.nodes || [];
}

function pickCustomizationFunction(functionsList = [], phase) {
  const { apiTypeNeedle } = getPhaseDetails(phase);
  const candidates = (Array.isArray(functionsList) ? functionsList : []).filter(node => {
    const apiType = normalizeLower(node?.apiType);
    return apiType.includes(apiTypeNeedle) || apiType.includes(apiTypeNeedle.replace(/_/g, ' '));
  });
  const ripxCandidate = candidates.find(node => normalizeLower(node?.title).includes('ripx'));
  return ripxCandidate || candidates[0] || null;
}

async function fetchExistingCustomizations(shopDomain, accessToken, phase) {
  const details = getPhaseDetails(phase);
  const query = `
    query ripxCheckoutCustomizations {
      ${details.listField}(first: 100) {
        edges {
          node {
            id
            title
            enabled
            functionId
          }
        }
      }
    }
  `;
  const response = await shopifyService.requestAdminGraphql(shopDomain, accessToken, query);
  return response?.data?.[details.listField]?.edges?.map(edge => edge?.node).filter(Boolean) || [];
}

async function createCustomization(shopDomain, accessToken, phase, functionId, title) {
  const details = getPhaseDetails(phase);
  const mutation = `
    mutation ripxCreateCheckoutCustomization($input: ${details.inputType}) {
      ${details.createMutationName}(${details.mutationName}: $input) {
        ${details.mutationName} {
          id
          title
          enabled
          functionId
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const variables = {
    input: {
      title,
      functionId,
      enabled: true,
    },
  };
  const response = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    mutation,
    variables
  );
  const payload = response?.data?.[details.createMutationName];
  const userErrors = toGraphqlUserErrors(payload?.userErrors);
  return {
    customization: payload?.[details.mutationName] || null,
    userErrors,
  };
}

async function updateCustomization(
  shopDomain,
  accessToken,
  phase,
  customizationId,
  functionId,
  title
) {
  const details = getPhaseDetails(phase);
  const mutation = `
    mutation ripxUpdateCheckoutCustomization($id: ID!, $input: ${details.inputType}) {
      ${details.updateMutationName}(id: $id, ${details.mutationName}: $input) {
        ${details.mutationName} {
          id
          title
          enabled
          functionId
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const variables = {
    id: customizationId,
    input: {
      title,
      functionId,
      enabled: true,
    },
  };
  const response = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    mutation,
    variables
  );
  const payload = response?.data?.[details.updateMutationName];
  const userErrors = toGraphqlUserErrors(payload?.userErrors);
  return {
    customization: payload?.[details.mutationName] || null,
    userErrors,
  };
}

async function setCustomizationMetafield(shopDomain, accessToken, phase, customizationId, config) {
  const details = getPhaseDetails(phase);
  const mutation = `
    mutation ripxSetCheckoutCustomizationMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;
  const variables = {
    metafields: [
      {
        ownerId: customizationId,
        namespace: details.namespace,
        key: details.key,
        type: 'json',
        value: JSON.stringify(config),
      },
    ],
  };
  const response = await shopifyService.requestAdminGraphql(
    shopDomain,
    accessToken,
    mutation,
    variables
  );
  const payload = response?.data?.metafieldsSet;
  return {
    metafields: payload?.metafields || [],
    userErrors: toGraphqlUserErrors(payload?.userErrors),
  };
}

async function ensureCheckoutCustomizationDeployment({
  test,
  shopDomain,
  accessToken,
  apply = false,
}) {
  if (!accessToken) {
    throw new Error(
      'Missing Shopify access token for this store. Open RipX from Shopify Admin and try again.'
    );
  }
  const phase = normalizeCheckoutPhase(test);
  const config = buildCheckoutCustomizationConfig(test);
  const functionsList = await fetchShopifyFunctions(shopDomain, accessToken);
  const chosenFunction = pickCustomizationFunction(functionsList, phase);
  if (!chosenFunction?.id) {
    throw new Error(
      `No ${phase === 'payment_method' ? 'payment' : 'delivery'} customization function is available on this shop yet.`
    );
  }

  const title = buildCustomizationTitle(test, phase);
  const existing = (await fetchExistingCustomizations(shopDomain, accessToken, phase)).find(
    item => normalizeLower(item?.title) === normalizeLower(title)
  );

  if (!apply) {
    return {
      ok: true,
      phase,
      dry_run: true,
      function: chosenFunction,
      customization: existing || null,
      config,
      status: existing ? 'would_update' : 'would_create',
      message: existing
        ? 'Checkout customization exists and would be updated with the latest RipX config.'
        : 'Checkout customization would be created and configured.',
    };
  }

  const mutationResult = existing?.id
    ? await updateCustomization(
        shopDomain,
        accessToken,
        phase,
        existing.id,
        chosenFunction.id,
        title
      )
    : await createCustomization(shopDomain, accessToken, phase, chosenFunction.id, title);
  if (mutationResult.userErrors.length > 0 || !mutationResult.customization?.id) {
    throw new Error(
      mutationResult.userErrors[0]?.message ||
        `Could not ${existing?.id ? 'update' : 'create'} checkout customization.`
    );
  }

  const metafieldResult = await setCustomizationMetafield(
    shopDomain,
    accessToken,
    phase,
    mutationResult.customization.id,
    config
  );
  if (metafieldResult.userErrors.length > 0) {
    throw new Error(
      metafieldResult.userErrors[0]?.message ||
        'Checkout customization was created, but config metafield could not be saved.'
    );
  }

  return {
    ok: true,
    phase,
    dry_run: false,
    function: chosenFunction,
    customization: mutationResult.customization,
    config,
    metafields: metafieldResult.metafields,
    status: existing?.id ? 'updated' : 'created',
    message: existing?.id
      ? 'Checkout customization updated and configured.'
      : 'Checkout customization created and configured.',
  };
}

module.exports = {
  normalizeCheckoutPhase,
  isCheckoutCustomizationPhase,
  buildCheckoutCustomizationConfig,
  buildCustomizationTitle,
  fetchExistingCustomizations,
  ensureCheckoutCustomizationDeployment,
  pickCustomizationFunction,
};
