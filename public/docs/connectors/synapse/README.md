# Azure Synapse setup-guide screenshots

Referenced from `src/content/connectors/synapse.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `synapse` selected. Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-18` — Step-2 field labels verified against the live shipped UI (`db_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Synapse routes through the generic `db_fields()`: **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database** — and correctly has **no Schema field**. The type dropdown shows the lowercase key **`synapse`** (name ≠ key). Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key + relabels ("Synapse SQL endpoint" → Host, "Port number" → Port, "Database/pool name" → Database, "Username" → User).

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (writer-user creation) and `04/05` — need a source→Synapse pipeline run.
