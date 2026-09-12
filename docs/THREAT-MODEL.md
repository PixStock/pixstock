# Modèle de menace et politique de signature

> **À compléter (J0-J2).** Source : `PLAN_INTEGRATION.md §4.3` et `§6.B`.
>
> Ce fichier décrit ce que chaque composant n'a **jamais** le droit de faire,
> et les règles P1..P10 que `packages/tx-policy` applique avant toute
> signature. Il est distinct de [`../SECURITY.md`](../SECURITY.md), qui est
> la politique de divulgation de vulnérabilités.

## Invariants

| Composant | N'a jamais le droit de… |
|---|---|
| `apps/vault` | émettre une requête réseau (`fetch`, `XMLHttpRequest`, WebSocket, script tiers) ; persister la graine déchiffrée ; signer sans vérification biométrique |
| `apps/relayer` | stocker une clé utilisateur ; signer autre chose que fee payer et nonce authority ; construire une transaction non demandée par la dApp |
| `apps/web` | détenir une clé privée ; signer quoi que ce soit |

## Le manifest n'est jamais la source de vérité

La fiche d'ordre affichée est dérivée des **instructions décompilées**, pas
du manifest. Le manifest sert uniquement de contrôle croisé : s'il diverge
des instructions, la signature est refusée.

## Règles P1..P10

À rédiger. Chacune doit être accompagnée d'une mutation adverse dans les
fixtures de `packages/tx-policy` (montant altéré, ATA d'un tiers, `approve`
caché, fee payer = vault, ligne supplémentaire, ALT sensible…).
