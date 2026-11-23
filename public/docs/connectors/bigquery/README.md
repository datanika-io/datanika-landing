# BigQuery setup-guide screenshots

Referenced from `src/content/connectors/bigquery.md` (destination-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `bigquery` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form with BigQuery selected as the **Destination connection** (`18 — bigquerywarehouse (bigquery)`), reading from a real PostgreSQL source (`16 — docssamplesdb (postgres)`). Captured 2026-07-22 by filling the live form on prod — **nothing was submitted**. Shows the point the step makes: Load Mode / Write Disposition / Source schema / Table names are there **because the source is a SQL database**, not because of BigQuery. |
| `04-first-run.png` | Step 4 | Data preview of table `probe_rows` in dataset `dn_probe_395c`. `Rows: 3`. Cells are the seeded rows: `id`, `name`, `price` (alpha/100, beta/200, gamma/300), plus `_dlt_load_id` and `_dlt_id`. Captured 2026-11-24 from a local model page after a load into the QA BigQuery project. No credential field is in the frame. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`bigquery_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **GCP Project ID**, **Dataset**, **Service Account JSON (optional)**. The type dropdown shows the lowercase key **`bigquery`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key, "Name" → "Connection Name", **"GCP Project" → "GCP Project ID"**, "Save" → "Create Connection".

`verified_by: product-ui` / `verified_date: 2026-11-24` — `04-first-run.png` is the Data preview for that landed table. The page's **Load first 100 rows** control ran a live read of the BigQuery destination and showed `Rows: 3`. The values match the seeded source table and a `SELECT` of the same table in dataset `dn_probe_395c`. A planted forbidden token made the same check refuse; the captured text cleared it. The 2026-08-31 note that Models stayed empty (`DefaultCredentialsError`, core#869) is not what this page showed.

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (GCP service-account creation) and `05-schedule.png`.

## About this screenshot (2026-07-22)

The BigQuery connection in the 2026-07-22 shot was created **with placeholder credentials**, purely so the upload form had a connection of that type to select, and was **deleted immediately afterwards**. That is sound for this particular image and not for others: the form renders from the connection's *type* and *name*, no request is made, and nothing was submitted.

The visible fields are driven by the **source** (PostgreSQL), which is the whole point of Step 3: pick a different source and the SQL block disappears. See `/docs/connectors/csv` for the file-source shape and `/docs/connectors/freshdesk` for the SaaS-endpoint shape.

`04-first-run.png` was captured later, on 2026-11-24, from the Models data preview after a real load. It is not the placeholder connection described above.
