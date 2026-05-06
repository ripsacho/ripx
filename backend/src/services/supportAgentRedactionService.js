const SECRET_KEY_PATTERN =
  /(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|credential|authorization|jwt|private[_-]?key)/i;

const TEXT_PATTERNS = [
  {
    pattern: /\b(?:sk|sess|rk|pk)-[A-Za-z0-9_-]{20,}\b/g,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    pattern: /\bshpat_[A-Za-z0-9_]{20,}\b/g,
    replacement: '[REDACTED_SHOPIFY_TOKEN]',
  },
  {
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: '[REDACTED_TOKEN]',
  },
  {
    pattern: /Bearer\s+[A-Za-z0-9._-]{16,}/gi,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
];

function redactText(value) {
  let text = String(value || '');
  for (const { pattern, replacement } of TEXT_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function redactValue(value, key = '') {
  if (SECRET_KEY_PATTERN.test(String(key || ''))) {
    return '[REDACTED_SECRET]';
  }
  if (String(key || '').toLowerCase() === 'custom_javascript') {
    return `[REDACTED_CUSTOM_JS length=${String(value || '').length}]`;
  }
  if (typeof value === 'string') {
    return redactText(value);
  }
  return value;
}

function redactForLlm(input, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 8;
  const seen = new WeakSet();

  function visit(value, key = '', depth = 0) {
    const redacted = redactValue(value, key);
    if (redacted !== value || value === null || value === undefined) {
      return redacted;
    }
    if (depth >= maxDepth) {
      return '[TRUNCATED_DEPTH]';
    }
    if (Array.isArray(value)) {
      return value.slice(0, 50).map(item => visit(item, key, depth + 1));
    }
    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[CIRCULAR]';
      }
      seen.add(value);
      const out = {};
      for (const [childKey, childValue] of Object.entries(value)) {
        out[childKey] = visit(childValue, childKey, depth + 1);
      }
      return out;
    }
    return value;
  }

  return visit(input);
}

module.exports = {
  redactText,
  redactForLlm,
};
