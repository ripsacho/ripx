# UI and features layout audit

Summary of the frontend UI and feature layout after a full-project review. Use for consistency checks and future layout work.

---

## Design system

- **Tokens**: `--futuristic-cyan`, `--futuristic-violet`, `--accent-primary`, `--accent-secondary` (index.css; light/dark). Cards use a 3–4px top gradient bar (cyan → violet).
- **PageShell**: Shared wrapper for most pages; applies `.page` (header underline, card accents, optional Toast). Some pages use the `pageShell` CSS module directly (Dashboard, Analytics, Documentation) for the same look without the component.
- **Layout**: Main app shows Sidebar + TopBar for `/app/:domain/*` and docs; hidden for User panel, Domains, Admin, Connect, auth callbacks. Admin has its own AdminLayout (fixed sidebar + content). Connect uses a two-panel layout (hero + form).

---

## Feature areas

| Area               | Layout                                                                                                      | Notes                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Connect**        | Full-width; hero (left) + form (right). Mobile: stacked, form only.                                         | PageShell, LegalFooter; auth card with tabs and gradient accent. |
| **User panel**     | Single column; header with logo; domain cards.                                                              | PageShell; loading uses Spinner in PageShell.                    |
| **Domains**        | List + add domain; DataTable.                                                                               | PageShell, LegalFooter; empty state when no domains.             |
| **Dashboard**      | Bento grid; FAB; command palette; gradient mesh.                                                            | Uses `pageShell.page` + Dashboard.module.css.                    |
| **Test list**      | PageShell; filters, bulk actions, DataTable or cards.                                                       | `Page title=""`; consistent with Settings/Profile.               |
| **Test creator**   | Wizard in PageShell; step panels.                                                                           | `createPage` + `wizard-page` class.                              |
| **Test detail**    | Tabs (Overview, Editor, Analytics, etc.).                                                                   | PageShell; primary/secondary actions in header.                  |
| **Test editor**    | Code/settings; PageShell.                                                                                   |                                                                  |
| **Analytics**      | Tabs (Overview, Events, etc.); full-width option.                                                           | Uses `pageShell.page` + Analytics.module.css.                    |
| **Settings**       | Tabs; integration cards; forms.                                                                             | PageShell; long form, many sections.                             |
| **Profile**        | Form sections.                                                                                              | PageShell.                                                       |
| **Setup wizard**   | Multi-step; PageShell.                                                                                      |                                                                  |
| **Notifications**  | List + preferences.                                                                                         | PageShell.                                                       |
| **Documentation**  | Scrollable doc content.                                                                                     | Uses `pageShell.page` + docsPage.                                |
| **Admin**          | AdminLayout (sidebar + content); each sub-page uses AdminPageLayout (AdminHero + content) inside PageShell. | Many sub-pages (Users, Domains, Tests, Audit, KV, Jobs, etc.).   |
| **NotFound**       | Centered 404 message; home/back buttons.                                                                    | PageShell; content box with card-style border and gradient bar.  |
| **Error boundary** | Centered error message; Try again / Go to Dashboard.                                                        | PageShell; card already has gradient bar in own CSS.             |

---

## Consistency notes

- **Page title**: Most pages use `Page title=""` and put the real title in a hero or first heading (AdminHero, Dashboard skeleton, etc.) to avoid duplicate headers.
- **Breadcrumbs**: TopBar `getBreadcrumb(pathname, search)` covers Dashboard, Tests (All/Personalization), Test Details, Editor, Export, Promo links, Create Test, Analytics, Settings, Setup, Profile, Notifications, Documentation, Connect, Domains, Admin and sub-routes, 404.
- **Skip link**: `Skip to main content` in App.jsx; styles in index.css (`.skip-to-main`).
- **Responsive**: Sidebar collapses to icon-only; mobile gets overlay + toggle. Admin sidebar stacks on small screens. Connect hero hidden on small viewports.

---

## Improvements applied (this pass)

1. **ErrorBoundary**: Wrapped error view in PageShell so the error page gets the same page/card treatment as the rest of the app.
2. **NotFound**: Wrapped in PageShell; 404 content box given card-like border, background, and gradient top bar for design-system consistency.
3. **TopBar breadcrumbs**: Test sub-routes now show parent “Test Details” and current “Editor”, “Export”, or “Promo links” instead of only “Test Details”.

---

## Optional follow-ups

- **Dashboard / Analytics / Documentation**: Consider using the PageShell component instead of only the CSS module for consistency with toast and future shell options.
- **Empty states**: Audit EmptyState usage and copy across Test list, Domains, Admin lists for tone and primary action.
- **Loading**: RouteLoading and PageSkeleton use the same gradient/spinner style; ensure all lazy routes use Suspense + RouteLoading.
