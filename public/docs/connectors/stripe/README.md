# Stripe setup-guide screenshots

Referenced from `src/content/connectors/stripe.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `stripe` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`stripe_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name** + a single **API Key (optional)** field. The type dropdown shows the lowercase key **`stripe`**. **Major drift fixed:** the draft claimed Stripe "doesn't expose a Test Connection button" — **false**. The **Test Connection** button renders for every type; for HTTP-API sources like Stripe it returns *"Test not applicable for this type"*. Also fixed: dropdown key, "Name" → "Connection Name", "API key" → "API Key (optional)", "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (Stripe restricted-key creation) and `03/04/05` — need an end-to-end pipeline run to a destination warehouse.
