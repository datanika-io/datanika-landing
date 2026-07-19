# BigQuery setup-guide screenshots

Referenced from `src/content/connectors/bigquery.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `bigquery` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`bigquery_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **GCP Project ID**, **Dataset**, **Service Account JSON (optional)**. The type dropdown shows the lowercase key **`bigquery`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key, "Name" → "Connection Name", **"GCP Project" → "GCP Project ID"**, "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (GCP service-account creation) and `03/04/05` — need a source→BigQuery pipeline run.
