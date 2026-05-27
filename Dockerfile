# syntax=docker/dockerfile:1

FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY api/package.json api/package-lock.json* ./api/
COPY frontend/package.json frontend/package-lock.json ./frontend/

RUN npm ci --no-audit --no-fund --prefer-offline && \
    cd api && npm ci --no-audit --no-fund --prefer-offline && \
    cd ../frontend && npm ci --no-audit --no-fund --prefer-offline

# =========================

FROM deps AS builder

WORKDIR /app

COPY . .

ENV VITE_API_URL=/api
ENV NODE_ENV=production

RUN cd frontend && npm run build

# =========================

FROM node:22-slim AS runner

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/api ./api
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/models ./models
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/frontend/dist ./frontend/dist

RUN mkdir -p tmp/uploads

HEALTHCHECK --interval=30s --timeout=10s \
CMD curl -f http://localhost:3001 || exit 1

EXPOSE 3001

CMD ["node", "api/server.js"]