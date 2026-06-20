FROM oven/bun:1-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV API_PORT=8787

COPY api/package.json api/bun.lock ./
RUN bun install --frozen-lockfile --production

COPY api/src ./src

EXPOSE 8787

CMD ["bun", "src/index.ts"]
