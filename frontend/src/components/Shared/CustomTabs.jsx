/**
 * Custom Tabs Component
 *
 * A custom tabs implementation that only renders one tab bar
 * to avoid duplicate tab bars from Polaris Tabs
 */

import React from 'react';
import { InlineStack, Text } from '@shopify/polaris';
import './CustomTabs.css';

function CustomTabs({ tabs, selected, onSelect, children }) {
  return (
    <div className="custom-tabs-container">
      <div className="custom-tabs-list">
        <InlineStack gap="200" align="start">
          {tabs.map((tab, index) => (
            <button
              key={tab.id || index}
              className={`custom-tab ${selected === index ? 'custom-tab--selected' : ''}`}
              onClick={() => onSelect(index)}
              type="button"
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
