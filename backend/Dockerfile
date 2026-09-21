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
# Maintenance one-offs, so a pass over the box's data is the reviewed script in
# the repo rather than a file somebody pastes into a running container:
#   docker exec retina-api-1 node --import tsx scripts/ontology-locate.ts --all
# None of them reads the answer key; the eval scripts that do are not here.
COPY scripts ./scripts
# The world's ports and countries, imported as JSON by src/reference at startup.
COPY reference ./reference
# Id lists only, so a run can be started on the dev sample or the holdout. Never the answer key, never reports.
COPY eval/split.json eval/dev-sample.json ./eval/

# The commit this image was built from, so /health can say which one is
# serving. Last, deliberately: it changes on every build and every layer below
# it would be rebuilt with it.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

USER api
EXPOSE 8091
ENV PORT=8091

# Migrations gate startup: new code never serves against an old schema, and a
# failed migration keeps the old container running instead of rolling out a
# broken one (auto-deploy.sh rolls back on a failed health check).
CMD ["sh", "-c", "node db/migrate.mjs && node --import tsx src/index.ts"]
