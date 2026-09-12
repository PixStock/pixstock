@AGENTS.md

# PixStock Frontend — CLAUDE.md

Source de vérité fonctionnelle : `../CDC-PixStock.pdf` (voir `SPECS.md` pour
le résumé côté frontend, `RULES.md` pour ce que l'interface doit respecter).

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript strict
- Tailwind CSS v4, jetons de conception dans `app/globals.css`
- (à venir, Lot 1) Wallet Standard (Phantom/Solflare/Backpack), client API vers `pixstock-backend`
- (à venir, Lot 1) Widget d'échange Jupiter, chandeliers TradingView Lightweight Charts

⚠️ **La version installée (Next 16) n'est pas celle des données
d'entraînement d'un modèle, ni exactement celle visée par le CDC (Next 15).**
`AGENTS.md` (régénéré par `next dev`, ne pas éditer à la main) le rappelle à
chaque lancement : lire `node_modules/next/dist/docs/` avant d'écrire du code
qui suppose des conventions de Next 13-14.

## État actuel

Le dépôt est un site vitrine statique : quatre pages (`/`, `/mechanic`,
`/roadmap`, `/faq`), aucune fonctionnalité applicative. Tous les chiffres
affichés (formule de poids, barème, cascade du pot, réputation) sont ceux du
CDC codés en dur dans le JSX — voir `SPECS.md §État actuel du dépôt`. Rien du
Lot 1 (annuaire, page token, portefeuille, échange) n'est encore construit —
c'est le travail à venir.

## Structure

```
app/
├── layout.tsx           Layout racine : métadonnées, thème avant premier paint, JSON-LD Organization/WebSite
├── page.tsx              Accueil
├── mechanic/page.tsx      Formule de poids, résolution, barème, réputation
├── roadmap/page.tsx        Lots, indicateurs de succès, conformité
├── faq/page.tsx             Objections, JSON-LD FAQPage
├── globals.css               Jetons de conception (thème clair/sombre, typo, composants CSS)
├── sitemap.ts, robots.ts       Route handlers Next
components/                     Header, Footer, SiteScript (chrome interactif), HeroCanvas, ReputationChart...
content/site.json                 Tout le texte du site, en anglais (importé via content/site.ts)
```

À terme (voir `SPECS.md §Écrans cibles`), la structure suivra le découpage
par écran attendu par le CDC : page token, classements, ouverture de
position, verdict, profil de curateur, tableau de bord émetteur — aucun
n'existe encore.

## Conventions

- Composants serveur par défaut ; `"use client"` réservé à ce qui a
  vraiment besoin d'interactivité navigateur (voir `SiteScript.tsx`) —
  ne pas convertir une page entière en client component pour un seul bouton.
- Les composants ne nomment jamais une couleur en dur : ils utilisent les
  variables CSS/rôles définis dans `app/globals.css` (`--ink`, `--ground`,
  `.sev--1/2/3`...), pour que le thème clair/sombre reste automatique.
- Tout montant affiché utilise la classe `.num` (chiffres tabulaires) —
  voir `SPECS.md §Direction artistique`.
- Toute valeur numérique tirée du CDC (formule, barème, seuils, délais) doit
  rester identique au CDC et à `../pixstock-backend/SPECS.md` — une divergence
  est un bug, pas une variante créative.
- **Le site est en anglais uniquement.** Pas de routes `[locale]`, pas de
  middleware de langue, pas de sélecteur : le texte vient de
  `content/site.json` via `import { content } from "@/content/site"`.
- Nouvelles métadonnées de page : suivre le patron déjà en place
  (`Metadata` + JSON-LD `BreadcrumbList`, `openGraph`, `twitter`) plutôt que
  d'improviser une structure différente par page.

## Sécurité obligatoire (dès qu'une page manipule un compte ou une mise)

Voir `RULES.md` pour le détail complet. Les points non négociables :

- Aucune clé privée utilisateur transmise, stockée ou manipulée, à aucun
  moment (`ENF-13`).
- Aucune signature de transaction déclenchée sans action explicite de
  l'utilisateur dans son portefeuille.
- La copie de position (Lot 3) ne doit jamais reposer sur une délégation de
  signature — chaque transaction copiée reste signée individuellement.
- Le barème de confiscation et le poids simulé sont affichés et acquittés
  avant toute signature, jamais renvoyés aux CGU (`EF-18`).

## Commandes utiles

```bash
npm run dev      # dev watch
npm run build    # build de production
npm run lint     # ESLint
```
