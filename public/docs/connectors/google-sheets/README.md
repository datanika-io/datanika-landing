# Google Sheets setup-guide screenshots

Referenced from `src/content/connectors/google-sheets.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `google_sheets` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`google_sheets_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Spreadsheet URL**, **Service Account JSON** + a "Share the spreadsheet with the service account email" hint. The type dropdown shows the lowercase key **`google_sheets`**. **Major drift fixed:** the draft field was **"Spreadsheet ID"** — the shipped field is **"Spreadsheet URL"** and expects the **full** spreadsheet URL, not just the ID. Also fixed: dropdown key, and the false "No Test Connection button" claim (returns *"Test not applicable for this type"* for HTTP-API sources).

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (GCP service account) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
