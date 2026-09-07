# Freshdesk setup-guide screenshots

Referenced from `src/content/connectors/freshdesk.md`.

> [!WARNING]
> **Superseded observation - 2026-09-07.** The notes below record what was seen at
> each entry's `verified_date`. Any statement here that **Test Connection** returns
> *"Test not applicable for this type"* was true when captured and is **not true now**: core#821 retired
> that verdict, and on production today the string survives only in two source
> comments describing the removed behaviour. The button now either makes a real
> credential probe, really lists a file location, or returns a neutral *not tested*
> verdict carrying its own reason. The current wording lives in
> `src/content/connectors/freshdesk.md` and is guarded by
> `tests/test-connection-copy.test.ts`.
>
> The observations are deliberately left as written. They are a dated record, and
> editing them would falsify the provenance they exist to provide.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **Connections → New Connection** form with `freshdesk` selected (Freshdesk Domain + API Key). Captured 2026-07-17 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API-key field renders masked. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form with a real Freshdesk source (`13 — freshdesksupport (freshdesk)` → `17 — docswarehouse (postgres)`), showing the **SaaS-endpoint shape**: the **Select endpoints to load** checkbox group (`agents`, `companies`, `contacts`, `groups`, `tickets`, all ticked) and **no** Load Mode / Write Disposition / Source schema / Table names. Captured 2026-07-22 by filling the live form on prod — **nothing was submitted**. The connection's credentials are fake, which does not matter: the form renders from the connection *type*, and no request is made. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-17` — the connection-form field labels were verified against the live shipped UI (core#309) on 2026-07-17 and this screenshot matches. The field is labelled **"Freshdesk Domain"** (enter just the subdomain). Clicking **Test Connection** shows *"Test not applicable for this type."* See `plans/product/SPEC_WAVE1_CONNECTOR_FIELDS.md` for the shipped field contract vs the original spec.

## Why this guide carries the SaaS-shape screenshot

It is the **only** shot of the endpoint-checkbox shape, and it is deliberately here rather than in a bigger connector's guide: Freshdesk connection **13** already existed in the Docs-QA org, so no new credential was provisioned to take it.

**It was not capturable before 2026-07-22.** [core#546](https://github.com/datanika-io/datanika-core/pull/546) both corrected the offered names — Freshdesk previously wasn't a SaaS type at all and got SQL controls instead ([core#503](https://github.com/datanika-io/datanika-core/issues/503)) — and made the selection actually narrow the load ([core#532](https://github.com/datanika-io/datanika-core/issues/532)). Verified against the deployed worker before capturing, not assumed from the merge.

**Reusable for the other 15 SaaS guides — but only deliberately.** The *shape* is identical; the pickers visibly read `(freshdesk)` and the checkbox names are Freshdesk's. Capture your own, or note the reuse in that guide's README. Tracked in [landing#287](https://github.com/datanika-io/datanika-landing/issues/287).

## Not yet captured (future enhancement, not embedded in the guide)

- `01-credentials.png` — Freshdesk **Profile settings** showing the agent API key. Needs a Freshdesk UI login.
- `04-first-run.png` — the **Runs** tab after a first successful sync. Needs real Freshdesk credentials; connection 13's are fake (⚠️ the free-plan account lapsed ~6mo, see the QA credential note).
- `05-schedule.png` — the schedule form is source-agnostic; `postgresql/05-schedule.png` shows it.
