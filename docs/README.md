# PixStock documentation

An air-gapped Solana signer for tokenized stocks. A spare phone in airplane
mode reads an order as animated QR codes, checks the price against Pyth's own
signature with no network of its own, and answers with sixty-four bytes.

**It works on mainnet.** One confirmed swap, real money, zero SOL in the
vault:
[`3NEPTtAB…1sB52`](https://solscan.io/tx/3NEPTtABYDpJaWge3rL5jD5AngtWysZJqMyPfMqozCDtwd7RbhBgeGfvFYGyBShPbKBq9uZQKXXm68rcL1Y1sB52)
— slot 446957081, `err: None`.

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
| The vault never reaches the network | A lint rule fails the build on `fetch`, `XMLHttpRequest`, `WebSocket` or `EventSource` anywhere under `apps/vault/src`. The built bundle greps clean. |
| The phone verifies the price offline | `packages/pyth-verify` checks Pyth's ed25519 signature over the exact bytes that travelled. A forged attestation is refused with no checkbox to override it. |
| The order shown is the order signed | Every figure on the ticket is decompiled from the transaction's own instructions. The manifest that travels alongside is only ever cross-checked against them. |
| Your vault holds no SOL | The relayer pays every fee and every rent. Rule P1 refuses to sign a transaction that makes the vault the fee payer; P10 refuses one that moves a lamport out of it. |
| Three swaps, one signature | `apps/relayer/test/jupiter.live.test.ts` puts a three-leg basket in one transaction, against real Jupiter routes. |
| Every rule the site claims is a rule the engine runs | `/protocol` renders its table from `EVALUATED_RULES`, so the page cannot advertise a check the code skips. |

## Running it

```bash
npm install && npm run build:packages
npm run dev -w @pixstock/relayer   # :4000
npm run dev -w @pixstock/web       # :3000
npm run dev -w @pixstock/vault     # :5183
```

Then [DEMO.md](DEMO.md). You do not need a second phone: the vault has a
paste channel that takes the same code path as the camera.

## What this is not

A hackathon build, unaudited, and honest about it. xStocks are issued by
Backed Finance and are not offered to US, UK, Canadian or Australian persons
— see [/legal](../apps/web/app/legal). Nothing here is investment advice.
