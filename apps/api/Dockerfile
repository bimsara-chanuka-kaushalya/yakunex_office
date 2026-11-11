# ProjectFlow API image. Build context: apps/api
# Targets:
#   runtime – production image (no dev dependencies)
#   seed    – development seed data (includes ts-node); used only via docker compose --profile tools

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json tsconfig.json nest-cli.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund && npx prisma generate
COPY src ./src
RUN npm run build

FROM build AS seed
CMD ["npx", "ts-node", "--transpile-only", "prisma/seed.ts"]

FROM build AS prod-deps
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
