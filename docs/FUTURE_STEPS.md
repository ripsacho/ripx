# Future Steps

Notes for next development sessions.

---

## Quick Reference

### Replace Placeholders

- **package.json** — Update `your-org` in `repository`, `homepage`, `bugs`
- **README.md** — Update badge URLs if repo URL changes
- **docs/.github/ISSUE_TEMPLATE/config.yml** — Update links
- **LICENSE** — Update copyright holder if needed
- **SECURITY.md** — Add contact email for vulnerability reports

### Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start backend + frontend |
| `npm run dev:db` | Start Postgres + Redis (Docker) |
| `npm run dev:db:stop` | Stop dev database |
| `npm run lint` | Lint backend + frontend |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run test:backend` | Run backend tests |
| `npm run migrate` | Run database migrations |

---

## Suggested Next Work

1. **Fix remaining lint issues** — ~40 errors; run `npm run lint:fix` and fix manually
2. **Add backend route tests** — Critical paths: tests, analytics, track
3. **Add frontend unit tests** — Vitest + component tests
4. **Expand E2E tests** — Beyond basic load check
