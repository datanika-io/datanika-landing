---
title: "109 Security Tests, Zero Docker Required. Here's What I Tested Before Launch."
description: "SQL injection, path traversal, auth exploits, input validation, tenant isolation — 109 tests across 10 files, all running on in-memory SQLite. No Docker, no external services."
date: 2026-04-15
draft: false
author: "Datanika Team"
category: "engineering"
tags: ["security", "testing", "owasp", "engineering"]
---

Before deploying [Datanika](https://datanika.io) to production, I wrote 109 security tests across 10 test files. They all run in the existing SQLite test suite — no Docker, no external services, no security-specific infrastructure.

## What I Tested

I organized the tests by threat category, roughly following OWASP's top 10 but focused on the attack surface that actually matters for a data platform handling credentials:

| Category | Tests | What it covers |
|----------|-------|---------------|
| SQL injection | 11 | Malicious names, config values, dbt model names — every user-supplied string that touches a query |
| Path traversal | 8 | Escaping dbt project directories, upload directories, SQLite paths. Null byte injection. Relative path tricks |
| Auth security | 19 | JWT manipulation (expired tokens, wrong algorithms, tampered payloads), registration abuse, role escalation |
| Input validation | 7 | XSS payloads in text fields, control characters, shell metacharacters in names |
| Tenant isolation | 4 | Can org A's user see org B's connections, uploads, or run history? |
| API key security | 11 | Key scoping, revocation, expiry, rate limiting bypass attempts |
| File upload security | 13 | Malicious filenames, oversized uploads, content-type spoofing |
| OAuth CSRF | 9 | State parameter validation, callback URL manipulation, token replay |
| Rate limit security | 15 | Bypass attempts, header manipulation, distributed rate limiting |
| Token security | 12 | Refresh token rotation, token reuse, cross-org token usage |

The tenant isolation tests are the most important ones. They create two organizations and verify complete data separation — org A's user literally cannot see org B's connections, uploads, run history, or schedules, even with direct ID guessing. Four tests, but they're the four that would end the company if they failed.

## Why In-Memory SQLite

All 109 tests run on **in-memory SQLite** with no Docker containers. This means:

- Test suite runs in under a minute
- CI is fast (no Postgres container to spin up and wait for)
- New contributors can run security tests locally without any setup
- Every PR gets the full security regression suite automatically

The tradeoff: SQLite doesn't support some PostgreSQL-specific features (schemas, advisory locks, some type coercions). For security tests, this doesn't matter — SQL injection doesn't care which database engine it's targeting.

## The Credential Stack

I wrote these tests because Datanika handles sensitive credentials — database passwords, API keys, OAuth tokens — and treats security as something you test, not something you hope is fine:

- **Fernet encryption at rest** for all stored connection credentials
- **bcrypt** for password hashing (dropped passlib due to compatibility issues with newer bcrypt versions — see [CLAUDE.md's Important Decisions](/docs/architecture))
- **JWT via python-jose** for session tokens
- **HMAC-verified webhooks** for Paddle billing events
- **reCAPTCHA v3** on login/signup (configurable, disabled when keys are empty)

None of this is unusual. But writing the tests that prove it works — that's the part most solo devs skip.

## What I'd Add Next

The current suite covers the application layer. What's missing:

- **Dependency scanning** — Trivy or `uv audit` in CI to catch known vulnerabilities in dlt, dbt-core, reflex, etc.
- **Container image scanning** — the Docker image should be scanned before deploy
- **Penetration testing** — automated tools (Burp Suite, OWASP ZAP) for the deployed app, not just unit tests
- **CSP header verification** — Content-Security-Policy is set in nginx but not tested

All of these are on the infrastructure backlog. The 109 application-layer tests were the minimum viable security for launch.

## The Pattern

Every test follows the same structure:

1. Set up a malicious input (SQL injection string, path traversal attempt, tampered JWT)
2. Call the service or API endpoint with that input
3. Assert the attack was blocked (exception raised, 403 returned, input sanitized)
4. Verify no side effects leaked through (no data was created, no file was written)

Step 4 is the one people skip. It's not enough to check that the endpoint returned an error — you also need to verify the malicious action didn't partially succeed before the error was raised.

## Try It

The security test suite is part of the open-source core:

```bash
git clone https://github.com/datanika-io/datanika-core.git
cd datanika-core
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
uv run pytest tests/test_security/ -v
```

All 109 tests, one command, no Docker. Takes about 15 seconds.

## Related

- [Architecture overview](/docs/architecture) — the security model in context
- [I Built an ETL Platform Solo](/blog/solo-etl-platform-18-phases) — TDD discipline that made this test suite possible
- [Self-Hosting Guide](/docs/self-hosting) — what you get when you deploy the tested platform yourself
