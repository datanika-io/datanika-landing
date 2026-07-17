# Pipedrive setup-guide screenshots

Referenced from `src/content/connectors/pipedrive.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **Connections → New Connection** form with `pipedrive` selected. Captured 2026-07-17 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API-key field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-17` — the connection-form field labels were verified against the live shipped UI (core#309) on 2026-07-17 and this screenshot matches. The shipped Pipedrive form has a **single "API Key (optional)" field** (no company-domain field — the token hits the global Pipedrive host). Clicking **Test Connection** shows *"Test not applicable for this type."* See `plans/product/SPEC_WAVE1_CONNECTOR_FIELDS.md` for the shipped field contract vs the original spec.

## Not yet captured (future enhancement, not embedded in the guide)

- `01-credentials.png` — Pipedrive **Personal preferences → API** token page. Needs a Pipedrive UI login.
- `04-first-run.png` — the **Runs** tab after a first successful sync. Needs an end-to-end pipeline run to a destination warehouse.
