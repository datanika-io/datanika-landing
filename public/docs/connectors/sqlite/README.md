# SQLite setup-guide screenshots

Referenced from `src/content/connectors/sqlite.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `sqlite` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-18` — Step-2 field labels verified against the live shipped UI (`sqlite_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form has a single field: **Database Path** (required), plus **Connection Name** above. The type dropdown shows the lowercase key **`sqlite`**. Both **Test Connection** and **Create Connection** buttons render. The draft field text was already accurate; only the dropdown casing was corrected and this screenshot added.

## Not yet captured (deferred, not embedded in the guide)

- `04-first-run.png` — needs an end-to-end pipeline run to a destination warehouse. (No credentials screen — SQLite is a local file path.)
