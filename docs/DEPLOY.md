# Deploying

Three pieces, three shapes: a static PWA, a Next.js app, and a Node service
with a database and a hot key.

Each has a Dockerfile that builds from the repository root, and each has been
built and run locally before being written about here.

---

## All three on Railway

One project, four services: Postgres and the three above, all from this one
repository.

### Tell each service to use its Dockerfile

Do this **first**, before anything else. Railway's auto-detector otherwise
takes over, finds an npm workspace with no start script, and fails with
*"No start command detected"* — it never looks at the Dockerfile.

In each service, **Settings**:

| Field | Value (web shown) |
|---|---|
| Source → **Root Directory** | `/` |
| Build → **Builder** | `Dockerfile` |
| Build → **Dockerfile Path** | `apps/web/Dockerfile` |

`apps/relayer/Dockerfile` and `apps/vault/Dockerfile` for the other two.

**Root directory must stay `/`.** The Dockerfiles copy the whole workspace on
purpose: `npm ci` validates the lockfile against every manifest, and each app
imports local packages. Pointing a service at `apps/web` gives it a build
context with no lockfile and no packages.

The `railway.json` beside each Dockerfile says the same thing, for anyone who
prefers config over dashboard: set Settings → **Config-as-code** to
`apps/web/railway.json`. Either route works; neither is read by default.

| Service | Dockerfile | Port |
|---|---|---|
| relayer | `apps/relayer/Dockerfile` | 4000 |
| web | `apps/web/Dockerfile` | 3000 |
| vault | `apps/vault/Dockerfile` | 8080 |

Add the Postgres plugin first; it publishes `DATABASE_URL`, which the relayer
reads with Railway's `${{Postgres.DATABASE_URL}}` reference.

### In the order that avoids rework

**1. Relayer.** Deploy it first: the other two need its public URL.

```
DATABASE_URL     = ${{Postgres.DATABASE_URL}}
SOLANA_CLUSTER   = mainnet-beta
SOLANA_RPC_URL   = <your Helius URL>
RELAYER_SECRET_KEY = <the hot key>
PYTH_PRO_TOKEN   = <from pythdata.app>
PYTH_ROUTER_URLS = wss://pyth-lazer-0.dourolabs.app/v1/stream
RELAYER_ALLOW_BROADCAST = false
```

Generate a domain, then check `/healthz` before going further. It names every
capability that is absent rather than answering a bare "ok".

**2. Vault.** No variables at all — it has nothing to configure and holds no
secret. Generate a domain and open it on a phone.

**3. Web.** One build-time variable:

```
NEXT_PUBLIC_RELAYER_URL = https://<relayer domain>
```

> **The one that catches everyone.** Next inlines `NEXT_PUBLIC_*` into the
> browser bundle *at build time*. Setting it after the fact leaves the shipped
> JavaScript pointing at `localhost:4000` — a page that loads perfectly and
> cannot reach anything. Set it, then redeploy.

**4. Back to the relayer,** now that the other two have domains:

```
ALLOWED_ORIGINS = https://<web domain>,https://<vault domain>
```

Without it the browser's CORS check refuses every call, and the web app
reports the relayer as not answering.

### Checking it

```bash
curl https://<relayer domain>/healthz
curl "https://<relayer domain>/v1/prices?symbols=TSLAx"
```

Then open the web app, pair a vault, and build an order. `/healthz` should
report `pythStream.connected: true` and a `noncePool` above zero before you
film anything.

---

The one that carries risk is the relayer. Everything below assumes its key is
a hot key holding only what it can afford to lose — fees and token-account
rent — because that is all it is ever able to spend.

---

## The vault — `vault.pixstock.xyz`

A static build. `apps/vault/vercel.json` carries the configuration, and its
headers are the point:

```
connect-src 'none'
```

The vault's air gap is enforced three ways, and this is the one a judge can
check without reading any code: open devtools, watch a `fetch` be refused by
the browser itself. The other two are the lint rule that fails the build on
`fetch`, `XMLHttpRequest`, `WebSocket` and `EventSource`, and the fact that
nothing in the app has a URL to call.

Verified in a real browser with those exact headers: the app boots, the
service worker installs and reaches `active`, and an outbound `fetch` is
blocked with *"Refused to connect because it violates the document's Content
Security Policy"*.

**HTTPS is not optional here.** The camera and WebAuthn both require a secure
context; on plain HTTP the vault cannot scan or ask for a fingerprint.

Any static host works. On Vercel, point the project's root directory at
`apps/vault`.

## The web app — `app.pixstock.xyz`

Next.js. `apps/web/vercel.json` carries the build commands for the monorepo.
One environment variable:

```
NEXT_PUBLIC_RELAYER_URL=https://relayer.pixstock.xyz
```

It is public by design — the browser calls the relayer directly, and nothing
secret passes through this app.

## The relayer — `relayer.pixstock.xyz`

```bash
docker build -f apps/relayer/Dockerfile -t pixstock-relayer .
```

The image carries no secrets and runs as a non-root user; everything arrives
as environment variables at run time. Migrations are applied before the
process serves anything — a relayer answering requests against an unmigrated
database fails one order at a time, which is the slowest way to find out.

Environment: copy `apps/relayer/.env.example`. The ones that decide behaviour:

| Variable | Effect if missing |
|---|---|
| `RELAYER_SECRET_KEY` | Orders can be built and priced, never co-signed or sent |
| `PYTH_PRO_TOKEN` | Orders travel with no price, and the vault asks the holder to accept that |
| `RELAYER_ALLOW_BROADCAST` | Nothing is ever sent. This is the default, deliberately |
| `ALLOWED_ORIGINS` | CORS refuses the web app |
| `DATABASE_URL` | Nothing starts |

`GET /healthz` names every capability that is absent rather than answering a
bare "ok". Read it first, every time.

### Before a demo

```bash
npm run nonces:status -w @pixstock/relayer
```

It prints the hot key, its balance, and the nonce pool. Two things to check:

- **The balance.** An empty fee payer fails at the last step of the flow,
  which is the worst place to find out.
- **The pool.** With no durable nonce an order expires with its blockhash in
  about ninety seconds — enough to demo, tight to film.

```bash
npm run nonces:create -w @pixstock/relayer -- 3
```

That spends real SOL, so it refuses unless `RELAYER_ALLOW_BROADCAST=true`,
and it prints the cost before it acts.

---

## What each piece may do

Worth keeping straight when configuring hosts and firewalls:

| | Reaches the network | Holds a key | Can move your assets |
|---|---|---|---|
| `vault` | **Never** | Yours, encrypted | Yes — it is the only thing that can |
| `web` | Yes | No | No |
| `relayer` | Yes | A hot fee-payer key | No: fee payer and nonce authority only |
