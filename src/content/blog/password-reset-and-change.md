---
title: "Changelog: password reset and password change are live"
description: "You can now reset a forgotten password by email and change your password from Settings. Here is exactly what shipped, how the reset token is designed, and what it deliberately does not do."
date: 2026-09-01
publishedAt: 2026-09-01
author: "Datanika Team"
category: "changelog"
tags: ["changelog", "security", "authentication", "self-hosting"]
---

Until this release, Datanika had no way to reset a forgotten password and no way to change one. Not a hidden flow, not an admin-only flow — it did not exist. That is now fixed, and this is the changelog entry rather than a launch announcement, because a missing password reset is not a feature you get to celebrate shipping.

## What shipped

- **`/forgot-password`** — enter your email, receive a reset link.
- **`/reset-password`** — set a new password from that link.
- **Change your password from Settings**, with your current password as confirmation.

## How the reset token works

The interesting part of a password reset is not the form; it's the token. Six decisions went into ours, and each one is there because the obvious alternative fails in a specific way.

**The token is stored hashed, not signed.** 32 bytes from `secrets.token_urlsafe` — about 256 bits — SHA-256'd at rest. At that entropy the hash needs no stretching, and a database dump yields hashes of dead capabilities rather than live ones.

**It expires after 60 minutes.** Long enough to walk away from your desk, short enough that a mail sitting in a synced archive stops being a key.

**Validating a token never consumes it.** This is the one that bites people. Corporate mail scanners and link-preview bots fetch every URL in an incoming message — so if the reset page burned the token on load, the scanner would burn it and the user's own click would always land on "this link is invalid." Loading the page validates; only submitting a new password consumes.

**A rejected password doesn't burn the token either.** Type a password that's too short and you get an error, not another round trip through your mailbox.

**Requesting a new link invalidates the old one.** Two live tokens for one account doubles the window in which an intercepted email is useful — and people request a second link precisely when they think the first went astray, which is when both are floating around.

**Consumption is atomic.** The token is claimed with a conditional `UPDATE`, so two submissions racing on the same link both pass validation and exactly one wins.

There's also no user-enumeration oracle: requesting a reset for an address with no account renders exactly what a real one renders. And requests are rate-limited three ways — per email address, per IP, and separately on the consume step.

## Password rules

Minimum 8 characters. Maximum 72 **bytes**, which is bcrypt's limit, not a preference — so a passphrase in a non-Latin script hits the ceiling sooner than its character count suggests. No composition rules: no forced symbol, no forced digit, no forced capital. Length beats punctuation, and the rules that force a `!` on the end mostly produce passwords ending in `!`.

Changing your password requires your current one. If your account was created through OAuth and has never had a password, you're setting one rather than changing it, and there is no current password to prove — the flow works that out from the account rather than asking you.

## Self-hosting: this needs SMTP

Worth being explicit, because it will otherwise look like a bug. **Password reset requires an outbound mail server.** If `SMTP_HOST` isn't configured on your instance, `/forgot-password` shows an "unavailable" notice instead of the form.

That notice is deliberately instance-level rather than per-account — it tells you the instance can't send mail, not whether the address you typed exists. Configure SMTP and the flow lights up. Everything else here works the same self-hosted as it does on our cloud.

## What this does not cover

This is one narrow thing, and it would be easy to read it as more than it is.

**It's password recovery, not account management.** You still cannot change the email address on an account, and there is no self-serve account or organization deletion. Both are real gaps, both are on the list, and neither ships in this release. If you need either, mail us and a human will do it.

**This is not a "we're ready" post.** We're pre-launch with no paying customers, and there is a list of things a mature product has that we don't. Password reset was near the top of it. It is now off the list. The list is not empty.

## Why it took this long

Honestly: because we built the interesting parts first. Connectors, a metering system, an MCP surface, a benchmark — all more fun than a form that emails you a link. It took an audit that asked "what happens when a user forgets their password?" to notice the answer was "nothing, forever."

That's the recurring failure mode of building fast, and it's the same one we wrote about in [the 109 security tests we ran before launch](/blog/security-tests-before-launch/): the gap isn't in the code you wrote, it's in the code you never thought to write. A test suite can only fail on paths that exist.

---

*Datanika is an open-source data pipeline platform — [self-host it](/docs/self-hosting/) or [start free](https://app.datanika.io/). The account docs live under [Organizations](/docs/organizations/).*
