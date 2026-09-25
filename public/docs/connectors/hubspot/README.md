# HubSpot setup-guide screenshots

Referenced from `src/content/connectors/hubspot.md` (source-only SaaS connector).

> [!WARNING]
> **Superseded observation - 2026-09-07.** The notes below record what was seen at
> each entry's `verified_date`. Any statement here that **Test Connection** returns
> *"Test not applicable for this type"* was true when captured and is **not true now**: core#821 retired
> that verdict, and on production today the string survives only in two source
> comments describing the removed behaviour. The button now either makes a real
> credential probe, really lists a file location, or returns a neutral *not tested*
> verdict carrying its own reason. The current wording lives in
> `src/content/connectors/hubspot.md` and is guarded by
> `tests/test-connection-copy.test.ts`.
>
> The observations are deliberately left as written. They are a dated record, and
> editing them would falsify the provenance they exist to provide.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `hubspot` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |
| `03-configure-upload.png` | Step 3 | The **New Upload** form configured for a HubSpot source: name `hubspotdailysync`, source `6 — HubSpot Contacts Walk (hubspot)`, destination `7 — Local Postgres Destination (postgres)`, and the **Select endpoints to load** checkboxes `companies` / `contacts` / `deals` all ticked. The SQL-only controls (Load Mode, Write Disposition, Source schema, Table names) are **absent**, which is the point of the shot. Captured 2026-09-25. |
| `05-schedule.png` | Step 5 | The **New Schedule** form filled for that upload: target type `upload`, target name `hubspotdailysync`, cron `0 3 * * *`, timezone `UTC`. **Deliberately not submitted** — an Active schedule fires real runs, and this shot's job is to show the four fields. |
| `04-first-run.png` | Step 4 | The **Data preview** on `/models/10`, the model detail page for the landed `contacts` table: `Schema: hubspot_contacts_first_run`, `Origin: HubSpot Contacts First Run`, thirteen typed columns and **`Rows: 2`** with both rows shown. `Load first 100 rows` runs a live `SELECT` against the destination connection, so the image is evidence about the warehouse rather than about a status badge. Real HubSpot CRM API → Postgres load, captured 2026-09-23. **No credential on screen** (capture gate below). |

## Verification

`verified_by: product-ui` / `verified_date: 2026-09-25`.

### 2026-09-25 — Steps 3 and 5, and one guide claim the walk refuted

Driven on the isolated local stack (`wt-product`) against the **same org 7** the 2026-09-23 walk
built, so both shots depict the connections that produced `04-first-run.png` rather than a staged
set. Upload **4** `hubspotdailysync` was created for these two shots.

**Image fidelity, measured rather than assumed.** The stack's image was rebuilt from the core
worktree at `origin/dev` immediately before the capture, and afterwards every file under
`datanika/ui/` and `datanika/i18n/` — **81 files** — was compared between the running container and
`origin/dev`, CR-stripped on both sides: **zero content differences**, with a forced mismatch as the
control. `git diff --name-only origin/master origin/dev -- datanika/ui datanika/i18n` was **empty**
at capture time, so these shots are production's rendering and not a dev-only preview.
⚠️ The first attempt at that comparison measured **line endings**, not content — the image carries
CRLF from a Windows worktree while git blobs are LF, so a raw `sha256sum` reported *every* file as
different. Strip CR on both sides or the instrument answers a different question.

**🔴 A guide claim was wrong and the walk is what found it.** Step 3 said the upload name is
*"letters and digits only — anything else is stripped as you type"*. Measured on the form:
`hubspot-daily-sync` → `hubspotdailysync` (the example was right), but `HubSpot Daily Sync` is kept
**verbatim**. The sanitiser is `UploadState.set_form_name`, `re.sub(r"[^a-zA-Z0-9 ]", "", value)` —
**the space is inside the keep-class.** The corroborating artifact was already on the page: upload
**3** is named `HubSpot Contacts First Run`, with spaces, created through this same form.
*A rule and its example can disagree, and the example is the half that gets checked.*

**Also found, and now in the guide:** the **Target name** field on `/schedules` offers a typeahead of
existing target names. Its dropdown covered the Cron field in the first `05-schedule.png` attempt,
which is why the shot asserts the cron input's box is inside the card before firing.

**Capture gate (`docs/PRODUCT_RULES.md` §4 and §4a), run before each shot rather than after.**
`/uploads`: 3 inputs, 0 credential-shaped and non-empty, no `type="password"` with a value.
`/schedules`: 3 inputs, same result. The predicate was driven both ways in the same call — it fires
on a synthetic `access_token` and stays silent on `Target name` — because a gate that matches nothing
passes everything. **§4a, the data half:** neither page renders destination rows; `td` cells
containing `@` were **0** on `/uploads` (6 cells) and the schedule page had no table at all. That
matters here specifically: the 2026-09-23 shot on this same connector passed §4 cleanly while
rendering every contact's email, which is what §4a was written for.

**Claims confirmed, not merely assumed:** the endpoint checkboxes render `companies`/`contacts`/`deals`
all `checked`; the SQL-only controls are absent for a SaaS source; each connection picker lists
entries as `<id> — <name> (<type>)`; the destination picker offers only loadable types (postgres
only, hubspot filtered out); a created upload lands as `draft`. **Not re-measured this round:** that a
schedule "lands as Active" — the basis is code (`ScheduleState.is_active` defaults `True` and the
create path passes `is_active: True`), not a UI observation, because submitting would have armed a
real nightly run against the live HubSpot token.

### 2026-09-23 — Step 4, driven end to end

[landing#395](https://github.com/datanika-io/datanika-landing/issues/395)'s standing criterion is **rows of real data in the destination, verified in the destination** — never a green run row. The reason is that a green run has twice been wrong: [core#492](https://github.com/datanika-io/datanika-core/issues/492) (file sources loaded a listing of files, not their contents, and reported `success`) and [core#493](https://github.com/datanika-io/datanika-core/issues/493) (a zero-match glob also completes as `success`).

Driven in a **fresh signup** on an isolated local stack, so nothing pre-existing was visible to it and every artifact was built for this capture:

| artifact | id |
|---|---|
| source connection | **6** `HubSpot Contacts Walk` (`hubspot`) |
| destination connection | **7** `Local Postgres Destination` (`postgres`) |
| upload | **3** `HubSpot Contacts First Run`, all three endpoints ticked |
| run | **4**, `UPLOAD`, `SUCCESS` |
| model | **10**, `contacts` in schema `hubspot_contacts_first_run` |

**Both sides measured, not inferred.**

- **Source**, HubSpot CRM v3, each with negative controls: `contacts` **200 / 2 results**, `companies` **200 / 0**, `deals` **200 / 0**. No `Authorization` header → **401**; an obviously invalid token → **401**. So the 200s are authenticated reads, not a world-readable resource.
- **Destination**, queried directly in Postgres rather than through the app: `hubspot_contacts_first_run.contacts` = **2 rows**, `id` non-null on both, `_dlt_loads` status `0`. Columns are genuine HubSpot CRM properties (`properties__email`, `properties__firstname`, `properties__lastname`, `properties__createdate`, `properties__hs_object_id`) — **not** the `file_name` / `size_in_bytes` shape core#492 produced.
- **Negative control on the destination**: `SELECT count(*) FROM hubspot_contacts_first_run.companies` **errors** (`relation does not exist`) rather than returning `0`, so "the table is empty" and "the table was never created" are distinguishable readings.

**Source count equals destination count (2 = 2).** The load moved everything the account held.

### 🚨 Two endpoints were ticked and produced no table — and that is correct

All three endpoints are ticked by default and all three were fetched. `companies` and `deals` each returned **0 results**, and dlt creates no destination table for a resource that yields no rows. So a complete, correct HubSpot load can land **one** table while the form showed **three** ticked boxes.

This is the moment a reader concludes the load is broken, so it is called out in the guide's Step 4. It is the inverse of the core#492/#493 failure — there a green run hid missing data; here an *honest* green run looks like missing data.

### Capture gate

Run at the moment of capture, per `docs/PRODUCT_RULES.md` §4 in datanika-core: 4 inputs on the page, one non-empty (the `dbt Config (JSON)` textarea holding `{}`), `anyPasswordNonEmpty: false`.

**A second gate was needed that §4 does not currently describe, and it is the one that mattered here.** §4 protects against a credential in an *input*. This shot's subject is **destination data**, which no input gate can see. The preview renders `properties__email`, `properties__firstname` and `properties__lastname` for every contact in the account — so a real customer list would have been published to a public repository by a capture that passed §4 cleanly.

Classified before shooting, printing domains and booleans only and never a local-part or a name:

- rows on a non-`hubspot.com` domain: **0**
- founder's own address present: **false**
- negative control (rows on a fabricated domain): **0**, so the predicate discriminates

Both rows are HubSpot's own seeded sample contacts (`@hubspot.com`, surnames ending `(Sample Contact)`). **A HubSpot account holding real contacts must not be captured this way.**

### 2026-07-19 — Step 2

Step-2 field labels verified against the live shipped UI (`saas_api_key_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name** + a single **API Key (optional)** field. The type dropdown shows the lowercase key **`hubspot`**. **Major drift fixed:** the draft claimed "No Test Connection button" — **false** (the button renders and returns *"Test not applicable for this type"* for HTTP-API sources). Also fixed: dropdown key, added the missing **Connection Name** field, "API Key" → "API Key (optional)", "Save" → "Create Connection".

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (HubSpot private-app token) — a screenshot of **HubSpot's own admin console**, which we do not control and whose staleness we would then own. See [landing#395](https://github.com/datanika-io/datanika-landing/issues/395): the standing recommendation is prose-only for third-party consoles.
- `03-configure-upload.png` and `05-schedule.png` — the SaaS-source upload form and the schedule form. Both are capturable now that the walk exists; neither was in this pass's scope.

> **`04-first-run.png` is NOT reusable in another connector's guide.** It names `Schema: hubspot_contacts_first_run` and shows HubSpot CRM property columns, so dropping it elsewhere would caption a HubSpot load as something else — the precise failure [landing#395](https://github.com/datanika-io/datanika-landing/issues/395) exists to stop. Capture your own, from your own run.
