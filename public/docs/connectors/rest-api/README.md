# REST API setup-guide screenshots

Referenced from `src/content/connectors/rest-api.md` (source-only API connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `rest_api` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |
| `04-first-run.png` | Step 4 | The **Data preview** on `/models/12`, the model detail page for the landed `github_labels` table: `Schema: githubissues`, nine typed columns, `Rows: 14`, and all fourteen rows with real values (`bug` / `d73a4a` / *"Something isn't working"*, `ci-failure`, `documentation`, …). Real public-API → Postgres load on production, run 15, in the **prod-verify** org. **No credentials on screen and none in the pipeline** — the source connection has an empty API Key, because the endpoint is unauthenticated. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

### 2026-08-31 — Step 4 captured, and the guide's endpoint instruction was falsified

Driven end-to-end on production in the **prod-verify** org (org 27), with zero credentials anywhere in the chain:

- source connection **32** `githubpublicapi`, type `rest_api`, Base URL `https://api.github.com`, **API Key blank**
- destination connection **28** `docswarehouse` (postgres)
- upload **16** `githubissues`, endpoints supplied through **Use raw JSON config**
- run **14** `success` / 123 rows / 11 s → tables `github_issues` (100 rows, 83 columns) + `github_issues__labels`
- run **15** `success` → table `github_labels`, catalog entry `/models/12`, **`Rows: 14`** in the live Data preview

The acceptance criterion this connector set for itself was met: **rows of real data read live from the destination, not a green run row.** The `Load first 100 rows` control on the model detail page issues a `SELECT` against the destination warehouse, so the fourteen rows in the shot are the fourteen rows in Postgres.

**Three things the guide asserted that this run falsified.** All three were invisible to the build, to every link check, and to reading the connector schema — only running it found them.

1. 🚨 **"Endpoints and pagination are set on the connection" was wrong, and it was guide-blocking.** There is no endpoint field on the `rest_api` connection and no endpoint selector anywhere. `DltRunner._build_rest_api_source` **requires** `dlt_config["resources"]` and raises `REST API source requires 'resources' list in dlt_config` without it. The only place to supply it is the **Use raw JSON config** box on the *upload* form. A reader following the old text reached a failing run with nowhere in the guide to fix it. Step 3 now carries a working config.
2. 🚨 **Editing the upload silently discards that config** — [core#803](https://github.com/datanika-io/datanika-core/issues/803), found here and filed. `_populate_form_from_upload` ends with an unconditional `form_use_raw_json = False` / `form_config = "{}"`, so **Edit** shows the checkbox off, and ticking it reveals `{}` rather than the stored config. Either save path writes a config with no `resources`. Observed live on upload 16, then confirmed in source. Documented as a workaround in the guide until it ships.
3. **A REST payload splits across tables, so the `Rows` figure exceeds the record count.** One `issues` resource produced `github_issues` *and* `github_issues__labels`, and `/runs` reported **123** for 100 issues. Worth saying, because a reader who requested 100 records and sees 123 will otherwise suspect a duplicate load.

**What the guide got right, re-verified against the renderer rather than the schema** (`PRODUCT_RULES.md` §1):

- The form ships exactly **three** fields plus the name — **Connection Name**, **Base URL**, **API Key (optional)**, **Extra Headers (optional, JSON)**. Read off the live DOM: four inputs, no more.
- **Test Connection** does return *"Test not applicable for this type"* for an HTTP-API source. The guide already said so; observed live.
- **Load Mode / Write Disposition / Source schema / Table names are hidden for a REST source.** Verified by the discriminating observation, not by absence: all four were **visible with no source selected** and **disappeared** the moment connection 32 was chosen.
- Upload name is stripped to letters and digits as you type; a new upload lands as `draft`; the destination schema is named after the upload (`githubissues`).

### 2026-07-19 (Step 2)

Field labels verified against the live shipped UI (`rest_api_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). **Major drift fixed:** the draft invented **four fields that don't exist** — an **Authentication type** selector, an **Auth token**, a **Username**, and a **Password** (basic-auth builder). Also fixed: dropdown key, "API base URL" → "Base URL", and the false "No Test Connection button" claim.

## Not captured

- `01-credentials.png` — not applicable. Credential acquisition for a REST API happens in a third-party console we do not control and that differs per API; the guide covers it in prose.
- `03-configure-upload.png` / `05-schedule.png` — the upload and schedule forms are connector-agnostic and already shown in the CSV guide. Deliberately not duplicated.
