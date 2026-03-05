/**
 * Email Service (SMTP)
 *
 * Sends transactional email via SMTP (e.g. AWS SES).
 * Configure via: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 * If not configured, sendMail no-ops and returns true (stub mode).
 *
 * sendMail(options) returns Promise<boolean>: true if sent (or stubbed), false on failure.
 * Callers should handle false (e.g. retry, show user message); it does not throw.
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const mailProcessService = require('./mailProcessService');

const FROM = process.env.SMTP_FROM || process.env.MAIL_FROM || 'abtesting-noreply@echologyx.com';

const BRAND = {
  name: 'RipX',
  tagline: 'A/B testing for your store',
  primaryColor: '#06b6d4',
  primaryColorDark: '#0891b2',
  textColor: '#1f2937',
  textMuted: '#6b7280',
  footerColor: '#9ca3af',
};

function isConfigured() {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const user = process.env.SMTP_USER || process.env.MAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASS;
  return Boolean(host && user && pass);
}

let transporter = null;

function getTransporter() {
  if (transporter) {
    return transporter;
  }
  if (!isConfigured()) {
    return null;
  }
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST;
  const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  // Port 587: use STARTTLS (common for AWS SES, Gmail, etc.). Port 25 often needs STARTTLS too.
  const useTls = port === 587 || port === 25;
  const connectionTimeout = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '15000', 10);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: useTls && !secure,
    connectionTimeout,
    greetingTimeout: connectionTimeout,
    auth: {
      user: process.env.SMTP_USER || process.env.MAIL_USER,
      pass: process.env.SMTP_PASS || process.env.MAIL_PASS,
    },
  });
  return transporter;
}

/**
 * @param {{ to?: string, subject?: string, text?: string, html?: string, replyTo?: string }} options
 * @returns {Promise<boolean>} true if sent or stubbed, false on validation or SMTP failure
 */
async function sendMail(options) {
  const { to, subject, text, html, replyTo } = options || {};
  if (!to || !subject) {
    logger.warn('Email send skipped: missing to or subject');
    return false;
  }
  const transport = getTransporter();
  if (!transport) {
    logger.info('Email (stub): not sent - SMTP not configured', {
      to: to?.substring(0, 6) + '…',
      subject: subject?.substring(0, 40),
    });
    return true;
  }
  try {
    const info = await transport.sendMail({
      from: FROM,
      to,
      subject,
      text:
        text ||
        (html
          ? html
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          : ''),
      html: html || undefined,
      replyTo: replyTo || undefined,
    });
    logger.info('Email sent', {
      to: to?.substring(0, 6) + '…',
      subject: subject?.substring(0, 40),
      messageId: info?.messageId,
    });
    return true;
  } catch (err) {
    logger.error('Email send failed', {
      to: to?.substring(0, 6) + '…',
      subject: subject?.substring(0, 40),
      error: err.message,
      code: err.code,
      response: err.response ? String(err.response).slice(0, 120) : undefined,
    });
    return false;
  }
}

/**
 * Verify SMTP connection (e.g. on startup or health check).
 * Logs result; does not throw.
 * @returns {Promise<boolean>} true if verified, false otherwise
 */
async function verifyConnection() {
  const transport = getTransporter();
  if (!transport) {
    return false;
  }
  try {
    await transport.verify();
    logger.info('SMTP connection verified', {
      host: process.env.SMTP_HOST || process.env.MAIL_HOST,
      port: parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '587', 10),
    });
    return true;
  } catch (err) {
    logger.error('SMTP verification failed', {
      error: err.message,
      code: err.code,
      response: err.response ? String(err.response).slice(0, 200) : undefined,
    });
    return false;
  }
}

/**
 * Wraps content in a branded HTML layout (responsive, safe for email clients).
 */
function wrapEmailLayout(title, bodyHtml, options = {}) {
  const { preheader = '' } = options;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  ${preheader ? `<meta name="description" content="${preheader.replace(/"/g, '&quot;')}">` : ''}
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: ${BRAND.textColor}; background: #f3f4f6; }
    .wrapper { max-width: 560px; margin: 0 auto; padding: 32px 20px; }
    .card { background: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); overflow: hidden; }
    .card-header { background: linear-gradient(135deg, ${BRAND.primaryColor}, #8b5cf6); padding: 28px 24px; text-align: center; }
    .card-header h1 { margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }
    .card-header p { margin: 6px 0 0; font-size: 13px; color: rgba(255,255,255,0.9); }
    .card-body { padding: 28px 24px; }
    .card-body p { margin: 0 0 16px; color: ${BRAND.textColor}; }
    .card-body p:last-child { margin-bottom: 0; }
    .btn { display: inline-block; padding: 14px 28px; background: ${BRAND.primaryColor}; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 10px; margin: 8px 0 16px; }
    .btn:hover { background: ${BRAND.primaryColorDark}; }
    .muted { color: ${BRAND.textMuted}; font-size: 14px; }
    .footer { text-align: center; padding: 24px 20px; font-size: 12px; color: ${BRAND.footerColor}; }
    .footer a { color: ${BRAND.primaryColor}; text-decoration: none; }
    .divider { height: 1px; background: #e5e7eb; margin: 20px 0; }
    ul { margin: 0 0 16px; padding-left: 20px; }
    li { margin-bottom: 6px; }
    .api-key-box { background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin: 16px 0; font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 14px; font-weight: 600; color: ${BRAND.textColor}; word-break: break-all; letter-spacing: 0.02em; }
    .api-key-label { font-size: 12px; font-weight: 600; color: ${BRAND.textMuted}; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    code { font-family: 'SF Mono', Monaco, 'Courier New', monospace; font-size: 13px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: ${BRAND.textColor}; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="card-header">
        <h1>${BRAND.name}</h1>
        <p>${BRAND.tagline}</p>
      </div>
      <div class="card-body">
        ${bodyHtml}
      </div>
    </div>
    <div class="footer">
      This email was sent by ${BRAND.name}. If you didn't request it, you can safely ignore it.
    </div>
  </div>
</body>
</html>`;
}

async function sendConfirmationLink(to, link, expiresInMinutes) {
  if (!(await mailProcessService.isEnabled('confirmation_link'))) {
    logger.info('Email process confirmation_link is disabled; skipping send', {
      to: to?.substring(0, 6) + '…',
    });
    return true;
  }
  const min = expiresInMinutes || 60;
  const t = await mailProcessService.getTemplateForSend('confirmation_link', {
    link,
    minutes: min,
  });
  if (!t.subject || (!t.bodyHtml && !t.bodyText)) {
    logger.warn('confirmation_link template empty; send skipped');
    return false;
  }
  const html = t.bodyHtml
    ? wrapEmailLayout(t.subject, t.bodyHtml, {
        preheader: 'Confirm your email to complete RipX registration.',
      })
    : undefined;
  const text =
    t.bodyText ||
    (t.bodyHtml
      ? t.bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  return sendMail({ to, subject: t.subject, text, html });
}

/**
 * Send 6-digit login code email (for accepted users).
 * If mail process "login_code" is disabled, skips send and returns true so the flow does not get stuck.
 */
async function sendLoginCode(to, code) {
  if (!(await mailProcessService.isEnabled('login_code'))) {
    logger.info('Email process login_code is disabled; skipping send', {
      to: to?.substring(0, 6) + '…',
    });
    return true;
  }
  const t = await mailProcessService.getTemplateForSend('login_code', { code });
  if (!t.subject || (!t.bodyHtml && !t.bodyText)) {
    logger.warn('login_code template empty; send skipped');
    return false;
  }
  const html = t.bodyHtml
    ? wrapEmailLayout(t.subject, t.bodyHtml, { preheader: `Your RipX sign-in code: ${code}` })
    : undefined;
  const text =
    t.bodyText ||
    (t.bodyHtml
      ? t.bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  return sendMail({ to, subject: t.subject, text, html });
}

/**
 * Send one-time login link. If mail process "login_link" is disabled, skips send and returns true.
 */
async function sendLoginLink(to, link, min) {
  if (!(await mailProcessService.isEnabled('login_link'))) {
    logger.info('Email process login_link is disabled; skipping send', {
      to: to?.substring(0, 6) + '…',
    });
    return true;
  }
  return sendLoginLinkImpl(to, link, min);
}

async function sendLoginLinkImpl(to, link, min) {
  const minutes = min ?? 15;
  const t = await mailProcessService.getTemplateForSend('login_link', { link, minutes });
  if (!t.subject || (!t.bodyHtml && !t.bodyText)) {
    logger.warn('login_link template empty; send skipped');
    return false;
  }
  const html = t.bodyHtml
    ? wrapEmailLayout(t.subject, t.bodyHtml, {
        preheader: `Sign in to RipX. Link expires in ${minutes} minutes.`,
      })
    : undefined;
  const text =
    t.bodyText ||
    (t.bodyHtml
      ? t.bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  return sendMail({ to, subject: t.subject, text, html });
}

async function sendAnnouncement(to, subject, bodyHtml, bodyText) {
  if (!(await mailProcessService.isEnabled('announcement'))) {
    logger.info('Email process announcement is disabled; skipping send', {
      to: to?.substring(0, 6) + '…',
    });
    return true;
  }
  const text =
    bodyText ||
    (bodyHtml
      ? bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  return sendMail({
    to,
    subject: subject || 'Announcement from RipX',
    text,
    html: bodyHtml ? wrapEmailLayout(subject || 'RipX', bodyHtml) : undefined,
  });
}

/**
 * Send acceptance email when admin approves a standalone user registration.
 * If mail process "acceptance" is disabled, skips send and returns true.
 */
async function sendAcceptanceEmail(to) {
  if (!(await mailProcessService.isEnabled('acceptance'))) {
    logger.info('Email process acceptance is disabled; skipping send', {
      to: to?.substring(0, 6) + '…',
    });
    return true;
  }
  const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '');
  const signInUrl = appUrl ? `${appUrl}/connect` : '';
  const t = await mailProcessService.getTemplateForSend('acceptance', { signInUrl });
  if (!t.subject || (!t.bodyHtml && !t.bodyText)) {
    logger.warn('acceptance template empty; send skipped');
    return false;
  }
  const html = t.bodyHtml
    ? wrapEmailLayout(t.subject, t.bodyHtml, { preheader: 'You can now sign in to RipX.' })
    : undefined;
  const text =
    t.bodyText ||
    (t.bodyHtml
      ? t.bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  return sendMail({ to, subject: t.subject, text, html });
}

/**
 * Send API key to user's email (domain added or key regenerated).
 * @param {string} to - Recipient email
 * @param {Object} options - { domain?, apiKey, reason: 'domain_added' | 'api_key_regenerated' }
 * @returns {Promise<boolean>}
 */
async function sendDomainApiKeyEmail(to, options) {
  const { domain, apiKey, reason = 'domain_added' } = options || {};
  if (!to || !apiKey) {
    logger.warn('sendDomainApiKeyEmail skipped: missing to or apiKey', {
      hasTo: !!to,
      hasApiKey: !!apiKey,
    });
    return false;
  }
  if (!(await mailProcessService.isEnabled('domain_api_key'))) {
    logger.info('Email process domain_api_key is disabled; skipping send', {
      to: to.substring(0, 6) + '…',
      domain: domain || null,
    });
    return true;
  }
  const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '');
  const dashboardUrl = appUrl ? `${appUrl}/dashboard` : '';
  const isRegenerated = reason === 'api_key_regenerated';
  const subjectOverride = isRegenerated
    ? 'Your RipX API key has been updated'
    : domain
      ? `Your RipX API key for ${domain}`
      : 'Your RipX API key';

  const config = await mailProcessService.getConfig('domain_api_key');
  const useCustomTemplate = Boolean(config.bodyHtml && config.bodyHtml.trim());

  let subject;
  let bodyHtml;
  let bodyText;
  if (useCustomTemplate) {
    const t = await mailProcessService.getTemplateForSend(
      'domain_api_key',
      { domain: domain || '', apiKey },
      { subjectOverride }
    );
    subject = t.subject || subjectOverride;
    bodyHtml = t.bodyHtml;
    bodyText = t.bodyText;
  } else {
    subject = subjectOverride;
    const keyBlock = `
    <p class="api-key-label">API key (store securely — shown only once)</p>
    <div class="api-key-box">${String(apiKey).replace(/</g, '&lt;')}</div>
    <p class="muted">Use this key in the <strong>X-RipX-API-Key</strong> header when connecting your site to RipX.</p>
  `;
    if (isRegenerated) {
      bodyHtml = `
      <p><strong>Your API key has been regenerated</strong></p>
      <p>The previous key no longer works. Use the new key below for all domains in your account.</p>
      ${keyBlock}
      <div class="divider"></div>
      <p><strong>What to do next</strong></p>
      <ul>
        <li>Update your site or app to use the new key in the <code>X-RipX-API-Key</code> header.</li>
        <li>If you use the RipX dashboard, sign in again; your session will use the new key.</li>
      </ul>
      ${dashboardUrl ? `<p><a href="${dashboardUrl}" class="btn">Open RipX Dashboard</a></p>` : ''}
      <p class="muted">If you didn't request this change, contact support and secure your account.</p>
    `;
      bodyText =
        'Your RipX API key has been regenerated.\n\nAPI key (store securely — shown only once):\n' +
        apiKey +
        '\n\n' +
        (dashboardUrl ? `Dashboard: ${dashboardUrl}\n\n` : '');
    } else {
      bodyHtml = `
      <p><strong>Domain added successfully</strong></p>
      ${domain ? `<p>Your domain <strong>${String(domain).replace(/</g, '&lt;')}</strong> has been added to your RipX account.</p>` : '<p>A new domain has been added to your RipX account.</p>'}
      <p>Use the API key below to connect your site to RipX. This key works for all domains in your account.</p>
      ${keyBlock}
      <div class="divider"></div>
      <p><strong>What to do next</strong></p>
      <ul>
        <li>Add the RipX script to your site and set the <code>X-RipX-API-Key</code> header to this key.</li>
        <li>Or open the RipX dashboard and connect using this key when prompted.</li>
      </ul>
      ${dashboardUrl ? `<p><a href="${dashboardUrl}" class="btn">Open RipX Dashboard</a></p>` : ''}
      <p class="muted">Keep this email secure. Anyone with this key can manage tests for your domains.</p>
    `;
      bodyText =
        `Your RipX API key${domain ? ` for ${domain}` : ''}.\n\nAPI key (store securely):\n${apiKey}\n\n` +
        (dashboardUrl ? `Dashboard: ${dashboardUrl}\n\n` : '');
    }
  }

  const text =
    bodyText ||
    (bodyHtml
      ? bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  const sent = await sendMail({
    to,
    subject,
    text,
    html: bodyHtml
      ? wrapEmailLayout(subject, bodyHtml, {
          preheader: isRegenerated ? 'Your new API key is inside.' : 'Your API key is inside.',
        })
      : undefined,
  });
  if (!sent) {
    logger.warn('API key email was not sent (check SMTP config or logs above)', {
      to: to.substring(0, 6) + '…',
    });
  }
  return sent;
}

/**
 * Send "domain added" notification when no API key is issued (existing account).
 * @param {string} to - Recipient email
 * @param {string} domain - Domain that was added
 * @returns {Promise<boolean>}
 */
async function sendDomainAddedNotification(to, domain) {
  if (!to || !domain) {
    return false;
  }
  if (!(await mailProcessService.isEnabled('domain_added_notification'))) {
    logger.info('Email process domain_added_notification is disabled; skipping send', {
      to: to.substring(0, 6) + '…',
      domain,
    });
    return true;
  }
  const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '');
  const dashboardUrl = appUrl ? `${appUrl}/dashboard` : '';
  const settingsUrl = appUrl ? `${appUrl}/settings` : '';
  const subjectOverride = `Domain ${domain} added to your RipX account`;

  const t = await mailProcessService.getTemplateForSend(
    'domain_added_notification',
    { domain, dashboardUrl, settingsUrl },
    { subjectOverride }
  );
  if (!t.subject || (!t.bodyHtml && !t.bodyText)) {
    logger.warn('domain_added_notification template empty; send skipped');
    return false;
  }
  const html = t.bodyHtml
    ? wrapEmailLayout(t.subject, t.bodyHtml, { preheader: `Domain ${domain} added.` })
    : undefined;
  const text =
    t.bodyText ||
    (t.bodyHtml
      ? t.bodyHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '');
  logger.info('Sending domain-added notification (no key)', {
    to: to.substring(0, 6) + '…',
    domain,
  });
  return sendMail({ to, subject: t.subject, text, html });
}

module.exports = {
  isConfigured,
  verifyConnection,
  sendMail,
  sendLoginLink,
  sendLoginCode,
  sendConfirmationLink,
  sendAcceptanceEmail,
  sendAnnouncement,
  sendDomainApiKeyEmail,
  sendDomainAddedNotification,
  FROM,
};
