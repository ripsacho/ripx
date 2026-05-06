/**
 * Custom Tabs Component
 *
 * A custom tabs implementation that only renders one tab bar
 * to avoid duplicate tab bars from Polaris Tabs
 */

import React, { useCallback } from 'react';
import { InlineStack, Text } from '@shopify/polaris';
import './CustomTabs.css';

function CustomTabs({ tabs, selected, onSelect, children, ariaLabel = 'Tabs' }) {
  const count = tabs.length;
  const handleKeyDown = useCallback(
    e => {
      if (count === 0) return;
      if (e.key === 'ArrowLeft' || e.key === 'Home') {
        e.preventDefault();
        onSelect(e.key === 'Home' ? 0 : Math.max(0, selected - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'End') {
        e.preventDefault();
        onSelect(e.key === 'End' ? count - 1 : Math.min(count - 1, selected + 1));
      }
    },
    [selected, count, onSelect]
  );

  return (
    <div className="custom-tabs-container" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      <div className="custom-tabs-list">
        <InlineStack gap="200" align="start">
          {tabs.map((tab, index) => (
            <button
              key={tab.id || index}
              type="button"
              aria-current={selected === index ? 'page' : undefined}
              aria-pressed={selected === index}
              className={`custom-tab ${selected === index ? 'custom-tab--selected' : ''}`}
              onClick={() => onSelect(index)}
            >
              <Text
                as="span"
                variant="bodyMd"
                fontWeight={selected === index ? 'semibold' : 'medium'}
              >
                {tab.content}
              </Text>
            </button>
          ))}
        </InlineStack>
      </div>
      <div className="custom-tabs-panel">{children}</div>
    </div>
  );
}

export default CustomTabs;
