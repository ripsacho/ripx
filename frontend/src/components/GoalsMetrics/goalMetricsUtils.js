export const SEARCH_PREFIXES = new Set([
  'category',
  'event',
  'key',
  'name',
  'role',
  'source',
  'status',
  'tag',
  'trigger',
]);

export function normalizeEventName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

export function getRoleLabel(role) {
  if (role === 'primary') {
    return 'Primary candidate';
  }
  if (role === 'guardrail') {
    return 'Guardrail';
  }
  return 'Secondary';
}

export function getDefinitionHealth(item) {
  if (item.builtin) {
    return { label: 'Ready', tone: 'info' };
  }
  if (Number(item.observed_count || 0) > 0) {
    return { label: 'Observed', tone: 'success' };
  }
  if (item.trigger_type && item.trigger_type !== 'custom_event') {
    return { label: 'Auto armed', tone: 'attention' };
  }
  return { label: 'Waiting', tone: 'subdued' };
}

export function needsAttention(item) {
  if (!item || item.builtin) {
    return false;
  }
  return Number(item.observed_count || 0) <= 0;
}

export function getUnknownSearchPrefixes(query) {
  return Array.from(
    new Set(
      String(query || '')
        .split(/\s+/)
        .map(token => token.trim())
        .filter(token => token.includes(':'))
        .map(token => token.split(':')[0].toLowerCase())
        .filter(prefix => prefix && !SEARCH_PREFIXES.has(prefix))
    )
  );
}

export function getSearchValue(item, key, triggerLabels = {}) {
  if (key === 'key' || key === 'event') {
    return item.event_name;
  }
  if (key === 'name') {
    return item.name;
  }
  if (key === 'tag') {
    return Array.isArray(item.tags) ? item.tags.join(' ') : '';
  }
  if (key === 'trigger') {
    return `${item.trigger_type || ''} ${triggerLabels[item.trigger_type] || ''}`;
  }
  if (key === 'role') {
    return `${item.metric_role || ''} ${getRoleLabel(item.metric_role)}`;
  }
  if (key === 'source') {
    return item.builtin ? 'builtin built-in' : 'custom';
  }
  if (key === 'status') {
    return getDefinitionHealth(item).label;
  }
  if (key === 'category') {
    return item.category;
  }
  return null;
}

export function matchesSearchQuery(item, query, triggerLabels = {}) {
  const tokens = String(query || '')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return true;
  }
  const haystack = [
    item.name,
    item.event_name,
    item.description,
    item.category,
    item.metric_role,
    item.trigger_type,
    triggerLabels[item.trigger_type],
    getDefinitionHealth(item).label,
    item.builtin ? 'builtin built-in' : 'custom',
    needsAttention(item) ? 'attention needs_attention needs attention' : '',
    ...(Array.isArray(item.tags) ? item.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return tokens.every(token => {
    const [rawKey, ...rest] = token.split(':');
    if (rest.length) {
      const key = rawKey.toLowerCase();
      const value = rest.join(':').toLowerCase();
      const scopedValue = getSearchValue(item, key, triggerLabels);
      return scopedValue === null
        ? haystack.includes(token.toLowerCase())
        : scopedValue.toLowerCase().includes(value);
    }
    return haystack.includes(token.toLowerCase());
  });
}
