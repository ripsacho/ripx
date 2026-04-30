# RipX Settings Guide

Configure installation, test defaults, integrations, appearance, and targeting presets from the **Settings** page in the RipX app.

---

## Overview

The Settings page is organized into five tabs:

| Tab                   | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| **Installation**      | Storefront snippet, script URL, setup steps                |
| **General**           | Test presets, sample size, confidence, auto-stop, webhooks |
| **Integrations**      | GA4, BigQuery                                              |
| **Appearance**        | Theme (light, dark, auto)                                  |
| **Targeting Presets** | Reusable audience presets for tests                        |

A quick overview banner at the top shows: Targeting Presets count, Min Sample Size, Confidence level, and Webhook status.

---

## Installation Tab

### Storefront Snippet

Copy the snippet and add it to your site's `<head>`:

1. Click **Copy snippet** to copy the full HTML
2. Paste into your theme's `<head>` (Shopify: Online Store → Themes → Edit code → `theme.liquid`)
3. For guided setup, use the **Setup Wizard** (Shopify stores)

### Script URL

Use the script URL if you prefer a single `<script src="...">` tag instead of the full snippet. Copy the URL and add:

```html
<script src="YOUR_SCRIPT_URL" async></script>
```

### Platform

- **Shopify**: Snippet is tailored for Shopify themes; use Setup Wizard for step-by-step installation
- **Standalone**: Snippet works on any site; add to your HTML template

---

## General Tab

### Quick Presets

One-click preset cards apply recommended defaults to all new tests. Each card shows sample size, confidence level, and a short description:

| Preset           | Sample Size | Confidence | Best For                                  |
| ---------------- | ----------- | ---------- | ----------------------------------------- |
| **Recommended**  | 100         | 95%        | Most stores — balanced speed and accuracy |
| **Conservative** | 500         | 99%        | Higher certainty — waits for more data    |
| **Fast**         | 50          | 90%        | Quick results — lower sample size         |

### Minimum Sample Size

- Minimum visitors per variant before results are shown
- Quick-select: 50, 100, 250, 500, 1000
- Custom: 10–10,000

### Confidence Level

- Statistical confidence threshold (higher = more conservative)
- Quick-select: 90%, 95%, 99%
- Custom: 0.8–0.99

### Auto-Stop

When enabled, tests automatically stop when statistical significance is reached. Recommended for most users.

### Webhooks

Configure outbound webhooks to receive events:

- **Webhook URL**: Your endpoint (e.g. `https://your-server.com/webhook`)
- **Events**:
  - **When test completes** — fired when a test reaches completion
  - **When significance is reached** — fired when a winner is declared

Leave URL empty to disable webhooks.

---

## Integrations Tab

### Google Analytics 4 (GA4)

1. In GA4: **Admin → Data Streams → Web stream → Measurement Protocol API secrets**
2. Create an API secret
3. Add to `.env`:
   ```
   GA4_MEASUREMENT_ID=G-XXXXXXXXXX
   GA4_API_SECRET=your_measurement_protocol_api_secret
   ```

See [INTEGRATIONS.md](../INTEGRATIONS.md) for details.

### BigQuery

1. Create a GCP project and enable BigQuery
2. Create a service account with BigQuery Data Editor role
3. Set `GOOGLE_APPLICATION_CREDENTIALS` and `GCP_PROJECT_ID` in `.env`
4. Create tables using `backend/docs/bigquery_schema.sql`
5. Use **Export incremental** or **Full export** from the Settings UI

See [INTEGRATIONS.md](../INTEGRATIONS.md) for setup and schema.

---

## Appearance Tab

Choose the app theme with visual preview cards or the dropdown:

- **Light** — Light theme
- **Dark** — Dark theme
- **Auto** — Switches by time of day based on local time

---

## Targeting Presets Tab

Create reusable audience presets (device, customer type, countries) and apply them when creating tests. Presets appear in the test creator targeting section.

---

## Related Docs

- [INTEGRATIONS.md](../INTEGRATIONS.md) — GA4, BigQuery, heatmap, funnel
- [QUICK_START.md](../getting-started/QUICK_START.md) — Initial setup
- [IMPLEMENTATION_GUIDE.md](../getting-started/IMPLEMENTATION_GUIDE.md) — Step-by-step implementation
