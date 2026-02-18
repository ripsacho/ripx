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
  Text,
  EmptyState,
} from '@shopify/polaris';
import { LinkIcon } from '@shopify/polaris-icons';
import { useParams, useNavigate } from 'react-router-dom';
import { setupDataTableButtonStyling } from '../../utils/dataTableStyles';
import { PageShell } from '../Shared';
import LoadingSkeleton from '../LoadingSkeleton/LoadingSkeleton';
import Toast from '../Toast/Toast';
import { apiGet, apiPost } from '../../services';
import styles from './PromoLinks.module.css';

function PromoLinks() {
  const { id: testId } = useParams();
  const navigate = useNavigate();
  const [promoLinks, setPromoLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [success, setSuccess] = useState(null);
  const [copyToast, setCopyToast] = useState(null);
  const [copyToastType, setCopyToastType] = useState('success');
  const [formData, setFormData] = useState({
    name: '',
    variant_id: '',
    discount_type: 'percentage',
    discount_value: '',
    target_type: 'cart',
    target_id: '',
    expires_at: '',
    max_uses: '',
  });

  useEffect(() => {
    if (!testId || testId === 'undefined') {
      navigate('/tests');
      return;
    }
    fetchPromoLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch when testId changes
  }, [testId, navigate]);

  // Force dark theme styles for DataTable buttons
  useEffect(() => {
    return setupDataTableButtonStyling();
  }, [promoLinks]);

  const fetchPromoLinks = async () => {
    if (!testId || testId === 'undefined') return;
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
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null,
      });

      setCreateModal(false);
      setSuccess('Promo link created successfully');
      setError(null);
      setFormData({
        name: '',
        variant_id: '',
        discount_type: 'percentage',
        discount_value: '',
        target_type: 'cart',
        target_id: '',
        expires_at: '',
        max_uses: '',
      });
      fetchPromoLinks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create promo link');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (url) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopyToast('Link copied to clipboard');
      setCopyToastType('success');
    } catch {
      setCopyToast('Could not copy link. Please copy manually.');
      setCopyToastType('error');
    }
  };

  if (!testId || testId === 'undefined') {
    return null;
  }

  const rows = promoLinks.map(link => [
    link.name || 'Untitled',
    link.discount_type === 'percentage' ? `${link.discount_value}%` : `$${link.discount_value}`,
    link.uses_count || 0,
    link.max_uses ? `${link.uses_count}/${link.max_uses}` : 'Unlimited',
    <Button key={link.id} plain onClick={() => copyToClipboard(link.url)}>
      Copy Link
    </Button>,
  ]);

  return (
    <PageShell
      message={error || success}
      messageType={error ? 'error' : 'success'}
      onCloseMessage={() => {
        setError(null);
        setSuccess(null);
      }}
      messageDuration={error ? 5000 : 3000}
    >
      {copyToast && (
        <Toast
          message={copyToast}
          type={copyToastType}
          onClose={() => {
            setCopyToast(null);
            setCopyToastType('success');
          }}
          duration={copyToastType === 'error' ? 4000 : 2000}
        />
      )}
      <Page
        title="Promo Links"
        subtitle="Manage promo links for offer testing"
        breadcrumbs={[
          { content: 'All Tests', onAction: () => navigate('/tests') },
          { content: 'Test Details', onAction: () => navigate(`/tests/${testId}`) },
          { content: 'Promo Links' },
        ]}
        primaryAction={{
          content: 'Create Promo Link',
          onAction: () => setCreateModal(true),
        }}
      >
        <div className={styles.promoHero}>
          <div className={styles.promoHeroInner}>
            <div className={styles.promoHeroIcon}>
              <LinkIcon />
            </div>
            <div>
              <Text variant="headingLg" as="h2" fontWeight="bold">
                Promo links for offer testing
              </Text>
              <Text variant="bodyMd" tone="subdued" as="p">
                Create unique discount links per variant, share with customers, and track conversions.
              </Text>
            </div>
          </div>
        </div>
        <Layout>
          <Layout.Section>
            <Card>
              {loading ? (
                <div style={{ padding: '1.5rem' }}>
                  <LoadingSkeleton type="table" count={1} />
                </div>
              ) : promoLinks.length === 0 ? (
                <EmptyState
                  heading="No promo links yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: 'Create Promo Link',
                    onAction: () => setCreateModal(true),
                  }}
                >
                  <p>Create unique discount links for each variant to share with customers and track conversions.</p>
                </EmptyState>
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
            loading: loading,
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setCreateModal(false),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="200">
              <TextField
                label="Link Name"
                value={formData.name}
                onChange={value => setFormData({ ...formData, name: value })}
              />
              <TextField
                label="Variant ID"
                value={formData.variant_id}
                onChange={value => setFormData({ ...formData, variant_id: value })}
                helpText="The variant ID this link applies to"
              />
              <Select
                label="Discount Type"
                options={[
                  { label: 'Percentage', value: 'percentage' },
                  { label: 'Fixed Amount', value: 'fixed' },
                ]}
                value={formData.discount_type}
                onChange={value => setFormData({ ...formData, discount_type: value })}
              />
              <TextField
                label="Discount Value"
                type="number"
                value={formData.discount_value}
                onChange={value => setFormData({ ...formData, discount_value: value })}
                helpText={
                  formData.discount_type === 'percentage'
                    ? 'Percentage (e.g., 10 for 10%)'
                    : 'Fixed amount (e.g., 5.00 for $5)'
                }
              />
              <TextField
                label="Max Uses (optional)"
                type="number"
                value={formData.max_uses}
                onChange={value => setFormData({ ...formData, max_uses: value })}
                helpText="Leave empty for unlimited uses"
              />
              <TextField
                label="Expires At (optional)"
                type="datetime-local"
                value={formData.expires_at}
                onChange={value => setFormData({ ...formData, expires_at: value })}
              />
            </BlockStack>
          </Modal.Section>
        </Modal>
      </Page>
    </PageShell>
  );
}

export default PromoLinks;
