FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and compile TypeScript
COPY . .
RUN npm run build

# ── Production image ───────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy compiled JS and schema
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/database ./database
COPY --from=builder /app/run-all-migrations.js ./run-all-migrations.js

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nodeapp \
 && chown -R nodeapp:nodejs /app
USER nodeapp

EXPOSE 5002

CMD ["sh", "-c", "node run-all-migrations.js && node dist/server.js"]
