# Build stage.
#
# Pinned to the *build* platform, never the target: every production dependency
# is pure JavaScript and `tsc` emits identical output on any architecture, so
# there is nothing here worth emulating. Building this stage natively and only
# varying the runtime stage keeps `linux/arm64` images correct while skipping
# QEMU entirely -- emulated `npm ci` used to die with
# `qemu: uncaught target signal 4 (Illegal instruction)`.
#
# If a genuinely architecture-dependent step is ever added here (a native
# module, a compiled binary), this line has to go and the build needs real
# arm64 -- a native arm64 runner rather than emulation.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json tsconfig.json ./
RUN npm ci

# Copy source code and build
COPY src ./src
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Copy only production dependencies and built code
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Use non-root node user
USER node

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]
