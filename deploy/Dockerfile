# syntax=docker/dockerfile:1
# The server image (M13a): the API serves the built web UI itself (WEB_ROOT), so one container answers everything
# behind Caddy. Built on the server from the repo — no registry.

FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@11 && pnpm --version
WORKDIR /repo

# Everything needed to build — and, kept as its own target, to run `prisma migrate deploy` (the CLI is a dev dependency).
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api apps/api
COPY apps/web apps/web
# The workspace lists apps/*; only the manifest of desktop is needed for the lockfile to resolve.
COPY apps/desktop/package.json apps/desktop/package.json
RUN pnpm install --frozen-lockfile --filter api... --filter web...
RUN pnpm --filter api build && pnpm --filter web build
# Production dependencies only, the same way the desktop package stages the API (apps/desktop/scripts/prepare-resources.mjs).
# --ignore-scripts: the API's postinstall is `prisma generate`, whose CLI is a dev dependency — and the generated client
# is already compiled into dist/generated.
RUN pnpm --filter api --prod deploy --legacy --ignore-scripts /out/api \
  && rm -rf /out/api/src /out/api/test /out/api/vitest.config*.ts

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_ROOT=/app/web
WORKDIR /app/api
COPY --from=build --chown=node:node /out/api /app/api
COPY --from=build --chown=node:node /repo/apps/web/dist /app/web
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
