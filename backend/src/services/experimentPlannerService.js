const abTestEngine = require('./abTestEngine');

const MAX_BRIEF_LENGTH = 4000;

function sanitizeText(value, maxLength = 500) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function buildDraftFromBrief(input = {}) {
  const brief = sanitizeText(input.brief || input.prompt || '', MAX_BRIEF_LENGTH);
  const objective = sanitizeText(input.objective || brief, 180);
  const suggestedType = sanitizeText(input.testType || input.type || 'content', 40) || 'content';
  return {
    name: objective ? `${objective.slice(0, 70)} test` : 'AI drafted experiment',
    type: suggestedType,
    hypothesis: objective || 'Changing the customer experience will improve the primary metric.',
    variants: [
      { name: 'Control', allocation: 50, config: {} },
      {
        name: 'Variant A',
        allocation: 50,
        config: {
          draft_notes: brief || 'Describe the proposed change before saving this draft.',
        },
      },
    ],
    goal: {
      metric: sanitizeText(input.metric || 'conversion_rate', 80),
      primary: sanitizeText(input.metric || 'conversion_rate', 80),
      secondary: [],
      guardrails: [
        { id: 'conversion_rate_guardrail', metric: 'conversion_rate', min_relative_lift: -10 },
      ],
    },
    targeting: {
      audience: sanitizeText(input.audience || 'All eligible storefront visitors', 160),
    },
    risks: [
      'Draft only: validate copy, audience, and setup before saving.',
      'Do not launch until assignment, tracking, and guardrails pass readiness checks.',
    ],
    requiredSetup: [
      'Confirm test type and variant configuration.',
      'Confirm primary metric and conversion instrumentation.',
      'Run existing validation before saving or launching.',
    ],
  };
}

function validateDraft(draft) {
  const validation = abTestEngine.validateTest({
    name: draft.name,
    type: draft.type,
    variants: draft.variants,
    goal: draft.goal,
  });
  return {
    valid: validation.valid !== false,
    errors: validation.errors || [],
  };
}

function createPlannerDraft(input = {}) {
  const draft = buildDraftFromBrief(input);
  const validation = validateDraft(draft);
  return {
    draft,
    validation,
    mode: process.env.OPENAI_API_KEY ? 'structured_stub_ready_for_llm' : 'structured_stub',
    persisted: false,
    launchable: false,
  };
}

module.exports = {
  buildDraftFromBrief,
  createPlannerDraft,
  validateDraft,
};
