# Contributing to RipX

## Coding Standards

### General

- **Formatting**: Use Prettier (runs via `npm run format`). Config in `.prettierrc`.
- **Linting**: Use ESLint. Run `npm run lint` (backend + frontend) or `npm run lint:fix` to auto-fix.
- **Editor**: Use EditorConfig (`.editorconfig`) for consistent indentation, line endings, charset.
- **Pre-commit**: Husky runs lint-staged (ESLint + Prettier on staged files).
- **Pre-push**: Husky runs backend tests before `git push`.

### Backend (Node.js / Express)

- **Style**: 2 spaces, single quotes, semicolons, ES module where applicable.
- **Imports**: Use `require()` for CommonJS.
- **Response helpers**: Use `sendSuccess`, `sendError`, `sendValidationError`, `sendNotFound` from `utils/response`.
- **Constants**: Use `constants/index.js` for HTTP status, messages, enums.
- **Logging**: Use `utils/logger` instead of `console.log`.

### Frontend (React / Vite)

- **Components**: 1 component per file, PascalCase file names.
- **Exports**: Prefer default export for components.
- **Routes**: Use `ROUTES` and `ROUTE_PATTERNS` from `constants/routes.js` instead of hardcoded paths.
- **API**: Use `apiGet`, `apiPost`, `apiPut`, `apiDelete` from `services/api.js`.

### File Organization

- **Backend**: `routes/` for handlers, `models/` for data access, `services/` for business logic, `utils/` for shared helpers.
- **Frontend**: `components/` by feature (e.g. `TestList/`, `Analytics/`), `constants/` for config, `services/` for API.

### Naming

- **Variables/Functions**: camelCase.
- **Constants**: UPPER_SNAKE_CASE.
- **Components**: PascalCase.
- **Files**: PascalCase for components, camelCase for utilities.
