# Technical decisions

Lightweight ADR log. Newest at the bottom. Business decisions confirmed by the owner are marked **(owner)**.

## Phase 0

1. **Hosting: VPS + Coolify, BullMQ + Redis for jobs (owner).** Shared hosting cannot run a long-lived Node
   process, PostgreSQL, Redis workers, wildcard SSL or Playwright. Cloudflare sits in front (DNS, custom hostnames via
   Cloudflare for SaaS, R2).
2. **Brand/domain placeholders (owner default).** `BRAND_NAME=Portfolio`, `ROOT_DOMAIN=localhost:3000` locally; the
   production values are pure configuration.
3. **Email verification does not block sign-in (owner default).** Lower onboarding friction; verification will be
   required before purchase/publishing.
4. **Single Next.js app, no monorepo.** As per spec. Domain code under `src/server`, adapters per integration.
5. **Next.js 16.** `middleware.ts` is renamed to `proxy.ts` in Next 16; Phase 1 host routing will use `proxy.ts`
   (Node runtime, so Prisma/Redis are usable there).
6. **TypeScript 5.9 rather than 7.x.** TS 7 (native port) is not yet supported by the typescript-eslint/Next toolchain.
   ESLint 9 for the same reason (eslint-config-next plugins). Revisit later.
7. **Prisma 7 with `prisma-client` generator + `@prisma/adapter-pg`.** Generated client in `src/generated/prisma`
   (git-ignored, generated on `postinstall`). `db` is a lazy proxy so builds don't need `DATABASE_URL`.
8. **Phase 0 schema is minimal** (User/Account/Session/VerificationToken/AuditLog/Setting). Other models land with the
   phase that uses them to avoid freezing a speculative schema.
9. **Auth.js v5 with JWT sessions.** Required by the Credentials provider. Role and blocked flag are refreshed from the DB
   every 5 minutes inside the `jwt` callback (blocked/deleted users are signed out).
10. **Passwords: argon2id** (`@node-rs/argon2`, OWASP params m=19 MiB, t=2, p=1). Unknown emails still run a verify
    against a dummy hash to avoid user enumeration by timing.
11. **Magic link via a custom Auth.js email provider** that sends through our `Mailer` adapter (mock/SMTP/Resend), so
    email delivery is swappable and testable. Rate limited per address.
12. **Google sign-in is optional** (enabled only when both env vars are set) and uses
    `allowDangerousEmailAccountLinking` because Google only returns verified emails.
13. **Own email-verification tokens** (stored hashed in `VerificationToken` with an `verify-email:` identifier prefix,
    48h, single use) instead of Auth.js tokens, because password users never go through the email provider.
14. **Host-only session cookies.** `app.` and `admin.` keep separate sessions (admin requires its own sign-in). Simpler
    and safer than a `.ROOT_DOMAIN` cookie that every client subdomain would also receive.
15. **Public origin from Host / X-Forwarded-Host.** Next builds `request.url` from the listen address; Auth.js and our
    route handlers get the request rewritten via `withPublicOrigin`. Host validation against known hosts/domains comes
    with the Phase 1 proxy.
16. **Client IP = X-Forwarded-For entry appended by the trusted proxy** (`TRUSTED_PROXY_HOPS`, default 1). The left-most
    entry is client-controlled and would allow bypassing rate limits.
17. **`APP_ENV` separate from `NODE_ENV`.** `next start` always runs with `NODE_ENV=production`; mocks are refused only
    when `APP_ENV=production`.
18. **next-intl without locale routing.** Hosts already encode the tenant; UI language comes from the `NEXT_LOCALE`
    cookie (later: user setting), default `pl`.
19. **Rate limiting: fixed window in Redis** (`INCR` + `PEXPIRE NX`), interface with an in-memory implementation for tests.
20. **Mail templates are plain HTML for now**; React Email arrives with transactional mails in Phase 9.
21. **No `output: "standalone"` yet.** Deployment packaging (Dockerfile/Nixpacks for Coolify) is decided in Phase 9.

## Phase 1

22. **Rewrites to internal route prefixes** (`/marketing`, `/panel`, `/admin`, `/sites/{hostname}`) decided by a pure,
    unit-tested routing table; `proxy.ts` (Next 16, Node runtime) only applies it. The proxy does no DB lookups:
    custom domains are resolved in the site route through a cached query, keeping the proxy fast and dependency-free.
23. **Classic ISR + `unstable_cache` tags instead of Cache Components.** Cache Components (`"use cache"`) would require
    `<Suspense>` around every cookie/session read in the panels. Published sites get ISR pages and tagged data
    (`host:*`, `site:*`), invalidated with `revalidateTag(tag, { expire: 0 })` so a publish is visible immediately.
    Revisit when the panels are stable. Background jobs (BullMQ worker, outside Next) will need an internal
    revalidation endpoint to invalidate tags.
24. **Two root layouts.** Client sites have their own root layout without cookies/session/next-intl request config, so
    they can be static; panels keep the cookie-based locale. `globalNotFound` (experimental) handles unmatched URLs.
25. **Negative lookups are cached** under the host tag; creating a site invalidates `host:{slug}.{root}` so a subdomain
    visited before the site existed starts working immediately (covered by E2E).
26. **No platform APIs on client hosts** (`/api/*` -> 404 on `{slug}.` and custom domains), so platform cookies or
    endpoints are never reachable under client-controlled origins. Form endpoints for sites (contact form) will be
    added explicitly.
27. **Client-site CSP** with `'unsafe-inline'` scripts (Next hydration) but no external script origins; a nonce would
    force dynamic rendering and defeat ISR. Safe because client content is structured JSON, never HTML.
28. **Deeper subdomains (`a.b.{root}`) resolve like custom domains**, which also enables zero-config local testing of
    custom domains via `*.localhost` names listed in `config/dev-domains.json`.
29. **Reserved slugs** include platform hosts, infrastructure labels and generic words (`login`, `billing`, ...);
    slugs are 3-40 chars `[a-z0-9-]`, no edge hyphens, no `--` at positions 3-4 (punycode).
30. **Puck package is `@puckeditor/core`** (`@measured/puck` is deprecated and points there).
31. **Per-block Zod prop schemas** are the source of truth for block data: unknown props are stripped and invalid blocks
    dropped at render time; Phase 2 reuses them for server-side validation on save.
32. **Publishing copies all drafts at once** (site-level publish). Page-level publishing, version history (`PageVersion`)
    and restore are Phase 2.
33. **CDN:** Next marks ISR pages `s-maxage=86400`. Cloudflare does not cache HTML by default; do not enable "Cache
    Everything" for client hosts unless publish also purges Cloudflare (document in operations, Phase 9).
34. **"Made with {BRAND}" footer is always shown** until plans (Phase 3) can remove it.

## Phase 2

35. **Site-wide publish.** "Publish" makes all page drafts and the theme draft live at once (simple mental model, no
    half-published sites). Page structure, SEO fields and site settings apply immediately.
36. **Versions per page, created on publish only for changed pages**, keeping the last 20. Restore copies into the
    draft (never straight to live), so it can be reviewed and published.
37. **Strict validation on save, lenient on render.** The editor cannot store unknown blocks, invalid props,
    `javascript:` links or non-storage image URLs; the renderer still drops anything invalid (old data, manual DB
    edits) instead of failing the page.
38. **Plain-text content only.** No rich-text/HTML fields (Puck's richtext produces HTML); paragraphs come from line
    breaks. Revisit with a sanitized, structured rich-text format if needed.
39. **Theme as CSS variables** consumed by block CSS classes (`blocks.css`); Tailwind is used only for layout. Fonts are
    self-hosted (`@fontsource-variable`), so client sites keep a `'self'`-only CSP and make no third-party requests.
40. **Images optimized at upload** (WebP, max 2400px, metadata/GPS stripped, thumbnail) instead of on-the-fly
    `next/image`: published pages stay static, work behind any CDN and need no image-optimizer origin allowlist.
    SVG uploads are refused (script vector). HEIC is not supported by the prebuilt sharp/libvips.
41. **Local storage adapter for development** (`STORAGE_PROVIDER=local`, served via `/storage/*` on all hosts), so the
    app runs without MinIO; S3 adapter for MinIO/R2. Production refuses local storage.
42. **Storage quota counts optimized bytes** (main + thumbnail). Default quota from env until plans (Phase 3).
43. **Contact form block is visual only** in Phase 2; submissions (storage, inbox, email, anti-spam) come in Phase 9.
44. **Puck UI translated via its `dictionary`** (messages `puck.*`) and block/field labels from `blocks.*`;
    `@puckeditor/core/no-external.css` avoids loading a font from rsms.me.
45. **Video embeds** only for YouTube (via youtube-nocookie.com) and Vimeo (`dnt=1`), parsed from the URL into a
    canonical embed URL; matching the site CSP `frame-src` allowlist.
46. **Prisma script fix:** `pnpm db:migrate` forwards its arguments to `prisma migrate dev` (e.g. `--name x`) and then
    runs `prisma generate`.

## Phase 3

47. **No plan = edit yes, publish no (owner).** Users without an entitled subscription build within the entry plan's
    limits (first active plan, i.e. Start) but cannot publish; publishing starts with a trial or a paid plan.
48. **Seed plans and prices (owner-approved, editable later in the admin panel):** Start 19 / 190 zł (1 site, 5 pages,
    30 projects, 500 MB, basic blocks, branding), Pro 39 / 390 zł (3 sites, 20 pages, 150 projects, 5 GB, custom
    domain, no branding, analytics, basic+pro), Business 79 / 790 zł (10 sites, 50 pages, unlimited projects, 20 GB,
    everything incl. domain purchase and form export). Trial 14 days. Prices are gross (VAT included) in grosze.
49. **Limits as columns, features as validated JSON, tiers as a string array.** Limits are queried/compared, features
    evolve (new flags default to off), tiers are an ordered vocabulary `basic < pro < business` in code.
50. **Enforcement inside the services**, not in actions/UI, so every entry point (actions, API, future jobs) is covered.
51. **Projects** = `Project` blocks + `ProjectList` items, counted per site across page drafts; the limit blocks only
    growth, so a downgraded site keeps working and existing projects stay editable.
52. **Block tiers default in code, overridable via `BlockAccess`** (seeded with the defaults so admins can edit them).
    Pro tier by default: Video, Testimonials, Timeline, Columns.
53. **PAST_DUE keeps entitlements**; dunning, grace period and suspension come with payments (Phase 5).
54. **Seed accounts per plan** (`start@`, `pro@`, `business@`, `free@example.com`); `client@example.com` (demo sites,
    E2E) is on Business. Seed subscriptions are manual (no Stripe id).
55. **`STORAGE_DEFAULT_QUOTA_MB` removed**: the quota comes from the plan.

## Phase 4

56. **Template working copy as JSON (`Template.draft`)** rather than template page rows: templates are small,
    authored by admins only, and versions snapshot the same shape (`TemplateVersion.pages/theme`).
57. **One editor component** (`PageEditor`) for client pages and template pages; actions are passed in as bound
    server actions. Template mode adds a lock panel (Puck `fields` override + `createUsePuck`).
58. **Lock rules keyed by block id**, copied with the template content into `Page.lockRules`. Enforced server-side for
    delete/edit; drag locks only in the editor. Edits are compared structurally, ignoring key order (jsonb).
59. **Template tier must cover its blocks**: publishing refuses templates that use blocks above their access tier, so a
    client allowed to use a template can always keep editing it.
60. **Layout switch = backup + mapping**: `SiteBackup` stores the full site (pages incl. live content, themes,
    template refs); template blocks take the props of old blocks of the same type, pairing pages by path then order;
    locked blocks keep template content. Page structure changes immediately (consistent with decision 35); live page
    content stays until the next publish. Restoring a backup first backs up the current state.
61. **Premium templates** are modelled now (`isPremium`, `priceAmount`, `TemplatePurchase`) and locked in the gallery
    until Stripe Checkout (Phase 5). Overrides (per plan or user) bypass tier and premium.
62. **Background jobs with BullMQ in a separate worker process** (`pnpm worker`): the worker runs outside Next.js and
    must not rely on Next caching APIs. Jobs are idempotent (job id per template version), retried with backoff.
63. **Thumbnails via a renderer adapter**: `playwright` screenshots the public preview (production; needs Chromium in
    the worker image), `mock` draws a placeholder (dev/CI; refused in production). Seed thumbnails are composed with
    sharp so the gallery looks reasonable without a browser.
64. **Template statistics** computed on the fly: uses = sites with `templateId`; conversion = share of those sites'
    owners who currently have an entitled subscription. Good enough until the admin dashboard (Phase 8).

## Phase 5

65. **Payment provider adapter** (`src/server/payments`): `stripe` or `mock`. The mock serves its own checkout and
    portal pages and emits the same normalized `BillingEvent`s in-process, so the whole flow (and E2E) runs without
    keys. Production refuses the mock.
66. **Normalized billing events, one handler** (`handleBillingEvent`): Stripe webhooks are mapped to
    `checkout.completed`, `subscription.updated|deleted`, `invoice.paid|payment_failed`. Idempotency through the
    `WebhookEvent` table (row inserted first, removed if processing fails so the provider's retry is handled). Local
    state is only written from events, never from the redirect after Checkout.
67. **One trial per user**: the trial is only offered at the first provider-managed subscription.
68. **Dunning in the worker** (hourly): mail on the first failed payment, reminders on days 3 and 6, sites suspended
    (`SuspensionReason.PAYMENT`) after a 7-day grace period; values in `Setting` "billing". Payment or a healthy
    subscription restores only payment-suspended sites. Stripe's own retries (Smart Retries) keep running meanwhile.
69. **Subscription ended = sites suspended** (owner decision "edit yes, publish no" applies to new publishing; existing
    live sites of a user without a plan are suspended with a notice and restored on the next subscription).
70. **Prices are gross** (VAT included; `tax_behavior: inclusive` at Stripe). Plan changes are immediate with
    proration; cancellation is at period end.
71. **Payment methods come from the Stripe dashboard** (dynamic payment methods, no `payment_method_types` in code).
    Enable card, BLIK and Przelewy24; Stripe hides BLIK/P24 in subscription Checkout (no recurring support), so they
    apply to one-time premium template purchases.
72. **Billing profile before purchase** (person or company; Polish NIP checksum; EU VAT ids checked in VIES with a
    `reverseCharge` flag for invoicing in Phase 6; VIES unavailable = saved unverified, no reverse charge). Purchases
    require a verified email (owner decision from Phase 0).
73. **Coupons are data mirrored to Stripe** (coupon + promotion code), created by admins; the code is entered on our
    plans page and passed to Checkout. Redemptions are counted from `checkout.completed`.
74. **Cache invalidation from the worker** goes through `/api/internal/revalidate` with an HMAC token signed with
    `AUTH_SECRET` (`INTERNAL_APP_URL` for a private address), because `revalidateTag` only works inside Next.js.
75. **Plan prices are synced to Stripe by a script** (`pnpm billing:sync-prices`), not on the fly: prices are immutable
    at Stripe, a new amount is a new `PlanPrice` row.

## Phase 6

76. **VAT rate is a setting, not code** (owner: status not decided yet): admin chooses 23/8/5/0/zw and the exemption
    basis (default art. 113 ust. 1 i 9) in `/settings`; the rate applies to invoices created after the change. Plan
    prices stay gross, so with "zw" the full price is the invoice amount.
77. **All invoices go to KSeF**, B2C included (owner decision), via Fakturownia's `gov_save_and_send`. KSeF numbers
    arrive asynchronously and are polled every 5 minutes (Fakturownia webhooks can replace polling later).
78. **Reverse charge for verified EU businesses**: VAT "np" with `np_tax_kind: export_service_eu` and
    `reverse_charge: true`; the gross price is charged as the net amount (no separate EU net pricing). EU consumers are
    invoiced with Polish VAT (OSS is out of scope until the EU B2C threshold matters).
79. **Invoices are issued by the worker, never in the request path**: the event handler only creates an idempotent
    PENDING row and enqueues it; issuing is resumable (provider -> PDF -> mail) and retried; FAILED after the last
    attempt or a validation error = "needs manual review". Duplicates after a timeout are prevented by Fakturownia's
    unique `oid` (our invoice id).
80. **PDFs stored in Postgres** (`InvoiceDocument`, bytea): the media bucket is public, invoices are personal data and
    small; served only through an authenticated route (owner or staff). Invoices are kept when they could otherwise
    be cascaded by payments (`NoAction`); account deletion (Phase 9) must respect the 5-year retention.
81. **Corrections only from refunds** (cumulative refunded total per charge -> at most one correction per new total;
    "before" state = original minus earlier corrections). A fully refunded premium template is revoked. Refunds are
    made in Stripe (dashboard); an in-app refund button can come with the admin panel (Phase 8).
82. **Refund matching via PaymentIntent** (`Payment.providerChargeRef`): Stripe API 2025+ invoices don't expose the
    PaymentIntent, so `invoice.paid` webhooks look it up via `invoicePayments.list`.
83. **Mock PDFs with pdf-lib + a DejaVu subset** (Latin + Latin Extended-A, ~50 KB each): standard PDF fonts can't
    render Polish letters. Production PDFs come from Fakturownia.
84. **Worker health endpoint** (`WORKER_HEALTH_PORT`, `GET /health`) for orchestration and for Playwright, which now
    starts the worker next to the app.
85. **Retrying a FAILED invoice re-reads the buyer's billing profile** if it was never issued, so fixing the client's
    data (e.g. a NIP rejected by KSeF) and pressing "Ponów" is the whole repair flow.

## Phase 7

86. **Cloudflare for SaaS with HTTP certificate validation**: the only record a client must add is a CNAME to our
    target (`CUSTOM_DOMAIN_CNAME_TARGET`); the TXT ownership record is shown as optional pre-validation. Apex names
    need CNAME flattening/ALIAS at the client's DNS, or A records when `CUSTOM_DOMAIN_APEX_IPS` (Cloudflare apex
    proxying) is configured; the UI suggests the www address otherwise.
87. **One main address per site**: the first connected domain is primary; when it is ACTIVE, the subdomain and all other
    domains redirect permanently (Next `permanentRedirect`, HTTP 308 — the method-preserving equivalent of 301).
    Clients can switch back to the subdomain. Sitemap URLs use the main address.
88. **Squatting protection**: a hostname claimed but never verified for 48 hours can be taken over by another site;
    verified (ACTIVE) domains can't.
89. **Downgrade**: losing `customDomain` starts the billing grace period (mail), then domains are switched off
    (DISABLED, removed from Cloudflare, mail); after upgrading the client re-enables them. Purchased registrations are
    untouched (owner decision: the domain stays the client's).
90. **Domain pricing** (owner decision: percent + minimum): registrar cost converted to PLN with admin-set rates, plus
    max(30 %, 20 zł net) by default, plus VAT at the invoicing rate, rounded up to whole złoty. Prices are always
    recomputed on the server at checkout. Offered TLDs (owner): .pl, .com, .com.pl, .art.pl, .info.pl.
91. **Renewal = yearly Stripe subscription** (owner decision: auto-renew from card): the registrar's own auto-renew is
    off and we renew only after a paid invoice, so we never pay the registry for unpaid domains. The subscription
    starts at purchase, so the renewal charge falls on the expiry anniversary; Stripe retries failed charges and the
    order expires 30 days after expiry at the latest. Reminders 30/7/1 days before expiry; turning auto-renew off
    cancels the subscription at period end. Transfer codes are available in the panel.
92. **Domain subscriptions never touch plan logic**: events with `kind: "domain"` metadata (also read from
    `invoice.parent.subscription_details.metadata`, which arrives before checkout completion) are routed to
    `domains/billing.ts`; plan dunning, site suspension and `Subscription` rows are only for plans.
93. **Registration in the worker, resumable** (contact -> register -> DNS -> connect), FAILED for an admin retry when
    the registry refuses; purchased domains use the registrar's DNS (www CNAME to our target).
94. **Openprovider adapter written against the public v1beta API without live access** (like Fakturownia in Phase 6):
    covered by tests on recorded-shape responses; verify in the Openprovider sandbox before launch.
95. **Entitlements loader split out (`entitlements/load.ts`)** so the worker, which runs outside Next.js, can enforce
    plan features without importing `server-only` modules.

## Phase 8

96. **Permission map instead of role checks** (`src/server/auth/permissions.ts`, `requirePermission`). SUPPORT may do
    almost everything **(owner)**: clients, notes, blocking clients, refunds, granting plans, impersonation,
    moderation, invoices, domains, coupons, templates and the audit log. ADMIN-only: plan catalog and block tiers,
    platform settings (VAT, mail texts, domain pricing) and the team (roles, blocking staff).
97. **Every staff mutation is audited** (`audit()` with actor, action, target, metadata and IP). Retention 2 years
    **(owner)**: a daily worker job deletes older rows.
98. **Impersonation: full access without payments (owner).** Staff start it from the client card with a mandatory
    reason; an `ImpersonationSession` row (30 min) and a one-minute signed, single-use token lead to a confirmation
    page on the app host, where a dedicated Auth.js credentials provider signs in as the client with an
    `impersonation` claim in the JWT. The staff member's own admin session (separate host) is untouched. The claim is
    rechecked on every token refresh (ended or expired -> signed out). A banner is always shown; every payment,
    purchase, billing-profile and domain-billing action is refused while impersonating. Redeeming re-checks the
    staff permission and that the client is not blocked.
99. **DSA notice-and-action**: the report form lives on the root domain (`/report?site=`) so client sites stay
    cookie-free and static; every site footer links to it. Reporter IPs are stored only as salted hashes (rate limit +
    abuse tracing). Suspending a site requires a statement of reasons that is mailed to the owner and shown in the
    panel; reporters get the decision. Moderation never lifts a payment suspension.
100.  **Price history**: changing a plan price creates a new `PlanPrice` row and deactivates the old one (the unique
      `(planId, interval, currency)` was dropped), so existing subscribers keep their Stripe price; the new row is synced
      to Stripe immediately when Stripe is the provider.
101.  **Manual plans** are `Subscription` rows without a provider id, optionally with an end date; the hourly dunning job
      cancels expired ones. They are refused while the client has a provider subscription (change the plan there).
102.  **Admin refunds go through the payment provider** (`PaymentProvider.refund`); the provider's refund event then
      updates the payment and issues the correction invoice, the same path as a refund made in the Stripe dashboard.
103.  **Mail text overrides** (subject/body per kind, ICU, `Setting` "mailTexts", cached 60 s). Rendering is strict: an
      override that fails to format falls back to the built-in text instead of sending a broken mail.
104.  **Dashboard metrics**: MRR = provider-managed ACTIVE/PAST_DUE subscriptions at their current price (yearly / 12),
      manual plans counted separately; churn = cancellations in the last 30 days / entitled subscriptions 30 days ago;
      monthly series (revenue net of refunds, new clients, cancellations, failed payments) over 12 months, rendered
      server-side as SVG bar charts with a table view.

## Phase 9

105. **Contact forms without JavaScript**: the block posts a plain HTML form to `/_p/contact` on the site's own host
     and the handler redirects back to `#contact-sent` / `#contact-error`, shown with CSS `:target`. Published pages stay
     static (ISR) and cookie-free, CSP keeps `form-action 'self'`. The site is resolved from the host, never from form
     data, and only pages that actually contain a ContactForm accept messages (no open mail relay).
106. **Anti-spam (owner)**: honeypot, Origin/Referer host check, rate limits (5/h per sender, 100/day per site), at
     most 3 links per message; no third-party captcha. Sender IPs are stored only as salted hashes.
107. **`_p` reserved prefix** on client hosts for platform endpoints (`%5Fp` folder): page path segments must match
     `[a-z0-9-]`, so it can never collide with a client's page and no page name had to be reserved.
108. **Own cookie-less statistics** instead of Plausible: a 1x1 image beacon (no JS) counts views per page and day;
     daily unique visitors use a random per-day salt kept only in Redis (48 h), hashes are rolled up and deleted the
     next day, so no personal data is stored and no consent banner is needed. Bots and prefetches are skipped;
     visitors summed per day (not unique over a period). Shown for plans with `analytics`.
109. **Contact messages kept 2 years** at most (third parties' personal data), CSV export for `formsExport` with
     spreadsheet formula-injection protection.
110. **Account deletion (owner)**: 14-day cancellable grace period; sites offline immediately; subscriptions cancelled
     without refund; purchased domains stay registered until expiry with transfer codes mailed. The user row is
     anonymized rather than deleted because invoices/payments must be kept 5 years and reference it; the mailer drops
     mail to the anonymized address. Erasure runs in the worker and does provider steps first (retried hourly).
111. **Session revocation** without server sessions: `User.passwordChangedAt` compared with the JWT sign-in time on
     the 5-minute refresh (password change/reset, "sign out everywhere").
112. **Legal documents editable by admins (owner)**: drafts written from what the platform does (to be reviewed by a
     lawyer), placeholders filled from the invoicing seller data; a saved change to the terms is a new version that
     signed-in clients accept from the dashboard; registration requires accepting the terms. Only essential cookies
     (session, language) on platform hosts, none on client sites, so there is no cookie banner. Defaults are Polish
     only (business documents; English versions can be added as admin-edited text later).
113. **React Email for all transactional mails** through one shared layout; texts stay in next-intl messages so admin
     overrides keep working; quoted user text is rendered as text (escaped).
114. **One Docker image** for web and worker (worker runs TypeScript via tsx, like in development); Chromium is
     included for template thumbnails. Migrations run as Coolify's pre-deployment command. Not built in the
     development container (no Docker there); verify the first build on the server.

## Phase 10

115. **Group licenses: both models (owner)** — self-service (organization pays per seat through a provider
     subscription with quantity, price per seat set per plan by the admin) and manual licenses created by staff for
     negotiated deals (invoiced outside Stripe, optional end date). The buyer is the manager and takes a seat.
116. **Effective plan = better of license seat and own subscription** (by plan position), so members can upgrade
     individually without leaving the license; the license plan returns when their own plan ends. A license can let
     members connect and buy domains even below the plan's features (they pay for the domain).
117. **One organization per user** keeps entitlements and billing unambiguous; joining is by a shareable link
     (switchable) or a personal e-mail invitation bound to the invited address; seats are checked under a row lock.
118. **Sponsor footer** "Strona wspierana przez …" on members' sites, `rel="sponsored"`. Staff can switch it off
     for a whole license or a single member for free; members can buy the removal — monthly add-on or one-time, as
     the admin sets (owner decision), with a VAT invoice (Payment kind ADDON).
119. **License end pauses only members left without any plan** (sites suspended for payment, mail); restoring the
     license or buying an own plan restores them. Plan dunning never pauses sites of members with an active seat.
120. **Inline-priced subscriptions** (`createInlineSubscriptionCheckout`) for licenses and add-ons: no catalog price
     sync needed, the price is taken from our database at checkout; seat changes are prorated by the provider.

## Phase 11

121. **Net profit per price (owner: VAT, payment fee, server cost per client, other fixed costs)**: VAT out first,
     fee on the gross amount (% + fixed per charge, so yearly prices pay the fixed part once), then the client's
     share of costs for the billed period. Server cost per client = bill ÷ active paying clients, or a fixed amount
     (admin choice). The calculation is a pure module so the admin sees it live while typing a price.
122. **Profit history from our own payments**, not the provider: refunds reduce revenue in the month of the
     payment, the provider keeps its fee; VAT from the current rate (exact per-invoice VAT stays in the invoicing
     system); fixed costs use the current settings for every month (no cost history yet).
123. **Forecast = simple, explainable model**: MRR × (1 − monthly churn) + average new MRR of the last 3 months, plus
     average one-time sales; assumptions are printed next to the charts. Finance pages are ADMIN-only (cost data).
124. **Server forecast from daily snapshots**: a least-squares trend over 90 days against capacities the admin sets
     (DB disk, storage budget, monthly page views, published sites), warning at a chosen percentage. The first
     history is reconstructed from creation dates so the page is useful before 90 days of snapshots exist.

## Phase 12

125. **Consent-based newsletter (owner)**: marketing only to users who opted in (unchecked box at registration,
     toggle in the account), service announcements to every active client. Consent is re-checked at send time, so
     unsubscribing during a long send works.
126. **One-click unsubscribe without login**: a signed token per recipient (2 years); the page needs a button (link
     scanners must not unsubscribe people) and mail clients get RFC 8058 `List-Unsubscribe-Post`. No open/click
     tracking (it would need consent itself); stats are sent/failed/skipped/unsubscribed.
127. **Frozen audience, resumable batches**: the recipient list is fixed when sending starts; the worker sends 50 per
     batch every 5 seconds (provider rate limits) and recipients stay PENDING if a batch crashes.
128. **Mail branding as data**: logo URL, accent colour and footer in a setting applied to every mail (transactional
     and campaigns); the footer defaults to the seller data so mails carry the company details from day one.
