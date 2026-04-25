/**
 * Shared Test Wizard
 *
 * Reusable create/edit flow for AB tests.
 * Template selection is optional for edit mode.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Card,
  FormLayout,
  TextField,
  Select,
  Button,
  Layout,
  BlockStack,
  InlineStack,
  Text,
  Checkbox,
  Badge,
  Modal,
  Spinner,
  Collapsible,
  Banner,
} from '@shopify/polaris';
import {
  PageIcon,
  UnknownDeviceIcon,
  PersonIcon,
  LockIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TargetIcon,
  ChartLineIcon,
  CheckCircleIcon,
  ClockIcon,
  CalculatorIcon,
  SaveIcon,
  CodeIcon,
  FilterIcon,
  AlertTriangleIcon,
  PlusIcon,
  InfoIcon,
  ProductIcon,
  CollectionIcon,
  CartIcon,
  CreditCardIcon,
  HomeIcon,
  DesktopIcon,
  MobileIcon,
  DataTableIcon,
  XIcon,
  ViewIcon,
} from '@shopify/polaris-icons';
import { Icon } from '@shopify/polaris';
import { TooltipWrapper } from '../Shared';
import CodeEditorIDE from '../CodeEditorIDE/CodeEditorIDE';
import SampleSizeCalculator from '../TestCreator/SampleSizeCalculator';
import TrafficAllocationSlider from '../TestCreator/TrafficAllocationSlider';
import Toast from '../Toast/Toast';
import styles from './TargetingSection.module.css';
import stepStyles from './WizardSteps.module.css';
import { Link, useParams } from 'react-router-dom';
import {
  getShopDomain,
  getPreviewDomain,
  apiGet,
  apiPost,
  isStandaloneMode,
  getApiBaseUrl,
  unwrapData,
} from '../../services';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import {
  buildPreviewUrl as buildPreviewUrlUtil,
  buildPreviewDocumentUrl,
  buildPreviewLaunchUrl,
  buildShopifyPreviewBootstrapUrl,
  ensureShopifyPreviewBootstrapUrl,
  isShopifyPreviewUrl,
  resolvePreviewBaseUrl,
} from '../../utils/previewUrl';
import { inferTemplateKeyFromVariants } from '../../utils/testType';
import { getVariantColor, getVariantColorLight } from '../../utils/variantColors';
import {
  buildPriceSimulationRows,
  buildPriceSimulationCsv,
  computeEffectivePrice as computeSimulationPrice,
  configUsesCompareAtBase,
} from '../../utils/priceSimulation';
import { ROUTES } from '../../constants';
import {
  TEST_TEMPLATES,
  TEST_TYPE_CATEGORIES,
  buildWizardSteps,
  getStepIds,
} from './testWizardConfig';
import { getWizardStepErrors } from './wizardValidation';
import { shouldHydrateInitialData } from './initialDataHydration';
import {
  canShowShippingExecution,
  shouldDisableShippingExecution,
} from './reviewShippingExecution';
import { DEFAULT_FORM_DATA } from './defaultFormData';
import { useStickyProgressBar } from './hooks/useStickyProgressBar';
import { useTestTypeControls } from './hooks/useTestTypeControls';
import { useWizardSessionUiState } from './hooks/useWizardSessionUiState';
import WizardStepIndicator from './WizardStepIndicator';
import WizardTemplateStep from './steps/WizardTemplateStep';
import VariantThemeModule from './variantModules/VariantThemeModule';
import VariantUrlModule from './variantModules/VariantUrlModule';
import {
  CHECKOUT_CTA_KIND_OPTIONS,
  CHECKOUT_LAYOUT_OPTIONS,
  CHECKOUT_PHASE_OPTIONS,
  CHECKOUT_PLACEMENT_OPTIONS,
  CHECKOUT_PRODUCT_SOURCE_LIMIT_OPTIONS,
  CHECKOUT_PRODUCT_SOURCE_OPTIONS,
  CHECKOUT_SECTION_TYPE_OPTIONS,
  CHECKOUT_TONE_OPTIONS,
  HOMEPAGE_URL_PATTERN_SHOPIFY,
  HOMEPAGE_URL_PATTERN_STANDALONE,
  MATRIX_SEARCH_BADGE_MAX_CHARS,
  PRICE_PRODUCT_MODAL_REVEAL_BATCH,
  buildCheckoutCartRelatedPreviewItems,
  buildCheckoutCollectionPreviewItems,
  buildCheckoutSectionSmartPreset,
  buildProgressiveListWindow,
  createEmptyCheckoutProductItem,
  getCheckoutPhaseDetails,
  getCheckoutPhaseLabel,
  getCheckoutSectionDetails,
  hasRenderableCheckoutProductItem,
  normalizeCheckoutProductItems,
} from './wizardCheckoutConstants';
import {
  MAX_VISUAL_EDITOR_HISTORY,
  buildGeneratedVisualRuleCode,
  cloneVisualEditorRules,
  createEmptyVisualEditorRule,
  normalizeVisualEditorRule,
} from './visualEditorRuleHelpers';
import {
  buildAutoOfferCodeName,
  getSavedPriceConfigIndices,
  hasSavedPriceConfigValue,
  isOfferLikeTestType,
  isPriceLikeTestType,
  normalizeThemeConfig,
  normalizeVariantPriceConfigShape,
} from './wizardVariantConfigHelpers';
import {
  createEmptyCheckoutSection,
  getActionableCheckoutSections,
  getCheckoutListPreview,
  getNormalizedCheckoutExperienceConfig,
  normalizeCheckoutListInput,
  normalizeCheckoutPhase,
  normalizeCheckoutProductSourceCollections,
  normalizeCheckoutProductSourceLimit,
  normalizeCheckoutProductSourceMode,
  syncLegacyCheckoutExperienceFields,
} from '../../utils/checkoutSections';
function TestWizard({
  mode = 'create',
  showTemplateStep = true,
  initialData = null,
  initialTemplate = null,
  initialStep = 1,
  submitLabel,
  submitLoading = false,
  enableStepNavigation,
  onSubmit,
  onCancel,
  onSaveCode,
  onTitleRender,
  onRefreshTest,
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [titleEditOpen, setTitleEditOpen] = useState(false);
  const [titleEditDraft, setTitleEditDraft] = useState({ name: '', description: '' });
  const progressBarRef = useRef(null);
  const progressBarStuck = useStickyProgressBar(progressBarRef);
  const [error, setError] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const isShippingTargetingMode = selectedTemplate === 'shipping' || formData.type === 'shipping';
  const [variantCodesData, setVariantCodesData] = useState([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [checkoutStudioVariantIndex, setCheckoutStudioVariantIndex] = useState(0);
  const [cssValidationErrors, setCssValidationErrors] = useState([]);
  const [jsValidationErrors, setJsValidationErrors] = useState([]);
  const validationTimeoutRef = useRef(null);
  const [isDirty, setIsDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isInitialized, setIsInitialized] = useState(mode === 'create');
  const [targetingPresets, setTargetingPresets] = useState([]);
  const [savePresetModalOpen, setSavePresetModalOpen] = useState(false);
  const [savePresetAsFullTemplate, setSavePresetAsFullTemplate] = useState(false);
  const [sampleSizeExpanded, setSampleSizeExpanded] = useState(false);
  const [visualEditorExpanded, setVisualEditorExpanded] = useState(false);
  const [codeEditorExpanded, setCodeEditorExpanded] = useState(false);
  const [visualEditorDirty, setVisualEditorDirty] = useState(false);
  const [codeEditorDirty, setCodeEditorDirty] = useState(false);
  const [codeEditorSubTab, setCodeEditorSubTab] = useState('css'); // 'css' | 'js' – IDE-style tab blend
  const [variantDropdownOpen, setVariantDropdownOpen] = useState(false);
  const variantDropdownRef = useRef(null);
  const normalizeTargetIdValue = value => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  };
  const normalizeTargetIdList = value => {
    if (!Array.isArray(value)) return null;
    const normalized = value.map(item => normalizeTargetIdValue(item)).filter(Boolean);
    return normalized.length > 0 ? normalized : [];
  };
  const normalizeTextValue = value => {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  };

  useEffect(() => {
    if (!variantDropdownOpen) return;
    const handleClickOutside = e => {
      if (variantDropdownRef.current && !variantDropdownRef.current.contains(e.target)) {
        setVariantDropdownOpen(false);
      }
    };
    const handleEscape = e => {
      if (e.key === 'Escape') setVariantDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [variantDropdownOpen]);
  useEffect(() => {
    if (!isDirty) {
      setVisualEditorDirty(false);
      setCodeEditorDirty(false);
    }
  }, [isDirty]);
  const [visualPreviewLoadState, setVisualPreviewLoadState] = useState('idle'); // 'idle' | 'loading' | 'loaded' | 'error'
  const [visualPreviewRetryKey, setVisualPreviewRetryKey] = useState(0); // increment to force iframe remount on retry
  const [visualPreviewLoadingSlow, setVisualPreviewLoadingSlow] = useState(false); // true after 3s in loading
  const [visualPreviewVariantIndex, setVisualPreviewVariantIndex] = useState(0);
  const [visualPreviewToast, setVisualPreviewToast] = useState(null);
  const [visualSnippetPanelExpanded, setVisualSnippetPanelExpanded] = useState(false);
  const [visualSnippetActiveElementIndex, setVisualSnippetActiveElementIndex] = useState(0); // which element (rule index 0–4) is shown in the snippet panel
  const [visualRuleActiveTab, setVisualRuleActiveTab] = useState({}); // { ruleIndex: 'selector'|'css'|'js' }
  const [visualRuleHistoryByVariant, setVisualRuleHistoryByVariant] = useState({});
  const [_priceCardExpanded, _setPriceCardExpanded] = useState({}); // { variantIndex: boolean } — missing key = expanded (reserved for future use)
  const [priceAccordionExpandedIndices, setPriceAccordionExpandedIndices] = useState([]); // which variant accordions are open (array of indices; allows expand all)
  const [offerAccordionExpandedIndices, setOfferAccordionExpandedIndices] = useState([]);
  const [quickFillRule, setQuickFillRule] = useState('percent_off'); // 'percent_off' | 'percent_on' | 'amount_off' | 'amount_on'
  const [quickFillValue, setQuickFillValue] = useState('');
  const [quickFillRoundTo, setQuickFillRoundTo] = useState(''); // '' | '0.01' | '0.25' | '0.50' | '1' — stored in variant config when applying
  const [offerQuickType, setOfferQuickType] = useState('percent');
  const [offerQuickValue, setOfferQuickValue] = useState('');
  const [exampleCatalogPrice, setExampleCatalogPrice] = useState(''); // optional $ for live preview
  const [exampleCompareAtPrice, setExampleCompareAtPrice] = useState(''); // optional compare-at basis for compare_at simulation
  const [catalogConfirmedForPriceTest, setCatalogConfirmedForPriceTest] = useState(false); // optional confirmation on Review (does not block submit)
  const [lastSimulationExportAt, setLastSimulationExportAt] = useState(null);
  const [simulationExportToast, setSimulationExportToast] = useState(null);
  const [priceMatrixActionToast, setPriceMatrixActionToast] = useState(null);
  const [antiFlickerToast, setAntiFlickerToast] = useState(null);
  const [shippingExecutionLoading, setShippingExecutionLoading] = useState(false);
  const [shippingExecutionAction, setShippingExecutionAction] = useState(null);
  const [shippingExecutionReport, setShippingExecutionReport] = useState(null);
  const [shippingDiagnosticsLoading, setShippingDiagnosticsLoading] = useState(false);
  const [shippingDiagnosticsReport, setShippingDiagnosticsReport] = useState(null);
  const [shippingExecutionToast, setShippingExecutionToast] = useState(null);
  const [checkoutCustomizationLoading, setCheckoutCustomizationLoading] = useState(false);
  const [checkoutCustomizationAction, setCheckoutCustomizationAction] = useState(null);
  const [checkoutCustomizationToast, setCheckoutCustomizationToast] = useState(null);
  const [checkoutBulletDrafts, setCheckoutBulletDrafts] = useState({});
  const [checkoutMethodDrafts, setCheckoutMethodDrafts] = useState({});
  const [checkoutExpandedSectionsByVariant, setCheckoutExpandedSectionsByVariant] = useState({});
  const [checkoutPendingScrollTarget, setCheckoutPendingScrollTarget] = useState(null);
  const [shippingStorewideApplyConfirmed, setShippingStorewideApplyConfirmed] = useState(false);
  useEffect(() => {
    const n = formData.variants?.length ?? 0;
    if (n === 0) {
      setPriceAccordionExpandedIndices([]);
      return;
    }
    setPriceAccordionExpandedIndices(prev => prev.filter(i => i >= 0 && i < n));
  }, [formData.variants?.length]);
  useEffect(() => {
    const n = formData.variants?.length ?? 0;
    if (n === 0) {
      setOfferAccordionExpandedIndices([]);
      return;
    }
    setOfferAccordionExpandedIndices(prev => prev.filter(i => i >= 0 && i < n));
  }, [formData.variants?.length]);
  useEffect(() => {
    const n = formData.variants?.length ?? 0;
    if (n === 0) {
      setCheckoutStudioVariantIndex(0);
      return;
    }
    setCheckoutStudioVariantIndex(prev => Math.min(prev, n - 1));
  }, [formData.variants?.length]);
  useEffect(() => {
    if (!checkoutPendingScrollTarget) {
      return undefined;
    }
    if (checkoutStudioVariantIndex !== checkoutPendingScrollTarget.variantIndex) {
      return undefined;
    }
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return undefined;
    }
    const targetId = `checkout-section-head-${checkoutPendingScrollTarget.variantIndex}-${checkoutPendingScrollTarget.sectionIndex}`;
    const targetElement = document.getElementById(targetId);
    if (!targetElement) {
      return undefined;
    }
    const frameId = window.requestAnimationFrame(() => {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCheckoutPendingScrollTarget(null);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [checkoutPendingScrollTarget, checkoutStudioVariantIndex, formData.variants]);
  const [changingSelectorIndex, setChangingSelectorIndex] = useState(null); // when set, next click in preview replaces this slot
  const visualSnippetPanelRef = useRef(null);
  const visualSnippetBackdropRef = useRef(null);
  const formDataRef = useRef(formData);
  const variantCodesDataRef = useRef(variantCodesData);
  const visualPreviewVariantIndexRef = useRef(visualPreviewVariantIndex);
  const changingSelectorIndexRef = useRef(changingSelectorIndex);
  const selectedVariantIndexRef = useRef(selectedVariantIndex);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    variantCodesDataRef.current = variantCodesData;
  }, [variantCodesData]);
  useEffect(() => {
    selectedVariantIndexRef.current = selectedVariantIndex;
  }, [selectedVariantIndex]);
  useEffect(() => {
    visualPreviewVariantIndexRef.current = visualPreviewVariantIndex;
  }, [visualPreviewVariantIndex]);
  useEffect(() => {
    changingSelectorIndexRef.current = changingSelectorIndex;
  }, [changingSelectorIndex]);
  useEffect(() => {
    const n = formData.variants?.length || 0;
    setVisualRuleHistoryByVariant(prev => {
      let changed = false;
      const next = {};
      Object.entries(prev || {}).forEach(([key, value]) => {
        const idx = Number(key);
        if (Number.isInteger(idx) && idx >= 0 && idx < n) {
          next[key] = value;
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [formData.variants?.length]);

  const applyVisualRulesChange = useCallback(
    (variantIndex, updater, { recordHistory = true } = {}) => {
      const count = formDataRef.current?.variants?.length || 0;
      if (count <= 0) return;
      const resolvedIndex = Math.min(Math.max(0, Number(variantIndex) || 0), count - 1);
      let previousRulesSnapshot = null;
      setFormData(prev => {
        const variants = [...(prev.variants || [])];
        const variant = variants[resolvedIndex];
        const config = { ...(variant?.config || {}) };
        const nextRules = cloneVisualEditorRules(config.visual_editor_rules);
        previousRulesSnapshot = cloneVisualEditorRules(nextRules);
        updater(nextRules);
        config.visual_editor_rules = cloneVisualEditorRules(nextRules);
        variants[resolvedIndex] = { ...variant, config };
        return { ...prev, variants };
      });
      if (recordHistory && previousRulesSnapshot) {
        const historyKey = String(resolvedIndex);
        setVisualRuleHistoryByVariant(prev => {
          const current = prev[historyKey] || { past: [], future: [] };
          const nextPast = [...(current.past || []), previousRulesSnapshot].slice(
            -MAX_VISUAL_EDITOR_HISTORY
          );
          return {
            ...prev,
            [historyKey]: { past: nextPast, future: [] },
          };
        });
      }
      setIsDirty(true);
      setVisualEditorDirty(true);
    },
    []
  );

  const undoVisualRuleChange = useCallback(
    variantIndex => {
      const count = formDataRef.current?.variants?.length || 0;
      if (count <= 0) return false;
      const resolvedIndex = Math.min(Math.max(0, Number(variantIndex) || 0), count - 1);
      const historyKey = String(resolvedIndex);
      const history = visualRuleHistoryByVariant[historyKey] || { past: [], future: [] };
      const previousSnapshot = history.past?.[history.past.length - 1];
      if (!previousSnapshot) return false;
      const currentRules = cloneVisualEditorRules(
        formDataRef.current?.variants?.[resolvedIndex]?.config?.visual_editor_rules
      );
      setFormData(prev => {
        const variants = [...(prev.variants || [])];
        const variant = variants[resolvedIndex];
        const config = { ...(variant?.config || {}) };
        config.visual_editor_rules = cloneVisualEditorRules(previousSnapshot);
        variants[resolvedIndex] = { ...variant, config };
        return { ...prev, variants };
      });
      setVisualRuleHistoryByVariant(prev => {
        const current = prev[historyKey] || { past: [], future: [] };
        const nextPast = (current.past || []).slice(0, -1);
        const nextFuture = [currentRules, ...(current.future || [])].slice(
          0,
          MAX_VISUAL_EDITOR_HISTORY
        );
        return {
          ...prev,
          [historyKey]: { past: nextPast, future: nextFuture },
        };
      });
      setIsDirty(true);
      setVisualEditorDirty(true);
      return true;
    },
    [visualRuleHistoryByVariant]
  );

  const redoVisualRuleChange = useCallback(
    variantIndex => {
      const count = formDataRef.current?.variants?.length || 0;
      if (count <= 0) return false;
      const resolvedIndex = Math.min(Math.max(0, Number(variantIndex) || 0), count - 1);
      const historyKey = String(resolvedIndex);
      const history = visualRuleHistoryByVariant[historyKey] || { past: [], future: [] };
      const nextSnapshot = history.future?.[0];
      if (!nextSnapshot) return false;
      const currentRules = cloneVisualEditorRules(
        formDataRef.current?.variants?.[resolvedIndex]?.config?.visual_editor_rules
      );
      setFormData(prev => {
        const variants = [...(prev.variants || [])];
        const variant = variants[resolvedIndex];
        const config = { ...(variant?.config || {}) };
        config.visual_editor_rules = cloneVisualEditorRules(nextSnapshot);
        variants[resolvedIndex] = { ...variant, config };
        return { ...prev, variants };
      });
      setVisualRuleHistoryByVariant(prev => {
        const current = prev[historyKey] || { past: [], future: [] };
        const nextPast = [...(current.past || []), currentRules].slice(-MAX_VISUAL_EDITOR_HISTORY);
        const nextFuture = (current.future || []).slice(1);
        return {
          ...prev,
          [historyKey]: { past: nextPast, future: nextFuture },
        };
      });
      setIsDirty(true);
      setVisualEditorDirty(true);
      return true;
    },
    [visualRuleHistoryByVariant]
  );
  const [savePresetName, setSavePresetName] = useState('');
  const [loadedPresetId, setLoadedPresetId] = useState('');
  const [placementSection, setPlacementSection] = useState('page'); // 'page' | 'device' | 'audience' | 'holdout' | 'advanced'
  const { domain: routeDomain } = useParams();
  const isShopifyFromRoute = routeDomain && isShopifyStoreDomain(routeDomain);
  const scopedShopDomain =
    isShopifyFromRoute && routeDomain ? String(routeDomain).trim().toLowerCase() : '';
  const isStandalone = !isShopifyFromRoute && isStandaloneMode();
  const canUseStoreProductPicker = !isStandalone && isShopifyFromRoute && Boolean(routeDomain);
  const {
    getTemplateUnavailableReason,
    isTemplateTypeEnabled,
    contentTypesForStep,
    profitTypesForStep,
  } = useTestTypeControls({
    isStandalone,
    selectedTemplate,
    setSelectedTemplate,
    testTypeCategories: TEST_TYPE_CATEGORIES,
  });
  const [customUrlModeActive, setCustomUrlModeActive] = useState(false);
  const [deviceAdvancedOpen, setDeviceAdvancedOpen] = useState(false);
  const [audienceAdvancedOpen, setAudienceAdvancedOpen] = useState(false);
  const [shippingScopeAdvancedOpen, setShippingScopeAdvancedOpen] = useState(false);
  const [_advancedTargetingOpen, _setAdvancedTargetingOpen] = useState(false);
  const [customEventInput, setCustomEventInput] = useState('');
  const [advancedSectionsOpen, setAdvancedSectionsOpen] = useState({
    safety: true,
    presets: false,
    traffic: false,
    jsTargeting: false,
    customRules: false,
  });
  const toggleAdvancedSection = key =>
    setAdvancedSectionsOpen(prev => ({ ...prev, [key]: !prev[key] }));
  const [storeResources, setStoreResources] = useState([]);
  const [storeResourcesLoading, setStoreResourcesLoading] = useState(false);
  const [storeResourcesLoadingMore, setStoreResourcesLoadingMore] = useState(false);
  const [storeResourceSearch, setStoreResourceSearch] = useState('');
  const [storeResourcesPageInfo, setStoreResourcesPageInfo] = useState({
    hasNextPage: false,
    endCursor: null,
  });
  const [storeResourcesVisibleCount, setStoreResourcesVisibleCount] = useState(
    PRICE_PRODUCT_MODAL_REVEAL_BATCH
  );
  /** When store-resources API fails or returns empty_reason, show this instead of generic message */
  const [storeResourcesError, setStoreResourcesError] = useState(null);
  const [checkoutCollectionResources, setCheckoutCollectionResources] = useState([]);
  const [checkoutCollectionLoading, setCheckoutCollectionLoading] = useState(false);
  const [checkoutCollectionSearch, setCheckoutCollectionSearch] = useState('');
  const [checkoutCollectionSearchDebounced, setCheckoutCollectionSearchDebounced] = useState('');
  const [checkoutCollectionError, setCheckoutCollectionError] = useState(null);
  const [checkoutCollectionPageInfo, setCheckoutCollectionPageInfo] = useState({
    hasNextPage: false,
    endCursor: null,
  });
  const [checkoutCollectionLoadingMore, setCheckoutCollectionLoadingMore] = useState(false);
  const [checkoutCollectionVisibleCount, setCheckoutCollectionVisibleCount] = useState(
    PRICE_PRODUCT_MODAL_REVEAL_BATCH
  );
  const [priceProductModalOpen, setPriceProductModalOpen] = useState(false);
  const [priceModalSearch, setPriceModalSearch] = useState('');
  const [priceModalSearchDebounced, setPriceModalSearchDebounced] = useState('');
  const [priceModalProducts, setPriceModalProducts] = useState([]);
  const [priceModalLoading, setPriceModalLoading] = useState(false);
  const [priceModalLoadingMore, setPriceModalLoadingMore] = useState(false);
  const [priceModalPageInfo, setPriceModalPageInfo] = useState({
    hasNextPage: false,
    endCursor: null,
  });

  const [priceModalVisibleCount, setPriceModalVisibleCount] = useState(
    PRICE_PRODUCT_MODAL_REVEAL_BATCH
  );
  const [priceModalError, setPriceModalError] = useState(null);
  const [priceProductModalSelectionMode, setPriceProductModalSelectionMode] = useState('include');
  const [priceProductMetaById, setPriceProductMetaById] = useState({});
  const [allProductsMatrixProducts, setAllProductsMatrixProducts] = useState([]);
  const [allProductsMatrixLoading, setAllProductsMatrixLoading] = useState(false);
  const [allProductsMatrixLoadingMore, setAllProductsMatrixLoadingMore] = useState(false);
  const [allProductsMatrixPageInfo, setAllProductsMatrixPageInfo] = useState({
    hasNextPage: false,
    endCursor: null,
  });
  const [allProductsMatrixVisibleCount, setAllProductsMatrixVisibleCount] = useState(
    PRICE_PRODUCT_MODAL_REVEAL_BATCH
  );
  const [allProductsMatrixError, setAllProductsMatrixError] = useState(null);
  const [allProductsMatrixSearch, setAllProductsMatrixSearch] = useState('');
  const [allProductsMatrixSearchDebounced, setAllProductsMatrixSearchDebounced] = useState('');
  const [priceMatrixProductsById, setPriceMatrixProductsById] = useState({});
  const [priceMatrixLoadingById, setPriceMatrixLoadingById] = useState({});
  const [priceMatrixErrorById, setPriceMatrixErrorById] = useState({});
  const priceMatrixProductsByIdRef = useRef({});
  const priceMatrixErrorByIdRef = useRef({});
  const priceMatrixFetchInFlightRef = useRef({});
  const priceMatrixLoadStartedAtRef = useRef({});
  const priceProductMetaByIdRef = useRef({});
  const [priceMatrixBulkMode, setPriceMatrixBulkMode] = useState('amount');
  const [priceMatrixBulkValue, setPriceMatrixBulkValue] = useState('');
  const [priceMatrixBulkSummary, setPriceMatrixBulkSummary] = useState(null);
  const [priceMatrixUndoByScope, setPriceMatrixUndoByScope] = useState({});
  const [priceGuideSampleOpen, setPriceGuideSampleOpen] = useState(false);
  const [priceVariantToolsExpanded, setPriceVariantToolsExpanded] = useState(false);
  const [checkoutDiagnostics, setCheckoutDiagnostics] = useState(null);
  const [checkoutDiagnosticsLoading, setCheckoutDiagnosticsLoading] = useState(false);
  const [checkoutDiagnosticsError, setCheckoutDiagnosticsError] = useState(null);
  const [cartTransformStatus, setCartTransformStatus] = useState(null);
  const [cartTransformStatusLoading, setCartTransformStatusLoading] = useState(false);
  const [checkoutExperienceDiagnostics, setCheckoutExperienceDiagnostics] = useState(null);
  const [_checkoutExperienceDiagnosticsLoading, setCheckoutExperienceDiagnosticsLoading] =
    useState(false);
  const [checkoutExperienceDiagnosticsError, setCheckoutExperienceDiagnosticsError] =
    useState(null);
  const [wizardCheckoutReadiness, setWizardCheckoutReadiness] = useState(null);
  const [wizardCheckoutReadinessLoading, setWizardCheckoutReadinessLoading] = useState(false);
  const [wizardCheckoutReadinessError, setWizardCheckoutReadinessError] = useState(null);
  const isCheckoutTestType =
    selectedTemplate === 'checkout' || String(formData.type || '').toLowerCase() === 'checkout';
  const { wizardUiStateKey, pendingWizardUiStateRef, didRestoreWizardUiStateRef } =
    useWizardSessionUiState({
      mode,
      initialDataId: initialData?.id,
    });

  const handleScopeSelect = useCallback((scope, tt, up, needsId) => {
    setIsDirty(true);
    if (scope === '__custom__') {
      setCustomUrlModeActive(true);
      setFormData(prev => ({
        ...prev,
        target_type: prev.target_type || 'all',
        target_id: '',
        target_ids: null,
        segments: {
          ...(prev.segments || {}),
          url_pattern: '',
          page_rules:
            (prev.segments?.page_rules || []).length > 0
              ? prev.segments.page_rules
              : [{ type: 'include', pattern: ' ', match_type: 'contains' }],
        },
      }));
    } else {
      setCustomUrlModeActive(false);
      setFormData(prev => ({
        ...prev,
        target_type: tt || 'all',
        target_id: needsId ? (prev.target_type === tt ? prev.target_id : '') : '',
        target_ids: needsId && prev.target_type === tt ? prev.target_ids : null,
        segments: {
          ...(prev.segments || {}),
          url_pattern: up ?? '',
          page_rules: [],
        },
      }));
    }
  }, []);
  const expandAllAdvanced = () =>
    setAdvancedSectionsOpen({
      safety: true,
      presets: true,
      traffic: true,
      jsTargeting: true,
      customRules: true,
    });
  const collapseAllAdvanced = () =>
    setAdvancedSectionsOpen({
      safety: false,
      presets: false,
      traffic: false,
      jsTargeting: false,
      customRules: false,
    });
  const lastSavedSnapshotRef = useRef(null);
  const autosaveTimeoutRef = useRef(null);
  const hasVariantSelectionRef = useRef(false);
  const previousTestIdRef = useRef(null);
  const initialSnapshotPendingRef = useRef(false);
  const createInitialDataAppliedRef = useRef(false);
  const validationSummaryRef = useRef(null);
  const shouldFocusValidationSummaryRef = useRef(false);

  const steps = buildWizardSteps(showTemplateStep, mode);
  const stepIds = getStepIds(showTemplateStep);
  const reviewStepId = steps[steps.length - 1]?.id;
  const displaySteps = useMemo(() => {
    const checkoutTemplateActive =
      selectedTemplate === 'checkout' || String(formData.type || '').toLowerCase() === 'checkout';
    if (!checkoutTemplateActive) {
      return steps;
    }
    const checkoutPhase = normalizeCheckoutPhase(formData.goal?.checkout_phase);
    const phaseDetails = getCheckoutPhaseDetails(checkoutPhase);
    return steps.map(step => {
      if (step.id === stepIds.targeting) {
        return {
          ...step,
          title: 'Checkout Exposure',
          description: 'Fixed checkout scope and holdout',
        };
      }
      if (step.id === stepIds.code) {
        return {
          ...step,
          title: 'Checkout Variant Studio',
          description: `Design ${phaseDetails.title.toLowerCase()} variants with launch-safe checkout contracts`,
        };
      }
      return step;
    });
  }, [
    formData.goal?.checkout_phase,
    formData.type,
    selectedTemplate,
    stepIds.code,
    stepIds.targeting,
    steps,
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!isShopifyFromRoute || isStandalone) {
      setCheckoutDiagnostics(null);
      setCheckoutDiagnosticsError(null);
      setCheckoutDiagnosticsLoading(false);
      setCartTransformStatus(null);
      setCartTransformStatusLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadCheckoutDiagnostics = async () => {
      setCheckoutDiagnosticsLoading(true);
      setCheckoutDiagnosticsError(null);
      try {
        const res = await apiGet('/settings/checkout-price-diagnostics', {
          ...(scopedShopDomain ? { domain: scopedShopDomain } : {}),
        });
        const data = unwrapData(res);
        if (!cancelled) {
          setCheckoutDiagnostics(data || null);
        }
      } catch (e) {
        if (!cancelled) {
          setCheckoutDiagnostics(null);
          setCheckoutDiagnosticsError(e?.message || 'Could not load checkout diagnostics');
        }
      } finally {
        if (!cancelled) {
          setCheckoutDiagnosticsLoading(false);
        }
      }
    };

    loadCheckoutDiagnostics();
    return () => {
      cancelled = true;
    };
  }, [isShopifyFromRoute, isStandalone, routeDomain, scopedShopDomain]);

  useEffect(() => {
    let cancelled = false;

    if (!isShopifyFromRoute || isStandalone) {
      setCartTransformStatus(null);
      setCartTransformStatusLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadCartTransformStatus = async () => {
      setCartTransformStatusLoading(true);
      try {
        const res = await apiGet(
          '/settings/cart-transform/status',
          {
            ...(scopedShopDomain ? { domain: scopedShopDomain } : {}),
          },
          { timeout: 15000 }
        );
        const data = unwrapData(res);
        if (!cancelled) {
          setCartTransformStatus(data || null);
        }
      } catch (_e) {
        if (!cancelled) {
          setCartTransformStatus(null);
        }
      } finally {
        if (!cancelled) {
          setCartTransformStatusLoading(false);
        }
      }
    };

    loadCartTransformStatus();
    return () => {
      cancelled = true;
    };
  }, [isShopifyFromRoute, isStandalone, routeDomain, scopedShopDomain]);

  const directPriceOverrideSupportLevel = String(
    checkoutDiagnostics?.support?.direct_price_override?.level || ''
  )
    .trim()
    .toLowerCase();
  const cartTransformInstalledForShop = cartTransformStatus?.installedForRipxFunction === true;
  const cartTransformFunctionDetectedFromStatus = Boolean(cartTransformStatus?.function?.id);
  const cartTransformInstallCheckStatus = String(cartTransformStatus?.installCheck?.status || '')
    .trim()
    .toLowerCase();
  const cartTransformInstallStateUnknownFromStatus =
    cartTransformFunctionDetectedFromStatus && cartTransformInstallCheckStatus === 'scope_missing';
  const cartTransformFunctionAvailable =
    cartTransformFunctionDetectedFromStatus ||
    directPriceOverrideSupportLevel === 'available' ||
    checkoutDiagnostics?.infrastructure?.cart_transform_function_available === true;
  const directPriceOverrideReadiness =
    checkoutDiagnosticsLoading && cartTransformStatusLoading
      ? 'checking'
      : cartTransformInstalledForShop || directPriceOverrideSupportLevel === 'available'
        ? 'ready'
        : cartTransformInstallStateUnknownFromStatus
          ? 'unknown'
          : cartTransformFunctionDetectedFromStatus
            ? 'needs_install'
            : directPriceOverrideSupportLevel === 'needs_install'
              ? 'needs_install'
              : directPriceOverrideSupportLevel === 'needs_deploy'
                ? 'needs_deploy'
                : directPriceOverrideSupportLevel === 'unknown_install_state'
                  ? 'unknown'
                  : checkoutDiagnosticsError
                    ? 'unknown'
                    : checkoutDiagnostics?.infrastructure?.cart_transform_function_available ===
                        true
                      ? 'ready'
                      : 'needs_deploy';
  const directPriceOverrideStatusMessage =
    directPriceOverrideReadiness === 'ready'
      ? 'Direct Price Override is available for this shop.'
      : directPriceOverrideReadiness === 'needs_install'
        ? 'RipX cart transform is deployed but not installed on this shop yet. Bind/install it before relying on live price tests.'
        : directPriceOverrideReadiness === 'needs_deploy'
          ? 'RipX cart transform is not detected for this shop yet, so checkout/cart direct price overrides will not run.'
          : directPriceOverrideReadiness === 'checking'
            ? 'RipX is still checking cart transform availability for this shop.'
            : 'RipX could not fully verify cart transform install state for this shop.';
  const shouldUseDirectPriceOverrideExecution =
    isShopifyFromRoute && !isStandalone && directPriceOverrideReadiness === 'ready';
  const priceCheckoutExecutionMode = shouldUseDirectPriceOverrideExecution
    ? 'direct_price_override'
    : 'auto';

  useEffect(() => {
    let cancelled = false;
    const isCheckoutTemplate =
      selectedTemplate === 'checkout' || String(formData.type || '').toLowerCase() === 'checkout';

    if (!isShopifyFromRoute || isStandalone || !isCheckoutTemplate) {
      setCheckoutExperienceDiagnostics(null);
      setCheckoutExperienceDiagnosticsError(null);
      setCheckoutExperienceDiagnosticsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadCheckoutExperienceDiagnostics = async () => {
      setCheckoutExperienceDiagnosticsLoading(true);
      setCheckoutExperienceDiagnosticsError(null);
      try {
        const res = await apiGet('/settings/checkout-experience-diagnostics', {
          ...(scopedShopDomain ? { domain: scopedShopDomain } : {}),
        });
        const data = unwrapData(res);
        if (!cancelled) {
          setCheckoutExperienceDiagnostics(data || null);
        }
      } catch (e) {
        if (!cancelled) {
          setCheckoutExperienceDiagnostics(null);
          setCheckoutExperienceDiagnosticsError(
            e?.message || 'Could not load checkout experience diagnostics'
          );
        }
      } finally {
        if (!cancelled) {
          setCheckoutExperienceDiagnosticsLoading(false);
        }
      }
    };

    loadCheckoutExperienceDiagnostics();
    return () => {
      cancelled = true;
    };
  }, [
    formData.type,
    isShopifyFromRoute,
    isStandalone,
    routeDomain,
    scopedShopDomain,
    selectedTemplate,
  ]);

  useEffect(() => {
    let cancelled = false;
    const currentType = String(formData.type || initialData?.type || '').toLowerCase();
    const supportsWizardCheckoutReadiness = [
      'price',
      'pricing',
      'offer',
      'checkout',
      'shipping',
    ].includes(currentType);

    if (
      mode !== 'edit' ||
      !initialData?.id ||
      currentStep !== reviewStepId ||
      !supportsWizardCheckoutReadiness
    ) {
      setWizardCheckoutReadiness(null);
      setWizardCheckoutReadinessError(null);
      setWizardCheckoutReadinessLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadWizardCheckoutReadiness = async () => {
      setWizardCheckoutReadinessLoading(true);
      setWizardCheckoutReadinessError(null);
      try {
        const data = await apiGet(`/tests/${initialData.id}/checkout/readiness`);
        if (!cancelled) {
          setWizardCheckoutReadiness(data || null);
        }
      } catch (e) {
        if (!cancelled) {
          setWizardCheckoutReadiness(null);
          setWizardCheckoutReadinessError(e?.message || 'Could not load checkout readiness');
        }
      } finally {
        if (!cancelled) {
          setWizardCheckoutReadinessLoading(false);
        }
      }
    };

    loadWizardCheckoutReadiness();
    return () => {
      cancelled = true;
    };
  }, [currentStep, formData.type, initialData?.id, initialData?.type, mode, reviewStepId]);

  useEffect(() => {
    if (!wizardUiStateKey || didRestoreWizardUiStateRef.current) return;
    const saved = pendingWizardUiStateRef.current;
    const variantCount = Array.isArray(formData?.variants) ? formData.variants.length : 0;
    if (saved && Number.isInteger(saved.selectedVariantIndex)) {
      const restoredIndex = Math.max(
        0,
        Math.min(saved.selectedVariantIndex, Math.max(0, variantCount - 1))
      );
      setSelectedVariantIndex(restoredIndex);
      hasVariantSelectionRef.current = true;
    }
    if (saved && Number.isInteger(saved.currentStep)) {
      const restoredStep = Math.max(1, Math.min(saved.currentStep, steps.length));
      setCurrentStep(restoredStep);
    }
    pendingWizardUiStateRef.current = null;
    didRestoreWizardUiStateRef.current = true;
  }, [
    wizardUiStateKey,
    pendingWizardUiStateRef,
    didRestoreWizardUiStateRef,
    formData?.variants,
    steps.length,
  ]);

  useEffect(() => {
    if (
      !wizardUiStateKey ||
      !didRestoreWizardUiStateRef.current ||
      !isInitialized ||
      typeof window === 'undefined' ||
      !window.sessionStorage
    ) {
      return;
    }
    try {
      window.sessionStorage.setItem(
        wizardUiStateKey,
        JSON.stringify({
          currentStep,
          selectedVariantIndex,
        })
      );
    } catch (_error) {
      return;
    }
  }, [
    wizardUiStateKey,
    didRestoreWizardUiStateRef,
    currentStep,
    selectedVariantIndex,
    isInitialized,
  ]);

  useEffect(() => {
    if (!onTitleRender) return;
    const el = (
      <div
        className="wizard-title-editable wizard-title-in-page"
        onClick={() => {
          setTitleEditDraft({ name: formData.name || '', description: formData.description || '' });
          setTitleEditOpen(true);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setTitleEditDraft({
              name: formData.name || '',
              description: formData.description || '',
            });
            setTitleEditOpen(true);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="Edit test name and description"
      >
        <span className="wizard-title-content">
          <Text variant="headingLg" as="span">
            {normalizeTextValue(formData.name) ||
              normalizeTextValue(initialData?.name) ||
              'Untitled Test'}
          </Text>
          {(normalizeTextValue(formData.description) ||
            normalizeTextValue(initialData?.description)) && (
            <Text variant="bodyMd" color="subdued" as="span" className="wizard-title-description">
              {' · '}
              {normalizeTextValue(formData.description) ||
                normalizeTextValue(initialData?.description)}
            </Text>
          )}
        </span>
        <span className="wizard-title-edit-icon" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12.5 2.5L15.5 5.5L5 16H2V13L12.5 2.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    );
    onTitleRender(el);
  }, [onTitleRender, formData.name, formData.description, initialData]);

  useEffect(() => {
    apiGet('/targeting-presets')
      .then(res => setTargetingPresets(res.data?.presets || []))
      .catch(() => setTargetingPresets([]));
  }, []);

  const targetTypeForResources = formData.target_type;
  const [storeResourceSearchDebounced, setStoreResourceSearchDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setStoreResourceSearchDebounced(storeResourceSearch), 400);
    return () => clearTimeout(t);
  }, [storeResourceSearch]);
  useEffect(() => {
    const t = setTimeout(() => setCheckoutCollectionSearchDebounced(checkoutCollectionSearch), 400);
    return () => clearTimeout(t);
  }, [checkoutCollectionSearch]);
  useEffect(() => {
    if (isStandalone || !isShopifyFromRoute || !routeDomain) {
      setCheckoutCollectionResources([]);
      setCheckoutCollectionError(null);
      setCheckoutCollectionPageInfo({ hasNextPage: false, endCursor: null });
      setCheckoutCollectionVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
      return;
    }
    setCheckoutCollectionLoading(true);
    setCheckoutCollectionError(null);
    setCheckoutCollectionVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
    const query = encodeURIComponent(checkoutCollectionSearchDebounced.trim());
    apiGet(`/shopify/store-resources?type=collection&query=${query}&first=40`, {
      shop: routeDomain,
    })
      .then(res => {
        const list = Array.isArray(res.data?.resources) ? res.data.resources : [];
        const emptyReason = res.data?.empty_reason || null;
        setCheckoutCollectionResources(list);
        setCheckoutCollectionPageInfo(
          res.data?.page_info || {
            hasNextPage: false,
            endCursor: null,
          }
        );
        setCheckoutCollectionError(list.length === 0 && emptyReason ? emptyReason : null);
      })
      .catch(err => {
        setCheckoutCollectionResources([]);
        setCheckoutCollectionPageInfo({ hasNextPage: false, endCursor: null });
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          'Could not load collections from Shopify right now.';
        setCheckoutCollectionError(msg);
      })
      .finally(() => setCheckoutCollectionLoading(false));
  }, [checkoutCollectionSearchDebounced, isStandalone, isShopifyFromRoute, routeDomain]);

  const handleLoadMoreCheckoutCollections = useCallback(async () => {
    if (checkoutCollectionVisibleCount < checkoutCollectionResources.length) {
      setCheckoutCollectionVisibleCount(prev =>
        Math.min(prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH, checkoutCollectionResources.length)
      );
      return;
    }
    if (
      isStandalone ||
      !isShopifyFromRoute ||
      !routeDomain ||
      !checkoutCollectionPageInfo?.hasNextPage ||
      !checkoutCollectionPageInfo?.endCursor ||
      checkoutCollectionLoadingMore
    ) {
      return;
    }
    const shop = routeDomain;
    const query = encodeURIComponent(checkoutCollectionSearchDebounced.trim());
    setCheckoutCollectionLoadingMore(true);
    try {
      const res = await apiGet(
        `/shopify/store-resources?type=collection&query=${query}&first=40&after=${encodeURIComponent(
          checkoutCollectionPageInfo.endCursor
        )}`,
        { shop }
      );
      const incoming = Array.isArray(res.data?.resources) ? res.data.resources : [];
      if (incoming.length > 0) {
        setCheckoutCollectionResources(prev => {
          const seen = new Set((prev || []).map(r => String(r?.id || '')));
          const merged = [...(prev || [])];
          incoming.forEach(item => {
            const id = String(item?.id || '');
            if (id && !seen.has(id)) {
              seen.add(id);
              merged.push(item);
            }
          });
          return merged;
        });
        setCheckoutCollectionVisibleCount(prev => prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH);
      }
      setCheckoutCollectionPageInfo(
        res.data?.page_info || {
          hasNextPage: false,
          endCursor: null,
        }
      );
    } catch (err) {
      setCheckoutCollectionError(
        err?.response?.data?.error ||
          err?.message ||
          'Could not load more collections. Please retry.'
      );
    } finally {
      setCheckoutCollectionLoadingMore(false);
    }
  }, [
    checkoutCollectionVisibleCount,
    checkoutCollectionResources.length,
    checkoutCollectionPageInfo?.hasNextPage,
    checkoutCollectionPageInfo?.endCursor,
    checkoutCollectionLoadingMore,
    checkoutCollectionSearchDebounced,
    isStandalone,
    isShopifyFromRoute,
    routeDomain,
  ]);

  useEffect(() => {
    if (isStandalone || !['product', 'collection', 'page'].includes(targetTypeForResources)) {
      setStoreResources([]);
      setStoreResourcesVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
      setStoreResourcesPageInfo({ hasNextPage: false, endCursor: null });
      return;
    }
    // Use route domain explicitly so the correct Shopify store is queried (avoids wrong-shop when multiple stores)
    const shop = isShopifyFromRoute ? routeDomain : null;
    if (!shop) {
      setStoreResources([]);
      setStoreResourcesVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
      setStoreResourcesPageInfo({ hasNextPage: false, endCursor: null });
      return;
    }
    setStoreResourcesLoading(true);
    setStoreResourcesLoadingMore(false);
    setStoreResourcesError(null);
    const query = encodeURIComponent(storeResourceSearchDebounced.trim());
    apiGet(`/shopify/store-resources?type=${targetTypeForResources}&query=${query}&first=100`, {
      shop,
    })
      .then(res => {
        const list = res.data?.resources || [];
        const emptyReason = res.data?.empty_reason || null;
        setStoreResources(list);
        setStoreResourcesVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setStoreResourcesPageInfo(
          res.data?.page_info || {
            hasNextPage: false,
            endCursor: null,
          }
        );
        setStoreResourcesError(list.length === 0 && emptyReason ? emptyReason : null);
      })
      .catch(err => {
        setStoreResources([]);
        setStoreResourcesVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setStoreResourcesPageInfo({ hasNextPage: false, endCursor: null });
        const msg =
          err?.response?.data?.error ||
          err?.message ||
          'Could not load store data. Check connection in the top bar.';
        setStoreResourcesError(msg);
      })
      .finally(() => setStoreResourcesLoading(false));
  }, [
    targetTypeForResources,
    storeResourceSearchDebounced,
    isStandalone,
    isShopifyFromRoute,
    routeDomain,
  ]);

  const handleLoadMoreStoreResources = useCallback(async () => {
    if (storeResourcesVisibleCount < storeResources.length) {
      setStoreResourcesVisibleCount(prev =>
        Math.min(prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH, storeResources.length)
      );
      return;
    }
    if (
      isStandalone ||
      !isShopifyFromRoute ||
      !routeDomain ||
      !['product', 'collection', 'page'].includes(targetTypeForResources) ||
      !storeResourcesPageInfo?.hasNextPage ||
      !storeResourcesPageInfo?.endCursor ||
      storeResourcesLoadingMore
    ) {
      return;
    }
    const shop = routeDomain;
    const query = encodeURIComponent(storeResourceSearchDebounced.trim());
    setStoreResourcesLoadingMore(true);
    try {
      const res = await apiGet(
        `/shopify/store-resources?type=${targetTypeForResources}&query=${query}&first=100&after=${encodeURIComponent(storeResourcesPageInfo.endCursor)}`,
        { shop }
      );
      const incoming = Array.isArray(res.data?.resources) ? res.data.resources : [];
      if (incoming.length > 0) {
        setStoreResources(prev => {
          const seen = new Set((prev || []).map(r => String(r?.id || '')));
          const merged = [...(prev || [])];
          incoming.forEach(item => {
            const id = String(item?.id || '');
            if (id && !seen.has(id)) {
              seen.add(id);
              merged.push(item);
            }
          });
          return merged;
        });
        setStoreResourcesVisibleCount(prev => prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH);
      }
      setStoreResourcesPageInfo(
        res.data?.page_info || {
          hasNextPage: false,
          endCursor: null,
        }
      );
    } catch (err) {
      setStoreResourcesError(
        err?.response?.data?.error ||
          err?.message ||
          'Could not load more store resources. Please retry.'
      );
    } finally {
      setStoreResourcesLoadingMore(false);
    }
  }, [
    isStandalone,
    isShopifyFromRoute,
    routeDomain,
    targetTypeForResources,
    storeResourcesPageInfo?.hasNextPage,
    storeResourcesPageInfo?.endCursor,
    storeResourcesLoadingMore,
    storeResources.length,
    storeResourcesVisibleCount,
    storeResourceSearchDebounced,
  ]);

  useEffect(() => {
    const t = setTimeout(() => setPriceModalSearchDebounced(priceModalSearch), 400);
    return () => clearTimeout(t);
  }, [priceModalSearch]);

  useEffect(() => {
    const t = setTimeout(() => setAllProductsMatrixSearchDebounced(allProductsMatrixSearch), 350);
    return () => clearTimeout(t);
  }, [allProductsMatrixSearch]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const modalClass = 'ripx-price-product-modal-open';
    const root = document.documentElement;
    if (priceProductModalOpen) {
      document.body.classList.add(modalClass);
      root?.classList.add(modalClass);
    } else {
      document.body.classList.remove(modalClass);
      root?.classList.remove(modalClass);
    }
    return () => {
      document.body.classList.remove(modalClass);
      root?.classList.remove(modalClass);
    };
  }, [priceProductModalOpen]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const overlayId = 'ripx-price-product-modal-overlay';
    if (!priceProductModalOpen) {
      const existing = document.getElementById(overlayId);
      if (existing) existing.remove();
      return undefined;
    }

    const ensureOverlay = () => {
      let overlay = document.getElementById(overlayId);
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = overlayId;
        overlay.className = 'ripx-price-product-modal-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
      }
    };

    ensureOverlay();
    const observer = new MutationObserver(() => {
      ensureOverlay();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      const existing = document.getElementById(overlayId);
      if (existing) existing.remove();
    };
  }, [priceProductModalOpen]);

  useEffect(() => {
    if (!storeResources?.length) return;
    setPriceProductMetaById(prev => {
      const next = { ...prev };
      storeResources.forEach(r => {
        if (r?.id) {
          next[r.id] = {
            title: r.title || r.name,
            handle: r.handle || '',
            imageUrl: r.imageUrl || r.image_url || null,
          };
        }
      });
      return next;
    });
  }, [storeResources]);

  useEffect(() => {
    if (!priceModalProducts.length) return;
    setPriceProductMetaById(prev => {
      const next = { ...prev };
      priceModalProducts.forEach(r => {
        if (r?.id) {
          next[r.id] = {
            title: r.title,
            handle: r.handle || '',
            imageUrl: r.imageUrl || null,
          };
        }
      });
      return next;
    });
  }, [priceModalProducts]);

  useEffect(() => {
    if (!allProductsMatrixProducts.length) return;
    setPriceProductMetaById(prev => {
      const next = { ...prev };
      allProductsMatrixProducts.forEach(r => {
        if (r?.id) {
          next[r.id] = {
            title: r.title || r.name,
            handle: r.handle || '',
            imageUrl: r.imageUrl || r.image_url || null,
          };
        }
      });
      return next;
    });
  }, [allProductsMatrixProducts]);

  useEffect(() => {
    if (!priceProductModalOpen || isStandalone || !isShopifyFromRoute || !routeDomain) return;
    let cancelled = false;
    const shop = routeDomain;
    const query = encodeURIComponent(priceModalSearchDebounced.trim());
    setPriceModalLoading(true);
    setPriceModalError(null);
    apiGet(`/shopify/store-resources?type=product&query=${query}&first=30`, { shop })
      .then(res => {
        if (cancelled) return;
        const list = res.data?.resources || [];
        setPriceModalProducts(list);
        setPriceModalVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setPriceModalPageInfo(res.data?.page_info || { hasNextPage: false, endCursor: null });
        setPriceModalError(
          list.length === 0 && res.data?.empty_reason ? res.data.empty_reason : null
        );
      })
      .catch(err => {
        if (cancelled) return;
        setPriceModalProducts([]);
        setPriceModalVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setPriceModalPageInfo({ hasNextPage: false, endCursor: null });
        setPriceModalError(
          err?.response?.data?.error ||
            err?.message ||
            'Could not load products. Check connection in the top bar.'
        );
      })
      .finally(() => {
        if (!cancelled) setPriceModalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    priceProductModalOpen,
    priceModalSearchDebounced,
    isStandalone,
    isShopifyFromRoute,
    routeDomain,
  ]);

  const handlePriceModalLoadMore = useCallback(() => {
    if (priceModalVisibleCount < priceModalProducts.length) {
      setPriceModalVisibleCount(prev =>
        Math.min(prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH, priceModalProducts.length)
      );
      return;
    }
    if (!routeDomain || !priceModalPageInfo?.endCursor || priceModalLoadingMore) return;
    const query = encodeURIComponent(priceModalSearchDebounced.trim());
    const after = encodeURIComponent(priceModalPageInfo.endCursor);
    setPriceModalLoadingMore(true);
    apiGet(`/shopify/store-resources?type=product&query=${query}&first=30&after=${after}`, {
      shop: routeDomain,
    })
      .then(res => {
        const list = res.data?.resources || [];
        setPriceModalProducts(prev => [...prev, ...list]);
        setPriceModalVisibleCount(prev => prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setPriceModalPageInfo(res.data?.page_info || { hasNextPage: false, endCursor: null });
      })
      .catch(() => {})
      .finally(() => setPriceModalLoadingMore(false));
  }, [
    routeDomain,
    priceModalPageInfo,
    priceModalSearchDebounced,
    priceModalLoadingMore,
    priceModalProducts.length,
    priceModalVisibleCount,
  ]);

  const isProductTargetScope = String(formData.target_type || '').toLowerCase() === 'product';
  const selectedScopeProductIds = useMemo(() => {
    if (!isProductTargetScope) return [];
    if (Array.isArray(formData.target_ids) && formData.target_ids.length > 0) {
      return formData.target_ids.filter(Boolean);
    }
    return formData.target_id ? [formData.target_id] : [];
  }, [formData.target_id, formData.target_ids, isProductTargetScope]);
  const excludedScopeProductIds = useMemo(() => {
    if (!Array.isArray(formData.segments?.excluded_product_ids)) return [];
    return formData.segments.excluded_product_ids.filter(Boolean);
  }, [formData.segments?.excluded_product_ids]);
  const getScopeProductMeta = useCallback(
    productId => {
      if (!productId) {
        return { id: '', title: 'Product', handle: '', imageUrl: null };
      }
      const meta = priceProductMetaById[productId];
      if (meta?.title) {
        return {
          id: productId,
          title: meta.title,
          handle: meta.handle || '',
          imageUrl: meta.imageUrl || null,
        };
      }
      const raw = String(productId);
      const match = raw.match(/Product\/(\d+)/);
      return {
        id: productId,
        title: match ? `Product ${match[1]}` : raw,
        handle: '',
        imageUrl: null,
      };
    },
    [priceProductMetaById]
  );
  const selectedScopeProductsPreview = useMemo(
    () => selectedScopeProductIds.map(getScopeProductMeta),
    [getScopeProductMeta, selectedScopeProductIds]
  );
  const excludedScopeProductsPreview = useMemo(
    () => excludedScopeProductIds.map(getScopeProductMeta),
    [excludedScopeProductIds, getScopeProductMeta]
  );
  const activePriceModalProductIds =
    priceProductModalSelectionMode === 'exclude'
      ? excludedScopeProductIds
      : selectedScopeProductIds;
  const openPriceProductModal = useCallback(
    mode => {
      if (!canUseStoreProductPicker) {
        return;
      }
      setPriceProductModalSelectionMode(mode === 'exclude' ? 'exclude' : 'include');
      setPriceModalSearch('');
      setPriceModalSearchDebounced('');
      setPriceProductModalOpen(true);
    },
    [canUseStoreProductPicker]
  );
  const togglePriceModalProduct = useCallback(
    (productId, isSelected) => {
      setIsDirty(true);
      setFormData(prev => {
        if (priceProductModalSelectionMode === 'exclude') {
          const excluded = Array.isArray(prev.segments?.excluded_product_ids)
            ? [...prev.segments.excluded_product_ids]
            : [];
          const nextExcluded = isSelected
            ? excluded.filter(id => id !== productId)
            : [...excluded, productId];
          return {
            ...prev,
            segments: {
              ...prev.segments,
              excluded_product_ids: nextExcluded,
            },
          };
        }
        const selectedIds =
          prev.target_type === 'product'
            ? prev.target_ids?.length
              ? [...prev.target_ids]
              : prev.target_id
                ? [prev.target_id]
                : []
            : [];
        const next = isSelected
          ? selectedIds.filter(id => id !== productId)
          : [...selectedIds, productId];
        return {
          ...prev,
          target_ids: next.length > 1 ? next : null,
          target_id: next.length === 1 ? next[0] : next.length ? next[0] : '',
        };
      });
    },
    [priceProductModalSelectionMode]
  );
  const modalProgressiveWindow = useMemo(
    () => buildProgressiveListWindow(priceModalProducts, priceModalVisibleCount),
    [priceModalProducts, priceModalVisibleCount]
  );
  const modalVisibleProducts = modalProgressiveWindow.visibleItems;
  const modalShownCount = modalProgressiveWindow.shownCount;
  const modalHasHiddenLoaded = modalProgressiveWindow.hasHiddenLoaded;
  const modalCanFetchMore = Boolean(priceModalPageInfo?.hasNextPage);
  const modalCanShowMore = modalHasHiddenLoaded || modalCanFetchMore;
  const modalCanCollapse = modalProgressiveWindow.canCollapse;
  const isExcludeModalActive = priceProductModalSelectionMode === 'exclude';
  const modalSelectionTitle = isExcludeModalActive
    ? 'Select excluded products'
    : 'Select products for this test';
  const shouldUseAllProductsMatrix = formData.pricePerProduct && !isProductTargetScope;
  const canFetchAllProductsMatrix =
    shouldUseAllProductsMatrix && !isStandalone && isShopifyFromRoute && Boolean(routeDomain);
  const allProductsMatrixProgressiveWindow = useMemo(
    () => buildProgressiveListWindow(allProductsMatrixProducts, allProductsMatrixVisibleCount),
    [allProductsMatrixProducts, allProductsMatrixVisibleCount]
  );
  const allProductsMatrixVisibleIds = useMemo(
    () => allProductsMatrixProgressiveWindow.visibleItems.map(item => item?.id).filter(Boolean),
    [allProductsMatrixProgressiveWindow]
  );
  const matrixProductIdsForFetching = useMemo(() => {
    if (!formData.pricePerProduct) return [];
    return isProductTargetScope ? selectedScopeProductIds : allProductsMatrixVisibleIds;
  }, [
    formData.pricePerProduct,
    isProductTargetScope,
    selectedScopeProductIds,
    allProductsMatrixVisibleIds,
  ]);

  useEffect(() => {
    priceMatrixProductsByIdRef.current = priceMatrixProductsById || {};
  }, [priceMatrixProductsById]);

  useEffect(() => {
    priceMatrixErrorByIdRef.current = priceMatrixErrorById || {};
  }, [priceMatrixErrorById]);

  useEffect(() => {
    priceProductMetaByIdRef.current = priceProductMetaById || {};
  }, [priceProductMetaById]);

  useEffect(() => {
    if (!canFetchAllProductsMatrix) {
      setAllProductsMatrixProducts([]);
      setAllProductsMatrixVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
      setAllProductsMatrixPageInfo({ hasNextPage: false, endCursor: null });
      setAllProductsMatrixError(null);
      setAllProductsMatrixLoading(false);
      setAllProductsMatrixLoadingMore(false);
      return;
    }
    let cancelled = false;
    const shop = routeDomain;
    const query = encodeURIComponent(allProductsMatrixSearchDebounced.trim());
    setAllProductsMatrixLoading(true);
    setAllProductsMatrixLoadingMore(false);
    setAllProductsMatrixError(null);
    setAllProductsMatrixVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
    apiGet(`/shopify/store-resources?type=product&query=${query}&first=30`, { shop })
      .then(res => {
        if (cancelled) return;
        const list = Array.isArray(res.data?.resources) ? res.data.resources : [];
        setAllProductsMatrixProducts(list);
        setAllProductsMatrixPageInfo(
          res.data?.page_info || {
            hasNextPage: false,
            endCursor: null,
          }
        );
        setAllProductsMatrixError(
          list.length === 0 && res.data?.empty_reason ? res.data.empty_reason : null
        );
      })
      .catch(err => {
        if (cancelled) return;
        setAllProductsMatrixProducts([]);
        setAllProductsMatrixVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        setAllProductsMatrixPageInfo({ hasNextPage: false, endCursor: null });
        setAllProductsMatrixError(
          err?.response?.data?.error || err?.message || 'Could not load products for matrix view.'
        );
      })
      .finally(() => {
        if (!cancelled) setAllProductsMatrixLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canFetchAllProductsMatrix, routeDomain, allProductsMatrixSearchDebounced]);

  const handleLoadMoreAllProductsMatrix = useCallback(() => {
    if (allProductsMatrixVisibleCount < allProductsMatrixProducts.length) {
      setAllProductsMatrixVisibleCount(prev =>
        Math.min(prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH, allProductsMatrixProducts.length)
      );
      return;
    }
    if (
      !canFetchAllProductsMatrix ||
      !allProductsMatrixPageInfo?.hasNextPage ||
      !allProductsMatrixPageInfo?.endCursor ||
      allProductsMatrixLoadingMore
    ) {
      return;
    }
    const query = encodeURIComponent(allProductsMatrixSearchDebounced.trim());
    const after = encodeURIComponent(allProductsMatrixPageInfo.endCursor);
    setAllProductsMatrixLoadingMore(true);
    apiGet(`/shopify/store-resources?type=product&query=${query}&first=30&after=${after}`, {
      shop: routeDomain,
    })
      .then(res => {
        const list = Array.isArray(res.data?.resources) ? res.data.resources : [];
        if (list.length > 0) {
          setAllProductsMatrixProducts(prev => {
            const existing = Array.isArray(prev) ? prev : [];
            const seen = new Set(existing.map(item => String(item?.id || '')));
            const merged = [...existing];
            list.forEach(item => {
              const id = String(item?.id || '');
              if (id && !seen.has(id)) {
                seen.add(id);
                merged.push(item);
              }
            });
            return merged;
          });
          setAllProductsMatrixVisibleCount(prev => prev + PRICE_PRODUCT_MODAL_REVEAL_BATCH);
        }
        setAllProductsMatrixPageInfo(
          res.data?.page_info || {
            hasNextPage: false,
            endCursor: null,
          }
        );
      })
      .catch(err => {
        setAllProductsMatrixError(
          err?.response?.data?.error ||
            err?.message ||
            'Could not load more products for matrix view.'
        );
      })
      .finally(() => setAllProductsMatrixLoadingMore(false));
  }, [
    allProductsMatrixVisibleCount,
    allProductsMatrixProducts.length,
    canFetchAllProductsMatrix,
    allProductsMatrixPageInfo,
    allProductsMatrixLoadingMore,
    allProductsMatrixSearchDebounced,
    routeDomain,
  ]);

  useEffect(() => {
    if (
      !formData.pricePerProduct ||
      matrixProductIdsForFetching.length === 0 ||
      isStandalone ||
      !isShopifyFromRoute ||
      !routeDomain
    ) {
      return;
    }
    matrixProductIdsForFetching.forEach(productId => {
      if (!productId) return;
      const existingMatrixProduct = priceMatrixProductsByIdRef.current[productId];
      const hasLoadedVariants =
        Array.isArray(existingMatrixProduct?.variants) && existingMatrixProduct.variants.length > 0;
      const hasMatrixFetchError = Boolean(priceMatrixErrorByIdRef.current[productId]);
      const inFlight = Boolean(priceMatrixFetchInFlightRef.current[productId]);
      if (hasLoadedVariants || hasMatrixFetchError || inFlight) return;
      const productIdRaw = String(productId || '').trim();
      const normalizedQueryProductId = /^\d+$/.test(productIdRaw)
        ? `gid://shopify/Product/${productIdRaw}`
        : productIdRaw;
      priceMatrixFetchInFlightRef.current[productId] = true;
      priceMatrixLoadStartedAtRef.current[productId] = Date.now();
      setPriceMatrixLoadingById(prev => ({ ...prev, [productId]: true }));
      setPriceMatrixErrorById(prev => ({ ...prev, [productId]: null }));
      apiGet(
        '/shopify/product-variants',
        {
          shop: routeDomain,
          productId: normalizedQueryProductId,
          first: 1,
          variantsFirst: 100,
        },
        {
          timeout: 15000,
        }
      )
        .then(res => {
          const metaById = priceProductMetaByIdRef.current || {};
          const meta = metaById[productId] || {};
          const product = Array.isArray(res.data?.products) ? res.data.products[0] : null;
          const normalized = product
            ? {
                id: product.id || productId,
                title: product.title || meta.title || String(productId),
                handle: product.handle || '',
                imageUrl: meta.imageUrl || null,
                variants: Array.isArray(product.variants) ? product.variants : [],
              }
            : null;
          setPriceMatrixProductsById(prev => ({
            ...prev,
            [productId]: normalized || {
              id: productId,
              title: meta.title || String(productId),
              handle: meta.handle || '',
              imageUrl: meta.imageUrl || null,
              variants: [],
            },
          }));
          const hasNormalizedVariants =
            Array.isArray(normalized?.variants) && normalized.variants.length > 0;
          const emptyReasonMessage = res.data?.empty_reason;
          if (!hasNormalizedVariants) {
            setPriceMatrixErrorById(prev => ({
              ...prev,
              [productId]:
                emptyReasonMessage ||
                'No variant rows available for this product yet. Re-open the matrix after product data loads.',
            }));
          }
        })
        .catch(err => {
          setPriceMatrixErrorById(prev => ({
            ...prev,
            [productId]:
              err?.response?.data?.error ||
              err?.message ||
              'Could not load variants and current prices for this product.',
          }));
        })
        .finally(() => {
          priceMatrixFetchInFlightRef.current[productId] = false;
          delete priceMatrixLoadStartedAtRef.current[productId];
          setPriceMatrixLoadingById(prev => ({ ...prev, [productId]: false }));
        });
    });
  }, [
    formData.pricePerProduct,
    matrixProductIdsForFetching,
    isStandalone,
    isShopifyFromRoute,
    routeDomain,
  ]);

  useEffect(() => {
    if (!formData.pricePerProduct || matrixProductIdsForFetching.length === 0) return undefined;
    const timer = window.setInterval(() => {
      const now = Date.now();
      let needsLoadingPatch = false;
      const loadingPatch = {};
      let needsErrorPatch = false;
      const errorPatch = {};
      matrixProductIdsForFetching.forEach(productId => {
        if (!productId || !priceMatrixLoadingById[productId]) return;
        const startedAt = Number(priceMatrixLoadStartedAtRef.current[productId] || now);
        const elapsedMs = now - startedAt;
        const inFlight = Boolean(priceMatrixFetchInFlightRef.current[productId]);
        const hasLoadedVariants =
          Array.isArray(priceMatrixProductsByIdRef.current[productId]?.variants) &&
          priceMatrixProductsByIdRef.current[productId].variants.length > 0;
        // Auto-heal stale loading rows so the table never stays blocked indefinitely.
        if (
          (elapsedMs > 25000 && !hasLoadedVariants) ||
          (elapsedMs > 6000 && !inFlight && !hasLoadedVariants)
        ) {
          priceMatrixFetchInFlightRef.current[productId] = false;
          delete priceMatrixLoadStartedAtRef.current[productId];
          loadingPatch[productId] = false;
          needsLoadingPatch = true;
          if (!priceMatrixErrorByIdRef.current[productId]) {
            errorPatch[productId] =
              'Variant loading timed out. Re-open this step or click Save and retry.';
            needsErrorPatch = true;
          }
        }
      });
      if (needsLoadingPatch) {
        setPriceMatrixLoadingById(prev => ({ ...prev, ...loadingPatch }));
      }
      if (needsErrorPatch) {
        setPriceMatrixErrorById(prev => ({ ...prev, ...errorPatch }));
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [formData.pricePerProduct, matrixProductIdsForFetching, priceMatrixLoadingById]);

  useEffect(() => {
    if (!isShippingTargetingMode) {
      return;
    }
    const normalizedTargetType = String(formData.target_type || '')
      .trim()
      .toLowerCase();
    if (normalizedTargetType === 'all-products' || normalizedTargetType === 'all_products') {
      setShippingScopeAdvancedOpen(true);
      return;
    }
    setShippingScopeAdvancedOpen(false);
  }, [formData.target_type, isShippingTargetingMode]);

  useEffect(() => {
    const normalizedTargetType = String(formData.target_type || '')
      .trim()
      .toLowerCase();
    const isStorewide =
      normalizedTargetType === 'all-products' || normalizedTargetType === 'all_products';
    if (!isStorewide) {
      setShippingStorewideApplyConfirmed(false);
    }
  }, [formData.target_type]);

  useEffect(() => {
    if (!isShippingTargetingMode) {
      return;
    }
    const normalizedTargetType = String(formData.target_type || '')
      .trim()
      .toLowerCase();
    if (normalizedTargetType === 'product' || normalizedTargetType === 'all-products') {
      return;
    }
    setFormData(prev => {
      if (prev.type !== 'shipping' && selectedTemplate !== 'shipping') {
        return prev;
      }
      const prevTargetType = String(prev.target_type || '')
        .trim()
        .toLowerCase();
      const nextTargetType = prevTargetType === 'all_products' ? 'all-products' : 'product';
      return {
        ...prev,
        target_type: nextTargetType,
        ...(nextTargetType === 'all-products'
          ? {
              target_id: '',
              target_ids: null,
            }
          : {
              target_id: '',
              target_ids: null,
            }),
        segments: {
          ...prev.segments,
          url_pattern: '',
          page_rules: prev.segments?.page_rules || [],
        },
      };
    });
  }, [formData.target_type, isShippingTargetingMode, selectedTemplate]);
  useEffect(() => {
    if (isStandalone && (placementSection === 'device' || placementSection === 'audience')) {
      setPlacementSection('page');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when isStandalone changes
  }, [isStandalone]);
  useEffect(() => {
    if (
      isShippingTargetingMode &&
      (placementSection === 'device' || placementSection === 'audience')
    ) {
      setPlacementSection('page');
    }
  }, [isShippingTargetingMode, placementSection]);
  useEffect(() => {
    if (isStandalone || !isCheckoutTestType) {
      return;
    }
    setFormData(prev => {
      const currentTargetType = String(prev.target_type || '')
        .trim()
        .toLowerCase();
      const currentUrlPattern = String(prev.segments?.url_pattern || '').trim();
      const currentPageRules = Array.isArray(prev.segments?.page_rules)
        ? prev.segments.page_rules
        : [];
      if (
        currentTargetType === 'checkout' &&
        currentUrlPattern === '/checkout' &&
        currentPageRules.length === 0 &&
        !prev.target_id &&
        !prev.target_ids
      ) {
        return prev;
      }
      return {
        ...prev,
        target_type: 'checkout',
        target_id: '',
        target_ids: null,
        segments: {
          ...(prev.segments || {}),
          url_pattern: '/checkout',
          page_rules: [],
        },
      };
    });
  }, [isCheckoutTestType, isStandalone]);
  useEffect(() => {
    const handler = e => {
      if (currentStep !== stepIds.targeting) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') {
        setPlacementSection('page');
        e.preventDefault();
      } else if (e.key === '2' && !isStandalone && !isShippingTargetingMode) {
        setPlacementSection('device');
        e.preventDefault();
      } else if (e.key === '3' && !isStandalone && !isShippingTargetingMode) {
        setPlacementSection('audience');
        e.preventDefault();
      } else if (e.key === (isStandalone || isShippingTargetingMode ? '2' : '4')) {
        setPlacementSection('holdout');
        e.preventDefault();
      } else if (e.key === (isStandalone || isShippingTargetingMode ? '3' : '5')) {
        setPlacementSection('advanced');
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        setPlacementSection(s =>
          s === 'advanced'
            ? 'holdout'
            : s === 'holdout'
              ? isStandalone || isShippingTargetingMode
                ? 'page'
                : 'audience'
              : s === 'audience'
                ? 'device'
                : s === 'device'
                  ? 'page'
                  : s
        );
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        setPlacementSection(s =>
          s === 'page'
            ? isStandalone || isShippingTargetingMode
              ? 'holdout'
              : 'device'
            : s === 'device'
              ? 'audience'
              : s === 'audience'
                ? 'holdout'
                : s === 'holdout'
                  ? 'advanced'
                  : s
        );
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentStep, isShippingTargetingMode, stepIds.targeting, isStandalone]);

  useEffect(() => {
    if (
      !shouldHydrateInitialData({
        hasInitialData: Boolean(initialData),
        mode,
        createInitialDataAlreadyApplied: createInitialDataAppliedRef.current,
      })
    ) {
      return;
    }

    if (initialData) {
      const nextTestId = initialData.id || null;
      const isNewTest = nextTestId && nextTestId !== previousTestIdRef.current;
      const isSameTest = nextTestId && nextTestId === previousTestIdRef.current;
      const presets = ['/products/', '/collections/', '/cart', '^/$|^/index', ''];
      const initialVariants = Array.isArray(initialData.variants)
        ? initialData.variants
        : DEFAULT_FORM_DATA.variants;
      const serverVariantCount = initialVariants.filter(Boolean).length;
      const formVariantCount = (formData.variants || []).filter(Boolean).length;
      const serverHasMoreVariants = serverVariantCount > formVariantCount;

      // Always accept server data when it has more variants (e.g. refetch after save, or sync from another tab)
      if (isDirty && (isSameTest || !nextTestId) && !serverHasMoreVariants) {
        return;
      }

      if (customUrlModeActive && isSameTest && !serverHasMoreVariants) {
        return;
      }

      const loadedUrlPattern = initialData.segments?.url_pattern ?? '';
      const loadedPageRules = initialData.segments?.page_rules || [];
      const hasCustomUrl =
        loadedPageRules.length > 0 ||
        (loadedUrlPattern && loadedUrlPattern !== ' ' && !presets.includes(loadedUrlPattern));

      const nextFormData = {
        ...DEFAULT_FORM_DATA,
        name: initialData.name || '',
        description: initialData.description || '',
        type: initialData.type || DEFAULT_FORM_DATA.type,
        target_type: initialData.target_type || DEFAULT_FORM_DATA.target_type,
        target_id: normalizeTargetIdValue(initialData.target_id),
        target_ids: normalizeTargetIdList(initialData.target_ids),
        goal: {
          ...DEFAULT_FORM_DATA.goal,
          ...(initialData.goal || {}),
          secondary: Array.isArray(initialData.goal?.secondary)
            ? [...initialData.goal.secondary]
            : [],
        },
        variants: initialVariants.map((rawVariant, vIdx) => {
          const variant = normalizeVariantPriceConfigShape(rawVariant);
          const config =
            variant.config && typeof variant.config === 'object' ? { ...variant.config } : {};
          const serverCode = variant?.code ?? variant?.config?.code ?? config?.code ?? '';
          const veRules = Array.isArray(config.visual_editor_rules)
            ? Array.from({ length: 5 }, (_, i) =>
                normalizeVisualEditorRule(config.visual_editor_rules[i])
              )
            : Array.from({ length: 5 }, () => createEmptyVisualEditorRule());
          if (
            vIdx === 0 &&
            Array.isArray(initialData.segments?.visual_editor_rules) &&
            initialData.segments.visual_editor_rules.length > 0
          ) {
            for (let i = 0; i < 5; i++) {
              const r = initialData.segments.visual_editor_rules[i];
              if (r && typeof r === 'object') veRules[i] = normalizeVisualEditorRule(r);
            }
          }
          return {
            ...variant,
            allocation: variant.allocation ?? 0,
            code: serverCode,
            config: { ...config, code: serverCode, visual_editor_rules: veRules },
          };
        }),
        segments: (() => {
          const seg = { ...DEFAULT_FORM_DATA.segments, ...(initialData.segments || {}) };
          if (Array.isArray(initialData.segments?.visual_editor_rules)) {
            seg.visual_editor_rules = Array.from({ length: 5 }, (_, i) =>
              normalizeVisualEditorRule(initialData.segments.visual_editor_rules[i])
            );
          }
          return seg;
        })(),
        holdout_percent: initialData.holdout_percent ?? DEFAULT_FORM_DATA.holdout_percent,
        pricePerProduct:
          initialVariants.some(
            v =>
              v?.config?.byProduct &&
              typeof v.config.byProduct === 'object' &&
              Object.keys(v.config.byProduct).length > 0
          ) ?? false,
        guardrail_config: initialData.guardrail_config ?? DEFAULT_FORM_DATA.guardrail_config,
        scheduled_start_at: initialData.scheduled_start_at || '',
        scheduled_stop_at: initialData.scheduled_stop_at || '',
        auto_start: initialData.auto_start || false,
        auto_stop: initialData.auto_stop || false,
        timezone: initialData.timezone || DEFAULT_FORM_DATA.timezone,
      };
      setFormData(nextFormData);
      setCustomUrlModeActive(hasCustomUrl);
      if (isNewTest) {
        setSelectedVariantIndex(0);
        hasVariantSelectionRef.current = false;
      }
      previousTestIdRef.current = nextTestId;
      initialSnapshotPendingRef.current = true;
      setIsDirty(false);
      setAutosaveState('idle');
      setLastSavedAt(null);
      setIsInitialized(true);
      if (mode === 'create') {
        createInitialDataAppliedRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- customUrlModeActive/isDirty would re-run and overwrite user selection
  }, [initialData, mode]);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!initialData) return;

    const serverVariants = Array.isArray(initialData.variants)
      ? initialData.variants.filter(Boolean)
      : [];
    const formVariants = (formData.variants || []).filter(Boolean);
    const variantCountMismatch = serverVariants.length !== formVariants.length;

    // When server has different variant count, always sync (critical for correct display)
    if (variantCountMismatch && serverVariants.length > 0) {
      setFormData(prev => ({
        ...prev,
        variants: serverVariants.map(rawVariant => {
          const v = normalizeVariantPriceConfigShape(rawVariant);
          const serverCode = v?.code ?? v?.config?.code ?? '';
          const config = v?.config && typeof v.config === 'object' ? { ...v.config } : {};
          return {
            ...v,
            allocation: v.allocation ?? 0,
            code: serverCode,
            config: { ...config, code: serverCode },
          };
        }),
      }));
      return;
    }

    if (isDirty) return;

    if (initialData.name && !formData.name) {
      setFormData(prev => ({ ...prev, name: initialData.name }));
    }
    if (initialData.description && !formData.description) {
      setFormData(prev => ({ ...prev, description: initialData.description }));
    }
  }, [mode, initialData, formData.name, formData.description, isDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const normalizeVariantAllocations = vars => {
    if (!vars || !Array.isArray(vars) || vars.length === 0) return vars;
    const valid = vars.filter(v => v !== null && v !== undefined && typeof v === 'object');
    if (valid.length === 0) return vars;
    const total = valid.reduce((sum, v) => sum + (Number(v.allocation) || 0), 0);
    if (total === 0) return vars;
    const scaled = valid.map(v => ({
      ...v,
      allocation: ((Number(v.allocation) || 0) / total) * 100,
    }));
    const rounded = scaled.map(v => ({ ...v, allocation: Math.floor(v.allocation) }));
    const remainder = 100 - rounded.reduce((s, v) => s + v.allocation, 0);
    if (remainder > 0) {
      const byFraction = scaled
        .map((v, i) => ({ i, f: v.allocation - Math.floor(v.allocation) }))
        .sort((a, b) => b.f - a.f);
      for (let j = 0; j < remainder; j++) {
        rounded[byFraction[j % byFraction.length].i].allocation += 1;
      }
    }
    return rounded;
  };

  const hasPriceSignalValue = value =>
    value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');

  const sanitizePriceConfigOverrides = rawConfig => {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return rawConfig;
    }
    const config = { ...rawConfig };

    if (config.byVariant && typeof config.byVariant === 'object') {
      const nextRootByVariant = {};
      Object.entries(config.byVariant).forEach(([variantId, variantOverride]) => {
        if (!variantOverride || typeof variantOverride !== 'object') return;
        const row = { ...variantOverride };
        const rowHasSignal =
          hasPriceSignalValue(row.price) ||
          hasPriceSignalValue(row.compareAtPrice) ||
          hasPriceSignalValue(row.priceDelta) ||
          hasPriceSignalValue(row.pricePercent);
        if (rowHasSignal) {
          nextRootByVariant[variantId] = row;
        }
      });
      if (Object.keys(nextRootByVariant).length > 0) {
        config.byVariant = nextRootByVariant;
      } else {
        delete config.byVariant;
      }
    }

    if (config.byProduct && typeof config.byProduct === 'object') {
      const nextByProduct = {};
      Object.entries(config.byProduct).forEach(([productId, productOverride]) => {
        if (!productOverride || typeof productOverride !== 'object') return;
        const productEntry = { ...productOverride };
        const rawByVariant =
          productEntry.byVariant && typeof productEntry.byVariant === 'object'
            ? productEntry.byVariant
            : null;
        if (rawByVariant) {
          const nextByVariant = {};
          Object.entries(rawByVariant).forEach(([variantId, variantOverride]) => {
            if (!variantOverride || typeof variantOverride !== 'object') return;
            const row = { ...variantOverride };
            const rowHasSignal =
              hasPriceSignalValue(row.price) ||
              hasPriceSignalValue(row.compareAtPrice) ||
              hasPriceSignalValue(row.priceDelta) ||
              hasPriceSignalValue(row.pricePercent);
            if (rowHasSignal) {
              nextByVariant[variantId] = row;
            }
          });
          if (Object.keys(nextByVariant).length > 0) {
            productEntry.byVariant = nextByVariant;
          } else {
            delete productEntry.byVariant;
          }
        }

        const productHasSignal =
          hasPriceSignalValue(productEntry.price) ||
          hasPriceSignalValue(productEntry.compareAtPrice) ||
          hasPriceSignalValue(productEntry.priceDelta) ||
          hasPriceSignalValue(productEntry.pricePercent) ||
          (productEntry.byVariant &&
            typeof productEntry.byVariant === 'object' &&
            Object.keys(productEntry.byVariant).length > 0);

        if (productHasSignal) {
          nextByProduct[productId] = productEntry;
        }
      });

      if (Object.keys(nextByProduct).length > 0) {
        config.byProduct = nextByProduct;
      } else {
        delete config.byProduct;
      }
    }

    return config;
  };

  const applyPriceExecutionModeToConfig = (rawConfig, executionMode) => {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return rawConfig;
    }
    const normalizedMode = String(executionMode || '')
      .trim()
      .toLowerCase();
    const modeToWrite =
      normalizedMode === 'direct_price_override' ? 'direct_price_override' : 'auto';
    const config = { ...rawConfig, priceApplicationMethod: modeToWrite };

    if (config.byProduct && typeof config.byProduct === 'object') {
      config.byProduct = Object.fromEntries(
        Object.entries(config.byProduct).map(([productId, productOverride]) => {
          if (!productOverride || typeof productOverride !== 'object') {
            return [productId, productOverride];
          }
          const productEntry = {
            ...productOverride,
            priceApplicationMethod: modeToWrite,
          };
          if (productEntry.byVariant && typeof productEntry.byVariant === 'object') {
            productEntry.byVariant = Object.fromEntries(
              Object.entries(productEntry.byVariant).map(([variantId, variantOverride]) => {
                if (!variantOverride || typeof variantOverride !== 'object') {
                  return [variantId, variantOverride];
                }
                return [
                  variantId,
                  {
                    ...variantOverride,
                    priceApplicationMethod: modeToWrite,
                  },
                ];
              })
            );
          }
          return [productId, productEntry];
        })
      );
    }

    if (config.byVariant && typeof config.byVariant === 'object') {
      config.byVariant = Object.fromEntries(
        Object.entries(config.byVariant).map(([variantId, variantOverride]) => {
          if (!variantOverride || typeof variantOverride !== 'object') {
            return [variantId, variantOverride];
          }
          return [
            variantId,
            {
              ...variantOverride,
              priceApplicationMethod: modeToWrite,
            },
          ];
        })
      );
    }

    return config;
  };

  const buildPayload = (data = formData, codes = variantCodesData) => {
    const variants = (data?.variants || []).map(v => normalizeVariantPriceConfigShape(v));
    const codesList = Array.isArray(codes) ? codes : [];
    const variantsWithCode = variants.map((variant, index) => {
      const codeItem = codesList[index];
      const combinedCode =
        codeItem && typeof codeItem.code === 'string' && codeItem.code.trim()
          ? codeItem.code
          : buildCombinedCode(codeItem);
      const existingCode = variant?.code ?? variant?.config?.code ?? '';
      if (combinedCode && String(combinedCode).trim()) {
        return { ...variant, code: combinedCode };
      }
      if (existingCode && String(existingCode).trim()) {
        return { ...variant, code: existingCode };
      }
      const { code: _code, ...rest } = variant || {};
      return rest;
    });

    const parsedHoldout =
      data.holdout_percent === '' ||
      data.holdout_percent === null ||
      data.holdout_percent === undefined
        ? null
        : Number(data.holdout_percent);
    const holdoutPercent = Number.isNaN(parsedHoldout) ? null : parsedHoldout;

    const normalizedSegments = {
      device: data.segments?.device || 'all',
      customer: data.segments?.customer || 'all',
      countries: Array.isArray(data.segments?.countries)
        ? data.segments.countries.filter(Boolean)
        : [],
      traffic_source: data.segments?.traffic_source || 'all',
      anti_flicker_mode: data.segments?.anti_flicker_mode === 'strict' ? 'strict' : 'balanced',
      url_pattern: data.segments?.url_pattern ?? '',
      min_sessions: data.segments?.min_sessions ?? '',
    };
    if (
      Array.isArray(data.segments?.excluded_product_ids) &&
      data.segments.excluded_product_ids.length > 0
    ) {
      normalizedSegments.excluded_product_ids = data.segments.excluded_product_ids.filter(Boolean);
    }
    if (Array.isArray(data.segments?.custom_rules) && data.segments.custom_rules.length > 0) {
      normalizedSegments.custom_rules = data.segments.custom_rules;
    }
    if (Array.isArray(data.segments?.page_rules) && data.segments.page_rules.length > 0) {
      const validPageRules = data.segments.page_rules
        .filter(
          r =>
            r &&
            typeof r.type === 'string' &&
            r.pattern !== null &&
            r.pattern !== undefined &&
            String(r.pattern).trim()
        )
        .map(r => ({
          type: (r.type || 'include').toLowerCase(),
          pattern: String(r.pattern).trim(),
          match_type: ['regex', 'contains', 'starts_with', 'ends_with', 'equals'].includes(
            String(r.match_type || 'regex').toLowerCase()
          )
            ? String(r.match_type).toLowerCase()
            : 'regex',
        }));
      if (validPageRules.length > 0) {
        normalizedSegments.page_rules = validPageRules;
      }
    }
    if (Array.isArray(data.segments?.device_rules) && data.segments.device_rules.length > 0) {
      normalizedSegments.device_rules = data.segments.device_rules;
    }
    if (Array.isArray(data.segments?.audience_rules) && data.segments.audience_rules.length > 0) {
      normalizedSegments.audience_rules = data.segments.audience_rules;
    }
    if (
      data.segments?.js_targeting?.enabled &&
      normalizeTextValue(data.segments?.js_targeting?.code)
    ) {
      normalizedSegments.js_targeting = {
        enabled: true,
        code: normalizeTextValue(data.segments?.js_targeting?.code),
      };
    }
    const veUrl = normalizeTextValue(data.segments?.visual_editor_preview_url);
    const veSel = normalizeTextValue(data.segments?.visual_editor_selector);
    if (veUrl) normalizedSegments.visual_editor_preview_url = veUrl;
    if (veSel) normalizedSegments.visual_editor_selector = veSel;
    const veRulesSource = Array.isArray(data.variants?.[0]?.config?.visual_editor_rules)
      ? data.variants[0].config.visual_editor_rules
      : data.segments?.visual_editor_rules;
    if (Array.isArray(veRulesSource) && veRulesSource.length > 0) {
      normalizedSegments.visual_editor_rules = veRulesSource
        .slice(0, 5)
        .map(r => (r && typeof r === 'object' ? normalizeVisualEditorRule(r) : null))
        .filter(Boolean);
    }

    const templateKey =
      selectedTemplate ||
      data.goal?.template_key ||
      inferTemplateKeyFromVariants(data.variants, data.type);
    const isPriceLikeTest =
      ['price', 'pricing'].includes(String(data.type || '').toLowerCase()) ||
      ['price', 'pricing'].includes(String(templateKey || '').toLowerCase());
    const isThemeFamilyTest =
      String(data.type || '').toLowerCase() === 'theme' ||
      templateKey === 'theme' ||
      templateKey === 'template';

    const goal = {
      type: data.goal?.type || 'conversion',
      ...(data.goal || {}),
      template_key: templateKey || undefined,
      secondary: Array.isArray(data.goal?.secondary) ? data.goal.secondary : [],
    };

    const normalizedVariants = normalizeVariantAllocations(variantsWithCode).map(v => {
      const nextVariant = {
        ...v,
        allocation: Number(v.allocation) || 0,
      };
      if (isPriceLikeTest) {
        nextVariant.config = applyPriceExecutionModeToConfig(
          sanitizePriceConfigOverrides(nextVariant.config || {}),
          priceCheckoutExecutionMode
        );
      } else if (isThemeFamilyTest) {
        const fallbackThemeMode = templateKey === 'template' ? 'template_switch' : 'asset_flag';
        nextVariant.config = normalizeThemeConfig(nextVariant.config || {}, fallbackThemeMode);
      }
      return nextVariant;
    });

    // Omit frontend-only fields that are not columns on tests (e.g. pricePerProduct is UI state; per-product config lives in variants[].config.byProduct)
    const { pricePerProduct: _pricePerProduct, ...dataForApi } = data;

    return {
      ...dataForApi,
      goal,
      holdout_percent: holdoutPercent,
      segments: normalizedSegments,
      scheduled_start_at: data.auto_start ? data.scheduled_start_at || null : null,
      scheduled_stop_at: data.auto_stop ? data.scheduled_stop_at || null : null,
      variants: normalizedVariants,
    };
  };

  const buildCodePayload = (data = formData, codes = variantCodesData) => {
    const variants = data?.variants || [];
    const codesList = Array.isArray(codes) ? codes : [];
    return {
      variants: variants.map((variant, index) => {
        const codeData = codesList[index] ?? codesList.find(item => item?.name === variant?.name);
        const rawCode = codeData
          ? typeof codeData.code === 'string' && codeData.code.trim()
            ? codeData.code
            : buildCombinedCode(codeData)
          : (variant?.code ?? variant?.config?.code ?? '');
        const code = rawCode !== undefined && rawCode !== null ? String(rawCode) : '';
        return {
          id: variant?.id ?? null,
          name: (variant?.name || variant?.config?.name || `Variant ${index + 1}`).trim(),
          code,
        };
      }),
    };
  };

  useEffect(() => {
    if (!initialData) return;
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
  }, [initialData]);

  // Map target type / url_pattern to the actual path for preview URL (homepage regex → /, etc.)
  const getPreviewPathForTarget = useCallback((urlPattern, targetType) => {
    const p = normalizeTextValue(urlPattern);
    if (
      targetType === 'homepage' ||
      p === HOMEPAGE_URL_PATTERN_SHOPIFY ||
      p === HOMEPAGE_URL_PATTERN_STANDALONE
    )
      return '/';
    if (targetType === 'all' && !p) return '/';
    if (p === '/cart' || p === '/checkout' || p === '/products/' || p === '/collections/') return p;
    if (p.startsWith('/') && !/[\]^$|*+?()[]/.test(p)) return p;
    return '/';
  }, []);

  // Resolve the first selected target to a concrete path (e.g. /products/handle) for preview. Auto-targets first from list.
  const getFirstTargetPreviewPath = useCallback(() => {
    const targetType = formData.target_type || initialData?.target_type;
    const normalizedTargetType = String(targetType || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');
    const currentTestType = formData.type || initialData?.type || selectedTemplate;
    const isPriceScope = isPriceLikeTestType(currentTestType);
    const urlPattern = formData.segments?.url_pattern ?? '';
    const firstId =
      formData.target_id ||
      (Array.isArray(formData.target_ids) && formData.target_ids.length > 0
        ? formData.target_ids[0]
        : null);
    const resources = storeResources || [];
    if (isPriceScope && normalizedTargetType === 'all-products') {
      const matrixProductWithHandle = (allProductsMatrixProducts || []).find(p => p?.handle);
      if (matrixProductWithHandle?.handle) {
        return `/products/${encodeURIComponent(matrixProductWithHandle.handle)}`;
      }
      const metaWithHandle = Object.values(priceProductMetaById || {}).find(meta => meta?.handle);
      if (metaWithHandle?.handle) {
        return `/products/${encodeURIComponent(metaWithHandle.handle)}`;
      }
    }
    if (targetType === 'product' && resources.length > 0) {
      const r = firstId ? resources.find(res => res.id === firstId) : resources[0];
      if (r?.handle) return `/products/${encodeURIComponent(r.handle)}`;
    }
    if (targetType === 'collection' && resources.length > 0) {
      const r = firstId ? resources.find(res => res.id === firstId) : resources[0];
      if (r?.handle) return `/collections/${encodeURIComponent(r.handle)}`;
    }
    if (targetType === 'page' && resources.length > 0) {
      const r = firstId ? resources.find(res => res.id === firstId) : resources[0];
      if (r?.handle) return `/pages/${encodeURIComponent(r.handle)}`;
    }
    return getPreviewPathForTarget(urlPattern, targetType);
  }, [
    formData.target_type,
    formData.target_id,
    formData.target_ids,
    formData.segments?.url_pattern,
    formData.type,
    storeResources,
    allProductsMatrixProducts,
    priceProductMetaById,
    initialData?.target_type,
    initialData?.type,
    selectedTemplate,
    getPreviewPathForTarget,
  ]);

  // Set visual preview loading when opening visual editor or when preview URL changes
  useEffect(() => {
    if (!visualEditorExpanded) {
      setVisualPreviewLoadState('idle');
      return;
    }
    const pathForPreview = getFirstTargetPreviewPath();
    const domainForPreview =
      routeDomain || getPreviewDomain() || getShopDomain() || initialData?.shop_domain;
    const resolved = resolvePreviewBaseUrl({
      variantUrl: null,
      overrideUrl: normalizeTextValue(formData.segments?.visual_editor_preview_url) || null,
      domain: domainForPreview || undefined,
      path: pathForPreview,
    });
    setVisualPreviewLoadState(resolved ? 'loading' : 'idle');
  }, [
    visualEditorExpanded,
    formData.segments?.visual_editor_preview_url,
    formData.segments?.url_pattern,
    formData.target_type,
    initialData?.shop_domain,
    initialData?.target_type,
    getPreviewPathForTarget,
    getFirstTargetPreviewPath,
    routeDomain,
  ]);

  // "Taking a while?" hint after 3s in loading state
  useEffect(() => {
    if (visualPreviewLoadState !== 'loading') {
      setVisualPreviewLoadingSlow(false);
      return;
    }
    const t = setTimeout(() => setVisualPreviewLoadingSlow(true), 3000);
    return () => clearTimeout(t);
  }, [visualPreviewLoadState]);

  // Timeout fallback when iframe is blocked or slow (onLoad may never fire)
  useEffect(() => {
    if (visualPreviewLoadState !== 'loading') return;
    const t = setTimeout(() => {
      setVisualPreviewLoadState(prev => (prev === 'loading' ? 'error' : prev));
    }, 8000);
    return () => clearTimeout(t);
  }, [visualPreviewLoadState]);

  // Keep visual preview variant index in range when variants list changes
  useEffect(() => {
    const n = (formData.variants ?? []).length;
    if (n > 0 && visualPreviewVariantIndex >= n) {
      setVisualPreviewVariantIndex(Math.max(0, n - 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clamp index when variant count changes; formData.variants identity would cause extra runs
  }, [formData.variants?.length, visualPreviewVariantIndex]);

  // Clear "change selector" mode when switching preview variant so we don't replace the wrong variant's element
  useEffect(() => {
    setChangingSelectorIndex(null);
  }, [visualPreviewVariantIndex]);

  // Allowed postMessage origins: app origin + API origin (iframe may load preview-document from API host)
  const allowedPreviewMessageOrigins = useMemo(() => {
    const list = [window.location.origin];
    try {
      const base = getApiBaseUrl();
      if (base && /^https?:\/\//i.test(base)) {
        const u = new URL(base);
        if (u.origin && !list.includes(u.origin)) list.push(u.origin);
      }
    } catch (_) {
      // ignore
    }
    return list;
  }, []);

  // Listen for selector from visual editor iframe and for preview-error (backend fallback page)
  useEffect(() => {
    function handleMessage(event) {
      try {
        if (!allowedPreviewMessageOrigins.includes(event.origin)) return;

        if (event.data?.type === 'ripx-preview-error') {
          setVisualPreviewLoadState('error');
          return;
        }
        if (event.data?.type !== 'ripx-visual-selector' || typeof event.data.selector !== 'string')
          return;
        const sel = event.data.selector.trim();
        if (!sel || sel.length > 2048) return;

        const form = formDataRef.current;
        const variantIndex = Math.min(
          Math.max(0, visualPreviewVariantIndexRef.current),
          (form.variants?.length || 1) - 1
        );
        const variant = form.variants?.[variantIndex];
        const rules = Array.from({ length: 5 }, (_, i) =>
          normalizeVisualEditorRule((variant?.config?.visual_editor_rules || [])[i])
        );
        const selectedCount = rules.filter(r => (r.selector || '').trim()).length;
        const changeIdx = changingSelectorIndexRef.current;

        if (changeIdx !== null && changeIdx >= 0 && changeIdx < 5) {
          applyVisualRulesChange(variantIndex, nextRules => {
            nextRules[changeIdx] = { ...nextRules[changeIdx], selector: sel };
          });
          setChangingSelectorIndex(null);
          setVisualSnippetPanelExpanded(true);
          setVisualSnippetActiveElementIndex(changeIdx);
          setVisualPreviewToast({ message: 'Selector updated', type: 'success' });
          setTimeout(() => setVisualPreviewToast(null), 2000);
          return;
        }

        if (selectedCount >= 5) {
          setVisualPreviewToast({
            message: 'Maximum 5 elements per variant. Remove an element to add another.',
            type: 'critical',
          });
          setTimeout(() => setVisualPreviewToast(null), 4000);
          return;
        }

        const firstEmpty = rules.findIndex(r => !(r.selector || '').trim());
        const idx = firstEmpty >= 0 ? firstEmpty : 0;

        applyVisualRulesChange(variantIndex, nextRules => {
          nextRules[idx] = { ...nextRules[idx], selector: sel };
        });
        setVisualSnippetPanelExpanded(true);
        setVisualSnippetActiveElementIndex(idx);
        setVisualPreviewToast({
          message: 'Element selected — snippet panel opened',
          type: 'success',
        });
        setTimeout(() => setVisualPreviewToast(null), 2500);
      } catch (_) {
        // Ignore malformed or cross-origin messages
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [allowedPreviewMessageOrigins, applyVisualRulesChange]);

  const validateCSS = css => {
    const errors = [];
    if (!css || css.trim() === '') return errors;

    try {
      const styleSheet = new CSSStyleSheet();
      styleSheet.replaceSync(css);
    } catch (e) {
      if (e.message) {
        let errorMsg = e.message;
        if (errorMsg.includes('CSS')) {
          errorMsg = errorMsg.replace(/.*CSS\s*:?\s*/i, '');
        }
        errors.push(`CSS syntax error: ${errorMsg}`);
      } else {
        errors.push('Invalid CSS syntax detected');
      }
    }

    return errors;
  };

  const validateJS = js => {
    const errors = [];
    if (!js || js.trim() === '') return errors;

    try {
      // eslint-disable-next-line no-new-func -- validating user-provided JS code
      new Function(js);
    } catch (e) {
      if (e instanceof SyntaxError) {
        let errorMsg = e.message;
        const lineMatch = errorMsg.match(/line (\d+)/i);
        const lineNum = lineMatch ? lineMatch[1] : null;

        if (errorMsg.includes('Unexpected token')) {
          errorMsg = errorMsg.replace(/Unexpected token (.+?)(?:$|\.)/, 'Unexpected token: $1');
        } else if (errorMsg.includes('Unexpected end')) {
          errorMsg = 'Unexpected end of input (missing closing bracket, brace, or parenthesis)';
        } else if (errorMsg.includes('Missing')) {
          errorMsg = errorMsg.replace(/Missing (.+?)(?:$|\.)/, 'Missing: $1');
        } else if (errorMsg.includes('Invalid')) {
          errorMsg = errorMsg.replace(/Invalid (.+?)(?:$|\.)/, 'Invalid: $1');
        }

        if (lineNum) {
          errors.push(`Syntax error (line ${lineNum}): ${errorMsg}`);
        } else {
          errors.push(`Syntax error: ${errorMsg}`);
        }
      }
    }

    return errors;
  };

  const parseVariantCode = code => {
    if (code === undefined || code === null) return { css: '', js: '' };
    const str = typeof code === 'string' ? code : String(code);
    if (!str.trim()) return { css: '', js: '' };
    const cssMatch = str.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const jsMatch = str.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    return {
      css: cssMatch ? cssMatch[1].trim() : '',
      js: jsMatch ? jsMatch[1].trim() : '',
    };
  };

  const buildCombinedCode = codeData => {
    if (!codeData || typeof codeData !== 'object') return '';
    const css = typeof codeData.css === 'string' ? codeData.css : '';
    const js = typeof codeData.js === 'string' ? codeData.js : '';
    let combinedCode = '';
    if (css.trim()) combinedCode += `<style>\n${css}\n</style>\n`;
    if (js.trim()) combinedCode += `<script>\n${js}\n</script>`;
    return combinedCode.trim();
  };

  const stripCodeFromPayload = payload => {
    if (!payload || typeof payload !== 'object') return payload;
    const variants = (payload.variants || []).map(variant => {
      if (!variant || typeof variant !== 'object') return variant;
      const { code: _code, ...rest } = variant;
      if (rest.config && typeof rest.config === 'object' && rest.config.code !== undefined) {
        const { code: _c, ...configRest } = rest.config;
        return { ...rest, config: configRest };
      }
      return rest;
    });
    return { ...payload, variants };
  };

  // Sync variant codes from formData.variants into variantCodesData. Only run when variants list
  // changes (length or items). Do NOT depend on selectedVariantIndex — otherwise switching tabs
  // would re-run this and overwrite in-progress edits in variantCodesData with stale state.
  // When the server provides code (sourceCode), always use it so reload shows saved code.
  // In edit mode, fall back to initialData.variants and use its length so we never show fewer variants than the server has.
  useEffect(() => {
    setVariantCodesData(prev => {
      const formVariants = formData.variants || [];
      const serverVariants =
        mode === 'edit' && Array.isArray(initialData?.variants) ? initialData.variants : [];
      const len = Math.max(formVariants.length, serverVariants.length);
      const updated = Array.from({ length: len }, (_, index) => {
        const variant = formVariants[index] ?? serverVariants[index];
        if (!variant) return { name: `Variant ${index + 1}`, css: '', js: '', code: '' };
        const existing = prev[index] || prev.find(item => item?.name === variant.name);
        const fromForm = variant?.code ?? variant?.config?.code ?? '';
        const fromServer = serverVariants[index]
          ? (serverVariants[index].code ?? serverVariants[index].config?.code ?? '')
          : '';
        const existingCode =
          existing && (existing.code?.trim() || buildCombinedCode(existing).trim())
            ? existing.code?.trim()
              ? existing.code
              : buildCombinedCode(existing)
            : '';
        const formC = fromForm && String(fromForm).trim() ? fromForm : '';
        const srvC = fromServer && String(fromServer).trim() ? fromServer : '';
        let sourceCode = '';
        if (mode === 'edit') {
          if (existingCode && formC && existingCode.trim() !== formC.trim()) {
            sourceCode = existingCode;
          } else if (formC) {
            sourceCode = formC;
          } else if (!formC && !existingCode) {
            sourceCode = '';
          } else if (srvC) {
            sourceCode = srvC;
          } else if (existingCode) {
            sourceCode = existingCode;
          }
        } else {
          sourceCode = formC || srvC || existingCode || '';
        }

        if (sourceCode && String(sourceCode).trim()) {
          const parsed = parseVariantCode(sourceCode);
          return {
            ...(existing || {}),
            name: variant.name,
            css: parsed.css,
            js: parsed.js,
            code: sourceCode,
          };
        }
        if (existing && (existing.css?.trim() || existing.js?.trim())) {
          return { ...existing, name: variant.name };
        }
        const parsed = parseVariantCode('');
        return {
          ...(existing || {}),
          name: variant.name,
          css: parsed.css,
          js: parsed.js,
          code: '',
        };
      });

      const currentSelected = selectedVariantIndexRef.current;
      if (updated.length > 0 && currentSelected >= updated.length) {
        setSelectedVariantIndex(0);
      }
      return updated;
    });
  }, [formData.variants, mode, initialData?.variants]);

  // Direct hydration from server: when initialData changes (load or after save), push variant code
  // into variantCodesData so reload or cache update always shows persisted code.
  const lastServerCodesRef = useRef(null);
  useEffect(() => {
    if (mode !== 'edit' || !initialData?.id || !Array.isArray(initialData.variants)) return;
    if (isDirty && previousTestIdRef.current === initialData.id) return;
    const serverCodesFingerprint = `${initialData.id}-${initialData.updated_at ?? ''}-${(
      initialData.variants || []
    )
      .map(v => `${v?.id ?? ''}|${v?.name ?? ''}|${(v?.code ?? v?.config?.code ?? '').length}`)
      .join(';')}`;
    if (lastServerCodesRef.current === serverCodesFingerprint) return;
    lastServerCodesRef.current = serverCodesFingerprint;

    const fromServer = (initialData.variants || []).map(variant => {
      const sourceCode = variant?.code ?? variant?.config?.code ?? '';
      if (sourceCode && String(sourceCode).trim()) {
        const parsed = parseVariantCode(sourceCode);
        return {
          name: variant.name,
          css: parsed.css,
          js: parsed.js,
          code: sourceCode,
        };
      }
      return {
        name: variant.name,
        css: '',
        js: '',
        code: '',
      };
    });
    setVariantCodesData(fromServer);
    // Intentionally omit initialData.updated_at and isDirty to avoid overwriting local edits on tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialData?.id, initialData?.variants]);

  useEffect(() => {
    if (hasVariantSelectionRef.current || variantCodesData.length === 0) {
      return;
    }

    const firstWithCode = variantCodesData.findIndex(
      variant => (variant?.css && variant.css.trim()) || (variant?.js && variant.js.trim())
    );

    if (firstWithCode >= 0) {
      setSelectedVariantIndex(firstWithCode);
      hasVariantSelectionRef.current = true;
      return;
    }

    // Price tests commonly keep Control empty by design. On reload, auto-focus the
    // first variant that has an actual saved price config so users don't see a blank form.
    const looksLikePriceTest = isPriceLikeTestType(formData?.type);
    if (!looksLikePriceTest) {
      return;
    }
    const configuredIndices = getSavedPriceConfigIndices(formData?.variants || []);
    if (configuredIndices.length === 1) {
      setSelectedVariantIndex(configuredIndices[0]);
      hasVariantSelectionRef.current = true;
    }
  }, [variantCodesData, formData?.type, formData?.variants]);

  useEffect(() => {
    if (!isPriceLikeTestType(formData?.type)) return;
    if (currentStep !== stepIds.traffic) return;
    const variants = Array.isArray(formData?.variants) ? formData.variants : [];
    if (variants.length === 0) return;
    const currentCfg = variants[selectedVariantIndex]?.config || {};
    if (hasSavedPriceConfigValue(currentCfg)) return;
    const configuredIndices = getSavedPriceConfigIndices(variants);
    if (configuredIndices.length === 1 && configuredIndices[0] !== selectedVariantIndex) {
      setSelectedVariantIndex(configuredIndices[0]);
    }
  }, [currentStep, stepIds.traffic, formData?.type, formData?.variants, selectedVariantIndex]);

  useEffect(() => {
    const current = variantCodesData[selectedVariantIndex];
    if (current) {
      setCssValidationErrors(validateCSS(current.css));
      setJsValidationErrors(validateJS(current.js));
    } else {
      setCssValidationErrors([]);
      setJsValidationErrors([]);
    }
  }, [selectedVariantIndex, variantCodesData]);

  const handleTemplateSelect = templateKey => {
    if (!isTemplateTypeEnabled(templateKey)) {
      const templateLabel = TEST_TEMPLATES[templateKey]?.name || templateKey;
      setError(`${templateLabel} is currently unavailable.`);
      return;
    }
    setSelectedTemplate(templateKey);

    let targetType = '';
    let urlPattern = '';
    if (templateKey === 'template' || templateKey === 'theme') {
      targetType = 'homepage';
      urlPattern = isStandalone ? HOMEPAGE_URL_PATTERN_STANDALONE : HOMEPAGE_URL_PATTERN_SHOPIFY;
    } else if (templateKey === 'checkout') {
      targetType = 'checkout';
      urlPattern = '/checkout';
    } else if (templateKey === 'shipping') {
      targetType = 'product';
      urlPattern = '';
    } else if (templateKey === 'combination') {
      targetType = 'cart';
      urlPattern = '/cart';
    } else if (templateKey === 'price' || templateKey === 'pricing' || templateKey === 'offer') {
      targetType = 'all-products';
      urlPattern = '';
    }

    if (TEST_TEMPLATES[templateKey]) {
      const template = TEST_TEMPLATES[templateKey];
      setFormData(prev => ({
        ...prev,
        type: template.defaultConfig.type,
        goal: {
          ...(prev.goal || {}),
          ...(template.defaultConfig.goal || {}),
        },
        target_type: targetType,
        target_id: '',
        target_ids: null,
        segments: {
          ...prev.segments,
          url_pattern: urlPattern,
          page_rules: [],
          excluded_product_ids:
            templateKey === 'price' ||
            templateKey === 'pricing' ||
            templateKey === 'offer' ||
            templateKey === 'shipping'
              ? prev.segments?.excluded_product_ids || []
              : [],
        },
        variants: template.defaultConfig.variants || [
          { name: 'Control', allocation: 50, config: {} },
          { name: 'Variant A', allocation: 50, config: {} },
        ],
      }));
    } else {
      let testType = 'content';
      if (templateKey === 'pricing') {
        testType = 'price';
      } else if (templateKey === 'shipping') {
        testType = 'shipping';
      } else if (templateKey === 'offer') {
        testType = 'offer';
      } else if (templateKey === 'checkout') {
        testType = 'checkout';
      }

      setFormData(prev => ({
        ...prev,
        type: testType,
        target_type: targetType,
        target_id: '',
        target_ids: null,
        segments: {
          ...prev.segments,
          url_pattern: urlPattern,
          page_rules: [],
          excluded_product_ids:
            templateKey === 'price' ||
            templateKey === 'pricing' ||
            templateKey === 'offer' ||
            templateKey === 'shipping'
              ? prev.segments?.excluded_product_ids || []
              : [],
        },
        variants: [
          { name: 'Control', allocation: 50, config: {} },
          { name: 'Variant A', allocation: 50, config: {} },
        ],
      }));
    }
  };

  useEffect(() => {
    if (showTemplateStep && initialTemplate) {
      handleTemplateSelect(initialTemplate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when step/template available; handleTemplateSelect is stable
  }, [showTemplateStep, initialTemplate]);

  const isPriceTestType =
    selectedTemplate === 'price' ||
    selectedTemplate === 'pricing' ||
    isPriceLikeTestType(formData.type);
  const isOfferTestType = selectedTemplate === 'offer' || isOfferLikeTestType(formData.type);
  const isShippingTestType = selectedTemplate === 'shipping' || formData.type === 'shipping';
  const isCommerceProductScopeTest = isPriceTestType || isOfferTestType || isShippingTestType;

  const handleNext = () => {
    const stepErrors = getStepErrors(currentStep);
    if (stepErrors.length > 0) {
      shouldFocusValidationSummaryRef.current = true;
      setError(stepErrors[0]);
      return;
    }

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleNextRef = useRef(handleNext);
  const handleBackRef = useRef(handleBack);
  handleNextRef.current = handleNext;
  handleBackRef.current = handleBack;

  const addCustomEvent = () => {
    const name = (customEventInput || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!name || name.length > 100) return;
    const goal = formData.goal || {};
    const secondary = goal.secondary || [];
    if (secondary.some(s => (s?.event_name || s) === name)) return;
    setFormData({
      ...formData,
      goal: { ...goal, secondary: [...secondary, { event_name: name, aggregation: 'count' }] },
    });
    setCustomEventInput('');
  };

  const handleSaveCodeOnly = async () => {
    if (!onSaveCode || !initialData?.id) return;
    setLoading(true);
    setError(null);
    setAutosaveState('saving');
    try {
      const form = formDataRef.current;
      const codes = variantCodesDataRef.current;
      const codePayload = buildCodePayload(form, codes);
      await onSaveCode(codePayload);
      lastSavedSnapshotRef.current = JSON.stringify(buildPayload(form, codes));
      setIsDirty(false);
      setAutosaveState('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      const details = err?.response?.data?.details;
      if (Array.isArray(details) && details.length > 0) {
        setError(details.join(' '));
      } else {
        setError(err?.response?.data?.error || err?.message || 'Failed to save code');
      }
      setAutosaveState('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (options = {}) => {
    if (!onSubmit) return;

    const reviewStepId = steps[steps.length - 1]?.id;
    const isReviewStep = currentStep === reviewStepId;
    if (isReviewStep && !options.silent) {
      const stepErrors = getStepErrors(currentStep);
      if (stepErrors.length > 0) {
        shouldFocusValidationSummaryRef.current = true;
        setError(stepErrors[0]);
        return;
      }
    }

    // Use refs so we always send the latest edits (React state may not have committed yet when Save is clicked)
    const form = formDataRef.current;
    const codes = variantCodesDataRef.current;
    const payload = buildPayload(form, codes);
    const nameToUse =
      normalizeTextValue(payload.name) || normalizeTextValue(initialData?.name) || '';
    if (!nameToUse) {
      setError('Test name is required.');
      return;
    }
    const payloadWithName = { ...payload, name: nameToUse.trim() };
    if (!normalizeTextValue(payload.name) && normalizeTextValue(initialData?.name)) {
      setFormData(prev => ({ ...prev, name: normalizeTextValue(initialData?.name) }));
    }

    setLoading(true);
    setError(null);
    if (options.silent) {
      setAutosaveState('saving');
    }

    try {
      const isCodeStep = currentStep === stepIds.code;
      let useCodeEndpoint = options.saveCodeOnly === true;

      if (!useCodeEndpoint && isCodeStep && lastSavedSnapshotRef.current) {
        try {
          const previous = JSON.parse(lastSavedSnapshotRef.current);
          const strippedCurrent = JSON.stringify(stripCodeFromPayload(payloadWithName));
          const strippedPrevious = JSON.stringify(stripCodeFromPayload(previous));
          useCodeEndpoint = strippedCurrent === strippedPrevious;
        } catch (err) {
          useCodeEndpoint = false;
        }
      }

      const codePayload = isCodeStep ? buildCodePayload(form, codes) : null;
      await onSubmit(payloadWithName, { ...options, isCodeStep, useCodeEndpoint, codePayload });
      const snapshot = JSON.stringify(payloadWithName);
      lastSavedSnapshotRef.current = snapshot;
      setIsDirty(false);
      setAutosaveState('saved');
      setLastSavedAt(new Date());
    } catch (err) {
      const details = err?.response?.data?.details;
      if (Array.isArray(details) && details.length > 0) {
        setError(details.join(' '));
      } else {
        setError(err?.response?.data?.error || err?.message || 'Failed to save test');
      }
      setAutosaveState('error');
      setLoading(false);
      return;
    }

    setLoading(false);
  };

  const dirtyCompareReadyRef = useRef(false);

  useEffect(() => {
    if (mode !== 'edit') return;
    dirtyCompareReadyRef.current = false;
    const t = setTimeout(() => {
      dirtyCompareReadyRef.current = true;
    }, 400);
    return () => clearTimeout(t);
  }, [mode, initialData?.id]);

  useEffect(() => {
    if (mode !== 'edit') return;

    if (initialSnapshotPendingRef.current) {
      if (formData.variants?.length > 0 && variantCodesData.length === formData.variants.length) {
        lastSavedSnapshotRef.current = JSON.stringify(
          buildPayload(formDataRef.current, variantCodesDataRef.current)
        );
        initialSnapshotPendingRef.current = false;
        setIsDirty(false);
      }
      return;
    }
    if (!isInitialized || !lastSavedSnapshotRef.current || !dirtyCompareReadyRef.current) {
      return;
    }
    const snapshot = JSON.stringify(buildPayload());
    setIsDirty(snapshot !== lastSavedSnapshotRef.current);
  }, [formData, variantCodesData]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'edit' || currentStep !== stepIds.code) return;
    if (!lastSavedSnapshotRef.current || variantCodesData.length !== formData.variants?.length)
      return;
    const snapshot = JSON.stringify(buildPayload());
    if (snapshot === lastSavedSnapshotRef.current) {
      setIsDirty(false);
    }
  }, [mode, currentStep, formData, variantCodesData, showTemplateStep]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!isInitialized || !lastSavedSnapshotRef.current) return;
    if (currentStep === stepIds.code) {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
      return;
    }
    if (!isDirty) {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      setAutosaveState('idle');
      return;
    }
    if (cssValidationErrors.length > 0 || jsValidationErrors.length > 0) {
      return;
    }
    if (!formData.name || !formData.name.trim()) {
      return;
    }
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    const autosaveDelay = 1200;
    autosaveTimeoutRef.current = setTimeout(() => {
      handleSubmit({ silent: true });
    }, autosaveDelay);
    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
        autosaveTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSubmit/isInitialized would cause autosave loop
  }, [
    isDirty,
    formData,
    cssValidationErrors,
    jsValidationErrors,
    mode,
    currentStep,
    showTemplateStep,
  ]);

  const getStepErrors = stepId =>
    getWizardStepErrors(stepId, {
      stepIds,
      reviewStepId: steps[steps.length - 1]?.id,
      formData,
      initialData,
      showTemplateStep,
      selectedTemplate,
      cssValidationErrors,
      jsValidationErrors,
      priceExecution: {
        isShopify: isShopifyFromRoute,
        isStandalone,
        directPriceOverrideReadiness,
      },
    });

  const handleVariantCodeChange = (type, value, variantIndex) => {
    const index =
      typeof variantIndex === 'number' && variantIndex >= 0 ? variantIndex : selectedVariantIndex;
    setCodeEditorDirty(true);
    setVariantCodesData(prev => {
      const updated = [...prev];
      const current = updated[index] ?? { name: `Variant ${index + 1}`, css: '', js: '', code: '' };
      const next = { ...current, [type]: value };
      next.code = buildCombinedCode(next);
      updated[index] = next;
      setFormData(fd => {
        const vars = [...(fd.variants || [])];
        if (vars[index]) {
          const cfg =
            vars[index].config && typeof vars[index].config === 'object' ? vars[index].config : {};
          vars[index] = {
            ...vars[index],
            code: next.code,
            config: { ...cfg, code: next.code },
          };
        }
        return { ...fd, variants: vars };
      });
      return updated;
    });

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }
    validationTimeoutRef.current = setTimeout(() => {
      if (type === 'css') setCssValidationErrors(validateCSS(value));
      if (type === 'js') setJsValidationErrors(validateJS(value));
    }, 300);
  };

  const handleVariantNavigation = direction => {
    hasVariantSelectionRef.current = true;
    const maxIndex = Math.max(0, variantCodesData.length - 1);
    if (direction === 'prev') {
      setSelectedVariantIndex(prev => Math.max(0, prev - 1));
    } else {
      setSelectedVariantIndex(prev => Math.min(maxIndex, prev + 1));
    }
  };

  const buildPreviewUrl = (variant, index) => {
    if (mode !== 'edit' || !initialData?.id) return null;
    const domain = routeDomain || getPreviewDomain() || getShopDomain() || initialData?.shop_domain;
    const previewTenantDomain = normalizeTextValue(initialData?.shop_domain) || null;
    const pathForPreview = getFirstTargetPreviewPath();
    const baseUrl = resolvePreviewBaseUrl({
      variantUrl: variant?.config?.url,
      overrideUrl: normalizeTextValue(formData.segments?.visual_editor_preview_url) || null,
      domain: domain || undefined,
      path: pathForPreview,
    });
    if (!baseUrl) return null;
    const variantId = variant?.id || variant?.name || `variant-${index + 1}`;
    const variantName = variant?.name || `Variant ${index + 1}`;
    const directPreviewUrl = buildPreviewUrlUtil({
      baseUrl,
      testId: initialData.id,
      variantId,
      variantName,
      tenantDomain: previewTenantDomain,
      visualEditor: false,
    });
    if (!directPreviewUrl) {
      return null;
    }
    let finalPreviewUrl = directPreviewUrl;
    if (isShopifyPreviewUrl(directPreviewUrl)) {
      const bootstrapPreviewUrl = buildShopifyPreviewBootstrapUrl({
        previewUrl: directPreviewUrl,
      });
      finalPreviewUrl =
        bootstrapPreviewUrl ||
        buildPreviewLaunchUrl({
          apiBaseUrl: getApiBaseUrl(),
          previewUrl: directPreviewUrl,
        }) ||
        directPreviewUrl;
    }
    return ensureShopifyPreviewBootstrapUrl(finalPreviewUrl);
  };

  const handlePreviewVariant = async (variant, index) => {
    if (mode === 'edit' && isDirty) {
      await handleSubmit({ silent: true });
      const stillDirty = JSON.stringify(buildPayload()) !== lastSavedSnapshotRef.current;
      if (stillDirty) {
        setError('Save failed. Fix validation or network issues, then try preview again.');
        return;
      }
    }
    const url = buildPreviewUrl(variant, index);
    if (!url) {
      setError(
        isStandalone
          ? 'Add a site domain for this test (or a variant URL) to preview. You can set it in test settings or when connecting your site.'
          : 'Missing shop domain. Open the app from Shopify Admin to preview.'
      );
      return;
    }
    const finalUrl = ensureShopifyPreviewBootstrapUrl(url);
    window.open(finalUrl, '_blank', 'noopener');
  };

  const handleExecuteShippingFromReview = useCallback(
    async (apply, variantIndex = null) => {
      const testId = initialData?.id;
      if (!testId) return;
      setShippingExecutionLoading(true);
      setShippingExecutionAction(apply ? 'apply' : 'dry_run');
      setError(null);
      setShippingExecutionToast(null);
      try {
        const response = await apiPost(`/tests/${testId}/shipping/execute`, {
          apply: Boolean(apply),
          dry_run: !apply,
          ...(variantIndex !== null && variantIndex !== undefined ? { variantIndex } : {}),
        });
        const payload = response?.data?.data ?? response?.data ?? {};
        setShippingExecutionReport(payload);
        const summary = payload?.execution_result?.summary || {};
        const successCount = Number(summary.success_count || 0);
        const manualCount = Number(summary.manual_required_count || 0);
        const failedCount = Number(summary.failed_count || 0);
        const refreshed =
          apply && typeof onRefreshTest === 'function' ? await onRefreshTest() : true;
        const actionLabel = apply ? 'Apply' : 'Dry run';
        if (failedCount > 0) {
          setError(
            `Shipping execution finished with ${failedCount} failure${failedCount === 1 ? '' : 's'}.`
          );
        } else {
          let message =
            successCount > 0
              ? `${actionLabel} complete: ${successCount} shipping action${successCount === 1 ? '' : 's'} ready.`
              : `${actionLabel} complete. No automatic shipping actions were required.`;
          let type = 'success';
          if (manualCount > 0) {
            type = 'info';
            message = `${actionLabel} finished: ${successCount} ready, ${manualCount} manual follow-up required.`;
          }
          if (apply && !refreshed) {
            type = 'info';
            message = `${message} The page could not refresh automatically, so some details may update on the next reload.`;
          }
          setShippingExecutionToast({
            type,
            message,
          });
        }
      } catch (err) {
        setError(
          err?.response?.data?.details?.[0] ||
            err?.response?.data?.error ||
            err?.message ||
            'Failed to execute shipping actions'
        );
      } finally {
        setShippingExecutionLoading(false);
        setShippingExecutionAction(null);
      }
    },
    [initialData?.id, onRefreshTest]
  );

  const handleRunShippingDiagnostics = useCallback(async () => {
    const testId = initialData?.id;
    if (!testId) return;
    setShippingDiagnosticsLoading(true);
    setError(null);
    try {
      const response = await apiGet(`/tests/${testId}/shipping/diagnostics`);
      setShippingDiagnosticsReport(response?.data?.data ?? response?.data ?? {});
    } catch (err) {
      setError(
        err?.response?.data?.details?.[0] ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to load shipping diagnostics'
      );
    } finally {
      setShippingDiagnosticsLoading(false);
    }
  }, [initialData?.id]);

  const handleEnsureCheckoutCustomizationFromReview = useCallback(
    async apply => {
      const testId = initialData?.id;
      if (!testId) {
        setError('Save this checkout test first, then run checkout customization deployment.');
        return;
      }
      setCheckoutCustomizationLoading(true);
      setCheckoutCustomizationAction(apply ? 'apply' : 'dry_run');
      setError(null);
      setCheckoutCustomizationToast(null);
      try {
        const response = await apiPost(`/tests/${testId}/checkout/customization/ensure`, {
          apply: Boolean(apply),
          dry_run: !apply,
        });
        const payload = response?.data?.data ?? response?.data ?? {};
        const refreshed =
          apply && typeof onRefreshTest === 'function' ? await onRefreshTest() : true;
        let message =
          payload?.message ||
          (apply
            ? 'Checkout customization applied successfully.'
            : 'Checkout customization dry run completed successfully.');
        let type = 'success';
        if (apply && !refreshed) {
          type = 'info';
          message = `${message} The review screen could not refresh automatically, so saved details may update on the next reload.`;
        }
        setCheckoutCustomizationToast({ type, message });
      } catch (err) {
        setError(
          err?.response?.data?.details?.[0] ||
            err?.response?.data?.error ||
            err?.message ||
            'Failed to ensure checkout customization'
        );
      } finally {
        setCheckoutCustomizationLoading(false);
        setCheckoutCustomizationAction(null);
      }
    },
    [initialData?.id, onRefreshTest]
  );

  const openShippingDocs = useCallback(() => {
    if (typeof window === 'undefined') return;
    const docsPath = routeDomain ? ROUTES.appDocs(routeDomain) : ROUTES.DOCS;
    window.open(`${docsPath}#shipping`, '_blank', 'noopener');
  }, [routeDomain]);

  const jumpToShippingTargeting = useCallback(
    targetId => {
      setCurrentStep(stepIds.targeting);
      setPlacementSection('page');
      if (targetId === 'shipping-exclusions-card') {
        setShippingScopeAdvancedOpen(true);
      }
      if (typeof window === 'undefined') return;
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const element = document.getElementById(targetId || 'targeting-scope');
          if (!element) return;
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    },
    [stepIds.targeting]
  );

  const canNavigateSteps =
    enableStepNavigation !== undefined
      ? enableStepNavigation
      : mode === 'edit'
        ? true
        : showTemplateStep
          ? currentStep > 1
          : true;

  const currentStepErrors = getStepErrors(currentStep);
  const hasStepErrors = currentStepErrors.length > 0;

  useEffect(() => {
    if (!hasStepErrors) {
      shouldFocusValidationSummaryRef.current = false;
      return;
    }
    if (shouldFocusValidationSummaryRef.current && validationSummaryRef.current) {
      validationSummaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      validationSummaryRef.current.focus({ preventScroll: true });
      shouldFocusValidationSummaryRef.current = false;
    }
  }, [hasStepErrors, currentStep]);

  useEffect(() => {
    const handleKeyDown = e => {
      const target = e.target;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[role="combobox"]') ||
          target.closest('[role="listbox"]'));
      if (isEditable) return;

      if (e.key === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!hasStepErrors && currentStep < steps.length) handleNextRef.current();
      } else if (e.key === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (currentStep > 1) handleBackRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, steps.length, hasStepErrors]);

  const renderStepIndicator = () => (
    <WizardStepIndicator
      displaySteps={displaySteps}
      currentStep={currentStep}
      canNavigateSteps={canNavigateSteps}
      mode={mode}
      setCurrentStep={setCurrentStep}
    />
  );

  const renderTemplateSelection = () => (
    <WizardTemplateStep
      stepsLength={steps.length}
      selectedTemplate={selectedTemplate}
      formData={formData}
      setFormData={setFormData}
      showTemplateStep={showTemplateStep}
      currentStep={currentStep}
      contentTypesForStep={contentTypesForStep}
      profitTypesForStep={profitTypesForStep}
      isTemplateTypeEnabled={isTemplateTypeEnabled}
      getTemplateUnavailableReason={getTemplateUnavailableReason}
      handleTemplateSelect={handleTemplateSelect}
      isStandalone={isStandalone}
      testTypeCategories={TEST_TYPE_CATEGORIES}
    />
  );

  const renderVariants = () => {
    const variants = formData.variants || [];
    const totalAllocation = variants.reduce((sum, v) => sum + (v.allocation || 0), 0);
    const totalRounded = Math.round(totalAllocation * 100) / 100;
    const allocationValid = Math.abs(totalRounded - 100) < 0.01;
    return (
      <div className={stepStyles.trafficStep}>
        <div className={stepStyles.trafficStepAccent} aria-hidden />
        <div className={stepStyles.trafficStepHeader}>
          <div className={stepStyles.trafficStepTitleBlock}>
            <span className={stepStyles.trafficStepIcon}>
              <Icon source={ChartLineIcon} />
            </span>
            <div>
              <h2 className={stepStyles.trafficStepTitle}>Traffic Allocation</h2>
              <p className={stepStyles.trafficStepSubtitle}>
                Distribute traffic across variants. Drag to adjust or enter values manually.
              </p>
            </div>
          </div>
          <div
            className={`${stepStyles.trafficSummaryBar} ${allocationValid ? stepStyles.trafficSummaryValid : ''}`}
          >
            <span>Total allocation</span>
            <span
              className={`${stepStyles.trafficSummaryTotal} ${
                allocationValid ? stepStyles.valid : stepStyles.invalid
              }`}
            >
              {totalRounded}%
            </span>
            {allocationValid && (
              <span className={stepStyles.trafficSummaryCheck} aria-hidden>
                ✓
              </span>
            )}
          </div>
        </div>
        <div className={stepStyles.trafficStepContent}>
          <TrafficAllocationSlider
            variants={variants}
            onChange={updatedVariants => {
              setFormData(prev => ({ ...prev, variants: updatedVariants }));
            }}
            onAddVariant={newVariant => {
              setIsDirty(true);
              setFormData(prev => {
                const current = prev.variants || [];
                const equalAlloc = Math.floor(100 / (current.length + 1));
                const remainder = 100 - equalAlloc * (current.length + 1);
                const updated = current.map((v, i) => ({
                  ...v,
                  allocation: equalAlloc + (i < remainder ? 1 : 0),
                }));
                updated.push({
                  ...newVariant,
                  config: {
                    ...(newVariant.config || {}),
                    visual_editor_rules: Array.from({ length: 5 }, () =>
                      createEmptyVisualEditorRule()
                    ),
                  },
                  allocation: equalAlloc + (current.length < remainder ? 1 : 0),
                });
                return { ...prev, variants: updated };
              });
            }}
            onRemoveVariant={index => {
              let nextLength = 0;
              setFormData(prev => {
                const current = prev.variants || [];
                if (current.length <= 2) return prev;
                const next = [...current];
                const removed = next.splice(index, 1)[0];
                const removedAlloc = removed?.allocation || 0;
                const otherTotal = next.reduce((s, v) => s + (v.allocation || 0), 0);
                const updated =
                  otherTotal > 0
                    ? next.map(v => ({
                        ...v,
                        allocation: Math.round(
                          (v.allocation || 0) + ((v.allocation || 0) / otherTotal) * removedAlloc
                        ),
                      }))
                    : next.map((v, i) => ({
                        ...v,
                        allocation: Math.floor(100 / next.length) + (i < 100 % next.length ? 1 : 0),
                      }));
                nextLength = updated.length;
                return { ...prev, variants: updated };
              });
              setIsDirty(true);
              if (nextLength > 0) setSelectedVariantIndex(prev => Math.min(prev, nextLength - 1));
            }}
            onPreviewVariant={mode === 'edit' && initialData?.id ? handlePreviewVariant : undefined}
            getPreviewUrl={mode === 'edit' && initialData?.id ? buildPreviewUrl : undefined}
            compact
          />
          {!allocationValid && (
            <p className={stepStyles.trafficAllocationError}>
              Total allocation must equal 100%. Current: {totalRounded}%.
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderTargetingStep = () => {
    const targetingScopeFixedForCommerce = isCommerceProductScopeTest;
    const showDeviceAudienceTabs = !isStandalone && !isShippingTestType;
    const holdoutStepNumber = isStandalone || isShippingTestType ? 2 : 4;
    const advancedStepNumber = isStandalone || isShippingTestType ? 3 : 5;
    const shippingTargetType = String(formData.target_type || '')
      .trim()
      .toLowerCase();
    const isShippingStorewideAdvanced =
      isShippingTestType &&
      (shippingTargetType === 'all-products' || shippingTargetType === 'all_products');
    const shippingTargetingChecklist = isShippingTestType
      ? [
          {
            label: 'Use a holdout of at least 10% for safer live rollout',
            passed: Number(formData.holdout_percent || 0) >= 10,
          },
          {
            label: 'Add excluded products to carve out sensitive SKUs',
            passed: excludedScopeProductIds.length > 0,
          },
          {
            label: 'Keep at least one actionable non-control shipping variant configured',
            passed: (formData.variants || []).some(
              (variant, index) =>
                index > 0 &&
                String(variant?.config?.strategy || '')
                  .trim()
                  .toLowerCase() !== 'control'
            ),
          },
        ]
      : [];
    const countriesValue = formData.segments?.countries?.join(', ') || '';
    const holdoutValue =
      formData.holdout_percent === null || formData.holdout_percent === undefined
        ? ''
        : String(formData.holdout_percent);
    if (isCheckoutTestType) {
      const checkoutPhase = normalizeCheckoutPhase(formData.goal?.checkout_phase);
      const phaseDetails = getCheckoutPhaseDetails(checkoutPhase);
      const holdoutPercent = Math.min(50, Math.max(0, Number(holdoutValue) || 0));
      return (
        <BlockStack gap="400">
          <Card>
            <div className={styles.checkoutTargetingShell}>
              <div className={styles.stepHeader}>
                <span className={styles.stepHeaderIcon}>
                  <Icon source={CreditCardIcon} />
                </span>
                <div>
                  <h2 className={styles.stepHeaderTitle}>Checkout targeting</h2>
                  <p className={styles.stepHeaderSubtitle}>
                    Checkout tests now use a dedicated targeting flow. The surface is fixed to
                    checkout, so the noisy storefront targeting controls have been removed.
                  </p>
                </div>
              </div>

              <div className={styles.checkoutTargetingSummary}>
                <span className={styles.checkoutTargetingSummaryChip}>
                  Surface locked to `/checkout`
                </span>
                <span className={styles.checkoutTargetingSummaryChip}>
                  Phase: {getCheckoutPhaseLabel(checkoutPhase)}
                </span>
                <span className={styles.checkoutTargetingSummaryChip}>
                  Holdout: {holdoutPercent}%
                </span>
              </div>

              <div className={styles.checkoutTargetingGrid}>
                <div className={styles.checkoutTargetingTile}>
                  <span className={styles.checkoutTargetingTileEyebrow}>Fixed location</span>
                  <Text as="h3" variant="headingSm">
                    Checkout only
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    RipX pins this test to the live checkout surface and automatically keeps the
                    target on `/checkout`.
                  </Text>
                </div>
                <div className={styles.checkoutTargetingTile}>
                  <span className={styles.checkoutTargetingTileEyebrow}>Current phase</span>
                  <Text as="h3" variant="headingSm">
                    {phaseDetails.title}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {phaseDetails.description}
                  </Text>
                </div>
                <div className={styles.checkoutTargetingTile}>
                  <span className={styles.checkoutTargetingTileEyebrow}>Deployment layer</span>
                  <Text as="h3" variant="headingSm">
                    {phaseDetails.eyebrow}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {phaseDetails.surface}
                  </Text>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className={styles.checkoutHoldoutShell}>
              <div className={styles.checkoutHoldoutHeader}>
                <div>
                  <Text as="h3" variant="headingSm">
                    Checkout holdout
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Keep a clean control group for checkout performance comparisons without exposing
                    every buyer to a treatment.
                  </Text>
                </div>
                <Badge tone={holdoutPercent >= 10 ? 'success' : 'attention'}>
                  {holdoutPercent}% reserved
                </Badge>
              </div>

              <div className={styles.checkoutPresetRow}>
                {[0, 10, 25, 50].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    className={`${styles.checkoutPresetButton} ${holdoutPercent === pct ? styles.checkoutPresetButtonActive : ''}`}
                    onClick={() => setFormData(prev => ({ ...prev, holdout_percent: pct }))}
                  >
                    {pct}%{pct === 10 ? <span>Recommended</span> : null}
                  </button>
                ))}
              </div>

              <InlineStack gap="300" wrap>
                <div style={{ minWidth: 180, flex: '0 0 180px' }}>
                  <TextField
                    label="Holdout percentage"
                    type="number"
                    min={0}
                    max={50}
                    value={holdoutValue ?? ''}
                    onChange={value =>
                      setFormData(prev => ({
                        ...prev,
                        holdout_percent: value,
                      }))
                    }
                    autoComplete="off"
                  />
                </div>
                <div className={styles.checkoutHoldoutRangeShell}>
                  <input
                    type="range"
                    className={styles.checkoutHoldoutRange}
                    min={0}
                    max={50}
                    value={holdoutPercent}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        holdout_percent: e.target.value,
                      }))
                    }
                    aria-label="Checkout holdout percentage"
                  />
                  <div className={styles.checkoutHoldoutRangeLabels}>
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                  </div>
                </div>
              </InlineStack>

              <Banner tone="info" title="What changed">
                <Text as="p" variant="bodySm">
                  Page scope, device filters, audience filters, and custom checkout URL rules are no
                  longer authored here for checkout tests. This step stays focused on checkout-only
                  exposure and clean experiment measurement.
                </Text>
              </Banner>
            </div>
          </Card>
        </BlockStack>
      );
    }
    const currentTemplateKey = String(
      selectedTemplate || formData.goal?.template_key || formData.type || ''
    ).toLowerCase();
    const antiFlickerRecommendedMode = ['content', 'offer', 'theme', 'split-url'].includes(
      currentTemplateKey
    )
      ? 'strict'
      : 'balanced';
    const antiFlickerRecommendationReason =
      antiFlickerRecommendedMode === 'strict'
        ? 'Visual/content changes benefit from stronger pre-hiding to avoid control flash.'
        : 'Price-focused tests usually perform better with less pre-hide time.';

    return (
      <BlockStack gap="400">
        <Card>
          <div className={styles.configWrapper}>
            <div className={styles.configAccent} aria-hidden />
            <div className={styles.stepHeader}>
              <span className={styles.stepHeaderIcon}>
                <Icon source={PageIcon} />
              </span>
              <div>
                <h2 className={styles.stepHeaderTitle}>Targeting & Segmentation</h2>
                <p className={styles.stepHeaderSubtitle}>
                  {isShippingTestType
                    ? 'Define cart qualification, holdout, and optional safety rules.'
                    : isStandalone
                      ? 'Define where your test runs (URL) and holdout.'
                      : 'Define where your test runs and who sees it.'}
                </p>
              </div>
            </div>

            <div className={styles.targetingTabContent}>
              <div id="targeting-audience" className={styles.targetingTabPanel} role="tabpanel">
                <div className={styles.tabPanelInner}>
                  <div className={styles.placementBar}>
                    <div className={styles.placementBarHeader}>
                      <span className={styles.placementBarLabel}>
                        {isShippingTestType ? 'Shipping qualification' : 'Page integration'}
                      </span>
                      <span className={styles.placementBarSubtext}>
                        {isShippingTestType
                          ? 'Cart qualification and test guardrails'
                          : 'Where and who sees your test'}
                      </span>
                    </div>
                    <div className={styles.placementBarRow}>
                      <div
                        className={styles.placementBarTabs}
                        role="tablist"
                        aria-label="Placement sections"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={placementSection === 'page'}
                          className={`${styles.placementTab} ${placementSection === 'page' ? styles.placementTabActive : ''}`}
                          onClick={() => setPlacementSection('page')}
                          title={isShippingTestType ? 'Qualification (1)' : 'Page (1)'}
                        >
                          <span className={styles.placementTabStep}>1</span>
                          <Icon source={PageIcon} />
                          <span>{isShippingTestType ? 'Qualification' : 'Page'}</span>
                          {((formData.segments?.page_rules || []).length > 0 ||
                            (customUrlModeActive &&
                              (formData.segments?.url_pattern ?? '') !== '')) && (
                            <span className={styles.placementTabDot} />
                          )}
                        </button>
                        {showDeviceAudienceTabs && (
                          <>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={placementSection === 'device'}
                              className={`${styles.placementTab} ${placementSection === 'device' ? styles.placementTabActive : ''}`}
                              onClick={() => setPlacementSection('device')}
                              title="Device (2)"
                            >
                              <span className={styles.placementTabStep}>2</span>
                              <Icon source={UnknownDeviceIcon} />
                              <span>Device</span>
                              {(formData.segments?.device_rules || []).length > 0 && (
                                <span className={styles.placementTabDot} />
                              )}
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={placementSection === 'audience'}
                              className={`${styles.placementTab} ${placementSection === 'audience' ? styles.placementTabActive : ''}`}
                              onClick={() => setPlacementSection('audience')}
                              title="Audience (3)"
                            >
                              <span className={styles.placementTabStep}>3</span>
                              <Icon source={PersonIcon} />
                              <span>Audience</span>
                              {(formData.segments?.audience_rules || []).length > 0 && (
                                <span className={styles.placementTabDot} />
                              )}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          role="tab"
                          aria-selected={placementSection === 'holdout'}
                          className={`${styles.placementTab} ${styles.placementTabHoldout} ${placementSection === 'holdout' ? styles.placementTabActive : ''} ${Number(holdoutValue) > 0 ? styles.placementTabHighlight : ''}`}
                          onClick={() => setPlacementSection('holdout')}
                          title={`Holdout (${holdoutStepNumber})`}
                        >
                          <span className={styles.placementTabStep}>{holdoutStepNumber}</span>
                          <Icon source={LockIcon} />
                          <span>Holdout</span>
                          {Number(holdoutValue) > 0 && <span className={styles.placementTabDot} />}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={placementSection === 'advanced'}
                          className={`${styles.placementTab} ${styles.placementTabAdvanced} ${placementSection === 'advanced' ? styles.placementTabActive : ''}`}
                          onClick={() => setPlacementSection('advanced')}
                          title={`Advanced (${advancedStepNumber})`}
                        >
                          <span className={styles.placementTabStep}>{advancedStepNumber}</span>
                          <Icon source={CodeIcon} />
                          <span>Advanced</span>
                          {(() => {
                            const cr = (formData.segments?.custom_rules || []).length;
                            const extra =
                              (formData.guardrail_config?.enabled ? 1 : 0) +
                              (formData.segments?.js_targeting?.enabled ? 1 : 0);
                            const hasTraffic =
                              (formData.segments?.traffic_source || 'all') !== 'all' ||
                              (formData.segments?.url_pattern &&
                                formData.segments.url_pattern !== ' ' &&
                                String(formData.segments.url_pattern).trim() !== '') ||
                              Number(formData.segments?.min_sessions) > 0;
                            const advancedCount = cr + extra + (hasTraffic ? 1 : 0);
                            return advancedCount > 0 ? (
                              <span className={styles.placementTabDot} />
                            ) : null;
                          })()}
                        </button>
                      </div>
                      <div className={styles.placementBarSummary}>
                        <span className={styles.placementConfigPill}>
                          {(() => {
                            if (isShippingTestType) {
                              const scopeLabel = isShippingStorewideAdvanced
                                ? 'Storewide carts'
                                : `${selectedScopeProductIds.length || 0} included product${selectedScopeProductIds.length === 1 ? '' : 's'}`;
                              const excludedLabel =
                                excludedScopeProductIds.length > 0
                                  ? ` · ${excludedScopeProductIds.length} excluded`
                                  : '';
                              return `${scopeLabel}${excludedLabel} · ${holdoutValue || 0}% holdout`;
                            }
                            const pr = formData.segments?.page_rules || [];
                            const p = formData.segments?.url_pattern ?? '';
                            const pageLabel =
                              pr.length > 0
                                ? `${pr.length} rule${pr.length > 1 ? 's' : ''}`
                                : !p || p === ' '
                                  ? 'All pages'
                                  : p === HOMEPAGE_URL_PATTERN_SHOPIFY ||
                                      p === HOMEPAGE_URL_PATTERN_STANDALONE
                                    ? 'Homepage'
                                    : p === '/products/'
                                      ? 'Products'
                                      : p === '/collections/'
                                        ? 'Collections'
                                        : p === '/cart'
                                          ? 'Cart'
                                          : 'Custom';
                            const dev = formData.segments?.device || 'all';
                            const cust = formData.segments?.customer || 'all';
                            const countries = formData.segments?.countries || [];
                            const whoLabel =
                              dev === 'all' && cust === 'all' && countries.length === 0
                                ? 'All'
                                : [
                                    dev !== 'all'
                                      ? dev === 'desktop'
                                        ? 'Desktop'
                                        : 'Mobile'
                                      : null,
                                    cust !== 'all' ? (cust === 'new' ? 'New' : 'Returning') : null,
                                    countries.length > 0
                                      ? countries.length > 3
                                        ? `${countries.length} countries`
                                        : countriesValue
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ');
                            return `${pageLabel} · ${whoLabel} · ${holdoutValue || 0}% holdout`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.placementContent}>
                    {placementSection === 'page'
                      ? [
                          <div
                            key="page-placement"
                            className={styles.placementPanel}
                            id="targeting-scope"
                          >
                            {targetingScopeFixedForCommerce ? (
                              <BlockStack gap="300">
                                <Banner
                                  tone={isShippingStorewideAdvanced ? 'warning' : 'info'}
                                  title={
                                    isShippingTestType
                                      ? isShippingStorewideAdvanced
                                        ? 'Shipping test uses advanced storewide qualification'
                                        : 'Shipping tests default to selected-product cart qualification'
                                      : isOfferTestType
                                        ? 'Offer tests use product-only scope'
                                        : 'Price tests use product-only scope'
                                  }
                                >
                                  <Text as="p" variant="bodySm">
                                    {isShippingTestType ? (
                                      isShippingStorewideAdvanced ? (
                                        <>
                                          <strong>Storewide shipping</strong> qualifies nearly every
                                          cart across your catalog. Use{' '}
                                          <strong>excluded products</strong> to carve out
                                          exceptions, then validate with diagnostics and holdout
                                          before you apply it live.
                                        </>
                                      ) : (
                                        <>
                                          Choose the{' '}
                                          <strong>products that must appear in the cart</strong>{' '}
                                          before this shipping test can apply. You can also add
                                          optional <strong>excluded products</strong> to block
                                          shipping assignment and checkout application for carts
                                          that contain those SKUs. If you need broader coverage,
                                          unlock <strong>advanced storewide scope</strong> below.
                                        </>
                                      )
                                    ) : (
                                      <>
                                        Choose between <strong>all products</strong> and{' '}
                                        <strong>selected products</strong> here. You can also add
                                        optional <strong>excluded products</strong> to prevent
                                        assignment and storefront application for specific SKUs.
                                      </>
                                    )}
                                  </Text>
                                </Banner>
                                <div className={styles.panelSection}>
                                  <span className={styles.panelSectionTitle}>
                                    {isShippingTestType ? 'Cart qualification' : 'Product scope'}
                                  </span>
                                  <div className={styles.scopeSelectGrid}>
                                    {isShippingTestType ? (
                                      <>
                                        <div
                                          className={`${styles.scopeCard} ${!isShippingStorewideAdvanced ? styles.scopeCardActive : ''}`}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() =>
                                            setFormData(prev => ({
                                              ...prev,
                                              target_type: 'product',
                                              segments: {
                                                ...prev.segments,
                                                url_pattern: '',
                                                page_rules: prev.segments?.page_rules || [],
                                              },
                                            }))
                                          }
                                          onKeyDown={event => {
                                            if (event.key !== 'Enter' && event.key !== ' ') {
                                              return;
                                            }
                                            event.preventDefault();
                                            setFormData(prev => ({
                                              ...prev,
                                              target_type: 'product',
                                              segments: {
                                                ...prev.segments,
                                                url_pattern: '',
                                                page_rules: prev.segments?.page_rules || [],
                                              },
                                            }));
                                          }}
                                          aria-pressed={!isShippingStorewideAdvanced}
                                          aria-label="Carts with selected products"
                                        >
                                          <span className={styles.scopeCardIcon}>
                                            <Icon source={TargetIcon} />
                                          </span>
                                          <span className={styles.scopeCardLabel}>
                                            Carts with selected products
                                          </span>
                                          <span className={styles.scopeCardDesc}>
                                            Qualify only carts that contain one of the products you
                                            choose below
                                          </span>
                                        </div>
                                        {(shippingScopeAdvancedOpen ||
                                          isShippingStorewideAdvanced) && (
                                          <div
                                            className={`${styles.scopeCard} ${isShippingStorewideAdvanced ? styles.scopeCardActive : ''}`}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() =>
                                              setFormData(prev => ({
                                                ...prev,
                                                target_type: 'all-products',
                                                target_id: '',
                                                target_ids: null,
                                                segments: {
                                                  ...prev.segments,
                                                  url_pattern: '',
                                                  page_rules: prev.segments?.page_rules || [],
                                                },
                                              }))
                                            }
                                            onKeyDown={event => {
                                              if (event.key !== 'Enter' && event.key !== ' ') {
                                                return;
                                              }
                                              event.preventDefault();
                                              setFormData(prev => ({
                                                ...prev,
                                                target_type: 'all-products',
                                                target_id: '',
                                                target_ids: null,
                                                segments: {
                                                  ...prev.segments,
                                                  url_pattern: '',
                                                  page_rules: prev.segments?.page_rules || [],
                                                },
                                              }));
                                            }}
                                            aria-pressed={isShippingStorewideAdvanced}
                                            aria-label="Storewide shipping qualification"
                                          >
                                            <span className={styles.scopeCardIcon}>
                                              <Icon source={ProductIcon} />
                                            </span>
                                            <span className={styles.scopeCardLabel}>
                                              Storewide shipping
                                            </span>
                                            <span className={styles.scopeCardDesc}>
                                              Qualify carts across your full catalog. Excluded
                                              products still block assignment and checkout
                                              application.
                                            </span>
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div
                                          className={`${styles.scopeCard} ${(formData.target_type || 'all-products') !== 'product' ? styles.scopeCardActive : ''}`}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() =>
                                            setFormData(prev => ({
                                              ...prev,
                                              target_type: 'all-products',
                                              target_id: '',
                                              target_ids: null,
                                              segments: {
                                                ...prev.segments,
                                                url_pattern: '/products/',
                                                page_rules: prev.segments?.page_rules || [],
                                              },
                                            }))
                                          }
                                          onKeyDown={event => {
                                            if (event.key !== 'Enter' && event.key !== ' ') {
                                              return;
                                            }
                                            event.preventDefault();
                                            setFormData(prev => ({
                                              ...prev,
                                              target_type: 'all-products',
                                              target_id: '',
                                              target_ids: null,
                                              segments: {
                                                ...prev.segments,
                                                url_pattern: '/products/',
                                                page_rules: prev.segments?.page_rules || [],
                                              },
                                            }));
                                          }}
                                          aria-pressed={
                                            (formData.target_type || 'all-products') !== 'product'
                                          }
                                          aria-label="All products"
                                        >
                                          <span className={styles.scopeCardIcon}>
                                            <Icon source={ProductIcon} />
                                          </span>
                                          <span className={styles.scopeCardLabel}>
                                            All products
                                          </span>
                                          <span className={styles.scopeCardDesc}>
                                            Assign this test across your full product catalog
                                          </span>
                                        </div>
                                        <div
                                          className={`${styles.scopeCard} ${formData.target_type === 'product' ? styles.scopeCardActive : ''}`}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() =>
                                            setFormData(prev => ({
                                              ...prev,
                                              target_type: 'product',
                                              segments: {
                                                ...prev.segments,
                                                url_pattern: '/products/',
                                                page_rules: prev.segments?.page_rules || [],
                                              },
                                            }))
                                          }
                                          onKeyDown={event => {
                                            if (event.key !== 'Enter' && event.key !== ' ') {
                                              return;
                                            }
                                            event.preventDefault();
                                            setFormData(prev => ({
                                              ...prev,
                                              target_type: 'product',
                                              segments: {
                                                ...prev.segments,
                                                url_pattern: '/products/',
                                                page_rules: prev.segments?.page_rules || [],
                                              },
                                            }));
                                          }}
                                          aria-pressed={formData.target_type === 'product'}
                                          aria-label="Selected products only"
                                        >
                                          <span className={styles.scopeCardIcon}>
                                            <Icon source={TargetIcon} />
                                          </span>
                                          <span className={styles.scopeCardLabel}>
                                            Selected products
                                          </span>
                                          <span className={styles.scopeCardDesc}>
                                            Assign only for specific products you choose
                                          </span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  {isShippingTestType && (
                                    <div className={styles.inlineAdvancedToggle}>
                                      <button
                                        type="button"
                                        className={styles.inlineAdvancedToggleBtn}
                                        onClick={() => {
                                          const nextOpen = !shippingScopeAdvancedOpen;
                                          setShippingScopeAdvancedOpen(nextOpen);
                                          if (!nextOpen && isShippingStorewideAdvanced) {
                                            setFormData(prev => ({
                                              ...prev,
                                              target_type: 'product',
                                              segments: {
                                                ...prev.segments,
                                                url_pattern: '',
                                                page_rules: prev.segments?.page_rules || [],
                                              },
                                            }));
                                          }
                                        }}
                                        aria-expanded={shippingScopeAdvancedOpen}
                                      >
                                        <span
                                          className={`${styles.inlineAdvancedChevron} ${shippingScopeAdvancedOpen ? styles.inlineAdvancedChevronOpen : ''}`}
                                        >
                                          <Icon source={ChevronDownIcon} />
                                        </span>
                                        Advanced: enable storewide shipping scope
                                        {isShippingStorewideAdvanced && (
                                          <span className={styles.inlineAdvancedCount}>On</span>
                                        )}
                                      </button>
                                      {shippingScopeAdvancedOpen && (
                                        <div className={styles.inlineAdvancedBody}>
                                          <p className={styles.inlineAdvancedHint}>
                                            Use storewide qualification only when you intentionally
                                            want this shipping test to reach nearly every eligible
                                            cart. RipX will still respect excluded products,
                                            holdout, and shipping diagnostics.
                                          </p>
                                          <Banner
                                            tone="warning"
                                            title="Broader impact, stronger guardrails"
                                          >
                                            <BlockStack gap="200">
                                              <Text as="p" variant="bodySm">
                                                Storewide shipping tests are powerful but easier to
                                                misconfigure. Add a holdout, use excluded products
                                                to carve out sensitive SKUs, and run diagnostics
                                                before you apply live.
                                              </Text>
                                              <div className={styles.bannerChecklist}>
                                                {shippingTargetingChecklist.map(item => (
                                                  <div
                                                    key={item.label}
                                                    className={styles.bannerChecklistItem}
                                                  >
                                                    <span className={styles.bannerChecklistIcon}>
                                                      <Icon
                                                        source={
                                                          item.passed
                                                            ? CheckCircleIcon
                                                            : AlertTriangleIcon
                                                        }
                                                        tone={item.passed ? 'success' : 'warning'}
                                                      />
                                                    </span>
                                                    <Text
                                                      as="span"
                                                      variant="bodySm"
                                                      className={styles.bannerChecklistLabel}
                                                    >
                                                      {item.label}
                                                    </Text>
                                                  </div>
                                                ))}
                                              </div>
                                            </BlockStack>
                                          </Banner>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className={styles.productScopePickerGrid}>
                                  {((isShippingTestType && !isShippingStorewideAdvanced) ||
                                    (!isShippingTestType &&
                                      formData.target_type === 'product')) && (
                                    <div
                                      className={`${styles.productScopePickerCard} ${styles.productScopePickerCardPrimary}`}
                                    >
                                      <BlockStack gap="200">
                                        <InlineStack align="space-between" blockAlign="center" wrap>
                                          <InlineStack gap="200" blockAlign="center">
                                            <span className={styles.productScopePickerIcon}>
                                              <Icon source={ProductIcon} />
                                            </span>
                                            <Text as="h4" variant="headingSm">
                                              {isShippingTestType
                                                ? 'Included products'
                                                : 'Included products'}
                                            </Text>
                                          </InlineStack>
                                          <Badge tone="info">
                                            {`${selectedScopeProductIds.length} selected`}
                                          </Badge>
                                        </InlineStack>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          {isShippingTestType
                                            ? 'Choose products that must appear in a delivery group before this shipping test can apply.'
                                            : 'Choose products from your store catalog for this test scope.'}
                                        </Text>
                                        <InlineStack>
                                          <Button
                                            size="slim"
                                            variant="primary"
                                            icon={ProductIcon}
                                            onClick={() => openPriceProductModal('include')}
                                            disabled={!canUseStoreProductPicker}
                                          >
                                            {isShippingTestType
                                              ? 'Choose included products'
                                              : 'Choose products'}
                                          </Button>
                                        </InlineStack>
                                        <div className={styles.productScopePickerSelectionList}>
                                          {selectedScopeProductsPreview.length === 0 ? (
                                            <div
                                              className={styles.productScopePickerSelectionEmpty}
                                            >
                                              <Icon source={ProductIcon} />
                                              <span>
                                                {isShippingTestType
                                                  ? 'No included products selected yet.'
                                                  : 'No products selected yet.'}
                                              </span>
                                            </div>
                                          ) : (
                                            selectedScopeProductsPreview
                                              .slice(0, 4)
                                              .map(product => (
                                                <div
                                                  key={product.id}
                                                  className={`${styles.priceProductPickerRow} ${styles.priceProductPickerRowSelected}`}
                                                >
                                                  <span
                                                    className={styles.priceProductPickerThumb}
                                                    aria-hidden
                                                  >
                                                    {product.imageUrl ? (
                                                      <img
                                                        src={product.imageUrl}
                                                        alt=""
                                                        loading="lazy"
                                                      />
                                                    ) : (
                                                      <Icon source={ProductIcon} />
                                                    )}
                                                  </span>
                                                  <span
                                                    className={styles.priceProductPickerRowText}
                                                  >
                                                    <span
                                                      className={styles.priceProductPickerRowTitle}
                                                    >
                                                      {product.title}
                                                    </span>
                                                    {product.handle ? (
                                                      <span
                                                        className={
                                                          styles.priceProductPickerRowHandle
                                                        }
                                                      >
                                                        {product.handle}
                                                      </span>
                                                    ) : null}
                                                  </span>
                                                </div>
                                              ))
                                          )}
                                          {selectedScopeProductsPreview.length > 4 && (
                                            <span className={styles.productScopePickerMoreBadge}>
                                              +{selectedScopeProductsPreview.length - 4} more
                                            </span>
                                          )}
                                        </div>
                                      </BlockStack>
                                    </div>
                                  )}
                                  <div
                                    className={styles.productScopePickerCard}
                                    id={isShippingTestType ? 'shipping-exclusions-card' : undefined}
                                  >
                                    <BlockStack gap="200">
                                      <InlineStack align="space-between" blockAlign="center" wrap>
                                        <InlineStack gap="200" blockAlign="center">
                                          <span className={styles.productScopePickerIconMuted}>
                                            <Icon source={FilterIcon} />
                                          </span>
                                          <Text as="h4" variant="headingSm">
                                            Excluded products
                                          </Text>
                                        </InlineStack>
                                        <Badge tone="attention">
                                          {`${excludedScopeProductIds.length} excluded`}
                                        </Badge>
                                      </InlineStack>
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        {isShippingTestType
                                          ? isShippingStorewideAdvanced
                                            ? 'Excluded products carve out exceptions from storewide qualification and block checkout application for matching delivery groups.'
                                            : 'Excluded products block shipping assignment and checkout application for any matching delivery group.'
                                          : 'Optional exclusions are always skipped from bucketing and storefront application.'}
                                      </Text>
                                      <InlineStack>
                                        <Button
                                          size="slim"
                                          icon={FilterIcon}
                                          onClick={() => openPriceProductModal('exclude')}
                                          disabled={!canUseStoreProductPicker}
                                        >
                                          {isShippingTestType
                                            ? 'Choose excluded products'
                                            : 'Choose excluded'}
                                        </Button>
                                      </InlineStack>
                                      <div className={styles.productScopePickerSelectionList}>
                                        {excludedScopeProductsPreview.length === 0 ? (
                                          <div className={styles.productScopePickerSelectionEmpty}>
                                            <Icon source={FilterIcon} />
                                            <span>
                                              {isShippingTestType
                                                ? 'No excluded products selected.'
                                                : 'No exclusions selected.'}
                                            </span>
                                          </div>
                                        ) : (
                                          excludedScopeProductsPreview.slice(0, 4).map(product => (
                                            <div
                                              key={product.id}
                                              className={`${styles.priceProductPickerRow} ${styles.priceProductPickerRowSelected}`}
                                            >
                                              <span
                                                className={styles.priceProductPickerThumb}
                                                aria-hidden
                                              >
                                                {product.imageUrl ? (
                                                  <img
                                                    src={product.imageUrl}
                                                    alt=""
                                                    loading="lazy"
                                                  />
                                                ) : (
                                                  <Icon source={ProductIcon} />
                                                )}
                                              </span>
                                              <span className={styles.priceProductPickerRowText}>
                                                <span className={styles.priceProductPickerRowTitle}>
                                                  {product.title}
                                                </span>
                                                {product.handle ? (
                                                  <span
                                                    className={styles.priceProductPickerRowHandle}
                                                  >
                                                    {product.handle}
                                                  </span>
                                                ) : null}
                                              </span>
                                            </div>
                                          ))
                                        )}
                                        {excludedScopeProductsPreview.length > 4 && (
                                          <span className={styles.productScopePickerMoreBadge}>
                                            +{excludedScopeProductsPreview.length - 4} more
                                          </span>
                                        )}
                                      </div>
                                    </BlockStack>
                                  </div>
                                </div>
                                {!canUseStoreProductPicker && (
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Product picker is available when connected to a Shopify store.
                                  </Text>
                                )}
                              </BlockStack>
                            ) : (
                              <>
                                {!isStandalone && (
                                  <div className={styles.placementQuickPresetsStrip}>
                                    <div className={styles.placementQuickPresetsStripHead}>
                                      <span className={styles.placementQuickPresetsStripLabel}>
                                        <Icon source={FilterIcon} />
                                        <span className={styles.placementQuickPresetsStripTitle}>
                                          Combos
                                        </span>
                                      </span>
                                    </div>
                                    <div className={styles.placementQuickPresetsStripChips}>
                                      {[
                                        {
                                          label: 'Product + Mobile',
                                          url: '/products/',
                                          device: 'mobile',
                                          customer: 'all',
                                          tooltip: 'Products + Mobile',
                                        },
                                        {
                                          label: 'Cart + New',
                                          url: '/cart',
                                          device: 'all',
                                          customer: 'new',
                                          tooltip: 'Cart + New visitors',
                                        },
                                        {
                                          label: 'Homepage + All',
                                          url: '^/$|^/index',
                                          device: 'all',
                                          customer: 'all',
                                          tooltip: 'Homepage + All',
                                        },
                                        {
                                          label: 'Reset',
                                          url: '',
                                          device: 'all',
                                          customer: 'all',
                                          tooltip: 'Reset to defaults',
                                        },
                                      ].map(({ label, url, device, customer, tooltip }) => {
                                        const s = formData.segments || {};
                                        const p = s.url_pattern ?? '';
                                        const pr = s.page_rules || [];
                                        const isAllPages =
                                          pr.length === 0 && (!p || p === '' || p === ' ');
                                        const urlMatches =
                                          url === '' ? isAllPages : p === url && pr.length === 0;
                                        const noAdvancedRules =
                                          (s.device_rules || []).length +
                                            (s.audience_rules || []).length ===
                                          0;
                                        const matches =
                                          urlMatches &&
                                          (s.device ?? 'all') === device &&
                                          (s.customer ?? 'all') === customer &&
                                          noAdvancedRules;
                                        return (
                                          <TooltipWrapper
                                            key={label}
                                            content={tooltip}
                                            accessibilityLabel={label}
                                          >
                                            <button
                                              type="button"
                                              className={`${styles.quickPresetChip} ${matches ? styles.quickPresetChipActive : ''}`}
                                              onClick={() => {
                                                setCustomUrlModeActive(false);
                                                const targetFromUrl =
                                                  url === '/products/'
                                                    ? 'all-products'
                                                    : url === '/collections/'
                                                      ? 'all-collections'
                                                      : url === '/cart'
                                                        ? 'cart'
                                                        : url === '/checkout'
                                                          ? 'checkout'
                                                          : url === '^/$|^/index'
                                                            ? 'homepage'
                                                            : null;
                                                setFormData(prev => ({
                                                  ...prev,
                                                  ...(targetFromUrl !== null &&
                                                    targetFromUrl !== undefined && {
                                                      target_type: targetFromUrl,
                                                    }),
                                                  segments: {
                                                    ...prev.segments,
                                                    url_pattern: url === '' ? '' : url,
                                                    page_rules: [],
                                                    device,
                                                    customer,
                                                    device_rules: [],
                                                    audience_rules: [],
                                                  },
                                                }));
                                              }}
                                            >
                                              {label}
                                            </button>
                                          </TooltipWrapper>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                                <div
                                  className={`${styles.panelSection} ${styles.panelSectionPageTargeting}`}
                                >
                                  <span className={styles.panelSectionTitle}>
                                    Where should this test run?
                                    <TooltipWrapper
                                      content="By default the test runs on all pages. Optionally select a scope to limit where it appears (e.g. product pages only)."
                                      accessibilityLabel="Scope help"
                                    >
                                      <span
                                        className={styles.panelSectionInfoIcon}
                                        aria-hidden="true"
                                      >
                                        <Icon source={InfoIcon} />
                                      </span>
                                    </TooltipWrapper>
                                  </span>
                                  <p className={styles.panelSectionHint}>
                                    {!formData.target_type || formData.target_type === ''
                                      ? 'Your test runs on all pages by default. You can click Next without choosing a scope, or select one below to limit where the test runs.'
                                      : 'Scope selected. Click another option to change.'}
                                  </p>
                                  {(!formData.target_type || formData.target_type === '') && (
                                    <div className={styles.scopeSelectPrompt}>
                                      <span className={styles.scopeSelectPromptIcon}>
                                        <Icon source={TargetIcon} />
                                      </span>
                                      <span className={styles.scopeSelectPromptText}>
                                        Choose where to run this test
                                      </span>
                                    </div>
                                  )}
                                  <div className={styles.scopeSelectGrid}>
                                    {[
                                      {
                                        label: 'Homepage',
                                        desc: isStandalone
                                          ? 'Root path (/, /index, /index.html, etc.)'
                                          : 'Landing page only',
                                        scope: 'homepage',
                                        target_type: 'homepage',
                                        url_pattern: isStandalone
                                          ? HOMEPAGE_URL_PATTERN_STANDALONE
                                          : HOMEPAGE_URL_PATTERN_SHOPIFY,
                                        needsId: false,
                                        icon: HomeIcon,
                                        tooltip: isStandalone
                                          ? 'Runs on site root and common index paths (/, /index, /index.html, /index.php, /default.html)'
                                          : 'Homepage',
                                        standalone: true,
                                      },
                                      {
                                        label: 'Cart',
                                        desc: 'Cart page',
                                        scope: 'cart',
                                        target_type: 'cart',
                                        url_pattern: '/cart',
                                        needsId: false,
                                        icon: CartIcon,
                                        tooltip: 'Cart page',
                                        standalone: false,
                                      },
                                      {
                                        label: 'Checkout',
                                        desc: 'Checkout flow',
                                        scope: 'checkout',
                                        target_type: 'checkout',
                                        url_pattern: '/checkout',
                                        needsId: false,
                                        icon: CreditCardIcon,
                                        tooltip: 'Checkout',
                                        standalone: false,
                                      },
                                      {
                                        label: 'All products',
                                        desc: 'Every product page',
                                        scope: 'all-products',
                                        target_type: 'all-products',
                                        url_pattern: '',
                                        needsId: false,
                                        icon: ProductIcon,
                                        tooltip: 'All product pages',
                                        standalone: false,
                                      },
                                      {
                                        label: 'All collections',
                                        desc: 'Every collection page',
                                        scope: 'all-collections',
                                        target_type: 'all-collections',
                                        url_pattern: '/collections/',
                                        needsId: false,
                                        icon: CollectionIcon,
                                        tooltip: 'All collection pages',
                                        standalone: false,
                                      },
                                      {
                                        label: 'Product(s)',
                                        desc: 'Choose from store',
                                        scope: 'product-id',
                                        target_type: 'product',
                                        url_pattern: '',
                                        needsId: true,
                                        icon: ProductIcon,
                                        tooltip: 'Select product(s) from your store',
                                        standalone: false,
                                      },
                                      {
                                        label: 'Collection(s)',
                                        desc: 'Choose from store',
                                        scope: 'collection-id',
                                        target_type: 'collection',
                                        url_pattern: '/collections/',
                                        needsId: true,
                                        icon: CollectionIcon,
                                        tooltip: 'Select collection(s) from your store',
                                        standalone: false,
                                      },
                                      {
                                        label: 'Page(s)',
                                        desc: 'Choose from store',
                                        scope: 'page-id',
                                        target_type: 'page',
                                        url_pattern: '',
                                        needsId: true,
                                        icon: PageIcon,
                                        tooltip: 'Select page(s) from your store',
                                        standalone: false,
                                      },
                                      {
                                        label: 'Custom URL',
                                        desc: 'Regex or path rules',
                                        scope: '__custom__',
                                        target_type: null,
                                        url_pattern: null,
                                        needsId: false,
                                        icon: CodeIcon,
                                        tooltip: 'Custom URL or regex',
                                        standalone: true,
                                      },
                                    ]
                                      .filter(opt => !isStandalone || opt.standalone)
                                      .map(
                                        ({
                                          label,
                                          desc,
                                          scope,
                                          target_type: tt,
                                          url_pattern: up,
                                          needsId,
                                          icon: ChipIcon,
                                          tooltip,
                                        }) => {
                                          const p = formData.segments?.url_pattern ?? '';
                                          const pr = formData.segments?.page_rules || [];
                                          const t = formData.target_type;
                                          const isCustom =
                                            scope === '__custom__' &&
                                            (customUrlModeActive || pr.length > 0);
                                          const isHomepagePattern =
                                            p === HOMEPAGE_URL_PATTERN_SHOPIFY ||
                                            p === HOMEPAGE_URL_PATTERN_STANDALONE;
                                          const active =
                                            scope === '__custom__'
                                              ? isCustom
                                              : t === tt &&
                                                (needsId
                                                  ? true
                                                  : tt === 'homepage'
                                                    ? isHomepagePattern
                                                    : up !== null && up !== undefined && up !== ''
                                                      ? p === up
                                                      : !p && pr.length === 0);
                                          return (
                                            <button
                                              key={scope || 'all'}
                                              type="button"
                                              title={tooltip}
                                              className={`${styles.scopeCard} ${active ? styles.scopeCardActive : ''}`}
                                              onClick={e => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleScopeSelect(scope, tt, up, needsId);
                                              }}
                                              onPointerDown={e => e.stopPropagation()}
                                              aria-pressed={active}
                                              aria-label={label}
                                            >
                                              <span className={styles.scopeCardIcon}>
                                                <Icon source={ChipIcon} />
                                              </span>
                                              <span className={styles.scopeCardLabel}>{label}</span>
                                              {desc && (
                                                <span className={styles.scopeCardDesc}>{desc}</span>
                                              )}
                                            </button>
                                          );
                                        }
                                      )}
                                  </div>
                                  {['product', 'collection', 'page'].includes(
                                    formData.target_type
                                  ) && (
                                    <div
                                      className={styles.panelSection}
                                      style={{ marginTop: '1rem' }}
                                    >
                                      {isStandalone ? (
                                        <TextField
                                          label="Target ID(s)"
                                          value={
                                            Array.isArray(formData.target_ids) &&
                                            formData.target_ids.length > 0
                                              ? formData.target_ids.join('\n')
                                              : formData.target_id || ''
                                          }
                                          onChange={value => {
                                            const raw = value
                                              .split(/[\n,]+/)
                                              .map(s => s.trim())
                                              .filter(Boolean);
                                            const normalize = id => {
                                              if (!id) return '';
                                              if (id.startsWith('gid://')) return id;
                                              const num = id.replace(/\D/g, '');
                                              if (!num) return id;
                                              if (formData.target_type === 'product')
                                                return `gid://shopify/Product/${num}`;
                                              if (formData.target_type === 'collection')
                                                return `gid://shopify/Collection/${num}`;
                                              if (formData.target_type === 'page')
                                                return `gid://shopify/OnlineStorePage/${num}`;
                                              return id;
                                            };
                                            const ids = raw.map(normalize);
                                            if (ids.length > 1) {
                                              setFormData({
                                                ...formData,
                                                target_ids: ids,
                                                target_id: ids[0] || '',
                                              });
                                            } else if (ids.length === 1) {
                                              setFormData({
                                                ...formData,
                                                target_id: ids[0],
                                                target_ids: null,
                                              });
                                            } else {
                                              setFormData({
                                                ...formData,
                                                target_id: '',
                                                target_ids: null,
                                              });
                                            }
                                          }}
                                          multiline={3}
                                          helpText="Enter ID(s). One per line. Standalone mode: no store list available."
                                          autoComplete="off"
                                        />
                                      ) : (
                                        <BlockStack gap="400">
                                          <div className={styles.storeResourceList}>
                                            <div className={styles.storeResourceListHeader}>
                                              <div className={styles.storeResourceListSearch}>
                                                <TextField
                                                  label={`Select ${formData.target_type === 'product' ? 'product(s)' : formData.target_type === 'collection' ? 'collection(s)' : 'page(s)'} from your store`}
                                                  labelHidden
                                                  value={storeResourceSearch}
                                                  onChange={setStoreResourceSearch}
                                                  placeholder={`Search ${formData.target_type === 'product' ? 'products' : formData.target_type === 'collection' ? 'collections' : 'pages'}…`}
                                                  autoComplete="off"
                                                  clearButton
                                                  onClearButtonClick={() =>
                                                    setStoreResourceSearch('')
                                                  }
                                                />
                                              </div>
                                              {(() => {
                                                const selectedIds =
                                                  Array.isArray(formData.target_ids) &&
                                                  formData.target_ids.length > 0
                                                    ? formData.target_ids
                                                    : formData.target_id
                                                      ? [formData.target_id]
                                                      : [];
                                                if (selectedIds.length === 0) return null;
                                                return (
                                                  <span
                                                    className={styles.storeResourceSelectedBadge}
                                                  >
                                                    {selectedIds.length} selected
                                                  </span>
                                                );
                                              })()}
                                            </div>
                                            {storeResourcesLoading ? (
                                              <div className={styles.storeResourceListLoading}>
                                                <div
                                                  className={styles.storeResourceListLoadingIcon}
                                                >
                                                  <Spinner size="small" />
                                                </div>
                                                <Text as="span" variant="bodySm" tone="subdued">
                                                  Loading from your store…
                                                </Text>
                                              </div>
                                            ) : storeResources.length === 0 ? (
                                              <div className={styles.storeResourceListEmpty}>
                                                <div className={styles.storeResourceListEmptyIcon}>
                                                  <Icon
                                                    source={
                                                      formData.target_type === 'product'
                                                        ? ProductIcon
                                                        : formData.target_type === 'collection'
                                                          ? CollectionIcon
                                                          : PageIcon
                                                    }
                                                  />
                                                </div>
                                                <Text as="p" variant="bodySm" tone="subdued">
                                                  {storeResourcesError
                                                    ? storeResourcesError
                                                    : storeResourceSearch
                                                      ? 'No matches. Try a different search.'
                                                      : formData.target_type === 'page'
                                                        ? 'No pages found.'
                                                        : formData.target_type === 'product' ||
                                                            formData.target_type === 'collection'
                                                          ? 'No products or collections found. Use the connection status in the top bar to reconnect the store if needed.'
                                                          : 'No items in your store yet, or the list is still loading.'}
                                                </Text>
                                              </div>
                                            ) : (
                                              (() => {
                                                const selectedIds =
                                                  Array.isArray(formData.target_ids) &&
                                                  formData.target_ids.length > 0
                                                    ? formData.target_ids
                                                    : formData.target_id
                                                      ? [formData.target_id]
                                                      : [];
                                                const resourcesProgressiveWindow =
                                                  buildProgressiveListWindow(
                                                    storeResources,
                                                    storeResourcesVisibleCount,
                                                    { pinnedIds: selectedIds }
                                                  );
                                                const visibleStoreResources =
                                                  resourcesProgressiveWindow.visibleItems;
                                                const shownStoreResourcesCount =
                                                  resourcesProgressiveWindow.shownCount;
                                                const storeResourcesHasHiddenLoaded =
                                                  resourcesProgressiveWindow.hasHiddenLoaded;
                                                const storeResourcesCanFetchMore = Boolean(
                                                  storeResourcesPageInfo?.hasNextPage
                                                );
                                                const storeResourcesCanShowMore =
                                                  storeResourcesHasHiddenLoaded ||
                                                  storeResourcesCanFetchMore;
                                                const storeResourcesCanCollapse =
                                                  resourcesProgressiveWindow.canCollapse;
                                                const resourceIds = new Set(
                                                  storeResources.map(r => r.id)
                                                );
                                                const missingIds = selectedIds.filter(
                                                  id => !resourceIds.has(id)
                                                );
                                                const ResourceIcon =
                                                  formData.target_type === 'product'
                                                    ? ProductIcon
                                                    : formData.target_type === 'collection'
                                                      ? CollectionIcon
                                                      : PageIcon;
                                                const toggleSelection = id => {
                                                  setIsDirty(true);
                                                  const next = selectedIds.includes(id)
                                                    ? selectedIds.filter(x => x !== id)
                                                    : [...selectedIds, id];
                                                  if (next.length > 1) {
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      target_ids: next,
                                                      target_id: next[0] || '',
                                                    }));
                                                  } else if (next.length === 1) {
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      target_id: next[0],
                                                      target_ids: null,
                                                    }));
                                                  } else {
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      target_id: '',
                                                      target_ids: null,
                                                    }));
                                                  }
                                                };
                                                return (
                                                  <>
                                                    <div className={styles.storeResourceListMeta}>
                                                      <Text
                                                        as="span"
                                                        variant="bodySm"
                                                        tone="subdued"
                                                      >
                                                        Showing {shownStoreResourcesCount} of{' '}
                                                        {storeResources.length} loaded
                                                      </Text>
                                                      <InlineStack
                                                        gap="200"
                                                        wrap
                                                        blockAlign="center"
                                                      >
                                                        {storeResourcesCanFetchMore && (
                                                          <Badge tone="info" size="small">
                                                            More available
                                                          </Badge>
                                                        )}
                                                        {storeResourcesCanCollapse && (
                                                          <Button
                                                            size="slim"
                                                            variant="plain"
                                                            onClick={() =>
                                                              setStoreResourcesVisibleCount(
                                                                PRICE_PRODUCT_MODAL_REVEAL_BATCH
                                                              )
                                                            }
                                                          >
                                                            Collapse
                                                          </Button>
                                                        )}
                                                      </InlineStack>
                                                    </div>
                                                    <div className={styles.storeResourceListScroll}>
                                                      {visibleStoreResources.map(r => (
                                                        <button
                                                          key={r.id}
                                                          type="button"
                                                          className={`${styles.storeResourceItem} ${selectedIds.includes(r.id) ? styles.storeResourceItemSelected : ''}`}
                                                          onClick={() => toggleSelection(r.id)}
                                                        >
                                                          <span
                                                            className={styles.storeResourceItemIcon}
                                                            aria-hidden
                                                          >
                                                            <Icon source={ResourceIcon} />
                                                          </span>
                                                          <span
                                                            className={
                                                              styles.storeResourceItemContent
                                                            }
                                                          >
                                                            <span
                                                              className={
                                                                styles.storeResourceItemTitle
                                                              }
                                                            >
                                                              {r.title}
                                                            </span>
                                                            {r.handle && (
                                                              <span
                                                                className={
                                                                  styles.storeResourceItemHandle
                                                                }
                                                              >
                                                                /{r.handle}
                                                              </span>
                                                            )}
                                                          </span>
                                                          <span
                                                            className={
                                                              styles.storeResourceItemCheck
                                                            }
                                                            onClick={e => e.stopPropagation()}
                                                          >
                                                            <Checkbox
                                                              label=""
                                                              labelHidden
                                                              checked={selectedIds.includes(r.id)}
                                                              onChange={() => toggleSelection(r.id)}
                                                              id={`store-resource-${String(r.id).replace(/[^a-zA-Z0-9-]/g, '_')}`}
                                                            />
                                                          </span>
                                                        </button>
                                                      ))}
                                                      {missingIds.map(id => (
                                                        <button
                                                          key={id}
                                                          type="button"
                                                          className={`${styles.storeResourceItem} ${styles.storeResourceItemSelected}`}
                                                          onClick={() => toggleSelection(id)}
                                                        >
                                                          <span
                                                            className={styles.storeResourceItemIcon}
                                                            aria-hidden
                                                          >
                                                            <Icon source={ResourceIcon} />
                                                          </span>
                                                          <span
                                                            className={
                                                              styles.storeResourceItemContent
                                                            }
                                                          >
                                                            <span
                                                              className={
                                                                styles.storeResourceItemTitle
                                                              }
                                                            >
                                                              {id.replace(/.*\//, '')} (saved)
                                                            </span>
                                                            <span
                                                              className={
                                                                styles.storeResourceItemHandle
                                                              }
                                                            >
                                                              Previously selected
                                                            </span>
                                                          </span>
                                                          <span
                                                            className={
                                                              styles.storeResourceItemCheck
                                                            }
                                                            onClick={e => e.stopPropagation()}
                                                          >
                                                            <Checkbox
                                                              label=""
                                                              labelHidden
                                                              checked
                                                              onChange={() => toggleSelection(id)}
                                                              id={`store-resource-saved-${String(id).replace(/[^a-zA-Z0-9-]/g, '_')}`}
                                                            />
                                                          </span>
                                                        </button>
                                                      ))}
                                                    </div>
                                                    {storeResourcesCanShowMore && (
                                                      <div
                                                        className={styles.storeResourceListFooter}
                                                      >
                                                        <Button
                                                          size="slim"
                                                          onClick={handleLoadMoreStoreResources}
                                                          loading={storeResourcesLoadingMore}
                                                          disabled={storeResourcesLoadingMore}
                                                        >
                                                          {storeResourcesHasHiddenLoaded
                                                            ? `Show ${Math.min(
                                                                resourcesProgressiveWindow.nextRevealCount ||
                                                                  PRICE_PRODUCT_MODAL_REVEAL_BATCH,
                                                                storeResources.length -
                                                                  shownStoreResourcesCount
                                                              )} more`
                                                            : `Show ${PRICE_PRODUCT_MODAL_REVEAL_BATCH} more`}
                                                        </Button>
                                                      </div>
                                                    )}
                                                  </>
                                                );
                                              })()
                                            )}
                                          </div>
                                          {!normalizeTargetIdValue(formData.target_id) &&
                                            (!formData.target_ids ||
                                              formData.target_ids.length === 0) &&
                                            !normalizeTargetIdValue(initialData?.target_id) &&
                                            (!Array.isArray(initialData?.target_ids) ||
                                              initialData.target_ids.length === 0) && (
                                              <Text as="p" variant="bodySm" tone="critical">
                                                Select at least one{' '}
                                                {formData.target_type === 'product'
                                                  ? 'product'
                                                  : formData.target_type === 'collection'
                                                    ? 'collection'
                                                    : 'page'}{' '}
                                                to target.
                                              </Text>
                                            )}
                                        </BlockStack>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {customUrlModeActive &&
                                  (() => {
                                    return (
                                      <div
                                        className={`${styles.panelSection} ${styles.panelSectionFull} ${styles.panelSectionCustomUrl}`}
                                      >
                                        <div className={styles.customUrlHeader}>
                                          <span className={styles.customUrlHeaderIcon}>
                                            <Icon source={CodeIcon} />
                                          </span>
                                          <div>
                                            <span className={styles.panelSectionTitle}>
                                              Custom URL rules
                                              <TooltipWrapper
                                                content={
                                                  isStandalone
                                                    ? 'Rules match the page path (e.g. /blog), not the full URL. Use paths starting with / for reliable targeting. Include = show on matching pages; Exclude = hide on matching pages.'
                                                    : 'Include = show test on matching pages. Exclude = hide on matching pages. Multiple includes = ANY match. Multiple excludes = hide if ANY match.'
                                                }
                                                accessibilityLabel="Custom URL help"
                                              >
                                                <span
                                                  className={styles.panelSectionInfoIcon}
                                                  aria-hidden="true"
                                                >
                                                  <Icon source={InfoIcon} />
                                                </span>
                                              </TooltipWrapper>
                                            </span>
                                            <p className={styles.panelSectionHint}>
                                              {isStandalone
                                                ? 'Define where your test runs using page paths (e.g. /blog, /pricing). Rules match the path only, not query or hash.'
                                                : 'Define where your test runs using URL patterns. Include rules target pages; exclude rules hide them.'}
                                            </p>
                                          </div>
                                        </div>
                                        <div className={styles.customUrlLogicCallout}>
                                          <span className={styles.customUrlLogicLabel}>
                                            How it works
                                          </span>
                                          <span className={styles.customUrlLogicText}>
                                            {isStandalone
                                              ? 'Include: show test when page path matches any include rule. Exclude: hide when path matches any exclude rule. Path = part after domain (e.g. /blog).'
                                              : 'Include: show test when URL matches any include rule. Exclude: hide test when URL matches any exclude rule.'}
                                          </span>
                                        </div>
                                        {(formData.segments?.page_rules || []).length === 0 ? (
                                          <div className={styles.customUrlEmptyState}>
                                            <p className={styles.customUrlEmptyTitle}>
                                              No URL rules yet
                                            </p>
                                            <p className={styles.customUrlEmptyDesc}>
                                              {isStandalone
                                                ? 'Add rules using page paths (e.g. /blog, /pricing) or regex. Click Add rule below and enter your path or pattern.'
                                                : 'Add rules to target or exclude specific pages. Or use quick-add examples below.'}
                                            </p>
                                            <div className={styles.customUrlQuickAdd}>
                                              {!isStandalone &&
                                                [
                                                  {
                                                    label: 'Product pages',
                                                    pattern: '/products/',
                                                    match_type: 'starts_with',
                                                    type: 'include',
                                                  },
                                                  {
                                                    label: 'Sale collection',
                                                    pattern: '/collections/sale',
                                                    match_type: 'contains',
                                                    type: 'include',
                                                  },
                                                  {
                                                    label: 'Exclude checkout',
                                                    pattern: '/checkout',
                                                    match_type: 'starts_with',
                                                    type: 'exclude',
                                                  },
                                                ].map(q => (
                                                  <button
                                                    key={q.label}
                                                    type="button"
                                                    className={styles.customUrlQuickAddChip}
                                                    onClick={() => {
                                                      setIsDirty(true);
                                                      setFormData(prev => ({
                                                        ...prev,
                                                        segments: {
                                                          ...prev.segments,
                                                          page_rules: [
                                                            ...(prev.segments?.page_rules || []),
                                                            {
                                                              type: q.type,
                                                              pattern: q.pattern,
                                                              match_type: q.match_type,
                                                            },
                                                          ],
                                                        },
                                                      }));
                                                    }}
                                                  >
                                                    {q.label}
                                                  </button>
                                                ))}
                                              {isStandalone && (
                                                <p className={styles.customUrlEmptyDesc}>
                                                  Use &quot;Add rule&quot; below to define path or
                                                  regex rules. No fixed presets — enter any path
                                                  (e.g. /blog, /pricing) or regex.
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        ) : null}
                                        {(formData.segments?.page_rules || []).length > 0 ? (
                                          <div className={styles.customUrlRulesList}>
                                            <span className={styles.customUrlRulesLabel}>
                                              {(formData.segments?.page_rules || []).length} rule
                                              {(formData.segments?.page_rules || []).length !== 1
                                                ? 's'
                                                : ''}
                                            </span>
                                          </div>
                                        ) : null}
                                        {(formData.segments?.page_rules || []).map((rule, idx) => {
                                          const presets = !isStandalone
                                            ? [
                                                '/products/',
                                                '/collections/',
                                                '/cart',
                                                HOMEPAGE_URL_PATTERN_SHOPIFY,
                                                HOMEPAGE_URL_PATTERN_STANDALONE,
                                                '',
                                              ]
                                            : [];
                                          const matchTypeOptions = isStandalone
                                            ? [
                                                { label: 'Path contains', value: 'contains' },
                                                { label: 'Path starts with', value: 'starts_with' },
                                                { label: 'Path ends with', value: 'ends_with' },
                                                { label: 'Path equals', value: 'equals' },
                                                { label: 'Regex', value: 'regex' },
                                              ]
                                            : [
                                                { label: 'Contains', value: 'contains' },
                                                { label: 'Starts with', value: 'starts_with' },
                                                { label: 'Ends with', value: 'ends_with' },
                                                { label: 'Equals', value: 'equals' },
                                                { label: 'Regex', value: 'regex' },
                                              ];
                                          const presetMatchTypes = !isStandalone
                                            ? {
                                                '': 'regex',
                                                '/products/': 'starts_with',
                                                '/collections/': 'starts_with',
                                                '/cart': 'equals',
                                                [HOMEPAGE_URL_PATTERN_SHOPIFY]: 'regex',
                                                [HOMEPAGE_URL_PATTERN_STANDALONE]: 'regex',
                                              }
                                            : {};
                                          return (
                                            <div key={idx} className={styles.customRuleRow}>
                                              <span className={styles.customRuleNumber} aria-hidden>
                                                {idx + 1}
                                              </span>
                                              <div className={styles.ruleTypeToggle}>
                                                <button
                                                  type="button"
                                                  className={`${styles.ruleTypeBadge} ${(rule.type || 'include') === 'include' ? styles.ruleTypeBadgeInclude : styles.ruleTypeBadgeInactive}`}
                                                  onClick={() => {
                                                    setIsDirty(true);
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      segments: {
                                                        ...prev.segments,
                                                        page_rules: [
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(0, idx),
                                                          { ...rule, type: 'include' },
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(idx + 1),
                                                        ],
                                                      },
                                                    }));
                                                  }}
                                                >
                                                  Include
                                                </button>
                                                <button
                                                  type="button"
                                                  className={`${styles.ruleTypeBadge} ${(rule.type || 'include') === 'exclude' ? styles.ruleTypeBadgeExclude : styles.ruleTypeBadgeInactive}`}
                                                  onClick={() => {
                                                    setIsDirty(true);
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      segments: {
                                                        ...prev.segments,
                                                        page_rules: [
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(0, idx),
                                                          { ...rule, type: 'exclude' },
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(idx + 1),
                                                        ],
                                                      },
                                                    }));
                                                  }}
                                                >
                                                  Exclude
                                                </button>
                                              </div>
                                              {!isStandalone && (
                                                <Select
                                                  label=""
                                                  labelHidden
                                                  options={[
                                                    { label: 'All pages', value: '' },
                                                    { label: 'Product pages', value: '/products/' },
                                                    {
                                                      label: 'Collection pages',
                                                      value: '/collections/',
                                                    },
                                                    { label: 'Cart', value: '/cart' },
                                                    {
                                                      label: 'Homepage',
                                                      value: HOMEPAGE_URL_PATTERN_SHOPIFY,
                                                    },
                                                    { label: 'Custom URL…', value: '__custom__' },
                                                  ]}
                                                  value={
                                                    presets.includes(rule.pattern || '')
                                                      ? rule.pattern || ''
                                                      : rule.pattern === ' ' || rule.pattern
                                                        ? '__custom__'
                                                        : ''
                                                  }
                                                  onChange={v => {
                                                    setIsDirty(true);
                                                    const newPattern =
                                                      v === '__custom__'
                                                        ? presets.includes(rule.pattern || '') ||
                                                          rule.pattern === ' '
                                                          ? ' '
                                                          : rule.pattern || ' '
                                                        : v;
                                                    const newMatchType =
                                                      v === '__custom__'
                                                        ? rule.match_type || 'contains'
                                                        : presetMatchTypes[v] || 'regex';
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      segments: {
                                                        ...prev.segments,
                                                        page_rules: [
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(0, idx),
                                                          {
                                                            ...rule,
                                                            pattern: newPattern,
                                                            match_type: newMatchType,
                                                          },
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(idx + 1),
                                                        ],
                                                      },
                                                    }));
                                                  }}
                                                />
                                              )}
                                              <div className={styles.matchTypeSelect}>
                                                <Select
                                                  label=""
                                                  labelHidden
                                                  options={matchTypeOptions}
                                                  value={
                                                    rule.match_type ||
                                                    (isStandalone
                                                      ? 'starts_with'
                                                      : presets.includes(rule.pattern || '')
                                                        ? presetMatchTypes[rule.pattern]
                                                        : 'contains')
                                                  }
                                                  onChange={v => {
                                                    setIsDirty(true);
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      segments: {
                                                        ...prev.segments,
                                                        page_rules: [
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(0, idx),
                                                          { ...rule, match_type: v },
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(idx + 1),
                                                        ],
                                                      },
                                                    }));
                                                  }}
                                                />
                                              </div>
                                              <div className={styles.customUrlInputWrap}>
                                                <TextField
                                                  label={
                                                    isStandalone ? 'Path or regex' : 'URL pattern'
                                                  }
                                                  labelHidden
                                                  value={
                                                    rule.pattern === ' ' ? '' : rule.pattern || ''
                                                  }
                                                  onChange={v => {
                                                    setIsDirty(true);
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      segments: {
                                                        ...prev.segments,
                                                        page_rules: [
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(0, idx),
                                                          { ...rule, pattern: v === '' ? ' ' : v },
                                                          ...(
                                                            prev.segments?.page_rules || []
                                                          ).slice(idx + 1),
                                                        ],
                                                      },
                                                    }));
                                                  }}
                                                  placeholder={
                                                    isStandalone
                                                      ? (rule.match_type || 'starts_with') ===
                                                        'regex'
                                                        ? 'e.g. ^/blog, ^/en/.*'
                                                        : 'e.g. /blog, /pricing, /docs'
                                                      : (rule.match_type || 'contains') === 'regex'
                                                        ? 'e.g. ^/products/.* or /collections/sale'
                                                        : (rule.match_type || 'contains') ===
                                                            'contains'
                                                          ? 'e.g. /products/ or sale'
                                                          : (rule.match_type || 'contains') ===
                                                              'starts_with'
                                                            ? 'e.g. /products/ or /collections/'
                                                            : (rule.match_type || 'contains') ===
                                                                'ends_with'
                                                              ? 'e.g. .html or /checkout'
                                                              : 'e.g. /cart or /pages/about'
                                                  }
                                                  autoComplete="off"
                                                  helpText={
                                                    (rule.match_type || 'starts_with') ===
                                                      'regex' && isStandalone
                                                      ? 'JavaScript regex. Path-based patterns (e.g. starting with /) match the page path only.'
                                                      : (rule.match_type || 'contains') ===
                                                            'regex' && !isStandalone
                                                        ? 'JavaScript regex. Use ^ for start, $ for end.'
                                                        : null
                                                  }
                                                />
                                              </div>
                                              <button
                                                type="button"
                                                className={styles.removeRuleBtn}
                                                onClick={() => {
                                                  setIsDirty(true);
                                                  setFormData(prev => ({
                                                    ...prev,
                                                    segments: {
                                                      ...prev.segments,
                                                      page_rules: (
                                                        prev.segments?.page_rules || []
                                                      ).filter((_, i) => i !== idx),
                                                    },
                                                  }));
                                                }}
                                              >
                                                Remove
                                              </button>
                                            </div>
                                          );
                                        })}
                                        <button
                                          type="button"
                                          className={styles.addRuleBtn}
                                          onClick={() => {
                                            setIsDirty(true);
                                            setFormData(prev => ({
                                              ...prev,
                                              segments: {
                                                ...prev.segments,
                                                page_rules: [
                                                  ...(prev.segments?.page_rules || []),
                                                  {
                                                    type: 'include',
                                                    pattern: ' ',
                                                    match_type: isStandalone
                                                      ? 'starts_with'
                                                      : 'contains',
                                                  },
                                                ],
                                              },
                                            }));
                                          }}
                                        >
                                          <Icon source={PlusIcon} />
                                          Add rule
                                        </button>
                                      </div>
                                    );
                                  })()}
                              </>
                            )}
                          </div>,
                        ]
                      : null}

                    {placementSection === 'device' && !isStandalone && (
                      <div className={styles.placementPanel}>
                        <div className={`${styles.panelSection} ${styles.panelSectionDevice}`}>
                          <span className={styles.panelSectionTitle}>
                            Device
                            <TooltipWrapper
                              content="Desktop or mobile"
                              accessibilityLabel="Device targeting help"
                            >
                              <span className={styles.panelSectionInfoIcon} aria-hidden="true">
                                <Icon source={InfoIcon} />
                              </span>
                            </TooltipWrapper>
                          </span>
                          <p className={styles.panelSectionHint}>Target by device type.</p>
                          <div className={styles.quickSelectChips}>
                            {[
                              {
                                label: 'All devices',
                                value: 'all',
                                icon: UnknownDeviceIcon,
                                tooltip: 'All devices',
                              },
                              {
                                label: 'Desktop',
                                value: 'desktop',
                                icon: DesktopIcon,
                                tooltip: 'Desktop only',
                              },
                              {
                                label: 'Mobile',
                                value: 'mobile',
                                icon: MobileIcon,
                                tooltip: 'Mobile only',
                              },
                            ].map(({ label, value, icon: DeviceIcon, tooltip }) => (
                              <TooltipWrapper
                                key={value}
                                content={tooltip}
                                accessibilityLabel={label}
                              >
                                <button
                                  type="button"
                                  className={`${styles.quickSelectChip} ${(formData.segments?.device || 'all') === value ? styles.quickSelectChipActive : ''}`}
                                  onClick={() =>
                                    setFormData(prev => ({
                                      ...prev,
                                      segments: {
                                        ...prev.segments,
                                        device: value,
                                        device_rules: [],
                                      },
                                    }))
                                  }
                                >
                                  <Icon source={DeviceIcon} />
                                  {label}
                                </button>
                              </TooltipWrapper>
                            ))}
                          </div>
                          <div className={styles.inlineAdvancedToggle}>
                            <button
                              type="button"
                              className={styles.inlineAdvancedToggleBtn}
                              onClick={() => setDeviceAdvancedOpen(prev => !prev)}
                              aria-expanded={deviceAdvancedOpen}
                            >
                              <span
                                className={`${styles.inlineAdvancedChevron} ${deviceAdvancedOpen ? styles.inlineAdvancedChevronOpen : ''}`}
                              >
                                <Icon source={ChevronDownIcon} />
                              </span>
                              Advanced device rules
                              {(formData.segments?.device_rules || []).length > 0 && (
                                <span className={styles.inlineAdvancedCount}>
                                  {(formData.segments?.device_rules || []).length}
                                </span>
                              )}
                            </button>
                            {deviceAdvancedOpen && (
                              <div className={styles.inlineAdvancedBody}>
                                <p className={styles.inlineAdvancedHint}>
                                  Include or exclude desktop/mobile. Overrides simple Device above.
                                </p>
                                {(formData.segments?.device_rules || []).length === 0 && (
                                  <div className={styles.advancedEmptyState}>
                                    <p>No device rules. Add rules for include/exclude by device.</p>
                                  </div>
                                )}
                                {(formData.segments?.device_rules || []).map((rule, idx) => (
                                  <div key={idx} className={styles.customRuleRow}>
                                    <div className={styles.ruleTypeToggle}>
                                      <button
                                        type="button"
                                        className={`${styles.ruleTypeBadge} ${(rule.type || 'include') === 'include' ? styles.ruleTypeBadgeInclude : styles.ruleTypeBadgeInactive}`}
                                        onClick={() =>
                                          setFormData(prev => ({
                                            ...prev,
                                            segments: {
                                              ...prev.segments,
                                              device_rules: [
                                                ...(prev.segments?.device_rules || []).slice(
                                                  0,
                                                  idx
                                                ),
                                                { ...rule, type: 'include' },
                                                ...(prev.segments?.device_rules || []).slice(
                                                  idx + 1
                                                ),
                                              ],
                                            },
                                          }))
                                        }
                                      >
                                        Include
                                      </button>
                                      <button
                                        type="button"
                                        className={`${styles.ruleTypeBadge} ${(rule.type || 'include') === 'exclude' ? styles.ruleTypeBadgeExclude : styles.ruleTypeBadgeInactive}`}
                                        onClick={() =>
                                          setFormData(prev => ({
                                            ...prev,
                                            segments: {
                                              ...prev.segments,
                                              device_rules: [
                                                ...(prev.segments?.device_rules || []).slice(
                                                  0,
                                                  idx
                                                ),
                                                { ...rule, type: 'exclude' },
                                                ...(prev.segments?.device_rules || []).slice(
                                                  idx + 1
                                                ),
                                              ],
                                            },
                                          }))
                                        }
                                      >
                                        Exclude
                                      </button>
                                    </div>
                                    <Select
                                      label=""
                                      labelHidden
                                      options={[
                                        { label: 'Desktop', value: 'desktop' },
                                        { label: 'Mobile', value: 'mobile' },
                                      ]}
                                      value={rule.value || 'desktop'}
                                      onChange={v =>
                                        setFormData(prev => ({
                                          ...prev,
                                          segments: {
                                            ...prev.segments,
                                            device_rules: [
                                              ...(prev.segments?.device_rules || []).slice(0, idx),
                                              { ...rule, value: v },
                                              ...(prev.segments?.device_rules || []).slice(idx + 1),
                                            ],
                                          },
                                        }))
                                      }
                                    />
                                    <button
                                      type="button"
                                      className={styles.removeRuleBtn}
                                      onClick={() =>
                                        setFormData(prev => ({
                                          ...prev,
                                          segments: {
                                            ...prev.segments,
                                            device_rules: (
                                              prev.segments?.device_rules || []
                                            ).filter((_, i) => i !== idx),
                                          },
                                        }))
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className={styles.addRuleBtn}
                                  onClick={() =>
                                    setFormData(prev => ({
                                      ...prev,
                                      segments: {
                                        ...prev.segments,
                                        device_rules: [
                                          ...(prev.segments?.device_rules || []),
                                          { type: 'include', value: 'desktop' },
                                        ],
                                      },
                                    }))
                                  }
                                >
                                  <Icon source={PlusIcon} /> Add device rule
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {placementSection === 'audience' && !isStandalone && (
                      <div className={styles.placementPanel}>
                        <div className={`${styles.panelSection} ${styles.panelSectionAudience}`}>
                          <span className={styles.panelSectionTitle}>
                            Customer type
                            <TooltipWrapper
                              content="New vs returning visitors"
                              accessibilityLabel="Customer type help"
                            >
                              <span className={styles.panelSectionInfoIcon} aria-hidden="true">
                                <Icon source={InfoIcon} />
                              </span>
                            </TooltipWrapper>
                          </span>
                          <p className={styles.panelSectionHint}>New vs returning visitors.</p>
                          <div className={styles.quickSelectChips}>
                            {[
                              { label: 'All', value: 'all', icon: PersonIcon, tooltip: 'All' },
                              {
                                label: 'New',
                                value: 'new',
                                icon: PersonIcon,
                                tooltip: 'First visit',
                              },
                              {
                                label: 'Returning',
                                value: 'returning',
                                icon: PersonIcon,
                                tooltip: 'Returning',
                              },
                            ].map(({ label, value, icon: CustIcon, tooltip }) => (
                              <TooltipWrapper
                                key={value}
                                content={tooltip}
                                accessibilityLabel={label}
                              >
                                <button
                                  type="button"
                                  className={`${styles.quickSelectChip} ${(formData.segments?.customer || 'all') === value ? styles.quickSelectChipActive : ''}`}
                                  onClick={() =>
                                    setFormData(prev => ({
                                      ...prev,
                                      segments: {
                                        ...prev.segments,
                                        customer: value,
                                        audience_rules: [],
                                      },
                                    }))
                                  }
                                >
                                  <Icon source={CustIcon} />
                                  {label}
                                </button>
                              </TooltipWrapper>
                            ))}
                          </div>
                        </div>
                        <div className={`${styles.panelSection} ${styles.panelSectionFull}`}>
                          <span className={styles.panelSectionTitle}>
                            Countries (optional)
                            <TooltipWrapper
                              content="US, CA, GB. Empty = all"
                              accessibilityLabel="Countries help"
                            >
                              <span className={styles.panelSectionInfoIcon} aria-hidden="true">
                                <Icon source={InfoIcon} />
                              </span>
                            </TooltipWrapper>
                          </span>
                          <p className={styles.panelSectionHint}>
                            Limit to specific countries. Leave empty for all.
                          </p>
                          <div className={styles.countriesBlock}>
                            <TextField
                              label=""
                              labelHidden
                              value={countriesValue}
                              onChange={value =>
                                setFormData(prev => ({
                                  ...prev,
                                  segments: {
                                    ...prev.segments,
                                    countries: value
                                      .split(',')
                                      .map(e => e.trim())
                                      .filter(Boolean),
                                  },
                                }))
                              }
                              placeholder="US, CA, GB — leave empty for all"
                              autoComplete="off"
                            />
                            {(formData.segments?.countries || []).length > 0 && (
                              <span className={styles.countriesCount}>
                                {(formData.segments?.countries || []).length} countr
                                {(formData.segments?.countries || []).length === 1
                                  ? 'y'
                                  : 'ies'}{' '}
                                selected
                              </span>
                            )}
                          </div>
                          <div className={styles.inlineAdvancedToggle}>
                            <button
                              type="button"
                              className={styles.inlineAdvancedToggleBtn}
                              onClick={() => setAudienceAdvancedOpen(prev => !prev)}
                              aria-expanded={audienceAdvancedOpen}
                            >
                              <span
                                className={`${styles.inlineAdvancedChevron} ${audienceAdvancedOpen ? styles.inlineAdvancedChevronOpen : ''}`}
                              >
                                <Icon source={ChevronDownIcon} />
                              </span>
                              Advanced audience rules
                              {(formData.segments?.audience_rules || []).length > 0 && (
                                <span className={styles.inlineAdvancedCount}>
                                  {(formData.segments?.audience_rules || []).length}
                                </span>
                              )}
                            </button>
                            {audienceAdvancedOpen && (
                              <div className={styles.inlineAdvancedBody}>
                                <p className={styles.inlineAdvancedHint}>
                                  Include or exclude by customer type or country. Overrides simple
                                  Customer/Countries above.
                                </p>
                                {(formData.segments?.audience_rules || []).length === 0 && (
                                  <div className={styles.advancedEmptyState}>
                                    <p>
                                      No audience rules. Add rules for include/exclude by customer
                                      or country.
                                    </p>
                                  </div>
                                )}
                                {(formData.segments?.audience_rules || []).map((rule, idx) => (
                                  <div key={idx} className={styles.customRuleRow}>
                                    <div className={styles.ruleTypeToggle}>
                                      <button
                                        type="button"
                                        className={`${styles.ruleTypeBadge} ${(rule.type || 'include') === 'include' ? styles.ruleTypeBadgeInclude : styles.ruleTypeBadgeInactive}`}
                                        onClick={() =>
                                          setFormData(prev => ({
                                            ...prev,
                                            segments: {
                                              ...prev.segments,
                                              audience_rules: [
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  0,
                                                  idx
                                                ),
                                                { ...rule, type: 'include' },
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  idx + 1
                                                ),
                                              ],
                                            },
                                          }))
                                        }
                                      >
                                        Include
                                      </button>
                                      <button
                                        type="button"
                                        className={`${styles.ruleTypeBadge} ${(rule.type || 'include') === 'exclude' ? styles.ruleTypeBadgeExclude : styles.ruleTypeBadgeInactive}`}
                                        onClick={() =>
                                          setFormData(prev => ({
                                            ...prev,
                                            segments: {
                                              ...prev.segments,
                                              audience_rules: [
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  0,
                                                  idx
                                                ),
                                                { ...rule, type: 'exclude' },
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  idx + 1
                                                ),
                                              ],
                                            },
                                          }))
                                        }
                                      >
                                        Exclude
                                      </button>
                                    </div>
                                    <Select
                                      label=""
                                      labelHidden
                                      options={[
                                        { label: 'Customer type', value: 'customer' },
                                        { label: 'Country', value: 'country' },
                                      ]}
                                      value={rule.field || 'customer'}
                                      onChange={v =>
                                        setFormData(prev => ({
                                          ...prev,
                                          segments: {
                                            ...prev.segments,
                                            audience_rules: [
                                              ...(prev.segments?.audience_rules || []).slice(
                                                0,
                                                idx
                                              ),
                                              {
                                                ...rule,
                                                field: v,
                                                value: v === 'customer' ? 'new' : ['US'],
                                              },
                                              ...(prev.segments?.audience_rules || []).slice(
                                                idx + 1
                                              ),
                                            ],
                                          },
                                        }))
                                      }
                                    />
                                    {rule.field === 'customer' ? (
                                      <Select
                                        label=""
                                        labelHidden
                                        options={[
                                          { label: 'New', value: 'new' },
                                          { label: 'Returning', value: 'returning' },
                                        ]}
                                        value={rule.value || 'new'}
                                        onChange={v =>
                                          setFormData(prev => ({
                                            ...prev,
                                            segments: {
                                              ...prev.segments,
                                              audience_rules: [
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  0,
                                                  idx
                                                ),
                                                { ...rule, value: v },
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  idx + 1
                                                ),
                                              ],
                                            },
                                          }))
                                        }
                                      />
                                    ) : (
                                      <TextField
                                        label=""
                                        labelHidden
                                        value={
                                          Array.isArray(rule.value)
                                            ? rule.value.join(', ')
                                            : rule.value || ''
                                        }
                                        onChange={v =>
                                          setFormData(prev => ({
                                            ...prev,
                                            segments: {
                                              ...prev.segments,
                                              audience_rules: [
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  0,
                                                  idx
                                                ),
                                                {
                                                  ...rule,
                                                  value: v
                                                    .split(',')
                                                    .map(s => s.trim())
                                                    .filter(Boolean),
                                                },
                                                ...(prev.segments?.audience_rules || []).slice(
                                                  idx + 1
                                                ),
                                              ],
                                            },
                                          }))
                                        }
                                        placeholder="US, CA, GB"
                                        autoComplete="off"
                                      />
                                    )}
                                    <button
                                      type="button"
                                      className={styles.removeRuleBtn}
                                      onClick={() =>
                                        setFormData(prev => ({
                                          ...prev,
                                          segments: {
                                            ...prev.segments,
                                            audience_rules: (
                                              prev.segments?.audience_rules || []
                                            ).filter((_, i) => i !== idx),
                                          },
                                        }))
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className={styles.addRuleBtn}
                                  onClick={() =>
                                    setFormData(prev => ({
                                      ...prev,
                                      segments: {
                                        ...prev.segments,
                                        audience_rules: [
                                          ...(prev.segments?.audience_rules || []),
                                          { type: 'include', field: 'customer', value: 'new' },
                                        ],
                                      },
                                    }))
                                  }
                                >
                                  <Icon source={PlusIcon} /> Add audience rule
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {placementSection === 'holdout' && (
                      <div id="targeting-holdout">
                        <div
                          key="holdout"
                          id="targeting-panel-holdout"
                          className={`${styles.targetingPanel} ${styles.targetingPanelHoldout}`}
                          role="tabpanel"
                          aria-labelledby="targeting-tab-holdout"
                        >
                          <div className={styles.targetingPanelHeader}>
                            <span className={styles.targetingPanelStep}>
                              Step {holdoutStepNumber} of {advancedStepNumber}
                            </span>
                            <h4 className={styles.targetingPanelTitle}>Holdout (control group)</h4>
                            <p className={styles.targetingPanelHint}>
                              Reserve a percentage of visitors who never see any variant for a true
                              control. Use <kbd className={styles.panelKbd}>1</kbd>–
                              <kbd className={styles.panelKbd}>{advancedStepNumber}</kbd> or arrow
                              keys to switch sections.
                            </p>
                            {(Number(holdoutValue) || 0) > 0 && (
                              <span className={styles.holdoutBadge}>
                                <Icon source={LockIcon} />
                                Control group: {holdoutValue}% reserved
                              </span>
                            )}
                          </div>
                          <div className={styles.targetingPanelBody}>
                            <div className={styles.holdoutInstruction}>
                              <Icon source={LockIcon} />
                              <span>
                                Choose what percentage of traffic stays in the control group (no
                                variant). 10% is recommended for most tests.
                              </span>
                            </div>
                            <div className={styles.holdoutCard}>
                              <div className={styles.holdoutCardHeader}>
                                <label className={styles.holdoutSliderLabel}>
                                  Control group size
                                  <TooltipWrapper
                                    content="Visitors in the control group never see any test variant. 10% gives a solid baseline."
                                    accessibilityLabel="Holdout percentage help"
                                  >
                                    <span
                                      className={styles.panelSectionInfoIcon}
                                      aria-hidden="true"
                                    >
                                      <Icon source={InfoIcon} />
                                    </span>
                                  </TooltipWrapper>
                                </label>
                                <div className={styles.holdoutQuickPresets}>
                                  {[
                                    { pct: 0, label: '0%', tooltip: 'No holdout' },
                                    {
                                      pct: 10,
                                      label: '10%',
                                      recommended: true,
                                      tooltip: 'Recommended',
                                    },
                                    { pct: 25, label: '25%', tooltip: 'Larger control' },
                                    { pct: 50, label: '50%', tooltip: 'Max holdout' },
                                  ].map(({ pct, label, recommended, tooltip }) => (
                                    <TooltipWrapper
                                      key={pct}
                                      content={tooltip}
                                      accessibilityLabel={`Holdout ${label}`}
                                    >
                                      <button
                                        type="button"
                                        className={`${styles.holdoutPresetBtn} ${Number(holdoutValue) === pct ? styles.holdoutPresetBtnActive : ''}`}
                                        onClick={() =>
                                          setFormData(prev => ({ ...prev, holdout_percent: pct }))
                                        }
                                      >
                                        {label}
                                        {recommended && (
                                          <span className={styles.holdoutPresetRecommended}>
                                            Best
                                          </span>
                                        )}
                                      </button>
                                    </TooltipWrapper>
                                  ))}
                                </div>
                              </div>
                              <div className={styles.holdoutCardBody}>
                                <div className={styles.holdoutValueInput}>
                                  <input
                                    type="number"
                                    className={styles.holdoutNumberInput}
                                    min={0}
                                    max={50}
                                    value={holdoutValue ?? ''}
                                    onChange={e =>
                                      setFormData(prev => ({
                                        ...prev,
                                        holdout_percent: e.target.value,
                                      }))
                                    }
                                    aria-label="Holdout percentage"
                                  />
                                  <span className={styles.holdoutPercentSuffix}>%</span>
                                </div>
                                <input
                                  type="range"
                                  className={styles.holdoutSlider}
                                  min={0}
                                  max={50}
                                  value={Math.min(50, Math.max(0, Number(holdoutValue) || 0))}
                                  onChange={e =>
                                    setFormData(prev => ({
                                      ...prev,
                                      holdout_percent: e.target.value,
                                    }))
                                  }
                                  aria-label="Holdout percentage slider"
                                />
                                <div className={styles.holdoutSliderLabels}>
                                  <span>0%</span>
                                  <span>25%</span>
                                  <span>50%</span>
                                </div>
                              </div>
                              <p className={styles.holdoutHelpText}>
                                Visitors in the control group never see any variant. Leave at 0% to
                                run without a control.
                              </p>
                            </div>
                            {!isStandalone && (
                              <div className={styles.holdoutRecommendedBanner}>
                                <span className={styles.holdoutRecommendedText}>
                                  {isShippingTestType
                                    ? isShippingStorewideAdvanced
                                      ? 'Quick apply: Storewide + 10% holdout'
                                      : 'Quick apply: Selected products + 10% holdout'
                                    : 'Quick apply: Product pages + 10% holdout'}
                                </span>
                                <button
                                  type="button"
                                  className={styles.holdoutRecommendedBtn}
                                  onClick={() => {
                                    setCustomUrlModeActive(false);
                                    setFormData(prev => ({
                                      ...prev,
                                      target_type: isShippingTestType
                                        ? isShippingStorewideAdvanced
                                          ? 'all-products'
                                          : 'product'
                                        : 'all-products',
                                      target_id: '',
                                      target_ids: null,
                                      segments: {
                                        ...prev.segments,
                                        url_pattern: isShippingTestType ? '' : '/products/',
                                        page_rules: [],
                                        device: 'all',
                                        customer: 'all',
                                      },
                                      holdout_percent: 10,
                                    }));
                                  }}
                                >
                                  Apply recommended
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {placementSection === 'advanced' && (
                      <div id="targeting-advanced">
                        <div
                          id="targeting-panel-advanced"
                          className={`${styles.targetingPanel} ${styles.targetingPanelAdvanced}`}
                          role="tabpanel"
                          aria-labelledby="targeting-tab-advanced"
                        >
                          <div className={styles.targetingPanelHeader}>
                            <span className={styles.targetingPanelStep}>
                              Step {advancedStepNumber} of {advancedStepNumber}
                            </span>
                            <h4 className={styles.targetingPanelTitle}>
                              Advanced targeting & safety
                            </h4>
                            <p className={styles.targetingPanelHint}>
                              Safety, traffic, presets, and custom rules. Use{' '}
                              <kbd className={styles.panelKbd}>1</kbd>–
                              <kbd className={styles.panelKbd}>{advancedStepNumber}</kbd> or arrow
                              keys to switch sections.
                            </p>
                          </div>
                          <div className={styles.targetingPanelBody}>
                            <div className={styles.advancedInstruction}>
                              <Icon source={CodeIcon} />
                              <span>
                                Optional: guardrails, data quality, traffic limits, saved presets,
                                and JavaScript targeting. Expand a section below to configure.
                              </span>
                            </div>
                            <div className={styles.advancedContent}>
                              <div className={styles.advancedToolbar}>
                                <span className={styles.advancedToolbarLabel}>Sections</span>
                                <div className={styles.advancedToolbarActions}>
                                  <button
                                    type="button"
                                    className={styles.advancedToolbarBtn}
                                    onClick={expandAllAdvanced}
                                  >
                                    Expand all
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.advancedToolbarBtn}
                                    onClick={collapseAllAdvanced}
                                  >
                                    Collapse all
                                  </button>
                                </div>
                              </div>
                              <div className={styles.advancedGrid}>
                                <div className={styles.advancedGridGroup}>
                                  <span className={styles.advancedGridGroupLabel}>
                                    Safety & quality
                                  </span>
                                </div>
                                <div
                                  className={`${styles.advancedSection} ${styles.advancedSectionSafety} ${advancedSectionsOpen.safety ? styles.advancedSectionExpanded : ''}`}
                                >
                                  <button
                                    type="button"
                                    className={styles.advancedSectionHeader}
                                    onClick={() => toggleAdvancedSection('safety')}
                                    aria-expanded={advancedSectionsOpen.safety}
                                  >
                                    <span
                                      className={`${styles.advancedSectionIcon} ${styles.advancedSectionIconGuardrail}`}
                                    >
                                      <Icon source={AlertTriangleIcon} />
                                    </span>
                                    <div className={styles.advancedSectionTitleBlock}>
                                      <span className={styles.advancedSectionTitle}>
                                        Safety & quality
                                        {formData.guardrail_config?.enabled ||
                                        formData.segments?.exclude_internal_ips ||
                                        formData.segments?.exclude_bots ||
                                        (formData.segments?.traffic_ramp_percent ?? 0) > 0 ? (
                                          <span className={styles.advancedSectionConfigured}>
                                            Configured
                                          </span>
                                        ) : null}
                                      </span>
                                      <p>
                                        Guardrail, bot exclusion, and traffic ramp in one place.
                                      </p>
                                    </div>
                                    <span
                                      className={`${styles.advancedSectionChevron} ${advancedSectionsOpen.safety ? styles.advancedSectionChevronOpen : ''}`}
                                    >
                                      <Icon source={ChevronDownIcon} />
                                    </span>
                                  </button>
                                  {advancedSectionsOpen.safety && (
                                    <div className={styles.advancedSectionBody}>
                                      <div className={styles.safetyCombinedCard}>
                                        <div className={styles.safetySubsection}>
                                          <span className={styles.safetySubsectionTitle}>
                                            Guardrail
                                          </span>
                                          <p className={styles.safetySubsectionHint}>
                                            Auto-stop if any variant drops below control.
                                          </p>
                                          <div className={styles.guardrailCard}>
                                            <Checkbox
                                              label="Enable guardrail"
                                              checked={formData.guardrail_config?.enabled || false}
                                              onChange={value =>
                                                setFormData(prev => ({
                                                  ...prev,
                                                  guardrail_config: {
                                                    ...prev.guardrail_config,
                                                    enabled: value,
                                                    minDropPercent:
                                                      prev.guardrail_config?.minDropPercent ?? 10,
                                                  },
                                                }))
                                              }
                                              helpText="Stop test when any variant drops below threshold vs control"
                                            />
                                            {formData.guardrail_config?.enabled && (
                                              <div style={{ marginTop: 12 }}>
                                                <TextField
                                                  label="Min. drop % to trigger"
                                                  type="number"
                                                  value={String(
                                                    formData.guardrail_config?.minDropPercent ?? 10
                                                  )}
                                                  onChange={value =>
                                                    setFormData(prev => ({
                                                      ...prev,
                                                      guardrail_config: {
                                                        ...prev.guardrail_config,
                                                        minDropPercent: parseInt(value, 10) || 10,
                                                      },
                                                    }))
                                                  }
                                                  min={5}
                                                  max={50}
                                                  suffix="%"
                                                  autoComplete="off"
                                                />
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className={styles.safetySubsection}>
                                          <span className={styles.safetySubsectionTitle}>
                                            Data quality
                                          </span>
                                          <p className={styles.safetySubsectionHint}>
                                            Exclude bots, internal traffic, or ramp gradually.
                                          </p>
                                          <div className={styles.dataQualityPresets}>
                                            <button
                                              type="button"
                                              className={`${styles.dataQualityPresetBtn} ${formData.segments?.exclude_bots && formData.segments?.exclude_internal_ips ? styles.dataQualityPresetBtnActive : ''}`}
                                              onClick={() =>
                                                setFormData(prev => ({
                                                  ...prev,
                                                  segments: {
                                                    ...prev.segments,
                                                    exclude_bots: true,
                                                    exclude_internal_ips: true,
                                                  },
                                                }))
                                              }
                                            >
                                              <span className={styles.dataQualityPresetLabel}>
                                                Recommended
                                              </span>
                                              <span className={styles.dataQualityPresetDesc}>
                                                Exclude bots + internal IPs
                                              </span>
                                            </button>
                                          </div>
                                          <BlockStack gap="200">
                                            <Checkbox
                                              label="Exclude bot traffic"
                                              checked={formData.segments?.exclude_bots || false}
                                              onChange={value =>
                                                setFormData(prev => ({
                                                  ...prev,
                                                  segments: {
                                                    ...prev.segments,
                                                    exclude_bots: value,
                                                  },
                                                }))
                                              }
                                              helpText="Filter crawlers and bots by user-agent"
                                            />
                                            <Checkbox
                                              label="Exclude internal IPs"
                                              checked={
                                                formData.segments?.exclude_internal_ips || false
                                              }
                                              onChange={value =>
                                                setFormData(prev => ({
                                                  ...prev,
                                                  segments: {
                                                    ...prev.segments,
                                                    exclude_internal_ips: value,
                                                  },
                                                }))
                                              }
                                              helpText="Filter office/VPN traffic"
                                            />
                                            <TextField
                                              label="Traffic ramp %"
                                              type="number"
                                              value={formData.segments?.traffic_ramp_percent ?? ''}
                                              onChange={value =>
                                                setFormData(prev => ({
                                                  ...prev,
                                                  segments: {
                                                    ...prev.segments,
                                                    traffic_ramp_percent: value,
                                                  },
                                                }))
                                              }
                                              placeholder="0"
                                              min={0}
                                              max={100}
                                              suffix="%"
                                              helpText="Start at this % and ramp to 100%. 0 = no ramp."
                                              autoComplete="off"
                                            />
                                            <TextField
                                              label="Ramp duration (days)"
                                              type="number"
                                              value={String(
                                                formData.segments?.traffic_ramp_days ?? 7
                                              )}
                                              onChange={value =>
                                                setFormData(prev => ({
                                                  ...prev,
                                                  segments: {
                                                    ...prev.segments,
                                                    traffic_ramp_days: value,
                                                  },
                                                }))
                                              }
                                              min={1}
                                              max={30}
                                              suffix="days"
                                              helpText="How long to move from ramp % to 100% traffic."
                                              autoComplete="off"
                                            />
                                            <Select
                                              label="Variation anti-flicker mode"
                                              options={[
                                                {
                                                  label:
                                                    'Balanced (recommended) - hide for content/offer tests only',
                                                  value: 'balanced',
                                                },
                                                {
                                                  label:
                                                    'Strict - hide for all tests (strongest flicker protection)',
                                                  value: 'strict',
                                                },
                                              ]}
                                              value={
                                                formData.segments?.anti_flicker_mode || 'balanced'
                                              }
                                              onChange={value =>
                                                setFormData(prev => ({
                                                  ...prev,
                                                  segments: {
                                                    ...prev.segments,
                                                    anti_flicker_mode:
                                                      value === 'strict' ? 'strict' : 'balanced',
                                                  },
                                                }))
                                              }
                                              helpText="Strict reduces control flash further but can increase blank-screen time slightly."
                                            />
                                            <InlineStack
                                              align="start"
                                              gap="200"
                                              blockAlign="center"
                                            >
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setFormData(prev => ({
                                                    ...prev,
                                                    segments: {
                                                      ...prev.segments,
                                                      anti_flicker_mode: antiFlickerRecommendedMode,
                                                    },
                                                  }));
                                                  setIsDirty(true);
                                                  setAntiFlickerToast({
                                                    type: 'success',
                                                    message: `Applied recommended anti-flicker mode: ${antiFlickerRecommendedMode}.`,
                                                  });
                                                }}
                                                style={{
                                                  padding: 0,
                                                  border: 'none',
                                                  background: 'transparent',
                                                  cursor: 'pointer',
                                                }}
                                                title={`Apply recommended mode: ${antiFlickerRecommendedMode}`}
                                              >
                                                <Badge
                                                  tone={
                                                    antiFlickerRecommendedMode === 'strict'
                                                      ? 'warning'
                                                      : 'success'
                                                  }
                                                >
                                                  Best for this test type:{' '}
                                                  {antiFlickerRecommendedMode}
                                                </Badge>
                                              </button>
                                              <Text as="span" variant="bodySm" tone="subdued">
                                                {antiFlickerRecommendationReason}
                                              </Text>
                                            </InlineStack>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              Tip: Use <strong>Balanced</strong> for most price
                                              tests to protect speed. Use <strong>Strict</strong>{' '}
                                              for visual/content tests where even brief control
                                              flashes are unacceptable.
                                            </Text>
                                          </BlockStack>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className={styles.advancedGridGroup}>
                                  <span className={styles.advancedGridGroupLabel}>
                                    Saved & reuse
                                  </span>
                                </div>
                                <div
                                  className={`${styles.advancedSection} ${advancedSectionsOpen.presets ? styles.advancedSectionExpanded : ''}`}
                                >
                                  <button
                                    type="button"
                                    className={styles.advancedSectionHeader}
                                    onClick={() => toggleAdvancedSection('presets')}
                                    aria-expanded={advancedSectionsOpen.presets}
                                  >
                                    <span
                                      className={`${styles.advancedSectionIcon} ${styles.advancedSectionIconPresets}`}
                                    >
                                      <Icon source={SaveIcon} />
                                    </span>
                                    <div className={styles.advancedSectionTitleBlock}>
                                      <span className={styles.advancedSectionTitle}>
                                        Saved presets
                                      </span>
                                      <p>Save and reuse targeting presets across tests.</p>
                                    </div>
                                    <span
                                      className={`${styles.advancedSectionChevron} ${advancedSectionsOpen.presets ? styles.advancedSectionChevronOpen : ''}`}
                                    >
                                      <Icon source={ChevronDownIcon} />
                                    </span>
                                  </button>
                                  {advancedSectionsOpen.presets && (
                                    <div className={styles.advancedSectionBody}>
                                      <div className={styles.presetRow}>
                                        {targetingPresets.length > 0 && (
                                          <div className={styles.presetSelectWrap}>
                                            <Select
                                              label="Load preset"
                                              value={loadedPresetId}
                                              options={[
                                                { label: 'Select a preset...', value: '' },
                                                ...targetingPresets.map(p => ({
                                                  label: p.name,
                                                  value: p.id,
                                                })),
                                              ]}
                                              onChange={id => {
                                                setLoadedPresetId(id || '');
                                                if (!id) return;
                                                const preset = targetingPresets.find(
                                                  p => p.id === id
                                                );
                                                if (!preset) return;
                                                setFormData(prev => {
                                                  const next = { ...prev };
                                                  if (preset.segments) {
                                                    next.segments = {
                                                      ...prev.segments,
                                                      ...preset.segments,
                                                      countries: preset.segments.countries
                                                        ? [...(preset.segments.countries || [])]
                                                        : prev.segments?.countries || [],
                                                    };
                                                  }
                                                  if (
                                                    preset.goal &&
                                                    typeof preset.goal === 'object'
                                                  ) {
                                                    next.goal = { ...prev.goal, ...preset.goal };
                                                  }
                                                  if (
                                                    preset.variants &&
                                                    Array.isArray(preset.variants) &&
                                                    preset.variants.length > 0
                                                  ) {
                                                    next.variants = preset.variants.map(v => ({
                                                      ...v,
                                                    }));
                                                  }
                                                  return next;
                                                });
                                              }}
                                            />
                                          </div>
                                        )}
                                        <Button
                                          variant="secondary"
                                          onClick={() => {
                                            setSavePresetName('');
                                            setSavePresetModalOpen(true);
                                          }}
                                          icon={SaveIcon}
                                        >
                                          Save as preset
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className={styles.advancedGridGroup}>
                                  <span className={styles.advancedGridGroupLabel}>Power user</span>
                                </div>
                                <div
                                  className={`${styles.advancedSection} ${advancedSectionsOpen.jsTargeting ? styles.advancedSectionExpanded : ''}`}
                                >
                                  <button
                                    type="button"
                                    className={styles.advancedSectionHeader}
                                    onClick={() => toggleAdvancedSection('jsTargeting')}
                                    aria-expanded={advancedSectionsOpen.jsTargeting}
                                  >
                                    <span
                                      className={`${styles.advancedSectionIcon} ${styles.advancedSectionIconCode}`}
                                    >
                                      <Icon source={CodeIcon} />
                                    </span>
                                    <div className={styles.advancedSectionTitleBlock}>
                                      <span className={styles.advancedSectionTitle}>
                                        JavaScript targeting
                                        {formData.segments?.js_targeting?.enabled && (
                                          <span className={styles.advancedSectionConfigured}>
                                            Active
                                          </span>
                                        )}
                                      </span>
                                      <p>
                                        Custom JS for eligibility. Return true/false. Has: location,
                                        document, navigator, getDeviceType(), getCountryCode(),
                                        getTrafficSource().
                                      </p>
                                    </div>
                                    <span
                                      className={`${styles.advancedSectionChevron} ${advancedSectionsOpen.jsTargeting ? styles.advancedSectionChevronOpen : ''}`}
                                    >
                                      <Icon source={ChevronDownIcon} />
                                    </span>
                                  </button>
                                  {advancedSectionsOpen.jsTargeting && (
                                    <div className={styles.advancedSectionBody}>
                                      <Checkbox
                                        label="Enable JavaScript targeting"
                                        checked={formData.segments?.js_targeting?.enabled || false}
                                        onChange={v =>
                                          setFormData({
                                            ...formData,
                                            segments: {
                                              ...formData.segments,
                                              js_targeting: {
                                                ...formData.segments?.js_targeting,
                                                enabled: v,
                                                code:
                                                  formData.segments?.js_targeting?.code ||
                                                  'return window.innerWidth > 768;',
                                              },
                                            },
                                          })
                                        }
                                      />
                                      {formData.segments?.js_targeting?.enabled && (
                                        <div style={{ marginTop: 8 }}>
                                          <TextField
                                            label="JavaScript code (must return boolean)"
                                            value={formData.segments?.js_targeting?.code || ''}
                                            onChange={v =>
                                              setFormData({
                                                ...formData,
                                                segments: {
                                                  ...formData.segments,
                                                  js_targeting: {
                                                    ...formData.segments?.js_targeting,
                                                    code: v,
                                                  },
                                                },
                                              })
                                            }
                                            placeholder="return window.innerWidth > 768; // desktop only"
                                            multiline={6}
                                            autoComplete="off"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div
                                  className={`${styles.advancedSection} ${advancedSectionsOpen.traffic ? styles.advancedSectionExpanded : ''}`}
                                >
                                  <button
                                    type="button"
                                    className={styles.advancedSectionHeader}
                                    onClick={() => toggleAdvancedSection('traffic')}
                                    aria-expanded={advancedSectionsOpen.traffic}
                                  >
                                    <span
                                      className={`${styles.advancedSectionIcon} ${styles.advancedSectionIconTraffic}`}
                                    >
                                      <Icon source={FilterIcon} />
                                    </span>
                                    <div className={styles.advancedSectionTitleBlock}>
                                      <span className={styles.advancedSectionTitle}>
                                        Traffic & URL
                                        {(formData.segments?.traffic_source || 'all') !== 'all' ||
                                        (formData.segments?.url_pattern &&
                                          formData.segments.url_pattern !== ' ' &&
                                          String(formData.segments.url_pattern).trim() !== '') ||
                                        Number(formData.segments?.min_sessions) > 0 ? (
                                          <span className={styles.advancedSectionConfigured}>
                                            Configured
                                          </span>
                                        ) : null}
                                      </span>
                                      <p>
                                        Override: filter by traffic source, URL regex, or min
                                        sessions. Overrides basic page targeting.
                                      </p>
                                    </div>
                                    <span
                                      className={`${styles.advancedSectionChevron} ${advancedSectionsOpen.traffic ? styles.advancedSectionChevronOpen : ''}`}
                                    >
                                      <Icon source={ChevronDownIcon} />
                                    </span>
                                  </button>
                                  {advancedSectionsOpen.traffic && (
                                    <div className={styles.advancedSectionBody}>
                                      <BlockStack gap="200">
                                        <Select
                                          label="Traffic source"
                                          options={[
                                            { label: 'All traffic', value: 'all' },
                                            { label: 'Organic (search, direct)', value: 'organic' },
                                            { label: 'Paid (ads)', value: 'paid' },
                                            { label: 'Social', value: 'social' },
                                            { label: 'Email', value: 'email' },
                                            { label: 'Referral', value: 'referral' },
                                          ]}
                                          value={formData.segments?.traffic_source || 'all'}
                                          onChange={value =>
                                            setFormData({
                                              ...formData,
                                              segments: {
                                                ...formData.segments,
                                                traffic_source: value,
                                              },
                                            })
                                          }
                                          helpText="Run test only for visitors from specific sources"
                                        />
                                        <TextField
                                          label="URL pattern (regex)"
                                          value={
                                            formData.segments?.url_pattern === ' '
                                              ? ''
                                              : formData.segments?.url_pattern || ''
                                          }
                                          onChange={value =>
                                            setFormData({
                                              ...formData,
                                              segments: {
                                                ...formData.segments,
                                                url_pattern: value,
                                              },
                                            })
                                          }
                                          placeholder="e.g. /products/.* or /collections/sale"
                                          helpText="Override basic page targeting. Ignored when using page rules above."
                                          autoComplete="off"
                                        />
                                        <TextField
                                          label="Min. sessions per visitor"
                                          type="number"
                                          value={formData.segments?.min_sessions ?? ''}
                                          onChange={value =>
                                            setFormData({
                                              ...formData,
                                              segments: {
                                                ...formData.segments,
                                                min_sessions: value,
                                              },
                                            })
                                          }
                                          placeholder="0"
                                          min={0}
                                          helpText="Only include visitors with at least this many sessions. 0 = everyone."
                                          autoComplete="off"
                                        />
                                      </BlockStack>
                                    </div>
                                  )}
                                </div>

                                <div
                                  className={`${styles.advancedSection} ${advancedSectionsOpen.customRules ? styles.advancedSectionExpanded : ''}`}
                                >
                                  <button
                                    type="button"
                                    className={styles.advancedSectionHeader}
                                    onClick={() => toggleAdvancedSection('customRules')}
                                    aria-expanded={advancedSectionsOpen.customRules}
                                  >
                                    <span
                                      className={`${styles.advancedSectionIcon} ${styles.advancedSectionIconCustom}`}
                                    >
                                      <Icon source={DataTableIcon} />
                                    </span>
                                    <div className={styles.advancedSectionTitleBlock}>
                                      <span className={styles.advancedSectionTitle}>
                                        Custom rules
                                        {(formData.segments?.custom_rules || []).length > 0 && (
                                          <span className={styles.advancedSectionCount}>
                                            {(formData.segments?.custom_rules || []).length}
                                          </span>
                                        )}
                                      </span>
                                      <p>
                                        Field-based conditions: URL, referrer, device, country, UTM.
                                        All rules are AND-combined.
                                      </p>
                                    </div>
                                    <span
                                      className={`${styles.advancedSectionChevron} ${advancedSectionsOpen.customRules ? styles.advancedSectionChevronOpen : ''}`}
                                    >
                                      <Icon source={ChevronDownIcon} />
                                    </span>
                                  </button>
                                  {advancedSectionsOpen.customRules && (
                                    <div className={styles.advancedSectionBody}>
                                      {(formData.segments?.custom_rules || []).length === 0 && (
                                        <div className={styles.advancedEmptyState}>
                                          <p>
                                            No custom rules yet. Add rules to fine-tune targeting
                                            with field, operator, and value.
                                          </p>
                                        </div>
                                      )}
                                      {(formData.segments?.custom_rules || []).map((rule, idx) => (
                                        <div key={idx} className={styles.customRuleRow}>
                                          <Select
                                            label=""
                                            labelHidden
                                            options={[
                                              { label: 'URL', value: 'current_url' },
                                              { label: 'Referrer', value: 'referrer' },
                                              { label: 'Device', value: 'device' },
                                              { label: 'Country', value: 'country' },
                                              { label: 'Traffic source', value: 'traffic_source' },
                                              { label: 'UTM source', value: 'utm_source' },
                                              { label: 'UTM medium', value: 'utm_medium' },
                                            ]}
                                            value={rule.field || 'current_url'}
                                            onChange={v =>
                                              setFormData({
                                                ...formData,
                                                segments: {
                                                  ...formData.segments,
                                                  custom_rules: [
                                                    ...(
                                                      formData.segments?.custom_rules || []
                                                    ).slice(0, idx),
                                                    { ...rule, field: v },
                                                    ...(
                                                      formData.segments?.custom_rules || []
                                                    ).slice(idx + 1),
                                                  ],
                                                },
                                              })
                                            }
                                          />
                                          <Select
                                            label=""
                                            labelHidden
                                            options={[
                                              { label: 'equals', value: 'equals' },
                                              { label: 'contains', value: 'contains' },
                                              { label: 'regex', value: 'regex' },
                                              { label: 'in', value: 'in' },
                                            ]}
                                            value={rule.operator || 'equals'}
                                            onChange={v =>
                                              setFormData({
                                                ...formData,
                                                segments: {
                                                  ...formData.segments,
                                                  custom_rules: [
                                                    ...(
                                                      formData.segments?.custom_rules || []
                                                    ).slice(0, idx),
                                                    { ...rule, operator: v },
                                                    ...(
                                                      formData.segments?.custom_rules || []
                                                    ).slice(idx + 1),
                                                  ],
                                                },
                                              })
                                            }
                                          />
                                          <div style={{ flex: 1, minWidth: 120 }}>
                                            <TextField
                                              label=""
                                              labelHidden
                                              value={
                                                Array.isArray(rule.value)
                                                  ? rule.value.join(', ')
                                                  : typeof rule.value === 'string'
                                                    ? rule.value
                                                    : String(rule.value || '')
                                              }
                                              onChange={v =>
                                                setFormData({
                                                  ...formData,
                                                  segments: {
                                                    ...formData.segments,
                                                    custom_rules: [
                                                      ...(
                                                        formData.segments?.custom_rules || []
                                                      ).slice(0, idx),
                                                      {
                                                        ...rule,
                                                        value:
                                                          rule.operator === 'in'
                                                            ? v
                                                                .split(',')
                                                                .map(s => s.trim())
                                                                .filter(Boolean)
                                                            : v,
                                                      },
                                                      ...(
                                                        formData.segments?.custom_rules || []
                                                      ).slice(idx + 1),
                                                    ],
                                                  },
                                                })
                                              }
                                              placeholder="Value"
                                              autoComplete="off"
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            className={styles.removeRuleBtn}
                                            onClick={() =>
                                              setFormData({
                                                ...formData,
                                                segments: {
                                                  ...formData.segments,
                                                  custom_rules: (
                                                    formData.segments?.custom_rules || []
                                                  ).filter((_, i) => i !== idx),
                                                },
                                              })
                                            }
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      ))}
                                      <button
                                        type="button"
                                        className={styles.addRuleBtn}
                                        onClick={() =>
                                          setFormData({
                                            ...formData,
                                            segments: {
                                              ...formData.segments,
                                              custom_rules: [
                                                ...(formData.segments?.custom_rules || []),
                                                {
                                                  field: 'current_url',
                                                  operator: 'contains',
                                                  value: '',
                                                },
                                              ],
                                            },
                                          })
                                        }
                                      >
                                        <Icon source={PlusIcon} />
                                        Add rule
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <Modal
                  open={savePresetModalOpen}
                  onClose={() => {
                    setSavePresetModalOpen(false);
                    setSavePresetAsFullTemplate(false);
                  }}
                  title="Save targeting preset"
                  primaryAction={{
                    content: 'Save',
                    disabled: !savePresetName.trim(),
                    onAction: async () => {
                      if (!savePresetName.trim()) return;
                      try {
                        await apiPost('/targeting-presets', {
                          name: savePresetName.trim(),
                          segments: formData.segments,
                          ...(savePresetAsFullTemplate && {
                            goal: formData.goal,
                            variants: formData.variants,
                          }),
                        });
                        const res = await apiGet('/targeting-presets');
                        setTargetingPresets(res.data?.presets || []);
                        setSavePresetModalOpen(false);
                        setSavePresetName('');
                        setSavePresetAsFullTemplate(false);
                      } catch (err) {
                        setError(err?.response?.data?.error || 'Failed to save preset');
                      }
                    },
                  }}
                  secondaryActions={[
                    {
                      content: 'Cancel',
                      onAction: () => {
                        setSavePresetModalOpen(false);
                        setSavePresetAsFullTemplate(false);
                      },
                    },
                  ]}
                >
                  <Modal.Section>
                    <BlockStack gap="300">
                      <TextField
                        label="Preset name"
                        value={savePresetName}
                        onChange={setSavePresetName}
                        placeholder="e.g. Mobile US, Desktop returning"
                        autoComplete="off"
                      />
                      <Checkbox
                        label="Include goal and variants (full test template)"
                        checked={savePresetAsFullTemplate}
                        onChange={setSavePresetAsFullTemplate}
                        helpText="When checked, saves metric, statistical design, and variant config for reuse"
                      />
                    </BlockStack>
                  </Modal.Section>
                </Modal>
              </div>
            </div>
          </div>
        </Card>
      </BlockStack>
    );
  };

  const renderGoalStep = () => (
    <BlockStack gap="400">
      <Card>
        <div className={styles.configWrapper}>
          <div className={styles.configAccent} aria-hidden />
          <div className={styles.stepHeader}>
            <span className={styles.stepHeaderIcon}>
              <Icon source={TargetIcon} />
            </span>
            <div>
              <h2 className={styles.stepHeaderTitle}>Goal & Metrics</h2>
              <p className={styles.stepHeaderSubtitle}>
                Define what success looks like and how to measure it.
              </p>
            </div>
          </div>
          <div className={styles.goalInstruction}>
            <Icon source={ChartLineIcon} />
            <span>
              {formData.goal?.metric
                ? 'Metric selected. Set conversion window and optional secondary events below, then click Next.'
                : 'Choose your primary success metric (Revenue, Conversion, or AOV). Configure the conversion window and optional events as needed.'}
            </span>
          </div>
          <div className={styles.goalSummaryCompact}>
            <span className={styles.goalSummaryChip}>
              <Icon source={ChartLineIcon} />
              {formData.goal?.metric === 'revenue'
                ? 'Revenue'
                : formData.goal?.metric === 'conversion_rate'
                  ? 'Conversion'
                  : formData.goal?.metric === 'aov'
                    ? 'AOV'
                    : '—'}
            </span>
            <span className={styles.goalSummaryDivider} aria-hidden="true" />
            <span className={styles.goalSummaryChip}>
              <Icon source={ClockIcon} />
              {formData.goal?.conversion_window_days ?? 30} days
            </span>
          </div>
          <div className={styles.goalFormWrapper}>
            <FormLayout>
              <div className={styles.goalSectionGroup}>
                <h4 className={styles.goalSectionGroupTitle}>Primary metric</h4>
                <div className={styles.formSection} id="targeting-metric">
                  <h4 className={styles.formSectionTitle}>Success metric</h4>
                  <p className={styles.formSectionHint}>
                    Primary metric for measuring test performance.
                  </p>
                  <div className={styles.metricPresets}>
                    {[
                      {
                        label: 'Revenue',
                        value: 'revenue',
                        desc: 'Total sales',
                        icon: ProductIcon,
                      },
                      {
                        label: 'Conversion',
                        value: 'conversion_rate',
                        desc: 'Purchase rate',
                        icon: ChartLineIcon,
                      },
                      { label: 'AOV', value: 'aov', desc: 'Order value', icon: CartIcon },
                    ].map(({ label, value, desc, icon: IconCmp }) => {
                      const isActive = (formData.goal?.metric || 'revenue') === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          className={`${styles.metricPresetChip} ${isActive ? styles.metricPresetChipActive : ''}`}
                          onClick={() =>
                            setFormData({
                              ...formData,
                              goal: { ...(formData.goal || {}), metric: value },
                            })
                          }
                          aria-pressed={isActive}
                          aria-label={`${label}: ${desc}. ${isActive ? 'Selected' : 'Click to select'}`}
                        >
                          <span className={styles.metricPresetIcon}>
                            <Icon source={IconCmp} />
                          </span>
                          <span className={styles.metricPresetLabel}>{label}</span>
                          <span className={styles.metricPresetDesc}>{desc}</span>
                        </button>
                      );
                    })}
                  </div>
                  {isPriceLikeTestType(formData.type) && (
                    <p className={styles.goalPriceMetricHint}>
                      For price tests, <strong>Revenue</strong> (or Profit with COGS) is usually the
                      best primary metric; conversion-only can bias toward lower prices.
                    </p>
                  )}
                </div>

                {formData.goal?.metric === 'revenue' && (
                  <BlockStack gap="200">
                    <Checkbox
                      label="Track profit (subtract COGS from revenue)"
                      checked={formData.goal?.cogs?.enabled || false}
                      onChange={value =>
                        setFormData({
                          ...formData,
                          goal: {
                            ...formData.goal,
                            cogs: {
                              ...(formData.goal?.cogs || {}),
                              enabled: value,
                              type: formData.goal?.cogs?.type || 'percentage',
                              value: formData.goal?.cogs?.value ?? 30,
                            },
                          },
                        })
                      }
                    />
                    {formData.goal?.cogs?.enabled && (
                      <InlineStack gap="200">
                        <Select
                          label="COGS type"
                          options={[
                            { label: 'Percentage of revenue', value: 'percentage' },
                            { label: 'Fixed per order', value: 'fixed_per_order' },
                          ]}
                          value={formData.goal?.cogs?.type || 'percentage'}
                          onChange={value =>
                            setFormData({
                              ...formData,
                              goal: {
                                ...formData.goal,
                                cogs: { ...(formData.goal?.cogs || {}), type: value },
                              },
                            })
                          }
                        />
                        <TextField
                          label={
                            formData.goal?.cogs?.type === 'percentage'
                              ? 'COGS %'
                              : 'COGS $ per order'
                          }
                          type="number"
                          min={formData.goal?.cogs?.type === 'percentage' ? 0 : undefined}
                          max={formData.goal?.cogs?.type === 'percentage' ? 100 : undefined}
                          value={String(formData.goal?.cogs?.value ?? 30)}
                          onChange={value =>
                            setFormData({
                              ...formData,
                              goal: {
                                ...formData.goal,
                                cogs: {
                                  ...(formData.goal?.cogs || {}),
                                  value: parseFloat(value) || 0,
                                },
                              },
                            })
                          }
                          autoComplete="off"
                          helpText={
                            formData.goal?.cogs?.type === 'percentage'
                              ? '0–100. Revenue minus this % is profit.'
                              : 'Fixed amount subtracted per conversion.'
                          }
                        />
                      </InlineStack>
                    )}
                  </BlockStack>
                )}

                <div className={styles.formSection}>
                  <h4 className={styles.formSectionTitle}>Secondary events (optional)</h4>
                  <p className={styles.formSectionHint}>
                    Track additional events per variant. Use{' '}
                    <code className={styles.inlineCode}>
                      RipX.trackEvent(testId, &apos;event_name&apos;, value)
                    </code>{' '}
                    in your theme.
                  </p>
                  <div className={styles.secondaryEventChips}>
                    {[
                      'add_to_cart',
                      'newsletter_signup',
                      'signup',
                      'view_content',
                      'form_submit',
                    ].map(name => {
                      const secondary = formData.goal?.secondary || [];
                      const isSelected = secondary.some(s => (s?.event_name || s) === name);
                      return (
                        <button
                          key={name}
                          type="button"
                          className={`${styles.secondaryEventChip} ${isSelected ? styles.secondaryEventChipSelected : ''}`}
                          onClick={() => {
                            const next = isSelected
                              ? secondary.filter(s => (s?.event_name || s) !== name)
                              : [...secondary, { event_name: name, aggregation: 'count' }];
                            setFormData({
                              ...formData,
                              goal: { ...(formData.goal || {}), secondary: next },
                            });
                          }}
                        >
                          {name.replace(/_/g, ' ')}
                        </button>
                      );
                    })}
                  </div>
                  <InlineStack gap="200" blockAlign="end" wrap>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <TextField
                        label="Custom event name"
                        labelHidden
                        value={customEventInput}
                        onChange={setCustomEventInput}
                        placeholder="e.g. product_view, checkout_start"
                        autoComplete="off"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomEvent();
                          }
                        }}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      size="slim"
                      onClick={addCustomEvent}
                      disabled={!customEventInput?.trim()}
                    >
                      Add custom
                    </Button>
                  </InlineStack>
                  {(formData.goal?.secondary || []).length > 0 && (
                    <BlockStack gap="200">
                      <Text variant="bodySm" fontWeight="semibold" as="p">
                        Selected events
                      </Text>
                      <div className={styles.secondaryEventList}>
                        {(formData.goal?.secondary || []).map((s, idx) => {
                          const name = s?.event_name || s;
                          const agg = s?.aggregation || 'count';
                          return (
                            <InlineStack
                              key={`${name}-${idx}`}
                              gap="200"
                              blockAlign="center"
                              wrap={false}
                            >
                              <span className={styles.secondaryEventName}>
                                {String(name).replace(/_/g, ' ')}
                              </span>
                              <Select
                                label="Aggregation"
                                labelHidden
                                options={[
                                  { label: 'Count', value: 'count' },
                                  { label: 'Sum (value)', value: 'sum' },
                                ]}
                                value={agg}
                                onChange={value => {
                                  const next = [...(formData.goal?.secondary || [])];
                                  next[idx] = {
                                    ...(typeof next[idx] === 'object'
                                      ? next[idx]
                                      : { event_name: next[idx] }),
                                    event_name: name,
                                    aggregation: value,
                                  };
                                  setFormData({
                                    ...formData,
                                    goal: { ...(formData.goal || {}), secondary: next },
                                  });
                                }}
                              />
                            </InlineStack>
                          );
                        })}
                      </div>
                    </BlockStack>
                  )}
                </div>
              </div>

              <div className={styles.formSectionDivider} aria-hidden="true" />
              <div className={styles.formSection}>
                <h4 className={styles.formSectionTitle}>Conversion window</h4>
                <p className={styles.formSectionHint}>
                  Count conversions within this many days of first visit.
                </p>
                <div
                  className={styles.conversionWindowChips}
                  role="group"
                  aria-label="Conversion window"
                >
                  {[1, 3, 7, 14, 30].map(days => {
                    const isActive = (formData.goal?.conversion_window_days ?? 30) === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            goal: { ...(formData.goal || {}), conversion_window_days: days },
                          })
                        }
                        className={`${styles.conversionWindowChip} ${isActive ? styles.conversionWindowChipActive : ''}`}
                        aria-pressed={isActive}
                        aria-label={`${days} days conversion window. ${isActive ? 'Selected' : 'Click to select'}`}
                      >
                        <Icon source={ClockIcon} />
                        {days} days
                      </button>
                    );
                  })}
                </div>
                <TextField
                  label="Goal URL (optional)"
                  value={formData.goal?.conversion_url || ''}
                  onChange={value =>
                    setFormData({
                      ...formData,
                      goal: { ...(formData.goal || {}), conversion_url: value },
                    })
                  }
                  placeholder={
                    isStandalone
                      ? '/thank-you, /order-complete, or leave empty for any'
                      : '/checkout, /thank-you, or leave empty for any'
                  }
                  helpText={
                    isStandalone
                      ? 'Restrict conversions to visits that reached these path(s). Comma-separated for multiple.'
                      : 'Restrict conversion counting to specific URL(s). Comma-separated for multiple.'
                  }
                  autoComplete="off"
                />
              </div>
              <div className={styles.formSectionDivider} aria-hidden="true" />
              <div className={styles.formSection}>
                <h4 className={styles.formSectionTitle}>Analysis method</h4>
                <p className={styles.formSectionHint}>
                  Bayesian shows probability each variant is best. Frequentist uses traditional
                  p-values.
                </p>
                <div
                  className={styles.analysisMethodChips}
                  role="group"
                  aria-label="Analysis method"
                >
                  {[
                    { value: 'frequentist', label: 'Frequentist (p-values)' },
                    { value: 'bayesian', label: 'Bayesian (probability of best)' },
                  ].map(({ value, label }) => {
                    const isActive = (formData.goal?.analysis_method || 'frequentist') === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setFormData({
                            ...formData,
                            goal: { ...(formData.goal || {}), analysis_method: value },
                          })
                        }
                        className={`${styles.analysisMethodChip} ${isActive ? styles.analysisMethodChipActive : ''}`}
                        aria-pressed={isActive}
                        aria-label={`${label}. ${isActive ? 'Selected' : 'Click to select'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className={`${styles.goalSectionGroup} ${styles.goalSectionGroupFull}`}>
                <h4 className={styles.goalSectionGroupTitle}>Statistical design</h4>
                <div className={styles.formSection}>
                  <h4 className={styles.formSectionTitle}>Statistical design & sample size</h4>
                  <p className={styles.formSectionHint}>
                    Set confidence and power, then calculate required visitors for your test.
                  </p>
                  <div className={styles.statisticalDesignGrid}>
                    <div style={{ minWidth: 140 }}>
                      <Select
                        label="Confidence level"
                        options={[
                          { label: '90%', value: '0.9' },
                          { label: '95% (recommended)', value: '0.95' },
                          { label: '99%', value: '0.99' },
                        ]}
                        value={String(formData.goal?.significance_level ?? 0.95)}
                        onChange={value =>
                          setFormData({
                            ...formData,
                            goal: {
                              ...(formData.goal || {}),
                              significance_level: parseFloat(value) || 0.95,
                            },
                          })
                        }
                        helpText="95% means a 5% false-positive risk (not '95% chance this winner is better'). See the Price testing guide for interpretation."
                      />
                    </div>
                    <div style={{ minWidth: 140 }}>
                      <Select
                        label="Statistical power"
                        options={[
                          { label: '80%', value: '0.8' },
                          { label: '90%', value: '0.9' },
                          { label: '95%', value: '0.95' },
                        ]}
                        value={String(formData.goal?.statistical_power ?? 0.8)}
                        onChange={value =>
                          setFormData({
                            ...formData,
                            goal: {
                              ...(formData.goal || {}),
                              statistical_power: parseFloat(value) || 0.8,
                            },
                          })
                        }
                        helpText="Probability to detect real effects"
                      />
                    </div>
                  </div>
                  <Collapsible
                    id="inline-sample-size"
                    open={sampleSizeExpanded}
                    transition={{ duration: '200ms', timingFunction: 'ease' }}
                  >
                    <div className={styles.sampleSizeInline}>
                      <SampleSizeCalculator
                        key={`sample-${formData.goal?.significance_level ?? 0.95}-${formData.goal?.statistical_power ?? 0.8}`}
                        embedded
                        className={styles.sampleSizeCalculator}
                        initialValues={{
                          confidenceLevel: String(
                            Math.round((formData.goal?.significance_level ?? 0.95) * 100)
                          ),
                          power: String(
                            Math.round((formData.goal?.statistical_power ?? 0.8) * 100)
                          ),
                        }}
                      />
                    </div>
                  </Collapsible>
                  <div className={styles.sampleSizeCta}>
                    <Button
                      variant={sampleSizeExpanded ? 'secondary' : 'primary'}
                      icon={CalculatorIcon}
                      onClick={() => setSampleSizeExpanded(!sampleSizeExpanded)}
                    >
                      {sampleSizeExpanded
                        ? 'Hide sample size calculator'
                        : 'Calculate sample size & duration'}
                    </Button>
                    <Text variant="bodySm" tone="subdued" as="p" style={{ marginTop: '6px' }}>
                      Uses the confidence level and statistical power above for estimates.
                    </Text>
                  </div>
                </div>
              </div>
            </FormLayout>
          </div>
        </div>
      </Card>
    </BlockStack>
  );

  const getVariantConfigType = () => {
    const testType = (formData.type || '').toLowerCase();
    const template = selectedTemplate || formData.goal?.template_key || '';

    if (testType === 'price' || template === 'price' || template === 'pricing') return 'price';
    if (testType === 'shipping' || template === 'shipping') return 'shipping';
    if (testType === 'offer' || template === 'offer') return 'offer';
    if (testType === 'checkout' || template === 'checkout') return 'checkout';
    if (testType === 'theme' || template === 'theme' || template === 'template') return 'theme';
    if (template === 'split-url') return 'url';
    if (template === 'onsite-edit' || template === 'content') return 'code';

    const source =
      mode === 'edit' && initialData?.variants?.[0]?.config
        ? initialData?.variants?.[0]?.config
        : formData.variants?.[0]?.config;
    if (!source) return 'code';
    if ('url' in source) return 'url';
    if (
      'price' in source ||
      'priceMode' in source ||
      'priceDelta' in source ||
      'pricePercent' in source
    )
      return 'price';
    if (
      'rate' in source ||
      'strategy' in source ||
      'shipping_strategy' in source ||
      'threshold_amount' in source ||
      'free_shipping_threshold' in source ||
      'percent_off' in source ||
      'profile_id' in source
    )
      return 'shipping';
    if (
      'template' in source ||
      'themeMode' in source ||
      'theme_mode' in source ||
      'themeTemplateHandle' in source ||
      'theme_template_handle' in source ||
      'themeId' in source ||
      'theme_id' in source ||
      'sectionId' in source ||
      'section_id' in source ||
      'bodyClass' in source ||
      'body_class' in source
    )
      return 'theme';
    if ('discount' in source || 'discount_type' in source || 'discount_value' in source)
      return 'offer';
    if (
      'checkout_sections' in source ||
      'checkout_placement' in source ||
      'checkout_title' in source ||
      'checkout_message' in source ||
      'checkout_cta_label' in source ||
      'payment_method_names' in source ||
      'delivery_method_names' in source
    )
      return 'checkout';
    return 'code';
  };

  const variantConfigType = getVariantConfigType();

  // Show variant config step as soon as we have data. In edit mode for code type, require
  // variantCodesData to be in sync with formData.variants (or 0 variants); do not block on
  // isInitialized so we avoid infinite "Loading configuration…" when effect order or key remounts delay it.
  const configStepContentReady =
    mode !== 'edit' ||
    (variantConfigType !== 'code' && isInitialized) ||
    (variantConfigType === 'code' &&
      (formData.variants?.length === 0 || variantCodesData.length === formData.variants?.length));

  const renderVariantUrlModule = () => (
    <VariantUrlModule formData={formData} setFormData={setFormData} />
  );

  const PRICE_MODES = [
    { value: 'fixed', label: 'Fixed price' },
    { value: 'amount', label: '$ decrease/increase (amount)' },
    { value: 'percent', label: '% decrease/increase (percent change)' },
  ];
  const PRICE_BASE_OPTIONS = [
    { value: 'price', label: 'Selling price' },
    { value: 'compare_at', label: 'Compare-at price (list)' },
  ];

  const normalizePriceApplicationMethod = value => {
    const raw = String(value || '')
      .trim()
      .toLowerCase();
    if (raw === 'discounted_checkout_price') return 'discounted_checkout_price';
    if (raw === 'native_variant_price') return 'native_variant_price';
    if (raw === 'direct_price_override') return 'direct_price_override';
    return 'auto';
  };

  const normalizeNativeVariantIdInput = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const gidMatch = raw.match(/ProductVariant\/\s*(\d+)/i);
    if (gidMatch) return gidMatch[1];
    const numericMatch = raw.match(/\b(\d{6,})\b/);
    if (numericMatch) return numericMatch[1];
    return raw;
  };

  const parseMatrixPriceNumber = value => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const direct = Number(raw);
    if (Number.isFinite(direct)) return direct;
    const normalized = raw.replace(/,/g, '');
    const matched = normalized.match(/-?\d+(\.\d+)?/);
    if (!matched) return null;
    const parsed = Number(matched[0]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const formatMatrixInputNumber = value => {
    if (!Number.isFinite(value)) return '';
    const rounded = Math.round(value * 100) / 100;
    return String(rounded);
  };

  const getMatrixCurrentSellingPrice = productVariant =>
    parseMatrixPriceNumber(productVariant?.price);

  const priceConfigImpliesIncrease = cfg => {
    if (!cfg || typeof cfg !== 'object') return false;
    const mode = String(cfg.priceMode || 'fixed').toLowerCase();
    if (mode === 'amount') {
      const n = Number(cfg.priceDelta);
      return !Number.isNaN(n) && n > 0;
    }
    if (mode === 'percent') {
      const n = Number(cfg.pricePercent);
      return !Number.isNaN(n) && n < 0;
    }
    return false;
  };

  const priceConfigImpliesDecrease = cfg => {
    if (!cfg || typeof cfg !== 'object') return false;
    const mode = String(cfg.priceMode || 'fixed').toLowerCase();
    if (mode === 'amount') {
      const n = Number(cfg.priceDelta);
      return !Number.isNaN(n) && n < 0;
    }
    if (mode === 'percent') {
      const n = Number(cfg.pricePercent);
      return !Number.isNaN(n) && n > 0;
    }
    return false;
  };

  const getPriceApplicationMethodMeta = cfgOrMethod => {
    const cfg = cfgOrMethod && typeof cfgOrMethod === 'object' ? cfgOrMethod : null;
    const method = cfg
      ? normalizePriceApplicationMethod(cfg.priceApplicationMethod)
      : normalizePriceApplicationMethod(cfgOrMethod);
    const hasNativeVariantMapping =
      !!cfg &&
      cfg.nativeVariantId !== null &&
      cfg.nativeVariantId !== undefined &&
      String(cfg.nativeVariantId).trim() !== '';
    const impliesIncrease = priceConfigImpliesIncrease(cfg);
    if (method === 'discounted_checkout_price') {
      return {
        label: 'Discounted Checkout Price',
        shortLabel: 'Discounted Checkout',
        helpText:
          'Applies lower prices at checkout with Shopify discounts. Fast to launch, but shoppers may see a discount label.',
        badges: [
          { label: 'Recommended for lower prices', tone: 'success' },
          { label: 'Easy setup', tone: 'info' },
        ],
        warning: impliesIncrease
          ? 'This variant raises price. Discounted Checkout cannot increase totals. Use Auto or Native Variant.'
          : 'This method cannot increase price because Shopify discounts only reduce totals.',
      };
    }
    if (method === 'native_variant_price') {
      return {
        label: 'Native Variant Price',
        shortLabel: 'Native Variant',
        helpText: 'Uses a mapped Shopify variant with a real catalog price.',
        badges: [
          { label: 'Actual product price', tone: 'success' },
          { label: 'Supports price increases', tone: 'attention' },
          { label: 'Requires mapped variants', tone: 'warning' },
        ],
        warning:
          'Requires alternate Shopify variants kept in sync for inventory, merchandising, and reporting.',
      };
    }
    if (method === 'direct_price_override') {
      return {
        label: 'Direct Price Override',
        shortLabel: 'Cart Transform',
        helpText:
          'Uses Cart Transform to set cart line unit price directly (no discount label). Manual selections stay strict: RipX does not auto-switch this method.',
        badges: [
          { label: 'No discount label', tone: 'success' },
          { label: 'Cart Transform API', tone: 'info' },
          { label: 'Advanced', tone: 'attention' },
          { label: 'Plus only', tone: 'warning' },
        ],
        warning:
          directPriceOverrideReadiness === 'needs_deploy'
            ? 'Deploy the RipX Cart Transform first. Shopify allows one Cart Transform per store.'
            : directPriceOverrideReadiness === 'needs_install'
              ? 'Install/bind the deployed RipX Cart Transform on this shop before relying on Direct Price Override.'
              : impliesIncrease
                ? 'Higher-price overrides can be ignored on some live shops. Manual Direct Price Override does not auto-fallback. Use Auto or switch this variant to Native Variant Price if needed.'
                : null,
      };
    }
    return {
      label: 'Auto (recommended)',
      shortLabel: 'Auto',
      helpText: cartTransformFunctionAvailable
        ? 'RipX chooses the best supported strategy: Discounted Checkout for lower prices and Cart Transform for higher prices.'
        : 'RipX chooses the best available strategy: Discounted Checkout for lower prices and Native Variant for higher prices.',
      badges: [
        { label: 'Recommended', tone: 'success' },
        { label: 'Hybrid strategy', tone: 'info' },
      ],
      warning:
        impliesIncrease && cartTransformFunctionAvailable
          ? 'This variant raises price. Auto can switch between Cart Transform and Native Variant when needed.'
          : impliesIncrease && !hasNativeVariantMapping
            ? 'This variant raises price. Add a mapped Shopify variant so Auto can use Native Variant at checkout.'
            : null,
    };
  };

  const getPriceApplicationMethodShortLabel = cfgOrMethod =>
    getPriceApplicationMethodMeta(cfgOrMethod).shortLabel;

  const getResolvedPriceApplicationMethodSummary = cfg => {
    const method = normalizePriceApplicationMethod(cfg?.priceApplicationMethod);
    const impliesIncrease = priceConfigImpliesIncrease(cfg || {});
    const impliesDecrease = priceConfigImpliesDecrease(cfg || {});

    if (method === 'auto') {
      if (impliesIncrease && cartTransformFunctionAvailable) {
        return {
          label: 'Auto -> Cart Transform',
          detail:
            'Higher-price path resolves to Direct Price Override on this shop. Auto may still switch to Native Variant when required.',
        };
      }
      if (impliesIncrease) {
        return {
          label: 'Auto -> Native Variant',
          detail: 'Higher-price path falls back to Native Variant Price on this shop.',
        };
      }
      if (impliesDecrease) {
        return {
          label: 'Auto -> Discounted Checkout',
          detail: 'Lower-price path resolves to Discounted Checkout behavior.',
        };
      }
      return {
        label: 'Auto',
        detail: 'RipX chooses the best supported path for this variant.',
      };
    }

    if (method === 'direct_price_override' && impliesIncrease) {
      return {
        label: getPriceApplicationMethodShortLabel(method),
        detail:
          directPriceOverrideReadiness === 'ready'
            ? 'Direct Price Override is selected for a higher-price path. This manual selection stays strict and does not auto-switch methods.'
            : getPriceApplicationMethodMeta({ ...(cfg || {}), priceApplicationMethod: method })
                .helpText,
      };
    }

    return {
      label: getPriceApplicationMethodShortLabel(method),
      detail: getPriceApplicationMethodMeta({ ...(cfg || {}), priceApplicationMethod: method })
        .helpText,
    };
  };

  const getPricePreview = (cfg, _variantName) => {
    const m = (cfg?.priceMode || 'fixed').toLowerCase();
    if (m === 'fixed') {
      if (cfg.price !== null && cfg.price !== undefined && cfg.price !== '') {
        const n = Number(cfg.price);
        return Number.isNaN(n) ? '—' : `$${n.toFixed(2)}`;
      }
      return 'Catalog (control)';
    }
    if (
      m === 'amount' &&
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      cfg.priceDelta !== ''
    ) {
      const d = Number(cfg.priceDelta);
      if (!Number.isNaN(d))
        return d < 0 ? `Catalog − $${Math.abs(d).toFixed(2)}` : `Catalog + $${d.toFixed(2)}`;
    }
    if (
      m === 'percent' &&
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      cfg.pricePercent !== ''
    ) {
      const p = Number(cfg.pricePercent);
      if (!Number.isNaN(p)) {
        const base = cfg.priceBase === 'compare_at' ? ' compare-at' : '';
        if (p > 0) return `${p}% lower${base}`;
        if (p < 0) return `${Math.abs(p)}% higher${base}`;
        return `0%${base}`;
      }
    }
    return '—';
  };

  const getPriceTypeLabel = cfg => {
    const m = (cfg?.priceMode || 'fixed').toLowerCase();
    if (m === 'fixed' && (cfg?.price === null || cfg?.price === undefined || cfg?.price === ''))
      return 'Control';
    if (m === 'fixed') return 'Fixed';
    if (m === 'amount') return '$ change';
    if (m === 'percent') return '% change';
    return '—';
  };

  const getPriceValueCell = variant => {
    const cfg = variant.config || {};
    const m = (cfg.priceMode || 'fixed').toLowerCase();
    if (m === 'fixed' && cfg.price !== null && cfg.price !== undefined && cfg.price !== '') {
      const n = Number(cfg.price);
      return Number.isNaN(n) ? '—' : `$${n.toFixed(2)}`;
    }
    if (
      m === 'amount' &&
      cfg.priceDelta !== null &&
      cfg.priceDelta !== undefined &&
      cfg.priceDelta !== ''
    ) {
      const d = Number(cfg.priceDelta);
      if (Number.isNaN(d)) return '—';
      return d < 0 ? `−$${Math.abs(d).toFixed(2)}` : `+$${d.toFixed(2)}`;
    }
    if (
      m === 'percent' &&
      cfg.pricePercent !== null &&
      cfg.pricePercent !== undefined &&
      cfg.pricePercent !== ''
    ) {
      const p = Number(cfg.pricePercent);
      if (!Number.isNaN(p)) return p >= 0 ? `−${p}%` : `+${Math.abs(p)}%`;
    }
    return '—';
  };

  const PRICE_AMOUNT_PRESETS = [-10, -5, -2, 2, 5];
  const PRICE_PERCENT_PRESETS = [-10, -5, 5, 10, 15, 20];

  const getProductLabelFromId = id => {
    if (!id) return 'Product';
    const meta = priceProductMetaById[id];
    if (meta?.title) return meta.title;
    const s = String(id);
    const m = s.match(/Product\/(\d+)/);
    return m ? `Product ${m[1]}` : s;
  };

  const downloadPriceSimulationCsv = useCallback(
    (rows, variantsForCsv) => {
      if (!Array.isArray(rows) || rows.length === 0) return;
      const csv = buildPriceSimulationCsv({
        rows,
        variantNames: (variantsForCsv || []).map((v, idx) => v?.name || `Variant ${idx + 1}`),
      });
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const safeTestName = (formData.name || initialData?.name || 'price-test')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const fileName = `${safeTestName || 'price-test'}-simulation.csv`;
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      const exportedAt = new Date();
      setLastSimulationExportAt(exportedAt);
      setSimulationExportToast({
        message: `${fileName} exported at ${exportedAt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        type: 'success',
      });
    },
    [formData.name, initialData?.name]
  );

  const renderVariantPriceModule = () => {
    const variants = formData.variants || [];
    const priceTargetProductIds = selectedScopeProductIds;
    const matrixTableProductIds = isProductTargetScope
      ? selectedScopeProductIds
      : allProductsMatrixVisibleIds;
    const parsedExampleCatalog =
      exampleCatalogPrice !== '' && Number.isFinite(Number.parseFloat(exampleCatalogPrice))
        ? Number.parseFloat(exampleCatalogPrice)
        : null;
    const parsedExampleCompareAt =
      exampleCompareAtPrice !== '' && Number.isFinite(Number.parseFloat(exampleCompareAtPrice))
        ? Number.parseFloat(exampleCompareAtPrice)
        : null;
    const simulationNeedsCompareAt = variants.some(v => configUsesCompareAtBase(v?.config || {}));
    const priceIncreaseCount = variants.filter(v =>
      priceConfigImpliesIncrease(v?.config || {})
    ).length;
    const priceDecreaseCount = variants.filter(v =>
      priceConfigImpliesDecrease(v?.config || {})
    ).length;
    const scopeLabel = isProductTargetScope
      ? `${selectedScopeProductIds.length || 1} selected product${selectedScopeProductIds.length === 1 ? '' : 's'}`
      : `All products (${matrixTableProductIds.length} loaded)`;
    const matrixSearchQuery = allProductsMatrixSearchDebounced.trim();
    const hasMatrixSearchQuery = !isProductTargetScope && matrixSearchQuery.length > 0;
    const matrixSearchQueryLabel =
      matrixSearchQuery.length > MATRIX_SEARCH_BADGE_MAX_CHARS
        ? `${matrixSearchQuery.slice(0, MATRIX_SEARCH_BADGE_MAX_CHARS - 1).trim()}...`
        : matrixSearchQuery;
    const matrixSearchQueryTruncated =
      hasMatrixSearchQuery && matrixSearchQueryLabel !== matrixSearchQuery;
    const matrixSearchBadgeContent = (
      <>
        <span className={styles.priceMatrixSearchBadgePrefix}>Search:</span>
        <span className={styles.priceMatrixSearchBadgeQuery}>{matrixSearchQueryLabel}</span>
        <span className={styles.priceMatrixSearchBadgeCount}>
          ({allProductsMatrixProducts.length})
        </span>
      </>
    );
    const priceSimulation =
      parsedExampleCatalog !== null
        ? buildPriceSimulationRows({
            variants,
            catalogPrice: parsedExampleCatalog,
            compareAtPrice: parsedExampleCompareAt,
            targetType: formData.target_type,
            targetProductIds: isProductTargetScope ? selectedScopeProductIds : [],
          })
        : {
            rows: [],
            truncated: false,
            hasVariantOverrideRows: false,
            hasCompareAtBase: simulationNeedsCompareAt,
            hasMissingCompareAt: false,
          };

    const renderPriceVariantEditor = index => {
      const variant = variants[index] || {};
      const mode = variant.config?.priceMode || 'fixed';
      const isFixed = mode === 'fixed';
      const isAmount = mode === 'amount';
      const isPercent = mode === 'percent';
      const matrixBulkParsedValue = Number(priceMatrixBulkValue);
      const matrixBulkValueValid =
        String(priceMatrixBulkValue).trim() !== '' && Number.isFinite(matrixBulkParsedValue);
      const cloneMatrixUndoValue = value => {
        if (!value || typeof value !== 'object') return null;
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (_error) {
          return { ...value };
        }
      };
      const editorPreviewText = getPricePreview(variant.config, variant.name);
      const editorRuleValue = getPriceValueCell(variant);
      return (
        <div
          className={styles.priceEditorPanel}
          style={{ ['--price-editor-accent']: getVariantColor(index) }}
        >
          <div className={styles.priceEditorStack}>
            <BlockStack gap="400">
              <div className={styles.priceEditorHeader}>
                <div className={styles.priceEditorHeaderRow}>
                  <Text as="span" variant="bodySm" fontWeight="medium" tone="subdued">
                    Price configuration · {variant.name || `Variant ${index + 1}`} ({index + 1} of{' '}
                    {variants.length})
                  </Text>
                  {index > 0 && variants[index - 1] && (
                    <Button
                      size="slim"
                      variant="plain"
                      onClick={() => {
                        const source = variants[index - 1];
                        if (!source?.config) return;
                        setFormData(prev => {
                          const next = [...(prev.variants || [])];
                          next[index] = { ...next[index], config: { ...source.config } };
                          return { ...prev, variants: next };
                        });
                      }}
                    >
                      Copy from {variants[index - 1].name || `Variant ${index}`}
                    </Button>
                  )}
                </div>
              </div>
              <div className={styles.priceEditorIntroGrid}>
                <div className={styles.priceEditorIntroCard}>
                  <span className={styles.priceEditorIntroLabel}>
                    Display price
                    <TooltipWrapper
                      content="Shown on the product page for this variant (PDP). Does not change catalog in Shopify Admin."
                      accessibilityLabel="Display price help"
                      preferredPosition="above"
                    >
                      <span className={styles.priceEditorIntroLabelInfo} tabIndex={0}>
                        <Icon source={InfoIcon} />
                      </span>
                    </TooltipWrapper>
                  </span>
                  <span className={styles.priceEditorIntroValue}>{editorPreviewText}</span>
                  <span className={styles.priceEditorIntroHint}>PDP &amp; line display</span>
                </div>
                <div className={styles.priceEditorIntroCard}>
                  <span className={styles.priceEditorIntroLabel}>
                    Checkout method
                    <TooltipWrapper
                      content={
                        shouldUseDirectPriceOverrideExecution
                          ? 'Price tests use Direct Price on cart and checkout for this shop.'
                          : 'Cart transform is not ready, so checkout method falls back to Auto (discount/native) for this shop.'
                      }
                      accessibilityLabel="Checkout method help"
                      preferredPosition="above"
                    >
                      <span className={styles.priceEditorIntroLabelInfo} tabIndex={0}>
                        <Icon source={InfoIcon} />
                      </span>
                    </TooltipWrapper>
                  </span>
                  <span className={styles.priceEditorIntroValue}>
                    {shouldUseDirectPriceOverrideExecution ? 'Direct Price' : 'Auto'}
                  </span>
                  <span className={styles.priceEditorIntroHint}>Locked in this step</span>
                </div>
                <div
                  className={`${styles.priceEditorIntroCard} ${styles.priceEditorIntroCardSuccess}`}
                >
                  <span className={styles.priceEditorIntroLabel}>Rule value</span>
                  <span className={styles.priceEditorIntroValue}>{editorRuleValue}</span>
                  <span className={styles.priceEditorIntroHint}>
                    The price rule currently configured
                  </span>
                </div>
              </div>
              {(isAmount || isPercent) && (
                <div className={styles.priceQuickSetStrip}>
                  <Text as="span" variant="bodySm" fontWeight="medium">
                    Quick set:
                  </Text>
                  {isAmount &&
                    PRICE_AMOUNT_PRESETS.map(d => (
                      <Button
                        key={d}
                        size="slim"
                        onClick={() => {
                          setFormData(prev => {
                            const next = [...(prev.variants || [])];
                            next[index] = {
                              ...next[index],
                              config: { ...next[index].config, priceDelta: d },
                            };
                            return { ...prev, variants: next };
                          });
                        }}
                      >
                        {d >= 0 ? `+$${d}` : `−$${Math.abs(d)}`}
                      </Button>
                    ))}
                  {isPercent &&
                    PRICE_PERCENT_PRESETS.map(p => (
                      <Button
                        key={p}
                        size="slim"
                        onClick={() => {
                          setFormData(prev => {
                            const next = [...(prev.variants || [])];
                            next[index] = {
                              ...next[index],
                              config: { ...next[index].config, pricePercent: p },
                            };
                            return { ...prev, variants: next };
                          });
                        }}
                      >
                        {p >= 0 ? `${p}% lower` : `${Math.abs(p)}% higher`}
                      </Button>
                    ))}
                </div>
              )}
              {formData.pricePerProduct &&
              (isProductTargetScope ? priceTargetProductIds.length >= 1 : true) ? (
                <BlockStack gap="400">
                  <div className={styles.priceScopedIntro}>
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Per-product price matrix is enabled for this variant
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Edit product rows and SKU rows in one place. &quot;New selling&quot; is the
                      applied price override.
                    </Text>
                  </div>
                  {!isProductTargetScope && (
                    <div className={styles.priceMatrixScopeMetaStack}>
                      <div className={styles.priceMatrixScopeSearch}>
                        <TextField
                          label="Search products in matrix"
                          labelHidden
                          value={allProductsMatrixSearch}
                          onChange={setAllProductsMatrixSearch}
                          placeholder="Search products by title or handle..."
                          autoComplete="off"
                          clearButton
                          onClearButtonClick={() => setAllProductsMatrixSearch('')}
                        />
                      </div>
                      <div className={styles.priceMatrixScopeMeta}>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Showing {matrixTableProductIds.length} of{' '}
                          {allProductsMatrixProducts.length} loaded products
                        </Text>
                        <InlineStack gap="200" wrap blockAlign="center">
                          {hasMatrixSearchQuery && (
                            <>
                              {matrixSearchQueryTruncated ? (
                                <TooltipWrapper
                                  content={`Search: ${matrixSearchQuery}`}
                                  accessibilityLabel="Full matrix search query"
                                  preferredPosition="above"
                                >
                                  <span
                                    className={styles.priceMatrixSearchBadgeTrigger}
                                    tabIndex={0}
                                  >
                                    <Badge tone="info" size="small">
                                      {matrixSearchBadgeContent}
                                    </Badge>
                                  </span>
                                </TooltipWrapper>
                              ) : (
                                <Badge tone="info" size="small">
                                  {matrixSearchBadgeContent}
                                </Badge>
                              )}
                            </>
                          )}
                          {hasMatrixSearchQuery && (
                            <Button
                              size="slim"
                              variant="plain"
                              onClick={() => setAllProductsMatrixSearch('')}
                            >
                              Clear search
                            </Button>
                          )}
                          {allProductsMatrixPageInfo?.hasNextPage && (
                            <Badge tone="info" size="small">
                              More available
                            </Badge>
                          )}
                          {allProductsMatrixProgressiveWindow.canCollapse && (
                            <Button
                              size="slim"
                              variant="plain"
                              onClick={() =>
                                setAllProductsMatrixVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH)
                              }
                            >
                              Collapse list
                            </Button>
                          )}
                        </InlineStack>
                      </div>
                    </div>
                  )}
                  {!isProductTargetScope && allProductsMatrixError && (
                    <div className={styles.priceMatrixScopeError}>{allProductsMatrixError}</div>
                  )}
                  <div className={styles.priceMatrixBulkBar}>
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Text as="span" variant="bodySm" fontWeight="semibold">
                        Bulk update
                      </Text>
                      <Select
                        label="Bulk mode"
                        labelHidden
                        options={[
                          { label: 'Amount (+/-)', value: 'amount' },
                          { label: 'Percent (+/-)', value: 'percent' },
                        ]}
                        value={priceMatrixBulkMode}
                        onChange={setPriceMatrixBulkMode}
                      />
                      <div className={styles.priceMatrixBulkValueField}>
                        <TextField
                          label="Bulk value"
                          labelHidden
                          type="number"
                          value={priceMatrixBulkValue}
                          onChange={setPriceMatrixBulkValue}
                          placeholder={
                            priceMatrixBulkMode === 'amount' ? 'e.g. -5 or +2' : 'e.g. -10 or +8'
                          }
                          suffix={priceMatrixBulkMode === 'percent' ? '%' : ''}
                          autoComplete="off"
                        />
                      </div>
                      <Button
                        size="slim"
                        disabled={!matrixBulkValueValid}
                        onClick={() => {
                          if (!matrixBulkValueValid) return;
                          const applicableProductIds = [];
                          matrixTableProductIds.forEach(productId => {
                            const matrixProduct = priceMatrixProductsById[productId];
                            const variantsForProduct = Array.isArray(matrixProduct?.variants)
                              ? matrixProduct.variants
                              : [];
                            const countForProduct = variantsForProduct.filter(productVariant => {
                              const variantKey = normalizeNativeVariantIdInput(productVariant?.id);
                              const currentSelling = getMatrixCurrentSellingPrice(productVariant);
                              return Boolean(variantKey) && currentSelling !== null;
                            }).length;
                            if (countForProduct > 0) {
                              applicableProductIds.push(productId);
                            }
                          });
                          if (applicableProductIds.length === 0) {
                            setPriceMatrixBulkSummary(null);
                            setPriceMatrixActionToast({
                              message:
                                'No rows available for bulk update yet. Wait for products to load.',
                              type: 'info',
                            });
                            return;
                          }
                          const bulkRowsByProduct = {};
                          let totalSellingDelta = 0;
                          let appliedRowCount = 0;
                          applicableProductIds.forEach(productId => {
                            const matrixProduct = priceMatrixProductsById[productId];
                            const variantsForProduct = Array.isArray(matrixProduct?.variants)
                              ? matrixProduct.variants
                              : [];
                            const computedRows = [];
                            variantsForProduct.forEach(productVariant => {
                              const variantKey = normalizeNativeVariantIdInput(productVariant?.id);
                              if (!variantKey) return;
                              const currentSelling = getMatrixCurrentSellingPrice(productVariant);
                              if (currentSelling === null) return;
                              const nextSelling =
                                priceMatrixBulkMode === 'percent'
                                  ? currentSelling * (1 + matrixBulkParsedValue / 100)
                                  : currentSelling + matrixBulkParsedValue;
                              const roundedSelling = Math.max(
                                0,
                                Math.round(nextSelling * 100) / 100
                              );
                              computedRows.push({
                                variantKey,
                                roundedSelling,
                              });
                              totalSellingDelta += roundedSelling - currentSelling;
                              appliedRowCount += 1;
                            });
                            if (computedRows.length > 0) {
                              bulkRowsByProduct[productId] = computedRows;
                            }
                          });
                          const bulkTargetProductIds = Object.keys(bulkRowsByProduct);
                          if (bulkTargetProductIds.length === 0 || appliedRowCount === 0) {
                            setPriceMatrixBulkSummary(null);
                            setPriceMatrixActionToast({
                              message:
                                'No valid product prices found for bulk update. Check loaded rows.',
                              type: 'info',
                            });
                            return;
                          }
                          setPriceMatrixUndoByScope(prevUndo => {
                            const nextUndo = { ...prevUndo };
                            const currentByProduct = variant.config?.byProduct || {};
                            bulkTargetProductIds.forEach(productId => {
                              const undoKey = `${index}::${productId}`;
                              const hasProductOverride = Object.prototype.hasOwnProperty.call(
                                currentByProduct,
                                productId
                              );
                              nextUndo[undoKey] = {
                                hadOverride: hasProductOverride,
                                value: hasProductOverride
                                  ? cloneMatrixUndoValue(currentByProduct[productId])
                                  : null,
                              };
                            });
                            return nextUndo;
                          });
                          setFormData(prev => {
                            const next = [...(prev.variants || [])];
                            const c = next[index]?.config || {};
                            const byProduct = { ...(c.byProduct || {}) };
                            bulkTargetProductIds.forEach(productId => {
                              const computedRows = bulkRowsByProduct[productId];
                              if (!Array.isArray(computedRows) || computedRows.length === 0) return;
                              const productOver = {
                                ...(byProduct[productId] || {}),
                                byVariant: { ...(byProduct[productId]?.byVariant || {}) },
                              };
                              computedRows.forEach(({ variantKey, roundedSelling }) => {
                                const rowOver = {
                                  ...(productOver.byVariant?.[variantKey] || {}),
                                  priceMode: 'fixed',
                                  priceBase: 'price',
                                  price: roundedSelling,
                                };
                                productOver.byVariant[variantKey] = rowOver;
                              });
                              byProduct[productId] = productOver;
                            });
                            next[index] = { ...next[index], config: { ...c, byProduct } };
                            return { ...prev, variants: next };
                          });
                          const avgSellingDelta =
                            Math.round((totalSellingDelta / appliedRowCount) * 100) / 100;
                          setPriceMatrixBulkSummary({
                            rows: appliedRowCount,
                            products: bulkTargetProductIds.length,
                            avgSellingDelta,
                            mode: priceMatrixBulkMode,
                            value: matrixBulkParsedValue,
                            updatedAt: Date.now(),
                          });
                          setPriceMatrixActionToast({
                            message: `Applied bulk ${priceMatrixBulkMode === 'percent' ? `${matrixBulkParsedValue}%` : `$${matrixBulkParsedValue.toFixed(2)}`} to ${appliedRowCount} row${appliedRowCount === 1 ? '' : 's'} across ${bulkTargetProductIds.length} product${bulkTargetProductIds.length === 1 ? '' : 's'}.`,
                            type: 'success',
                          });
                        }}
                      >
                        Apply to all rows
                      </Button>
                    </InlineStack>
                    {priceMatrixBulkSummary && (
                      <div className={styles.priceMatrixBulkSummary}>
                        <Text as="span" variant="bodySm" tone="subdued">
                          Last bulk update: {priceMatrixBulkSummary.rows} row
                          {priceMatrixBulkSummary.rows === 1 ? '' : 's'} across{' '}
                          {priceMatrixBulkSummary.products} product
                          {priceMatrixBulkSummary.products === 1 ? '' : 's'} · Avg selling change{' '}
                          {priceMatrixBulkSummary.avgSellingDelta >= 0 ? '+' : '-'}$
                          {Math.abs(priceMatrixBulkSummary.avgSellingDelta).toFixed(2)} per row
                        </Text>
                      </div>
                    )}
                  </div>
                  <div className={styles.priceMatrixWrap}>
                    <table className={styles.priceMatrixTable}>
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Variant</th>
                          <th>Current selling</th>
                          <th>Selling change</th>
                          <th>New selling</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matrixTableProductIds.map(productId => {
                          const matrixProduct = priceMatrixProductsById[productId];
                          const productLabel =
                            matrixProduct?.title || getProductLabelFromId(productId);
                          const productOver =
                            (variant.config?.byProduct && variant.config.byProduct[productId]) ||
                            {};
                          const _productHasOverrides =
                            productOver &&
                            typeof productOver === 'object' &&
                            Object.keys(productOver).length > 0;
                          const scopeKey = `${index}::${productId}`;
                          const undoSnapshot = priceMatrixUndoByScope[scopeKey] || null;
                          const rememberProductUndo = byProductMap => {
                            const hasProductOverride = Object.prototype.hasOwnProperty.call(
                              byProductMap,
                              productId
                            );
                            setPriceMatrixUndoByScope(prevUndo => ({
                              ...prevUndo,
                              [scopeKey]: {
                                hadOverride: hasProductOverride,
                                value: hasProductOverride
                                  ? cloneMatrixUndoValue(byProductMap[productId])
                                  : null,
                              },
                            }));
                          };
                          const _undoLastProductAction = () => {
                            if (!undoSnapshot) return;
                            setFormData(prev => {
                              const next = [...(prev.variants || [])];
                              const c = next[index]?.config || {};
                              const byProduct = { ...(c.byProduct || {}) };
                              if (undoSnapshot.hadOverride) {
                                byProduct[productId] =
                                  cloneMatrixUndoValue(undoSnapshot.value) || {};
                              } else {
                                delete byProduct[productId];
                              }
                              const nextConfig = { ...c };
                              if (Object.keys(byProduct).length > 0) {
                                nextConfig.byProduct = byProduct;
                              } else {
                                delete nextConfig.byProduct;
                              }
                              next[index] = {
                                ...next[index],
                                config: nextConfig,
                              };
                              return { ...prev, variants: next };
                            });
                            setPriceMatrixUndoByScope(prevUndo => {
                              const nextUndo = { ...prevUndo };
                              delete nextUndo[scopeKey];
                              return nextUndo;
                            });
                            setPriceMatrixActionToast({
                              message: `Undid last action for ${productLabel}.`,
                              type: 'success',
                            });
                          };
                          const _applyBulkToSingleProduct = () => {
                            if (!matrixBulkValueValid) return;
                            const variantsForProduct = Array.isArray(matrixProduct?.variants)
                              ? matrixProduct.variants
                              : [];
                            if (!variantsForProduct.length) return;
                            setFormData(prev => {
                              const next = [...(prev.variants || [])];
                              const c = next[index]?.config || {};
                              const byProduct = { ...(c.byProduct || {}) };
                              rememberProductUndo(byProduct);
                              const productEntry = {
                                ...(byProduct[productId] || {}),
                                byVariant: { ...(byProduct[productId]?.byVariant || {}) },
                              };
                              variantsForProduct.forEach(productVariant => {
                                const variantKey = normalizeNativeVariantIdInput(
                                  productVariant?.id
                                );
                                if (!variantKey) return;
                                const currentSelling = getMatrixCurrentSellingPrice(productVariant);
                                if (currentSelling === null) return;
                                const nextSelling =
                                  priceMatrixBulkMode === 'percent'
                                    ? currentSelling * (1 + matrixBulkParsedValue / 100)
                                    : currentSelling + matrixBulkParsedValue;
                                const roundedSelling = Math.max(
                                  0,
                                  Math.round(nextSelling * 100) / 100
                                );
                                productEntry.byVariant[variantKey] = {
                                  ...(productEntry.byVariant?.[variantKey] || {}),
                                  priceMode: 'fixed',
                                  priceBase: 'price',
                                  price: roundedSelling,
                                };
                              });
                              byProduct[productId] = productEntry;
                              next[index] = {
                                ...next[index],
                                config: { ...c, byProduct },
                              };
                              return { ...prev, variants: next };
                            });
                            setPriceMatrixActionToast({
                              message: `Applied bulk ${priceMatrixBulkMode === 'percent' ? `${matrixBulkParsedValue}%` : `$${matrixBulkParsedValue.toFixed(2)}`} to ${productLabel}.`,
                              type: 'success',
                            });
                          };
                          const _clearSingleProductOverrides = () => {
                            setFormData(prev => {
                              const next = [...(prev.variants || [])];
                              const c = next[index]?.config || {};
                              const byProduct = { ...(c.byProduct || {}) };
                              rememberProductUndo(byProduct);
                              delete byProduct[productId];
                              const nextConfig = { ...c };
                              if (Object.keys(byProduct).length > 0) {
                                nextConfig.byProduct = byProduct;
                              } else {
                                delete nextConfig.byProduct;
                              }
                              next[index] = {
                                ...next[index],
                                config: nextConfig,
                              };
                              return { ...prev, variants: next };
                            });
                            setPriceMatrixActionToast({
                              message: `Reset all edits for ${productLabel}.`,
                              type: 'success',
                            });
                          };
                          const _clearSingleProductFieldOverrides = field => {
                            setFormData(prev => {
                              const next = [...(prev.variants || [])];
                              const c = next[index]?.config || {};
                              const byProduct = { ...(c.byProduct || {}) };
                              rememberProductUndo(byProduct);
                              const productEntry = { ...(byProduct[productId] || {}) };
                              const byVariant = { ...(productEntry.byVariant || {}) };

                              if (field === 'price') {
                                delete productEntry.price;
                                delete productEntry.priceMode;
                                delete productEntry.priceBase;
                              } else if (field === 'compareAtPrice') {
                                delete productEntry.compareAtPrice;
                              }

                              Object.entries(byVariant).forEach(([variantId, row]) => {
                                const rowEntry = { ...(row || {}) };
                                if (field === 'price') {
                                  delete rowEntry.price;
                                  delete rowEntry.priceMode;
                                  delete rowEntry.priceBase;
                                } else if (field === 'compareAtPrice') {
                                  delete rowEntry.compareAtPrice;
                                }
                                if (Object.keys(rowEntry).length === 0) delete byVariant[variantId];
                                else byVariant[variantId] = rowEntry;
                              });

                              if (Object.keys(byVariant).length > 0)
                                productEntry.byVariant = byVariant;
                              else delete productEntry.byVariant;

                              if (Object.keys(productEntry).length === 0) {
                                delete byProduct[productId];
                              } else {
                                byProduct[productId] = productEntry;
                              }

                              const nextConfig = { ...c };
                              if (Object.keys(byProduct).length > 0)
                                nextConfig.byProduct = byProduct;
                              else delete nextConfig.byProduct;

                              next[index] = {
                                ...next[index],
                                config: nextConfig,
                              };
                              return { ...prev, variants: next };
                            });
                            setPriceMatrixActionToast({
                              message:
                                field === 'compareAtPrice'
                                  ? `Reverted New actual for ${productLabel}.`
                                  : `Reverted New selling for ${productLabel}.`,
                              type: 'success',
                            });
                          };
                          const productVariants =
                            Array.isArray(matrixProduct?.variants) &&
                            matrixProduct.variants.length > 0
                              ? matrixProduct.variants
                              : [
                                  {
                                    id: null,
                                    displayName: priceMatrixLoadingById[productId]
                                      ? 'Loading variants...'
                                      : priceMatrixErrorById[productId]
                                        ? 'Variant data unavailable'
                                        : 'No variants found',
                                    price: null,
                                    compareAtPrice: null,
                                    _matrixPlaceholder: true,
                                  },
                                ];
                          const rowCount = Math.max(1, productVariants.length);
                          const productRowStates = productVariants.map(productVariant => {
                            const variantKey = normalizeNativeVariantIdInput(productVariant?.id);
                            const variantOver =
                              variantKey &&
                              productOver?.byVariant &&
                              typeof productOver.byVariant === 'object'
                                ? productOver.byVariant[variantKey] || {}
                                : {};
                            const explicitNewSellingValue =
                              variantOver?.price ?? (!variantKey ? productOver?.price : null) ?? '';
                            const currentSelling = getMatrixCurrentSellingPrice(productVariant);
                            const newSellingValue =
                              explicitNewSellingValue !== null &&
                              explicitNewSellingValue !== '' &&
                              Number.isFinite(Number(explicitNewSellingValue))
                                ? String(explicitNewSellingValue)
                                : Number.isFinite(currentSelling)
                                  ? String(currentSelling)
                                  : '';
                            const parsedNewSelling =
                              explicitNewSellingValue !== null &&
                              explicitNewSellingValue !== '' &&
                              Number.isFinite(Number(explicitNewSellingValue))
                                ? Number(explicitNewSellingValue)
                                : null;
                            const hasSellingChange =
                              parsedNewSelling !== null &&
                              (!Number.isFinite(currentSelling) ||
                                Math.abs(parsedNewSelling - currentSelling) >= 0.001);
                            const rowHasChanges = hasSellingChange;
                            const isPlaceholderRow = productVariant?._matrixPlaceholder === true;
                            return {
                              productVariant,
                              variantKey,
                              newSellingValue,
                              currentSelling,
                              hasSellingChange,
                              rowHasChanges,
                              isPlaceholderRow,
                            };
                          });
                          const _productEditedRows = productRowStates.filter(
                            rowState => rowState.rowHasChanges
                          ).length;
                          const _productEditedSellingRows = productRowStates.filter(
                            rowState => rowState.hasSellingChange
                          ).length;
                          return productRowStates.map((rowState, rowIndex) => {
                            const {
                              productVariant,
                              variantKey,
                              newSellingValue,
                              currentSelling,
                              hasSellingChange,
                              rowHasChanges,
                              isPlaceholderRow,
                            } = rowState;
                            const resolvedVariantId =
                              variantKey ||
                              normalizeNativeVariantIdInput(productVariant?.id) ||
                              '-';
                            const variantLabel =
                              productVariant?.displayName || productVariant?.title || '';
                            const newSellingNumeric = parseMatrixPriceNumber(newSellingValue);
                            const sellingDelta =
                              Number.isFinite(currentSelling) && Number.isFinite(newSellingNumeric)
                                ? Math.round((newSellingNumeric - currentSelling) * 100) / 100
                                : null;

                            const updateRowOverride = (field, value) => {
                              setFormData(prev => {
                                const next = [...(prev.variants || [])];
                                const c = next[index]?.config || {};
                                const byProduct = { ...(c.byProduct || {}) };
                                const productEntry = {
                                  ...(byProduct[productId] || {}),
                                  byVariant: { ...(byProduct[productId]?.byVariant || {}) },
                                };
                                if (variantKey) {
                                  const rowEntry = {
                                    ...(productEntry.byVariant?.[variantKey] || {}),
                                  };
                                  if (field === 'price') {
                                    if (value === null) {
                                      delete rowEntry.price;
                                      delete rowEntry.priceMode;
                                      delete rowEntry.priceBase;
                                    } else {
                                      rowEntry.priceMode = 'fixed';
                                      rowEntry.priceBase = 'price';
                                      rowEntry.price = value;
                                    }
                                  } else if (field === 'compareAtPrice') {
                                    if (value === null) delete rowEntry.compareAtPrice;
                                    else rowEntry.compareAtPrice = value;
                                  }
                                  if (Object.keys(rowEntry).length === 0) {
                                    delete productEntry.byVariant[variantKey];
                                  } else {
                                    productEntry.byVariant[variantKey] = rowEntry;
                                  }
                                } else {
                                  if (field === 'price') {
                                    if (value === null) {
                                      delete productEntry.price;
                                      delete productEntry.priceMode;
                                      delete productEntry.priceBase;
                                    } else {
                                      productEntry.priceMode = 'fixed';
                                      productEntry.priceBase = 'price';
                                      productEntry.price = value;
                                    }
                                  } else if (field === 'compareAtPrice') {
                                    if (value === null) delete productEntry.compareAtPrice;
                                    else productEntry.compareAtPrice = value;
                                  }
                                }
                                if (
                                  productEntry.byVariant &&
                                  typeof productEntry.byVariant === 'object' &&
                                  Object.keys(productEntry.byVariant).length === 0
                                ) {
                                  delete productEntry.byVariant;
                                }
                                const productHasSignal =
                                  hasPriceSignalValue(productEntry.price) ||
                                  hasPriceSignalValue(productEntry.compareAtPrice) ||
                                  hasPriceSignalValue(productEntry.priceDelta) ||
                                  hasPriceSignalValue(productEntry.pricePercent) ||
                                  (productEntry.byVariant &&
                                    typeof productEntry.byVariant === 'object' &&
                                    Object.keys(productEntry.byVariant).length > 0);
                                if (productHasSignal) {
                                  byProduct[productId] = productEntry;
                                } else {
                                  delete byProduct[productId];
                                }
                                const nextConfig = { ...c };
                                if (Object.keys(byProduct).length > 0) {
                                  nextConfig.byProduct = byProduct;
                                } else {
                                  delete nextConfig.byProduct;
                                }
                                next[index] = {
                                  ...next[index],
                                  config: nextConfig,
                                };
                                return { ...prev, variants: next };
                              });
                            };

                            return (
                              <tr
                                key={`${productId}-${variantKey || 'all'}-${rowIndex}`}
                                className={`${rowIndex === 0 ? styles.priceMatrixProductStartRow : ''} ${rowHasChanges ? styles.priceMatrixRowChanged : ''}`}
                              >
                                {rowIndex === 0 && (
                                  <td rowSpan={rowCount} className={styles.priceMatrixProductCell}>
                                    <div className={styles.priceMatrixProductIdentity}>
                                      <div className={styles.priceMatrixProductThumbWrap}>
                                        {matrixProduct?.imageUrl ||
                                        priceProductMetaById[productId]?.imageUrl ? (
                                          <img
                                            src={
                                              matrixProduct?.imageUrl ||
                                              priceProductMetaById[productId]?.imageUrl
                                            }
                                            alt={
                                              matrixProduct?.title ||
                                              getProductLabelFromId(productId)
                                            }
                                            className={styles.priceMatrixProductThumb}
                                          />
                                        ) : (
                                          <div
                                            className={styles.priceMatrixProductThumbPlaceholder}
                                            aria-hidden="true"
                                          >
                                            {(
                                              matrixProduct?.title ||
                                              getProductLabelFromId(productId)
                                            )
                                              .trim()
                                              .charAt(0)
                                              .toUpperCase() || 'P'}
                                          </div>
                                        )}
                                      </div>
                                      <div className={styles.priceMatrixProductMain}>
                                        <div className={styles.priceMatrixProductTitle}>
                                          {matrixProduct?.title || getProductLabelFromId(productId)}
                                        </div>
                                        <div className={styles.priceMatrixProductMetaRow}>
                                          <Badge tone="info" size="small">
                                            {rowCount} variant{rowCount === 1 ? '' : 's'}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                    {priceMatrixLoadingById[productId] && (
                                      <div className={styles.priceMatrixProductSubtle}>
                                        Loading variants...
                                      </div>
                                    )}
                                    {priceMatrixErrorById[productId] && (
                                      <div className={styles.priceMatrixProductError}>
                                        {priceMatrixErrorById[productId]}
                                      </div>
                                    )}
                                  </td>
                                )}
                                <td>
                                  <div className={styles.priceMatrixVariantCell}>
                                    {!isPlaceholderRow ? (
                                      <span className={styles.priceMatrixVariantId}>
                                        {resolvedVariantId}
                                      </span>
                                    ) : null}
                                    {variantLabel ? (
                                      <span className={styles.priceMatrixVariantTitle}>
                                        {variantLabel}
                                      </span>
                                    ) : null}
                                  </div>
                                </td>
                                <td>
                                  {Number.isFinite(currentSelling)
                                    ? `$${currentSelling.toFixed(2)}`
                                    : '-'}
                                </td>
                                <td
                                  className={
                                    hasSellingChange ? styles.priceMatrixChangedCellStrong : ''
                                  }
                                >
                                  <TextField
                                    label="Selling change"
                                    labelHidden
                                    type="number"
                                    value={formatMatrixInputNumber(sellingDelta)}
                                    onChange={val => {
                                      if (isPlaceholderRow) return;
                                      const parsedDelta =
                                        val === '' ? null : Number.parseFloat(val);
                                      if (parsedDelta === null) {
                                        updateRowOverride('price', null);
                                        return;
                                      }
                                      if (
                                        !Number.isFinite(parsedDelta) ||
                                        !Number.isFinite(currentSelling)
                                      ) {
                                        return;
                                      }
                                      const nextValue = Math.max(
                                        0,
                                        Math.round((currentSelling + parsedDelta) * 100) / 100
                                      );
                                      updateRowOverride('price', nextValue);
                                    }}
                                    placeholder="+/-"
                                    prefix="$"
                                    autoComplete="off"
                                    disabled={isPlaceholderRow}
                                  />
                                </td>
                                <td
                                  className={
                                    hasSellingChange ? styles.priceMatrixChangedCellStrong : ''
                                  }
                                >
                                  <TextField
                                    label="New selling"
                                    labelHidden
                                    type="number"
                                    value={newSellingValue === null ? '' : String(newSellingValue)}
                                    onChange={val => {
                                      if (isPlaceholderRow) return;
                                      const parsed = val === '' ? null : Number.parseFloat(val);
                                      updateRowOverride(
                                        'price',
                                        parsed === null || Number.isFinite(parsed) ? parsed : null
                                      );
                                    }}
                                    placeholder="Required to apply"
                                    prefix="$"
                                    autoComplete="off"
                                    disabled={isPlaceholderRow}
                                  />
                                </td>
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!isProductTargetScope &&
                    allProductsMatrixLoading &&
                    matrixTableProductIds.length === 0 && (
                      <Text as="p" variant="bodySm" tone="subdued">
                        Loading products for matrix view...
                      </Text>
                    )}
                  {!isProductTargetScope &&
                    (allProductsMatrixProgressiveWindow.hasHiddenLoaded ||
                      allProductsMatrixPageInfo?.hasNextPage) && (
                      <div className={styles.priceMatrixScopeFooter}>
                        <Button
                          size="slim"
                          onClick={handleLoadMoreAllProductsMatrix}
                          loading={allProductsMatrixLoadingMore}
                          disabled={allProductsMatrixLoadingMore}
                        >
                          {allProductsMatrixProgressiveWindow.hasHiddenLoaded
                            ? `Show ${Math.min(
                                allProductsMatrixProgressiveWindow.nextRevealCount ||
                                  PRICE_PRODUCT_MODAL_REVEAL_BATCH,
                                allProductsMatrixProducts.length - matrixTableProductIds.length
                              )} more`
                            : `Show ${PRICE_PRODUCT_MODAL_REVEAL_BATCH} more`}
                        </Button>
                      </div>
                    )}
                </BlockStack>
              ) : (
                <>
                  <div className={styles.priceSectionBlock}>
                    <div className={styles.priceSectionBlockTitle}>
                      <div className={styles.priceSectionBlockTitleCopy}>
                        <span className={styles.priceSectionBlockTitleText}>
                          Choose display price rule
                        </span>
                        <span className={styles.priceSectionBlockTitleHint}>
                          Decide whether this variant keeps catalog price, uses a fixed price, or
                          changes by amount or percent.
                        </span>
                      </div>
                      <TooltipWrapper
                        content="Price mode: Control (catalog), Fixed, $ decrease/increase, or % decrease/increase. Price base (for $ or %): selling price or compare-at. Compare-at may be missing in some themes."
                        accessibilityLabel="Price type info"
                        preferredPosition="above"
                      >
                        <span
                          className={styles.priceSectionTitleInfoIcon}
                          aria-hidden="true"
                          tabIndex={0}
                        >
                          <Icon source={InfoIcon} />
                        </span>
                      </TooltipWrapper>
                    </div>
                    <div className={styles.priceFormRow}>
                      <Select
                        label="Price mode"
                        options={PRICE_MODES}
                        value={mode}
                        onChange={value => {
                          setFormData(prev => {
                            const next = [...(prev.variants || [])];
                            const c = { ...next[index].config, priceMode: value };
                            if (value === 'amount')
                              c.priceDelta = next[index].config?.priceDelta ?? null;
                            if (value === 'percent')
                              c.pricePercent = next[index].config?.pricePercent ?? null;
                            next[index] = { ...next[index], config: c };
                            return { ...prev, variants: next };
                          });
                        }}
                      />
                      {(isAmount || isPercent) && (
                        <Select
                          label="Price base"
                          options={PRICE_BASE_OPTIONS}
                          value={variant.config?.priceBase || 'price'}
                          onChange={value => {
                            setFormData(prev => {
                              const next = [...(prev.variants || [])];
                              next[index] = {
                                ...next[index],
                                config: { ...next[index].config, priceBase: value },
                              };
                              return { ...prev, variants: next };
                            });
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className={styles.priceSectionBlock}>
                    <div className={styles.priceSectionBlockTitle}>
                      <div className={styles.priceSectionBlockTitleCopy}>
                        <span className={styles.priceSectionBlockTitleText}>
                          Set the price value
                        </span>
                        <span className={styles.priceSectionBlockTitleHint}>
                          {isFixed
                            ? 'Enter the exact selling price shoppers should see.'
                            : isAmount
                              ? 'Use a negative amount for a lower price or a positive amount for a premium.'
                              : 'Use a positive percent for a lower price or a negative percent for a premium.'}
                        </span>
                      </div>
                      <TooltipWrapper
                        content="Fixed: exact price on PDP. Amount: catalog price + value (negative = lower, positive = higher). Percent: positive = lower, negative = higher (e.g. 10 = 10% lower, −10 = 10% higher)."
                        accessibilityLabel="Price value info"
                        preferredPosition="above"
                      >
                        <span
                          className={styles.priceSectionTitleInfoIcon}
                          aria-hidden="true"
                          tabIndex={0}
                        >
                          <Icon source={InfoIcon} />
                        </span>
                      </TooltipWrapper>
                    </div>
                    <div className={styles.priceSectionBlockContent}>
                      <FormLayout>
                        {isFixed && (
                          <TextField
                            label="Fixed price"
                            type="number"
                            value={
                              variant.config?.price !== null &&
                              variant.config?.price !== undefined &&
                              variant.config?.price !== ''
                                ? String(variant.config.price)
                                : ''
                            }
                            onChange={value => {
                              const parsed = value === '' ? null : parseFloat(value);
                              setFormData(prev => {
                                const next = [...(prev.variants || [])];
                                next[index] = {
                                  ...next[index],
                                  config: { ...next[index].config, price: parsed },
                                };
                                return { ...prev, variants: next };
                              });
                            }}
                            placeholder="e.g. 24.99 (leave empty for control)"
                            prefix="$"
                            autoComplete="off"
                            min={0}
                            step={0.01}
                          />
                        )}
                        {isAmount && (
                          <TextField
                            label="Amount ($) to add or subtract"
                            type="number"
                            value={
                              variant.config?.priceDelta !== null &&
                              variant.config?.priceDelta !== undefined &&
                              variant.config?.priceDelta !== ''
                                ? String(variant.config.priceDelta)
                                : ''
                            }
                            onChange={value => {
                              const parsed = value === '' ? null : parseFloat(value);
                              setFormData(prev => {
                                const next = [...(prev.variants || [])];
                                next[index] = {
                                  ...next[index],
                                  config: { ...next[index].config, priceDelta: parsed },
                                };
                                return { ...prev, variants: next };
                              });
                            }}
                            placeholder="e.g. -5 for $5 lower, 2 for $2 higher"
                            autoComplete="off"
                          />
                        )}
                        {isPercent && (
                          <TextField
                            label="Percent change"
                            type="number"
                            value={
                              variant.config?.pricePercent !== null &&
                              variant.config?.pricePercent !== undefined
                                ? String(variant.config.pricePercent)
                                : ''
                            }
                            onChange={value => {
                              const parsed = value === '' ? null : parseFloat(value);
                              setFormData(prev => {
                                const next = [...(prev.variants || [])];
                                next[index] = {
                                  ...next[index],
                                  config: { ...next[index].config, pricePercent: parsed },
                                };
                                return { ...prev, variants: next };
                              });
                            }}
                            placeholder="e.g. 10 for 10% lower, −10 for 10% higher"
                            suffix="%"
                            autoComplete="off"
                            min={-100}
                            max={100}
                            step={1}
                          />
                        )}
                      </FormLayout>
                    </div>
                  </div>
                </>
              )}
            </BlockStack>
          </div>
        </div>
      );
    };

    const _priceSummaryRows = variants.map((v, _i) => {
      const cfg = v.config || {};
      const base = (cfg.priceBase || 'price') === 'compare_at' ? 'Compare-at' : 'Selling';
      const isPerProduct =
        formData.pricePerProduct && cfg.byProduct && Object.keys(cfg.byProduct).length > 0;
      return [
        v.name,
        `${v.allocation ?? 0}%`,
        getPriceTypeLabel(cfg),
        cfg.priceMode === 'amount' || cfg.priceMode === 'percent' ? base : '—',
        getPriceValueCell(v),
        isPerProduct ? 'Per product' : getPricePreview(cfg, v.name),
      ];
    });

    return (
      <>
        <BlockStack gap="400">
          <div className={styles.priceStepRoot}>
            {isShopifyFromRoute &&
              !isStandalone &&
              directPriceOverrideReadiness !== 'ready' &&
              directPriceOverrideReadiness !== 'checking' &&
              directPriceOverrideReadiness !== 'unknown' && (
                <Banner tone="warning" title="Direct Price Override is not ready on this shop">
                  <Text as="p" variant="bodySm">
                    {directPriceOverrideStatusMessage} This wizard now saves checkout method as
                    <strong> Auto</strong> until cart transform is ready, so price tests can still
                    run through discount/native paths.
                  </Text>
                </Banner>
              )}
            {isShopifyFromRoute && !isStandalone && directPriceOverrideReadiness === 'unknown' && (
              <Banner tone="warning" title="Price test checkout execution could not be verified">
                <Text as="p" variant="bodySm">
                  {directPriceOverrideStatusMessage} Recheck Shopify function installation before
                  launching this price test.
                </Text>
              </Banner>
            )}
            <div className={styles.priceMetaCompactRow}>
              <div className={styles.priceMetaCompactItem}>
                <Badge tone="success" size="small">
                  {shouldUseDirectPriceOverrideExecution ? 'Direct Price mode' : 'Auto mode'}
                </Badge>
                <TooltipWrapper
                  content={
                    shouldUseDirectPriceOverrideExecution
                      ? 'This step is streamlined: all variants use Direct Price on cart and checkout.'
                      : 'Cart transform is not ready for this shop. RipX will use Auto checkout method until Direct Price Override becomes available.'
                  }
                >
                  <span className={styles.priceMetaCompactInfoIcon} aria-hidden>
                    <Icon source={InfoIcon} />
                  </span>
                </TooltipWrapper>
              </div>
              <button
                type="button"
                className={styles.priceMetaCompactItemButton}
                onClick={() => setPriceGuideSampleOpen(true)}
              >
                <span className={styles.priceMetaCompactItemTitle}>
                  Sample size &amp; run duration
                </span>
                <span className={styles.priceMetaCompactItemHint}>
                  ~300 conversions/variant · 2-4 weeks
                </span>
              </button>
              <div className={styles.priceMetaCompactItem}>
                <span className={styles.priceMetaCompactItemTitle}>Product scope</span>
                <Badge tone={formData.target_type === 'product' ? 'info' : 'success'} size="small">
                  {formData.target_type === 'product' ? 'Selected products' : 'All products'}
                </Badge>
                {formData.target_type === 'product' && (
                  <span className={styles.priceMetaCompactScopeHint}>
                    {priceTargetProductIds.length} selected
                    {Array.isArray(formData.segments?.excluded_product_ids) &&
                    formData.segments.excluded_product_ids.length > 0
                      ? ` · ${formData.segments.excluded_product_ids.length} excluded`
                      : ''}
                  </span>
                )}
                <TooltipWrapper content="Product selection now lives in the Targeting step for both Price and Offer tests.">
                  <span className={styles.priceMetaCompactInfoIcon} aria-hidden>
                    <Icon source={InfoIcon} />
                  </span>
                </TooltipWrapper>
              </div>
              <Button variant="plain" size="slim" onClick={() => setCurrentStep(stepIds.targeting)}>
                Edit in Targeting
              </Button>
            </div>

            <Modal
              open={priceGuideSampleOpen}
              onClose={() => setPriceGuideSampleOpen(false)}
              title="Sample size & run duration"
              primaryAction={{
                content: 'Close',
                onAction: () => setPriceGuideSampleOpen(false),
              }}
            >
              <Modal.Section>
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd">
                    For reliable results, aim for <strong>~300 conversions per variant</strong> to
                    detect a 10% change at 90% confidence.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Typical run time is <strong>2-4 weeks</strong>. Avoid stopping early to reduce
                    false positives.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <Link
                      to={`${ROUTES.DOCS}#price-testing`}
                      className={styles.priceDocLink}
                      rel="noopener noreferrer"
                    >
                      Price testing guide {'->'}
                    </Link>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <a
                      href="https://www.evanmiller.org/ab-testing/sample-size.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.priceDocLink}
                    >
                      Sample size calculator (opens in new tab) {'->'}
                    </a>
                  </Text>
                </BlockStack>
              </Modal.Section>
            </Modal>

            {(isProductTargetScope ? priceTargetProductIds.length >= 1 : true) && (
              <div className={styles.priceOptionCard}>
                <Card>
                  <BlockStack gap="200">
                    <Checkbox
                      label="Set different price per product"
                      helpText={
                        isProductTargetScope
                          ? 'Enable when targeted products need different prices for this variant. Leave off to use one price for all targeted products.'
                          : 'Enable to define different prices product-by-product in all-products scope. Products load progressively to keep editing fast.'
                      }
                      checked={!!formData.pricePerProduct}
                      onChange={checked => {
                        setFormData(prev => {
                          const next = { ...prev, pricePerProduct: !!checked };
                          if (Array.isArray(prev.variants)) {
                            next.variants = prev.variants.map(v => {
                              const config = { ...(v.config || {}) };
                              if (checked) {
                                if (!config.byProduct || typeof config.byProduct !== 'object')
                                  config.byProduct = {};
                              } else if (config.byProduct && typeof config.byProduct === 'object') {
                                delete config.byProduct;
                              }
                              return { ...v, config };
                            });
                          }
                          return next;
                        });
                      }}
                    />
                  </BlockStack>
                </Card>
              </div>
            )}

            <div className={styles.priceConfigWrap}>
              <div className={styles.priceVariantPricingShell}>
                <Card className={`${styles.priceSummaryCard} ${styles.priceSummaryCardCompact}`}>
                  <BlockStack gap="0">
                    <div className={styles.priceSummaryHeader}>
                      <div className={styles.priceSummaryHeaderIcon}>
                        <Icon source={CreditCardIcon} />
                      </div>
                      <BlockStack gap="100">
                        <Text variant="headingSm" as="h3" fontWeight="semibold">
                          Variant pricing
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          Expand a variant row below to edit prices. Optional tools stay tucked
                          away.
                        </Text>
                      </BlockStack>
                      <TooltipWrapper content="Type sets the price rule (Control, Fixed, Amount, Percent). Preview shows PDP display price. Checkout shows how price is applied beyond PDP.">
                        <span
                          style={{ display: 'inline-flex', cursor: 'help', marginLeft: 'auto' }}
                        >
                          <Icon source={InfoIcon} />
                        </span>
                      </TooltipWrapper>
                    </div>
                    {variants.length > 0 && (
                      <>
                        <div className={styles.priceVariantToolsToggle}>
                          <button
                            type="button"
                            className={`${styles.priceVariantToolsToggleBtn} ${priceVariantToolsExpanded ? styles.priceVariantToolsToggleBtnOpen : ''}`}
                            onClick={() => setPriceVariantToolsExpanded(o => !o)}
                            aria-expanded={priceVariantToolsExpanded}
                            id="price-variant-tools-head"
                            aria-controls="price-variant-tools-body"
                          >
                            <span className={styles.priceVariantToolsToggleLabel}>
                              Quick fill, summary &amp; price preview
                            </span>
                            <span className={styles.priceVariantToolsToggleHint} aria-hidden>
                              {priceVariantToolsExpanded ? 'Hide' : 'Show'}
                            </span>
                            <span className={styles.priceVariantToolsToggleChevron} aria-hidden>
                              <Icon source={ChevronDownIcon} />
                            </span>
                          </button>
                        </div>
                        <Collapsible
                          id="price-variant-tools-body"
                          open={priceVariantToolsExpanded}
                          transition={{ duration: '200ms', timingFunction: 'ease' }}
                        >
                          <div className={styles.priceQuickFillStrip}>
                            <Text as="span" variant="bodySm" fontWeight="medium">
                              Quick fill all non-control variants:
                            </Text>
                            <InlineStack gap="200" blockAlign="center" wrap>
                              <Select
                                label="Rule"
                                labelHidden
                                options={[
                                  { label: '% lower than control', value: 'percent_off' },
                                  { label: '% higher than control', value: 'percent_on' },
                                  { label: '$ lower than control', value: 'amount_off' },
                                  { label: '$ higher than control', value: 'amount_on' },
                                ]}
                                value={quickFillRule}
                                onChange={setQuickFillRule}
                              />
                              <div style={{ minWidth: '80px' }}>
                                <TextField
                                  label="Value"
                                  labelHidden
                                  type="number"
                                  value={quickFillValue}
                                  onChange={setQuickFillValue}
                                  placeholder={
                                    quickFillRule.startsWith('percent') ? 'e.g. 10' : 'e.g. 5'
                                  }
                                  autoComplete="off"
                                />
                              </div>
                              <Select
                                label="Round to nearest"
                                labelHidden
                                options={[
                                  { label: 'No rounding', value: '' },
                                  { label: '$0.01', value: '0.01' },
                                  { label: '$0.25', value: '0.25' },
                                  { label: '$0.50', value: '0.50' },
                                  { label: '$1', value: '1' },
                                ]}
                                value={quickFillRoundTo}
                                onChange={setQuickFillRoundTo}
                              />
                              <Button
                                size="slim"
                                onClick={() => {
                                  const num = parseFloat(quickFillValue, 10);
                                  if (!Number.isFinite(num)) return;
                                  const isPercent = quickFillRule.startsWith('percent');
                                  const isOff = quickFillRule.endsWith('_off');
                                  const roundToVal = quickFillRoundTo
                                    ? parseFloat(quickFillRoundTo, 10)
                                    : null;
                                  setFormData(prev => {
                                    const nextVariants = (prev.variants || []).map(v => {
                                      if (getPriceTypeLabel(v.config) === 'Control') return v;
                                      const cfg = { ...(v.config || {}), priceBase: 'price' };
                                      if (isPercent) {
                                        cfg.priceMode = 'percent';
                                        cfg.pricePercent = isOff ? num : -num;
                                        cfg.price = null;
                                        cfg.priceDelta = null;
                                      } else {
                                        cfg.priceMode = 'amount';
                                        cfg.priceDelta = isOff ? -num : num;
                                        cfg.price = null;
                                        cfg.pricePercent = null;
                                      }
                                      if (Number.isFinite(roundToVal) && roundToVal > 0) {
                                        cfg.roundTo = roundToVal;
                                      }
                                      return { ...v, config: cfg };
                                    });
                                    return { ...prev, variants: nextVariants };
                                  });
                                }}
                              >
                                Apply
                              </Button>
                            </InlineStack>
                          </div>
                          <div className={styles.priceAtAGlanceGrid}>
                            <div className={styles.priceAtAGlanceCard}>
                              <span className={styles.priceAtAGlanceLabel}>Variant mix</span>
                              <span className={styles.priceAtAGlanceValue}>
                                {priceDecreaseCount} lower · {priceIncreaseCount} premium
                              </span>
                              <span className={styles.priceAtAGlanceHint}>
                                Based on the current price rules
                              </span>
                            </div>
                            <div className={styles.priceAtAGlanceCard}>
                              <span className={styles.priceAtAGlanceLabel}>Cart Transform</span>
                              <span className={styles.priceAtAGlanceValue}>
                                {directPriceOverrideReadiness === 'ready'
                                  ? 'Ready'
                                  : directPriceOverrideReadiness === 'needs_install'
                                    ? 'Needs install'
                                    : directPriceOverrideReadiness === 'needs_deploy'
                                      ? 'Not deployed'
                                      : directPriceOverrideReadiness === 'checking'
                                        ? 'Checking'
                                        : 'Unknown'}
                              </span>
                              <span className={styles.priceAtAGlanceHint}>
                                Direct Price Override availability
                              </span>
                            </div>
                            <div className={styles.priceAtAGlanceCard}>
                              <span className={styles.priceAtAGlanceLabel}>Product scope</span>
                              <span className={styles.priceAtAGlanceValue}>{scopeLabel}</span>
                              <span className={styles.priceAtAGlanceHint}>
                                Controls where checkout alignment should apply
                              </span>
                            </div>
                          </div>
                          <div className={styles.priceExamplePreview}>
                            <InlineStack gap="200" blockAlign="center" wrap>
                              <div style={{ minWidth: '140px' }}>
                                <TextField
                                  label="Example catalog price"
                                  helpText="See what each variant would show for a given catalog price"
                                  type="number"
                                  value={exampleCatalogPrice}
                                  onChange={setExampleCatalogPrice}
                                  placeholder="e.g. 50"
                                  prefix="$"
                                  autoComplete="off"
                                  min={0}
                                  step={0.01}
                                />
                              </div>
                              {simulationNeedsCompareAt && (
                                <div style={{ minWidth: '180px' }}>
                                  <TextField
                                    label="Example compare-at price"
                                    helpText="Required when any variant uses Compare-at base"
                                    type="number"
                                    value={exampleCompareAtPrice}
                                    onChange={setExampleCompareAtPrice}
                                    placeholder="e.g. 80"
                                    prefix="$"
                                    autoComplete="off"
                                    min={0}
                                    step={0.01}
                                  />
                                </div>
                              )}
                              {parsedExampleCatalog !== null &&
                                (() => {
                                  const catalog = parsedExampleCatalog;
                                  if (simulationNeedsCompareAt && parsedExampleCompareAt === null) {
                                    return (
                                      <span className={styles.priceExamplePreviewResult}>
                                        Add an example compare-at price to simulate variants that
                                        use Compare-at base.
                                      </span>
                                    );
                                  }
                                  const parts = variants.map(v => {
                                    const effective = computeSimulationPrice(v.config, catalog, {
                                      compareAtPrice: parsedExampleCompareAt,
                                    });
                                    const label = v.name;
                                    if (effective === null || effective === undefined)
                                      return `${label}: —`;
                                    return `${label}: $${effective.toFixed(2)}`;
                                  });
                                  return (
                                    <span className={styles.priceExamplePreviewResult}>
                                      If catalog is ${catalog.toFixed(2)}: {parts.join(' · ')}
                                    </span>
                                  );
                                })()}
                            </InlineStack>
                          </div>
                          {priceSimulation.rows.length > 0 && (
                            <div className={styles.priceSimulationWrap}>
                              <div className={styles.priceSimulationHeader}>
                                <InlineStack align="space-between" blockAlign="center" wrap>
                                  <BlockStack gap="100">
                                    <Text as="p" variant="bodySm" fontWeight="semibold">
                                      Effective price simulation
                                    </Text>
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      Simulates what each variation would display for catalog $
                                      {parsedExampleCatalog.toFixed(2)}
                                      {priceSimulation.hasCompareAtBase &&
                                        parsedExampleCompareAt !== null &&
                                        ` (compare-at $${parsedExampleCompareAt.toFixed(2)})`}
                                      {formData.pricePerProduct
                                        ? ', including product/SKU overrides'
                                        : '.'}
                                    </Text>
                                  </BlockStack>
                                  <Button
                                    size="slim"
                                    onClick={() =>
                                      downloadPriceSimulationCsv(priceSimulation.rows, variants)
                                    }
                                  >
                                    Export simulation CSV
                                  </Button>
                                </InlineStack>
                              </div>
                              <div className={styles.priceSummaryTableWrap}>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Scenario</th>
                                      {variants.map((v, idx) => (
                                        <th key={`sim-head-${idx}`}>
                                          {v.name || `Variant ${idx + 1}`}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {priceSimulation.rows.map(row => (
                                      <tr key={row.id}>
                                        <td>{row.label}</td>
                                        {row.prices.map((p, idx) => (
                                          <td key={`${row.id}-${idx}`}>{p}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {(priceSimulation.hasVariantOverrideRows ||
                                priceSimulation.truncated) && (
                                <div className={styles.priceSimulationFootnote}>
                                  {priceSimulation.hasVariantOverrideRows &&
                                    'Includes SKU-specific rows where per-variant overrides are configured. '}
                                  {priceSimulation.hasMissingCompareAt &&
                                    'Rows that use Compare-at base show — until an example compare-at price is provided. '}
                                  {priceSimulation.truncated &&
                                    'Some scenarios are hidden to keep this preview concise.'}
                                </div>
                              )}
                            </div>
                          )}
                        </Collapsible>
                      </>
                    )}
                    {variants.length > 0 && (
                      <div className={styles.priceAccordionActions}>
                        <InlineStack gap="200" blockAlign="center" wrap>
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() =>
                              setPriceAccordionExpandedIndices(variants.map((_, idx) => idx))
                            }
                          >
                            Expand all
                          </Button>
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() => setPriceAccordionExpandedIndices([])}
                          >
                            Collapse all
                          </Button>
                        </InlineStack>
                      </div>
                    )}
                    {variants.length === 0 && (
                      <div className={styles.priceEmptyState}>
                        <div className={styles.priceEmptyStateIcon}>
                          <Icon source={ProductIcon} />
                        </div>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Add variants in the <strong>Traffic</strong> step to configure prices.
                        </Text>
                      </div>
                    )}
                  </BlockStack>
                </Card>
                {variants.length > 0 && (
                  <div className={styles.priceVariantAccordionShell}>
                    <div className={styles.priceSummaryList}>
                      {variants.map((v, i) => {
                        const isControl = getPriceTypeLabel(v.config) === 'Control';
                        const previewText =
                          formData.pricePerProduct &&
                          v.config?.byProduct &&
                          Object.keys(v.config.byProduct || {}).length > 0
                            ? 'Per product'
                            : getPricePreview(v.config, v.name);
                        const isExpanded = priceAccordionExpandedIndices.includes(i);
                        return (
                          <div
                            key={i}
                            className={styles.priceSummaryAccordionItem}
                            style={{ ['--variant-accent']: getVariantColor(i) }}
                          >
                            <button
                              type="button"
                              className={`${styles.priceSummaryRow} ${styles.priceSummaryRowClickable} ${isExpanded ? styles.priceSummaryRowExpanded : ''}`}
                              onClick={() =>
                                setPriceAccordionExpandedIndices(prev =>
                                  prev.includes(i) ? prev.filter(idx => idx !== i) : [...prev, i]
                                )
                              }
                              aria-expanded={isExpanded}
                              aria-controls={`price-accordion-body-${i}`}
                              id={`price-accordion-head-${i}`}
                            >
                              <span className={styles.priceSummaryRowMain}>
                                <span className={styles.priceSummaryRowEyebrow}>
                                  Variant {i + 1} of {variants.length}
                                </span>
                                <span className={styles.priceSummaryRowVariant}>{v.name}</span>
                                <span className={styles.priceSummaryRowMetaChips}>
                                  <Badge tone="info" size="small">
                                    {v.allocation ?? 0}% traffic
                                  </Badge>
                                  <Badge tone={isControl ? 'info' : 'success'} size="small">
                                    {getPriceTypeLabel(v.config)}
                                  </Badge>
                                  {formData.pricePerProduct &&
                                    v.config?.byProduct &&
                                    Object.keys(v.config.byProduct || {}).length > 0 && (
                                      <Badge tone="attention" size="small">
                                        Per product
                                      </Badge>
                                    )}
                                </span>
                                <span
                                  className={`${styles.priceSummaryStatusPill} ${
                                    isExpanded
                                      ? styles.priceSummaryStatusPillActive
                                      : styles.priceSummaryStatusPillMuted
                                  }`}
                                >
                                  {isExpanded ? 'Editing now' : 'Open configuration'}
                                </span>
                              </span>
                              <span className={styles.priceSummaryRowDetails}>
                                <span className={styles.priceSummaryInfoBlock}>
                                  <span className={styles.priceSummaryInfoLabel}>
                                    Display price
                                  </span>
                                  <span
                                    className={styles.priceSummaryInfoValue}
                                    title={previewText}
                                  >
                                    {previewText}
                                  </span>
                                </span>
                                <span className={styles.priceSummaryInfoBlock}>
                                  <span className={styles.priceSummaryInfoLabel}>Rule</span>
                                  <span className={styles.priceSummaryInfoValue}>
                                    {getPriceValueCell(v)}
                                  </span>
                                </span>
                              </span>
                              <span className={styles.priceSummaryAccordionChevron} aria-hidden>
                                <Icon source={ChevronDownIcon} />
                              </span>
                            </button>
                            <Collapsible id={`price-accordion-body-${i}`} open={isExpanded}>
                              <div className={styles.priceAccordionBody}>
                                {renderPriceVariantEditor(i)}
                              </div>
                            </Collapsible>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </BlockStack>
      </>
    );
  };

  const renderVariantShippingModule = () => {
    const strategyOptions = [
      { label: 'Control (no shipping change)', value: 'control' },
      { label: 'Flat shipping rate', value: 'flat_rate' },
      { label: 'Free shipping above threshold', value: 'threshold_free_shipping' },
      { label: 'Shipping discount (%)', value: 'discount_percentage' },
      { label: 'Shipping discount (fixed)', value: 'discount_fixed' },
      { label: 'Force free shipping', value: 'free_shipping' },
      { label: 'Carrier quote adapter', value: 'carrier_quote' },
    ];

    const updateShippingVariantConfig = (index, patch) => {
      const next = [...(formData.variants || [])];
      const current = next[index] || {};
      next[index] = {
        ...current,
        config: {
          ...(current.config || {}),
          ...patch,
        },
      };
      setFormData({ ...formData, variants: next });
    };
    const updateShippingMetadata = (index, patch) => {
      const next = [...(formData.variants || [])];
      const current = next[index] || {};
      next[index] = {
        ...current,
        config: {
          ...(current.config || {}),
          metadata: {
            ...((current.config && current.config.metadata) || {}),
            ...patch,
          },
        },
      };
      setFormData({ ...formData, variants: next });
    };

    const getShippingNumberValue = value =>
      value === null || value === undefined || value === '' ? '' : String(value);

    return (
      <BlockStack gap="400">
        <Banner tone="warning" title="Shipping execution depends on Shopify capabilities">
          <Text as="p" variant="bodySm">
            RipX assigns variants and tracks outcomes. Strategy execution depends on store plan and
            configured Shopify adapters (CarrierService / Discount Function). Use diagnostics
            endpoints to confirm auto-execution readiness for this shop.{' '}
            <Link to={`${ROUTES.DOCS}#tests`} rel="noopener noreferrer">
              Test types &amp; docs →
            </Link>
          </Text>
        </Banner>
        <Text variant="bodyMd" color="subdued" as="p">
          Configure shipping strategy per variant. Keep Control unchanged and set actionable rules
          on test variants.
        </Text>
        {(formData.variants || []).map((variant, index) => {
          const cfg = variant?.config || {};
          const strategy = String(cfg.strategy || cfg.shipping_strategy || '').trim() || 'control';
          const isControlLike = index === 0 || /^control(\s|$)/i.test(String(variant?.name || ''));
          const amountValue =
            cfg.amount !== undefined && cfg.amount !== null ? cfg.amount : (cfg.rate ?? '');
          const thresholdValue =
            cfg.threshold_amount !== undefined && cfg.threshold_amount !== null
              ? cfg.threshold_amount
              : (cfg.free_shipping_threshold ?? '');
          const percentOffValue =
            cfg.percent_off !== undefined && cfg.percent_off !== null
              ? cfg.percent_off
              : (cfg.discount_percent ?? '');
          const metadata = cfg.metadata && typeof cfg.metadata === 'object' ? cfg.metadata : {};
          const quoteProvider = String(metadata.quote_provider || '').trim();
          const zoneCountriesValue = Array.isArray(cfg.zone_countries)
            ? cfg.zone_countries.join(', ')
            : String(cfg.zone_countries || '');
          const strategyGuidance =
            strategy === 'flat_rate'
              ? 'Best for simple fixed-price shipping tests. Watch for multi-profile carts where combined rates can be confusing.'
              : strategy === 'threshold_free_shipping'
                ? 'Use when all qualifying delivery options should become free after the cart threshold is reached.'
                : strategy === 'discount_percentage'
                  ? 'Use for broad shipping discounts that should scale with the selected delivery option.'
                  : strategy === 'discount_fixed'
                    ? 'Use when you want a capped dollar-off shipping incentive regardless of the chosen rate.'
                    : strategy === 'carrier_quote'
                      ? 'Use for provider-backed quotes or Delivery Customization flows. Configure a quote provider before applying CarrierService automation.'
                      : 'Keep control variants unchanged and scope actionable variants carefully.';

          return (
            <Card key={`shipping-${index}`} sectioned>
              <FormLayout>
                <Text variant="headingSm" as="h3">
                  {variant.name}
                </Text>
                <Text variant="bodySm" tone="subdued" as="p">
                  {strategyGuidance}
                </Text>
                <Select
                  label="Shipping strategy"
                  options={strategyOptions}
                  value={strategy}
                  onChange={value => updateShippingVariantConfig(index, { strategy: value })}
                  disabled={isControlLike}
                  helpText={
                    isControlLike
                      ? 'Control variant should stay unchanged.'
                      : 'Choose how this variant should modify shipping behavior.'
                  }
                />

                {strategy === 'flat_rate' && (
                  <TextField
                    label="Flat shipping amount"
                    type="number"
                    value={getShippingNumberValue(amountValue)}
                    onChange={value =>
                      updateShippingVariantConfig(index, {
                        amount: value === '' ? null : Number(value),
                      })
                    }
                    prefix="$"
                    autoComplete="off"
                  />
                )}

                {!isControlLike && strategy !== 'control' && (
                  <>
                    <TextField
                      label="Profile scope (optional)"
                      value={cfg.profile_id || ''}
                      onChange={value => updateShippingVariantConfig(index, { profile_id: value })}
                      placeholder="gid://shopify/DeliveryProfile/..."
                      helpText="Use a delivery profile ID when this variant should only affect one shipping profile."
                      autoComplete="off"
                    />
                    <TextField
                      label="Zone countries (optional)"
                      value={zoneCountriesValue}
                      onChange={value =>
                        updateShippingVariantConfig(index, {
                          zone_countries: value
                            .split(',')
                            .map(item => item.trim().toUpperCase())
                            .filter(Boolean),
                        })
                      }
                      helpText="Comma-separated ISO country codes for quick operator guidance and QA notes."
                      autoComplete="off"
                    />
                  </>
                )}

                {strategy === 'threshold_free_shipping' && (
                  <TextField
                    label="Free shipping threshold"
                    type="number"
                    value={getShippingNumberValue(thresholdValue)}
                    onChange={value =>
                      updateShippingVariantConfig(index, {
                        threshold_amount: value === '' ? null : Number(value),
                      })
                    }
                    prefix="$"
                    autoComplete="off"
                  />
                )}

                {strategy === 'discount_percentage' && (
                  <TextField
                    label="Shipping discount percent"
                    type="number"
                    value={getShippingNumberValue(percentOffValue)}
                    onChange={value =>
                      updateShippingVariantConfig(index, {
                        percent_off: value === '' ? null : Number(value),
                      })
                    }
                    suffix="%"
                    autoComplete="off"
                  />
                )}

                {strategy === 'discount_fixed' && (
                  <TextField
                    label="Shipping discount amount"
                    type="number"
                    value={getShippingNumberValue(amountValue)}
                    onChange={value =>
                      updateShippingVariantConfig(index, {
                        amount: value === '' ? null : Number(value),
                      })
                    }
                    prefix="$"
                    autoComplete="off"
                  />
                )}

                {strategy === 'carrier_quote' && (
                  <>
                    <Select
                      label="Quote provider"
                      options={[
                        { label: 'Select provider', value: '' },
                        { label: 'Static rate', value: 'static_rate' },
                        { label: 'Country table', value: 'country_table' },
                      ]}
                      value={quoteProvider}
                      onChange={value => updateShippingMetadata(index, { quote_provider: value })}
                      helpText="CarrierService automation requires a provider-ready quote source."
                    />
                    <TextField
                      label="Method handles (comma separated, optional)"
                      value={
                        Array.isArray(cfg.method_handles)
                          ? cfg.method_handles.join(', ')
                          : String(cfg.method_handles || '')
                      }
                      onChange={value =>
                        updateShippingVariantConfig(index, {
                          method_handles: value
                            .split(',')
                            .map(item => item.trim())
                            .filter(Boolean),
                        })
                      }
                      autoComplete="off"
                    />
                    {quoteProvider === 'static_rate' && (
                      <TextField
                        label="Provider quote amount"
                        type="number"
                        value={getShippingNumberValue(metadata.quote_amount)}
                        onChange={value =>
                          updateShippingMetadata(index, {
                            quote_amount: value === '' ? null : Number(value),
                          })
                        }
                        prefix="$"
                        autoComplete="off"
                      />
                    )}
                    {quoteProvider === 'country_table' && (
                      <TextField
                        label="Country rates"
                        value={String(metadata.country_rates || '')}
                        onChange={value => updateShippingMetadata(index, { country_rates: value })}
                        helpText="Use `US:5.00,CA:7.50,*:9.00` format for destination-aware fallback quotes."
                        autoComplete="off"
                      />
                    )}
                  </>
                )}
              </FormLayout>
            </Card>
          );
        })}
      </BlockStack>
    );
  };

  const renderVariantOfferModule = () => {
    const offerVariants = formData.variants || [];
    const nonControlIndices = offerVariants
      .map((variant, index) => ({ variant, index }))
      .filter(
        ({ variant, index }) => !(index === 0 || /control/i.test(String(variant?.name || '')))
      )
      .map(({ index }) => index);
    const requiredOfferVariantCount = nonControlIndices.length;
    const offerConfiguredCount = offerVariants.reduce((count, variant, index) => {
      const config = variant?.config || {};
      const dtype = String(config.discount_type || 'percent')
        .trim()
        .toLowerCase();
      const isControlLike = index === 0 || /control/i.test(String(variant?.name || ''));
      const hasNumericValue =
        config.discount_value !== null &&
        config.discount_value !== undefined &&
        String(config.discount_value).trim() !== '' &&
        Number.isFinite(Number(config.discount_value));
      const actionable = dtype === 'free_shipping' || hasNumericValue;
      return count + (!isControlLike && actionable ? 1 : 0);
    }, 0);
    const offerConfiguredPercent =
      requiredOfferVariantCount > 0
        ? Math.max(
            0,
            Math.min(100, Math.round((offerConfiguredCount / requiredOfferVariantCount) * 100))
          )
        : 100;
    const canApplyQuickOffer =
      offerQuickType === 'free_shipping' ||
      (offerQuickValue !== '' && Number.isFinite(Number(offerQuickValue)));

    return (
      <BlockStack gap="400">
        <Banner tone="info" title="Product scope follows Targeting step">
          <Text as="p" variant="bodySm">
            Offer tests follow the same product scope flow as price tests. Current scope:{' '}
            <strong>
              {formData.target_type === 'product' ? 'Selected products' : 'All products'}
            </strong>
            {Array.isArray(formData.segments?.excluded_product_ids) &&
            formData.segments.excluded_product_ids.length > 0
              ? ` with ${formData.segments.excluded_product_ids.length} excluded product(s).`
              : '.'}
          </Text>
        </Banner>
        <Banner tone="warning" title="Offers are not applied at checkout automatically">
          <Text as="p" variant="bodySm">
            RipX assigns the variant for analytics. To apply the discount at checkout, use a{' '}
            <strong>Discount Function</strong> that reads cart attributes, or create discount codes
            per variant and share them.{' '}
            <Link to={`${ROUTES.DOCS}#tests`} rel="noopener noreferrer">
              Test types &amp; docs →
            </Link>
          </Text>
        </Banner>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center" wrap>
              <Text variant="headingSm" as="h3" fontWeight="semibold">
                Offer setup tools
              </Text>
              <InlineStack gap="200" blockAlign="center" wrap>
                <Badge tone="info">{`${offerVariants.length} variants`}</Badge>
                <Badge tone={offerConfiguredCount > 0 ? 'success' : 'attention'}>
                  {`${offerConfiguredCount} configured`}
                </Badge>
              </InlineStack>
            </InlineStack>
            <BlockStack gap="100">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <Text as="span" variant="bodySm" tone="subdued">
                  Readiness: {offerConfiguredCount}/{requiredOfferVariantCount} non-control variants
                  configured
                </Text>
                <Badge tone={offerConfiguredPercent >= 100 ? 'success' : 'attention'} size="small">
                  {offerConfiguredPercent}%
                </Badge>
              </InlineStack>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={offerConfiguredPercent}
                aria-label="Offer variant configuration readiness"
                style={{
                  width: '100%',
                  height: 8,
                  borderRadius: 999,
                  overflow: 'hidden',
                  background: 'rgba(15, 23, 42, 0.12)',
                }}
              >
                <div
                  style={{
                    width: `${offerConfiguredPercent}%`,
                    height: '100%',
                    borderRadius: 999,
                    transition: 'width 180ms ease',
                    background:
                      offerConfiguredPercent >= 100
                        ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                        : 'linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%)',
                  }}
                />
              </div>
            </BlockStack>
            <Text as="p" variant="bodySm" tone="subdued">
              Apply a default offer to all non-control variants, then fine-tune each variant below.
            </Text>
            <InlineStack gap="200" blockAlign="end" wrap>
              <div style={{ minWidth: 210 }}>
                <Select
                  label="Quick type"
                  options={[
                    { label: 'Percentage off', value: 'percent' },
                    { label: 'Fixed amount off', value: 'fixed' },
                    { label: 'Free shipping', value: 'free_shipping' },
                  ]}
                  value={offerQuickType}
                  onChange={value => setOfferQuickType(value)}
                />
              </div>
              <div style={{ minWidth: 170 }}>
                <TextField
                  label="Quick value"
                  type="number"
                  value={offerQuickType === 'free_shipping' ? '' : offerQuickValue}
                  onChange={setOfferQuickValue}
                  disabled={offerQuickType === 'free_shipping'}
                  placeholder={offerQuickType === 'fixed' ? '5.00' : '10'}
                  suffix={offerQuickType === 'percent' ? '%' : ''}
                  prefix={offerQuickType === 'fixed' ? '$' : ''}
                  helpText={
                    offerQuickType === 'free_shipping' ? 'Not needed for free shipping' : ''
                  }
                  autoComplete="off"
                />
              </div>
              <Button
                size="slim"
                variant="primary"
                disabled={!nonControlIndices.length || !canApplyQuickOffer}
                onClick={() => {
                  if (!nonControlIndices.length) {
                    return;
                  }
                  const quickNumeric =
                    offerQuickType === 'free_shipping'
                      ? null
                      : offerQuickValue === ''
                        ? null
                        : parseFloat(offerQuickValue);
                  if (offerQuickType !== 'free_shipping' && !Number.isFinite(quickNumeric)) {
                    return;
                  }
                  setIsDirty(true);
                  const next = [...offerVariants];
                  nonControlIndices.forEach(idx => {
                    const prevCfg =
                      next[idx]?.config && typeof next[idx].config === 'object'
                        ? next[idx].config
                        : {};
                    next[idx] = {
                      ...next[idx],
                      config: {
                        ...prevCfg,
                        discount_type: offerQuickType,
                        discount_value: offerQuickType === 'free_shipping' ? null : quickNumeric,
                      },
                    };
                  });
                  setFormData({ ...formData, variants: next });
                }}
              >
                Apply to non-control variants
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Text variant="bodyMd" color="subdued" as="p">
          Configure the offer logic for each variant below.
        </Text>
        {offerVariants.length > 0 && (
          <div className={styles.priceAccordionActions}>
            <InlineStack gap="200" blockAlign="center" wrap>
              <Button
                size="slim"
                variant="plain"
                onClick={() => setOfferAccordionExpandedIndices(offerVariants.map((_, idx) => idx))}
              >
                Expand all
              </Button>
              <Button
                size="slim"
                variant="plain"
                onClick={() => setOfferAccordionExpandedIndices([])}
              >
                Collapse all
              </Button>
            </InlineStack>
          </div>
        )}
        <div className={styles.priceVariantAccordionShell}>
          <div className={styles.priceSummaryList}>
            {offerVariants.map((variant, index) => {
              const config = variant?.config || {};
              const dtype = String(config.discount_type || 'percent')
                .trim()
                .toLowerCase();
              const configuredCodeName = String(
                config.discount_code_name || config.discountCodeName || ''
              ).trim();
              const autoCodeName = buildAutoOfferCodeName(
                formData.name || 'Offer Test',
                variant?.name || `Variant ${index + 1}`,
                config,
                index
              );
              const effectiveCodeName = configuredCodeName || autoCodeName;
              const isControlLike = index === 0 || /control/i.test(String(variant?.name || ''));
              const hasNumericValue =
                config.discount_value !== null &&
                config.discount_value !== undefined &&
                String(config.discount_value).trim() !== '' &&
                Number.isFinite(Number(config.discount_value));
              const actionable = dtype === 'free_shipping' || hasNumericValue;
              const numericOfferValue = hasNumericValue ? Number(config.discount_value) : null;
              const offerRuleSummary =
                dtype === 'free_shipping'
                  ? 'Free shipping'
                  : hasNumericValue
                    ? dtype === 'fixed'
                      ? `$${numericOfferValue.toFixed(2)} off`
                      : `${numericOfferValue}% off`
                    : 'No discount set';
              const isExpanded = offerAccordionExpandedIndices.includes(index);

              return (
                <div
                  key={`offer-${index}`}
                  className={styles.priceSummaryAccordionItem}
                  style={{ ['--variant-accent']: getVariantColor(index) }}
                >
                  <button
                    type="button"
                    className={`${styles.priceSummaryRow} ${styles.priceSummaryRowClickable} ${
                      isExpanded ? styles.priceSummaryRowExpanded : ''
                    }`}
                    onClick={() =>
                      setOfferAccordionExpandedIndices(prev =>
                        prev.includes(index) ? prev.filter(idx => idx !== index) : [...prev, index]
                      )
                    }
                    aria-expanded={isExpanded}
                    aria-controls={`offer-accordion-body-${index}`}
                    id={`offer-accordion-head-${index}`}
                  >
                    <span className={styles.priceSummaryRowMain}>
                      <span className={styles.priceSummaryRowEyebrow}>
                        Variant {index + 1} of {offerVariants.length}
                      </span>
                      <span className={styles.priceSummaryRowVariant}>{variant.name}</span>
                      <span className={styles.priceSummaryRowMetaChips}>
                        <Badge tone="info" size="small">
                          {`${variant.allocation ?? 0}% traffic`}
                        </Badge>
                        <Badge
                          tone={isControlLike ? 'info' : actionable ? 'success' : 'attention'}
                          size="small"
                        >
                          {isControlLike ? 'Control' : actionable ? 'Configured' : 'Needs config'}
                        </Badge>
                        {dtype === 'free_shipping' && !isControlLike && (
                          <Badge tone="success" size="small">
                            Free shipping
                          </Badge>
                        )}
                      </span>
                      <span
                        className={`${styles.priceSummaryStatusPill} ${
                          isExpanded
                            ? styles.priceSummaryStatusPillActive
                            : styles.priceSummaryStatusPillMuted
                        }`}
                      >
                        {isExpanded ? 'Editing now' : 'Open configuration'}
                      </span>
                    </span>
                    <span className={styles.priceSummaryRowDetails}>
                      <span className={styles.priceSummaryInfoBlock}>
                        <span className={styles.priceSummaryInfoLabel}>Offer rule</span>
                        <span className={styles.priceSummaryInfoValue} title={offerRuleSummary}>
                          {offerRuleSummary}
                        </span>
                      </span>
                      <span className={styles.priceSummaryInfoBlock}>
                        <span className={styles.priceSummaryInfoLabel}>Code name</span>
                        <span className={styles.priceSummaryInfoValue} title={effectiveCodeName}>
                          {effectiveCodeName}
                        </span>
                      </span>
                    </span>
                    <span className={styles.priceSummaryAccordionChevron} aria-hidden>
                      <Icon source={ChevronDownIcon} />
                    </span>
                  </button>
                  <Collapsible id={`offer-accordion-body-${index}`} open={isExpanded}>
                    <div className={styles.priceAccordionBody}>
                      <Card sectioned>
                        <BlockStack gap="300">
                          {isControlLike && (
                            <InlineStack align="space-between" blockAlign="center" wrap>
                              <Text as="p" variant="bodySm" tone="subdued">
                                Keep control clean (no offer) for a reliable baseline.
                              </Text>
                              <Button
                                size="slim"
                                variant="plain"
                                tone="critical"
                                onClick={() => {
                                  setIsDirty(true);
                                  const next = [...offerVariants];
                                  next[index] = {
                                    ...next[index],
                                    config: {
                                      ...next[index]?.config,
                                      discount_type: 'percent',
                                      discount_value: null,
                                    },
                                  };
                                  setFormData({ ...formData, variants: next });
                                }}
                              >
                                Clear control offer
                              </Button>
                            </InlineStack>
                          )}

                          <FormLayout>
                            <Select
                              label={`${variant.name} discount type`}
                              options={[
                                { label: 'Percentage off', value: 'percent' },
                                { label: 'Fixed amount off', value: 'fixed' },
                                { label: 'Free shipping', value: 'free_shipping' },
                              ]}
                              value={dtype}
                              onChange={value => {
                                setIsDirty(true);
                                const next = [...offerVariants];
                                const prevCfg =
                                  next[index]?.config && typeof next[index].config === 'object'
                                    ? next[index].config
                                    : {};
                                next[index] = {
                                  ...next[index],
                                  config: {
                                    ...prevCfg,
                                    discount_type: value,
                                    discount_value:
                                      value === 'free_shipping'
                                        ? null
                                        : (prevCfg.discount_value ?? null),
                                  },
                                };
                                setFormData({ ...formData, variants: next });
                              }}
                            />
                            <TextField
                              label={`${variant.name} discount value`}
                              type="number"
                              value={
                                dtype === 'free_shipping'
                                  ? ''
                                  : config.discount_value !== null &&
                                      config.discount_value !== undefined
                                    ? String(config.discount_value)
                                    : ''
                              }
                              disabled={dtype === 'free_shipping'}
                              onChange={value => {
                                setIsDirty(true);
                                const parsed = value === '' ? null : parseFloat(value);
                                const next = [...offerVariants];
                                const prevCfg =
                                  next[index]?.config && typeof next[index].config === 'object'
                                    ? next[index].config
                                    : {};
                                next[index] = {
                                  ...next[index],
                                  config: {
                                    ...prevCfg,
                                    discount_value: parsed,
                                  },
                                };
                                setFormData({ ...formData, variants: next });
                              }}
                              placeholder={dtype === 'fixed' ? '5.00' : '10'}
                              suffix={dtype === 'percent' ? '%' : ''}
                              prefix={dtype === 'fixed' ? '$' : ''}
                              helpText={
                                dtype === 'percent'
                                  ? 'e.g. 10 for 10% off'
                                  : dtype === 'fixed'
                                    ? 'Amount in store currency, e.g. 5.00'
                                    : 'Free shipping selected; value is not required.'
                              }
                              autoComplete="off"
                            />
                            <TextField
                              label={`${variant.name} discount code name`}
                              value={configuredCodeName}
                              placeholder={autoCodeName}
                              onChange={value => {
                                setIsDirty(true);
                                const normalized = String(value || '')
                                  .toUpperCase()
                                  .replace(/[^A-Z0-9_-]+/g, '-')
                                  .replace(/-+/g, '-')
                                  .replace(/^-|-$/g, '')
                                  .slice(0, 48);
                                const next = [...offerVariants];
                                const prevCfg =
                                  next[index]?.config && typeof next[index].config === 'object'
                                    ? next[index].config
                                    : {};
                                next[index] = {
                                  ...next[index],
                                  config: {
                                    ...prevCfg,
                                    discount_code_name: normalized,
                                  },
                                };
                                setFormData({ ...formData, variants: next });
                              }}
                              autoComplete="off"
                              helpText={`Shown on cart and checkout for this variant. Leave empty to use auto name: ${autoCodeName}`}
                            />
                          </FormLayout>
                        </BlockStack>
                      </Card>
                    </div>
                  </Collapsible>
                </div>
              );
            })}
          </div>
        </div>
      </BlockStack>
    );
  };

  const renderVariantCheckoutModule = () => {
    const checkoutVariants = formData.variants || [];
    const checkoutPhase = normalizeCheckoutPhase(formData.goal?.checkout_phase);
    const phaseDetails = getCheckoutPhaseDetails(checkoutPhase);
    const nonControlIndices = checkoutVariants
      .map((variant, index) => ({ variant, index }))
      .filter(
        ({ variant, index }) => !(index === 0 || /control/i.test(String(variant?.name || '')))
      )
      .map(({ index }) => index);

    const configuredCount = checkoutVariants.reduce((count, variant, index) => {
      const cfg = variant?.config || {};
      const isControlLike = index === 0 || /control/i.test(String(variant?.name || ''));
      let actionable = false;
      if (checkoutPhase === 'experience') {
        actionable = getActionableCheckoutSections(cfg).length > 0;
      } else if (checkoutPhase === 'payment_method') {
        actionable = normalizeCheckoutListInput(cfg.payment_method_names).length > 0;
      } else if (checkoutPhase === 'delivery_method') {
        actionable = normalizeCheckoutListInput(cfg.delivery_method_names).length > 0;
      }
      return count + (!isControlLike && actionable ? 1 : 0);
    }, 0);
    const totalVariants = checkoutVariants.length;
    const activeCheckoutVariantIndex =
      checkoutVariants.length > 0
        ? Math.min(checkoutStudioVariantIndex, checkoutVariants.length - 1)
        : 0;
    const checkoutDocsPath = routeDomain ? ROUTES.appDocs(routeDomain) : ROUTES.DOCS;
    const phaseActionOptions = [
      { label: 'Hide methods', value: 'hide' },
      { label: 'Rename methods', value: 'rename' },
      { label: 'Reorder methods', value: 'reorder' },
    ];
    const phaseActionValue =
      checkoutPhase === 'payment_method'
        ? String(formData.variants?.[1]?.config?.payment_action || 'hide')
        : checkoutPhase === 'delivery_method'
          ? String(formData.variants?.[1]?.config?.delivery_action || 'hide')
          : 'track';
    const selectedPhaseActionLabel =
      phaseActionOptions.find(option => option.value === phaseActionValue)?.label || 'Hide methods';
    const updateCheckoutGoal = patch => {
      setIsDirty(true);
      setFormData(prev => ({
        ...prev,
        goal: {
          ...(prev.goal || {}),
          ...patch,
        },
      }));
    };

    const updateCheckoutVariantConfig = (index, patch) => {
      setIsDirty(true);
      setFormData(prev => {
        const nextVariants = [...(prev.variants || [])];
        const current =
          nextVariants[index]?.config && typeof nextVariants[index].config === 'object'
            ? nextVariants[index].config
            : {};
        nextVariants[index] = {
          ...nextVariants[index],
          config: {
            ...current,
            ...patch,
          },
        };
        return {
          ...prev,
          variants: nextVariants,
        };
      });
    };

    const updateCheckoutExperienceVariantConfig = (index, updater) => {
      setIsDirty(true);
      setFormData(prev => {
        const nextVariants = [...(prev.variants || [])];
        const current =
          nextVariants[index]?.config && typeof nextVariants[index].config === 'object'
            ? nextVariants[index].config
            : {};
        const nextConfig =
          typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
        nextVariants[index] = {
          ...nextVariants[index],
          config: syncLegacyCheckoutExperienceFields(nextConfig),
        };
        return {
          ...prev,
          variants: nextVariants,
        };
      });
    };
    const openCheckoutSection = (variantIndex, sectionIndex, { scrollIntoView = false } = {}) => {
      setCheckoutExpandedSectionsByVariant(prev => ({
        ...prev,
        [variantIndex]: sectionIndex,
      }));
      if (scrollIntoView) {
        setCheckoutPendingScrollTarget({ variantIndex, sectionIndex });
      }
    };
    const toggleCheckoutSection = (variantIndex, sectionIndex) => {
      setCheckoutExpandedSectionsByVariant(prev => {
        const hasStoredValue = Object.prototype.hasOwnProperty.call(prev, variantIndex);
        const currentValue = hasStoredValue ? prev[variantIndex] : 0;
        return {
          ...prev,
          [variantIndex]: currentValue === sectionIndex ? null : sectionIndex,
        };
      });
    };
    const updateCheckoutMethodTargets = (index, configKey, updater) => {
      const currentTargets = normalizeCheckoutListInput(
        checkoutVariants[index]?.config?.[configKey]
      );
      const nextTargets =
        typeof updater === 'function'
          ? normalizeCheckoutListInput(updater(currentTargets))
          : normalizeCheckoutListInput(updater);
      updateCheckoutVariantConfig(index, { [configKey]: nextTargets });
    };
    const renderCheckoutMethodStudio = ({
      index,
      cfg,
      actionKey,
      namesKey,
      renameKey,
      summaryLabel,
      description,
      emptyText,
      inputPlaceholder,
      renamePlaceholder,
      notePlaceholder,
    }) => {
      const actionValue = String(cfg[actionKey] || 'hide');
      const targetMethods = normalizeCheckoutListInput(cfg[namesKey]);
      const methodDraftKey = `${actionKey}-${index}`;
      const methodDraft = String(checkoutMethodDrafts[methodDraftKey] || '');
      const renameValue = String(cfg[renameKey] || '');
      const summaryValue =
        phaseActionOptions.find(option => option.value === actionValue)?.label || 'Hide methods';

      return (
        <div className={styles.checkoutVariantBlock}>
          <div className={styles.checkoutMethodStudio}>
            <div className={styles.checkoutMethodGuide}>
              <span className={styles.checkoutMethodSummaryLabel}>{summaryLabel}</span>
              <span className={styles.checkoutMethodGuideValue}>{summaryValue}</span>
              <Text as="p" variant="bodySm" tone="subdued">
                {description}
              </Text>
              <div className={styles.checkoutMethodMeta}>
                <span className={styles.checkoutVariantChip}>
                  {targetMethods.length} target{targetMethods.length === 1 ? '' : 's'}
                </span>
                <span className={styles.checkoutVariantChip}>
                  {actionValue === 'rename' ? 'Rename output on' : 'Rename output off'}
                </span>
                <span className={styles.checkoutVariantChip}>
                  {String(cfg.checkout_message || '').trim()
                    ? 'Operator note ready'
                    : 'No note yet'}
                </span>
              </div>
              {targetMethods.length > 0 ? (
                <div className={styles.checkoutMethodSummary}>
                  <span className={styles.checkoutMethodSummaryLabel}>Target methods</span>
                  <span className={styles.checkoutMethodSummaryValue}>
                    {getCheckoutListPreview(cfg[namesKey])}
                  </span>
                </div>
              ) : (
                <div className={styles.checkoutMethodEmpty}>{emptyText}</div>
              )}
            </div>

            <div className={styles.checkoutMethodForm}>
              <div className={styles.checkoutMethodActionBar}>
                {phaseActionOptions.map(option => {
                  const active = option.value === actionValue;
                  return (
                    <button
                      key={`${actionKey}-${option.value}`}
                      type="button"
                      className={`${styles.checkoutMethodActionChip} ${active ? styles.checkoutMethodActionChipActive : ''}`}
                      aria-pressed={active}
                      onClick={() =>
                        updateCheckoutVariantConfig(index, { [actionKey]: option.value })
                      }
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className={styles.checkoutMethodEditorPanel}>
                <div className={styles.checkoutMethodEditorHeader}>
                  <div>
                    <Text as="h6" variant="headingSm">
                      Target methods
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Add the checkout-facing method labels you want this action to target.
                    </Text>
                  </div>
                  <Badge tone={targetMethods.length > 0 ? 'info' : 'attention'}>
                    {targetMethods.length} target{targetMethods.length === 1 ? '' : 's'}
                  </Badge>
                </div>

                {targetMethods.length > 0 ? (
                  <BlockStack gap="200">
                    {targetMethods.map((methodName, methodIndex) => (
                      <div
                        key={`${methodDraftKey}-${methodIndex}`}
                        className={styles.checkoutMethodRow}
                      >
                        <TextField
                          label={`${summaryLabel} target ${methodIndex + 1}`}
                          labelHidden
                          value={methodName}
                          onChange={value =>
                            updateCheckoutMethodTargets(index, namesKey, currentTargets =>
                              currentTargets.map((item, currentIndex) =>
                                currentIndex === methodIndex ? value : item
                              )
                            )
                          }
                          autoComplete="off"
                        />
                        <Button
                          tone="critical"
                          variant="secondary"
                          onClick={() =>
                            updateCheckoutMethodTargets(index, namesKey, currentTargets =>
                              currentTargets.filter(
                                (_, currentIndex) => currentIndex !== methodIndex
                              )
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </BlockStack>
                ) : (
                  <div className={styles.checkoutMethodEmpty}>
                    No methods added yet. Build a clean target list instead of maintaining a
                    multiline textarea.
                  </div>
                )}

                <div className={styles.checkoutMethodInputRow}>
                  <TextField
                    label="Add target method"
                    labelHidden
                    placeholder={inputPlaceholder}
                    value={methodDraft}
                    onChange={value =>
                      setCheckoutMethodDrafts(prev => ({
                        ...prev,
                        [methodDraftKey]: value,
                      }))
                    }
                    autoComplete="off"
                  />
                  <Button
                    onClick={() => {
                      const nextValue = methodDraft.trim();
                      if (!nextValue) {
                        return;
                      }
                      updateCheckoutMethodTargets(index, namesKey, currentTargets => [
                        ...currentTargets,
                        nextValue,
                      ]);
                      setCheckoutMethodDrafts(prev => ({
                        ...prev,
                        [methodDraftKey]: '',
                      }));
                    }}
                    disabled={!methodDraft.trim()}
                  >
                    Add target
                  </Button>
                </div>
              </div>

              <div className={styles.checkoutMethodEditorPanel}>
                <div className={styles.checkoutMethodEditorHeader}>
                  <div>
                    <Text as="h6" variant="headingSm">
                      Output controls
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Control the resulting customer-facing label and leave an operator note for the
                      variant intent.
                    </Text>
                  </div>
                </div>
                <div className={styles.checkoutMethodEditorGrid}>
                  <TextField
                    label="Rename matched methods to"
                    value={renameValue}
                    onChange={value => updateCheckoutVariantConfig(index, { [renameKey]: value })}
                    disabled={actionValue !== 'rename'}
                    placeholder={renamePlaceholder}
                    autoComplete="off"
                  />
                  <TextField
                    label="Operator note"
                    value={String(cfg.checkout_message || '')}
                    onChange={value =>
                      updateCheckoutVariantConfig(index, { checkout_message: value })
                    }
                    placeholder={notePlaceholder}
                    multiline={2}
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <BlockStack gap="400">
        <div className={styles.checkoutStudioCompactBar}>
          <div className={styles.checkoutStudioCompactMeta}>
            <span className={styles.checkoutStudioCompactChip}>{phaseDetails.title}</span>
            <span className={styles.checkoutStudioCompactChip}>
              {configuredCount}/{nonControlIndices.length || 1} ready
            </span>
            <span className={styles.checkoutStudioCompactChip}>
              {checkoutPhase === 'experience' ? 'Section design' : selectedPhaseActionLabel}
            </span>
            <span className={styles.checkoutStudioCompactChip}>
              {totalVariants} variant{totalVariants === 1 ? '' : 's'}
            </span>
          </div>
          <TooltipWrapper
            content={
              checkoutPhase === 'experience'
                ? 'Use this step to select the checkout surface once, then edit the active control or treatment tab below. Supporting rollout details stay in readiness and reporting surfaces.'
                : 'Select the checkout surface once, then edit the active control or treatment tab below. Supporting rollout details stay in readiness and reporting surfaces.'
            }
            accessibilityLabel="Checkout studio guidance"
          >
            <span className={styles.checkoutStudioCompactInfo} aria-hidden>
              <Icon source={InfoIcon} />
            </span>
          </TooltipWrapper>
        </div>

        <Card>
          <div className={styles.checkoutPhaseShell}>
            <div className={styles.checkoutPhaseShellTop}>
              <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                <div className={styles.checkoutPhaseHeaderCompact}>
                  <Text variant="headingSm" as="h3" fontWeight="semibold">
                    Checkout surface
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Pick the checkout surface once, then edit the active control or treatment in the
                    tabs below.
                  </Text>
                </div>
                <InlineStack gap="200" blockAlign="center">
                  <Badge tone={configuredCount > 0 ? 'success' : 'attention'}>
                    {configuredCount}/{nonControlIndices.length || 1} configured
                  </Badge>
                  <TooltipWrapper
                    content="Experience block uses the checkout UI extension. Payment and delivery methods use Shopify checkout customizations. Change this once, then continue in the variant tabs."
                    accessibilityLabel="Checkout surface help"
                  >
                    <span className={styles.checkoutStudioCompactInfo} aria-hidden>
                      <Icon source={InfoIcon} />
                    </span>
                  </TooltipWrapper>
                </InlineStack>
              </InlineStack>

              <div className={styles.checkoutPhaseGrid}>
                {CHECKOUT_PHASE_OPTIONS.map(option => {
                  const details = getCheckoutPhaseDetails(option.value);
                  const active = option.value === checkoutPhase;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`${styles.checkoutPhaseCard} ${active ? styles.checkoutPhaseCardActive : ''}`}
                      onClick={() => updateCheckoutGoal({ checkout_phase: option.value })}
                      aria-pressed={active}
                    >
                      <span className={styles.checkoutPhaseEyebrow}>{details.eyebrow}</span>
                      <span className={styles.checkoutPhaseTitle}>{details.title}</span>
                      <span className={styles.checkoutPhaseDescription}>{details.description}</span>
                      <span className={styles.checkoutPhaseSurface}>{details.surface}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={styles.checkoutPhaseInlineNote}>
              <span className={styles.checkoutPhaseInlineNoteLabel}>{phaseDetails.title}</span>
              <span className={styles.checkoutPhaseInlineNoteText}>{phaseDetails.surface}</span>
            </div>
          </div>
        </Card>

        {checkoutVariants.length > 0 && (
          <div className={styles.checkoutVariantBrowser}>
            <div
              className={styles.checkoutVariantBrowserTabs}
              role="tablist"
              aria-label="Checkout variants"
            >
              {checkoutVariants.map((variant, index) => {
                const cfg = variant?.config || {};
                const isControlLike = index === 0 || /control/i.test(String(variant?.name || ''));
                const variantColor = getVariantColor(index);
                const variantConfigured =
                  checkoutPhase === 'experience'
                    ? getActionableCheckoutSections(cfg).length > 0
                    : checkoutPhase === 'payment_method'
                      ? normalizeCheckoutListInput(cfg.payment_method_names).length > 0
                      : normalizeCheckoutListInput(cfg.delivery_method_names).length > 0;
                const active = index === activeCheckoutVariantIndex;
                return (
                  <button
                    key={`checkout-tab-${index}`}
                    id={`checkout-variant-tab-${index}`}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`checkout-variant-panel-${index}`}
                    className={`${styles.checkoutVariantBrowserTab} ${active ? styles.checkoutVariantBrowserTabActive : ''}`}
                    style={{
                      '--checkout-variant-accent': variantColor,
                      '--checkout-variant-accent-soft': getVariantColorLight(variantColor),
                    }}
                    onClick={() => setCheckoutStudioVariantIndex(index)}
                  >
                    <span className={styles.checkoutVariantBrowserDot} aria-hidden />
                    <span className={styles.checkoutVariantBrowserTabMeta}>
                      <span className={styles.checkoutVariantBrowserTabTitle}>
                        {variant?.name || `Variant ${index + 1}`}
                      </span>
                      <span className={styles.checkoutVariantBrowserTabSummary}>
                        {isControlLike
                          ? 'Control baseline'
                          : variantConfigured
                            ? 'Configured treatment'
                            : 'Draft treatment'}
                      </span>
                    </span>
                    <span className={styles.checkoutVariantBrowserTabTraffic}>
                      {variant?.allocation ?? 0}%
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={styles.checkoutVariantBrowserStatus}>
              <span className={styles.checkoutPhaseSummaryChip}>
                Active tab:{' '}
                {checkoutVariants[activeCheckoutVariantIndex]?.name ||
                  `Variant ${activeCheckoutVariantIndex + 1}`}
              </span>
            </div>
          </div>
        )}

        {checkoutVariants.map((variant, index) => {
          const cfg = variant?.config || {};
          const isControlLike = index === 0 || /control/i.test(String(variant?.name || ''));
          const variantColor = getVariantColor(index);
          const normalizedExperience = getNormalizedCheckoutExperienceConfig(cfg);
          const placementLabel =
            CHECKOUT_PLACEMENT_OPTIONS.find(
              option =>
                option.value ===
                String(normalizedExperience.checkout_placement || 'purchase.checkout.block.render')
            )?.label || 'Checkout block';
          const experienceSections =
            normalizedExperience.checkout_sections.length > 0
              ? normalizedExperience.checkout_sections
              : [createEmptyCheckoutSection(0)];
          const actionableSections = getActionableCheckoutSections(cfg);
          const actionableTypeLabels = Array.from(
            new Set(
              actionableSections.map(section => getCheckoutSectionDetails(section.type).label)
            )
          );
          const variantConfigured =
            checkoutPhase === 'experience'
              ? actionableSections.length > 0
              : checkoutPhase === 'payment_method'
                ? normalizeCheckoutListInput(cfg.payment_method_names).length > 0
                : normalizeCheckoutListInput(cfg.delivery_method_names).length > 0;
          if (index !== activeCheckoutVariantIndex) {
            return null;
          }
          return (
            <Card key={`checkout-${index}`}>
              <div
                id={`checkout-variant-panel-${index}`}
                role="tabpanel"
                aria-labelledby={`checkout-variant-tab-${index}`}
                className={styles.checkoutVariantShell}
                style={{
                  '--checkout-variant-accent': variantColor,
                  '--checkout-variant-accent-soft': getVariantColorLight(variantColor),
                }}
              >
                <div className={styles.checkoutVariantHero}>
                  <InlineStack align="space-between" blockAlign="start" wrap gap="300">
                    <div className={styles.checkoutVariantHeroCopy}>
                      <span className={styles.checkoutVariantHeroEyebrow}>
                        {isControlLike ? 'Control baseline' : 'Treatment variant'}
                      </span>
                      <Text variant="headingSm" as="h4" fontWeight="semibold">
                        {variant.name}
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {isControlLike
                          ? 'Baseline checkout experience used as the control.'
                          : `Treatment configured for ${phaseDetails.title.toLowerCase()} with a deployment-safe checkout contract.`}
                      </Text>
                    </div>
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Badge tone="info">{variant.allocation ?? 0}% traffic</Badge>
                      <Badge tone={variantConfigured ? 'success' : 'attention'}>
                        {variantConfigured ? 'Configured' : 'Needs content'}
                      </Badge>
                      <Badge tone={isControlLike ? 'info' : 'success'}>
                        {isControlLike ? 'Control' : phaseDetails.title}
                      </Badge>
                    </InlineStack>
                  </InlineStack>

                  <div className={styles.checkoutVariantMetrics}>
                    <div className={styles.checkoutVariantMetric}>
                      <span className={styles.checkoutVariantMetricLabel}>Phase</span>
                      <span className={styles.checkoutVariantMetricValue}>
                        {phaseDetails.title}
                      </span>
                    </div>
                    <div className={styles.checkoutVariantMetric}>
                      <span className={styles.checkoutVariantMetricLabel}>Status</span>
                      <span className={styles.checkoutVariantMetricValue}>
                        {variantConfigured ? 'Ready to render' : 'Draft'}
                      </span>
                    </div>
                    <div className={styles.checkoutVariantMetric}>
                      <span className={styles.checkoutVariantMetricLabel}>
                        {checkoutPhase === 'experience' ? 'Placement' : 'Surface'}
                      </span>
                      <span className={styles.checkoutVariantMetricValue}>
                        {checkoutPhase === 'experience' ? placementLabel : phaseDetails.surface}
                      </span>
                    </div>
                    <div className={styles.checkoutVariantMetric}>
                      <span className={styles.checkoutVariantMetricLabel}>
                        {checkoutPhase === 'experience' ? 'Renderable units' : 'Target methods'}
                      </span>
                      <span className={styles.checkoutVariantMetricValue}>
                        {checkoutPhase === 'experience'
                          ? `${actionableSections.length} section${actionableSections.length === 1 ? '' : 's'}`
                          : checkoutPhase === 'payment_method'
                            ? `${normalizeCheckoutListInput(cfg.payment_method_names).length} method${normalizeCheckoutListInput(cfg.payment_method_names).length === 1 ? '' : 's'}`
                            : `${normalizeCheckoutListInput(cfg.delivery_method_names).length} method${normalizeCheckoutListInput(cfg.delivery_method_names).length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  </div>
                </div>

                {checkoutPhase === 'experience' ? (
                  <BlockStack gap="300">
                    <div className={styles.checkoutVariantBlock}>
                      <InlineStack align="space-between" blockAlign="center" wrap>
                        <div>
                          <Text as="h5" variant="headingSm">
                            Experience composition
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Build a modular checkout treatment with reusable content blocks, live
                            preview rhythm, and a structured placement contract.
                          </Text>
                        </div>
                        <Badge tone={actionableSections.length > 0 ? 'success' : 'attention'}>
                          {actionableSections.length} renderable section
                          {actionableSections.length === 1 ? '' : 's'}
                        </Badge>
                      </InlineStack>
                      {actionableTypeLabels.length > 0 ? (
                        <div className={styles.checkoutVariantChips}>
                          {actionableTypeLabels.map(label => (
                            <span
                              key={`${variant.name}-${label}`}
                              className={styles.checkoutVariantChip}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className={styles.checkoutVariantEmptyHint}>
                          Start with a smart section below to generate a stronger checkout treatment
                          faster.
                        </div>
                      )}
                      <Select
                        label="Checkout placement"
                        options={CHECKOUT_PLACEMENT_OPTIONS}
                        value={
                          normalizedExperience.checkout_placement ||
                          'purchase.checkout.block.render'
                        }
                        onChange={value =>
                          updateCheckoutExperienceVariantConfig(index, current => ({
                            ...current,
                            checkout_placement: value,
                          }))
                        }
                        helpText="All sections for this variant render inside the checkout block extension."
                      />
                    </div>

                    <div className={styles.checkoutQuickAddShell}>
                      <InlineStack align="space-between" blockAlign="center" wrap gap="300">
                        <div>
                          <Text as="h5" variant="headingSm">
                            Section starters
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Add a preset section first, then refine copy, bullets, and CTA behavior
                            in the editor.
                          </Text>
                        </div>
                        <div className={styles.checkoutStarterHeaderMeta}>
                          <span className={styles.checkoutStarterPill}>Preset copy</span>
                          <span className={styles.checkoutStarterPill}>
                            {CHECKOUT_SECTION_TYPE_OPTIONS.length} starter types
                          </span>
                        </div>
                      </InlineStack>
                      <div className={styles.checkoutQuickAddRow}>
                        {CHECKOUT_SECTION_TYPE_OPTIONS.map(option => (
                          <button
                            key={`${variant.name}-${option.value}`}
                            type="button"
                            className={styles.checkoutQuickAddButton}
                            onClick={() => {
                              openCheckoutSection(index, experienceSections.length, {
                                scrollIntoView: true,
                              });
                              updateCheckoutExperienceVariantConfig(index, current => {
                                const currentSections =
                                  getNormalizedCheckoutExperienceConfig(current).checkout_sections;
                                return {
                                  ...current,
                                  checkout_sections: [
                                    ...currentSections,
                                    {
                                      ...createEmptyCheckoutSection(
                                        currentSections.length,
                                        option.value
                                      ),
                                      props: buildCheckoutSectionSmartPreset(option.value),
                                    },
                                  ],
                                };
                              });
                            }}
                          >
                            <div className={styles.checkoutQuickAddButtonTop}>
                              <strong>{option.label}</strong>
                              <span className={styles.checkoutQuickAddButtonBadge}>Starter</span>
                            </div>
                            <span>{getCheckoutSectionDetails(option.value).description}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <BlockStack gap="300">
                      {experienceSections.map((section, sectionIndex) => {
                        const props = section?.props || {};
                        const isOnlySection = experienceSections.length === 1;
                        const sectionDetails = getCheckoutSectionDetails(section.type);
                        const featureBullets = normalizeCheckoutListInput(props.feature_bullets);
                        const productItems = normalizeCheckoutProductItems(props.product_items);
                        const productSourceMode = normalizeCheckoutProductSourceMode(
                          props.product_source_mode
                        );
                        const productSourceLimit = normalizeCheckoutProductSourceLimit(
                          props.product_source_limit
                        );
                        const productSourceCollections = normalizeCheckoutProductSourceCollections(
                          props.product_source_collections
                        );
                        const renderableProductItems = productItems.filter(
                          hasRenderableCheckoutProductItem
                        );
                        const previewProductItems =
                          section.type === 'product_list' && productSourceMode === 'cart_related'
                            ? buildCheckoutCartRelatedPreviewItems(productSourceLimit)
                            : section.type === 'product_list' && productSourceMode === 'collection'
                              ? buildCheckoutCollectionPreviewItems(
                                  productSourceCollections,
                                  productSourceLimit
                                )
                              : renderableProductItems;
                        const sectionId = String(section?.id || '').trim();
                        const bulletDraftKey = `checkout-bullet-${index}-${section.id || sectionIndex}`;
                        const bulletDraft = String(checkoutBulletDrafts[bulletDraftKey] || '');
                        const hasStoredExpandedSection = Object.prototype.hasOwnProperty.call(
                          checkoutExpandedSectionsByVariant,
                          index
                        );
                        const expandedSectionIndex = hasStoredExpandedSection
                          ? checkoutExpandedSectionsByVariant[index]
                          : 0;
                        const isExpandedSection = expandedSectionIndex === sectionIndex;
                        const sectionSummary =
                          String(props.title || '').trim() ||
                          String(props.message || '').trim() ||
                          (section.type === 'product_list' && productSourceMode === 'cart_related'
                            ? `Cart-related source - ${productSourceLimit} slot${productSourceLimit === 1 ? '' : 's'}`
                            : section.type === 'product_list' &&
                                productSourceMode === 'collection' &&
                                productSourceCollections.length > 0
                              ? `Collection source - ${productSourceCollections.length} collection${productSourceCollections.length === 1 ? '' : 's'}`
                              : productItems.length > 0
                                ? `${productItems.length} product card${productItems.length === 1 ? '' : 's'}`
                                : '') ||
                          (featureBullets.length > 0
                            ? `${featureBullets.length} proof point${featureBullets.length === 1 ? '' : 's'}`
                            : 'No content yet');
                        const hasSectionContent = Boolean(
                          props.title ||
                          props.message ||
                          props.badge_text ||
                          props.disclaimer ||
                          props.cta_label ||
                          featureBullets.length > 0 ||
                          (section.type === 'product_list' &&
                            productSourceMode === 'cart_related') ||
                          (section.type === 'product_list' &&
                            productSourceMode === 'collection' &&
                            productSourceCollections.length > 0) ||
                          renderableProductItems.length > 0
                        );
                        return (
                          <Card key={`${variant.name}-section-${section.id || sectionIndex}`}>
                            <div className={styles.checkoutSectionShell}>
                              <button
                                type="button"
                                className={`${styles.checkoutSectionAccordionHead} ${isExpandedSection ? styles.checkoutSectionAccordionHeadActive : ''}`}
                                onClick={() => toggleCheckoutSection(index, sectionIndex)}
                                aria-expanded={isExpandedSection}
                                aria-controls={`checkout-section-panel-${index}-${sectionIndex}`}
                                id={`checkout-section-head-${index}-${sectionIndex}`}
                              >
                                <div className={styles.checkoutSectionAccordionMain}>
                                  <div className={styles.checkoutSectionAccordionTitleRow}>
                                    <Text variant="headingXs" as="h5" fontWeight="semibold">
                                      Section {sectionIndex + 1}: {sectionDetails.label}
                                    </Text>
                                    <span className={styles.checkoutSectionAccordionSummary}>
                                      {sectionSummary}
                                    </span>
                                  </div>
                                  <div className={styles.checkoutSectionAccordionMeta}>
                                    <span
                                      className={`${styles.checkoutSectionAccordionChip} ${section.enabled === false ? styles.checkoutSectionAccordionChipMuted : ''}`}
                                    >
                                      {section.enabled === false ? 'Disabled' : 'Enabled'}
                                    </span>
                                    <span className={styles.checkoutSectionAccordionChip}>
                                      {String(props.layout || 'banner')}
                                    </span>
                                    <span className={styles.checkoutSectionAccordionChip}>
                                      {String(props.tone || 'success')}
                                    </span>
                                    {sectionId ? (
                                      <span className={styles.checkoutSectionAccordionChip}>
                                        ID: {sectionId}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <span
                                  className={styles.checkoutSectionAccordionChevron}
                                  aria-hidden
                                >
                                  <Icon
                                    source={isExpandedSection ? ChevronDownIcon : ChevronRightIcon}
                                  />
                                </span>
                              </button>

                              <Collapsible
                                open={isExpandedSection}
                                id={`checkout-section-panel-${index}-${sectionIndex}`}
                                transition={{ duration: '180ms', timingFunction: 'ease' }}
                              >
                                <div
                                  className={styles.checkoutSectionAccordionBody}
                                  aria-labelledby={`checkout-section-head-${index}-${sectionIndex}`}
                                >
                                  <div className={styles.checkoutSectionStudio}>
                                    <div
                                      className={`${styles.checkoutSectionPreview} ${!hasSectionContent ? styles.checkoutSectionPreviewEmpty : ''}`}
                                    >
                                      {hasSectionContent ? (
                                        <BlockStack gap="200">
                                          {props.badge_text ? (
                                            <span className={styles.checkoutSectionPreviewBadge}>
                                              {props.badge_text}
                                            </span>
                                          ) : null}
                                          <Text as="h6" variant="headingSm">
                                            {props.title || sectionDetails.label}
                                          </Text>
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            {props.message ||
                                              'Add supporting copy to preview how this section feels inside checkout.'}
                                          </Text>
                                          {featureBullets.length > 0 ? (
                                            <ul className={styles.checkoutSectionPreviewList}>
                                              {featureBullets.slice(0, 3).map(item => (
                                                <li key={item}>{item}</li>
                                              ))}
                                            </ul>
                                          ) : null}
                                          {section.type === 'product_list' &&
                                          productSourceMode === 'collection' &&
                                          productSourceCollections.length > 0 ? (
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              Collections:{' '}
                                              {productSourceCollections
                                                .map(item => item.title || item.handle || item.id)
                                                .filter(Boolean)
                                                .slice(0, 3)
                                                .join(', ')}
                                            </Text>
                                          ) : null}
                                          {previewProductItems.length > 0 ? (
                                            <div className={styles.checkoutProductPreviewList}>
                                              {previewProductItems.slice(0, 3).map(item => (
                                                <div
                                                  key={item.id}
                                                  className={styles.checkoutProductPreviewCard}
                                                >
                                                  {item.image_url ? (
                                                    <div
                                                      className={styles.checkoutProductPreviewMedia}
                                                    >
                                                      <img
                                                        src={item.image_url}
                                                        alt={item.title || 'Product image'}
                                                      />
                                                    </div>
                                                  ) : (
                                                    <div
                                                      className={
                                                        styles.checkoutProductPreviewMediaPlaceholder
                                                      }
                                                    >
                                                      No image
                                                    </div>
                                                  )}
                                                  <div className={styles.checkoutProductPreviewTop}>
                                                    <strong>
                                                      {item.title || 'Untitled product'}
                                                    </strong>
                                                    {item.badge_text ? (
                                                      <span
                                                        className={
                                                          styles.checkoutProductPreviewBadge
                                                        }
                                                      >
                                                        {item.badge_text}
                                                      </span>
                                                    ) : null}
                                                  </div>
                                                  {item.subtitle ? (
                                                    <span
                                                      className={
                                                        styles.checkoutProductPreviewSubtitle
                                                      }
                                                    >
                                                      {item.subtitle}
                                                    </span>
                                                  ) : null}
                                                  {item.price || item.compare_at_price ? (
                                                    <div
                                                      className={
                                                        styles.checkoutProductPreviewPrices
                                                      }
                                                    >
                                                      {item.price ? (
                                                        <strong>{item.price}</strong>
                                                      ) : null}
                                                      {item.compare_at_price ? (
                                                        <span>{item.compare_at_price}</span>
                                                      ) : null}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              ))}
                                            </div>
                                          ) : null}
                                          <div className={styles.checkoutSectionPreviewFooter}>
                                            <span>{String(props.cta_kind || 'track')}</span>
                                            {sectionId ? (
                                              <span className={styles.checkoutSectionPreviewMeta}>
                                                ID: {sectionId}
                                              </span>
                                            ) : null}
                                            {props.cta_label ? (
                                              <strong>{props.cta_label}</strong>
                                            ) : null}
                                          </div>
                                        </BlockStack>
                                      ) : (
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          This section is empty. Add title, message, proof points,
                                          or CTA copy to make it render in checkout.
                                        </Text>
                                      )}
                                    </div>

                                    <div className={styles.checkoutSectionControls}>
                                      <div className={styles.checkoutSectionEditorHeader}>
                                        <InlineStack
                                          align="space-between"
                                          blockAlign="center"
                                          wrap
                                          gap="200"
                                        >
                                          <div>
                                            <Text as="h6" variant="headingSm">
                                              Section editor
                                            </Text>
                                            <Text as="p" variant="bodySm" tone="subdued">
                                              Tune message structure, visual tone, and CTA behavior
                                              for this section.
                                            </Text>
                                            <div className={styles.checkoutSectionEditorMeta}>
                                              <span
                                                className={`${styles.checkoutSectionAccordionChip} ${!hasSectionContent ? styles.checkoutSectionAccordionChipMuted : ''}`}
                                              >
                                                {hasSectionContent
                                                  ? 'Content ready'
                                                  : 'Draft content'}
                                              </span>
                                              <span className={styles.checkoutSectionAccordionChip}>
                                                {section.type === 'product_list'
                                                  ? productSourceMode === 'cart_related'
                                                    ? `Cart-related - ${productSourceLimit} slot${productSourceLimit === 1 ? '' : 's'}`
                                                    : productSourceMode === 'collection'
                                                      ? `Collection - ${productSourceCollections.length} selected`
                                                      : `${productItems.length} product card${productItems.length === 1 ? '' : 's'}`
                                                  : `${featureBullets.length} proof point${featureBullets.length === 1 ? '' : 's'}`}
                                              </span>
                                              <span className={styles.checkoutSectionAccordionChip}>
                                                CTA {String(props.cta_kind || 'track')}
                                              </span>
                                            </div>
                                          </div>
                                          <InlineStack gap="200" blockAlign="center" wrap>
                                            <Button
                                              size="micro"
                                              onClick={() => {
                                                openCheckoutSection(index, sectionIndex + 1, {
                                                  scrollIntoView: true,
                                                });
                                                updateCheckoutExperienceVariantConfig(
                                                  index,
                                                  current => {
                                                    const currentSections =
                                                      getNormalizedCheckoutExperienceConfig(
                                                        current
                                                      ).checkout_sections;
                                                    const source =
                                                      currentSections[sectionIndex] || section;
                                                    const duplicated = {
                                                      ...source,
                                                      id: `${String(source.id || source.type || 'section')}-copy-${currentSections.length + 1}`,
                                                      order: sectionIndex + 1,
                                                    };
                                                    const nextSections = [
                                                      ...currentSections.slice(0, sectionIndex + 1),
                                                      duplicated,
                                                      ...currentSections.slice(sectionIndex + 1),
                                                    ].map((item, itemIndex) => ({
                                                      ...item,
                                                      order: itemIndex,
                                                    }));
                                                    return {
                                                      ...current,
                                                      checkout_sections: nextSections,
                                                    };
                                                  }
                                                );
                                              }}
                                            >
                                              Duplicate
                                            </Button>
                                            <Button
                                              size="micro"
                                              tone="critical"
                                              disabled={isOnlySection}
                                              onClick={() => {
                                                openCheckoutSection(
                                                  index,
                                                  Math.max(
                                                    0,
                                                    Math.min(
                                                      sectionIndex,
                                                      experienceSections.length - 2
                                                    )
                                                  )
                                                );
                                                updateCheckoutExperienceVariantConfig(
                                                  index,
                                                  current => {
                                                    const currentSections =
                                                      getNormalizedCheckoutExperienceConfig(
                                                        current
                                                      ).checkout_sections;
                                                    return {
                                                      ...current,
                                                      checkout_sections: currentSections
                                                        .filter(
                                                          (_, currentIndex) =>
                                                            currentIndex !== sectionIndex
                                                        )
                                                        .map((item, itemIndex) => ({
                                                          ...item,
                                                          order: itemIndex,
                                                        })),
                                                    };
                                                  }
                                                );
                                              }}
                                            >
                                              Remove
                                            </Button>
                                          </InlineStack>
                                        </InlineStack>
                                      </div>
                                      <div className={styles.checkoutSectionActionRow}>
                                        <Button
                                          size="slim"
                                          onClick={() =>
                                            updateCheckoutExperienceVariantConfig(
                                              index,
                                              current => {
                                                const currentSections =
                                                  getNormalizedCheckoutExperienceConfig(
                                                    current
                                                  ).checkout_sections;
                                                return {
                                                  ...current,
                                                  checkout_sections: currentSections.map(
                                                    (item, itemIndex) =>
                                                      itemIndex === sectionIndex
                                                        ? {
                                                            ...item,
                                                            props: buildCheckoutSectionSmartPreset(
                                                              item.type
                                                            ),
                                                          }
                                                        : item
                                                  ),
                                                };
                                              }
                                            )
                                          }
                                        >
                                          Use smart starter
                                        </Button>
                                        <Text as="span" variant="bodySm" tone="subdued">
                                          Auto-fills this section with a strong starting structure
                                          for {sectionDetails.label.toLowerCase()}.
                                        </Text>
                                      </div>
                                      <div className={styles.checkoutSectionMetaGrid}>
                                        <div className={styles.checkoutFieldSpanWide}>
                                          <Checkbox
                                            label="Section enabled"
                                            checked={section.enabled !== false}
                                            onChange={value =>
                                              updateCheckoutExperienceVariantConfig(
                                                index,
                                                current => {
                                                  const currentSections =
                                                    getNormalizedCheckoutExperienceConfig(
                                                      current
                                                    ).checkout_sections;
                                                  return {
                                                    ...current,
                                                    checkout_sections: currentSections.map(
                                                      (item, itemIndex) =>
                                                        itemIndex === sectionIndex
                                                          ? { ...item, enabled: value }
                                                          : item
                                                    ),
                                                  };
                                                }
                                              )
                                            }
                                          />
                                        </div>
                                        <Select
                                          label="Section type"
                                          options={CHECKOUT_SECTION_TYPE_OPTIONS}
                                          value={String(section.type || 'hero_notice')}
                                          onChange={value =>
                                            updateCheckoutExperienceVariantConfig(
                                              index,
                                              current => {
                                                const currentSections =
                                                  getNormalizedCheckoutExperienceConfig(
                                                    current
                                                  ).checkout_sections;
                                                return {
                                                  ...current,
                                                  checkout_sections: currentSections.map(
                                                    (item, itemIndex) =>
                                                      itemIndex === sectionIndex
                                                        ? { ...item, type: value }
                                                        : item
                                                  ),
                                                };
                                              }
                                            )
                                          }
                                        />
                                      </div>

                                      <FormLayout>
                                        <div className={styles.checkoutSectionGuideRow}>
                                          <InlineStack gap="200" blockAlign="center" wrap>
                                            <Text as="span" variant="bodySm" fontWeight="semibold">
                                              Section ID
                                            </Text>
                                            <TooltipWrapper
                                              content="Use a stable kebab-case ID such as trust-box or shipping-promise. RipX emits this as checkout_section_id in checkout analytics, so matching your checkout block naming makes setup and debugging easier."
                                              accessibilityLabel="Section ID setup help"
                                            >
                                              <span
                                                className={styles.checkoutSectionGuideIcon}
                                                aria-hidden
                                              >
                                                <Icon source={InfoIcon} />
                                              </span>
                                            </TooltipWrapper>
                                            <Link
                                              to={`${checkoutDocsPath}#tests`}
                                              className={styles.checkoutInlineDocLink}
                                              rel="noopener noreferrer"
                                            >
                                              Setup guide
                                            </Link>
                                          </InlineStack>
                                          <TextField
                                            labelHidden
                                            label="Section ID"
                                            value={sectionId}
                                            onChange={value =>
                                              updateCheckoutExperienceVariantConfig(
                                                index,
                                                current => {
                                                  const currentSections =
                                                    getNormalizedCheckoutExperienceConfig(
                                                      current
                                                    ).checkout_sections;
                                                  return {
                                                    ...current,
                                                    checkout_sections: currentSections.map(
                                                      (item, itemIndex) =>
                                                        itemIndex === sectionIndex
                                                          ? { ...item, id: value.trim() }
                                                          : item
                                                    ),
                                                  };
                                                }
                                              )
                                            }
                                            placeholder="e.g. trust-box"
                                            autoComplete="off"
                                          />
                                        </div>
                                        <TextField
                                          label="Title"
                                          value={String(props.title || '')}
                                          onChange={value =>
                                            updateCheckoutExperienceVariantConfig(
                                              index,
                                              current => {
                                                const currentSections =
                                                  getNormalizedCheckoutExperienceConfig(
                                                    current
                                                  ).checkout_sections;
                                                return {
                                                  ...current,
                                                  checkout_sections: currentSections.map(
                                                    (item, itemIndex) =>
                                                      itemIndex === sectionIndex
                                                        ? {
                                                            ...item,
                                                            props: {
                                                              ...(item.props || {}),
                                                              title: value,
                                                            },
                                                          }
                                                        : item
                                                  ),
                                                };
                                              }
                                            )
                                          }
                                          placeholder="e.g. Checkout with confidence"
                                          autoComplete="off"
                                        />
                                        <TextField
                                          label="Message"
                                          value={String(props.message || '')}
                                          onChange={value =>
                                            updateCheckoutExperienceVariantConfig(
                                              index,
                                              current => {
                                                const currentSections =
                                                  getNormalizedCheckoutExperienceConfig(
                                                    current
                                                  ).checkout_sections;
                                                return {
                                                  ...current,
                                                  checkout_sections: currentSections.map(
                                                    (item, itemIndex) =>
                                                      itemIndex === sectionIndex
                                                        ? {
                                                            ...item,
                                                            props: {
                                                              ...(item.props || {}),
                                                              message: value,
                                                            },
                                                          }
                                                        : item
                                                  ),
                                                };
                                              }
                                            )
                                          }
                                          placeholder="Add reassurance, urgency, or support copy for this section."
                                          multiline={3}
                                          autoComplete="off"
                                        />
                                        <TextField
                                          label="Badge text"
                                          value={String(props.badge_text || '')}
                                          onChange={value =>
                                            updateCheckoutExperienceVariantConfig(
                                              index,
                                              current => {
                                                const currentSections =
                                                  getNormalizedCheckoutExperienceConfig(
                                                    current
                                                  ).checkout_sections;
                                                return {
                                                  ...current,
                                                  checkout_sections: currentSections.map(
                                                    (item, itemIndex) =>
                                                      itemIndex === sectionIndex
                                                        ? {
                                                            ...item,
                                                            props: {
                                                              ...(item.props || {}),
                                                              badge_text: value,
                                                            },
                                                          }
                                                        : item
                                                  ),
                                                };
                                              }
                                            )
                                          }
                                          placeholder="e.g. Secure checkout"
                                          autoComplete="off"
                                        />
                                        <div className={styles.checkoutBulletEditor}>
                                          <InlineStack
                                            align="space-between"
                                            blockAlign="center"
                                            wrap
                                            gap="200"
                                          >
                                            <InlineStack gap="200" blockAlign="center" wrap>
                                              <Text
                                                as="span"
                                                variant="bodySm"
                                                fontWeight="semibold"
                                              >
                                                Feature bullets
                                              </Text>
                                              <TooltipWrapper
                                                content="Use short proof points, one idea per bullet. These render as a compact list in the checkout block."
                                                accessibilityLabel="Feature bullets help"
                                              >
                                                <span
                                                  className={styles.checkoutSectionGuideIcon}
                                                  aria-hidden
                                                >
                                                  <Icon source={InfoIcon} />
                                                </span>
                                              </TooltipWrapper>
                                              <Link
                                                to={`${checkoutDocsPath}#tests`}
                                                className={styles.checkoutInlineDocLink}
                                                rel="noopener noreferrer"
                                              >
                                                Setup guide
                                              </Link>
                                            </InlineStack>
                                            <Badge tone="info">
                                              {featureBullets.length} item
                                              {featureBullets.length === 1 ? '' : 's'}
                                            </Badge>
                                          </InlineStack>
                                          <BlockStack gap="200">
                                            {featureBullets.length > 0 ? (
                                              featureBullets.map((bullet, bulletIndex) => (
                                                <div
                                                  key={`${section.id || sectionIndex}-bullet-${bulletIndex}`}
                                                  className={styles.checkoutBulletRow}
                                                >
                                                  <TextField
                                                    labelHidden
                                                    label={`Feature bullet ${bulletIndex + 1}`}
                                                    value={bullet}
                                                    onChange={value =>
                                                      updateCheckoutExperienceVariantConfig(
                                                        index,
                                                        current => {
                                                          const currentSections =
                                                            getNormalizedCheckoutExperienceConfig(
                                                              current
                                                            ).checkout_sections;
                                                          return {
                                                            ...current,
                                                            checkout_sections: currentSections.map(
                                                              (item, itemIndex) => {
                                                                if (itemIndex !== sectionIndex) {
                                                                  return item;
                                                                }
                                                                const nextBullets =
                                                                  normalizeCheckoutListInput(
                                                                    item?.props?.feature_bullets
                                                                  );
                                                                nextBullets[bulletIndex] = value;
                                                                return {
                                                                  ...item,
                                                                  props: {
                                                                    ...(item.props || {}),
                                                                    feature_bullets:
                                                                      normalizeCheckoutListInput(
                                                                        nextBullets
                                                                      ),
                                                                  },
                                                                };
                                                              }
                                                            ),
                                                          };
                                                        }
                                                      )
                                                    }
                                                    placeholder="e.g. 30-day guarantee"
                                                    autoComplete="off"
                                                  />
                                                  <Button
                                                    size="micro"
                                                    tone="critical"
                                                    onClick={() =>
                                                      updateCheckoutExperienceVariantConfig(
                                                        index,
                                                        current => {
                                                          const currentSections =
                                                            getNormalizedCheckoutExperienceConfig(
                                                              current
                                                            ).checkout_sections;
                                                          return {
                                                            ...current,
                                                            checkout_sections: currentSections.map(
                                                              (item, itemIndex) => {
                                                                if (itemIndex !== sectionIndex) {
                                                                  return item;
                                                                }
                                                                return {
                                                                  ...item,
                                                                  props: {
                                                                    ...(item.props || {}),
                                                                    feature_bullets:
                                                                      normalizeCheckoutListInput(
                                                                        item?.props?.feature_bullets
                                                                      ).filter(
                                                                        (_, currentBulletIndex) =>
                                                                          currentBulletIndex !==
                                                                          bulletIndex
                                                                      ),
                                                                  },
                                                                };
                                                              }
                                                            ),
                                                          };
                                                        }
                                                      )
                                                    }
                                                  >
                                                    Remove
                                                  </Button>
                                                </div>
                                              ))
                                            ) : (
                                              <div className={styles.checkoutBulletEmpty}>
                                                Add short proof points to show benefits, trust, or
                                                next steps in a compact checkout list.
                                              </div>
                                            )}
                                          </BlockStack>
                                          <InlineStack gap="200" blockAlign="center" wrap>
                                            <TextField
                                              labelHidden
                                              label="New feature bullet"
                                              value={bulletDraft}
                                              onChange={value =>
                                                setCheckoutBulletDrafts(prev => ({
                                                  ...prev,
                                                  [bulletDraftKey]: value,
                                                }))
                                              }
                                              placeholder="e.g. Fast support response"
                                              autoComplete="off"
                                            />
                                            <Button
                                              size="slim"
                                              disabled={!bulletDraft.trim()}
                                              onClick={() => (
                                                updateCheckoutExperienceVariantConfig(
                                                  index,
                                                  current => {
                                                    const currentSections =
                                                      getNormalizedCheckoutExperienceConfig(
                                                        current
                                                      ).checkout_sections;
                                                    return {
                                                      ...current,
                                                      checkout_sections: currentSections.map(
                                                        (item, itemIndex) => {
                                                          if (itemIndex !== sectionIndex) {
                                                            return item;
                                                          }
                                                          return {
                                                            ...item,
                                                            props: {
                                                              ...(item.props || {}),
                                                              feature_bullets: [
                                                                ...normalizeCheckoutListInput(
                                                                  item?.props?.feature_bullets
                                                                ),
                                                                bulletDraft.trim(),
                                                              ],
                                                            },
                                                          };
                                                        }
                                                      ),
                                                    };
                                                  }
                                                ),
                                                setCheckoutBulletDrafts(prev => ({
                                                  ...prev,
                                                  [bulletDraftKey]: '',
                                                }))
                                              )}
                                            >
                                              Add bullet
                                            </Button>
                                          </InlineStack>
                                        </div>
                                        {section.type === 'product_list' ? (
                                          <div className={styles.checkoutProductEditor}>
                                            <InlineStack
                                              align="space-between"
                                              blockAlign="center"
                                              wrap
                                              gap="200"
                                            >
                                              <InlineStack gap="200" blockAlign="center" wrap>
                                                <Text
                                                  as="span"
                                                  variant="bodySm"
                                                  fontWeight="semibold"
                                                >
                                                  Product cards
                                                </Text>
                                                <TooltipWrapper
                                                  content="Add manual product cards for checkout merchandising. Keep them short and high intent."
                                                  accessibilityLabel="Product cards help"
                                                >
                                                  <span
                                                    className={styles.checkoutSectionGuideIcon}
                                                    aria-hidden
                                                  >
                                                    <Icon source={InfoIcon} />
                                                  </span>
                                                </TooltipWrapper>
                                              </InlineStack>
                                              <Badge
                                                tone={
                                                  productSourceMode === 'cart_related' ||
                                                  productSourceMode === 'collection'
                                                    ? 'success'
                                                    : productItems.length > 0
                                                      ? 'info'
                                                      : 'attention'
                                                }
                                              >
                                                {productSourceMode === 'cart_related'
                                                  ? `Cart-related - ${productSourceLimit}`
                                                  : productSourceMode === 'collection'
                                                    ? `Collection - ${productSourceCollections.length} picked`
                                                    : `${productItems.length} card${productItems.length === 1 ? '' : 's'}`}
                                              </Badge>
                                            </InlineStack>
                                            <div className={styles.checkoutProductSourceControls}>
                                              <Select
                                                label="Product source"
                                                options={CHECKOUT_PRODUCT_SOURCE_OPTIONS}
                                                value={productSourceMode}
                                                onChange={value =>
                                                  updateCheckoutExperienceVariantConfig(
                                                    index,
                                                    current => {
                                                      const currentSections =
                                                        getNormalizedCheckoutExperienceConfig(
                                                          current
                                                        ).checkout_sections;
                                                      return {
                                                        ...current,
                                                        checkout_sections: currentSections.map(
                                                          (item, itemIndex) =>
                                                            itemIndex === sectionIndex
                                                              ? {
                                                                  ...item,
                                                                  props: {
                                                                    ...(item.props || {}),
                                                                    product_source_mode: value,
                                                                    ...(value === 'collection'
                                                                      ? { product_items: [] }
                                                                      : {}),
                                                                    ...(value === 'manual' ||
                                                                    value === 'cart_related'
                                                                      ? {
                                                                          product_source_collections:
                                                                            [],
                                                                        }
                                                                      : {}),
                                                                  },
                                                                }
                                                              : item
                                                        ),
                                                      };
                                                    }
                                                  )
                                                }
                                                helpText="Manual cards are fully curated. Cart-related mirrors the shopper cart. Collection-fed pulls featured products from the collections you pick (resolved at checkout runtime)."
                                              />
                                              <Select
                                                label="Max cards"
                                                options={CHECKOUT_PRODUCT_SOURCE_LIMIT_OPTIONS}
                                                value={String(productSourceLimit)}
                                                onChange={value =>
                                                  updateCheckoutExperienceVariantConfig(
                                                    index,
                                                    current => {
                                                      const currentSections =
                                                        getNormalizedCheckoutExperienceConfig(
                                                          current
                                                        ).checkout_sections;
                                                      return {
                                                        ...current,
                                                        checkout_sections: currentSections.map(
                                                          (item, itemIndex) =>
                                                            itemIndex === sectionIndex
                                                              ? {
                                                                  ...item,
                                                                  props: {
                                                                    ...(item.props || {}),
                                                                    product_source_limit: value,
                                                                  },
                                                                }
                                                              : item
                                                        ),
                                                      };
                                                    }
                                                  )
                                                }
                                                helpText="Controls how many products the block shows in checkout."
                                              />
                                            </div>
                                            {productSourceMode === 'cart_related' ? (
                                              <div className={styles.checkoutProductSourceNote}>
                                                Cart-related mode pulls up to {productSourceLimit}{' '}
                                                product
                                                {productSourceLimit === 1 ? '' : 's'} from the live
                                                checkout cart at runtime. Titles, images,
                                                quantities, and price text come from the shopper
                                                cart automatically.
                                              </div>
                                            ) : null}
                                            {productSourceMode === 'collection' ? (
                                              <BlockStack gap="300">
                                                <div className={styles.checkoutProductSourceNote}>
                                                  Collection-fed mode shows up to{' '}
                                                  {productSourceLimit} product
                                                  {productSourceLimit === 1 ? '' : 's'} from your
                                                  selected Shopify collections. The live checkout
                                                  block receives resolved product cards when the
                                                  shopper loads checkout (same secret-protected
                                                  assignment request as other checkout UI data).
                                                </div>
                                                {canUseStoreProductPicker ? (
                                                  <div className={styles.storeResourceList}>
                                                    <div className={styles.storeResourceListHeader}>
                                                      <div
                                                        className={styles.storeResourceListSearch}
                                                      >
                                                        <TextField
                                                          label="Search collections"
                                                          labelHidden
                                                          value={checkoutCollectionSearch}
                                                          onChange={setCheckoutCollectionSearch}
                                                          placeholder="Search collections…"
                                                          autoComplete="off"
                                                          clearButton
                                                          onClearButtonClick={() =>
                                                            setCheckoutCollectionSearch('')
                                                          }
                                                        />
                                                      </div>
                                                      {productSourceCollections.length > 0 ? (
                                                        <span
                                                          className={
                                                            styles.storeResourceSelectedBadge
                                                          }
                                                        >
                                                          {productSourceCollections.length} selected
                                                        </span>
                                                      ) : null}
                                                    </div>
                                                    {checkoutCollectionLoading ? (
                                                      <div
                                                        className={styles.storeResourceListLoading}
                                                      >
                                                        <div
                                                          className={
                                                            styles.storeResourceListLoadingIcon
                                                          }
                                                        >
                                                          <Spinner size="small" />
                                                        </div>
                                                        <Text
                                                          as="span"
                                                          variant="bodySm"
                                                          tone="subdued"
                                                        >
                                                          Loading collections…
                                                        </Text>
                                                      </div>
                                                    ) : checkoutCollectionResources.length === 0 ? (
                                                      <div
                                                        className={styles.storeResourceListEmpty}
                                                      >
                                                        <div
                                                          className={
                                                            styles.storeResourceListEmptyIcon
                                                          }
                                                        >
                                                          <Icon source={CollectionIcon} />
                                                        </div>
                                                        <Text
                                                          as="p"
                                                          variant="bodySm"
                                                          tone="subdued"
                                                        >
                                                          {checkoutCollectionError ||
                                                            (checkoutCollectionSearch
                                                              ? 'No matches. Try a different search.'
                                                              : 'No collections returned yet.')}
                                                        </Text>
                                                      </div>
                                                    ) : (
                                                      (() => {
                                                        const selectedCollectionIds =
                                                          productSourceCollections.map(c => c.id);
                                                        const collectionsProgressiveWindow =
                                                          buildProgressiveListWindow(
                                                            checkoutCollectionResources,
                                                            checkoutCollectionVisibleCount,
                                                            { pinnedIds: selectedCollectionIds }
                                                          );
                                                        const visibleCheckoutCollections =
                                                          collectionsProgressiveWindow.visibleItems;
                                                        const shownCheckoutCollectionsCount =
                                                          collectionsProgressiveWindow.shownCount;
                                                        const checkoutCollectionsHasHiddenLoaded =
                                                          collectionsProgressiveWindow.hasHiddenLoaded;
                                                        const checkoutCollectionsCanFetchMore =
                                                          Boolean(
                                                            checkoutCollectionPageInfo?.hasNextPage
                                                          );
                                                        const checkoutCollectionsCanShowMore =
                                                          checkoutCollectionsHasHiddenLoaded ||
                                                          checkoutCollectionsCanFetchMore;
                                                        const checkoutCollectionsCanCollapse =
                                                          collectionsProgressiveWindow.canCollapse;
                                                        const loadedCollectionIdSet = new Set(
                                                          checkoutCollectionResources.map(r =>
                                                            String(r?.id || '')
                                                          )
                                                        );
                                                        const missingCheckoutCollections =
                                                          productSourceCollections.filter(
                                                            c =>
                                                              c?.id &&
                                                              !loadedCollectionIdSet.has(
                                                                String(c.id)
                                                              )
                                                          );
                                                        const renderCheckoutCollectionRow = (
                                                          resource,
                                                          rowKey
                                                        ) => {
                                                          const active =
                                                            selectedCollectionIds.includes(
                                                              resource.id
                                                            );
                                                          return (
                                                            <button
                                                              key={rowKey}
                                                              type="button"
                                                              className={`${styles.storeResourceItem} ${active ? styles.storeResourceItemSelected : ''}`}
                                                              onClick={() =>
                                                                updateCheckoutExperienceVariantConfig(
                                                                  index,
                                                                  current => {
                                                                    const currentSections =
                                                                      getNormalizedCheckoutExperienceConfig(
                                                                        current
                                                                      ).checkout_sections;
                                                                    return {
                                                                      ...current,
                                                                      checkout_sections:
                                                                        currentSections.map(
                                                                          (item, itemIndex) => {
                                                                            if (
                                                                              itemIndex !==
                                                                              sectionIndex
                                                                            ) {
                                                                              return item;
                                                                            }
                                                                            const existing =
                                                                              normalizeCheckoutProductSourceCollections(
                                                                                item?.props
                                                                                  ?.product_source_collections
                                                                              );
                                                                            const isSelected =
                                                                              existing.some(
                                                                                row =>
                                                                                  row.id ===
                                                                                  resource.id
                                                                              );
                                                                            const nextCollections =
                                                                              isSelected
                                                                                ? existing.filter(
                                                                                    row =>
                                                                                      row.id !==
                                                                                      resource.id
                                                                                  )
                                                                                : [
                                                                                    ...existing,
                                                                                    {
                                                                                      id: resource.id,
                                                                                      title:
                                                                                        resource.title ||
                                                                                        '',
                                                                                      handle:
                                                                                        resource.handle ||
                                                                                        '',
                                                                                    },
                                                                                  ];
                                                                            return {
                                                                              ...item,
                                                                              props: {
                                                                                ...(item.props ||
                                                                                  {}),
                                                                                product_source_collections:
                                                                                  nextCollections,
                                                                              },
                                                                            };
                                                                          }
                                                                        ),
                                                                    };
                                                                  }
                                                                )
                                                              }
                                                            >
                                                              <span
                                                                className={
                                                                  styles.storeResourceItemIcon
                                                                }
                                                              >
                                                                <Icon source={CollectionIcon} />
                                                              </span>
                                                              <span
                                                                className={
                                                                  styles.storeResourceItemContent
                                                                }
                                                              >
                                                                <span
                                                                  className={
                                                                    styles.storeResourceItemTitle
                                                                  }
                                                                >
                                                                  {resource.title ||
                                                                    'Untitled collection'}
                                                                </span>
                                                                {resource.handle ? (
                                                                  <span
                                                                    className={
                                                                      styles.storeResourceItemHandle
                                                                    }
                                                                  >
                                                                    /{resource.handle}
                                                                  </span>
                                                                ) : loadedCollectionIdSet.has(
                                                                    String(resource.id)
                                                                  ) ? null : (
                                                                  <span
                                                                    className={
                                                                      styles.storeResourceItemHandle
                                                                    }
                                                                  >
                                                                    Previously selected
                                                                  </span>
                                                                )}
                                                              </span>
                                                            </button>
                                                          );
                                                        };
                                                        return (
                                                          <>
                                                            <div
                                                              className={
                                                                styles.storeResourceListMeta
                                                              }
                                                            >
                                                              <Text
                                                                as="span"
                                                                variant="bodySm"
                                                                tone="subdued"
                                                              >
                                                                Showing{' '}
                                                                {shownCheckoutCollectionsCount} of{' '}
                                                                {checkoutCollectionResources.length}{' '}
                                                                loaded
                                                              </Text>
                                                              <InlineStack
                                                                gap="200"
                                                                wrap
                                                                blockAlign="center"
                                                              >
                                                                {checkoutCollectionsCanFetchMore && (
                                                                  <Badge tone="info" size="small">
                                                                    More available
                                                                  </Badge>
                                                                )}
                                                                {checkoutCollectionsCanCollapse && (
                                                                  <Button
                                                                    size="slim"
                                                                    variant="plain"
                                                                    onClick={() =>
                                                                      setCheckoutCollectionVisibleCount(
                                                                        PRICE_PRODUCT_MODAL_REVEAL_BATCH
                                                                      )
                                                                    }
                                                                  >
                                                                    Collapse
                                                                  </Button>
                                                                )}
                                                              </InlineStack>
                                                            </div>
                                                            <div
                                                              className={
                                                                styles.storeResourceListScroll
                                                              }
                                                            >
                                                              {visibleCheckoutCollections.map(
                                                                resource =>
                                                                  renderCheckoutCollectionRow(
                                                                    resource,
                                                                    resource.id
                                                                  )
                                                              )}
                                                              {missingCheckoutCollections.map(c =>
                                                                renderCheckoutCollectionRow(
                                                                  {
                                                                    id: c.id,
                                                                    title:
                                                                      c.title ||
                                                                      String(c.id).replace(
                                                                        /.*\//,
                                                                        ''
                                                                      ),
                                                                    handle: c.handle || '',
                                                                  },
                                                                  `saved-${c.id}`
                                                                )
                                                              )}
                                                            </div>
                                                            {checkoutCollectionsCanShowMore && (
                                                              <div
                                                                className={
                                                                  styles.storeResourceListFooter
                                                                }
                                                              >
                                                                <Button
                                                                  size="slim"
                                                                  onClick={
                                                                    handleLoadMoreCheckoutCollections
                                                                  }
                                                                  loading={
                                                                    checkoutCollectionLoadingMore
                                                                  }
                                                                  disabled={
                                                                    checkoutCollectionLoadingMore
                                                                  }
                                                                >
                                                                  {checkoutCollectionsHasHiddenLoaded
                                                                    ? `Show ${Math.min(
                                                                        collectionsProgressiveWindow.nextRevealCount ||
                                                                          PRICE_PRODUCT_MODAL_REVEAL_BATCH,
                                                                        checkoutCollectionResources.length -
                                                                          shownCheckoutCollectionsCount
                                                                      )} more`
                                                                    : `Show ${PRICE_PRODUCT_MODAL_REVEAL_BATCH} more`}
                                                                </Button>
                                                              </div>
                                                            )}
                                                          </>
                                                        );
                                                      })()
                                                    )}
                                                  </div>
                                                ) : (
                                                  <TextField
                                                    label="Collection GIDs"
                                                    multiline={4}
                                                    value={productSourceCollections
                                                      .map(row => row.id)
                                                      .join('\n')}
                                                    onChange={value => {
                                                      const rawIds = String(value || '')
                                                        .split(/[\n,]+/)
                                                        .map(part => part.trim())
                                                        .filter(Boolean);
                                                      const nextCollections = rawIds.map(id => {
                                                        if (id.startsWith('gid://')) {
                                                          return { id, title: '', handle: '' };
                                                        }
                                                        const num = id.replace(/\D/g, '');
                                                        const gid = num
                                                          ? `gid://shopify/Collection/${num}`
                                                          : id;
                                                        return { id: gid, title: '', handle: '' };
                                                      });
                                                      updateCheckoutExperienceVariantConfig(
                                                        index,
                                                        current => {
                                                          const currentSections =
                                                            getNormalizedCheckoutExperienceConfig(
                                                              current
                                                            ).checkout_sections;
                                                          return {
                                                            ...current,
                                                            checkout_sections: currentSections.map(
                                                              (item, itemIndex) =>
                                                                itemIndex === sectionIndex
                                                                  ? {
                                                                      ...item,
                                                                      props: {
                                                                        ...(item.props || {}),
                                                                        product_source_collections:
                                                                          nextCollections,
                                                                      },
                                                                    }
                                                                  : item
                                                            ),
                                                          };
                                                        }
                                                      );
                                                    }}
                                                    helpText="Standalone or advanced setup: one Shopify collection GID per line (gid://shopify/Collection/…). You can paste numeric IDs; they are normalized automatically."
                                                    autoComplete="off"
                                                  />
                                                )}
                                              </BlockStack>
                                            ) : null}
                                            {productSourceMode === 'manual' &&
                                            productItems.length > 0 ? (
                                              <BlockStack gap="200">
                                                {productItems.map((productItem, productIndex) => (
                                                  <div
                                                    key={
                                                      productItem.id || `product-${productIndex}`
                                                    }
                                                    className={styles.checkoutProductEditorCard}
                                                  >
                                                    <div
                                                      className={
                                                        styles.checkoutProductEditorCardHead
                                                      }
                                                    >
                                                      <Text
                                                        as="span"
                                                        variant="bodySm"
                                                        fontWeight="semibold"
                                                      >
                                                        Product card {productIndex + 1}
                                                      </Text>
                                                      <Button
                                                        size="micro"
                                                        tone="critical"
                                                        onClick={() =>
                                                          updateCheckoutExperienceVariantConfig(
                                                            index,
                                                            current => {
                                                              const currentSections =
                                                                getNormalizedCheckoutExperienceConfig(
                                                                  current
                                                                ).checkout_sections;
                                                              return {
                                                                ...current,
                                                                checkout_sections:
                                                                  currentSections.map(
                                                                    (item, itemIndex) => {
                                                                      if (
                                                                        itemIndex !== sectionIndex
                                                                      ) {
                                                                        return item;
                                                                      }
                                                                      return {
                                                                        ...item,
                                                                        props: {
                                                                          ...(item.props || {}),
                                                                          product_items:
                                                                            normalizeCheckoutProductItems(
                                                                              item?.props
                                                                                ?.product_items
                                                                            ).filter(
                                                                              (
                                                                                _,
                                                                                currentProductIndex
                                                                              ) =>
                                                                                currentProductIndex !==
                                                                                productIndex
                                                                            ),
                                                                        },
                                                                      };
                                                                    }
                                                                  ),
                                                              };
                                                            }
                                                          )
                                                        }
                                                      >
                                                        Remove
                                                      </Button>
                                                    </div>
                                                    <div
                                                      className={styles.checkoutProductEditorGrid}
                                                    >
                                                      <div
                                                        className={
                                                          styles.checkoutProductEditorGridWide
                                                        }
                                                      >
                                                        <TextField
                                                          label="Image URL"
                                                          value={productItem.image_url || ''}
                                                          onChange={value =>
                                                            updateCheckoutExperienceVariantConfig(
                                                              index,
                                                              current => {
                                                                const currentSections =
                                                                  getNormalizedCheckoutExperienceConfig(
                                                                    current
                                                                  ).checkout_sections;
                                                                return {
                                                                  ...current,
                                                                  checkout_sections:
                                                                    currentSections.map(
                                                                      (item, itemIndex) => {
                                                                        if (
                                                                          itemIndex !== sectionIndex
                                                                        ) {
                                                                          return item;
                                                                        }
                                                                        const nextProducts =
                                                                          normalizeCheckoutProductItems(
                                                                            item?.props
                                                                              ?.product_items
                                                                          );
                                                                        nextProducts[productIndex] =
                                                                          {
                                                                            ...nextProducts[
                                                                              productIndex
                                                                            ],
                                                                            image_url: value,
                                                                          };
                                                                        return {
                                                                          ...item,
                                                                          props: {
                                                                            ...(item.props || {}),
                                                                            product_items:
                                                                              nextProducts,
                                                                          },
                                                                        };
                                                                      }
                                                                    ),
                                                                };
                                                              }
                                                            )
                                                          }
                                                          placeholder="https://cdn.example.com/product-image.jpg"
                                                          autoComplete="off"
                                                        />
                                                      </div>
                                                      <TextField
                                                        label="Product title"
                                                        value={productItem.title}
                                                        onChange={value =>
                                                          updateCheckoutExperienceVariantConfig(
                                                            index,
                                                            current => {
                                                              const currentSections =
                                                                getNormalizedCheckoutExperienceConfig(
                                                                  current
                                                                ).checkout_sections;
                                                              return {
                                                                ...current,
                                                                checkout_sections:
                                                                  currentSections.map(
                                                                    (item, itemIndex) => {
                                                                      if (
                                                                        itemIndex !== sectionIndex
                                                                      ) {
                                                                        return item;
                                                                      }
                                                                      const nextProducts =
                                                                        normalizeCheckoutProductItems(
                                                                          item?.props?.product_items
                                                                        );
                                                                      nextProducts[productIndex] = {
                                                                        ...nextProducts[
                                                                          productIndex
                                                                        ],
                                                                        title: value,
                                                                      };
                                                                      return {
                                                                        ...item,
                                                                        props: {
                                                                          ...(item.props || {}),
                                                                          product_items:
                                                                            nextProducts,
                                                                        },
                                                                      };
                                                                    }
                                                                  ),
                                                              };
                                                            }
                                                          )
                                                        }
                                                        autoComplete="off"
                                                      />
                                                      <TextField
                                                        label="Badge"
                                                        value={productItem.badge_text}
                                                        onChange={value =>
                                                          updateCheckoutExperienceVariantConfig(
                                                            index,
                                                            current => {
                                                              const currentSections =
                                                                getNormalizedCheckoutExperienceConfig(
                                                                  current
                                                                ).checkout_sections;
                                                              return {
                                                                ...current,
                                                                checkout_sections:
                                                                  currentSections.map(
                                                                    (item, itemIndex) => {
                                                                      if (
                                                                        itemIndex !== sectionIndex
                                                                      ) {
                                                                        return item;
                                                                      }
                                                                      const nextProducts =
                                                                        normalizeCheckoutProductItems(
                                                                          item?.props?.product_items
                                                                        );
                                                                      nextProducts[productIndex] = {
                                                                        ...nextProducts[
                                                                          productIndex
                                                                        ],
                                                                        badge_text: value,
                                                                      };
                                                                      return {
                                                                        ...item,
                                                                        props: {
                                                                          ...(item.props || {}),
                                                                          product_items:
                                                                            nextProducts,
                                                                        },
                                                                      };
                                                                    }
                                                                  ),
                                                              };
                                                            }
                                                          )
                                                        }
                                                        autoComplete="off"
                                                      />
                                                      <div
                                                        className={
                                                          styles.checkoutProductEditorGridWide
                                                        }
                                                      >
                                                        <TextField
                                                          label="Subtitle"
                                                          value={productItem.subtitle}
                                                          onChange={value =>
                                                            updateCheckoutExperienceVariantConfig(
                                                              index,
                                                              current => {
                                                                const currentSections =
                                                                  getNormalizedCheckoutExperienceConfig(
                                                                    current
                                                                  ).checkout_sections;
                                                                return {
                                                                  ...current,
                                                                  checkout_sections:
                                                                    currentSections.map(
                                                                      (item, itemIndex) => {
                                                                        if (
                                                                          itemIndex !== sectionIndex
                                                                        ) {
                                                                          return item;
                                                                        }
                                                                        const nextProducts =
                                                                          normalizeCheckoutProductItems(
                                                                            item?.props
                                                                              ?.product_items
                                                                          );
                                                                        nextProducts[productIndex] =
                                                                          {
                                                                            ...nextProducts[
                                                                              productIndex
                                                                            ],
                                                                            subtitle: value,
                                                                          };
                                                                        return {
                                                                          ...item,
                                                                          props: {
                                                                            ...(item.props || {}),
                                                                            product_items:
                                                                              nextProducts,
                                                                          },
                                                                        };
                                                                      }
                                                                    ),
                                                                };
                                                              }
                                                            )
                                                          }
                                                          autoComplete="off"
                                                        />
                                                      </div>
                                                      <TextField
                                                        label="Price"
                                                        value={productItem.price}
                                                        onChange={value =>
                                                          updateCheckoutExperienceVariantConfig(
                                                            index,
                                                            current => {
                                                              const currentSections =
                                                                getNormalizedCheckoutExperienceConfig(
                                                                  current
                                                                ).checkout_sections;
                                                              return {
                                                                ...current,
                                                                checkout_sections:
                                                                  currentSections.map(
                                                                    (item, itemIndex) => {
                                                                      if (
                                                                        itemIndex !== sectionIndex
                                                                      ) {
                                                                        return item;
                                                                      }
                                                                      const nextProducts =
                                                                        normalizeCheckoutProductItems(
                                                                          item?.props?.product_items
                                                                        );
                                                                      nextProducts[productIndex] = {
                                                                        ...nextProducts[
                                                                          productIndex
                                                                        ],
                                                                        price: value,
                                                                      };
                                                                      return {
                                                                        ...item,
                                                                        props: {
                                                                          ...(item.props || {}),
                                                                          product_items:
                                                                            nextProducts,
                                                                        },
                                                                      };
                                                                    }
                                                                  ),
                                                              };
                                                            }
                                                          )
                                                        }
                                                        autoComplete="off"
                                                      />
                                                      <TextField
                                                        label="Compare at price"
                                                        value={productItem.compare_at_price}
                                                        onChange={value =>
                                                          updateCheckoutExperienceVariantConfig(
                                                            index,
                                                            current => {
                                                              const currentSections =
                                                                getNormalizedCheckoutExperienceConfig(
                                                                  current
                                                                ).checkout_sections;
                                                              return {
                                                                ...current,
                                                                checkout_sections:
                                                                  currentSections.map(
                                                                    (item, itemIndex) => {
                                                                      if (
                                                                        itemIndex !== sectionIndex
                                                                      ) {
                                                                        return item;
                                                                      }
                                                                      const nextProducts =
                                                                        normalizeCheckoutProductItems(
                                                                          item?.props?.product_items
                                                                        );
                                                                      nextProducts[productIndex] = {
                                                                        ...nextProducts[
                                                                          productIndex
                                                                        ],
                                                                        compare_at_price: value,
                                                                      };
                                                                      return {
                                                                        ...item,
                                                                        props: {
                                                                          ...(item.props || {}),
                                                                          product_items:
                                                                            nextProducts,
                                                                        },
                                                                      };
                                                                    }
                                                                  ),
                                                              };
                                                            }
                                                          )
                                                        }
                                                        autoComplete="off"
                                                      />
                                                    </div>
                                                  </div>
                                                ))}
                                              </BlockStack>
                                            ) : productSourceMode === 'manual' ? (
                                              <div className={styles.checkoutBulletEmpty}>
                                                Add one or more product cards to merchandise
                                                products at checkout.
                                              </div>
                                            ) : null}
                                            {productSourceMode === 'manual' ? (
                                              <Button
                                                size="slim"
                                                onClick={() =>
                                                  updateCheckoutExperienceVariantConfig(
                                                    index,
                                                    current => {
                                                      const currentSections =
                                                        getNormalizedCheckoutExperienceConfig(
                                                          current
                                                        ).checkout_sections;
                                                      return {
                                                        ...current,
                                                        checkout_sections: currentSections.map(
                                                          (item, itemIndex) => {
                                                            if (itemIndex !== sectionIndex) {
                                                              return item;
                                                            }
                                                            const nextProducts =
                                                              normalizeCheckoutProductItems(
                                                                item?.props?.product_items
                                                              );
                                                            return {
                                                              ...item,
                                                              props: {
                                                                ...(item.props || {}),
                                                                product_items: [
                                                                  ...nextProducts,
                                                                  createEmptyCheckoutProductItem(
                                                                    nextProducts.length
                                                                  ),
                                                                ],
                                                              },
                                                            };
                                                          }
                                                        ),
                                                      };
                                                    }
                                                  )
                                                }
                                              >
                                                Add product card
                                              </Button>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        <TextField
                                          label="Disclaimer"
                                          value={String(props.disclaimer || '')}
                                          onChange={value =>
                                            updateCheckoutExperienceVariantConfig(
                                              index,
                                              current => {
                                                const currentSections =
                                                  getNormalizedCheckoutExperienceConfig(
                                                    current
                                                  ).checkout_sections;
                                                return {
                                                  ...current,
                                                  checkout_sections: currentSections.map(
                                                    (item, itemIndex) =>
                                                      itemIndex === sectionIndex
                                                        ? {
                                                            ...item,
                                                            props: {
                                                              ...(item.props || {}),
                                                              disclaimer: value,
                                                            },
                                                          }
                                                        : item
                                                  ),
                                                };
                                              }
                                            )
                                          }
                                          placeholder="Optional fine print shown under the main message."
                                          autoComplete="off"
                                        />
                                        <div className={styles.checkoutSelectGrid}>
                                          <div className={styles.checkoutSelectItem}>
                                            <Select
                                              label="Layout"
                                              options={CHECKOUT_LAYOUT_OPTIONS}
                                              value={String(props.layout || 'banner')}
                                              onChange={value =>
                                                updateCheckoutExperienceVariantConfig(
                                                  index,
                                                  current => {
                                                    const currentSections =
                                                      getNormalizedCheckoutExperienceConfig(
                                                        current
                                                      ).checkout_sections;
                                                    return {
                                                      ...current,
                                                      checkout_sections: currentSections.map(
                                                        (item, itemIndex) =>
                                                          itemIndex === sectionIndex
                                                            ? {
                                                                ...item,
                                                                props: {
                                                                  ...(item.props || {}),
                                                                  layout: value,
                                                                },
                                                              }
                                                            : item
                                                      ),
                                                    };
                                                  }
                                                )
                                              }
                                            />
                                          </div>
                                          <div className={styles.checkoutSelectItem}>
                                            <Select
                                              label="Tone"
                                              options={CHECKOUT_TONE_OPTIONS}
                                              value={String(props.tone || 'success')}
                                              onChange={value =>
                                                updateCheckoutExperienceVariantConfig(
                                                  index,
                                                  current => {
                                                    const currentSections =
                                                      getNormalizedCheckoutExperienceConfig(
                                                        current
                                                      ).checkout_sections;
                                                    return {
                                                      ...current,
                                                      checkout_sections: currentSections.map(
                                                        (item, itemIndex) =>
                                                          itemIndex === sectionIndex
                                                            ? {
                                                                ...item,
                                                                props: {
                                                                  ...(item.props || {}),
                                                                  tone: value,
                                                                },
                                                              }
                                                            : item
                                                      ),
                                                    };
                                                  }
                                                )
                                              }
                                            />
                                          </div>
                                        </div>
                                        <div className={styles.checkoutSelectGrid}>
                                          <div className={styles.checkoutSelectItem}>
                                            <Select
                                              label="CTA behavior"
                                              options={CHECKOUT_CTA_KIND_OPTIONS}
                                              value={String(props.cta_kind || 'track')}
                                              onChange={value =>
                                                updateCheckoutExperienceVariantConfig(
                                                  index,
                                                  current => {
                                                    const currentSections =
                                                      getNormalizedCheckoutExperienceConfig(
                                                        current
                                                      ).checkout_sections;
                                                    return {
                                                      ...current,
                                                      checkout_sections: currentSections.map(
                                                        (item, itemIndex) =>
                                                          itemIndex === sectionIndex
                                                            ? {
                                                                ...item,
                                                                props: {
                                                                  ...(item.props || {}),
                                                                  cta_kind: value,
                                                                },
                                                              }
                                                            : item
                                                      ),
                                                    };
                                                  }
                                                )
                                              }
                                            />
                                          </div>
                                          <div
                                            className={`${styles.checkoutSelectItem} ${styles.checkoutFieldSpanWide}`}
                                          >
                                            <TextField
                                              label="CTA label"
                                              value={String(props.cta_label || '')}
                                              onChange={value =>
                                                updateCheckoutExperienceVariantConfig(
                                                  index,
                                                  current => {
                                                    const currentSections =
                                                      getNormalizedCheckoutExperienceConfig(
                                                        current
                                                      ).checkout_sections;
                                                    return {
                                                      ...current,
                                                      checkout_sections: currentSections.map(
                                                        (item, itemIndex) =>
                                                          itemIndex === sectionIndex
                                                            ? {
                                                                ...item,
                                                                props: {
                                                                  ...(item.props || {}),
                                                                  cta_label: value,
                                                                },
                                                              }
                                                            : item
                                                      ),
                                                    };
                                                  }
                                                )
                                              }
                                              disabled={
                                                String(props.cta_kind || 'track') === 'none'
                                              }
                                              placeholder="e.g. Continue securely"
                                              autoComplete="off"
                                            />
                                          </div>
                                        </div>
                                      </FormLayout>
                                    </div>
                                  </div>
                                </div>
                              </Collapsible>
                            </div>
                          </Card>
                        );
                      })}
                    </BlockStack>
                  </BlockStack>
                ) : checkoutPhase === 'payment_method' ? (
                  renderCheckoutMethodStudio({
                    index,
                    cfg,
                    actionKey: 'payment_action',
                    namesKey: 'payment_method_names',
                    renameKey: 'payment_rename_to',
                    summaryLabel: 'Payment strategy',
                    description:
                      'Configure which payment methods are targeted and how the checkout layer should change them for this variant.',
                    emptyText:
                      'No payment methods targeted yet. Add the customer-facing names Shopify exposes in checkout.',
                    inputPlaceholder: 'e.g. PayPal',
                    renamePlaceholder: 'Optional shared rename target for matched methods',
                    notePlaceholder:
                      'Explain what should change in checkout for this payment-method variant.',
                  })
                ) : (
                  renderCheckoutMethodStudio({
                    index,
                    cfg,
                    actionKey: 'delivery_action',
                    namesKey: 'delivery_method_names',
                    renameKey: 'delivery_rename_to',
                    summaryLabel: 'Delivery strategy',
                    description:
                      'Configure which delivery methods are targeted and how the checkout layer should adjust them for this variant.',
                    emptyText:
                      'No delivery methods targeted yet. Add the option labels customers see at checkout.',
                    inputPlaceholder: 'e.g. Express Shipping',
                    renamePlaceholder: 'Optional shared rename target for matched delivery methods',
                    notePlaceholder:
                      'Explain what should change in checkout for this delivery-method variant.',
                  })
                )}
              </div>
            </Card>
          );
        })}
      </BlockStack>
    );
  };

  const renderVariantThemeModule = () => (
    <VariantThemeModule
      formData={formData}
      setFormData={setFormData}
      selectedTemplate={selectedTemplate}
    />
  );

  const renderConfigStepLoader = () => (
    <Card>
      <BlockStack gap="400">
        <div
          className="variant-config-loader"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 2rem',
            gap: '1rem',
          }}
        >
          <Spinner size="large" />
          <Text variant="bodyMd" as="p" tone="subdued">
            Loading configuration…
          </Text>
        </div>
      </BlockStack>
    </Card>
  );

  const renderCustomCode = () => {
    if (!configStepContentReady) {
      return renderConfigStepLoader();
    }
    if (variantConfigType !== 'code') {
      const checkoutConfigPhase = normalizeCheckoutPhase(formData.goal?.checkout_phase);
      const checkoutConfigPhaseDetails = getCheckoutPhaseDetails(checkoutConfigPhase);
      const isCheckoutVariantConfig = variantConfigType === 'checkout';
      const moduleHeading = isCheckoutVariantConfig
        ? 'Checkout Variant Studio'
        : 'Variant Configuration';
      const moduleSubtitle = isCheckoutVariantConfig
        ? `Choose the checkout surface once, then edit the active control or treatment tab below.`
        : null;
      const moduleTitles = {
        url: 'Variant URLs',
        price: 'Variant Prices',
        shipping: 'Variant Shipping Strategies',
        offer: 'Variant Offers',
        checkout: 'Checkout Variants',
        theme: 'Theme Variants',
      };
      return (
        <Card>
          <BlockStack gap="400">
            <div
              className={
                variantConfigType === 'price'
                  ? stepStyles.variantConfigHeadPrice
                  : isCheckoutVariantConfig
                    ? stepStyles.variantConfigHeadCheckout
                    : undefined
              }
            >
              <InlineStack gap="300" blockAlign="center" wrap>
                <Text variant="headingLg" as="h2" fontWeight="bold">
                  {moduleHeading}
                </Text>
                {variantConfigType === 'price' && <Badge tone="info">Price test</Badge>}
                {isCheckoutVariantConfig && (
                  <Badge tone="info">{checkoutConfigPhaseDetails.title}</Badge>
                )}
                {isCheckoutVariantConfig && <Badge tone="success">Structured contract</Badge>}
                {isCheckoutVariantConfig && (
                  <TooltipWrapper
                    content="This step is intentionally compact: surface selection stays at the top, while detailed rollout and readiness guidance lives in the related review and diagnostics surfaces."
                    accessibilityLabel="Checkout variant studio help"
                  >
                    <span className={styles.checkoutStudioCompactInfo} aria-hidden>
                      <Icon source={InfoIcon} />
                    </span>
                  </TooltipWrapper>
                )}
              </InlineStack>
              <Text variant="bodySm" color="subdued" as="p" style={{ marginTop: '0.25rem' }}>
                {moduleSubtitle || moduleTitles[variantConfigType]}
              </Text>
            </div>
            {variantConfigType === 'url' && renderVariantUrlModule()}
            {variantConfigType === 'price' && renderVariantPriceModule()}
            {variantConfigType === 'shipping' && renderVariantShippingModule()}
            {variantConfigType === 'offer' && renderVariantOfferModule()}
            {variantConfigType === 'checkout' && renderVariantCheckoutModule()}
            {variantConfigType === 'theme' && renderVariantThemeModule()}
          </BlockStack>
        </Card>
      );
    }

    return (
      <Card>
        <BlockStack gap="400">
          {variantCodesData.length > 0 ? (
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="center">
                <div>
                  <Text variant="headingLg" as="h2" fontWeight="bold">
                    Variant Configuration
                  </Text>
                  <Text variant="bodySm" color="subdued" as="p" style={{ marginTop: '0.25rem' }}>
                    Add custom CSS and JavaScript to customize each variant&apos;s appearance and
                    behavior.
                  </Text>
                </div>
                {mode === 'edit' && (
                  <Button
                    onClick={() =>
                      onSaveCode ? handleSaveCodeOnly() : handleSubmit({ saveCodeOnly: true })
                    }
                    loading={loading || submitLoading}
                  >
                    Save Code
                  </Button>
                )}
              </InlineStack>

              <div className="config-editor-accordion">
                <div className="config-editor-accordion-item">
                  <button
                    type="button"
                    className="config-editor-accordion-head"
                    onClick={() => {
                      const next = !visualEditorExpanded;
                      setVisualEditorExpanded(next);
                      if (next) setCodeEditorExpanded(false);
                    }}
                    aria-expanded={visualEditorExpanded}
                    aria-controls="config-editor-accordion-visual-body"
                    id="config-editor-accordion-visual-head"
                  >
                    <span className="config-editor-accordion-head-icon config-editor-accordion-head-icon--visual">
                      <Icon source={ViewIcon} />
                    </span>
                    <span className="config-editor-accordion-head-label">Visual Editor</span>
                    {visualEditorDirty && (
                      <span
                        className="config-editor-accordion-head-dirty"
                        title="Unsaved changes"
                        aria-hidden
                      >
                        •
                      </span>
                    )}
                    <span className="config-editor-accordion-head-chevron">
                      {visualEditorExpanded ? (
                        <Icon source={ChevronDownIcon} />
                      ) : (
                        <Icon source={ChevronRightIcon} />
                      )}
                    </span>
                  </button>
                  <Collapsible
                    id="config-editor-accordion-visual-body"
                    open={visualEditorExpanded}
                    transition={{ duration: '200ms', timingFunction: 'ease' }}
                  >
                    <div className="config-editor-accordion-body config-editor-panel config-editor-panel--visual">
                      <div className="variant-visual-editor-content">
                        <BlockStack gap="400">
                          <div className="variant-visual-editor-default-page">
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              Default target page
                            </Text>
                            <Text
                              as="p"
                              variant="bodySm"
                              color="subdued"
                              style={{ marginTop: '0.25rem' }}
                            >
                              {normalizeTextValue(formData.segments?.url_pattern)
                                ? normalizeTextValue(formData.segments?.url_pattern)
                                : (formData.segments?.page_rules?.length ?? 0) > 0
                                  ? 'Page rules (from Targeting step)'
                                  : 'All pages'}
                            </Text>
                          </div>
                          <TextField
                            label="Preview URL"
                            value={formData.segments?.visual_editor_preview_url ?? ''}
                            onChange={value => {
                              setIsDirty(true);
                              setVisualEditorDirty(true);
                              setFormData(prev => ({
                                ...prev,
                                segments: {
                                  ...(prev.segments || {}),
                                  visual_editor_preview_url: value,
                                },
                              }));
                              setVisualPreviewLoadState('idle');
                            }}
                            placeholder={(() => {
                              const d =
                                routeDomain ||
                                getPreviewDomain() ||
                                getShopDomain() ||
                                initialData?.shop_domain;
                              const path = getFirstTargetPreviewPath();
                              const domainClean = d
                                ? d
                                    .replace(/^https?:\/\//i, '')
                                    .replace(/\/+$/, '')
                                    .split('/')[0]
                                : '';
                              return domainClean
                                ? `https://${domainClean}${path.startsWith('/') ? path : `/${path}`}`
                                : 'https://your-site.com/';
                            })()}
                            helpText="When empty, the first target page from Targeting is used automatically (e.g. first product, collection, or homepage). Add the RipX script to your store (App settings → Installation) to enable click-to-select."
                            autoComplete="url"
                          />
                          {(() => {
                            const veUrl = (
                              formData.segments?.visual_editor_preview_url ?? ''
                            ).trim();
                            const hasOverride = veUrl.length > 0;
                            const domainForPreview =
                              routeDomain ||
                              getPreviewDomain() ||
                              getShopDomain() ||
                              (initialData?.shop_domain && String(initialData.shop_domain).trim());
                            const pathForPreview = getFirstTargetPreviewPath();
                            const baseUrl = resolvePreviewBaseUrl({
                              variantUrl: null,
                              overrideUrl: hasOverride ? veUrl : null,
                              domain: domainForPreview || undefined,
                              path: pathForPreview,
                            });
                            const variants = formData.variants ?? [];
                            const safeVisualIndex = Math.min(
                              Math.max(0, visualPreviewVariantIndex),
                              Math.max(0, variants.length - 1)
                            );
                            const previewVariant = variants[safeVisualIndex];
                            const testId = initialData?.id;
                            const previewTenantDomain =
                              normalizeTextValue(initialData?.shop_domain) || null;
                            const fullPreviewUrl =
                              baseUrl && testId
                                ? buildPreviewUrlUtil({
                                    baseUrl,
                                    testId,
                                    variantId:
                                      previewVariant?.id ||
                                      previewVariant?.name ||
                                      (previewVariant ? `variant-${safeVisualIndex + 1}` : ''),
                                    variantName:
                                      previewVariant?.name ||
                                      (previewVariant ? `Variant ${safeVisualIndex + 1}` : ''),
                                    tenantDomain: previewTenantDomain,
                                    visualEditor: true,
                                  })
                                : null;
                            const directPreviewUrl = fullPreviewUrl || baseUrl || '';
                            let iframeSrc = '';
                            if (directPreviewUrl) {
                              iframeSrc =
                                buildPreviewDocumentUrl({
                                  apiBaseUrl: getApiBaseUrl(),
                                  previewUrl: fullPreviewUrl || directPreviewUrl,
                                  visualEditor: true,
                                }) || '';
                            }
                            const _previewWithoutTestId = Boolean(baseUrl && !testId);
                            if (!baseUrl) {
                              return (
                                <div className="variant-visual-editor-empty">
                                  <Text as="p" variant="bodySm" color="subdued">
                                    Connect a shop or open this test from a store (e.g. My domains →
                                    open store) so the preview can load the store URL. You can also
                                    enter a Preview URL above.
                                  </Text>
                                  <Text
                                    as="p"
                                    variant="bodySm"
                                    color="subdued"
                                    style={{ marginTop: '0.5rem' }}
                                  >
                                    The preview loads your store page with the RipX script injected
                                    so you can click to select elements. Add the script in App
                                    settings → Installation for your live store.
                                  </Text>
                                </div>
                              );
                            }
                            const showEmbedBlocked = visualPreviewLoadState === 'error';
                            const rules = Array.from({ length: 5 }, (_, i) =>
                              normalizeVisualEditorRule(
                                (previewVariant?.config?.visual_editor_rules || [])[i]
                              )
                            );
                            const selectedCount = rules.filter(r =>
                              (r.selector || '').trim()
                            ).length;
                            const atLimit = selectedCount >= 5;
                            const historyKey = String(safeVisualIndex);
                            const visualHistory = visualRuleHistoryByVariant[historyKey] || {
                              past: [],
                              future: [],
                            };
                            const updateCurrentVariantRules = updater => {
                              applyVisualRulesChange(safeVisualIndex, updater);
                            };
                            const positionButtons = [
                              { label: 'After', value: 'after', title: 'Insert after element' },
                              { label: 'Before', value: 'before', title: 'Insert before element' },
                              {
                                label: 'Inside (first)',
                                value: 'afterbegin',
                                title: 'Insert as first child',
                              },
                              {
                                label: 'Inside (last)',
                                value: 'beforeend',
                                title: 'Insert as last child',
                              },
                            ];
                            const snippetTabs = [
                              { id: 'selector', label: 'Selector' },
                              { id: 'generated', label: 'Generated code' },
                              { id: 'css', label: 'CSS' },
                              { id: 'js', label: 'JavaScript' },
                            ];
                            const mutationTypeOptions = [
                              { label: 'No quick action', value: 'none' },
                              { label: 'Hide element', value: 'hide' },
                              { label: 'Show element', value: 'show' },
                              { label: 'Replace text', value: 'set_text' },
                              { label: 'Set attribute', value: 'set_attr' },
                              { label: 'Set inline style', value: 'set_style' },
                            ];
                            return (
                              <div className="variant-visual-editor-single-layout">
                                <div className="variant-visual-editor-preview-section">
                                  <div className="variant-visual-editor-preview-hint" role="status">
                                    <Text as="p" variant="bodySm" tone="subdued">
                                      {!testId && 'Save the test to see variant styling. '}
                                      The preview loads your store page with the RipX script so you
                                      can click to select elements. For live tests, add the script
                                      via App settings → Installation.
                                    </Text>
                                  </div>
                                  {variants.length > 1 && (
                                    <div className="variant-visual-editor-variant-tabs">
                                      <Text as="span" variant="bodySm" fontWeight="semibold">
                                        Variant:
                                      </Text>
                                      <div className="variant-visual-editor-variant-tabs-list">
                                        {variants.map((v, idx) => (
                                          <button
                                            key={`visual-preview-${idx}-${v?.name ?? idx}`}
                                            type="button"
                                            className={`variant-visual-editor-variant-tab ${idx === safeVisualIndex ? 'variant-visual-editor-variant-tab--active' : ''}`}
                                            onClick={() => {
                                              setVisualPreviewVariantIndex(idx);
                                              setVisualPreviewLoadState('loading');
                                            }}
                                          >
                                            {v?.name || `Variant ${idx + 1}`}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {showEmbedBlocked && (
                                    <div
                                      className="variant-visual-editor-embed-blocked-card"
                                      role="alert"
                                    >
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        Preview could not be loaded. Check the preview URL above or
                                        the store may be slow to respond.
                                      </Text>
                                      <Button
                                        size="slim"
                                        onClick={() => {
                                          setVisualPreviewLoadState('loading');
                                          setVisualPreviewRetryKey(k => k + 1);
                                        }}
                                      >
                                        Try again
                                      </Button>
                                    </div>
                                  )}
                                  <div className="variant-visual-editor-preview-wrap">
                                    {visualPreviewLoadState === 'loading' && (
                                      <div
                                        className="variant-visual-editor-preview-loading"
                                        aria-hidden
                                      >
                                        <div className="variant-visual-editor-preview-spinner" />
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Loading preview…
                                        </Text>
                                        {visualPreviewLoadingSlow && (
                                          <Text as="p" variant="bodySm" tone="subdued">
                                            Taking a while? Check the preview URL or try again in a
                                            moment.
                                          </Text>
                                        )}
                                      </div>
                                    )}
                                    {!showEmbedBlocked && (
                                      <iframe
                                        key={`visual-preview-iframe-${safeVisualIndex}-${iframeSrc}-${visualPreviewRetryKey}`}
                                        title={`Visual editor: ${previewVariant?.name || `Variant ${safeVisualIndex + 1}`}`}
                                        src={iframeSrc}
                                        className="variant-visual-editor-preview-iframe"
                                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                                        onLoad={() => setVisualPreviewLoadState('loaded')}
                                        onError={() => setVisualPreviewLoadState('error')}
                                      />
                                    )}
                                    {visualSnippetPanelExpanded && (
                                      <div
                                        className="variant-visual-editor-preview-blocking-overlay"
                                        aria-hidden
                                        role="presentation"
                                        onClick={() => setVisualSnippetPanelExpanded(false)}
                                        title="Click to close snippet panel"
                                      >
                                        <span className="variant-visual-editor-preview-blocking-text">
                                          Click to close panel and select elements
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="variant-visual-editor-snippet-panel-wrap">
                                  <div
                                    className={`variant-visual-editor-bottom-bar ${changingSelectorIndex !== null && !visualSnippetPanelExpanded ? 'variant-visual-editor-bottom-bar--change-mode' : ''}`}
                                    style={{
                                      paddingBottom: visualSnippetPanelExpanded ? 0 : undefined,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="variant-visual-editor-bottom-bar-trigger"
                                      onClick={() => setVisualSnippetPanelExpanded(prev => !prev)}
                                      aria-expanded={visualSnippetPanelExpanded}
                                      aria-label={
                                        visualSnippetPanelExpanded
                                          ? 'Collapse snippet panel'
                                          : 'Expand snippet panel'
                                      }
                                    >
                                      <div className="variant-visual-editor-bottom-bar-label-wrap">
                                        <span className="variant-visual-editor-bottom-bar-count">
                                          {selectedCount} element{selectedCount !== 1 ? 's' : ''}{' '}
                                          selected
                                        </span>
                                        {changingSelectorIndex !== null &&
                                          !visualSnippetPanelExpanded && (
                                            <span className="variant-visual-editor-bottom-bar-change-hint">
                                              Click in preview to replace selector
                                            </span>
                                          )}
                                      </div>
                                      <span
                                        className={`variant-visual-editor-bottom-bar-chevron ${visualSnippetPanelExpanded ? 'variant-visual-editor-bottom-bar-chevron--up' : ''}`}
                                        aria-hidden
                                      >
                                        <Icon source={ChevronDownIcon} />
                                      </span>
                                    </button>
                                  </div>
                                  {visualSnippetPanelExpanded && (
                                    <>
                                      <div
                                        ref={visualSnippetBackdropRef}
                                        className="variant-visual-editor-snippet-backdrop"
                                        role="presentation"
                                        onClick={() => setVisualSnippetPanelExpanded(false)}
                                        onKeyDown={e =>
                                          e.key === 'Escape' && setVisualSnippetPanelExpanded(false)
                                        }
                                      />
                                      <div
                                        ref={visualSnippetPanelRef}
                                        className="variant-visual-editor-snippet-overlay"
                                        role="dialog"
                                        aria-label={
                                          variants.length > 1
                                            ? `Element snippets for ${previewVariant?.name || `Variant ${safeVisualIndex + 1}`}`
                                            : 'Element snippets'
                                        }
                                      >
                                        <div
                                          className="variant-visual-editor-snippet-overlay-handle"
                                          aria-hidden
                                        />
                                        <div className="variant-visual-editor-snippet-overlay-header">
                                          <div className="variant-visual-editor-snippet-overlay-header-inner">
                                            <div className="variant-visual-editor-snippet-overlay-header-title">
                                              {variants.length > 1 ? (
                                                <>
                                                  <Text
                                                    as="span"
                                                    variant="headingMd"
                                                    fontWeight="semibold"
                                                    className="variant-visual-editor-snippet-overlay-variant-title"
                                                  >
                                                    {previewVariant?.name ||
                                                      `Variant ${safeVisualIndex + 1}`}
                                                  </Text>
                                                  <span
                                                    className="variant-visual-editor-snippet-overlay-title-sep"
                                                    aria-hidden
                                                  >
                                                    ·
                                                  </span>
                                                  <Text
                                                    as="span"
                                                    variant="bodySm"
                                                    tone="subdued"
                                                    className="variant-visual-editor-snippet-overlay-title-meta"
                                                  >
                                                    Element snippets
                                                  </Text>
                                                </>
                                              ) : (
                                                <Text
                                                  as="span"
                                                  variant="headingMd"
                                                  fontWeight="semibold"
                                                >
                                                  Element snippets
                                                </Text>
                                              )}
                                              <Badge tone="info" size="small">
                                                {selectedCount}/5
                                              </Badge>
                                            </div>
                                            <Text
                                              as="p"
                                              variant="bodySm"
                                              tone="subdued"
                                              className="variant-visual-editor-snippet-overlay-subtitle"
                                            >
                                              Edit selectors, quick actions, CSS, and JS for each
                                              selected element.
                                            </Text>
                                          </div>
                                          <div className="variant-visual-editor-snippet-overlay-header-actions">
                                            <button
                                              type="button"
                                              className="variant-visual-editor-history-btn"
                                              disabled={!visualHistory.past?.length}
                                              onClick={() => {
                                                if (undoVisualRuleChange(safeVisualIndex)) {
                                                  setVisualPreviewToast({
                                                    message: 'Visual edit undone',
                                                    type: 'success',
                                                  });
                                                  setTimeout(
                                                    () => setVisualPreviewToast(null),
                                                    2000
                                                  );
                                                }
                                              }}
                                              aria-label="Undo visual edit"
                                              title="Undo last visual edit"
                                            >
                                              Undo
                                            </button>
                                            <button
                                              type="button"
                                              className="variant-visual-editor-history-btn"
                                              disabled={!visualHistory.future?.length}
                                              onClick={() => {
                                                if (redoVisualRuleChange(safeVisualIndex)) {
                                                  setVisualPreviewToast({
                                                    message: 'Visual edit redone',
                                                    type: 'success',
                                                  });
                                                  setTimeout(
                                                    () => setVisualPreviewToast(null),
                                                    2000
                                                  );
                                                }
                                              }}
                                              aria-label="Redo visual edit"
                                              title="Redo visual edit"
                                            >
                                              Redo
                                            </button>
                                            <button
                                              type="button"
                                              className="variant-visual-editor-snippet-collapse-btn"
                                              onClick={() => setVisualSnippetPanelExpanded(false)}
                                              aria-label="Collapse panel"
                                            >
                                              <Icon source={ChevronDownIcon} />
                                            </button>
                                          </div>
                                        </div>
                                        <div className="variant-visual-editor-snippet-overlay-body">
                                          {(() => {
                                            const ruleIndicesWithSelectors = rules
                                              .map((r, i) => ((r.selector || '').trim() ? i : null))
                                              .filter(i => i !== null && i !== undefined);
                                            const effectiveActiveIndex =
                                              ruleIndicesWithSelectors.includes(
                                                visualSnippetActiveElementIndex
                                              )
                                                ? visualSnippetActiveElementIndex
                                                : (ruleIndicesWithSelectors[0] ?? 0);
                                            const idx = effectiveActiveIndex;
                                            const rule = normalizeVisualEditorRule(rules[idx]);
                                            const generatedCode =
                                              buildGeneratedVisualRuleCode(rule);
                                            const rawTab = visualRuleActiveTab[idx] || 'selector';
                                            const activeTab =
                                              rawTab === 'position' ? 'selector' : rawTab;
                                            const handleRemoveElement = ruleIndexToRemove => {
                                              updateCurrentVariantRules(nextRules => {
                                                nextRules[ruleIndexToRemove] = {
                                                  ...createEmptyVisualEditorRule(),
                                                };
                                              });
                                              const remaining = ruleIndicesWithSelectors.filter(
                                                i => i !== ruleIndexToRemove
                                              );
                                              setVisualSnippetActiveElementIndex(remaining[0] ?? 0);
                                              setVisualRuleActiveTab(prev => {
                                                const next = { ...prev };
                                                delete next[ruleIndexToRemove];
                                                return next;
                                              });
                                              if (changingSelectorIndex === ruleIndexToRemove)
                                                setChangingSelectorIndex(null);
                                            };

                                            const handleChangeSelector = ruleIdx => {
                                              setChangingSelectorIndex(ruleIdx);
                                              setVisualSnippetActiveElementIndex(ruleIdx);
                                              setVisualRuleActiveTab(prev => ({
                                                ...prev,
                                                [ruleIdx]: 'selector',
                                              }));
                                              setVisualSnippetPanelExpanded(false);
                                            };

                                            if (ruleIndicesWithSelectors.length === 0) {
                                              return (
                                                <div className="variant-visual-editor-snippet-empty">
                                                  {changingSelectorIndex !== null && (
                                                    <div className="variant-visual-editor-snippet-change-banner">
                                                      <Text
                                                        as="p"
                                                        variant="bodySm"
                                                        fontWeight="medium"
                                                      >
                                                        Click an element in the preview to replace
                                                        the selector.
                                                      </Text>
                                                      <button
                                                        type="button"
                                                        className="variant-visual-editor-snippet-change-cancel"
                                                        onClick={() =>
                                                          setChangingSelectorIndex(null)
                                                        }
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  )}
                                                  <div
                                                    className="variant-visual-editor-snippet-empty-icon"
                                                    aria-hidden
                                                  />
                                                  <Text
                                                    as="p"
                                                    variant="bodyMd"
                                                    fontWeight="medium"
                                                    tone="subdued"
                                                  >
                                                    No elements selected
                                                  </Text>
                                                  <Text as="p" variant="bodySm" tone="subdued">
                                                    Click an element in the preview above to add it
                                                    (max 5 per variant).
                                                  </Text>
                                                </div>
                                              );
                                            }

                                            return (
                                              <>
                                                {changingSelectorIndex !== null && (
                                                  <div className="variant-visual-editor-snippet-change-banner">
                                                    <Text
                                                      as="p"
                                                      variant="bodySm"
                                                      fontWeight="medium"
                                                    >
                                                      Click an element in the preview to replace
                                                      this selector.
                                                    </Text>
                                                    <button
                                                      type="button"
                                                      className="variant-visual-editor-snippet-change-cancel"
                                                      onClick={() => setChangingSelectorIndex(null)}
                                                    >
                                                      Cancel
                                                    </button>
                                                  </div>
                                                )}
                                                {atLimit && (
                                                  <div
                                                    className="variant-visual-editor-snippet-limit-msg"
                                                    role="alert"
                                                  >
                                                    <Text
                                                      as="p"
                                                      variant="bodySm"
                                                      fontWeight="medium"
                                                      tone="critical"
                                                    >
                                                      Maximum 5 elements per variant. Remove one to
                                                      add another.
                                                    </Text>
                                                  </div>
                                                )}
                                                <div className="variant-visual-editor-snippet-elements-section">
                                                  <Text
                                                    as="span"
                                                    variant="bodySm"
                                                    fontWeight="semibold"
                                                    tone="subdued"
                                                    className="variant-visual-editor-snippet-elements-label"
                                                  >
                                                    Selected elements ({selectedCount}/5)
                                                  </Text>
                                                  <div className="variant-visual-editor-snippet-element-tabs">
                                                    {ruleIndicesWithSelectors.map(ruleIdx => (
                                                      <div
                                                        key={ruleIdx}
                                                        className="variant-visual-editor-snippet-element-tab-wrap"
                                                      >
                                                        <button
                                                          type="button"
                                                          className={`variant-visual-editor-snippet-element-tab ${effectiveActiveIndex === ruleIdx ? 'variant-visual-editor-snippet-element-tab--active' : ''}`}
                                                          onClick={() =>
                                                            setVisualSnippetActiveElementIndex(
                                                              ruleIdx
                                                            )
                                                          }
                                                        >
                                                          Element {ruleIdx + 1}
                                                        </button>
                                                        <button
                                                          type="button"
                                                          className="variant-visual-editor-snippet-element-tab-remove"
                                                          onClick={e => {
                                                            e.stopPropagation();
                                                            handleRemoveElement(ruleIdx);
                                                          }}
                                                          aria-label={`Remove element ${ruleIdx + 1}`}
                                                          title="Remove element"
                                                        >
                                                          <Icon source={XIcon} />
                                                        </button>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </div>
                                                <div className="variant-visual-editor-snippet-card">
                                                  <div className="variant-visual-editor-snippet-card-header-row">
                                                    <Text
                                                      as="span"
                                                      variant="bodyMd"
                                                      fontWeight="semibold"
                                                    >
                                                      Element {idx + 1}
                                                    </Text>
                                                    <div className="variant-visual-editor-snippet-card-header-actions">
                                                      <button
                                                        type="button"
                                                        className="variant-visual-editor-snippet-change-selector-btn"
                                                        onClick={() => handleChangeSelector(idx)}
                                                        aria-label="Change selector"
                                                        title="Click in preview to pick a different element"
                                                      >
                                                        <span>Change</span>
                                                      </button>
                                                      <button
                                                        type="button"
                                                        className="variant-visual-editor-snippet-remove-element-btn"
                                                        onClick={() => handleRemoveElement(idx)}
                                                        aria-label="Remove this element"
                                                      >
                                                        <Icon source={XIcon} />
                                                        <span>Remove</span>
                                                      </button>
                                                    </div>
                                                  </div>
                                                  <div className="variant-visual-editor-snippet-card-inner">
                                                    <div className="variant-visual-editor-snippet-card-sidebar">
                                                      {snippetTabs.map(tab => (
                                                        <button
                                                          key={tab.id}
                                                          type="button"
                                                          className={`variant-visual-editor-snippet-tab ${activeTab === tab.id ? 'variant-visual-editor-snippet-tab--active' : ''}`}
                                                          onClick={() =>
                                                            setVisualRuleActiveTab(prev => ({
                                                              ...prev,
                                                              [idx]: tab.id,
                                                            }))
                                                          }
                                                        >
                                                          {tab.label}
                                                        </button>
                                                      ))}
                                                    </div>
                                                    <div className="variant-visual-editor-snippet-card-content">
                                                      {activeTab === 'selector' && (
                                                        <div className="variant-visual-editor-selector-tab-content">
                                                          <div className="variant-visual-editor-selector-field-wrap">
                                                            <Text
                                                              as="label"
                                                              variant="bodySm"
                                                              fontWeight="medium"
                                                              tone="subdued"
                                                              className="variant-visual-editor-selector-label"
                                                            >
                                                              CSS selector
                                                            </Text>
                                                            <TextField
                                                              label="Selector"
                                                              labelHidden
                                                              value={rule.selector}
                                                              onChange={value => {
                                                                updateCurrentVariantRules(
                                                                  nextRules => {
                                                                    nextRules[idx] = {
                                                                      ...nextRules[idx],
                                                                      selector: value,
                                                                    };
                                                                  }
                                                                );
                                                              }}
                                                              placeholder="Click element in preview or type selector"
                                                              autoComplete="off"
                                                            />
                                                          </div>
                                                          <div className="variant-visual-editor-position-group">
                                                            <Text
                                                              as="span"
                                                              variant="bodySm"
                                                              fontWeight="medium"
                                                              tone="subdued"
                                                              className="variant-visual-editor-position-label"
                                                            >
                                                              Insert position
                                                            </Text>
                                                            <div
                                                              className="variant-visual-editor-position-buttons"
                                                              role="group"
                                                              aria-label="Insert position"
                                                            >
                                                              {positionButtons.map(opt => (
                                                                <button
                                                                  key={opt.value}
                                                                  type="button"
                                                                  title={opt.title}
                                                                  className={`variant-visual-editor-position-btn ${(rule.position || 'after') === opt.value ? 'variant-visual-editor-position-btn--active' : ''}`}
                                                                  onClick={() => {
                                                                    updateCurrentVariantRules(
                                                                      nextRules => {
                                                                        nextRules[idx] = {
                                                                          ...nextRules[idx],
                                                                          position: opt.value,
                                                                        };
                                                                      }
                                                                    );
                                                                  }}
                                                                >
                                                                  {opt.label}
                                                                </button>
                                                              ))}
                                                            </div>
                                                          </div>
                                                          <div className="variant-visual-editor-mutation-group">
                                                            <Select
                                                              label="Quick action"
                                                              options={mutationTypeOptions}
                                                              value={rule.mutation_type || 'none'}
                                                              onChange={value => {
                                                                updateCurrentVariantRules(
                                                                  nextRules => {
                                                                    const normalized =
                                                                      normalizeVisualEditorRule(
                                                                        nextRules[idx]
                                                                      );
                                                                    nextRules[idx] = {
                                                                      ...normalized,
                                                                      mutation_type: value,
                                                                    };
                                                                  }
                                                                );
                                                              }}
                                                              helpText="Use simple visual actions without writing custom JS."
                                                            />
                                                            {rule.mutation_type === 'set_text' && (
                                                              <TextField
                                                                label="Replacement text"
                                                                value={rule.mutation_text || ''}
                                                                onChange={value => {
                                                                  updateCurrentVariantRules(
                                                                    nextRules => {
                                                                      const normalized =
                                                                        normalizeVisualEditorRule(
                                                                          nextRules[idx]
                                                                        );
                                                                      nextRules[idx] = {
                                                                        ...normalized,
                                                                        mutation_text: value,
                                                                      };
                                                                    }
                                                                  );
                                                                }}
                                                                placeholder="Text to render in the selected element"
                                                                autoComplete="off"
                                                              />
                                                            )}
                                                            {rule.mutation_type === 'set_attr' && (
                                                              <div className="variant-visual-editor-mutation-attr-grid">
                                                                <TextField
                                                                  label="Attribute name"
                                                                  value={
                                                                    rule.mutation_attribute || ''
                                                                  }
                                                                  onChange={value => {
                                                                    updateCurrentVariantRules(
                                                                      nextRules => {
                                                                        const normalized =
                                                                          normalizeVisualEditorRule(
                                                                            nextRules[idx]
                                                                          );
                                                                        nextRules[idx] = {
                                                                          ...normalized,
                                                                          mutation_attribute: value,
                                                                        };
                                                                      }
                                                                    );
                                                                  }}
                                                                  placeholder="e.g. aria-label"
                                                                  autoComplete="off"
                                                                />
                                                                <TextField
                                                                  label="Attribute value"
                                                                  value={
                                                                    rule.mutation_attribute_value ||
                                                                    ''
                                                                  }
                                                                  onChange={value => {
                                                                    updateCurrentVariantRules(
                                                                      nextRules => {
                                                                        const normalized =
                                                                          normalizeVisualEditorRule(
                                                                            nextRules[idx]
                                                                          );
                                                                        nextRules[idx] = {
                                                                          ...normalized,
                                                                          mutation_attribute_value:
                                                                            value,
                                                                        };
                                                                      }
                                                                    );
                                                                  }}
                                                                  placeholder="e.g. Buy now"
                                                                  autoComplete="off"
                                                                />
                                                              </div>
                                                            )}
                                                            {rule.mutation_type === 'set_style' && (
                                                              <TextField
                                                                label="Inline style declarations"
                                                                value={rule.mutation_style || ''}
                                                                onChange={value => {
                                                                  updateCurrentVariantRules(
                                                                    nextRules => {
                                                                      const normalized =
                                                                        normalizeVisualEditorRule(
                                                                          nextRules[idx]
                                                                        );
                                                                      nextRules[idx] = {
                                                                        ...normalized,
                                                                        mutation_style: value,
                                                                      };
                                                                    }
                                                                  );
                                                                }}
                                                                placeholder="e.g. color: #111; font-weight: 700;"
                                                                multiline={3}
                                                                autoComplete="off"
                                                              />
                                                            )}
                                                          </div>
                                                        </div>
                                                      )}
                                                      {activeTab === 'generated' && (
                                                        <div className="variant-visual-editor-generated-tab-content">
                                                          <div className="variant-visual-editor-generated-tab-header">
                                                            <Text
                                                              as="span"
                                                              variant="bodySm"
                                                              tone="subdued"
                                                            >
                                                              Read-only preview of generated
                                                              mutation + snippets.
                                                            </Text>
                                                            <Button
                                                              size="slim"
                                                              onClick={async () => {
                                                                try {
                                                                  await navigator.clipboard.writeText(
                                                                    generatedCode
                                                                  );
                                                                  setVisualPreviewToast({
                                                                    message:
                                                                      'Generated code copied',
                                                                    type: 'success',
                                                                  });
                                                                } catch (_) {
                                                                  setVisualPreviewToast({
                                                                    message:
                                                                      'Copy failed in this browser',
                                                                    type: 'critical',
                                                                  });
                                                                }
                                                                setTimeout(
                                                                  () => setVisualPreviewToast(null),
                                                                  2200
                                                                );
                                                              }}
                                                            >
                                                              Copy
                                                            </Button>
                                                          </div>
                                                          <pre className="variant-visual-editor-generated-code">
                                                            {generatedCode}
                                                          </pre>
                                                        </div>
                                                      )}
                                                      {activeTab === 'css' && (
                                                        <TextField
                                                          label="CSS"
                                                          labelHidden
                                                          value={rule.css}
                                                          onChange={value => {
                                                            updateCurrentVariantRules(nextRules => {
                                                              nextRules[idx] = {
                                                                ...nextRules[idx],
                                                                css: value,
                                                              };
                                                            });
                                                          }}
                                                          placeholder="/* CSS for this element */"
                                                          multiline={5}
                                                          autoComplete="off"
                                                        />
                                                      )}
                                                      {activeTab === 'js' && (
                                                        <TextField
                                                          label="JavaScript"
                                                          labelHidden
                                                          value={rule.js}
                                                          onChange={value => {
                                                            updateCurrentVariantRules(nextRules => {
                                                              nextRules[idx] = {
                                                                ...nextRules[idx],
                                                                js: value,
                                                              };
                                                            });
                                                          }}
                                                          placeholder="// JS for this element"
                                                          multiline={5}
                                                          autoComplete="off"
                                                        />
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                              </>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </BlockStack>
                      </div>
                    </div>
                  </Collapsible>
                </div>

                <div className="config-editor-accordion-item">
                  <button
                    type="button"
                    className="config-editor-accordion-head"
                    onClick={() => {
                      const next = !codeEditorExpanded;
                      setCodeEditorExpanded(next);
                      if (next) setVisualEditorExpanded(false);
                    }}
                    aria-expanded={codeEditorExpanded}
                    aria-controls="config-editor-accordion-code-body"
                    id="config-editor-accordion-code-head"
                  >
                    <span className="config-editor-accordion-head-icon config-editor-accordion-head-icon--code">
                      <Icon source={CodeIcon} />
                    </span>
                    <span className="config-editor-accordion-head-label">Code Editor</span>
                    {codeEditorDirty && (
                      <span
                        className="config-editor-accordion-head-dirty"
                        title="Unsaved changes"
                        aria-hidden
                      >
                        •
                      </span>
                    )}
                    <span className="config-editor-accordion-head-chevron">
                      {codeEditorExpanded ? (
                        <Icon source={ChevronDownIcon} />
                      ) : (
                        <Icon source={ChevronRightIcon} />
                      )}
                    </span>
                  </button>
                  <Collapsible
                    id="config-editor-accordion-code-body"
                    open={codeEditorExpanded}
                    transition={{ duration: '200ms', timingFunction: 'ease' }}
                  >
                    <div className="config-editor-accordion-body config-editor-panel config-editor-panel--code">
                      <div className="variant-code-pane">
                        <div className="variant-code-toolbar">
                          <div className="variant-code-toolbar-variant" ref={variantDropdownRef}>
                            {(() => {
                              const current = variantCodesData[selectedVariantIndex];
                              const currentColor = getVariantColor(selectedVariantIndex);
                              return (
                                <>
                                  <div className="variant-code-dropdown">
                                    <button
                                      type="button"
                                      className="variant-code-dropdown-trigger"
                                      onClick={() => setVariantDropdownOpen(!variantDropdownOpen)}
                                      aria-expanded={variantDropdownOpen}
                                      aria-haspopup="listbox"
                                      aria-label="Select variant to edit"
                                      id="variant-code-dropdown-trigger"
                                    >
                                      <span
                                        className="variant-code-dropdown-trigger-dot"
                                        style={{ backgroundColor: currentColor }}
                                      />
                                      <span className="variant-code-dropdown-trigger-label">
                                        {current?.name ?? `Variant ${selectedVariantIndex + 1}`}
                                      </span>
                                      <span className="variant-code-dropdown-trigger-chevron">
                                        <Icon source={ChevronDownIcon} />
                                      </span>
                                    </button>
                                    {variantDropdownOpen && (
                                      <div
                                        className="variant-code-dropdown-panel"
                                        role="listbox"
                                        aria-labelledby="variant-code-dropdown-trigger"
                                        aria-activedescendant={`variant-code-option-${selectedVariantIndex}`}
                                      >
                                        {variantCodesData.map((v, i) => {
                                          const isSelected = i === selectedVariantIndex;
                                          const optionColor = getVariantColor(i);
                                          const hasCode =
                                            (v?.css && v.css.trim()) || (v?.js && v.js.trim());
                                          return (
                                            <button
                                              key={`variant-opt-${i}`}
                                              type="button"
                                              role="option"
                                              id={`variant-code-option-${i}`}
                                              aria-selected={isSelected}
                                              className={`variant-code-dropdown-option ${isSelected ? 'variant-code-dropdown-option--selected' : ''}`}
                                              onClick={() => {
                                                hasVariantSelectionRef.current = true;
                                                setSelectedVariantIndex(i);
                                                setVariantDropdownOpen(false);
                                              }}
                                              style={{ '--option-color': optionColor }}
                                            >
                                              <span
                                                className="variant-code-dropdown-option-dot"
                                                style={{ backgroundColor: optionColor }}
                                              />
                                              <span className="variant-code-dropdown-option-label">
                                                {v.name}
                                              </span>
                                              {hasCode && (
                                                <Badge tone="success" size="small">
                                                  Code
                                                </Badge>
                                              )}
                                              {isSelected && (
                                                <span className="variant-code-dropdown-option-check">
                                                  <Icon source={CheckCircleIcon} />
                                                </span>
                                              )}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </>
                              );
                            })()}
                            {variantCodesData.length > 1 && (
                              <div className="variant-code-toolbar-nav">
                                <Button
                                  plain
                                  size="slim"
                                  onClick={() => handleVariantNavigation('prev')}
                                  disabled={selectedVariantIndex === 0}
                                  aria-label="Previous variant"
                                  icon={ChevronLeftIcon}
                                />
                                <Text variant="bodySm" color="subdued" as="span">
                                  {selectedVariantIndex + 1} / {variantCodesData.length}
                                </Text>
                                <Button
                                  plain
                                  size="slim"
                                  onClick={() => handleVariantNavigation('next')}
                                  disabled={selectedVariantIndex === variantCodesData.length - 1}
                                  aria-label="Next variant"
                                  icon={ChevronRightIcon}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {(() => {
                          const currentVariant = variantCodesData[selectedVariantIndex] ?? {
                            name: `Variant ${selectedVariantIndex + 1}`,
                            css: '',
                            js: '',
                            code: '',
                          };
                          const color = getVariantColor(selectedVariantIndex);
                          const colorLight = getVariantColorLight(color, 0.06);
                          const colorLightStrong = getVariantColorLight(color, 0.12);
                          const cssLineCount = currentVariant.css
                            ? currentVariant.css.split('\n').length
                            : 0;
                          const jsLineCount = currentVariant.js
                            ? currentVariant.js.split('\n').length
                            : 0;

                          return (
                            <div
                              className="variant-code-editor-card"
                              style={{
                                '--variant-color': color,
                                '--variant-color-light': colorLight,
                                '--variant-color-light-strong': colorLightStrong,
                              }}
                            >
                              <Card sectioned>
                                <BlockStack gap="400">
                                  <div className="variant-code-summary">
                                    <span
                                      className="variant-code-summary-dot"
                                      style={{ backgroundColor: color }}
                                    />
                                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                                      {currentVariant.name}
                                    </Text>
                                    <Text variant="bodySm" color="subdued" as="span">
                                      CSS {cssLineCount} {cssLineCount === 1 ? 'line' : 'lines'} ·
                                      JS {jsLineCount} {jsLineCount === 1 ? 'line' : 'lines'}
                                    </Text>
                                  </div>

                                  <div className="variant-code-tabbed">
                                    <div
                                      className="variant-code-tab-bar"
                                      role="tablist"
                                      aria-label="CSS or JavaScript"
                                    >
                                      <button
                                        type="button"
                                        role="tab"
                                        aria-selected={codeEditorSubTab === 'css'}
                                        aria-controls="variant-code-panel-css"
                                        id="variant-code-tab-css"
                                        className={`variant-code-tab ${codeEditorSubTab === 'css' ? 'variant-code-tab--active' : ''}`}
                                        onClick={() => setCodeEditorSubTab('css')}
                                      >
                                        <span className="code-type-icon css-icon">
                                          <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                          >
                                            <path
                                              d="M4 2L5.5 19.5L12 22L18.5 19.5L20 2H4Z"
                                              stroke="currentColor"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                            <path
                                              d="M7 8H17M7 12H15M7 16H16"
                                              stroke="currentColor"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                            />
                                            <path
                                              d="M12 8L10 10L12 12"
                                              stroke="currentColor"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                          </svg>
                                        </span>
                                        <span>CSS</span>
                                        {cssLineCount > 0 && (
                                          <span className="variant-code-tab-meta">
                                            {cssLineCount} {cssLineCount === 1 ? 'line' : 'lines'}
                                          </span>
                                        )}
                                        {cssValidationErrors.length > 0 && (
                                          <Badge tone="critical" size="small">
                                            {cssValidationErrors.length}
                                          </Badge>
                                        )}
                                      </button>
                                      <button
                                        type="button"
                                        role="tab"
                                        aria-selected={codeEditorSubTab === 'js'}
                                        aria-controls="variant-code-panel-js"
                                        id="variant-code-tab-js"
                                        className={`variant-code-tab ${codeEditorSubTab === 'js' ? 'variant-code-tab--active' : ''}`}
                                        onClick={() => setCodeEditorSubTab('js')}
                                      >
                                        <span className="code-type-icon js-icon">
                                          <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                          >
                                            <rect
                                              x="2"
                                              y="2"
                                              width="20"
                                              height="20"
                                              rx="2"
                                              stroke="currentColor"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                            <path
                                              d="M8 8C8 8 9 7 10 7C11 7 12 8 12 9C12 10 11 11 10 11C9 11 8 12 8 13C8 14 9 15 10 15C11 15 12 14 12 14"
                                              stroke="currentColor"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                            />
                                            <path
                                              d="M16 8L16 14M16 11L18 11"
                                              stroke="currentColor"
                                              strokeWidth="1.5"
                                              strokeLinecap="round"
                                            />
                                          </svg>
                                        </span>
                                        <span>JavaScript</span>
                                        {jsLineCount > 0 && (
                                          <span className="variant-code-tab-meta">
                                            {jsLineCount} {jsLineCount === 1 ? 'line' : 'lines'}
                                          </span>
                                        )}
                                        {jsValidationErrors.length > 0 && (
                                          <Badge tone="critical" size="small">
                                            {jsValidationErrors.length}
                                          </Badge>
                                        )}
                                      </button>
                                    </div>
                                    <div
                                      id="variant-code-panel-css"
                                      role="tabpanel"
                                      aria-labelledby="variant-code-tab-css"
                                      hidden={codeEditorSubTab !== 'css'}
                                      className={`variant-code-tab-panel ${codeEditorSubTab === 'css' ? 'variant-code-tab-panel--active' : ''}`}
                                    >
                                      <div className="variant-code-editor-wrapper">
                                        <CodeEditorIDE
                                          value={currentVariant.css || ''}
                                          onChange={value =>
                                            handleVariantCodeChange(
                                              'css',
                                              value,
                                              selectedVariantIndex
                                            )
                                          }
                                          language="css"
                                          placeholder="/* Enter your CSS */&#10;&#10;.my-class {&#10;  color: #333;&#10;  font-size: 16px;&#10;}"
                                          error={
                                            cssValidationErrors.length > 0
                                              ? cssValidationErrors[0]
                                              : undefined
                                          }
                                          minHeight={360}
                                          aria-label="CSS code"
                                        />
                                        {cssValidationErrors.length > 0 && (
                                          <div className="code-validation-errors">
                                            <BlockStack gap="200">
                                              {cssValidationErrors.map((errorItem, idx) => (
                                                <div key={idx} className="validation-error-item">
                                                  <InlineStack gap="200" align="start">
                                                    <svg
                                                      width="16"
                                                      height="16"
                                                      viewBox="0 0 16 16"
                                                      fill="none"
                                                    >
                                                      <circle
                                                        cx="8"
                                                        cy="8"
                                                        r="7"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                      />
                                                      <path
                                                        d="M8 5V8M8 11H8.01"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                        strokeLinecap="round"
                                                      />
                                                    </svg>
                                                    <Text
                                                      variant="bodySm"
                                                      color="critical"
                                                      as="span"
                                                    >
                                                      {errorItem}
                                                    </Text>
                                                  </InlineStack>
                                                </div>
                                              ))}
                                            </BlockStack>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div
                                      id="variant-code-panel-js"
                                      role="tabpanel"
                                      aria-labelledby="variant-code-tab-js"
                                      hidden={codeEditorSubTab !== 'js'}
                                      className={`variant-code-tab-panel ${codeEditorSubTab === 'js' ? 'variant-code-tab-panel--active' : ''}`}
                                    >
                                      <div className="variant-code-editor-wrapper">
                                        <CodeEditorIDE
                                          value={currentVariant.js || ''}
                                          onChange={value =>
                                            handleVariantCodeChange(
                                              'js',
                                              value,
                                              selectedVariantIndex
                                            )
                                          }
                                          language="javascript"
                                          placeholder="// Enter your JavaScript&#10;&#10;console.log('Hello');&#10;document.querySelector('.my-class').style.display = 'block';"
                                          error={
                                            jsValidationErrors.length > 0
                                              ? jsValidationErrors[0]
                                              : undefined
                                          }
                                          minHeight={360}
                                          aria-label="JavaScript code"
                                        />
                                        {jsValidationErrors.length > 0 && (
                                          <div className="code-validation-errors">
                                            <BlockStack gap="200">
                                              {jsValidationErrors.map((errorItem, idx) => (
                                                <div key={idx} className="validation-error-item">
                                                  <InlineStack gap="200" align="start">
                                                    <svg
                                                      width="16"
                                                      height="16"
                                                      viewBox="0 0 16 16"
                                                      fill="none"
                                                    >
                                                      <circle
                                                        cx="8"
                                                        cy="8"
                                                        r="7"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                      />
                                                      <path
                                                        d="M8 5V8M8 11H8.01"
                                                        stroke="currentColor"
                                                        strokeWidth="1.5"
                                                        strokeLinecap="round"
                                                      />
                                                    </svg>
                                                    <Text
                                                      variant="bodySm"
                                                      color="critical"
                                                      as="span"
                                                    >
                                                      {errorItem}
                                                    </Text>
                                                  </InlineStack>
                                                </div>
                                              ))}
                                            </BlockStack>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="variant-code-help-text">
                                    <Text variant="bodySm" color="subdued" as="p">
                                      💡 CSS and JavaScript are wrapped in &lt;style&gt; and
                                      &lt;script&gt; tags when saved.
                                    </Text>
                                  </div>
                                </BlockStack>
                              </Card>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </Collapsible>
                </div>
              </div>
            </BlockStack>
          ) : (
            <Card sectioned>
              <div className="variant-codes-empty-state">
                <Text variant="bodyMd" color="subdued" as="p" alignment="center">
                  No variants configured for this test.
                </Text>
                <Text
                  variant="bodySm"
                  color="subdued"
                  as="p"
                  alignment="center"
                  style={{ marginTop: '0.5rem' }}
                >
                  Add variants in the Traffic Allocation step to start editing codes.
                </Text>
              </div>
            </Card>
          )}
        </BlockStack>
      </Card>
    );
  };

  const renderReview = () => {
    const reviewSegments = formData.segments || initialData?.segments || {};
    const reviewCountries =
      Array.isArray(reviewSegments.countries) && reviewSegments.countries.length > 0
        ? reviewSegments.countries.join(', ')
        : 'All countries';
    const reviewHoldout = formData.holdout_percent ?? initialData?.holdout_percent ?? 0;
    const reviewVariants = formData.variants?.length
      ? formData.variants
      : initialData?.variants || [];
    const isPriceReview = isPriceLikeTestType(formData.type || initialData?.type);
    const isCheckoutReview =
      String(formData.type || initialData?.type || '').toLowerCase() === 'checkout';
    const isShippingReview =
      String(formData.type || initialData?.type || '').toLowerCase() === 'shipping';
    const checkoutReviewPhase = normalizeCheckoutPhase(
      formData.goal?.checkout_phase || initialData?.goal?.checkout_phase
    );
    const isDeployableCheckoutCustomizationReview =
      isCheckoutReview &&
      (checkoutReviewPhase === 'payment_method' || checkoutReviewPhase === 'delivery_method');
    const canEnsureCheckoutCustomizationFromReview =
      isDeployableCheckoutCustomizationReview && Boolean(initialData?.id);
    const checkoutCustomizationReviewDisabled =
      checkoutCustomizationLoading || loading || submitLoading || isDirty;
    const wizardCheckoutReadinessSummary = wizardCheckoutReadiness?.summary || null;
    const wizardCheckoutReadinessHighlights = Array.isArray(wizardCheckoutReadiness?.highlights)
      ? wizardCheckoutReadiness.highlights.slice(0, 3)
      : [];
    const checkoutExperienceSummary = checkoutExperienceDiagnostics?.summary || null;
    const canExecuteShippingFromReview = canShowShippingExecution({
      mode,
      testType: formData.type || initialData?.type,
      testId: initialData?.id,
    });
    const shippingExecSummary = shippingExecutionReport?.execution_result?.summary || null;
    const shippingExecActions = Array.isArray(shippingExecutionReport?.execution_result?.actions)
      ? shippingExecutionReport.execution_result.actions
      : [];
    const shippingDiagnostics = shippingDiagnosticsReport?.diagnostics || null;
    const shippingCapabilityReport = shippingDiagnosticsReport?.capability_report || null;
    const shippingExecutionPlanDiagnostics = shippingDiagnosticsReport?.execution_plan || null;
    const reviewShippingTargetType = String(formData.target_type || initialData?.target_type || '')
      .trim()
      .toLowerCase();
    const isShippingStorewideReview =
      isShippingReview &&
      (reviewShippingTargetType === 'all-products' || reviewShippingTargetType === 'all_products');
    const shippingDiagnosticsConflictCount = Number(
      shippingDiagnostics?.readiness?.running_shipping_conflicts || 0
    );
    const shippingExecutionDisabled = shouldDisableShippingExecution({
      shippingExecutionLoading,
      wizardLoading: loading,
      submitLoading,
      isDirty,
    });
    const shippingReviewApplyDisabled =
      shippingExecutionDisabled || (isShippingStorewideReview && !shippingStorewideApplyConfirmed);
    const actionableShippingVariants = isShippingReview
      ? (formData.variants || []).map((variant, index) => ({
          variant,
          index,
          strategy:
            String(variant?.config?.strategy || '')
              .trim()
              .toLowerCase() || 'control',
        }))
      : [];
    const shippingReviewSafetyChecklist = isShippingReview
      ? [
          {
            label: 'Holdout is 10% or higher for safer live exposure',
            passed: Number(reviewHoldout || 0) >= 10,
          },
          {
            label: 'Excluded products are configured for carve-outs',
            passed: excludedScopeProductIds.length > 0,
          },
          {
            label: 'Shipping diagnostics have been run in this session',
            passed: Boolean(shippingDiagnostics),
          },
          {
            label: 'No live shipping conflicts are currently reported',
            passed: Boolean(shippingDiagnostics) && shippingDiagnosticsConflictCount === 0,
          },
        ]
      : [];
    const shippingDiagnosticsInsights = (() => {
      if (!shippingDiagnostics) {
        return [];
      }

      const insights = [];
      const planVariants = Array.isArray(shippingExecutionPlanDiagnostics?.variants)
        ? shippingExecutionPlanDiagnostics.variants
        : [];
      const manualRequiredVariants = planVariants.filter(
        variant => variant?.status === 'manual_required'
      );
      const carrierVariants = planVariants.filter(
        variant => variant?.execution_adapter === 'carrier_service' && variant?.actionable
      );
      const discountFunctionVariants = planVariants.filter(
        variant => variant?.execution_adapter === 'discount_function' && variant?.actionable
      );
      const capabilityWarnings = Array.isArray(shippingCapabilityReport?.capabilities?.warnings)
        ? shippingCapabilityReport.capabilities.warnings
        : [];
      const adapterSupport = shippingCapabilityReport?.capabilities?.adapter_support || {};

      if (shippingDiagnosticsConflictCount > 0) {
        insights.push({
          tone: 'critical',
          title: 'Another managed shipping test is already active',
          body:
            shippingDiagnosticsConflictCount === 1
              ? 'RipX found 1 other running shipping test with managed resources. Launching another one can create overlapping carrier or delivery behavior.'
              : `RipX found ${shippingDiagnosticsConflictCount} other running shipping tests with managed resources. Launching another one can create overlapping carrier or delivery behavior.`,
          fix: 'Stop or clean up the other managed shipping test before applying this one, or keep this test in dry-run/manual mode until the overlap is removed.',
          actions: ['rerun-diagnostics', 'jump-to-targeting'],
        });
      }

      if (carrierVariants.length > 0 && !shippingDiagnostics.urls?.carrier_callback_url) {
        insights.push({
          tone: 'critical',
          title: 'Carrier callback URL is missing',
          body: 'At least one actionable variant plans to use CarrierService, but no carrier callback URL is configured. Carrier-based shipping actions will not be provisioned correctly until that URL is set.',
          fix: 'Set `RIPX_SHIPPING_CARRIER_CALLBACK_URL` or make `APP_URL/api/track/shipping-carrier-rates` publicly reachable, then rerun shipping diagnostics.',
          actions: ['rerun-diagnostics', 'open-docs'],
        });
      }

      if (
        discountFunctionVariants.length > 0 &&
        !shippingDiagnostics.urls?.shipping_resolve_batch_url
      ) {
        insights.push({
          tone: 'critical',
          title: 'Shipping resolve endpoint is missing',
          body: 'At least one actionable variant plans to use the checkout discount-function path, but the shipping batch resolve URL is not configured.',
          fix: 'Set `RIPX_SHIPPING_RESOLVE_BATCH_URL` or ensure `APP_URL/api/track/shipping-resolve-batch` is reachable from Shopify, then rerun diagnostics.',
          actions: ['rerun-diagnostics', 'open-docs'],
        });
      }

      if (manualRequiredVariants.length > 0) {
        const names = manualRequiredVariants
          .slice(0, 3)
          .map(variant => variant?.name || `Variant ${Number(variant?.index || 0) + 1}`);
        const extraCount = manualRequiredVariants.length - names.length;
        const adapterLabels = Array.from(
          new Set(manualRequiredVariants.map(variant => variant?.execution_adapter).filter(Boolean))
        );
        const adapterReason = adapterLabels
          .map(label => adapterSupport?.[label]?.reason)
          .find(Boolean);
        insights.push({
          tone: 'warning',
          title: 'Some variants still require manual rollout',
          body: `${names.join(', ')}${extraCount > 0 ? ` +${extraCount} more` : ''} cannot be auto-applied with the current shop capabilities.${adapterReason ? ` ${adapterReason}` : ''}`,
          fix: 'Switch those variants to a supported execution path, use a compatible store plan, or proceed with manual setup for the blocked variants only.',
          actions: ['jump-to-targeting', 'open-docs'],
        });
      }

      capabilityWarnings.forEach(message => {
        insights.push({
          tone: 'warning',
          title: 'Shopify capability gap detected',
          body: message,
          fix: 'Update app scopes or shop capabilities, then reopen RipX from Shopify Admin and rerun diagnostics to confirm the gap is resolved.',
          actions: ['rerun-diagnostics', 'open-docs'],
        });
      });

      if (shippingDiagnostics.readiness?.assignment_signature_required) {
        insights.push({
          tone: 'info',
          title: 'Signed assignment markers are required',
          body: 'Checkout resolution expects signed `_ripx_*` assignment markers on cart lines. Verify the storefront script is live before you rely on shipping execution in checkout.',
          fix: 'Confirm the latest storefront script is published and live on the store, then test a cart flow to verify `_ripx_*` assignment attributes are being injected.',
          actions: ['open-docs'],
        });
      }

      if (
        shippingExecutionPlanDiagnostics?.recommended_execution_path &&
        shippingExecutionPlanDiagnostics.recommended_execution_path === 'manual'
      ) {
        insights.push({
          tone: 'info',
          title: 'Manual execution is the current recommended path',
          body: 'RipX diagnostics suggest a manual rollout path for this store right now. Use dry run output and diagnostics to confirm what can be automated versus what needs manual setup.',
          fix: 'Run a dry run, review each actionable variant, and apply only the supported pieces automatically while following up manually on the rest.',
          actions: ['jump-to-exclusions', 'open-docs'],
        });
      }

      return insights;
    })();
    const reviewTargetProductIds =
      (formData.target_type || initialData?.target_type) === 'product'
        ? formData.target_ids?.length
          ? formData.target_ids
          : formData.target_id
            ? [formData.target_id]
            : initialData?.target_ids?.length
              ? initialData.target_ids
              : initialData?.target_id
                ? [initialData.target_id]
                : []
        : [];
    const parsedReviewCatalogPrice =
      exampleCatalogPrice !== '' && Number.isFinite(Number.parseFloat(exampleCatalogPrice))
        ? Number.parseFloat(exampleCatalogPrice)
        : null;
    const parsedReviewCompareAtPrice =
      exampleCompareAtPrice !== '' && Number.isFinite(Number.parseFloat(exampleCompareAtPrice))
        ? Number.parseFloat(exampleCompareAtPrice)
        : null;
    const reviewNeedsCompareAt = reviewVariants.some(v => configUsesCompareAtBase(v?.config || {}));
    const reviewPriceSimulation =
      isPriceReview && parsedReviewCatalogPrice !== null
        ? buildPriceSimulationRows({
            variants: reviewVariants,
            catalogPrice: parsedReviewCatalogPrice,
            compareAtPrice: parsedReviewCompareAtPrice,
            targetType: formData.target_type || initialData?.target_type,
            targetProductIds: reviewTargetProductIds,
          })
        : {
            rows: [],
            truncated: false,
            hasVariantOverrideRows: false,
            hasCompareAtBase: reviewNeedsCompareAt,
            hasMissingCompareAt: false,
          };

    const targetingParts = [
      (reviewSegments.page_rules || []).length > 0
        ? `${reviewSegments.page_rules.length} page rule(s)`
        : normalizeTextValue(reviewSegments.url_pattern)
          ? `URL: ${normalizeTextValue(reviewSegments.url_pattern)}`
          : 'All pages',
      (reviewSegments.device_rules || []).length > 0
        ? `${reviewSegments.device_rules.length} device rule(s)`
        : `${reviewSegments.device || 'all'} device`,
      (reviewSegments.audience_rules || []).length > 0
        ? `${reviewSegments.audience_rules.length} audience rule(s)`
        : `${reviewSegments.customer || 'all'} customers, ${reviewCountries}`,
    ];
    if (reviewSegments.js_targeting?.enabled) {
      targetingParts.push('Custom JS');
    }
    targetingParts.push(
      `Anti-flicker: ${reviewSegments.anti_flicker_mode === 'strict' ? 'Strict' : 'Balanced'}`
    );
    const targetingSummary = targetingParts.join(' · ');

    return (
      <div className={stepStyles.reviewStep}>
        <div className={stepStyles.reviewStepAccent} aria-hidden />
        <div className={stepStyles.reviewStepHeader}>
          <span className={stepStyles.reviewStepHeaderIcon}>
            <Icon source={CheckCircleIcon} />
          </span>
          <div>
            <h2 className={stepStyles.reviewStepTitle}>Review Test Configuration</h2>
            <p className={stepStyles.reviewStepSubtitle}>
              Confirm your settings before {mode === 'create' ? 'creating' : 'saving'} the test
            </p>
          </div>
        </div>

        {isPriceReview && (
          <div className={stepStyles.reviewSection} style={{ marginBottom: '1rem' }}>
            <Banner tone="warning" title="Before you start: set catalog to highest test price">
              <BlockStack gap="200">
                <Text as="p" variant="bodySm">
                  To charge the test price at checkout, set your Shopify product catalog to the{' '}
                  <strong>highest</strong> price in this test before starting. Otherwise the
                  customer sees the test price on the product page but pays the catalog price at
                  checkout.
                </Text>
                {!['product', 'all-products', 'all_products'].includes(
                  String(formData.target_type || '').toLowerCase()
                ) && (
                  <Text as="p" variant="bodySm" tone="critical">
                    This test is not in <strong>Product / all-products</strong> scope. Checkout
                    price-alignment automation requires one of those scopes.
                  </Text>
                )}
                <Text as="p" variant="bodySm">
                  Use the{' '}
                  <Link to={`${ROUTES.DOCS}#price-testing`} rel="noopener noreferrer">
                    Price testing guide
                  </Link>{' '}
                  for the pre-launch QA checklist (script live, preview each variant, incognito
                  test, full journey to checkout).
                </Text>
                <div style={{ marginTop: 12 }}>
                  <Checkbox
                    label="I've set my catalog to the highest test price (or I'm running display-only)"
                    checked={catalogConfirmedForPriceTest}
                    onChange={setCatalogConfirmedForPriceTest}
                  />
                </div>
                <Text as="p" variant="bodySm" tone="subdued" style={{ marginTop: 12 }}>
                  Tip: document your hypothesis in the test description (e.g. “If we show 10% off,
                  then revenue will increase because…”). It keeps decisions traceable after the
                  test.
                </Text>
              </BlockStack>
            </Banner>
          </div>
        )}

        {isPriceReview && (
          <div className={stepStyles.reviewSection} style={{ marginBottom: '1rem' }}>
            <div className={stepStyles.reviewSectionTitle}>
              <span className={stepStyles.reviewSectionTitleIcon}>
                <Icon source={DataTableIcon} />
              </span>
              Price Simulation Export
            </div>
            <BlockStack gap="300">
              <div style={{ maxWidth: 220 }}>
                <TextField
                  label="Example catalog price"
                  value={exampleCatalogPrice}
                  onChange={setExampleCatalogPrice}
                  type="number"
                  prefix="$"
                  autoComplete="off"
                  min={0}
                  step={0.01}
                  helpText="Used to generate the scenario export CSV."
                />
              </div>
              {reviewNeedsCompareAt && (
                <div style={{ maxWidth: 240 }}>
                  <TextField
                    label="Example compare-at price"
                    value={exampleCompareAtPrice}
                    onChange={setExampleCompareAtPrice}
                    type="number"
                    prefix="$"
                    autoComplete="off"
                    min={0}
                    step={0.01}
                    helpText="Required when any variant uses Compare-at base."
                  />
                </div>
              )}
              <InlineStack gap="200" blockAlign="center" wrap>
                <Button
                  size="slim"
                  onClick={() =>
                    downloadPriceSimulationCsv(reviewPriceSimulation.rows, reviewVariants)
                  }
                  disabled={
                    !reviewPriceSimulation.rows.length ||
                    (reviewNeedsCompareAt && parsedReviewCompareAtPrice === null)
                  }
                >
                  Export simulation CSV
                </Button>
                {parsedReviewCatalogPrice === null && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Add an example catalog price to enable export.
                  </Text>
                )}
                {parsedReviewCatalogPrice !== null &&
                  reviewNeedsCompareAt &&
                  parsedReviewCompareAtPrice === null && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      Add an example compare-at price to export Compare-at based scenarios.
                    </Text>
                  )}
                {lastSimulationExportAt && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Last exported at{' '}
                    {lastSimulationExportAt.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                )}
              </InlineStack>
            </BlockStack>
          </div>
        )}

        <div className={stepStyles.reviewSection}>
          <div className={stepStyles.reviewSectionTitle}>
            <span className={stepStyles.reviewSectionTitleIcon}>
              <Icon source={TargetIcon} />
            </span>
            Test Overview
          </div>
          <div className={stepStyles.reviewGrid}>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Test Name</span>
              <span className={stepStyles.reviewItemValue}>
                {formData.name || initialData?.name || 'Not set'}
              </span>
            </div>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Test Type</span>
              <span className={stepStyles.reviewItemValue}>{formData.type || '—'}</span>
            </div>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Scope</span>
              <span className={stepStyles.reviewItemValue}>
                {[
                  'all',
                  'homepage',
                  'cart',
                  'checkout',
                  'all-products',
                  'all-collections',
                ].includes(formData.target_type || initialData?.target_type)
                  ? {
                      all: 'All pages',
                      homepage: 'Homepage',
                      cart: 'Cart',
                      checkout: 'Checkout',
                      'all-products': 'All products',
                      'all-collections': 'All collections',
                    }[formData.target_type || initialData?.target_type] || '—'
                  : Array.isArray(formData.target_ids) && formData.target_ids.length > 0
                    ? `${formData.target_ids.length} ${formData.target_type || 'item'}(s)`
                    : formData.target_id || initialData?.target_id || 'Not set'}
              </span>
            </div>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Success Metric</span>
              <span className={stepStyles.reviewItemValue}>
                {(() => {
                  const m = formData.goal?.metric || initialData?.goal?.metric;
                  return m
                    ? { revenue: 'Revenue', conversion_rate: 'Conversion', aov: 'AOV' }[m] || m
                    : 'Not set';
                })()}
              </span>
            </div>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Conversion Window</span>
              <span className={stepStyles.reviewItemValue}>
                {formData.goal?.conversion_window_days ??
                  initialData?.goal?.conversion_window_days ??
                  30}{' '}
                days
              </span>
            </div>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Analysis</span>
              <span className={stepStyles.reviewItemValue}>
                {(formData.goal?.analysis_method ||
                  initialData?.goal?.analysis_method ||
                  'frequentist') === 'bayesian'
                  ? 'Bayesian'
                  : 'Frequentist (p-values)'}
              </span>
            </div>
            {normalizeTextValue(
              formData.goal?.conversion_url || initialData?.goal?.conversion_url
            ) && (
              <div className={stepStyles.reviewItem}>
                <span className={stepStyles.reviewItemLabel}>Goal URL</span>
                <span className={stepStyles.reviewItemValue}>
                  {normalizeTextValue(
                    formData.goal?.conversion_url || initialData?.goal?.conversion_url || ''
                  )}
                </span>
              </div>
            )}
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Confidence</span>
              <span className={stepStyles.reviewItemValue}>
                {Math.round((formData.goal?.significance_level ?? 0.95) * 100)}%
              </span>
            </div>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Power</span>
              <span className={stepStyles.reviewItemValue}>
                {Math.round((formData.goal?.statistical_power ?? 0.8) * 100)}%
              </span>
            </div>
            <div className={stepStyles.reviewItem}>
              <span className={stepStyles.reviewItemLabel}>Holdout</span>
              <span className={stepStyles.reviewItemValue}>{reviewHoldout}%</span>
            </div>
          </div>
        </div>

        <div className={stepStyles.reviewSection}>
          <div className={stepStyles.reviewSectionTitle}>
            <span className={stepStyles.reviewSectionTitleIcon}>
              <Icon source={PageIcon} />
            </span>
            Targeting
          </div>
          <Text variant="bodyMd" as="p">
            {targetingSummary}
          </Text>
          {reviewSegments.js_targeting?.enabled && (
            <Text variant="bodySm" tone="subdued" as="p" style={{ marginTop: '0.5rem' }}>
              Custom JS targeting enabled
            </Text>
          )}
        </div>

        <div className={stepStyles.reviewSection}>
          <div className={stepStyles.reviewSectionTitle}>
            <span className={stepStyles.reviewSectionTitleIcon}>
              <Icon source={ChartLineIcon} />
            </span>
            Variants
          </div>
          {isPriceReview ? (
            <BlockStack gap="300">
              {isShopifyFromRoute &&
                !isStandalone &&
                directPriceOverrideReadiness !== 'ready' &&
                directPriceOverrideReadiness !== 'checking' &&
                directPriceOverrideReadiness !== 'unknown' && (
                  <Banner tone="warning" title="Direct Price Override is unavailable on this shop">
                    <Text as="p" variant="bodySm">
                      {directPriceOverrideStatusMessage} This test will save with checkout method
                      <strong> Auto</strong> (discount/native path) until cart transform is ready.
                    </Text>
                  </Banner>
                )}
              {isShopifyFromRoute &&
                !isStandalone &&
                directPriceOverrideReadiness === 'unknown' && (
                  <Banner tone="warning" title="Price test launch needs manual verification">
                    <Text as="p" variant="bodySm">
                      {directPriceOverrideStatusMessage} Confirm Shopify function installation
                      before launching this test.
                    </Text>
                  </Banner>
                )}
              <div className={stepStyles.reviewVariantGrid}>
                {reviewVariants.map((v, i) => {
                  const reviewPreview = getPricePreview(v?.config || {}, v?.name);
                  const reviewRuleValue = getPriceValueCell(v);
                  const reviewMethod = getResolvedPriceApplicationMethodSummary(v?.config || {});
                  return (
                    <div key={i} className={stepStyles.reviewVariantCard}>
                      <div className={stepStyles.reviewVariantCardHeader}>
                        <div className={stepStyles.reviewVariantCardTitleRow}>
                          <span
                            className={stepStyles.reviewVariantChipColor}
                            style={{ backgroundColor: getVariantColor(i) }}
                          />
                          <span className={stepStyles.reviewVariantCardTitle}>{v.name}</span>
                        </div>
                        <Badge tone="info">{v.allocation}% traffic</Badge>
                      </div>
                      <div className={stepStyles.reviewVariantMetrics}>
                        <div className={stepStyles.reviewVariantMetric}>
                          <span className={stepStyles.reviewVariantMetricLabel}>Rule</span>
                          <span className={stepStyles.reviewVariantMetricValue}>
                            {reviewRuleValue}
                          </span>
                        </div>
                        <div className={stepStyles.reviewVariantMetric}>
                          <span className={stepStyles.reviewVariantMetricLabel}>Display price</span>
                          <span className={stepStyles.reviewVariantMetricValue}>
                            {reviewPreview}
                          </span>
                        </div>
                        <div className={stepStyles.reviewVariantMetric}>
                          <span className={stepStyles.reviewVariantMetricLabel}>Checkout path</span>
                          <span className={stepStyles.reviewVariantMetricValue}>
                            {reviewMethod.label}
                          </span>
                        </div>
                      </div>
                      <p className={stepStyles.reviewVariantCardHint}>{reviewMethod.detail}</p>
                    </div>
                  );
                })}
              </div>
            </BlockStack>
          ) : isCheckoutReview ? (
            <BlockStack gap="300">
              <Banner tone="info" title="Checkout launch contract">
                <Text as="p" variant="bodySm">
                  This test is configured as a{' '}
                  <strong>{getCheckoutPhaseLabel(checkoutReviewPhase).toLowerCase()}</strong>{' '}
                  experiment. Experience blocks can render through the Checkout UI Extension today.
                  Payment and delivery phases use the same saved schema so readiness and Shopify
                  customization deployment target the right checkout surface.
                </Text>
              </Banner>
              <div className={stepStyles.reviewVariantGrid}>
                {reviewVariants.map((v, i) => {
                  const cfg = v?.config || {};
                  const paymentMethods = getCheckoutListPreview(cfg.payment_method_names);
                  const deliveryMethods = getCheckoutListPreview(cfg.delivery_method_names);
                  const experienceSections = getActionableCheckoutSections(cfg);
                  const primarySection = experienceSections[0] || null;
                  const primaryProps = primarySection?.props || {};
                  const primaryProductItems = normalizeCheckoutProductItems(
                    primaryProps.product_items
                  );
                  const renderablePrimaryProductItems = primaryProductItems.filter(
                    hasRenderableCheckoutProductItem
                  );
                  const experienceSummary = String(
                    primaryProps.message ||
                      primaryProps.title ||
                      primaryProps.badge_text ||
                      (renderablePrimaryProductItems.length > 0
                        ? `${renderablePrimaryProductItems.length} product card${renderablePrimaryProductItems.length === 1 ? '' : 's'}`
                        : '') ||
                      primaryProps.disclaimer ||
                      ''
                  ).trim();
                  const reviewSummary =
                    checkoutReviewPhase === 'payment_method'
                      ? paymentMethods || 'No payment methods selected'
                      : checkoutReviewPhase === 'delivery_method'
                        ? deliveryMethods || 'No delivery methods selected'
                        : experienceSummary || 'No checkout content configured';
                  const reviewDetail =
                    checkoutReviewPhase === 'payment_method'
                      ? `${String(cfg.payment_action || 'hide')} methods`
                      : checkoutReviewPhase === 'delivery_method'
                        ? `${String(cfg.delivery_action || 'hide')} methods`
                        : `${experienceSections.length || 0} section(s) • ${String(
                            primaryProps.layout || 'banner'
                          )} layout • ${String(primaryProps.tone || 'success')} tone`;
                  return (
                    <div key={i} className={stepStyles.reviewVariantCard}>
                      <div className={stepStyles.reviewVariantCardHeader}>
                        <div className={stepStyles.reviewVariantCardTitleRow}>
                          <span
                            className={stepStyles.reviewVariantChipColor}
                            style={{ backgroundColor: getVariantColor(i) }}
                          />
                          <span className={stepStyles.reviewVariantCardTitle}>{v.name}</span>
                        </div>
                        <Badge tone="info">{v.allocation}% traffic</Badge>
                      </div>
                      <div className={stepStyles.reviewVariantMetrics}>
                        <div className={stepStyles.reviewVariantMetric}>
                          <span className={stepStyles.reviewVariantMetricLabel}>Phase</span>
                          <span className={stepStyles.reviewVariantMetricValue}>
                            {getCheckoutPhaseLabel(checkoutReviewPhase)}
                          </span>
                        </div>
                        <div className={stepStyles.reviewVariantMetric}>
                          <span className={stepStyles.reviewVariantMetricLabel}>Summary</span>
                          <span className={stepStyles.reviewVariantMetricValue}>
                            {reviewSummary}
                          </span>
                        </div>
                        <div className={stepStyles.reviewVariantMetric}>
                          <span className={stepStyles.reviewVariantMetricLabel}>Execution</span>
                          <span className={stepStyles.reviewVariantMetricValue}>
                            {reviewDetail}
                          </span>
                        </div>
                      </div>
                      {checkoutReviewPhase === 'experience' &&
                      Array.isArray(primaryProps.feature_bullets) &&
                      primaryProps.feature_bullets.length > 0 ? (
                        <p className={stepStyles.reviewVariantCardHint}>
                          Bullets: {primaryProps.feature_bullets.join(', ')}
                        </p>
                      ) : checkoutReviewPhase === 'experience' &&
                        renderablePrimaryProductItems.length > 0 ? (
                        <p className={stepStyles.reviewVariantCardHint}>
                          Products:{' '}
                          {renderablePrimaryProductItems
                            .map(item => item.title)
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                      ) : (
                        <p className={stepStyles.reviewVariantCardHint}>
                          {checkoutReviewPhase === 'payment_method'
                            ? 'Use checkout readiness after save to verify payment-method setup and extension availability.'
                            : checkoutReviewPhase === 'delivery_method'
                              ? 'Use checkout readiness after save to verify delivery-method targeting and deployment status.'
                              : 'Use checkout readiness after save to verify the Checkout UI Extension configuration and sync state.'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </BlockStack>
          ) : (
            <div className={stepStyles.reviewVariantsList}>
              {reviewVariants.map((v, i) => (
                <div key={i} className={stepStyles.reviewVariantChip}>
                  <span
                    className={stepStyles.reviewVariantChipColor}
                    style={{ backgroundColor: getVariantColor(i) }}
                  />
                  {v.name}: {v.allocation}%
                </div>
              ))}
            </div>
          )}
        </div>

        {((isCheckoutReview && checkoutExperienceSummary) || wizardCheckoutReadinessSummary) && (
          <div className={stepStyles.reviewSection}>
            <div className={stepStyles.reviewSectionTitle}>
              <span className={stepStyles.reviewSectionTitleIcon}>
                <Icon source={TargetIcon} />
              </span>
              Checkout launch readiness
            </div>
            <BlockStack gap="300">
              {isCheckoutReview && checkoutExperienceSummary && (
                <Banner
                  tone={checkoutExperienceSummary.overall_ok ? 'success' : 'warning'}
                  title="Store-level checkout experience status"
                >
                  <Text as="p" variant="bodySm">
                    {checkoutExperienceSummary.headline}
                  </Text>
                </Banner>
              )}
              {wizardCheckoutReadinessSummary && (
                <Banner
                  tone={
                    wizardCheckoutReadinessSummary.status === 'ready'
                      ? 'success'
                      : wizardCheckoutReadinessSummary.status === 'blocked'
                        ? 'critical'
                        : 'warning'
                  }
                  title="Per-test checkout readiness"
                >
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm">
                      {wizardCheckoutReadinessSummary.headline}
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      Next:{' '}
                      {wizardCheckoutReadinessSummary.next_action ||
                        'Review the highlighted blockers before launch.'}
                    </Text>
                    {wizardCheckoutReadinessHighlights.map(item => (
                      <Text key={item.id} as="p" variant="bodySm" tone="subdued">
                        • {item.message}
                      </Text>
                    ))}
                  </BlockStack>
                </Banner>
              )}
              {wizardCheckoutReadinessLoading && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Checking per-test checkout readiness...
                </Text>
              )}
              {wizardCheckoutReadinessError && (
                <Text as="p" variant="bodySm" tone="critical">
                  {wizardCheckoutReadinessError}
                </Text>
              )}
              {checkoutExperienceDiagnosticsError && isCheckoutReview && (
                <Text as="p" variant="bodySm" tone="critical">
                  {checkoutExperienceDiagnosticsError}
                </Text>
              )}
            </BlockStack>
          </div>
        )}

        {isDeployableCheckoutCustomizationReview && (
          <div className={stepStyles.reviewSection}>
            <div className={stepStyles.reviewSectionTitle}>
              <span className={stepStyles.reviewSectionTitleIcon}>
                <Icon source={TargetIcon} />
              </span>
              Checkout customization deployment
            </div>
            <BlockStack gap="300">
              <Text as="p" variant="bodySm">
                Dry run previews whether RipX will create or update the Shopify{' '}
                {checkoutReviewPhase === 'payment_method'
                  ? 'payment customization'
                  : 'delivery customization'}{' '}
                for this saved test. Apply writes the customization and its JSON config metafield on
                the shop.
              </Text>
              {!canEnsureCheckoutCustomizationFromReview ? (
                <Banner tone="info" title="Save before deploying">
                  <Text as="p" variant="bodySm">
                    Save this checkout test first so RipX has a test ID and can deploy the matching
                    Shopify customization.
                  </Text>
                </Banner>
              ) : null}
              {canEnsureCheckoutCustomizationFromReview && isDirty ? (
                <Banner tone="warning" title="Unsaved changes">
                  <Text as="p" variant="bodySm">
                    Save your latest checkout edits before running deployment. The Shopify apply
                    flow uses the saved test config, not unsaved draft changes in this wizard.
                  </Text>
                </Banner>
              ) : null}
              <InlineStack gap="200" wrap>
                <Button
                  size="slim"
                  onClick={() => handleEnsureCheckoutCustomizationFromReview(false)}
                  disabled={
                    !canEnsureCheckoutCustomizationFromReview || checkoutCustomizationReviewDisabled
                  }
                  loading={
                    checkoutCustomizationLoading && checkoutCustomizationAction === 'dry_run'
                  }
                >
                  Checkout customization dry run
                </Button>
                <Button
                  variant="primary"
                  size="slim"
                  onClick={() => handleEnsureCheckoutCustomizationFromReview(true)}
                  disabled={
                    !canEnsureCheckoutCustomizationFromReview || checkoutCustomizationReviewDisabled
                  }
                  loading={checkoutCustomizationLoading && checkoutCustomizationAction === 'apply'}
                >
                  Apply checkout customization
                </Button>
              </InlineStack>
            </BlockStack>
          </div>
        )}

        {isShippingReview && canExecuteShippingFromReview && (
          <div className={stepStyles.reviewSection}>
            <div className={stepStyles.reviewSectionTitle}>
              <span className={stepStyles.reviewSectionTitleIcon}>
                <Icon source={CartIcon} />
              </span>
              Shipping Execution
            </div>
            <BlockStack gap="300">
              {isShippingStorewideReview && (
                <Banner tone="warning" title="Storewide shipping safety check">
                  <BlockStack gap="300">
                    <Text as="p" variant="bodySm">
                      This test is configured for <strong>storewide shipping qualification</strong>.
                      Dry runs remain available, but live apply is gated until you acknowledge the
                      broader impact below.
                    </Text>
                    <div className={styles.bannerChecklist}>
                      {shippingReviewSafetyChecklist.map(item => (
                        <div key={item.label} className={styles.bannerChecklistItem}>
                          <span className={styles.bannerChecklistIcon}>
                            <Icon
                              source={item.passed ? CheckCircleIcon : AlertTriangleIcon}
                              tone={item.passed ? 'success' : 'warning'}
                            />
                          </span>
                          <Text as="span" variant="bodySm" className={styles.bannerChecklistLabel}>
                            {item.label}
                          </Text>
                        </div>
                      ))}
                    </div>
                    <Checkbox
                      label="I understand this will apply shipping actions to storewide-qualified carts, and I have reviewed holdout, exclusions, and diagnostics."
                      checked={shippingStorewideApplyConfirmed}
                      onChange={setShippingStorewideApplyConfirmed}
                    />
                  </BlockStack>
                </Banner>
              )}
              <Text variant="bodySm" as="p">
                Run a dry run to preview adapter actions, then apply when the plan looks correct.
              </Text>
              <InlineStack gap="200" wrap>
                <Button
                  size="slim"
                  onClick={handleRunShippingDiagnostics}
                  disabled={shippingDiagnosticsLoading || loading}
                  loading={shippingDiagnosticsLoading}
                  title="Check shipping readiness, assignment visibility, and live conflicts"
                >
                  Shipping diagnostics
                </Button>
                <Button
                  size="slim"
                  onClick={() => handleExecuteShippingFromReview(false)}
                  disabled={shippingExecutionDisabled}
                  loading={shippingExecutionLoading && shippingExecutionAction === 'dry_run'}
                  title={
                    isDirty
                      ? 'Save pending changes before running shipping execution.'
                      : 'Preview shipping adapter actions without creating/updating resources'
                  }
                >
                  Shipping dry run
                </Button>
                <Button
                  size="slim"
                  variant="primary"
                  onClick={() => handleExecuteShippingFromReview(true)}
                  disabled={shippingReviewApplyDisabled}
                  loading={shippingExecutionLoading && shippingExecutionAction === 'apply'}
                  title={
                    isShippingStorewideReview && !shippingStorewideApplyConfirmed
                      ? 'Confirm the storewide shipping safety acknowledgment before applying.'
                      : isDirty
                        ? 'Save pending changes before applying shipping actions.'
                        : 'Apply shipping adapter actions for actionable variants'
                  }
                >
                  Apply shipping
                </Button>
              </InlineStack>
              {actionableShippingVariants.some(item => item.strategy !== 'control') && (
                <div className={stepStyles.reviewShippingVariantActions}>
                  {actionableShippingVariants
                    .filter(item => item.index > 0 && item.strategy !== 'control')
                    .map(item => (
                      <div
                        key={`shipping-variant-action-${item.index}`}
                        className={stepStyles.reviewShippingVariantActionRow}
                      >
                        <Text variant="bodySm" as="span">
                          {item.variant?.name || `Variant ${item.index + 1}`} ({item.strategy})
                        </Text>
                        <InlineStack gap="200" wrap>
                          <Button
                            size="slim"
                            onClick={() => handleExecuteShippingFromReview(false, item.index)}
                            disabled={shippingExecutionDisabled}
                          >
                            Dry run
                          </Button>
                          <Button
                            size="slim"
                            variant="primary"
                            onClick={() => handleExecuteShippingFromReview(true, item.index)}
                            disabled={shippingReviewApplyDisabled}
                            title={
                              isShippingStorewideReview && !shippingStorewideApplyConfirmed
                                ? 'Confirm the storewide shipping safety acknowledgment before applying.'
                                : undefined
                            }
                          >
                            Apply
                          </Button>
                        </InlineStack>
                      </div>
                    ))}
                </div>
              )}
              {isDirty && (
                <Text
                  variant="bodySm"
                  tone="subdued"
                  as="p"
                  className={stepStyles.reviewShippingHint}
                >
                  Save pending changes first so execution uses your latest variant strategies.
                </Text>
              )}
              {shippingDiagnostics && (
                <div className={stepStyles.reviewShippingDiagnostics}>
                  <div className={stepStyles.reviewShippingHeader}>
                    <span className={stepStyles.reviewShippingTitle}>Shipping diagnostics</span>
                    <span className={stepStyles.reviewShippingMode}>
                      Conflicts:{' '}
                      {Number(shippingDiagnostics.readiness?.running_shipping_conflicts || 0)}
                    </span>
                  </div>
                  <Banner
                    tone={
                      shippingDiagnostics.readiness?.running_shipping_conflicts > 0
                        ? 'warning'
                        : 'info'
                    }
                  >
                    <Text as="p" variant="bodySm">
                      Resolve URL:{' '}
                      {shippingDiagnostics.urls?.shipping_resolve_batch_url
                        ? 'configured'
                        : 'missing'}{' '}
                      | Carrier callback:{' '}
                      {shippingDiagnostics.urls?.carrier_callback_url ? 'configured' : 'missing'} |
                      Signed assignments:{' '}
                      {shippingDiagnostics.readiness?.assignment_signature_required
                        ? 'required'
                        : 'optional'}
                    </Text>
                  </Banner>
                  {shippingDiagnosticsInsights.map((insight, index) => (
                    <Banner
                      key={`${insight.title}-${index}`}
                      tone={insight.tone}
                      title={insight.title}
                    >
                      <BlockStack gap="100">
                        <Text as="p" variant="bodySm">
                          {insight.body}
                        </Text>
                        {insight.fix ? (
                          <Text as="p" variant="bodySm" tone="subdued">
                            <strong>Recommended fix:</strong> {insight.fix}
                          </Text>
                        ) : null}
                        {Array.isArray(insight.actions) && insight.actions.length > 0 ? (
                          <InlineStack gap="200" wrap>
                            {insight.actions.includes('rerun-diagnostics') ? (
                              <Button
                                size="slim"
                                onClick={handleRunShippingDiagnostics}
                                disabled={shippingDiagnosticsLoading || loading}
                                loading={shippingDiagnosticsLoading}
                              >
                                Rerun diagnostics
                              </Button>
                            ) : null}
                            {insight.actions.includes('jump-to-targeting') ? (
                              <Button
                                size="slim"
                                onClick={() => jumpToShippingTargeting('targeting-scope')}
                              >
                                Review qualification
                              </Button>
                            ) : null}
                            {insight.actions.includes('jump-to-exclusions') ? (
                              <Button
                                size="slim"
                                onClick={() => jumpToShippingTargeting('shipping-exclusions-card')}
                              >
                                Review exclusions
                              </Button>
                            ) : null}
                            {insight.actions.includes('open-docs') ? (
                              <Button size="slim" onClick={openShippingDocs}>
                                Open shipping docs
                              </Button>
                            ) : null}
                          </InlineStack>
                        ) : null}
                      </BlockStack>
                    </Banner>
                  ))}
                </div>
              )}
              {shippingExecSummary && (
                <div className={stepStyles.reviewShippingReport}>
                  <div className={stepStyles.reviewShippingHeader}>
                    <span className={stepStyles.reviewShippingTitle}>
                      Latest shipping execution
                    </span>
                    <span className={stepStyles.reviewShippingMode}>
                      Mode: {shippingExecSummary.apply_mode || 'dry_run'}
                    </span>
                  </div>
                  <Banner
                    tone={
                      Number(shippingExecSummary.failed_count || 0) > 0
                        ? 'critical'
                        : Number(shippingExecSummary.manual_required_count || 0) > 0
                          ? 'warning'
                          : 'success'
                    }
                  >
                    <Text as="p" variant="bodySm">
                      {Number(shippingExecSummary.success_count || 0)} success,{' '}
                      {Number(shippingExecSummary.manual_required_count || 0)} manual-required,{' '}
                      {Number(shippingExecSummary.failed_count || 0)} failed.
                    </Text>
                  </Banner>
                  <div className={stepStyles.reviewShippingList}>
                    {shippingExecActions.map((action, index) => (
                      <div
                        key={`${action?.variant_index ?? index}-${action?.variant_id || action?.variant_name || index}`}
                        className={stepStyles.reviewShippingItem}
                      >
                        <div className={stepStyles.reviewShippingItemHead}>
                          <span className={stepStyles.reviewShippingVariantName}>
                            {action?.variant_name || `Variant ${index + 1}`}
                          </span>
                          <span className={stepStyles.reviewShippingStatus}>
                            {action?.status || 'unknown'}
                          </span>
                        </div>
                        <p className={stepStyles.reviewShippingMeta}>
                          Strategy: {action?.strategy || 'n/a'} | Adapter:{' '}
                          {action?.execution_adapter || 'n/a'}
                        </p>
                        {action?.details?.message ? (
                          <p className={stepStyles.reviewShippingDetail}>
                            {action.details.message}
                          </p>
                        ) : null}
                        {action?.details?.title ? (
                          <p className={stepStyles.reviewShippingDetail}>
                            Resource title: {action.details.title}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </BlockStack>
          </div>
        )}

        <div className={stepStyles.reviewSchedulingSection}>
          <div className={stepStyles.reviewSchedulingTitle}>
            <Icon source={ClockIcon} />
            Test Scheduling (Optional)
          </div>
          <BlockStack gap="400">
            <Checkbox
              label="Schedule test to start automatically"
              checked={formData.auto_start}
              onChange={value => setFormData({ ...formData, auto_start: value })}
            />
            {formData.auto_start && (
              <TextField
                label="Start Date & Time"
                type="datetime-local"
                value={formData.scheduled_start_at}
                onChange={value => setFormData({ ...formData, scheduled_start_at: value })}
                helpText="When should this test automatically start?"
              />
            )}
            <Checkbox
              label="Schedule test to stop automatically"
              checked={formData.auto_stop}
              onChange={value => setFormData({ ...formData, auto_stop: value })}
            />
            {formData.auto_stop && (
              <TextField
                label="Stop Date & Time"
                type="datetime-local"
                value={formData.scheduled_stop_at}
                onChange={value => setFormData({ ...formData, scheduled_stop_at: value })}
                helpText="When should this test automatically stop?"
              />
            )}
            {(formData.auto_start || formData.auto_stop) && (
              <Select
                label="Timezone"
                options={[
                  { label: 'UTC', value: 'UTC' },
                  { label: 'Eastern Time (UTC-5)', value: 'America/New_York' },
                  { label: 'Central Time (UTC-6)', value: 'America/Chicago' },
                  { label: 'Mountain Time (UTC-7)', value: 'America/Denver' },
                  { label: 'Pacific Time (UTC-8)', value: 'America/Los_Angeles' },
                  { label: 'London (UTC+0)', value: 'Europe/London' },
                  { label: 'Paris (UTC+1)', value: 'Europe/Paris' },
                  { label: 'Tokyo (UTC+9)', value: 'Asia/Tokyo' },
                ]}
                value={formData.timezone}
                onChange={value => setFormData({ ...formData, timezone: value })}
                helpText="Timezone for scheduled times"
              />
            )}
          </BlockStack>
        </div>
      </div>
    );
  };

  const renderCurrentStep = () => {
    if (showTemplateStep) {
      switch (currentStep) {
        case 1:
          return renderTemplateSelection();
        case 2:
          return renderVariants();
        case 3:
          return renderTargetingStep();
        case 4:
          return renderGoalStep();
        case 5:
          return renderCustomCode();
        case 6:
          return renderReview();
        default:
          return null;
      }
    }

    switch (currentStep) {
      case 1:
        return renderVariants();
      case 2:
        return renderTargetingStep();
      case 3:
        return renderGoalStep();
      case 4:
        return renderCustomCode();
      case 5:
        return renderReview();
      default:
        return null;
    }
  };

  const modalNameSuggestions = (() => {
    const rawType = String(formData.type || selectedTemplate || 'content')
      .replace(/[-_]+/g, ' ')
      .trim();
    const typeLabel = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1) : 'Test';
    const metricRaw = String(formData.goal?.metric || 'conversion_rate')
      .toLowerCase()
      .trim();
    const metricLabel =
      metricRaw === 'revenue' ? 'Revenue' : metricRaw === 'aov' ? 'AOV' : 'Conversion';
    const targetTypeRaw = String(formData.target_type || '')
      .toLowerCase()
      .trim();
    const selectedTargetIds =
      Array.isArray(formData.target_ids) && formData.target_ids.length > 0
        ? formData.target_ids
        : formData.target_id
          ? [formData.target_id]
          : [];
    const lookupId = selectedTargetIds[0];
    const targetMatch = lookupId
      ? (storeResources || []).find(r => String(r?.id || '') === String(lookupId))
      : null;
    const targetTitle = String(targetMatch?.title || '').trim();
    const gidNumeric = lookupId ? String(lookupId).split('/').pop() : '';
    const targetLabel =
      targetTypeRaw === 'all'
        ? 'Sitewide'
        : targetTypeRaw === 'all-products'
          ? 'All products'
          : targetTypeRaw === 'product'
            ? selectedTargetIds.length > 1
              ? `${selectedTargetIds.length} products`
              : targetTitle || (gidNumeric ? `Product ${gidNumeric}` : 'Product')
            : targetTypeRaw === 'collection'
              ? selectedTargetIds.length > 1
                ? `${selectedTargetIds.length} collections`
                : targetTitle || (gidNumeric ? `Collection ${gidNumeric}` : 'Collection')
              : targetTypeRaw === 'page'
                ? selectedTargetIds.length > 1
                  ? `${selectedTargetIds.length} pages`
                  : targetTitle || (gidNumeric ? `Page ${gidNumeric}` : 'Page')
                : targetTypeRaw
                  ? targetTypeRaw.charAt(0).toUpperCase() + targetTypeRaw.slice(1)
                  : 'Audience';

    const variantNames = (formData.variants || [])
      .map(v => String(v?.name || '').trim())
      .filter(Boolean);
    const controlName = variantNames.find(v => /control/i.test(v)) || 'Control';
    const challengerName =
      variantNames.find(v => !/control/i.test(v)) || variantNames[1] || 'Variant A';

    const suggestionPool = [
      `${targetLabel} - ${challengerName} vs ${controlName}`,
      `${targetLabel} - ${metricLabel} uplift`,
      `${typeLabel} - ${challengerName} hypothesis`,
      `${targetLabel} - ${typeLabel} experiment`,
    ];

    return Array.from(new Set(suggestionPool)).slice(0, 4);
  })();

  return (
    <>
      <Toast message={error} type="error" onClose={() => setError(null)} duration={5000} />
      {visualPreviewToast && (
        <Toast
          message={visualPreviewToast.message}
          type={visualPreviewToast.type}
          onClose={() => setVisualPreviewToast(null)}
          duration={visualPreviewToast.type === 'success' ? 3000 : 4000}
        />
      )}
      {simulationExportToast && (
        <Toast
          message={simulationExportToast.message}
          type={simulationExportToast.type}
          onClose={() => setSimulationExportToast(null)}
          duration={3000}
        />
      )}
      {priceMatrixActionToast && (
        <Toast
          message={priceMatrixActionToast.message}
          type={priceMatrixActionToast.type}
          onClose={() => setPriceMatrixActionToast(null)}
          duration={2200}
        />
      )}
      {antiFlickerToast && (
        <Toast
          message={antiFlickerToast.message}
          type={antiFlickerToast.type}
          onClose={() => setAntiFlickerToast(null)}
          duration={2200}
        />
      )}
      {shippingExecutionToast && (
        <Toast
          message={shippingExecutionToast.message}
          type={shippingExecutionToast.type || 'success'}
          onClose={() => setShippingExecutionToast(null)}
          duration={3200}
        />
      )}
      {checkoutCustomizationToast && (
        <Toast
          message={checkoutCustomizationToast.message}
          type={checkoutCustomizationToast.type || 'success'}
          onClose={() => setCheckoutCustomizationToast(null)}
          duration={3200}
        />
      )}

      <Layout>
        <Layout.Section>
          <div className="wizard-section">
            <div
              ref={progressBarRef}
              className={`wizard-progress-bar${progressBarStuck ? ' is-stuck' : ''}`}
            >
              {renderStepIndicator()}
            </div>

            <div className="wizard-step">
              {hasStepErrors && (
                <div
                  ref={validationSummaryRef}
                  className="wizard-validation-summary"
                  role="alert"
                  tabIndex={-1}
                  aria-live="assertive"
                  aria-atomic="true"
                >
                  <div className="wizard-validation-summary-header">
                    <Icon source={AlertTriangleIcon} tone="critical" />
                    <Text variant="bodyMd" fontWeight="semibold" as="span">
                      {currentStepErrors.length === 1
                        ? 'Fix this issue to continue:'
                        : `Fix these ${currentStepErrors.length} issues to continue:`}
                    </Text>
                  </div>
                  <ul>
                    {currentStepErrors.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              {renderCurrentStep()}
            </div>

            <div className="wizard-actions">
              {mode === 'edit' ? (
                <div className="wizard-save-status">
                  {isDirty && (
                    <span className="wizard-save-pill wizard-save-unsaved">
                      <span className="wizard-save-dot" aria-hidden />
                      Unsaved changes
                    </span>
                  )}
                  {!isDirty && autosaveState === 'saved' && (
                    <span className="wizard-save-pill wizard-save-saved">
                      <Icon source={CheckCircleIcon} />
                      All changes saved
                    </span>
                  )}
                  {autosaveState === 'saving' && (
                    <span className="wizard-save-pill wizard-save-saving">
                      <Spinner size="small" />
                      Saving…
                    </span>
                  )}
                  {autosaveState === 'error' && (
                    <span className="wizard-save-pill wizard-save-error">
                      <span className="wizard-save-dot wizard-save-dot-error" aria-hidden />
                      Save failed
                    </span>
                  )}
                  {lastSavedAt && !isDirty && autosaveState === 'saved' && (
                    <span className="wizard-save-time">
                      <Icon source={ClockIcon} />
                      {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              ) : (
                <div className="wizard-step-indicator-text">
                  <span className="wizard-step-current">{currentStep}</span>
                  <span className="wizard-step-sep">of</span>
                  <span className="wizard-step-total">{steps.length}</span>
                </div>
              )}
              <div className="wizard-actions-buttons">
                <InlineStack align="end" gap="300">
                  {currentStep > 1 && (
                    <Button
                      onClick={handleBack}
                      icon={ChevronLeftIcon}
                      aria-label="Go to previous step"
                      title="Back (Ctrl+←)"
                    >
                      Back
                    </Button>
                  )}
                  {mode === 'edit' && currentStep < steps.length && (
                    <Button
                      onClick={() => handleSubmit()}
                      loading={loading || submitLoading}
                      icon={SaveIcon}
                    >
                      Save Changes
                    </Button>
                  )}
                  {currentStep < steps.length ? (
                    <Button
                      variant="primary"
                      onClick={handleNext}
                      disabled={hasStepErrors}
                      aria-label={
                        hasStepErrors ? 'Fix errors above to continue' : 'Go to next step'
                      }
                      title={hasStepErrors ? undefined : 'Next (Ctrl+→)'}
                    >
                      Next
                    </Button>
                  ) : (
                    <Button
                      primary
                      onClick={handleSubmit}
                      loading={loading || submitLoading}
                      disabled={hasStepErrors}
                      aria-label={
                        hasStepErrors
                          ? 'Fix errors above to create test'
                          : mode === 'create'
                            ? 'Create test'
                            : 'Save changes'
                      }
                    >
                      {submitLabel || (mode === 'create' ? 'Create Test' : 'Save Changes')}
                    </Button>
                  )}
                  {onCancel && (
                    <>
                      <span className="wizard-actions-divider" aria-hidden="true" />
                      <Button onClick={onCancel} icon={XIcon}>
                        Cancel
                      </Button>
                    </>
                  )}
                </InlineStack>
              </div>
            </div>
          </div>
        </Layout.Section>
      </Layout>

      <Modal
        open={priceProductModalOpen && currentStep === stepIds.targeting}
        onClose={() => setPriceProductModalOpen(false)}
        title={modalSelectionTitle}
        size="large"
        primaryAction={{
          content: 'Done',
          onAction: () => setPriceProductModalOpen(false),
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setPriceProductModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <div data-price-product-picker-modal="">
            <div className={styles.priceProductPickerGrid}>
              <div className={styles.priceProductPickerPane}>
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  Store catalog
                </Text>
                <div className={styles.priceProductPickerSearch}>
                  <TextField
                    label="Search products"
                    labelHidden
                    value={priceModalSearch}
                    onChange={setPriceModalSearch}
                    placeholder="Search by title or handle…"
                    autoComplete="off"
                    clearButton
                    onClearButtonClick={() => setPriceModalSearch('')}
                  />
                </div>
                {priceModalLoading ? (
                  <div className={styles.priceProductPickerLoading}>
                    <Spinner size="small" />
                    <Text as="span" variant="bodySm" tone="subdued">
                      Loading products…
                    </Text>
                  </div>
                ) : priceModalProducts.length === 0 ? (
                  <div className={styles.priceProductPickerEmpty}>
                    <Text as="p" variant="bodySm" tone="subdued">
                      {priceModalError ||
                        (priceModalSearch
                          ? 'No matches. Try a different search.'
                          : 'Type to search your store catalog.')}
                    </Text>
                  </div>
                ) : (
                  <>
                    <div className={styles.priceProductPickerListMeta}>
                      <Text as="span" variant="bodySm" tone="subdued">
                        Showing {modalShownCount} of {priceModalProducts.length} loaded products
                      </Text>
                      <InlineStack gap="200" wrap blockAlign="center">
                        {modalCanFetchMore && (
                          <Badge tone="info" size="small">
                            More available
                          </Badge>
                        )}
                        {modalCanCollapse && (
                          <Button
                            size="slim"
                            variant="plain"
                            onClick={() =>
                              setPriceModalVisibleCount(PRICE_PRODUCT_MODAL_REVEAL_BATCH)
                            }
                          >
                            Collapse
                          </Button>
                        )}
                      </InlineStack>
                    </div>
                    <div className={styles.priceProductPickerList}>
                      {modalVisibleProducts.map(r => {
                        const isSelected = activePriceModalProductIds.includes(r.id);
                        const thumb = r.imageUrl;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            className={`${styles.priceProductPickerRow} ${isSelected ? styles.priceProductPickerRowSelected : ''}`}
                            onClick={() => togglePriceModalProduct(r.id, isSelected)}
                          >
                            <span className={styles.priceProductPickerThumb} aria-hidden>
                              {thumb ? (
                                <img src={thumb} alt="" loading="lazy" />
                              ) : (
                                <Icon source={ProductIcon} />
                              )}
                            </span>
                            <span className={styles.priceProductPickerRowText}>
                              <span className={styles.priceProductPickerRowTitle}>
                                {r.title || r.name || r.handle || r.id}
                              </span>
                              {r.handle && (
                                <span className={styles.priceProductPickerRowHandle}>
                                  {r.handle}
                                </span>
                              )}
                            </span>
                            {isSelected && (
                              <span className={styles.priceProductPickerRowCheck}>
                                <Icon source={CheckCircleIcon} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {modalCanShowMore && (
                      <div className={styles.priceProductPickerLoadMore}>
                        <Button
                          onClick={handlePriceModalLoadMore}
                          loading={priceModalLoadingMore}
                          disabled={priceModalLoadingMore}
                        >
                          {modalHasHiddenLoaded
                            ? `Show ${Math.min(
                                modalProgressiveWindow.nextRevealCount ||
                                  PRICE_PRODUCT_MODAL_REVEAL_BATCH,
                                priceModalProducts.length - modalShownCount
                              )} more`
                            : `Show ${PRICE_PRODUCT_MODAL_REVEAL_BATCH} more`}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className={styles.priceProductPickerPane}>
                <div className={styles.priceProductPickerSelectedHead}>
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    Selected ({activePriceModalProductIds.length})
                  </Text>
                  {activePriceModalProductIds.length > 0 && (
                    <Button
                      variant="plain"
                      tone="critical"
                      onClick={() => {
                        setIsDirty(true);
                        setFormData(prev =>
                          isExcludeModalActive
                            ? {
                                ...prev,
                                segments: {
                                  ...prev.segments,
                                  excluded_product_ids: [],
                                },
                              }
                            : {
                                ...prev,
                                target_ids: null,
                                target_id: '',
                              }
                        );
                      }}
                    >
                      Clear all
                    </Button>
                  )}
                </div>
                <div className={styles.priceProductPickerSelectedList}>
                  {activePriceModalProductIds.length === 0 ? (
                    <Text as="p" variant="bodySm" tone="subdued">
                      No products selected yet. Choose from the list on the left.
                    </Text>
                  ) : (
                    activePriceModalProductIds.map(pid => {
                      const meta = priceProductMetaById[pid];
                      return (
                        <button
                          key={pid}
                          type="button"
                          className={`${styles.priceProductPickerRow} ${styles.priceProductPickerRowSelected}`}
                          onClick={() => togglePriceModalProduct(pid, true)}
                        >
                          <span className={styles.priceProductPickerThumb} aria-hidden>
                            {meta?.imageUrl ? (
                              <img src={meta.imageUrl} alt="" loading="lazy" />
                            ) : (
                              <Icon source={ProductIcon} />
                            )}
                          </span>
                          <span className={styles.priceProductPickerRowText}>
                            <span className={styles.priceProductPickerRowTitle}>
                              {meta?.title || pid}
                            </span>
                            {meta?.handle && (
                              <span className={styles.priceProductPickerRowHandle}>
                                {meta.handle}
                              </span>
                            )}
                          </span>
                          <span className={styles.priceProductPickerRowCheck}>
                            <Icon source={XIcon} />
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </Modal.Section>
      </Modal>

      <Modal
        open={titleEditOpen}
        onClose={() => setTitleEditOpen(false)}
        title="Update test details"
        primaryAction={{
          content: 'Save changes',
          onAction: () => {
            setFormData(prev => ({
              ...prev,
              name: normalizeTextValue(titleEditDraft.name) || prev.name,
              description:
                titleEditDraft.description === null || titleEditDraft.description === undefined
                  ? prev.description
                  : normalizeTextValue(titleEditDraft.description),
            }));
            setIsDirty(true);
            setTitleEditOpen(false);
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setTitleEditOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <div className="wizard-title-modal-intro">
              <div className="wizard-title-modal-intro-head">
                <span className="wizard-title-modal-intro-icon" aria-hidden>
                  <Icon source={PageIcon} />
                </span>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Keep the title clear and outcome-focused
                </Text>
              </div>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                Good names make filtering, reporting, and team handoff much easier.
              </Text>
            </div>
            <div className="wizard-title-modal-field">
              <TextField
                label="Test name"
                value={titleEditDraft.name}
                onChange={value => setTitleEditDraft(d => ({ ...d, name: value }))}
                placeholder="e.g. Homepage CTA - Free Trial vs Demo"
                autoComplete="off"
                maxLength={90}
              />
              <div className="wizard-title-modal-field-meta">
                <Text as="p" variant="bodySm" tone="subdued">
                  Use a concise name with page + variation objective.
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  tone={titleEditDraft.name.length > 76 ? 'critical' : 'subdued'}
                >
                  {titleEditDraft.name.length}/90
                </Text>
              </div>
              <div className="wizard-title-modal-suggestions">
                <Text as="p" variant="bodySm" tone="subdued">
                  Quick suggestions
                </Text>
                <div className="wizard-title-modal-suggestions-row">
                  {modalNameSuggestions.map(suggestion => (
                    <button
                      key={suggestion}
                      type="button"
                      className="wizard-title-modal-suggestion-chip"
                      onClick={() =>
                        setTitleEditDraft(d => ({
                          ...d,
                          name: suggestion.slice(0, 90),
                        }))
                      }
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="wizard-title-modal-field">
              <TextField
                label="Description"
                value={titleEditDraft.description}
                onChange={value => setTitleEditDraft(d => ({ ...d, description: value }))}
                multiline={3}
                placeholder="State hypothesis, target audience, and expected impact."
                autoComplete="off"
                maxLength={240}
              />
              <div className="wizard-title-modal-field-meta">
                <Text as="p" variant="bodySm" tone="subdued">
                  Optional, but recommended for team context and faster reviews.
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  tone={titleEditDraft.description.length > 210 ? 'critical' : 'subdued'}
                >
                  {titleEditDraft.description.length}/240
                </Text>
              </div>
            </div>
            <div className="wizard-title-modal-preview">
              <Text as="p" variant="bodySm" fontWeight="semibold">
                Preview
              </Text>
              <Text as="p" variant="bodyMd">
                {normalizeTextValue(titleEditDraft.name) ||
                  normalizeTextValue(formData.name) ||
                  normalizeTextValue(initialData?.name) ||
                  'Untitled Test'}
              </Text>
              {(normalizeTextValue(titleEditDraft.description) ||
                normalizeTextValue(formData.description) ||
                normalizeTextValue(initialData?.description)) && (
                <Text as="p" variant="bodySm" tone="subdued">
                  {normalizeTextValue(titleEditDraft.description) ||
                    normalizeTextValue(formData.description) ||
                    normalizeTextValue(initialData?.description)}
                </Text>
              )}
            </div>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}

export default TestWizard;
