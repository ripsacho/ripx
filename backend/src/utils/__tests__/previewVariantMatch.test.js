const { previewLabelEquals, findVariantForPreviewQuery } = require('../previewVariantMatch');

describe('previewVariantMatch', () => {
  const uuidA = '023367bb-13ec-468a-b2ec-a7c68d5e39ab';
  const uuidB = '11111111-1111-4111-8111-111111111111';

  it('previewLabelEquals treats + and space as equivalent for non-UUIDs', () => {
    expect(previewLabelEquals('Variant C', 'Variant+C')).toBe(true);
    expect(previewLabelEquals('Variant+C', 'Variant C')).toBe(true);
    expect(previewLabelEquals('A  B', 'A+B')).toBe(true);
  });

  it('previewLabelEquals requires exact match for UUIDs', () => {
    expect(previewLabelEquals(uuidA, uuidA)).toBe(true);
    expect(previewLabelEquals(uuidA, uuidB)).toBe(false);
  });

  it('findVariantForPreviewQuery resolves by id or fuzzy name', () => {
    const variants = [
      { id: uuidA, name: 'Control' },
      { id: uuidB, name: 'Variant C' },
    ];
    expect(findVariantForPreviewQuery(variants, { variant_id: uuidB })?.name).toBe('Variant C');
    expect(findVariantForPreviewQuery(variants, { variant_id: 'Variant+C' })?.id).toBe(uuidB);
    expect(findVariantForPreviewQuery(variants, { variant_name: 'Variant+C' })?.id).toBe(uuidB);
  });
});
