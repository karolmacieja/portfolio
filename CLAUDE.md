# CLAUDE.md

Multi-tenant SaaS for building portfolio websites (Canva-like drag & drop editor). Full product spec: `SPEC.md`.
Technical decisions log: `docs/decisions.md`. Keep this file up to date when architecture, conventions or commands change.
Next.js 16 ships its own docs in `node_modules/next/dist/docs/` (see `AGENTS.md`); check them before using Next APIs.

## Status

| Phase | Scope                                                                  | State |
| ----- | ---------------------------------------------------------------------- | ----- |
| 0     | Foundation: Next.js, Docker Compose, Prisma, Auth.js + roles, i18n, CI | done  |
| 1     | Multi-tenancy (host routing), Site/Page, renderer, cache               | done  |
| 2     | Editor (Puck), blocks, themes, draft/publish, versions, media, SEO     | done  |
| 3     | Plans & entitlements: limits, flags, block tiers, plan seed            | done  |
| 4     | Templates: template mode, versions, gallery, copy, theme/layout change | done  |
| 5     | Payments (Stripe): checkout, webhooks, portal, dunning, coupons        | done  |
| 6     | Invoicing (Fakturownia, KSeF): invoices, corrections, PDFs, panels     | done  |
| 7     | Domains: Cloudflare for SaaS, Openprovider; purchase and renewals      | done  |
| 8     | Admin panel                                                            | done  |
| 9     | Polish                                                                 | next  |

Work in phases; after each phase run lint/typecheck/tests, summarize and wait for the owner's approval.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts` instead of middleware) + React 19 + TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`)
- PostgreSQL 16 + Prisma 7 (`prisma-client` generator → `src/generated/prisma`, driver adapter `@prisma/adapter-pg`, config in `prisma.config.ts`)
- Auth.js v5 (`next-auth@beta`): credentials (argon2id), magic link, Google (optional); JWT sessions
- Puck (`@puckeditor/core`, formerly `@measured/puck`): page content stored as Puck JSON, rendered with `Render` from `@puckeditor/core/rsc`
- next-intl 4 (no locale in URL; cookie `NEXT_LOCALE`, default `pl`)
- Tailwind CSS 4 + shadcn/ui (new-york, neutral) for panels
- Redis (ioredis): rate limiting; BullMQ queues + a separate worker process (`pnpm worker`, `src/worker/index.ts`)
- Media: `sharp` (validation + WebP optimization), storage adapter: local disk (dev) or S3 (`@aws-sdk/client-s3`: MinIO, R2)
- Site fonts self-hosted via `@fontsource-variable/*` (no third-party requests from client sites)
- Vitest 4 (unit), Playwright (E2E)
- Production target: VPS + Coolify, BullMQ workers, Cloudflare in front (see `docs/decisions.md`)

## Commands

```bash
docker compose up -d          # Postgres, Redis, MinIO (+bucket), Mailpit
pnpm install                  # also runs `prisma generate`
pnpm db:migrate --name x      # create/apply a migration + regenerate the client (Prisma 7 no longer auto-generates)
pnpm db:seed                  # plans, users (password Password123!), demo sites with generated images
pnpm dev                      # http://localhost:3000 (marketing), app./admin./jan.localhost:3000
pnpm worker                   # background jobs (thumbnails, dunning, invoices + KSeF, domains); needs Redis
pnpm billing:sync-prices      # create Stripe prices for PlanPrice rows without stripePriceId
stripe listen --forward-to app.localhost:3000/api/webhooks/stripe   # PAYMENTS_PROVIDER=stripe locally
pnpm lint | pnpm format | pnpm typecheck | pnpm test | pnpm test:e2e | pnpm build
pnpm db:reset                 # drop, migrate, seed
```

`pnpm test` loads `.env` (via Vite `loadEnv`): DB/Redis integration tests need `docker compose up`; they are skipped
when `DATABASE_URL` / `REDIS_URL` are unset. Override the test database in `.env.test.local`.
E2E against a preinstalled Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm test:e2e`.
Migrations that rename columns: `prisma migrate dev` needs a TTY, so generate SQL with
`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, edit it into RENAMEs, apply
with `pnpm db:deploy` and run `pnpm db:generate`.
`pnpm typecheck` runs `next typegen` first (route types such as `PageProps<"/login">`).

## Host routing

`src/proxy.ts` classifies the Host header (`src/lib/hosts.ts`) and rewrites to an internal route prefix
(`src/server/http/routing.ts`, unit-tested routing table):

| Host                            | Internal route        | Notes                                             |
| ------------------------------- | --------------------- | ------------------------------------------------- |
| `{ROOT}`, `www.{ROOT}`          | `/marketing/*`        | landing (pricing etc. in Phase 9)                 |
| `app.{ROOT}`                    | `/panel/*`            | client panel; `/api/*` passes through             |
| `admin.{ROOT}`                  | `/admin/*`            | admin panel (own login, separate session)         |
| `{slug}.{ROOT}`, custom domains | `/sites/{hostname}/*` | published sites; ISR; no `/api` (404); strict CSP |
| reserved/malformed labels       | 404                   | `RESERVED_SLUGS` in `src/lib/slug.ts`             |

- `/api/health` and `/storage/*` are served on every host. Internal prefixes are unreachable directly.
- Links between hosts use absolute URLs: `platformUrl("app", "/path")`, `siteSubdomainUrl(slug)`.
- Inside a host, use public paths (`/login`, `/dashboard`), never internal ones (`/panel/...`).
- Custom domains: `Domain` rows with status `ACTIVE`; locally also `config/dev-domains.json`
  (e.g. `jan-kowalski.pl.localhost` -> site `jan`; ignored when `APP_ENV=production`) and connected domains named
  `*.something.localhost` (allowed outside production). A site with an ACTIVE primary domain is served only there:
  the page renderer `permanentRedirect`s (308) every other host of the site (subdomain, other domains).
- Two root layouts: `src/app/(platform)/layout.tsx` (panels, cookies, next-intl) and `src/app/sites/[host]/layout.tsx`
  (client sites: no cookies/session so pages stay static). `src/app/global-not-found.tsx` handles unmatched URLs.

## Content, editor and publishing

- Blocks live in `src/blocks/`: `schemas.ts` (Zod prop schemas = source of truth, link/image URL rules, slot props),
  `defaults.ts`, `render/blocks.tsx` (server-safe renderers, plain text only, `editMode` placeholders),
  `config.tsx` (render-only Puck config + categories), `content.ts` (document parsing: lenient for rendering,
  strict `validatePageContent` for saving, recursive through slots), `blocks.css` (styles driven by theme CSS vars).
- Adding a block: schema + defaults + renderer + category in `config.tsx` + fields in
  `src/components/editor/editor-config.tsx` + `blocks.names/fields` messages + a test. Phase 3 adds `requiredTier`.
- Editor: `/sites/{id}/editor/{pageId}` (app host) renders `<Puck>` (`src/components/editor/site-editor.tsx`) with a
  Polish dictionary (`messages.puck`), autosave of the draft (server action, strict validation) and "Publish".
  Uses `@puckeditor/core/no-external.css` (the default CSS loads a font from a third party).
- Theme (`src/themes/`): Zod schema + presets -> CSS variables (`themeToCssVars`), fonts from `fonts.ts`.
  Stored as `Site.themeDraft` / `themePublished`.
- Draft vs live: page content and theme are drafts until "Publish" (site-wide: all pages + theme). Page structure
  (title, path, order, delete), page SEO fields and site settings apply immediately (and invalidate the cache).
- Every publish snapshots changed pages into `PageVersion` (last 20 kept); restore copies a version into the draft.
- Site management UI (app host): `/sites/{id}` pages, `/theme`, `/settings`, `/history`; media library `/media`.

## Media

- Upload: `POST /api/media/upload` (app host, auth, rate limit, size limit) -> `src/server/media/service.ts`:
  `sharp` checks the real format (JPEG/PNG/WebP/GIF/AVIF; never SVG), applies EXIF rotation, strips metadata,
  bounds to 2400px and stores WebP + a 480px thumbnail under `u/{ownerId}/{random}.webp`; quota from the plan
  (`limits.storageMb`).
- Storage adapter (`src/server/storage`): `local` (files in `STORAGE_LOCAL_DIR`, served by `src/app/storage/[...key]`
  on every host; refused in production) or `s3` (MinIO locally, R2 in production; public bucket URL `S3_PUBLIC_URL`).
- Image props store `{ url, alt, width, height }`; deleting an asset does not rewrite pages that use it.

## Plans and entitlements

- Plans are data (`Plan`, `PlanPrice`, gross PLN in grosze), never hard-coded; `Subscription` mirrors Stripe statuses.
  `BlockAccess` rows set the required tier per block (defaults: `DEFAULT_BLOCK_TIERS`).
- One permission layer: `src/server/entitlements/` -- `rules.ts` (pure: `buildEntitlements`, `can`, `canUseBlock`,
  `canUseTemplate`, `canAddMore`, `countProjects`, `newDisallowedBlocks`) and `index.ts` (`getEntitlements(userId)`,
  `getBlockTiers()`, `getUsage()`). Use it in UI, API and services; never check plan slugs directly.
- Entitled statuses: TRIALING, ACTIVE, PAST_DUE. Without one: limits/tiers of the first active plan (entry plan),
  `canPublish = false`, no paid features (owner decision: "edit yes, publish no").
- Enforcement lives in the services (cannot be bypassed): `createSite` (maxSites), `createPage` (maxPagesPerSite),
  `savePageDraft` (new blocks above tier -> `blockNotAllowed`; project growth past `maxProjects`), `publishSite`
  (`subscriptionRequired`), media upload (storage quota). Downgrade policy: existing data and blocks stay; only adding
  beyond the plan is refused.
- Public branding footer follows `removeBranding`; when a user's plan changes, invalidate `siteTagsForOwner(userId)`.
- Editor shows locked blocks (`lockedBlocks()`) as non-draggable drawer items with an upgrade link to `/plans`.
- Tests: `src/server/entitlements/test-utils.ts` creates inactive test plans and subscriptions (CI has no seed).
- `getEntitlements` is intentionally not wrapped in React `cache` (outside a render it would memoize forever).

## Templates

- Authored by ADMIN on the admin host: `/templates` (list with uses + conversion), `/templates/{id}` (metadata, pages,
  theme, access overrides, versions, publish/archive) and `/templates/{id}/edit/{key}` (the same `PageEditor` in
  template mode, with a lock panel per block). Services: `src/server/templates/admin.ts` (not owner-scoped).
- `Template.draft` is the working copy `{ pages: [{ key, path, title, content, lockRules }], theme }`
  (`templates/schema.ts`); publishing validates every page, refuses blocks above the template tier (`tierTooLow`) and
  snapshots a `TemplateVersion`. A thumbnail job is queued (BullMQ `thumbnails`; renderer `THUMBNAIL_PROVIDER`
  mock | playwright screenshots `/template-preview/{slug}`).
- Public preview `/template-preview/{slug}/[path]` (own root layout, ISR tag `template:{slug}`) on platform hosts.
- Clients (`src/server/templates/client.ts`, owner-scoped): gallery `/templates` with `canUseTemplate` (tier, premium
  purchase, `TemplateOverride` for a plan/user), new site from a template (copies the published version's pages, theme
  and lock rules; site keeps `templateId`/`templateVersionId`), site tab `/sites/{id}/template`: theme only, or full
  layout switch (`SiteBackup` first, `mapTemplateContent` fills template blocks with old blocks of the same type,
  live content stays until publish). Backups are listed and restorable in History (restoring backs up again).
- Lock rules (`src/blocks/locks.ts`): `{ [blockId]: { edit?, drag?, delete?: false } }` stored on `Page.lockRules`.
  The editor applies them via Puck `resolvePermissions`; `savePageDraft` refuses deleting delete-locked and changing
  edit-locked blocks (`blockLocked`). Drag locks are editor-only.
- Premium templates: `isPremium` + `priceAmount`; bought via one-time Checkout (`TemplatePurchase` from the
  `checkout.completed` event); buying needs a plan tier that covers the template.

## Payments and billing

- Provider adapter `src/server/payments` (`PAYMENTS_PROVIDER` = mock | stripe): checkout, portal, price changes,
  cancel at period end, price/coupon sync, webhook parsing into normalized `BillingEvent`s. The mock serves
  `/billing/mock-checkout` and `/billing/mock-portal` and emits events in-process (`MockPaymentProvider`).
- `src/server/billing/`: `events.ts` (`handleBillingEvent`: the only writer of `Subscription`/`Payment`/
  `TemplatePurchase` from the provider; idempotent via `WebhookEvent`), `service.ts` (owner-scoped: billing profile,
  checkout, change plan, cancel/resume, portal, template purchase, overview), `dunning.ts` (worker, hourly),
  `sites.ts` (payment suspension/restore), `coupons.ts` (ADMIN, not owner-scoped), `actions.ts`, `provider.ts`
  (singleton + Next deps). Side effects are injected (`BillingDeps`: invalidate, mailer, brand, billingUrl, now).
- Webhook: `POST /api/webhooks/stripe` (raw body + signature). Never update subscriptions from redirects.
- Purchases require a verified email and a `BillingProfile` (NIP checksum for PL companies, VIES for EU VAT ids).
- Pages (app host): `/plans` (monthly/yearly, coupon, buy or switch), `/billing` (status, cancel/resume, portal,
  payments), `/billing/profile`, `/billing/success`; admin host: `/coupons`.
- Worker-side cache invalidation: `remoteInvalidate` -> `/api/internal/revalidate` (signed token).
- Refunds are made in the Stripe dashboard (mock: "Symuluj zwrot" in the mock portal): `charge.refunded` ->
  `payment.refunded` (cumulative amount, matched by `Payment.providerChargeRef` = PaymentIntent) -> correction invoice.
  A fully refunded template purchase revokes the template.
- E2E create throwaway verified users with `tests/e2e/db.ts` (`createBillingUser`).

## Invoicing

- Adapter `src/server/invoicing` (`INVOICING_PROVIDER` = mock | fakturownia): `createInvoice`, `createCorrection`,
  `getKsefState`, `resendToKsef`, `getPdf`. Fakturownia: paid VAT invoices with our invoice id as unique `oid`
  (duplicate after a timeout -> looked up), `gov_save_and_send` for KSeF (all invoices, B2C included). Mock: local
  numbering (`FV/n/MM/YYYY`, `KOR/...`), PDF via `pdf-lib` + DejaVu subset (`assets/fonts`), KSeF accepted on the next
  sync; a buyer name containing `[fail]` simulates a rejected invoice.
- Flow (`service.ts`): billing events create a PENDING `Invoice` (idempotency key `invoice:{paymentId}`, corrections
  `correction:{paymentId}:{refundedTotal}`) with buyer/seller snapshots and enqueue it (`deps.enqueueInvoice`, BullMQ
  `invoices`). The worker's `issueInvoice` is resumable: create at provider -> store PDF (`InvoiceDocument`, bytea; never
  in the public bucket) -> mail with the PDF attached. Retryable errors retry (6 attempts, exponential); the last
  attempt or a validation error leaves it FAILED ("do ręcznej weryfikacji"). Every 5 minutes the worker re-enqueues
  stale PENDING invoices and syncs KSeF statuses.
- VAT: `Setting` "invoicing" (admin `/settings`): rate 23/8/5/0/zw (+ exemption basis, default art. 113), seller data,
  place of issue. Verified EU business (`reverseCharge`) -> `np` + reverse charge. Prices are gross: net = gross / (1 + rate).
- Panels: client `/billing` lists issued invoices; PDF via `GET /api/invoices/{id}/pdf` (owner, or staff on the admin
  host). Admin `/invoices` (staff view; ADMIN retries FAILED invoices with the buyer's current billing data and resends
  KSeF errors).

## Domains

- Adapters in `src/server/domains/providers`: `HostnameProvider` (`HOSTNAME_PROVIDER` = mock | cloudflare: Cloudflare
  for SaaS custom hostnames, HTTP certificate validation, so clients only need the CNAME to `CUSTOM_DOMAIN_CNAME_TARGET`)
  and `DomainRegistrar` (`REGISTRAR_PROVIDER` = mock | openprovider: REST v1beta, bearer token cached per process).
  Mocks: a hostname activates on the next check (`*fail*` -> ERROR); names with `zajeta`/`taken` are unavailable,
  `odrzucona` fails registration.
- Connected domains (`service.ts`, owner-scoped, plan feature `customDomain`): validation in `src/lib/domain-name.ts`
  (punycode, no IPs/wildcards/platform domain), optional www/apex companion, max hostnames per site (settings), first
  domain is primary. A never-verified claim older than 48 h may be taken over by another site. `status.ts` (shared with
  the worker): `applyHostnameState` (invalidates `host:`/`site:` tags, mails when live), `checkDomains` (worker, every
  minute with backoff by age; active ones daily), `enforceDomainEntitlements` (plan without customDomain: mail, then
  DISABLED after the billing grace period; the client re-enables after upgrading).
- Purchases (`purchase.ts`, owner-scoped, feature `domainPurchase`): search over `Setting` "domains" TLDs with
  `customerPrice` (registrar cost -> PLN, + max(markup %, minimum), + VAT, rounded up to whole zł); prices are
  re-checked on the server; the client pays a yearly Stripe subscription (inline price, metadata `kind: "domain"`).
  `domains/billing.ts` handles those events inside `handleBillingEvent` (never plan logic): first payment -> order
  REGISTERING + job; later payments -> renewal job; every payment is a `Payment` of kind DOMAIN with an invoice.
- Worker (`registration.ts`, queue `domains`): `registerDomain` (contact -> registration with autorenew off -> DNS zone
  www CNAME [+ apex A records] -> connect `www.` as PURCHASED primary), `renewDomain`, hourly `domainMaintenance`
  (reminders 30/7/1 days, expiry, abandoned checkouts, stuck registrations). FAILED orders wait for an admin retry.
- UI: site tab `/sites/{id}/domains` (connect, DNS records, check now, main address, buy, auto-renew, transfer code);
  admin `/domains` (all domains and registrations); domain pricing in admin `/settings`.
- The worker must not import `server-only` modules: entitlements for it come from `entitlements/load.ts`.

## Admin panel

- Permissions (`src/server/auth/permissions.ts`): staff pages and actions call `requirePermission(permission)`; the nav
  is filtered the same way. SUPPORT has everything except `plans.manage`, `settings.manage`, `staff.manage` (ADMIN).
- Every staff mutation calls `audit()` (`src/server/audit`); `/audit` lists it; retention 2 years (daily worker job).
- Clients (`src/server/admin/clients.ts`, not owner-scoped): `/clients` (search by email/name/slug/domain, filters),
  `/clients/{id}` (subscriptions, payments with refunds via `PaymentProvider.refund`, invoices, sites, domains, notes,
  manual plan grant/revoke, block, impersonation history). Manual plans expire in the hourly dunning job.
- Impersonation (`src/server/admin/impersonation.ts`): reason -> `ImpersonationSession` (30 min) -> one-minute signed
  token -> `/impersonate` on the app host -> credentials provider `impersonation` (JWT claim). Panel shows a banner;
  billing/domain-billing actions refuse with `billing.errors.impersonation` (`isImpersonating(user)`). Add the same
  check to any new payment action.
- Moderation (`src/server/moderation`): DSA report form `/report?site=` on the root domain (footer link on every site),
  admin `/reports` (dismiss / suspend with a statement of reasons) and `/sites` (suspend/restore; payment suspensions
  are left to billing). `Site.suspensionNote` is shown in the panel.
- ADMIN only: `/plans` (plans, prices with history, Stripe sync, block tiers; `src/server/admin/plans.ts`), `/staff`
  (roles; never demote the last admin or yourself), `/settings` (invoicing, billing grace, domain pricing, mail text
  overrides in `Setting` "mailTexts").
- Dashboard: `getDashboardMetrics()` (`src/server/admin/metrics.ts`) + SVG `BarChart` (`src/components/admin`).

## Published sites and caching

- Rendering: `src/app/sites/[host]/[[...path]]/page.tsx` is ISR (`generateStaticParams` returns `[]`); the layout applies
  the published theme, navigation (when >1 page), metadata (description, favicon, noindex) and the branding footer.
  `sitemap.xml` and `robots.txt` are route handlers per site (robots disallows everything for noindex/suspended sites).
- Data: `src/server/sites/public.ts` wraps queries in `unstable_cache` with tags `host:{hostname}` and `site:{siteId}`
  (`cache-tags.ts`). Service mutations return the tags to invalidate; server actions call `invalidateTags()`
  (`revalidateTag(tag, { expire: 0 })`). Any change visible on a public site must invalidate `site:{id}`;
  creating/renaming slugs or domains must invalidate the affected `host:{hostname}` tags.
- Suspended sites (`Site.status = SUSPENDED`) render a notice; unpublished sites and pages return 404.

## Layout

```
assets/fonts/               DejaVu Sans subset for mock invoice PDFs (license alongside)
config/dev-domains.json     local custom-domain -> slug map (development only)
prisma/                     schema.prisma, migrations/, seed.ts (users + demo sites "jan", "zawieszona")
messages/{pl,en}.json       UI strings (pl is the source; a test enforces identical keys)
src/proxy.ts                host-based routing (see above)
src/app/(platform)/         root layout for platform hosts
  marketing/                landing (root domain)
  panel/                    client panel (app.): (auth)/..., dashboard, plans, templates, media,
                            sites/[siteId]/(manage)/{pages,theme,template,domains,settings,history}, editor
  admin/                    admin panel (admin.): login, forbidden, (protected)/ dashboard, clients, sites, reports,
                            invoices, domains, templates, coupons, plans, staff, audit, settings; (editor)/
src/app/sites/[host]/       root layout + renderer for published client sites
src/app/api/                auth (wrapped with withPublicOrigin), email/verify, media/upload, health,
                            webhooks/stripe, internal/revalidate, invoices/[id]/pdf
src/app/template-preview/   public template preview (own root layout)
src/app/storage/            local storage file server (dev)
src/app/global-not-found.tsx
src/auth.ts                 NextAuth instance (lazy config)
src/blocks/                 block schemas, defaults, renderers, render config, content parsing, blocks.css
src/themes/                 theme schema/presets/CSS vars, site fonts
src/components/ui/          shadcn/ui primitives (hand-maintained; add via `pnpm dlx shadcn add`)
src/components/              auth, sites, site-manager, editor (Puck), media (picker, dialog, library)
src/i18n/                   next-intl config, request config, typed messages, getTranslator(locale)
src/lib/                    env (zod), db (lazy Prisma proxy), redis, hosts, slug, request helpers, utils
src/server/                 server-only domain code
  auth/                     config, actions, session helpers, roles, password, schemas, email verification
  http/                     routing table, security headers
  media/                    image processing, owner-scoped media service, actions
  storage/                  StorageProvider: local | s3
  mail/                     Mailer adapter: mock | smtp | resend, templates
  rate-limit/               RateLimiter interface: Redis + in-memory
  sites/                    service (owner-scoped: sites, pages, drafts, versions, theme), public (cached reads),
                            actions, cache tags, urls
  entitlements/             plan rules (pure) + loader; test fixtures
  plans/                    plan listing for the pricing page
  payments/                 PaymentProvider: mock | stripe (normalized billing events)
  billing/                  billing events, dunning, owner-scoped billing service, coupons, actions
  invoicing/                InvoicingProvider: mock | fakturownia; invoice lifecycle, client/admin reads, settings
  domains/                  HostnameProvider + DomainRegistrar adapters; connected domains, purchases, worker jobs
  admin/                    staff services: clients, impersonation, plans/catalog, staff, metrics, actions
  audit/                    audit log + retention
  moderation/               DSA reports, site moderation
  cache/                    remote cache invalidation (worker -> app)
  templates/                schema, admin + client services, content mapping, preview, thumbnail job, actions
  jobs/                     BullMQ queues (enqueue helpers)
  thumbnails/               ThumbnailRenderer: mock | playwright
src/worker/                 background worker entry (`pnpm worker`)
src/scripts/                one-off scripts (`billing:sync-prices`)
tests/e2e/                  Playwright specs (+ hosts.ts URL helpers, global-setup cleanup)
```

## Conventions

- Code, identifiers and comments in English; all UI text through next-intl keys (`messages/*.json`), never hard-coded.
- Every env var is declared and validated in `src/lib/env.ts` and documented in `.env.example`. Read config via `getEnv()` (lazy, so builds don't need secrets).
- External integrations live behind an interface with a `mock` implementation selected by a `*_PROVIDER` env var. The app must run locally with no real API keys. `APP_ENV=production` refuses mocks.
- Validate all input with Zod in server actions and route handlers. Server actions return typed state (`{ error?: key }`), never throw for user errors.
- Authorization happens on the server only: `requireUser()`, `requireRole(roles)` from `src/server/auth/session.ts`; role predicates in `roles.ts`.
- Tenant isolation: client-facing service functions take `ownerId` and scope every query to it (`src/server/sites/service.ts`);
  never query client data by id alone from client-facing code. Each new resource gets a cross-tenant access test.
  Staff/billing operations that are not owner-scoped are explicitly marked as such.
- Route handlers that build absolute URLs must use `withPublicOrigin(request)`; Next's `request.url` carries the listen address, not the public host.
- Rate-limit anything abusable (auth, forms, domain APIs) via `getRateLimiter()` + `RATE_LIMITS`.
- Use `server-only` in modules that must never reach the client. Vitest aliases it to a no-op.
- Unit/integration tests sit next to the code (`*.test.ts`); E2E in `tests/e2e`. DB/Redis tests use
  `describe.skipIf(!process.env.DATABASE_URL)` / `REDIS_URL`, create uniquely named data and clean up after themselves.
- E2E sign in through `signInAsClient` / `signInAsAdmin` (they reset the per-IP sign-in counter: all E2E logins come
  from 127.0.0.1). Playwright also starts `pnpm worker` (health on `WORKER_HEALTH_PORT`, default 3101).
- E2E: navigate subdomains with `page.goto` (Chromium resolves `*.localhost`; Node-based `request` does not).
  If the dev server gets stuck in a reload loop ("Compiled in 1ms" on every request), delete `.next` and restart.
- Conventional Commits; small logical commits.
- Prisma enums for client code: import from `@/generated/prisma/enums` (no runtime client).

## Auth model

- Roles: `CLIENT` (default), `SUPPORT`, `ADMIN`. Staff (`ADMIN`, `SUPPORT`) may enter the admin panel; finer permissions per action.
- JWT sessions; the token re-reads role/blocked state from the DB every 5 minutes, so blocking a user (`User.blockedAt`) ends sessions within that window.
- Email verification is not required to sign in; it will gate purchase/publish (Phases 5/2). Magic link and Google sign-ins mark the email verified.
- Session cookies are host-only: `app.` and `admin.` keep separate sessions.
