# Git conventions

Everything that leaves this machine is in English: commits, pull requests,
branch names, and every document in the repository. The jury reads GitHub.

## Branches

`main` is what deploys. Work happens on a branch and arrives through a pull
request; nothing is committed to `main` directly.

| Prefix | Use | Example |
|---|---|---|
| `feat/` | A new capability | `feat/ui-refont` |
| `fix/` | A bug fix | `fix/nonce-release` |
| `chore/` | Maintenance, dependencies, config | `chore/update-next` |
| `docs/` | Documentation only | `docs/english` |

One branch, one intention. A branch that fixes a bug and refactors a module
is two reviews wearing one hat.

```bash
git checkout main && git pull
git checkout -b feat/the-thing
# ... work ...
git push -u origin feat/the-thing
gh pr create --base main
```

## Commit messages

```
<type>(<scope>): <short description>

[optional body: why, not what — the diff already says what]

[optional footer: BREAKING CHANGE, closes #issue]
```

| Type | Use |
|---|---|
| `feat` | A new capability |
| `fix` | A bug fix |
| `refactor` | No behaviour change |
| `chore` | Maintenance, dependencies, config |
| `docs` | Documentation only |
| `test` | Tests added or changed |
| `perf` | Performance |
| `ci` | CI, deployment scripts |

Scopes follow the monorepo: a package from `packages/` or an app from
`apps/`, plus a few cross-cutting ones — `agqp` · `vault` · `web` ·
`relayer` · `policy` · `pyth` · `basket` · `paper-vault` · `docs` · `ci` ·
`deps`. `agqp` covers both sides of the optical channel, which is the point
of a monorepo: one commit changes the format, the encoder and the decoder
together.

### Rules

- Lowercase description, no trailing full stop
- First line at most 72 characters
- Imperative or noun phrase, never past tense
  - `feat(web): add the basket builder`
  - not `feat(web): I added the basket builder`
- One commit, one intention
- `BREAKING CHANGE` in the footer for any change to a format both sides of
  the air gap read — see [docs/AGQP-SPEC.md](docs/AGQP-SPEC.md)

### Examples

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

A body is worth writing when the change is not self-evident from the diff:
what was wrong, why this fixes it, and what a reader would otherwise have to
reconstruct. A message that only repeats the filename is a message nobody
gains from.

## Pull requests

- Title in the same format as a commit
- CI must be green before a merge — `lint · typecheck · tests · build`
- A description that says what changed, what it fixes, and how it was checked
- Anything that changes what the phone shows before it signs should say so
  explicitly. That screen is the product.

## Tags and versioning

SemVer: `MAJOR.MINOR.PATCH`.

```bash
git tag -a v1.0.0 -m "release: description"
git push origin v1.0.0
```

## Never commit

- `.env` — the relayer's key lives there and it is real money
- `node_modules/`, `.next/`, `dist/`, `*.tsbuildinfo`
- Any private key, seed or Paper-Vault code, in any file, ever

`apps/web/AGENTS.md` is committed as-is: Next regenerates it on every
`next dev`, so leaving it untracked only produces a dirty working tree.
