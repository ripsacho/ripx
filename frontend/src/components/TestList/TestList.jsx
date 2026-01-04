/**
 * Test List Component
 * 
 * Full test list page with advanced filtering and search
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Page,
  Card,
  Button,
  Badge,
  EmptyState,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  Modal,
  TextField,
  Select
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import { apiGet, apiPost, apiDelete } from '../../services';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { TEST_STATUS_OPTIONS, TEST_TYPE_ICONS } from '../../constants';

function TestList() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTests, setSelectedTests] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState(['all']);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('created_desc');
  const [viewMode, setViewMode] = useState('list'); // 'grid' or 'list'
  const [actionLoading, setActionLoading] = useState({}); // Track loading state per test
  const navigate = useNavigate();

  const fetchTests = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await apiGet('/tests');
      const testData = response.data?.tests || response.data?.data?.tests || [];
      setTests(testData);
      
      setError(null);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('Error fetching tests:', err);
      }
      setError(err.response?.data?.error || 'Failed to load tests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

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

  const getTypeIcon = (type) => {
    return TEST_TYPE_ICONS[type] || TEST_TYPE_ICONS.default;
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
      <InlineStack gap="100" align="start">
        <Badge status={colorMap[health.healthLevel] || 'info'}>
          {health.score}/100
        </Badge>
      </InlineStack>
    );
  };

  // Bulk action handlers
  const handleBulkStart = useCallback(async () => {
    if (selectedTests.length === 0) return;
    
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedTests.map(testId =>
          apiPost(`/tests/${testId}/start`, {})
        )
      );
      
      setSelectedTests([]);
      fetchTests();
      setError(null);
    } catch (err) {
      setError('Failed to start some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, fetchTests]);

  const handleBulkStop = useCallback(async () => {
    if (selectedTests.length === 0) return;
    
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedTests.map(testId =>
          apiPost(`/tests/${testId}/stop`, {})
        )
      );
      
      setSelectedTests([]);
      fetchTests();
      setError(null);
    } catch (err) {
      setError('Failed to stop some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, fetchTests]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedTests.length === 0) return;
    
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedTests.map(testId =>
          apiDelete(`/tests/${testId}`)
        )
      );
      
      setSelectedTests([]);
      setDeleteModal(false);
      fetchTests();
      setError(null);
    } catch (err) {
      setError('Failed to delete some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, fetchTests]);

  const handleBulkClone = useCallback(async () => {
    if (selectedTests.length === 0) return;
    
    setBulkActionLoading(true);
    try {
      await Promise.all(
        selectedTests.map(testId =>
          apiPost(`/tests/${testId}/clone`, {})
        )
      );
      
      setSelectedTests([]);
      fetchTests();
      setError(null);
    } catch (err) {
      setError('Failed to clone some tests');
    } finally {
      setBulkActionLoading(false);
    }
  }, [selectedTests, fetchTests]);

  // Individual test action handlers
  const handleTestStart = useCallback(async (testId, e) => {
    e.stopPropagation();
    setActionLoading(prev => ({ ...prev, [testId]: true }));
    try {
      await apiPost(`/tests/${testId}/start`, {});
      await fetchTests();
      setError(null);
    } catch (err) {
      setError('Failed to start test');
    } finally {
      setActionLoading(prev => ({ ...prev, [testId]: false }));
    }
  }, [fetchTests]);

  const handleTestStop = useCallback(async (testId, e) => {
    e.stopPropagation();
    setActionLoading(prev => ({ ...prev, [testId]: true }));
    try {
      await apiPost(`/tests/${testId}/stop`, {});
      await fetchTests();
      setError(null);
    } catch (err) {
      setError('Failed to stop test');
    } finally {
      setActionLoading(prev => ({ ...prev, [testId]: false }));
    }
  }, [fetchTests]);

  const handleSelectionChange = useCallback((selected) => {
    setSelectedTests(selected);
  }, []);

  // Filter and sort tests
  const filteredAndSortedTests = useMemo(() => {
    let filtered = tests;

    // Filter by status
    if (!statusFilter.includes('all')) {
      filtered = filtered.filter(test => statusFilter.includes(test.status));
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(test => {
        const nameMatch = test.name?.toLowerCase().includes(query);
        const typeMatch = test.type?.toLowerCase().includes(query);
        const descriptionMatch = test.description?.toLowerCase().includes(query);
        const statusMatch = test.status?.toLowerCase().includes(query);
        
        return nameMatch || typeMatch || descriptionMatch || statusMatch;
      });
    }

    // Sort tests
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'created_asc':
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case 'created_desc':
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        case 'status_asc':
          return (a.status || '').localeCompare(b.status || '');
        case 'status_desc':
          return (b.status || '').localeCompare(a.status || '');
        case 'visitors_desc': {
          const aVisitors = a.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
          const bVisitors = b.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
          return bVisitors - aVisitors;
        }
        case 'revenue_desc': {
          const aRevenue = a.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
          const bRevenue = b.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
          return bRevenue - aRevenue;
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [tests, statusFilter, searchQuery, sortBy]);

  // Test Card Component
  const TestCard = ({ test, isSelected, onSelect }) => {
    const handleCardClick = (e) => {
      // Don't navigate if clicking checkbox, action buttons, or control buttons
      if (e.target.closest('.test-card-checkbox') || 
          e.target.closest('.test-card-actions') || 
          e.target.closest('.test-control-buttons')) {
        return;
      }
      navigate(`/tests/${test.id}`);
    };

    const isLoading = actionLoading[test.id] || false;

    // Calculate performance metrics
    const totalVisitors = test.variants?.reduce((sum, v) => sum + (v.visitors || 0), 0) || 0;
    const totalConversions = test.variants?.reduce((sum, v) => sum + (v.conversions || 0), 0) || 0;
    const totalRevenue = test.variants?.reduce((sum, v) => sum + (v.revenue || 0), 0) || 0;
    const conversionRate = totalVisitors > 0 ? (totalConversions / totalVisitors * 100) : 0;
    const variantCount = test.variants?.length || 0;

    return (
      <div 
        className={`test-list-card ${isSelected ? 'selected' : ''}`}
        data-status={test.status}
        onClick={handleCardClick}
      >
        <BlockStack gap="400">
          {/* Header with Checkbox */}
          <InlineStack align="space-between" blockAlign="start">
            <InlineStack gap="300" align="center">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelect(test.id, e.target.checked);
                }}
                className="test-card-checkbox"
                onClick={(e) => e.stopPropagation()}
              />
              <div style={{ 
                fontSize: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '10px',
                background: 'var(--bg-tertiary)',
                flexShrink: 0
              }}>
                {getTypeIcon(test.type)}
              </div>
              <BlockStack gap="100">
                <Text variant="bodyMd" fontWeight="semibold" as="span">
                  {test.name}
                </Text>
                <Text variant="bodySm" color="subdued" as="p">
                  {test.type} • {variantCount} variant{variantCount !== 1 ? 's' : ''} • Created {new Date(test.created_at).toLocaleDateString()}
                </Text>
              </BlockStack>
            </InlineStack>
            <InlineStack gap="200" blockAlign="start">
              {getStatusBadge(test.status)}
              {getHealthBadge(test.health)}
            </InlineStack>
          </InlineStack>

          {/* Test Control Actions Bar */}
          <div className="test-control-actions-bar" onClick={(e) => e.stopPropagation()}>
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="bodySm" color="subdued" as="span">
                Quick Actions
              </Text>
              <div className="test-control-buttons">
                {test.status === 'draft' && (
                  <button
                    type="button"
                    className="test-control-button test-control-play"
                    onClick={(e) => handleTestStart(test.id, e)}
                    disabled={isLoading}
                    title="Start Test"
                    aria-label="Start Test"
                  >
                    {isLoading ? (
                      <span className="test-control-spinner"></span>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 2L12 8L4 14V2Z" fill="currentColor"/>
                        </svg>
                        <span>Start</span>
                      </>
                    )}
                  </button>
                )}
                {test.status === 'running' && (
                  <>
                    <button
                      type="button"
                      className="test-control-button test-control-pause"
                      onClick={(e) => handleTestStop(test.id, e)}
                      disabled={isLoading}
                      title="Pause Test"
                      aria-label="Pause Test"
                    >
                      {isLoading ? (
                        <span className="test-control-spinner"></span>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="5" y="3" width="2.5" height="10" rx="1" fill="currentColor"/>
                            <rect x="8.5" y="3" width="2.5" height="10" rx="1" fill="currentColor"/>
                          </svg>
                          <span>Pause</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="test-control-button test-control-stop"
                      onClick={(e) => handleTestStop(test.id, e)}
                      disabled={isLoading}
                      title="Stop Test"
                      aria-label="Stop Test"
                    >
                      {isLoading ? (
                        <span className="test-control-spinner"></span>
                      ) : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/>
                          </svg>
                          <span>Stop</span>
                        </>
                      )}
                    </button>
                  </>
                )}
                {(test.status === 'stopped' || test.status === 'completed') && (
                  <button
                    type="button"
                    className="test-control-button test-control-play"
                    onClick={(e) => handleTestStart(test.id, e)}
                    disabled={isLoading}
                    title="Restart Test"
                    aria-label="Restart Test"
                  >
                    {isLoading ? (
                      <span className="test-control-spinner"></span>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M4 2L12 8L4 14V2Z" fill="currentColor"/>
                        </svg>
                        <span>Restart</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </InlineStack>
          </div>

          {/* Performance Metrics */}
          <div style={{
            padding: '1rem 1.25rem',
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-secondary)'
          }}>
            {totalVisitors > 0 ? (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '1.5rem',
                alignItems: 'start'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    👥 Visitors
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    {totalVisitors.toLocaleString()}
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    ✅ Conversions
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    {totalConversions.toLocaleString()}
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    📈 Rate
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span" tone={conversionRate > 5 ? 'success' : conversionRate > 2 ? 'base' : 'subdued'}>
                    {conversionRate.toFixed(2)}%
                  </Text>
                </div>
                {totalRevenue > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Text variant="bodySm" color="subdued" as="span">
                      💰 Revenue
                    </Text>
                    <Text variant="bodyLg" fontWeight="semibold" as="span" tone="success">
                      ${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                gap: '1.5rem',
                alignItems: 'start'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    👥 Visitors
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    0
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    ✅ Conversions
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span">
                    0
                  </Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <Text variant="bodySm" color="subdued" as="span">
                    📈 Rate
                  </Text>
                  <Text variant="bodyLg" fontWeight="semibold" as="span" color="subdued">
                    0.00%
                  </Text>
                </div>
                {test.status === 'running' && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    gridColumn: 'span 1'
                  }}>
                    <Text variant="bodySm" color="subdued" as="span">
                      ⏳ Waiting for traffic...
                    </Text>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="test-card-actions" onClick={(e) => e.stopPropagation()}>
            <InlineStack gap="200" align="end">
              <Button
                size="small"
                variant="secondary"
                onClick={() => navigate(`/tests/${test.id}/analytics`)}
              >
                View Analytics
              </Button>
              <Button
                size="small"
                onClick={() => navigate(`/tests/${test.id}`)}
              >
                View Details
              </Button>
            </InlineStack>
          </div>
        </BlockStack>
      </div>
    );
  };

  const handleCardSelect = useCallback((testId, checked) => {
    if (checked) {
      setSelectedTests(prev => [...prev, testId]);
    } else {
      setSelectedTests(prev => prev.filter(id => id !== testId));
    }
  }, []);

  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      setSelectedTests(filteredAndSortedTests.map(t => t.id));
    } else {
      setSelectedTests([]);
    }
  }, [filteredAndSortedTests]);

  const bulkActions = [
    {
      content: 'Start Tests',
      onAction: handleBulkStart,
      loading: bulkActionLoading
    },
    {
      content: 'Stop Tests',
      onAction: handleBulkStop,
      loading: bulkActionLoading
    },
    {
      content: 'Clone Tests',
      onAction: handleBulkClone,
      loading: bulkActionLoading
    },
    {
      content: 'Delete Tests',
      onAction: () => setDeleteModal(true),
      destructive: true,
      loading: bulkActionLoading
    }
  ];

  const statusOptions = TEST_STATUS_OPTIONS;

  const hasActiveFilters = searchQuery || (statusFilter.length > 0 && !statusFilter.includes('all'));

  const sortOptions = [
    { label: 'Newest First', value: 'created_desc' },
    { label: 'Oldest First', value: 'created_asc' },
    { label: 'Name (A-Z)', value: 'name_asc' },
    { label: 'Name (Z-A)', value: 'name_desc' },
    { label: 'Status (A-Z)', value: 'status_asc' },
    { label: 'Most Visitors', value: 'visitors_desc' },
    { label: 'Most Revenue', value: 'revenue_desc' }
  ];

  const filterControl = (
    <div className="advanced-filter-bar">
      <BlockStack gap="400">
        {/* Top Row: Search and View Toggle */}
        <InlineStack align="space-between" blockAlign="center" wrap>
          <div style={{ flex: '1', minWidth: '300px', maxWidth: '500px' }}>
            <TextField
              label=""
              labelHidden
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="🔍 Search tests by name, type, or description..."
              clearButton
              onClearButtonClick={() => setSearchQuery('')}
              autoComplete="off"
            />
          </div>
          <InlineStack gap="300" align="end" blockAlign="center">
            <div style={{ minWidth: '180px' }}>
              <Select
                label=""
                labelHidden
                options={sortOptions}
                value={sortBy}
                onChange={setSortBy}
              />
            </div>
            <div className="view-toggle-group">
              <button
                type="button"
                className={`view-toggle-button ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List View"
                aria-label="List View"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="2" width="14" height="2" rx="1" fill="currentColor"/>
                  <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor"/>
                  <rect x="1" y="12" width="14" height="2" rx="1" fill="currentColor"/>
                </svg>
                <span>List</span>
              </button>
              <button
                type="button"
                className={`view-toggle-button ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
                aria-label="Grid View"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                </svg>
                <span>Grid</span>
              </button>
            </div>
          </InlineStack>
        </InlineStack>

        {/* Bottom Row: Status Filters */}
        <InlineStack gap="200" align="start" blockAlign="center" wrap>
          <Text variant="bodySm" fontWeight="medium" as="span">
            Filter by status:
          </Text>
          <div className="filter-status-buttons">
            <InlineStack gap="100" align="start" blockAlign="center">
              {statusOptions.map((option) => {
                const isSelected = statusFilter.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      if (option.value === 'all') {
                        setStatusFilter(['all']);
                      } else {
                        const newFilter = statusFilter.includes('all')
                          ? [option.value]
                          : isSelected
                          ? statusFilter.filter(f => f !== option.value)
                          : [...statusFilter.filter(f => f !== 'all'), option.value];
                        setStatusFilter(newFilter.length > 0 ? newFilter : ['all']);
                      }
                    }}
                    className={`status-filter-button ${isSelected ? 'active' : ''}`}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </InlineStack>
          </div>
          {hasActiveFilters && (
            <Button
              plain
              onClick={() => {
                setStatusFilter(['all']);
                setSearchQuery('');
              }}
              size="small"
            >
              Clear all filters
            </Button>
          )}
        </InlineStack>
      </BlockStack>
    </div>
  );

  return (
    <>
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />

      <Page
        title="All Tests"
        primaryAction={{
          content: 'Create Test',
          onAction: () => navigate('/tests/new')
        }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                {/* Header Section */}
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="100">
                    <Text variant="headingLg" as="h1">
                      All Tests
                    </Text>
                    <Text variant="bodySm" color="subdued" as="p">
                      {filteredAndSortedTests.length} of {tests.length} {tests.length === 1 ? 'test' : 'tests'}
                      {hasActiveFilters && ' (filtered)'}
                    </Text>
                  </BlockStack>
                  {selectedTests.length > 0 && (
                    <InlineStack gap="200">
                      <Text variant="bodySm" color="subdued" as="span">
                        {selectedTests.length} selected
                      </Text>
                      <Button
                        size="small"
                        onClick={handleBulkStart}
                        loading={bulkActionLoading}
                      >
                        Start
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={handleBulkStop}
                        loading={bulkActionLoading}
                      >
                        Stop
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        onClick={handleBulkClone}
                        loading={bulkActionLoading}
                      >
                        Clone
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        tone="critical"
                        onClick={() => setDeleteModal(true)}
                        loading={bulkActionLoading}
                      >
                        Delete
                      </Button>
                    </InlineStack>
                  )}
                </InlineStack>

                {loading ? (
                  <LoadingSkeleton type="table" count={5} />
                ) : tests.length === 0 ? (
                  <EmptyState
                    heading="Create your first AB test"
                    action={{
                      content: 'Create Test',
                      onAction: () => navigate('/tests/new')
                    }}
                    image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                  >
                    <p>Start optimizing your store by creating an AB test. Test prices, content, shipping, and more to maximize conversions.</p>
                  </EmptyState>
                ) : (
                  <>
                    {filterControl}
                    
                    {/* Select All Checkbox */}
                    {filteredAndSortedTests.length > 0 && (
                      <InlineStack gap="200" align="start" blockAlign="center">
                        <input
                          type="checkbox"
                          checked={selectedTests.length === filteredAndSortedTests.length && filteredAndSortedTests.length > 0}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        <Text variant="bodySm" color="subdued" as="span">
                          Select all {filteredAndSortedTests.length} {filteredAndSortedTests.length === 1 ? 'test' : 'tests'}
                        </Text>
                      </InlineStack>
                    )}

                    {/* Grid or List View */}
                    {filteredAndSortedTests.length === 0 ? (
                      <EmptyState
                        heading="No tests found"
                        action={{
                          content: 'Create Test',
                          onAction: () => navigate('/tests/new')
                        }}
                      >
                        <p>Try adjusting your filters or create a new test.</p>
                      </EmptyState>
                    ) : viewMode === 'grid' ? (
                      <div className="test-list-grid">
                        {filteredAndSortedTests.map((test) => (
                          <TestCard
                            key={test.id}
                            test={test}
                            isSelected={selectedTests.includes(test.id)}
                            onSelect={handleCardSelect}
                          />
                        ))}
                      </div>
                    ) : (
                      <BlockStack gap="400">
                        {filteredAndSortedTests.map((test) => (
                          <TestCard
                            key={test.id}
                            test={test}
                            isSelected={selectedTests.includes(test.id)}
                            onSelect={handleCardSelect}
                          />
                        ))}
                      </BlockStack>
                    )}
                  </>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Modal
          open={deleteModal}
          onClose={() => setDeleteModal(false)}
          title="Delete Tests"
          primaryAction={{
            content: 'Delete',
            destructive: true,
            onAction: handleBulkDelete,
            loading: bulkActionLoading
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
              Are you sure you want to delete {selectedTests.length} test{selectedTests.length !== 1 ? 's' : ''}? 
              This action cannot be undone.
            </Text>
          </Modal.Section>
        </Modal>
      </Page>
    </>
  );
}

export default TestList;

