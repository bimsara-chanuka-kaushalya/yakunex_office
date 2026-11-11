# ProjectFlow web image. Build context: apps/web
FROM node:22-bookworm-slim AS build
WORKDIR /app
# Rewrites are resolved at build time, so the internal API address is a build argument.
ARG API_INTERNAL_URL=http://api:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json tsconfig.json next.config.mjs postcss.config.mjs tailwind.config.ts next-env.d.ts ./
COPY public ./public
COPY src ./src
RUN npm install --no-audit --no-fund && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
