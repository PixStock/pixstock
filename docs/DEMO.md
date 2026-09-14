# Reproduce the demo

Everything below runs against mainnet data. Nothing is simulated: the route
is a real Jupiter route, the price is a message Pyth signed, and the
transaction is one a validator would accept.

Two things are deliberately off until you turn them on: **broadcasting**,
which spends real SOL, and the **nonce pool**, which costs rent to create.
The demo is complete and honest without either — an order is built, read,
checked, signed and simulated. Sending it is one environment variable.

---

## 1. What you need

| | |
|---|---|
| Node.js | 20+ |
| PostgreSQL | 15+, with a database for the relayer |
| A phone | Any Android phone with a camera. iOS works; Chrome on Android is the tested path. |
| A Pyth Pro token | Free, self-service, from [pythdata.app](https://pythdata.app). Without it the price guard has nothing to check. |
| A Solana RPC | The public endpoint builds orders; it is too rate limited to demo on. Helius or similar. |

Copy `apps/relayer/.env.example` to `apps/relayer/.env` and fill it in. The
vault needs nothing — that is the point.

```bash
npm install
npm run build:packages
npx prisma migrate deploy --schema apps/relayer/prisma/schema.prisma
```

## 2. Start the three pieces

```bash
npm run dev -w @pixstock/relayer   # :4000
npm run dev -w @pixstock/web       # :3000
npm run dev -w @pixstock/vault     # :5183
```

Check what the relayer can actually do before going further:

```bash
curl -s localhost:4000/healthz | jq
```

`missing` is the list that matters. It names every capability that is absent
— no key, no token, no nonce pool — rather than answering a bare "ok".
`pythStream.feeds` should list at least one feed id; `pythStream.refused`
says which feeds your grant does not cover and which are out of session.

## 3. Put the vault on the phone

The camera and WebAuthn need HTTPS on a real device. Either:

- serve the vault over a trusted local certificate (`mkcert`), or
- open the deployed vault URL.

Then **install it**: the vault offers an Install button of its own, and
Chrome's "Add to home screen" does the same thing from the menu. Everything is
precached, so from that moment the app runs with no network at all.

On iOS there is no way to ask programmatically, so the vault prints the two
taps instead: Share, then Add to Home Screen.

Open it, create a vault, and **print the Paper-Vault** when it asks. On a
phone with a screen lock it also enrols a biometric; on one without, it says
so rather than implying a check that never runs.

Now put the phone in **airplane mode**. It never leaves it again.

## 4. Pair the laptop to the phone

On the phone: **Show my address**. On the laptop, open `/vault` and scan it.
The browser remembers which vault to build orders for. Nothing secret crosses
— it is a public key, and a photograph of it is harmless.

## 5. Build an order

`/trade` for a single stock, `/basket` for the 40/30/30 index.

Use **TSLAx** if you want the price guard to have something to verify: it is
the feed our Pyth grant covers. A basket of the other three is a better
demonstration of the ticket and of "three swaps, one signature".

## 6. Cross the gap

The laptop shows animated QR frames. Point the phone at them; five frames for
a three-leg basket at the default size.

The phone then shows the screen this product exists for:

- the order **decompiled from the transaction itself**, never from the
  description that travelled with it;
- amounts scaled by the mint's multiplier, with the unscaled figure beside
  them, because every other wallet shows the unscaled one;
- the issuer's permanent delegate, disclosed;
- **the price against Pyth**, verified offline, with the deviation in percent.

## 7. The two refusals worth filming

**A price that does not verify.** Anyone can attach bytes to an order. Attach
something that is not a Pyth message and the phone says
`Price attestation could not be read` — and offers no way forward. There is
no checkbox for this case, deliberately: the vault knows the order is wrong.

**A quote that drifts.** An order whose implied price sits more than 1% from
Pyth's is refused with the number on screen. Under a percent it signs; between
0.5% and 1% it signs and says so in orange.

Both are tested, in a browser, in `system/vault-flow.spec.ts`.

## 8. Sign, and send it back

Biometric, then the master password. The phone shows a single static QR — 64
bytes of signature. Hold it to the webcam. The transaction never travels
back: the laptop already has it.

The relayer checks the signature against the message it built (R1–R8),
simulates, and — if you enabled broadcasting — sends it. The page then links
to Solscan and follows the transaction until the cluster confirms it.

## 9. Without a second device

Every step above works with one machine. The vault's **glued channel** takes
frame text by paste instead of by camera: same code path, same assembler. It
is how the system tests run, and how a judge with one laptop can follow the
whole flow.

---

## Turning on the parts that spend money

**A durable nonce.** Without one, an order dies with its blockhash after
about ninety seconds — enough to demo, tight for filming. The pool costs
rent per account and the relayer creates it on request.

**Broadcasting.** Set `RELAYER_ALLOW_BROADCAST=true` and restart. The relayer
refuses to send anything whose simulation failed, so a transaction that would
fail on chain is never paid for.

Check the relayer's balance before a demo: `/healthz` reports it, and an
empty fee payer fails at the last step of the flow, which is the worst place
to find out.
