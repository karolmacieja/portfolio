# CLAUDE.md

Multi-tenant SaaS for building portfolio websites (Canva-like drag & drop editor). Full product spec: `SPEC.md`.
Technical decisions log: `docs/decisions.md`. Keep this file up to date when architecture, conventions or commands change.
Next.js 16 ships its own docs in `node_modules/next/dist/docs/` (see `AGENTS.md`); check them before using Next APIs.

## Status

| Phase | Scope                                                                  | State   |
| ----- | ---------------------------------------------------------------------- | ------- |
| 0     | Foundation: Next.js, Docker Compose, Prisma, Auth.js + roles, i18n, CI | done    |
| 1     | Multi-tenancy (host routing), Site/Page, renderer, cache               | done    |
| 2     | Editor (Puck), blocks, themes, draft/publish, versions, media, SEO     | next    |
| 3-9   | Plans, templates, payments, invoicing, domains, admin, polish          | pending |

Work in phases; after each phase run lint/typecheck/tests, summarize and wait for the owner's approval.

## Stack

- Next.js 16 (App Router, Turbopack, `proxy.ts` instead of middleware) + React 19 + TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`)
- PostgreSQL 16 + Prisma 7 (`prisma-client` generator → `src/generated/prisma`, driver adapter `@prisma/adapter-pg`, config in `prisma.config.ts`)
- Auth.js v5 (`next-auth@beta`): credentials (argon2id), magic link, Google (optional); JWT sessions
- Puck (`@puckeditor/core`, formerly `@measured/puck`): page content stored as Puck JSON, rendered with `Render` from `@puckeditor/core/rsc`
- next-intl 4 (no locale in URL; cookie `NEXT_LOCALE`, default `pl`)
- Tailwind CSS 4 + shadcn/ui (new-york, neutral) for panels
- Redis (ioredis): rate limiting; BullMQ jobs from later phases
- Vitest 4 (unit), Playwright (E2E)
- Production target: VPS + Coolify, BullMQ workers, Cloudflare in front (see `docs/decisions.md`)

## Commands

```bash
docker compose up -d          # Postgres, Redis, MinIO (+bucket), Mailpit
pnpm install                  # also runs `prisma generate`
pnpm db:migrate               # create/apply migrations + regenerate the client (Prisma 7 no longer auto-generates)
pnpm db:seed                  # admin/support/client users (password Password123!) + demo sites
pnpm dev                      # http://localhost:3000 (marketing), app./admin./jan.localhost:3000
pnpm lint | pnpm format | pnpm typecheck | pnpm test | pnpm test:e2e | pnpm build
pnpm db:reset                 # drop, migrate, seed
```

`pnpm test` loads `.env` (via Vite `loadEnv`): DB/Redis integration tests need `docker compose up`; they are skipped
when `DATABASE_URL` / `REDIS_URL` are unset. Override the test database in `.env.test.local`.
E2E against a preinstalled Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm test:e2e`.
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

- `/api/health` is served on every host. Internal prefixes are unreachable directly: every request is rewritten.
- Links between hosts use absolute URLs: `platformUrl("app", "/path")`, `siteSubdomainUrl(slug)`.
- Inside a host, use public paths (`/login`, `/dashboard`), never internal ones (`/panel/...`).
- Custom domains: `Domain` rows with status `ACTIVE`; locally also `config/dev-domains.json`
  (e.g. `jan-kowalski.pl.localhost` -> site `jan`; ignored when `APP_ENV=production`).
- Two root layouts: `src/app/(platform)/layout.tsx` (panels, cookies, next-intl) and `src/app/sites/[host]/layout.tsx`
  (client sites: no cookies/session so pages stay static). `src/app/global-not-found.tsx` handles unmatched URLs.

## Published sites and caching

- Content: `Page.draftContent` (always edited) and `Page.publishedContent` (copied on publish). JSON in Puck format,
  validated by `src/blocks/content.ts` (document shape) and `blockPropSchemas` in `src/blocks/config.tsx` (per block).
  Unknown blocks or invalid props are dropped at render time instead of breaking the page.
- Rendering: `src/app/sites/[host]/[[...path]]/page.tsx` is ISR (`generateStaticParams` returns `[]`).
- Data: `src/server/sites/public.ts` wraps queries in `unstable_cache` with tags `host:{hostname}` and `site:{siteId}`
  (`cache-tags.ts`). Service mutations return the tags to invalidate; server actions call `invalidateTags()`
  (`revalidateTag(tag, { expire: 0 })`). Any change visible on a public site must invalidate `site:{id}`;
  creating/renaming slugs or domains must invalidate the affected `host:{hostname}` tags.
- Suspended sites (`Site.status = SUSPENDED`) render a notice; unpublished sites and pages return 404.

## Layout

```
config/dev-domains.json     local custom-domain -> slug map (development only)
prisma/                     schema.prisma, migrations/, seed.ts (users + demo sites "jan", "zawieszona")
messages/{pl,en}.json       UI strings (pl is the source; a test enforces identical keys)
src/proxy.ts                host-based routing (see above)
src/app/(platform)/         root layout for platform hosts
  marketing/                landing (root domain)
  panel/                    client panel (app.): (auth)/login|register|..., dashboard, forbidden
  admin/                    admin panel (admin.): login, forbidden, (protected)/ dashboard
src/app/sites/[host]/       root layout + renderer for published client sites
src/app/api/                auth (wrapped with withPublicOrigin), email/verify, health
src/app/global-not-found.tsx
src/auth.ts                 NextAuth instance (lazy config)
src/blocks/                 Puck block config + prop schemas, content schema/parsing
src/components/ui/          shadcn/ui primitives (hand-maintained; add via `pnpm dlx shadcn add`)
src/components/{auth,sites} feature components
src/i18n/                   next-intl config, request config, typed messages, getTranslator(locale)
src/lib/                    env (zod), db (lazy Prisma proxy), redis, hosts, slug, request helpers, utils
src/server/                 server-only domain code
  auth/                     config, actions, session helpers, roles, password, schemas, email verification
  http/                     routing table, security headers
  mail/                     Mailer adapter: mock | smtp | resend, templates
  rate-limit/               RateLimiter interface: Redis + in-memory
  sites/                    service (owner-scoped), public (cached reads), actions, cache tags, urls
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
- E2E: navigate subdomains with `page.goto` (Chromium resolves `*.localhost`; Node-based `request` does not).
- Conventional Commits; small logical commits.
- Prisma enums for client code: import from `@/generated/prisma/enums` (no runtime client).

## Auth model

- Roles: `CLIENT` (default), `SUPPORT`, `ADMIN`. Staff (`ADMIN`, `SUPPORT`) may enter the admin panel; finer permissions per action.
- JWT sessions; the token re-reads role/blocked state from the DB every 5 minutes, so blocking a user (`User.blockedAt`) ends sessions within that window.
- Email verification is not required to sign in; it will gate purchase/publish (Phases 5/2). Magic link and Google sign-ins mark the email verified.
- Session cookies are host-only: `app.` and `admin.` keep separate sessions.
