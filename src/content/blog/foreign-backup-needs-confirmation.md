---
title: "A Backup from Another Organization Waits for Confirmation"
description: "A restore refuses a backup exported from another organization unless the caller confirms it. Matching the organization id is not enough. A missing slug is treated as foreign."
date: 2026-11-26
publishedAt: 2026-11-26
author: "Datanika Team"
category: "product"
tags: ["backup", "organizations", "security", "product"]
---

A backup file remembers the organization it was exported from. Restoring it into a different organization used to depend on the screen that uploaded the file. The import itself would write.

That is no longer a warning the caller can skip by calling the import directly. If the file names another organization, the import raises and writes nothing unless the caller passes an explicit confirmation that the person asked for the restore. Moving configuration between organizations is allowed. It is allowed after that confirmation, not before it.

## An id match is not a same-organization match

Two deployments can both have an organization whose id is 5. Comparing ids alone will call a file from somewhere else "the same organization." A same-organization answer now requires the slug as well. If the caller omits the slug, and the file names an organization, the file is foreign.

The name shown in the refusal is the exporting organization's name, then its slug, then its id.

## What this does not finish

A viewer export produces no file and sets an error the person can see. An admin export still runs. An overwrite restore still passes its connection test.

Those are the checks that shipped with the confirmation gate. They are not the rest of the backup issue. That issue stays open.

The file is checked against the [organization](/docs/organizations/) you are signed into. A self-hosted install keeps its own copy of those organizations, which is why [self-hosting](/docs/self-hosting/) and the [compose walk-through](/blog/self-hosting-datanika-docker-compose/) matter when a file moves between installs. Putting two tenants in one database is a different mistake, written up in [the multitenancy post](/blog/multitenancy-mistake/).
