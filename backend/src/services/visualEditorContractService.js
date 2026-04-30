const crypto = require('crypto');

const VISUAL_EDIT_ACTIONS = Object.freeze([
  'text',
  'hide',
  'show',
  'image',
  'class_token',
  'style_token',
  'link',
]);

function normalizeOrigin(origin) {
  try {
    return new URL(String(origin || '')).origin;
  } catch (_) {
    return null;
  }
}

function createVisualEditorSession({ shopDomain, testId, previewUrl, appOrigin }) {
  const allowedOrigin = normalizeOrigin(previewUrl);
  const parentOrigin = normalizeOrigin(appOrigin);
  return {
    sessionId: crypto.randomUUID(),
    testId: testId || null,
    shopDomain: shopDomain || null,
    previewUrl: previewUrl || null,
    allowedOrigins: [allowedOrigin, parentOrigin].filter(Boolean),
    messageNamespace: 'ripx.visual_editor.v1',
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    capabilities: {
      selectorCapture: true,
      directDomMutation: false,
      supportedActions: VISUAL_EDIT_ACTIONS,
    },
  };
}

function validateVisualEdit(edit = {}) {
  const action = String(edit.action || '').trim();
  const selector = String(edit.selector || '').trim();
  const errors = [];
  if (!VISUAL_EDIT_ACTIONS.includes(action)) {
    errors.push(`action must be one of: ${VISUAL_EDIT_ACTIONS.join(', ')}`);
  }
  if (!selector || selector.length > 1000) {
    errors.push('selector is required and must be less than 1000 characters');
  }
  return {
    valid: errors.length === 0,
    errors,
    edit: {
      action,
      selector,
      value: edit.value ?? null,
      metadata: edit.metadata && typeof edit.metadata === 'object' ? edit.metadata : {},
    },
  };
}

function buildPostMessageContract(session) {
  return {
    namespace: session.messageNamespace,
    allowedOrigins: session.allowedOrigins,
    messages: [
      { type: 'ripx:selector:hover', direction: 'storefront_to_app' },
      { type: 'ripx:selector:select', direction: 'storefront_to_app' },
      { type: 'ripx:edit:preview', direction: 'app_to_storefront' },
      { type: 'ripx:session:close', direction: 'app_to_storefront' },
    ],
    security: {
      requireOriginMatch: true,
      requireSessionId: true,
      rejectInlineScriptEdits: true,
    },
  };
}

module.exports = {
  VISUAL_EDIT_ACTIONS,
  buildPostMessageContract,
  createVisualEditorSession,
  validateVisualEdit,
};
