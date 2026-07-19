# SQL Server (MSSQL) setup-guide screenshots

Referenced from `src/content/connectors/mssql.md` (a bidirectional guide — Part A source, Part B destination; the one `02` shot serves both).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `mssql` selected (Port 1433). Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-18` — Step-2 field labels verified against the live shipped UI (`db_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form uses the **generic** labels **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database** — not the descriptive names the draft invented. The type dropdown shows the lowercase key **`mssql`** (name ≠ key). Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key + relabels ("SQL Server hostname" → Host, "Port number" → Port, "Database name" → Database, "Username" → User).

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (SSMS login creation) and `03/04/05` — need an end-to-end pipeline run to/from a destination.
