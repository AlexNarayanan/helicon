# ---- build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml pnpm.json ./
RUN pnpm install --frozen-lockfile

COPY . .
ENV CI=true
RUN pnpm build

# ---- runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app

RUN corepack enable && apk add --no-cache curl

# Copy compiled app and migrations
COPY --from=builder /app/build ./build
COPY --from=builder /app/drizzle ./drizzle

# Install production dependencies only
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/pnpm.json ./
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile

# Startup scripts
COPY --from=builder /app/scripts/seed.mjs ./scripts/seed.mjs
COPY scripts/entrypoint.sh ./scripts/entrypoint.sh
RUN chmod +x ./scripts/entrypoint.sh

EXPOSE 7000

ENTRYPOINT ["./scripts/entrypoint.sh"]
