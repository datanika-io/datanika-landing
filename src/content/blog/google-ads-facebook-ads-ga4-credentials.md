---
title: "Google Ads, Facebook Ads and Google Analytics: Three Credential Models, and Numbers That Change After You Load Them"
description: "The hard part of a marketing warehouse is not the pipeline, it is the paperwork — and the two Google products want opposite credentials. What each platform actually asks for, which step has a queue in front of it, and why yesterday's ad numbers are still provisional."
date: 2026-10-31
publishedAt: 2026-10-31
author: "Datanika Team"
category: "tutorial"
tags: ["tutorial", "google-ads", "facebook-ads", "google-analytics", "attribution"]
---

A marketing warehouse sounds like three connectors and an afternoon. In practice the connectors are the easy part. What decides your timeline is that [Google Ads](/docs/connectors/google-ads), [Facebook Ads](/docs/connectors/facebook-ads) and [Google Analytics](/docs/connectors/google-analytics) each authenticate in a completely different way, and one of the three has an approval queue in front of it that you do not control.

This post is the shape of that work before you start it, so the surprises arrive on day one instead of day nine.

## The two Google products want opposite credentials

This is the genuinely counter-intuitive one, and people lose an afternoon to it because the reasonable assumption is wrong.

**Google Analytics 4 wants a service account.** You create one in Google Cloud, download a JSON key, and then — separately — grant that service account's email the **Viewer** role on the GA4 property. Standard machine-to-machine Google.

**Google Ads specifically does not.** Datanika authenticates as *you*, with an ordinary OAuth user credential. That is not a design preference: a service account reaching the Google Ads API additionally requires Workspace domain-wide delegation, which most people cannot arrange on their own domain. The user-credential path is the one that actually works.

So the same vendor, in two adjacent products, on the same afternoon, needs two different kinds of identity. Knowing that in advance is worth more than any amount of retrying.

**Facebook Ads** is a third model again: a **System User token** from the Meta Business side, long-lived and scoped to specific ad accounts.

Three platforms, three credential models, no transferable muscle memory.

## The developer token is the long pole

Every Google Ads API request carries a **developer token**, and Datanika does not hold one on your behalf — you bring your own, exactly as you bring a service-account key for BigQuery. Your data stays under your own Google account and your own quota, and the cost of that is real paperwork:

- The token comes from a Google Ads **manager account (MCC)**, not an ordinary Ads account. If you do not have a manager account, creating one is step zero.
- Google approves access on **its own timetable**. There is no way to expedite it from your side or ours.
- Google usually grants **one developer token per company**. If anyone in your organisation already uses the Ads API, reuse that token rather than applying again — a second application is the slow way to get the answer you already have.

The practical scheduling advice: **apply for the token first, then build everything else while you wait.** The connection saves fine with a test-level token, and it is the first run against a production customer ID that fails until Basic access lands. There is no reason for the other two platforms — or your models — to sit idle behind Google's review queue.

One small thing that trips people up at the last step: the customer ID is the 10-digit number at the top of the Google Ads UI, shown as `123-456-7890`. Paste it with hyphens or without; Datanika strips them for you.

## Test Connection answers a different question for each of them

Because the credential models differ, so does what the button can tell you — and for GA4 it deliberately refuses to tell you anything.

A GA4 connection has **two independent things that can be wrong**: the service-account key can be invalid, and the property grant can be missing. The key alone proves nothing, because the credential has to be exchanged for an OAuth token before any property is ever named. So Test Connection returns a neutral **not tested** verdict that says so, rather than a green or a red.

That is the right call, and it is the same principle the rest of the product follows: reporting an unverified connection as working and reporting it as failed are the same lie told in opposite directions. **The first real verification is the first pipeline run** — and if the service account lacks Viewer on the property, that run fails immediately with a clear permission error rather than a vague one.

The practical consequence: for GA4, do not treat the connection screen as the checkpoint. Run it once, small, and read the run.

## Why yesterday's numbers are still moving

Now the part that surprises people after the pipelines are green, and it is not a Datanika behaviour — it is how the ad platforms work.

Ad platforms attribute conversions over a **lookback window**. Facebook's default is 7-day click and 1-day view. A conversion that happens today can be attributed to an impression from six days ago, which means **the row for six days ago changes after you have already loaded it**. The same is true, with different windows and different models, on Google Ads.

Three consequences worth designing for rather than discovering:

1. **Recent days are provisional.** A dashboard that presents the last week as settled fact will be quietly wrong every morning. Mark the window, or exclude it from anything that gets forwarded to a human as final.
2. **You cannot sum across platforms.** Each platform attributes *to itself*, on its own model and window. Adding Google Ads conversions to Facebook Ads conversions double-counts every customer both touched. Cross-channel attribution is a modelling decision you make deliberately in [your transformations](/docs/transformations) — it is not something the load can hand you.
3. **Disagreement is the normal state, not a data-quality incident.** The point of landing all three in one warehouse is not to make the numbers agree. It is to be able to *see* how they disagree, with the raw rows in front of you, instead of comparing three vendor dashboards that will never reconcile by construction.

That third one is the whole argument for doing this at all. Three tabs give you three confident, mutually incompatible answers and no way to interrogate any of them.

## What to actually do, in order

1. **Apply for the Google Ads developer token.** It is the only step with someone else's queue in it. Do it first.
2. **Wire up Google Analytics.** Service account, JSON key, Viewer on the property, then a small first run to verify — because the connection screen will honestly decline to.
3. **Wire up Facebook Ads.** System User token scoped to the ad accounts you care about. The [connector reference](/connectors/facebook-ads) lists the supported breakdowns, metrics and attribution windows.
4. **Finish Google Ads** when the token clears, and point it at a GAQL query — campaign performance by day works out of the box.
5. **Model last.** Decide your own attribution rule once, in SQL you can read, instead of inheriting three vendors' rules by accident.

The pipelines are the afternoon. The identity model is the week. Plan for the second one and the first takes care of itself.
