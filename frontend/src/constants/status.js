/**
 * Status Constants
 * 
 * Application-wide status and state constants
 */

export const TEST_STATUS = {
  DRAFT: 'draft',
  RUNNING: 'running',
  STOPPED: 'stopped',
  COMPLETED: 'completed',
  ALL: 'all'
};

export const TEST_STATUS_LABELS = {
  [TEST_STATUS.DRAFT]: 'Draft',
  [TEST_STATUS.RUNNING]: 'Running',
  [TEST_STATUS.STOPPED]: 'Stopped',
  [TEST_STATUS.COMPLETED]: 'Completed',
  [TEST_STATUS.ALL]: 'All'
};

export const TEST_STATUS_OPTIONS = [
  { label: 'All', value: TEST_STATUS.ALL },
  { label: 'Draft', value: TEST_STATUS.DRAFT },
  { label: 'Running', value: TEST_STATUS.RUNNING },
  { label: 'Stopped', value: TEST_STATUS.STOPPED },
  { label: 'Completed', value: TEST_STATUS.COMPLETED }
];

export const TEST_TYPES = {
  PRICE: 'price',
  CONTENT: 'content',
  SHIPPING: 'shipping',
  OFFER: 'offer',
  THEME: 'theme'
};

export const TEST_TYPE_ICONS = {
  [TEST_TYPES.PRICE]: '💰',
  [TEST_TYPES.CONTENT]: '📝',
  [TEST_TYPES.SHIPPING]: '🚚',
  [TEST_TYPES.OFFER]: '🎁',
  [TEST_TYPES.THEME]: '🎨',
  default: '🧪'
};

export const HEALTH_LEVELS = {
  EXCELLENT: 'excellent',
  GOOD: 'good',
  FAIR: 'fair',
  POOR: 'poor'
};

export const HEALTH_COLORS = {
  [HEALTH_LEVELS.EXCELLENT]: 'success',
  [HEALTH_LEVELS.GOOD]: 'attention',
  [HEALTH_LEVELS.FAIR]: 'warning',
  [HEALTH_LEVELS.POOR]: 'critical'
};

