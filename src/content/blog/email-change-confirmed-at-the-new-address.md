---
title: "An Email Change Is Confirmed at the New Address"
description: "Settings stores the request and mails the new address. The account address stays where it is until that link is confirmed. A mail scanner fetching the URL does not apply the change."
date: 2026-11-24
publishedAt: 2026-11-24
author: "Datanika Team"
category: "product"
tags: ["accounts", "email", "security", "product"]
---

Changing the address on an account is a two-step write, and the second step happens at the new address.

Settings asks for the new address and sends a confirmation link there. The copy on the form is exact: check the new address for the link, and the current address stays in place until you open it. If the server cannot send mail, nothing is changed.

## The current address is not overwritten by the form

The pending address is stored beside the account. The account email is not replaced when the form is submitted. Resend-verification reads its destination from the account row, so writing a typed address straight into that row would aim the existing resend control at whatever the form submitted.

The link lasts 24 hours. It is a hash in the token row. The pending address itself is not stored on that row, so a dump of the token table cannot replay the link.

An address that already belongs to an account is refused out loud, including one that another account already has pending. The person asking is signed in and the request is rate-limited: three tries at the same target in an hour, and ten from the same account. A silent "check your inbox" would hide a typo. Cancel drops the pending address and burns the outstanding links.

## Opening the mail is not the same as confirming it

Mail scanners fetch every URL in a message. A page load that wrote the new address would let a scanner apply the change before the recipient did. Loading the confirmation page checks that the link is live and does not consume it. The address changes when you confirm on that page.

The confirm writes both copies of the address the login lookup reads, clears the pending value, and marks the address verified. The click is the proof. You are not asked to verify the same address a second time. If someone else claimed the address between the request and the click, the live address is left where it was.

The same shape already applies to [changing a password](/blog/password-reset-and-change/): the form does not finish the write. Company sign-in is a separate path, covered in [SSO with SAML and OIDC](/blog/sso-saml-oidc-enterprise/). The checks that have to fail on purpose before a launch are in [security tests before launch](/blog/security-tests-before-launch/).
