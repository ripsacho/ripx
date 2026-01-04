/**
 * Test Creator Component
 * 
 * Enhanced wizard for creating new AB tests with Intelligems-style UI
 */

import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  RadioButton,
  Divider,
  Checkbox
} from '@shopify/polaris';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SampleSizeCalculator from './SampleSizeCalculator';
import TrafficAllocationSlider from './TrafficAllocationSlider';
import Toast from '../Toast/Toast';
import { apiPost } from '../../services';

const TEST_TEMPLATES = {
  price: {
    name: 'Price Test',
    icon: '💰',
    description: 'Test different product prices to find optimal pricing',
    defaultConfig: {
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { price: null } },
        { name: 'Variant A', allocation: 50, config: { price: null } }
      ]
    }
  },
  pricing: {
    name: 'Pricing',
    icon: '💰',
    description: 'Test price points on one product, multiple products, or entire collections.',
    defaultConfig: {
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { price: null } },
        { name: 'Variant A', allocation: 50, config: { price: null } }
      ]
    }
  },
  content: {
    name: 'Content Test',
    icon: '📝',
    description: 'Test headlines, descriptions, and messaging',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Variant A', allocation: 50, config: {} }
      ]
    }
  },
  'onsite-edit': {
    name: 'Onsite Edit',
    icon: '✏️',
    description: 'Edit or hide page elements like text, images, or sections without changing your theme.',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Variant A', allocation: 50, config: {} }
      ]
    }
  },
  'split-url': {
    name: 'Split URL',
    icon: '🔀',
    description: 'Send visitors to alternate URLs to test page-level changes.',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: { url: '' } },
        { name: 'Variant A', allocation: 50, config: { url: '' } }
      ]
    }
  },
  template: {
    name: 'Template',
    icon: '📄',
    description: 'Compare and test different homepage, product, and collections templates.',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: { template: '' } },
        { name: 'Variant A', allocation: 50, config: { template: '' } }
      ]
    }
  },
  theme: {
    name: 'Theme',
    icon: '🎨',
    description: 'Test theme redesigns, new navigation, or impact of adding an app.',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Variant A', allocation: 50, config: {} }
      ]
    }
  },
  shipping: {
    name: 'Shipping Test',
    icon: '🚚',
    description: 'Test shipping rates and free shipping thresholds',
    defaultConfig: {
      type: 'shipping',
      variants: [
        { name: 'Control', allocation: 50, config: { rate: null } },
        { name: 'Variant A', allocation: 50, config: { rate: null } }
      ]
    }
  },
  offer: {
    name: 'Offer Test',
    icon: '🎁',
    description: 'Test discounts and promotional offers',
    defaultConfig: {
      type: 'offer',
      variants: [
        { name: 'Control', allocation: 50, config: { discount: null } },
        { name: 'Variant A', allocation: 50, config: { discount: null } }
      ]
    }
  },
  checkout: {
    name: 'Checkout Test',
    icon: '🛒',
    description: 'Try checkout customizations like trust badges, guarantees, and custom images.',
    defaultConfig: {
      type: 'checkout',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Variant A', allocation: 50, config: {} }
      ]
    }
  }
};

// Industry-specific templates
const INDUSTRY_TEMPLATES = {
  fashion: {
    name: 'Fashion - Product Page',
    icon: '👗',
    category: 'fashion',
    description: 'Optimize product pages for fashion stores - test product images, descriptions, and styling.',
    defaultConfig: {
      type: 'content',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Lifestyle Images', allocation: 50, config: { imageStyle: 'lifestyle' } }
      ]
    }
  },
  electronics: {
    name: 'Electronics - Price Point',
    icon: '📱',
    category: 'electronics',
    description: 'Test pricing strategies for electronics - find the optimal price point.',
    defaultConfig: {
      type: 'price',
      variants: [
        { name: 'Control', allocation: 50, config: { price: null } },
        { name: 'Premium', allocation: 50, config: { price: null } }
      ]
    }
  },
  food: {
    name: 'Food - Free Shipping',
    icon: '🍕',
    category: 'food',
    description: 'Test free shipping thresholds for food delivery services.',
    defaultConfig: {
      type: 'shipping',
      variants: [
        { name: 'Control', allocation: 50, config: { threshold: 50 } },
        { name: 'Free Shipping', allocation: 50, config: { threshold: 30 } }
      ]
    }
  },
  beauty: {
    name: 'Beauty - Bundle Offer',
    icon: '💄',
    category: 'beauty',
    description: 'Test bundle offers and product combinations for beauty products.',
    defaultConfig: {
      type: 'offer',
      variants: [
        { name: 'Control', allocation: 50, config: {} },
        { name: 'Bundle Deal', allocation: 50, config: { discount: 20 } }
      ]
    }
  }
};

function TestCreator() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'price',
    target_type: 'product',
    target_id: '',
    goal: {
      type: 'conversion',
      metric: 'revenue'
    },
    variants: [
      { name: 'Control', allocation: 50, config: {} },
      { name: 'Variant A', allocation: 50, config: {} }
    ],
    scheduled_start_at: '',
    scheduled_stop_at: '',
    auto_start: false,
    auto_stop: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });

  useEffect(() => {
    const templateType = searchParams.get('type');
    const testName = searchParams.get('name');
    const testDescription = searchParams.get('description');
    const testTypeId = searchParams.get('testTypeId');
    
    // If coming with pre-selected type, set it and move to step 2
    if (templateType && TEST_TEMPLATES[templateType]) {
      setSelectedTemplate(templateType);
      const template = TEST_TEMPLATES[templateType];
      setFormData(prev => ({
        ...prev,
        type: template.defaultConfig.type,
        variants: template.defaultConfig.variants,
        name: testName || prev.name,
        description: testDescription || prev.description
      }));
      setCurrentStep(2); // Skip to traffic allocation
    } else if (templateType) {
      // Handle new test types
      setFormData(prev => ({
        ...prev,
        type: templateType,
        name: testName || prev.name,
        description: testDescription || prev.description
      }));
      setCurrentStep(2); // Skip to traffic allocation
    }
    // Otherwise start at step 1 (template selection)
  }, [searchParams]);

  const steps = [
    { id: 1, title: 'Select Test Type', description: 'Choose a test template' },
    { id: 2, title: 'Traffic Allocation', description: 'Set traffic distribution' },
    { id: 3, title: 'Configure Test', description: 'Set up your test details' },
    { id: 4, title: 'Sample Size', description: 'Calculate required visitors' },
    { id: 5, title: 'Review & Create', description: 'Review and launch' }
  ];

  const handleTemplateSelect = (templateKey) => {
    setSelectedTemplate(templateKey);
    
    // Determine target type based on test type
    let targetType = 'product';
    if (templateKey === 'template' || templateKey === 'theme') {
      targetType = 'homepage';
    } else if (templateKey === 'checkout') {
      targetType = 'checkout';
    } else if (templateKey === 'shipping') {
      targetType = 'cart';
    } else if (templateKey === 'pricing' || templateKey === 'offer') {
      targetType = 'product'; // Can be changed to collection/all-products
    }
    
    if (TEST_TEMPLATES[templateKey]) {
      const template = TEST_TEMPLATES[templateKey];
      setFormData(prev => ({
        ...prev,
        type: template.defaultConfig.type,
        target_type: targetType,
        variants: template.defaultConfig.variants || [
          { name: 'Control', allocation: 50, config: {} },
          { name: 'Variant A', allocation: 50, config: {} }
        ]
      }));
    } else {
      // Handle test types that might not be in TEST_TEMPLATES
      let testType = 'content';
      if (templateKey === 'pricing') {
        testType = 'price';
      } else if (templateKey === 'shipping') {
        testType = 'shipping';
      } else if (templateKey === 'offer') {
        testType = 'offer';
      } else if (templateKey === 'checkout') {
        testType = 'checkout';
      }
      
      setFormData(prev => ({
        ...prev,
        type: testType,
        target_type: targetType,
        variants: [
          { name: 'Control', allocation: 50, config: {} },
          { name: 'Variant A', allocation: 50, config: {} }
        ]
      }));
    }
  };

  const handleNext = () => {
    // Validate step 1: require name and template selection
    if (currentStep === 1) {
      if (!formData.name.trim()) {
        setError('Please enter a test name');
        return;
      }
      if (!selectedTemplate) {
        setError('Please select a test type');
        return;
      }
    }
    
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiPost('/tests', {
        ...formData
      });

      const testData = response.data?.test || response.data?.data?.test;
      
      if (testData) {
        navigate(`/tests/${testData.id}`);
      }
    } catch (err) {
      // Log error details for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error('Error creating test:', err);
      }
      setError(err.response?.data?.error || 'Failed to create test');
      setLoading(false);
    }
  };

  const updateVariant = (index, field, value) => {
    const newVariants = [...formData.variants];
    if (field === 'allocation') {
      const diff = value - newVariants[index].allocation;
      const otherVariants = newVariants.filter((_, i) => i !== index);
      const otherTotal = otherVariants.reduce((sum, v) => sum + v.allocation, 0);
      
      if (otherTotal > 0) {
        otherVariants.forEach((v, i) => {
          const originalIndex = i < index ? i : i + 1;
          newVariants[originalIndex].allocation = 
            Math.max(0, Math.min(100, v.allocation - (diff * v.allocation / otherTotal)));
        });
      }
    }
    
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData({ ...formData, variants: newVariants });
  };

  const renderStepIndicator = () => (
    <div className="wizard-progress">
      {steps.map((step, index) => (
        <div
          key={step.id}
          className={`wizard-step-indicator ${
            currentStep === step.id ? 'active' : currentStep > step.id ? 'completed' : ''
          }`}
        >
          <div className="wizard-step-number">
            {currentStep > step.id ? '✓' : step.id}
          </div>
          <Text variant="bodySm" as="p" fontWeight={currentStep === step.id ? 'semibold' : 'regular'}>
            {step.title}
          </Text>
        </div>
      ))}
    </div>
  );

  const TEST_TYPE_CATEGORIES = {
    content: {
      title: 'Content Tests',
      description: 'Test visual and content changes',
      types: [
        { key: 'onsite-edit', name: 'Onsite Edit', description: 'Edit or hide page elements like text, images, or sections without changing your theme.', icon: '✏️' },
        { key: 'split-url', name: 'Split URL', description: 'Send visitors to alternate URLs to test page-level changes.', icon: '🔀' },
        { key: 'template', name: 'Template', description: 'Compare and test different homepage, product, and collections templates.', icon: '📄' },
        { key: 'theme', name: 'Theme', description: 'Test theme redesigns, new navigation, or impact of adding an app.', icon: '🎨' }
      ]
    },
    profit: {
      title: 'Profit Tests',
      description: 'Test changes that directly impact revenue',
      types: [
        { key: 'pricing', name: 'Pricing', description: 'Test price points on one product, multiple products, or entire collections.', icon: '💰' },
        { key: 'shipping', name: 'Shipping', description: 'Explore different shipping rates and free shipping thresholds.', icon: '🚚' },
        { key: 'offer', name: 'Offer', description: 'Compare percentage discounts, dollar-off amounts, or tiered incentives.', icon: '🎁' },
        { key: 'checkout', name: 'Checkout Test', description: 'Try checkout customizations like trust badges, guarantees, and custom images.', icon: '🛒' }
      ]
    },
    industry: {
      title: 'Industry Templates',
      description: 'Pre-built templates optimized for specific industries',
      types: [
        { key: 'fashion', name: 'Fashion', description: 'Optimize product pages for fashion stores - test product images, descriptions, and styling.', icon: '👗' },
        { key: 'electronics', name: 'Electronics', description: 'Test pricing strategies for electronics - find the optimal price point.', icon: '📱' },
        { key: 'food', name: 'Food & Beverage', description: 'Test free shipping thresholds for food delivery services.', icon: '🍕' },
        { key: 'beauty', name: 'Beauty & Cosmetics', description: 'Test bundle offers and product combinations for beauty products.', icon: '💄' }
      ]
    }
  };

  const renderTemplateSelection = () => (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingLg" as="h2">
            Select a test type to begin
          </Text>
          
          {/* Name and Description Fields */}
          <BlockStack gap="300">
            <TextField
              label="Name"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
              placeholder="Enter the name of your test"
              requiredIndicator
              autoComplete="off"
            />
            <TextField
              label="Description"
              value={formData.description || ''}
              onChange={(value) => setFormData({ ...formData, description: value })}
              placeholder="Describe purpose or hypothesis"
              multiline={2}
              autoComplete="off"
            />
          </BlockStack>

          {/* Content Tests Section */}
          <BlockStack gap="300">
            <InlineStack gap="200" align="start" blockAlign="center">
              <Text variant="headingMd" as="h3" fontWeight="semibold">
                {TEST_TYPE_CATEGORIES.content.title}
              </Text>
              <span className="info-icon" title={TEST_TYPE_CATEGORIES.content.description}>
                ⓘ
              </span>
            </InlineStack>

            <div className="template-grid">
              {TEST_TYPE_CATEGORIES.content.types.map((type) => {
                const isSelected = selectedTemplate === type.key;
                return (
                  <div
                    key={type.key}
                    className="template-grid-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTemplateSelect(type.key);
                    }}
                  >
                    <Card
                      sectioned
                      className={`template-card ${isSelected ? 'selected' : ''}`}
                    >
                    {isSelected && (
                      <div className="template-card-check">
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
                  </div>
                );
              })}
            </div>
          </BlockStack>

          {/* Profit Tests Section */}
          <BlockStack gap="300">
            <InlineStack gap="200" align="start" blockAlign="center">
              <Text variant="headingMd" as="h3" fontWeight="semibold">
                {TEST_TYPE_CATEGORIES.profit.title}
              </Text>
              <span style={{ fontSize: '1rem', opacity: 0.6, cursor: 'help' }} title={TEST_TYPE_CATEGORIES.profit.description}>
                ⓘ
              </span>
            </InlineStack>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              {TEST_TYPE_CATEGORIES.profit.types.map((type) => {
                const isSelected = selectedTemplate === type.key;
                return (
                  <div
                    key={type.key}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTemplateSelect(type.key);
                    }}
                    style={{
                      cursor: 'pointer'
                    }}
                  >
                    <Card
                      sectioned
                      style={{
                        border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-primary)',
                        backgroundColor: isSelected ? 'var(--bg-active)' : 'var(--bg-secondary)',
                        position: 'relative',
                        transition: 'all 0.2s ease'
                      }}
                    >
                    {isSelected && (
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
                  </div>
                );
              })}
            </div>
          </BlockStack>

          {/* Industry Templates Section */}
          <BlockStack gap="300">
            <InlineStack gap="200" align="start" blockAlign="center">
              <Text variant="headingMd" as="h3" fontWeight="semibold">
                {TEST_TYPE_CATEGORIES.industry.title}
              </Text>
              <span className="info-icon" title={TEST_TYPE_CATEGORIES.industry.description}>
                ⓘ
              </span>
            </InlineStack>

            <div className="template-grid">
              {TEST_TYPE_CATEGORIES.industry.types.map((type) => {
                const isSelected = selectedTemplate === type.key;
                return (
                  <div
                    key={type.key}
                    className="template-grid-item"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTemplateSelect(type.key);
                    }}
                  >
                    <Card
                      sectioned
                      className={`template-card ${isSelected ? 'selected' : ''}`}
                    >
                      {isSelected && (
                        <div className="template-card-check">
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
                  </div>
                );
              })}
            </div>
          </BlockStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const renderTestConfiguration = () => (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingLg" as="h2">
          Test Configuration
        </Text>
        
        <FormLayout>
          <TextField
            label="Test Name"
            value={formData.name}
            onChange={(value) => setFormData({ ...formData, name: value })}
            required
            helpText="Give your test a descriptive name (e.g., 'Summer Sale Price Test')"
            placeholder="Enter test name"
          />

          <TextField
            label="Description"
            value={formData.description || ''}
            onChange={(value) => setFormData({ ...formData, description: value })}
            multiline={2}
            helpText="Describe the purpose or hypothesis of this test (optional)"
            placeholder="Describe purpose or hypothesis"
          />

          <Select
            label="Test Type"
            value={formData.type}
            disabled
            helpText="Test type is set from template selection"
          />

          <Select
            label="Target Type"
            options={[
              { label: 'Product', value: 'product' },
              { label: 'Collection', value: 'collection' },
              { label: 'Page', value: 'page' },
              { label: 'Homepage', value: 'homepage' },
              { label: 'Cart', value: 'cart' },
              { label: 'Checkout', value: 'checkout' },
              { label: 'All Products', value: 'all-products' },
              { label: 'All Collections', value: 'all-collections' }
            ]}
            value={formData.target_type}
            onChange={(value) => setFormData({ ...formData, target_type: value })}
            helpText="What to apply this test to"
          />

          {(formData.target_type !== 'homepage' && 
            formData.target_type !== 'cart' && 
            formData.target_type !== 'checkout' &&
            formData.target_type !== 'all-products' &&
            formData.target_type !== 'all-collections') && (
            <TextField
              label="Target ID"
              value={formData.target_id}
              onChange={(value) => setFormData({ ...formData, target_id: value })}
              helpText={
                formData.target_type === 'product' 
                  ? "Product ID (e.g., gid://shopify/Product/123456)"
                  : formData.target_type === 'collection'
                  ? "Collection ID (e.g., gid://shopify/Collection/123456)"
                  : "Page ID (e.g., gid://shopify/OnlineStorePage/123456)"
              }
              placeholder={
                formData.target_type === 'product'
                  ? "gid://shopify/Product/123456"
                  : formData.target_type === 'collection'
                  ? "gid://shopify/Collection/123456"
                  : "gid://shopify/OnlineStorePage/123456"
              }
            />
          )}

          <Select
            label="Success Metric"
            options={[
              { label: 'Revenue', value: 'revenue' },
              { label: 'Conversion Rate', value: 'conversion_rate' },
              { label: 'Average Order Value', value: 'aov' }
            ]}
            value={formData.goal.metric}
            onChange={(value) => setFormData({
              ...formData,
              goal: { ...formData.goal, metric: value }
            })}
          />
        </FormLayout>
      </BlockStack>
    </Card>
  );
  
  const renderSampleSizeCalculator = () => (
    <SampleSizeCalculator />
  );

  const renderVariants = () => (
    <BlockStack gap="400">
      {/* Traffic Allocation Slider */}
      <TrafficAllocationSlider
        variants={formData.variants}
        onChange={(updatedVariants) => {
          setFormData({ ...formData, variants: updatedVariants });
        }}
        onAddVariant={(newVariant) => {
          // Variant already added by slider
        }}
        onRemoveVariant={(index) => {
          // Variant already removed by slider
        }}
      />

      {/* Variant-Specific Configuration */}
      <Card>
        <BlockStack gap="400">
          <Text variant="headingLg" as="h2">
            Variant Configuration
          </Text>
          
          {formData.variants.map((variant, index) => (
            <Card key={index} sectioned>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  {variant.name}
                </Text>
                
                <FormLayout>
                  <TextField
                    label="Variant Name"
                    value={variant.name}
                    onChange={(value) => updateVariant(index, 'name', value)}
                  />

                  {formData.type === 'price' && (
                    <TextField
                      label="Price"
                      type="number"
                      value={variant.config.price || ''}
                      onChange={(value) => {
                        const newVariants = [...formData.variants];
                        newVariants[index].config.price = parseFloat(value);
                        setFormData({ ...formData, variants: newVariants });
                      }}
                      prefix="$"
                      helpText="Price for this variant"
                    />
                  )}

                  {formData.type === 'shipping' && (
                    <TextField
                      label="Shipping Rate"
                      type="number"
                      value={variant.config.rate || ''}
                      onChange={(value) => {
                        const newVariants = [...formData.variants];
                        newVariants[index].config.rate = parseFloat(value);
                        setFormData({ ...formData, variants: newVariants });
                      }}
                      prefix="$"
                    />
                  )}

                  {/* Onsite Edit Configuration */}
                  {(formData.type === 'content' && selectedTemplate === 'onsite-edit') && (
                    <BlockStack gap="200">
                      <TextField
                        label="CSS Selector"
                        value={variant.config.selector || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.selector = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="e.g., .product-title, #hero-text"
                        helpText="CSS selector for the element to edit"
                      />
                      <Select
                        label="Action"
                        options={[
                          { label: 'Edit Text', value: 'edit-text' },
                          { label: 'Hide Element', value: 'hide' },
                          { label: 'Show Element', value: 'show' },
                          { label: 'Replace Image', value: 'replace-image' },
                          { label: 'Custom CSS', value: 'custom-css' }
                        ]}
                        value={variant.config.action || 'edit-text'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.action = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                      {variant.config.action === 'edit-text' && (
                        <TextField
                          label="New Text Content"
                          value={variant.config.text || ''}
                          onChange={(value) => {
                            const newVariants = [...formData.variants];
                            newVariants[index].config.text = value;
                            setFormData({ ...formData, variants: newVariants });
                          }}
                          multiline={3}
                          placeholder="Enter the new text content"
                        />
                      )}
                      {variant.config.action === 'replace-image' && (
                        <TextField
                          label="Image URL"
                          value={variant.config.imageUrl || ''}
                          onChange={(value) => {
                            const newVariants = [...formData.variants];
                            newVariants[index].config.imageUrl = value;
                            setFormData({ ...formData, variants: newVariants });
                          }}
                          placeholder="https://example.com/image.jpg"
                        />
                      )}
                      {variant.config.action === 'custom-css' && (
                        <TextField
                          label="Custom CSS"
                          value={variant.config.customCss || ''}
                          onChange={(value) => {
                            const newVariants = [...formData.variants];
                            newVariants[index].config.customCss = value;
                            setFormData({ ...formData, variants: newVariants });
                          }}
                          multiline={4}
                          placeholder=".element { color: red; }"
                        />
                      )}
                    </BlockStack>
                  )}

                  {/* Split URL Configuration */}
                  {(formData.type === 'content' && selectedTemplate === 'split-url') && (
                    <TextField
                      label="Alternate URL"
                      value={variant.config.url || ''}
                      onChange={(value) => {
                        const newVariants = [...formData.variants];
                        newVariants[index].config.url = value;
                        setFormData({ ...formData, variants: newVariants });
                      }}
                      placeholder="/products/alternate-page"
                      helpText="URL path to redirect visitors for this variant"
                    />
                  )}

                  {/* Template Configuration */}
                  {(formData.type === 'content' && selectedTemplate === 'template') && (
                    <Select
                      label="Template"
                      options={[
                        { label: 'Default Template', value: 'default' },
                        { label: 'Product Template A', value: 'product-a' },
                        { label: 'Product Template B', value: 'product-b' },
                        { label: 'Collection Template A', value: 'collection-a' },
                        { label: 'Collection Template B', value: 'collection-b' },
                        { label: 'Homepage Template A', value: 'homepage-a' },
                        { label: 'Homepage Template B', value: 'homepage-b' }
                      ]}
                      value={variant.config.template || 'default'}
                      onChange={(value) => {
                        const newVariants = [...formData.variants];
                        newVariants[index].config.template = value;
                        setFormData({ ...formData, variants: newVariants });
                      }}
                      helpText="Select the template to use for this variant"
                    />
                  )}

                  {/* Theme Configuration */}
                  {(formData.type === 'content' && selectedTemplate === 'theme') && (
                    <BlockStack gap="200">
                      <Select
                        label="Theme"
                        options={[
                          { label: 'Current Theme', value: 'current' },
                          { label: 'Theme Variant A', value: 'theme-a' },
                          { label: 'Theme Variant B', value: 'theme-b' }
                        ]}
                        value={variant.config.theme || 'current'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.theme = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                      <TextField
                        label="Navigation Style"
                        value={variant.config.navigation || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.navigation = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="e.g., dropdown, mega-menu"
                        helpText="Navigation style for this theme variant"
                      />
                    </BlockStack>
                  )}

                  {/* Pricing Configuration */}
                  {(formData.type === 'price' || selectedTemplate === 'pricing') && (
                    <BlockStack gap="200">
                      <TextField
                        label="Price"
                        type="number"
                        value={variant.config.price || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.price = parseFloat(value);
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        prefix="$"
                        helpText="Price for this variant"
                      />
                      <Select
                        label="Price Type"
                        options={[
                          { label: 'Single Product', value: 'single' },
                          { label: 'Multiple Products', value: 'multiple' },
                          { label: 'Entire Collection', value: 'collection' }
                        ]}
                        value={variant.config.priceType || 'single'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.priceType = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                      {variant.config.priceType === 'multiple' && (
                        <TextField
                          label="Product IDs (comma-separated)"
                          value={variant.config.productIds || ''}
                          onChange={(value) => {
                            const newVariants = [...formData.variants];
                            newVariants[index].config.productIds = value;
                            setFormData({ ...formData, variants: newVariants });
                          }}
                          placeholder="123, 456, 789"
                        />
                      )}
                      {variant.config.priceType === 'collection' && (
                        <TextField
                          label="Collection ID"
                          value={variant.config.collectionId || ''}
                          onChange={(value) => {
                            const newVariants = [...formData.variants];
                            newVariants[index].config.collectionId = value;
                            setFormData({ ...formData, variants: newVariants });
                          }}
                          placeholder="gid://shopify/Collection/123"
                        />
                      )}
                    </BlockStack>
                  )}

                  {/* Shipping Configuration */}
                  {formData.type === 'shipping' && (
                    <BlockStack gap="200">
                      <TextField
                        label="Shipping Rate"
                        type="number"
                        value={variant.config.rate || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.rate = parseFloat(value);
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        prefix="$"
                        helpText="Shipping rate for this variant"
                      />
                      <TextField
                        label="Free Shipping Threshold"
                        type="number"
                        value={variant.config.freeShippingThreshold || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.freeShippingThreshold = parseFloat(value);
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        prefix="$"
                        helpText="Minimum order value for free shipping (leave empty for no free shipping)"
                      />
                      <Select
                        label="Shipping Method"
                        options={[
                          { label: 'Standard Shipping', value: 'standard' },
                          { label: 'Express Shipping', value: 'express' },
                          { label: 'Overnight Shipping', value: 'overnight' },
                          { label: 'Free Shipping', value: 'free' }
                        ]}
                        value={variant.config.shippingMethod || 'standard'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.shippingMethod = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                    </BlockStack>
                  )}

                  {/* Offer Configuration */}
                  {formData.type === 'offer' && (
                    <BlockStack gap="200">
                      <Select
                        label="Discount Type"
                        options={[
                          { label: 'Percentage', value: 'percentage' },
                          { label: 'Fixed Amount', value: 'fixed' },
                          { label: 'Buy X Get Y', value: 'bxgy' },
                          { label: 'Tiered Discount', value: 'tiered' }
                        ]}
                        value={variant.config.discountType || 'percentage'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.discountType = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                      <TextField
                        label="Discount Value"
                        type="number"
                        value={variant.config.discount || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.discount = parseFloat(value);
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        prefix={variant.config.discountType === 'percentage' ? '%' : '$'}
                        helpText={variant.config.discountType === 'percentage' ? 'Percentage discount (e.g., 20 for 20%)' : 'Fixed dollar amount'}
                      />
                      {variant.config.discountType === 'bxgy' && (
                        <BlockStack gap="200">
                          <TextField
                            label="Buy Quantity"
                            type="number"
                            value={variant.config.buyQuantity || ''}
                            onChange={(value) => {
                              const newVariants = [...formData.variants];
                              newVariants[index].config.buyQuantity = parseInt(value);
                              setFormData({ ...formData, variants: newVariants });
                            }}
                            helpText="Buy X items"
                          />
                          <TextField
                            label="Get Quantity"
                            type="number"
                            value={variant.config.getQuantity || ''}
                            onChange={(value) => {
                              const newVariants = [...formData.variants];
                              newVariants[index].config.getQuantity = parseInt(value);
                              setFormData({ ...formData, variants: newVariants });
                            }}
                            helpText="Get Y items free"
                          />
                        </BlockStack>
                      )}
                      {variant.config.discountType === 'tiered' && (
                        <TextField
                          label="Tiered Discount Rules (JSON)"
                          value={variant.config.tieredRules || ''}
                          onChange={(value) => {
                            const newVariants = [...formData.variants];
                            newVariants[index].config.tieredRules = value;
                            setFormData({ ...formData, variants: newVariants });
                          }}
                          multiline={4}
                          placeholder='[{"min": 50, "discount": 10}, {"min": 100, "discount": 20}]'
                          helpText="JSON array of tiered discount rules"
                        />
                      )}
                      <Select
                        label="Apply To"
                        options={[
                          { label: 'Entire Order', value: 'order' },
                          { label: 'Specific Products', value: 'products' },
                          { label: 'Collection', value: 'collection' }
                        ]}
                        value={variant.config.applyTo || 'order'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.applyTo = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                    </BlockStack>
                  )}

                  {/* Checkout Configuration */}
                  {formData.type === 'checkout' && (
                    <BlockStack gap="200">
                      <Select
                        label="Trust Badge"
                        options={[
                          { label: 'None', value: 'none' },
                          { label: 'SSL Secure', value: 'ssl' },
                          { label: 'Money Back Guarantee', value: 'money-back' },
                          { label: 'Free Returns', value: 'free-returns' },
                          { label: 'Custom Badge', value: 'custom' }
                        ]}
                        value={variant.config.trustBadge || 'none'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.trustBadge = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                      {variant.config.trustBadge === 'custom' && (
                        <TextField
                          label="Custom Badge Text"
                          value={variant.config.customBadgeText || ''}
                          onChange={(value) => {
                            const newVariants = [...formData.variants];
                            newVariants[index].config.customBadgeText = value;
                            setFormData({ ...formData, variants: newVariants });
                          }}
                          placeholder="e.g., 30-Day Money Back Guarantee"
                        />
                      )}
                      <TextField
                        label="Guarantee Text"
                        value={variant.config.guarantee || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.guarantee = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        multiline={2}
                        placeholder="e.g., 100% satisfaction guaranteed or your money back"
                      />
                      <TextField
                        label="Custom Checkout Image URL"
                        value={variant.config.checkoutImage || ''}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.checkoutImage = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                        placeholder="https://example.com/checkout-image.jpg"
                        helpText="Image to display on checkout page"
                      />
                      <Select
                        label="Checkout Layout"
                        options={[
                          { label: 'Standard', value: 'standard' },
                          { label: 'One Page', value: 'one-page' },
                          { label: 'Multi-Step', value: 'multi-step' }
                        ]}
                        value={variant.config.checkoutLayout || 'standard'}
                        onChange={(value) => {
                          const newVariants = [...formData.variants];
                          newVariants[index].config.checkoutLayout = value;
                          setFormData({ ...formData, variants: newVariants });
                        }}
                      />
                    </BlockStack>
                  )}

                  {/* Custom Code Editor - Available for all types */}
                  <TextField
                    label="Custom Code (Optional)"
                    value={variant.config.code || ''}
                    onChange={(value) => {
                      const newVariants = [...formData.variants];
                      newVariants[index].config.code = value;
                      setFormData({ ...formData, variants: newVariants });
                    }}
                    multiline={6}
                    placeholder="Enter custom JavaScript/HTML code for this variant..."
                    helpText="Add custom code that will be executed for this variant"
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          ))}
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const renderReview = () => (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingLg" as="h2">
          Review Test Configuration
        </Text>
        
        <Card sectioned>
          <BlockStack gap="300">
            <div>
              <Text variant="bodyMd" fontWeight="semibold" as="p">Test Name</Text>
              <Text variant="bodyMd" as="p">{formData.name || 'Not set'}</Text>
            </div>
            <Divider />
            <div>
              <Text variant="bodyMd" fontWeight="semibold" as="p">Test Type</Text>
              <Text variant="bodyMd" as="p">{formData.type}</Text>
            </div>
            <Divider />
            <div>
              <Text variant="bodyMd" fontWeight="semibold" as="p">Target ID</Text>
              <Text variant="bodyMd" as="p">{formData.target_id || 'Not set'}</Text>
            </div>
            <Divider />
            <div>
              <Text variant="bodyMd" fontWeight="semibold" as="p">Success Metric</Text>
              <Text variant="bodyMd" as="p">{formData.goal.metric}</Text>
            </div>
            <Divider />
            <div>
              <Text variant="bodyMd" fontWeight="semibold" as="p">Variants</Text>
              {formData.variants.map((v, i) => (
                <Text key={i} variant="bodyMd" as="p">
                  {v.name}: {v.allocation}%
                </Text>
              ))}
            </div>
          </BlockStack>
        </Card>

        <Card sectioned title="Test Scheduling (Optional)">
          <BlockStack gap="300">
            <Checkbox
              label="Schedule test to start automatically"
              checked={formData.auto_start}
              onChange={(value) => setFormData({ ...formData, auto_start: value })}
            />
            {formData.auto_start && (
              <TextField
                label="Start Date & Time"
                type="datetime-local"
                value={formData.scheduled_start_at}
                onChange={(value) => setFormData({ ...formData, scheduled_start_at: value })}
                helpText="When should this test automatically start?"
              />
            )}

            <Checkbox
              label="Schedule test to stop automatically"
              checked={formData.auto_stop}
              onChange={(value) => setFormData({ ...formData, auto_stop: value })}
            />
            {formData.auto_stop && (
              <TextField
                label="Stop Date & Time"
                type="datetime-local"
                value={formData.scheduled_stop_at}
                onChange={(value) => setFormData({ ...formData, scheduled_stop_at: value })}
                helpText="When should this test automatically stop?"
              />
            )}

            {(formData.auto_start || formData.auto_stop) && (
              <Select
                label="Timezone"
                options={[
                  { label: 'UTC', value: 'UTC' },
                  { label: 'Eastern Time (UTC-5)', value: 'America/New_York' },
                  { label: 'Central Time (UTC-6)', value: 'America/Chicago' },
                  { label: 'Mountain Time (UTC-7)', value: 'America/Denver' },
                  { label: 'Pacific Time (UTC-8)', value: 'America/Los_Angeles' },
                  { label: 'London (UTC+0)', value: 'Europe/London' },
                  { label: 'Paris (UTC+1)', value: 'Europe/Paris' },
                  { label: 'Tokyo (UTC+9)', value: 'Asia/Tokyo' }
                ]}
                value={formData.timezone}
                onChange={(value) => setFormData({ ...formData, timezone: value })}
                helpText="Timezone for scheduled times"
              />
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Card>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return renderTemplateSelection();
      case 2:
        return renderVariants(); // Traffic allocation
      case 3:
        return renderTestConfiguration();
      case 4:
        return renderSampleSizeCalculator();
      case 5:
        return renderReview();
      default:
        return null;
    }
  };

  return (
    <>
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />

      <Page
        title="Create AB Test"
      >
        <Layout>
        <Layout.Section>
          {renderStepIndicator()}
          
          <div className="wizard-step">
            {renderCurrentStep()}
          </div>

          <InlineStack align="end" gap="200">
            {currentStep > 1 && (
              <Button onClick={handleBack}>
                Back
              </Button>
            )}
            {currentStep < steps.length ? (
              <Button primary onClick={handleNext}>
                Next
              </Button>
            ) : (
              <Button primary onClick={handleSubmit} loading={loading}>
                Create Test
              </Button>
            )}
            <Button onClick={() => navigate('/')}>
              Cancel
            </Button>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
    </>
  );
}

export default TestCreator;
