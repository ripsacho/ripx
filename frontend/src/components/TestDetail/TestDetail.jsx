/**
 * Test Detail Component
 * 
 * View and manage individual test details
 */

import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  Layout,
  Button,
  Badge,
  Text,
  BlockStack,
  InlineStack,
  Modal
} from '@shopify/polaris';
import { useParams, useNavigate } from 'react-router-dom';
import Toast from '../Toast/Toast';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import { apiGet, apiPost, apiDelete } from '../../services';

function TestDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);

  useEffect(() => {
    fetchTest();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <Page
        title={test.name}
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
        <Layout>
        <Layout.Section>
          <Card sectioned>
            <BlockStack gap="200">
              <InlineStack gap="400" align="start">
                <div>
                  <Text variant="headingMd" as="h2">Status</Text>
                  {getStatusBadge(test.status)}
                </div>
                {test.health && (
                  <div>
                    <Text variant="headingMd" as="h2">Health Score</Text>
                    {getHealthBadge(test.health)}
                  </div>
                )}
              </InlineStack>
              
              <div>
                <Text variant="headingMd" as="h3">Test Type</Text>
                <Text as="p">{test.type}</Text>
              </div>

              <div>
                <Text variant="headingMd" as="h3">Target</Text>
                <Text as="p">{test.target_type}: {test.target_id}</Text>
              </div>

              <div>
                <Text variant="headingMd" as="h3">Goal</Text>
                <Text as="p">{test.goal?.type || 'N/A'}: {test.goal?.metric || 'N/A'}</Text>
              </div>

              <div>
                <Text variant="headingMd" as="h3">Created</Text>
                <Text as="p">{new Date(test.created_at).toLocaleString()}</Text>
              </div>
            </BlockStack>
          </Card>

          {test.health && (
            <Card sectioned title="Test Health">
              <BlockStack gap="300">
                <div>
                  <Text variant="headingMd" as="h3">Score: {test.health.score}/100</Text>
                  <Text as="p" variant="bodySm" color="subdued">
                    {test.health.healthLevel.charAt(0).toUpperCase() + test.health.healthLevel.slice(1)} health
                  </Text>
                </div>

                {test.health.totalVisitors !== undefined && (
                  <div>
                    <Text variant="bodyMd" as="p">
                      <strong>Total Visitors:</strong> {test.health.totalVisitors.toLocaleString()}
                    </Text>
                  </div>
                )}

                {test.health.daysRunning !== undefined && test.health.daysRunning > 0 && (
                  <div>
                    <Text variant="bodyMd" as="p">
                      <strong>Days Running:</strong> {test.health.daysRunning}
                    </Text>
                  </div>
                )}

                {test.health.issues && test.health.issues.length > 0 && (
                  <div>
                    <Text variant="headingSm" as="h4" tone="critical">Issues:</Text>
                    <BlockStack gap="100">
                      {test.health.issues.map((issue, index) => (
                        <Text key={index} as="p" variant="bodyMd" tone="critical">
                          • {issue}
                        </Text>
                      ))}
                    </BlockStack>
                  </div>
                )}

                {test.health.recommendations && test.health.recommendations.length > 0 && (
                  <div>
                    <Text variant="headingSm" as="h4" tone="info">Recommendations:</Text>
                    <BlockStack gap="100">
                      {test.health.recommendations.map((rec, index) => (
                        <Text key={index} as="p" variant="bodyMd">
                          • {rec}
                        </Text>
                      ))}
                    </BlockStack>
                  </div>
                )}
              </BlockStack>
            </Card>
          )}

          <Card sectioned title="Variants">
            {test.variants && test.variants.map((variant, index) => (
              <div key={index} style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid var(--border-primary)', borderRadius: '4px' }}>
                <InlineStack>
                  <div>
                    <Text variant="headingSm" as="h4">{variant.name}</Text>
                    <Text as="p">Allocation: {variant.allocation}%</Text>
                    {variant.config && Object.keys(variant.config).length > 0 && (
                      <div style={{ marginTop: '0.5rem' }}>
                        <Text as="p" variant="bodyMd">
                          <strong>Configuration:</strong>
                        </Text>
                        <pre style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                          {JSON.stringify(variant.config, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </InlineStack>
              </div>
            ))}
          </Card>
        </Layout.Section>
      </Layout>

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

