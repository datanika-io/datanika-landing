# Oracle setup-guide screenshots

Referenced from `src/content/connectors/oracle.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `oracle` selected, showing the **service-name-first** UI: Connection Name, Host, Port (auto-fills `1521`), User, Password, **Database** (= service name), the service-name helper callout, and the **Connect by SID (legacy single-instance)** toggle (unchecked), plus **Test Connection** / **Create Connection**. Captured **2026-07-19** from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |
| `04-first-run.png` | Step 4 | Data preview of table `PROBE_ROWS` after a load into Postgres. `Rows: 3`. Cells are the seeded rows: `id`, `name`, `price` (alpha/100, beta/200, gamma/300), plus `_dlt_load_id` and `_dlt_id`. Captured 2026-11-23 from a local model page. No credential field is in the frame. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — **re-captured** against the current live UI after core #341/#350 (promoted 2026-07-18) flipped Oracle to **service-name-first**. The **Database** field is now the Oracle **service name** (pluggable DB / RAC / Autonomous all work), with a **Connect by SID (legacy single-instance)** toggle for legacy single-instance SID connections; #329/#347 closed. This supersedes the 2026-07-17 shot, which showed the now-removed SID-only form. Guide prose was corrected by Infra ([landing#236]).

`verified_by: product-ui` / `verified_date: 2026-11-23` — `04-first-run.png` is the Data preview for that landed table. The page's **Load first 100 rows** control ran a live read of the destination and showed `Rows: 3`. The values match the seeded Oracle table and nothing else. A planted forbidden token made the same check refuse; the captured text cleared it.

## Not yet captured (future enhancement, not embedded in the guide)

- `01-credentials.png` — a terminal shot of the `CREATE USER datanika_readonly` + `GRANT SELECT` sequence. Needs an Oracle instance.
