# ──────────────────────────────────────────────────────────────────────────────
# OpenZync Frontend — Production Docker image
# ──────────────────────────────────────────────────────────────────────────────
# Multi-stage build:
#   1. builder — installs dependencies + builds the Next.js app
#   2. runner  — minimal image with standalone server + assets only
#
# Usage:
#   docker build -t openzync-frontend:latest -f frontend/Dockerfile frontend/
#
# The frontend expects a reverse proxy (nginx) to route /v1/* requests
# to the API.  NEXT_PUBLIC_API_URL defaults to "" (relative URLs), so
# the frontend makes requests like /v1/sessions that reach the API
# through the shared nginx origin.
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder
WORKDIR /app

# Install ALL dependencies (dev deps needed for build).
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build the standalone server.
COPY . .
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

# ── Stage 2: Production runner ────────────────────────────────────────────────
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner
WORKDIR /app

# Run as non-root.
RUN adduser -D -h /home/appuser appuser && chown appuser:appuser /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Copy standalone server (includes only the required node_modules).
COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
# Copy static assets and public files (not bundled in standalone).
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appuser /app/public ./public

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
