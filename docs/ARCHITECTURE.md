# Architecture

> Source : `PLAN_INTEGRATION.md §4` et `§7` (hors dépôt). Ce fichier est le
> résumé versionné ; le plan reste le document de travail détaillé.

## Composants

| Composant | Rôle | Peut-il atteindre le réseau ? |
|---|---|---|
| `apps/web` | Construit l'ordre, affiche les trames QR animées, scanne le retour webcam, diffuse la transaction | Oui |
| `apps/vault` | Assemble les trames, vérifie Pyth, applique la politique, affiche la fiche, signe | **Non — jamais** |
| `apps/relayer` | Quotes Jupiter, construction de la `VersionedTransaction`, fee payer, pool de nonces, co-signature, broadcast | Oui |

Le vault détient la seule clé qui peut déplacer des actifs et n'a aucun
chemin de code vers le réseau. Le relayer paie les frais et fait avancer un
durable nonce — il ne peut jamais déplacer un token. Le web affiche et
scanne, il ne signe rien.

## Flux de bout en bout

1. L'utilisateur compose un ordre (`/trade` ou `/basket`).
2. Le relayer cote via Jupiter, construit le message v0 : advance nonce,
   compute budget, création d'ATA si besoin, swaps.
3. Le relayer joint le message Pyth signé (`priceAttestation`) et un
   `manifest` lisible.
4. `apps/web` encode le tout en trames AGQP et les affiche à 8 FPS.
5. Le vault scanne, assemble (CRC32), vérifie la signature Pyth, applique
   P1..P10, affiche la fiche d'ordre, demande la biométrie, signe.
6. Le vault affiche un QR statique contenant **la signature seule** (64 o).
7. La webcam la lit, le relayer co-signe (fee payer + nonce) et diffuse.

Temps cibles : transfert aller < 2 s · vérification + fiche < 1 s · retour
instantané.

## Modules du relayer

`orders` · `quotes` · `tx-builder` · `pyth` · `nonces` · `relayer` · `vaults`
· `market` · `health`. Aucun n'est encore écrit : `app.module.ts` porte la
liste en commentaire.

## Écrans du vault

Onboarding · Accueil (pubkey + QR PAIR) · Scanner · Vérification · Signature
· Sauvegarde (Paper-Vault) · Réglages.

## Réseaux

`SOLANA_CLUSTER=devnet` pour le développement (mints mock Token-2022, market
maker simulé), `mainnet-beta` pour la démo et la vidéo. Jupiter et les
xStocks n'existent qu'en mainnet.
