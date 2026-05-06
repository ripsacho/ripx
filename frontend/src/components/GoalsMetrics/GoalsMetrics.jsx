import React, { useEffect, useMemo, useState } from 'react';
import {
  ActionList,
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Modal,
  Popover,
  Select,
  Text,
  TextField,
} from '@shopify/polaris';
import { useParams } from 'react-router-dom';
import {
  deleteGoalMetricDefinition,
  getGoalMetricDefinitions,
  saveGoalMetricDefinition,
} from '../../services/goalMetricsApi';
import {
  getDefinitionHealth as getDefinitionHealthHelper,
  getRoleLabel as getRoleLabelHelper,
  getUnknownSearchPrefixes,
  matchesSearchQuery as matchesSearchQueryHelper,
  needsAttention,
  normalizeEventName as normalizeEventNameHelper,
} from './goalMetricsUtils';
import styles from './GoalsMetrics.module.css';

const EMPTY_DRAFT = {
  name: '',
  event_name: '',
  description: '',
  category: 'custom',
  aggregation: 'count',
  direction: 'increase',
  metric_role: 'secondary',
  trigger_type: 'custom_event',
  tags: '',
  trigger_config: {
    selector: '',
    url_pattern: '',
    parameter_name: '',
    visibility_threshold: 50,
    visibility_min_duration_ms: 0,
    visibility_frequency: 'once_per_page',
    observe_dom_changes: true,
    custom_javascript: '',
    custom_javascript_interval_ms: 1000,
    custom_javascript_max_wait_ms: 10000,
    min_relative_lift: '',
  },
};

const TRIGGER_LABELS = {
  custom_event: 'Manual custom event',
  url_match: 'URL match',
  css_click: 'CSS click',
  form_start: 'Form start',
  form_submit: 'Form submit',
  element_visibility: 'Element visibility',
  custom_javascript: 'Custom JavaScript',
};

const ROLE_FILTER_OPTIONS = [
  { label: 'All roles', value: 'all' },
  { label: 'Primary candidates', value: 'primary' },
  { label: 'Secondary goals', value: 'secondary' },
  { label: 'Guardrails', value: 'guardrail' },
];

const TRIGGER_FILTER_OPTIONS = [
  { label: 'All triggers', value: 'all' },
  { label: 'Manual custom event', value: 'custom_event' },
  { label: 'URL match', value: 'url_match' },
  { label: 'CSS click selector', value: 'css_click' },
  { label: 'Form start selector', value: 'form_start' },
  { label: 'Form submit selector', value: 'form_submit' },
  { label: 'Element visibility', value: 'element_visibility' },
  { label: 'Custom JavaScript rule', value: 'custom_javascript' },
];

const SOURCE_FILTER_OPTIONS = [
  { label: 'All definitions', value: 'all' },
  { label: 'Built-in only', value: 'builtin' },
  { label: 'Custom only', value: 'custom' },
];

const QUICK_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Observed', value: 'observed' },
  { label: 'Auto triggers', value: 'auto' },
  { label: 'Needs attention', value: 'attention' },
  { label: 'Guardrails', value: 'guardrail' },
  { label: 'Custom', value: 'custom' },
];

const SEARCH_HELP =
  'Try checkout, tag:lead, key:add_to_cart, trigger:visibility, role:guardrail, source:custom, status:observed.';

const SEARCH_EXAMPLES = [
  { label: 'Observed events', query: 'status:observed' },
  { label: 'Lead tags', query: 'tag:lead' },
  { label: 'Visibility triggers', query: 'trigger:visibility' },
  { label: 'Custom source', query: 'source:custom' },
];

const SORT_LABELS = {
  last_seen_at: 'Last fired',
  metric_role: 'Role',
  name: 'Event',
  observed_count: 'Fires',
  status: 'Status',
  trigger_type: 'Trigger',
  updated_at: 'Last edited',
};

const BUSINESS_METRIC_CARDS = [
  {
    label: 'Conversion rate',
    value: 'Covered',
    detail:
      'Primary winner metric in Test Wizard. Calculated from conversions divided by visitors.',
    tone: 'success',
  },
  {
    label: 'Revenue per visitor',
    value: 'Available',
    detail: 'Uses revenue divided by visitors. Best for balancing purchase rate and order value.',
    tone: 'success',
  },
  {
    label: 'Profit per visitor',
    value: 'Covered',
    detail: 'Primary winner metric in Test Wizard when COGS is configured.',
    tone: 'success',
  },
  {
    label: 'Average order value',
    value: 'Covered',
    detail: 'Primary winner metric in Test Wizard. Calculated from revenue divided by conversions.',
    tone: 'success',
  },
];

const TABLE_INITIAL_ROWS = 10;
const TABLE_LOAD_MORE_ROWS = 10;

const SMART_TRIGGER_PRESETS = [
  {
    type: 'custom_event',
    title: 'Data layer',
    description: 'Best when your theme or app already pushes event data.',
    config: { parameter_name: 'value' },
  },
  {
    type: 'css_click',
    title: 'Click',
    description: 'Track important CTA, chat, or support clicks.',
    config: { selector: '.button, [data-ripx-track]' },
  },
  {
    type: 'form_submit',
    title: 'Form',
    description: 'Track lead, quote, or newsletter form submissions.',
    config: { selector: 'form.newsletter, form.contact-form' },
  },
  {
    type: 'element_visibility',
    title: 'Visibility',
    description: 'Track when a shopper actually sees an offer.',
    config: {
      selector: '.hero, .hero-banner, [data-ripx-hero]',
      visibility_threshold: 60,
      visibility_min_duration_ms: 1000,
    },
  },
];

const CUSTOM_JS_VARIABLE_RECIPES = [
  {
    title: 'DOM value variable',
    description: 'Read text or value from a stable selector.',
    code: "try {\n  const el = document.querySelector('[data-ripx-value]');\n  if (!el) return false;\n  const value = Number(el.value || el.textContent || 0);\n  return Number.isFinite(value) ? { value, metadata: { source: 'dom' } } : false;\n} catch (error) {\n  return false;\n}",
  },
  {
    title: 'URL parameter variable',
    description: 'Use a query parameter as an event value.',
    code: "try {\n  const params = new URLSearchParams(window.location.search);\n  const campaign = params.get('utm_campaign');\n  return campaign ? { value: 1, metadata: { campaign } } : false;\n} catch (error) {\n  return false;\n}",
  },
  {
    title: 'Data layer variable',
    description: 'Read the latest matching dataLayer object.',
    code: "try {\n  const layer = Array.isArray(window.dataLayer) ? window.dataLayer : [];\n  const latest = [...layer].reverse().find(item => item && item.cart_value);\n  return latest ? { value: Number(latest.cart_value) || 1, metadata: { source: 'dataLayer' } } : false;\n} catch (error) {\n  return false;\n}",
  },
];

const EVENT_PARAMETER_PRESETS = [
  {
    label: 'Cart value',
    value: 'cart_value',
    hint: 'Numeric revenue or cart total for sum metrics.',
  },
  {
    label: 'Product ID',
    value: 'product_id',
    hint: 'Metadata for product interaction events.',
  },
  {
    label: 'Campaign',
    value: 'campaign',
    hint: 'Metadata from URL, promo, or campaign logic.',
  },
  {
    label: 'Element ID',
    value: 'element_id',
    hint: 'Metadata for click or visibility targets.',
  },
];

const STARTER_TEMPLATES = [
  {
    title: 'Lead Form Submit',
    description: 'Track newsletter, quote, or contact form submissions without extra code.',
    badge: 'Form',
    draft: {
      name: 'Lead form submit',
      event_name: 'lead_form_submit',
      description: 'Fires when a shopper submits a lead capture form.',
      category: 'lead',
      aggregation: 'count',
      direction: 'increase',
      metric_role: 'secondary',
      trigger_type: 'form_submit',
      trigger_config: {
        ...EMPTY_DRAFT.trigger_config,
        selector: 'form.newsletter, form.contact-form',
      },
      tags: 'lead, form',
    },
  },
  {
    title: 'Hero Offer Seen',
    description: 'Measure if a shopper actually saw a promotion or key page section.',
    badge: 'Visibility',
    draft: {
      name: 'Hero offer seen',
      event_name: 'hero_offer_seen',
      description: 'Fires when a shopper sees the hero offer area for at least one second.',
      category: 'commerce',
      aggregation: 'count',
      direction: 'increase',
      metric_role: 'secondary',
      trigger_type: 'element_visibility',
      trigger_config: {
        ...EMPTY_DRAFT.trigger_config,
        selector: '.hero, .hero-banner, [data-ripx-hero]',
        visibility_threshold: 60,
        visibility_min_duration_ms: 1000,
        visibility_frequency: 'once_per_page',
        observe_dom_changes: true,
      },
      tags: 'visibility, offer',
    },
  },
  {
    title: 'Support Risk Guardrail',
    description: 'Use support or help clicks as a guardrail when testing stronger offers.',
    badge: 'Guardrail',
    draft: {
      name: 'Support click guardrail',
      event_name: 'support_click',
      description: 'Fires when shoppers click help, chat, or support links.',
      category: 'guardrail',
      aggregation: 'count',
      direction: 'decrease',
      metric_role: 'guardrail',
      trigger_type: 'css_click',
      trigger_config: {
        ...EMPTY_DRAFT.trigger_config,
        selector: 'a[href*="support"], a[href*="help"], [data-chat-widget]',
        min_relative_lift: 10,
      },
      tags: 'guardrail, support',
    },
  },
  {
    title: 'Advanced DOM Rule',
    description: 'Fire when custom storefront logic detects a state GTM selectors cannot express.',
    badge: 'JavaScript',
    draft: {
      name: 'Promo rule matched',
      event_name: 'promo_rule_matched',
      description: 'Fires when a trusted JavaScript rule returns true or a value.',
      category: 'custom',
      aggregation: 'count',
      direction: 'increase',
      metric_role: 'secondary',
      trigger_type: 'custom_javascript',
      trigger_config: {
        ...EMPTY_DRAFT.trigger_config,
        custom_javascript:
          "try {\n  const promo = document.querySelector('[data-promo-active=\"true\"]');\n  return promo ? { value: 1, metadata: { promo_id: promo.getAttribute('data-promo-id') || '' } } : false;\n} catch (error) {\n  return false;\n}",
        custom_javascript_interval_ms: 1000,
        custom_javascript_max_wait_ms: 10000,
      },
      tags: 'javascript, advanced',
    },
  },
];

function normalizeEventName(value) {
  return normalizeEventNameHelper(value);
}

function getTriggerSummary(definition) {
  const config = definition.trigger_config || {};
  if (definition.trigger_type === 'url_match') {
    return config.url_pattern ? `URL matches ${config.url_pattern}` : 'URL match trigger';
  }
  if (definition.trigger_type === 'css_click') {
    return config.selector ? `Click selector ${config.selector}` : 'CSS click trigger';
  }
  if (definition.trigger_type === 'form_start') {
    return config.selector ? `Form start selector ${config.selector}` : 'Form start trigger';
  }
  if (definition.trigger_type === 'form_submit') {
    return config.selector ? `Form selector ${config.selector}` : 'Form submit trigger';
  }
  if (definition.trigger_type === 'element_visibility') {
    return config.selector
      ? `Visible ${config.visibility_threshold || 50}%: ${config.selector}`
      : 'Element visibility trigger';
  }
  if (definition.trigger_type === 'custom_javascript') {
    return 'Custom JavaScript rule';
  }
  return 'Manual custom event';
}

function getTrackingSnippet(draft) {
  const eventName = normalizeEventName(draft.event_name || draft.name) || 'event_name';
  if (draft.trigger_type === 'url_match') {
    return `Automatically fires when the current URL matches: ${
      draft.trigger_config.url_pattern || '/collections/*'
    }`;
  }
  if (draft.trigger_type === 'css_click') {
    return `Automatically fires when a shopper clicks: ${
      draft.trigger_config.selector || '.add-to-cart-button'
    }`;
  }
  if (draft.trigger_type === 'form_start') {
    return `Automatically fires once when a shopper starts interacting with: ${
      draft.trigger_config.selector || 'form'
    }`;
  }
  if (draft.trigger_type === 'form_submit') {
    return `Automatically fires when a shopper submits: ${
      draft.trigger_config.selector || 'form.newsletter'
    }`;
  }
  if (draft.trigger_type === 'element_visibility') {
    return `Automatically fires when ${draft.trigger_config.selector || '.hero-banner'} is at least ${
      draft.trigger_config.visibility_threshold || 50
    }% visible${
      Number(draft.trigger_config.visibility_min_duration_ms || 0) > 0
        ? ` for ${draft.trigger_config.visibility_min_duration_ms}ms`
        : ''
    }.`;
  }
  if (draft.trigger_type === 'custom_javascript') {
    return `Return true, a number, or { value, metadata } from your rule:

${draft.trigger_config.custom_javascript || "return document.querySelector('.promo-banner') !== null;"}`;
  }
  return `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: '${eventName}',
  ${draft.trigger_config.parameter_name || 'value'}: value
});`;
}

function formatDateTime(value, fallback = 'Never') {
  if (!value) {
    return fallback;
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch (_) {
    return fallback;
  }
}

function getDefinitionHealth(item) {
  return getDefinitionHealthHelper(item);
}

function cloneDraft(templateDraft) {
  return {
    ...EMPTY_DRAFT,
    ...templateDraft,
    trigger_config: {
      ...EMPTY_DRAFT.trigger_config,
      ...(templateDraft.trigger_config || {}),
    },
  };
}

function definitionToDraft(definition, options = {}) {
  const suffix = options.duplicate ? '_copy' : '';
  const namePrefix = options.duplicate ? 'Copy of ' : '';
  return cloneDraft({
    name: `${namePrefix}${definition.name || ''}`.slice(0, 120),
    event_name: normalizeEventName(`${definition.event_name || definition.name || ''}${suffix}`),
    description: definition.description || '',
    category: definition.category || 'custom',
    aggregation: definition.aggregation || 'count',
    direction: definition.direction || 'increase',
    metric_role: definition.metric_role || 'secondary',
    trigger_type: definition.trigger_type || 'custom_event',
    trigger_config: definition.trigger_config || {},
    tags: Array.isArray(definition.tags) ? definition.tags.join(', ') : '',
  });
}

function getRoleLabel(role) {
  return getRoleLabelHelper(role);
}

function getReadinessItems(draft) {
  const eventName = normalizeEventName(draft.event_name || draft.name);
  const items = [
    { label: 'Name added', ready: Boolean(draft.name.trim()) },
    { label: 'Event key valid', ready: Boolean(eventName) },
    { label: 'Metric role selected', ready: Boolean(draft.metric_role) },
  ];
  if (draft.aggregation === 'sum') {
    items.push({
      label: 'Value parameter added',
      ready: Boolean(draft.trigger_config.parameter_name.trim()),
    });
  }
  if (draft.trigger_type === 'url_match') {
    items.push({
      label: 'URL pattern added',
      ready: Boolean(draft.trigger_config.url_pattern.trim()),
    });
  }
  if (
    draft.trigger_type === 'css_click' ||
    draft.trigger_type === 'form_start' ||
    draft.trigger_type === 'form_submit' ||
    draft.trigger_type === 'element_visibility'
  ) {
    items.push({
      label: 'CSS selector added',
      ready: Boolean(draft.trigger_config.selector.trim()),
    });
  }
  if (draft.trigger_type === 'custom_javascript') {
    items.push({
      label: 'JavaScript rule added',
      ready: Boolean(draft.trigger_config.custom_javascript.trim()),
    });
  }
  if (draft.metric_role === 'guardrail') {
    items.push({ label: 'Guardrail direction reviewed', ready: Boolean(draft.direction) });
  }
  return items;
}

function getAssistantGuidance(draft, readinessItems) {
  const incompleteItem = readinessItems.find(item => !item.ready);
  const eventName = normalizeEventName(draft.event_name || draft.name) || 'event_name';
  const triggerGuidance = {
    custom_event: {
      title: 'Use a data layer style event',
      insight: `RipX will listen for ${eventName} from storefront code or dataLayer pushes.`,
      nextAction: 'Confirm the event key matches the event your storefront will push.',
    },
    url_match: {
      title: 'Use a page view rule',
      insight: 'Great for thank-you pages, collection pages, or landing pages with stable URLs.',
      nextAction: 'Add a URL pattern such as /thank-you or /collections/*.',
    },
    css_click: {
      title: 'Use an interaction rule',
      insight: 'Best for high-intent clicks like add to cart, help links, or promo CTAs.',
      nextAction: 'Use a stable CSS selector or a data-ripx attribute when possible.',
    },
    form_submit: {
      title: 'Use a form completion rule',
      insight: 'Best for lead capture, quote request, newsletter, and contact forms.',
      nextAction: 'Point this at the exact form selector that should count as success.',
    },
    form_start: {
      title: 'Use a form start rule',
      insight: 'Best for spotting form friction before shoppers abandon.',
      nextAction: 'Point this at the form selector where typing or changing a field should count.',
    },
    element_visibility: {
      title: 'Use an exposure rule',
      insight: 'Best when seeing an offer matters more than clicking it.',
      nextAction: 'Set the selector, visibility threshold, and minimum visible duration.',
    },
    custom_javascript: {
      title: 'Use an advanced storefront rule',
      insight:
        'Best for states that selectors cannot express, such as app widgets or custom DOM logic.',
      nextAction: 'Return true, a number, or { value, metadata } from trusted JavaScript.',
    },
  };
  return {
    ...(triggerGuidance[draft.trigger_type] || triggerGuidance.custom_event),
    blocker: incompleteItem ? incompleteItem.label : 'All required setup is complete',
  };
}

function matchesSearchQuery(item, query) {
  return matchesSearchQueryHelper(item, query, TRIGGER_LABELS);
}

function GoalsMetrics() {
  const { domain = '' } = useParams();
  const [definitions, setDefinitions] = useState([]);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [triggerFilter, setTriggerFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [quickFilter, setQuickFilter] = useState('all');
  const [tableDensity, setTableDensity] = useState('comfortable');
  const [visibleRowLimit, setVisibleRowLimit] = useState(TABLE_INITIAL_ROWS);
  const [sortConfig, setSortConfig] = useState({ key: 'observed_count', direction: 'desc' });
  const [editingEventName, setEditingEventName] = useState('');
  const [actionMenuEvent, setActionMenuEvent] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderRailSection, setBuilderRailSection] = useState('templates');
  const [detailDefinition, setDetailDefinition] = useState(null);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchDefinitions = async () => {
    setLoading(true);
    setError('');
    try {
      setDefinitions(await getGoalMetricDefinitions(domain));
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not load goals and metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDefinitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  useEffect(() => {
    if (!builderOpen) {
      document.body.removeAttribute('data-ripx-goal-builder-open');
      return undefined;
    }
    document.body.setAttribute('data-ripx-goal-builder-open', 'true');
    return () => {
      document.body.removeAttribute('data-ripx-goal-builder-open');
    };
  }, [builderOpen]);

  const stats = useMemo(() => {
    const custom = definitions.filter(item => !item.builtin).length;
    const observed = definitions.reduce((sum, item) => sum + Number(item.observed_count || 0), 0);
    const guardrails = definitions.filter(item => item.metric_role === 'guardrail').length;
    const automated = definitions.filter(item => item.trigger_type !== 'custom_event').length;
    const attention = definitions.filter(needsAttention).length;
    return { total: definitions.length, custom, observed, guardrails, automated, attention };
  }, [definitions]);
  const unknownSearchPrefixes = useMemo(() => getUnknownSearchPrefixes(searchQuery), [searchQuery]);

  const visibleStats = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const visible = definitions.filter(item => {
      if (roleFilter !== 'all' && item.metric_role !== roleFilter) {
        return false;
      }
      if (triggerFilter !== 'all' && item.trigger_type !== triggerFilter) {
        return false;
      }
      if (sourceFilter === 'builtin' && !item.builtin) {
        return false;
      }
      if (sourceFilter === 'custom' && item.builtin) {
        return false;
      }
      if (quickFilter === 'observed' && Number(item.observed_count || 0) <= 0) {
        return false;
      }
      if (quickFilter === 'auto' && item.trigger_type === 'custom_event') {
        return false;
      }
      if (quickFilter === 'attention' && !needsAttention(item)) {
        return false;
      }
      if (quickFilter === 'guardrail' && item.metric_role !== 'guardrail') {
        return false;
      }
      if (quickFilter === 'custom' && item.builtin) {
        return false;
      }
      return matchesSearchQuery(item, query);
    });
    return {
      total: visible.length,
      custom: visible.filter(item => !item.builtin).length,
      observed: visible.reduce((sum, item) => sum + Number(item.observed_count || 0), 0),
      guardrails: visible.filter(item => item.metric_role === 'guardrail').length,
      automated: visible.filter(item => item.trigger_type !== 'custom_event').length,
      attention: visible.filter(needsAttention).length,
    };
  }, [definitions, quickFilter, roleFilter, searchQuery, sourceFilter, triggerFilter]);

  const quickFilterCounts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const base = definitions.filter(item => {
      if (roleFilter !== 'all' && item.metric_role !== roleFilter) {
        return false;
      }
      if (triggerFilter !== 'all' && item.trigger_type !== triggerFilter) {
        return false;
      }
      if (sourceFilter === 'builtin' && !item.builtin) {
        return false;
      }
      if (sourceFilter === 'custom' && item.builtin) {
        return false;
      }
      return matchesSearchQuery(item, query);
    });
    return {
      all: base.length,
      attention: base.filter(needsAttention).length,
      auto: base.filter(item => item.trigger_type !== 'custom_event').length,
      custom: base.filter(item => !item.builtin).length,
      guardrail: base.filter(item => item.metric_role === 'guardrail').length,
      observed: base.filter(item => Number(item.observed_count || 0) > 0).length,
    };
  }, [definitions, roleFilter, searchQuery, sourceFilter, triggerFilter]);

  const readinessItems = useMemo(() => getReadinessItems(draft), [draft]);
  const readinessComplete = readinessItems.every(item => item.ready);
  const readinessScore = Math.round(
    (readinessItems.filter(item => item.ready).length / readinessItems.length) * 100
  );
  const assistantGuidance = useMemo(
    () => getAssistantGuidance(draft, readinessItems),
    [draft, readinessItems]
  );
  const normalizedDraftEventKey = normalizeEventName(draft.event_name || draft.name);
  const identityReady = Boolean(draft.name.trim()) && Boolean(normalizedDraftEventKey);
  const triggerReady =
    draft.trigger_type === 'custom_event' ||
    (draft.trigger_type === 'url_match' && Boolean(draft.trigger_config.url_pattern.trim())) ||
    ((draft.trigger_type === 'css_click' ||
      draft.trigger_type === 'form_start' ||
      draft.trigger_type === 'form_submit' ||
      draft.trigger_type === 'element_visibility') &&
      Boolean(draft.trigger_config.selector.trim())) ||
    (draft.trigger_type === 'custom_javascript' &&
      Boolean(draft.trigger_config.custom_javascript.trim()));
  const documentationReady = Boolean(draft.description.trim()) || Boolean(draft.tags.trim());
  const identityProgressClass = identityReady
    ? styles.builderProgressItemDone
    : styles.builderProgressItemActive;
  let triggerProgressClass = styles.builderProgressItem;
  if (triggerReady) {
    triggerProgressClass = styles.builderProgressItemDone;
  } else if (identityReady) {
    triggerProgressClass = styles.builderProgressItemActive;
  }
  let documentationProgressClass = styles.builderProgressItem;
  if (documentationReady) {
    documentationProgressClass = styles.builderProgressItemDone;
  } else if (triggerReady) {
    documentationProgressClass = styles.builderProgressItemActive;
  }
  const schemaPropertyName =
    draft.trigger_config.parameter_name.trim() ||
    (draft.aggregation === 'sum' ? 'value_required' : 'value');
  const schemaPropertyType = draft.aggregation === 'sum' ? 'number required' : 'number optional';
  const dataLayerEventSnippet = `window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: '${normalizedDraftEventKey || 'event_key'}',
  ${schemaPropertyName}: ${draft.aggregation === 'sum' ? '123.45' : '1'}
});`;

  const filteredDefinitions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = definitions.filter(item => {
      if (roleFilter !== 'all' && item.metric_role !== roleFilter) {
        return false;
      }
      if (triggerFilter !== 'all' && item.trigger_type !== triggerFilter) {
        return false;
      }
      if (sourceFilter === 'builtin' && !item.builtin) {
        return false;
      }
      if (sourceFilter === 'custom' && item.builtin) {
        return false;
      }
      if (quickFilter === 'observed' && Number(item.observed_count || 0) <= 0) {
        return false;
      }
      if (quickFilter === 'auto' && item.trigger_type === 'custom_event') {
        return false;
      }
      if (quickFilter === 'attention' && !needsAttention(item)) {
        return false;
      }
      if (quickFilter === 'guardrail' && item.metric_role !== 'guardrail') {
        return false;
      }
      if (quickFilter === 'custom' && item.builtin) {
        return false;
      }
      return matchesSearchQuery(item, query);
    });
    return filtered.sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const key = sortConfig.key;
      if (key === 'observed_count') {
        return (Number(a.observed_count || 0) - Number(b.observed_count || 0)) * direction;
      }
      if (key === 'status') {
        return getDefinitionHealth(a).label.localeCompare(getDefinitionHealth(b).label) * direction;
      }
      if (key === 'last_seen_at' || key === 'updated_at') {
        return (new Date(a[key] || 0).getTime() - new Date(b[key] || 0).getTime()) * direction;
      }
      const aValue = String(a[key] || '').toLowerCase();
      const bValue = String(b[key] || '').toLowerCase();
      return aValue.localeCompare(bValue) * direction;
    });
  }, [definitions, quickFilter, roleFilter, searchQuery, sortConfig, sourceFilter, triggerFilter]);

  useEffect(() => {
    setVisibleRowLimit(TABLE_INITIAL_ROWS);
  }, [quickFilter, roleFilter, searchQuery, sortConfig, sourceFilter, triggerFilter]);

  const visibleDefinitions = useMemo(
    () => filteredDefinitions.slice(0, visibleRowLimit),
    [filteredDefinitions, visibleRowLimit]
  );
  const hasMoreDefinitions = filteredDefinitions.length > visibleDefinitions.length;
  const remainingDefinitions = Math.max(filteredDefinitions.length - visibleDefinitions.length, 0);
  const visibleDefinitionPercent = filteredDefinitions.length
    ? Math.min(100, Math.round((visibleDefinitions.length / filteredDefinitions.length) * 100))
    : 0;
  const currentSortLabel = SORT_LABELS[sortConfig.key] || 'Event';
  let catalogInsight = {
    action: 'Create event',
    body: 'Create or choose a starter event, then fire it from a test to confirm analytics is ready.',
    target: 'new',
    title: 'Start building reusable tracking',
    tone: 'default',
  };
  if (stats.attention > 0) {
    catalogInsight = {
      action: 'Review QA queue',
      body: 'Custom events in this queue have not fired yet. Check selectors, URL rules, or data layer pushes before using them as primary goals.',
      target: 'attention',
      title: `${stats.attention} custom event${stats.attention === 1 ? '' : 's'} need QA`,
      tone: 'attention',
    };
  } else if (stats.observed > 0) {
    catalogInsight = {
      action: 'View observed',
      body: `${stats.observed.toLocaleString()} total fires are already recorded across the catalog. Use observed events as safer goal candidates.`,
      target: 'observed',
      title: 'Catalog is receiving events',
      tone: 'success',
    };
  }

  const applyTemplate = template => {
    setDraft(cloneDraft(template.draft));
    setEditingEventName('');
    setBuilderRailSection('readiness');
    setBuilderOpen(true);
    setError('');
    setMessage(`${template.title} template loaded. Review selectors before saving.`);
  };

  const editDefinition = definition => {
    setDraft(definitionToDraft(definition));
    setEditingEventName(definition.event_name || '');
    setBuilderRailSection('assistant');
    setBuilderOpen(true);
    setError('');
    setMessage(
      `Editing ${definition.event_name}. Event key is locked to update the existing definition.`
    );
  };

  const duplicateDefinition = definition => {
    setDraft(definitionToDraft(definition, { duplicate: true }));
    setEditingEventName('');
    setBuilderRailSection('readiness');
    setBuilderOpen(true);
    setError('');
    setMessage(`Duplicated ${definition.event_name}. Review the new event key before saving.`);
  };

  const openNewDefinition = () => {
    setDraft(EMPTY_DRAFT);
    setEditingEventName('');
    setError('');
    setBuilderRailSection('templates');
    setBuilderOpen(true);
  };

  const toggleBuilderRailSection = section => {
    setBuilderRailSection(current => (current === section ? '' : section));
  };

  const applySmartTriggerPreset = preset => {
    setDraft(prev => ({
      ...prev,
      trigger_type: preset.type,
      trigger_config: {
        ...prev.trigger_config,
        ...preset.config,
      },
    }));
  };

  const generateEventKey = () => {
    setDraft(prev => ({
      ...prev,
      event_name: normalizeEventName(prev.event_name || prev.name),
    }));
  };

  const closeBuilder = () => {
    setDraft(EMPTY_DRAFT);
    setEditingEventName('');
    setBuilderOpen(false);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setRoleFilter('all');
    setTriggerFilter('all');
    setSourceFilter('all');
    setQuickFilter('all');
  };

  const activeFilterChips = [
    searchQuery ? { label: `Search: ${searchQuery}`, onClear: () => setSearchQuery('') } : null,
    quickFilter !== 'all'
      ? {
          label: `Quick: ${QUICK_FILTERS.find(item => item.value === quickFilter)?.label || quickFilter}`,
          onClear: () => setQuickFilter('all'),
        }
      : null,
    roleFilter !== 'all'
      ? {
          label: ROLE_FILTER_OPTIONS.find(item => item.value === roleFilter)?.label || roleFilter,
          onClear: () => setRoleFilter('all'),
        }
      : null,
    triggerFilter !== 'all'
      ? {
          label:
            TRIGGER_FILTER_OPTIONS.find(item => item.value === triggerFilter)?.label ||
            triggerFilter,
          onClear: () => setTriggerFilter('all'),
        }
      : null,
    sourceFilter !== 'all'
      ? {
          label:
            SOURCE_FILTER_OPTIONS.find(item => item.value === sourceFilter)?.label || sourceFilter,
          onClear: () => setSourceFilter('all'),
        }
      : null,
  ].filter(Boolean);
  const activeFilterCount = activeFilterChips.length;

  const handleSort = key => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortIndicator = key => {
    if (sortConfig.key !== key) {
      return '↕';
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const getSortAriaLabel = (key, label) => {
    if (sortConfig.key !== key) {
      return `Sort by ${label}`;
    }
    return `Sort by ${label}, currently ${sortConfig.direction === 'asc' ? 'ascending' : 'descending'}`;
  };

  const copyText = async (text, successMessage) => {
    if (!text) {
      return;
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setMessage(successMessage);
    } catch (_) {
      setError('Could not copy to clipboard. Select and copy the text manually.');
    }
  };

  const handleSave = async () => {
    const eventName = normalizeEventName(draft.event_name || draft.name);
    if (!draft.name.trim() || !eventName) {
      setError('Add a name and event key before saving.');
      return;
    }
    if (draft.aggregation === 'sum' && !draft.trigger_config.parameter_name.trim()) {
      setError('Add a reporting parameter for sum metrics, for example cart_value.');
      return;
    }
    if (draft.trigger_type === 'url_match' && !draft.trigger_config.url_pattern.trim()) {
      setError('Add a URL pattern for this automatic URL trigger.');
      return;
    }
    if (
      (draft.trigger_type === 'css_click' ||
        draft.trigger_type === 'form_start' ||
        draft.trigger_type === 'form_submit' ||
        draft.trigger_type === 'element_visibility') &&
      !draft.trigger_config.selector.trim()
    ) {
      setError('Add a CSS selector for this automatic DOM trigger.');
      return;
    }
    if (
      draft.trigger_type === 'custom_javascript' &&
      !draft.trigger_config.custom_javascript.trim()
    ) {
      setError('Add custom JavaScript that returns true, a number, or { value, metadata }.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await saveGoalMetricDefinition(domain, {
        ...draft,
        event_name: eventName,
        tags: String(draft.tags || '')
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
      });
      setDraft(EMPTY_DRAFT);
      setEditingEventName('');
      setBuilderOpen(false);
      setMessage(
        editingEventName
          ? 'Goal metric updated. Tests using this event key will use the new trigger configuration.'
          : 'Goal metric saved. It can now be selected in the Test Wizard.'
      );
      await fetchDefinitions();
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not save goal metric.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async id => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await deleteGoalMetricDefinition(domain, id);
      setDefinitions(prev => prev.filter(item => item.id !== id));
      setDeleteCandidate(null);
      setMessage('Custom goal metric deleted.');
    } catch (err) {
      setError(err?.response?.data?.error || err.message || 'Could not delete goal metric.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.goalsPage}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span aria-hidden="true" />
            Reusable experiment tracking
          </p>
          <h1 className={styles.title}>Goals & Metrics</h1>
          <p className={styles.subtitle}>
            Create GTM-style events once, reuse them in tests, and monitor whether they fire.
          </p>
          <div className={styles.heroActionRow}>
            <span
              className={styles.heroHelpPill}
              title="Runtime automation ships selected trigger definitions with the storefront script. Manual events can still fire with dataLayer-style pushes."
            >
              Runtime-ready
            </span>
            <span
              className={styles.heroHelpPill}
              title={`Debug in the storefront console: window.RipX?.debugGoalMetrics?.('event_key') or window.RipX?.testGoalMetricEvent?.('event_key', 1)`}
            >
              Browser debug
            </span>
          </div>
        </div>
        <div className={styles.heroStats}>
          <div
            className={styles.statCard}
            title="All reusable event and metric definitions available for this store."
          >
            <span>Definitions</span>
            <strong>{visibleStats.total}</strong>
            <small>
              {stats.total === visibleStats.total ? 'All visible' : `${stats.total} total`}
            </small>
          </div>
          <div className={styles.statCard} title="Store-specific events created by your team.">
            <span>Custom</span>
            <strong>{visibleStats.custom}</strong>
            <small>
              {stats.custom === visibleStats.custom ? 'In view' : `${stats.custom} total`}
            </small>
          </div>
          <div className={styles.statCard} title="Total recorded fires across catalog events.">
            <span>Observed fires</span>
            <strong>{visibleStats.observed}</strong>
            <small>
              {stats.observed === visibleStats.observed ? 'In view' : `${stats.observed} total`}
            </small>
          </div>
          <div
            className={styles.statCard}
            title="Metrics that protect against negative side effects."
          >
            <span>Guardrails</span>
            <strong>{visibleStats.guardrails}</strong>
            <small>
              {stats.guardrails === visibleStats.guardrails
                ? 'In view'
                : `${stats.guardrails} total`}
            </small>
          </div>
          <div
            className={`${styles.statCard} ${visibleStats.attention > 0 ? styles.statCardAttention : ''}`}
            title="Custom definitions that have not fired yet and may need setup or QA."
          >
            <span>Needs attention</span>
            <strong>{visibleStats.attention}</strong>
            <small>
              {stats.attention === visibleStats.attention ? 'In view' : `${stats.attention} total`}
            </small>
          </div>
          <div
            className={styles.statCard}
            title="Events with automatic URL, selector, visibility, or JavaScript triggers."
          >
            <span>Auto triggers</span>
            <strong>{visibleStats.automated}</strong>
            <small>
              {stats.automated === visibleStats.automated ? 'In view' : `${stats.automated} total`}
            </small>
          </div>
        </div>
      </section>

      {error && (
        <Banner tone="critical" onDismiss={() => setError('')}>
          {error}
        </Banner>
      )}
      {message && (
        <Banner tone="success" onDismiss={() => setMessage('')}>
          {message}
        </Banner>
      )}

      <div className={styles.layout}>
        <Card>
          <BlockStack gap="400">
            <div className={styles.catalogHeader}>
              <div>
                <Text as="h2" variant="headingLg">
                  Event and metric catalog
                </Text>
                <p
                  className={styles.catalogHint}
                  title="Built-ins plus store-specific custom definitions. Search and filter like a GTM workspace when the catalog grows."
                >
                  Built-ins and custom events for test goals, guardrails, and reporting.
                </p>
              </div>
              <div className={styles.catalogHeaderActions}>
                <Button loading={loading} onClick={fetchDefinitions}>
                  Refresh
                </Button>
                <Button variant="primary" onClick={openNewDefinition}>
                  New event
                </Button>
              </div>
            </div>

            <div className={styles.businessMetricStrip}>
              <div className={styles.businessMetricStripIntro}>
                <span>Business result metrics</span>
                <strong>CR, RPV, PPV, and AOV are calculated in results</strong>
                <p>
                  This page manages reusable event definitions. Primary business metrics are
                  selected in the Test Wizard and shown in Analytics.
                </p>
              </div>
              <div className={styles.businessMetricStripGrid}>
                {BUSINESS_METRIC_CARDS.map(metric => (
                  <div key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.catalogToolbar}>
              <div className={styles.searchControl}>
                <span className={styles.toolbarFieldLabel}>Search</span>
                <div className={styles.searchInputShell}>
                  <TextField
                    label="Search event catalog"
                    labelHidden
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search events or use tag:lead key:add_to_cart trigger:click"
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className={styles.searchMetaRow}>
                  <div className={styles.searchAssist}>
                    <span title={SEARCH_HELP}>Advanced prefixes</span>
                    {searchQuery && <strong>{filteredDefinitions.length} matches</strong>}
                  </div>
                  <div className={styles.searchSuggestionRow} aria-label="Search examples">
                    {SEARCH_EXAMPLES.map(example => (
                      <button
                        key={example.query}
                        type="button"
                        onClick={() => setSearchQuery(example.query)}
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                </div>
                {unknownSearchPrefixes.length > 0 && (
                  <div className={styles.searchWarning}>
                    Unknown prefix{unknownSearchPrefixes.length > 1 ? 'es' : ''}:{' '}
                    {unknownSearchPrefixes.join(', ')}. Use key, tag, trigger, role, source, status,
                    category, or name.
                  </div>
                )}
              </div>
              <div className={styles.toolbarFilter}>
                <span>Role</span>
                <Select
                  label="Role filter"
                  labelHidden
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={ROLE_FILTER_OPTIONS}
                />
              </div>
              <div className={styles.toolbarFilter}>
                <span>Trigger</span>
                <Select
                  label="Trigger filter"
                  labelHidden
                  value={triggerFilter}
                  onChange={setTriggerFilter}
                  options={TRIGGER_FILTER_OPTIONS}
                />
              </div>
              <div className={styles.toolbarFilter}>
                <span>Source</span>
                <Select
                  label="Source filter"
                  labelHidden
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  options={SOURCE_FILTER_OPTIONS}
                />
              </div>
            </div>

            <div className={styles.quickFilterBar} aria-label="Quick event filters">
              {QUICK_FILTERS.map(item => (
                <button
                  key={item.value}
                  type="button"
                  className={`${styles.quickFilterButton} ${
                    quickFilter === item.value ? styles.quickFilterButtonActive : ''
                  }`}
                  onClick={() => setQuickFilter(item.value)}
                >
                  <span>{item.label}</span>
                  <strong>{quickFilterCounts[item.value] ?? 0}</strong>
                </button>
              ))}
            </div>

            <div className={styles.catalogSummary}>
              <span>
                Showing {visibleDefinitions.length} of {filteredDefinitions.length} matches
                {filteredDefinitions.length !== definitions.length
                  ? ` (${definitions.length} total)`
                  : ''}
              </span>
              <span className={styles.catalogSortSummary}>
                Sorted by {currentSortLabel.toLowerCase()} ·{' '}
                {sortConfig.direction === 'asc' ? 'ascending' : 'descending'}
              </span>
              <div className={styles.catalogSummaryActions}>
                <div className={styles.densityToggle} aria-label="Table density">
                  <button
                    type="button"
                    className={tableDensity === 'comfortable' ? styles.densityButtonActive : ''}
                    onClick={() => setTableDensity('comfortable')}
                  >
                    Comfortable
                  </button>
                  <button
                    type="button"
                    className={tableDensity === 'compact' ? styles.densityButtonActive : ''}
                    onClick={() => setTableDensity('compact')}
                  >
                    Compact
                  </button>
                </div>
                {activeFilterChips.length > 0 && (
                  <Button size="slim" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
            </div>

            <div className={styles.catalogMetaGrid} aria-label="Catalog view summary">
              <div>
                <span>Current view</span>
                <strong>{visibleDefinitions.length.toLocaleString()}</strong>
                <small>{filteredDefinitions.length.toLocaleString()} matching events</small>
              </div>
              <div>
                <span>Filters</span>
                <strong>{activeFilterCount}</strong>
                <small>{activeFilterCount ? 'Active refinements' : 'No filters applied'}</small>
              </div>
              <div>
                <span>QA queue</span>
                <strong>{visibleStats.attention}</strong>
                <small>Custom events waiting for first fire</small>
              </div>
            </div>

            <div
              className={`${styles.catalogInsightBanner} ${
                catalogInsight.tone === 'attention' ? styles.catalogInsightAttention : ''
              } ${catalogInsight.tone === 'success' ? styles.catalogInsightSuccess : ''}`}
            >
              <div>
                <strong>{catalogInsight.title}</strong>
                <span>{catalogInsight.body}</span>
              </div>
              <Button
                size="slim"
                onClick={() => {
                  if (catalogInsight.target === 'new') {
                    openNewDefinition();
                  } else {
                    setQuickFilter(catalogInsight.target);
                  }
                }}
              >
                {catalogInsight.action}
              </Button>
            </div>

            {activeFilterChips.length > 0 && (
              <div className={styles.activeFilterBar}>
                {activeFilterChips.map(chip => (
                  <button key={chip.label} type="button" onClick={chip.onClear}>
                    {chip.label}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}

            <div
              className={`${styles.catalogTableWrap} ${
                tableDensity === 'compact' ? styles.catalogTableCompact : ''
              }`}
            >
              <table className={styles.catalogTable}>
                <thead>
                  <tr>
                    <th scope="col">
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort('name')}
                        aria-label={getSortAriaLabel('name', 'event')}
                      >
                        <span>Event</span>
                        <span className={styles.sortIndicator}>{getSortIndicator('name')}</span>
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort('trigger_type')}
                        aria-label={getSortAriaLabel('trigger_type', 'trigger')}
                      >
                        <span>Trigger</span>
                        <span className={styles.sortIndicator}>
                          {getSortIndicator('trigger_type')}
                        </span>
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort('metric_role')}
                        aria-label={getSortAriaLabel('metric_role', 'role')}
                      >
                        <span>Role</span>
                        <span className={styles.sortIndicator}>
                          {getSortIndicator('metric_role')}
                        </span>
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort('status')}
                        aria-label={getSortAriaLabel('status', 'status')}
                      >
                        <span>Status</span>
                        <span className={styles.sortIndicator}>{getSortIndicator('status')}</span>
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort('observed_count')}
                        aria-label={getSortAriaLabel('observed_count', 'fires')}
                      >
                        <span>Fires</span>
                        <span className={styles.sortIndicator}>
                          {getSortIndicator('observed_count')}
                        </span>
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort('last_seen_at')}
                        aria-label={getSortAriaLabel('last_seen_at', 'last fired')}
                      >
                        <span>Last fired</span>
                        <span className={styles.sortIndicator}>
                          {getSortIndicator('last_seen_at')}
                        </span>
                      </button>
                    </th>
                    <th scope="col">
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort('updated_at')}
                        aria-label={getSortAriaLabel('updated_at', 'last edited')}
                      >
                        <span>Last edited</span>
                        <span className={styles.sortIndicator}>
                          {getSortIndicator('updated_at')}
                        </span>
                      </button>
                    </th>
                    <th scope="col" className={styles.actionHeader}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 4 }).map((_, index) => (
                      <tr key={`loading-${index}`} className={styles.skeletonRow}>
                        <td colSpan={8}>
                          <div className={styles.tableSkeleton}>
                            <span />
                            <span />
                            <span />
                          </div>
                        </td>
                      </tr>
                    ))}
                  {visibleDefinitions.map(item => {
                    const health = getDefinitionHealth(item);
                    return (
                      <tr key={item.id || item.event_name}>
                        <td>
                          <div className={styles.eventCell}>
                            <strong>{item.name}</strong>
                            <code>{item.event_name}</code>
                            <div className={styles.eventTagRow}>
                              <span>{item.category || 'custom'}</span>
                              {(Array.isArray(item.tags) ? item.tags.slice(0, 2) : []).map(tag => (
                                <span key={`${item.event_name}-${tag}`}>{tag}</span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className={styles.triggerCell}>
                            <strong>
                              {TRIGGER_LABELS[item.trigger_type] || item.trigger_type}
                            </strong>
                            <span>{getTriggerSummary(item)}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.roleCell}>
                            <Badge tone={item.metric_role === 'guardrail' ? 'attention' : 'info'}>
                              {getRoleLabel(item.metric_role)}
                            </Badge>
                            <span>
                              {item.aggregation} ·{' '}
                              {item.direction === 'decrease'
                                ? 'lower is better'
                                : 'higher is better'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.statusCell}>
                            <Badge tone={health.tone}>{health.label}</Badge>
                            <Badge tone={item.builtin ? 'info' : 'success'}>
                              {item.builtin ? 'Built-in' : 'Custom'}
                            </Badge>
                            {needsAttention(item) && <Badge tone="attention">Needs QA</Badge>}
                          </div>
                        </td>
                        <td className={styles.observedCell}>
                          {Number(item.observed_count || 0).toLocaleString()}
                        </td>
                        <td className={styles.dateCell}>{formatDateTime(item.last_seen_at)}</td>
                        <td className={styles.dateCell}>
                          {item.builtin
                            ? 'Built-in'
                            : formatDateTime(item.updated_at, 'Not edited')}
                        </td>
                        <td>
                          <div className={styles.actionCell}>
                            <Popover
                              active={actionMenuEvent === (item.id || item.event_name)}
                              preferredAlignment="right"
                              preferredPosition="below"
                              activator={
                                <button
                                  type="button"
                                  className={styles.actionMenuButton}
                                  aria-label={`More actions for ${item.name || item.event_name}`}
                                  aria-expanded={actionMenuEvent === (item.id || item.event_name)}
                                  onClick={() =>
                                    setActionMenuEvent(prev =>
                                      prev === (item.id || item.event_name)
                                        ? ''
                                        : item.id || item.event_name
                                    )
                                  }
                                >
                                  <span aria-hidden="true">...</span>
                                </button>
                              }
                              autofocusTarget="first-node"
                              onClose={() => setActionMenuEvent('')}
                            >
                              <ActionList
                                actionRole="menuitem"
                                items={[
                                  {
                                    content: 'View details',
                                    onAction: () => {
                                      setDetailDefinition(item);
                                      setActionMenuEvent('');
                                    },
                                  },
                                  ...(!item.builtin
                                    ? [
                                        {
                                          content: 'Edit definition',
                                          onAction: () => {
                                            editDefinition(item);
                                            setActionMenuEvent('');
                                          },
                                        },
                                      ]
                                    : []),
                                  {
                                    content: item.builtin
                                      ? 'Use as starter template'
                                      : 'Duplicate definition',
                                    onAction: () => {
                                      duplicateDefinition(item);
                                      setActionMenuEvent('');
                                    },
                                  },
                                  {
                                    content: 'Copy event key',
                                    onAction: () => {
                                      copyText(item.event_name, `Copied ${item.event_name}.`);
                                      setActionMenuEvent('');
                                    },
                                  },
                                  {
                                    content: 'Copy tracking snippet',
                                    onAction: () => {
                                      copyText(
                                        getTrackingSnippet(item),
                                        `Copied ${item.event_name} tracking snippet.`
                                      );
                                      setActionMenuEvent('');
                                    },
                                  },
                                  ...(!item.builtin
                                    ? [
                                        {
                                          content: 'Delete definition',
                                          destructive: true,
                                          onAction: () => {
                                            setDeleteCandidate(item);
                                            setActionMenuEvent('');
                                          },
                                        },
                                      ]
                                    : []),
                                ]}
                              />
                            </Popover>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {hasMoreDefinitions && (
                  <tfoot>
                    <tr>
                      <td colSpan={8}>
                        <div className={styles.loadMorePanel}>
                          <div className={styles.loadMoreCopy}>
                            <strong>
                              {visibleDefinitions.length}/{filteredDefinitions.length} visible
                            </strong>
                            <span>
                              {remainingDefinitions} hidden · {visibleDefinitionPercent}% loaded
                            </span>
                          </div>
                          <div className={styles.loadMoreControls}>
                            <div
                              className={styles.loadMoreProgress}
                              aria-label={`${visibleDefinitionPercent}% of matching events visible`}
                            >
                              <span style={{ width: `${visibleDefinitionPercent}%` }} />
                            </div>
                            <div className={styles.loadMoreActions}>
                              <Button
                                size="slim"
                                onClick={() =>
                                  setVisibleRowLimit(current => current + TABLE_LOAD_MORE_ROWS)
                                }
                              >
                                Load {Math.min(TABLE_LOAD_MORE_ROWS, remainingDefinitions)} more
                              </Button>
                              <Button
                                size="slim"
                                onClick={() => setVisibleRowLimit(filteredDefinitions.length)}
                              >
                                Show all
                              </Button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {!loading && !filteredDefinitions.length && (
                <div className={styles.emptyState}>
                  <strong>No matching events</strong>
                  <span>Clear filters or create a new definition from a starter template.</span>
                  <div className={styles.emptyStateActions}>
                    {activeFilterChips.length > 0 && (
                      <Button size="slim" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                    <Button size="slim" variant="primary" onClick={openNewDefinition}>
                      New event
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </BlockStack>
        </Card>
      </div>

      {builderOpen && (
        <Modal open onClose={closeBuilder} size="large">
          <Modal.Section>
            <div
              className={`${styles.builderCard} ripxGoalBuilderModal`}
              data-ripx-goal-builder-modal
            >
              <div className={styles.builderModalHeader}>
                <div>
                  <strong>
                    {editingEventName ? 'Edit Reusable Event' : 'Create Reusable Event'}
                  </strong>
                  <span>Build a reusable goal event for tests and reports.</span>
                </div>
                <button type="button" onClick={closeBuilder} aria-label="Close modal">
                  ×
                </button>
              </div>
              <BlockStack gap="300">
                <div className={styles.builderCompactIntro}>
                  <Text as="p" tone="subdued">
                    {editingEventName
                      ? 'Update trigger behavior and metric semantics with live setup guidance.'
                      : 'Choose a starter recipe or smart path, configure only the required fields, then save it to the catalog.'}
                  </Text>
                  <div className={styles.builderMetaRow}>
                    <span title="Selected trigger type">
                      {TRIGGER_LABELS[draft.trigger_type] || 'Manual event'}
                    </span>
                    <span title="Metric role">{getRoleLabel(draft.metric_role)}</span>
                    <span title="Required setup completion">{readinessScore}% ready</span>
                    <span title="Generated event key">{normalizedDraftEventKey || 'No key'}</span>
                  </div>
                </div>

                <div className={styles.builderProgressRail} aria-label="Event builder setup flow">
                  <div className={identityProgressClass}>
                    <span>1</span>
                    <strong>Define</strong>
                    <p>Name, key, role, and measurement meaning.</p>
                  </div>
                  <div className={triggerProgressClass}>
                    <span>2</span>
                    <strong>Trigger</strong>
                    <p>Pick how RipX detects the event.</p>
                  </div>
                  <div className={documentationProgressClass}>
                    <span>3</span>
                    <strong>Document</strong>
                    <p>Add context so teams can reuse it safely.</p>
                  </div>
                </div>

                <div className={styles.builderModalLayout}>
                  <div className={styles.formGrid}>
                    <div className={styles.formGridFull}>
                      <div className={styles.formSectionHeader}>
                        <span>Step 1</span>
                        <strong>Identity and metric meaning</strong>
                        <p>
                          Name the reusable event and define how experiment reports should read it.
                        </p>
                      </div>
                    </div>
                    <div className={`${styles.smartField} ${styles.smartFieldFeatured}`}>
                      <TextField
                        label="Goal name"
                        value={draft.name}
                        onChange={value =>
                          setDraft(prev => ({
                            ...prev,
                            name: value,
                            event_name:
                              !editingEventName && !prev.event_name
                                ? normalizeEventName(value)
                                : prev.event_name,
                          }))
                        }
                        helpText="Use a clear business outcome, e.g. Add to cart click or Checkout reached."
                        autoComplete="off"
                      />
                      <div className={styles.fieldInsight}>
                        <span>Smart naming</span>
                        <strong>{normalizedDraftEventKey || 'Event key will auto-generate'}</strong>
                      </div>
                    </div>
                    <div className={styles.smartField}>
                      <TextField
                        label="Event key"
                        value={draft.event_name}
                        onChange={value =>
                          setDraft(prev => ({ ...prev, event_name: normalizeEventName(value) }))
                        }
                        helpText="Example: add_to_cart"
                        disabled={Boolean(editingEventName)}
                        autoComplete="off"
                      />
                      <div className={styles.fieldActionRow}>
                        {!editingEventName && (
                          <button
                            type="button"
                            className={styles.keyHelperButton}
                            onClick={generateEventKey}
                          >
                            Generate from name
                          </button>
                        )}
                        <span title="Use this exact key in storefront pushes or Test Wizard goals.">
                          {normalizedDraftEventKey || 'Waiting for key'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.smartField}>
                      <Select
                        label="Role"
                        value={draft.metric_role}
                        onChange={value => setDraft(prev => ({ ...prev, metric_role: value }))}
                        options={[
                          { label: 'Secondary goal', value: 'secondary' },
                          { label: 'Guardrail', value: 'guardrail' },
                          { label: 'Primary candidate (reporting)', value: 'primary' },
                        ]}
                      />
                      <p className={styles.fieldMicrocopy}>
                        Controls how reports explain this metric.
                      </p>
                    </div>
                    <div className={styles.smartField}>
                      <Select
                        label="Aggregation"
                        value={draft.aggregation}
                        onChange={value => setDraft(prev => ({ ...prev, aggregation: value }))}
                        options={[
                          { label: 'Count event users', value: 'count' },
                          { label: 'Sum event value', value: 'sum' },
                        ]}
                      />
                      <p className={styles.fieldMicrocopy}>
                        Count users or sum a numeric event value.
                      </p>
                    </div>
                    <div className={styles.smartField}>
                      <Select
                        label="Direction"
                        value={draft.direction}
                        onChange={value => setDraft(prev => ({ ...prev, direction: value }))}
                        options={[
                          { label: 'Higher is better', value: 'increase' },
                          { label: 'Lower is better', value: 'decrease' },
                        ]}
                      />
                      <p className={styles.fieldMicrocopy}>
                        Used for winners, guardrails, and warnings.
                      </p>
                    </div>
                    <div className={styles.smartField}>
                      <Select
                        label="Category"
                        value={draft.category}
                        onChange={value => setDraft(prev => ({ ...prev, category: value }))}
                        options={[
                          { label: 'Custom', value: 'custom' },
                          { label: 'Commerce', value: 'commerce' },
                          { label: 'Checkout', value: 'checkout' },
                          { label: 'Engagement', value: 'engagement' },
                          { label: 'Lead', value: 'lead' },
                          { label: 'Guardrail', value: 'guardrail' },
                        ]}
                      />
                      <p className={styles.fieldMicrocopy}>
                        Keeps the catalog searchable as it grows.
                      </p>
                    </div>
                    <div className={`${styles.smartField} ${styles.smartFieldFull}`}>
                      <Select
                        label="Trigger type"
                        value={draft.trigger_type}
                        onChange={value => setDraft(prev => ({ ...prev, trigger_type: value }))}
                        options={[
                          { label: 'Manual custom event', value: 'custom_event' },
                          { label: 'URL match', value: 'url_match' },
                          { label: 'CSS click selector', value: 'css_click' },
                          { label: 'Form start selector', value: 'form_start' },
                          { label: 'Form submit selector', value: 'form_submit' },
                          { label: 'Element visibility', value: 'element_visibility' },
                          { label: 'Custom JavaScript rule', value: 'custom_javascript' },
                        ]}
                      />
                      <div className={styles.fieldInsight}>
                        <span>Recommended next step</span>
                        <strong>{assistantGuidance.nextAction}</strong>
                      </div>
                    </div>
                    <div className={styles.smartField}>
                      <TextField
                        label="Reporting parameter"
                        value={draft.trigger_config.parameter_name}
                        onChange={value =>
                          setDraft(prev => ({
                            ...prev,
                            trigger_config: { ...prev.trigger_config, parameter_name: value },
                          }))
                        }
                        helpText="Optional event value or metadata key, e.g. cart_value"
                        autoComplete="off"
                      />
                      <p className={styles.fieldMicrocopy}>
                        {draft.aggregation === 'sum'
                          ? 'Required for sum metrics. This property must be numeric.'
                          : 'Leave empty for simple conversion counting.'}
                      </p>
                      <div className={styles.parameterPresetGrid}>
                        {EVENT_PARAMETER_PRESETS.map(preset => (
                          <button
                            key={preset.value}
                            type="button"
                            title={preset.hint}
                            onClick={() =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  parameter_name: preset.value,
                                },
                              }))
                            }
                          >
                            <span>{preset.label}</span>
                            <code>{preset.value}</code>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.formGridFull}>
                      <div className={styles.formSectionHeader}>
                        <span>Step 2</span>
                        <strong>Trigger conditions</strong>
                        <p>Only fields relevant to the selected trigger stay visible.</p>
                      </div>
                    </div>
                    {draft.trigger_type === 'custom_event' && (
                      <div className={`${styles.formGridFull} ${styles.variableSetupPanel}`}>
                        <div>
                          <span>Custom event contract</span>
                          <strong>Match this event key exactly in storefront pushes.</strong>
                          <p>
                            Custom events behave like GTM Custom Event triggers. The value in the
                            <code> event </code>
                            property must match the saved event key.
                          </p>
                        </div>
                        <pre>{dataLayerEventSnippet}</pre>
                        <div className={styles.variableChecklist}>
                          <span>Best practice</span>
                          <ul>
                            <li>Push event parameters in the same dataLayer call as the event.</li>
                            <li>Use consistent snake_case parameter names across events.</li>
                            <li>
                              Reset or overwrite stale values on single-page storefront flows.
                            </li>
                          </ul>
                        </div>
                      </div>
                    )}
                    {draft.metric_role === 'guardrail' && (
                      <div className={styles.smartField}>
                        <TextField
                          label="Guardrail threshold"
                          type="number"
                          value={String(draft.trigger_config.min_relative_lift ?? '')}
                          onChange={value =>
                            setDraft(prev => ({
                              ...prev,
                              trigger_config: { ...prev.trigger_config, min_relative_lift: value },
                            }))
                          }
                          helpText={
                            draft.direction === 'decrease'
                              ? 'Breach when this event increases above this % vs control. Default: 10.'
                              : 'Breach when this event drops below this % vs control. Default: -10.'
                          }
                          autoComplete="off"
                        />
                      </div>
                    )}
                    {draft.trigger_type === 'url_match' && (
                      <div className={`${styles.formGridFull} ${styles.smartField}`}>
                        <TextField
                          label="URL pattern"
                          value={draft.trigger_config.url_pattern}
                          onChange={value =>
                            setDraft(prev => ({
                              ...prev,
                              trigger_config: { ...prev.trigger_config, url_pattern: value },
                            }))
                          }
                          helpText="Example: /thank-you or /collections/*"
                          autoComplete="off"
                        />
                        <div className={styles.fieldInsight}>
                          <span>Matching tip</span>
                          <strong>Use stable paths and wildcards for page groups.</strong>
                        </div>
                      </div>
                    )}
                    {(draft.trigger_type === 'css_click' ||
                      draft.trigger_type === 'form_start' ||
                      draft.trigger_type === 'form_submit' ||
                      draft.trigger_type === 'element_visibility') && (
                      <div className={`${styles.formGridFull} ${styles.smartField}`}>
                        <TextField
                          label="CSS selector"
                          value={draft.trigger_config.selector}
                          onChange={value =>
                            setDraft(prev => ({
                              ...prev,
                              trigger_config: { ...prev.trigger_config, selector: value },
                            }))
                          }
                          helpText="Example: .add-to-cart-button, form.newsletter, or .hero-banner"
                          autoComplete="off"
                        />
                        <div className={styles.fieldInsight}>
                          <span>Selector quality</span>
                          <strong>
                            Prefer stable classes or data-ripx attributes over theme-generated IDs.
                          </strong>
                        </div>
                      </div>
                    )}
                    {draft.trigger_type === 'element_visibility' && (
                      <>
                        <div className={styles.smartField}>
                          <TextField
                            label="Minimum percent visible"
                            type="number"
                            value={String(draft.trigger_config.visibility_threshold ?? 50)}
                            onChange={value =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  visibility_threshold: value,
                                },
                              }))
                            }
                            helpText="GTM-style visibility threshold. Default: 50%."
                            autoComplete="off"
                          />
                        </div>
                        <div className={styles.smartField}>
                          <TextField
                            label="Minimum visible duration"
                            type="number"
                            value={String(draft.trigger_config.visibility_min_duration_ms ?? 0)}
                            onChange={value =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  visibility_min_duration_ms: value,
                                },
                              }))
                            }
                            helpText="Milliseconds the element must stay visible. Use 0 to fire immediately."
                            autoComplete="off"
                          />
                        </div>
                        <div className={styles.smartField}>
                          <Select
                            label="Visibility firing"
                            value={draft.trigger_config.visibility_frequency || 'once_per_page'}
                            onChange={value =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  visibility_frequency: value,
                                },
                              }))
                            }
                            options={[
                              { label: 'Once per page', value: 'once_per_page' },
                              { label: 'Once per element', value: 'once_per_element' },
                              { label: 'Every time visible', value: 'every_time' },
                            ]}
                          />
                        </div>
                        <div className={styles.smartField}>
                          <Select
                            label="Observe DOM changes"
                            value={
                              draft.trigger_config.observe_dom_changes === false ? 'false' : 'true'
                            }
                            onChange={value =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  observe_dom_changes: value === 'true',
                                },
                              }))
                            }
                            options={[
                              { label: 'Yes, watch dynamic content', value: 'true' },
                              { label: 'No, scan initial page only', value: 'false' },
                            ]}
                          />
                        </div>
                      </>
                    )}
                    {draft.trigger_type === 'custom_javascript' && (
                      <>
                        <div className={`${styles.formGridFull} ${styles.smartField}`}>
                          <TextField
                            label="Custom JavaScript rule"
                            value={draft.trigger_config.custom_javascript}
                            onChange={value =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  custom_javascript: value,
                                },
                              }))
                            }
                            helpText="Return true, a number, or { value, metadata }. Runs in storefront context with context, window, and document."
                            multiline={6}
                            autoComplete="off"
                          />
                          <div className={styles.fieldInsight}>
                            <span>Return contract</span>
                            <strong>
                              Return true, a number, or an object with value and metadata.
                            </strong>
                          </div>
                          <div className={styles.variableRecipeGrid}>
                            {CUSTOM_JS_VARIABLE_RECIPES.map(recipe => (
                              <button
                                key={recipe.title}
                                type="button"
                                onClick={() =>
                                  setDraft(prev => ({
                                    ...prev,
                                    trigger_config: {
                                      ...prev.trigger_config,
                                      custom_javascript: recipe.code,
                                    },
                                  }))
                                }
                              >
                                <span>Variable recipe</span>
                                <strong>{recipe.title}</strong>
                                <small>{recipe.description}</small>
                              </button>
                            ))}
                          </div>
                          <p className={styles.fieldMicrocopy}>
                            Keep rules lightweight, avoid PII, and test with the browser helper
                            before relying on reports.
                          </p>
                        </div>
                        <div className={styles.smartField}>
                          <TextField
                            label="Evaluation interval"
                            type="number"
                            value={String(
                              draft.trigger_config.custom_javascript_interval_ms ?? 1000
                            )}
                            onChange={value =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  custom_javascript_interval_ms: value,
                                },
                              }))
                            }
                            helpText="Milliseconds between checks. Default: 1000."
                            autoComplete="off"
                          />
                        </div>
                        <div className={styles.smartField}>
                          <TextField
                            label="Maximum wait"
                            type="number"
                            value={String(
                              draft.trigger_config.custom_javascript_max_wait_ms ?? 10000
                            )}
                            onChange={value =>
                              setDraft(prev => ({
                                ...prev,
                                trigger_config: {
                                  ...prev.trigger_config,
                                  custom_javascript_max_wait_ms: value,
                                },
                              }))
                            }
                            helpText="Stops checking after this many milliseconds. Default: 10000."
                            autoComplete="off"
                          />
                        </div>
                      </>
                    )}
                    <div className={styles.formGridFull}>
                      <div className={styles.formSectionHeader}>
                        <span>Step 3</span>
                        <strong>Catalog documentation</strong>
                        <p>
                          Help future tests understand when and why this event should be reused.
                        </p>
                      </div>
                    </div>
                    <div className={`${styles.formGridFull} ${styles.trackingPlanPanel}`}>
                      <div>
                        <span>Taxonomy</span>
                        <strong>{normalizedDraftEventKey || 'event_key'}</strong>
                        <p>Use snake_case object-action naming so events stay easy to search.</p>
                      </div>
                      <div>
                        <span>Property schema</span>
                        <strong>
                          {schemaPropertyName} · {schemaPropertyType}
                        </strong>
                        <p>
                          Sum metrics need a numeric property. Count metrics can fire without one.
                        </p>
                      </div>
                      <div>
                        <span>QA check</span>
                        <strong>Use browser debug before relying on reports</strong>
                        <p>
                          Run the trigger preview or test helper after saving and selecting it in a
                          test.
                        </p>
                      </div>
                    </div>
                    <div className={`${styles.formGridFull} ${styles.smartField}`}>
                      <TextField
                        label="Tags"
                        value={draft.tags}
                        onChange={value => setDraft(prev => ({ ...prev, tags: value }))}
                        helpText="Comma-separated labels for organization."
                        autoComplete="off"
                      />
                      <p className={styles.fieldMicrocopy}>
                        Examples: checkout, promo, lead, guardrail.
                      </p>
                    </div>
                    <div className={`${styles.formGridFull} ${styles.smartField}`}>
                      <TextField
                        label="Description"
                        value={draft.description}
                        onChange={value => setDraft(prev => ({ ...prev, description: value }))}
                        multiline={3}
                        autoComplete="off"
                      />
                      <p className={styles.fieldMicrocopy}>
                        Add when this should be reused and what a firing event means.
                      </p>
                    </div>
                  </div>
                  <aside className={styles.readinessPanel}>
                    <div className={styles.railAccordion}>
                      <div className={styles.railAccordionItem}>
                        <button
                          type="button"
                          className={styles.railAccordionHeader}
                          onClick={() => toggleBuilderRailSection('templates')}
                          aria-expanded={builderRailSection === 'templates'}
                        >
                          <span>Starter recipes</span>
                          <strong>Load a proven event</strong>
                        </button>
                        {builderRailSection === 'templates' && (
                          <div className={styles.railAccordionPanel}>
                            <div className={styles.templateRailList}>
                              {STARTER_TEMPLATES.map(template => (
                                <button
                                  key={template.title}
                                  type="button"
                                  className={styles.templateRailButton}
                                  onClick={() => applyTemplate(template)}
                                >
                                  <span className={styles.templateBadge}>{template.badge}</span>
                                  <strong>{template.title}</strong>
                                  <span>{template.description}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={styles.railAccordionItem}>
                        <button
                          type="button"
                          className={styles.railAccordionHeader}
                          onClick={() => toggleBuilderRailSection('paths')}
                          aria-expanded={builderRailSection === 'paths'}
                        >
                          <span>Smart setup paths</span>
                          <strong>
                            {TRIGGER_LABELS[draft.trigger_type] || 'Manual custom event'}
                          </strong>
                        </button>
                        {builderRailSection === 'paths' && (
                          <div className={styles.railAccordionPanel}>
                            <div className={styles.smartPresetGrid}>
                              {SMART_TRIGGER_PRESETS.map(preset => (
                                <button
                                  key={preset.type}
                                  type="button"
                                  className={`${styles.smartPresetButton} ${
                                    draft.trigger_type === preset.type
                                      ? styles.smartPresetButtonActive
                                      : ''
                                  }`}
                                  onClick={() => applySmartTriggerPreset(preset)}
                                >
                                  <strong>{preset.title}</strong>
                                  <span>{preset.description}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={styles.railAccordionItem}>
                        <button
                          type="button"
                          className={styles.railAccordionHeader}
                          onClick={() => toggleBuilderRailSection('assistant')}
                          aria-expanded={builderRailSection === 'assistant'}
                        >
                          <span>Assistant recommendation</span>
                          <strong>{assistantGuidance.title}</strong>
                        </button>
                        {builderRailSection === 'assistant' && (
                          <div className={styles.railAccordionPanel}>
                            <div className={styles.nextActionBox} title={assistantGuidance.insight}>
                              <span>Next best action</span>
                              <strong>
                                {readinessComplete
                                  ? assistantGuidance.nextAction
                                  : assistantGuidance.blocker}
                              </strong>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={styles.railAccordionItem}>
                        <button
                          type="button"
                          className={styles.railAccordionHeader}
                          onClick={() => toggleBuilderRailSection('readiness')}
                          aria-expanded={builderRailSection === 'readiness'}
                        >
                          <span>Smart readiness</span>
                          <strong>
                            {readinessComplete ? 'Ready to save' : `${readinessScore}% ready`}
                          </strong>
                        </button>
                        {builderRailSection === 'readiness' && (
                          <div className={styles.railAccordionPanel}>
                            <div className={styles.readinessMeter} aria-hidden="true">
                              <span style={{ width: `${readinessScore}%` }} />
                            </div>
                            <div className={styles.readinessList}>
                              {readinessItems.map(item => (
                                <span
                                  key={item.label}
                                  className={
                                    item.ready ? styles.readinessItemReady : styles.readinessItem
                                  }
                                >
                                  {item.ready ? 'Ready' : 'Todo'}: {item.label}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className={styles.railAccordionItem}>
                        <button
                          type="button"
                          className={styles.railAccordionHeader}
                          onClick={() => toggleBuilderRailSection('preview')}
                          aria-expanded={builderRailSection === 'preview'}
                        >
                          <span>Trigger preview</span>
                          <strong>{draft.event_name || draft.name || 'Preview event'}</strong>
                        </button>
                        {builderRailSection === 'preview' && (
                          <div className={styles.railAccordionPanel}>
                            <div className={styles.triggerPreviewRail}>
                              <code>{getTrackingSnippet(draft)}</code>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </aside>
                </div>
                <div className={styles.builderActionFooter}>
                  <div>
                    <span>
                      {readinessComplete ? 'Ready for catalog' : `${readinessScore}% ready`}
                    </span>
                    <strong>
                      {readinessComplete
                        ? 'This event can be reused in tests.'
                        : `Complete: ${assistantGuidance.blocker}`}
                    </strong>
                  </div>
                  <InlineStack gap="200">
                    <Button onClick={closeBuilder}>Cancel</Button>
                    <Button
                      variant="primary"
                      loading={saving}
                      disabled={!readinessComplete}
                      onClick={handleSave}
                    >
                      {editingEventName ? 'Update goal metric' : 'Save goal metric'}
                    </Button>
                  </InlineStack>
                </div>
              </BlockStack>
            </div>
          </Modal.Section>
        </Modal>
      )}

      {deleteCandidate && (
        <Modal
          open
          onClose={() => setDeleteCandidate(null)}
          title="Delete custom event?"
          primaryAction={{
            content: 'Delete event',
            destructive: true,
            loading: saving,
            onAction: () => handleDelete(deleteCandidate.id),
          }}
          secondaryActions={[
            {
              content: 'Cancel',
              onAction: () => setDeleteCandidate(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p">
                This deletes <strong>{deleteCandidate.name || deleteCandidate.event_name}</strong>{' '}
                from the reusable event catalog. Existing analytics events stay in reports, but new
                tests will no longer be able to select this custom definition.
              </Text>
              <div className={styles.deletePreview}>
                <span>Event key</span>
                <code>{deleteCandidate.event_name}</code>
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {detailDefinition && (
        <Modal
          open
          onClose={() => setDetailDefinition(null)}
          title={detailDefinition.name || detailDefinition.event_name}
          size="large"
        >
          <Modal.Section>
            <BlockStack gap="400">
              <div className={styles.detailGrid}>
                <div>
                  <span className={styles.snippetLabel}>Event key</span>
                  <code className={styles.detailCode}>{detailDefinition.event_name}</code>
                  <div className={styles.copyActionRow}>
                    <Button
                      size="slim"
                      onClick={() =>
                        copyText(
                          detailDefinition.event_name,
                          `Copied ${detailDefinition.event_name}.`
                        )
                      }
                    >
                      Copy key
                    </Button>
                    <Button
                      size="slim"
                      onClick={() =>
                        copyText(
                          getTrackingSnippet(detailDefinition),
                          `Copied ${detailDefinition.event_name} tracking snippet.`
                        )
                      }
                    >
                      Copy snippet
                    </Button>
                  </div>
                </div>
                <div>
                  <span className={styles.snippetLabel}>Trigger</span>
                  <Text as="p">{getTriggerSummary(detailDefinition)}</Text>
                </div>
                <div>
                  <span className={styles.snippetLabel}>Total fires</span>
                  <Text as="p" variant="headingMd">
                    {Number(detailDefinition.observed_count || 0).toLocaleString()}
                  </Text>
                </div>
                <div>
                  <span className={styles.snippetLabel}>Last fired</span>
                  <Text as="p">{formatDateTime(detailDefinition.last_seen_at)}</Text>
                </div>
                <div>
                  <span className={styles.snippetLabel}>Last edited</span>
                  <Text as="p">
                    {detailDefinition.builtin
                      ? 'Built-in definition'
                      : formatDateTime(detailDefinition.updated_at, 'Not edited')}
                  </Text>
                </div>
                <div>
                  <span className={styles.snippetLabel}>Metric semantics</span>
                  <Text as="p">
                    {getRoleLabel(detailDefinition.metric_role)} · {detailDefinition.aggregation} ·{' '}
                    {detailDefinition.direction === 'decrease'
                      ? 'lower is better'
                      : 'higher is better'}
                  </Text>
                </div>
              </div>

              <div>
                <span className={styles.snippetLabel}>Description</span>
                <Text as="p" tone="subdued">
                  {detailDefinition.description || 'No description yet.'}
                </Text>
              </div>

              <div>
                <span className={styles.snippetLabel}>Tests that fired this event</span>
                <div className={styles.testBreakdownList}>
                  {(detailDefinition.test_breakdown || []).length ? (
                    detailDefinition.test_breakdown.map(test => (
                      <div
                        key={`${test.test_id}-${test.last_seen_at}`}
                        className={styles.testBreakdownItem}
                      >
                        <div>
                          <strong>{test.test_name || 'Unknown test'}</strong>
                          <span>{test.test_id}</span>
                        </div>
                        <div>
                          <strong>{Number(test.count || 0).toLocaleString()}</strong>
                          <span>{formatDateTime(test.last_seen_at)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={styles.emptyState}>
                      <strong>No fired test data yet</strong>
                      <span>This event has not been recorded for a running test yet.</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <span className={styles.snippetLabel}>Trigger config</span>
                <pre className={styles.configPreview}>
                  {JSON.stringify(detailDefinition.trigger_config || {}, null, 2)}
                </pre>
                <div className={styles.copyActionRow}>
                  <Button
                    size="slim"
                    onClick={() =>
                      copyText(
                        JSON.stringify(detailDefinition.trigger_config || {}, null, 2),
                        'Copied trigger configuration.'
                      )
                    }
                  >
                    Copy config
                  </Button>
                </div>
              </div>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </div>
  );
}

export default GoalsMetrics;
