/**
 * Test Detail Component
 * 
 * View and manage individual test details
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Page,
  Card,
  Layout,
  Button,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  Modal,
  TextField,
  Select
} from '@shopify/polaris';
// @ts-ignore - Case sensitivity cache issue on macOS
import CustomTabs from '../Shared/CustomTabs';
import TrafficAllocationSlider from '../TestCreator/TrafficAllocationSlider';
import { useParams, useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { apiGet, apiPost, apiDelete, apiPut } from '../../services';

function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    type: '',
    target_type: '',
    target_id: '',
    goal_type: '',
    goal_metric: ''
  });
  const [saveLoading, setSaveLoading] = useState(false);
  const [trafficAllocationVariants, setTrafficAllocationVariants] = useState([]);
  const [trafficAllocationLoading, setTrafficAllocationLoading] = useState(false);
  const [variantCodesData, setVariantCodesData] = useState([]);
  const [variantCodesLoading, setVariantCodesLoading] = useState(false);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [successMessage, setSuccessMessage] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [originalVariantCodes, setOriginalVariantCodes] = useState([]);
  const [originalTrafficAllocation, setOriginalTrafficAllocation] = useState([]);
  const [cssValidationErrors, setCssValidationErrors] = useState([]);
  const [jsValidationErrors, setJsValidationErrors] = useState([]);

  // CSS Validation using browser's native CSS parser
  const validateCSS = (css) => {
    const errors = [];
    if (!css || css.trim() === '') return errors;

    // Use browser's native CSS parser (most accurate)
    try {
      const styleSheet = new CSSStyleSheet();
      // This will throw if CSS is invalid
      styleSheet.replaceSync(css);
    } catch (e) {
      // Browser's CSS parser found an error
      if (e.message) {
        // Extract meaningful error message
        let errorMsg = e.message;
        if (errorMsg.includes('CSS')) {
          errorMsg = errorMsg.replace(/.*CSS\s*:?\s*/i, '');
        }
        errors.push(`CSS syntax error: ${errorMsg}`);
      } else {
        errors.push('Invalid CSS syntax detected');
      }
    }

    return errors;
  };

  // JavaScript Validation using browser's native parser
  const validateJS = (js) => {
    const errors = [];
    if (!js || js.trim() === '') return errors;

    // Use browser's native JavaScript parser (most accurate)
    try {
      // Wrap in a function to avoid global scope issues and catch syntax errors
      new Function(js);
    } catch (e) {
      // Only show syntax errors, not runtime errors
      if (e instanceof SyntaxError) {
        // Clean up and format error message
        let errorMsg = e.message;
        
        // Extract line number if available
        const lineMatch = errorMsg.match(/line (\d+)/i);
        const lineNum = lineMatch ? lineMatch[1] : null;
        
        // Clean up common error message patterns
        if (errorMsg.includes('Unexpected token')) {
          errorMsg = errorMsg.replace(/Unexpected token (.+?)(?:$|\.)/, 'Unexpected token: $1');
        } else if (errorMsg.includes('Unexpected end')) {
          errorMsg = 'Unexpected end of input (missing closing bracket, brace, or parenthesis)';
        } else if (errorMsg.includes('Missing')) {
          errorMsg = errorMsg.replace(/Missing (.+?)(?:$|\.)/, 'Missing: $1');
        } else if (errorMsg.includes('Invalid')) {
          errorMsg = errorMsg.replace(/Invalid (.+?)(?:$|\.)/, 'Invalid: $1');
        }
        
        // Add line number if available
        if (lineNum) {
          errors.push(`Syntax error (line ${lineNum}): ${errorMsg}`);
        } else {
          errors.push(`Syntax error: ${errorMsg}`);
        }
      } else if (e instanceof ReferenceError) {
        // Reference errors are usually runtime, but some indicate syntax issues
        errors.push(`Reference error: ${e.message}`);
      }
    }

    return errors;
  };

  useEffect(() => {
    fetchTest();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync traffic allocation variants when test data changes
  useEffect(() => {
    if (test && test.variants) {
      const trafficVariants = test.variants.map(v => ({
        ...v,
        allocation: v.allocation || 0
      }));
      const codesData = test.variants.map(v => {
        const fullCode = v.code || (v.config?.code ? JSON.stringify(v.config.code, null, 2) : '') || '';
        // Try to parse CSS and JS from existing code
        const cssMatch = fullCode.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
        const jsMatch = fullCode.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        return {
          id: v.id,
          name: v.name,
          css: cssMatch ? cssMatch[1].trim() : '',
          js: jsMatch ? jsMatch[1].trim() : '',
          code: fullCode // Keep original for fallback
        };
      });
      
      setTrafficAllocationVariants(trafficVariants);
      setVariantCodesData(codesData);
      setOriginalTrafficAllocation(JSON.parse(JSON.stringify(trafficVariants)));
      setOriginalVariantCodes(JSON.parse(JSON.stringify(codesData)));
      setHasUnsavedChanges(false);
      
      // Reset selected variant index if it's out of bounds
      if (selectedVariantIndex >= test.variants.length) {
        setSelectedVariantIndex(0);
      }

      // Validate initial codes
      if (codesData.length > 0 && codesData[selectedVariantIndex]) {
        const current = codesData[selectedVariantIndex];
        setCssValidationErrors(validateCSS(current.css));
        setJsValidationErrors(validateJS(current.js));
      }
    }
  }, [test]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-validate when switching variants
  useEffect(() => {
    if (variantCodesData.length > 0 && variantCodesData[selectedVariantIndex]) {
      const current = variantCodesData[selectedVariantIndex];
      setCssValidationErrors(validateCSS(current.css));
      setJsValidationErrors(validateJS(current.js));
    }
  }, [selectedVariantIndex, variantCodesData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation for variant codes
  useEffect(() => {
    if (selectedTab === 2 && variantCodesData.length > 0) {
      const handleKeyDown = (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
          // Don't interfere with text editing
          if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') {
            e.preventDefault();
            setSelectedVariantIndex(prev => Math.max(0, prev - 1));
          } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') {
            e.preventDefault();
            setSelectedVariantIndex(prev => Math.min(variantCodesData.length - 1, prev + 1));
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [selectedTab, variantCodesData.length]);

  // Check for unsaved changes
  useEffect(() => {
    if (variantCodesData.length > 0 && originalVariantCodes.length > 0) {
      const codesChanged = JSON.stringify(variantCodesData) !== JSON.stringify(originalVariantCodes);
      const allocationChanged = JSON.stringify(trafficAllocationVariants) !== JSON.stringify(originalTrafficAllocation);
      setHasUnsavedChanges(codesChanged || allocationChanged);
    }
  }, [variantCodesData, trafficAllocationVariants, originalVariantCodes, originalTrafficAllocation]);

  const fetchTest = async () => {
    try {
      setLoading(true);
      
      const response = await apiGet(`/tests/${id}`);
      const testData = response.data?.test || response.data?.data?.test;
      
      setTest(testData);
      setError(null);
    } catch (err) {
      // Log error details for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error('Error fetching test:', err);
      }
      setError(err.response?.data?.error || 'Failed to load test');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    setActionLoading(true);
    try {
      await apiPost(`/tests/${id}/start`, {});
      fetchTest();
    } catch (err) {
      setError('Failed to start test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    setActionLoading(true);
    try {
      await apiPost(`/tests/${id}/stop`, {});
      fetchTest();
    } catch (err) {
      setError('Failed to stop test');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    try {
      await apiDelete(`/tests/${id}`);
      navigate('/');
    } catch (err) {
      setError('Failed to delete test');
      setActionLoading(false);
    }
  };

  const handleClone = async () => {
    setActionLoading(true);
    try {
      const response = await apiPost(`/tests/${id}/clone`, {});
      const testData = response.data?.test || response.data?.data?.test;
      
      if (testData) {
        navigate(`/tests/${testData.id}`);
      }
    } catch (err) {
      setError('Failed to clone test');
      setActionLoading(false);
    }
  };

  const handleEdit = () => {
    if (test) {
      setEditFormData({
        name: test.name || '',
        type: test.type || '',
        target_type: test.target_type || '',
        target_id: test.target_id || '',
        goal_type: test.goal?.type || '',
        goal_metric: test.goal?.metric || ''
      });
      setIsEditing(true);
      setSelectedTab(3); // Switch to Settings tab
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditFormData({
      name: '',
      type: '',
      target_type: '',
      target_id: '',
      goal_type: '',
      goal_metric: ''
    });
  };

  const handleSaveEdit = async () => {
    setSaveLoading(true);
    try {
      const updates = {
        name: editFormData.name,
        type: editFormData.type,
        target_type: editFormData.target_type,
        target_id: editFormData.target_id,
        goal: {
          type: editFormData.goal_type,
          metric: editFormData.goal_metric
        }
      };

      await apiPut(`/tests/${id}`, updates);
      await fetchTest();
      setIsEditing(false);
      setError(null);
      setSuccessMessage('Test settings updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update test');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleFormFieldChange = (field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTrafficAllocationChange = async (variants) => {
    setTrafficAllocationVariants(variants);
  };

  const handleSaveTrafficAllocation = async () => {
    setTrafficAllocationLoading(true);
    try {
      const updates = trafficAllocationVariants.map(v => ({
        id: v.id,
        name: v.name,
        allocation: v.allocation
      }));

      await apiPut(`/tests/${id}/variants/allocation`, { variants: updates });
      await fetchTest();
      setError(null);
      setSuccessMessage('Traffic allocation updated successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update traffic allocation');
    } finally {
      setTrafficAllocationLoading(false);
    }
  };

  // Debounced validation ref for performance optimization
  const validationTimeoutRef = useRef(null);

  const handleVariantCodeChange = (type, value) => {
    setVariantCodesData(prev => {
      const updated = [...prev];
      if (updated[selectedVariantIndex]) {
        updated[selectedVariantIndex] = { 
          ...updated[selectedVariantIndex], 
          [type]: value 
        };
      }
      return updated;
    });

    // Debounce validation for better performance (300ms delay)
    // This prevents validation from running on every keystroke
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(() => {
      if (type === 'css') {
        const errors = validateCSS(value);
        setCssValidationErrors(errors);
      } else if (type === 'js') {
        const errors = validateJS(value);
        setJsValidationErrors(errors);
      }
    }, 300);
  };

  const handleSaveVariantCodes = async () => {
    setVariantCodesLoading(true);
    try {
      const updates = variantCodesData.map(v => {
        // Combine CSS and JS into a single code string
        let combinedCode = '';
        if (v.css && v.css.trim()) {
          combinedCode += `<style>\n${v.css}\n</style>\n`;
        }
        if (v.js && v.js.trim()) {
          combinedCode += `<script>\n${v.js}\n</script>`;
        }
        return {
          id: v.id,
          name: v.name,
          code: combinedCode.trim() || v.code || '' // Fallback to original code if both are empty
        };
      });

      await apiPut(`/tests/${id}/variants/codes`, { variants: updates });
      await fetchTest();
      setError(null);
      setSuccessMessage('Custom code saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update variant codes');
    } finally {
      setVariantCodesLoading(false);
    }
  };

  const handleVariantNavigation = (direction) => {
    if (direction === 'prev') {
      setSelectedVariantIndex(prev => Math.max(0, prev - 1));
    } else {
      setSelectedVariantIndex(prev => Math.min(variantCodesData.length - 1, prev + 1));
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      draft: { status: 'info', label: 'Draft' },
      running: { status: 'success', label: 'Running' },
      stopped: { status: 'warning', label: 'Stopped' },
      completed: { status: 'complete', label: 'Completed' }
    };
    
    const config = statusMap[status] || { status: 'info', label: status };
    return <Badge status={config.status}>{config.label}</Badge>;
  };

  const getHealthBadge = (health) => {
    if (!health) return null;
    const colorMap = {
      excellent: 'success',
      good: 'attention',
      fair: 'warning',
      poor: 'critical'
    };
    return (
      <Badge status={colorMap[health.healthLevel] || 'info'}>
        {health.score}/100 - {health.healthLevel.charAt(0).toUpperCase() + health.healthLevel.slice(1)}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Page title="Test Details">
        <Card sectioned>
          <LoadingSkeleton type="card" count={2} />
        </Card>
      </Page>
    );
  }

  if (error && !test) {
    return (
      <>
        <Toast
          message={error}
          type="error"
          onClose={() => setError(null)}
          duration={5000}
        />
        <Page title="Test Details" />
      </>
    );
  }

  if (!test) {
    return (
      <>
        <Toast
          message="Test not found"
          type="error"
          onClose={() => navigate('/')}
          duration={5000}
        />
        <Page title="Test Details" />
      </>
    );
  }

  return (
    <>
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />
      <Toast
        message={successMessage}
        type="success"
        onClose={() => setSuccessMessage(null)}
        duration={3000}
      />

      <Page
        title={test.name}
        breadcrumbs={[{
          content: 'All Tests',
          onAction: () => navigate('/tests')
        }]}
        primaryAction={
          test.status === 'running' 
            ? {
                content: 'Stop Test',
                destructive: true,
                onAction: handleStop,
                loading: actionLoading
              }
            : {
                content: 'Start Test',
                onAction: handleStart,
                loading: actionLoading
              }
        }
        secondaryActions={[
          {
            content: isEditing ? 'Cancel Edit' : 'Edit Test',
            onAction: isEditing ? handleCancelEdit : handleEdit
          },
          {
            content: 'View Analytics',
            onAction: () => navigate(`/tests/${id}/analytics`)
          },
          {
            content: 'Clone Test',
            onAction: handleClone,
            loading: actionLoading
          },
          {
            content: 'Delete',
            destructive: true,
            onAction: () => setDeleteModal(true)
          }
        ]}
      >
        <CustomTabs
          tabs={[
            {
              id: 'overview',
              content: 'Overview',
            },
            {
              id: 'traffic-allocation',
              content: 'Traffic Allocation',
            },
            {
              id: 'variant-codes',
              content: 'Custom Code',
            },
            {
              id: 'settings',
              content: 'Settings',
            },
          ]}
          selected={selectedTab}
          onSelect={setSelectedTab}
        >
          {selectedTab === 0 && (
            <Layout>
              <Layout.Section>
                <div className="test-detail-overview-card">
                  <Card sectioned>
                    <BlockStack gap="400">
                      <InlineStack gap="500" align="start" wrap={false}>
                        <div className="test-detail-info-item">
                          <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                            Status
                          </Text>
                          <div style={{ marginTop: '0.5rem' }}>
                            {getStatusBadge(test.status)}
                          </div>
                        </div>
                        {test.health && (
                          <div className="test-detail-info-item">
                            <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                              Health Score
                            </Text>
                            <div style={{ marginTop: '0.5rem' }}>
                              {getHealthBadge(test.health)}
                            </div>
                          </div>
                        )}
                        <div className="test-detail-info-item">
                          <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                            Test Type
                          </Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.5rem' }}>
                            {test.type}
                          </Text>
                        </div>
                        <div className="test-detail-info-item">
                          <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                            Created
                          </Text>
                          <Text as="p" variant="bodyMd" style={{ marginTop: '0.5rem' }}>
                            {new Date(test.created_at).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </Text>
                        </div>
                      </InlineStack>
                      
                      <div style={{ 
                        height: '1px', 
                        background: 'var(--border-primary)', 
                        margin: 'var(--spacing-md) 0' 
                      }} />

                      <BlockStack gap="300">
                        <div className="test-detail-field">
                          <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                            Target
                          </Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                            {test.target_type}: {test.target_id}
                          </Text>
                        </div>

                        <div className="test-detail-field">
                          <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                            Goal
                          </Text>
                          <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                            {test.goal?.type || 'N/A'}: {test.goal?.metric || 'N/A'}
                          </Text>
                        </div>
                      </BlockStack>
                    </BlockStack>
                  </Card>
                </div>

                {test.health && (
                  <div className="test-detail-health-card">
                    <Card sectioned title="Test Health">
                      <BlockStack gap="400">
                        <div className="test-detail-health-score">
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 'var(--spacing-md)',
                            marginBottom: 'var(--spacing-sm)'
                          }}>
                            <Text variant="headingLg" as="h3" fontWeight="bold">
                              {test.health.score}/100
                            </Text>
                            <Badge status={test.health.healthLevel === 'excellent' ? 'success' : 
                                          test.health.healthLevel === 'good' ? 'attention' :
                                          test.health.healthLevel === 'fair' ? 'warning' : 'critical'}>
                              {test.health.healthLevel.charAt(0).toUpperCase() + test.health.healthLevel.slice(1)}
                            </Badge>
                          </div>
                        </div>

                        <div style={{ 
                          height: '1px', 
                          background: 'var(--border-primary)', 
                          margin: 'var(--spacing-md) 0' 
                        }} />

                        <InlineStack gap="500" align="start" wrap={false}>
                          {test.health.totalVisitors !== undefined && (
                            <div className="test-detail-health-metric">
                              <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                                Total Visitors
                              </Text>
                              <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                                {test.health.totalVisitors.toLocaleString()}
                              </Text>
                            </div>
                          )}

                          {test.health.daysRunning !== undefined && test.health.daysRunning > 0 && (
                            <div className="test-detail-health-metric">
                              <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                                Days Running
                              </Text>
                              <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                                {test.health.daysRunning}
                              </Text>
                            </div>
                          )}
                        </InlineStack>

                        {test.health.issues && test.health.issues.length > 0 && (
                          <div className="test-detail-health-section">
                            <Text variant="headingSm" as="h4" tone="critical" fontWeight="semibold">
                              Issues
                            </Text>
                            <BlockStack gap="200" style={{ marginTop: 'var(--spacing-sm)' }}>
                              {test.health.issues.map((issue, index) => (
                                <div key={index} className="test-detail-issue-item">
                                  <Text as="p" variant="bodyMd" tone="critical">
                                    • {issue}
                                  </Text>
                                </div>
                              ))}
                            </BlockStack>
                          </div>
                        )}

                        {test.health.recommendations && test.health.recommendations.length > 0 && (
                          <div className="test-detail-health-section">
                            <Text variant="headingSm" as="h4" tone="info" fontWeight="semibold">
                              Recommendations
                            </Text>
                            <BlockStack gap="200" style={{ marginTop: 'var(--spacing-sm)' }}>
                              {test.health.recommendations.map((rec, index) => (
                                <div key={index} className="test-detail-recommendation-item">
                                  <Text as="p" variant="bodyMd">
                                    • {rec}
                                  </Text>
                                </div>
                              ))}
                            </BlockStack>
                          </div>
                        )}
                      </BlockStack>
                    </Card>
                  </div>
                )}
              </Layout.Section>
            </Layout>
          )}

          {selectedTab === 1 && (
            <Layout>
              <Layout.Section>
                <div className="test-detail-traffic-allocation-card">
                  <Card sectioned title="Traffic Allocation">
                    {test.variants && test.variants.length > 0 ? (
                      <BlockStack gap="400">
                        <TrafficAllocationSlider
                          variants={trafficAllocationVariants}
                          onChange={handleTrafficAllocationChange}
                        />
                        <div style={{ 
                          paddingTop: 'var(--spacing-md)',
                          borderTop: '1px solid var(--border-primary)'
                        }}>
                          <InlineStack gap="300" align="end">
                            <Button 
                              variant="primary" 
                              onClick={handleSaveTrafficAllocation}
                              loading={trafficAllocationLoading}
                            >
                              Save Traffic Allocation
                            </Button>
                          </InlineStack>
                        </div>
                      </BlockStack>
                    ) : (
                      <div style={{ 
                        padding: 'var(--spacing-xl)', 
                        textAlign: 'center',
                        color: 'var(--text-secondary)'
                      }}>
                        <Text as="p" variant="bodyMd" color="subdued">
                          No variants configured for this test.
                        </Text>
                      </div>
                    )}
                  </Card>
                </div>
              </Layout.Section>
            </Layout>
          )}

          {selectedTab === 2 && (
            <Layout>
              <Layout.Section>
                <div className="test-detail-variant-codes-card">
                  <Card sectioned>
                    {variantCodesData.length > 0 ? (
                      <BlockStack gap="500">
                        <InlineStack align="space-between" blockAlign="center">
                          <div>
                            <Text variant="headingLg" as="h2" fontWeight="bold">
                              Custom Code
                            </Text>
                            <Text variant="bodySm" color="subdued" as="p" style={{ marginTop: '0.25rem' }}>
                              Add custom CSS and JavaScript to customize each variant's appearance and behavior.
                            </Text>
                          </div>
                          <InlineStack gap="300" align="center">
                            {hasUnsavedChanges && (
                              <Text variant="bodySm" color="warning" as="p">
                                Unsaved changes
                              </Text>
                            )}
                            <Button 
                              variant="primary" 
                              onClick={handleSaveVariantCodes}
                              loading={variantCodesLoading}
                              size="large"
                              disabled={cssValidationErrors.length > 0 || jsValidationErrors.length > 0}
                            >
                              Save Code
                            </Button>
                          </InlineStack>
                        </InlineStack>

                        {/* Variant Selector */}
                        <div className="variant-selector-container">
                          <div className="variant-selector-wrapper">
                            <div className="variant-selector">
                              {variantCodesData.map((variant, index) => {
                                const COLORS = ['#008060', '#5C6AC4', '#F49342', '#47C1BF', '#B98900', '#E91E63'];
                                const color = COLORS[index % COLORS.length];
                                const isSelected = index === selectedVariantIndex;
                                
                                return (
                                  <button
                                    key={index}
                                    className={`variant-selector-button ${isSelected ? 'variant-selector-button--selected' : ''}`}
                                    onClick={() => setSelectedVariantIndex(index)}
                                    style={{
                                      '--variant-color': color
                                    }}
                                  >
                                    <div 
                                      className="variant-selector-color-indicator"
                                      style={{ backgroundColor: color }}
                                    />
                                    <Text variant="bodyMd" fontWeight={isSelected ? 'semibold' : 'medium'}>
                                      {variant.name}
                                    </Text>
                                    {isSelected && (
                                      <div className="variant-selector-check">
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                          <path d="M13.5 4L6 11.5L2.5 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {variantCodesData.length > 1 && (
                              <div className="variant-navigation-buttons">
                                <Button
                                  plain
                                  onClick={() => handleVariantNavigation('prev')}
                                  disabled={selectedVariantIndex === 0}
                                  aria-label="Previous variant"
                                >
                                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </Button>
                                <Text variant="bodySm" color="subdued" as="span">
                                  {selectedVariantIndex + 1} / {variantCodesData.length}
                                </Text>
                                <Button
                                  plain
                                  onClick={() => handleVariantNavigation('next')}
                                  disabled={selectedVariantIndex === variantCodesData.length - 1}
                                  aria-label="Next variant"
                                >
                                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </Button>
                              </div>
                            )}
                          </div>
                          {hasUnsavedChanges && (
                            <div className="unsaved-changes-indicator">
                              <Text variant="bodySm" color="warning" as="p">
                                ⚠️ You have unsaved changes
                              </Text>
                            </div>
                          )}
                        </div>

                        {/* Single Code Editor */}
                        {variantCodesData[selectedVariantIndex] && (() => {
                          const currentVariant = variantCodesData[selectedVariantIndex];
                          const COLORS = ['#008060', '#5C6AC4', '#F49342', '#47C1BF', '#B98900', '#E91E63'];
                          const color = COLORS[selectedVariantIndex % COLORS.length];
                          const cssLineCount = currentVariant.css ? currentVariant.css.split('\n').length : 0;
                          const cssCharCount = currentVariant.css ? currentVariant.css.length : 0;
                          const jsLineCount = currentVariant.js ? currentVariant.js.split('\n').length : 0;
                          const jsCharCount = currentVariant.js ? currentVariant.js.length : 0;
                          
                          return (
                            <div 
                              className="variant-code-editor-card"
                              style={{
                                '--variant-color': color
                              }}
                            >
                              <Card sectioned>
                                <BlockStack gap="500">
                                  <InlineStack align="space-between" blockAlign="center">
                                    <InlineStack gap="300" align="center">
                                      <div 
                                        className="variant-code-color-indicator"
                                        style={{ backgroundColor: color }}
                                      />
                                      <div>
                                        <Text variant="headingSm" as="h4" fontWeight="semibold">
                                          {currentVariant.name}
                                        </Text>
                                        <Text variant="bodySm" color="subdued" as="p" style={{ marginTop: '0.125rem' }}>
                                          CSS: {cssLineCount} {cssLineCount === 1 ? 'line' : 'lines'} • JS: {jsLineCount} {jsLineCount === 1 ? 'line' : 'lines'}
                                        </Text>
                                      </div>
                                    </InlineStack>
                                  </InlineStack>
                                  
                                  {/* Split Code Editors */}
                                  <div className="variant-code-split-container">
                                    {/* CSS Editor */}
                                    <div className="variant-code-split-panel css-panel">
                                      <div className="variant-code-section-header">
                                        <InlineStack gap="300" align="center" blockAlign="center">
                                          <div className="code-type-icon css-icon">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <path d="M4 2L5.5 19.5L12 22L18.5 19.5L20 2H4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                              <path d="M7 8H17M7 12H15M7 16H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                              <path d="M12 8L10 10L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                          </div>
                                          <Text variant="headingSm" as="h5" fontWeight="semibold">
                                            CSS
                                          </Text>
                                          <Text variant="bodySm" color="subdued" as="span">
                                            {cssLineCount} {cssLineCount === 1 ? 'line' : 'lines'} • {cssCharCount.toLocaleString()} {cssCharCount === 1 ? 'char' : 'chars'}
                                          </Text>
                                          {cssValidationErrors.length > 0 && (
                                            <Badge status="critical" tone="critical">
                                              {cssValidationErrors.length} {cssValidationErrors.length === 1 ? 'error' : 'errors'}
                                            </Badge>
                                          )}
                                          {cssValidationErrors.length === 0 && (currentVariant.css || '').trim() !== '' && (
                                            <Badge status="success">
                                              ✓ Valid
                                            </Badge>
                                          )}
                                        </InlineStack>
                                      </div>
                                      <div className="variant-code-editor-wrapper">
                                        <TextField
                                          label=""
                                          value={currentVariant.css || ''}
                                          onChange={(value) => handleVariantCodeChange('css', value)}
                                          multiline={25}
                                          autoComplete="off"
                                          placeholder="/* Enter your CSS code here */&#10;&#10;.my-class {&#10;  color: #333;&#10;  font-size: 16px;&#10;}"
                                          error={cssValidationErrors.length > 0 ? cssValidationErrors[0] : undefined}
                                        />
                                        {cssValidationErrors.length > 0 && (
                                          <div className="code-validation-errors">
                                            <BlockStack gap="200">
                                              {cssValidationErrors.map((error, idx) => (
                                                <div key={idx} className="validation-error-item">
                                                  <InlineStack gap="200" align="start">
                                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                                                      <path d="M8 5V8M8 11H8.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                                    </svg>
                                                    <Text variant="bodySm" color="critical" as="span">
                                                      {error}
                                                    </Text>
                                                  </InlineStack>
                                                </div>
                                              ))}
                                            </BlockStack>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Divider */}
                                    <div className="variant-code-split-divider">
                                      <div className="split-divider-line" />
                                      <div className="split-divider-handle">
                                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                          <path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                          <path d="M12.5 5L7.5 10L12.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      </div>
                                    </div>

                                    {/* JavaScript Editor */}
                                    <div className="variant-code-split-panel js-panel">
                                      <div className="variant-code-section-header">
                                        <InlineStack gap="300" align="center" blockAlign="center">
                                          <div className="code-type-icon js-icon">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                              <rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                              <path d="M8 8C8 8 9 7 10 7C11 7 12 8 12 9C12 10 11 11 10 11C9 11 8 12 8 13C8 14 9 15 10 15C11 15 12 14 12 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                              <path d="M16 8L16 14M16 11L18 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                            </svg>
                                          </div>
                                          <Text variant="headingSm" as="h5" fontWeight="semibold">
                                            JavaScript
                                          </Text>
                                          <Text variant="bodySm" color="subdued" as="span">
                                            {jsLineCount} {jsLineCount === 1 ? 'line' : 'lines'} • {jsCharCount.toLocaleString()} {jsCharCount === 1 ? 'char' : 'chars'}
                                          </Text>
                                          {jsValidationErrors.length > 0 && (
                                            <Badge status="critical" tone="critical">
                                              {jsValidationErrors.length} {jsValidationErrors.length === 1 ? 'error' : 'errors'}
                                            </Badge>
                                          )}
                                          {jsValidationErrors.length === 0 && (currentVariant.js || '').trim() !== '' && (
                                            <Badge status="success">
                                              ✓ Valid
                                            </Badge>
                                          )}
                                        </InlineStack>
                                      </div>
                                      <div className="variant-code-editor-wrapper">
                                        <TextField
                                          label=""
                                          value={currentVariant.js || ''}
                                          onChange={(value) => handleVariantCodeChange('js', value)}
                                          multiline={25}
                                          autoComplete="off"
                                          placeholder="// Enter your JavaScript code here&#10;&#10;console.log('Hello, World!');&#10;document.querySelector('.my-class').style.display = 'block';"
                                          error={jsValidationErrors.length > 0 ? jsValidationErrors[0] : undefined}
                                        />
                                        {jsValidationErrors.length > 0 && (
                                          <div className="code-validation-errors">
                                            <BlockStack gap="200">
                                              {jsValidationErrors.map((error, idx) => (
                                                <div key={idx} className="validation-error-item">
                                                  <InlineStack gap="200" align="start">
                                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                                                      <path d="M8 5V8M8 11H8.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                                    </svg>
                                                    <Text variant="bodySm" color="critical" as="span">
                                                      {error}
                                                    </Text>
                                                  </InlineStack>
                                                </div>
                                              ))}
                                            </BlockStack>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="variant-code-help-text">
                                    <Text variant="bodySm" color="subdued" as="p">
                                      💡 CSS and JavaScript will be automatically wrapped in &lt;style&gt; and &lt;script&gt; tags when saved
                                    </Text>
                                  </div>
                                </BlockStack>
                              </Card>
                            </div>
                          );
                        })()}
                      </BlockStack>
                    ) : (
                      <Card sectioned>
                        <div className="variant-codes-empty-state">
                          <Text variant="bodyMd" color="subdued" as="p" alignment="center">
                            No variants configured for this test.
                          </Text>
                          <Text variant="bodySm" color="subdued" as="p" alignment="center" style={{ marginTop: '0.5rem' }}>
                            Add variants in the Traffic Allocation tab to start editing codes.
                          </Text>
                        </div>
                      </Card>
                    )}
                  </Card>
                </div>
              </Layout.Section>
            </Layout>
          )}

          {selectedTab === 3 && (
            <Layout>
              <Layout.Section>
                <div className="test-detail-settings-card">
                  <Card sectioned title={isEditing ? "Edit Test Settings" : "Test Settings"}>
                    {isEditing ? (
                      <div className="test-detail-edit-form">
                        <BlockStack gap="500">
                          <TextField
                            label="Test Name"
                            value={editFormData.name}
                            onChange={(value) => handleFormFieldChange('name', value)}
                            autoComplete="off"
                          />

                          <Select
                            label="Test Type"
                            options={[
                              { label: 'Select test type', value: '' },
                              { label: 'A/B Test', value: 'ab' },
                              { label: 'Multivariate', value: 'multivariate' },
                              { label: 'Split Test', value: 'split' }
                            ]}
                            value={editFormData.type}
                            onChange={(value) => handleFormFieldChange('type', value)}
                          />

                          <Select
                            label="Target Type"
                            options={[
                              { label: 'Select target type', value: '' },
                              { label: 'Page', value: 'page' },
                              { label: 'Product', value: 'product' },
                              { label: 'Collection', value: 'collection' }
                            ]}
                            value={editFormData.target_type}
                            onChange={(value) => handleFormFieldChange('target_type', value)}
                          />

                          <TextField
                            label="Target ID"
                            value={editFormData.target_id}
                            onChange={(value) => handleFormFieldChange('target_id', value)}
                            autoComplete="off"
                            helpText="The ID of the target page, product, or collection"
                          />

                          <Select
                            label="Goal Type"
                            options={[
                              { label: 'Select goal type', value: '' },
                              { label: 'Conversion Rate', value: 'conversion_rate' },
                              { label: 'Revenue', value: 'revenue' },
                              { label: 'Click Through', value: 'click_through' },
                              { label: 'Engagement', value: 'engagement' }
                            ]}
                            value={editFormData.goal_type}
                            onChange={(value) => handleFormFieldChange('goal_type', value)}
                          />

                          <TextField
                            label="Goal Metric"
                            value={editFormData.goal_metric}
                            onChange={(value) => handleFormFieldChange('goal_metric', value)}
                            autoComplete="off"
                            helpText="The specific metric to track for this goal"
                          />

                          <div style={{ 
                            paddingTop: 'var(--spacing-md)',
                            borderTop: '1px solid var(--border-primary)'
                          }}>
                            <InlineStack gap="300" align="end">
                              <Button onClick={handleCancelEdit}>
                                Cancel
                              </Button>
                              <Button 
                                variant="primary" 
                                onClick={handleSaveEdit}
                                loading={saveLoading}
                              >
                                Save Changes
                              </Button>
                            </InlineStack>
                          </div>
                        </BlockStack>
                      </div>
                    ) : (
                      <div className="test-detail-settings-view">
                        <BlockStack gap="400">
                          <div className="test-detail-field">
                            <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                              Test Name
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                              {test.name}
                            </Text>
                          </div>

                          <div className="test-detail-field">
                            <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                              Test Type
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                              {test.type}
                            </Text>
                          </div>

                          <div className="test-detail-field">
                            <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                              Target
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                              {test.target_type}: {test.target_id}
                            </Text>
                          </div>

                          <div className="test-detail-field">
                            <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                              Goal
                            </Text>
                            <Text as="p" variant="bodyMd" fontWeight="semibold" style={{ marginTop: '0.25rem' }}>
                              {test.goal?.type || 'N/A'}: {test.goal?.metric || 'N/A'}
                            </Text>
                          </div>

                          <div style={{ 
                            height: '1px', 
                            background: 'var(--border-primary)', 
                            margin: 'var(--spacing-md) 0' 
                          }} />

                          <InlineStack gap="500" align="start" wrap={false}>
                            <div className="test-detail-field">
                              <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                                Created
                              </Text>
                              <Text as="p" variant="bodyMd" style={{ marginTop: '0.25rem' }}>
                                {new Date(test.created_at).toLocaleDateString('en-US', { 
                                  year: 'numeric', 
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </Text>
                            </div>

                            {test.updated_at && (
                              <div className="test-detail-field">
                                <Text variant="bodySm" as="p" color="subdued" fontWeight="medium">
                                  Last Updated
                                </Text>
                                <Text as="p" variant="bodyMd" style={{ marginTop: '0.25rem' }}>
                                  {new Date(test.updated_at).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'short', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </Text>
                              </div>
                            )}
                          </InlineStack>

                          <div style={{ marginTop: 'var(--spacing-lg)' }}>
                            <Button variant="primary" onClick={handleEdit}>
                              Edit Test
                            </Button>
                          </div>
                        </BlockStack>
                      </div>
                    )}
                  </Card>
                </div>
              </Layout.Section>
            </Layout>
          )}
        </CustomTabs>

      <Modal
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        title="Delete Test"
        primaryAction={{
          content: 'Delete',
          destructive: true,
          onAction: handleDelete,
          loading: actionLoading
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setDeleteModal(false)
          }
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to delete this test? This action cannot be undone.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
    </>
  );
}

export default TestDetail;

