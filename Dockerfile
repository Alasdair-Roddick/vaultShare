# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS backend
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend ./
COPY --from=frontend-builder /app/dist ./public
RUN npm prune --omit=dev \
 && mkdir -p uploads \
 && groupadd --system vaultlight \
 && useradd --system --gid vaultlight --home /app vaultlight \
 && chown -R vaultlight:vaultlight /app

VOLUME ["/app/uploads"]
EXPOSE 3001
USER vaultlight
CMD ["node", "server.js"]
