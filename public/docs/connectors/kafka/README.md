# Apache Kafka setup-guide screenshots

Referenced from `src/content/connectors/kafka.md` (source-only streaming connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `kafka` selected (three fields). Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only — no secrets (the structured form is PLAINTEXT-only). |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — Step-2 field labels verified against the live shipped UI (`kafka_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Bootstrap Servers** (required), **Topics (comma-separated)** (required), **Consumer Group ID** (**optional** — no asterisk). The type dropdown shows the lowercase key **`kafka`**. **Drift fixed:** the draft marked **Consumer Group ID as required** — it's optional in the shipped form. Also fixed: dropdown key, "Name" → "Connection Name", "Save" → "Create Connection", and softened the Test-Connection claim. The guide **correctly** documents that the structured form is PLAINTEXT-only and that SASL/SSL/mTLS goes through the **Use raw JSON config** escape hatch.

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (broker/topic notes) and `04/05` — need an end-to-end pipeline run to a destination warehouse.
