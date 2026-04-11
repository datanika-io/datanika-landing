# Stripe setup-guide screenshots

This directory is referenced from `src/content/connectors/stripe.md`. Until
the five screenshots below are captured from a real `app.datanika.io` session,
the guide will render with broken image placeholders.

## Required screenshots

| Filename | Step | What to capture |
|---|---|---|
| `01-credentials.png` | Step 1 | The **Developers → API keys → Create restricted key** screen in the Stripe dashboard, with `Read` permissions granted on `Customers`, `Charges`, `Invoices`, `Products`, `Prices`, `Subscriptions`. Use a test-mode account so the `rk_test_…` prefix is visible. |
| `02-add-connection.png` | Step 2 | The **Connections → New connection** form in Datanika, with Stripe selected, a name filled in, and the restricted key pasted. **Blur/redact the key.** |
| `03-configure-tables.png` | Step 3 | The **Configure pipeline** screen showing the Stripe resource list with `customers`, `charges`, `invoices` selected and `merge` write disposition. |
| `04-first-run.png` | Step 4 | The **Runs** tab just after a successful first run, showing per-resource row counts for the Stripe pipeline. |
| `05-schedule.png` | Step 5 | The **Schedule** modal/page with `Hourly` cadence and a timezone selected. Can reuse the same screenshot style as the PostgreSQL guide. |

## Capture guidelines

- Use a **test-mode Stripe account** so no live customer data leaks into the screenshots. The `rk_test_…` prefix signals to readers that it's test-mode and encourages them to do the same.
- **Redact secrets.** The restricted key value must be blurred in every screenshot it appears in. Customer emails, names, and Stripe customer IDs should be blurred if they're real.
- Use the dark theme (default) so screenshots match the landing page.
- Target width: **1600 px**. Compress with `pngquant --quality 80-95` before committing to keep the `dist/` asset bundle small.
- Crop tightly around the relevant UI — no full-browser-window shots with address bars.

## Verification gate

Per `plans/PLAN_PRODUCT.md` the guide is considered "verified" only after a
human has actually walked through the flow end-to-end against a real Stripe
account. When that happens, update the frontmatter in
`src/content/connectors/stripe.md`:

```yaml
verified_by: "<your name or handle>"
verified_date: "YYYY-MM-DD"
```

The current values (`draft-pending-verification` / `null`) are intentional —
the content was drafted from code inspection of
`datanika/services/dlt_runner.py` and `datanika/services/connection_service.py`,
not from a live end-to-end run. Tracked in `plans/PLAN_HUMAN_LOCKERS.md` →
*P0 — Per-connector setup guide verification* → *Hands-on walkthrough +
screenshots — Stripe*.
