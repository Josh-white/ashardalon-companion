# Build the app, then run the small Node server that serves it and keeps the
# shared game. Both base images are multi-arch, so this builds natively on a
# Raspberry Pi 5 (arm64).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The commit being built (scripts/auto-update.sh sets it), shown on the game picker.
ARG APP_VERSION=
ENV APP_VERSION=$APP_VERSION
# The tests run here too, so the Pi refuses to deploy a version that fails
# them (scripts/auto-update.sh then keeps the version that worked).
RUN npm test && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 SAVE_FILE=/data/game.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY src/state ./src/state
COPY src/data ./src/data
COPY src/board ./src/board
COPY src/audio/narration.js src/audio/script.js src/audio/soundPrompts.js src/audio/spellKind.js ./src/audio/
COPY cards ./cards
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server/server.js"]
