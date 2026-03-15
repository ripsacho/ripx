/**
 * IDE-style code editor: line numbers, Prism highlighting, VS Code–like token colors.
 * JavaScript: wraps bare identifiers as variables (Prism does not tag them).
 */
import React, { useCallback, useRef, useEffect } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import styles from './CodeEditorIDE.module.css';

const PADDING = 12;
const LINE_HEIGHT = 1.6;
const FONT_SIZE = 14;

const JS_RESERVED = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'enum',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'await',
  'async',
  'of',
  'get',
  'set',
  'from',
  'as',
  'undefined',
]);

/**
 * Only top-level text between Prism spans — avoids wrapping names inside keyword/function/class spans.
 */
function enhanceJavascriptIdentifiers(html) {
  if (typeof document === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;
  const replacements = [];
  div.childNodes.forEach(node => {
    if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue || !/[a-zA-Z_$]/.test(node.nodeValue)) {
      return;
    }
    const frag = document.createDocumentFragment();
    node.nodeValue.split(/(\b[a-zA-Z_$][\w$]*\b)/g).forEach(part => {
      if (/^[a-zA-Z_$][\w$]*$/.test(part) && !JS_RESERVED.has(part)) {
        const s = document.createElement('span');
        s.className = 'token identifier';
        s.textContent = part;
        frag.appendChild(s);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    });
    if (frag.childNodes.length) replacements.push({ node, frag });
  });
  replacements.forEach(({ node, frag }) => node.parentNode.replaceChild(frag, node));
  return div.innerHTML;
}

function highlightWithPrism(code, language) {
  if (!code.trim()) return '';
  try {
    if (language === 'css') {
      return Prism.highlight(code, Prism.languages.css, 'css');
    }
    const raw = Prism.highlight(code, Prism.languages.javascript, 'javascript');
    return enhanceJavascriptIdentifiers(raw);
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

export default function CodeEditorIDE({
  value = '',
  onChange,
  language = 'javascript',
  placeholder = '',
  error,
  disabled,
  minHeight = 380,
  'aria-label': ariaLabel,
}) {
  const scrollRef = useRef(null);
  const lineNumRef = useRef(null);

  const syncScroll = useCallback(() => {
    if (scrollRef.current && lineNumRef.current) {
      lineNumRef.current.scrollTop = scrollRef.current.scrollTop;
    }
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', syncScroll, { passive: true });
    return () => el.removeEventListener('scroll', syncScroll);
  }, [syncScroll]);

  const lineCount = Math.max(1, (value || '').split(/\n/).length);
  const lines = Array.from({ length: lineCount }, (_, i) => i + 1);

  const highlight = useCallback(code => highlightWithPrism(code, language), [language]);

  return (
    <div className={styles.wrap} style={{ minHeight }}>
      <div ref={lineNumRef} className={styles.lineNumbers} aria-hidden>
        {lines.map(n => (
          <div key={n} className={styles.lineNum}>
            {n}
          </div>
        ))}
      </div>
      <div ref={scrollRef} className={styles.editorScroll} onScroll={syncScroll}>
        <Editor
          value={value}
          onValueChange={onChange}
          highlight={highlight}
          placeholder={placeholder}
          padding={PADDING}
          disabled={disabled}
          ignoreTabKey={false}
          insertSpaces
          tabSize={2}
          className={styles.editor}
          textareaClassName={styles.textarea}
          preClassName={styles.pre}
          style={{
            fontFamily:
              '"SF Mono", "Monaco", "Inconsolata", "Roboto Mono", "Courier New", monospace',
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            minHeight: '100%',
          }}
          aria-label={ariaLabel}
        />
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
