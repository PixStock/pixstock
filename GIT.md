# Conventions Git — PixStock Frontend

Mêmes conventions que `../pixstock-backend/GIT.md` (même équipe, mêmes
réflexes) — reproduites ici pour que ce dépôt reste autonome.

---

## Branches

### Structure principale

```
main        ← production (protégée — jamais de commit direct)
develop     ← intégration (toutes les features mergent ici)
```

### Branches de travail

| Préfixe | Usage | Exemple |
|---|---|---|
| `feature/` | Nouvelle fonctionnalité | `feature/token-page` |
| `fix/` | Correction de bug sur develop | `fix/mechanic-table-overflow` |
| `hotfix/` | Correction urgente en prod | `hotfix/hero-canvas-crash` |
| `release/` | Préparation d'une release | `release/1.2.0` |
| `chore/` | Maintenance, deps, config | `chore/update-next` |

### Règles

- **`main`** — jamais de commit direct. Seulement des merges depuis `release/` ou `hotfix/`
- **`develop`** — jamais de commit direct. Seulement des merges depuis `feature/`, `fix/`, `chore/`
- Toute feature part d'une branche dérivée de `develop`
- Une branche = une fonctionnalité ou un fix (pas de mélanges)

---

## Flux de travail (Gitflow simplifié)

### Feature (cas standard)

```bash
git checkout develop
git pull origin develop
git checkout -b feature/nom-de-la-feature

# ... travail ...

git checkout develop
git merge --no-ff feature/nom-de-la-feature
git push origin develop
git branch -d feature/nom-de-la-feature
```

### Hotfix (bug critique en production)

```bash
git checkout main
git checkout -b hotfix/description-du-bug

# ... fix ...

git checkout main
git merge --no-ff hotfix/description-du-bug
git tag -a v1.0.1 -m "hotfix: description"

git checkout develop
git merge --no-ff hotfix/description-du-bug

git branch -d hotfix/description-du-bug
```

### Release

```bash
git checkout develop
git checkout -b release/1.2.0

# Ajustements finaux (version, changelog)

git checkout main
git merge --no-ff release/1.2.0
git tag -a v1.2.0 -m "release: 1.2.0"

git checkout develop
git merge --no-ff release/1.2.0

git branch -d release/1.2.0
```

---

## Conventions de commit

**Les messages de commit s'écrivent en anglais.** La documentation, les
commentaires de code et les échanges d'équipe restent en français : seul ce
qui part sur GitHub, commits et pull requests, est en anglais.

Format :

```
<type>(<scope>): <description courte en anglais>

[corps optionnel]

[footer optionnel : BREAKING CHANGE, closes #issue]
```

### Types

| Type | Usage |
|---|---|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `hotfix` | Correction urgente en prod |
| `refactor` | Refactoring sans changement de comportement |
| `chore` | Maintenance, mise à jour de dépendances, config |
| `docs` | Documentation uniquement |
| `test` | Ajout ou modification de tests |
| `perf` | Optimisation de performance |
| `ci` | CI/CD, scripts de déploiement |

### Scopes recommandés

`marketing` · `token-page` · `rankings` · `staking-ui` · `wallet` · `charts` ·
`chat` · `swap` · `dashboard` · `design-system` · `seo` · `a11y` · `deps`

Ces scopes suivent le découpage en écrans attendus par le CDC (`SPECS.md
§Écrans clés`, `§Pages livrées vs pages cibles`), pas encore tous pertinents
au stade actuel du dépôt (site vitrine uniquement — `marketing`,
`design-system`, `seo` et `a11y` sont les seuls scopes réellement utilisés
aujourd'hui).

### Exemples valides

```
feat(marketing): add the roadmap page
feat(design-system): port dark/light theme tokens from landing-page
fix(a11y): missing aria-current on active nav link
fix(seo): breadcrumb JSON-LD pointing at the wrong canonical url
chore(deps): bump Next.js 16.3.4 to 16.4.0
docs: add SPECS.md and RULES.md summarizing the CDC for the frontend
refactor(marketing): extract ProblemCarousel from page.tsx
perf(marketing): lazy-load HeroCanvas below the fold
ci: add a GitHub Actions workflow
```

### Règles

- Description en minuscules, sans point final
- Max 72 caractères pour la première ligne
- Utiliser l'impératif ou le substantif, pas le passé
  - ✅ `feat(marketing): add the faq page`
  - ❌ `feat(marketing): I added the faq page`
- Un commit = une seule intention (ne pas mélanger fix + refactor)
- `BREAKING CHANGE` dans le footer si changement d'API publique exposée par
  le frontend (peu probable avant le Lot 1)

---

## Pull Requests

- **Titre et description : en anglais**, comme les commits. Le titre suit le
  même format : `feat(token-page): description`.
- **Reviewers** : minimum 1
- **Merge strategy** : `--no-ff` (merge commit) pour conserver l'historique des branches
- Pas de merge si CI échoue
- Résoudre tous les commentaires avant de merger
- Toute PR qui affiche un montant, un barème ou un délai issu du CDC doit
  référencer les exigences concernées (`EF-xx`, `ENF-xx`) dans sa description
  — voir `RULES.md` et `SPECS.md`

---

## Tags et versioning

Suivre **SemVer** : `MAJEUR.MINEUR.PATCH`

```
v1.0.0     → première release prod
v1.1.0     → nouvelle fonctionnalité rétro-compatible
v1.1.1     → hotfix
v2.0.0     → breaking change d'API
```

```bash
# Créer un tag annoté
git tag -a v1.0.0 -m "release: description"
git push origin v1.0.0

# Lister les tags
git tag -l

# Voir un tag spécifique
git show v1.0.0
```

---

## .gitignore — rappels

Ne jamais commiter :
- `.env` — vide pour l'instant, contiendra les clés publiques (Jupiter,
  Birdeye) une fois le Lot 1 démarré ; aucune clé privée ne doit jamais y
  figurer côté frontend (`ENF-13`)
- `node_modules/`
- `.next/`
- `tsconfig.tsbuildinfo`
- `AGENTS.md` si le workflow d'équipe décide de ne pas le versionner — sinon
  le committer tel quel : il est régénéré par `next dev` à chaque lancement
  (voir `CLAUDE.md`)
