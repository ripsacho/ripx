/**
 * Profile Component
 * 
 * User profile and account management page (VWO-style)
 */

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Page,
  Card,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Divider,
  Avatar,
  Select,
  Checkbox
} from '@shopify/polaris';
import Toast from '../Toast/Toast';
import { getProfile, updateProfile, updateAccount, updatePreferences } from '../../services/profileApi';
import { applyTheme, updateTheme } from '../../utils/theme';

function Profile() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'profile';
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Profile Data - Initialize with defaults
  const [profileData, setProfileData] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1 (555) 123-4567',
    jobTitle: 'Marketing Manager',
    company: 'Acme Inc.',
    bio: 'Experienced marketing professional with a passion for data-driven decision making.',
    timezone: 'America/New_York',
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h'
  });

  // Account Settings
  const [accountData, setAccountData] = useState({
    shopDomain: 'demo.myshopify.com',
    plan: 'Professional',
    billingEmail: 'billing@example.com',
    apiKey: 'vl_********************',
    twoFactorEnabled: false,
    emailNotifications: true,
    pushNotifications: true,
    weeklyReports: true
  });

  // Preferences
  const [preferences, setPreferences] = useState({
    theme: 'light',
    customThemeStart: 7, // Hour for light theme start (0-23)
    customThemeEnd: 19, // Hour for dark theme start (0-23)
    dashboardView: 'grid',
    defaultTestType: 'price',
    autoSave: true,
    showTooltips: true,
    compactMode: false
  });

  // Load data from API (with localStorage fallback)
  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const userData = await getProfile();
        
        if (userData.profile) {
          setProfileData(prev => ({ ...prev, ...userData.profile }));
        }
        if (userData.account) {
          setAccountData(prev => ({ ...prev, ...userData.account }));
        }
        if (userData.preferences) {
          setPreferences(prev => ({ ...prev, ...userData.preferences }));
        }
      } catch (err) {
        console.error('Error loading profile data:', err);
        // Fallback to localStorage if API fails
        try {
          const savedProfile = localStorage.getItem('ripx_profile');
          const savedAccount = localStorage.getItem('ripx_account');
          const savedPreferences = localStorage.getItem('ripx_preferences');

          if (savedProfile) {
            const parsed = JSON.parse(savedProfile);
            setProfileData(prev => ({ ...prev, ...parsed }));
          }
          if (savedAccount) {
            const parsed = JSON.parse(savedAccount);
            setAccountData(prev => ({ ...prev, ...parsed }));
          }
          if (savedPreferences) {
            const parsed = JSON.parse(savedPreferences);
            setPreferences(prev => ({ ...prev, ...parsed }));
          }
        } catch (localErr) {
          console.error('Error loading from localStorage:', localErr);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, []);

  const handleProfileUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      // Save to API (with localStorage fallback)
      await updateProfile(profileData);
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to update profile. Please try again.');
      console.error('Profile update error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAccountUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      // Save to API (with localStorage fallback)
      await updateAccount(accountData);
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to update account settings. Please try again.');
      console.error('Account update error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePreferencesUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      // Save to API (with localStorage fallback)
      await updatePreferences(preferences);
      
      // Apply theme preference immediately
      if (preferences.theme === 'custom' && preferences.customThemeStart !== undefined && preferences.customThemeEnd !== undefined) {
        updateTheme('custom', {
          start: preferences.customThemeStart,
          end: preferences.customThemeEnd
        });
      } else {
        updateTheme(preferences.theme);
      }
      
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to update preferences. Please try again.');
      console.error('Preferences update error:', err);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'account', label: 'Account', icon: '⚙️' },
    { id: 'preferences', label: 'Preferences', icon: '🎨' }
  ];

  if (loading) {
    return (
      <Page title="My Profile">
        <Card>
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Text variant="bodyMd" tone="subdued">Loading profile...</Text>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <>
      <Toast
        message={success ? 'Settings saved successfully!' : null}
        type="success"
        onClose={() => setSuccess(false)}
        duration={3000}
      />
      
      <Toast
        message={error}
        type="error"
        onClose={() => setError(null)}
        duration={5000}
      />

      <Page
        title="My Profile"
        subtitle="Manage your profile, account settings, and preferences"
      >
        <Layout>
        {/* Tab Navigation */}
        <Layout.Section>
          <Card>
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              borderBottom: '1px solid var(--border-primary)',
              paddingBottom: '1rem',
              marginBottom: '1.5rem'
            }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`profile-tab ${activeTab === tab.id ? 'profile-tab-active' : ''}`}
                  onClick={() => setSearchParams({ tab: tab.id })}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <BlockStack gap="500">
                <div className="profile-header">
                  <Avatar
                    name={`${profileData.firstName} ${profileData.lastName}`}
                    size="large"
                    initials={`${profileData.firstName[0]}${profileData.lastName[0]}`}
                  />
                  <div>
                    <Text variant="headingLg" as="h2" fontWeight="bold">
                      {profileData.firstName} {profileData.lastName}
                    </Text>
                    <Text variant="bodyMd" tone="subdued">
                      {profileData.jobTitle} at {profileData.company}
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      {profileData.email}
                    </Text>
                  </div>
                </div>

                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Personal Information
                  </Text>
                  
                  <div className="grid-2-col">
                    <TextField
                      label="First Name"
                      value={profileData.firstName}
                      onChange={(value) => setProfileData({ ...profileData, firstName: value })}
                      autoComplete="given-name"
                    />
                    <TextField
                      label="Last Name"
                      value={profileData.lastName}
                      onChange={(value) => setProfileData({ ...profileData, lastName: value })}
                      autoComplete="family-name"
                    />
                  </div>

                  <TextField
                    label="Email Address"
                    type="email"
                    value={profileData.email}
                    onChange={(value) => setProfileData({ ...profileData, email: value })}
                    autoComplete="email"
                  />

                  <TextField
                    label="Phone Number"
                    type="tel"
                    value={profileData.phone}
                    onChange={(value) => setProfileData({ ...profileData, phone: value })}
                    autoComplete="tel"
                  />

                  <TextField
                    label="Job Title"
                    value={profileData.jobTitle}
                    onChange={(value) => setProfileData({ ...profileData, jobTitle: value })}
                  />

                  <TextField
                    label="Company"
                    value={profileData.company}
                    onChange={(value) => setProfileData({ ...profileData, company: value })}
                  />

                  <TextField
                    label="Bio"
                    value={profileData.bio}
                    onChange={(value) => setProfileData({ ...profileData, bio: value })}
                    multiline={4}
                    helpText="Tell us a bit about yourself"
                  />
                </BlockStack>

                <Divider />

                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Regional Settings
                  </Text>

                  <Select
                    label="Timezone"
                    options={[
                      { label: 'Eastern Time (UTC-5)', value: 'America/New_York' },
                      { label: 'Central Time (UTC-6)', value: 'America/Chicago' },
                      { label: 'Mountain Time (UTC-7)', value: 'America/Denver' },
                      { label: 'Pacific Time (UTC-8)', value: 'America/Los_Angeles' }
                    ]}
                    value={profileData.timezone}
                    onChange={(value) => setProfileData({ ...profileData, timezone: value })}
                  />

                  <Select
                    label="Language"
                    options={[
                      { label: 'English', value: 'en' },
                      { label: 'Spanish', value: 'es' },
                      { label: 'French', value: 'fr' },
                      { label: 'German', value: 'de' }
                    ]}
                    value={profileData.language}
                    onChange={(value) => setProfileData({ ...profileData, language: value })}
                  />
                </BlockStack>

                <InlineStack align="end">
                  <Button
                    primary
                    loading={saving}
                    onClick={handleProfileUpdate}
                  >
                    Save Changes
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {/* Account Tab */}
            {activeTab === 'account' && (
              <BlockStack gap="500">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Account Information
                  </Text>

                  <TextField
                    label="Shop Domain"
                    value={accountData.shopDomain}
                    disabled
                    helpText="Your Shopify store domain"
                  />

                  <TextField
                    label="Plan"
                    value={accountData.plan}
                    disabled
                    helpText="Current subscription plan"
                  />

                  <TextField
                    label="Billing Email"
                    type="email"
                    value={accountData.billingEmail}
                    onChange={(value) => setAccountData({ ...accountData, billingEmail: value })}
                    helpText="Email address for billing and invoices"
                  />
                </BlockStack>

                <Divider />

                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    API Access
                  </Text>

                  <TextField
                    label="API Key"
                    value={accountData.apiKey}
                    disabled
                    helpText="Your API key for programmatic access"
                  />

                  <InlineStack gap="200">
                    <Button>Regenerate API Key</Button>
                    <Button>View API Documentation</Button>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Security
                  </Text>

                  <Checkbox
                    label="Enable Two-Factor Authentication"
                    checked={accountData.twoFactorEnabled}
                    onChange={(value) => setAccountData({ ...accountData, twoFactorEnabled: value })}
                    helpText="Add an extra layer of security to your account"
                  />
                </BlockStack>

                <Divider />

                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Notifications
                  </Text>

                  <Checkbox
                    label="Email Notifications"
                    checked={accountData.emailNotifications}
                    onChange={(value) => setAccountData({ ...accountData, emailNotifications: value })}
                    helpText="Receive email updates about your tests"
                  />

                  <Checkbox
                    label="Push Notifications"
                    checked={accountData.pushNotifications}
                    onChange={(value) => setAccountData({ ...accountData, pushNotifications: value })}
                    helpText="Receive browser push notifications"
                  />

                  <Checkbox
                    label="Weekly Reports"
                    checked={accountData.weeklyReports}
                    onChange={(value) => setAccountData({ ...accountData, weeklyReports: value })}
                    helpText="Get weekly summary reports via email"
                  />
                </BlockStack>

                <InlineStack align="end">
                  <Button
                    primary
                    loading={saving}
                    onClick={handleAccountUpdate}
                  >
                    Save Changes
                  </Button>
                </InlineStack>
              </BlockStack>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <BlockStack gap="500">
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Appearance
                  </Text>

                  <BlockStack gap="300">
                    <Select
                      label="Theme"
                      options={[
                        { label: 'Light', value: 'light' },
                        { label: 'Dark', value: 'dark' },
                        { label: 'Auto', value: 'auto' },
                        { label: 'Custom', value: 'custom' }
                      ]}
                      value={preferences.theme}
                      onChange={(value) => {
                        const newPrefs = { ...preferences, theme: value };
                        setPreferences(newPrefs);
                        if (value !== 'custom') {
                          updateTheme(value);
                        }
                      }}
                      helpText={
                        preferences.theme === 'auto' 
                          ? 'Automatically switches between light and dark based on time of day'
                          : preferences.theme === 'custom'
                          ? 'Set custom times for theme switching'
                          : undefined
                      }
                    />
                    
                    {preferences.theme === 'custom' && (
                      <BlockStack gap="300">
                        <div className="grid-2-col">
                          <Select
                            label="Light Theme Start"
                            options={Array.from({ length: 24 }, (_, i) => ({
                              label: `${i.toString().padStart(2, '0')}:00`,
                              value: i.toString()
                            }))}
                            value={preferences.customThemeStart?.toString() || '7'}
                            onChange={(value) => {
                              const newPrefs = { 
                                ...preferences, 
                                customThemeStart: parseInt(value, 10) 
                              };
                              setPreferences(newPrefs);
                            }}
                            helpText="Hour when light theme starts (24-hour format)"
                          />
                          <Select
                            label="Dark Theme Start"
                            options={Array.from({ length: 24 }, (_, i) => ({
                              label: `${i.toString().padStart(2, '0')}:00`,
                              value: i.toString()
                            }))}
                            value={preferences.customThemeEnd?.toString() || '19'}
                            onChange={(value) => {
                              const newPrefs = { 
                                ...preferences, 
                                customThemeEnd: parseInt(value, 10) 
                              };
                              setPreferences(newPrefs);
                            }}
                            helpText="Hour when dark theme starts (24-hour format)"
                          />
                        </div>
                        <Button
                          onClick={() => {
                            updateTheme('custom', {
                              start: preferences.customThemeStart || 7,
                              end: preferences.customThemeEnd || 19
                            });
                          }}
                        >
                          Apply Custom Theme
                        </Button>
                      </BlockStack>
                    )}
                  </BlockStack>
                </BlockStack>

                <Divider />

                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Dashboard
                  </Text>

                  <Select
                    label="Default View"
                    options={[
                      { label: 'Grid View', value: 'grid' },
                      { label: 'List View', value: 'list' },
                      { label: 'Compact View', value: 'compact' }
                    ]}
                    value={preferences.dashboardView}
                    onChange={(value) => setPreferences({ ...preferences, dashboardView: value })}
                  />

                  <Select
                    label="Default Test Type"
                    options={[
                      { label: 'Price Test', value: 'price' },
                      { label: 'Content Test', value: 'content' },
                      { label: 'Shipping Test', value: 'shipping' },
                      { label: 'Offer Test', value: 'offer' }
                    ]}
                    value={preferences.defaultTestType}
                    onChange={(value) => setPreferences({ ...preferences, defaultTestType: value })}
                  />
                </BlockStack>

                <Divider />

                <BlockStack gap="400">
                  <Text variant="headingMd" as="h3" fontWeight="semibold">
                    Editor Settings
                  </Text>

                  <Checkbox
                    label="Auto-save changes"
                    checked={preferences.autoSave}
                    onChange={(value) => setPreferences({ ...preferences, autoSave: value })}
                    helpText="Automatically save your work as you type"
                  />

                  <Checkbox
                    label="Show tooltips"
                    checked={preferences.showTooltips}
                    onChange={(value) => setPreferences({ ...preferences, showTooltips: value })}
                    helpText="Display helpful tooltips throughout the interface"
                  />

                  <Checkbox
                    label="Compact mode"
                    checked={preferences.compactMode}
                    onChange={(value) => setPreferences({ ...preferences, compactMode: value })}
                    helpText="Reduce spacing for a more compact interface"
                  />
                </BlockStack>

                <InlineStack align="end">
                  <Button
                    primary
                    loading={saving}
                    onClick={handlePreferencesUpdate}
                  >
                    Save Changes
                  </Button>
                </InlineStack>
              </BlockStack>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
    </>
  );
}

export default Profile;
