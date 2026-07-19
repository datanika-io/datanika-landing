# Salesforce setup-guide screenshots

Referenced from `src/content/connectors/salesforce.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `salesforce` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the Access Token field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`salesforce_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Access Token**, **Instance URL**. The type dropdown shows the lowercase key **`salesforce`**. **Major drift fixed:** the draft claimed Salesforce "doesn't expose a Test Connection button" — **false** (the button renders and returns *"Test not applicable for this type"* for HTTP-API sources). Also fixed: dropdown key, added **Connection Name**, "Save" → "Create Connection".

> **Cosmetic Eng bug (flagged, not documented):** the **Instance URL** label renders a doubled asterisk (`Instance URL * *`) because the i18n value already ends in ` *` and the code appends another. Same class as shopify/jira — worth a small Eng cleanup ticket.

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (Salesforce Connected App) and `04/05` — need an end-to-end pipeline run to a destination warehouse.
