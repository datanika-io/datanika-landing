---
title: "How I Split Open-Source Core From Paid Cloud Without Forking the Codebase"
description: "Datanika's core is AGPL-3.0 open source. The billing layer is a private plugin. They never import each other. Here's the hooks-based architecture that keeps them separable."
date: 2026-04-11
author: "Datanika Team"
category: "engineering"
tags: ["open-core", "plugin-architecture", "monetization", "engineering", "hooks"]
---

Datanika's core is open source under AGPL-3.0. The billing layer — subscription management, quota enforcement, Paddle integration, usage metering — lives in a separate repo called `datanika-cloud` and is proprietary. **Core never imports cloud. Cloud imports core, but only to subscribe to events.**

There's no fork. There are no feature flags. There's no `if ENTERPRISE_EDITION:` branching inside core functions. Just a generic hooks system and a plugin that registers handlers at startup.

## The Problem With Conditional Branching

Most open-core projects get the boundary wrong. They have one codebase with enterprise features gated behind runtime checks:

```python
def create_connection(org_id: int, ...):
    if is_enterprise():
        check_quota(org_id)   # ← this line is the problem
    # ... actual business logic
```

That check creates a permanent coupling between core and the paid tier. Once you have one of those lines, you need them everywhere. Core now has to know about plans, quotas, and billing logic. The "open-source" version is cluttered with enterprise hooks that are dead code for most users. Contributors see billing logic in files they're trying to fix bugs in.

I didn't want that. I wanted a core that doesn't know billing exists, and a billing layer that watches from the outside.

## The Solution: A Generic Hook System

The whole boundary is ~30 lines of Python. Core ships a generic event emitter:

```python
# datanika/hooks.py
_handlers: dict[str, list[Callable]] = {}

def on(event: str, handler: Callable) -> None:
    _handlers.setdefault(event, []).append(handler)

def emit(event: str, **kwargs) -> None:
    for handler in _handlers.get(event, []):
        handler(**kwargs)
```

Services in core call `emit()` at specific checkpoints:

```python
# datanika/services/connection.py
from datanika.hooks import emit

async def create_connection(org_id: int, name: str, ...) -> Connection:
    emit("connection.before_create", org_id=org_id)   # ← anyone listening?
    # ... actual business logic
    return connection
```

The core doesn't know or care what `connection.before_create` means to downstream code. If no handler is registered, `emit()` is a no-op. The service moves on and creates the connection.

## The Plugin Side

The cloud plugin has one entry point — `init_cloud(app)` — called once at startup when the environment variable `DATANIKA_EDITION=cloud` is set:

```python
# datanika-cloud/datanika_cloud/plugin.py
from datanika.hooks import on
from datanika_cloud.billing.quota import (
    check_connection_quota, check_schedule_quota,
    check_seat_quota, check_run_quota, check_sso_quota,
)
from datanika_cloud.billing.meter import (
    handle_model_runs, handle_upload_runs, handle_transformation_run,
)

def init_cloud(app: rx.App) -> None:
    # Quota enforcement — reactive
    on("connection.before_create", check_connection_quota)
    on("schedule.before_create", check_schedule_quota)
    on("membership.before_create", check_seat_quota)
    on("run.before_execute", check_run_quota)
    on("sso_config.before_create", check_sso_quota)

    # Usage metering — reactive
    on("run.models_completed", handle_model_runs)
    on("run.upload_completed", handle_upload_runs)
    on("run.transformation_completed", handle_transformation_run)

    # ...
```

Eight lines register eight hook handlers. When a user tries to create a connection, the `check_connection_quota` handler gets called with the org ID. It looks up the org's plan, checks the connection count, and raises `QuotaExceededError` if they're at the limit. Core sees the exception propagate, rolls back, and returns an error to the user.

Core has no idea a plugin exists. It just called `emit("connection.before_create", org_id=42)` and got an exception back. It handles the exception the same way it would handle any other.

## The Additive Side

I need to be honest about one thing: the plugin doesn't _only_ react. It also adds things the core never had:

```python
def init_cloud(app: rx.App) -> None:
    # ... hook handlers above ...

    # Merge billing translations into core i18n cache
    register_translations(CLOUD_TRANSLATIONS)

    # Add a billing link to the sidebar
    extra_sidebar_links.append(("nav.billing", "/settings/billing", "credit-card"))

    # Register a Reflex page at /settings/billing
    app.add_page(billing_page, route="/settings/billing", ...)

    # Register a Paddle webhook route
    app._api.routes.append(webhook_route)
```

The i18n translations, the sidebar link, the billing page, and the webhook route are all additive — they're new surfaces, not modifications to existing core behavior. The core exposes extension points (`extra_sidebar_links`, `app._api.routes`, `app.add_page`) that any plugin could use. Cloud happens to be the only one using them today.

The mental model is: **core defines what's possible; plugins choose what to activate**. Quotas are a kind of activation — "hey, watch this event and block it if the org is over limit". UI additions are another kind — "hey, put this link in the sidebar". Neither requires modifying core code.

## Self-Hosted Gets Everything

Because the plugin only loads when `DATANIKA_EDITION=cloud` is set, self-hosted users running `docker compose up` get:

- All 32 connectors — PostgreSQL, BigQuery, Stripe, Salesforce, everything
- dbt transformations, tests, snapshots, packages
- The full visual pipeline builder
- Scheduling with cron + dependency DAGs
- Multi-org with RBAC and audit logging
- SSO (SAML + OIDC) — the code is in core, just not gated to a plan
- 9 languages
- The REST API

What they don't get:

- Paddle billing overlays
- Plan-based quota enforcement (they have no plans, so no limits)
- Usage metering to a central ledger

If you self-host, nothing is "locked". The quota handlers simply aren't registered, so there's nothing to check against. You get a platform without billing — which is exactly what self-hosted users want.

There's no "community edition" and "enterprise edition" distinction at the code level. There's only one codebase, and the plugin is either loaded or not.

## Why Not Feature Flags?

The obvious alternative is feature flags: one codebase, runtime checks. `if settings.billing_enabled: ...` everywhere you'd otherwise hook.

I considered it. Rejected it because:

1. **It doesn't separate the license**. The code is still in the same repo, still compiled into the same binary. If I want the billing logic to be proprietary, feature flags don't help.
2. **It couples unrelated concerns**. Every function that needs a quota check now imports from a billing module. The "open-source" part isn't really open-source — it depends on billing internals to decide whether to run them.
3. **It makes testing harder**. Every test has to mock or disable the billing flag. With a plugin, tests in core never see any billing code at all.
4. **It leaks into docs**. The OSS README has to explain feature flags a self-hosted user should never enable. Noise for contributors.

The hook system avoids all four. Core's tests run against a core without any handlers registered. They're testing the real, shipped behavior for OSS users. The plugin has its own test suite that registers handlers and verifies them in isolation.

## The One Rule

Getting the boundary right took me longer than the implementation. The rule I landed on, which I wrote on a sticky note and kept re-reading:

> **Core defines the events. Cloud chooses which ones matter.**

Core must never import from cloud. Cloud may only import from core's public interface — no reaching into private modules. If I find myself wanting to add a new hook _because_ cloud needs one, that's fine — it means the core probably has an extension point it should have exposed anyway. But I never add hooks that _only_ cloud uses without also documenting them as general extensibility.

This means core is genuinely usable by someone who forks it and writes a completely different plugin — for their own billing system, for custom observability, for an internal analytics layer. The hooks are generic, the events are stable, and the plugin pattern is reproducible.

## What's in Each Edition

For anyone curious about where the line falls:

| Feature | Open-core (AGPL) | Cloud plugin (private) |
|---------|------------------|------------------------|
| Pipeline builder, scheduling, dbt | ✅ | — |
| 32 connectors | ✅ | — |
| SSO (SAML + OIDC) code | ✅ | — |
| Notification channels | ✅ | — |
| REST API v1 | ✅ | — |
| Audit logging | ✅ | — |
| Paddle checkout overlay | — | ✅ |
| Plan model + Subscription model | — | ✅ |
| Usage ledger + hourly overage sync | — | ✅ |
| Quota enforcement | — | ✅ |
| Billing settings page | — | ✅ |
| Free / Pro / Enterprise plan records | — | ✅ |

Notice what's _not_ in the cloud plugin: SSO, notifications, RBAC, RESTful API. Those are in core. They're sometimes associated with "enterprise features" in other products, but Datanika treats them as basic platform functionality — if you want SSO and you're self-hosting, you get SSO. The plugin is purely about _commercial_ concerns (subscriptions, quotas, metering), not feature gating.

## Try It Both Ways

If you want to see the architecture in action:

- **Self-hosted (plugin off)**: [docker compose up](/docs/self-hosting) — all features, no billing
- **Cloud (plugin on)**: [app.datanika.io](https://app.datanika.io) — same features, plus subscription management
- **Pricing page for cloud**: [/pricing](/pricing) — Free / Pro / Enterprise tiers

And if you're building your own open-core product, the one thing I'd recommend is: start with the plugin boundary, not the features. Decide what "core" is going to mean, write down the rule, and don't break it even when it's tempting. Six months in, you'll either have a clean separation or a tangled mess — and the difference is 100% about whether you enforced the rule on day one.

Would love to hear how others handle open-core monetization. Open an [issue or discussion on GitHub](https://github.com/datanika-io/datanika-core/discussions) — I'm collecting notes for a follow-up post on the _business_ side of open-core, not just the technical one.

## Related

- [I Wrote a Full SaaS UI Without a Single Line of JavaScript](/blog/why-reflex) — the architecture choices that made this kind of boundary possible
- [I Designed Multi-Tenancy Wrong](/blog/multitenancy-mistake) — the same layering principle applied to the Postgres side
- [Self-Hosting Guide](/docs/self-hosting) — run the open-core edition on your own infrastructure
- [Pricing](/pricing) — what the cloud plugin adds on top
