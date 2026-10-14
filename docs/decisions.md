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
