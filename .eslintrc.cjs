/**
 * ESLint Configuration
 *
 * Code quality and style standards for RipX
 */

module.exports = {
  env: {
    node: true,
    es2021: true,
    jest: true
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  rules: {
    // Code Quality
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }
    ],
    'no-undef': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',

    // Best Practices
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-return-await': 'error',
    'require-await': 'warn',

    // Style (indent handled by Prettier)
    quotes: ['error', 'single', { avoidEscape: true }],
    semi: ['error', 'always'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
    'space-before-blocks': 'error',
    'keyword-spacing': 'error',
    'space-infix-ops': 'error',
    'eol-last': ['error', 'always'],
    'no-trailing-spaces': 'error',
    'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],

    // Security
    'no-new-require': 'error',
    'no-path-concat': 'error'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true
      }
    },
    {
      files: ['**/utils/logger.js'],
      rules: { 'no-console': 'off' }
    },
    {
      files: [
        '**/notificationService.js',
        '**/shopifyService.js',
        '**/routes/settingsRoutes.js',
        '**/archiveProcessor.js',
        '**/guardrailProcessor.js',
        '**/significanceAlertProcessor.js',
        '**/auth.js',
        '**/analytics.js',
        '**/abTestEngine.js',
        '**/combinationTestService.js',
        '**/database.js',
        '**/emailVerificationService.js',
        '**/mailProcessService.js'
      ],
      rules: { 'require-await': 'off' }
    }
  ]
};
