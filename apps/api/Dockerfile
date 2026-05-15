# --- Stage 1: Install dependencies ---
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

# Copy workspace config and lockfile first (cache layer)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# --- Stage 2: Build ---
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./

# Build shared package first, then api
RUN pnpm --filter @qyne/shared build
RUN pnpm --filter @qyne/api build

# --- Stage 3: Production runtime ---
FROM node:22-alpine AS runner
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy only production dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --frozen-lockfile --prod

# Copy built output
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy drizzle migrations (needed for db:migrate)
COPY apps/api/drizzle ./apps/api/drizzle
COPY apps/api/drizzle.config.ts ./apps/api/

# Non-root user for security
RUN addgroup --system --gid 1001 qyne && \
    adduser --system --uid 1001 qyne
USER qyne

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "apps/api/dist/index.js"]
