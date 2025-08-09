# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files and source first
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY src ./src

# Install dependencies (this will trigger prepare script which builds)
RUN pnpm install --frozen-lockfile

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install pnpm in production stage
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy built files and package files
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/pnpm-lock.yaml* ./

# Install only production dependencies (skip prepare script)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts && \
    pnpm store prune

# Create data directory
RUN mkdir -p /app/data && \
    chown -R nodejs:nodejs /app/data

# Set environment
ENV NODE_ENV=production

# Switch to non-root user
USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/app/dist/index.js"]