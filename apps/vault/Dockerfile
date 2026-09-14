# The vault, built from the monorepo root.
#
#   docker build -f apps/vault/Dockerfile -t pixstock-vault .
#
# A static build behind a server whose only job is to send the right headers —
# `connect-src 'none'` above all, which is the air gap a person can watch the
# browser enforce. The headers are read from apps/vault/vercel.json at run
# time, so the container and a Vercel deployment cannot drift apart.
#
# Nothing here needs a network at run time. The image contains no secret and
# has nothing to configure.

FROM node:22-slim AS build
WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build:packages
RUN npm run build -w @pixstock/vault

FROM node:22-slim AS run
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# The build, the header declaration, and the twenty lines that serve them.
COPY --from=build /app/apps/vault/dist ./apps/vault/dist
COPY --from=build /app/apps/vault/vercel.json ./apps/vault/vercel.json
COPY --from=build /app/scripts/serve-vault.mjs ./scripts/serve-vault.mjs

USER node
EXPOSE 8080

CMD ["node", "scripts/serve-vault.mjs"]
