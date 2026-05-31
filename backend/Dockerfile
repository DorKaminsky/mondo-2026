# Backend Dockerfile for Fly.io
# Multi-stage: builds TS in stage 1, runs compiled JS with prod-only deps in stage 2.

# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install all deps (incl. dev) for compilation
COPY package*.json ./
RUN npm ci

# Compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Prod-only deps
COPY package*.json ./
RUN npm ci --omit=dev

# Bring in compiled JS, migrations, and migration runner source
COPY --from=build /app/dist ./dist
COPY migrations ./migrations

EXPOSE 3001

CMD ["node", "dist/server.js"]
