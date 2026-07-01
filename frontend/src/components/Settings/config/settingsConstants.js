import { ChartVerticalIcon, DataTableIcon } from '@shopify/polaris-icons';

export const WEBHOOK_EVENT_CHOICES = [
  { label: 'When test completes', value: 'test_complete' },
  { label: 'When significance is reached', value: 'significance' },
];

export const INTEGRATIONS_CONFIG = [
  {
    key: 'ga4',
    title: 'Google Analytics 4',
    Icon: ChartVerticalIcon,
    iconClass: 'ga4',
    configHint:
      'Get Measurement ID and API secret from GA4 Admin → Data Streams → Web stream → Measurement Protocol API secrets.',
  },
  {
    key: 'bigquery',
    title: 'BigQuery',
    Icon: DataTableIcon,
    iconClass: 'bigquery',
    configHint: 'Paste your Google Cloud service account JSON key for BigQuery export.',
  },
];

export const SETTINGS_PRESETS = {
  recommended: {
    label: 'Recommended',
    description: 'Best for most stores — balanced speed and accuracy',
    minSampleSize: 100,
    confidenceLevel: 0.95,
    autoStopEnabled: true,
  },
  conservative: {
    label: 'Conservative',
    description: 'Higher certainty — waits for more data before declaring winners',
    minSampleSize: 500,
    confidenceLevel: 0.99,
    autoStopEnabled: true,
  },
  aggressive: {
    label: 'Fast',
    description: 'Quick results — lower sample size, faster decisions',
    minSampleSize: 50,
    confidenceLevel: 0.9,
    autoStopEnabled: true,
  },
};

export const SAMPLE_SIZE_QUICK = [50, 100, 250, 500, 1000];

export const CONFIDENCE_QUICK = [
  { label: '90%', value: 0.9 },
  { label: '95%', value: 0.95 },
  { label: '99%', value: 0.99 },
];

export const APP_SETTINGS_SECTION_IDS = [
  'installation',
  'general',
  'integrations',
  'presets',
  'advanced',
];

export const DEFAULT_SETTINGS = {
  minSampleSize: 100,
  confidenceLevel: 0.95,
  autoStopEnabled: true,
  outboundWebhookUrl: '',
  outboundWebhookEvents: ['test_complete', 'significance'],
};

export const DEFAULT_INTEGRATION_CONFIG = {
  ga4MeasurementId: '',
  ga4ApiSecret: '',
  bigqueryProjectId: '',
  bigqueryDataset: 'ripx_analytics',
  bigqueryCredentials: '',
};
