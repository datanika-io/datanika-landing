# DuckDB setup-guide screenshots

Referenced from `src/content/connectors/duckdb.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `duckdb` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-18` — Step-2 field labels verified against the live shipped UI (`duckdb_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form has a single field: **Database Path** (required), plus **Connection Name** above. The type dropdown shows the lowercase key **`duckdb`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: "Path to DuckDB file" → "Database Path", removed the fictional nav ("New connection" click + "Destination direction filter" — the form is an inline dropdown), "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `04-first-run.png` — needs an end-to-end pipeline run. (No credentials screen — DuckDB is a local file path.)
