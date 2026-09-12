# PixStock Frontend — Specs fonctionnelles et techniques

Résumé du CDC pour l'équipe frontend. Source de vérité : `../CDC-PixStock.pdf`
(CDC/DGR/2026-001, v1.0, 101 exigences, 18 chapitres). Voir aussi
`../pixstock-backend/SPECS.md` pour le pendant API/services, `RULES.md` pour ce
que l'interface doit respecter, et `SKILLS.md` pour les choix techniques et
l'état d'implémentation réel.

## Positionnement

**PixStock est un marché de curation décentralisé pour l'écosystème
Solana** : un classement de tokens (« Top Trending ») où la position se gagne
par du capital réel misé, pas par du budget publicitaire — à l'opposé des
agrégateurs actuels (DexScreener, DEXTools) qui vendent la première place au
plus offrant. Le site PixStock est la vitrine et, à terme, l'application
de ce marché.

## État actuel du dépôt (important)

**Ce dépôt est un site vitrine statique, pas encore le Lot 1 du CDC.**

- Quatre pages : `/` (accueil), `/mechanic` (règles), `/roadmap` (livraison),
  `/faq` (objections). Aucune page token, aucun classement, aucun compte.
- Tous les chiffres affichés (formule de poids, barème de confiscation,
  cascade du pot, seuils de réputation, indicateurs de succès) sont ceux du
  CDC **codés en dur dans le JSX** — voir `app/page.tsx`, `app/mechanic/page.tsx`,
  `app/roadmap/page.tsx`. Il n'y a ni appel API, ni connexion portefeuille, ni
  donnée temps réel.
- Objectif de ce site avant même le Lot 1 : construire l'audience et le
  référencement naturel pendant que `pixstock-backend` et le programme Solana
  sont développés — cf. le principe du CDC §15.1, « construire l'audience et
  le référencement naturel avant toute mécanique financière ».
- Toute divergence entre une valeur affichée ici et le CDC est un bug : ces
  pages sont la version publique du chapitre 4 et du tableau 5.2, elles
  doivent rester synchronisées à la main jusqu'à ce qu'elles soient servies
  par `GET /v1/params` (`EF-17`).

## Rôles et ce que chacun voit dans l'interface (`§3`)

| Rôle | Ce qu'il attend de l'UI |
|---|---|
| Curateur (Alpha Caller) | Historique inattaquable, multiplicateur visible, position sur le leaderboard |
| Émetteur (Dev) | Tableau de bord d'audience chiffré, badge d'engagement affiché sur sa page token |
| Suiveur (Degen) | Achat en un clic, alertes, lecture immédiate du niveau de risque |
| Opérateur | Back-office : gel d'urgence, ajustement des paramètres, traitement des contestations |

Matrice complète des droits par rôle : CDC `§3.2`, tableau 3.1.

## Mécanique cœur — ce que l'UI doit rendre exactement (`§4`)

```
Poids(token) = Σᵢ( Miseᵢ × Multiplicateur(Réputationᵢ) × Facteur_durée ) − (Σⱼ Mise_Challengeⱼ × 0,6)
Multiplicateur(r) = min( 3,0 ; 0,5 + 2,5 × r / 1000 )
Facteur_durée = 1,0 pour 24h | 0,6 pour 6h | 1,8 pour 72h
Éligibilité : Liquidité ≥ 15 000 USD, Âge du pool ≥ 30 min, Détenteurs ≥ 50
```

Round de 24h, fenêtre de mise fermée à T0+2h, résolution à T+24h, règlement à
T+26h après la fenêtre de contestation. Résolution hiérarchique (fraude
caractérisée aux rangs 1-4, prix moyen pondéré au rang 6), barème de
confiscation gradué (0 % jusqu'à 20 % de baisse, 100 % en fraude
caractérisée), cascade du pot de confiscation (70 % Challenge / 15 % fonds de
garantie / 10 % trésorerie / 5 % brûlage), score de réputation 0-1000.

Détail complet : `../pixstock-backend/SPECS.md`, ou directement le CDC `§4`.
Ce résumé sert uniquement à vérifier que les pages actuelles n'ont pas dérivé
du chapitre source.

## Direction artistique et expérience (`§12` du CDC)

### Principes (`§12.1`)

- Le capital exposé est l'information première : montant engagé et
  réputation médiane aussi lisibles que le prix, sur toute ligne de
  classement.
- Les deux côtés du marché ont un poids visuel égal — convention déjà en
  place : `.ticket--boost` (bleu pâle) / `.ticket--challenge` (rose pâle)
  dans `app/globals.css`.
- Le risque n'est jamais décoratif : un bandeau de contestation occupe la
  même zone que le prix, jamais un onglet secondaire.
- La sanction est annoncée avant la signature, jamais renvoyée aux CGU.
- Aucune information portée par la couleur seule (`ENF-08`).

### Jetons de conception — déjà portés dans `app/globals.css`

| Jeton | Choix | Où |
|---|---|---|
| Thèmes | Clair/sombre, pilotés par variables CSS, bascule manuelle persistée | `--ground`, `--ink`... + classe `.light` sur `<html>`, clé `df-theme` en `localStorage` |
| Typographie | Pile système (SF Pro / Segoe UI / Roboto), aucun webfont chargé | `--font-sans-stack`, `--font-display-stack` |
| Chiffres | Monospace à chiffres tabulaires dans toute colonne de montant | classe `.num`, `font-variant-numeric: tabular-nums` (voir `td.n`, `.gate .m`, `.lot .wk`...) |
| Couleur sémantique | Séparée de l'accent, trois niveaux seulement | `.sev--1` / `.sev--2` / `.sev--3` (normal, vigilance, critique) dans `app/mechanic/page.tsx` |

### Écrans clés attendus (`§12.3`) — aucun n'existe encore dans ce dépôt

| # | Écran | Contenu attendu | Lot |
|---|---|---|---|
| 1 | Classement staké | Table dense, capital des deux côtés, réputation médiane, bandeau de contestation | 2 |
| 2 | Page token | En-tête cotation, panneau de sécurité, graphique, état du round, flux d'échanges, messagerie, widget d'échange en colonne persistante | 1 (sans round), 2 (avec round) |
| 3 | Ouverture de position | Montant, durée, poids simulé, barème de perte acquitté avant signature | 2 |
| 4 | Verdict | Données d'entrée, rang déclencheur, calcul reproductible, lien vers la transaction de règlement | 2 |
| 5 | Profil de curateur | Score, multiplicateur, capital cumulé exposé, taux d'échec affiché au même niveau que les succès | 2 |
| 6 | Tableau de bord émetteur | Audience, clics sortants, volume attribué, comparaison à la médiane de la catégorie | 1 |

Conception mobile-first (majorité du trafic attendue) : les tables passent en
cartes empilées, le widget d'échange devient un panneau ancré en bas d'écran
(`§12.4`).

## Pages livrées vs pages cibles du Lot 1

| Page / fonctionnalité | Statut dans ce dépôt |
|---|---|
| `/`, `/mechanic`, `/roadmap`, `/faq` | ✅ livré (site vitrine) |
| Référencement automatique par adresse de mint (`EF-01`, `EF-02`) | ❌ pas commencé |
| Page token : en-tête, chandeliers, panneau de sécurité, flux (`EF-06` à `EF-09`) | ❌ pas commencé |
| Recherche (`EF-04`) | ❌ pas commencé |
| Classements non stakés (`EF-15`) | ❌ pas commencé |
| Messagerie temps réel par token (`EF-31`, `EF-32`) | ❌ pas commencé |
| Widget d'échange, achat/vente en un clic (`EF-34` à `EF-36`) | ❌ pas commencé |
| Tableau de bord d'audience émetteur (`EF-39`, `EF-40`) | ❌ pas commencé |
| Connexion par portefeuille (`EF-26`) | ❌ pas commencé |
| Internationalisation FR/EN (`ENF-25`) | ❌ pas commencé (anglais uniquement) |

Le détail complet des exigences fonctionnelles (`EF-01` à `EF-44`) est au CDC
`§6`. Tout ce qui touche la mise, la réputation et la résolution (`EF-10` et
suivants) est Lot 2 — aucune UI de staking ne doit être construite avant que
`pixstock-backend` expose le programme d'entiercement.

## API publique en lecture, consommée par le frontend (`§10.1`, v1)

Aucune de ces routes n'existe encore côté `pixstock-backend` (squelette
Hello World). À implémenter en client une fois le Lot 1 backend livré ;
aucune route ne construit ni ne signe de transaction pour un utilisateur.

| Méthode et chemin | Fonction | Débit |
|---|---|---|
| `GET /v1/tokens` | Catalogue paginé | 60/min |
| `GET /v1/tokens/{mint}` | Fiche complète, sécurité, round en cours | 120/min |
| `GET /v1/tokens/{mint}/candles` | Chandeliers | 120/min |
| `GET /v1/rankings/trending` | Classement staké | 120/min |
| `GET /v1/rounds/{id}` | État du round, positions par côté | 120/min |
| `GET /v1/wallets/{adresse}` | Profil, réputation, historique | 60/min |
| `GET /v1/leaderboard` | Classement des curateurs | 60/min |
| `GET /v1/params` | Paramètres de jeu en vigueur | 30/min |
| `POST /v1/tokens` | Soumission d'une adresse de mint | 10/min |

Canaux temps réel (`§10.2`), à consommer plus tard via une passerelle
WebSocket : `token:{mint}:price`, `token:{mint}:trades`, `token:{mint}:chat`,
`round:{id}`, `rankings:trending`, `wallet:{adresse}`.

## Non-fonctionnel pertinent au frontend (`§7`, extrait)

| Réf. | Exigence |
|---|---|
| `ENF-01` | Plus grande zone de contenu affichée en moins de 2,0 s au 75ᵉ centile sur 4G |
| `ENF-02` | Réponse à l'interaction inférieure à 200 ms au 75ᵉ centile |
| `ENF-03` | Décalage cumulé de mise en page inférieur à 0,1 |
| `ENF-04` | Page token servie depuis le cache de périphérie en moins de 400 ms au 95ᵉ centile |
| `ENF-05` | Rendu serveur systématique, données structurées, plan de site à jour toutes les 15 min |
| `ENF-06` | 800 000 pages indexables sans dégradation du budget d'exploration |
| `ENF-07` | Conformité WCAG 2.2 niveau AA sur les parcours de consultation, de mise et d'échange |
| `ENF-08` | Aucune information portée par la couleur seule |
| `ENF-25` | Interface externalisée en fichiers de traduction : FR/EN au Lot 1, zh/ko au Lot 3 |

## Roadmap — ce que le frontend livre par lot

| Lot | Durée | Le frontend livre |
|---|---|---|
| Lot 1 | 10 sem. | Annuaire, pages token, classements non stakés, panneau de sécurité, messagerie, widget d'échange, tableau de bord émetteur, connexion portefeuille |
| Lot 2 | 14 sem. (+ 4 audit) | Bloc d'état du round, ouverture de position Boost avec acquittement du barème, verdict, leaderboard, profil de curateur, back-office |
| Lot 3 | 12 sem. | Ouverture de position Challenge, bandeau de contestation, copie de position (signature individuelle, jamais de délégation), i18n zh/ko |

Détail complet, gates et indicateurs de succès : voir la page `/roadmap` de ce
site (déjà à jour avec le CDC `§1.5` et `§15`), ou `../pixstock-backend/SPECS.md`.

## Conformité — ce que l'UI doit afficher (`§13.2`)

- Avertissement permanent et non masquable : le classement mesure un capital
  engagé, ce n'est ni une recommandation ni une garantie.
- Fonds de garantie : mention explicite de sa nature non assurantielle,
  indemnisation plafonnée à 40 % de la perte constatée.
- Aucune promesse de rendement, dans l'interface comme dans la documentation.
- CGU et politique de risque acceptées explicitement avant la première mise,
  preuve d'acceptation conservée.
- Mise en avant sponsorisée strictement hors classement staké, visuellement
  distincte, libellée « sponsored ».
- Restriction géographique par adresse réseau, liste de juridictions exclues
  paramétrable (Lot 2) — le frontend doit savoir afficher un état bloqué.

Ces points ne sont pas encore implémentables (pas de mise, pas de compte) : à
prévoir dès la première page qui manipule du capital réel.
