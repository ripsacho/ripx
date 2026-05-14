import ISO_COUNTRIES from '../data/iso3166Alpha2Countries.json';

const BY_CODE = new Map(ISO_COUNTRIES.map(r => [String(r.code).toUpperCase(), r]));

/**
 * @param {unknown} raw
 * @returns {string} Uppercase alpha-2 or empty if invalid
 */
export function normalizeCountryCode(raw) {
  const s = String(raw || '')
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(s)) {
    return '';
  }
  return s;
}

/**
 * Full name with code in brackets, e.g. "United States of America (US)".
 * Unknown codes still return the code so legacy values remain visible.
 * @param {string} code
 */
export function getCountryDisplayLabel(code) {
  const c = normalizeCountryCode(code);
  if (!c) {
    return '';
  }
  const row = BY_CODE.get(c);
  if (row) {
    return `${row.name} (${c})`;
  }
  return c;
}

/**
 * @param {string[]} codes
 * @param {number} [maxVisible]
 */
export function formatCountryCodesSummary(codes, maxVisible = 3) {
  const list = (Array.isArray(codes) ? codes : [])
    .map(c => normalizeCountryCode(c))
    .filter(Boolean);
  if (list.length === 0) {
    return '';
  }
  const labels = list.map(c => getCountryDisplayLabel(c));
  if (labels.length <= maxVisible) {
    return labels.join(', ');
  }
  return `${labels.slice(0, maxVisible).join(', ')} + ${labels.length - maxVisible} more`;
}

export { ISO_COUNTRIES };
