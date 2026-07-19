# Oracle setup-guide screenshots

Referenced from `src/content/connectors/oracle.md`.

## Captured

| Filename | Step | Notes |
|---|---|---|
| `02-add-connection.png` | Step 2 | The **New Connection** form with `oracle` selected, showing the **service-name-first** UI: Connection Name, Host, Port (auto-fills `1521`), User, Password, **Database** (= service name), the service-name helper callout, and the **Connect by SID (legacy single-instance)** toggle (unchecked), plus **Test Connection** / **Create Connection**. Captured **2026-07-19** from a real `app.datanika.io` session in light theme (the app default for a new account). Demo values only; the password field renders masked. |

## Verification

`verified_by: product-ui` / `verified_date: 2026-07-19` — **re-captured** against the current live UI after core #341/#350 (promoted 2026-07-18) flipped Oracle to **service-name-first**. The **Database** field is now the Oracle **service name** (pluggable DB / RAC / Autonomous all work), with a **Connect by SID (legacy single-instance)** toggle for legacy single-instance SID connections; #329/#347 closed. This supersedes the 2026-07-17 shot, which showed the now-removed SID-only form. Guide prose was corrected by Infra ([landing#236]).

## Not yet captured (future enhancement, not embedded in the guide)

- `01-credentials.png` — a terminal shot of the `CREATE USER datanika_readonly` + `GRANT SELECT` sequence. Needs an Oracle instance.
- `04-first-run.png` — the **Runs** tab after a first successful sync. Needs an end-to-end pipeline run to a destination warehouse.
