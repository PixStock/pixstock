# Deploying

Three pieces, three shapes: a static PWA, a Next.js app, and a Node service
with a database and a hot key.

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
