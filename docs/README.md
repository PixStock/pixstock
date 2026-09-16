# PixStock documentation

An air-gapped Solana signer for tokenized stocks. A spare phone in airplane
mode reads an order as animated QR codes, checks the price against Pyth's own
signature with no network of its own, and answers with sixty-four bytes.

**It works on mainnet.** One confirmed swap, real money, and a vault that has
never held a lamport:
[`mXU5gcq9…uZvir`](https://solscan.io/tx/mXU5gcq9zUxr4twZzcRCfagwZgSSk3fZcsMAXURddMhBCAJ3auzFnEoNNDYgbpZndNCjSKcrkmEetbKaKUuZvir)
— slot 447518920, `err: None`, signed by
[`5EhC1QpR…iJLJH`](https://solscan.io/account/5EhC1QpRm8BuLBJi6sqikvp8a7jYf6oLjZBtn9kiJLJH),
balance zero.

In a hurry, or judging: [**PITCH.md**](../PITCH.md) maps each must-have in
the brief to the file that implements it, the test that proves it, and the
thirty-second way to check it yourself. It also names where this build
departs from the brief, and why.

## If you have three minutes

Read [**THREAT-MODEL.md**](THREAT-MODEL.md). It is the argument: what each
component is never allowed to do, the twelve rules the phone applies before
it signs, and — the part most projects leave out — a section naming exactly
what this product does **not** protect you from.

## If you have ten

| Document | What it answers |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Three apps, one of which can never reach the network. How an order crosses and comes back. |
| [THREAT-MODEL.md](THREAT-MODEL.md) | The invariants, the P1–P12 signing rules, and the limits we will not paper over. |
| [AGQP-SPEC.md](AGQP-SPEC.md) | The optical protocol, frozen at v1: frame envelope, CBOR payload, measured byte budget. |
| [TESTING.md](TESTING.md) | Four levels, three commands, and which class of defect each one catches. |
| [DEMO.md](DEMO.md) | Run the whole thing yourself, with a phone or with one laptop. |
| [DEPLOY.md](DEPLOY.md) | Environment variables, the nonce pool, and what spends real money. |

## The claim, and how to check it

| Claim | Where it is checked |
|---|---|
| The vault never reaches the network | A lint rule fails the build on `fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource` anywhere under `apps/vault/src`, and the shipped bundle carries no call to any of them — [the command is below](#checking-the-air-gap-yourself). |
| The phone verifies the price offline | `packages/pyth-verify` checks Pyth's ed25519 signature over the exact bytes that travelled. A forged attestation is refused with no checkbox to override it. |
| The order shown is the order signed | Every figure on the ticket is decompiled from the transaction's own instructions. The manifest that travels alongside is only ever cross-checked against them. |
| Your vault holds no SOL | The relayer pays every fee and every rent. Rule P1 refuses to sign a transaction that makes the vault the fee payer; P10 refuses one that moves a lamport out of it. |
| Three swaps, one signature | `apps/relayer/test/jupiter.live.test.ts` puts a three-leg basket in one transaction, against real Jupiter routes. |
| Every rule the site claims is a rule the engine runs | `/protocol` renders its table from `EVALUATED_RULES`, so the page cannot advertise a check the code skips. |

### Checking the air-gap yourself

```bash
npm run build -w @pixstock/vault

grep -rE '(^|[^A-Za-z0-9_.$])(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)[[:space:]]*\(' \
  apps/vault/dist/assets/
# no output, and exit status 1
```

Grepping for the bare word `fetch` instead will find some, and they are worth
knowing about before you conclude anything: they are `fetchPriority`,
`prefetch` and `prefetchDNS`, three React DOM properties that name a browser
hint and call nothing. The pattern above is anchored to an actual call —
`fetch(` not preceded by an identifier character, a dot or a `$` — which is
why it comes back empty.

One file legitimately does call `fetch`, and it sits beside that directory
rather than in it: `apps/vault/dist/workbox-*.js`, the runtime Workbox
generates for the service worker. Serving its own precache is how a PWA works
offline at all, and it has no remote origin to reach — see
[THREAT-MODEL.md](THREAT-MODEL.md).

## Running it

```bash
npm install && npm run build:packages
npm run dev -w @pixstock/relayer   # :4000
npm run dev -w @pixstock/web       # :3000
npm run dev -w @pixstock/vault     # :5183
```

Then [DEMO.md](DEMO.md). You do not need a second phone: the vault has a
paste channel that takes the same code path as the camera.

## Why a PWA, and what native would buy

The vault installs from a URL as a progressive web app. That is a decision,
not a shortcut.

An offline signer's whole claim is that you do not have to take our word for
it. Open the devtools on the deployed vault and read the response header —
`connect-src 'none'`, served from `apps/vault/Dockerfile`. Grep the built
bundle under `apps/vault/dist`: no `fetch`, no `XMLHttpRequest`, no
WebSocket. A signed binary from an app store asks you to trust us instead,
which is the one thing this product is built not to ask.

Two more things follow from the form:

- **No store account.** Installing from Google Play or the App Store means a
  Google or Apple account on the phone that signs. A spare phone doing this
  job should ideally carry none. A PWA installs from a link.
- **No update channel.** A store app has to come back online periodically to
  update itself. This one is installed once and can stay in airplane mode
  forever.

Native is on the roadmap for one reason that actually matters, and it is not
the interface:

- **Hardware-backed keys.** Today the seed is encrypted with Argon2id and
  AES-GCM, unlocked by the master password, with a WebAuthn platform
  authenticator (`userVerification: "required"`) in front of every signature.
  That is strong, and it is still a key the device can be made to hand over.
  Secure Enclave on iOS and StrongBox on Android hold a key that **cannot be
  exported**, even from a phone that has been compromised.
- **iOS parity.** Safari has no `BarcodeDetector`, and installing a PWA on
  iOS is a manual "Add to Home Screen". Android and ChromeOS get the camera
  path today; iOS gets the paste channel. A native app closes that gap.
- **Camera control.** Frame rate, focus and exposure, for decoding in worse
  light than a demo table.

## What this is not

A hackathon build, unaudited, and honest about it. xStocks are issued by
Backed Finance and are not offered to US, UK, Canadian or Australian persons
— see [/legal](../apps/web/app/legal). Nothing here is investment advice.
