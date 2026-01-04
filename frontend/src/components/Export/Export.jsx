/**
 * Export Component
 * 
 * Export test results to CSV, JSON, etc.
 */

import React, { useState } from 'react';
import {
  Card,
  Button,
  Select,
  BlockStack,
} from '@shopify/polaris';
import Toast from '../Toast/Toast';
import { apiGet } from '../../services';

function Export({ testId }) {
  const [format, setFormat] = useState('csv');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      setError(null);
      
      const response = await apiGet(`/analytics/tests/${testId}/export`, {
        format: format
      }, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `test_${testId}_${new Date().toISOString().split('T')[0]}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
    } catch (err) {
      // Log error details for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error('Export error:', err);
      }
      setError(err.response?.data?.error || 'Failed to export data');
    } finally {
      setExporting(false);
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

      <Card sectioned title="Export Results">
        <BlockStack gap="200">
        <Select
          label="Export Format"
          options={[
            { label: 'CSV', value: 'csv' },
            { label: 'JSON', value: 'json' }
          ]}
          value={format}
          onChange={setFormat}
        />
        
        <Button
          primary
          onClick={handleExport}
          loading={exporting}
        >
          Export {format.toUpperCase()}
        </Button>
      </BlockStack>
    </Card>
    </>
  );
}

export default Export;

