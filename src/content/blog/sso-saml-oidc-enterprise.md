---
title: "SSO for Enterprise: SAML and OIDC in Datanika"
description: "Configure SAML 2.0 or OIDC single sign-on per organization. IdP metadata, certificate-verified assertions, just-in-time provisioning, and what Datanika validates on every login."
date: 2026-07-25
publishedAt: 2026-07-25
author: "Datanika Team"
category: "product"
tags: ["sso", "saml", "oidc", "enterprise", "security"]
---

Once a data platform has more than a handful of users, "who has access" stops being a platform question and becomes an IT question. The answer your security team wants is not a list of accounts in our database — it's *your* identity provider, with your offboarding process, your MFA policy, and your audit trail.

Datanika supports **SAML 2.0** and **OIDC** single sign-on, configured per organization. Here's how it works and what it actually enforces.

## Two protocols, one flow

Both protocols land in the same place: a verified email address, a Datanika user, and a membership in your organization.

| | SAML 2.0 | OIDC |
|---|---|---|
| Typical IdPs | Okta, Azure AD / Entra, ADFS, OneLogin | Google Workspace, Auth0, Keycloak, Okta |
| What you configure | IdP entity ID, SSO URL, signing certificate (or a metadata URL) | Issuer URL, client ID, client secret |
| How trust is established | The IdP signs assertions with a private key; we verify against the certificate you gave us | We exchange an authorization code over TLS using a shared client secret |
| Browser flow | Redirect to IdP, `POST` a signed assertion back | Redirect to IdP, return with a code, exchange server-side |

Pick whichever your identity provider does best. If you have both, OIDC is usually the simpler setup — there are fewer moving parts and no certificate rotation to think about.

## Configuring it

SSO is set up in **Settings** by an organization owner or admin. Each organization has one active SSO configuration.

**For SAML**, you provide your IdP's entity ID, SSO URL, and X.509 signing certificate — or a metadata URL to pull them from. On our side, the service-provider metadata your IdP needs is served at:

```
GET /api/auth/sso/metadata/{org_slug}
```

Hand that URL to whoever administers your IdP and they can configure the application from it directly.

**For OIDC**, you provide the issuer URL, client ID, and client secret. The client secret is **encrypted at rest** with Fernet, using the same encryption service that protects your data-source credentials — it is never stored in plaintext and never returned by the API.

Once saved, your team signs in at:

```
GET /api/auth/sso/login/{org_slug}
```

## Just-in-time provisioning

You do not pre-create accounts. When someone from your organization signs in through SSO for the first time:

1. We look them up by the email address the IdP asserted.
2. If they don't exist, we create the user — no password, no separate registration, no email-verification step (your IdP already confirmed the address).
3. We add them to your organization as a **viewer**, the least-privileged role.

That last point is deliberate. A new SSO user can look at pipelines and runs but cannot change a connection, edit a model, or trigger anything. An owner or admin promotes them to editor or admin from the members page once they know who the person is. Authentication and authorization stay separate: your IdP decides *who gets in*, and your Datanika admins decide *what they can do*. See [Organizations & Members](/docs/organizations) for the full role matrix.

## What we validate on a SAML assertion

A SAML assertion is a signed XML document asserting "this person is who they say they are." The security of the whole flow rests on actually checking that signature — and on checking everything around it.

Every assertion is validated in strict mode by [python3-saml](https://github.com/SAML-Toolkits/python3-saml), backed by `xmlsec`, against the certificate configured for your organization. Specifically:

| Check | What it stops |
|---|---|
| **XML-DSig signature** verified against your configured IdP certificate, with assertions required to be signed | Assertions that are unsigned, signed with the wrong key, or modified after signing |
| **Audience** matches our service-provider entity ID | An assertion minted for a different application being replayed at ours |
| **Destination** matches our assertion consumer URL | An assertion intended for a different endpoint |
| **Conditions** (`NotBefore` / `NotOnOrAfter`) | Expired assertions |
| **InResponseTo** matches the authentication request we issued | Unsolicited assertions the user never initiated |
| **Single-use request ID**, held in Redis for 10 minutes and consumed on first use | Replaying a previously valid assertion a second time |

Two things are worth calling out about *how* this is done, not just what is checked.

**Signature verification is delegated to `xmlsec`, not hand-rolled.** XML signature verification is notoriously easy to get subtly wrong — signature-wrapping attacks work by splicing an attacker-controlled element next to a legitimately signed one, so that naive code validates one element and then reads a different one. Using a vetted implementation that verifies *the signed element itself* removes that entire class of bug, along with XXE exposure from parsing untrusted XML with a general-purpose parser.

**A failed assertion returns `401`, not a friendly redirect.** Most authentication errors are user errors and deserve a helpful message. A SAML assertion that fails validation is not a user error — it is either a misconfiguration or an attack. It gets a flat `401` and no session, and the rejection is logged.

## What SSO does not do

Being direct about the boundaries:

- **It is not SCIM.** We provision users on first login, but we do not yet sync deprovisioning from your IdP. When someone leaves, revoke them in your IdP — that stops new logins immediately — and remove their membership in Datanika to end existing sessions.
- **It does not replace API keys.** Programmatic access — the [REST API](/api/reference), the [agent interfaces](/docs/ai-agents), CI jobs — authenticates with API keys, not SSO. Those are issued and revoked separately.
- **One configuration per organization.** If you need multiple IdPs against a single org, that's not supported today.
- **We do not sign our own authentication requests.** Some IdPs can be configured to require this. If yours does, it will need that requirement relaxed.

## Availability

SSO is an **Enterprise** feature. The quota is enforced through the same plan-hook system that governs connection and seat limits — the open-source core emits a `sso_config.before_create` event and the cloud billing plugin decides, which is why the open-source edition has no artificial gate here at all. If you [self-host](/docs/self-hosting), you configure SSO and nothing checks your plan. We wrote about that split in [Open Core Without the Coupling](/blog/open-core-plugin).

For the hosted platform, the Enterprise tier and its contact-sales route are both on the [pricing page](/pricing).

---

*Datanika is an open-source data pipeline platform built on dlt and dbt-core. [Start free](https://app.datanika.io/) with 10 GB/month, or [read the docs](/docs).*
