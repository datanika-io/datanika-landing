# Snowflake setup-guide screenshots

Referenced from `src/content/connectors/snowflake.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `snowflake` selected (all 7 fields). Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`snowflake_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Account**, **User**, **Password**, **Database**, **Warehouse**, **Role**, **Schema**. The type dropdown shows the lowercase key **`snowflake`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key, added the missing **Connection Name** field, "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (Snowsight user/role setup) and `03/04/05` — need a source→Snowflake pipeline run.
