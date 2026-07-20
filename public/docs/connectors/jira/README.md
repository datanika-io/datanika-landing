# Jira setup-guide screenshots

Referenced from `src/content/connectors/jira.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `jira` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`jira_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Jira Domain**, **Email**, **API Key (optional)**. The type dropdown shows the lowercase key **`jira`**. **Major drift fixed:** the draft claimed "No Test Connection button" — **false** (returns *"Test not applicable for this type"* for HTTP-API sources). Also fixed: dropdown key, **"Jira server URL" → "Jira Domain"** (and the value is the **subdomain**, not the full URL), **"Account email" → "Email"**, **"API token" → "API Key (optional)"**.

> **Cosmetic Eng bug (flagged, not documented):** the **Jira Domain** label renders a doubled asterisk (`Jira Domain * *`). Same class as salesforce/shopify.

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (Atlassian API token) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
