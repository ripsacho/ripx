# RipX - Code Standards & Best Practices

This document outlines the coding standards and best practices for RipX.

## 📋 Table of Contents

1. [General Principles](#general-principles)
2. [JavaScript Standards](#javascript-standards)
3. [File Structure](#file-structure)
4. [Naming Conventions](#naming-conventions)
5. [Documentation](#documentation)
6. [Error Handling](#error-handling)
7. [Security](#security)
8. [Testing](#testing)

## 🎯 General Principles

### Code Quality

- **Readability First**: Code should be self-documenting
- **DRY (Don't Repeat Yourself)**: Avoid code duplication
- **KISS (Keep It Simple, Stupid)**: Prefer simple solutions
- **SOLID Principles**: Follow object-oriented design principles
- **Consistency**: Maintain consistent style throughout

### Performance

- Optimize database queries
- Use connection pooling
- Implement caching where appropriate
- Minimize external API calls
- Use async/await properly

## 📝 JavaScript Standards

### ES6+ Features

- Use `const` by default, `let` when reassignment is needed
- Never use `var`
- Use arrow functions for callbacks
- Use template literals for strings
- Use destructuring for objects and arrays
- Use async/await instead of callbacks

### Example:

```javascript
// ✅ Good
const getUser = async userId => {
  const user = await db.getUser(userId);
  return user;
};

// ❌ Bad
var getUser = function (userId, callback) {
  db.getUser(userId, function (err, user) {
    callback(err, user);
  });
};
```

### Code Style

- **Indentation**: 2 spaces (no tabs)
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Line Length**: Maximum 100 characters
- **Trailing Commas**: Not allowed in arrays/objects

### Example:

```javascript
// ✅ Good
const config = {
  apiKey: 'abc123',
  timeout: 5000,
};

// ❌ Bad
const config = {
  apiKey: 'abc123',
  timeout: 5000,
};
```

## 📁 File Structure

### Backend Structure

```
backend/
├── src/
│   ├── app.js              # Main application entry
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic
│   ├── models/             # Database models
│   ├── middleware/         # Express middleware
│   └── utils/              # Utility functions
└── migrations/             # Database migrations
```

### Naming Files

- **Files**: Use `camelCase.js` for regular files
- **Routes**: Use `camelCaseRoutes.js`
- **Services**: Use `camelCaseService.js`
- **Models**: Use `camelCase.js` (singular)
- **Tests**: Use `camelCase.test.js`

## 🏷️ Naming Conventions

### Variables & Functions

- **camelCase** for variables and functions
- **PascalCase** for classes and constructors
- **UPPER_SNAKE_CASE** for constants
- **Descriptive names**: Avoid abbreviations

```javascript
// ✅ Good
const userEmail = 'user@example.com';
const MAX_RETRIES = 3;
class UserService {}

// ❌ Bad
const ue = 'user@example.com';
const maxRetries = 3;
class userService {}
```

### Database

- **Tables**: `snake_case` (plural)
- **Columns**: `snake_case`
- **Indexes**: `idx_table_column`

### API Endpoints

- **RESTful**: Use standard HTTP methods
- **URLs**: Use kebab-case
- **Versioning**: `/api/v1/...`

```javascript
// ✅ Good
GET    /api/tests
POST   /api/tests
GET    /api/tests/:id
PUT    /api/tests/:id
DELETE /api/tests/:id

// ❌ Bad
GET    /api/getTests
POST   /api/createTest
GET    /api/test/:id
POST   /api/updateTest/:id
POST   /api/deleteTest/:id
```

## 📚 Documentation

### JSDoc Comments

All functions, classes, and modules should have JSDoc comments:

```javascript
/**
 * Get user by ID
 *
 * @param {string} userId - User identifier
 * @param {string} shopDomain - Shopify shop domain
 * @returns {Promise<Object>} User object
 * @throws {Error} If user not found
 *
 * @example
 * const user = await getUser('123', 'shop.myshopify.com');
 */
async function getUser(userId, shopDomain) {
  // Implementation
}
```

### File Headers

Every file should start with a header comment:

```javascript
/**
 * Service Name
 *
 * Brief description of what this file does
 *
 * @module serviceName
 * @version 1.0.0
 */
```

### Inline Comments

- Explain **why**, not **what**
- Use comments for complex logic
- Keep comments up-to-date

```javascript
// ✅ Good - explains why
// Use consistent hashing to ensure same user always sees same variant
const hash = crypto.createHash('md5').update(userId).digest('hex');

// ❌ Bad - explains what (obvious)
// Create a hash from userId
const hash = crypto.createHash('md5').update(userId).digest('hex');
```

## ⚠️ Error Handling

### Always Handle Errors

```javascript
// ✅ Good
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', { error, context });
  throw new Error('User-friendly message');
}

// ❌ Bad
const result = await riskyOperation(); // No error handling
```

### Error Types

- Use specific error types
- Provide meaningful error messages
- Include context in error logs

```javascript
// ✅ Good
if (!userId) {
  throw new ValidationError('User ID is required');
}

// ❌ Bad
if (!userId) {
  throw new Error('Error');
}
```

### Async Error Handling

```javascript
// ✅ Good
router.get('/users/:id', async (req, res, next) => {
  try {
    const user = await getUser(req.params.id);
    res.json({ success: true, user });
  } catch (error) {
    next(error); // Pass to error handler
  }
});
```

## 🔒 Security

### Input Validation

- Always validate user input
- Sanitize data before database queries
- Use parameterized queries (prevent SQL injection)

```javascript
// ✅ Good
const { validateTestConfig } = require('../utils/validators');
const validation = validateTestConfig(req.body);
if (!validation.isValid) {
  return res.status(400).json({ error: validation.errors });
}

// ❌ Bad
const test = await createTest(req.body); // No validation
```

### Authentication & Authorization

- Verify authentication on protected routes
- Check permissions before operations
- Never trust client-side data

### Secrets Management

- Never commit secrets to git
- Use environment variables
- Rotate secrets regularly

## 🧪 Testing

### Test Structure

```javascript
describe('UserService', () => {
  describe('getUser', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = '123';

      // Act
      const user = await getUser(userId);

      // Assert
      expect(user).toBeDefined();
      expect(user.id).toBe(userId);
    });

    it('should throw error when user not found', async () => {
      // Test error case
    });
  });
});
```

### Test Coverage

- Aim for 80%+ coverage
- Test happy paths and error cases
- Test edge cases

## 🛠️ Tools & Configuration

### ESLint

- Run: `npm run lint`
- Fix: `npm run lint:fix`
- Configuration: `.eslintrc.cjs`

### Prettier

- Format: `npm run format`
- Check: `npm run format:check`
- Configuration: `.prettierrc`

### EditorConfig

- Ensures consistent editor settings
- Configuration: `.editorconfig`

## 📦 Dependencies

### Adding Dependencies

- Use exact versions for production (`^` for dev)
- Review dependencies for security
- Keep dependencies up-to-date

### Dependency Management

```bash
# Check for outdated packages
npm outdated

# Update packages
npm update

# Audit security
npm audit
npm audit fix
```

## 🚀 Git Commit Standards

### Commit Messages

Follow conventional commits:

```
feat: add promo links feature
fix: correct analytics calculation
docs: update API documentation
refactor: improve error handling
test: add unit tests for user service
```

### Branch Naming

- `feature/feature-name`
- `fix/bug-description`
- `refactor/component-name`
- `docs/documentation-update`

## ✅ Code Review Checklist

Before submitting code:

- [ ] Code follows style guide
- [ ] All tests pass
- [ ] No linter errors
- [ ] Documentation updated
- [ ] Error handling implemented
- [ ] Security considerations addressed
- [ ] Performance optimized
- [ ] No console.log statements (use logger)

---

**Remember**: Code is read more often than it's written. Write code for humans, not just computers.
