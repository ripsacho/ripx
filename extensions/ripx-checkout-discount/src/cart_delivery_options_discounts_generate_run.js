/**
 * RipX does not apply shipping discounts from this extension.
 * @param {import("../generated/api").RipxDeliveryRun} _input
 */
export function cartDeliveryOptionsDiscountsGenerateRun(_input) {
  return { operations: [] };
}
