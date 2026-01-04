/**
 * Test Type Selection Modal
 * 
 * Modal for selecting test type before creating a new test
 */

import React, { useState } from 'react';
import {
  Modal,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Card
} from '@shopify/polaris';

const TEST_TYPES = {
  content: {
    title: 'Content Tests',
    description: 'Test visual and content changes',
    types: [
      {
        id: 'onsite-edit',
        name: 'Onsite Edit',
        description: 'Edit or hide page elements like text, images, or sections without changing your theme.',
        icon: '✏️',
        category: 'content'
      },
      {
        id: 'split-url',
        name: 'Split URL',
        description: 'Send visitors to alternate URLs to test page-level changes.',
        icon: '🔀',
        category: 'content'
      },
      {
        id: 'template',
        name: 'Template',
        description: 'Compare and test different homepage, product, and collections templates.',
        icon: '📄',
        category: 'content'
      },
      {
        id: 'theme',
        name: 'Theme',
        description: 'Test theme redesigns, new navigation, or impact of adding an app.',
        icon: '🎨',
        category: 'theme'
      }
    ]
  },
  profit: {
    title: 'Profit Tests',
    description: 'Test changes that directly impact revenue',
    types: [
      {
        id: 'pricing',
        name: 'Pricing',
        description: 'Test price points on one product, multiple products, or entire collections.',
        icon: '💰',
        category: 'price'
      },
      {
        id: 'shipping',
        name: 'Shipping',
        description: 'Explore different shipping rates and free shipping thresholds.',
        icon: '🚚',
        category: 'shipping'
      },
      {
        id: 'offer',
        name: 'Offer',
        description: 'Compare percentage discounts, dollar-off amounts, or tiered incentives.',
        icon: '🎁',
        category: 'offer'
      },
      {
        id: 'checkout',
        name: 'Checkout Test',
        description: 'Try checkout customizations like trust badges, guarantees, and custom images.',
        icon: '🛒',
        category: 'checkout'
      }
    ]
  }
};

function TestTypeModal({ open, onClose, onSelect }) {
  const [testName, setTestName] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [selectedType, setSelectedType] = useState(null);

  const handleCreate = () => {
    if (!testName.trim() || !selectedType) {
      return;
    }

    const testType = selectedType.category;
    onSelect({
      name: testName,
      description: testDescription,
      type: testType,
      testTypeId: selectedType.id
    });

    // Reset form
    setTestName('');
    setTestDescription('');
    setSelectedType(null);
  };

  const handleClose = () => {
    setTestName('');
    setTestDescription('');
    setSelectedType(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Select a test type to begin"
      primaryAction={{
        content: 'Create',
        onAction: handleCreate,
        disabled: !testName.trim() || !selectedType
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: handleClose
        }
      ]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          {/* Name and Description Fields */}
          <BlockStack gap="300">
            <TextField
              label="Name"
              value={testName}
              onChange={setTestName}
              placeholder="Enter the name of your test"
              requiredIndicator
              autoComplete="off"
            />
            <TextField
              label="Description"
              value={testDescription}
              onChange={setTestDescription}
              placeholder="Describe purpose or hypothesis"
              multiline={2}
              autoComplete="off"
            />
          </BlockStack>

          {/* Content Tests Section */}
          <BlockStack gap="300">
            <InlineStack gap="200" align="start" blockAlign="center">
              <Text variant="headingMd" as="h3" fontWeight="semibold">
                {TEST_TYPES.content.title}
              </Text>
              <span style={{ fontSize: '1rem', opacity: 0.6, cursor: 'help' }} title={TEST_TYPES.content.description}>
                ⓘ
              </span>
            </InlineStack>

            <div className="grid-template">
              {TEST_TYPES.content.types.map((type) => (
                <Card
                  key={type.id}
                  sectioned
                  onClick={() => setSelectedType(type)}
                  style={{
                    cursor: 'pointer',
                    border: selectedType?.id === type.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                    backgroundColor: selectedType?.id === type.id ? 'var(--bg-active)' : 'var(--bg-secondary)',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {selectedType?.id === type.id && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-inverse)',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      ✓
                    </div>
                  )}
                  <BlockStack gap="200">
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                      {type.icon}
                    </div>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      {type.name}
                    </Text>
                    <Text variant="bodySm" color="subdued" as="p">
                      {type.description}
                    </Text>
                  </BlockStack>
                </Card>
              ))}
            </div>
          </BlockStack>

          {/* Profit Tests Section */}
          <BlockStack gap="300">
            <InlineStack gap="200" align="start" blockAlign="center">
              <Text variant="headingMd" as="h3" fontWeight="semibold">
                {TEST_TYPES.profit.title}
              </Text>
              <span style={{ fontSize: '1rem', opacity: 0.6, cursor: 'help' }} title={TEST_TYPES.profit.description}>
                ⓘ
              </span>
            </InlineStack>

            <div className="grid-template">
              {TEST_TYPES.profit.types.map((type) => (
                <Card
                  key={type.id}
                  sectioned
                  onClick={() => setSelectedType(type)}
                  style={{
                    cursor: 'pointer',
                    border: selectedType?.id === type.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                    backgroundColor: selectedType?.id === type.id ? 'var(--bg-active)' : 'var(--bg-secondary)',
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {selectedType?.id === type.id && (
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-inverse)',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      ✓
                    </div>
                  )}
                  <BlockStack gap="200">
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                      {type.icon}
                    </div>
                    <Text variant="bodyMd" fontWeight="semibold" as="p">
                      {type.name}
                    </Text>
                    <Text variant="bodySm" color="subdued" as="p">
                      {type.description}
                    </Text>
                  </BlockStack>
                </Card>
              ))}
            </div>
          </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

export default TestTypeModal;

