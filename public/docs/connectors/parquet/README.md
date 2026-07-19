# Parquet setup-guide screenshots

Referenced from `src/content/connectors/parquet.md` (source-only file connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 1a | The **New Connection** form with `parquet` selected — the file-upload widget + **Or enter file path** input. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Path only — no secrets in this form. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`file_upload_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, the **Upload File** widget, and an **Or enter file path** input. The type dropdown shows the lowercase key **`parquet`**. **Major drift fixed:** the draft invented an in-form **footer-read / schema panel / preview** flow ("reads footer metadata and you get…", "preview the first 20 rows", "override per column in the Schema panel") — none exist on the form. Reframed the Parquet metadata behaviour as load-time (accurate), removed the fictional Schema panel, swapped the fictional `01a-upload-ui` image for the real `02`, and fixed the path label to **Or enter file path**.

## Not yet captured (deferred, not embedded in the guide)

- `03-first-run.png` — needs an end-to-end pipeline run to a destination warehouse. (No credentials screen — Parquet is a local file.)
