# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# sqlite3 native bindings require python3 / make / g++
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Keep build tools so sqlite3 can recompile if no prebuilt binary matches Alpine
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled frontend and server bundle from builder
COPY --from=builder /app/dist ./dist

# Persistent volume for the SQLite database
VOLUME ["/data"]

EXPOSE 8787
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=8787

CMD ["node", "dist/server/index.mjs"]
