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

Implémentées dans `packages/tx-policy/src/policy.ts`, chacune avec sa mutation
adverse dans `test/policy.test.ts`, appliquée à une **vraie transaction
Jupiter mainnet**.

| Règle | Énoncé | État |
|---|---|---|
| `P1` | Le vault ne doit pas être le fee payer | ✅ |
| `P2` | Tout programme doit être dans la liste blanche et nommable | ✅ |
| `P3` | Aucune délégation : ni `approve`, ni `revoke`, ni changement d'autorité | ✅ |
| `P4` | Aucune fermeture ni destruction d'un compte de tokens du vault | ✅ |
| `P5` | La sortie d'un swap doit atterrir dans un compte que le vault dérive lui-même | ✅ |
| `P6` | Les montants doivent correspondre au manifest | ✅ |
| `P7` | Le slippage doit rester sous le manifest et sous le plafond dur (300 bps) | ✅ |
| `P8` | Au plus une avance de nonce, et le vault n'en est pas l'autorité | ❌ **non appliquée** |
| `P9` | Le nombre de lignes de swap doit correspondre au manifest | ✅ |
| `P10` | Aucun lamport ne peut sortir du vault | ✅ |

**Une règle non implémentée n'est pas une règle qui passe.** `applyPolicy`
renvoie `ok: false` tant que `unevaluated` n'est pas vide, et liste les règles
concernées. Un moteur qui rendrait un feu vert en sautant la moitié de ses
contrôles serait pire que pas de moteur du tout : le porteur lui ferait
confiance.

### Le manifest n'est jamais cru

Chaque chiffre de la fiche d'ordre vient des instructions décompilées. Le
manifest ne sert qu'à être confronté à elles, et un désaccord est un refus —
c'est exactement ce que teste la mutation `P6`.

### Ce que le décodeur refuse de deviner

Le plan de route Jupiter est une liste de variantes d'AMM qui change à chaque
intégration : le décoder serait viser une cible mobile. Seuls les arguments de
queue, de largeur fixe (montant, montant coté, slippage, frais de plateforme),
sont lus ; le plan reste opaque et signalé comme tel (`routePlanOpaque`). De
même, un programme tiré d'une table de lookup est rapporté `lookup:<index>`,
jamais affublé d'un nom plausible — une étiquette fausse, c'est le blind
signing qui revient déguisé.
