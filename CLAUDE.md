# PixStock — CLAUDE.md

Monorepo du hackathon **Stocklana** (11 → 18 sept. 2026). Signature hors
ligne par canal optique pour actions tokenisées sur Solana.

Sources de vérité : `../cahier_des_charges_pixstock.md` (CDC) et
`../PLAN_INTEGRATION.md` (plan détaillé, décisions D1..D11) — tous deux hors
dépôt. Résumés versionnés dans `docs/`.

## Structure

```
apps/web       Next.js 16 · App Router · dApp en ligne
apps/vault     Vite + React · PWA hors ligne · le signataire
apps/relayer   NestJS 10 · Prisma · fee payer, nonces, quotes, broadcast
packages/      agqp · tx-policy · pyth-verify · vault-crypto · shared
docs/          ARCHITECTURE · AGQP-SPEC · THREAT-MODEL · DEMO
```

npm workspaces. Les paquets se compilent vers `dist/` : après avoir modifié
un paquet, `npm run build:packages` (ou `npm run dev:packages` en watch),
sinon les apps consomment l'ancienne version.

## Règles non négociables

- **`apps/vault` ne touche jamais le réseau.** Aucun `fetch`, aucun
  `XMLHttpRequest`, aucun WebSocket, aucun script tiers. C'est la promesse
  du produit — si elle tombe, il ne reste rien.
- **La graine déchiffrée ne vit qu'en mémoire**, et est remise à zéro
  (`fill(0)`) dès la signature produite.
- **Le relayer ne signe que fee payer et nonce authority.** Jamais un
  transfert de token, jamais une clé utilisateur en base.
- **Le manifest n'est jamais la source de vérité.** La fiche d'ordre se
  dérive des instructions décompilées ; le manifest ne sert qu'au contrôle
  croisé.
- **Aucun hash brut présenté à l'utilisateur** au moment de signer.

## Conventions de code

- Composants serveur par défaut dans `apps/web` ; `"use client"` réservé à
  la caméra, aux QR et à l'état d'ordre.
- Les composants ne nomment jamais une couleur en dur : variables et rôles
  CSS de `apps/web/app/globals.css` (`--ink`, `--ground`, `.sev--1/2/3`).
- Tout montant affiché utilise la classe `.num` (chiffres tabulaires) et
  passe par `formatAmount` de `@pixstock/shared`.
- **Le produit est en anglais uniquement** (décision D11) : interface web,
  PWA vault, messages d'erreur de l'API, README. Pas de routes `[locale]`,
  pas de middleware de langue, pas de sélecteur. Le contenu du site vit dans
  `apps/web/content/site.json`.
- Les adresses de `@pixstock/shared` (mints, program ids, feed ids) ont été
  vérifiées sur mainnet le 12 sept. 2026 — ne pas les modifier sans
  revérifier.
- Une fonction publique non encore écrite `throw` avec un renvoi vers la
  section de spec qui la définit. Pas de `return null` silencieux.

## Commandes

```bash
npm install
npm run build:packages            # après toute modification d'un paquet
npm run dev -w @pixstock/relayer  # :4000
npm run dev -w @pixstock/web      # :3000
npm run dev -w @pixstock/vault    # :5183
npm test                          # vitest sur packages/*
npm run typecheck
```

⚠️ `apps/web/AGENTS.md` est régénéré par `next dev` : Next 16 n'est pas
Next 15, lire `node_modules/next/dist/docs/` avant de supposer des
conventions de Next 13-14.
