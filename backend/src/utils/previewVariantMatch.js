/**
 * Match preview query params (variant_id / variant_name) to test variants.
 * Query strings often decode "+" as a space; links may use "Variant+C" vs "Variant C".
 * UUIDs must match exactly (trim-only).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function previewLabelEquals(a, b) {
  const s1 = String(a ?? '').trim();
  const s2 = String(b ?? '').trim();
  if (s1 === s2) {return true;}
  const u1 = UUID_RE.test(s1);
  const u2 = UUID_RE.test(s2);
  if (u1 && u2) {return s1 === s2;}
  if (u1 || u2) {return false;}
  const n1 = s1.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
  const n2 = s2.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
  return n1 === n2;
}

function previewQueryMatchesVariant(query, item) {
  if (!item) {return false;}
  const q = String(query ?? '').trim();
  if (!q) {return false;}
  if (item.id !== undefined && item.id !== null && String(item.id).trim() === q) {return true;}
  if (item.name !== undefined && item.name !== null && previewLabelEquals(q, item.name))
    {return true;}
  return false;
}

/**
 * @param {unknown[]} variants
 * @param {{ variant_id?: string, variant_name?: string }} q
 * @returns {object|undefined}
 */
function findVariantForPreviewQuery(variants, q) {
  const list = Array.isArray(variants) ? variants : [];
  const variant_id =
    q?.variant_id !== undefined && q?.variant_id !== null ? String(q.variant_id).trim() : '';
  const variant_name =
    q?.variant_name !== undefined && q?.variant_name !== null ? String(q.variant_name).trim() : '';
  return list.find(item => {
    if (variant_id) {
      if (previewQueryMatchesVariant(variant_id, item)) {return true;}
    }
    if (variant_name && item?.name !== undefined && item?.name !== null) {
      if (previewLabelEquals(variant_name, item.name)) {return true;}
    }
    return false;
  });
}

module.exports = {
  previewLabelEquals,
  previewQueryMatchesVariant,
  findVariantForPreviewQuery,
};
