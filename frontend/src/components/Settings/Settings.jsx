/**
 * Settings Component
 * 
 * App settings and configuration
 */

import React, { useState } from 'react';
import Toast from '../Toast/Toast';
import {
  Page,
  Card,
  Layout,
  FormLayout,
  TextField,
  Button,
  InlineStack
} from '@shopify/polaris';

function Settings() {
  const [settings, setSettings] = useState({
    minSampleSize: 100,
    confidenceLevel: 0.95,
    autoStopEnabled: true
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    
    // In production, save to backend
    setTimeout(() => {
      setSaving(false);
      setMessage('Settings saved successfully');
    }, 1000);
  };

  return (
    <>
      <Toast
        message={message}
        type="success"
        onClose={() => setMessage(null)}
        duration={3000}
      />

      <Page title="Settings">
        <Layout>
          <Layout.Section>

          <Card sectioned title="Test Configuration">
            <FormLayout>
              <TextField
                label="Minimum Sample Size"
                type="number"
                value={settings.minSampleSize.toString()}
                onChange={(value) => setSettings({ ...settings, minSampleSize: parseInt(value) })}
                helpText="Minimum number of visitors before showing results"
              />

              <TextField
                label="Confidence Level"
                type="number"
                value={settings.confidenceLevel.toString()}
                onChange={(value) => setSettings({ ...settings, confidenceLevel: parseFloat(value) })}
                helpText="Statistical confidence level (0.95 = 95%)"
                min={0}
                max={1}
                step={0.01}
              />

              <InlineStack align="end">
                <Button primary onClick={handleSave} loading={saving}>
                  Save Settings
                </Button>
              </InlineStack>
            </FormLayout>
          </Card>

          <Card sectioned title="About">
            <p>
              <strong>AB Testing Tool</strong>
            </p>
            <p>
              Version 1.0.0
            </p>
            <p>
              A comprehensive AB testing platform for Shopify stores.
            </p>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
    </>
  );
}

export default Settings;

