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
  ResourceList,
  Modal,
  TextField
} from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import { apiGet, apiPost, apiDelete } from '../../services';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { TEST_STATUS_OPTIONS } from '../../constants';

function TestList() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTests, setSelectedTests] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState(['all']);
  const [searchQuery, setSearchQuery] = useState('');
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
    const icons = {
      price: '💰',
      content: '📝',
      shipping: '🚚',
      offer: '🎁',
      theme: '🎨'
    };
    return icons[type] || '🧪';
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

  const handleSelectionChange = useCallback((selected) => {
    setSelectedTests(selected);
  }, []);

  // Filter tests by status and search query
  const filteredTests = useMemo(() => {
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

    return filtered;
  }, [tests, statusFilter, searchQuery]);

  // ResourceList items
  const resourceItems = useMemo(() => {
    return filteredTests.map(test => ({
      id: test.id,
      name: test.name,
      type: test.type,
      status: test.status,
      health: test.health,
      created_at: test.created_at
    }));
  }, [filteredTests]);

  const renderItem = useCallback((item) => {
    const test = tests.find(t => t.id === item.id);
    if (!test || !item.id) return null;

    const handleItemClick = () => {
      if (item.id) {
        navigate(`/tests/${item.id}`);
      }
    };

    return (
      <ResourceList.Item
        id={item.id}
        onClick={handleItemClick}
        media={
          <div style={{ fontSize: '1.5rem', width: '40px', textAlign: 'center' }}>
            {getTypeIcon(item.type)}
          </div>
        }
      >
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="bodyMd" fontWeight="semibold" as="span">
              {item.name}
            </Text>
            <InlineStack gap="200">
              {getStatusBadge(item.status)}
              {getHealthBadge(item.health)}
            </InlineStack>
          </InlineStack>
          <InlineStack gap="400" blockAlign="center">
            <Badge>{item.type}</Badge>
            <Text variant="bodySm" color="subdued" as="span">
              Created {new Date(item.created_at).toLocaleDateString()}
            </Text>
          </InlineStack>
        </BlockStack>
      </ResourceList.Item>
    );
  }, [tests, navigate]);

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

  const filterControl = (
    <div className="custom-filter-bar">
      <InlineStack gap="300" align="start" blockAlign="center" wrap={false}>
        {/* Search Input */}
        <div className="filter-search-wrapper">
          <TextField
            label=""
            labelHidden
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="🔍 Search tests..."
            clearButton
            onClearButtonClick={() => setSearchQuery('')}
            autoComplete="off"
          />
        </div>

        {/* Status Filter Buttons */}
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

        {/* Clear All Button */}
        {hasActiveFilters && (
          <Button
            plain
            onClick={() => {
              setStatusFilter(['all']);
              setSearchQuery('');
            }}
            size="small"
          >
            Clear all
          </Button>
        )}
      </InlineStack>
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
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text variant="headingMd" as="h2">
                      All Tests
                    </Text>
                    {searchQuery && (
                      <Text variant="bodySm" color="subdued" as="p">
                        {filteredTests.length} {filteredTests.length === 1 ? 'test' : 'tests'} found
                        {searchQuery && ` for "${searchQuery}"`}
                      </Text>
                    )}
                  </BlockStack>
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
                    <ResourceList
                      resourceName={{ singular: 'test', plural: 'tests' }}
                      items={resourceItems}
                      renderItem={renderItem}
                      selectedItems={selectedTests}
                      onSelectionChange={handleSelectionChange}
                      bulkActions={bulkActions}
                      emptyState={
                        <EmptyState
                          heading="No tests found"
                          action={{
                            content: 'Create Test',
                            onAction: () => navigate('/tests/new')
                          }}
                        >
                          <p>Try adjusting your filters or create a new test.</p>
                        </EmptyState>
                      }
                    />
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

