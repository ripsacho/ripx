import React from 'react';
import { Text } from '@shopify/polaris';

export default function WizardStepIndicator({
  displaySteps,
  currentStep,
  canNavigateSteps,
  mode,
  setCurrentStep,
}) {
  return (
    <div className="wizard-progress">
      {displaySteps.map((step, index) => {
        const isActive = currentStep === step.id;
        const isCompleted = currentStep > step.id;
        const isClickable = canNavigateSteps && (mode === 'edit' || step.id <= currentStep);

        return (
          <button
            key={step.id}
            type="button"
            onClick={() => {
              if (!isClickable) return;
              setCurrentStep(step.id);
            }}
            className={`wizard-step-indicator ${
              isActive ? 'active' : isCompleted ? 'completed' : ''
            } ${isClickable ? 'clickable' : ''}`}
            style={{ cursor: isClickable ? 'pointer' : 'default' }}
            aria-current={isActive ? 'step' : undefined}
            aria-label={
              isActive
                ? `Current step: ${step.title}`
                : isCompleted
                  ? `Completed: ${step.title}. Click to go back`
                  : `Step ${index + 1}: ${step.title}`
            }
            disabled={!isClickable}
          >
            <div className="wizard-step-number">{isCompleted ? '✓' : index + 1}</div>
            <Text
              variant="bodySm"
              as="p"
              fontWeight={isActive ? 'semibold' : 'regular'}
              className="wizard-step-label"
            >
              {step.title}
            </Text>
          </button>
        );
      })}
    </div>
  );
}
