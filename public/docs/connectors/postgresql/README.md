# PostgreSQL setup-guide screenshots

This directory is referenced from `src/content/connectors/postgresql.md`. Until
the five screenshots below are captured from a real `app.datanika.io` session,
the guide will render with broken image placeholders.

## Required screenshots

| Filename | Step | What to capture |
|---|---|---|
| `01-credentials.png` | Step 1 | A `psql` or terminal screenshot showing the `CREATE ROLE datanika_readonly` + `GRANT` sequence running successfully. |
| `02-add-connection.png` | Step 2 | The **Connections → New connection** form filled in for PostgreSQL: name, host, port, database, user, SSL mode. Blur/redact the password field. |
| `03-configure-tables.png` | Step 3 | The **Configure pipeline** screen showing table selection with write disposition (`merge`), primary key, and incremental cursor columns visible. |
| `04-first-run.png` | Step 4 | The **Runs** tab mid-run or just after, showing per-table row counts for the first successful sync. |
| `05-schedule.png` | Step 5 | The **Schedule** modal/page with an `Hourly` or `Daily at 03:00` cadence and a timezone selected. |

## Capture guidelines

- Use a real demo org on `app.datanika.io`, not a local dev instance — screenshots
  should match what users actually see.
- **Redact secrets.** Passwords, API keys, host IPs of production databases,
  and org names of customers must be blurred or replaced with placeholders
  before committing.
- Use the dark theme (default) so screenshots match the landing page.
- Target width: **1600 px**. Compress with `pngquant --quality 80-95` before
  committing to keep the `dist/` asset bundle small.
- Crop tightly around the relevant UI — no full-browser-window shots with
  address bars.

## Verification gate

Per `plans/PLAN_PRODUCT.md` the guide is considered "verified" only after a
human has actually walked through the flow end-to-end against a real Postgres
source. When that happens, update the frontmatter in
`src/content/connectors/postgresql.md`:

```yaml
verified_by: "<your name or handle>"
verified_date: "YYYY-MM-DD"
```

The current values (`Datanika Product Team` / `2026-04-10`) reflect the
content draft, not a hands-on verification run.
