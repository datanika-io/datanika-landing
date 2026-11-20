---
title: "The Language Switcher Is on the Sign-in Pages"
description: "Sign-in, sign-up, forgot-password, and reset-password render the same language switcher as the signed-in app. The choice is one cookie both sides read. The language names are written in that language."
date: 2026-11-22
publishedAt: 2026-11-22
author: "Datanika Team"
category: "product"
tags: ["i18n", "login", "product", "ux"]
---

The language control used to live where you could already read the interface. The four pages you see before an account exists did not have it: sign-in, sign-up, forgot password, and reset password.

Those four pages now render the same switcher. The labels are the language names in that language — English, Русский, Ελληνικά, Deutsch, Français, Español, 中文, العربية, Српски — so the control is findable before you have already chosen English.

## One cookie, both sides of sign-in

The choice is stored in a single cookie, `datanika_locale`, on the whole site, for a year. The signed-in app and the signed-out pages read that one field. A reset link is often opened after the tab that chose the language is gone, and there is not yet a locale column written at sign-up, so the cookie is what carries the choice across.

An invalid stored value falls back to English and is written back. A valid one is left alone, so merely visiting a page does not reset the cookie.

## Password managers stay on those pages

The switcher's filter box can opt a page out of password-manager fill. That opt-out is right in the signed-in sidebar, where the filter sits beside connector secrets. It is wrong on the four pre-auth pages, which are the forms a password manager is supposed to fill. Those pages pass the filter through without that opt-out. The sidebar switcher still opts out.

The switcher is on these four pages. That is the part that shipped. It is not a claim that every open locale issue is finished.

One of those four pages is the form for [resetting a password](/blog/password-reset-and-change/). Signing in with a company identity is a different path, written up in [SSO with SAML and OIDC](/blog/sso-saml-oidc-enterprise/). After the account exists, [getting started](/docs/getting-started/) is the signed-in app, which already had the switcher.
