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
