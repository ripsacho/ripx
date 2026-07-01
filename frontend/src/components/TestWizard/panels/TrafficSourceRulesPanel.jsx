import { Button, Select } from '@shopify/polaris';

import {
  createEmptyTrafficSourceRule,
  TRAFFIC_SOURCE_RULE_OPTIONS,
} from '../trafficSourceTargeting';

export default function TrafficSourceRulesPanel({ stepStyles, rules = [], onChange }) {
  const normalizedRules = Array.isArray(rules) ? rules : [];

  const updateRules = nextRules => {
    onChange?.(nextRules);
  };

  const updateRuleAt = (index, patch) => {
    updateRules(
      normalizedRules.map((rule, ruleIndex) => (ruleIndex === index ? { ...rule, ...patch } : rule))
    );
  };

  const removeRuleAt = index => {
    updateRules(normalizedRules.filter((_, ruleIndex) => ruleIndex !== index));
  };

  const addRule = () => {
    updateRules([...normalizedRules, createEmptyTrafficSourceRule('include', 'direct')]);
  };

  const addQuickRule = (value, type = 'include') => {
    if (normalizedRules.some(rule => rule.type === type && rule.value === value)) {
      return;
    }
    updateRules([...normalizedRules, createEmptyTrafficSourceRule(type, value)]);
  };

  return (
    <div className={stepStyles.panelSectionFull}>
      <div className={stepStyles.customUrlRulesHeader}>
        <span className={stepStyles.panelSectionTitle}>Source Sites</span>
        <div className={stepStyles.methodCommandActions}>
          <Button
            size="slim"
            onClick={() => updateRules([])}
            disabled={normalizedRules.length === 0}
          >
            All sources
          </Button>
          <Button size="slim" onClick={() => addRule()}>
            Add rule
          </Button>
        </div>
      </div>
      <div className={stepStyles.customUrlLogicCallout}>
        <span className={stepStyles.customUrlLogicLabel}>How it works</span>
        <span className={stepStyles.customUrlLogicText}>
          Include: show the test only when the visitor matches any included source. Exclude: hide
          the test when the visitor matches any excluded source. You can combine both lists.
        </span>
      </div>
      {normalizedRules.length === 0 ? (
        <div className={stepStyles.customUrlEmptyState}>
          <p className={stepStyles.customUrlEmptyTitle}>All traffic sources</p>
          <p className={stepStyles.customUrlEmptyDesc}>
            Add include or exclude rules to target specific channels such as paid search, email, or
            Instagram.
          </p>
          <div className={stepStyles.customUrlQuickAdd}>
            {[
              { label: 'Paid search', value: 'paid_search' },
              { label: 'Organic search', value: 'organic_search' },
              { label: 'Email', value: 'email' },
              { label: 'Instagram', value: 'instagram' },
            ].map(option => (
              <button
                key={option.value}
                type="button"
                className={stepStyles.customUrlQuickAddChip}
                onClick={() => addQuickRule(option.value, 'include')}
              >
                Include {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className={stepStyles.customUrlRulesList}>
            <span className={stepStyles.customUrlRulesLabel}>
              {normalizedRules.length} source rule{normalizedRules.length === 1 ? '' : 's'}
            </span>
          </div>
          {normalizedRules.map((rule, index) => (
            <div key={`${rule.type}-${rule.value}-${index}`} className={stepStyles.customRuleRow}>
              <span className={stepStyles.customRuleNumber} aria-hidden>
                {index + 1}
              </span>
              <div className={stepStyles.ruleTypeToggle}>
                <button
                  type="button"
                  className={`${stepStyles.ruleTypeBadge} ${
                    (rule.type || 'include') === 'include'
                      ? stepStyles.ruleTypeBadgeInclude
                      : stepStyles.ruleTypeBadgeInactive
                  }`}
                  onClick={() => updateRuleAt(index, { type: 'include' })}
                >
                  Include
                </button>
                <button
                  type="button"
                  className={`${stepStyles.ruleTypeBadge} ${
                    (rule.type || 'include') === 'exclude'
                      ? stepStyles.ruleTypeBadgeExclude
                      : stepStyles.ruleTypeBadgeInactive
                  }`}
                  onClick={() => updateRuleAt(index, { type: 'exclude' })}
                >
                  Exclude
                </button>
              </div>
              <div className={stepStyles.customRuleField}>
                <Select
                  label="Source"
                  labelHidden
                  options={TRAFFIC_SOURCE_RULE_OPTIONS.map(option => ({
                    label: option.label,
                    value: option.value,
                  }))}
                  value={rule.value || 'direct'}
                  onChange={value => updateRuleAt(index, { value })}
                />
              </div>
              <Button plain destructive onClick={() => removeRuleAt(index)}>
                Remove
              </Button>
            </div>
          ))}
          <div className={stepStyles.customUrlQuickAdd}>
            {[
              { label: 'Exclude direct', value: 'direct', type: 'exclude' },
              { label: 'Include paid social', value: 'paid_social', type: 'include' },
              { label: 'Include Google', value: 'google', type: 'include' },
            ].map(option => (
              <button
                key={`${option.type}-${option.value}`}
                type="button"
                className={stepStyles.customUrlQuickAddChip}
                onClick={() => addQuickRule(option.value, option.type)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
