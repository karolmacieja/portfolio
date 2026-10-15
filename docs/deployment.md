# Production deployment (VPS + Coolify)

Decision 1 in `decisions.md`: a VPS managed by [Coolify](https://coolify.io), Cloudflare in front. Everything below
also works with plain Docker Compose + Caddy; Coolify only automates builds, TLS for the platform hosts and restarts.

## Topology

```
Cloudflare (DNS, proxy, Cloudflare for SaaS custom hostnames, R2)
        │  *.ROOT_DOMAIN, ROOT_DOMAIN, custom domains (fallback origin)
        ▼
VPS: Coolify (Traefik) ──► web      (Dockerfile, `pnpm start`, port 3000, 1+ replicas)
                           worker   (same image, `pnpm worker`, 1 replica, health on WORKER_HEALTH_PORT)
                           postgres (16, persistent volume, daily backups → see operations.md)
                           redis    (7, AOF on, persistent volume)
Object storage: Cloudflare R2 (public bucket on a media subdomain)  ·  Mail: Resend
```

Sizing to start: 2 vCPU / 4 GB RAM is enough for the web app, worker, PostgreSQL and Redis; move PostgreSQL to a
managed instance or a second VPS when it outgrows that.

## 1. DNS and Cloudflare

1. Add the platform domain (`ROOT_DOMAIN`, e.g. `folio.pl`) to Cloudflare.
2. Records (proxied, orange cloud): `@`, `www`, `app`, `admin` and wildcard `*` → the VPS IP.
3. SSL/TLS mode **Full (strict)**; create a Cloudflare Origin Certificate for `ROOT_DOMAIN` + `*.ROOT_DOMAIN` and
   install it in Coolify/Traefik (or let Traefik issue Let's Encrypt certificates with the DNS challenge).
4. Cloudflare for SaaS (custom domains of clients): enable it on the zone, create a proxied record for the fallback
   origin (e.g. `sites.ROOT_DOMAIN` → VPS), set it as the fallback origin and use it as
   `CUSTOM_DOMAIN_CNAME_TARGET` (clients CNAME their domains to it). Details in `integrations.md`.
5. `TRUSTED_PROXY_HOPS=2` (Cloudflare + Traefik) so rate limits see the real client IP.

## 2. Coolify resources

1. **PostgreSQL 16** and **Redis 7** as Coolify databases (persistent volumes; Redis with `appendonly yes`).
   Enable Coolify's scheduled PostgreSQL backups to S3/R2 (operations.md).
2. **web**: application from this Git repository, build pack _Dockerfile_, port 3000, domains
   `https://ROOT_DOMAIN, https://www.ROOT_DOMAIN, https://app.ROOT_DOMAIN, https://admin.ROOT_DOMAIN` and the
   wildcard `https://*.ROOT_DOMAIN`, plus the fallback origin host for custom domains (Traefik catch-all rule
   `HostRegexp(`.+`)` with a low priority so client domains reach the app). Health check path `/api/health`.
   _Pre-deployment command_: `pnpm db:deploy` (applies migrations before the new version starts).
3. **worker**: the same repository and Dockerfile, _start command_ `pnpm worker`, no domain, one replica
   (BullMQ schedulers must not run twice with different code). `INTERNAL_APP_URL=http://web:3000` (the internal
   service name) so it can invalidate the app's cache.
4. Environment variables: one shared set for web and worker (Coolify "shared variables"), from `.env.example`.
   Production must set `APP_ENV=production`; the app refuses to start with any `mock` provider or local storage.

### Required production variables

| Area     | Variables                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Core     | `APP_ENV=production`, `ROOT_DOMAIN`, `APP_PROTOCOL=https`, `BRAND_NAME`, `AUTH_SECRET` (32+ random bytes), `TRUSTED_PROXY_HOPS` |
| Data     | `DATABASE_URL`, `REDIS_URL`                                                                                                     |
| Mail     | `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` (verified domain)                                                         |
| Storage  | `STORAGE_PROVIDER=s3`, `S3_*` (R2 endpoint, bucket, keys, `S3_PUBLIC_URL`)                                                      |
| Payments | `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `TAX_ID_PROVIDER=vies`                                |
| Invoices | `INVOICING_PROVIDER=fakturownia`, `FAKTUROWNIA_*`                                                                               |
| Domains  | `HOSTNAME_PROVIDER=cloudflare`, `CLOUDFLARE_*`, `CUSTOM_DOMAIN_*`; `REGISTRAR_PROVIDER=openprovider`, `OPENPROVIDER_*`          |
| Worker   | `INTERNAL_APP_URL`, `THUMBNAIL_PROVIDER=playwright` (Chromium is in the image), `WORKER_HEALTH_PORT`                            |
| Optional | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `UPLOAD_MAX_MB`                                                                         |

## 3. First deployment

1. Deploy PostgreSQL and Redis, then web (runs migrations) and worker.
2. Seed production data once — plans and the first admin — from the web container:
   `pnpm db:seed` creates demo users with a known password, so in production instead create the plans in the
   admin panel or run the seed and **immediately** change the admin password and delete the demo accounts.
3. Sign in at `https://admin.ROOT_DOMAIN`, then in `/settings`: seller data and VAT (invoices), domain pricing,
   billing grace period, legal documents (review the drafts with a lawyer) and mail texts.
4. `/plans`: check plans and prices, click "Synchronizuj ceny ze Stripe" (or run `pnpm billing:sync-prices`).
5. Stripe webhook → `https://app.ROOT_DOMAIN/api/webhooks/stripe` (events in `integrations.md`).
6. Smoke test: register, buy a plan with a Stripe test card in test mode, publish a site, connect a test domain,
   check the invoice in Fakturownia/KSeF test environment, then switch keys to live.

## 4. Updates

Push to the deployed branch → Coolify builds the image, runs `pnpm db:deploy`, starts the new web container and
switches traffic when `/api/health` is green, then restarts the worker. Migrations must stay backward compatible
with the previous release for that window (add columns first, remove them in a later release).

## Alternative: Vercel

Possible for the web app only: the worker (BullMQ, Playwright thumbnails), PostgreSQL and Redis still need a
server, wildcard subdomains need a Vercel Pro/Enterprise wildcard domain, and custom domains would go through
Vercel's domains API instead of Cloudflare for SaaS (a new `HostnameProvider`). Not recommended for this product.
