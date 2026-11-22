# syntax=docker/dockerfile:1.7
# Career OS — production image (Next.js standalone + migrations + optional Claude Code CLI)
ARG NODE_IMAGE=node:24-bookworm-slim

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ── Build ────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && node scripts/build-scripts.mjs

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/drizzle \
    HOME=/home/careeros

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 careeros \
 && useradd --system --uid 1001 --gid careeros --create-home --home-dir /home/careeros careeros

# Claude Code CLI (in-app AI with your Claude subscription: CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`)
ARG INSTALL_CLAUDE_CLI=true
RUN if [ "$INSTALL_CLAUDE_CLI" = "true" ]; then \
      npm install -g --no-audit --no-fund --cache /tmp/npm-cache --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code \
      && claude --version; \
    fi \
 && rm -rf /tmp/npm-cache /root/.npm /home/careeros/.npm

COPY --from=build --chown=careeros:careeros /app/.next/standalone ./
COPY --from=build --chown=careeros:careeros /app/.next/static ./.next/static
COPY --from=build --chown=careeros:careeros /app/public ./public
COPY --from=build --chown=careeros:careeros /app/drizzle ./drizzle
COPY --from=build --chown=careeros:careeros /app/dist ./dist
COPY --chown=careeros:careeros scripts/docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /data/documents /data/app /data/backups \
 && chown -R careeros:careeros /data /home/careeros

USER careeros
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "sh", "./docker-entrypoint.sh"]
