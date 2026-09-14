# The web dApp, built from the monorepo root.
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_RELAYER_URL=https://relayer.example.com \
#     --build-arg NEXT_PUBLIC_VAULT_URL=https://vault.example.com \
#     -t pixstock-web .
#
# Both are BUILD arguments, not runtime ones. Next inlines NEXT_PUBLIC_* into
# the browser bundle at build time, so setting one only as a runtime variable
# leaves the shipped JavaScript pointing at localhost — a page that loads
# perfectly and cannot reach anything, or a button that goes nowhere.

FROM node:22-slim AS build
WORKDIR /app

# The whole workspace: npm ci checks the lockfile against every workspace
# manifest, and the web app imports three local packages.
COPY . .

RUN npm ci
RUN npm run build:packages

# The defaults are the deployed addresses, not localhost.
#
# An ARG default is not a fallback the code can see past: it sets the
# variable, so the `||` in the source never fires and a build that forgets to
# pass one ships localhost to real users. That is not hypothetical — it went
# out twice. The deployed URL is the safe thing to be wrong about, and an
# override is one --build-arg away.
ARG NEXT_PUBLIC_RELAYER_URL=https://relayer-production-b097.up.railway.app
ENV NEXT_PUBLIC_RELAYER_URL=$NEXT_PUBLIC_RELAYER_URL
ARG NEXT_PUBLIC_VAULT_URL=https://pixstock-production.up.railway.app
ENV NEXT_PUBLIC_VAULT_URL=$NEXT_PUBLIC_VAULT_URL
RUN npm run build -w @pixstock/web

FROM node:22-slim AS run
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Traced output: the server and only the files it was shown to need.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
