# --- Stage 1: Install dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/

RUN pnpm install --frozen-lockfile

# --- Stage 2: Build ---
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/dashboard/node_modules ./apps/dashboard/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules

COPY packages/shared ./packages/shared
COPY packages/ui ./packages/ui
COPY apps/dashboard ./apps/dashboard
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Build shared first, then dashboard
RUN pnpm --filter @qyne/shared build
RUN pnpm --filter @qyne/dashboard build

# --- Stage 3: Production runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV NUXT_HOST=0.0.0.0

# Copy the Nuxt output (standalone server)
COPY --from=builder /app/apps/dashboard/.output ./apps/dashboard/.output

RUN addgroup --system --gid 1001 qyne && \
    adduser --system --uid 1001 qyne
USER qyne

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

CMD ["node", "apps/dashboard/.output/server/index.mjs"]
