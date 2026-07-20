# GitHub setup-guide screenshots

Referenced from `src/content/connectors/github.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `github` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the Access Token field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`github_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Access Token** (required), **Owner / Organization** (required), **Repository** (required). The type dropdown shows the lowercase key **`github`**. **Major drift fixed:** the draft invented a **"Branches to sync"** field (doesn't exist — the connector is default-branch-only) and told readers to **"leave the Access Token blank for public repos"** (all three fields are required — no anonymous mode). Also fixed: the wrong nav ("Connections → New connection" / "select from connector list") → inline type dropdown, "Name" → "Connection Name", and the Test-Connection claim (it returns *"Test not applicable for this type"* for HTTP-API sources).

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (GitHub PAT) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
