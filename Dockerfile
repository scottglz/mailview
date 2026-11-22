# mailview: a read-only web UI for Mail-Archiver. Published as ghcr.io/scottglz/mailview (see README.md).
# Node 24 runs the TypeScript server directly (type stripping), so only the web app has a build step.
FROM docker.io/library/node:24.22.3-alpine3.24 AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json vite.config.ts ./
COPY web ./web
COPY server ./server
RUN npm run build && npm test

FROM docker.io/library/node:24.22.3-alpine3.24
ENV NODE_ENV=production
# The same port in demo mode too, so the health check below always finds it.
ENV PORT=8080
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# npm, npx, corepack and yarn come with the base image but never run here: remove them so the image carries less
# code to patch (Trivy flags npm's bundled dependencies).
RUN npm ci --omit=dev && npm cache clean --force  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v*       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY server ./server
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "server/index.ts"]
