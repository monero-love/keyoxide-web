FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS builder
WORKDIR /app
COPY . .
# Corresponding source for the shipped binary, before dependencies/artifacts exist.
RUN tar -czf /tmp/source.tar.gz .
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm run build

FROM node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
# Pin patched Alpine libraries identified by the release image audit.
RUN apk add --no-cache libcrypto3=3.5.9-r1 libssl3=3.5.9-r1 zlib=1.4-r0
# Runtime needs Node only, never package managers or their dependency trees.
RUN rm -rf /usr/local/lib/node_modules /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ARG CI_COMMIT_SHA
ARG CI_COMMIT_BRANCH
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 \
    ENABLE_PROXY_MODULE=false ENABLE_SERVER_VERIFICATION=false \
    NODE_OPTIONS=--max-old-space-size=256 \
    COMMIT_SHA=$CI_COMMIT_SHA COMMIT_BRANCH=$CI_COMMIT_BRANCH
WORKDIR /app
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/content ./content
COPY --from=builder --chown=node:node /app/views ./views
COPY --from=builder --chown=node:node /app/static ./static
COPY --from=builder --chown=node:node /tmp/source.tar.gz ./source.tar.gz
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "./src/index.js"]
