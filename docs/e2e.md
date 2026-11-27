# Tests E2E (Playwright)

Harnais minimal, en lecture seule (aucune donnée modifiée), qui sert à auditer la navigation par
rôle et l'accessibilité. Code dans `e2e/`, configuration dans `playwright.config.ts`.

## Lancer en local

Prérequis : l'environnement de dev de [dev-onboarding.md](dev-onboarding.md) (MariaDB + base
seedée par `npm run db:seed:dev`, `AUTH_DEV_LOGIN=true` dans `.env`).

```bash
npx playwright install chromium     # une fois
npm run test:e2e                    # lance `npm run dev` si rien n'écoute sur le port 3000
npm run test:e2e:ui                 # mode interactif
E2E_BASE_URL=http://localhost:3001 npm run test:e2e   # autre serveur (réutilisé tel quel)
```

> `db:seed:dev` **efface et régénère toute la base** : pointer `DATABASE_URL` vers une base
> jetable (par exemple `koinonia_e2e`), jamais vers des données à conserver.

Projets : `setup` (connexions), `desktop` (1280×800) et `mobile` (Pixel 7), Chromium seul,
`fr-FR`, `Europe/Paris`, thème clair.

## Comptes

`e2e/auth.setup.ts` connecte chaque compte de `prisma/fixtures/dev-users.ts` (POST
`/api/auth/dev-login`, puis `PATCH /api/user/tour-seen` pour masquer la visite guidée) et
enregistre la session dans `e2e/.auth/<clé>.json`. Dans un test : `const page = await
asRole("star")` (fixture de `e2e/roles.ts`).

Rôles : `super-admin`, `admin`, `secretaire`, `ministre`, `resp-accueil`, `resp-secretariat`,
`faiseur-disciples`, `reporter`, `star`, `comptable` (ACCOUNTANT), `referent-soins`
(PASTORAL_CARE_REFERENT).

## Specs

| Fichier | Contrôle |
|---|---|
| `navigation-roles.spec.ts` | espaces visibles par rôle (sidebar, barre du bas, panneau « Plus ») ; table `NAV_BY_ROLE` à mettre à jour avec `src/lib/navigation.ts` |
| `mobile-back.spec.ts` | chevron « Retour à … » sur les pages de détail, nom de l'église sur les pages de navigation |
| `a11y.spec.ts` | axe (WCAG 2 A et AA) sur `/accueil` par rôle et viewport, panneau « Plus », palette ; violations connues dans `KNOWN_VIOLATIONS` |
| `forbidden.spec.ts` | un STAR sur une URL d'administration : HTTP 200 + page « Accès refusé » (comportement actuel) |

## Sécurité

- `/api/auth/dev-login` n'existe que si `AUTH_DEV_LOGIN=true` **et** `NODE_ENV !== "production"`
  (`isDevLoginEnabled`, `src/lib/auth.ts`). Le harnais lance `npm run dev` ; ne jamais assouplir
  cette garde pour lui.
- `AUTH_DEV_LOGIN` n'est posé que dans le job `e2e` de `ci.yml` (base MariaDB jetable), jamais au
  niveau du workflow ni dans `deploy*.yml`.
- `e2e/.auth/` contient des cookies de session valides : ignoré par git, ne jamais le commiter.

## CI

Job `e2e` de `.github/workflows/ci.yml`, `continue-on-error: true` pour l'instant. En cas
d'échec, le rapport HTML et les traces sont publiés en artefact `playwright-report`.
