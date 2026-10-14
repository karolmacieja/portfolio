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
