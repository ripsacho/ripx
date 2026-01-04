/**
 * Targeting Component
 * 
 * Configure targeting rules for AB tests
 */

import React, { useState } from 'react';
import {
  Card,
  FormLayout,
  Select,
  TextField,
  Checkbox,
  BlockStack,
  Text
} from '@shopify/polaris';

function Targeting({ targeting, onChange }) {
  const [config, setConfig] = useState(targeting || {
    enabled: false,
    geographic: { enabled: false },
    device: { enabled: false },
    customerSegment: { enabled: false },
    timeBased: { enabled: false }
  });

  const updateConfig = (updates) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    if (onChange) onChange(newConfig);
  };

  return (
    <Card sectioned title="Targeting & Segmentation">
      <FormLayout>
        <Checkbox
          label="Enable targeting"
          checked={config.enabled}
          onChange={(value) => updateConfig({ enabled: value })}
        />

        {config.enabled && (
          <BlockStack gap="400">
            {/* Geographic Targeting */}
            <Card subsection>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Geographic Targeting</Text>
                <Checkbox
                  label="Enable geographic targeting"
                  checked={config.geographic?.enabled || false}
                  onChange={(value) => updateConfig({
                    geographic: { ...config.geographic, enabled: value }
                  })}
                />
                {config.geographic?.enabled && (
                  <TextField
                    label="Countries (comma-separated)"
                    value={config.geographic?.countries?.join(', ') || ''}
                    onChange={(value) => updateConfig({
                      geographic: {
                        ...config.geographic,
                        countries: value.split(',').map(c => c.trim()).filter(c => c)
                      }
                    })}
                    helpText="e.g., US, CA, GB"
                  />
                )}
              </BlockStack>
            </Card>

            {/* Device Targeting */}
            <Card subsection>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Device Targeting</Text>
                <Checkbox
                  label="Enable device targeting"
                  checked={config.device?.enabled || false}
                  onChange={(value) => updateConfig({
                    device: { ...config.device, enabled: value }
                  })}
                />
                {config.device?.enabled && (
                  <Select
                    label="Device Types"
                    options={[
                      { label: 'All Devices', value: 'all' },
                      { label: 'Desktop Only', value: 'desktop' },
                      { label: 'Mobile Only', value: 'mobile' },
                      { label: 'Tablet Only', value: 'tablet' }
                    ]}
                    value={config.device?.types?.[0] || 'all'}
                    onChange={(value) => updateConfig({
                      device: {
                        ...config.device,
                        types: value === 'all' ? [] : [value]
                      }
                    })}
                  />
                )}
              </BlockStack>
            </Card>

            {/* Customer Segment Targeting */}
            <Card subsection>
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Customer Segment</Text>
                <Checkbox
                  label="Enable customer segment targeting"
                  checked={config.customerSegment?.enabled || false}
                  onChange={(value) => updateConfig({
                    customerSegment: { ...config.customerSegment, enabled: value }
                  })}
                />
                {config.customerSegment?.enabled && (
                  <Select
                    label="Customer Type"
                    options={[
                      { label: 'All Customers', value: 'all' },
                      { label: 'New Customers', value: 'new' },
                      { label: 'Returning Customers', value: 'returning' },
                      { label: 'VIP Customers', value: 'vip' }
                    ]}
                    value={config.customerSegment?.customerType || 'all'}
                    onChange={(value) => updateConfig({
                      customerSegment: {
                        ...config.customerSegment,
                        customerType: value === 'all' ? null : value
                      }
                    })}
                  />
                )}
              </BlockStack>
            </Card>
          </BlockStack>
        )}
      </FormLayout>
    </Card>
  );
}

export default Targeting;

