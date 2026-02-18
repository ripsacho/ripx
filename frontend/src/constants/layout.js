/**
 * Layout Constants
 *
 * Unified spacing and layout values for consistent UI across all components.
 * Use these with Polaris BlockStack, InlineStack, Box gap props.
 */

import { BREAKPOINTS } from './app';

/** Re-export breakpoints for layout usage */
export { BREAKPOINTS } from './app';

/** BlockStack/InlineStack gap tokens - Polaris uses 100, 200, 300, 400, 500 */
export const GAP = {
  TIGHT: '100',
  SMALL: '200',
  MEDIUM: '300',
  LARGE: '400',
  XLARGE: '500',
};

/** Default content block gap (between major sections) */
export const CONTENT_GAP = GAP.LARGE;

/** Default form field gap */
export const FORM_GAP = GAP.MEDIUM;

/** Mobile breakpoint - sidebar collapses, layout adapts */
export const MOBILE_BREAKPOINT = BREAKPOINTS.MOBILE;
