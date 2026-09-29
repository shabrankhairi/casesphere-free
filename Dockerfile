# ──────────────────────────────────────────────────────────────
#  Case Sphere v5 — Multi-stage Dockerfile
#
#  Stage 1 (builder): Install deps + build React app with Vite
#  Stage 2 (runtime): Slim Node image, serve built files + API
# ──────────────────────────────────────────────────────────────

# ── Stage 1: build frontend ───────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

# Install frontend deps
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install

# Copy frontend source and build
COPY frontend/ ./frontend/
RUN cd frontend && npm run build
# Output goes to frontend/../backend/public (see vite.config.js)
# But since we're in /build, output is /build/backend/public

# Install backend deps separately
COPY package.json ./
RUN npm install --omit=dev

# ── Stage 2: production runtime ───────────────────────────────
FROM node:20-alpine AS runtime

# Security: non-root user
RUN addgroup -S casesphere && adduser -S casesphere -G casesphere

WORKDIR /app

# Copy backend node_modules from builder
COPY --from=builder /build/node_modules ./node_modules

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend (Vite output is in backend/public)
COPY --from=builder /build/backend/public ./backend/public

# Copy entrypoint script
COPY scripts/entrypoint.sh ./entrypoint.sh

# Copy package.json for scripts
COPY package.json ./

# Create logs dir, fix permissions
RUN mkdir -p /app/logs /app/uploads \
 && chmod +x /app/entrypoint.sh \
 && chmod 755 /app/uploads \
 && chown -R casesphere:casesphere /app

USER casesphere

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["/app/entrypoint.sh"]
