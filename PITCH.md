<div align="center">

# PixStock — what to check, and where

**A judge's map.** Every must-have in the brief, the file that implements it,
the test that proves it, and the thirty-second way to see it yourself.

[README](./README.md) · [Threat model](./docs/THREAT-MODEL.md) ·
[Optical protocol](./docs/AGQP-SPEC.md) · [Reproduce the demo](./docs/DEMO.md)

</div>

---

## Start here, if you only have one minute

One confirmed mainnet swap, real money, and **zero SOL in the vault** — the
account that signed it has never held any:

> [`3NEPTtAB…1sB52`](https://solscan.io/tx/3NEPTtABYDpJaWge3rL5jD5AngtWysZJqMyPfMqozCDtwd7RbhBgeGfvFYGyBShPbKBq9uZQKXXm68rcL1Y1sB52)
> — slot 446957081, `err: None`, two signatures.

The fee payer is the relayer. The other signature came off a phone in
airplane mode and crossed the room as QR codes. That one link is the whole
claim; everything below is how it was built and how to verify each part.

**Try it:** [dApp](https://web-production-502d1.up.railway.app) ·
[vault](https://pixstock-production.up.railway.app) ·
[relayer health](https://relayer-production-b097.up.railway.app/healthz)

---

## Who this is for

Someone who holds tokenized equities and does not want a browser tab to be the
last thing standing between an attacker and their position.

The problem is not that signing is difficult. It is that at the moment of
signing, nobody is shown what they are agreeing to — which is why the brief
makes anti-blind signing a must-have of its own. A `ScaledUiAmount` mint makes
it worse: the raw figure in the transaction is **not** the quantity you own,
so a careful person can read the bytes correctly and still be wrong about what
they just sold.

The existing answers ask you to buy a device, wait for the post, and learn
what a lamport is. This one asks for the phone already in your drawer. Radios
off, zero SOL, nothing to purchase — and at the moment that matters it shows
the trade in words it derived from the transaction itself, then refuses
instead of asking you to be careful.

---

## The five must-haves

### A · Zero-SOL cold storage

*The offline phone needs no SOL to authorise a transaction.*

| | |
|---|---|
| **Where** | `packages/tx-policy/src/policy.ts` — rule **P1** refuses a transaction that makes the vault the fee payer, **P10** refuses one that moves a lamport out of it. The relayer signs as fee payer and nonce authority only: `apps/relayer/src/modules/relayer/`. |
| **Proved by** | `refuses to build an order the vault would pay for` and `never makes the vault the fee payer` (`apps/relayer/test/jupiter.live.test.ts`, against real Jupiter routes). |
| **See it** | Open the transaction above on Solscan. The fee payer is `2oQgk1TC…cSfof`; the vault appears as a signer and pays nothing. |

The enforcement is on the **phone**, not in the web app. A compromised
browser cannot make the vault pay, because the vault checks for itself and
refuses.

### B · Anti-blind signing

*Never a raw hash. A readable order ticket, then a biometric confirmation.*

| | |
|---|---|
| **Where** | `apps/vault/src/screens/Review.tsx` renders the ticket; `decompile()` in `packages/tx-policy/src/instructions.ts` produces it by **decompiling the transaction's own instructions**. The manifest that travels alongside is only ever cross-checked against them (rule **P9**), never displayed on its own. |
| **Proved by** | `reads an order, shows a ticket, and signs it` (`system/vault-flow.spec.ts`) — a real browser, the recorded mainnet basket, every amount asserted. |
| **See it** | The middle screen of the image in the [README](./README.md): amounts in, amounts out, the ScaledUiAmount multiplier applied *and* the unscaled figure beside it. |

Two details worth a judge's attention. Token-2022 `ScaledUiAmount` means the
raw on-chain number is not what the holder owns — the difference reaches half
a percent — so the ticket shows both, and rule **P11** refuses an order that
omits the multiplier rather than showing a figure that would be wrong. And
the ticket names what the issuer can still do: all five xStocks carry a
permanent delegate, and the screen where the decision is made says so.

### C · A basket in one scan

*Several swaps, one transaction, one signature.*

| | |
|---|---|
| **Where** | `apps/web/app/basket/BasketBuilder.tsx` builds it; `apps/relayer/src/modules/tx-builder/tx-builder.service.ts` stacks the Jupiter swaps into a single v0 transaction with address lookup tables. |
| **Proved by** | `puts a three-leg basket in ONE transaction` and `uses the lookup tables, so accounts do not sit inline` (`apps/relayer/test/jupiter.live.test.ts`). |
| **See it** | [`/basket`](https://web-production-502d1.up.railway.app/basket) — the brief's own preset, 40 / 30 / 30 of 500 USDC. The measured transaction is **910 bytes** cold against Solana's 1,232 limit, and the order crosses in **five frames at 8 fps**. |

Sizes are measured by `scripts/measure-tx-size.mjs`, not estimated — the table
is in [AGQP-SPEC §3](./docs/AGQP-SPEC.md). The builder stops at **four legs**
because that is where the measurement stops fitting, and the API enforces the
same number: an interface that lets you build what the server rejects is a
400 waiting to happen.

### D · Offline price check against Pyth

*A corrupted browser cannot lie to the phone about the market.*

| | |
|---|---|
| **Where** | `packages/pyth-verify/` parses the Pyth Pro message and verifies its Ed25519 signature against signers **read from chain and pinned**, entirely offline. Past 1% deviation the vault refuses. |
| **Proved by** | `refuses an order whose price attestation is forged` (`system/vault-flow.spec.ts`) and `still matches Pyth's Storage account` (live). |
| **See it** | [`/protocol`](https://web-production-502d1.up.railway.app/protocol) renders its table from `EVALUATED_RULES`, so the page cannot advertise a check the code skips. |

Three properties this deliberately has: the signature is verified **before**
any field is read, a refusal has **no checkbox to override it**, and there are
three distinct states — no price, unverifiable price, rejected price — because
collapsing them would let the worst one hide behind the mildest.

**Pyth is a control here, not a widget.** The price is not drawn on a chart
beside the trade — it decides whether the trade can be signed at all. Take
Pyth out and the vault does not lose a feature; it loses its only way to know
whether the browser is telling the truth about the market. That is also why
the check had to be offline: a signer that asks the network what a share costs
has handed away the very thing it was built to keep.

**Which price, exactly.** The xStock's own — `Crypto.TSLAX/USD`, never
`Equity.US.TSLA/USD`. They are two different numbers: an xStock trades against
its underlying at a premium or a discount, and Pyth publishes a
redemption-rate feed (`Crypto.TSLAX/TSLA.RR`) because they diverge.

This build priced all five off the **equity** feeds until 16 Sept 2026. Two
things were wrong with that and only one was visible. The visible one: four of
the five were refused, so the *Tech Giant Index* travelled unattested. The
quiet one: the equity feeds keep the New York session and publish nothing at
the weekend, while the token trades seven days a week — so a Saturday order
had no price to check at all, and nothing said so. Both are gone
(`packages/shared/src/index.ts`), and the attestation the suite verifies is a
real `Crypto.TSLAX/USD` message captured from the router.

**The honest limit that remains:** coverage is a grant, not a right. If it
lapses the order travels unattested, the ticket says so in words, and the
vault asks the holder to accept that before it will sign. We would rather ship
the refusal working than assume the price will always be there.

### E · Paper-Vault

*A printable, offline backup. No cloud, no vendor.*

| | |
|---|---|
| **Where** | `packages/vault-crypto/` — Argon2id over the master password, AES-GCM-256 over the key, exported as a dense QR. `apps/vault/src/screens/Setup.tsx` shows it before anything else can happen. |
| **Proved by** | `creates a vault and shows the Paper-Vault before anything else`, `restores a vault from a printed Paper-Vault`, and `refuses a Paper-Vault opened with the wrong password` (`system/vault-flow.spec.ts`). |
| **See it** | `node scripts/export-key.mjs` turns either the sheet or the stored blob back into a key Phantom and `solana-keygen` accept. It reads both the vault and the password from **stdin**, so neither reaches your shell history. |

The way out does not depend on this project still existing. That is the test
of a self-custody claim.

---

## Where the implementation departs from the brief

Named rather than glossed, because a judge comparing the two documents will
find these anyway.

| The brief says | What was built | Why |
|---|---|---|
| `PS1\|INDEX\|TOTAL\|CRC32\|PYTH\|CHUNK` | `PS1:<SID>:<INDEX>:<TOTAL>:<CRC32>:<CHUNK>` | A **session id** was added. Without it a captured payload can be replayed into another session, and a phone cannot tell two overlapping orders apart. It is checked on both sides — see [AGQP-SPEC §2](./docs/AGQP-SPEC.md). |
| Pyth price in **every frame** | Pyth price **once**, inside the CBOR payload | Repeating ~145 bytes across five frames buys nothing: the payload is reassembled before anything is read, so one copy is one copy. |
| Base64 chunks | **Base45** (RFC 9285) | QR's alphanumeric mode encodes Base45 at 5.5 bits/char against Base64's 8. Same bytes, fewer frames. |
| Payload ≤ 450 bytes | 903 bytes (one swap) to 1,519 (three legs) | The brief's figure did not survive contact with real Jupiter routes carrying lookup tables and Token-2022 account creation. The **frame count held**: 4–6, as specified. |
| `xAAPL`, `xTSLA` | `AAPLx`, `TSLAx` | Backed Finance's actual mainnet convention. Verified on chain 12 Sept 2026. |
| `html5-qrcode`, `react-native-camera` | `BarcodeDetector`, `zxing-wasm` | Native decoding where the browser has it. The vault is a PWA rather than React Native so that it ships with no store, no cable, and no install step a judge has to trust. |
| `tweetnacl` | `@noble/curves` | Audited, actively maintained, and already the dependency `@solana/web3.js` reaches for. |

---

## What this does not protect you from

A pitch that only lists strengths is a pitch nobody can check.

- **The issuer can still seize or freeze the tokens.** All five xStocks are
  Token-2022 mints with a *permanent delegate* and a *freeze authority* held
  by Backed Finance. No signer can change that, and the vault says so on the
  screen where the decision is made rather than in a footnote.
- **The relayer can refuse to broadcast.** It cannot move a token, alter an
  order or forge a price — but it can decline to pay. That is censorship, not
  theft, and the way out is the key you can export at any time.
- **A phone with its radios on is not air-gapped.** The vault says so at the
  top of every screen. The `connect-src 'none'` header holds regardless, but
  the guarantee people are buying is the one they enforce themselves.

---

## Verify the central claim in your own browser

The vault is deployed. Open it, open the devtools console, and ask the page
to reach the network — by all three of the ways it could:

```js
addEventListener("securitypolicyviolation", (e) =>
  console.log("blocked", e.blockedURI, "by", e.effectiveDirective));

fetch("https://example.com");                 // TypeError: Failed to fetch
new WebSocket("wss://example.com");
const x = new XMLHttpRequest();
x.open("GET", "https://example.com"); x.send();

// blocked https://example.com/ by connect-src
// blocked wss://example.com/   by connect-src
// blocked https://example.com/ by connect-src
```

That is not a promise about our code. It is the browser refusing on our
behalf, and it binds any script that ever runs on that page.

The same guarantee is enforced twice more: a lint rule fails the build on
`fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource` anywhere under
`apps/vault/src`, and the shipped bundle carries no call to any of them —
[the exact command is here](./docs/README.md#checking-the-air-gap-yourself),
along with why grepping for the bare word `fetch` finds React DOM properties
that call nothing.

---

## After the hackathon

The parts that took longest are the ones built to outlive the demo. AGQP is a
specified protocol (`docs/AGQP-SPEC.md`) rather than a pair of functions, so a
second implementation can be written against it. The signing rules are a
package with one adversarial test each, so they can be reviewed without
reading the apps. And the Paper-Vault opens with `scripts/export-key.mjs`
whether or not this project still exists — which is the only honest test of a
self-custody claim.

Next, in the order that matters: move to native for hardware-backed keys
— Secure Enclave and StrongBox hold a key that cannot be exported, and today's
seed is one a compromised device can be made to give up (`docs/README.md`);
and an audit before anyone is invited to put real size behind any of it.

What will not change: the vault never gets a network call, and the relayer
never gets a key that can move your tokens. Those two are the product, and
everything else is negotiable.

---

## The numbers

```
326  unit and integration tests   offline, deterministic
 17  live tests                    real Jupiter, real RPC, real Pyth
 36  system tests                  both apps, in a real browser
 12  signing rules                 P1..P12, every one enforced
```

`npm run test:all` runs the three suites. `npm run screenshots` redraws the
README's image from the running app, so the picture cannot drift from the
product.
