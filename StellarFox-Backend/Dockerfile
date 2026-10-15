FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build:prod

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3001

# Configuration is provided at runtime via Kubernetes ConfigMaps and Secrets.
# ConfigMaps are consumed as environment variables (envFrom / valueFrom) and
# Secrets are mounted as files under /etc/stellarfox/secrets so the app can
# re-read rotated values without a redeploy.
ENV CONFIG_DIR=/etc/stellarfox/config \
    SECRETS_DIR=/etc/stellarfox/secrets

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

CMD ["node", "dist/index.js"]
