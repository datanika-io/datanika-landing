# Snowflake setup-guide screenshots

This directory is referenced from `src/content/connectors/snowflake.md`.

## Required screenshots

| Filename | Step | What to capture |
|---|---|---|
| `01-credentials.png` | Step 1 | Snowsight SQL worksheet showing the `CREATE ROLE DATANIKA_LOADER`, `CREATE WAREHOUSE`, `CREATE USER` sequence running successfully. |
| `02-add-connection.png` | Step 2 | The **Connections → New connection** form in Datanika with Snowflake selected: account, user, password, database, warehouse, role, schema fields visible. **Blur the password.** |
| `03-configure-pipeline.png` | Step 3 | The **Configure pipeline** screen showing a source targeting Snowflake, with schema name and table selection visible. |
| `04-first-run.png` | Step 4 | The **Runs** tab after a successful first run, showing per-table row counts. |
| `05-schedule.png` | Step 5 | The **Schedule** modal with a cadence selected. |

## Capture guidelines

- Use a **trial or dev Snowflake account** — no production data.
- **Redact** passwords and any real account identifiers if connected to production.
- Dark theme, 1600 px width, `pngquant --quality 80-95`.
- Crop tightly.
