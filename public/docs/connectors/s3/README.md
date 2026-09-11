# S3 setup-guide screenshots

Referenced from `src/content/connectors/s3.md` (source-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `s3` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the AWS Secret Access Key field is empty. |

## Verification

> **`verified_date` is `null`, permanently, and that is a correction rather than a regression.**
> Recorded 2026-09-11 under `docs/specs/SPEC_CONNECTOR_GUIDE_VERIFICATION.md` (Product, 2026-09-10),
> which defines *verified* as **a named person having completed a real connection and a run** using
> this guide. That has not happened for `s3`, and it currently **cannot**: core withdrew the
> connector ([core#863] — `s3fs` left `uv.lock`, so `fsspec.get_filesystem_class("s3")` raises
> `ImportError`), so `s3` is not creatable in the product and no walk is possible.
>
> This guide is therefore **Tier 3 — an accepted gap**, not a backlog item. Nobody should attempt
> this capture and conclude the product is broken; it is withdrawn by decision.
>
> ⚠️ **The page stays published on purpose and must not be deleted** —
> `tests/connector-availability.test.ts` owns that rule and has a *Why the page stays* section. Only
> the verification metadata changed here; nothing about what the page serves.
>
> ⚠️ **`draft-pending-verification` is the closest token the vocabulary has, and it slightly
> overstates the situation** — it reads as *queued*, whereas this is *not walkable until the
> connector returns*. Product owns that vocabulary; if Tier 3 should carry a distinct value, that is
> their call, not one to invent here.
>
> [core#863]: https://github.com/datanika-io/datanika-core/issues/863

**What was actually checked on 2026-07-19 — preserved, because it was real work and is still true
of the shipped form.** It was **field parity against the UI source**, not a connection and not a
run, which is precisely the distinction the contract now draws:

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`s3_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Bucket URL**, **AWS Access Key ID**, **AWS Secret Access Key**, **Region**, **Endpoint URL (optional)**. The type dropdown shows the lowercase key **`s3`**. Both **Test Connection** and **Create Connection** buttons render. The draft's field text was accurate; fixed: dropdown key, added the **Connection Name** field + a **Test Connection** step.

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (AWS IAM user) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
