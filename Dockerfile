FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY bin ./bin
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /home/node/.wechat-media-agent /workspace \
  && chown -R node:node /home/node/.wechat-media-agent /workspace

USER node

EXPOSE 8787

ENTRYPOINT ["node", "dist/bin/wechat-media-agent.js"]
CMD ["--help"]
