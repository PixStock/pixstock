# Threat model and signing policy

What each component is **never** allowed to do, the twelve rules
`packages/tx-policy` applies before any signature, and — the section most
projects leave out — what this product does not protect you from.

This is distinct from [`../SECURITY.md`](../SECURITY.md), which is the
vulnerability disclosure policy.

## Invariants

| Component | May never… |
|---|---|
| `apps/vault` | make a network request (`fetch`, `XMLHttpRequest`, WebSocket, third-party script); persist the decrypted seed; sign without the biometric check where one is enrolled |
| `apps/relayer` | store a user key; sign anything but fee payer and nonce authority; build a transaction the dApp did not ask for |
| `apps/web` | hold a private key; sign anything |

The first of these is enforced by a lint rule that fails the build, not by
review — see `apps/vault/eslint.config.mjs`. The built bundle is checked
again: `apps/vault/dist/assets/*.js` contains no *call* to `fetch`,
`XMLHttpRequest`, `WebSocket`, `EventSource` or `navigator.sendBeacon`. The
exact command, and why grepping for the bare word `fetch` finds React DOM
properties that call nothing, is in [README.md](README.md#checking-the-air-gap-yourself).

The Workbox runtime beside it, `apps/vault/dist/workbox-*.js`, does call
`fetch` — that is how a PWA serves its own precache offline at all.

Say plainly what holds that one down, because it is not the CSP: a service
worker is governed by the policy served with *its own* script response, and
ours is sent with the HTML document only. So `connect-src 'none'` constrains
every script running in the page and does not constrain the worker. What
constrains the worker is that we do not write it — Workbox generates it from
the precache manifest at build time, its handlers resolve from that cache,
and no code of ours runs there to give it an origin. It is the one component
whose air-gap rests on reading the generated file rather than on the browser
refusing.

## What this product does not protect you from

**The issuer can seize or freeze the tokens.** All five xStocks are
Token-2022 mints carrying a *permanent delegate* and a *freeze authority*,
both held by the issuer. Verified on mainnet 12 Sept 2026: the five share the
delegate `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`. That address can move
tokens out of any account **without the holder's signature**.

This is the honest boundary of what an offline signer buys you. It stops
everyone who is not the issuer from moving your assets, and it stops the
issuer from nothing. Solana's own tooling says so out loud — creating an
account for one of these mints logs *"Mint has a permanent delegate, so tokens
in this account may be seized at any time."*

So the vault says it too, on the screen where the decision is made rather than
in a legal page nobody opens: *"Backed Finance can move TSLAx out of your
account without your signature. That is how this token is issued — no signer
can change it."* On a basket it is one sentence naming every asset, not the
same paragraph once per leg.

**And the rest of the honest list.** This is a hackathon build. It is
unaudited. The relayer is a single point of availability — if it is down, no
order can be built, though nothing you already hold is at risk. A compromised
relayer cannot forge Pyth's signature or move your tokens, but it can refuse
to serve you. The phone's own screen is trusted: if the phone is compromised
before the vault is installed, nothing below applies.

## The manifest is never the source of truth

Every figure on the order ticket is derived from the **decompiled
instructions**. The manifest that travels beside them exists only to be
contradicted: if the two disagree, the signature is refused. That is rule P6,
and it has an adversarial mutation test.

## Rules P1–P12

Implemented in `packages/tx-policy/src/policy.ts`, each with its adversarial
mutation in `test/policy.test.ts`, applied to a **real mainnet Jupiter
transaction**.

| Rule | Statement | State |
|---|---|---|
| `P1` | The vault must not be the fee payer | Enforced |
| `P2` | Every program must be in the allowlist and nameable | Enforced |
| `P3` | No delegation: no approve, revoke or authority change | Enforced |
| `P4` | No closing or burning a vault token account | Enforced |
| `P5` | Swap output must land in an account the vault derives itself | Enforced |
| `P6` | Amounts must match the manifest | Enforced |
| `P7` | Slippage must be within the manifest and the hard cap | Enforced |
| `P8` | At most one nonce advance, and the vault is not its authority | Enforced |
| `P9` | The number of swap legs must match the manifest | Enforced |
| `P10` | No lamports may leave the vault | Enforced |
| `P11` | Scaled mints must declare a plausible multiplier, and only scaled mints may declare one | Enforced |
| `P12` | Every swap must be authorised by this vault, and by nothing else | Enforced |

The statements above are `POLICY_RULES` in the source, word for word.

`EVALUATED_RULES` in the source is what `/protocol` renders, so the page
cannot claim a rule the engine does not run.

**A rule that is not implemented is not a rule that passes.** `applyPolicy`
returns `ok: false` for as long as `unevaluated` is non-empty, and lists the
rules concerned. An engine that returned a green light while skipping half its
checks would be worse than no engine at all, because the holder would trust
it.

## The offline price guard

The phone verifies Pyth's ed25519 signature over the exact bytes that
travelled, against signers read from the chain and pinned into the build. It
then compares the oracle's price to the price the transaction's **own
amounts** imply.

Three outcomes, not two:

- **It verifies and holds.** Sign.
- **It is forged, stale, or off the market.** Never sign — and there is no
  checkbox. The vault knows the order is wrong, and a confirmation dialog
  would only be a way of talking someone into it.
- **There is no price at all.** The holder decides, once, in the open. Pyth
  does not cover every asset and a grant does not cover every feed; refusing
  outright would make the vault useless for those, and pretending would be
  worse. So the phone says what it could not check, and asks.

The holder's own tolerance rides on top and **can only be tightened** — see
`apps/vault/src/vault/settings.ts`. Choosing a stricter number can never turn
a refusal into an approval.

## The multiplier, and why it is the exception

`ScaledUiAmount` (Token-2022) makes the real amount
`raw / 10^decimals × multiplier`. The multiplier lives on the mint, and the
vault is in airplane mode: it is **the only figure on the ticket the sender
chooses**. Every other one is extracted from the transaction.

What a liar gains: not one cent more spent — the signed transaction is
unchanged — but a holder who believes they are receiving something other than
what they receive. For this product those are the same thing.

The defence is not trust. It is disclosure plus a bound:

- **P11** refuses a scaled mint with no multiplier, a multiplier outside
  `PLAUSIBLE_MULTIPLIER` (`1e-4` to `1e4`), and a multiplier declared for a
  mint the vault knows is not scaled. All three are decidable offline, from the table in
  `@pixstock/shared`.
- `buildTicket` **never** applies a multiplier to a mint that same table says
  is unscaled, whatever the order claims.
- The ticket **prints** the multiplier, says it came from the relayer and is
  not verifiable offline, and shows the unscaled amount beside it.

Three measurements across five mints, 12 Sept 2026: the gap between the raw
amount and the real amount reaches **0.59 %** (MSFTx) — on the screen that
claims to show you real amounts.

## What the vault knows without being told

Two properties of the xStocks live in the offline table rather than in the
order — `scaledUiAmount` and `hasPermanentDelegate` — and that is not an
optimisation. **A warning a sender can silence by omitting a field is not a
warning.** The delegate's address travels; the delegate's *existence* does
not. Leaving it out now costs an attacker only the name.

## What the decoder refuses to guess

Jupiter's route plan is a list of AMM variants that changes with every
integration; decoding it would be aiming at a moving target. Only the
fixed-width tail arguments are read — amount, quoted amount, slippage,
platform fee — and the plan stays opaque and is flagged as such
(`routePlanOpaque`). Likewise, a program pulled from an address lookup table
is reported as `lookup:<index>` and never given a plausible name. A false
label is blind signing in a costume.
