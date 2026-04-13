/**
 * Shared date formatting utilities.
 *
 * Display format requirement:
 *   1st Jan, 2026
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function toDate(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getOrdinal(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  const mod10 = day % 10;
  if (mod10 === 1) return 'st';
  if (mod10 === 2) return 'nd';
  if (mod10 === 3) return 'rd';
  return 'th';
}

export function formatDate(value, fallback = '—') {
  const date = toDate(value);
  if (!date) return fallback;
  const day = date.getDate();
  const month = MONTHS_SHORT[date.getMonth()] || '';
  const year = date.getFullYear();
  return `${day}${getOrdinal(day)} ${month}, ${year}`;
}

export function formatDateTime(value, fallback = '—') {
  const date = toDate(value);
  if (!date) return fallback;
  const datePart = formatDate(date, fallback);
  const timePart = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

/**
 * Optional compatibility patch:
 * converts bare toLocaleDateString()/toLocaleString() calls to RipX format.
 * If locale/options are passed explicitly, native behavior is preserved.
 */
export function installDateFormattingPatch() {
  if (typeof Date === 'undefined' || Date.__ripxDatePatchInstalled) return;

  const nativeDateString = Date.prototype.toLocaleDateString;
  const nativeDateTimeString = Date.prototype.toLocaleString;

  Date.prototype.toLocaleDateString = function patchedToLocaleDateString(locale, options) {
    if (locale !== undefined || options !== undefined) {
      return nativeDateString.call(this, locale, options);
    }
    const formatted = formatDate(this, '');
    if (formatted) return formatted;
    return nativeDateString.call(this);
  };

  Date.prototype.toLocaleString = function patchedToLocaleString(locale, options) {
    if (locale !== undefined || options !== undefined) {
      return nativeDateTimeString.call(this, locale, options);
    }
    const formatted = formatDateTime(this, '');
    if (formatted) return formatted;
    return nativeDateTimeString.call(this);
  };

  Date.__ripxDatePatchInstalled = true;
}
