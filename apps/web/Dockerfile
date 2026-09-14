# The web dApp, built from the monorepo root.
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_RELAYER_URL=https://relayer.example.com \
#     -t pixstock-web .
#
# NEXT_PUBLIC_RELAYER_URL is a BUILD argument, not a runtime one. Next inlines
# NEXT_PUBLIC_* into the browser bundle at build time, so setting it only as a
# runtime variable leaves the shipped JavaScript pointing at localhost:4000 —
# a page that loads perfectly and cannot reach anything.

FROM node:22-slim AS build
WORKDIR /app

# The whole workspace: npm ci checks the lockfile against every workspace
# manifest, and the web app imports three local packages.
COPY . .

RUN npm ci
RUN npm run build:packages

ARG NEXT_PUBLIC_RELAYER_URL=http://localhost:4000
ENV NEXT_PUBLIC_RELAYER_URL=$NEXT_PUBLIC_RELAYER_URL
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
