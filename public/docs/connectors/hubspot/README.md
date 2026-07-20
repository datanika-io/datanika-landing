# HubSpot setup-guide screenshots

Referenced from `src/content/connectors/hubspot.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `hubspot` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`saas_api_key_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name** + a single **API Key (optional)** field. The type dropdown shows the lowercase key **`hubspot`**. **Major drift fixed:** the draft claimed "No Test Connection button" — **false** (the button renders and returns *"Test not applicable for this type"* for HTTP-API sources). Also fixed: dropdown key, added the missing **Connection Name** field, "API Key" → "API Key (optional)", "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (HubSpot private-app token) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
