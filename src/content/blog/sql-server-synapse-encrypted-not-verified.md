---
title: "SQL Server and Azure Synapse: the Connection Is Encrypted, the Certificate Is Not Verified"
description: "Datanika requires an encrypted session to SQL Server and Azure Synapse in both directions, and does not verify the server's certificate. Those are two different guarantees, and a vendor that gives you one checkmark for both is not telling you which you got."
date: 2026-10-05
publishedAt: 2026-10-05
author: "Datanika Team"
category: "product"
tags: ["product", "mssql", "synapse", "security", "transport-encryption"]
---

"Is the connection encrypted?" and "do you know who is on the other end of it?" are two different questions. Most vendor security pages answer the first and let you assume the second. For SQL Server and Azure Synapse, our answer is that the first is yes and **the second is no**, and this post is why we say it in those words instead of printing a padlock.

## What is true

Datanika talks to SQL Server through the open-source FreeTDS driver, and the driver configuration we ship **requires** an encrypted session. That applies in both directions: when Datanika reads from SQL Server — Test Connection and uploads — and when it loads into SQL Server, including transformations that run against the connection. There is no setting that turns it off, which is deliberate.

Azure Synapse goes through the same driver, with the same requirement. Synapse also requires encryption at its own end.

What the driver does **not** do is verify the server's certificate. SQL Server presents a self-signed certificate unless you install one, and that is accepted as-is. In practice this means the setup step you might expect — installing a CA-signed certificate so the client will trust it — is not something you need to do before a connection will work.

## What that buys, and what it does not

It is worth being precise, because the gap between the two is where a security review actually lives.

**Encryption without verification protects the data on the wire.** Someone who can passively observe the network path between Datanika and your database — a shared segment, a mirrored port, a compromised switch — sees ciphertext rather than your customer table.

**It does not prove the server is yours.** Nothing in the handshake ties that certificate to your host. An attacker positioned *on* the network path, who can answer where your server would have answered, can present their own certificate and the client will accept it. The session with them is beautifully encrypted.

Those are genuinely different threat models. Passive observation is common and cheap; on-path impersonation is rarer and requires a foothold you would have other problems about. But "encrypted" on its own does not distinguish them, and we would rather you knew which one you have before you sign something that says you do.

The practical consequence: treat the network path as part of your control surface. A private link, a VPN, or a peered network between Datanika and the database is what closes the second gap today — not a setting in our connection form.

## Two rows, two bases — and they are not the same

The [trust page](/trust) carries a per-connector table with a column most such tables do not have: **how we know**. The SQL Server and Synapse rows read the same in the first two columns and differ in the third.

| | Connection | Certificate | Basis |
| --- | --- | --- | --- |
| SQL Server | Encrypted. The driver configuration we ship requires it, in both directions. | Not verified | **Measured** |
| Azure Synapse | Encrypted, through the same driver as SQL Server. Synapse requires encryption at its end as well. | Not verified | **Reasoned.** Measured against SQL Server, not against a Synapse workspace. |

We have not put a Synapse workspace on the other end of that driver and read the result. We have measured SQL Server, and Synapse uses the same driver with the same configuration, so the conclusion follows — but following from a measurement is not the same as being one, and collapsing the two would make the table say something we have not earned.

If that distinction reads as excessive, consider what the alternative looks like from your side: a table where every row says "encrypted" and you cannot tell which ones anybody checked. The column exists so that the rows we *have* checked mean something.

## Why the rows moved rather than the wording

Until 2026-09-20 our policy documents said that all data in transit was encrypted. For the database connectors that was not true of every row, and SQL Server and Synapse were among the ones it was wrong about.

There were two ways to fix that. One was to soften the sentence on the legal pages. The other was to make the product match the sentence and then say precisely what changed. We did the second: the driver configuration that requires encryption ships in the image, and the table moved these two connectors from the honest-but-unflattering column to this one. The [SQL Server setup guide](/docs/connectors/mssql) and the [Synapse setup guide](/docs/connectors/synapse) carry the same callout, in the same words, next to the step where it matters.

That is the general rule we try to hold to: when the page and the product disagree, which one moves is a decision rather than a reflex. For a promise worth keeping, the product moves.

## The shape this shares with other connectors

A theme runs through most of our connector work: a single green signal usually certifies something narrower than a reader assumes. [ClickHouse's connection test speaks one of the two protocols a load uses](/blog/clickhouse-two-protocols-one-test/). A padlock icon covers one of the two questions a security review asks.

Neither is a defect to hide. Both are facts worth printing next to the thing they qualify, so nobody discovers the boundary at the worst possible moment.

## Related

- [SQL Server setup guide](/docs/connectors/mssql) — connection steps, grants, and the encryption callout in place
- [Azure Synapse setup guide](/docs/connectors/synapse) — the same, for a Synapse SQL endpoint
- [Trust page](/trust) — the full per-connector transport table, with the basis for each row
