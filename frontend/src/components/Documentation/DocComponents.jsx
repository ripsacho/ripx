/**
 * Reusable documentation components for rich, visual docs
 */

import React, { useState } from 'react';
import { Text, Button } from '@shopify/polaris';
import { ClipboardIcon } from '@shopify/polaris-icons';
import styles from './Documentation.module.css';

export function CodeBlock({ code, language = 'bash', title: blockTitle }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeBlockLang}>{blockTitle || language}</span>
        <Button
          variant="plain"
          size="slim"
          icon={ClipboardIcon}
          onClick={handleCopy}
          accessibilityLabel="Copy code"
        >
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>
      <pre className={styles.codeBlockPre}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function StepList({ steps, variant: _variant = 'numbered' }) {
  return (
    <ol className={styles.stepList}>
      {steps.map((step, i) => (
        <li key={i} className={styles.stepItem}>
          <span className={styles.stepNumber}>{i + 1}</span>
          <div className={styles.stepContent}>
            {typeof step === 'string' ? (
              <Text as="p" variant="bodyMd">
                {step}
              </Text>
            ) : (
              <>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {step.title}
                </Text>
                {step.desc && (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {step.desc}
                  </Text>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DocTable({ headers, rows }) {
  return (
    <div className={styles.docTableWrap}>
      <table className={styles.docTable}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DocCallout({ type = 'info', title, children }) {
  return (
    <div className={`${styles.callout} ${styles[`callout${type.charAt(0).toUpperCase() + type.slice(1)}`]}`}>
      <div className={styles.calloutTitle}>{title}</div>
      <div className={styles.calloutBody}>{children}</div>
    </div>
  );
}

export function FlowDiagram({ steps }) {
  return (
    <div className={styles.flowDiagram}>
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <div className={styles.flowNode}>{step}</div>
          {i < steps.length - 1 && (
            <div className={styles.flowArrow}>
              <span className={styles.flowArrowIcon}>→</span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'info' }) {
  return <span className={`${styles.badge} ${styles[`badge${tone.charAt(0).toUpperCase() + tone.slice(1)}`]}`}>{children}</span>;
}

export function DocGrid({ children, columns = 2 }) {
  return <div className={styles.docGrid} style={{ '--cols': columns }}>{children}</div>;
}

export function DocCard({ icon, title, children }) {
  return (
    <div className={styles.docCard}>
      {icon && <div className={styles.docCardIcon}>{icon}</div>}
      <Text variant="headingSm" as="h4">{title}</Text>
      <div className={styles.docCardBody}>{children}</div>
    </div>
  );
}
