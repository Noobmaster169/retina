# syntax=docker/dockerfile:1
# The backend API image. Built from this directory:
#   docker build -t retina-api backend
# Runs TypeScript directly via tsx — there is no build step to drift from the source.

FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

# ---- dependencies -----------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# Dev dependencies stay in on purpose: tsx is one of them.
RUN pnpm install --frozen-lockfile

# ---- runtime ----------------------------------------------------------------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S api -G nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
COPY db ./db

USER api
EXPOSE 8091
ENV PORT=8091

# Migrations gate startup: new code never serves against an old schema, and a
# failed migration keeps the old container running instead of rolling out a
# broken one (auto-deploy.sh rolls back on a failed health check).
CMD ["sh", "-c", "node db/migrate.mjs && node --import tsx src/index.ts"]
