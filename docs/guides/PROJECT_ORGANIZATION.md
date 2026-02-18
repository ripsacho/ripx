# RipX Project Organization

How the RipX codebase is structured for maintainability and consistency.

---

## Frontend Structure

```
frontend/src/
├── components/          # React components
│   ├── Shared/          # Reusable: PageShell, MetricCard, CustomTabs, TooltipWrapper
│   ├── Layout/          # Sidebar, TopBar
│   ├── Connect/         # Auth, AuthGuard
│   ├── Dashboard/
│   ├── TestList/
│   ├── TestCreator/
│   ├── TestDetail/
│   ├── TestWizard/
│   ├── Analytics/
│   ├── Settings/
│   ├── Profile/
│   ├── Export/
│   ├── PromoLinks/
│   ├── SetupWizard/
│   ├── Documentation/
│   └── ...
├── constants/           # Single source of truth
│   ├── index.js         # Barrel export
│   ├── app.js           # BREAKPOINTS, STORAGE_KEYS, INTERVALS, APP_META
│   ├── routes.js        # ROUTES, ROUTE_PATTERNS
│   ├── layout.js        # GAP, CONTENT_GAP, FORM_GAP
│   ├── status.js        # Test status values
│   └── colors.js        # Color tokens
├── hooks/               # Custom React hooks
│   ├── index.js
│   ├── useTests.js
│   ├── useAnalytics.js
│   └── ...
├── services/            # API layer
│   ├── index.js
│   ├── api.js           # Main API client, getApiKey, isStandaloneMode
│   └── profileApi.js
├── utils/               # Pure utilities
│   ├── theme.js         # Theme switching, persistence
│   ├── dataTableStyles.js
│   └── testType.js
└── main.jsx / App.jsx
```

---

## Constants

| File | Purpose |
|------|---------|
| `app.js` | BREAKPOINTS, STORAGE_KEYS, INTERVALS, APP_META |
| `routes.js` | ROUTES, ROUTE_PATTERNS for navigation |
| `layout.js` | GAP tokens, CONTENT_GAP, FORM_GAP |
| `status.js` | Test status constants |
| `colors.js` | Color palette |

**Rule:** Use constants instead of magic strings/numbers. Import from `constants` or `constants/app`, etc.

---

## Storage Keys

All localStorage keys live in `constants/app.js` → `STORAGE_KEYS`:

- `API_KEY` – Standalone API key
- `PREFERENCES` – Theme, profile preferences
- `PROFILE` – User profile cache
- `ACCOUNT` – Account data cache
- `SHOP_DOMAIN` – Shopify shop domain

---

## Backend Structure

```
backend/src/
├── app.js               # Express app
├── config/              # Swagger, etc.
├── middleware/          # auth, errorHandler, asyncHandler
├── models/              # Database models
├── routes/              # API route handlers
├── services/            # Business logic
├── jobs/                # Background jobs (Bull)
├── utils/               # database, logger, response, validators
└── migrations/          # SQL migrations
```

---

## Shared Patterns

1. **PageShell** – Use for pages that need toast + consistent layout
2. **CONTENT_GAP** – Use for BlockStack/InlineStack gaps between sections
3. **ROUTES** – Use for navigation links (avoids typos)
4. **STORAGE_KEYS** – Use for localStorage (avoids typos, single source)

---

## CSS Breakpoints

Media queries in CSS use pixel values directly (cannot import JS constants). Keep these aligned with `BREAKPOINTS`:

| Constant | Value | Usage |
|----------|-------|-------|
| MOBILE | 900px | Sidebar collapse, mobile layout |
| TABLET | 1024px | Responsive grids |
| DESKTOP | 1280px | Max content width |

---

## Related Docs

- [Code Standards](../development/CODE_STANDARDS.md)
- [Project Structure Assessment](../development/PROJECT_STRUCTURE_ASSESSMENT.md)
- [Settings Guide](./SETTINGS_GUIDE.md)
