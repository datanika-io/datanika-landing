# Google Ads setup-guide screenshots

Referenced from `src/content/connectors/google-ads.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `google_ads` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`google_ads_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Customer ID** (placeholder `123-456-7890`), **Service Account JSON (optional)**. The type dropdown shows the lowercase key **`google_ads`**. **Major drift fixed:** the draft claimed "No Test Connection button" — **false** (returns *"Test not applicable for this type"* for HTTP-API sources). Also fixed: dropdown key, "Google Ads customer ID" → "Customer ID", **(optional)** on Service Account JSON, and a broken **"Step 1.5"** cross-reference (there is no Step 1.5 — the access grant is Step 1, bullet 5).

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (GCP service account / MCC access) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
