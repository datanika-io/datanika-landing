/**
 * The sub-processor register — one entry per (recipient, function).
 *
 * 🚨 EVERY FIELD HERE IS A LEGAL REPRESENTATION, NOT MARKETING COPY.
 * `/dpa` Annex III renders this. `/privacy` and `/trust` do not yet (that is D5 of
 * `docs/specs/SPEC_SUBPROCESSOR_REGISTER.md`); until they do, a change here must be
 * carried to those two pages by hand.
 *
 * ## Why one entry per FUNCTION, not per recipient (D2)
 *
 * Merging functions lets the least-alarming one define the row, and the merge is
 * invisible in review because the row still reads as accurate. Two measured cases:
 *
 *   1. `CLAUDE.md` concluded that Cloudflare Email Routing "added no new sub-processor"
 *      — true recipient-keyed, false function-keyed. The path it added carries mail sent
 *      to `security@` and `info@`, which are the addresses `/privacy` tells data subjects
 *      to use.
 *   2. The first publication of this annex (landing PR #480) put Google's unconditional
 *      mail delivery and its opt-in identity provision on ONE row. They have different
 *      `scope` values, and one row cannot hold two — so the split is a PRECONDITION for
 *      any page deriving its list from `scope`, not a refinement of it.
 *
 * ⚠️ `scope` is DERIVED FROM THE PROSE ALREADY PUBLISHED, never assigned fresh. The only
 * `conditional` entries are the two the annex already qualified in words ("only for users
 * who choose … sign-in"). Re-classifying an unconditional function is a legal change and
 * does not belong in a structural split.
 *
 * ⚠️ Splitting adds no fact and removes none. Every `purpose` below is a faithful subset
 * of the merged prose it came from; the union of the split rows says exactly what the
 * merged rows said.
 *
 * ## Fields
 *
 *   name        recipient, as it should appear to a data subject
 *   legal       establishment / registration, as published
 *   fn          the function this entry covers — the second half of the key
 *   purpose     what is done, and with what data
 *   location    where the recipient is established (this determines EEA transfer)
 *   scope       `processor`   — processes customer personal data in the ordinary course
 *               `conditional` — only when the customer opts in (OAuth identity providers)
 *   derivation  how `location` / the fact of processing was established, re-runnable (D3)
 *
 * ## Derivations were re-run IN FULL on 2026-09-04 before first publication
 *
 * That sweep found a false sentence (see the Cloudflare Web Analytics entry) which had
 * survived the draft by being re-read rather than re-derived.
 *
 * ⚠️ Three things deliberately NOT said, each because the evidence does not exist:
 *   1. No city for Pointer. "Athens" is our own note, not a measurement, and their
 *      registered office is Thessaloniki. RDAP evidences the country and no more.
 *   2. No AWS region for Resend's onward delivery. `include:amazonses.com` is
 *      region-agnostic and cannot distinguish one; Resend's own sub-processor list is
 *      entirely US.
 *   3. No characterisation of Pointer's legal role (cloud#128): their Greek and English
 *      pages assert opposite roles in the same sentence, their Greek text is operative by
 *      their own choice of law, and they publish no DPA. We state the factual
 *      relationship — we operate a VPS with them — and nothing more.
 */

export type SubprocessorScope = "processor" | "conditional";

export interface SubprocessorEntry {
  name: string;
  legal: string;
  fn: string;
  purpose: string;
  location: string;
  scope: SubprocessorScope;
  derivation: string;
}

export const subprocessors: SubprocessorEntry[] = [
  {
    name: "Pointer",
    legal: "T. Papamichail – Vainas / G. Psaltakis O.E. · VAT EL998633174",
    fn: "Application hosting",
    purpose:
      "Virtual private server hosting the application, the production database and the background workers.",
    location: "Greece (EU)",
    scope: "processor",
    derivation:
      "curl -s https://rdap.db.ripe.net/ip/185.25.22.188 -> GR-POINTER-CLOUD2, country GR",
  },
  {
    name: "Aweb",
    legal: "Greek sole proprietorship, RIPE netname GR-AWEB-185-226-65",
    fn: "Off-site backups",
    purpose: "Encrypted off-site database and file-volume backups.",
    location: "Greece (EU)",
    scope: "processor",
    derivation:
      "curl -s https://rdap.db.ripe.net/ip/185.226.65.96 -> GR-AWEB-185-226-65, country GR",
  },
  {
    name: "Aweb",
    legal: "Greek sole proprietorship, RIPE netname GR-AWEB-185-226-65",
    fn: "Marketing site hosting",
    purpose: "Hosts datanika.io and our self-hosted analytics instance.",
    location: "Greece (EU)",
    scope: "processor",
    derivation: "Same host as the backup target; RDAP as above.",
  },
  {
    name: "Cloudflare, Inc.",
    legal: "Delaware, United States",
    fn: "Edge delivery",
    purpose:
      "CDN, DDoS protection, DNS and TLS termination for datanika.io and app.datanika.io.",
    location: "United States",
    scope: "processor",
    derivation:
      "`Server: cloudflare` + `CF-RAY` on both hosts; Cloudflare Origin certificate on both origins.",
  },
  {
    name: "Cloudflare, Inc.",
    legal: "Delaware, United States",
    fn: "Inbound mail routing",
    purpose:
      "Routing of mail sent to our published contact addresses, including data subject requests sent to info@datanika.io and security@datanika.io.",
    location: "United States",
    scope: "processor",
    derivation:
      "`datanika.io` MX -> route{1,2,3}.mx.cloudflare.net. The MX is Cloudflare's, not the mailbox provider's; this entry and the Google mail-delivery entry are worded to match that.",
  },
  {
    name: "Cloudflare, Inc.",
    legal: "Delaware, United States",
    fn: "Web analytics",
    purpose:
      "Cookie-free web analytics on datanika.io. No cookies, no browser storage, no cross-site identifier, no advertising or behavioural profile. It does not run inside the Service.",
    location: "United States",
    scope: "processor",
    derivation:
      "`static.cloudflareinsights.com/beacon.min.js`, 30,294 bytes: document.cookie 0, localStorage 0, sessionStorage 0, indexedDB 0, the string \"cookie\" any-case 0, no canvas/WebGL/fingerprinting API. Positive control on the same bytes, so the zeros are not an empty file or an error page: 56 \"function\", sendBeacon 3, cfBeacon 3, navigator 16. It POSTs to cloudflareinsights.com/cdn-cgi/rum. 🚨 This entry is what caught a false sentence in the draft: the annex footnote read \"Our website analytics are self-hosted\" — true of Plausible, false of this beacon, which every layout page loads.",
  },
  {
    name: "Resend",
    legal: "Plus Five Five, Inc., United States",
    fn: "Transactional email delivery",
    purpose:
      "Transactional email delivery — password resets, email verification and team invitations. Resend delivers through Amazon Web Services (Amazon SES) as its own sub-processor.",
    location: "United States",
    scope: "processor",
    derivation:
      "SMTP_HOST=smtp.resend.com in the running container's env. Re-derived without SSH from DNS: `send.datanika.io` TXT = `v=spf1 include:amazonses.com ~all`, and `resend._domainkey.datanika.io` present — which evidences the Amazon SES onward leg, the part this entry actually claims.",
  },
  {
    name: "Paddle.com Market Ltd",
    legal: "England and Wales, company 8172165",
    fn: "Payment processing",
    purpose:
      "Payment processing as Merchant of Record. Receives the account holder's email address and our internal organisation identifier. Card details are entered in Paddle's own checkout and never reach our servers.",
    location: "United Kingdom",
    scope: "processor",
    derivation:
      "datanika_cloud/billing/paddle.py: the account email is the only personal data we send.",
  },
  {
    name: "Google LLC",
    legal: "United States",
    fn: "Contact mailbox delivery",
    purpose:
      "Delivery of mail sent to our published contact addresses, including data subject requests sent to info@datanika.io and security@datanika.io, into a Google-operated mailbox.",
    location: "United States",
    scope: "processor",
    derivation:
      "`datanika.io` MX -> route{1,2,3}.mx.cloudflare.net, forwarded to a Google-operated mailbox. Inbound mail is routed by Cloudflare and delivered here.",
  },
  {
    name: "Google LLC",
    legal: "United States",
    fn: "Identity provider",
    purpose:
      "Authenticates users who choose Google sign-in, and returns the email address and display name on that account.",
    location: "United States",
    scope: "conditional",
    derivation:
      "Optional at sign-in. A user who never chooses Google sign-in sends no data to Google through this function.",
  },
  {
    name: "GitHub, Inc. (Microsoft)",
    legal: "United States",
    fn: "Source hosting and CI/CD",
    purpose:
      "Source code hosting and CI/CD. Holds our code and deployment credentials, not customer pipeline data.",
    location: "United States",
    scope: "processor",
    derivation:
      "Our repositories and Actions workflows. Stated so the recipient is disclosed even though the data it holds is ours, not our customers'.",
  },
  {
    name: "GitHub, Inc. (Microsoft)",
    legal: "United States",
    fn: "Identity provider",
    purpose:
      "Authenticates users who choose GitHub sign-in, and returns the email address and display name on that account.",
    location: "United States",
    scope: "conditional",
    derivation:
      "Optional at sign-in. A user who never chooses GitHub sign-in sends no data to GitHub through this function.",
  },
  {
    name: "Telegram",
    legal: "Telegram FZ-LLC",
    fn: "Infrastructure alerting",
    purpose:
      "Delivery of infrastructure alerts to our on-call channel. Alert payloads carry service and container identifiers, not customer records.",
    location: "Outside the EEA",
    scope: "processor",
    derivation:
      "The alert webhook configured on the monitoring stack. Payload contents read off the alert templates.",
  },
];
