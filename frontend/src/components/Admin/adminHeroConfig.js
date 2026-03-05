/**
 * Admin hero config: path -> { title, subtitle, icon }
 * Used by AdminPageLayout for consistent hero across all admin pages.
 */
import { ROUTES } from '../../constants';
import {
  HomeIcon,
  ProfileIcon,
  GlobeIcon,
  ClipboardChecklistIcon,
  ListBulletedIcon,
  KeyIcon,
  ClockIcon,
  FlagIcon,
  LinkIcon,
  ChartVerticalIcon,
  EmailIcon,
} from '@shopify/polaris-icons';

export const ADMIN_HERO_CONFIG = {
  [ROUTES.ADMIN_OVERVIEW]: {
    title: 'Admin overview',
    subtitle: 'Platform-wide metrics and quick actions. Click a stat card to open that list.',
    icon: HomeIcon,
  },
  [ROUTES.ADMIN_USERS]: {
    title: 'Users',
    subtitle:
      'View, search, and manage user accounts. Set roles, lock or unlock, and export to CSV.',
    icon: ProfileIcon,
  },
  [ROUTES.ADMIN_DOMAINS]: {
    title: 'Domains',
    subtitle: 'Tenant domains and status. View details, suspend or unsuspend access.',
    icon: GlobeIcon,
  },
  [ROUTES.ADMIN_TESTS]: {
    title: 'Tests',
    subtitle: 'All tests across shops. View, filter, and manage from the admin panel.',
    icon: ClipboardChecklistIcon,
  },
  [ROUTES.ADMIN_AUDIT]: {
    title: 'Audit log',
    subtitle: 'Platform audit trail. Export to CSV for compliance.',
    icon: ListBulletedIcon,
  },
  [ROUTES.ADMIN_KV]: {
    title: 'Key-value store',
    subtitle: 'Global key-value configuration. Get, set, and delete keys.',
    icon: KeyIcon,
  },
  [ROUTES.ADMIN_JOBS]: {
    title: 'Jobs',
    subtitle: 'Background job queues. View and retry failed jobs.',
    icon: ClockIcon,
  },
  [ROUTES.ADMIN_FEATURE_FLAGS]: {
    title: 'Feature flags',
    subtitle: 'Enable or disable features per shop or globally.',
    icon: FlagIcon,
  },
  [ROUTES.ADMIN_PROMO_LINKS]: {
    title: 'Promo links',
    subtitle: 'Manage promo links across all shops.',
    icon: LinkIcon,
  },
  [ROUTES.ADMIN_BLOCK_LIST]: {
    title: 'Block list',
    subtitle: 'Blocked domains or stores. Control access by domain.',
    icon: GlobeIcon,
  },
  [ROUTES.ADMIN_WEBHOOK_EVENTS]: {
    title: 'Webhook events',
    subtitle: 'Incoming webhook event log. Debug and monitor delivery.',
    icon: ListBulletedIcon,
  },
  [ROUTES.ADMIN_TARGETING_PRESETS]: {
    title: 'Targeting presets',
    subtitle: 'Reusable targeting presets for tests.',
    icon: ClipboardChecklistIcon,
  },
  [ROUTES.ADMIN_WEBHOOKS]: {
    title: 'Outbound webhooks',
    subtitle: 'Configure outbound webhook endpoints.',
    icon: LinkIcon,
  },
  [ROUTES.ADMIN_SHOP_SESSIONS]: {
    title: 'Shop sessions',
    subtitle: 'Shopify shop sessions and access tokens.',
    icon: ProfileIcon,
  },
  [ROUTES.ADMIN_CONFLICTS]: {
    title: 'Conflict detection',
    subtitle: 'View and resolve test conflicts.',
    icon: ListBulletedIcon,
  },
  [ROUTES.ADMIN_TEST_HEALTH]: {
    title: 'Test health',
    subtitle: 'Health scores and issues for running tests.',
    icon: ClipboardChecklistIcon,
  },
  [ROUTES.ADMIN_SHOP_SETTINGS_OVERRIDES]: {
    title: 'Shop settings overrides',
    subtitle: 'Override min sample size, confidence, and auto-stop per shop.',
    icon: KeyIcon,
  },
  [ROUTES.ADMIN_RATE_LIMIT_OVERRIDES]: {
    title: 'Rate limit overrides',
    subtitle: 'Override rate limits per shop or API key.',
    icon: FlagIcon,
  },
  [ROUTES.ADMIN_NOTIFICATIONS]: {
    title: 'Notifications',
    subtitle: 'Platform notification settings and templates.',
    icon: ListBulletedIcon,
  },
  [ROUTES.ADMIN_SIGNIFICANCE_ALERTS]: {
    title: 'Significance alerts',
    subtitle: 'Configure significance alert thresholds and delivery.',
    icon: FlagIcon,
  },
  [ROUTES.ADMIN_EVENT_CATALOG]: {
    title: 'Event catalog',
    subtitle: 'Tracked event types and schema.',
    icon: ListBulletedIcon,
  },
  [ROUTES.ADMIN_CLIENT_ERRORS]: {
    title: 'Client errors',
    subtitle: 'Client-side errors reported by the app.',
    icon: ListBulletedIcon,
  },
  [ROUTES.ADMIN_CONSENT_SCRIPT]: {
    title: 'Consent & script',
    subtitle: 'Consent mode and storefront script configuration.',
    icon: KeyIcon,
  },
  [ROUTES.ADMIN_ACCOUNTS]: {
    title: 'Accounts',
    subtitle: 'Multi-store accounts and linked domains.',
    icon: ProfileIcon,
  },
  [ROUTES.ADMIN_AGGREGATION]: {
    title: 'Analytics aggregation',
    subtitle: 'Trigger and monitor analytics aggregation jobs.',
    icon: ClockIcon,
  },
  [ROUTES.ADMIN_LEGAL]: {
    title: 'Terms & Privacy',
    subtitle: 'Terms of service and privacy policy URLs.',
    icon: KeyIcon,
  },
  [ROUTES.ADMIN_MAINTENANCE]: {
    title: 'Maintenance mode',
    subtitle: 'Enable or disable maintenance mode and set message.',
    icon: ClockIcon,
  },
  [ROUTES.ADMIN_ANNOUNCEMENT_BANNER]: {
    title: 'Announcement banner',
    subtitle: 'Global announcement banner text and visibility.',
    icon: FlagIcon,
  },
  [ROUTES.ADMIN_MAIL_PROCESSES]: {
    title: 'Email delivery',
    subtitle: 'Control which transactional emails are sent and customize their templates.',
    icon: EmailIcon,
  },
  [ROUTES.ADMIN_USAGE_EXPORT]: {
    title: 'Usage export',
    subtitle: 'Export usage and analytics data.',
    icon: ChartVerticalIcon,
  },
};
