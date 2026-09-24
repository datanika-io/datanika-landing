---
title: "SQLite, DuckDB and Parquet: When Test Connection Is Green and the Run Can't See the File"
description: "Datanika runs the web app and the worker as separate containers with separate filesystems. Test Connection looks from one; the load runs in the other. For a file-based source that means a green button and a failing run — and for a file-based destination it means the opposite. Here is the one command that tells them apart."
date: 2026-10-29
publishedAt: 2026-10-29
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "sqlite", "duckdb", "parquet", "self-hosting", "docker"]
---

Three of our connectors are, in the end, a path to a file: [SQLite](/docs/connectors/sqlite), [DuckDB](/docs/connectors/duckdb) and [Parquet](/docs/connectors/parquet). They need no credentials, no network and no provisioning, which makes them the fastest things in the catalogue to stand up — and it is exactly that absence of credentials that hides the one failure they all share.

It is not a bug in any of the three. It is a consequence of how a self-hosted Datanika is laid out, and once you can name it you can diagnose it in one command.

## Two containers, two filesystems

A self-hosted Datanika runs the web app (`app`) and the worker (`celery`) as **separate containers**. They do not share a filesystem unless you give them one.

The split of labour matters more than the split of storage:

- **The load runs in the worker.** Every pipeline run, every scheduled sync, every row that actually moves.
- **Test Connection, the Data preview, the SQL Editor and Models run in the web app.**

So the button you press to check a file is reachable is looking from a different machine than the one that will read it. For a connector with a hostname and a password that distinction is invisible — both containers dial the same database over the network. For a connector whose entire configuration is `/some/path`, it is the whole story.

## The same cause, two opposite symptoms

Here is the part worth internalising, because it means you cannot learn one symptom and be done.

**For a source, the check lies and the run fails.**

Mount your SQLite file into `app` only. Test Connection opens the file the web app can see, reads its table list, and goes **green**. Then the run executes in the worker, which has nothing at that path, and you get:

```
(sqlite3.OperationalError) unable to open database file
```

The [SQLite guide](/docs/connectors/sqlite) words this bluntly, and it is worth quoting the shape rather than the sentence: a green Test Connection does not mean the load will work, because the button is not answering the question it appears to answer.

Parquet's directory-watcher flow behaves the same way with a better-looking button. Test Connection there genuinely lists the directory and reports which files it matched, so a wrong path comes back **red** rather than passing silently — a real improvement. But it lists it *from the web app*. Mount the directory into `app` alone and it still tests green while every run fails.

**For a destination, the run succeeds and the UI lies.**

Now invert it. DuckDB is the only one of the three that is also a destination — it is a real analytical warehouse in a single file, and Datanika can build dbt models in it. Point a pipeline at a `.duckdb` file that only the **worker** can see and the run goes **green**, because the worker is the thing doing the writing. The data is genuinely there. But Models, the Data preview and the SQL Editor read from the web app, which sees nothing — so you get a successful pipeline and an empty-looking warehouse. Worse, a path inside a container rather than on a volume disappears the next time that container is replaced.

Same root cause. A source fails loudly after a false green; a destination succeeds quietly behind a false empty.

## The one command that settles it

Whatever the symptom, the question is always *do both containers see the same bytes at the same path* — and comparing checksums answers it in a way that listing the directory does not:

```bash
docker exec datanika-app    sha256sum /var/datanika/sources/app.sqlite
docker exec datanika-celery sha256sum /var/datanika/sources/app.sqlite
```

Read the three outcomes deliberately:

- **Two identical hashes.** The volume is shared. If the load still fails, it is not this — check file permissions.
- **Present in `app`, missing in `celery`.** This is the one to recognise on sight. It is precisely the state in which Test Connection succeeds and every run fails.
- **Missing in both.** The path is simply wrong, and you will get a red button too.

For a destination the file does not exist until the first run has written it, so use a probe file instead of a checksum — `touch` from one container and `ls` from the other.

Note what this command is *not*: `docker exec datanika-app ls` followed by clicking Test Connection. Both of those run in the web app. Two green checks from the same container are one green check.

## Mount it into both, and say so in the compose file

The fix is unexciting, which is the point:

```yaml
services:
  app:
    volumes:
      - source_files:/var/datanika/sources
  celery:
    volumes:
      - source_files:/var/datanika/sources
```

Then `docker compose up -d app celery`. Two details earn their place:

- **Use a named volume or a host bind mount**, not a directory created inside an image. A directory inside the image does not survive a rebuild, and each container gets its own copy.
- **Read-only is enough for a source.** Datanika never writes to a SQLite, Parquet or CSV source, so `:ro` on the bind mount costs nothing and removes a category of accident.

We hold our own guides to this: a connector guide that shows you how to make data reachable has to mount it into both containers, and a test in the landing repo parses the compose blocks in those guides and fails if one of them mounts a data path into a single service. That guard exists because four guides got it wrong at once, and the worst of them shipped a verification step that passed while the load failed.

## Which of the three you actually want

Since the file-shaped connectors are easy to confuse, the short version:

- **SQLite** — a source. Point at an existing application database and read it out.
- **Parquet** — a source. Upload one file, or watch a directory for recurring drops. It loads with no type inference, because the file header already declares every column's type. For the directory flow, the path you enter is a **directory** — not a file and not a glob; Datanika matches `*.parquet` inside whatever you type.
- **DuckDB** — both. A source, and the lowest-friction destination we have: no project, no trial, no credentials. It is single-writer by design, so point one pipeline at one file rather than five at the same one.

One honest limitation: DuckDB destinations are a **self-hosted** feature today. On Datanika Cloud there is no container of yours to mount a volume into, so use one of the credentialled warehouses there. That is tracked in the open, and the [DuckDB connector page](/connectors/duckdb) carries the current state.

## The general form

The reason this is worth a post rather than a troubleshooting entry is that the shape recurs well beyond file paths: **a check that runs in a different process from the work it is checking can only report on its own process.**

That is not a criticism of Test Connection. It is a genuinely useful button, and for the roughly thirty connectors that reach a service over the network it answers the question you meant. It is worth knowing which questions it cannot answer, and for a path on disk, *"can the worker read this"* is one of them.

When a check and the work it vouches for run in different places, find the one command that asks the same question from the side that matters — and run it there.
