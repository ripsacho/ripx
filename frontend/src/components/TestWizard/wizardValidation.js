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
    const holdoutValue = Number(formData.holdout_percent);
    if (!Number.isNaN(holdoutValue) && (holdoutValue < 0 || holdoutValue > 50)) {
      errors.push('Holdout percent must be between 0 and 50.');
    }
  }

  // Traffic step
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
  }

  // Code step
  if (stepId === stepIds.code) {
    if (cssValidationErrors.length > 0) {
      errors.push('Fix CSS syntax errors before continuing.');
    }
    if (jsValidationErrors.length > 0) {
      errors.push('Fix JavaScript syntax errors before continuing.');
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
  }

  return errors;
}
