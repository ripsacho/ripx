/**
 * Mail process service
 *
 * Manages enable/disable and optional template overrides for each email sending process.
 * Config stored in key_value_store as mail_process.<key> = JSON { enabled, subject?, bodyHtml?, bodyText? }.
 * When a process is disabled, callers still invoke the send path but we skip sending and return success
 * so the flow never gets stuck.
 */

const { query } = require('../utils/database');
const logger = require('../utils/logger');

const KV_PREFIX = 'mail_process.';

/** Max lengths for stored template fields (subject chars; body bytes) to prevent abuse and keep DB sane */
const MAX_SUBJECT_LENGTH = 500;
const MAX_BODY_LENGTH = 200 * 1024; // 200KB per body field

function escapeHtml(s) {
  if (s === null || s === undefined) {
    return '';
  }
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace {{placeholder}} in a template string with variables. Optionally HTML-escape values.
 * @param {string} template - String possibly containing {{key}}
 * @param {Object} variables - Map of key -> value
 * @param {{ htmlEscape?: boolean }} options - If true, escape variable values for HTML
 * @returns {string}
 */
function substituteVariables(template, variables = {}, options = {}) {
  if (template === null || template === undefined || typeof template !== 'string') {
    return '';
  }
  const htmlEscape = options.htmlEscape === true;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    const str = value !== null && value !== undefined ? String(value) : '';
    return htmlEscape ? escapeHtml(str) : str;
  });
}

/** Process definitions: default templates + placeholders (for admin UI and validation) */
const PROCESS_DEFINITIONS = {
  login_code: {
    name: 'Login code (OTP)',
    description: '6-digit one-time code sent when user requests sign-in.',
    defaultSubject: 'Your RipX sign-in code',
    placeholders: ['{{code}}'],
    defaultBodyHtml:
      '<p><strong>Sign in to RipX</strong></p>\n<p>Your one-time sign-in code is:</p>\n<p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em; color: #06b6d4; margin: 16px 0;">{{code}}</p>\n<p class="muted">This code expires in <strong>1 minute</strong> and can only be used once.</p>\n<div class="divider"></div>\n<p class="muted">If you didn\'t request this code, you can safely ignore this email.</p>',
    defaultBodyText:
      "Sign in to RipX\n\nYour one-time sign-in code is: {{code}}\n\nThis code expires in 1 minute and can only be used once.\n\nIf you didn't request this code, you can safely ignore this email.",
  },
  login_link: {
    name: 'Login link (magic link)',
    description: 'One-time sign-in link sent when user requests email link.',
    defaultSubject: 'Sign in to RipX',
    placeholders: ['{{link}}', '{{minutes}}'],
    defaultBodyHtml:
      '<p><strong>Sign in to RipX</strong></p>\n<p>Click the button below to sign in. This link is valid for <strong>{{minutes}} minutes</strong> and can only be used once.</p>\n<p><a href="{{link}}" class="btn">Sign in to RipX</a></p>\n<p class="muted">If the button doesn\'t work, copy and paste this link into your browser:</p>\n<p class="muted" style="word-break: break-all; font-size: 13px;">{{link}}</p>\n<div class="divider"></div>\n<p class="muted">If you didn\'t request this email, you can safely ignore it.</p>',
    defaultBodyText:
      'Sign in to RipX\n\nUse this link to sign in. It expires in {{minutes}} minutes and can only be used once.\n\n{{link}}\n\nIf you did not request this, you can ignore this email.',
  },
  confirmation_link: {
    name: 'Email confirmation link',
    description: 'Link sent after registration to confirm email address.',
    defaultSubject: 'Confirm your RipX account',
    placeholders: ['{{link}}', '{{minutes}}'],
    defaultBodyHtml:
      '<p><strong>Confirm your email address</strong></p>\n<p>Thanks for registering with RipX. Please confirm your email by clicking the button below. This link expires in <strong>{{minutes}} minutes</strong>.</p>\n<p><a href="{{link}}" class="btn">Confirm my email</a></p>\n<p class="muted">If the button doesn\'t work, copy and paste this link into your browser:</p>\n<p class="muted" style="word-break: break-all; font-size: 13px;">{{link}}</p>\n<div class="divider"></div>\n<p><strong>What happens next?</strong></p>\n<ul>\n  <li>After you confirm, your account will be reviewed by an administrator.</li>\n  <li>You\'ll receive an email when your account is approved.</li>\n  <li>Then you can sign in using the same email and request a login link.</li>\n</ul>\n<p class="muted">If you didn\'t create an account with RipX, you can safely ignore this email.</p>',
    defaultBodyText:
      'Confirm your RipX account\n\nPlease confirm your email by clicking the link below. It expires in {{minutes}} minutes.\n\n{{link}}\n\nAfter confirmation, your account will be reviewed by an administrator. You will receive an email when approved.',
  },
  acceptance: {
    name: 'Account approval',
    description: "Email when an admin approves a user's registration.",
    defaultSubject: 'Your RipX account has been approved',
    placeholders: ['{{signInUrl}}'],
    defaultBodyHtml:
      '<p><strong>You\'re all set!</strong></p>\n<p>Your RipX account has been approved. You can now sign in and start managing your domains and A/B tests.</p>\n<p><a href="{{signInUrl}}" class="btn">Sign in to RipX</a></p>\n<div class="divider"></div>\n<p><strong>How to sign in</strong></p>\n<ul>\n  <li>Go to the sign-in page and enter the email address you registered with.</li>\n  <li>Click "Send login link" — we\'ll email you a one-time link.</li>\n  <li>Click the link in the email to sign in. No password needed.</li>\n</ul>\n<p class="muted">If you have any questions, contact your administrator.</p>',
    defaultBodyText:
      'Your RipX account has been approved.\n\nYou can now sign in. Use the email address you registered with and request a login link from the sign-in page.\n\nSign in at: {{signInUrl}}',
  },
  domain_api_key: {
    name: 'Domain API key',
    description: 'API key sent when a domain is added or key is regenerated.',
    defaultSubject: null,
    placeholders: ['{{domain}}', '{{apiKey}}'],
    defaultBodyHtml:
      '<p><strong>Domain added successfully</strong></p>\n<p>Your domain <strong>{{domain}}</strong> has been added to your RipX account.</p>\n<p>Use the API key below to connect your site to RipX.</p>\n<p class="api-key-label">API key (store securely — shown only once)</p>\n<div class="api-key-box">{{apiKey}}</div>\n<p class="muted">Use this key in the <strong>X-RipX-API-Key</strong> header when connecting your site to RipX.</p>\n<div class="divider"></div>\n<p><strong>What to do next</strong></p>\n<ul>\n  <li>Add the RipX script to your site and set the X-RipX-API-Key header to this key.</li>\n  <li>Or open the RipX dashboard and connect using this key when prompted.</li>\n</ul>\n<p class="muted">Keep this email secure. Anyone with this key can manage tests for your domains.</p>',
    defaultBodyText:
      'Your RipX API key for {{domain}}.\n\nAPI key (store securely — shown only once):\n{{apiKey}}\n\nUse this key in the X-RipX-API-Key header when connecting your site to RipX.',
  },
  domain_added_notification: {
    name: 'Domain added (no key)',
    description: 'Notification when a domain is added to an existing account (no new API key).',
    defaultSubject: null,
    placeholders: ['{{domain}}', '{{dashboardUrl}}', '{{settingsUrl}}'],
    defaultBodyHtml:
      '<p><strong>Domain added</strong></p>\n<p>Your domain <strong>{{domain}}</strong> has been added to your RipX account.</p>\n<p>Use your <strong>existing account API key</strong> to connect this site. If you\'ve lost your key, regenerate it from Settings.</p>\n<div class="divider"></div>\n<p><a href="{{dashboardUrl}}" class="btn">Open Dashboard</a></p>\n<p class="muted"><a href="{{settingsUrl}}">Settings</a> — regenerate API key if needed.</p>',
    defaultBodyText:
      "Domain {{domain}} added to your RipX account.\n\nUse your existing account API key to connect this site. If you've lost your key, regenerate it from Settings.",
  },
  announcement: {
    name: 'Announcement',
    description: 'Custom announcement emails sent by admin from the admin panel.',
    defaultSubject: 'Announcement from RipX',
    placeholders: [],
    defaultBodyHtml: null,
    defaultBodyText: null,
  },
};

/**
 * Get stored config for a process (from key_value_store). Returns null if not set.
 * @param {string} key - Process key
 * @returns {Promise<{ enabled: boolean, subject?: string, bodyHtml?: string, bodyText?: string } | null>}
 */
async function getStoredConfig(key) {
  const kvKey = KV_PREFIX + key;
  const result = await query('SELECT value FROM key_value_store WHERE key = $1', [kvKey]);
  const row = result.rows[0];
  if (!row || row.value === null || row.value === undefined || row.value === '') {
    return null;
  }
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

/**
 * Check if a mail process is enabled. If no stored config, defaults to true.
 * On DB/config read error, returns true (fail open) so email flow is not stuck.
 * @param {string} key - Process key
 * @returns {Promise<boolean>}
 */
async function isEnabled(key) {
  try {
    const stored = await getStoredConfig(key);
    if (stored === null || stored === undefined) {
      return true;
    }
    return stored.enabled !== false;
  } catch (err) {
    logger.warn('mailProcessService.isEnabled failed, defaulting to enabled', {
      key,
      error: err.message,
    });
    return true;
  }
}

/**
 * Merge definition + stored into config (used by getConfig and listProcesses when stored is preloaded).
 * @param {string} key - Process key
 * @param {Object|null} stored - Preloaded stored config or null
 * @returns {{ enabled: boolean, subject: string, bodyHtml: string, bodyText: string, name: string, description: string, placeholders: string[] }}
 */
function mergeConfig(key, stored) {
  const def = PROCESS_DEFINITIONS[key];
  if (!def) {
    return {
      enabled: true,
      name: key,
      description: '',
      subject: '',
      bodyHtml: '',
      bodyText: '',
      placeholders: [],
    };
  }
  const enabled = stored === null || stored === undefined ? true : stored.enabled !== false;
  const bodyHtml = stored?.bodyHtml ?? stored?.body_html ?? def.defaultBodyHtml ?? '';
  const bodyText = stored?.bodyText ?? stored?.body_text ?? def.defaultBodyText ?? '';
  return {
    enabled,
    subject: stored?.subject ?? def.defaultSubject ?? '',
    bodyHtml: typeof bodyHtml === 'string' ? bodyHtml : '',
    bodyText: typeof bodyText === 'string' ? bodyText : '',
    name: def.name,
    description: def.description,
    placeholders: Array.isArray(def.placeholders) ? def.placeholders : [],
  };
}

/**
 * Get merged config for a process (stored overrides + defaults).
 * @param {string} key - Process key
 * @returns {Promise<{ enabled: boolean, subject?: string, bodyHtml?: string, bodyText?: string, name: string, description: string, placeholders: string[] }>}
 */
async function getConfig(key) {
  const stored = await getStoredConfig(key);
  return mergeConfig(key, stored);
}

/**
 * List all mail processes with current config. Fetches all mail_process.* keys in one query.
 * @returns {Promise<Array<{ key: string, enabled: boolean, name: string, description: string, subject?: string, hasCustomTemplate: boolean }>>}
 */
async function listProcesses() {
  const keys = Object.keys(PROCESS_DEFINITIONS);
  const prefix = KV_PREFIX;
  const result = await query('SELECT key, value FROM key_value_store WHERE key LIKE $1', [
    prefix + '%',
  ]);
  const storedByKey = {};
  for (const row of result.rows || []) {
    const k = row.key?.startsWith(prefix) ? row.key.slice(prefix.length) : row.key;
    if (!k) {
      continue;
    }
    try {
      storedByKey[k] = row.value !== null && row.value !== undefined ? JSON.parse(row.value) : null;
    } catch {
      storedByKey[k] = null;
    }
  }

  const out = [];
  for (const key of keys) {
    const stored = storedByKey[key] ?? null;
    const config = mergeConfig(key, stored);
    out.push({
      key,
      enabled: config.enabled,
      name: config.name,
      description: config.description,
      subject: config.subject || undefined,
      hasCustomTemplate: Boolean(stored && (stored.subject || stored.bodyHtml || stored.bodyText)),
    });
  }
  return out;
}

/**
 * Update config for a mail process. Body: { enabled?, subject?, bodyHtml?, bodyText? }.
 * Validates length limits (subject ≤ MAX_SUBJECT_LENGTH; body fields ≤ MAX_BODY_LENGTH).
 * @param {string} key - Process key
 * @param {Object} updates - { enabled?: boolean, subject?: string, bodyHtml?: string, bodyText?: string }
 */
async function setConfig(key, updates) {
  if (!PROCESS_DEFINITIONS[key]) {
    throw new Error('Unknown mail process key');
  }
  const current = await getStoredConfig(key);
  const subject =
    updates.subject !== undefined ? String(updates.subject) : (current?.subject ?? '');
  const bodyHtml =
    updates.bodyHtml !== undefined ? String(updates.bodyHtml) : (current?.bodyHtml ?? '');
  const bodyText =
    updates.bodyText !== undefined ? String(updates.bodyText) : (current?.bodyText ?? '');

  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `Subject must be at most ${MAX_SUBJECT_LENGTH} characters (got ${subject.length})`
    );
  }
  const bodyHtmlLen = Buffer.byteLength(bodyHtml, 'utf8');
  const bodyTextLen = Buffer.byteLength(bodyText, 'utf8');
  if (bodyHtmlLen > MAX_BODY_LENGTH) {
    throw new Error(
      `HTML body must be at most ${Math.round(MAX_BODY_LENGTH / 1024)}KB (got ${Math.round(bodyHtmlLen / 1024)}KB)`
    );
  }
  if (bodyTextLen > MAX_BODY_LENGTH) {
    throw new Error(
      `Plain text body must be at most ${Math.round(MAX_BODY_LENGTH / 1024)}KB (got ${Math.round(bodyTextLen / 1024)}KB)`
    );
  }

  const next = {
    enabled: updates.enabled !== undefined ? !!updates.enabled : current?.enabled !== false,
    subject,
    bodyHtml,
    bodyText,
  };
  const kvKey = KV_PREFIX + key;
  const value = JSON.stringify(next);
  await query(
    `INSERT INTO key_value_store (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [kvKey, value]
  );
  return getConfig(key);
}

function getDefinitions() {
  return { ...PROCESS_DEFINITIONS };
}

/**
 * Get the effective template for sending: config (custom or default) with variables substituted.
 * Use when sending email so admin customizations and placeholders are applied.
 * @param {string} key - Process key
 * @param {Object} variables - Map of placeholder name -> value (e.g. { code: '123456', link: 'https://...' })
 * @param {{ subjectOverride?: string }} options - When config subject is empty (e.g. domain_api_key), use this
 * @returns {Promise<{ subject: string, bodyHtml: string, bodyText: string }>}
 */
async function getTemplateForSend(key, variables = {}, options = {}) {
  const def = PROCESS_DEFINITIONS[key];
  if (!def) {
    return { subject: '', bodyHtml: '', bodyText: '' };
  }
  const config = await getConfig(key);
  let subject =
    config.subject && config.subject.trim()
      ? config.subject
      : options.subjectOverride || def.defaultSubject || '';
  let bodyHtml =
    config.bodyHtml && config.bodyHtml.trim() ? config.bodyHtml : def.defaultBodyHtml || '';
  let bodyText =
    config.bodyText && config.bodyText.trim() ? config.bodyText : def.defaultBodyText || '';

  subject = substituteVariables(subject, variables);
  bodyHtml = substituteVariables(bodyHtml, variables, { htmlEscape: true });
  bodyText = substituteVariables(bodyText, variables);

  return { subject: subject.trim(), bodyHtml: bodyHtml.trim(), bodyText: bodyText.trim() };
}

/**
 * Get default template content for a process (for "Load default" in admin UI).
 * @param {string} key - Process key
 * @returns {{ subject: string, bodyHtml: string, bodyText: string }}
 */
function getDefaultTemplate(key) {
  const def = PROCESS_DEFINITIONS[key];
  if (!def) {
    return { subject: '', bodyHtml: '', bodyText: '' };
  }
  return {
    subject: def.defaultSubject || '',
    bodyHtml: def.defaultBodyHtml || '',
    bodyText: def.defaultBodyText || '',
  };
}

module.exports = {
  KV_PREFIX,
  PROCESS_KEYS: Object.keys(PROCESS_DEFINITIONS),
  isEnabled,
  getConfig,
  getStoredConfig,
  listProcesses,
  setConfig,
  getDefinitions,
  substituteVariables,
  getTemplateForSend,
  getDefaultTemplate,
};
