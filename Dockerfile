# syntax=docker/dockerfile:1
# One image for the web app (`pnpm start`) and the background worker (`pnpm worker`); see docs/deployment.md.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /app

FROM base AS build
# Placeholders for build-time tooling only (prisma generate, next build); runtime config comes from the platform.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build REDIS_URL=redis://localhost:6379 \
    AUTH_SECRET=build-time-placeholder-not-used-at-runtime-0000 ROOT_DOMAIN=example.com
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
# Chromium and fonts for template thumbnails (THUMBNAIL_PROVIDER=playwright).
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-noto-color-emoji ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
