# =============================================================================
# LabBuddy — production Dockerfile (multi-stage, single image)
#
# Builds the Vite client and the TypeScript server, then runs the server which
# serves the client bundle from /app/client-dist alongside /api/*.
# =============================================================================

# ----- Stage 1: install + build everything -----
FROM node:22-alpine AS builder
WORKDIR /app

# Native deps needed by better-sqlite3 + resvg-js
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy workspace manifests first for better layer caching
COPY package.json package-lock.json* tsconfig.base.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN npm ci

# Copy source
COPY shared ./shared
COPY client ./client
COPY server ./server

# Vite needs the VITE_* vars baked into the bundle at build time.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build

# ----- Stage 2: slim runtime -----
FROM node:22-alpine AS runtime
WORKDIR /app

# Runtime deps for better-sqlite3 + resvg-js
RUN apk add --no-cache libc6-compat

ENV NODE_ENV=production
ENV PORT=3001

# Copy server build, node_modules (prod-only), and the static client bundle
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/server/package.json ./package.json
COPY --from=builder /app/client/dist ./client-dist
COPY --from=builder /app/node_modules ./node_modules

# Writable directory for the SQLite database (sessions, gamification, notebook).
# Attach a Railway Volume mounted at /app/data so this persists across deploys.
RUN mkdir -p /app/data

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
