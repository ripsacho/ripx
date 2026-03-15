/**
 * Shared formatting helpers for Support (AI chat replies, etc.).
 * Converts **bold** markdown to React elements for display.
 */

import React from 'react';

/** Suggested prompts for Ask AI (single source of truth). */
export const SUGGESTED_PROMPTS = [
  'How do I create an A/B test?',
  'What is traffic allocation?',
  'How does the storefront script work?',
  'How do I install the storefront script?',
];

/** Placeholder for Ask AI input (single source of truth). Cursor-style. */
export const CHAT_PLACEHOLDER = 'Ask anything…';

/**
 * Format AI reply text: **text** -> <strong> for display.
 * @param {string} text - Raw reply (may contain **bold**). Empty string returns null.
 * @returns {null|React.ReactNode[]} - null for null/undefined/empty/non-string, or array of fragments/strong elements
 */
export function formatReplyContent(text) {
  if (text === null || text === undefined || Array.isArray(text)) return null;
  const str = typeof text === 'string' ? text : String(text);
  if (str.trim() === '') return null;
  const parts = [];
  let remaining = str;
  let key = 0;
  while (remaining.length > 0) {
    const start = remaining.indexOf('**');
    if (start === -1) {
      parts.push(<React.Fragment key={key++}>{remaining}</React.Fragment>);
      break;
    }
    if (start > 0) {
      parts.push(<React.Fragment key={key++}>{remaining.slice(0, start)}</React.Fragment>);
    }
    const end = remaining.indexOf('**', start + 2);
    if (end === -1) {
      parts.push(<React.Fragment key={key++}>{remaining.slice(start)}</React.Fragment>);
      break;
    }
    parts.push(<strong key={key++}>{remaining.slice(start + 2, end)}</strong>);
    remaining = remaining.slice(end + 2);
  }
  return parts.length === 0 ? null : parts;
}
