# Tests

Quatre niveaux, trois commandes. Chacun attrape une classe de défaut que les
autres ne peuvent pas voir — le bug des tables de lookup l'a montré : tous les
tests unitaires passaient pendant que nos transactions faisaient 350 octets de
trop.

```bash
npm test          # unitaire + intégration · hors ligne, déterministe, ~3 s
npm run test:live # contre Jupiter et un nœud RPC réels · ~2 s, réseau requis
npm run test:system # Playwright, les deux apps dans un navigateur · ~45 s
npm run test:all  # les trois
```

---

## 1. Unitaire — `packages/*/test`, `apps/*/test`

Fonctions pures, formats, invariants. Aucune E/S.

Ce qu'ils verrouillent : les vecteurs RFC 9285 de Base45, la valeur canonique
CRC-32, l'aller-retour du codec sur 1 000 payloads, les 14 mutations adverses
de la politique, le refus d'un mauvais mot de passe, et le fait qu'un prix ne
peut **jamais** être déclaré vérifié tant que le vérificateur n'existe pas.

## 2. Intégration — `apps/relayer/test/api.integration.test.ts`

La surface HTTP à travers la pile NestJS réelle : routage, injection,
`ValidationPipe`, contrôleurs. Jupiter est remplacé par une réponse
enregistrée, donc c'est déterministe et hors ligne.

> ⚠️ NestJS résout ses dépendances via `design:paramtypes`, que esbuild
> n'émet pas. Sans le greffon SWC de `vitest.config.ts`, chaque route répond
> 500 et le service injecté vaut `undefined`.

## 3. Bout en bout — `packages/tx-policy/test/e2e-airgap.test.ts`

Toutes les couches dans l'ordre d'une vraie signature : un panier que le
relayer a réellement construit sur des routes mainnet → payload CBOR → trames
→ réassemblage désordonné et dupliqué → décodage → politique → fiche →
signature → réponse vérifiée contre le message émis.

La fixture est **enregistrée**, pas fabriquée
(`scripts/capture-order-fixture.mjs`). Un ordre construit à la main ne prouve
que la cohérence des morceaux entre eux — ce qui était vrai pendant tout le
temps où les tables de lookup étaient perdues.

## 4. Live — `*.live.test.ts`

Jupiter et un nœud RPC réels. Ce sont les seuls qui peuvent voir qu'une route
a changé de forme, ou qu'une transaction a grossi.

Celui qui compte le plus : **« puts a three-leg basket in ONE transaction »**.
C'est la feature C en une assertion, et c'est le test qui aurait signalé le
bug des tables de lookup le jour où il a été introduit.

Exclus de `npm test` : une suite qui peut rougir parce que Jupiter est lent
est une suite qu'on apprend à ignorer.

## 5. Système — `system/*.spec.ts`

Les deux apps qui tournent, pilotées dans un navigateur.

- **`vault-flow`** : créer un coffre, imprimer le Paper-Vault, scanner par le
  canal collé, lire la fiche, refuser un ordre destiné à un autre vault,
  refuser un mauvais mot de passe, signer, afficher le QR de réponse.
- **`web-pages`** : chaque route répond, **chaque lien interne de la landing
  résout**, le sitemap ne liste que des pages réelles, les QR tournent
  vraiment, et `/protocol` affiche `P8` comme non appliquée parce que le code
  le dit.

Le contrôle des liens existe parce que les cinq routes `/trade`, `/basket`,
`/vault`, `/protocol` et `/legal` ont été annoncées dans la navigation, le
pied de page et le sitemap alors qu'elles renvoyaient toutes 404 — avec un
build vert.

Le canal collé est utilisé plutôt qu'une caméra : c'est le même chemin de
code, et c'est aussi le mode qu'un juge avec un seul appareil emprunte.

---

## Ajouter un test

| Ce qu'on veut prouver | Où |
|---|---|
| Une fonction se comporte comme spécifié | `packages/<paquet>/test/*.test.ts` |
| Une route valide, refuse, répond | `apps/relayer/test/*.integration.test.ts` |
| Les couches s'emboîtent sur un ordre réel | `packages/tx-policy/test/e2e-airgap.test.ts` |
| Un service externe tient sa parole | `apps/*/test/*.live.test.ts` |
| Une personne peut faire la manipulation | `system/*.spec.ts` |

Rafraîchir les fixtures enregistrées après un changement de schéma :

```bash
npm run build -w @pixstock/relayer
node scripts/capture-jupiter-fixture.mjs   # un swap mainnet
node scripts/capture-order-fixture.mjs     # un panier complet + coffre chiffré
node scripts/measure-tx-size.mjs           # les tailles publiées au §3 de la spec
```
