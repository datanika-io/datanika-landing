# SQL Server (MSSQL) setup-guide screenshots

Referenced from `src/content/connectors/mssql.md`. See PostgreSQL README for the canonical 5-shot capture checklist pattern.

## Required screenshots (source direction — Part A)

| File | What to capture |
|------|----------------|
| `01-credentials.png` | SSMS or Azure Data Studio showing the `CREATE LOGIN datanika_readonly` + `GRANT SELECT` execution. Redact hostnames. |
| `02-add-connection.png` | Datanika `/connections` form with SQL Server selected. Show the 5 fields (Host, Port 1433, Database, Username, Password) + Connection Name. Both **Test Connection** and **Create Connection** buttons visible. |
| `03-configure-tables.png` | Pipeline configuration showing table list from SQL Server source introspection. Show write disposition dropdown + primary key + incremental cursor column selector. |
| `04-first-run.png` | Runs tab showing a completed source extraction from SQL Server with per-table row counts. |
| `05-schedule.png` | Schedule configuration modal with a cadence selected. |

## Destination-direction shots (Part B)

The destination section reuses the same connection form (`02-add-connection.png`) and scheduling (`05-schedule.png`). No additional screenshots needed — the destination section is a compact addendum, not a parallel 5-step walkthrough.

## Capture settings

Dark theme, 1600 px wide, pngquant compression. Redact secrets (passwords, hostnames of production SQL Server instances).
