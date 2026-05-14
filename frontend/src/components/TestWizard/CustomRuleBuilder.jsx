import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Banner, Button, Icon, Select, Text, TextField } from '@shopify/polaris';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DuplicateIcon,
  InfoIcon,
  PlusIcon,
} from '@shopify/polaris-icons';
import { TooltipWrapper } from '../Shared';
import AudienceCountryMultiSelect from './AudienceCountryMultiSelect';
import {
  countCustomAudienceConditions,
  createEmptyCustomRule,
  createEmptyCustomRuleGroup,
  CUSTOM_RULE_DEVICE_OPTIONS,
  CUSTOM_RULE_FIELDS,
  CUSTOM_RULE_OS_OPTIONS,
  CUSTOM_RULE_SAMPLE_PROFILES,
  CUSTOM_RULE_TEMPLATES,
  CUSTOM_RULE_TRAFFIC_SOURCE_OPTIONS,
  DEFAULT_CUSTOM_RULE_PREVIEW_CONTEXT,
  describeCustomAudienceGroupsLogic,
  duplicateCustomRuleAt,
  evaluateCustomAudienceGroupsDetailed,
  exportLegacyCustomRules,
  formatCustomRuleValue,
  getCustomRuleFieldDefinition,
  getCustomRuleOperatorHint,
  getCustomRuleOperatorOptions,
  getCustomRulePreviewFieldHint,
  getCustomRuleWarnings,
  matchesCustomAudienceRuleGroups,
  moveCustomRuleAt,
  normalizeCustomRuleGroups,
  normalizeCustomRuleValue,
  validateCustomRuleGroups,
} from './customAudienceRules';

const CUSTOM_RULE_TABLE_COLUMN_HINTS = {
  Condition: 'Connector between conditions inside the group.',
  Field: 'Visitor attribute evaluated at assignment time.',
  Operator: 'How the visitor value is compared to your rule value.',
  Value: 'Value compared against the visitor context.',
  Sample: 'Whether the sample visitor passes this row.',
  Actions: 'Reorder, duplicate, or remove this condition.',
};

function HintIcon({ styles, content, accessibilityLabel }) {
  if (!content) {
    return null;
  }
  return (
    <TooltipWrapper
      content={content}
      accessibilityLabel={accessibilityLabel}
      preferredPosition="above"
    >
      <span
        className={styles.customRuleInfoIcon}
        tabIndex={0}
        role="img"
        aria-label={accessibilityLabel}
      >
        <Icon source={InfoIcon} />
      </span>
    </TooltipWrapper>
  );
}

function RuleValueEditor({ rule, onChange }) {
  const definition = getCustomRuleFieldDefinition(rule.field);
  const operator = rule.operator || 'equals';
  const value = formatCustomRuleValue(rule);

  if (definition.valueKind === 'country') {
    const selected = Array.isArray(rule.value)
      ? rule.value
      : String(value || '')
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
    return (
      <AudienceCountryMultiSelect
        value={operator === 'equals' ? selected.slice(0, 1) : selected}
        onChange={codes =>
          onChange(
            operator === 'equals'
              ? codes[0] || ''
              : normalizeCustomRuleValue('in', codes.join(', '))
          )
        }
      />
    );
  }

  if (definition.valueKind === 'device' && operator === 'equals') {
    return (
      <Select
        label="Value"
        labelHidden
        options={CUSTOM_RULE_DEVICE_OPTIONS}
        value={value || 'desktop'}
        onChange={nextValue => onChange(nextValue)}
      />
    );
  }

  if (definition.valueKind === 'operating_system' && operator === 'equals') {
    return (
      <Select
        label="Value"
        labelHidden
        options={CUSTOM_RULE_OS_OPTIONS}
        value={value || 'windows'}
        onChange={nextValue => onChange(nextValue)}
      />
    );
  }

  if (definition.valueKind === 'traffic_source' && operator === 'equals') {
    return (
      <Select
        label="Value"
        labelHidden
        options={CUSTOM_RULE_TRAFFIC_SOURCE_OPTIONS}
        value={value || CUSTOM_RULE_TRAFFIC_SOURCE_OPTIONS[0].value}
        onChange={nextValue => onChange(nextValue)}
      />
    );
  }

  return (
    <TextField
      label="Value"
      labelHidden
      value={value}
      onChange={nextValue => onChange(normalizeCustomRuleValue(operator, nextValue))}
      placeholder={
        operator === 'in'
          ? definition.valueKind === 'country'
            ? 'US, CA, GB'
            : 'value-a, value-b'
          : definition.placeholder || 'Value'
      }
      helpText={operator === 'in' ? 'Comma-separated list' : definition.hint}
      autoComplete="off"
    />
  );
}

function evaluationTone(status) {
  if (status === 'match') {
    return 'success';
  }
  if (status === 'no-match') {
    return 'critical';
  }
  if (status === 'invalid') {
    return 'warning';
  }
  return 'info';
}

const CUSTOM_RULE_PREVIEW_PRIMARY_FIELDS = [
  'device',
  'country',
  'traffic_source',
  'utm_source',
  'utm_medium',
  'current_url',
];

export default function CustomRuleBuilder({
  styles,
  groups: groupsProp,
  rules: rulesProp = [],
  onChange,
  onChangeGroups,
  standardSegments = {},
  emptyMessage = 'No custom conditions yet. Start from a template or add your first condition.',
  addLabel = 'Add condition',
  showTemplates = true,
  showPreview = true,
}) {
  const groups = useMemo(
    () => normalizeCustomRuleGroups(groupsProp, rulesProp),
    [groupsProp, rulesProp]
  );
  const totalRuleCount = useMemo(() => countCustomAudienceConditions(groups), [groups]);
  const [previewContext, setPreviewContext] = useState(DEFAULT_CUSTOM_RULE_PREVIEW_CONTEXT);
  const [quickStartsOpen, setQuickStartsOpen] = useState(() => totalRuleCount === 0);
  const [previewFieldsOpen, setPreviewFieldsOpen] = useState(false);
  const validationErrors = useMemo(() => validateCustomRuleGroups(groups), [groups]);
  const warnings = useMemo(
    () => getCustomRuleWarnings([], standardSegments, groups),
    [groups, standardSegments]
  );
  const previewMatches = useMemo(
    () => matchesCustomAudienceRuleGroups(groups, previewContext),
    [groups, previewContext]
  );
  const detailedGroups = useMemo(
    () => evaluateCustomAudienceGroupsDetailed(groups, previewContext),
    [groups, previewContext]
  );
  const logicSummary = useMemo(() => describeCustomAudienceGroupsLogic(groups), [groups]);
  const previewFieldEntries = useMemo(() => {
    const entries = Object.entries(previewContext);
    if (previewFieldsOpen) {
      return entries;
    }
    const primary = new Set(CUSTOM_RULE_PREVIEW_PRIMARY_FIELDS);
    return entries.filter(([key]) => primary.has(key));
  }, [previewContext, previewFieldsOpen]);

  useEffect(() => {
    if (totalRuleCount === 0) {
      setQuickStartsOpen(true);
    }
  }, [totalRuleCount]);

  const updateGroups = nextGroups => {
    const normalized = normalizeCustomRuleGroups(nextGroups);
    onChangeGroups?.(normalized);
    onChange?.(exportLegacyCustomRules(normalized));
  };

  const updateGroupAt = (groupIndex, patch) => {
    updateGroups(
      groups.map((group, index) => (index === groupIndex ? { ...group, ...patch } : group))
    );
  };

  const updateRuleAt = (groupIndex, ruleIndex, patch) => {
    const current = groups[groupIndex]?.rules?.[ruleIndex] || createEmptyCustomRule();
    const nextRule = { ...current, ...patch };
    if (patch.field && patch.field !== current.field) {
      const operators = getCustomRuleOperatorOptions(patch.field).map(option => option.value);
      if (!operators.includes(nextRule.operator)) {
        nextRule.operator = operators[0] || 'equals';
      }
      nextRule.value = '';
    }
    if (patch.operator && patch.operator !== current.operator && patch.value === undefined) {
      nextRule.value = normalizeCustomRuleValue(patch.operator, current.value);
    }
    updateGroups(
      groups.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              rules: [
                ...group.rules.slice(0, ruleIndex),
                nextRule,
                ...group.rules.slice(ruleIndex + 1),
              ],
            }
          : group
      )
    );
  };

  const removeRuleAt = (groupIndex, ruleIndex) => {
    updateGroups(
      groups
        .map((group, index) => {
          if (index !== groupIndex) {
            return group;
          }
          const nextRules = group.rules.filter((_, currentIndex) => currentIndex !== ruleIndex);
          return nextRules.length > 0 ? { ...group, rules: nextRules } : null;
        })
        .filter(Boolean)
    );
  };

  const addRuleToGroup = (groupIndex = Math.max(groups.length - 1, 0)) => {
    if (groups.length === 0) {
      updateGroups([{ match: 'all', rules: [createEmptyCustomRule()] }]);
      return;
    }
    updateGroups(
      groups.map((group, index) =>
        index === groupIndex
          ? { ...group, rules: [...group.rules, createEmptyCustomRule()] }
          : group
      )
    );
  };

  const addGroup = (match = 'all') => {
    updateGroups([...groups, createEmptyCustomRuleGroup(match)]);
  };

  const removeGroupAt = groupIndex => {
    updateGroups(groups.filter((_, index) => index !== groupIndex));
  };

  const applyTemplate = template => {
    updateGroups([{ match: 'all', rules: template.rules.map(rule => ({ ...rule })) }]);
    setQuickStartsOpen(false);
  };

  return (
    <div className={styles.customRuleStudio}>
      <div
        className={`${styles.customRuleStudioHeader} ${
          totalRuleCount > 0 ? styles.customRuleStudioHeaderCompact : ''
        }`}
      >
        <div className={styles.customRuleStudioHeaderCopy}>
          <div className={styles.customRuleStudioTitleRow}>
            <Text as="h5" variant="headingSm">
              Custom audience logic
            </Text>
            <HintIcon
              styles={styles}
              content="Custom rules stack on top of Standard audience filters. Groups are AND-combined; use OR inside a group when any condition should qualify."
              accessibilityLabel="Custom audience logic help"
            />
          </div>
          <Text as="p" variant="bodySm" tone="subdued">
            {totalRuleCount > 0
              ? 'Every group must match. Inside an OR group, at least one condition must match.'
              : 'Build AND groups or OR groups. Standard audience filters still apply on top.'}
          </Text>
          {totalRuleCount > 0 ? (
            <Text as="p" variant="bodySm" tone="subdued">
              {logicSummary}
            </Text>
          ) : null}
        </div>
        <div className={styles.customRuleStudioHeaderMeta}>
          {totalRuleCount > 0 ? (
            <TooltipWrapper
              content="Groups are AND-combined. OR groups need at least one matching condition inside the group."
              accessibilityLabel="Custom condition count help"
            >
              <Badge tone={validationErrors.length > 0 ? 'warning' : 'info'}>
                {totalRuleCount} condition{totalRuleCount === 1 ? '' : 's'}
              </Badge>
            </TooltipWrapper>
          ) : null}
          {showPreview && totalRuleCount > 0 ? (
            <TooltipWrapper
              content="Based on the sample visitor values in the preview panel."
              accessibilityLabel="Sample visitor match help"
            >
              <Badge tone={previewMatches ? 'success' : 'critical'}>
                {previewMatches ? 'Sample visitor matches' : 'Sample visitor excluded'}
              </Badge>
            </TooltipWrapper>
          ) : null}
        </div>
      </div>

      {warnings.length > 0 ? (
        <Banner tone="warning">
          <ul className={styles.customRuleWarningList}>
            {warnings.map(warning => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      {validationErrors.length > 0 ? (
        <Banner tone="critical">
          <ul className={styles.customRuleWarningList}>
            {validationErrors.map(error => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Banner>
      ) : null}

      <div className={styles.customRuleStudioBody}>
        <div className={styles.customRuleStudioMain}>
          {showTemplates ? (
            <div
              className={`${styles.customRuleQuickStartBar} ${
                quickStartsOpen ? styles.customRuleQuickStartBarOpen : ''
              }`}
            >
              <div className={styles.customRuleQuickStartHeader}>
                <span className={styles.customRuleQuickStartLabel}>Quick starts</span>
                <HintIcon
                  styles={styles}
                  content="Replace the current custom rules with a preset AND condition set."
                  accessibilityLabel="Quick starts help"
                />
                {totalRuleCount > 0 ? (
                  <TooltipWrapper
                    content={
                      quickStartsOpen
                        ? 'Hide preset shortcuts while you edit conditions.'
                        : 'Show preset shortcuts without changing your current conditions until you pick one.'
                    }
                    accessibilityLabel="Quick start presets visibility"
                  >
                    <button
                      type="button"
                      className={styles.customRuleQuickStartToggle}
                      onClick={() => setQuickStartsOpen(open => !open)}
                      aria-expanded={quickStartsOpen}
                    >
                      {quickStartsOpen ? 'Hide presets' : 'Show presets'}
                    </button>
                  </TooltipWrapper>
                ) : null}
              </div>
              {quickStartsOpen ? (
                <div className={styles.customRuleQuickStartOptions}>
                  {CUSTOM_RULE_TEMPLATES.map(template => (
                    <TooltipWrapper
                      key={template.id}
                      content={template.description}
                      accessibilityLabel={`${template.label} preset`}
                    >
                      <button
                        type="button"
                        className={styles.customRuleQuickStartBtn}
                        onClick={() => applyTemplate(template)}
                      >
                        {template.label}
                      </button>
                    </TooltipWrapper>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {totalRuleCount === 0 && !showTemplates ? (
            <div className={styles.customRuleEmptyState}>
              <Text as="p" variant="bodySm" tone="subdued">
                {emptyMessage}
              </Text>
            </div>
          ) : null}

          {totalRuleCount > 0 ? (
            <div className={styles.customRuleGroupStack}>
              {detailedGroups.map((groupRow, groupIndex) => {
                const groupRules = groups[groupIndex]?.rules || [];
                const connectorLabel = groupRow.match === 'any' ? 'OR' : 'AND';
                const groupLabel =
                  detailedGroups.length > 1 ? `Group ${groupIndex + 1}` : 'Conditions';
                return (
                  <React.Fragment key={`custom-rule-group-${groupIndex}`}>
                    {groupIndex > 0 ? (
                      <TooltipWrapper
                        content="Every group must match for the visitor to qualify."
                        accessibilityLabel="Group AND connector help"
                      >
                        <div className={styles.customRuleGroupBetween}>
                          <span className={styles.customRuleConnector}>AND</span>
                        </div>
                      </TooltipWrapper>
                    ) : null}
                    <section className={styles.customRuleGroup}>
                      <div className={styles.customRuleGroupHeader}>
                        <div className={styles.customRuleGroupHeaderCopy}>
                          <Text as="h6" variant="headingSm">
                            {groupLabel}
                          </Text>
                          <HintIcon
                            styles={styles}
                            content={
                              groupRow.match === 'any'
                                ? 'At least one condition in this group must match.'
                                : 'Every condition in this group must match.'
                            }
                            accessibilityLabel={`${groupLabel} match mode help`}
                          />
                        </div>
                        <div className={styles.customRuleGroupHeaderActions}>
                          <Select
                            label="Match mode"
                            labelHidden
                            options={[
                              { label: 'Match all', value: 'all' },
                              { label: 'Match any', value: 'any' },
                            ]}
                            value={groupRow.match}
                            onChange={value => updateGroupAt(groupIndex, { match: value })}
                          />
                          {detailedGroups.length > 1 ? (
                            <TooltipWrapper
                              content="Remove this group from the audience logic."
                              accessibilityLabel="Remove group help"
                            >
                              <button
                                type="button"
                                className={styles.removeRuleBtn}
                                onClick={() => removeGroupAt(groupIndex)}
                              >
                                Remove group
                              </button>
                            </TooltipWrapper>
                          ) : null}
                          <TooltipWrapper
                            content={
                              groupRow.groupMatches
                                ? 'Sample visitor passes this group.'
                                : 'Sample visitor fails this group.'
                            }
                            accessibilityLabel={`${groupLabel} sample result help`}
                          >
                            <Badge tone={groupRow.groupMatches ? 'success' : 'critical'}>
                              {groupRow.groupMatches ? 'Group matches' : 'Group fails'}
                            </Badge>
                          </TooltipWrapper>
                        </div>
                      </div>
                      <div className={styles.customRuleTable}>
                        <div className={styles.customRuleTableHead} aria-hidden="true">
                          {Object.entries(CUSTOM_RULE_TABLE_COLUMN_HINTS).map(([label, hint]) => (
                            <TooltipWrapper
                              key={`${groupIndex}-${label}`}
                              content={
                                label === 'Condition'
                                  ? groupRow.match === 'any'
                                    ? 'Conditions in this group are OR-combined.'
                                    : 'Conditions in this group are AND-combined.'
                                  : hint
                              }
                              accessibilityLabel={`${label} column help`}
                            >
                              <span>{label}</span>
                            </TooltipWrapper>
                          ))}
                        </div>
                        {groupRow.rules.map((row, ruleIndex) => {
                          const operatorOptions = getCustomRuleOperatorOptions(row.rule.field);
                          const errorPrefix =
                            detailedGroups.length > 1
                              ? `Custom audience group ${groupIndex + 1} rule ${ruleIndex + 1}:`
                              : `Custom audience rule ${ruleIndex + 1}:`;
                          const rowError = validationErrors.find(message =>
                            message.startsWith(errorPrefix)
                          );
                          return (
                            <div
                              key={`custom-rule-${groupIndex}-${ruleIndex}`}
                              className={styles.customRuleTableRow}
                            >
                              <div className={styles.customRuleTableCell}>
                                {ruleIndex > 0 ? (
                                  <TooltipWrapper
                                    content={
                                      groupRow.match === 'any'
                                        ? 'At least one OR condition in this group must match.'
                                        : 'Every AND condition in this group must match.'
                                    }
                                    accessibilityLabel={`${connectorLabel} condition help`}
                                  >
                                    <span className={styles.customRuleConnector}>
                                      {connectorLabel}
                                    </span>
                                  </TooltipWrapper>
                                ) : (
                                  <span className={styles.customRuleNumber}>#{ruleIndex + 1}</span>
                                )}
                              </div>
                              <div className={styles.customRuleTableCell}>
                                <div className={styles.customRuleFieldRow}>
                                  <Select
                                    label="Field"
                                    labelHidden
                                    options={CUSTOM_RULE_FIELDS.map(field => ({
                                      label: field.label,
                                      value: field.value,
                                    }))}
                                    value={row.rule.field || 'utm_source'}
                                    onChange={value =>
                                      updateRuleAt(groupIndex, ruleIndex, { field: value })
                                    }
                                  />
                                  <HintIcon
                                    styles={styles}
                                    content={row.field.hint}
                                    accessibilityLabel={`${row.field.label} field help`}
                                  />
                                </div>
                              </div>
                              <div className={styles.customRuleTableCell}>
                                <div className={styles.customRuleFieldRow}>
                                  <Select
                                    label="Operator"
                                    labelHidden
                                    options={operatorOptions}
                                    value={row.rule.operator || 'equals'}
                                    onChange={value =>
                                      updateRuleAt(groupIndex, ruleIndex, { operator: value })
                                    }
                                  />
                                  <HintIcon
                                    styles={styles}
                                    content={getCustomRuleOperatorHint(row.rule.operator)}
                                    accessibilityLabel={`${row.rule.operator || 'equals'} operator help`}
                                  />
                                </div>
                              </div>
                              <div
                                className={`${styles.customRuleTableCell} ${styles.customRuleValueField}`}
                              >
                                <RuleValueEditor
                                  rule={row.rule}
                                  onChange={value => updateRuleAt(groupIndex, ruleIndex, { value })}
                                />
                                {rowError ? (
                                  <Text as="p" variant="bodySm" tone="critical">
                                    {rowError.replace(errorPrefix, '').trim()}
                                  </Text>
                                ) : null}
                              </div>
                              <div className={styles.customRuleTableCell}>
                                <TooltipWrapper
                                  content={row.description}
                                  accessibilityLabel={`Sample result for condition ${ruleIndex + 1}`}
                                >
                                  <Badge tone={evaluationTone(row.evaluation.status)}>
                                    {row.evaluation.label}
                                  </Badge>
                                </TooltipWrapper>
                              </div>
                              <div
                                className={`${styles.customRuleTableCell} ${styles.customRuleRowActions}`}
                              >
                                <TooltipWrapper
                                  content="Move this condition earlier."
                                  accessibilityLabel="Move condition up"
                                >
                                  <button
                                    type="button"
                                    className={styles.customRuleIconBtn}
                                    onClick={() =>
                                      updateGroupAt(groupIndex, {
                                        rules: moveCustomRuleAt(groupRules, ruleIndex, -1),
                                      })
                                    }
                                    disabled={ruleIndex === 0}
                                    aria-label={`Move condition ${ruleIndex + 1} up`}
                                  >
                                    <Icon source={ChevronUpIcon} />
                                  </button>
                                </TooltipWrapper>
                                <TooltipWrapper
                                  content="Move this condition later."
                                  accessibilityLabel="Move condition down"
                                >
                                  <button
                                    type="button"
                                    className={styles.customRuleIconBtn}
                                    onClick={() =>
                                      updateGroupAt(groupIndex, {
                                        rules: moveCustomRuleAt(groupRules, ruleIndex, 1),
                                      })
                                    }
                                    disabled={ruleIndex === groupRules.length - 1}
                                    aria-label={`Move condition ${ruleIndex + 1} down`}
                                  >
                                    <Icon source={ChevronDownIcon} />
                                  </button>
                                </TooltipWrapper>
                                <TooltipWrapper
                                  content="Copy this condition below."
                                  accessibilityLabel="Duplicate condition"
                                >
                                  <button
                                    type="button"
                                    className={styles.customRuleIconBtn}
                                    onClick={() =>
                                      updateGroupAt(groupIndex, {
                                        rules: duplicateCustomRuleAt(groupRules, ruleIndex),
                                      })
                                    }
                                    aria-label={`Duplicate condition ${ruleIndex + 1}`}
                                  >
                                    <Icon source={DuplicateIcon} />
                                  </button>
                                </TooltipWrapper>
                                <TooltipWrapper
                                  content="Remove this condition from the group."
                                  accessibilityLabel="Remove condition"
                                >
                                  <button
                                    type="button"
                                    className={styles.removeRuleBtn}
                                    onClick={() => removeRuleAt(groupIndex, ruleIndex)}
                                  >
                                    Remove
                                  </button>
                                </TooltipWrapper>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <TooltipWrapper
                        content="Add another condition to this group."
                        accessibilityLabel="Add condition to group help"
                      >
                        <button
                          type="button"
                          className={styles.addRuleBtn}
                          onClick={() => addRuleToGroup(groupIndex)}
                        >
                          <Icon source={PlusIcon} />
                          Add condition to group
                        </button>
                      </TooltipWrapper>
                    </section>
                  </React.Fragment>
                );
              })}
            </div>
          ) : null}

          <div className={styles.customRuleGroupAddRow}>
            <TooltipWrapper
              content="Append another AND group to the audience logic."
              accessibilityLabel="Add AND group help"
            >
              <button
                type="button"
                className={styles.addRuleBtn}
                onClick={() => (totalRuleCount === 0 ? addRuleToGroup() : addGroup('all'))}
              >
                <Icon source={PlusIcon} />
                {totalRuleCount === 0 ? addLabel : 'Add AND group'}
              </button>
            </TooltipWrapper>
            {totalRuleCount > 0 ? (
              <TooltipWrapper
                content="Create a group where any one condition can qualify the visitor."
                accessibilityLabel="Add OR group help"
              >
                <button type="button" className={styles.addRuleBtn} onClick={() => addGroup('any')}>
                  <Icon source={PlusIcon} />
                  Add OR group
                </button>
              </TooltipWrapper>
            ) : null}
          </div>
        </div>

        {showPreview && totalRuleCount > 0 ? (
          <aside className={styles.customRuleStudioAside}>
            <div className={styles.customRulePreviewCard}>
              <div className={styles.customRulePreviewHeader}>
                <div>
                  <div className={styles.customRuleStudioTitleRow}>
                    <Text as="h5" variant="headingSm">
                      Sample visitor
                    </Text>
                    <HintIcon
                      styles={styles}
                      content="Adjust sample values to preview whether the custom audience logic would include this visitor."
                      accessibilityLabel="Sample visitor help"
                    />
                  </div>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Check each group against a sample visitor.
                  </Text>
                </div>
                <TooltipWrapper
                  content="Whether the sample visitor passes every custom group."
                  accessibilityLabel="Sample visitor inclusion help"
                >
                  <Badge tone={previewMatches ? 'success' : 'critical'}>
                    {previewMatches ? 'Included' : 'Excluded'}
                  </Badge>
                </TooltipWrapper>
              </div>

              <div className={styles.customRuleSampleProfileRow}>
                {CUSTOM_RULE_SAMPLE_PROFILES.map(profile => (
                  <TooltipWrapper
                    key={profile.id}
                    content={profile.tooltip || profile.label}
                    accessibilityLabel={`${profile.label} sample profile`}
                  >
                    <button
                      type="button"
                      className={styles.customRuleSampleProfileBtn}
                      onClick={() => setPreviewContext({ ...profile.context })}
                    >
                      {profile.label}
                    </button>
                  </TooltipWrapper>
                ))}
              </div>

              <div className={styles.customRulePreviewGrid}>
                {previewFieldEntries.map(([key, value]) => (
                  <TooltipWrapper
                    key={key}
                    content={getCustomRulePreviewFieldHint(key)}
                    accessibilityLabel={`${key.replace(/_/g, ' ')} field help`}
                  >
                    <div>
                      <TextField
                        label={key.replace(/_/g, ' ')}
                        value={String(value ?? '')}
                        onChange={nextValue =>
                          setPreviewContext(prev => ({
                            ...prev,
                            [key]: nextValue,
                          }))
                        }
                        autoComplete="off"
                      />
                    </div>
                  </TooltipWrapper>
                ))}
              </div>

              <div className={styles.customRulePreviewActions}>
                <TooltipWrapper
                  content={
                    previewFieldsOpen
                      ? 'Collapse back to the most common visitor fields.'
                      : 'Show referrer and operating system fields used by custom rules.'
                  }
                  accessibilityLabel="Sample visitor fields visibility"
                >
                  <Button variant="plain" onClick={() => setPreviewFieldsOpen(open => !open)}>
                    {previewFieldsOpen ? 'Show key fields only' : 'Show all context fields'}
                  </Button>
                </TooltipWrapper>
                <TooltipWrapper
                  content="Restore the default sample visitor values."
                  accessibilityLabel="Reset sample visitor help"
                >
                  <Button
                    variant="plain"
                    onClick={() => setPreviewContext({ ...DEFAULT_CUSTOM_RULE_PREVIEW_CONTEXT })}
                  >
                    Reset sample visitor
                  </Button>
                </TooltipWrapper>
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
