/**
 * Variant colors – dynamic palette persisted in localStorage.
 * Same color is used for a given variant index everywhere (dropdown, code editor, review).
 * New indices get a generated color and the palette is extended and saved.
 */

import { STORAGE_KEYS } from '../constants';

const DEFAULT_PALETTE = ['#06b6d4', '#8b5cf6', '#f49342', '#14b8a6', '#b98900', '#e91e63'];

function loadPalette() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VARIANT_COLORS);
    if (!raw) return [...DEFAULT_PALETTE];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...DEFAULT_PALETTE];
  } catch {
    return [...DEFAULT_PALETTE];
  }
}

function savePalette(palette) {
  try {
    localStorage.setItem(STORAGE_KEYS.VARIANT_COLORS, JSON.stringify(palette));
  } catch {
    // ignore
  }
}

/**
 * HSL to hex (0–360, 0–100, 0–100)
 */
function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a distinct color for a given index (golden-angle hue spread).
 */
function generateColorForIndex(index) {
  const hue = (index * 137.5) % 360; // golden angle for good spread
  return hslToHex(hue, 62, 48);
}

/**
 * Get the color for variant at index. Persists palette in localStorage;
 * if index is beyond current palette length, generates a new color and saves it.
 * @param {number} index - Variant index (0-based)
 * @returns {string} Hex color e.g. '#06b6d4'
 */
export function getVariantColor(index) {
  if (index < 0 || !Number.isInteger(index)) return DEFAULT_PALETTE[0];
  const palette = loadPalette();
  if (index < palette.length) return palette[index];
  const hex = generateColorForIndex(index);
  palette.push(hex);
  savePalette(palette);
  return hex;
}

/**
 * Get a light tint of the variant color for backgrounds (e.g. card tint).
 * @param {string} hex - Hex color from getVariantColor
 * @param {number} [alpha=0.06] - Opacity 0–1
 * @returns {string} rgba(...) string
 */
export function getVariantColorLight(hex, alpha = 0.06) {
  if (!hex || !hex.startsWith('#')) return `rgba(6, 182, 212, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
