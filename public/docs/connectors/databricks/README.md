# Databricks setup-guide screenshots

Referenced from `src/content/connectors/databricks.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `databricks` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the Access Token field is empty. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`databricks_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Host**, **HTTP Path**, **Access Token**, **Catalog**, **Schema**. The type dropdown shows the lowercase key **`databricks`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key, **"Server hostname" → "Host"**, "HTTP path" → "HTTP Path", "Access token" → "Access Token", "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (Databricks PAT / service principal) and `03/04/05` — need a source→Databricks pipeline run.
