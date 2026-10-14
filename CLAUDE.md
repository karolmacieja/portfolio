# CLAUDE.md

Multi-tenant SaaS for building portfolio websites (Canva-like drag & drop editor). Full product spec: `SPEC.md`.
Technical decisions log: `docs/decisions.md`. Keep this file up to date when architecture, conventions or commands change.
Next.js 16 ships its own docs in `node_modules/next/dist/docs/` (see `AGENTS.md`); check them before using Next APIs.

## Status

| Phase | Scope                                                                  | State   |
| ----- | ---------------------------------------------------------------------- | ------- |
| 0     | Foundation: Next.js, Docker Compose, Prisma, Auth.js + roles, i18n, CI | done    |
| 1     | Multi-tenancy (host routing), Site/Page, renderer, cache               | next    |
| 2-9   | Editor, plans, templates, payments, invoicing, domains, admin, polish  | pending |

Work in phases; after each phase run lint/typecheck/tests, summarize and wait for the owner's approval.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`)
- PostgreSQL 16 + Prisma 7 (`prisma-client` generator → `src/generated/prisma`, driver adapter `@prisma/adapter-pg`, config in `prisma.config.ts`)
- Auth.js v5 (`next-auth@beta`): credentials (argon2id), magic link, Google (optional); JWT sessions
- next-intl 4 (no locale in URL; cookie `NEXT_LOCALE`, default `pl`)
- Tailwind CSS 4 + shadcn/ui (new-york, neutral) for panels
- Redis (ioredis): rate limiting; BullMQ jobs from later phases
- Vitest 4 (unit), Playwright (E2E)
- Production target: VPS + Coolify, BullMQ workers, Cloudflare in front (see `docs/decisions.md`)

## Commands

```bash
docker compose up -d          # Postgres, Redis, MinIO (+bucket), Mailpit
pnpm install                  # also runs `prisma generate`
pnpm db:migrate               # create/apply migrations (dev)
pnpm db:seed                  # admin/support/client users, password Password123!
pnpm dev                      # http://app.localhost:3000
pnpm lint | pnpm format | pnpm typecheck | pnpm test | pnpm test:e2e | pnpm build
pnpm db:reset                 # drop, migrate, seed
```

E2E against a preinstalled Chromium: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm test:e2e`.
`pnpm typecheck` runs `next typegen` first (route types such as `PageProps<"/login">`).

## Layout

```
prisma/                 schema.prisma, migrations/, seed.ts
messages/{pl,en}.json   UI strings (pl is the source; a test enforces identical keys)
src/app/                routes (Phase 0: path-based; host routing arrives in Phase 1)
  (auth)/               login, register, check-email, email-verified
  api/auth/[...nextauth] Auth.js handlers (wrapped with withPublicOrigin)
  api/email/verify      email verification link
  api/health            DB + Redis readiness probe
  dashboard/, admin/    placeholders guarded by requireUser / requireRole
src/auth.ts             NextAuth instance (lazy config)
src/components/ui/      shadcn/ui primitives (hand-maintained; add via `pnpm dlx shadcn add`)
src/i18n/               next-intl config, request config, typed messages
src/lib/                env (zod), db (lazy Prisma proxy), redis, request helpers, utils
src/server/             server-only domain code
  auth/                 config, actions, session helpers, roles, password, schemas, email verification
  mail/                 Mailer adapter: mock | smtp | resend, templates
  rate-limit/           RateLimiter interface: Redis + in-memory
tests/e2e/              Playwright specs
```

## Conventions

- Code, identifiers and comments in English; all UI text through next-intl keys (`messages/*.json`), never hard-coded.
- Every env var is declared and validated in `src/lib/env.ts` and documented in `.env.example`. Read config via `getEnv()` (lazy, so builds don't need secrets).
- External integrations live behind an interface with a `mock` implementation selected by a `*_PROVIDER` env var. The app must run locally with no real API keys. `APP_ENV=production` refuses mocks.
- Validate all input with Zod in server actions and route handlers. Server actions return typed state (`{ error?: key }`), never throw for user errors.
- Authorization happens on the server only: `requireUser()`, `requireRole(roles)` from `src/server/auth/session.ts`; role predicates in `roles.ts`.
- Tenant isolation (from Phase 1): every query for client data filters by owner through data-layer helpers; add a test for cross-tenant access.
- Route handlers that build absolute URLs must use `withPublicOrigin(request)`; Next's `request.url` carries the listen address, not the public host.
- Rate-limit anything abusable (auth, forms, domain APIs) via `getRateLimiter()` + `RATE_LIMITS`.
- Use `server-only` in modules that must never reach the client. Vitest aliases it to a no-op.
- Unit tests sit next to the code (`*.test.ts`); E2E in `tests/e2e`. Tests requiring Redis use `describe.skipIf(!process.env.REDIS_URL)`.
- Conventional Commits; small logical commits.
- Prisma enums for client code: import from `@/generated/prisma/enums` (no runtime client).

## Auth model

- Roles: `CLIENT` (default), `SUPPORT`, `ADMIN`. Staff (`ADMIN`, `SUPPORT`) may enter the admin panel; finer permissions per action.
- JWT sessions; the token re-reads role/blocked state from the DB every 5 minutes, so blocking a user (`User.blockedAt`) ends sessions within that window.
- Email verification is not required to sign in; it will gate purchase/publish (Phases 5/2). Magic link and Google sign-ins mark the email verified.
- Session cookies are host-only: `app.` and `admin.` keep separate sessions.
