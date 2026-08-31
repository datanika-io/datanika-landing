# MongoDB setup-guide screenshots

Referenced from `src/content/connectors/mongodb.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `mongodb` selected (Port 27017). Captured 2026-07-18 from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-18` — Step-2 field labels verified against the live shipped UI (`mongodb_fields()` in `connection_config_fields.py` + `en.json` on `origin/master`). Shipped form: **Connection Name**, **Host**, **Port**, **User**, **Password**, **Database** (Database is required). The type dropdown shows the lowercase key **`mongodb`**. Both **Test Connection** and **Create Connection** buttons render. Guide drift fixed: dropdown key, added the **Test Connection** step, "Save" → "Create Connection".

### Re-verified 2026-08-31 — form driven live, found unchanged. `verified_date` deliberately NOT moved.

The **New Connection** form was opened on `app.datanika.io` with `mongodb` selected and inspected
field by field (nothing submitted; no connection created). It renders **six** inputs and no more:

| label | input id |
|---|---|
| Connection Name * | `cfg-name` |
| Host * | `cfg-host` |
| Port * | `cfg-port` (value prefills to `27017`) |
| User | `cfg-user` |
| Password | `cfg-password` |
| Database * | `cfg-database` |

Two corrections to the July note above: **Host, Port and Database are all marked required** (not
Database alone), and the Port field's *placeholder* is `5432` — `mongodb_fields()` reuses the shared
`connections.ph_port` string — though the prefilled value is the correct `27017`, so the placeholder
is visible only if a user clears the field.

**`auth_source` is NOT in this form, and that is not drift.** [core#550] added it to
`connection_schemas.py`, but `mongodb` is special-cased to `mongodb_fields()` in
`connection_config_fields.py`, which never renders it — the string appears zero times there, and
`ConnectionState` has no `form_auth_source` to bind to. Searched live across both `innerHTML` and
`innerText`: absent. This is [core#638], still open, and `mongodb.md` is correct to keep sending
readers to the **Use raw JSON config** checkbox.

`verified_date` stays **2026-07-18** on purpose. That stamp records a UI *capture*, and this pass took
none — the shipped image already shows this six-field form accurately. The stamp moves when somebody
photographs the form, not when somebody reads it.

[landing#394] was filed claiming a seven-field form and is closed as invalid. **Please do not refile
it from `connection_schemas.py`** — the schema has the field, the renderer does not.

[core#550]: https://github.com/datanika-io/datanika-core/issues/550
[core#638]: https://github.com/datanika-io/datanika-core/issues/638
[landing#394]: https://github.com/datanika-io/datanika-landing/issues/394

## Not yet captured (deferred, not embedded in the guide)

- `01-credentials.png` (Mongo user creation) and `04-first-run.png` — need an end-to-end pipeline run to a destination warehouse.
