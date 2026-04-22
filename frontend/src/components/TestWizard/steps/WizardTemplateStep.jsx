import React from 'react';
import { Card, Icon, TextField } from '@shopify/polaris';
import { InfoIcon, PageIcon } from '@shopify/polaris-icons';

import { TooltipWrapper } from '../../Shared';
import stepStyles from '../WizardSteps.module.css';
import { TEST_TEMPLATES } from '../testWizardConfig';

export default function WizardTemplateStep({
  stepsLength,
  selectedTemplate,
  formData,
  setFormData,
  showTemplateStep,
  currentStep,
  contentTypesForStep,
  profitTypesForStep,
  isTemplateTypeEnabled,
  getTemplateUnavailableReason,
  handleTemplateSelect,
  isStandalone,
  testTypeCategories,
}) {
  return (
    <div className={stepStyles.templateStep}>
      <div className={stepStyles.templateStepAccent} aria-hidden />
      <div className={stepStyles.templateStepHeader}>
        <div className={stepStyles.templateStepHeaderLeft}>
          <span className={stepStyles.templateStepIcon}>
            <Icon source={PageIcon} />
          </span>
          <div>
            <h2 className={stepStyles.templateStepTitle}>Select a test type to begin</h2>
            <p className={stepStyles.templateStepSubtitle}>
              {selectedTemplate
                ? `${TEST_TEMPLATES[selectedTemplate]?.name || selectedTemplate} selected — click Next to continue`
                : 'Give your test a name, then choose a template below'}
            </p>
          </div>
        </div>
        <span className={stepStyles.templateStepBadge}>1 of {stepsLength}</span>
      </div>
      <div className={stepStyles.templateStepContent}>
        <div className={stepStyles.templateStepSections}>
          <div className={stepStyles.templateNameSection}>
            <div className={stepStyles.templateNameSectionHeader}>
              <span className={stepStyles.templateNameSectionIcon} aria-hidden>
                1
              </span>
              <div>
                <h3 className={stepStyles.templateSectionLabel}>Test details</h3>
                <p className={stepStyles.templateSectionHint}>
                  Name and describe your test for easy identification
                </p>
              </div>
            </div>
            {selectedTemplate && TEST_TEMPLATES[selectedTemplate] && (
              <div className={stepStyles.templateTestTypeHighlight} role="status">
                <span className={stepStyles.templateTestTypeEmoji} aria-hidden>
                  {TEST_TEMPLATES[selectedTemplate].icon}
                </span>
                <span className={stepStyles.templateTestTypeMeta}>
                  <span className={stepStyles.templateTestTypeKicker}>Test type</span>
                  <span className={stepStyles.templateTestTypeName}>
                    {TEST_TEMPLATES[selectedTemplate].name}
                  </span>
                </span>
              </div>
            )}
            <div className={stepStyles.templateNameSectionFields}>
              <div className={stepStyles.templateNameField}>
                <TextField
                  label="Test name"
                  value={formData.name}
                  onChange={value => setFormData({ ...formData, name: value })}
                  placeholder="e.g. Homepage CTA Test"
                  requiredIndicator
                  error={
                    showTemplateStep &&
                    currentStep === 1 &&
                    (!formData.name || !formData.name.trim())
                      ? 'Test name is required'
                      : undefined
                  }
                  autoComplete="off"
                />
              </div>
              <div className={stepStyles.templateDescField}>
                <TextField
                  label="Description"
                  value={formData.description || ''}
                  onChange={value => setFormData({ ...formData, description: value })}
                  placeholder="e.g. Test which CTA drives more sign-ups"
                  multiline={2}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          <div className={stepStyles.templateCategorySection}>
            <div className={stepStyles.templateCategoryHeader}>
              <span className={stepStyles.templateCategoryStep}>2</span>
              <div className={stepStyles.templateCategoryHeaderText}>
                <h3 className={stepStyles.templateCategoryTitle}>
                  {testTypeCategories.content.title}
                </h3>
                <p className={stepStyles.templateCategorySubtitle}>
                  {testTypeCategories.content.description}
                </p>
              </div>
              <TooltipWrapper
                content={testTypeCategories.content.description}
                accessibilityLabel="Content tests info"
              >
                <span className={stepStyles.templateInfoIcon}>
                  <Icon source={InfoIcon} />
                </span>
              </TooltipWrapper>
            </div>

            <div
              className={`template-grid ${stepStyles.templateGrid} ${stepStyles.templateGridContent}`}
            >
              {contentTypesForStep.map(type => {
                const isSelected = selectedTemplate === type.key;
                const isUnavailable = !isTemplateTypeEnabled(type.key);
                const unavailableReason = getTemplateUnavailableReason(type.key);
                return (
                  <div
                    key={type.key}
                    role="button"
                    tabIndex={isUnavailable ? -1 : 0}
                    className={`template-grid-item ${isUnavailable ? stepStyles.templateGridItemUnavailable : ''}`}
                    onClick={e => {
                      if (isUnavailable) return;
                      e.preventDefault();
                      e.stopPropagation();
                      handleTemplateSelect(type.key);
                    }}
                    onKeyDown={e => {
                      if (isUnavailable) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleTemplateSelect(type.key);
                      }
                    }}
                    aria-disabled={isUnavailable}
                    aria-pressed={!isUnavailable && isSelected}
                    aria-label={
                      isUnavailable
                        ? `${type.name} unavailable: ${unavailableReason}`
                        : `Select ${type.name}: ${type.description}`
                    }
                  >
                    <Card sectioned className={`template-card ${isSelected ? 'selected' : ''}`}>
                      <div className={stepStyles.templateCardHeader}>
                        <span className={stepStyles.templateCardBadgeSlot}>
                          {isUnavailable ? (
                            <span className={stepStyles.templateCardUnavailable}>Unavailable</span>
                          ) : type.key === 'onsite-edit' ? (
                            <span className={stepStyles.templateCardStarter}>Starter</span>
                          ) : null}
                        </span>
                        {!isUnavailable && isSelected && (
                          <div className="template-card-check">✓</div>
                        )}
                      </div>
                      <div className={stepStyles.templateCardBody}>
                        <div className={stepStyles.templateCardIcon}>{type.icon}</div>
                        <div className={stepStyles.templateCardMeta}>
                          <p className={stepStyles.templateCardTitle}>{type.name}</p>
                          <div className={stepStyles.templateCardDivider} aria-hidden />
                          <p className={stepStyles.templateCardDesc} title={type.description}>
                            {type.description}
                          </p>
                          {isUnavailable && unavailableReason && (
                            <p
                              className={stepStyles.templateCardUnavailableReason}
                              title={unavailableReason}
                            >
                              {unavailableReason}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>

          {!isStandalone && (
            <div className={stepStyles.templateCategorySection}>
              <div className={stepStyles.templateCategoryHeader}>
                <span className={stepStyles.templateCategoryStep}>3</span>
                <div className={stepStyles.templateCategoryHeaderText}>
                  <h3 className={stepStyles.templateCategoryTitle}>
                    {testTypeCategories.profit.title}
                  </h3>
                  <p className={stepStyles.templateCategorySubtitle}>
                    {testTypeCategories.profit.description}
                  </p>
                </div>
                <TooltipWrapper
                  content={testTypeCategories.profit.description}
                  accessibilityLabel="Profit tests info"
                >
                  <span className={stepStyles.templateInfoIcon}>
                    <Icon source={InfoIcon} />
                  </span>
                </TooltipWrapper>
              </div>

              <div
                className={`template-grid ${stepStyles.templateGrid} ${stepStyles.templateGridProfit}`}
              >
                {profitTypesForStep.map(type => {
                  const isSelected = selectedTemplate === type.key;
                  const isUnavailable = !isTemplateTypeEnabled(type.key);
                  const unavailableReason = getTemplateUnavailableReason(type.key);
                  return (
                    <div
                      key={type.key}
                      role="button"
                      tabIndex={isUnavailable ? -1 : 0}
                      className={`template-grid-item ${isUnavailable ? stepStyles.templateGridItemUnavailable : ''}`}
                      onClick={e => {
                        if (isUnavailable) return;
                        e.preventDefault();
                        e.stopPropagation();
                        handleTemplateSelect(type.key);
                      }}
                      onKeyDown={e => {
                        if (isUnavailable) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleTemplateSelect(type.key);
                        }
                      }}
                      aria-disabled={isUnavailable}
                      aria-pressed={!isUnavailable && isSelected}
                      aria-label={
                        isUnavailable
                          ? `${type.name} unavailable: ${unavailableReason}`
                          : `Select ${type.name}: ${type.description}`
                      }
                    >
                      <Card sectioned className={`template-card ${isSelected ? 'selected' : ''}`}>
                        <div className={stepStyles.templateCardHeader}>
                          <span className={stepStyles.templateCardBadgeSlot}>
                            {isUnavailable ? (
                              <span className={stepStyles.templateCardUnavailable}>
                                Unavailable
                              </span>
                            ) : type.key === 'pricing' ? (
                              <span className={stepStyles.templateCardRecommended}>
                                Recommended
                              </span>
                            ) : null}
                          </span>
                          {!isUnavailable && isSelected && (
                            <div className="template-card-check">✓</div>
                          )}
                        </div>
                        <div className={stepStyles.templateCardBody}>
                          <div className={stepStyles.templateCardIcon}>{type.icon}</div>
                          <div className={stepStyles.templateCardMeta}>
                            <p className={stepStyles.templateCardTitle}>{type.name}</p>
                            <div className={stepStyles.templateCardDivider} aria-hidden />
                            <p className={stepStyles.templateCardDesc} title={type.description}>
                              {type.description}
                            </p>
                            {isUnavailable && unavailableReason && (
                              <p
                                className={stepStyles.templateCardUnavailableReason}
                                title={unavailableReason}
                              >
                                {unavailableReason}
                              </p>
                            )}
                          </div>
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
