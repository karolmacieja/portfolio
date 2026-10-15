# CLAUDE.md

Multi-tenant SaaS for building portfolio websites (Canva-like drag & drop editor). Full product spec: `SPEC.md`.
Technical decisions log: `docs/decisions.md`; deployment, integrations and operations in `docs/`. Keep this file up to date when architecture, conventions or commands change.
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
| 9     | Polish: forms, stats, landing/pricing, mails, RODO, deployment docs    | done  |
| 10    | Group licenses, sponsor footer (+ paid removal)                        | done  |
| 11    | Finance: net profit per plan, revenue/profit stats, forecasts, usage   | done  |
| 12    | Mail template editor, newsletter (consent)                             | next  |

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
| `{ROOT}`, `www.{ROOT}`          | `/marketing/*`        | landing, `/cennik`, legal pages, `/report`        |
| `app.{ROOT}`                    | `/panel/*`            | client panel; `/api/*` passes through             |
| `admin.{ROOT}`                  | `/admin/*`            | admin panel (own login, separate session)         |
| `{slug}.{ROOT}`, custom domains | `/sites/{hostname}/*` | published sites; ISR; no `/api` (404); strict CSP |
| reserved/malformed labels       | 404                   | `RESERVED_SLUGS` in `src/lib/slug.ts`             |

- `/api/health` and `/storage/*` are served on every host. Internal prefixes are unreachable directly.
- Client hosts also serve `/_p/contact` (contact form POST) and `/_p/v` (view beacon): folder `%5Fp` in
  `src/app/sites/[host]/`; `_p` can never be a page path.
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
  is filtered the same way. SUPPORT has everything except `finance.view`, `plans.manage`, `settings.manage`,
  `staff.manage` (ADMIN).
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
  overrides in `Setting` "mailTexts", legal documents).
- Dashboard: `getDashboardMetrics()` (`src/server/admin/metrics.ts`) + SVG `BarChart` (`src/components/charts`).

## Contact forms and statistics (client sites)

- ContactForm block = plain HTML form posting to `/_p/contact` on the site's own host (no JS, pages stay static).
  The handler (`src/app/sites/[host]/%5Fp/contact`) checks Origin/Referer host, honeypot, size, then
  `submitContactMessage` (`src/server/contact/service.ts`): site resolved by host, page must be published and
  contain a ContactForm, rate limits per sender hash and per site, link spam filter. Stores `ContactMessage`
  (sender IP only as a salted hash), mails the owner (Reply-To = visitor) and 303s back to `#contact-sent` /
  `#contact-error` (shown via CSS `:target`). Inbox: `/messages` and the site tab `/sites/{id}/messages`; CSV export
  `/api/messages/export` with plan feature `formsExport`. Retention 2 years (daily worker job).
- System texts in the site language reach blocks through Puck `metadata` (`siteRenderMetadata(locale)`, also passed
  by the editor) as the `site` prop.
- Stats (plan feature `analytics`, `PublishedSite.analytics`): published pages render a 1x1 `<img>` beacon to
  `/_p/v?p={path}` (`src/server/stats/collect.ts`): bots/prefetches skipped, views upserted into `SiteDailyStat`,
  daily unique visitors as `sha256(random daily salt in Redis : site : ip : ua)` in `SiteDailyVisitor`; the daily
  worker job rolls hashes into `SiteDailyUnique` and deletes them (`stats/rollup.ts`, counts kept 25 months).
  Days are Europe/Warsaw (`stats/day.ts`). Panel tab `/sites/{id}/stats` (`getSiteStats`, owner-scoped, SVG
  `BarChart` from `src/components/charts`).

## Account, privacy and legal

- `/account` (app host): profile (name, language), password change/set, sign out everywhere, billing links, JSON
  export (`GET /api/account/export`, `exportUserData`: no secrets), deletion. Services in `src/server/account/`.
- Sessions end after a password change/reset or "sign out everywhere": `User.passwordChangedAt` vs the JWT's
  `issuedAt`, checked on the 5-minute token refresh (impersonation tokens excluded).
- Password reset: `/forgot-password` -> single-use 1 h link (`VerificationToken` with prefix `reset-password:`,
  hashed) -> `/reset-password?token=`; never reveals whether an account exists; rate limited per email and IP.
- Deletion (`account/deletion.ts`, worker-safe, injected `AccountDeps`): request -> `deletionScheduledAt` = +14
  days, sites offline at once (`getPublishedSite` treats them as unpublished), renewals stopped (cancel at period
  end, domain auto-renew off), mail; cancellable. The hourly worker job `eraseDueAccounts` cancels provider
  subscriptions immediately (`PaymentProvider.cancelSubscription`, no refund), mails transfer codes of purchased
  domains, removes custom hostnames and media, deletes sites/assets/billing profile/notes and anonymizes the user
  (`deleted-{id}@deleted.invalid`, blocked). Invoices and payments stay (5 years). The mailer drops mail to
  `@deleted.invalid`. Staff accounts can't self-delete.
- Legal documents (`src/server/legal/`): terms and privacy policy in `Setting` "legal", edited in admin
  `/settings` (defaults: drafts in `defaults.ts`, to be reviewed by a lawyer); placeholders `{company}` `{email}`
  `{brand}` `{domain}` filled from seller data; rendered by `LegalText` (safe mini markup). Each terms change is a new
  version; registration requires the checkbox and stores `termsVersion`/`termsAcceptedAt`; the dashboard asks
  clients with an older/missing version to accept.
- Marketing (root domain): layout with nav/footer, landing (features, published templates, steps, pricing),
  `/cennik` (plan catalog + FAQ), `/regulamin`, `/polityka-prywatnosci`. Pricing cards come from `listActivePlans`
  (`PricingTable`, `PlanFeatureList` shared with the panel).
- Onboarding: the dashboard shows "Pierwsze kroki" (plan -> template -> edit and publish) until the first site.

## Mail

- Every transactional mail goes through `buildLinkMail` (`src/server/mail/templates.ts`): texts from
  `messages.email.{kind}` (+ admin overrides), rendered with the React Email layout `src/server/mail/layout.tsx`
  (HTML + plain text), optional quoted user text and `replyTo`. Add a kind to `LINK_MAIL_KINDS`, messages
  (`email.{kind}`, `adminSettings.mailKinds.{kind}`) in both locales.

## Group licenses

- `Organization` = one license: plan, seats, source `STRIPE` (self-service, inline-priced provider subscription with
  quantity = seats, metadata `kind: "license"`) or `MANUAL` (staff, agreed price invoiced outside Stripe, optional
  `validUntil`), status, manager, sponsor name/url, `sponsorFooter` (staff switch for the whole license),
  `membersCanBuyDomains`, join code (+ `joinLinkEnabled`). `OrganizationMember` (a user is in at most one org; role
  MANAGER/MEMBER, `sponsorFooterHidden` = staff switch per member), `OrganizationInvite` (hashed token, 14 days).
- Entitlements (`entitlements/load.ts`, `buildEntitlements`): the better of the user's own entitled subscription and
  an active license seat (by plan `position`); `source` says which; `license` is set for members either way; a
  license with `membersCanBuyDomains` adds `customDomain` + `domainPurchase` (the member pays for the domain). Active
  = ACTIVE/PAST_DUE and, for manual ones, before `validUntil` (`isLicenseActive`).
- Billing (`licenses/billing.ts`, routed from `billing/events.ts` by metadata kind): payments are `Payment` kind
  LICENSE (paid by the manager, `organizationId`) or ADDON (sponsor removal) with VAT invoices. License status changes
  run `applyLicenseStatus` (restore members' sites, or pause sites of members left without a plan + mail
  `licenseEnded`). Plan dunning never pauses sites of members with an active seat; a member's own plan ending
  doesn't either. Manual licenses expire in the hourly worker job (`licenses/maintenance.ts`).
- Provider: `createInlineSubscriptionCheckout` (unit price × quantity, month/year) and `setSubscriptionQuantity`
  (prorated seat changes); `ProviderSubscription.quantity`. The mock resolves license/add-on subscriptions from the DB.
- Sponsor footer: `sponsorOf()` in `sites/public.ts` -> `PublishedSite.sponsor` -> site footer "Strona wspierana
  przez …" (rel="sponsored"). Hidden when the license or member switch is off or the member bought the removal
  (`SponsorRemoval`, Setting "sponsor": enabled, mode MONTHLY|ONCE, gross amount; admin `/settings`). Any change
  invalidates the members' site tags (`memberSiteTags`).
- Client UI (app host): `/licenses` (buy: plan with seat prices, interval, seats, sponsor), `/organization` (seat,
  sponsor removal, upgrade hint, leave; manager: seats, renewal, settings, join link, e-mail invitations, members),
  `/join?code=|invite=`. `/plans` lets members buy their own better plan. Admin (`licenses.manage`, SUPPORT too):
  `/licenses` (list, create manual), `/licenses/{id}` (settings, sponsor switches, members, payments); seat prices
  per plan on `/plans` (`Plan.seatPriceMonthly/Yearly`, null = not offered).
- Account erasure cancels licenses the user pays for and their monthly add-on, removes memberships and invitations.

## Finance and usage

- Costs (Setting "finance", admin `/settings`, `finance/settings.ts`): payment fee % + fixed per charge,
  infrastructure bill (split over active paying clients, or a fixed amount per client), other fixed monthly costs.
  VAT comes from the invoicing settings (`salesVatRate`). Active clients = paying provider subscribers + seats of
  active licenses (`countActiveClients`).
- `finance/economics.ts` (pure, also used in the browser): `priceEconomics(gross, months, inputs, units)` -> net, VAT,
  fee, cost, profit, margin. Admin `/plans` shows it live under every price and seat price (`PriceInput`); plans have
  `highlights` ("what's in the plan", shown first on pricing cards) and `isFeatured`.
- Profit report (`finance/report.ts` pure + `finance/load.ts`): 12 months of paid payments by source (SUBSCRIPTION,
  LICENSE, TEMPLATE, DOMAIN, ADDON) net of refunds, VAT (none for reverse charge), fees (kept on refunds), domain
  registrar costs (converted with the domain exchange rates), fixed costs; MRR by source (plans, licenses, domains
  /12, monthly add-ons); forecast MRR(m+1) = MRR × (1 − churn) + new MRR (3-month average) + one-time sales; break-even.
  Admin `/finance` (permission `finance.view`, ADMIN only).
- Usage (`finance/usage.ts`, worker-safe): `UsageSnapshot` per day (clients, paying, sites, published, storage, DB
  size via `pg_database_size`, page views) taken by the daily worker job before the stats roll-up; an empty history is
  backfilled from creation dates. Capacity (Setting "capacity": DB GB, storage GB, monthly page views, published
  sites, warn %) + `capacity-forecast.ts` (least-squares daily trend, days to warning/full, 10-year horizon). Admin
  `/usage` (`clients.view`); per-client usage (`getClientUsage`) on the dashboard and the admin client card.
- `BarChart` (`components/charts`) supports negative values (zero line), used for losses.

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
  marketing/                landing, cennik, regulamin, polityka-prywatnosci, report (root domain)
  panel/                    client panel (app.): (auth)/{login,register,forgot-password,reset-password}, dashboard,
                            account, messages, plans, templates, media, editor, licenses, organization, join,
                            sites/[siteId]/(manage)/{pages,theme,template,domains,stats,messages,settings,history}
  admin/                    admin panel (admin.): login, forbidden, (protected)/ dashboard, clients, sites, reports,
                            invoices, domains, templates, coupons, plans, staff, audit, settings, licenses, finance,
                            usage; (editor)/
src/app/sites/[host]/       root layout + renderer for published client sites; %5Fp/{contact,v} (form, beacon)
src/app/api/                auth (wrapped with withPublicOrigin), email/verify, media/upload, health,
                            webhooks/stripe, internal/revalidate, invoices/[id]/pdf, account/export, messages/export
src/app/template-preview/   public template preview (own root layout)
src/app/storage/            local storage file server (dev)
src/app/global-not-found.tsx
src/auth.ts                 NextAuth instance (lazy config)
src/blocks/                 block schemas, defaults, renderers, render config, content parsing, blocks.css
src/themes/                 theme schema/presets/CSS vars, site fonts
src/components/ui/          shadcn/ui primitives (hand-maintained; add via `pnpm dlx shadcn add`)
src/components/              auth, account, sites, site-manager, editor (Puck), media, contact, charts, legal,
                            marketing, plans, admin, action-form (generic ActionState form)
src/i18n/                   next-intl config, request config, typed messages, getTranslator(locale)
src/lib/                    env (zod), db (lazy Prisma proxy), redis, hosts, slug, request helpers, utils
src/server/                 server-only domain code
  auth/                     config, actions, session helpers, roles, password, schemas, email verification
  http/                     routing table, security headers
  media/                    image processing, owner-scoped media service, actions
  storage/                  StorageProvider: local | s3
  mail/                     Mailer adapter: mock | smtp | resend, React Email layout, templates, overrides
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
  account/                  profile, password, reset, export, deletion/erasure (RODO)
  contact/                  contact form messages (public submit, owner inbox, retention)
  stats/                    cookie-less page views: collect, roll-up, owner reports
  legal/                    terms/privacy documents (defaults, versions, placeholders)
  licenses/                 group licenses: service (client), admin, billing events, settings, maintenance
  finance/                  cost settings, unit economics, profit report + forecast, usage snapshots, capacity
  cache/                    remote cache invalidation (worker -> app)
  templates/                schema, admin + client services, content mapping, preview, thumbnail job, actions
  jobs/                     BullMQ queues (enqueue helpers)
  thumbnails/               ThumbnailRenderer: mock | playwright
src/worker/                 background worker entry (`pnpm worker`)
src/scripts/                one-off scripts (`billing:sync-prices`)
tests/e2e/                  Playwright specs (+ hosts.ts URL helpers, db.ts fixtures, global-setup cleanup)
Dockerfile                  one image for web (`pnpm start`) and worker (`pnpm worker`); see docs/deployment.md
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
- next-intl key types are large: if a component reports `TS2590`/an unknown namespace for valid keys, read the labels
  into a plain object first (`const label = { name: t("name") }`, see `components/admin/license-fields.tsx`).

## Auth model

- Roles: `CLIENT` (default), `SUPPORT`, `ADMIN`. Staff (`ADMIN`, `SUPPORT`) may enter the admin panel; finer permissions per action.
- JWT sessions; the token re-reads role/blocked state from the DB every 5 minutes, so blocking a user (`User.blockedAt`) ends sessions within that window.
- Email verification is not required to sign in; it gates purchases. Magic link, Google sign-ins and password resets mark the email verified.
- Session cookies are host-only: `app.` and `admin.` keep separate sessions.
