# RULES.md — Ce que l'interface doit respecter

Source de vérité : `../CDC-PixStock.pdf`, chapitres 5 (« Règles de gestion et
anti-abus ») et 13 (« Conformité et cadre juridique »). La plupart des règles
de gestion (`RG-01` à `RG-15`) sont appliquées **on-chain ou côté service**,
pas dans ce dépôt — le détail complet et leur implication backend sont dans
`../pixstock-backend/RULES.md`. Ce fichier ne liste que ce qui retombe sur
l'interface : ce qu'elle doit afficher, quand, et ce qu'elle n'a strictement
pas le droit de faire.

**Statut actuel : aucun de ces points n'est implémenté.** Ce dépôt est un
site vitrine sans compte, sans mise et sans portefeuille connecté (voir
`SPECS.md`). Ce document est une check-list pour l'implémentation à venir,
pas un état des lieux.

## Ce que l'UI doit afficher, et quand

| Réf. | Exigence | Pourquoi | Lot |
|---|---|---|---|
| `EF-18` | Le barème de confiscation (tableau 4.2) et le poids simulé de la position doivent être affichés et **acquittés avant signature** — jamais renvoyés aux CGU. | Contrepartie directe de `RG-*` : la sanction est annoncée, pas découverte après coup. | 2 |
| `EF-14` | Chaque ligne du classement expose son capital engagé, le nombre de curateurs et la réputation médiane — aucune position affichée sans son capital visible. | Le capital exposé est l'information première (`§12.1`). | 2 |
| `EF-16` | Bandeau de contestation visible sans interaction sur toute ligne dont le capital Challenge dépasse 30 % du capital Boost — même zone que le prix, jamais un onglet. | Protection en temps réel du visiteur, avant même la résolution du round (voir la mécanique de poids soustractif, `§4.3`). | 3 |
| `EF-17` | Page publique exposant la formule et les paramètres en vigueur, avec historique des changements consultable. | Un changement de paramètre ne doit jamais être silencieux (`RG` §5.2). | 2 |
| `ENF-08` | Aucune information portée par la couleur seule — un libellé et une forme distincts accompagnent toujours les états Boost/Challenge et les niveaux de sévérité. | Accessibilité WCAG 2.2 AA (`ENF-07`). | tous |

## Ce que l'UI n'a jamais le droit de faire

| Réf. | Interdiction | Pourquoi |
|---|---|---|
| `ENF-13` | Ne jamais transmettre, stocker ou manipuler une clé privée utilisateur, à aucun moment. | Risque existentiel `RSK-06` (compromission de clés). |
| `§10.1` | Ne jamais construire ni signer une transaction pour le compte d'un utilisateur côté client autrement qu'en préparant l'instruction — la signature reste toujours déclenchée explicitement par le portefeuille (Phantom, Solflare, Backpack, standard Wallet Standard). | Aucune API ni interface ne fait autorité sur les fonds d'un utilisateur. |
| `EF-37` / point d'architecture non négociable (`§6.6`) | La copie de position ne doit jamais reposer sur une délégation de signature ou un portefeuille conservé par la plateforme — chaque transaction copiée reste signée individuellement. | Éviterait une surface d'attaque majeure et changerait la qualification juridique de l'opérateur (`§13`). |
| `§11.1` | Ne jamais mélanger une mise en avant sponsorisée (2 % du revenu attendu) avec le classement staké — placement séparé, visuellement distinct, libellé « sponsored ». | « Confondre les deux détruirait la seule proposition de valeur du produit. » (CDC, verbatim) |
| `§13.2` | Ne jamais afficher de promesse de rendement, dans l'interface comme dans le contenu éditorial. | Le produit n'est ni un conseil en investissement ni une garantie — qualification juridique à trancher, `§13.1`. |
| `RG-14` | Ne jamais permettre à une adresse du registre des comptes d'exploitation de l'opérateur d'ouvrir une position (même si l'UI ne peut pas empêcher l'appel programme, elle ne doit jamais l'exposer comme une action normale). | Conflit d'intérêts (`RSK-14`). |

## Copie déjà correcte dans ce dépôt (à ne pas régresser)

Les pages actuelles anticipent déjà plusieurs de ces règles dans leur texte
marketing — à conserver telles quelles quand l'UI réelle sera construite :

- `app/page.tsx` explique le coefficient soustractif 0,6 (« stops a small
  coalition from burying an honest project cheaply ») — ne pas le simplifier
  en un simple filtre binaire.
- `app/mechanic/page.tsx#pot` justifie explicitement le fonds de garantie
  (« it makes money when its users get scammed » → la cascade de répartition
  répond à cette objection) et le brûlage de 5 % (auto-couverture perdante,
  `RG-06`/`RG-08`).
- `app/faq/page.tsx` répond déjà à « do you hold my funds? » par la négative
  explicite (`ENF-13`) — toute future page de compte doit répéter cette
  garantie au même niveau de visibilité, pas seulement en FAQ.

## Ce qui reste à trancher avant d'aller plus loin (`§13.4`)

Ces points bloquent la mise en production du Lot 2, pas seulement le
frontend, mais l'UI ne doit rien construire qui présuppose une réponse :

- Qualification de l'entiercement sous MiCA.
- Liste des juridictions exclues et modalités techniques de la restriction
  géographique — prévoir un état « bloqué » générique dans le design system,
  pas un message codé en dur.
- Validation ou repli de la fonction Challenge (`§13.3`) — le repli par
  défaut est un signalement staké non adversarial, pas un pari : la copie UI
  du côté Challenge ne doit pas présupposer un contrat dérivé.
