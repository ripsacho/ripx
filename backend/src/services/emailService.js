/**
 * Email Service (SMTP)
 *
 * Sends transactional email via SMTP (e.g. AWS SES).
 * Configure via: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM.
 * If not configured, sendMail no-ops and returns success (caller can stub).
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

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

function sendLoginLink(to, link, expiresInMinutes) {
  const min = expiresInMinutes || 15;
  const subject = 'Your RipX sign-in link';
  const bodyHtml = `
    <p><strong>Sign in to RipX</strong></p>
    <p>Click the button below to sign in. This link is valid for <strong>${min} minutes</strong> and can only be used once.</p>
    <p><a href="${link}" class="btn">Sign in to RipX</a></p>
    <p class="muted">If the button doesn't work, copy and paste this link into your browser:</p>
    <p class="muted" style="word-break: break-all; font-size: 13px;">${link}</p>
    <div class="divider"></div>
    <p class="muted">If you didn't request this email, you can safely ignore it. No one will be signed in without access to this link.</p>
  `;
  const text =
    'Sign in to RipX\n\n' +
    `Use this link to sign in. It expires in ${min} minutes and can only be used once.\n\n` +
    link +
    '\n\nIf you did not request this, you can ignore this email.';
  return sendMail({
    to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, {
      preheader: `Sign in to RipX. Link expires in ${min} minutes.`,
    }),
  });
}

function sendConfirmationLink(to, link, expiresInMinutes) {
  const min = expiresInMinutes || 60;
  const subject = 'Confirm your RipX account';
  const bodyHtml = `
    <p><strong>Confirm your email address</strong></p>
    <p>Thanks for registering with RipX. Please confirm your email by clicking the button below. This link expires in <strong>${min} minutes</strong>.</p>
    <p><a href="${link}" class="btn">Confirm my email</a></p>
    <p class="muted">If the button doesn't work, copy and paste this link into your browser:</p>
    <p class="muted" style="word-break: break-all; font-size: 13px;">${link}</p>
    <div class="divider"></div>
    <p><strong>What happens next?</strong></p>
    <ul>
      <li>After you confirm, your account will be reviewed by an administrator.</li>
      <li>You'll receive an email when your account is approved.</li>
      <li>Then you can sign in using the same email and request a login link.</li>
    </ul>
    <p class="muted">If you didn't create an account with RipX, you can safely ignore this email.</p>
  `;
  const text =
    'Confirm your RipX account\n\n' +
    `Please confirm your email by clicking the link below. It expires in ${min} minutes.\n\n` +
    link +
    '\n\nAfter confirmation, your account will be reviewed by an administrator. You will receive an email when approved.';
  return sendMail({
    to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, {
      preheader: 'Confirm your email to complete RipX registration.',
    }),
  });
}

/**
 * Send 6-digit login code email (for accepted users).
 */
function sendLoginCode(to, code) {
  const subject = 'Your RipX sign-in code';
  const bodyHtml = `
    <p><strong>Sign in to RipX</strong></p>
    <p>Your one-time sign-in code is:</p>
    <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em; color: ${BRAND.primaryColor}; margin: 16px 0;">${String(code)}</p>
    <p class="muted">This code expires in <strong>1 minute</strong> and can only be used once.</p>
    <div class="divider"></div>
    <p class="muted">If you didn't request this code, you can safely ignore this email.</p>
  `;
  const text =
    'Sign in to RipX\n\n' +
    `Your one-time sign-in code is: ${code}\n\n` +
    'This code expires in 1 minute and can only be used once.\n\n' +
    "If you didn't request this code, you can safely ignore this email.";
  return sendMail({
    to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, { preheader: `Your RipX sign-in code: ${code}` }),
  });
}

function sendAnnouncement(to, subject, bodyHtml, bodyText) {
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
 * Send acceptance email when admin approves a standalone user registration
 */
function sendAcceptanceEmail(to) {
  const appUrl = (process.env.FRONTEND_URL || process.env.APP_URL || '').replace(/\/$/, '');
  const signInUrl = appUrl ? `${appUrl}/connect` : '';
  const subject = 'Your RipX account has been approved';
  const bodyHtml = `
    <p><strong>You're all set!</strong></p>
    <p>Your RipX account has been approved. You can now sign in and start managing your domains and A/B tests.</p>
    ${signInUrl ? `<p><a href="${signInUrl}" class="btn">Sign in to RipX</a></p>` : ''}
    <div class="divider"></div>
    <p><strong>How to sign in</strong></p>
    <ul>
      <li>Go to the sign-in page and enter the email address you registered with.</li>
      <li>Click "Send login link" — we'll email you a one-time link.</li>
      <li>Click the link in the email to sign in. No password needed.</li>
    </ul>
    <p class="muted">If you have any questions, contact your administrator.</p>
  `;
  const text =
    'Your RipX account has been approved.\n\n' +
    'You can now sign in. Use the email address you registered with and request a login link from the sign-in page.\n\n' +
    (signInUrl ? `Sign in at: ${signInUrl}\n\n` : '');
  return sendMail({
    to,
    subject,
    text,
    html: wrapEmailLayout(subject, bodyHtml, { preheader: 'You can now sign in to RipX.' }),
  });
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
  FROM,
};
