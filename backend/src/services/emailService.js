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
  const port = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '25', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.MAIL_HOST,
    port,
    secure,
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
      text: text || (html ? html.replace(/<[^>]+>/g, '').trim() : ''),
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
    });
    return false;
  }
}

function sendLoginLink(to, link, expiresInMinutes) {
  const min = expiresInMinutes || 15;
  const subject = 'Your RipX login link';
  const text =
    'Use this link to sign in to RipX. It expires in ' +
    min +
    ' minutes.\n\n' +
    link +
    '\n\nIf you did not request this, you can ignore this email.';
  const html =
    '<p>Use the link below to sign in to RipX. It expires in ' +
    min +
    ' minutes.</p><p><a href="' +
    link +
    '" style="color:#008060;font-weight:600;">Sign in to RipX</a></p><p>If you did not request this, you can ignore this email.</p>';
  return sendMail({ to, subject, text, html });
}

function sendConfirmationLink(to, link, expiresInMinutes) {
  const min = expiresInMinutes || 60;
  const subject = 'Confirm your RipX registration';
  const text =
    'Please confirm your email by clicking the link below. It expires in ' +
    min +
    ' minutes.\n\n' +
    link +
    '\n\nAfter confirmation, your account will be reviewed by an administrator.';
  const html =
    '<p>Please confirm your email by clicking the link below. It expires in ' +
    min +
    ' minutes.</p><p><a href="' +
    link +
    '" style="color:#008060;font-weight:600;">Confirm my email</a></p><p>After confirmation, your account will be reviewed by an administrator before you can sign in.</p>';
  return sendMail({ to, subject, text, html });
}

function sendAnnouncement(to, subject, bodyHtml, bodyText) {
  const text = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]+>/g, '').trim() : '');
  return sendMail({
    to,
    subject: subject || 'Announcement from RipX',
    text,
    html: bodyHtml || undefined,
  });
}

module.exports = {
  isConfigured,
  sendMail,
  sendLoginLink,
  sendConfirmationLink,
  sendAnnouncement,
  FROM,
};
