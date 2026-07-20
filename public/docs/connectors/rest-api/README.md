# REST API setup-guide screenshots

Referenced from `src/content/connectors/rest-api.md` (source-only API connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `rest_api` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`rest_api_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Base URL**, **API Key (optional)**, **Extra Headers (optional, JSON)**. The type dropdown shows the lowercase key **`rest_api`**. **Major drift fixed:** the draft invented **four fields that don't exist** — an **Authentication type** selector, an **Auth token**, a **Username**, and a **Password** (basic-auth builder). The real form has just the three fields above; anything beyond a bearer/API-key token goes in **Extra Headers** (JSON) or the raw-JSON escape hatch. Also fixed: dropdown key, "API base URL" → "Base URL", and the false "No Test Connection button" claim (returns *"Test not applicable for this type"* for HTTP-API sources).

## Not yet captured (deferred, not embedded in the guide)

- `04-first-run.png` — needs an end-to-end pipeline run to a destination warehouse. (No fixed credentials screen — auth depends on the target API.)
