# Portfolio SaaS

Multi-tenant platform where clients build and publish portfolio websites with a drag & drop editor, on
`{slug}.{ROOT_DOMAIN}` or their own domain. Product specification: [`SPEC.md`](SPEC.md). Architecture and conventions:
[`CLAUDE.md`](CLAUDE.md). Decisions: [`docs/decisions.md`](docs/decisions.md).

## Requirements

- Node.js 22 (`.nvmrc`), pnpm 10 (`corepack enable`)
- Docker with Compose (Postgres, Redis, MinIO, Mailpit)

## Getting started

```bash
cp .env.example .env              # then set AUTH_SECRET: openssl rand -base64 32
docker compose up -d
pnpm install
pnpm db:migrate                   # applies migrations
pnpm db:seed
pnpm dev
```

Any `*.localhost` host resolves to your machine in Chrome/Firefox/Safari, so every platform host works locally:

| Host                                  | What                                                |
| ------------------------------------- | --------------------------------------------------- |
| http://localhost:3000                 | Marketing site                                      |
| http://app.localhost:3000             | Client panel                                        |
| http://admin.localhost:3000           | Admin panel (separate login)                        |
| http://jan.localhost:3000             | Published demo site (seed)                          |
| http://zawieszona.localhost:3000      | Suspended demo site (seed)                          |
| http://jan-kowalski.pl.localhost:3000 | Demo "custom domain" from `config/dev-domains.json` |

| Account | Email               | Password     |
| ------- | ------------------- | ------------ |
| Admin   | admin@example.com   | Password123! |
| Support | support@example.com | Password123! |
| Client  | client@example.com  | Password123! |

Local services:

| Service               | URL                                             |
| --------------------- | ----------------------------------------------- |
| App                   | http://app.localhost:3000                       |
| Mailpit (sent emails) | http://localhost:8025                           |
| MinIO console         | http://localhost:9001 (minioadmin / minioadmin) |
| Health check          | http://app.localhost:3000/api/health            |

With `MAIL_PROVIDER=smtp` (default in `.env.example`) all emails land in Mailpit; with `MAIL_PROVIDER=mock` they are
printed to the dev server console.

Uploads are stored on disk in `.storage/` by default (`STORAGE_PROVIDER=local`). To use MinIO from docker compose (like
R2 in production) set `STORAGE_PROVIDER=s3`; the remaining `S3_*` values in `.env.example` already match it.

Background jobs (template thumbnails) run in a separate process: `pnpm worker`. With `THUMBNAIL_PROVIDER=mock`
(default) no browser is needed; `playwright` takes real screenshots of the template preview.

### Payments

`PAYMENTS_PROVIDER=mock` (default) replaces Stripe with local pages: "Wybierz" on `/plans` opens a test checkout at
`/billing/mock-checkout`, and "Zarządzaj płatnościami" on `/billing` opens a test portal that simulates renewals, failed
payments and the subscription ending. Seed accounts `start@`, `pro@`, `business@` have manual subscriptions; use
`free@example.com` (no plan) to try buying one. Coupons are created on the admin host (`/coupons`).

Stripe in test mode:

1. Set `PAYMENTS_PROVIDER=stripe` and `STRIPE_SECRET_KEY=sk_test_...`.
2. `pnpm billing:sync-prices` creates products/prices at Stripe for plan prices without `stripePriceId`.
3. Forward webhooks: `stripe listen --forward-to app.localhost:3000/api/webhooks/stripe` and put the printed
   `whsec_...` into `STRIPE_WEBHOOK_SECRET`. Production subscribes to: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`.
4. Enable the customer portal (Billing -> Customer portal) with plan switching off (changes go through `/plans`), and
   card, BLIK and Przelewy24 as payment methods (BLIK/P24 work for one-time template purchases only).

Dunning (reminders and suspension after the grace period) runs hourly in `pnpm worker`.

### Domains

With the mocks (default) clients on Pro/Business connect domains on the site's "Domeny" tab: any
`name.something.localhost` works locally (e.g. `moja-domena.pl.localhost`, opened at
http://moja-domena.pl.localhost:3000), becomes active on "Sprawdź teraz" (or the worker's check) and the subdomain then
redirects to it. Business clients can buy domains (mock registrar; names containing `zajeta` are taken); the worker
registers them after the test payment.

Production:

1. Cloudflare for SaaS on the zone of `ROOT_DOMAIN`: create a proxied record for the fallback origin (e.g.
   `sites.example.com` -> the server), set it as the custom hostnames fallback origin, and set
   `HOSTNAME_PROVIDER=cloudflare`, `CLOUDFLARE_API_TOKEN` (SSL and Certificates: Edit), `CLOUDFLARE_ZONE_ID`,
   `CUSTOM_DOMAIN_CNAME_TARGET=sites.example.com` (and `CUSTOM_DOMAIN_APEX_IPS` if apex proxying is enabled).
2. Openprovider: `REGISTRAR_PROVIDER=openprovider`, `OPENPROVIDER_USERNAME`, `OPENPROVIDER_PASSWORD` (test first
   against the sandbox with `OPENPROVIDER_API_URL`); purchased domains get `OPENPROVIDER_NAMESERVERS` and a zone in
   Openprovider DNS.
3. Admin `/settings`: offered extensions, markup and exchange rates.

### Invoices

Invoices are issued by `pnpm worker` a moment after each payment (keep it running to see them). With
`INVOICING_PROVIDER=mock` (default) PDFs are generated locally (marked as test documents) and KSeF is simulated; the
client sees them on `/billing`, admins on the admin host under `/invoices`. Refunding a payment ("Symuluj zwrot" in the
mock portal, or a refund in the Stripe dashboard) issues a correction. VAT rate and seller data: admin `/settings`.

Fakturownia:

1. In Fakturownia: Settings -> API -> API token; connect KSeF (Settings -> KSeF; start in DEMO mode for testing) and
   keep automatic sending off (the app sends every invoice with `gov_save_and_send`).
2. Set `INVOICING_PROVIDER=fakturownia`, `FAKTUROWNIA_DOMAIN` (your account subdomain), `FAKTUROWNIA_API_TOKEN`,
   optionally `FAKTUROWNIA_DEPARTMENT_ID` (seller data/numbering) and `FAKTUROWNIA_KSEF=false` without KSeF.
3. Fill the seller data and VAT rate in admin `/settings`; issue a test payment and check `/invoices`.

Try it: sign in as the client at http://app.localhost:3000, open "Zarządzaj" on the demo site, edit a page in the
editor, change the theme and publish; then reload http://jan.localhost:3000.

### Admin panel

Sign in at http://admin.localhost:3000 as `admin@example.com` (everything) or `support@example.com` (no plans, settings
or team). Clients: search, notes, manual plans, refunds, blocking and "Zaloguj jako klient" (30 minutes, payments
disabled, audited). Content reports come from the "Zgłoś treść" link in every site footer and are handled under
`/reports`; staff actions are listed under `/audit`.

### Client sites: contact form, statistics, account

Add the "Formularz kontaktowy" block to a page and publish: messages arrive in the panel under "Wiadomości" (and by
mail; with `MAIL_PROVIDER=mock` the mail is printed in the server log). Pro/Business sites count views without cookies
(tab "Statystyki"). `/account` has the data export and account deletion (14-day grace period, erased by the worker).
The landing page, `/cennik` and the legal pages live on http://localhost:3000; legal texts are edited in admin
`/settings`.

## Documentation

- `CLAUDE.md` — architecture, conventions and module map
- `docs/decisions.md` — technical and business decisions
- `docs/deployment.md` — production deployment (VPS + Coolify, Cloudflare)
- `docs/integrations.md` — Stripe, Fakturownia/KSeF, Cloudflare for SaaS, Openprovider, R2, Resend, Google
- `docs/operations.md` — backups, data retention, monitoring

## Scripts

| Command                                                              | Description                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                                           | Dev server (Turbopack)                                       |
| `pnpm build` / `pnpm start`                                          | Production build / server                                    |
| `pnpm lint`, `pnpm format`, `pnpm typecheck`                         | Code quality                                                 |
| `pnpm test`                                                          | Unit tests (Vitest); Redis tests run when `REDIS_URL` is set |
| `pnpm test:e2e`                                                      | E2E tests (Playwright); needs a migrated and seeded database |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`, `pnpm db:studio` | Database                                                     |
| `pnpm worker`                                                        | Background jobs (thumbnails, dunning, invoices, domains)     |
| `pnpm billing:sync-prices`                                           | Create missing Stripe prices for plan prices                 |

## CI

GitHub Actions (`.github/workflows/ci.yml`): lint, format check, typecheck, unit + integration tests (Postgres and
Redis service containers) and build; a separate job runs the Playwright suite against a production build.
