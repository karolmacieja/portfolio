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

Open http://app.localhost:3000 (any `*.localhost` host resolves to your machine in Chrome/Firefox/Safari).

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

## Scripts

| Command                                                              | Description                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm dev`                                                           | Dev server (Turbopack)                                       |
| `pnpm build` / `pnpm start`                                          | Production build / server                                    |
| `pnpm lint`, `pnpm format`, `pnpm typecheck`                         | Code quality                                                 |
| `pnpm test`                                                          | Unit tests (Vitest); Redis tests run when `REDIS_URL` is set |
| `pnpm test:e2e`                                                      | E2E tests (Playwright); needs a migrated and seeded database |
| `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`, `pnpm db:studio` | Database                                                     |

## CI

GitHub Actions (`.github/workflows/ci.yml`): lint, format check, typecheck, unit tests and build; a separate job runs
the Playwright suite against Postgres and Redis service containers.
