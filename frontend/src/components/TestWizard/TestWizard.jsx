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
} from '@shopify/polaris';
import {
  PageIcon,
  UnknownDeviceIcon,
  PersonIcon,
  LockIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
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
import SampleSizeCalculator from '../TestCreator/SampleSizeCalculator';
import TrafficAllocationSlider from '../TestCreator/TrafficAllocationSlider';
import Toast from '../Toast/Toast';
import styles from './TargetingSection.module.css';
import stepStyles from './WizardSteps.module.css';
import { useParams } from 'react-router-dom';
import {
  getShopDomain,
  getPreviewDomain,
  apiGet,
  apiPost,
  isStandaloneMode,
  getApiBaseUrl,
} from '../../services';
import { isShopifyStoreDomain } from '../../utils/shopifyAdmin';
import {
  buildPreviewUrl as buildPreviewUrlUtil,
  resolvePreviewBaseUrl,
  PREVIEW_PARAMS,
} from '../../utils/previewUrl';
import { inferTemplateKeyFromVariants } from '../../utils/testType';
import { STANDALONE_TEST_TYPE_IDS } from '../../constants';
import {
  TEST_TEMPLATES,
  TEST_TYPE_CATEGORIES,
  buildWizardSteps,
  getStepIds,
} from './testWizardConfig';
import { getWizardStepErrors } from './wizardValidation';

/** URL pattern for homepage on Shopify: root and /index */
const HOMEPAGE_URL_PATTERN_SHOPIFY = '^/$|^/index';
/** URL pattern for standalone sites: root, /index, /index.html, /index.php, /default.html (reliable across hosts) */
const HOMEPAGE_URL_PATTERN_STANDALONE = '^/$|^/index(\\.html|\\.php)?$|^/default\\.html$';

const DEFAULT_FORM_DATA = {
  name: '',
  description: '',
  type: 'price',
  target_type: '',
  target_id: '',
  goal: {
    type: 'conversion',
    metric: 'revenue',
    secondary: [],
    significance_level: 0.95,
    statistical_power: 0.8,
    conversion_window_days: 30,
    conversion_url: '',
    analysis_method: 'frequentist',
  },
  variants: [
    { name: 'Control', allocation: 50, config: {} },
    { name: 'Variant A', allocation: 50, config: {} },
  ],
  segments: {
    device: 'all',
    customer: 'all',
    countries: [],
    traffic_source: 'all',
    url_pattern: '',
    min_sessions: '',
    page_rules: [],
    device_rules: [],
    audience_rules: [],
    js_targeting: { enabled: false, code: '' },
    visual_editor_rules: [
      { selector: '', css: '', js: '', position: 'after' },
      { selector: '', css: '', js: '', position: 'after' },
      { selector: '', css: '', js: '', position: 'after' },
      { selector: '', css: '', js: '', position: 'after' },
      { selector: '', css: '', js: '', position: 'after' },
    ],
  },
  holdout_percent: 0,
  scheduled_start_at: '',
  scheduled_stop_at: '',
  auto_start: false,
  auto_stop: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  guardrail_config: { enabled: false, minDropPercent: 10 },
};

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
}) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [progressBarStuck, setProgressBarStuck] = useState(false);
  const [titleEditOpen, setTitleEditOpen] = useState(false);
  const [titleEditDraft, setTitleEditDraft] = useState({ name: '', description: '' });
  const progressBarRef = useRef(null);
  const [error, setError] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate);
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [variantCodesData, setVariantCodesData] = useState([]);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
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
  const [configEditorMode, setConfigEditorMode] = useState('code'); // 'visual' | 'code'
  const [visualEditorDirty, setVisualEditorDirty] = useState(false);
  const [codeEditorDirty, setCodeEditorDirty] = useState(false);
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
  const [changingSelectorIndex, setChangingSelectorIndex] = useState(null); // when set, next click in preview replaces this slot
  const visualSnippetPanelRef = useRef(null);
  const visualSnippetBackdropRef = useRef(null);
  const formDataRef = useRef(formData);
  const visualPreviewVariantIndexRef = useRef(visualPreviewVariantIndex);
  const changingSelectorIndexRef = useRef(changingSelectorIndex);
  const selectedVariantIndexRef = useRef(selectedVariantIndex);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);
  useEffect(() => {
    selectedVariantIndexRef.current = selectedVariantIndex;
  }, [selectedVariantIndex]);
  useEffect(() => {
    visualPreviewVariantIndexRef.current = visualPreviewVariantIndex;
  }, [visualPreviewVariantIndex]);
  useEffect(() => {
    changingSelectorIndexRef.current = changingSelectorIndex;
  }, [changingSelectorIndex]);
  const [savePresetName, setSavePresetName] = useState('');
  const [loadedPresetId, setLoadedPresetId] = useState('');
  const [placementSection, setPlacementSection] = useState('page'); // 'page' | 'device' | 'audience' | 'holdout' | 'advanced'
  const { domain: routeDomain } = useParams();
  const isShopifyFromRoute = routeDomain && isShopifyStoreDomain(routeDomain);
  const isStandalone = !isShopifyFromRoute && isStandaloneMode();
  const contentTypesForStep = isStandalone
    ? TEST_TYPE_CATEGORIES.content.types.filter(t => STANDALONE_TEST_TYPE_IDS.includes(t.key))
    : TEST_TYPE_CATEGORIES.content.types;
  const [customUrlModeActive, setCustomUrlModeActive] = useState(false);
  const [deviceAdvancedOpen, setDeviceAdvancedOpen] = useState(false);
  const [audienceAdvancedOpen, setAudienceAdvancedOpen] = useState(false);
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
  const [storeResourceSearch, setStoreResourceSearch] = useState('');
  /** When store-resources API fails or returns empty_reason, show this instead of generic message */
  const [storeResourcesError, setStoreResourcesError] = useState(null);

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
  const validationSummaryRef = useRef(null);

  useEffect(() => {
    const el = progressBarRef.current;
    if (!el) return;
    const STICKY_TOP = 48;
    const HYSTERESIS = 8; /* px gap to prevent rapid toggling */
    let ticking = false;
    let lastStuck = false;
    const checkStuck = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const rect = el.getBoundingClientRect();
          const top = rect.top;
          const stuck = lastStuck ? top <= STICKY_TOP + HYSTERESIS : top <= STICKY_TOP;
          lastStuck = stuck;
          setProgressBarStuck(stuck);
          ticking = false;
        });
        ticking = true;
      }
    };
    checkStuck();
    window.addEventListener('scroll', checkStuck, { passive: true });
    return () => window.removeEventListener('scroll', checkStuck);
  }, []);

  const steps = buildWizardSteps(showTemplateStep, mode);
  const stepIds = getStepIds(showTemplateStep);

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
            {formData.name?.trim() || initialData?.name?.trim() || 'Untitled Test'}
          </Text>
          {(formData.description?.trim() || initialData?.description?.trim()) && (
            <Text variant="bodyMd" color="subdued" as="span" className="wizard-title-description">
              {' · '}
              {formData.description?.trim() || initialData?.description?.trim()}
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
    if (isStandalone || !['product', 'collection', 'page'].includes(targetTypeForResources)) {
      setStoreResources([]);
      return;
    }
    // Use route domain explicitly so the correct Shopify store is queried (avoids wrong-shop when multiple stores)
    const shop = isShopifyFromRoute ? routeDomain : null;
    if (!shop) {
      setStoreResources([]);
      return;
    }
    setStoreResourcesLoading(true);
    setStoreResourcesError(null);
    const query = encodeURIComponent(storeResourceSearchDebounced.trim());
    apiGet(`/shopify/store-resources?type=${targetTypeForResources}&query=${query}&first=100`, {
      shop,
    })
      .then(res => {
        const list = res.data?.resources || [];
        const emptyReason = res.data?.empty_reason || null;
        setStoreResources(list);
        setStoreResourcesError(list.length === 0 && emptyReason ? emptyReason : null);
      })
      .catch(err => {
        setStoreResources([]);
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

  useEffect(() => {
    if (isStandalone && (placementSection === 'device' || placementSection === 'audience')) {
      setPlacementSection('page');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when isStandalone changes
  }, [isStandalone]);
  useEffect(() => {
    const handler = e => {
      if (currentStep !== stepIds.targeting) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '1') {
        setPlacementSection('page');
        e.preventDefault();
      } else if (e.key === '2' && !isStandalone) {
        setPlacementSection('device');
        e.preventDefault();
      } else if (e.key === '3' && !isStandalone) {
        setPlacementSection('audience');
        e.preventDefault();
      } else if (e.key === (isStandalone ? '2' : '4')) {
        setPlacementSection('holdout');
        e.preventDefault();
      } else if (e.key === (isStandalone ? '3' : '5')) {
        setPlacementSection('advanced');
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        setPlacementSection(s =>
          s === 'advanced'
            ? 'holdout'
            : s === 'holdout'
              ? isStandalone
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
            ? isStandalone
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
  }, [currentStep, stepIds.targeting, isStandalone]);

  useEffect(() => {
    if (initialData) {
      const nextTestId = initialData.id || null;
      const isNewTest = nextTestId && nextTestId !== previousTestIdRef.current;
      const isSameTest = nextTestId && nextTestId === previousTestIdRef.current;
      const presets = ['/products/', '/collections/', '/cart', '^/$|^/index', ''];
      const serverVariantCount = (initialData.variants || []).filter(Boolean).length;
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
        target_id: initialData.target_id || '',
        target_ids: initialData.target_ids || null,
        goal: {
          ...DEFAULT_FORM_DATA.goal,
          ...(initialData.goal || {}),
          secondary: Array.isArray(initialData.goal?.secondary)
            ? [...initialData.goal.secondary]
            : [],
        },
        variants: (initialData.variants || DEFAULT_FORM_DATA.variants).map((variant, vIdx) => {
          const config =
            variant.config && typeof variant.config === 'object' ? { ...variant.config } : {};
          const veRules = Array.isArray(config.visual_editor_rules)
            ? Array.from(
                { length: 5 },
                (_, i) =>
                  config.visual_editor_rules[i] || {
                    selector: '',
                    css: '',
                    js: '',
                    position: 'after',
                  }
              )
            : Array.from({ length: 5 }, () => ({
                selector: '',
                css: '',
                js: '',
                position: 'after',
              }));
          if (
            vIdx === 0 &&
            Array.isArray(initialData.segments?.visual_editor_rules) &&
            initialData.segments.visual_editor_rules.length > 0
          ) {
            for (let i = 0; i < 5; i++) {
              const r = initialData.segments.visual_editor_rules[i];
              if (r && typeof r === 'object')
                veRules[i] = {
                  selector: String(r.selector || '').trim(),
                  css: String(r.css || '').trim(),
                  js: String(r.js || '').trim(),
                  position: ['after', 'before', 'afterbegin', 'beforeend'].includes(r.position)
                    ? r.position
                    : 'after',
                };
            }
          }
          return {
            ...variant,
            allocation: variant.allocation ?? 0,
            config: { ...config, visual_editor_rules: veRules },
          };
        }),
        segments: (() => {
          const seg = { ...DEFAULT_FORM_DATA.segments, ...(initialData.segments || {}) };
          if (Array.isArray(initialData.segments?.visual_editor_rules)) {
            seg.visual_editor_rules = Array.from(
              { length: 5 },
              (_, i) =>
                initialData.segments.visual_editor_rules[i] || {
                  selector: '',
                  css: '',
                  js: '',
                  position: 'after',
                }
            );
          }
          return seg;
        })(),
        holdout_percent: initialData.holdout_percent ?? DEFAULT_FORM_DATA.holdout_percent,
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- customUrlModeActive/isDirty would re-run and overwrite user selection
  }, [initialData]);

  useEffect(() => {
    if (mode !== 'edit') return;
    if (!initialData) return;

    const serverVariants = (initialData.variants || []).filter(Boolean);
    const formVariants = (formData.variants || []).filter(Boolean);
    const variantCountMismatch = serverVariants.length !== formVariants.length;

    // When server has different variant count, always sync (critical for correct display)
    if (variantCountMismatch && serverVariants.length > 0) {
      setFormData(prev => ({
        ...prev,
        variants: serverVariants.map(v => ({
          ...v,
          allocation: v.allocation ?? 0,
          config: v.config && typeof v.config === 'object' ? { ...v.config } : {},
        })),
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
    if (!vars || vars.length === 0) return vars;
    const total = vars.reduce((sum, v) => sum + (Number(v.allocation) || 0), 0);
    if (total === 0) return vars;
    const scaled = vars.map(v => ({
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

  const buildPayload = (data = formData, codes = variantCodesData) => {
    const variants = data.variants || [];
    const codesList = Array.isArray(codes) ? codes : [];
    const variantsWithCode = variants.map((variant, index) => {
      const combinedCode = buildCombinedCode(codesList[index]);
      const existingCode = variant?.code || variant?.config?.code || '';
      if (combinedCode) {
        return {
          ...variant,
          code: combinedCode,
        };
      }
      if (existingCode) {
        return {
          ...variant,
          code: existingCode,
        };
      }
      const { code: _code, ...rest } = variant;
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
      url_pattern: data.segments?.url_pattern ?? '',
      min_sessions: data.segments?.min_sessions ?? '',
    };
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
    if (data.segments?.js_targeting?.enabled && data.segments.js_targeting.code?.trim()) {
      normalizedSegments.js_targeting = {
        enabled: true,
        code: data.segments.js_targeting.code.trim(),
      };
    }
    const veUrl = (data.segments?.visual_editor_preview_url ?? '').trim();
    const veSel = (data.segments?.visual_editor_selector ?? '').trim();
    if (veUrl) normalizedSegments.visual_editor_preview_url = veUrl;
    if (veSel) normalizedSegments.visual_editor_selector = veSel;
    const veRulesSource = Array.isArray(data.variants?.[0]?.config?.visual_editor_rules)
      ? data.variants[0].config.visual_editor_rules
      : data.segments?.visual_editor_rules;
    if (Array.isArray(veRulesSource) && veRulesSource.length > 0) {
      normalizedSegments.visual_editor_rules = veRulesSource
        .slice(0, 5)
        .map(r =>
          r && typeof r === 'object'
            ? {
                selector: String(r.selector || '').trim(),
                css: String(r.css || '').trim(),
                js: String(r.js || '').trim(),
                position: ['after', 'before', 'afterbegin', 'beforeend'].includes(r.position)
                  ? r.position
                  : 'after',
              }
            : null
        )
        .filter(Boolean);
    }

    const templateKey =
      selectedTemplate ||
      data.goal?.template_key ||
      inferTemplateKeyFromVariants(data.variants, data.type);

    const goal = {
      type: data.goal?.type || 'conversion',
      ...(data.goal || {}),
      template_key: templateKey || undefined,
      secondary: Array.isArray(data.goal?.secondary) ? data.goal.secondary : [],
    };

    const normalizedVariants = normalizeVariantAllocations(variantsWithCode).map(v => ({
      ...v,
      allocation: Number(v.allocation) || 0,
    }));

    return {
      ...data,
      goal,
      holdout_percent: holdoutPercent,
      segments: normalizedSegments,
      scheduled_start_at: data.auto_start ? data.scheduled_start_at || null : null,
      scheduled_stop_at: data.auto_stop ? data.scheduled_stop_at || null : null,
      variants: normalizedVariants,
    };
  };

  const buildCodePayload = (data = formData, codes = variantCodesData) => {
    const variants = data.variants || [];
    return {
      variants: variants.map((variant, index) => {
        const codeData = codes[index] ?? codes.find(item => item?.name === variant.name);
        const code = codeData
          ? buildCombinedCode(codeData)
          : (variant?.code ?? variant?.config?.code ?? '');
        return {
          id: variant.id,
          name: variant.name || variant.config?.name || `Variant ${index + 1}`,
          code: code || '',
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
    const p = (urlPattern ?? '').trim();
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
    const urlPattern = formData.segments?.url_pattern ?? '';
    const firstId =
      formData.target_id ||
      (Array.isArray(formData.target_ids) && formData.target_ids.length > 0
        ? formData.target_ids[0]
        : null);
    const resources = storeResources || [];
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
    storeResources,
    initialData?.target_type,
    getPreviewPathForTarget,
  ]);

  // Set visual preview loading when switching to visual tab or when preview URL changes
  useEffect(() => {
    if (configEditorMode !== 'visual') {
      setVisualPreviewLoadState('idle');
      return;
    }
    const pathForPreview = getFirstTargetPreviewPath();
    const domainForPreview =
      initialData?.shop_domain || getPreviewDomain() || getShopDomain() || routeDomain;
    const resolved = resolvePreviewBaseUrl({
      variantUrl: null,
      overrideUrl: (formData.segments?.visual_editor_preview_url ?? '').trim() || null,
      domain: domainForPreview || undefined,
      path: pathForPreview,
    });
    setVisualPreviewLoadState(resolved ? 'loading' : 'idle');
  }, [
    configEditorMode,
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
        const rules = Array.from(
          { length: 5 },
          (_, i) =>
            (variant?.config?.visual_editor_rules || [])[i] || {
              selector: '',
              css: '',
              js: '',
              position: 'after',
            }
        );
        const selectedCount = rules.filter(r => (r.selector || '').trim()).length;
        const changeIdx = changingSelectorIndexRef.current;

        if (changeIdx !== null && changeIdx >= 0 && changeIdx < 5) {
          setFormData(prev => {
            const variants = [...(prev.variants || [])];
            const v = variants[variantIndex];
            const config = { ...(v?.config || {}) };
            const nextRules = Array.from(
              { length: 5 },
              (_, i) => rules[i] || { selector: '', css: '', js: '', position: 'after' }
            );
            nextRules[changeIdx] = { ...nextRules[changeIdx], selector: sel };
            config.visual_editor_rules = nextRules;
            variants[variantIndex] = { ...v, config };
            return { ...prev, variants };
          });
          setChangingSelectorIndex(null);
          setIsDirty(true);
          setVisualEditorDirty(true);
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

        setFormData(prev => {
          const variants = [...(prev.variants || [])];
          const v = variants[variantIndex];
          const config = { ...(v?.config || {}) };
          const nextRules = Array.from(
            { length: 5 },
            (_, i) => rules[i] || { selector: '', css: '', js: '', position: 'after' }
          );
          nextRules[idx] = { ...nextRules[idx], selector: sel };
          config.visual_editor_rules = nextRules;
          variants[variantIndex] = { ...v, config };
          return { ...prev, variants };
        });
        setIsDirty(true);
        setVisualEditorDirty(true);
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
  }, [allowedPreviewMessageOrigins]);

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
    if (!code) {
      return { css: '', js: '' };
    }
    const cssMatch = code.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    const jsMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    return {
      css: cssMatch ? cssMatch[1].trim() : '',
      js: jsMatch ? jsMatch[1].trim() : '',
    };
  };

  const buildCombinedCode = codeData => {
    if (!codeData) return '';
    let combinedCode = '';
    if (codeData.css && codeData.css.trim()) {
      combinedCode += `<style>\n${codeData.css}\n</style>\n`;
    }
    if (codeData.js && codeData.js.trim()) {
      combinedCode += `<script>\n${codeData.js}\n</script>`;
    }
    return combinedCode.trim();
  };

  const stripCodeFromPayload = payload => {
    if (!payload) return payload;
    const variants = (payload.variants || []).map(variant => {
      const { code: _code, ...rest } = variant;
      if (rest.config && rest.config.code) {
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
  useEffect(() => {
    setVariantCodesData(prev => {
      const updated = (formData.variants || []).map((variant, index) => {
        const existing = prev[index] || prev.find(item => item?.name === variant.name);
        const sourceCode = variant?.code || variant?.config?.code || '';
        const shouldHydrate = !!sourceCode && (!existing || (!existing.css && !existing.js));

        if (existing && !shouldHydrate && existing.code === sourceCode) {
          return {
            ...existing,
            name: variant.name,
          };
        }

        if (
          existing &&
          !shouldHydrate &&
          existing.code &&
          sourceCode &&
          existing.code !== sourceCode
        ) {
          const parsed = parseVariantCode(sourceCode);
          return {
            ...existing,
            name: variant.name,
            css: parsed.css,
            js: parsed.js,
            code: sourceCode,
          };
        }

        // Preserve user-entered code when source (formData) is empty but we have existing edits
        if (existing && !sourceCode && (existing.css?.trim() || existing.js?.trim())) {
          return {
            ...existing,
            name: variant.name,
          };
        }

        const parsed = parseVariantCode(sourceCode);
        return {
          ...(existing || {}),
          name: variant.name,
          css: parsed.css,
          js: parsed.js,
          code: sourceCode,
        };
      });

      const currentSelected = selectedVariantIndexRef.current;
      if (updated.length > 0 && currentSelected >= updated.length) {
        setSelectedVariantIndex(0);
      }

      return updated;
    });
  }, [formData.variants]);

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
    }
  }, [variantCodesData]);

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
    setSelectedTemplate(templateKey);

    let targetType = '';
    let urlPattern = '';
    if (templateKey === 'template' || templateKey === 'theme') {
      targetType = 'homepage';
      urlPattern = isStandalone ? HOMEPAGE_URL_PATTERN_STANDALONE : HOMEPAGE_URL_PATTERN_SHOPIFY;
    } else if (templateKey === 'checkout') {
      targetType = 'checkout';
      urlPattern = '/checkout';
    } else if (templateKey === 'shipping' || templateKey === 'combination') {
      targetType = 'cart';
      urlPattern = '/cart';
    } else if (templateKey === 'pricing' || templateKey === 'offer') {
      targetType = 'all-products';
      urlPattern = '/products/';
    }

    if (TEST_TEMPLATES[templateKey]) {
      const template = TEST_TEMPLATES[templateKey];
      setFormData(prev => ({
        ...prev,
        type: template.defaultConfig.type,
        target_type: targetType,
        target_id: '',
        target_ids: null,
        segments: { ...prev.segments, url_pattern: urlPattern, page_rules: [] },
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
        segments: { ...prev.segments, url_pattern: urlPattern, page_rules: [] },
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

  const handleNext = () => {
    const stepErrors = getStepErrors(currentStep);
    if (stepErrors.length > 0) {
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
      const codePayload = buildCodePayload();
      await onSaveCode(codePayload);
      lastSavedSnapshotRef.current = JSON.stringify(buildPayload());
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
        setError(stepErrors[0]);
        return;
      }
    }

    const payload = buildPayload();
    const nameToUse = (payload.name?.trim() || initialData?.name?.trim()) ?? '';
    if (!nameToUse) {
      setError('Test name is required.');
      return;
    }
    const payloadWithName = { ...payload, name: nameToUse.trim() };
    if (!payload.name?.trim() && initialData?.name?.trim()) {
      setFormData(prev => ({ ...prev, name: initialData.name.trim() }));
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

      const codePayload = isCodeStep ? buildCodePayload() : null;
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
        lastSavedSnapshotRef.current = JSON.stringify(buildPayload());
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
    const autosaveDelay = currentStep === stepIds.code ? 2500 : 1200;
    autosaveTimeoutRef.current = setTimeout(() => {
      handleSubmit({ silent: true });
    }, autosaveDelay);
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
    });

  const handleVariantCodeChange = (type, value, variantIndex) => {
    const index =
      typeof variantIndex === 'number' && variantIndex >= 0 ? variantIndex : selectedVariantIndex;
    setCodeEditorDirty(true);
    setVariantCodesData(prev => {
      const updated = [...prev];
      if (updated[index] !== undefined) {
        updated[index] = {
          ...updated[index],
          [type]: value,
        };
      }
      return updated;
    });

    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    validationTimeoutRef.current = setTimeout(() => {
      if (type === 'css') {
        setCssValidationErrors(validateCSS(value));
      }
      if (type === 'js') {
        setJsValidationErrors(validateJS(value));
      }
    }, 300);
  };

  const handleVariantNavigation = direction => {
    hasVariantSelectionRef.current = true;
    if (direction === 'prev') {
      setSelectedVariantIndex(prev => Math.max(0, prev - 1));
    } else {
      setSelectedVariantIndex(prev => Math.min(variantCodesData.length - 1, prev + 1));
    }
  };

  const buildPreviewUrl = (variant, index) => {
    if (mode !== 'edit' || !initialData?.id) return null;
    const domain = initialData?.shop_domain || getPreviewDomain() || getShopDomain();
    const baseUrl = resolvePreviewBaseUrl({
      variantUrl: variant?.config?.url,
      overrideUrl: null,
      domain: domain || undefined,
      path: '/',
    });
    if (!baseUrl) return null;
    const variantId = variant?.id || variant?.name || `variant-${index + 1}`;
    const variantName = variant?.name || `Variant ${index + 1}`;
    return buildPreviewUrlUtil({
      baseUrl,
      testId: initialData.id,
      variantId,
      variantName,
      visualEditor: false,
    });
  };

  const handlePreviewVariant = (variant, index) => {
    const url = buildPreviewUrl(variant, index);
    if (!url) {
      setError(
        isStandalone
          ? 'Add a site domain for this test (or a variant URL) to preview. You can set it in test settings or when connecting your site.'
          : 'Missing shop domain. Open the app from Shopify Admin to preview.'
      );
      return;
    }
    window.open(url, '_blank', 'noopener');
  };

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
    if (hasStepErrors && validationSummaryRef.current) {
      validationSummaryRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      validationSummaryRef.current.focus({ preventScroll: true });
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
    <div className="wizard-progress">
      {steps.map((step, index) => {
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

  const renderTemplateSelection = () => (
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
        <span className={stepStyles.templateStepBadge}>1 of {steps.length}</span>
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
                  {TEST_TYPE_CATEGORIES.content.title}
                </h3>
                <p className={stepStyles.templateCategorySubtitle}>
                  {TEST_TYPE_CATEGORIES.content.description}
                </p>
              </div>
              <TooltipWrapper
                content={TEST_TYPE_CATEGORIES.content.description}
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
                return (
                  <div
                    key={type.key}
                    role="button"
                    tabIndex={0}
                    className="template-grid-item"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleTemplateSelect(type.key);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleTemplateSelect(type.key);
                      }
                    }}
                    aria-pressed={isSelected}
                    aria-label={`Select ${type.name}: ${type.description}`}
                  >
                    <Card sectioned className={`template-card ${isSelected ? 'selected' : ''}`}>
                      <div className={stepStyles.templateCardHeader}>
                        <span className={stepStyles.templateCardBadgeSlot}>
                          {type.key === 'onsite-edit' && (
                            <span className={stepStyles.templateCardStarter}>Starter</span>
                          )}
                        </span>
                        {isSelected && <div className="template-card-check">✓</div>}
                      </div>
                      <div className={stepStyles.templateCardBody}>
                        <div className={stepStyles.templateCardIcon}>{type.icon}</div>
                        <div className={stepStyles.templateCardMeta}>
                          <p className={stepStyles.templateCardTitle}>{type.name}</p>
                          <div className={stepStyles.templateCardDivider} aria-hidden />
                          <p className={stepStyles.templateCardDesc} title={type.description}>
                            {type.description}
                          </p>
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
                    {TEST_TYPE_CATEGORIES.profit.title}
                  </h3>
                  <p className={stepStyles.templateCategorySubtitle}>
                    {TEST_TYPE_CATEGORIES.profit.description}
                  </p>
                </div>
                <TooltipWrapper
                  content={TEST_TYPE_CATEGORIES.profit.description}
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
                {TEST_TYPE_CATEGORIES.profit.types.map(type => {
                  const isSelected = selectedTemplate === type.key;
                  return (
                    <div
                      key={type.key}
                      role="button"
                      tabIndex={0}
                      className="template-grid-item"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleTemplateSelect(type.key);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleTemplateSelect(type.key);
                        }
                      }}
                      aria-pressed={isSelected}
                      aria-label={`Select ${type.name}: ${type.description}`}
                    >
                      <Card sectioned className={`template-card ${isSelected ? 'selected' : ''}`}>
                        <div className={stepStyles.templateCardHeader}>
                          <span className={stepStyles.templateCardBadgeSlot}>
                            {type.key === 'pricing' && (
                              <span className={stepStyles.templateCardRecommended}>
                                Recommended
                              </span>
                            )}
                          </span>
                          {isSelected && <div className="template-card-check">✓</div>}
                        </div>
                        <div className={stepStyles.templateCardBody}>
                          <div className={stepStyles.templateCardIcon}>{type.icon}</div>
                          <div className={stepStyles.templateCardMeta}>
                            <p className={stepStyles.templateCardTitle}>{type.name}</p>
                            <div className={stepStyles.templateCardDivider} aria-hidden />
                            <p className={stepStyles.templateCardDesc} title={type.description}>
                              {type.description}
                            </p>
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
                    visual_editor_rules: Array.from({ length: 5 }, () => ({
                      selector: '',
                      css: '',
                      js: '',
                      position: 'after',
                    })),
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
    const countriesValue = formData.segments?.countries?.join(', ') || '';
    const holdoutValue =
      formData.holdout_percent === null || formData.holdout_percent === undefined
        ? ''
        : String(formData.holdout_percent);

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
                  {isStandalone
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
                      <span className={styles.placementBarLabel}>Page integration</span>
                      <span className={styles.placementBarSubtext}>
                        Where and who sees your test
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
                          title="Page (1)"
                        >
                          <span className={styles.placementTabStep}>1</span>
                          <Icon source={PageIcon} />
                          <span>Page</span>
                          {((formData.segments?.page_rules || []).length > 0 ||
                            (customUrlModeActive &&
                              (formData.segments?.url_pattern ?? '') !== '')) && (
                            <span className={styles.placementTabDot} />
                          )}
                        </button>
                        {!isStandalone && (
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
                          title={isStandalone ? 'Holdout (2)' : 'Holdout (4)'}
                        >
                          <span className={styles.placementTabStep}>
                            {isStandalone ? '2' : '4'}
                          </span>
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
                          title={isStandalone ? 'Advanced (3)' : 'Advanced (5)'}
                        >
                          <span className={styles.placementTabStep}>
                            {isStandalone ? '3' : '5'}
                          </span>
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
                                  <span className={styles.panelSectionInfoIcon} aria-hidden="true">
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
                                    url_pattern: '/products/',
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
                                    url_pattern: '/products/',
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
                              {['product', 'collection', 'page'].includes(formData.target_type) && (
                                <div className={styles.panelSection} style={{ marginTop: '1rem' }}>
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
                                              onClearButtonClick={() => setStoreResourceSearch('')}
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
                                              <span className={styles.storeResourceSelectedBadge}>
                                                {selectedIds.length} selected
                                              </span>
                                            );
                                          })()}
                                        </div>
                                        {storeResourcesLoading ? (
                                          <div className={styles.storeResourceListLoading}>
                                            <div className={styles.storeResourceListLoadingIcon}>
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
                                              <div className={styles.storeResourceListScroll}>
                                                {storeResources.map(r => (
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
                                                      className={styles.storeResourceItemContent}
                                                    >
                                                      <span
                                                        className={styles.storeResourceItemTitle}
                                                      >
                                                        {r.title}
                                                      </span>
                                                      {r.handle && (
                                                        <span
                                                          className={styles.storeResourceItemHandle}
                                                        >
                                                          /{r.handle}
                                                        </span>
                                                      )}
                                                    </span>
                                                    <span
                                                      className={styles.storeResourceItemCheck}
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
                                                      className={styles.storeResourceItemContent}
                                                    >
                                                      <span
                                                        className={styles.storeResourceItemTitle}
                                                      >
                                                        {id.replace(/.*\//, '')} (saved)
                                                      </span>
                                                      <span
                                                        className={styles.storeResourceItemHandle}
                                                      >
                                                        Previously selected
                                                      </span>
                                                    </span>
                                                    <span
                                                      className={styles.storeResourceItemCheck}
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
                                            );
                                          })()
                                        )}
                                      </div>
                                      {(!formData.target_id || !formData.target_id.trim()) &&
                                        (!formData.target_ids ||
                                          formData.target_ids.length === 0) &&
                                        (!initialData?.target_id ||
                                          !initialData.target_id.trim()) &&
                                        (!initialData?.target_ids ||
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
                                              Use &quot;Add rule&quot; below to define path or regex
                                              rules. No fixed presets — enter any path (e.g. /blog,
                                              /pricing) or regex.
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
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        0,
                                                        idx
                                                      ),
                                                      { ...rule, type: 'include' },
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        idx + 1
                                                      ),
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
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        0,
                                                        idx
                                                      ),
                                                      { ...rule, type: 'exclude' },
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        idx + 1
                                                      ),
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
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        0,
                                                        idx
                                                      ),
                                                      {
                                                        ...rule,
                                                        pattern: newPattern,
                                                        match_type: newMatchType,
                                                      },
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        idx + 1
                                                      ),
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
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        0,
                                                        idx
                                                      ),
                                                      { ...rule, match_type: v },
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        idx + 1
                                                      ),
                                                    ],
                                                  },
                                                }));
                                              }}
                                            />
                                          </div>
                                          <div className={styles.customUrlInputWrap}>
                                            <TextField
                                              label={isStandalone ? 'Path or regex' : 'URL pattern'}
                                              labelHidden
                                              value={rule.pattern === ' ' ? '' : rule.pattern || ''}
                                              onChange={v => {
                                                setIsDirty(true);
                                                setFormData(prev => ({
                                                  ...prev,
                                                  segments: {
                                                    ...prev.segments,
                                                    page_rules: [
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        0,
                                                        idx
                                                      ),
                                                      { ...rule, pattern: v === '' ? ' ' : v },
                                                      ...(prev.segments?.page_rules || []).slice(
                                                        idx + 1
                                                      ),
                                                    ],
                                                  },
                                                }));
                                              }}
                                              placeholder={
                                                isStandalone
                                                  ? (rule.match_type || 'starts_with') === 'regex'
                                                    ? 'e.g. ^/blog, ^/en/.*'
                                                    : 'e.g. /blog, /pricing, /docs'
                                                  : (rule.match_type || 'contains') === 'regex'
                                                    ? 'e.g. ^/products/.* or /collections/sale'
                                                    : (rule.match_type || 'contains') === 'contains'
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
                                                (rule.match_type || 'starts_with') === 'regex' &&
                                                isStandalone
                                                  ? 'JavaScript regex. Path-based patterns (e.g. starting with /) match the page path only.'
                                                  : (rule.match_type || 'contains') === 'regex' &&
                                                      !isStandalone
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
                            <span className={styles.targetingPanelStep}>Step 2 of 2</span>
                            <h4 className={styles.targetingPanelTitle}>Holdout (control group)</h4>
                            <p className={styles.targetingPanelHint}>
                              Reserve a percentage of visitors who never see any variant for a true
                              control. Use <kbd className={styles.panelKbd}>1</kbd>–
                              <kbd className={styles.panelKbd}>4</kbd> or arrow keys to switch
                              sections.
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
                                  Quick apply: Product pages + 10% holdout
                                </span>
                                <button
                                  type="button"
                                  className={styles.holdoutRecommendedBtn}
                                  onClick={() => {
                                    setCustomUrlModeActive(false);
                                    setFormData(prev => ({
                                      ...prev,
                                      target_type: 'all-products',
                                      target_id: '',
                                      target_ids: null,
                                      segments: {
                                        ...prev.segments,
                                        url_pattern: '/products/',
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
                              {isStandalone ? 'Step 3 of 3' : 'Step 5 of 5'}
                            </span>
                            <h4 className={styles.targetingPanelTitle}>
                              Advanced targeting & safety
                            </h4>
                            <p className={styles.targetingPanelHint}>
                              Safety, traffic, presets, and custom rules. Use{' '}
                              <kbd className={styles.panelKbd}>1</kbd>–
                              <kbd className={styles.panelKbd}>{isStandalone ? '3' : '5'}</kbd> or
                              arrow keys to switch sections.
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
                        helpText="Threshold for declaring a winner"
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
    const source =
      mode === 'edit' && initialData?.variants?.[0]?.config
        ? initialData.variants[0].config
        : formData.variants?.[0]?.config;
    if (!source) return 'code';
    if ('url' in source) return 'url';
    if ('price' in source) return 'price';
    if ('rate' in source) return 'shipping';
    if ('template' in source) return 'template';
    if ('discount' in source || 'discount_type' in source || 'discount_value' in source)
      return 'offer';
    return 'code';
  };

  const variantConfigType = getVariantConfigType();

  const configStepContentReady =
    mode !== 'edit' ||
    (isInitialized &&
      (variantConfigType !== 'code' ||
        (formData.variants?.length > 0 && variantCodesData.length === formData.variants?.length)));

  const renderVariantUrlModule = () => (
    <BlockStack gap="400">
      <Text variant="bodyMd" color="subdued" as="p">
        Set the URL for each variant. Visitors will be redirected to the assigned variant URL.
      </Text>
      {(formData.variants || []).map((variant, index) => (
        <Card key={`url-${index}`} sectioned>
          <FormLayout>
            <TextField
              label={variant.name}
              value={variant.config?.url ?? ''}
              onChange={value => {
                const next = [...(formData.variants || [])];
                next[index] = { ...next[index], config: { ...next[index].config, url: value } };
                setFormData({ ...formData, variants: next });
              }}
              placeholder="https://yoursite.com/pages/variant-page"
              helpText="Full URL for this variant"
              autoComplete="off"
            />
          </FormLayout>
        </Card>
      ))}
    </BlockStack>
  );

  const renderVariantPriceModule = () => (
    <BlockStack gap="400">
      <Text variant="bodyMd" color="subdued" as="p">
        Set the price for each variant. Use empty or 0 for control (original price).
      </Text>
      {(formData.variants || []).map((variant, index) => (
        <Card key={`price-${index}`} sectioned>
          <FormLayout>
            <TextField
              label={variant.name}
              type="number"
              value={
                variant.config?.price !== null && variant.config?.price !== undefined
                  ? String(variant.config.price)
                  : ''
              }
              onChange={value => {
                const parsed = value === '' ? null : parseFloat(value);
                const next = [...(formData.variants || [])];
                next[index] = { ...next[index], config: { ...next[index].config, price: parsed } };
                setFormData({ ...formData, variants: next });
              }}
              placeholder="Original price (leave empty)"
              prefix="$"
              helpText="Override price (e.g. 19.99) or leave empty for control"
              autoComplete="off"
            />
          </FormLayout>
        </Card>
      ))}
    </BlockStack>
  );

  const renderVariantShippingModule = () => (
    <BlockStack gap="400">
      <Text variant="bodyMd" color="subdued" as="p">
        Set the shipping rate for each variant. Use empty for control (default rate).
      </Text>
      {(formData.variants || []).map((variant, index) => (
        <Card key={`shipping-${index}`} sectioned>
          <FormLayout>
            <TextField
              label={variant.name}
              type="number"
              value={
                variant.config?.rate !== null && variant.config?.rate !== undefined
                  ? String(variant.config.rate)
                  : ''
              }
              onChange={value => {
                const parsed = value === '' ? null : parseFloat(value);
                const next = [...(formData.variants || [])];
                next[index] = { ...next[index], config: { ...next[index].config, rate: parsed } };
                setFormData({ ...formData, variants: next });
              }}
              placeholder="Default rate (leave empty)"
              prefix="$"
              helpText="Shipping rate override"
              autoComplete="off"
            />
          </FormLayout>
        </Card>
      ))}
    </BlockStack>
  );

  const renderVariantOfferModule = () => (
    <BlockStack gap="400">
      <Text variant="bodyMd" color="subdued" as="p">
        Configure the discount or offer for each variant.
      </Text>
      {(formData.variants || []).map((variant, index) => (
        <Card key={`offer-${index}`} sectioned>
          <BlockStack gap="300">
            <Text variant="headingSm" as="h4" fontWeight="semibold">
              {variant.name}
            </Text>
            <FormLayout>
              <Select
                label="Discount type"
                options={[
                  { label: 'Percentage off', value: 'percent' },
                  { label: 'Fixed amount off', value: 'fixed' },
                  { label: 'Free shipping', value: 'free_shipping' },
                ]}
                value={variant.config?.discount_type || 'percent'}
                onChange={value => {
                  const next = [...(formData.variants || [])];
                  next[index] = {
                    ...next[index],
                    config: { ...next[index].config, discount_type: value },
                  };
                  setFormData({ ...formData, variants: next });
                }}
              />
              <TextField
                label="Discount value"
                type="number"
                value={
                  variant.config?.discount_value !== null &&
                  variant.config?.discount_value !== undefined
                    ? String(variant.config.discount_value)
                    : ''
                }
                onChange={value => {
                  const parsed = value === '' ? null : parseFloat(value);
                  const next = [...(formData.variants || [])];
                  next[index] = {
                    ...next[index],
                    config: { ...next[index].config, discount_value: parsed },
                  };
                  setFormData({ ...formData, variants: next });
                }}
                placeholder="10"
                suffix={variant.config?.discount_type === 'percent' ? '%' : ''}
                prefix={variant.config?.discount_type === 'fixed' ? '$' : ''}
                helpText={
                  variant.config?.discount_type === 'percent'
                    ? 'e.g. 10 for 10%'
                    : variant.config?.discount_type === 'fixed'
                      ? 'Amount (e.g. 5.00)'
                      : 'Leave empty for free shipping'
                }
              />
            </FormLayout>
          </BlockStack>
        </Card>
      ))}
    </BlockStack>
  );

  const renderVariantTemplateModule = () => (
    <BlockStack gap="400">
      <Text variant="bodyMd" color="subdued" as="p">
        Select the template for each variant.
      </Text>
      {(formData.variants || []).map((variant, index) => (
        <Card key={`template-${index}`} sectioned>
          <FormLayout>
            <TextField
              label={variant.name}
              value={variant.config?.template ?? ''}
              onChange={value => {
                const next = [...(formData.variants || [])];
                next[index] = {
                  ...next[index],
                  config: { ...next[index].config, template: value },
                };
                setFormData({ ...formData, variants: next });
              }}
              placeholder="e.g. alternate or custom"
              helpText="Template handle or ID"
              autoComplete="off"
            />
          </FormLayout>
        </Card>
      ))}
    </BlockStack>
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
      const moduleTitles = {
        url: 'Variant URLs',
        price: 'Variant Prices',
        shipping: 'Variant Shipping Rates',
        offer: 'Variant Offers',
        template: 'Variant Templates',
      };
      return (
        <Card>
          <BlockStack gap="400">
            <div>
              <Text variant="headingLg" as="h2" fontWeight="bold">
                Variant Configuration
              </Text>
              <Text variant="bodySm" color="subdued" as="p" style={{ marginTop: '0.25rem' }}>
                {moduleTitles[variantConfigType]}
              </Text>
            </div>
            {variantConfigType === 'url' && renderVariantUrlModule()}
            {variantConfigType === 'price' && renderVariantPriceModule()}
            {variantConfigType === 'shipping' && renderVariantShippingModule()}
            {variantConfigType === 'offer' && renderVariantOfferModule()}
            {variantConfigType === 'template' && renderVariantTemplateModule()}
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

              <div className="config-editor-tabs-wrap">
                <div
                  className="config-editor-tabs"
                  role="tablist"
                  aria-label="Configuration editor mode"
                  onKeyDown={e => {
                    if (e.key === 'ArrowLeft' || e.key === 'Home') {
                      e.preventDefault();
                      setConfigEditorMode('visual');
                    } else if (e.key === 'ArrowRight' || e.key === 'End') {
                      e.preventDefault();
                      setConfigEditorMode('code');
                    }
                  }}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={configEditorMode === 'visual'}
                    aria-controls="config-editor-panel-visual"
                    id="config-tab-visual"
                    tabIndex={configEditorMode === 'visual' ? 0 : -1}
                    className={`config-editor-tab ${configEditorMode === 'visual' ? 'config-editor-tab--active' : ''}`}
                    onClick={() => setConfigEditorMode('visual')}
                    aria-label="Visual editor: preview target page and element selector"
                  >
                    <span className="config-editor-tab-icon config-editor-tab-icon--visual">
                      <Icon source={ViewIcon} />
                    </span>
                    <span className="config-editor-tab-label">Visual Editor</span>
                    {visualEditorDirty && (
                      <span className="config-editor-tab-dirty" title="Unsaved changes" aria-hidden>
                        •
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={configEditorMode === 'code'}
                    aria-controls="config-editor-panel-code"
                    id="config-tab-code"
                    tabIndex={configEditorMode === 'code' ? 0 : -1}
                    className={`config-editor-tab ${configEditorMode === 'code' ? 'config-editor-tab--active' : ''}`}
                    onClick={() => setConfigEditorMode('code')}
                    aria-label="Code editor: add CSS and JavaScript per variant"
                  >
                    <span className="config-editor-tab-icon">
                      <Icon source={CodeIcon} />
                    </span>
                    <span className="config-editor-tab-label">Code Editor</span>
                    {codeEditorDirty && (
                      <span className="config-editor-tab-dirty" title="Unsaved changes" aria-hidden>
                        •
                      </span>
                    )}
                  </button>
                </div>

                <div className="config-editor-panels">
                  <div
                    id="config-editor-panel-visual"
                    role="tabpanel"
                    aria-labelledby="config-tab-visual"
                    hidden={configEditorMode !== 'visual'}
                    className={`config-editor-panel config-editor-panel--visual ${configEditorMode === 'visual' ? 'config-editor-panel--active' : ''}`}
                  >
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
                            {(formData.segments?.url_pattern ?? '').trim()
                              ? formData.segments.url_pattern
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
                              initialData?.shop_domain ||
                              getPreviewDomain() ||
                              getShopDomain() ||
                              routeDomain;
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
                          const veUrl = (formData.segments?.visual_editor_preview_url ?? '').trim();
                          const hasOverride = veUrl.length > 0;
                          const domainForPreview =
                            (initialData?.shop_domain && String(initialData.shop_domain).trim()) ||
                            getPreviewDomain() ||
                            getShopDomain() ||
                            routeDomain;
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
                                  visualEditor: true,
                                })
                              : null;
                          const directPreviewUrl = fullPreviewUrl || baseUrl || '';
                          let iframeSrc = '';
                          if (directPreviewUrl) {
                            const apiBase = (getApiBaseUrl() || '').replace(/\/+$/, '') || '/api';
                            const previewDocPath = `${apiBase}/track/preview-document`;
                            const isRelative =
                              typeof window !== 'undefined' &&
                              apiBase &&
                              !/^https?:\/\//i.test(apiBase);
                            const previewDoc = isRelative
                              ? new URL(previewDocPath, window.location.origin)
                              : new URL(previewDocPath);
                            previewDoc.searchParams.set('url', directPreviewUrl);
                            previewDoc.searchParams.set('ab_visual_editor', '1');
                            if (fullPreviewUrl) {
                              try {
                                const u = new URL(fullPreviewUrl);
                                [
                                  PREVIEW_PARAMS.PREVIEW,
                                  PREVIEW_PARAMS.TEST_ID,
                                  PREVIEW_PARAMS.VARIANT_ID,
                                  PREVIEW_PARAMS.VARIANT_NAME,
                                ].forEach(k => {
                                  const v = u.searchParams.get(k);
                                  if (v !== undefined && v !== null && v !== '')
                                    previewDoc.searchParams.set(k, v);
                                });
                              } catch (_) {
                                /* ignore */
                              }
                            }
                            iframeSrc = previewDoc.toString();
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
                                  The preview loads your store page with the RipX script injected so
                                  you can click to select elements. Add the script in App settings →
                                  Installation for your live store.
                                </Text>
                              </div>
                            );
                          }
                          const showEmbedBlocked = visualPreviewLoadState === 'error';
                          const rules = Array.from(
                            { length: 5 },
                            (_, i) =>
                              (previewVariant?.config?.visual_editor_rules || [])[i] || {
                                selector: '',
                                css: '',
                                js: '',
                                position: 'after',
                              }
                          );
                          const selectedCount = rules.filter(r => (r.selector || '').trim()).length;
                          const atLimit = selectedCount >= 5;
                          const updateCurrentVariantRules = updater => {
                            setFormData(prev => {
                              const variants = [...(prev.variants || [])];
                              const v = variants[safeVisualIndex];
                              const config = { ...(v?.config || {}) };
                              const nextRules = Array.from(
                                { length: 5 },
                                (_, i) =>
                                  rules[i] || { selector: '', css: '', js: '', position: 'after' }
                              );
                              updater(nextRules);
                              config.visual_editor_rules = nextRules;
                              variants[safeVisualIndex] = { ...v, config };
                              return { ...prev, variants };
                            });
                            setIsDirty(true);
                            setVisualEditorDirty(true);
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
                            { id: 'css', label: 'CSS' },
                            { id: 'js', label: 'JavaScript' },
                          ];
                          return (
                            <div className="variant-visual-editor-single-layout">
                              <div className="variant-visual-editor-preview-section">
                                <div className="variant-visual-editor-preview-hint" role="status">
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {!testId && 'Save the test to see variant styling. '}
                                    The preview loads your store page with the RipX script so you
                                    can click to select elements. For live tests, add the script via
                                    App settings → Installation.
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
                                            Edit selectors, CSS, and JS for each selected element.
                                          </Text>
                                        </div>
                                        <button
                                          type="button"
                                          className="variant-visual-editor-snippet-collapse-btn"
                                          onClick={() => setVisualSnippetPanelExpanded(false)}
                                          aria-label="Collapse panel"
                                        >
                                          <Icon source={ChevronDownIcon} />
                                        </button>
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
                                          const rule = rules[idx] || {
                                            selector: '',
                                            css: '',
                                            js: '',
                                            position: 'after',
                                          };
                                          const rawTab = visualRuleActiveTab[idx] || 'selector';
                                          const activeTab =
                                            rawTab === 'position' ? 'selector' : rawTab;
                                          const handleRemoveElement = ruleIndexToRemove => {
                                            updateCurrentVariantRules(nextRules => {
                                              nextRules[ruleIndexToRemove] = {
                                                selector: '',
                                                css: '',
                                                js: '',
                                                position: 'after',
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
                                                      Click an element in the preview to replace the
                                                      selector.
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
                                                  <Text as="p" variant="bodySm" fontWeight="medium">
                                                    Click an element in the preview to replace this
                                                    selector.
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

                  <div
                    id="config-editor-panel-code"
                    role="tabpanel"
                    aria-labelledby="config-tab-code"
                    hidden={configEditorMode !== 'code'}
                    className={`config-editor-panel config-editor-panel--code ${configEditorMode === 'code' ? 'config-editor-panel--active' : ''}`}
                  >
                    <div className="variant-selector-container">
                      <div className="variant-selector-wrapper">
                        <div className="variant-selector">
                          {variantCodesData.map((variant, index) => {
                            const COLORS = [
                              '#06b6d4',
                              '#8b5cf6',
                              '#f49342',
                              '#14b8a6',
                              '#b98900',
                              '#e91e63',
                            ];
                            const color = COLORS[index % COLORS.length];
                            const isSelected = index === selectedVariantIndex;
                            const hasCode =
                              (variant?.css && variant.css.trim()) ||
                              (variant?.js && variant.js.trim());

                            return (
                              <button
                                key={`${variant.name}-${index}`}
                                className={`variant-selector-button ${isSelected ? 'variant-selector-button--selected' : ''}`}
                                onClick={() => {
                                  hasVariantSelectionRef.current = true;
                                  setSelectedVariantIndex(index);
                                }}
                                style={{
                                  '--variant-color': color,
                                }}
                              >
                                <div
                                  className="variant-selector-color-indicator"
                                  style={{ backgroundColor: color }}
                                />
                                <InlineStack gap="200" align="center">
                                  <Text
                                    variant="bodyMd"
                                    fontWeight={isSelected ? 'semibold' : 'medium'}
                                  >
                                    {variant.name}
                                  </Text>
                                  {hasCode && <Badge tone="success">Code</Badge>}
                                </InlineStack>
                                {isSelected && (
                                  <div className="variant-selector-check">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                      <path
                                        d="M13.5 4L6 11.5L2.5 8"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {variantCodesData.length > 1 && (
                          <div className="variant-navigation-buttons">
                            <Button
                              plain
                              onClick={() => handleVariantNavigation('prev')}
                              disabled={selectedVariantIndex === 0}
                              aria-label="Previous variant"
                            >
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path
                                  d="M12.5 15L7.5 10L12.5 5"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </Button>
                            <Text variant="bodySm" color="subdued" as="span">
                              {selectedVariantIndex + 1} / {variantCodesData.length}
                            </Text>
                            <Button
                              plain
                              onClick={() => handleVariantNavigation('next')}
                              disabled={selectedVariantIndex === variantCodesData.length - 1}
                              aria-label="Next variant"
                            >
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path
                                  d="M7.5 5L12.5 10L7.5 15"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {variantCodesData[selectedVariantIndex] &&
                      (() => {
                        const currentVariant = variantCodesData[selectedVariantIndex];
                        const COLORS = [
                          '#06b6d4',
                          '#8b5cf6',
                          '#f49342',
                          '#14b8a6',
                          '#b98900',
                          '#e91e63',
                        ];
                        const color = COLORS[selectedVariantIndex % COLORS.length];
                        const cssLineCount = currentVariant.css
                          ? currentVariant.css.split('\n').length
                          : 0;
                        const cssCharCount = currentVariant.css ? currentVariant.css.length : 0;
                        const jsLineCount = currentVariant.js
                          ? currentVariant.js.split('\n').length
                          : 0;
                        const jsCharCount = currentVariant.js ? currentVariant.js.length : 0;

                        return (
                          <div
                            className="variant-code-editor-card"
                            style={{
                              '--variant-color': color,
                            }}
                          >
                            <Card sectioned>
                              <BlockStack gap="500">
                                <InlineStack align="space-between" blockAlign="center">
                                  <InlineStack gap="300" align="center">
                                    <div
                                      className="variant-code-color-indicator"
                                      style={{ backgroundColor: color }}
                                    />
                                    <div>
                                      <Text variant="headingSm" as="h4" fontWeight="semibold">
                                        {currentVariant.name}
                                      </Text>
                                      <Text
                                        variant="bodySm"
                                        color="subdued"
                                        as="p"
                                        style={{ marginTop: '0.125rem' }}
                                      >
                                        CSS: {cssLineCount} {cssLineCount === 1 ? 'line' : 'lines'}{' '}
                                        • JS: {jsLineCount} {jsLineCount === 1 ? 'line' : 'lines'}
                                      </Text>
                                    </div>
                                  </InlineStack>
                                </InlineStack>

                                <div className="variant-code-split-container">
                                  <div className="variant-code-split-panel css-panel">
                                    <div className="variant-code-section-header">
                                      <InlineStack gap="300" align="center" blockAlign="center">
                                        <div className="code-type-icon css-icon">
                                          <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
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
                                        </div>
                                        <Text variant="headingSm" as="h5" fontWeight="semibold">
                                          CSS
                                        </Text>
                                        <Text variant="bodySm" color="subdued" as="span">
                                          {cssLineCount} {cssLineCount === 1 ? 'line' : 'lines'} •{' '}
                                          {cssCharCount.toLocaleString()}{' '}
                                          {cssCharCount === 1 ? 'char' : 'chars'}
                                        </Text>
                                        {cssValidationErrors.length > 0 && (
                                          <Badge status="critical" tone="critical">
                                            {cssValidationErrors.length}{' '}
                                            {cssValidationErrors.length === 1 ? 'error' : 'errors'}
                                          </Badge>
                                        )}
                                        {cssValidationErrors.length === 0 &&
                                          (currentVariant.css || '').trim() !== '' && (
                                            <Badge status="success">✓ Valid</Badge>
                                          )}
                                      </InlineStack>
                                    </div>
                                    <div className="variant-code-editor-wrapper">
                                      <TextField
                                        label=""
                                        value={currentVariant.css || ''}
                                        onChange={value =>
                                          handleVariantCodeChange(
                                            'css',
                                            value,
                                            selectedVariantIndex
                                          )
                                        }
                                        multiline={25}
                                        autoComplete="off"
                                        placeholder="/* Enter your CSS code here */&#10;&#10;.my-class {&#10;  color: #333;&#10;  font-size: 16px;&#10;}"
                                        error={
                                          cssValidationErrors.length > 0
                                            ? cssValidationErrors[0]
                                            : undefined
                                        }
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
                                                  <Text variant="bodySm" color="critical" as="span">
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

                                  <div className="variant-code-split-divider">
                                    <div className="split-divider-line" />
                                    <div className="split-divider-handle">
                                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                        <path
                                          d="M7.5 5L12.5 10L7.5 15"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                        <path
                                          d="M12.5 5L7.5 10L12.5 15"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </div>
                                  </div>

                                  <div className="variant-code-split-panel js-panel">
                                    <div className="variant-code-section-header">
                                      <InlineStack gap="300" align="center" blockAlign="center">
                                        <div className="code-type-icon js-icon">
                                          <svg
                                            width="20"
                                            height="20"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            xmlns="http://www.w3.org/2000/svg"
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
                                        </div>
                                        <Text variant="headingSm" as="h5" fontWeight="semibold">
                                          JavaScript
                                        </Text>
                                        <Text variant="bodySm" color="subdued" as="span">
                                          {jsLineCount} {jsLineCount === 1 ? 'line' : 'lines'} •{' '}
                                          {jsCharCount.toLocaleString()}{' '}
                                          {jsCharCount === 1 ? 'char' : 'chars'}
                                        </Text>
                                        {jsValidationErrors.length > 0 && (
                                          <Badge status="critical" tone="critical">
                                            {jsValidationErrors.length}{' '}
                                            {jsValidationErrors.length === 1 ? 'error' : 'errors'}
                                          </Badge>
                                        )}
                                        {jsValidationErrors.length === 0 &&
                                          (currentVariant.js || '').trim() !== '' && (
                                            <Badge status="success">✓ Valid</Badge>
                                          )}
                                      </InlineStack>
                                    </div>
                                    <div className="variant-code-editor-wrapper">
                                      <TextField
                                        label=""
                                        value={currentVariant.js || ''}
                                        onChange={value =>
                                          handleVariantCodeChange('js', value, selectedVariantIndex)
                                        }
                                        multiline={25}
                                        autoComplete="off"
                                        placeholder="// Enter your JavaScript code here&#10;&#10;console.log('Hello, World!');&#10;document.querySelector('.my-class').style.display = 'block';"
                                        error={
                                          jsValidationErrors.length > 0
                                            ? jsValidationErrors[0]
                                            : undefined
                                        }
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
                                                  <Text variant="bodySm" color="critical" as="span">
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
                                    💡 CSS and JavaScript will be automatically wrapped in
                                    &lt;style&gt; and &lt;script&gt; tags when saved
                                  </Text>
                                </div>
                              </BlockStack>
                            </Card>
                          </div>
                        );
                      })()}
                  </div>
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
    const COLORS = ['#06b6d4', '#8b5cf6', '#f49342', '#14b8a6', '#b98900', '#e91e63'];

    const targetingParts = [
      (reviewSegments.page_rules || []).length > 0
        ? `${reviewSegments.page_rules.length} page rule(s)`
        : reviewSegments.url_pattern?.trim()
          ? `URL: ${reviewSegments.url_pattern}`
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
            {(formData.goal?.conversion_url || initialData?.goal?.conversion_url)?.trim() && (
              <div className={stepStyles.reviewItem}>
                <span className={stepStyles.reviewItemLabel}>Goal URL</span>
                <span className={stepStyles.reviewItemValue}>
                  {String(
                    formData.goal?.conversion_url || initialData?.goal?.conversion_url || ''
                  ).trim()}
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
          <div className={stepStyles.reviewVariantsList}>
            {reviewVariants.map((v, i) => (
              <div key={i} className={stepStyles.reviewVariantChip}>
                <span
                  className={stepStyles.reviewVariantChipColor}
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                {v.name}: {v.allocation}%
              </div>
            ))}
          </div>
        </div>

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
        open={titleEditOpen}
        onClose={() => setTitleEditOpen(false)}
        title="Edit Test"
        primaryAction={{
          content: 'Save',
          onAction: () => {
            setFormData(prev => ({
              ...prev,
              name: titleEditDraft.name?.trim() || prev.name,
              description: titleEditDraft.description?.trim() ?? prev.description,
            }));
            setIsDirty(true);
            setTitleEditOpen(false);
          },
        }}
        secondaryActions={[{ content: 'Cancel', onAction: () => setTitleEditOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Test Name"
              value={titleEditDraft.name}
              onChange={value => setTitleEditDraft(d => ({ ...d, name: value }))}
              placeholder="Enter test name"
              autoComplete="off"
            />
            <TextField
              label="Description"
              value={titleEditDraft.description}
              onChange={value => setTitleEditDraft(d => ({ ...d, description: value }))}
              multiline={2}
              placeholder="Describe purpose or hypothesis"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}

export default TestWizard;
