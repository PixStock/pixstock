# Contributing to PixStock Frontend

Thanks for taking the time. This file is the short version — the detailed
internal conventions live in [`GIT.md`](./GIT.md) and
[`CLAUDE.md`](./CLAUDE.md) (both in French, they are the team's working
documents).

## Getting set up

```bash
git clone https://github.com/PixStock/pixstock-frontend
cd pixstock-frontend
npm install
cp .env.example .env
npm run dev            # http://localhost:3000
```

See [`README.md`](./README.md) for the full quickstart.

## Branches

```
main        production — never commit directly
develop     integration — every feature merges here first
```

| Prefix | Use |
|---|---|
| `feature/` | new functionality |
| `fix/` | bug fix on develop |
| `hotfix/` | urgent production fix |
| `release/` | release preparation |
| `chore/` | maintenance, dependencies, config |

## Commits

Commit messages and pull requests are written **in English**, using
Conventional Commits:

```
<type>(<scope>): <short description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.
The full list of types and recommended scopes is in [`GIT.md`](./GIT.md).

Commit early and often with meaningful messages. During a hackathon the
commit history is part of what judges look at.

## Before opening a pull request

```bash
npm run lint
npm run build
```

- The build passes and the linter is clean.
- No secret, private key, seed phrase or `.env` file is committed.
- Any number taken from the spec (weights, thresholds, delays) matches
  [`SPECS.md`](./SPECS.md) — a divergence is a bug, not a variation.
- User-facing text is **English only**. The site has no i18n layer: copy lives in
  `content/site.json`. Do not reintroduce `[locale]` routes, language
  middleware or a language switcher.

## Security

Never open a public issue for a vulnerability. See
[`SECURITY.md`](./SECURITY.md) for how to report one privately.

## License

By contributing, you agree that your contributions are licensed under the
MIT License that covers this project.
