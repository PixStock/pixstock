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

# The workspace's own node_modules, not just the hoisted root.
#
# npm hoists what it can and nests what it cannot: @solana/web3.js pulls ws 7,
# which wins the root, so the relayer's own ws 8 lands here. Leaving this
# directory behind made `require('ws')` resolve to 7 at run time and the
# service died on boot — but only once a Pyth token was configured, because
# nothing constructed a socket before that.
COPY --from=build /app/apps/relayer/node_modules ./apps/relayer/node_modules

USER node
EXPOSE 4000

# Two things happen before the process serves anything.
#
# The configuration is checked first, because the failure it produces
# otherwise is forty lines of Prisma schema validation repeated on every
# restart — which says the schema is invalid when the truth is that one
# environment variable is missing.
#
# Then the schema is applied: a relayer answering requests against a database
# it has not migrated fails one order at a time, which is the slowest possible
# way to find out.
CMD ["sh", "-c", "\
if [ -z \"$DATABASE_URL\" ]; then \
  echo 'FATAL: DATABASE_URL is not set.'; \
  echo 'On Railway: add a variable on this service referencing the database,'; \
  echo 'for example  DATABASE_URL = ${{Postgres.DATABASE_URL}}'; \
  echo '(the name before the dot is your Postgres service name, exactly).'; \
  exit 1; \
fi; \
npx prisma migrate deploy --schema apps/relayer/prisma/schema.prisma && \
exec node apps/relayer/dist/main.js"]
