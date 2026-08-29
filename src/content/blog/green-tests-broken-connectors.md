---
title: "2,300 Passing Tests and a CSV That Loaded One Row"
description: "Our file connector returned a directory listing instead of file contents, and every test passed. Here is why the suite could not have caught it, what else it was hiding, and the rule we now apply to every connector."
date: 2026-08-29
publishedAt: 2026-08-29
author: "Datanika Team"
category: "engineering"
tags: ["testing", "connectors", "dlt", "engineering", "open-source"]
---

Someone on the team went to take a screenshot of a first pipeline run. Twelve rows of `customers.csv`, into DuckDB — the [zero-credentials template](/templates/csv-to-duckdb/) our own [CSV guide](/docs/connectors/csv/) calls *"the first pipeline you ever run on Datanika."*

The run came back green. **One row landed.** Its columns were:

```
file_name, relative_path, file_url, mime_type, modification_date, size_in_bytes
```

Not one customer column. Not a name, not an email, not an ID. The connector had faithfully loaded a *description of the file* instead of the file.

At that moment the test suite was at roughly 2,300 tests, all passing, including a dedicated block of them for exactly this code path.

## Why the suite could not have failed

Here is the shape of every test we had for the file-source builder:

```python
@patch("datanika.services.dlt_runner.filesystem")
def test_build_csv_source(self, mock_fs):
    mock_fs.return_value = "csv_src"
    result = runner.build_source(conn, {"bucket_url": "s3://bucket/data/"})
    mock_fs.assert_called_once_with(bucket_url="s3://bucket/data/", file_glob="*")
    assert result == "csv_src"
```

Read the last two lines slowly. We assert that we called the library with the arguments we just passed in, and then we assert that the return value equals the string we ourselves told the mock to return.

**Both assertions are about our own typing.** Neither one can observe what the library actually does. `filesystem()` in dlt is a *lister* — it yields file metadata, and you are expected to pipe it through a transformer like `read_csv()` to get contents. We never added the transformer. There were zero occurrences of `read_csv`, `read_jsonl` or `read_parquet` anywhere in the package.

The mock happily played the part of a working connector, because a mock will play any part you write for it. The suite was not weak here, and it was not under-maintained. **It was structurally incapable of failing**, and it had been green for months on that basis.

That is the part worth sitting with. A failing test tells you something. A passing test tells you something *only if it could have failed*. We had 2,300 signals and no way to tell which of them carried information.

## So we went looking for the others

If one connector could be this broken behind green tests, the honest assumption is that others were too. So we stopped asking "do the tests pass" and started asking a different question for every connector: **has this one ever been proven to move a single row?**

Not "is it implemented." Not "is it covered." Has a row gone in one end and come out the other, against a real database, observed in the destination.

The answer for a lot of them was no. What that turned up:

**A glob matching zero files reported success.** Point a source at the wrong path, or an S3 prefix someone emptied, and you got a green run with zero rows in about four seconds. Wrong path, moved file, and correct-but-empty were indistinguishable. Test Connection couldn't help either — it returned *"Test not applicable for this type"* unconditionally for every non-database source, so a broken path tested exactly like a working one.

**DuckDB loads never reached the Data Catalog.** The `duckdb_engine` driver was missing from the image, and the failure was swallowed as *"Catalog sync failed (non-fatal)."* Both of our getting-started guides tell you to verify your first run by browsing the Catalog. For DuckDB, that had never once worked.

**Three warehouse destinations couldn't authenticate.** BigQuery, Databricks and Synapse stored credentials under the names *our* form used and handed them to dlt, which wanted different names — BigQuery stores `project` and `keyfile_json` where dlt expects `project_id`, `private_key` and `client_email`, and nothing parsed the keyfile at all. The translation layer covered SQL databases only. Nobody had noticed, because nobody had completed a run.

**[Kafka](/connectors/kafka/) subscribed to a topic that didn't exist.** The connection form stores topics as a comma-separated string. The builder did `topics if isinstance(topics, list) else [topics]` — so `orders,events` became a single topic named, literally, `orders,events`. It subscribed successfully. It consumed nothing, forever.

**[MongoDB](/connectors/mongodb/) looked for your user in the wrong database.** The database in a Mongo URI doubles as the auth database, so omitting `authSource` means "the user lives inside the database you're reading" — which is not where anyone puts it. Atlas, every managed provider, and every Docker setup using `MONGO_INITDB_ROOT_USERNAME` create users in `admin`. First connection attempt failed for basically everyone.

**And failure notifications had never fired.** This one is the sharpest, because we had [written a tutorial about it](/blog/slack-alerts-pipeline-failures/). The Slack, Telegram, email and webhook channels were all real, the `Run Failed` event was real, and the handler that formats the message was real. Nothing ever *emitted* the failed-run event. The branch was unreachable code, and had been since it shipped. It works now — but for a while the honest description of that feature was "a correctly implemented notification for an event that is never announced."

## The rule we apply now

Every one of those is fixed and live. But the fixes are less interesting than the rule that came out of it, which is now how we review connector work:

> **A connector is not done when its tests pass. It is done when a row has been observed in the destination.**

Concretely, three things changed.

**Probes run against the real thing.** Postgres, MySQL, MongoDB, Kafka and DuckDB now have tests that spin up a real container, load real rows, and query the destination to count them. Not the run status — the destination. A green run means the load finished, which is a different claim from "your data is there."

**Every fix ships with a probe we watched fail.** Before a fix lands, its test is run against the *broken* code and has to go red. This sounds obvious. It is also exactly the step that, had anyone taken it on the file connector, would have caught all of this months earlier — because the moment you feed that test a realistic listing-shaped payload, the assertion `result == "csv_src"` is revealed as meaningless.

**Known-broken connectors are pinned red, not skipped.** Where something can't be proven yet, it carries a strict expected-failure marker rather than a skip. A skip is silent forever. A strict marker fails the build the day the behaviour starts working, which forces someone to notice and remove it. **A test that starts passing should be an event, not a non-event.**

## What we still can't claim

The audit is not finished, and it would be a bad look to write this post and then round up.

- **Snowflake and Synapse are verified at the configuration layer only.** We check that the credentials we hand to dlt are the ones dlt declares it wants. Nothing has connected. No ODBC driver exists in our test environment, and a Snowflake trial signup was refused by their risk engine.
- **Google Analytics and Facebook Ads are implemented, not proven.** Both were built against the documented API shapes with no credentials anywhere, including in CI. Their first real run will be the actual test, and we would rather say that than let you find out.
- **Google Ads is row-proven against a local HTTP server**, not against Google. The parsing, flattening and auth headers are verified; the round trip to Google's own API is not.
- The tracking issue for the whole audit is **still open**. We are working through the remaining builders in the same way.

We would rather publish that list than a rounder number. If you are evaluating a data platform, the useful question is not how many connectors it claims — it is which of them anyone has watched move a row, and whether the vendor will tell you the difference.

## Why this is a post at all

There is an argument for not writing this one. It is a catalogue of our own bugs, some of them embarrassing, on the exact path a new user takes first.

We are writing it because the alternative is worse. If you self-host Datanika you can read every line of this in the commit history anyway — the issues are public, the fixes are public, and the test that couldn't fail is right there in the diff. An open-source project that only publishes its wins is asking you to trust a filtered feed of a repository you can just go read.

And the general lesson isn't ours alone. If you have a connector, an SDK wrapper, or any integration tested entirely by patching the library at the boundary, the odds are decent that your suite is asserting your own arguments back at you. The cheap check is to break the code on purpose and confirm something turns red. If nothing does, you don't have a test — you have a very long, very green description of what you intended.

---

*Datanika is an open-source platform that runs dlt extract-and-load and dbt-core transformations behind one UI, with [36 connectors](/connectors), scheduling and run history. [Self-host it](/docs/self-hosting/) or [start free](https://app.datanika.io/register).*
