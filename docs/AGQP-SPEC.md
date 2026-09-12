# AGQP v1 — Air-Gap QR Protocol

Version **1**, figée le 12 sept. 2026. Implémentation : `packages/agqp`.

Le canal optique est le seul lien entre la dApp en ligne et le vault hors
ligne. Les deux côtés doivent lire ce document à l'identique : **toute
modification du format est un changement cassant** et doit toucher
l'encodeur, l'assembleur et les vecteurs de test dans le même commit.

---

## 1. Enveloppe d'une trame

Une trame est une **chaîne de caractères** rendue en QR *mode alphanumérique*,
correction d'erreur **M**.

```
PS1:<SID>:<INDEX>:<TOTAL>:<CRC32>:<CHUNK>
```

| Décalage | Longueur | Champ | Contenu |
|---|---|---|---|
| 0 | 3 | `PS1` | Magic. Une trame qui ne commence pas par là est ignorée sans bruit. |
| 3 | 1 | `:` | Séparateur |
| 4 | 5 | `SID` | Identifiant de session, 3 octets aléatoires en Base45 |
| 9 | 1 | `:` | |
| 10 | 2 | `INDEX` | Position, décimal **1-based**, `01`–`99` |
| 12 | 1 | `:` | |
| 13 | 2 | `TOTAL` | Nombre de trames, décimal, `01`–`99` |
| 15 | 1 | `:` | |
| 16 | 8 | `CRC32` | CRC-32 du chunk **binaire**, hexadécimal majuscule |
| 24 | 1 | `:` | |
| 25 | ≤ 600 | `CHUNK` | Fragment du payload, en Base45 |

En-tête : **25 caractères**. Chunk de 300 octets → 450 caractères. Trame
complète ≈ 475 caractères → QR version 14-M (528 caractères alphanumériques,
73 × 73 modules). Affiché à 520 px, un module fait ~7 px : lisible à 20-30 cm
par n'importe quel téléphone.

> ⚠️ **Ne jamais parser en découpant sur `:`.** Le caractère `:` appartient à
> l'alphabet Base45 (RFC 9285), donc un chunk peut en contenir. L'en-tête est
> à largeur fixe et se lit par décalage. C'est la raison pour laquelle
> `INDEX` et `TOTAL` sont sur deux chiffres zéro-préfixés, et non
> variables.

### Alphabet

L'alphabet Base45 est exactement le jeu du mode alphanumérique QR :

```
0-9 A-Z espace $ % * + - . / :
```

Les 45 caractères coïncident, plus le `:` de séparation et les chiffres
hexadécimaux majuscules du CRC qui sont déjà dans le jeu. Une trame émise ne
contient donc **jamais** de caractère hors mode alphanumérique — sans quoi le
QR basculerait en mode octet et le calcul de capacité ci-dessus serait faux.
`packages/agqp` le vérifie par test.

### Tailles de chunk

| Préréglage | Octets par chunk | Usage |
|---|---|---|
| `S` | 200 | Écrans peu contrastés, téléphones lents |
| `M` | 300 | **Défaut** |
| `L` | 400 | Bonnes conditions, moins de trames |

Le réglage est exposé dans l'interface web pour la journée de mesure
(matrice téléphone × taille × FPS).

### Limites

- 99 trames au maximum, soit 29 700 octets en taille `M`. Le plus gros
  message réel prévu (panier 3 lignes, payload Pyth de repli) tient en
  9 trames.
- Un payload vide est refusé.

---

## 2. Payload (CBOR)

Une seule structure pour tous les messages. Le champ `sid` y est répété :
l'assembleur vérifie qu'il correspond au `SID` des trames, ce qui empêche de
ré-encapsuler un payload capturé dans une autre session.

```
SignRequest { v: 1, kind: "SIGN", sid: bytes(3), vault: bytes(32),
              txs: [bytes],            // messages v0 non signés
              manifest: { kind, legs: [{ i: inMint, o: outMint, a: inAmount,
                                         q: quotedOut, m: minOut, f: feedId }],
                          slip: u16, payer: bytes(32), nonce: bytes(32),
                          dapp: tstr, at: u64,
                          mints: [{ m: bytes(32), x: float,    // multiplicateur
                                    nx: float, na: u64,        // le suivant, et sa date
                                    pd: bytes(32), p: bool,    // délégué, gel
                                    at: u64 }] },
              price: bytes }           // message Pyth Pro format `solana`

SignResponse { v: 1, kind: "SIGR", sid, sigs: [bytes(64)] }
Pair         { v: 1, kind: "PAIR", vault: bytes(32), label: tstr, net: "mainnet" | "devnet" }
PaperVault   — voir ci-dessous, encodage propre
```

### Paper-Vault

Le Paper-Vault ne traverse jamais le canal à trames : c'est **un seul QR
imprimé**, scanné d'un coup. Il a donc son propre encodage, autonome et
versionné, dans `packages/vault-crypto` :

```
PVLT:<BASE45(blob)>
```

Le blob fait 127 octets à plat — version, algorithme et coût de la KDF, sel,
nonce, chiffré (graine + tag GCM), clé publique, date de création — soit
**196 caractères** une fois encodé, largement dans les capacités d'un QR
imprimable. Tout ce qui est nécessaire au déchiffrement est dedans, coût de
la KDF compris : relever le coût plus tard n'orpheline aucune sauvegarde.

### `mints` — ce que le vault ne peut pas lire

Les xStocks portent l'extension Token-2022 **ScaledUiAmount** : un montant
réel vaut `brut / 10^décimales × multiplicateur`, et le multiplicateur vit
sur le mint. Un vault en mode avion ne peut pas l'y lire, donc il voyage.

C'est le seul chiffre de la fiche d'ordre que l'expéditeur choisit — tous
les autres sont extraits de la transaction elle-même. Deux propriétés sont
vérifiables hors ligne et le sont, sous la règle **P11** :

1. un mint que le vault *sait* scalé (table de `@pixstock/shared`) doit
   déclarer un multiplicateur — l'omettre fausserait chaque montant ;
2. un mint qu'il sait non scalé ne doit pas en déclarer — sans quoi on
   pourrait multiplier l'USDC par cinq et le faire afficher.

Aucune des deux ne prouve la valeur. Rien hors ligne ne le peut. La fiche
l'imprime donc, dit d'où elle vient, et affiche à côté le montant non scalé.

Le champ `nx` (multiplicateur programmé) ne voyage **qu'avec `na`**, sa date :
« un nouveau multiplicateur arrive » n'est pas actionnable sans « le 3 ».

Attention : le mint stocke *deux* multiplicateurs et une date de bascule, et
celui en vigueur dépend de l'horloge. Lire le premier champ seul renvoie la
valeur périmée — voir `MintState` côté relayer.

---

## 3. Budget d'octets

Mesures du 12 sept. 2026 (Jupiter `lite-api`, payer ≠ signataire, création
d'ATA Token-2022 incluse).

| Contenu | Octets |
|---|---|
| Transaction 1 swap USDC → TSLAx | **581** (mesuré) |
| Panier 2 lignes | **763** |
| Panier 3 lignes AAPLx + NVDAx + MSFTx | **910** — sous la limite Solana de 1 232 |
| Panier 4 lignes | **1 052** |
| Message Pyth Pro `solana`, 1 feed | ≈ 145 |
| Message Pyth Pro `solana`, 3 feeds | ≈ 205 |
| **SIGN 1 swap**, payload CBOR complet | **903 → 4 trames en `M`** |
| **SIGN panier 3 titres**, payload CBOR complet | **1 519 → 6 trames en `M`** |
| **SIGR** (1 signature) | 107 caractères → 1 QR statique |

Mesures du 12 sept. 2026 par `scripts/measure-tx-size.mjs`, routes Jupiter
mainnet réelles, `payer ≠ signataire`.

> **Ces tailles dépendent de la route.** Jupiter en choisit une différente
> d'une minute à l'autre : un swap simple mesure 581 octets sur un saut
> (`Whirlpool`) et 789 sur deux (`Flux+PancakeSwap`). Tout tient sous la
> limite, mais aucun chiffre absolu n'est stable. C'est pourquoi le
> constructeur force `onlyDirectRoutes` dès qu'il y a plusieurs lignes — sans
> ça un panier peut déborder selon l'humeur du routeur — et pourquoi les tests
> live vérifient que les tables de lookup sont appliquées plutôt qu'un nombre
> d'octets. Les chiffres ci-dessus supposent un
vault **froid** : chaque ligne crée son compte de tokens. Une fois ces comptes
créés — l'état dès le deuxième ordre — le panier 3 lignes tombe à **816 o et
5 trames**, et le swap simple à **507 o et 3 trames**.

> ⚠️ **Les tables de lookup d'adresses ne sont pas optionnelles.** Jupiter
> nomme les tables que sa route utilise mais renvoie leur contenu vide : il
> faut les lire sur la chaîne. Sans elles, onze comptes restent en ligne à
> 32 octets pièce et un swap simple passe de 581 à 955 octets — assez pour
> faire déborder un panier 2 lignes hors de la limite de transaction. Ce bug a
> existé et a fait croire que la feature C était irréalisable.

À 8 FPS, un cycle de 5 trames dure 0,625 s. Un téléphone qui décode à 15-30
fps capte tout en 1 à 2 cycles : **objectif < 1,5 s tenu**.

Si le repli Pyth Hermes est retenu (risque R1), le payload de prix passe de
~145 à ~1 200 octets : le panier 3 lignes passe alors de 6 à environ
10 trames — le format ne change pas,
seul le nombre de trames augmente. C'est pourquoi `INDEX`/`TOTAL` vont
jusqu'à 99.

---

## 4. Diffusion et assemblage

**Émission (web).** Les trames tournent en boucle continue à 8 FPS par
défaut. Le cycle ne s'arrête jamais de lui-même : le téléphone peut entrer
dans la séquence à n'importe quel indice.

**Réception (vault).**

1. Boucle `requestVideoFrameCallback` → `BarcodeDetector` natif si disponible
   (Chrome Android), sinon `zxing-wasm` (iOS Safari), `jsQR` en dernier
   recours.
2. Chaque texte décodé passe à `FrameAssembler.push()`.
3. L'assembleur **se verrouille sur le SID de la première trame valide** et
   ignore ensuite toute trame d'une autre session.
4. Table `index → chunk`, doublons tolérés, progression « 4 / 5 trames ».
5. Déclenchement dès que `TOTAL` chunks distincts sont réunis.
6. Timeout 20 s, puis « rapprochez ou éloignez le téléphone ».

**Rejets silencieux** (la trame est ignorée, le scan continue) : magic absent,
en-tête trop court, `INDEX`/`TOTAL` non numériques, `INDEX` hors bornes,
Base45 invalide, CRC non conforme, `TOTAL` incohérent avec celui déjà
verrouillé, SID différent.

Une trame corrompue ne doit jamais faire échouer la session : elle est
écartée, et le cycle suivant la réémet.

---

## 5. Vecteurs de test

`packages/agqp/test` couvre :

- aller-retour sur 1 000 payloads aléatoires, aux trois tailles ;
- vecteurs Base45 de la RFC 9285 et valeur canonique CRC-32 `0xCBF43926` ;
- trame corrompue (un bit retourné) rejetée par le CRC ;
- trames d'une autre session ignorées ;
- trames reçues dans le désordre et en double ;
- toute trame émise est dans le jeu alphanumérique QR ;
- borne de longueur de trame respectée.
