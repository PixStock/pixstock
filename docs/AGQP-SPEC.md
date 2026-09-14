# AGQP v1 — Air-Gap QR Protocol

Version **1**, frozen 12 Sept 2026. Implementation: `packages/agqp`.

The optical channel is the only link between the online dApp and the offline
vault. Both sides must read this document identically: **any change to the
format is a breaking change**, and must touch the encoder, the assembler and
the test vectors in the same commit.

---

## 1. Frame envelope

A frame is a **string**, rendered as a QR code in *alphanumeric mode*, error
correction **M**.

```
PS1:<SID>:<INDEX>:<TOTAL>:<CRC32>:<CHUNK>
```

| Offset | Length | Field | Contents |
|---|---|---|---|
| 0 | 3 | `PS1` | Magic. A frame that does not start with it is ignored silently. |
| 3 | 1 | `:` | Separator |
| 4 | 5 | `SID` | Session id: 3 random bytes in Base45 |
| 9 | 1 | `:` | |
| 10 | 2 | `INDEX` | Position, decimal, **1-based**, `01`–`99` |
| 12 | 1 | `:` | |
| 13 | 2 | `TOTAL` | Frame count, decimal, `01`–`99` |
| 15 | 1 | `:` | |
| 16 | 8 | `CRC32` | CRC-32 of the **binary** chunk, uppercase hex |
| 24 | 1 | `:` | |
| 25 | ≤ 600 | `CHUNK` | A slice of the payload, in Base45 |

Header: **25 characters**. A 300-byte chunk becomes 450 characters, so a full
frame is about 475 → QR version 14-M (528 alphanumeric characters, 73 × 73
modules). Rendered at 520 px, one module is about 7 px: readable at 20–30 cm
by any phone.

> **Never parse by splitting on `:`.** The colon is part of the Base45
> alphabet (RFC 9285), so a chunk can contain one. The header is fixed-width
> and read by offset. That is why `INDEX` and `TOTAL` are two zero-padded
> digits rather than variable-length.

### Alphabet

The Base45 alphabet is exactly the QR alphanumeric set:

```
0-9 A-Z space $ % * + - . / :
```

The 45 characters coincide, and both the `:` separator and the uppercase hex
of the CRC are already in the set. An emitted frame therefore **never**
contains a character outside alphanumeric mode — otherwise the QR would fall
back to byte mode and the capacity budget above would be wrong.
`packages/agqp` asserts this in a test.

### Chunk sizes

| Preset | Bytes per chunk | Use |
|---|---|---|
| `S` | 200 | Low-contrast screens, slow phones |
| `M` | 300 | **Default** |
| `L` | 400 | Good conditions, fewer frames |

The setting is exposed in the web UI at `/sign` for the measurement matrix
(phone × size × fps).

### Limits

- 99 frames maximum — 29,700 bytes at size `M`. The largest real message
  (a three-leg basket with a Pyth payload) fits in 6.
- An empty payload is refused.

---

## 2. Payload (CBOR)

One structure for every message. The `sid` is repeated inside it: the
assembler checks that it matches the frames' `SID`, which stops a captured
payload from being re-wrapped into another session.

```
SignRequest { v: 1, kind: "SIGN", sid: bytes(3), vault: bytes(32),
              txs: [bytes],            // unsigned v0 messages
              manifest: { kind, legs: [{ i: inMint, o: outMint, a: inAmount,
                                         q: quotedOut, m: minOut, f: feedId }],
                          slip: u16, payer: bytes(32), nonce: bytes(32),
                          dapp: tstr, at: u64,
                          mints: [{ m: bytes(32), x: float,    // multiplier
                                    nx: float, na: u64,        // the next one, and its date
                                    pd: bytes(32), p: bool,    // delegate, frozen
                                    at: u64 }] },
              price: bytes }           // Pyth Pro message, `solana` format

SignResponse { v: 1, kind: "SIGR", sid, sigs: [bytes(64)] }
Pair         { v: 1, kind: "PAIR", vault: bytes(32), label: tstr, net: "mainnet" | "devnet" }
PaperVault   — its own encoding, below
```

### Paper-Vault

The Paper-Vault never crosses the framed channel: it is **one printed QR**,
scanned in a single shot. So it has its own self-contained, versioned
encoding, in `packages/vault-crypto`:

```
PVLT:<BASE45(blob)>
```

The blob is 127 bytes flat — version, KDF algorithm and cost, salt, nonce,
ciphertext (seed + GCM tag), public key, creation date — which is **196
characters** once encoded, comfortably within a printable QR. Everything
needed to decrypt is inside it, KDF cost included: raising the cost later
orphans no existing backup.

### `mints` — what the vault cannot read for itself

The xStocks carry the Token-2022 **ScaledUiAmount** extension: a real amount
is `raw / 10^decimals × multiplier`, and the multiplier lives on the mint. A
vault in airplane mode cannot read it there, so it travels.

It is the only figure on the order ticket the sender chooses — every other one
is extracted from the transaction itself. Two properties are decidable offline
and are decided, under rule **P11**:

1. a mint the vault *knows* is scaled (the table in `@pixstock/shared`) must
   declare a multiplier — omitting it would falsify every amount;
2. a mint it knows is unscaled must not declare one — otherwise you could
   multiply USDC by five and have it displayed that way.

Neither proves the value. Nothing offline can. So the ticket prints it, says
where it came from, and shows the unscaled amount beside it.

The `nx` field (a scheduled multiplier) travels **only with `na`**, its date:
"a new multiplier is coming" is not actionable without "on the 3rd".

Careful: the mint stores *two* multipliers and a switch-over date, and which
one is in force depends on the clock. Reading the first field alone returns
the stale value — see `MintState` on the relayer side.

---

## 3. Byte budget

Measured 12 Sept 2026 by `scripts/measure-tx-size.mjs`, against real mainnet
Jupiter routes, with `payer ≠ signer` and Token-2022 ATA creation included.

| Contents | Bytes |
|---|---|
| One swap, USDC → TSLAx | **581** |
| Two-leg basket | **763** |
| Three-leg basket, AAPLx + NVDAx + MSFTx | **910** — under Solana's 1,232 limit |
| Four-leg basket | **1,052** |
| Pyth Pro `solana` message, 1 feed | ≈ 145 |
| Pyth Pro `solana` message, 3 feeds | ≈ 205 |
| **SIGN, one swap**, full CBOR payload | **903 → 4 frames at `M`** |
| **SIGN, three-leg basket**, full CBOR payload | **1,519 → 6 frames at `M`** |
| **SIGR** (one signature) | 107 characters → 1 static QR |

> **These sizes depend on the route.** Jupiter picks a different one from one
> minute to the next: a simple swap measures 581 bytes over one hop
> (`Whirlpool`) and 789 over two (`Flux+PancakeSwap`). Everything fits, but no
> absolute number is stable. That is why the builder forces `onlyDirectRoutes`
> as soon as there is more than one leg — without it a basket can overflow at
> the router's whim — and why the live tests assert that lookup tables are
> applied rather than asserting a byte count.

The figures above assume a **cold** vault: every leg creates its token
account. Once those exist — the state from the second order onwards — the
three-leg basket drops to **816 bytes and 5 frames**, and the single swap to
**507 bytes and 3 frames**.

> **Address lookup tables are not optional.** Jupiter names the tables its
> route uses but returns their contents empty: they have to be read from the
> chain. Without them, eleven accounts stay inline at 32 bytes each and a
> simple swap goes from 581 to 955 bytes — enough to push a two-leg basket
> over the transaction limit. This bug existed, and made a three-leg basket
> look impossible.

At 8 fps a 5-frame cycle takes 0.625 s. A phone decoding at 15–30 fps catches
everything in one or two cycles: **the sub-1.5 s target holds.**

If the Pyth Hermes fallback is ever adopted, the price payload grows from
~145 to ~1,200 bytes and the three-leg basket goes from 6 frames to about 10.
The format does not change — only the frame count. That is why `INDEX` and
`TOTAL` go to 99.

---

## 4. Broadcast and assembly

**Sending (web).** The frames cycle continuously at 8 fps by default. The
cycle never stops on its own: the phone can join the sequence at any index.

**Receiving (vault).**

1. A `requestAnimationFrame` loop feeds the video element to the native
   `BarcodeDetector`.
2. Each decoded string goes to `FrameAssembler.push()`.
3. The assembler **locks onto the SID of the first valid frame** and ignores
   every frame from another session afterwards.
4. An `index → chunk` table; duplicates tolerated; progress shown as
   "4 of 5 frames".
5. It fires as soon as `TOTAL` distinct chunks are in hand.
6. A 20-second timeout, then "hold the phone steady, and fill the frame".

> **`BarcodeDetector` is the only decoder in the vault.** It ships on Chrome
> for Android and ChromeOS, which is where the vault is meant to run — and it
> is undefined on desktop Linux, Windows, Firefox and Safari. On those the
> vault says so and points at the paste channel rather than failing quietly.
> No WASM decoder is bundled: every dependency in an offline signer is
> something that has to be audited, and the paste channel already covers the
> single-device case. `apps/web` does ship `jsQR`, because the laptop reading
> the reply has no such guarantee and is not air-gapped.

**Silent rejections** (the frame is dropped, the scan continues): missing
magic, short header, non-numeric `INDEX`/`TOTAL`, `INDEX` out of range,
invalid Base45, CRC mismatch, `TOTAL` inconsistent with the locked one, a
different SID.

A corrupt frame must never fail the session: it is discarded, and the next
cycle sends it again.

---

## 5. Test vectors

`packages/agqp/test` covers:

- a round trip over 1,000 random payloads, at all three sizes;
- the RFC 9285 Base45 vectors and the canonical CRC-32 value `0xCBF43926`;
- a corrupt frame (one flipped bit) rejected by the CRC;
- frames from another session ignored;
- frames received out of order and duplicated;
- every emitted frame being inside the QR alphanumeric set;
- the frame length bound being respected.
