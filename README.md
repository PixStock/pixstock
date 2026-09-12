# PixStock — PixStock Frontend

Site public pour PixStock — marché de curation décentralisé pour
l'écosystème Solana : un classement de tokens (« Top Trending ») où la
position se gagne avec du capital réel misé (Staked Ranking), pas avec du
budget publicitaire.

Stack : Next.js (App Router) · React · TypeScript · Tailwind CSS

Voir aussi :
- [`SPECS.md`](./SPECS.md) — résumé fonctionnel du CDC côté frontend (mécanique, écrans cibles, API consommée, lots)
- [`RULES.md`](./RULES.md) — ce que l'interface doit afficher et ne jamais faire
- [`SKILLS.md`](./SKILLS.md) — choix techniques et ce qui n'est pas encore implémenté
- [`CLAUDE.md`](./CLAUDE.md) — conventions de développement
- [`GIT.md`](./GIT.md) — conventions Git détaillées (branches, commits, PR)
- [`../pixstock-backend/`](../pixstock-backend/) — API et services (même documentation en miroir)
- [`../CDC-PixStock.pdf`](../CDC-PixStock.pdf) — cahier des charges, source de vérité

> **État actuel** : site vitrine statique. Quatre pages (`/`, `/mechanic`,
> `/roadmap`, `/faq`) qui présentent la mécanique et la feuille de route ;
> aucune fonctionnalité applicative (compte, portefeuille, mise, données de
> marché) n'est encore implémentée. Voir `SPECS.md` pour le périmètre cible
> du Lot 1 et `SKILLS.md` pour l'état exact.

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 20.x |
| npm | 10.x |

---

## Installation locale

```bash
git clone <repo-url>
cd pixstock-frontend
npm install
cp .env.example .env   # rien à renseigner pour l'instant, voir SKILLS.md
npm run dev
```

Le site est disponible sur [http://localhost:3000](http://localhost:3000).

---

## Commandes utiles

```bash
npm run dev     # dev watch (Next.js)
npm run build   # build de production
npm run start   # sert le build compilé
npm run lint    # ESLint (config eslint-config-next)
```

---

## Structure du projet

```
app/
├── layout.tsx        # Layout racine : métadonnées globales, thème avant premier paint, JSON-LD Organization/WebSite
├── page.tsx           # Accueil
├── mechanic/page.tsx   # La mécanique : formule de poids, résolution, barème, réputation
├── roadmap/page.tsx    # Feuille de route : lots, indicateurs de succès, conformité
├── faq/page.tsx        # Objections, avec JSON-LD FAQPage
├── globals.css         # Jetons de conception (thème clair/sombre, typographie, composants CSS)
├── sitemap.ts           # Plan de site (route handler Next)
└── robots.ts             # robots.txt (route handler Next)
components/
├── Header.tsx, Footer.tsx, Logo.tsx, SkipLink.tsx
├── SiteScript.tsx         # Chrome interactif (scroll reveals, thème, timeline...), "use client"
├── HeroCanvas.tsx          # Champ de particules décoratif du hero
├── ReputationChart.tsx      # Courbe SVG de la formule de multiplicateur
├── PlatformMarks.tsx         # Marquee des plateformes
└── ProblemCarousel.tsx        # Carrousel des problèmes adressés
```

Découpage cible par écran (page token, classements, staking...) : voir
`SPECS.md §Écrans cibles`, pas encore créé au stade actuel du dépôt.

---

## Variables d'environnement

Aucune variable requise pour l'instant (`.env` et `.env.example` sont vides).
À venir avec le Lot 1 (voir `SPECS.md`) : clés publiques Jupiter/Birdeye pour
le widget d'échange et les chandeliers, URL de l'API `pixstock-backend`. Aucune
clé privée ne doit jamais figurer côté frontend.

---

## Branches et workflow Git

Résumé (détails complets dans [`GIT.md`](./GIT.md)) :

```
main        ← production, jamais de commit direct
develop     ← intégration, toutes les features mergent ici
```

| Préfixe | Usage |
|---|---|
| `feature/` | Nouvelle fonctionnalité |
| `fix/` | Correction de bug sur develop |
| `hotfix/` | Correction urgente en prod |
| `release/` | Préparation d'une release |
| `chore/` | Maintenance, deps, config |

```bash
git checkout develop
git pull origin develop
git checkout -b feature/nom-de-la-feature
# ... travail, commits en anglais (feat(scope): ...) ...
git checkout develop
git merge --no-ff feature/nom-de-la-feature
```

Commits et PR en anglais, format `<type>(<scope>): <description>` — voir
`GIT.md` pour la liste des types, des scopes recommandés et les règles de
versioning SemVer.
