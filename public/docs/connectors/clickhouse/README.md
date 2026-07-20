# ClickHouse setup-guide screenshots

Referenced from `src/content/connectors/clickhouse.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `clickhouse` selected — shows the two checkboxes **Use HTTPS (TLS)** and **Enable cluster replication** below the db fields. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`clickhouse_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database**, plus the checkboxes **Use HTTPS (TLS)** and **Enable cluster replication**. The type dropdown shows the lowercase key **`clickhouse`**. Both **Test Connection** and **Create Connection** buttons render. **Major drift fixed:** the draft **omitted both checkboxes** and carried a callout claiming TLS "is not yet supported via the structured form" — contradicted by the shipped **Use HTTPS (TLS)** checkbox (confirmed in the screenshot). Both checkboxes documented; the TLS callout rewritten. Also fixed: dropdown key, "Name" → "Connection Name", "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (ClickHouse user setup) and `03/04/05` — need a source→ClickHouse pipeline run.
