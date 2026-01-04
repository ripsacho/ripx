/**
 * Promo Links Component
 * 
 * Manage promo links for offer testing
 */

import React, { useState, useEffect } from 'react';
import {
  Page,
  Card,
  Layout,
  Button,
  TextField,
  Select,
  DataTable,
  BlockStack,
  Modal,
  Text
} from '@shopify/polaris';
import { useParams } from 'react-router-dom';
import { setupDataTableButtonStyling } from '../../utils/dataTableStyles';
import Toast from '../Toast/Toast';
import { apiGet, apiPost, apiDelete } from '../../services';

function PromoLinks() {
  const { id: testId } = useParams();
  const [promoLinks, setPromoLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    variant_id: '',
    discount_type: 'percentage',
    discount_value: '',
    target_type: 'cart',
    target_id: '',
    expires_at: '',
    max_uses: ''
  });

  useEffect(() => {
    fetchPromoLinks();
  }, [testId]);

  // Force dark theme styles for DataTable buttons
  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [promoLinks]);

  const fetchPromoLinks = async () => {
    try {
      setLoading(true);
      
      const response = await apiGet(`/promo-links/test/${testId}`);
      const promoLinksData = response.data?.promoLinks || response.data?.data?.promoLinks || [];
      
      setPromoLinks(promoLinksData);
      setError(null);
    } catch (err) {
      // Log error details for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error('Error fetching promo links:', err);
      }
      setError(err.response?.data?.error || 'Failed to load promo links');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      setLoading(true);
      
      await apiPost('/promo-links', {
        test_id: testId,
        ...formData,
        expires_at: formData.expires_at || null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null
      });
      
      setCreateModal(false);
      setFormData({
        name: '',
        variant_id: '',
        discount_type: 'percentage',
        discount_value: '',
        target_type: 'cart',
        target_id: '',
        expires_at: '',
        max_uses: ''
      });
      fetchPromoLinks();
    } catch (err) {
      setError('Failed to create promo link');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
  };

  const rows = promoLinks.map(link => [
    link.name || 'Untitled',
    link.discount_type === 'percentage' 
      ? `${link.discount_value}%` 
      : `$${link.discount_value}`,
    link.uses_count || 0,
    link.max_uses ? `${link.uses_count}/${link.max_uses}` : 'Unlimited',
    <Button
      plain
      onClick={() => copyToClipboard(link.url)}
    >
      Copy Link
    </Button>
  ]);

  return (
    <>
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />

      <Page
        title="Promo Links"
        primaryAction={{
          content: 'Create Promo Link',
          onAction: () => setCreateModal(true)
        }}
      >
        <Layout>
          <Layout.Section>

          <Card>
            {loading ? (
              <div className="loading-container">
                Loading...
              </div>
            ) : promoLinks.length === 0 ? (
              <div className="empty-state-container">
                <Text as="p">No promo links created yet.</Text>
                <Button onClick={() => setCreateModal(true)}>
                  Create Your First Promo Link
                </Button>
              </div>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'numeric', 'text', 'text']}
                headings={['Name', 'Discount', 'Uses', 'Limit', 'Actions']}
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Create Promo Link"
        primaryAction={{
          content: 'Create',
          onAction: handleCreate,
          loading: loading
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setCreateModal(false)
          }
        ]}
      >
        <Modal.Section>
          <BlockStack gap="200">
            <TextField
              label="Link Name"
              value={formData.name}
              onChange={(value) => setFormData({ ...formData, name: value })}
            />
            <TextField
              label="Variant ID"
              value={formData.variant_id}
              onChange={(value) => setFormData({ ...formData, variant_id: value })}
              helpText="The variant ID this link applies to"
            />
            <Select
              label="Discount Type"
              options={[
                { label: 'Percentage', value: 'percentage' },
                { label: 'Fixed Amount', value: 'fixed' }
              ]}
              value={formData.discount_type}
              onChange={(value) => setFormData({ ...formData, discount_type: value })}
            />
            <TextField
              label="Discount Value"
              type="number"
              value={formData.discount_value}
              onChange={(value) => setFormData({ ...formData, discount_value: value })}
              helpText={formData.discount_type === 'percentage' ? 'Percentage (e.g., 10 for 10%)' : 'Fixed amount (e.g., 5.00 for $5)'}
            />
            <TextField
              label="Max Uses (optional)"
              type="number"
              value={formData.max_uses}
              onChange={(value) => setFormData({ ...formData, max_uses: value })}
              helpText="Leave empty for unlimited uses"
            />
            <TextField
              label="Expires At (optional)"
              type="datetime-local"
              value={formData.expires_at}
              onChange={(value) => setFormData({ ...formData, expires_at: value })}
            />
          </BlockStack>
        </Modal.Section>
        </Modal>
    </Page>
    </>
  );
}

export default PromoLinks;

