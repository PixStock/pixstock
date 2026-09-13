# The relayer, built from the monorepo root.
#
#   docker build -f apps/relayer/Dockerfile -t pixstock-relayer .
#
# It holds the only hot key in the system, so the image carries none: every
# secret arrives as an environment variable at run time, and the container
# runs as a non-root user.

FROM node:22-slim AS build
WORKDIR /app

# OpenSSL is Prisma's, and it is needed at build time to generate the client.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# The whole workspace, not a hand-picked subset.
#
# `npm ci` refuses to install unless the lockfile matches every workspace
# manifest, and the relayer's four local packages sit beside two apps it does
# not need. Copying only its own directory makes the lockfile look wrong and
# fails the install; .dockerignore is what keeps the context small.
COPY . .

RUN npm ci
RUN npm run build:packages
RUN npm run build -w @pixstock/relayer

# Drop everything that is not needed to run.
RUN npm prune --omit=dev

FROM node:22-slim AS run
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/relayer/dist ./apps/relayer/dist
COPY --from=build /app/apps/relayer/package.json ./apps/relayer/
COPY --from=build /app/apps/relayer/prisma ./apps/relayer/prisma

USER node
EXPOSE 4000

# The schema is applied before the process serves anything: a relayer answering
# requests against a database it has not migrated fails one order at a time,
# which is the slowest possible way to find out.
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/relayer/prisma/schema.prisma && node apps/relayer/dist/main.js"]
