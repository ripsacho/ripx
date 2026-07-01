/**
 * Jest config for frontend unit tests.
 * E2E tests live in e2e/ and are run with Playwright (npm run test:e2e).
 * Babel (babel.config.cjs) transforms ESM so Jest can load src modules.
 */
module.exports = {
  testEnvironment: 'node',
  passWithNoTests: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  testMatch: ['**/src/**/__tests__/**/*.[jt]s?(x)', '**/src/**/?(*.)+(spec|test).[jt]s?(x)'],
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
};
