# S3 setup-guide screenshots

Referenced from `src/content/connectors/s3.md` (source-only connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `s3` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the AWS Secret Access Key field is empty. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`s3_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Bucket URL**, **AWS Access Key ID**, **AWS Secret Access Key**, **Region**, **Endpoint URL (optional)**. The type dropdown shows the lowercase key **`s3`**. Both **Test Connection** and **Create Connection** buttons render. The draft's field text was accurate; fixed: dropdown key, added the **Connection Name** field + a **Test Connection** step.

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (AWS IAM user) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
