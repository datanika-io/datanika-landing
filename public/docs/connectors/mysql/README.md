# MySQL setup-guide screenshots

Referenced from `src/content/connectors/mysql.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `mysql` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-18` — Step-2 field labels verified against the live shipped UI (`db_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database** — no Schema field. The type dropdown shows the lowercase key **`mysql`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key, "Name" → "Connection Name", "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (MySQL user creation) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
