/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '/migrations/'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/app.js'],
  coverageDirectory: 'coverage',
  verbose: true,
};
