---
title: "Set Up Slack Alerts for Pipeline Failures in 2 Minutes"
description: "Get notified in Slack when your data pipelines fail — with Datanika's built-in notification channels. No third-party tools required."
date: 2026-04-10
updatedDate: 2026-04-10
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "notifications", "slack", "monitoring"]
heroImage: "/logo.png"
---

## The Problem

Your data pipeline runs at 6 AM. It fails. Nobody notices until the analytics team asks why the dashboard is stale at 2 PM. Eight hours of broken data — and a lot of unnecessary fire-fighting.

This happens more than it should. Most pipeline tools either don't have alerting, or require you to wire up a separate monitoring stack (PagerDuty, Opsgenie, custom webhooks).

## The Solution

Datanika has built-in notification channels. Connect Slack (or Telegram, email, or any webhook) and get alerted the moment a run fails. Setup takes about 2 minutes.

## Step 1: Create a Slack Incoming Webhook

1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click **Create New App** > **From scratch**
3. Name it "Datanika Alerts", pick your workspace
4. Go to **Incoming Webhooks** > toggle it **On**
5. Click **Add New Webhook to Workspace**
6. Select the channel you want alerts in (e.g., `#data-alerts`)
7. Copy the webhook URL — it looks like `https://hooks.slack.com/services/T.../B.../xxx`

## Step 2: Add the Channel in Datanika

1. Go to **Settings** in the Datanika sidebar
2. Scroll to **Notification Channels**
3. Click **New Channel**
4. Configure:
   - **Name**: `Slack #data-alerts`
   - **Type**: Slack
   - **Webhook URL**: paste your Slack webhook URL
   - **Events**: select `Run Failed` (and optionally `Run Succeeded`)
5. Click **Create**

That's it. No YAML, no config files, no third-party integrations to manage.

## Step 3: Test It

Trigger a run manually (or wait for your next scheduled run). If it fails, you'll see a Slack message in your channel within seconds:

```
Pipeline "Build analytics" failed
Status: error
Duration: 45s
Error: relation "raw.customers" does not exist

View run: https://app.datanika.io/runs/42
```

## Other Channel Types

Slack not your thing? Datanika supports four notification channel types:

| Channel | Config | Best For |
|---------|--------|----------|
| **Slack** | Webhook URL | Team channels, instant visibility |
| **Telegram** | Bot token + Chat ID | Personal alerts, mobile-first |
| **Email** | Recipient address | Formal notifications, audit trail |
| **Webhook** | Any URL | Custom integrations (PagerDuty, Opsgenie, etc.) |

You can create multiple channels — for example, Slack for the team and email for the data lead.

### Telegram Setup

1. Create a bot via [@BotFather](https://t.me/BotFather) on Telegram
2. Get the bot token
3. Send a message to your bot, then get your chat ID from `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Add the channel in Datanika with type **Telegram**, paste the token and chat ID

### Webhook Setup

Point it at any URL. Datanika sends a POST with a JSON payload:

```json
{
  "event": "run.failed",
  "run_id": 42,
  "target_type": "pipeline",
  "target_name": "Build analytics",
  "status": "error",
  "duration_seconds": 45,
  "error": "relation \"raw.customers\" does not exist",
  "url": "https://app.datanika.io/runs/42"
}
```

Use this to integrate with PagerDuty, Opsgenie, Discord, Microsoft Teams, or any system that accepts webhooks.

## Via the API

You can also manage notification channels programmatically:

```bash
curl -X POST https://app.datanika.io/api/v1/notifications/channels \
  -H "Authorization: Bearer etf_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Slack #data-alerts",
    "channel_type": "slack",
    "config": {"webhook_url": "https://hooks.slack.com/services/..."},
    "events": ["run.failed"],
    "is_active": true
  }'
```

See the [API Reference](/api/reference) for the full notification channels API.

## Best Practices

- **Alert on failures, not successes** — success notifications create noise. Only enable `run.succeeded` for critical pipelines where you need confirmation.
- **Use a dedicated channel** — don't send pipeline alerts to `#general`. Create `#data-alerts` or `#pipeline-notifications`.
- **Add multiple channels** — Slack for the team, email for the data lead, webhook for your incident management tool.
- **Name channels descriptively** — "Slack #data-alerts" is better than "Slack notification".

## Try It

Notification channels are available on all plans, including Free. [Set up your first alert](https://app.datanika.io) in under 2 minutes.

Related:
- [Scheduling Guide](/docs/scheduling-guide) — automate pipeline runs
- [Runs & Monitoring](/docs/runs) — track execution history
- [API Reference](/api/reference) — manage channels programmatically
