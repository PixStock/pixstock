# Modèle de menace et politique de signature

> **À compléter (J0-J2).** Source : `PLAN_INTEGRATION.md §4.3` et `§6.B`.
>
> Ce fichier décrit ce que chaque composant n'a **jamais** le droit de faire,
> et les règles P1..P11 que `packages/tx-policy` applique avant toute
> signature. Il est distinct de [`../SECURITY.md`](../SECURITY.md), qui est
> la politique de divulgation de vulnérabilités.

## Invariants

| Composant | N'a jamais le droit de… |
|---|---|
| `apps/vault` | émettre une requête réseau (`fetch`, `XMLHttpRequest`, WebSocket, script tiers) ; persister la graine déchiffrée ; signer sans vérification biométrique |
| `apps/relayer` | stocker une clé utilisateur ; signer autre chose que fee payer et nonce authority ; construire une transaction non demandée par la dApp |
| `apps/web` | détenir une clé privée ; signer quoi que ce soit |

## Ce contre quoi le produit ne protège pas

**L'émetteur peut saisir ou geler les tokens.** Les cinq xStocks sont des
mints Token-2022 portant un *permanent delegate* et une *freeze authority*,
tous deux détenus par l'émetteur. Vérifié sur mainnet le 12 sept. 2026 : les
cinq partagent le délégué `5aMNNLQJwAEeoemTEMkv5NVjqKwvvefRYCQ5Z67HFvEq`.
Cette adresse peut sortir des tokens de n'importe quel compte, **sans la
signature du détenteur**.

C'est la limite honnête de ce qu'un signataire hors ligne protège : il empêche
quiconque n'est pas l'émetteur de bouger vos actifs, et il n'empêche rien à
l'émetteur. La simulation le rappelle d'elle-même — créer un compte pour l'un
de ces mints journalise « Mint has a permanent delegate, so tokens in this
account may be seized at any time ».

À reporter sur la fiche d'ordre du vault : un porteur qui signe devrait le
voir au moment de signer, pas seulement sur la page légale.

## Le manifest n'est jamais la source de vérité

La fiche d'ordre affichée est dérivée des **instructions décompilées**, pas
du manifest. Le manifest sert uniquement de contrôle croisé : s'il diverge
des instructions, la signature est refusée.

## Règles P1..P11

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
| `P11` | Un mint scalé doit déclarer un multiplicateur plausible, et lui seul peut en déclarer un | ✅ |

**Une règle non implémentée n'est pas une règle qui passe.** `applyPolicy`
renvoie `ok: false` tant que `unevaluated` n'est pas vide, et liste les règles
concernées. Un moteur qui rendrait un feu vert en sautant la moitié de ses
contrôles serait pire que pas de moteur du tout : le porteur lui ferait
confiance.

### Le multiplicateur, et pourquoi il fait exception

`ScaledUiAmount` (Token-2022) rend le montant réel égal à
`brut / 10^décimales × multiplicateur`. Le multiplicateur vit sur le mint, et
le vault est en mode avion : c'est **le seul chiffre de la fiche que
l'expéditeur choisit**. Tous les autres sont extraits de la transaction.

Ce qu'un menteur y gagne : pas un centime de plus dépensé — la transaction
signée est inchangée — mais un porteur qui croit recevoir autre chose que ce
qu'il reçoit. Pour ce produit, c'est la même chose.

La défense n'est pas la confiance, c'est la divulgation plus une borne :

- **P11** refuse un mint scalé sans multiplicateur, un multiplicateur hors de
  `[1e-4, 1e4]`, et un multiplicateur déclaré pour un mint que le vault sait
  non scalé. Ces trois-là sont décidables hors ligne, depuis la table de
  `@pixstock/shared`.
- `buildTicket` **n'applique jamais** un multiplicateur à un mint que cette
  même table dit non scalé, quoi qu'en dise l'ordre.
- La fiche **imprime** le multiplicateur, dit qu'il vient du relayer et n'est
  pas vérifiable hors ligne, et affiche à côté le montant non scalé.

Trois mesures sur cinq mints, 12 sept. 2026 : l'écart entre montant brut et
montant réel atteint **0,59 %** (MSFTx). Sur l'écran qui prétend montrer les
vrais montants.

### Ce que le vault sait sans qu'on le lui dise

Deux propriétés des xStocks sont dans la table hors ligne plutôt que dans
l'ordre, `scaledUiAmount` et `hasPermanentDelegate`, et ce n'est pas une
optimisation : **un avertissement qu'un expéditeur peut faire taire en
omettant un champ n'est pas un avertissement.** L'adresse du délégué voyage,
mais l'existence du délégué, non — l'omettre ne coûte plus à l'attaquant que
le nom.

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
