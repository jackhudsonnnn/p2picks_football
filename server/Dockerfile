# ──────────────────────────────────────────────────────────────────────────────
# P2Picks Server — Multi-Stage Dockerfile
# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 (builder): Install all deps, compile TypeScript → dist/
# Stage 2 (runner):  Copy only production deps + compiled JS
#
# Build:  docker build -t p2picks-server ./server
# Run:    docker run --env-file ./server/.env -p 5001:5001 p2picks-server
# ──────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first (cache layer)
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for tsc)
RUN npm ci

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npx tsc -p .

# ── Stage 2: Production ────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install production-only dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Switch to non-root
USER appuser

# Runtime configuration
ENV NODE_ENV=production
ENV PORT=5001
EXPOSE 5001

# Health check (lightweight — just hits the metrics endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5001/metrics || exit 1

CMD ["node", "dist/index.js"]
