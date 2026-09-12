# AGQP v1 — Air-Gap QR Protocol

> **À rédiger (J0).** Source : `PLAN_INTEGRATION.md §5`.
>
> `packages/agqp` implémente déjà `crc32` et Base45 (RFC 9285), testés. Le
> format d'enveloppe et le payload CBOR sont à figer ici **avant** d'écrire
> `encodeFrames` et `FrameAssembler` — les deux côtés du canal optique
> doivent lire la même spec.

## §5.1 Enveloppe d'une trame

À compléter : magic `PS1`, index, total, id de session, CRC32, payload.

## §5.2 Payload CBOR

À compléter : une seule structure pour tous les messages (ordre, pairing,
signature de retour).

## §5.3 Budget d'octets

Mesures du 12 sept. 2026 : transaction panier 3 lignes = 943 octets
(Jupiter `lite-api`, payer ≠ user, création d'ATA Token-2022 incluse).

## §5.4 Assembleur

Trames indexées `INDEX/TOTAL`, cycle continu, tolérance aux doublons, rejet
des trames d'une autre session.

## Encodage

Base45 (RFC 9285) et mode alphanumérique QR : `BarcodeDetector` renvoie une
*chaîne*, des octets bruts seraient corrompus. Coût ~3 % contre +33 % pour
Base64. Implémenté et testé dans `packages/agqp/src/base45.ts`.
