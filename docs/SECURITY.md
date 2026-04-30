# Security

## Reporting vulnerabilities

Please report security issues privately (e.g. via GitHub Security Advisories or maintainer contact). Do not open public issues for security vulnerabilities.

## Dependency audits

- Run **`npm run audit`** from the repo root (checks both root and frontend).
- Root (backend): Keep `npm audit` at 0 vulnerabilities; fix with `npm audit fix` where possible.
- Frontend: After `npm audit fix`, you may still see **moderate** findings for **esbuild/vite** (dev server only). These affect the local dev server (e.g. GHSA-67mh-4wv8-2f99). Production builds are not affected. To resolve fully, upgrade to Vite 7+ when ready (breaking change).

## Good practices

- Use **Node 20** (see `.nvmrc`) and **npm ≥9** for installs.
- Never commit `.env` or secrets; use `.env.example` as a template.
- In production: set `NODE_ENV=production`, use a strong `JWT_SECRET`, and restrict `ALLOWED_ORIGINS` and admin access as needed.
