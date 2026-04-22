export const MAX_VISUAL_EDITOR_HISTORY = 40;
export const VISUAL_EDITOR_POSITIONS = ['after', 'before', 'afterbegin', 'beforeend'];
export const VISUAL_EDITOR_MUTATION_TYPES = [
  'none',
  'hide',
  'show',
  'set_text',
  'set_attr',
  'set_style',
];

export function createEmptyVisualEditorRule() {
  return {
    selector: '',
    css: '',
    js: '',
    position: 'after',
    mutation_type: 'none',
    mutation_text: '',
    mutation_attribute: '',
    mutation_attribute_value: '',
    mutation_style: '',
  };
}

export function normalizeVisualEditorRule(rawRule) {
  const base = createEmptyVisualEditorRule();
  const rule = rawRule && typeof rawRule === 'object' ? rawRule : {};
  const mutationType = String(rule.mutation_type || base.mutation_type)
    .toLowerCase()
    .trim();
  return {
    selector: String(rule.selector || '').trim(),
    css: String(rule.css || '').trim(),
    js: String(rule.js || '').trim(),
    position: VISUAL_EDITOR_POSITIONS.includes(rule.position) ? rule.position : base.position,
    mutation_type: VISUAL_EDITOR_MUTATION_TYPES.includes(mutationType)
      ? mutationType
      : base.mutation_type,
    mutation_text:
      rule.mutation_text === undefined || rule.mutation_text === null
        ? base.mutation_text
        : String(rule.mutation_text),
    mutation_attribute: String(rule.mutation_attribute || '').trim(),
    mutation_attribute_value:
      rule.mutation_attribute_value === undefined || rule.mutation_attribute_value === null
        ? base.mutation_attribute_value
        : String(rule.mutation_attribute_value),
    mutation_style: String(rule.mutation_style || '').trim(),
  };
}

export function cloneVisualEditorRules(rawRules) {
  return Array.from({ length: 5 }, (_, i) => ({
    ...normalizeVisualEditorRule((rawRules || [])[i]),
  }));
}

export function buildGeneratedVisualRuleCode(rule) {
  const r = normalizeVisualEditorRule(rule);
  const selector = r.selector || '/* selector required */';
  const lines = [];
  lines.push(`const el = document.querySelector(${JSON.stringify(selector)});`);
  lines.push('if (el) {');
  if (r.mutation_type === 'hide') {
    lines.push("  el.style.setProperty('display', 'none', 'important');");
  } else if (r.mutation_type === 'show') {
    lines.push("  el.style.removeProperty('display');");
    lines.push("  el.style.removeProperty('visibility');");
    lines.push("  el.removeAttribute('hidden');");
  } else if (r.mutation_type === 'set_text') {
    lines.push(`  el.textContent = ${JSON.stringify(r.mutation_text || '')};`);
  } else if (r.mutation_type === 'set_attr') {
    const attrName = String(r.mutation_attribute || '').trim();
    if (attrName) {
      const attrValue = String(r.mutation_attribute_value || '');
      if (attrValue) {
        lines.push(`  el.setAttribute(${JSON.stringify(attrName)}, ${JSON.stringify(attrValue)});`);
      } else {
        lines.push(`  el.removeAttribute(${JSON.stringify(attrName)});`);
      }
    } else {
      lines.push('  // Add an attribute name to generate set/remove attribute code.');
    }
  } else if (r.mutation_type === 'set_style') {
    const styleLines = String(r.mutation_style || '')
      .split(';')
      .map(part => part.trim())
      .filter(Boolean);
    if (styleLines.length > 0) {
      styleLines.forEach(decl => {
        const colon = decl.indexOf(':');
        if (colon > 0) {
          const key = decl.slice(0, colon).trim();
          const value = decl.slice(colon + 1).trim();
          if (key && value) {
            lines.push(`  el.style.setProperty(${JSON.stringify(key)}, ${JSON.stringify(value)});`);
          }
        }
      });
    } else {
      lines.push('  // Add CSS declarations (e.g. color: #111; font-weight: 700;).');
    }
  } else {
    lines.push('  // No quick mutation selected.');
  }
  lines.push('}');
  if (r.css) {
    lines.push('');
    lines.push('/* CSS snippet */');
    lines.push(r.css);
  }
  if (r.js) {
    lines.push('');
    lines.push('/* JS snippet */');
    lines.push(r.js);
  }
  return lines.join('\n');
}
