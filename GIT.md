# Conventions Git — PixStock

Conventions du monorepo (même équipe, mêmes
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

**Les messages de commit s'écrivent en anglais.** Les commentaires de code
et les échanges d'équipe restent en français : ce qui part sur GitHub est en
anglais.

Sont donc en anglais : les commits, les pull requests, et les fichiers que
GitHub expose publiquement — `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
les templates d'issue et de PR. Un jury de hackathon lit le README avant tout
le reste.

Restent en français, ce sont les documents de travail de l'équipe :
`SPECS.md`, `RULES.md`, `SKILLS.md`, `CLAUDE.md`, `GIT.md`.

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

`agqp` · `vault` · `web` · `relayer` · `policy` · `pyth` · `basket` ·
`paper-vault` · `design-system` · `docs` · `ci` · `deps`

Les scopes suivent le découpage du monorepo : un paquet de `packages/` ou
une app de `apps/`, plus quelques transverses. `agqp` couvre le protocole
optique des deux côtés du canal — c'est justement l'intérêt du monorepo :
un seul commit change le format, l'encodeur et le décodeur.

### Exemples valides

```
feat(agqp): encode a payload into indexed base45 frames
feat(vault): read frames from the rear camera and show assembly progress
feat(policy): reject a transaction whose fee payer is the vault
feat(pyth): verify the solana message against the trusted signers
fix(relayer): release the nonce account when an order expires
fix(web): animated qr stops cycling when the tab loses focus
test(agqp): add the rfc 9285 base45 vectors
docs(agqp): freeze the v1 frame envelope
chore(deps): bump next 16.3.4 to 16.4.0
ci: add lint, typecheck and vitest on pull requests
```

### Règles

- Description en minuscules, sans point final
- Max 72 caractères pour la première ligne
- Utiliser l'impératif ou le substantif, pas le passé
  - ✅ `feat(web): add the basket builder`
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
