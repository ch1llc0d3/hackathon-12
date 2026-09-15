FROM node:22-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787

WORKDIR /app

COPY --chown=node:node package.json ./
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node

EXPOSE 8787

CMD ["node", "server/index.mjs"]
