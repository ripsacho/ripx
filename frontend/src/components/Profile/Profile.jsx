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
import { CONTENT_GAP, ROUTES, STORAGE_KEYS } from '../../constants';
import styles from './Profile.module.css';
import {
  getProfile,
  updateProfile,
  updateAccount,
  updatePreferences,
} from '../../services/profileApi';
import { getSavedTheme, updateTheme } from '../../utils/theme';
import Toast from '../Toast/Toast';
import PartyPop from '../PartyPop/PartyPop';

const TAB_CONFIG = [
  {
    id: 'profile',
    label: 'Profile',
    icon: ProfileIcon,
    eyebrow: 'Identity',
    description: 'Name, role, bio, language, and regional defaults.',
  },
  {
    id: 'account',
    label: 'Account',
    icon: SettingsIcon,
    eyebrow: 'Access',
    description: 'Security, notifications, and API access for your account.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: PaintBrushFlatIcon,
    eyebrow: 'Personal UI',
    description: 'Theme, motion, and celebration preferences just for you.',
  },
];

const THEME_CHOICES = [
  { value: 'light', label: 'Light', detail: 'Clean daytime workspace' },
  { value: 'dark', label: 'Dark', detail: 'Focused low-light workspace' },
  { value: 'auto', label: 'Auto', detail: 'Adapts by time of day' },
  { value: 'custom', label: 'Custom', detail: 'Choose your own schedule' },
];

const CELEBRATION_ANIMATION_CHOICES = [
  { value: 'auto', label: 'Auto', detail: 'Best fit for screen size' },
  { value: 'full', label: 'Full', detail: 'High-energy launch moment' },
  { value: 'subtle', label: 'Subtle', detail: 'Quiet confirmation' },
  { value: 'off', label: 'Off', detail: 'Disable success animation' },
];

const CELEBRATION_COLOR_CHOICES = [
  { value: 'rainbow', label: 'Rainbow', detail: 'Vibrant celebration palette' },
  { value: 'brand', label: 'Brand', detail: 'RipX cyan-violet palette' },
];

const CELEBRATION_MOTION_CHOICES = [
  { value: 'dynamic', label: 'Dynamic', detail: 'Punchy and energetic' },
  { value: 'cinematic', label: 'Cinematic', detail: 'Smooth premium motion' },
];

function Profile() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'profile';
  const activeTab = TAB_CONFIG.some(tab => tab.id === requestedTab) ? requestedTab : 'profile';

  useEffect(() => {
    const prev = document.title;
    document.title = 'Profile - RipX';
    return () => {
      document.title = prev;
    };
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [devMessage, setDevMessage] = useState(null);
  const [previewCelebrationMode, setPreviewCelebrationMode] = useState(null);

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
    celebrationAnimation: 'auto',
    celebrationStyle: 'dynamic',
    celebrationColorTheme: 'rainbow',
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
              : userData.preferences.theme || prev.theme,
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
      setError('Failed to update account. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePreferencesUpdate = async () => {
    setSaving(true);
    setError(null);
    try {
      await updatePreferences(preferences);
      updateTheme(
        preferences.theme,
        preferences.theme === 'custom'
          ? {
              start: preferences.customThemeStart ?? 7,
              end: preferences.customThemeEnd ?? 19,
            }
          : null
      );
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError('Failed to update preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const setActiveTab = id => setSearchParams({ tab: id });
  const isDevBuild = import.meta.env.DEV;

  const handleResetUltraCelebration = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.CELEBRATION_ULTRA_SHOWN);
      setDevMessage(
        'First-start ultra celebration reset. Next successful test start will trigger Ultra.'
      );
    } catch {
      setDevMessage('Could not reset ultra celebration flag in local storage.');
    }
  };

  const triggerCelebrationPreview = mode => {
    setPreviewCelebrationMode(null);
    setTimeout(() => setPreviewCelebrationMode(mode), 0);
  };

  const activeTabConfig = TAB_CONFIG.find(tab => tab.id === activeTab) || TAB_CONFIG[0];
  const fullName = `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim();
  const displayName = fullName || profileData.email || 'RipX user';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
  const profileFields = [
    profileData.firstName,
    profileData.lastName,
    profileData.email,
    profileData.jobTitle,
    profileData.company,
    profileData.timezone,
  ];
  const profileCompleteness = Math.round(
    (profileFields.filter(value => String(value || '').trim()).length / profileFields.length) * 100
  );
  const themeLabel =
    {
      light: 'Light',
      dark: 'Dark',
      auto: 'Auto',
      custom: 'Custom schedule',
    }[preferences.theme] || 'Light';
  const enabledNotificationCount = [
    accountData.emailNotifications,
    accountData.pushNotifications,
    accountData.weeklyReports,
    accountData.significanceAlerts,
  ].filter(Boolean).length;
  const languageLabel =
    {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
    }[profileData.language] || 'English';
  const notificationFrequencyLabel =
    {
      immediate: 'Immediate',
      daily: 'Daily digest',
      weekly: 'Weekly digest',
    }[accountData.notificationFrequency] || 'Immediate';
  const celebrationMotionLabel =
    preferences.celebrationStyle === 'cinematic' ? 'Cinematic' : 'Dynamic';
  const celebrationColorLabel =
    preferences.celebrationColorTheme === 'brand' ? 'Brand palette' : 'Rainbow palette';
  const sectionInsightsByTab = {
    profile: [
      {
        label: 'Profile strength',
        value: `${profileCompleteness}%`,
        detail:
          profileCompleteness >= 90
            ? 'Ready for personalized workspace defaults'
            : 'Add role, company, and regional details to finish setup',
      },
      {
        label: 'Locale',
        value: languageLabel,
        detail: profileData.timezone || detectedTimezone(),
      },
      {
        label: 'Contact',
        value: profileData.email ? 'Configured' : 'Missing',
        detail: profileData.phone || 'Phone number is optional',
      },
    ],
    account: [
      {
        label: 'Security',
        value: accountData.twoFactorEnabled ? '2FA enabled' : '2FA off',
        detail: accountData.twoFactorEnabled
          ? 'Extra sign-in protection is active'
          : 'Enable two-factor authentication for stronger account protection',
      },
      {
        label: 'Notifications',
        value: `${enabledNotificationCount}/4 enabled`,
        detail: `${notificationFrequencyLabel} delivery cadence`,
      },
      {
        label: 'API access',
        value: accountData.apiKey ? 'Key available' : 'Not configured',
        detail: 'Use trusted server-side integrations only',
      },
    ],
    appearance: [
      {
        label: 'Theme',
        value: themeLabel,
        detail:
          preferences.theme === 'custom'
            ? `${preferences.customThemeStart ?? 7}:00 to ${preferences.customThemeEnd ?? 19}:00`
            : 'Applies immediately in this browser',
      },
      {
        label: 'Celebration',
        value: preferences.celebrationAnimation || 'auto',
        detail: `${celebrationMotionLabel} motion with ${celebrationColorLabel.toLowerCase()}`,
      },
      {
        label: 'Scope',
        value: 'User only',
        detail: 'Does not change store-wide settings for team members',
      },
    ],
  };
  const activeSectionInsights = sectionInsightsByTab[activeTab] || sectionInsightsByTab.profile;
  const smartPanelByTab = {
    profile: {
      label: 'Smart profile map',
      title:
        profileCompleteness >= 90
          ? 'Identity data is ready'
          : 'Finish the fields that drive personalization',
      body:
        profileCompleteness >= 90
          ? 'RipX can use your completed identity and locale details to keep the workspace context clear.'
          : 'Prioritize name, role, company, timezone, and language. Those fields make the account feel less generic and reduce ambiguity across shared stores.',
      items: [
        {
          title: 'Identity',
          detail: fullName ? displayName : 'Add your first and last name',
          status: fullName ? 'Ready' : 'Needs input',
        },
        {
          title: 'Work context',
          detail:
            [profileData.jobTitle, profileData.company].filter(Boolean).join(' at ') ||
            'Add role and company',
          status: profileData.jobTitle && profileData.company ? 'Ready' : 'Optional',
        },
        {
          title: 'Regional defaults',
          detail: `${languageLabel} · ${profileData.timezone || detectedTimezone()}`,
          status: 'Active',
        },
      ],
    },
    account: {
      label: 'Access posture',
      title: accountData.twoFactorEnabled
        ? 'Security posture is healthy'
        : '2FA is the highest leverage improvement',
      body: 'Account controls should make risk obvious. Keep API usage explicit, batch notifications intentionally, and move store operations into the selected workspace.',
      items: [
        {
          title: 'Two-factor auth',
          detail: accountData.twoFactorEnabled ? 'Enabled for this account' : 'Not enabled yet',
          status: accountData.twoFactorEnabled ? 'Protected' : 'Action',
        },
        {
          title: 'Alert routing',
          detail: `${enabledNotificationCount} channels · ${notificationFrequencyLabel}`,
          status: enabledNotificationCount > 0 ? 'Active' : 'Quiet',
        },
        {
          title: 'Store controls',
          detail: 'Billing, checkout, and integrations stay in the app workspace',
          status: 'Separated',
        },
      ],
    },
    appearance: {
      label: 'Experience preview',
      title: 'Personal UI without team-wide side effects',
      body: 'Appearance changes are safest when they are clearly scoped. This panel previews the current theme, celebration mood, and persistence layer before saving.',
      items: [
        {
          title: 'Theme mode',
          detail: themeLabel,
          status: preferences.theme === 'custom' ? 'Scheduled' : 'Instant',
        },
        {
          title: 'Celebration mood',
          detail: `${celebrationMotionLabel} · ${celebrationColorLabel}`,
          status: preferences.celebrationAnimation || 'auto',
        },
        {
          title: 'Persistence',
          detail: 'Saved to user profile and mirrored locally',
          status: 'Personal',
        },
      ],
    },
  };
  const activeSmartPanel = smartPanelByTab[activeTab] || smartPanelByTab.profile;
  const sectionActionsByTab = {
    profile: {
      eyebrow: 'Recommended next step',
      title:
        profileCompleteness >= 90 ? 'Keep profile details current' : 'Complete your identity setup',
      detail:
        profileCompleteness >= 90
          ? 'Your profile is ready for personalized defaults. Save any edits before leaving this page.'
          : 'A complete profile helps RipX tune regional defaults, user labels, and workspace context.',
      primaryLabel: 'Save profile',
      secondaryLabel: 'Review regional settings',
    },
    account: {
      eyebrow: 'Security guidance',
      title: accountData.twoFactorEnabled
        ? 'Account protections look active'
        : 'Strengthen account access',
      detail: accountData.twoFactorEnabled
        ? 'Review notification delivery and API key usage to keep account access predictable.'
        : 'Two-factor authentication is the highest-impact account protection to enable next.',
      primaryLabel: 'Save account',
      secondaryLabel: 'Open app',
    },
    appearance: {
      eyebrow: 'Personal workspace',
      title: 'Tune the interface to your working style',
      detail:
        'Theme and celebration settings apply to your user profile and local browser without changing other team members.',
      primaryLabel: 'Save appearance',
      secondaryLabel: 'Preview Ultra',
    },
  };
  const activeSectionAction = sectionActionsByTab[activeTab] || sectionActionsByTab.profile;

  if (loading) {
    return (
      <PageShell className={styles.profilePage}>
        <Page title="">
          <div className={styles.profileLayout}>
            <div className={styles.profileHero}>
              <div className={styles.profileHeroIcon}>
                <ProfileIcon />
              </div>
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
      message={success ? 'Profile saved successfully!' : null}
      messageType={success ? 'success' : 'error'}
      onCloseMessage={() => {
        setSuccess(false);
        setError(null);
      }}
      messageDuration={3000}
      className={styles.profilePage}
    >
      <PartyPop
        active={!!previewCelebrationMode}
        variant={previewCelebrationMode || 'full'}
        styleMode={preferences.celebrationStyle === 'cinematic' ? 'cinematic' : 'dynamic'}
        palette={preferences.celebrationColorTheme === 'brand' ? 'brand' : 'rainbow'}
        onComplete={() => setPreviewCelebrationMode(null)}
      />
      <Toast message={error} type="error" onClose={() => setError(null)} duration={5000} />
      {devMessage ? (
        <Toast
          message={devMessage}
          type="success"
          onClose={() => setDevMessage(null)}
          duration={3200}
        />
      ) : null}

      <Page title="" subtitle="">
        <div className={styles.profileLayout}>
          <div className={styles.profileHeader}>
            <div className={styles.profileHero}>
              <div className={styles.profileHeroMain}>
                <div className={styles.profileHeroIcon}>
                  <ProfileIcon />
                </div>
                <div className={styles.profileHeroContent}>
                  <p className={styles.profileHeroEyebrow}>Account command center</p>
                  <h1 className={styles.profileHeroTitle}>My Profile</h1>
                  <p className={styles.profileHeroSubtitle}>
                    Manage your identity, account controls, and personal appearance from one focused
                    place.
                  </p>
                  <div className={styles.profileHeroBadges}>
                    <span>{activeTabConfig.eyebrow}</span>
                    <span>{activeTabConfig.label}</span>
                  </div>
                </div>
              </div>
              <div className={styles.profileHeroStats} aria-label="Profile overview">
                <div className={styles.profileHeroStat}>
                  <span className={styles.profileHeroStatLabel}>Completion</span>
                  <strong>{profileCompleteness}%</strong>
                </div>
                <div className={styles.profileHeroStat}>
                  <span className={styles.profileHeroStatLabel}>Theme</span>
                  <strong>{themeLabel}</strong>
                </div>
                <div className={styles.profileHeroStat}>
                  <span className={styles.profileHeroStatLabel}>Alerts</span>
                  <strong>{enabledNotificationCount}/4</strong>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.profileBody}>
            <div className={styles.profileSettingsShell}>
              <aside className={styles.profileSideRail} aria-label="Profile sections">
                <Card className={styles.profileSideCard}>
                  <Box padding="400">
                    <div className={styles.profileMiniCard}>
                      <Avatar name={displayName} size="medium" initials={initials || 'RX'} />
                      <div>
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {displayName}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {profileData.email || accountData.shopDomain || 'Personal workspace'}
                        </Text>
                      </div>
                    </div>
                    <div className={styles.profileCompletionPanel}>
                      <div className={styles.profileCompletionHeader}>
                        <span>Setup progress</span>
                        <strong>{profileCompleteness}%</strong>
                      </div>
                      <div
                        className={styles.profileCompletionTrack}
                        aria-label={`Profile ${profileCompleteness}% complete`}
                      >
                        <span style={{ width: `${profileCompleteness}%` }} />
                      </div>
                      <p>
                        {profileCompleteness >= 90
                          ? 'Your personal workspace profile is in good shape.'
                          : 'Complete identity and regional fields for smarter defaults.'}
                      </p>
                    </div>
                    <nav
                      className={styles.profileTabBar}
                      role="tablist"
                      aria-label="Profile sections"
                    >
                      {TAB_CONFIG.map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={activeTab === tab.id}
                          aria-controls={`profile-panel-${tab.id}`}
                          id={`profile-tab-${tab.id}`}
                          className={`${styles.profileTab} ${
                            activeTab === tab.id ? styles.profileTabActive : ''
                          }`}
                          onClick={() => setActiveTab(tab.id)}
                        >
                          <span className={styles.profileTabIcon}>
                            <Icon source={tab.icon} />
                          </span>
                          <span className={styles.profileTabText}>
                            <span>{tab.label}</span>
                            <small>{tab.description}</small>
                          </span>
                        </button>
                      ))}
                    </nav>
                  </Box>
                </Card>
              </aside>
              <main className={styles.profileMainPanel}>
                <div className={styles.profileSectionIntro}>
                  <p className={styles.profileSectionEyebrow}>{activeTabConfig.eyebrow}</p>
                  <h2>{activeTabConfig.label}</h2>
                  <p>{activeTabConfig.description}</p>
                </div>
                <div className={styles.sectionInsightGrid}>
                  {activeSectionInsights.map((item, index) => (
                    <div
                      key={`${activeTab}-${item.label}`}
                      className={`${styles.sectionInsightCard} ${
                        index === 0 ? styles.sectionInsightCardPrimary : ''
                      }`}
                    >
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <small>{item.detail}</small>
                    </div>
                  ))}
                </div>
                <div className={styles.sectionActionBand}>
                  <div className={styles.sectionActionCopy}>
                    <span>{activeSectionAction.eyebrow}</span>
                    <strong>{activeSectionAction.title}</strong>
                    <p>{activeSectionAction.detail}</p>
                  </div>
                  <div className={styles.sectionActionControls}>
                    {activeTab === 'profile' && (
                      <>
                        <Button
                          onClick={() =>
                            document
                              .getElementById('profile-regional-section')
                              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        >
                          {activeSectionAction.secondaryLabel}
                        </Button>
                        <Button variant="primary" loading={saving} onClick={handleProfileUpdate}>
                          {activeSectionAction.primaryLabel}
                        </Button>
                      </>
                    )}
                    {activeTab === 'account' && (
                      <>
                        <Link to={ROUTES.USER_PANEL} className={styles.quickLinkBtn}>
                          {activeSectionAction.secondaryLabel}
                        </Link>
                        <Button variant="primary" loading={saving} onClick={handleAccountUpdate}>
                          {activeSectionAction.primaryLabel}
                        </Button>
                      </>
                    )}
                    {activeTab === 'appearance' && (
                      <>
                        <Button onClick={() => triggerCelebrationPreview('ultra')}>
                          {activeSectionAction.secondaryLabel}
                        </Button>
                        <Button
                          variant="primary"
                          loading={saving}
                          onClick={handlePreferencesUpdate}
                        >
                          {activeSectionAction.primaryLabel}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className={styles.smartContextPanel}>
                  <div className={styles.smartContextLead}>
                    <span>{activeSmartPanel.label}</span>
                    <strong>{activeSmartPanel.title}</strong>
                    <p>{activeSmartPanel.body}</p>
                  </div>
                  <div className={styles.smartContextList}>
                    {activeSmartPanel.items.map(item => (
                      <div key={`${activeTab}-${item.title}`} className={styles.smartContextItem}>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                        </div>
                        <span>{item.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <BlockStack gap={CONTENT_GAP}>
                  <div className={styles.profilePanels}>
                    {activeTab === 'profile' && (
                      <div
                        id="profile-panel-profile"
                        role="tabpanel"
                        aria-labelledby="profile-tab-profile"
                        className={`${styles.profileContent} ${styles.profilePanelLayout} ${styles.profilePanelProfile}`}
                      >
                        <Card
                          className={`${styles.profilePanelCard} ${styles.profilePanelCardFull} ${styles.profileHeaderCard}`}
                        >
                          <Box padding="500">
                            <div className={styles.profileHeaderInner}>
                              <div className={styles.profileAvatarWrap}>
                                <Avatar
                                  name={displayName}
                                  size="large"
                                  initials={initials || 'RX'}
                                />
                              </div>
                              <div className={styles.profileHeaderInfo}>
                                <h2 className={styles.profileHeaderName}>{displayName}</h2>
                                <Text
                                  as="p"
                                  variant="bodyMd"
                                  tone="subdued"
                                  className={styles.profileHeaderMeta}
                                >
                                  {[profileData.jobTitle, profileData.company]
                                    .filter(Boolean)
                                    .join(' at ') || 'Profile details ready for personalization'}
                                </Text>
                                <Text
                                  as="p"
                                  variant="bodySm"
                                  tone="subdued"
                                  className={styles.profileHeaderEmail}
                                >
                                  {profileData.email}
                                </Text>
                              </div>
                            </div>
                            <div className={styles.profileInsightGrid}>
                              <div className={styles.profileInsightTile}>
                                <span>Profile strength</span>
                                <strong>{profileCompleteness}% complete</strong>
                              </div>
                              <div className={styles.profileInsightTile}>
                                <span>Region</span>
                                <strong>{profileData.timezone || detectedTimezone()}</strong>
                              </div>
                              <div className={styles.profileInsightTile}>
                                <span>Language</span>
                                <strong>{languageLabel}</strong>
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
                                  <Text variant="headingMd" as="h2">
                                    Personal Information
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Your name, contact details, and professional info
                                  </Text>
                                </div>
                              </div>
                              <div className={styles.profileFormSection}>
                                <div className={styles.fieldCluster}>
                                  <div className={styles.fieldClusterHeader}>
                                    <div>
                                      <span>Identity</span>
                                      <small>
                                        Used across navigation, audit trails, and user labels.
                                      </small>
                                    </div>
                                    <strong>{fullName ? 'Complete' : 'Required'}</strong>
                                  </div>
                                  <div className={styles.formGrid2}>
                                    <TextField
                                      label="First Name"
                                      value={profileData.firstName}
                                      onChange={v =>
                                        setProfileData({ ...profileData, firstName: v })
                                      }
                                      autoComplete="given-name"
                                    />
                                    <TextField
                                      label="Last Name"
                                      value={profileData.lastName}
                                      onChange={v =>
                                        setProfileData({ ...profileData, lastName: v })
                                      }
                                      autoComplete="family-name"
                                    />
                                  </div>
                                </div>
                                <div className={styles.fieldCluster}>
                                  <div className={styles.fieldClusterHeader}>
                                    <div>
                                      <span>Contact</span>
                                      <small>
                                        Primary email and optional phone for account context.
                                      </small>
                                    </div>
                                    <strong>{profileData.email ? 'Configured' : 'Missing'}</strong>
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
                                </div>
                                <div className={styles.fieldCluster}>
                                  <div className={styles.fieldClusterHeader}>
                                    <div>
                                      <span>Work context</span>
                                      <small>
                                        Helps make shared-store collaboration less anonymous.
                                      </small>
                                    </div>
                                    <strong>
                                      {profileData.jobTitle && profileData.company
                                        ? 'Rich'
                                        : 'Optional'}
                                    </strong>
                                  </div>
                                  <div className={styles.formGrid2}>
                                    <TextField
                                      label="Job Title"
                                      value={profileData.jobTitle}
                                      onChange={v =>
                                        setProfileData({ ...profileData, jobTitle: v })
                                      }
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
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>

                        <Card id="profile-regional-section" className={styles.profilePanelCard}>
                          <Box padding="500">
                            <BlockStack gap="400">
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionHeaderIcon}>
                                  <GlobeIcon />
                                </div>
                                <div className={styles.sectionHeaderContent}>
                                  <Text variant="headingMd" as="h2">
                                    Regional Settings
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Timezone and language for dates and display
                                  </Text>
                                </div>
                              </div>
                              <div className={styles.regionalFormSection}>
                                <div className={styles.regionalPreviewCard}>
                                  <span>Auto-detected timezone</span>
                                  <strong>{detectedTimezone()}</strong>
                                  <small>
                                    Used for schedules, analytics timestamps, and saved views.
                                  </small>
                                </div>
                                <div className={styles.fieldCluster}>
                                  <div className={styles.fieldClusterHeader}>
                                    <div>
                                      <span>Locale controls</span>
                                      <small>
                                        Choose how time, language, and reporting context display.
                                      </small>
                                    </div>
                                    <strong>{languageLabel}</strong>
                                  </div>
                                  <Select
                                    label="Timezone"
                                    options={[
                                      {
                                        label: `Auto-detect (${detectedTimezone()})`,
                                        value: '__auto__',
                                      },
                                      { label: 'Eastern Time (UTC-5)', value: 'America/New_York' },
                                      { label: 'Central Time (UTC-6)', value: 'America/Chicago' },
                                      { label: 'Mountain Time (UTC-7)', value: 'America/Denver' },
                                      {
                                        label: 'Pacific Time (UTC-8)',
                                        value: 'America/Los_Angeles',
                                      },
                                      { label: 'UTC', value: 'UTC' },
                                      { label: 'London (GMT/BST)', value: 'Europe/London' },
                                      { label: 'Paris (CET)', value: 'Europe/Paris' },
                                      { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
                                      { label: 'Sydney (AEST)', value: 'Australia/Sydney' },
                                    ]}
                                    value={
                                      profileData.timezone === detectedTimezone()
                                        ? '__auto__'
                                        : profileData.timezone
                                    }
                                    onChange={v =>
                                      setProfileData({
                                        ...profileData,
                                        timezone: v === '__auto__' ? detectedTimezone() : v,
                                      })
                                    }
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
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>

                        <Card
                          className={`${styles.profilePanelCard} ${styles.profilePanelCardFull} ${styles.profileSaveCard}`}
                        >
                          <Box padding="500">
                            <div className={styles.saveBar}>
                              <div>
                                <Text as="p" variant="bodyMd" fontWeight="semibold">
                                  Ready to update your profile?
                                </Text>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  These details personalize your RipX workspace only.
                                </Text>
                              </div>
                              <Button
                                variant="primary"
                                loading={saving}
                                onClick={handleProfileUpdate}
                              >
                                Save Changes
                              </Button>
                            </div>
                          </Box>
                        </Card>
                      </div>
                    )}

                    {activeTab === 'account' && (
                      <div
                        id="profile-panel-account"
                        role="tabpanel"
                        aria-labelledby="profile-tab-account"
                        className={`${styles.profileContent} ${styles.profilePanelLayout} ${styles.accountPanelLayout}`}
                      >
                        <Card className={`${styles.profilePanelCard} ${styles.accountStoreCard}`}>
                          <Box padding="500">
                            <BlockStack gap="300">
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionHeaderIcon}>
                                  <SettingsIcon />
                                </div>
                                <div className={styles.sectionHeaderContent}>
                                  <p className={styles.accountSectionKicker}>Store operations</p>
                                  <h2 className={styles.accountSectionTitle}>Store & billing</h2>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Shop domain, plan, and billing details are managed in the app —
                                    not here. Open a store from Home to see store-specific
                                    information.
                                  </Text>
                                </div>
                              </div>
                              <div className={styles.accountStoreHero}>
                                <div>
                                  <span>Connected store context</span>
                                  <strong>{accountData.shopDomain || 'No store selected'}</strong>
                                  <small>
                                    Store-scoped billing, checkout, integrations, and installation
                                    controls stay inside the app workspace.
                                  </small>
                                </div>
                                <Link to={ROUTES.USER_PANEL} className={styles.quickLinkBtn}>
                                  Open store workspace
                                </Link>
                              </div>
                              <div className={styles.accountDetailGrid}>
                                <div>
                                  <span>Shop domain</span>
                                  <strong>{accountData.shopDomain || 'Open a store'}</strong>
                                </div>
                                <div>
                                  <span>Plan</span>
                                  <strong>{accountData.plan || 'Store managed'}</strong>
                                </div>
                                <div>
                                  <span>Billing contact</span>
                                  <strong>
                                    {accountData.billingEmail || 'Managed in store app'}
                                  </strong>
                                </div>
                              </div>
                              <div className={styles.storeScopeNote}>
                                <span>Store-level settings</span>
                                <strong>
                                  Defaults, integrations, installation health, and checkout setup
                                  live inside the selected app workspace.
                                </strong>
                                <small>
                                  Keeping those controls out of Profile prevents personal
                                  preferences from being mixed with store operations.
                                </small>
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>

                        <Card className={`${styles.profilePanelCard} ${styles.apiAccessCard}`}>
                          <Box padding="500">
                            <BlockStack gap="400">
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionHeaderIcon}>
                                  <SettingsIcon />
                                </div>
                                <div className={styles.sectionHeaderContent}>
                                  <p className={styles.accountSectionKicker}>Developer access</p>
                                  <h2 className={styles.accountSectionTitle}>API Access</h2>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Programmatic access to your data
                                  </Text>
                                </div>
                              </div>
                              <div className={styles.panelCardBody}>
                                <div className={styles.apiAccessPanel}>
                                  <div className={styles.apiKeyVault}>
                                    <div className={styles.apiKeyVaultHeader}>
                                      <div>
                                        <span>Credential vault</span>
                                        <strong>Masked API key</strong>
                                      </div>
                                      <small>Server-side use only</small>
                                    </div>
                                    <TextField
                                      label="API Key"
                                      value={accountData.apiKey}
                                      disabled
                                      helpText="Your API key for programmatic access"
                                    />
                                  </div>
                                  <div className={styles.apiAccessMetaGrid}>
                                    <div className={styles.apiAccessMeta}>
                                      <span>Scope</span>
                                      <strong>Authenticated user access</strong>
                                      <small>
                                        Use this only from trusted server-side integrations.
                                      </small>
                                    </div>
                                    <div className={styles.apiAccessMeta}>
                                      <span>Rotation</span>
                                      <strong>Manual</strong>
                                      <small>Regenerate the key if it may have been exposed.</small>
                                    </div>
                                  </div>
                                  <div className={styles.apiActionRow}>
                                    <Button>Regenerate API Key</Button>
                                    <Button>View API Documentation</Button>
                                  </div>
                                </div>
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>

                        <Card
                          className={`${styles.profilePanelCard} ${styles.profilePanelCardFull} ${styles.accountSecurityCard}`}
                        >
                          <Box padding="500">
                            <BlockStack gap="400">
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionHeaderIcon}>
                                  <SettingsIcon />
                                </div>
                                <div className={styles.sectionHeaderContent}>
                                  <p className={styles.accountSectionKicker}>Account preferences</p>
                                  <h2 className={styles.accountSectionTitle}>
                                    Security & Notifications
                                  </h2>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Two-factor authentication and notification preferences
                                  </Text>
                                </div>
                              </div>
                              <div className={styles.panelCardBody}>
                                <div className={styles.preferenceStatusStrip}>
                                  <div>
                                    <span>Account protection</span>
                                    <strong>
                                      {accountData.twoFactorEnabled
                                        ? '2FA enabled'
                                        : '2FA not enabled'}
                                    </strong>
                                  </div>
                                  <div>
                                    <span>Notification reach</span>
                                    <strong>{enabledNotificationCount} channels active</strong>
                                  </div>
                                  <div>
                                    <span>Cadence</span>
                                    <strong>{notificationFrequencyLabel}</strong>
                                  </div>
                                </div>
                                <div className={styles.preferenceGroupHeader}>
                                  <div>
                                    <span>Preference matrix</span>
                                    <strong>Security and communication controls</strong>
                                  </div>
                                  <small>
                                    Toggle the channels you want RipX to use for this account.
                                  </small>
                                </div>
                                <div className={styles.settingsMatrix}>
                                  <div
                                    className={`${styles.settingCard} ${
                                      accountData.twoFactorEnabled
                                        ? styles.settingCardActive
                                        : styles.settingCardInactive
                                    }`}
                                  >
                                    <Checkbox
                                      label="Enable Two-Factor Authentication"
                                      checked={accountData.twoFactorEnabled}
                                      onChange={v =>
                                        setAccountData({ ...accountData, twoFactorEnabled: v })
                                      }
                                      helpText="Add an extra layer of security to your account"
                                    />
                                  </div>
                                  <div
                                    className={`${styles.settingCard} ${
                                      accountData.emailNotifications
                                        ? styles.settingCardActive
                                        : styles.settingCardInactive
                                    }`}
                                  >
                                    <Checkbox
                                      label="Email Notifications"
                                      checked={accountData.emailNotifications}
                                      onChange={v =>
                                        setAccountData({ ...accountData, emailNotifications: v })
                                      }
                                      helpText="Receive email updates about your tests"
                                    />
                                  </div>
                                  <div
                                    className={`${styles.settingCard} ${
                                      accountData.pushNotifications
                                        ? styles.settingCardActive
                                        : styles.settingCardInactive
                                    }`}
                                  >
                                    <Checkbox
                                      label="Push Notifications"
                                      checked={accountData.pushNotifications}
                                      onChange={v =>
                                        setAccountData({ ...accountData, pushNotifications: v })
                                      }
                                      helpText="Receive browser push notifications"
                                    />
                                  </div>
                                  <div
                                    className={`${styles.settingCard} ${
                                      accountData.weeklyReports
                                        ? styles.settingCardActive
                                        : styles.settingCardInactive
                                    }`}
                                  >
                                    <Checkbox
                                      label="Weekly Reports"
                                      checked={accountData.weeklyReports}
                                      onChange={v =>
                                        setAccountData({ ...accountData, weeklyReports: v })
                                      }
                                      helpText="Get weekly summary reports via email"
                                    />
                                  </div>
                                  <div
                                    className={`${styles.settingCard} ${
                                      accountData.significanceAlerts
                                        ? styles.settingCardActive
                                        : styles.settingCardInactive
                                    }`}
                                  >
                                    <Checkbox
                                      label="Significance alerts"
                                      checked={accountData.significanceAlerts}
                                      onChange={v =>
                                        setAccountData({ ...accountData, significanceAlerts: v })
                                      }
                                      helpText="Email me when a test reaches statistical significance"
                                    />
                                  </div>
                                  <div
                                    className={`${styles.settingCard} ${styles.settingCardStrong}`}
                                  >
                                    <span>Delivery cadence</span>
                                    <strong>{notificationFrequencyLabel}</strong>
                                    <Select
                                      label="Notification frequency"
                                      options={[
                                        { label: 'Immediate', value: 'immediate' },
                                        { label: 'Daily digest', value: 'daily' },
                                        { label: 'Weekly digest', value: 'weekly' },
                                      ]}
                                      value={accountData.notificationFrequency || 'immediate'}
                                      onChange={v =>
                                        setAccountData({ ...accountData, notificationFrequency: v })
                                      }
                                      helpText="How often to batch email notifications"
                                    />
                                  </div>
                                </div>
                              </div>
                              <div className={styles.saveBar}>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  {enabledNotificationCount} notification channels enabled.
                                </Text>
                                <Button
                                  variant="primary"
                                  loading={saving}
                                  onClick={handleAccountUpdate}
                                >
                                  Save Changes
                                </Button>
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>
                      </div>
                    )}

                    {activeTab === 'appearance' && (
                      <div
                        id="profile-panel-appearance"
                        role="tabpanel"
                        aria-labelledby="profile-tab-appearance"
                        className={`${styles.profileContent} ${styles.profilePanelLayout}`}
                      >
                        <Card className={styles.profilePanelCard}>
                          <Box padding="500">
                            <BlockStack gap="400">
                              <div className={styles.sectionHeader}>
                                <div className={styles.sectionHeaderIcon}>
                                  <PaintBrushFlatIcon />
                                </div>
                                <div className={styles.sectionHeaderContent}>
                                  <Text variant="headingMd" as="h2">
                                    Personal appearance
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Theme and celebration preferences are saved for your user
                                    profile, so they do not change the experience for other account
                                    members.
                                  </Text>
                                </div>
                              </div>
                              <div className={styles.panelCardBody}>
                                <div className={styles.appearancePreview}>
                                  <div className={styles.themeOrb} />
                                  <div>
                                    <span>Current appearance</span>
                                    <strong>{themeLabel}</strong>
                                    <small>
                                      Personal to this user and mirrored locally for instant theme
                                      switching.
                                    </small>
                                  </div>
                                </div>
                                <div className={styles.fieldCluster}>
                                  <div className={styles.fieldClusterHeader}>
                                    <div>
                                      <span>Theme mode</span>
                                      <small>
                                        Switch instantly or let RipX adapt to your schedule.
                                      </small>
                                    </div>
                                    <strong>{themeLabel}</strong>
                                  </div>
                                  <div className={styles.choiceGrid}>
                                    {THEME_CHOICES.map(choice => (
                                      <button
                                        key={choice.value}
                                        type="button"
                                        className={`${styles.choiceCard} ${
                                          preferences.theme === choice.value
                                            ? styles.choiceCardActive
                                            : ''
                                        }`}
                                        onClick={() => {
                                          setPreferences(p => ({ ...p, theme: choice.value }));
                                          if (choice.value !== 'custom') updateTheme(choice.value);
                                        }}
                                      >
                                        <span>{choice.label}</span>
                                        <small>{choice.detail}</small>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {preferences.theme === 'custom' && (
                                  <div className={styles.fieldCluster}>
                                    <div className={styles.fieldClusterHeader}>
                                      <div>
                                        <span>Custom schedule</span>
                                        <small>
                                          Define when light and dark modes should hand off.
                                        </small>
                                      </div>
                                      <strong>
                                        {preferences.customThemeStart ?? 7}:00 -{' '}
                                        {preferences.customThemeEnd ?? 19}:00
                                      </strong>
                                    </div>
                                    <div className={styles.formGrid2}>
                                      <Select
                                        label="Light Theme Start"
                                        options={Array.from({ length: 24 }, (_, i) => ({
                                          label: `${i.toString().padStart(2, '0')}:00`,
                                          value: i.toString(),
                                        }))}
                                        value={String(preferences.customThemeStart ?? 7)}
                                        onChange={v =>
                                          setPreferences(p => ({
                                            ...p,
                                            customThemeStart: parseInt(v, 10),
                                          }))
                                        }
                                      />
                                      <Select
                                        label="Dark Theme Start"
                                        options={Array.from({ length: 24 }, (_, i) => ({
                                          label: `${i.toString().padStart(2, '0')}:00`,
                                          value: i.toString(),
                                        }))}
                                        value={String(preferences.customThemeEnd ?? 19)}
                                        onChange={v =>
                                          setPreferences(p => ({
                                            ...p,
                                            customThemeEnd: parseInt(v, 10),
                                          }))
                                        }
                                      />
                                    </div>
                                    <Button
                                      onClick={() =>
                                        updateTheme('custom', {
                                          start: preferences.customThemeStart ?? 7,
                                          end: preferences.customThemeEnd ?? 19,
                                        })
                                      }
                                    >
                                      Apply custom theme
                                    </Button>
                                  </div>
                                )}
                                <div className={styles.celebrationPanel}>
                                  <div className={styles.celebrationPreview}>
                                    <span>Celebration style</span>
                                    <strong>
                                      {celebrationMotionLabel} · {celebrationColorLabel}
                                    </strong>
                                    <small>
                                      Controls the moment after a successful test launch.
                                    </small>
                                  </div>
                                  <div className={styles.choiceGroup}>
                                    <div className={styles.choiceGroupHeader}>
                                      <span>Animation intensity</span>
                                      <small>
                                        Pick how visible the launch success moment should be.
                                      </small>
                                    </div>
                                    <div className={styles.choiceGrid}>
                                      {CELEBRATION_ANIMATION_CHOICES.map(choice => (
                                        <button
                                          key={choice.value}
                                          type="button"
                                          className={`${styles.choiceCard} ${
                                            (preferences.celebrationAnimation || 'auto') ===
                                            choice.value
                                              ? styles.choiceCardActive
                                              : ''
                                          }`}
                                          onClick={() =>
                                            setPreferences(p => ({
                                              ...p,
                                              celebrationAnimation: choice.value,
                                            }))
                                          }
                                        >
                                          <span>{choice.label}</span>
                                          <small>{choice.detail}</small>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className={styles.choiceGroup}>
                                    <div className={styles.choiceGroupHeader}>
                                      <span>Color system</span>
                                      <small>
                                        Choose whether celebrations feel playful or brand-led.
                                      </small>
                                    </div>
                                    <div className={styles.choiceGridCompact}>
                                      {CELEBRATION_COLOR_CHOICES.map(choice => (
                                        <button
                                          key={choice.value}
                                          type="button"
                                          className={`${styles.choiceCard} ${
                                            (preferences.celebrationColorTheme || 'rainbow') ===
                                            choice.value
                                              ? styles.choiceCardActive
                                              : ''
                                          }`}
                                          onClick={() =>
                                            setPreferences(p => ({
                                              ...p,
                                              celebrationColorTheme:
                                                choice.value === 'brand' ? 'brand' : 'rainbow',
                                            }))
                                          }
                                        >
                                          <span>{choice.label}</span>
                                          <small>{choice.detail}</small>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className={styles.choiceGroup}>
                                    <div className={styles.choiceGroupHeader}>
                                      <span>Motion feel</span>
                                      <small>
                                        Choose the movement style for the same celebration.
                                      </small>
                                    </div>
                                    <div className={styles.choiceGridCompact}>
                                      {CELEBRATION_MOTION_CHOICES.map(choice => (
                                        <button
                                          key={choice.value}
                                          type="button"
                                          className={`${styles.choiceCard} ${
                                            (preferences.celebrationStyle || 'dynamic') ===
                                            choice.value
                                              ? styles.choiceCardActive
                                              : ''
                                          }`}
                                          onClick={() =>
                                            setPreferences(p => ({
                                              ...p,
                                              celebrationStyle:
                                                choice.value === 'cinematic'
                                                  ? 'cinematic'
                                                  : 'dynamic',
                                            }))
                                          }
                                        >
                                          <span>{choice.label}</span>
                                          <small>{choice.detail}</small>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <div className={styles.previewActionBar}>
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      Preview celebration:
                                    </Text>
                                    <InlineStack gap="200">
                                      <Button
                                        size="slim"
                                        onClick={() => triggerCelebrationPreview('subtle')}
                                      >
                                        Subtle
                                      </Button>
                                      <Button
                                        size="slim"
                                        onClick={() => triggerCelebrationPreview('full')}
                                      >
                                        Full
                                      </Button>
                                      <Button
                                        size="slim"
                                        variant="primary"
                                        onClick={() => triggerCelebrationPreview('ultra')}
                                      >
                                        Ultra
                                      </Button>
                                    </InlineStack>
                                  </div>
                                </div>
                                {isDevBuild ? (
                                  <InlineStack align="space-between" blockAlign="center" gap="300">
                                    <Text as="span" variant="bodySm" tone="subdued">
                                      Dev testing: replay the one-time Ultra milestone celebration.
                                    </Text>
                                    <Button onClick={handleResetUltraCelebration}>
                                      Reset first-start Ultra
                                    </Button>
                                  </InlineStack>
                                ) : null}
                              </div>
                              <div className={styles.saveBar}>
                                <Text as="p" variant="bodySm" tone="subdued">
                                  Appearance saves to your user profile only.
                                </Text>
                                <Button
                                  variant="primary"
                                  loading={saving}
                                  onClick={handlePreferencesUpdate}
                                >
                                  Save appearance
                                </Button>
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>
                      </div>
                    )}
                  </div>
                </BlockStack>
              </main>
            </div>
          </div>
        </div>
      </Page>
    </PageShell>
  );
}

export default Profile;
