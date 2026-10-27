# Tâches — Logo de l'église dans l'interface

- **Plan** : [plan.md](./plan.md)

## Données
- [x] T1 — Modèle `ChurchLogo` + relations (`Church`, `User`) — `prisma/schema.prisma`
- [x] T2 — Migration `add_church_logo` — `prisma/migrations/`
- [x] T3 — Mock Prisma `churchLogo` — `src/__mocks__/prisma.ts`

## Service
- [x] T4 — `CHURCH_LOGO_VARIANTS`, `churchLogoSources`, `churchLogoVariantSchema` — `src/modules/core/schemas.ts`
- [x] T5 — `normalizeChurchLogo`, `setChurchLogo`, `removeChurchLogo`, `getChurchLogo` — `src/modules/core/services/church-logo.ts`, export `index.ts`

## API
- [x] T6 — `GET`/`POST`/`DELETE` `/api/churches/[churchId]/logo` — `route.ts`, `contract.ts`
- [x] T7 — `npm run openapi` — `docs/openapi.json`

## Interface
- [x] T8 — `ChurchMark` — `src/components/ChurchMark.tsx`
- [x] T9 — `Sidebar`/`TopBar`/`AuthLayoutShell` reçoivent `churchLogo`
- [x] T10 — `(auth)/layout.tsx` : versions des logos dans `churchDisplay`
- [x] T11 — Bloc « Logo de l'église » — `ChurchLogoSlot.tsx`, `ChurchEditClient.tsx`, `page.tsx`

## Tests
- [x] T12 [P] — Service — `src/modules/core/services/__tests__/church-logo.test.ts`
- [x] T13 [P] — Route — `src/app/api/churches/[churchId]/logo/__tests__/route.test.ts`
- [x] T14 [P] — `churchLogoSources` + `ChurchMark` — tests associés

## Documentation
- [x] T15 — `CLAUDE.md`, `docs/database.md`, guide utilisateur, `CHANGELOG.md`

## Vérification
- [x] typecheck, lint, lint:boundaries, lint:prisma-boundary, test, build
- [x] Critères d'acceptation de la spec relus un à un
- [x] Commit + push sur la branche de la PR #703
