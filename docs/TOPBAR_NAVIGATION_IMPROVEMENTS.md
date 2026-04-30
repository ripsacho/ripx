# TopBar Navigation – Research & Improvements

## Summary

The TopBar was audited and updated to reduce redundancy, clarify structure, and add a primary CTA. Breadcrumb and user dropdown were aligned with app routes and UX best practices.

## Current TopBar Structure (After Changes)

### Left

- **Mobile toggle** (when sidebar is shown on mobile)
- **Breadcrumb** – Parent / Current (clickable parent where applicable)

### Right

- **Store switcher** – Only when in app context (`/app/:domain`)
- **New Test** – Primary CTA when in app; links to Create Test. Label hidden on small screens (icon only).
- **Divider** – Vertical separator between primary actions and utilities (shown only when in app).
- **Action group**
  - **Open in new tab** – When embedded in Shopify admin
  - **Notifications** – Bell icon + popover (list + “See all”)
  - **Divider**
  - **User menu** – Profile icon + email/store label + chevron; opens dropdown (see below)

## User Menu Dropdown (Consolidated)

Previously: separate **Settings** popover (gear) and **User** popover, with overlap (e.g. Notifications in both).

Now: a single **User** menu with clear sections:

1. **Header** – Signed-in email or store
2. **Shopify connection** – Status/card when in Shopify store context
3. **Navigate** – Home, My domains, Admin (if admin)
4. **Settings** – App/Account settings, Notifications, Account & API keys
5. **Resources** – My Profile, Preferences, Support, Documentation (Support before Docs for visibility)
6. **Logout**

Duplicate “Account” was removed from Resources; “API Keys” was renamed to **Account & API keys** in Settings (same destination: profile account tab).

The separate Settings (gear) popover was **removed**; its items live under **Settings** in the user menu. This reduces topbar clutter and keeps one place for account/settings.

## Breadcrumb

- **Support** route (`/support`) is now handled: shows “Home / Support” with clickable “Home”.
- All other existing routes unchanged.

## Rationale

| Change                      | Reason                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Remove Settings popover     | Notifications was in both Settings and bell; App settings / API Keys are account-level and fit better in the user menu. One fewer icon improves scanability. |
| Section labels in user menu | “Navigate”, “Settings”, “Resources” make the long list scannable and group by intent.                                                                        |
| “New test” in topbar        | When in app, a visible CTA increases discoverability of the main action; matches common SaaS patterns (e.g. “New project”, “Create”).                        |
| Support in breadcrumb       | Support is a universal app route; breadcrumb was missing it and could show “Page not found”.                                                                 |

## Files Touched

- `frontend/src/components/Layout/TopBar.jsx` – Structure, user menu sections, New test button, remove Settings popover.
- `frontend/src/components/Layout/TopBar.module.css` – Styles for `.newTestBtn`, `.menuSection`, `.menuSectionTitle`.
- `frontend/src/utils/breadcrumb.js` – Support route breadcrumb.

## Accessibility and polish

- **Notifications** – `aria-label` includes unread count when present (e.g. "Notifications (3 unread)").
- **New test** – `title` and `aria-label` set to "Create a new A/B test".
- **Reduced motion** – `prefers-reduced-motion: reduce` disables hover/active transforms on New test and icon buttons, and disables chevron rotation in the user menu.
- **Breadcrumb** – Profile tab routes show "Profile / Account" and "Profile / Preferences" with clickable parent.
- **Breadcrumb** – `/connect/oauth-success` shows "Connect / Success" with clickable "Connect".
- **Support** – Shared `formatReplyContent` in `utils/supportFormat.js`; live chat `live chatReady` so live chat button only when SDK loaded; reduced-motion for bubble/FAB; "Try again" for tickets load error.

## Optional Follow-ups

- **Help icon** – Optional “?” that opens a small popover (e.g. Documentation + Support) for faster access without opening the full user menu.
- **Keyboard** – Ensure user menu and “New test” are reachable and closable via keyboard (Tab, Enter, Escape) and that Polaris Popover behavior is sufficient.
- **Analytics** – Track clicks on “New test” and user menu sections if product metrics are needed.
