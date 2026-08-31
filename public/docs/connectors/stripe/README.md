# Stripe setup-guide screenshots

Referenced from `src/content/connectors/stripe.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `stripe` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |
| `04-first-run.png` | Step 4 | The **Data preview** on `/models/22`, the model detail page for the landed `customers` table: `Schema: stripecustomers`, **`Rows: 10`**, fifteen typed columns, and ten real customer rows (`Ridgeway Manufacturing` / Sheffield / GB, `Tanaka Logistics` / Osaka / JP, …) with `address__city`, `address__country`, `description`, `email`, `invoice_prefix`. Real Stripe Admin API → Postgres load on production, run 17, in the **prod-verify** org. `livemode` reads `False` in every row, which is correct and deliberate — this is a **test-mode** sandbox. **No credential on screen**; the preview is destination data. |

⚠️ **`Rows: 10` in this shot is a defect, not a small account.** The source held **15** customers. See below.

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

### 2026-08-31 — Step 4 captured, and it exposed silent data loss

Driven end-to-end on production in the **prod-verify** org (org 27):

- source connection **34** `stripeqasmoke`, type `stripe`, restricted **test** key from `secrets/qa-connectors.env` (`rk_test_…`, `livemode: false` confirmed against Stripe before any write)
- destination connection **28** `docswarehouse` (postgres)
- upload **18** `stripecustomers`, endpoints `customers` + `products` + `prices` (`charges` / `invoices` / `subscriptions` unticked — all empty)
- run **17** `success` / **18 rows** / 4.7 s → `/models/20` `products`, `/models/21` `prices`, `/models/22` `customers`
- capture is `/models/22` `customers`, **`Rows: 10`**

**Steps 2–4 of the guide were accurate** — the endpoint picker, the `34 — stripeqasmoke (stripe)` picker format, the `draft` status and the upload-named schema all matched. Nothing needed correcting.

🚨 **What the run exposed: a SaaS upload loads only the first page.** [core#823](https://github.com/datanika-io/datanika-core/issues/823).

| resource | in Stripe | landed |
|---|---|---|
| `customers` | **15** | **10** |
| `products` | 4 | 4 |
| `prices` | 4 | 4 |

`10 + 4 + 4 = 18`, the run's own row count. Stripe returned `"has_more": true` on the first page and nothing followed the cursor; `_build_saas_source` passes **no paginator** to `_rest_api_fallback` for any of the 16 SaaS connectors. The five missing customers were the **oldest**, so a reader eyeballing recent records would not notice.

🔑 **The Shopify capture done an hour earlier is not evidence against this.** It loaded completely only because its `products.json` carried **no `Link` header** — the store genuinely fit one page. Same loader, same absent paginator, different dataset size. **A connector smoke test on a small fixture account cannot detect this class**, which is why it survived.

### Fixture data

The sandbox was seeded for this capture on 2026-08-31: 15 customers, 4 products, 4 prices, all obviously fictional (`@…example` addresses, invented company names). Stripe **test mode**, `livemode: false` verified before writing. No charges, invoices or subscriptions were created, which is why those three endpoints were unticked.

## Not captured

- `01-credentials.png` — the Stripe restricted key is created in Stripe's own dashboard, which we do not control; the guide covers it in prose. Consistent with the `01-credentials` recommendation across all 36 guides.
- `03-configure-upload.png` / `05-schedule.png` — the upload and schedule forms are connector-agnostic and already shown in the CSV guide. Deliberately not duplicated.

### 2026-07-19 (Step 2)

Field labels verified against the live shipped UI (`stripe_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name** + a single **API Key (optional)** field. The type dropdown shows the lowercase key **`stripe`**. **Major drift fixed:** the draft claimed Stripe "doesn't expose a Test Connection button" — false. Also fixed: dropdown key, "Name" → "Connection Name", "API key" → "API Key (optional)", "Save" → "Create Connection".

⚠️ Still live: the **API Key (optional)** label carries a required marker, rendering **"API Key (optional) \*"**. One i18n string shared by 9 forms, 7 of which append `*` — [core#822](https://github.com/datanika-io/datanika-core/issues/822). The field is genuinely required for Stripe.

⚠️ The field's placeholder reads `sk_live_... or sk_test_...`, but Step 1 correctly tells you to create a **restricted** key (`rk_…`), which is what was used here and works. The placeholder is narrower than the guide; not filed, noted.
