# RipX Presentation

Professional slide deck and speaker script for presenting RipX.

## Files

| File               | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `PRESENTATION.md`  | Marp Markdown slides (21 slides)                       |
| `PRESENTATION.pdf` | Exported presentation (run `npm run presentation:pdf`) |
| `SPEECH.md`        | Full speaker script with timing and Q&A prep           |
| `SPEECH.pdf`       | Exported speech deck (run `npm run speech:pdf`)        |
| `SPEECH_DECK.md`   | Marp source for speech PDF                             |
| `SPEECH.html`      | Printable HTML (open and Save as PDF)                  |

## Viewing the Presentation

### Option 1: Marp CLI (recommended)

```bash
# Install Marp CLI globally
npm install -g @marp-team/marp-cli

# Export to HTML (interactive)
marp docs/archive/presentation/PRESENTATION.md -o docs/archive/presentation/PRESENTATION.html

# Export presentation to PDF
npm run presentation:pdf

# Export speech to PDF
npm run speech:pdf

# Live preview (watch mode)
marp docs/archive/presentation/PRESENTATION.md -s
```

### Option 2: VS Code / Cursor

1. Install the [Marp for VS Code](https://marketplace.visualstudio.com/items?itemName=marp-team.marp-vscode) extension
2. Open `PRESENTATION.md`
3. Use the Marp preview (split view or side-by-side)

### Option 3: Online

- Paste `PRESENTATION.md` into [Marp Web](https://web.marp.app/)
- Export as HTML or PDF

## Presentation Structure (21 slides)

1. **Title** — RipX overview, tagline
2. **Problem** — Guesswork, lost revenue, no rigor, platform lock-in
3. **Cost of Guesswork** — Real impact
4. **Section Break** — The Solution
5. **RipX** — Value proposition
6. **Architecture** — System diagram (Node, Express, React, Vite, PostgreSQL, Redis, Bull)
7. **8 Test Types** — Price, content, shipping, offers, checkout
8. **Multi-Variant** — A/B/C, traffic allocation
9. **Analytics** — Z-test, p-value, CI
10. **Advanced Analytics** — Heatmap, funnel, time-series
11. **Power Features** — Clone, health score, sample size, notifications
12. **Integrations** — GA4, BigQuery, webhooks
13. **Targeting** — Device, geo, customer, presets
14. **Promo Links** — No-code offers
15. **Multi-Platform** — Shopify vs standalone
16. **Security** — Auth, isolation, rate limiting
17. **Tech Stack & Tools** — Backend (Node, Express, PostgreSQL, Redis, Bull, Shopify API, JWT), Frontend (React, Vite, TanStack Query, Polaris, Recharts), Integrations (GA4, BigQuery, Swagger), DevOps (Docker, Jest, Playwright)
18. **Features — Step by Step** — Connect → Dashboard → Create (wizard) → Run → Analyze & Act
19. **Roadmap** — Phase 1–3
20. **Why RipX** — Summary
21. **Thank You** — Q&A

## Speech

`SPEECH.md` contains:

- **Per-slide script** — What to say for each slide
- **Estimated timing** — ~12–15 minutes total
- **Q&A prep** — Common questions and answers

## Customization

- Edit `PRESENTATION.md` to change slides
- Adjust `style` in the front matter for branding
- Update `SPEECH.md` to match your speaking style
