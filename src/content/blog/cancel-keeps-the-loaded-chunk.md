---
title: "Cancel Keeps the Chunk Already Loaded"
description: "A cancel that shows up between load chunks keeps the chunk already handed to the loader and drops the rest. A model invoke that is already running still finishes. This is not a harder stop than that."
date: 2026-11-20
publishedAt: 2026-11-20
author: "Datanika Team"
category: "product"
tags: ["pipelines", "runs", "loading", "product"]
---

Cancel used to mean two different things, and only one of them was true.

If the run had not started its work, it stopped before anything was read or written. If the work was already inside the load, the button could not cut it. The load ran to the end, and the run was then marked cancelled. That second sentence is what changed for loads.

## What a cancel does now

A load does not arrive as one opaque call. It arrives as chunks. When a cancel becomes visible between those chunks, the chunk already handed to the loader stays. The source generator is closed, so the next read does not happen. The destination row count is that partial load.

The dialog says the same thing: cancelling stops further loading, and data already written to the destination stays there.

A run that has not started still stops before anything is read or written. That pre-flight check is unchanged, and it is still the path that leaves zero destination rows.

## What it does not do

One dbt invoke is still one call. A model that is already running finishes. Later loads do not start.

The worker is not killed in the middle of a load. Killing it mid-load is the uncheckpointed state the cancellation spec rules out, and that rule still stands.

## What a re-run does with the partial rows

The rows that landed stay. Re-running the pipeline reloads from the source according to the pipeline's write disposition:

- replace overwrites the destination
- append duplicates the partial rows
- merge reconciles on the primary key

You are billed for what was processed before the run stopped.

This is the stop that ships for loads. It is not a promise that an in-flight model can be cut, and it is not a claim that every open cancellation issue is finished.

A [run](/docs/runs/) is the record of that one load. The [pipeline](/docs/pipelines/) is what you start again, and its [transformation](/docs/transformations/) is the dbt invoke that still finishes. Whether a schedule starts the next run is a separate question, covered in [what a declared cron actually honours](/blog/cron-declared-vs-honoured/).
