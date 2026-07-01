import { useMemo } from 'react';
import {
  getShippingReadiness,
  getShippingStrategy,
  getShippingVariantSummary,
} from '../../../utils/shippingConfig';

export function useShippingStudio({ variants = [], activeIndex = 0 } = {}) {
  return useMemo(() => {
    const activeVariant = variants[Math.min(activeIndex, Math.max(variants.length - 1, 0))] || null;
    return {
      activeVariant,
      activeStrategy: getShippingStrategy(activeVariant?.config || {}),
      variantSummaries: variants.map((variant, index) => ({
        index,
        summary: getShippingVariantSummary(variant, index),
        readiness: getShippingReadiness(variant, index),
      })),
    };
  }, [activeIndex, variants]);
}
