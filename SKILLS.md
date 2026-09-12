# Pile technique

Frontend Next.js pour PixStock, un marché de curation staké pour les tokens
Solana (voir `SPECS.md`). Ce dépôt est actuellement **un site vitrine
statique** : la direction artistique et les jetons de conception du CDC
(`§12`) y sont déjà implémentés, mais aucune fonctionnalité applicative
(compte, mise, données de marché) n'existe.

| Dépendance | Rôle | Pourquoi celle-ci |
|---|---|---|
| `next` 16.3.4 | Framework, App Router | Le CDC (`§8.1`, `§8.2`) cible Next.js 15 App Router ; le dépôt a démarré sur la 16, qui reste sur le même modèle (App Router, RSC). Voir la mise en garde ci-dessous sur les changements de comportement entre versions. |
| `react` / `react-dom` 19.2.8 | UI | Requis par Next 16. |
| `@tailwindcss/postcss`, `tailwindcss` v4 | Styles | Les jetons de conception (`app/globals.css`) sont portés depuis `../landing-page` (le prototype HTML/CSS statique) et exposés à la fois comme variables CSS et comme couleurs utilitaires Tailwind (`bg-paper`, `text-ink`...), pour que markup porté et markup neuf partagent le même thème. |
| `eslint` + `eslint-config-next` | Lint | Config par défaut `create-next-app`, non personnalisée. |

Aucune bibliothèque de composants UI, aucun gestionnaire d'état, aucun client
HTTP : le site n'a pas encore de données à récupérer.

## ⚠️ Next.js 16 n'est pas le Next.js 15 du CDC ni celui des données d'entraînement

`AGENTS.md` (régénéré automatiquement par `next dev`, ne pas éditer à la
main) le rappelle à chaque lancement : cette version introduit des ruptures
d'API et de conventions par rapport à ce qu'un modèle ou qu'un développeur
habitué à Next 13-14 pourrait attendre. Avant d'ajouter du data fetching, du
streaming ou des route handlers, lire le guide correspondant dans
`node_modules/next/dist/docs/` plutôt que de se fier à une habitude.

## Ce qui est déjà implémenté (au-delà d'un boilerplate `create-next-app`)

- **Thème clair/sombre sans flash** : un script `beforeInteractive` dans
  `app/layout.tsx` lit `localStorage['df-theme']` avant le premier paint et
  pose la classe `.light` sur `<html>` ; toutes les couleurs sont des
  variables CSS à deux rampes (`app/globals.css`), jamais une couleur nommée
  en dur dans un composant.
- **Chiffres tabulaires partout où un montant apparaît** (`.num`,
  `font-variant-numeric: tabular-nums`) — exigence de lisibilité du CDC
  (`§12.2`) déjà respectée avant même qu'il y ait de vrais montants à
  afficher.
- **SEO structuré** : `Organization`/`WebSite` JSON-LD dans `app/layout.tsx`,
  `BreadcrumbList` et `FAQPage` JSON-LD par page, `app/sitemap.ts` et
  `app/robots.ts` en route handlers Next natifs, métadonnées OpenGraph/Twitter
  par page. Répond par anticipation à `ENF-05`/`ENF-06`.
- **Chrome interactif porté depuis le prototype statique** (`components/SiteScript.tsx`,
  `"use client"`) : header collant, révélations au scroll, mot-à-mot de la
  section « statement », remplissage de la timeline du round, bascule de
  thème, marquee auto-cadencé, carrousel des problèmes. Volontairement
  DOM-impératif (pas de state React) — ce sont des effets visuels sur des
  ids/classes rendus une fois par page, pas de la donnée applicative.
- **`prefers-reduced-motion` et motion opt-in** : la classe `.js-anim` n'est
  posée sur `<html>` que si JS est vivant et que l'utilisateur n'a pas
  demandé moins de mouvement — le premier rendu reste lisible sans JS.
- **`HeroCanvas`** : champ de particules `<canvas>` qui assemble l'emblème,
  purement décoratif — ne pas le confondre avec un composant de donnée.
- **`ReputationChart`** : courbe SVG statique illustrant la formule
  `Multiplicateur(r) = min(3,0 ; 0,5 + 2,5 × r/1000)` — un dessin de la
  formule, pas un graphique de marché.

## Ce qui n'a volontairement pas encore été ajouté

- **Aucune connexion portefeuille.** Le CDC prévoit le standard Wallet
  Standard (Phantom, Solflare, Backpack — `EF-26`), Lot 1. Rien n'est câblé.
- **Aucun client API.** `pixstock-backend` est au stade squelette (`GET /` et
  `GET /healthz` seulement) — il n'y a rien à consommer. Pas de fetch, pas de
  SWR/React Query, pas de génération de types depuis un schéma OpenAPI tant
  que l'API v1 (`SPECS.md §API publique`) n'existe pas.
- **Aucune donnée temps réel.** Les canaux `token:{mint}:price`,
  `round:{id}`... (`§10.2`) sont un livrable Lot 1/2 côté service.
- **Aucun graphique de marché.** TradingView Lightweight Charts est prévu
  côté architecture cible (`§8.1`) pour les chandeliers de la page token
  (`EF-07`) — pas installé.
- **Aucun widget d'échange (Jupiter).** `EF-34` à `EF-36`, Lot 1.
- **Pas d'internationalisation — et c'est volontaire.** Le site est en
  anglais uniquement. Tout le contenu vit dans `content/site.json` (source
  unique, importée via `content/site.ts`). Ne pas réintroduire de routes
  `[locale]`, de middleware de négociation de langue ni de sélecteur de
  langue.
- **Aucun test.** Pas de Jest, pas de Playwright, pas de test d'accessibilité
  automatisé — à mettre en place avant la première page qui manipule un
  compte ou une mise (voir les exigences de recette `ENF-07` et le chapitre
  16 du CDC côté produit).
- **Aucune segmentation serveur/client au sens data.** Toutes les pages sont
  aujourd'hui des Server Components statiques par défaut (pas de
  `fetch`/`cache`/`revalidate`) ; le seul Client Component est `SiteScript`.
  La segmentation « composants serveur pour le catalogue, composants clients
  pour le temps réel et la signature » (`§8.2`) reste à construire.
