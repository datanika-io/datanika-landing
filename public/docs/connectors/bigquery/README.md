# BigQuery setup-guide screenshots

This directory is referenced from `src/content/connectors/bigquery.md`. Until
the five screenshots below are captured from a real `app.datanika.io` session,
the guide will render with broken image placeholders.

## Required screenshots

| Filename | Step | What to capture |
|---|---|---|
| `01-credentials.png` | Step 1 | The **IAM & Admin → Service Accounts → Create** flow in the GCP Console, showing the `datanika-loader` service account with `BigQuery Data Editor` + `BigQuery Job User` roles granted. |
| `02-add-connection.png` | Step 2 | The **Connections → New connection** form in Datanika with BigQuery selected: GCP Project, Dataset, and Service Account JSON fields visible. **Blur/redact the JSON key.** |
| `03-configure-pipeline.png` | Step 3 | The **Configure pipeline** screen showing a source (e.g., PostgreSQL or Stripe) targeting BigQuery as the destination, with dataset name and table/write-disposition settings visible. |
| `04-first-run.png` | Step 4 | The **Runs** tab after a successful first run, showing per-table row counts for a pipeline landing data in BigQuery. |
| `05-schedule.png` | Step 5 | The **Schedule** modal/page with a cadence selected (e.g., `Daily at 03:00`). |

## Capture guidelines

- Use a **dedicated demo GCP project** — no production customer data in screenshots.
- **Redact secrets.** The service account JSON key must be blurred in every screenshot. Project IDs are fine to show if they're demo projects.
- Use the dark theme (default) so screenshots match the landing page.
- Target width: **1600 px**. Compress with `pngquant --quality 80-95`.
- Crop tightly around the relevant UI.

## Verification gate

Per `plans/product/PLAN_PRODUCT.md` the guide is considered "verified" only
after a human has actually walked through the flow end-to-end. When that
happens, update the frontmatter in `src/content/connectors/bigquery.md`:

```yaml
verified_by: "<your name or handle>"
verified_date: "YYYY-MM-DD"
```
