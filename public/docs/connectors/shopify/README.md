# Shopify setup-guide screenshots

Referenced from `src/content/connectors/shopify.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `shopify` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`shopify_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **API Key (optional)**, **Store Name**. The type dropdown shows the lowercase key **`shopify`**. **Major drift fixed:** the draft claimed "No Test Connection button" — **false** (returns *"Test not applicable for this type"* for HTTP-API sources). Also fixed: dropdown key, added **Connection Name**, "API Key" → "API Key (optional)", **"Store" → "Store Name"**, "Save" → "Create Connection".

> **Cosmetic Eng bug (flagged, not documented):** the **Store Name** label renders a doubled asterisk (`Store Name * *`). Same class as salesforce/jira.

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (Shopify custom-app token) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
