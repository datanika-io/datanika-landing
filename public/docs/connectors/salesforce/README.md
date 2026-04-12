# Salesforce setup-guide screenshots

Referenced from `src/content/connectors/salesforce.md`.

## Required screenshots

| Filename | Step | What to capture |
|---|---|---|
| `01-credentials.png` | Step 1 | **Setup → App Manager → New Connected App** with OAuth settings enabled, `full` scope selected. Use a sandbox or developer edition. |
| `02-add-connection.png` | Step 2 | The **Connections → New connection** form with Salesforce selected: Access Token and Instance URL fields. **Blur the token.** |
| `03-configure-objects.png` | Step 3 | **Configure pipeline** screen showing object selection (accounts, contacts, opportunities) with merge write disposition. |
| `04-first-run.png` | Step 4 | **Runs** tab after a successful first run with per-object row counts. |
| `05-schedule.png` | Step 5 | **Schedule** modal with a cadence selected. |

## Capture guidelines

- Use a **Salesforce sandbox or Developer Edition** — no production customer data.
- **Redact** access tokens, instance URLs with real company names, and any PII in Account/Contact previews.
- Dark theme, 1600 px width, `pngquant --quality 80-95`.

## Key verification items

- Confirm "Salesforce connections don't expose a Test connection button" — drawn from `_NON_DB_TYPES` in `connection_service.py:88`.
- Verify the REST API v59.0 path prefix (`services/data/v59.0/sobjects/`) resolves correctly from the instance URL.
- Test with an expired token to confirm the error message matches the troubleshooting section.
