<div align="center">

# PixStock

**<!-- TODO: one-line pitch. What PixStock does, for whom, in under 15 words. -->**

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![Built on Solana](https://img.shields.io/badge/Built%20on-Solana-14F195.svg)](https://solana.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)

[Live demo](#) · [Video](#) · [Backend repo](https://github.com/PixStock/pixstock-backend)

</div>

---

## The problem

<!-- TODO — 3 to 5 sentences, concrete and specific.
     What is broken today? Who is hurt by it? Why does it matter now?
     Judges read this paragraph first and decide whether to keep reading. -->

## What we built

<!-- TODO — what the product actually does, in plain language.
     Lead with the user-visible outcome, not the architecture. -->

## How it works

<!-- TODO — the mechanism, in 3 to 5 bullet points or a short diagram.
     This is where the technical judges look for substance:
     what is on-chain, what is off-chain, and why that split. -->

## Demo

| | |
|---|---|
| Live app | <!-- TODO: URL --> |
| Demo video | <!-- TODO: URL --> |
| API | <!-- TODO: URL --> |
| Network | <!-- TODO: devnet / mainnet-beta --> |

<!-- TODO: 2-3 screenshots or a GIF. A jury that cannot run your project
     still has to see it work. -->

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, TypeScript strict |
| Styling | Tailwind CSS v4 + design tokens in `app/globals.css` |
| Content | Single English source in `content/site.json` |
| Rendering | Fully static prerender — every route is `○ (Static)` |
| API | [`pixstock-backend`](https://github.com/PixStock/pixstock-backend) (NestJS · Prisma · PostgreSQL) |

## Quickstart

Requires **Node.js 20+** and **npm 10+**.

```bash
git clone https://github.com/PixStock/pixstock-frontend
cd pixstock-frontend
npm install
cp .env.example .env
npm run dev
```

The site runs at **http://localhost:3000**. No environment variable is
required at this stage — `.env.example` is empty on purpose.

### Commands

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build
npm run start   # serve the production build
npm run lint    # ESLint
```

## Project structure

```
app/
├── layout.tsx          Root layout: metadata, theme-before-paint, Organization/WebSite JSON-LD
├── page.tsx            Home
├── mechanic/page.tsx   How the mechanism works
├── roadmap/page.tsx    Delivery plan
├── faq/page.tsx        Objections, FAQPage JSON-LD
├── globals.css         Design tokens (light/dark theme, type scale, CSS components)
├── sitemap.ts          Sitemap route handler
└── robots.ts           robots.txt route handler
components/
├── Header.tsx, Footer.tsx, Logo.tsx, SkipLink.tsx
├── SiteScript.tsx      Interactive chrome (scroll reveals, theme, timeline) — "use client"
├── HeroCanvas.tsx      Hero particle field
├── ReputationChart.tsx SVG curve of the multiplier formula
├── PlatformMarks.tsx   Platform marquee
└── ProblemCarousel.tsx Problem carousel
content/
├── site.json           Every string on the site, in English
└── site.ts             Typed export — `import { content } from "@/content/site"`
```

**The site is English only.** There is no i18n layer: no `[locale]` routes,
no language middleware, no language switcher. Copy lives in
`content/site.json`.

## Current status

Static marketing site: four pages (`/`, `/mechanic`, `/roadmap`, `/faq`).
No application feature yet — no wallet connection, no market data, no
staking UI. See [`SKILLS.md`](./SKILLS.md) for the precise gap analysis and
[`SPECS.md`](./SPECS.md) for the target scope.

---

## Documentation

The team's working documents are in French:

| File | Contents |
|---|---|
| [`SPECS.md`](./SPECS.md) | Functional and technical specs for the frontend |
| [`RULES.md`](./RULES.md) | What the interface must show, and must never do |
| [`SKILLS.md`](./SKILLS.md) | Technical choices and what is not implemented yet |
| [`CLAUDE.md`](./CLAUDE.md) | Development conventions |
| [`GIT.md`](./GIT.md) | Branch, commit and PR conventions |

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Branches off `develop`, commits
in English as `<type>(<scope>): <description>`.

## Security

Never open a public issue for a vulnerability — see
[`SECURITY.md`](./SECURITY.md).

## License

[MIT](./LICENSE) © 2026 PixStock
