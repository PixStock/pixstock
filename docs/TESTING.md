# Testing

Four levels, three commands. Each catches a class of defect the others cannot
see — the lookup-table bug proved it: every unit test passed while our
transactions were 350 bytes too large.

```bash
npm test            # unit + integration · offline, deterministic, ~5 s
npm run test:live   # against real Jupiter and a real RPC node · ~2 s, needs network
npm run test:system # Playwright, both apps in a browser · ~50 s
npm run test:all    # all three
```

Today: **304 unit and integration tests**, **17 live**, **34 system**.

One more command shares the system suite's machinery without being part of
it. `npm run screenshots` drives the vault through a real order and writes the
three screens in the README to `docs/img/`. It runs off
`playwright.shots.config.ts` and matches `*.shot.ts`, which the default
`testMatch` does not, so `test:system` never picks it up — and because it is
generated rather than pasted, a screen that changes shape fails the command
instead of quietly leaving a stale picture in the README.

After a clone, two preparations, once per machine:

```bash
npm ci
npx playwright install chromium   # ~115 MB, for the system tests

# A separate database for the integration tests: they truncate tables between
# each test, and the development database holds orders mid-signature. Running
# the suite must never cost someone their work.
createdb pixstock_test
DATABASE_URL="postgresql://$USER@localhost/pixstock_test?host=/var/run/postgresql" \
  npx prisma migrate deploy --schema apps/relayer/prisma/schema.prisma
```

All three commands build the shared packages themselves — the tests import
them through their `dist`, and without that a fresh clone sees nine files out
of fourteen fail on "Failed to resolve entry" and concludes the repo is
broken.

> The build is called **inside** the script, not from a `pretest` hook. An
> `ignore-scripts=true` in someone's `~/.npmrc` silently disables `pre`/`post`
> hooks — and that was the case on the machine these tests were written on.

Playwright starts the dev servers it needs on its own (`webServer` in
`playwright.config.ts`) and reuses any already running. Nothing to start by
hand.

---

## 1. Unit — `packages/*/test`, `apps/*/test`

Pure functions, formats, invariants. No I/O.

What they pin down: the RFC 9285 Base45 vectors, the canonical CRC-32 value,
the codec round trip over 1,000 payloads, the policy's adversarial mutations,
the refusal of a wrong password, and the fact that a price may **never** be
reported as verified unless the signature actually checked out.

## 2. Integration — `apps/relayer/test/*.integration.test.ts`

The HTTP surface through the real NestJS stack: routing, injection,
`ValidationPipe`, controllers. Jupiter is replaced by a recorded response, so
it is deterministic and offline.

> NestJS resolves its dependencies through `design:paramtypes`, which esbuild
> does not emit. Without the SWC plugin in `vitest.config.ts`, every route
> answers 500 and the injected service is `undefined`.

## 3. End to end — `packages/tx-policy/test/e2e-airgap.test.ts`

Every layer in the order a real signature happens: a basket the relayer
actually built on mainnet routes → CBOR payload → frames → out-of-order and
duplicated reassembly → decode → policy → ticket → signature → reply verified
against the message that was sent.

The fixture is **recorded**, not fabricated
(`scripts/capture-order-fixture.mjs`). An order built by hand only proves the
pieces agree with each other — which was true the whole time the lookup tables
were being lost.

## 4. Live — `*.live.test.ts`

Real Jupiter, a real RPC node. These are the only ones that can see that a
route changed shape, or that a transaction grew.

The one that matters most: **"puts a three-leg basket in ONE transaction"**.
That is the whole basket feature in a single assertion, and it is the test
that would have flagged the lookup-table bug the day it was introduced.

The second: **`mint-state.live.test.ts`**, which simulates the
`AmountToUiAmount` instruction and so has **token-2022 itself** compute the
displayed amount. The mint stores two multipliers and a switch-over date;
reading the first field returned the stale value on four of the five xStocks,
and no offline test could see it — they all agreed with each other.

The comparison is on the **displayed amount**, not the multiplier: the program
truncates to the mint's decimals and so does `scaleRaw`, and exact equality of
what a holder actually reads is both stricter and more relevant.

Excluded from `npm test`: a suite that can go red because Jupiter is slow is a
suite people learn to ignore.

> **The offline suite must stay offline.** It once reached mainnet without
> saying so, through `MintStateService`: five RPC calls on the critical path
> of `npm test`. Such a suite fails on a plane, fails in CI with no network
> egress, and hides real regressions behind a network error. Mint state is now
> **recorded** by `scripts/capture-mint-state.mjs`, and the guarantee is
> checked like this:
>
> ```bash
> SOLANA_RPC_URL=http://127.0.0.1:9 npm test   # must pass
> ```

## 5. System — `system/*.spec.ts`

Both apps running, driven through a browser.

- **`vault-flow`** — create a vault, print the Paper-Vault, scan through the
  paste channel, read the ticket, refuse an order addressed to another vault,
  refuse a forged price attestation, refuse a wrong password, sign, show the
  reply QR.
- **`web-pages`** — every route answers, **every internal link on the landing
  page resolves**, the sitemap lists only real pages, the QR frames really
  cycle, and `/protocol` reports each rule's state from the code rather than
  from the copy.

- **`hit-targets`** — walks twelve vault screens measuring every button,
  link, input and `<summary>`, and fails if one is under 44 px. Computing it
  from the CSS is not the same as measuring it in a browser, and two
  `<summary>` toggles were 21 px until this was written.

The link check exists because `/trade`, `/basket`, `/vault`, `/protocol` and
`/legal` were all announced in the navigation, the footer and the sitemap
while all five returned 404 — with a green build.

`web-pages` also asserts that the landing page's closing band is still a band:
the app routes and the marketing pages share one stylesheet, and a button
class that took a name the landing page already used once squashed a whole
section to 54 px. Lint, typecheck and every test that reads text were green
through it.

The paste channel is used instead of a camera: it is the same code path, and
it is also the mode a judge with a single device will take.

---

## Adding a test

| What you want to prove | Where |
|---|---|
| A function behaves as specified | `packages/<package>/test/*.test.ts` |
| A route validates, refuses, answers | `apps/relayer/test/*.integration.test.ts` |
| The layers fit together on a real order | `packages/tx-policy/test/e2e-airgap.test.ts` |
| An external service keeps its word | `apps/*/test/*.live.test.ts` |
| A person can actually do it | `system/*.spec.ts` |

Refresh the recorded fixtures after a schema change:

```bash
npm run build -w @pixstock/relayer
node scripts/capture-jupiter-fixture.mjs   # one mainnet swap
node scripts/capture-order-fixture.mjs     # a full basket + an encrypted vault
node scripts/capture-mint-state.mjs        # the five mints, as token-2022 reports them
node scripts/measure-tx-size.mjs           # the sizes published in §3 of the spec
```
