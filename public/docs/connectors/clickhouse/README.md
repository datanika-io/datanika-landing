# ClickHouse setup-guide screenshots

Referenced from `src/content/connectors/clickhouse.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `clickhouse` selected — shows the two checkboxes **Use HTTPS (TLS)** and **Enable cluster replication** below the db fields. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form with ClickHouse selected as the **Destination connection** (`23 — clickhousewarehouse (clickhouse)`), reading from a real PostgreSQL source (`16 — docssamplesdb (postgres)`). Captured 2026-07-22 by filling the live form on prod — **nothing was submitted**. Shows the point the step makes: Load Mode / Write Disposition / Source schema / Table names are there **because the source is a SQL database**, not because of ClickHouse. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`clickhouse_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database**, plus the checkboxes **Use HTTPS (TLS)** and **Enable cluster replication**. The type dropdown shows the lowercase key **`clickhouse`**. Both **Test Connection** and **Create Connection** buttons render. **Major drift fixed:** the draft **omitted both checkboxes** and carried a callout claiming TLS "is not yet supported via the structured form" — contradicted by the shipped **Use HTTPS (TLS)** checkbox (confirmed in the screenshot). Both checkboxes documented; the TLS callout rewritten. Also fixed: dropdown key, "Name" → "Connection Name", "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (ClickHouse user setup) and `03/04/05` — need a source→ClickHouse pipeline run.

## About this screenshot (2026-07-22)

The ClickHouse connection in the shot was created **with placeholder credentials**, purely so the upload form had a connection of that type to select, and was **deleted immediately afterwards**. That is sound for this particular image and not for others: the form renders from the connection's *type* and *name*, no request is made, and nothing was submitted. A screenshot of a **run** would need real credentials — which is why `04-first-run.png` is not here.

The visible fields are driven by the **source** (PostgreSQL), which is the whole point of Step 3: pick a different source and the SQL block disappears. See `/docs/connectors/csv` for the file-source shape and `/docs/connectors/freshdesk` for the SaaS-endpoint shape.
