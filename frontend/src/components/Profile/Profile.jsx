/**
 * Profile Component
 *
 * User profile and account management - premium UI matching Settings page
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Box,
  Avatar,
  Select,
  Checkbox,
  Icon,
} from '@shopify/polaris';
import {
  ProfileIcon,
  SettingsIcon,
  PaintBrushFlatIcon,
  PersonIcon,
  GlobeIcon,
} from '@shopify/polaris-icons';
import { PageShell } from '../Shared';
import { CONTENT_GAP, ROUTES } from '../../constants';
import styles from './Profile.module.css';
import {
  getProfile,
  updateProfile,
  updateAccount,
  updatePreferences,
} from '../../services/profileApi';
import { getSavedTheme, updateTheme } from '../../utils/theme';
import Toast from '../Toast/Toast';

const TAB_CONFIG = [
  { id: 'profile', label: 'Profile', icon: ProfileIcon },
  { id: 'account', label: 'Account', icon: SettingsIcon },
  { id: 'preferences', label: 'Preferences', icon: PaintBrushFlatIcon },
];

function Profile() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'profile';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

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
    timeFormat: '12h',
  });

  const [accountData, setAccountData] = useState({
    shopDomain: 'demo.myshopify.com',
    plan: 'Professional',
    billingEmail: 'billing@example.com',
    apiKey: 'vl_********************',
    twoFactorEnabled: false,
    emailNotifications: true,
    pushNotifications: true,
    weeklyReports: true,
    significanceAlerts: true,
    notificationFrequency: 'immediate',
  });

  const [preferences, setPreferences] = useState({
    theme: 'light',
    customThemeStart: 7,
    customThemeEnd: 19,
    dashboardView: 'grid',
    defaultTestType: 'price',
    defaultAnalyticsDateRange: '30',
    defaultExportFormat: 'csv',
    autoSave: true,
    showTooltips: true,
    compactMode: false,
  });

  const detectedTimezone = useCallback(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
    } catch {
      return 'America/New_York';
    }
  }, []);

  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const userData = await getProfile();

        if (userData.profile) {
          setProfileData(prev => {
            const merged = { ...prev, ...userData.profile };
            if (!merged.timezone || merged.timezone === 'America/New_York') {
              merged.timezone = detectedTimezone();
            }
            return merged;
          });
        } else {
          setProfileData(prev => ({ ...prev, timezone: detectedTimezone() }));
        }
        if (userData.account) {
          setAccountData(prev => ({ ...prev, ...userData.account }));
        }
        if (userData.preferences) {
          const savedTheme = getSavedTheme();
          setPreferences(prev => ({
            ...prev,
            ...userData.preferences,
            theme: ['light', 'dark', 'auto', 'custom'].includes(savedTheme)
              ? savedTheme
              : (userData.preferences.theme || prev.theme),
          }));
        }
      } catch (err) {
        console.error('Error loading profile data:', err);
        try {
          const savedProfile = localStorage.getItem('ripx_profile');
          const savedAccount = localStorage.getItem('ripx_account');
          const savedPreferences = localStorage.getItem('ripx_preferences');
          const savedTheme = getSavedTheme();

          if (savedProfile) {
            setProfileData(prev => ({ ...prev, ...JSON.parse(savedProfile) }));
          }
          if (savedAccount) {
            setAccountData(prev => ({ ...prev, ...JSON.parse(savedAccount) }));
          }
          if (savedPreferences) {
            const p = JSON.parse(savedPreferences);
            setPreferences(prev => ({ ...prev, ...p }));
          }
          setPreferences(prev => ({ ...prev, theme: savedTheme }));
        } catch (localErr) {
          console.error('Error loading from localStorage', localErr);
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const handleProfileUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProfile(profileData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAccountUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateAccount(accountData);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to update account settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreferencesUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePreferences(preferences);
      updateTheme(preferences.theme, preferences.theme === 'custom' ? {
        start: preferences.customThemeStart ?? 7,
        end: preferences.customThemeEnd ?? 19,
      } : null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to update preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const setActiveTab = (id) => setSearchParams({ tab: id });

  if (loading) {
    return (
      <PageShell className={styles.profilePage}>
        <Page title="">
          <div className={styles.profileLayout}>
            <div className={styles.profileHero}>
              <div className={styles.profileHeroIcon}><ProfileIcon /></div>
              <div>
                <h1 className={styles.profileHeroTitle}>My Profile</h1>
                <p className={styles.profileHeroSubtitle}>Loading...</p>
              </div>
            </div>
            <div className={styles.profileLoadingSkeleton}>
              <div className={styles.loadingBlock} style={{ height: 320 }} />
            </div>
          </div>
        </Page>
      </PageShell>
    );
  }

  return (
    <PageShell
      message={success ? 'Settings saved successfully!' : null}
      messageType={success ? 'success' : 'error'}
      onCloseMessage={() => { setSuccess(false); setError(null); }}
      messageDuration={3000}
      className={styles.profilePage}
    >
      <Toast message={error} type="error" onClose={() => setError(null)} duration={5000} />

      <Page title="" subtitle="">
        <div className={styles.profileLayout}>
          <div className={styles.profileHeader}>
            <div className={styles.profileHero}>
              <div className={styles.profileHeroIcon}>
                <ProfileIcon />
              </div>
              <div>
                <h1 className={styles.profileHeroTitle}>My Profile</h1>
                <p className={styles.profileHeroSubtitle}>
                  Manage your profile, account settings, and preferences
                </p>
              </div>
            </div>

            <nav className={styles.profileTabBar} role="tablist" aria-label="Profile sections">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`profile-panel-${tab.id}`}
                  id={`profile-tab-${tab.id}`}
                  className={`${styles.profileTab} ${activeTab === tab.id ? styles.profileTabActive : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className={styles.profileTabIcon}>
                    <Icon source={tab.icon} />
                  </span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className={styles.profileBody}>
            <BlockStack gap={CONTENT_GAP}>
              <div className={styles.profilePanels}>
                {activeTab === 'profile' && (
                  <div
                    id="profile-panel-profile"
                    role="tabpanel"
                    aria-labelledby="profile-tab-profile"
                    className={`${styles.profileContent} ${styles.profilePanelLayout} ${styles.profilePanelProfile}`}
                  >
                    <Card className={`${styles.profilePanelCard} ${styles.profilePanelCardFull} ${styles.profileHeaderCard}`}>
                      <Box padding="500">
                        <div className={styles.profileHeaderInner}>
                          <div className={styles.profileAvatarWrap}>
                            <Avatar
                              name={`${profileData.firstName} ${profileData.lastName}`}
                              size="large"
                              initials={`${profileData.firstName[0]}${profileData.lastName[0]}`}
                            />
                          </div>
                          <div className={styles.profileHeaderInfo}>
                            <h2 className={styles.profileHeaderName}>
                              {profileData.firstName} {profileData.lastName}
                            </h2>
                            <Text as="p" variant="bodyMd" tone="subdued" className={styles.profileHeaderMeta}>
                              {profileData.jobTitle} at {profileData.company}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued" className={styles.profileHeaderEmail}>
                              {profileData.email}
                            </Text>
                          </div>
                        </div>
                      </Box>
                    </Card>

                    <Card className={styles.profilePanelCard}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <PersonIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">Personal Information</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Your name, contact details, and professional info
                              </Text>
                            </div>
                          </div>
                          <div className={styles.profileFormSection}>
                            <div className={styles.formGrid2}>
                              <TextField
                                label="First Name"
                                value={profileData.firstName}
                                onChange={v => setProfileData({ ...profileData, firstName: v })}
                                autoComplete="given-name"
                              />
                              <TextField
                                label="Last Name"
                                value={profileData.lastName}
                                onChange={v => setProfileData({ ...profileData, lastName: v })}
                                autoComplete="family-name"
                              />
                            </div>
                            <div className={styles.formGrid2}>
                              <TextField
                                label="Email Address"
                                type="email"
                                value={profileData.email}
                                onChange={v => setProfileData({ ...profileData, email: v })}
                                autoComplete="email"
                              />
                              <TextField
                                label="Phone Number"
                                type="tel"
                                value={profileData.phone}
                                onChange={v => setProfileData({ ...profileData, phone: v })}
                                autoComplete="tel"
                              />
                            </div>
                            <div className={styles.formGrid2}>
                              <TextField
                                label="Job Title"
                                value={profileData.jobTitle}
                                onChange={v => setProfileData({ ...profileData, jobTitle: v })}
                              />
                              <TextField
                                label="Company"
                                value={profileData.company}
                                onChange={v => setProfileData({ ...profileData, company: v })}
                              />
                            </div>
                            <TextField
                              label="Bio"
                              value={profileData.bio}
                              onChange={v => setProfileData({ ...profileData, bio: v })}
                              multiline={4}
                              helpText="Tell us a bit about yourself"
                            />
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card className={styles.profilePanelCard}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <GlobeIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">Regional Settings</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Timezone and language for dates and display
                              </Text>
                            </div>
                          </div>
                          <div className={styles.regionalFormSection}>
                            <Select
                              label="Timezone"
                              options={[
                                { label: `Auto-detect (${detectedTimezone()})`, value: '__auto__' },
                                { label: 'Eastern Time (UTC-5)', value: 'America/New_York' },
                                { label: 'Central Time (UTC-6)', value: 'America/Chicago' },
                                { label: 'Mountain Time (UTC-7)', value: 'America/Denver' },
                                { label: 'Pacific Time (UTC-8)', value: 'America/Los_Angeles' },
                                { label: 'UTC', value: 'UTC' },
                                { label: 'London (GMT/BST)', value: 'Europe/London' },
                                { label: 'Paris (CET)', value: 'Europe/Paris' },
                                { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
                                { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
                              ]}
                              value={profileData.timezone === detectedTimezone() ? '__auto__' : profileData.timezone}
                              onChange={v => setProfileData({
                                ...profileData,
                                timezone: v === '__auto__' ? detectedTimezone() : v,
                              })}
                              helpText="Auto-detect uses your browser's timezone — recommended"
                            />
                            <Select
                              label="Language"
                              options={[
                                { label: 'English', value: 'en' },
                                { label: 'Spanish', value: 'es' },
                                { label: 'French', value: 'fr' },
                                { label: 'German', value: 'de' },
                              ]}
                              value={profileData.language}
                              onChange={v => setProfileData({ ...profileData, language: v })}
                            />
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card className={`${styles.profilePanelCard} ${styles.profilePanelCardFull} ${styles.profileSaveCard}`}>
                      <Box padding="500">
                        <InlineStack align="end">
                          <Button variant="primary" loading={saving} onClick={handleProfileUpdate}>
                            Save Changes
                          </Button>
                        </InlineStack>
                      </Box>
                    </Card>
                  </div>
                )}

                {activeTab === 'account' && (
                  <div
                    id="profile-panel-account"
                    role="tabpanel"
                    aria-labelledby="profile-tab-account"
                    className={`${styles.profileContent} ${styles.profilePanelLayout}`}
                  >
                    <Card className={styles.profilePanelCard}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <SettingsIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">Account Information</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Your shop domain, plan, and billing details
                              </Text>
                            </div>
                          </div>
                          <div className={styles.panelCardBody}>
                            <TextField label="Shop Domain" value={accountData.shopDomain} disabled helpText="Your Shopify store domain" />
                            <TextField label="Plan" value={accountData.plan} disabled helpText="Current subscription plan" />
                            <TextField
                              label="Billing Email"
                              type="email"
                              value={accountData.billingEmail}
                              onChange={v => setAccountData({ ...accountData, billingEmail: v })}
                              helpText="Email address for billing and invoices"
                            />
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card className={styles.profilePanelCard}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <SettingsIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">API Access</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Programmatic access to your data
                              </Text>
                            </div>
                          </div>
                          <div className={styles.panelCardBody}>
                            <TextField label="API Key" value={accountData.apiKey} disabled helpText="Your API key for programmatic access" />
                            <InlineStack gap="200">
                              <Button>Regenerate API Key</Button>
                              <Button>View API Documentation</Button>
                            </InlineStack>
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card className={`${styles.profilePanelCard} ${styles.profilePanelCardFull}`}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <SettingsIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">Security & Notifications</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Two-factor authentication and notification preferences
                              </Text>
                            </div>
                          </div>
                          <div className={styles.panelCardBody}>
                            <Checkbox
                              label="Enable Two-Factor Authentication"
                              checked={accountData.twoFactorEnabled}
                              onChange={v => setAccountData({ ...accountData, twoFactorEnabled: v })}
                              helpText="Add an extra layer of security to your account"
                            />
                            <Checkbox
                              label="Email Notifications"
                              checked={accountData.emailNotifications}
                              onChange={v => setAccountData({ ...accountData, emailNotifications: v })}
                              helpText="Receive email updates about your tests"
                            />
                            <Checkbox
                              label="Push Notifications"
                              checked={accountData.pushNotifications}
                              onChange={v => setAccountData({ ...accountData, pushNotifications: v })}
                              helpText="Receive browser push notifications"
                            />
                            <Checkbox
                              label="Weekly Reports"
                              checked={accountData.weeklyReports}
                              onChange={v => setAccountData({ ...accountData, weeklyReports: v })}
                              helpText="Get weekly summary reports via email"
                            />
                            <Checkbox
                              label="Significance alerts"
                              checked={accountData.significanceAlerts}
                              onChange={v => setAccountData({ ...accountData, significanceAlerts: v })}
                              helpText="Email me when a test reaches statistical significance"
                            />
                            <Select
                              label="Notification frequency"
                              options={[
                                { label: 'Immediate', value: 'immediate' },
                                { label: 'Daily digest', value: 'daily' },
                                { label: 'Weekly digest', value: 'weekly' },
                              ]}
                              value={accountData.notificationFrequency || 'immediate'}
                              onChange={v => setAccountData({ ...accountData, notificationFrequency: v })}
                              helpText="How often to batch email notifications"
                            />
                          </div>
                          <InlineStack align="end">
                            <Button variant="primary" loading={saving} onClick={handleAccountUpdate}>
                              Save Changes
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Card>
                  </div>
                )}

                {activeTab === 'preferences' && (
                  <div
                    id="profile-panel-preferences"
                    role="tabpanel"
                    aria-labelledby="profile-tab-preferences"
                    className={`${styles.profileContent} ${styles.profilePanelLayout}`}
                  >
                    <Card className={`${styles.profilePanelCard} ${styles.profilePanelCardFull} ${styles.quickLinksCard}`}>
                      <Box padding="500">
                        <BlockStack gap="300">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <SettingsIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">App Configuration</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Test defaults, webhooks, integrations, and theme are in{' '}
                                <Link to={ROUTES.SETTINGS} className={styles.settingsLink}>Settings</Link>
                                {' '}— General (test config, webhooks), Integrations, Appearance (theme).
                              </Text>
                            </div>
                          </div>
                          <InlineStack gap="200" wrap>
                            <Link to={ROUTES.SETTINGS} className={styles.quickLinkBtn}>
                              Open Settings
                            </Link>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card className={styles.profilePanelCard}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <PaintBrushFlatIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">Appearance</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Theme and display options. Also available in{' '}
                                <Link to={ROUTES.SETTINGS} className={styles.settingsLink}>
                                  Settings → Appearance
                                </Link>
                              </Text>
                            </div>
                          </div>
                          <div className={styles.panelCardBody}>
                            <Select
                              label="Theme"
                              options={[
                                { label: 'Light', value: 'light' },
                                { label: 'Dark', value: 'dark' },
                                { label: 'Auto (by time of day)', value: 'auto' },
                                { label: 'Custom', value: 'custom' },
                              ]}
                              value={preferences.theme}
                              onChange={v => {
                                setPreferences(p => ({ ...p, theme: v }));
                                if (v !== 'custom') updateTheme(v);
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
                                <div className={styles.formGrid2}>
                                  <Select
                                    label="Light Theme Start"
                                    options={Array.from({ length: 24 }, (_, i) => ({
                                      label: `${i.toString().padStart(2, '0')}:00`,
                                      value: i.toString(),
                                    }))}
                                    value={String(preferences.customThemeStart ?? 7)}
                                    onChange={v => setPreferences(p => ({ ...p, customThemeStart: parseInt(v, 10) }))}
                                  />
                                  <Select
                                    label="Dark Theme Start"
                                    options={Array.from({ length: 24 }, (_, i) => ({
                                      label: `${i.toString().padStart(2, '0')}:00`,
                                      value: i.toString(),
                                    }))}
                                    value={String(preferences.customThemeEnd ?? 19)}
                                    onChange={v => setPreferences(p => ({ ...p, customThemeEnd: parseInt(v, 10) }))}
                                  />
                                </div>
                                <Button
                                  onClick={() => updateTheme('custom', {
                                    start: preferences.customThemeStart ?? 7,
                                    end: preferences.customThemeEnd ?? 19,
                                  })}
                                >
                                  Apply Custom Theme
                                </Button>
                              </BlockStack>
                            )}
                          </div>
                        </BlockStack>
                      </Box>
                    </Card>

                    <Card className={styles.profilePanelCard}>
                      <Box padding="500">
                        <BlockStack gap="400">
                          <div className={styles.sectionHeader}>
                            <div className={styles.sectionHeaderIcon}>
                              <SettingsIcon />
                            </div>
                            <div className={styles.sectionHeaderContent}>
                              <Text variant="headingMd" as="h2">Dashboard & Editor</Text>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Default views and editor behavior
                              </Text>
                            </div>
                          </div>
                          <div className={styles.panelCardBody}>
                            <Select
                              label="Default View"
                              options={[
                                { label: 'Grid View', value: 'grid' },
                                { label: 'List View', value: 'list' },
                                { label: 'Compact View', value: 'compact' },
                              ]}
                              value={preferences.dashboardView}
                              onChange={v => setPreferences(p => ({ ...p, dashboardView: v }))}
                            />
                            <Select
                              label="Default Test Type"
                              options={[
                                { label: 'Price Test', value: 'price' },
                                { label: 'Content Test', value: 'content' },
                                { label: 'Shipping Test', value: 'shipping' },
                                { label: 'Offer Test', value: 'offer' },
                              ]}
                              value={preferences.defaultTestType}
                              onChange={v => setPreferences(p => ({ ...p, defaultTestType: v }))}
                            />
                            <Select
                              label="Default analytics date range"
                              options={[
                                { label: 'Last 7 days', value: '7' },
                                { label: 'Last 30 days', value: '30' },
                                { label: 'Last 90 days', value: '90' },
                                { label: 'All time', value: 'all' },
                              ]}
                              value={preferences.defaultAnalyticsDateRange || '30'}
                              onChange={v => setPreferences(p => ({ ...p, defaultAnalyticsDateRange: v }))}
                              helpText="Default when opening Analytics"
                            />
                            <Select
                              label="Default export format"
                              options={[
                                { label: 'CSV', value: 'csv' },
                                { label: 'JSON', value: 'json' },
                              ]}
                              value={preferences.defaultExportFormat || 'csv'}
                              onChange={v => setPreferences(p => ({ ...p, defaultExportFormat: v }))}
                              helpText="Default format for data exports"
                            />
                            <Checkbox
                              label="Auto-save changes"
                              checked={preferences.autoSave}
                              onChange={v => setPreferences(p => ({ ...p, autoSave: v }))}
                              helpText="Automatically save your work as you type"
                            />
                            <Checkbox
                              label="Show tooltips"
                              checked={preferences.showTooltips}
                              onChange={v => setPreferences(p => ({ ...p, showTooltips: v }))}
                              helpText="Display helpful tooltips throughout the interface"
                            />
                            <Checkbox
                              label="Compact mode"
                              checked={preferences.compactMode}
                              onChange={v => setPreferences(p => ({ ...p, compactMode: v }))}
                              helpText="Reduce spacing for a more compact interface"
                            />
                          </div>
                          <InlineStack align="end">
                            <Button variant="primary" loading={saving} onClick={handlePreferencesUpdate}>
                              Save Changes
                            </Button>
                          </InlineStack>
                        </BlockStack>
                      </Box>
                    </Card>
                  </div>
                )}
              </div>
            </BlockStack>
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default Profile;
