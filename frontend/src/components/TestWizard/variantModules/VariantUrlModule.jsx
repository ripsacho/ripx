import React from 'react';
import { Banner, BlockStack, Card, FormLayout, Text, TextField } from '@shopify/polaris';

export default function VariantUrlModule({ formData, setFormData }) {
  return (
    <BlockStack gap="400">
      <Banner tone="info" title="Split URL test">
        <Text as="p" variant="bodySm">
          Visitors matching this test will be redirected to the variant URL. Use full same-origin
          URLs (e.g. https://yoursite.com/pages/landing) for best results. Control can leave URL
          empty to stay on the current page.
        </Text>
      </Banner>
      <Text variant="bodyMd" color="subdued" as="p">
        Set the URL for each variant. Visitors will be redirected to the assigned variant URL.
      </Text>
      {(formData.variants || []).map((variant, index) => (
        <Card key={`url-${index}`} sectioned>
          <FormLayout>
            <TextField
              label={variant.name}
              value={variant.config?.url ?? ''}
              onChange={value => {
                const next = [...(formData.variants || [])];
                next[index] = { ...next[index], config: { ...next[index].config, url: value } };
                setFormData({ ...formData, variants: next });
              }}
              placeholder="https://yoursite.com/pages/variant-page"
              helpText="Full URL for this variant"
              autoComplete="off"
            />
          </FormLayout>
        </Card>
      ))}
    </BlockStack>
  );
}
