<div align="center">

# PixStock

**Ledger-grade security for tokenized stocks, using the phone already in your drawer.**

The only signer that checks the market price offline before it signs.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-14F195.svg)](https://solana.com)

[AGQP spec](./docs/AGQP-SPEC.md) · [Threat model](./docs/THREAT-MODEL.md) ·
[Reproduce the demo](./docs/DEMO.md)

<!-- Deployment: add the app, vault and video URLs to this line at submission. -->

</div>

---

## The problem

Tokenized stocks trade on Solana today, but holding them safely does not.
A retail investor outside the US has two options, and both are bad: leave the
keys on an exchange and inherit its counterparty risk, or buy a hardware
wallet — a purchase, a shipment, a seed phrase ceremony, and a device that
still shows you a hash and asks you to trust it.

There is a third option nobody has built: **the old smartphone in your
drawer**. Put it in airplane mode permanently and it is already an air-gapped
signer with a camera, a screen, a secure element and a biometric sensor.

## What we built

PixStock turns any spare phone into an offline signer for tokenized stocks.
The phone never touches a network again — no Wi-Fi, no Bluetooth, no cable.
Transactions cross the gap **optically**, as animated QR codes read by the
camera, and the signature comes back the same way through the laptop's webcam.

Five things make it usable rather than a demo:

| | |
|---|---|
| **Zero-SOL cold storage** | The web dApp is the fee payer. Your vault can hold 0.00 SOL and still trade — no one has to learn what a lamport is. |
| **No blind signing** | The phone decompiles the transaction itself and shows a readable order ticket: assets, exact amounts in and out, counterparty. Never a hash. |
| **A basket in one scan** | Three Jupiter swaps in a single transaction — 40% AAPLx / 30% NVDAx / 30% MSFTx for one USDC amount, signed once. |
| **Offline price check** | The phone verifies an Ed25519-signed Pyth price and **refuses to sign** if the order drifts more than 1% from it. A corrupted browser cannot lie to it. |
| **Paper-Vault** | The encrypted key exports as a printable QR. No cloud, no vendor. |

## How it works

```
  Web dApp (online)                         Vault (airplane mode)
        │                                            │
        │ 1. build order, inject fee payer + nonce   │
        │ 2. attach the Pyth signed price            │
        │ 3. AGQP encode ──── animated QR ──────────►│ 4. camera, CRC32 reassembly
        │                                            │ 5. verify Pyth signature
        │                                            │ 6. readable order ticket
        │                                            │ 7. biometric confirmation
        │ 9. webcam ◄───── static QR (64 bytes) ─────┘ 8. Ed25519 signature
        │ 10. broadcast
        ▼
     Solana
```

The split matters: the vault holds the only key that can move your assets and
has no code path that can reach a network. The relayer pays fees and advances
a durable nonce — it can never move a token. The web app displays and scans,
and signs nothing.

**Why Solana specifically:** the fee payer is separate from the signer
natively, durable nonces exist precisely so a signature can be produced
offline without a clock running, xStocks are Token-2022 with real liquidity,
Jupiter routes the swaps and Pyth publishes signed prices that verify with a
single Ed25519 check.

---

## Repository layout

```
apps/
├── web/        Next.js 16 — the online dApp: trade, basket builder, QR display and webcam return
├── vault/      Vite + React PWA — the offline signer. No fetch, no network, ever.
└── relayer/    NestJS — quotes, transaction building, fee payer, nonce pool, broadcast
packages/
├── agqp/           The optical protocol: frames, Base45, CRC32, session assembler
├── tx-policy/      v0 message decompilation, instruction decoding, P1..P12 signing policy
├── pyth-verify/    Offline Pyth Pro parsing and Ed25519 verification
├── vault-crypto/   Key generation, AES-GCM-256, Argon2id, Paper-Vault, signing
└── shared/         Asset table, program ids, order types
docs/           ARCHITECTURE · AGQP-SPEC · THREAT-MODEL · DEMO · DEPLOY · TESTING
```

## Quickstart

Requires **Node.js 20+** and **npm 10+**. PostgreSQL 15+ for the relayer.

```bash
git clone https://github.com/PixStock/pixstock
cd pixstock
npm install
npm run build:packages
```

Then, in three terminals:

```bash
npm run dev -w @pixstock/relayer   # API      → http://localhost:4000
npm run dev -w @pixstock/web       # dApp     → http://localhost:3000
npm run dev -w @pixstock/vault     # Vault    → http://localhost:5183
```

The relayer needs a database and a few keys — copy `apps/relayer/.env.example`
to `apps/relayer/.env` and fill it in. The vault needs nothing: that is the
point.

> The camera and WebAuthn require HTTPS on a real phone. Use `mkcert` for a
> trusted local certificate, or open the deployed vault URL.

### Commands

```bash
npm run build            # packages, then all three apps
npm run build:packages   # shared packages only (run this after changing one)
npm run dev:packages     # watch mode for the packages

npm test                 # unit + integration — offline, deterministic
npm run test:live        # against the real Jupiter API and an RPC node
npm run test:system      # Playwright, both apps in a browser (see below)
npm run test:all         # all three

npm run typecheck        # project-wide type check
npm run lint             # every workspace that defines a linter
```

The system tests need a browser once per machine:

```bash
npx playwright install chromium
```

Every test command builds the shared packages first, and Playwright starts the
dev servers it needs. What each layer catches, and why the live suite is kept
separate: [`docs/TESTING.md`](./docs/TESTING.md).

## Status

The loop is closed and runs on mainnet data: the web app builds a real
Jupiter order, the phone reads it through the camera, checks Pyth's signature
on the price with no network, prints a readable ticket, signs, and the
relayer co-signs and broadcasts. 296 unit and integration tests, 25 system
tests in a real browser, and every one of the twelve signing rules enforced.

Three things are worth saying plainly, because a demo that hides them is
worse than one that does not:

- **Broadcasting is off by default.** It spends real SOL and cannot be
  undone, so it stays behind `RELAYER_ALLOW_BROADCAST` until someone turns it
  on deliberately. Everything up to it — building, quoting, co-signing,
  simulating — works with it off.
- **Our Pyth grant covers the Tesla feed.** Apple, Nvidia, Microsoft and SPY
  come back `no grant accepts this feed`, and the extended-hours feeds are
  inactive out of session. An order for those travels with a price for the
  legs it covers, the ticket names the ones it does not, and the phone asks
  the holder to accept that before it will sign.
- **The nonce pool has to be created before a demo.** Without a durable
  nonce an order dies with its blockhash in about ninety seconds. Creating
  one costs rent, so it is a command someone runs — `npm run nonces:create`
  — never a side effect of the service starting.

Every public function that is not written yet throws with a pointer to the
spec section that defines it, so nothing fails silently.

---

## Documentation

| File | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | Components, end-to-end flow, target timings |
| [`docs/AGQP-SPEC.md`](./docs/AGQP-SPEC.md) | The optical protocol, frame by frame |
| [`docs/THREAT-MODEL.md`](./docs/THREAT-MODEL.md) | What each component may never do, policies P1..P12 |
| [`docs/DEMO.md`](./docs/DEMO.md) | How to reproduce the demo end to end |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | Deploying the three pieces, and what each may do |
| [`docs/TESTING.md`](./docs/TESTING.md) | The four test layers and what each one catches |
| [`CLAUDE.md`](./CLAUDE.md) | Development conventions (French — team working document) |
| [`GIT.md`](./GIT.md) | Branch, commit and PR conventions (French) |

## Open source components

Jupiter Swap API · Pyth Pro (ex-Lazer) · Backed Finance xStocks ·
`@solana/web3.js` · `zxing-wasm` · `@noble/curves` · `@noble/hashes`

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Security

Never open a public issue for a vulnerability — see
[`SECURITY.md`](./SECURITY.md).

## License
[MIT](./LICENSE) © 2026 PixStock
