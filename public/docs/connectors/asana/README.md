# Asana setup-guide screenshots

Referenced from `src/content/connectors/asana.md`.

> [!WARNING]
> **Superseded observation - 2026-09-07.** The notes below record what was seen at
> each entry's `verified_date`. Any statement here that **Test Connection** returns
> *"Test not applicable for this type"* was true when captured and is **not true now**: core#821 retired
> that verdict, and on production today the string survives only in two source
> comments describing the removed behaviour. The button now either makes a real
> credential probe, really lists a file location, or returns a neutral *not tested*
> verdict carrying its own reason. The current wording lives in
> `src/content/connectors/asana.md` and is guarded by
> `tests/test-connection-copy.test.ts`.
>
> The observations are deliberately left as written. They are a dated record, and
> editing them would falsify the provenance they exist to provide.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **Connections → New Connection** form with `asana` selected. Captured 2026-07-17 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API-key field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-17` — the connection-form field labels were verified against the live shipped UI (core#309) on 2026-07-17 and this screenshot matches. The shipped Asana form has a **single "API Key (optional)" field** (no workspace field — all accessible workspaces sync). Clicking **Test Connection** shows *"Test not applicable for this type."* See `plans/product/SPEC_WAVE1_CONNECTOR_FIELDS.md` for the shipped field contract vs the original spec.

## Not yet captured (future enhancement, not embedded in the guide)

- `01-credentials.png` — the Asana developer console personal-access-token screen. Needs an Asana UI login.
- `04-first-run.png` — the **Runs** tab after a first successful sync. Needs an end-to-end pipeline run to a destination warehouse.
