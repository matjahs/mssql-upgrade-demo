# Dev dependencies stage
FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci

# Build stage
FROM deps AS build
WORKDIR /app

COPY tsconfig.json ./
COPY client ./client
COPY server ./server

RUN npm run build

# Prod dependencies stage
FROM node:22-bookworm-slim AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json

RUN npm ci --omit=dev

# Runtime/final stage
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 3000

CMD ["node", "server/dist/server.js"]