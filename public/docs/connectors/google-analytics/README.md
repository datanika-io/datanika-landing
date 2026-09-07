# Google Analytics setup-guide screenshots

Referenced from `src/content/connectors/google-analytics.md` (source-only SaaS connector).

> [!WARNING]
> **Superseded observation - 2026-09-07.** The notes below record what was seen at
> each entry's `verified_date`. Any statement here that **Test Connection** returns
> *"Test not applicable for this type"* was true when captured and is **not true now**: core#821 retired
> that verdict, and on production today the string survives only in two source
> comments describing the removed behaviour. The button now either makes a real
> credential probe, really lists a file location, or returns a neutral *not tested*
> verdict carrying its own reason. The current wording lives in
> `src/content/connectors/google-analytics.md` and is guarded by
> `tests/test-connection-copy.test.ts`.
>
> The observations are deliberately left as written. They are a dated record, and
> editing them would falsify the provenance they exist to provide.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `google_analytics` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`google_analytics_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Property ID**, **Service Account JSON (optional)**. The type dropdown shows the lowercase key **`google_analytics`**. **Major drift fixed:** the draft claimed GA "doesn't have a Test Connection button" — **false** (the button renders and returns *"Test not applicable for this type"* for HTTP-API sources). Also fixed: dropdown key, "Name" → "Connection Name", restored the **(optional)** on Service Account JSON (it IS optional), "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (GA4 service-account access) and `04/05` — need an end-to-end pipeline run to a destination warehouse.
