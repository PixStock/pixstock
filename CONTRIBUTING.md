# Contributing to PixStock

Thanks for taking the time. This file is the short version — the detailed
internal conventions live in [`GIT.md`](./GIT.md) and
[`CLAUDE.md`](./CLAUDE.md) — the team's working documents — and the
architecture is in [`docs/`](./docs/).

## Getting set up

```bash
git clone https://github.com/PixStock/pixstock
cd pixstock
npm install
npm run build:packages
```

Then, in three terminals:

```bash
npm run dev -w @pixstock/relayer   # API   → http://localhost:4000
npm run dev -w @pixstock/web       # dApp  → http://localhost:3000
npm run dev -w @pixstock/vault     # Vault → http://localhost:5183
```

This is an npm workspaces monorepo. The shared packages compile to `dist/`,
so after changing one run `npm run build:packages` — or keep
`npm run dev:packages` running in watch mode.

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
npm run typecheck
npm test
npm run build
```

- The build passes, the type check is clean and the tests are green.
- No secret, private key, seed phrase or `.env` file is committed.
- Any number taken from the spec (weights, thresholds, delays) matches
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — a divergence is a bug,
  not a variation.
- User-facing text is **English only** (decision D11). No `[locale]` routes,
  no language middleware, no language switcher. Site copy lives in
  `apps/web/content/site.json`.
- Nothing under `apps/vault` may reach the network — no `fetch`, no
  `XMLHttpRequest`, no WebSocket, no third-party script. This is the product
  promise, not a preference.

## Security

Never open a public issue for a vulnerability. See
[`SECURITY.md`](./SECURITY.md) for how to report one privately.

## License

By contributing, you agree that your contributions are licensed under the
MIT License that covers this project.
