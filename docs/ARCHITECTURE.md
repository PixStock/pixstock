# Architecture

Three apps. One of them can never reach the network, and that one holds the
only key that can move anything.

## Components

| Component | Role | Can it reach the network? |
|---|---|---|
| `apps/web` | Builds the order, shows the animated QR frames, reads the reply off the webcam, asks the relayer to broadcast | Yes |
| `apps/vault` | Assembles the frames, verifies Pyth, applies the policy, prints the ticket, signs | **No — never** |
| `apps/relayer` | Jupiter quotes, `VersionedTransaction` construction, fee payer, durable nonce pool, co-signature, broadcast | Yes |

The vault holds the only key that can move assets and has no code path to the
network — enforced by a lint rule, not by convention, and checked again
against the built bundle. The relayer pays the fees and advances a durable
nonce; it can never move a token. The browser displays and scans; it signs
nothing.

## End to end

1. Someone composes an order on `/trade` or `/basket`.
2. The relayer quotes it through Jupiter and builds a v0 message: advance
   nonce, compute budget, an associated token account where one is missing,
   then the swaps.
3. The relayer attaches the signed Pyth message and a human-readable
   `manifest`.
4. `apps/web` encodes all of it into AGQP frames and cycles them at 8 fps.
5. The phone scans, reassembles (CRC-32 per frame), verifies Pyth's signature
   on its own, applies P1–P12, prints the order ticket, asks for the
   fingerprint, and signs.
6. The phone shows one static QR holding **the signature alone** — 64 bytes.
7. The webcam reads it, the relayer co-signs as fee payer and nonce
   authority, and broadcasts.

Measured on the demo path: the outbound crossing completes in one to two
cycles of under a second each; the check and the ticket render in well under
a second; the reply is a single static code.

## Why the phone cannot be talked into it

The order ticket is derived from the **decompiled instructions**, never from
the manifest that travels beside them. The manifest exists to be contradicted:
if the two disagree, the signature is refused. That is rule P6, and it has an
adversarial mutation test.

The one figure the sender chooses is the ScaledUiAmount multiplier, because a
phone in airplane mode cannot read it off the mint. Rule P11 bounds it, the
ticket prints it, says where it came from, and shows the unscaled amount
beside it. See [THREAT-MODEL.md](THREAT-MODEL.md).

## Relayer modules

`orders` · `quotes` · `tx-builder` · `pyth` · `nonces` · `relayer` · `vaults`
· `market` · `solana` · `health`.

Eight relayer-side rules, R1–R8, guard the broadcast — including R3 (the
relayer key appears only as fee payer and nonce authority), R4 (no lamports
leave the relayer beyond capped token-account rent, `MAX_RENT_LAMPORTS`) and
R6 (the transaction must simulate successfully).

Seven are enforced. **R7 — the vault is within its order quota and the relayer
has balance — is not**: it needs a quota store and a balance alert.
`ENFORCED_RULES` in `apps/relayer/src/modules/orders/relayer-policy.ts` is the
source of truth, and `/protocol` renders it from the code rather than from
this file, so the page and the engine cannot drift apart.

## Vault screens

Setup · Restore from a Paper-Vault · Scan · Review · Sign · Pair (show the
public key) · Settings.

## Networks

`SOLANA_CLUSTER=mainnet-beta` for the demo and the video. Jupiter and the
xStocks only exist on mainnet, which is why the confirmed transaction in
[the docs index](README.md) is a mainnet one.

## Packages

| Package | What it is |
|---|---|
| `@pixstock/agqp` | The optical protocol: frame encoding, reassembly, session ids |
| `@pixstock/tx-policy` | Decompiles a Solana message and applies P1–P12 |
| `@pixstock/pyth-verify` | Checks a Pyth Pro `solana` message offline, against pinned signers |
| `@pixstock/vault-crypto` | Key generation, the encrypted blob, the Paper-Vault encoding |
| `@pixstock/shared` | Mints, program ids, feed ids — verified on mainnet 12 Sept 2026 |

Packages compile to `dist/`. After changing one, run `npm run build:packages`
(or `npm run dev:packages` to watch), or the apps keep importing the old one.
