# Shopify setup-guide screenshots

Referenced from `src/content/connectors/shopify.md` (source-only SaaS connector).

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `shopify` selected. Captured 2026-07-19 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the API Key field renders masked. |
| `04-first-run.png` | Step 4 | The **Data preview** on `/models/17`, the model detail page for the landed `products` table: `Schema: shopifyproducts`, `Rows: 17`, and every row a real Shopify product (`Gift Card`, `The 3p Fulfilled Snowboard`, `The Collection Snowboard: Hydrogen`, …) with `vendor`, `product_type`, `created_at` and `handle`. Real Shopify Admin API → Postgres load on production, run 16, in the **prod-verify** org. **No credential is on screen**: the preview is destination data, and the page carries no credential field. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-08-31`.

### 2026-08-31 — Step 4 captured end-to-end; the guide held up

Driven end-to-end on production in the **prod-verify** org (org 27):

- source connection **33** `shopifyqasmoke`, type `shopify`, store `datanika-qa-smoke`, token from `secrets/qa-connectors.env`
- destination connection **28** `docswarehouse` (postgres)
- upload **17** `shopifyproducts`, endpoints `products` + `customers` (`orders` unticked — the store has none)
- run **16** `success` / **109 rows** / 39 s → seven tables, catalog entries `/models/13`–`/models/19`
- capture is `/models/17` `products`, **`Rows: 17`**, read live from the destination

**This guide was accurate.** Unlike `rest-api`, every instruction survived execution: the endpoint picker exists and ships all three boxes ticked, the pickers really do read `33 — shopifyqasmoke (shopify)`, the upload really does land as `draft`, and the destination schema really is named after the upload. Nothing in Steps 2–4 needed correcting.

**Two things added because running it raised them:**

1. **The `Rows` figure is not the record count, and the gap is wide enough to look like a bug.** 109 rows for 17 products and 3 customers — nested `variants` / `images` / `options` each become their own table. Reconciled exactly: 17 + 26 + 18 + 17 + 26 + 3 + 2 = 109. Now stated in Step 4.
2. **`Test Connection` returns *success green* for a credential it never checked.** `ConnectionService.test_connection` short-circuits on `_NON_DB_TYPES` with a bare `return True, "Test not applicable for this type"`. Verified live: a **deliberately fabricated token** against a **nonexistent store** produced that same line in `rgba(0, 113, 63, 0.87)`. Step 2's callout now says to read it as *"not tested"*. Filed against core — it covers **20 connector types**, i.e. every SaaS/API source, which are exactly the ones whose credentials expire.

⚠️ **A caution for the next capture, because it cost time here.** `grep -o '"id":' | wc -l` on a Shopify payload counts **nested** variant/image/option ids and reported **94 products** for a store holding **17**. That read as a 5× data-loss bug in the loader and was purely an artifact of the probe. Count with a JSON parser (`len(d['products'])`), never by grepping a key name.

### Corrections to this file's own earlier claims

- ❌ **The "doubled asterisk" note was retired 2026-08-31 — the bug is fixed.** This file previously flagged *"the **Store Name** label renders a doubled asterisk (`Store Name * *`)"*. `en.json` now holds `"connections.store_name": "Store Name"` with no trailing asterisk, and the live DOM reads **`Store Name *`**. Verified both ways.
- ⚠️ **Still live, and different from the above:** `"connections.api_key": "API Key (optional)"` is one string shared by **9** connector forms, **7 of which append `" *"`** — so Shopify's field renders **"API Key (optional) \*"**, marked optional and required at once. The key is genuinely required here (`DltRunner` raises `Shopify source requires 'api_key' and 'store'` without it). Filed against core.

### 2026-07-19 (Step 2)

Field labels verified against the live shipped UI (`shopify_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **API Key (optional)**, **Store Name**. The type dropdown shows the lowercase key **`shopify`**. **Major drift fixed:** the draft claimed "No Test Connection button" — false. Also fixed: dropdown key, added **Connection Name**, "API Key" → "API Key (optional)", **"Store" → "Store Name"**, "Save" → "Create Connection".

## Not captured

- `01-credentials.png` — not applicable. The Shopify custom-app token is created in Shopify's own admin, which we do not control; the guide covers it in prose. Consistent with the `01-credentials` recommendation across all 36 guides.
- `03-configure-upload.png` / `05-schedule.png` — the upload and schedule forms are connector-agnostic and already shown in the CSV guide. Deliberately not duplicated.
