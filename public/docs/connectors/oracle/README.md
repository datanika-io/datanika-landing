# Oracle setup-guide screenshots

Referenced from `src/content/connectors/oracle.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **Connections → New Connection** form with `oracle` selected (Host, Port, User, Password, Database + Test/Create buttons). Captured 2026-07-17 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-17` — the connection-form field labels were verified against the live shipped UI (core#309) on 2026-07-17 and this screenshot matches. Oracle routes through the generic DB form: the **Database** field holds the Oracle **SID** (service-name connection is not yet supported — [core#329]). See `plans/product/SPEC_WAVE1_CONNECTOR_FIELDS.md` for the shipped field contract vs the original spec.

## Not yet captured (future enhancement, not embedded in the guide)

- `01-credentials.png` — a terminal shot of the `CREATE USER datanika_readonly` + `GRANT SELECT` sequence. Needs an Oracle instance.
- `04-first-run.png` — the **Runs** tab after a first successful sync. Needs an end-to-end pipeline run to a destination warehouse.
