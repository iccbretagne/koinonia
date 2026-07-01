---
description: Exécute les tâches d'une feature spécifiée, vérifie, et prépare la PR
argument-hint: [numéro ou slug de la feature — défaut : la plus récente]
---

Tu vas **implémenter** une feature à partir de ses tâches.

## Cible

- Argument fourni (`$ARGUMENTS`) : le dossier `specs/NNN-*` correspondant.
- **Sans argument** : la feature la plus récemment modifiée qui possède un `tasks.md`. En cas de doute, demande.

## Avant de commencer

1. **Lis** `specs/constitution.md`, puis `spec.md`, `plan.md`, `tasks.md` de la feature.
2. **Crée la branche** si elle n'existe pas encore : `feat/<slug>` (jamais travailler sur `main`).
   Si l'utilisateur suit une stratégie multi-PR (branche `feat/X` de base), demande la branche cible.

## Exécution

3. **Traite les tâches dans l'ordre** de `tasks.md`. Coche `- [x]` chaque tâche terminée dans le fichier.
4. **Respecte la constitution à chaque tâche** :
   - Migration Prisma (`npm run db:migrate`) pour tout changement de schéma — **jamais** `db push`.
   - Routes protégées (`requireAuth`/`requirePermission`), multi-tenant `churchId`.
   - Permissions via `rolePermissions` (`@/lib/registry`), validation Zod, `ApiError`.
   - Imports modules via l'index (`@/modules/X`), enums depuis `@/generated/prisma/client`, `await params`.
   - Réutilise `src/components/ui/` ; lis un fichier avant de le modifier.
5. **Pas de sur-ingénierie** : le minimum pour satisfaire les critères d'acceptation de la spec.

## Vérification

6. Lance et fais passer :
   ```
   npm run typecheck && npm run lint && npm run lint:boundaries && npm run test
   ```
7. Relis les **critères d'acceptation** de `spec.md` un par un et confirme qu'ils sont satisfaits.
8. Mets le **statut** de la spec à `Implémentée`.

## Livraison

9. Commit avec un message conventionnel (`feat:`/`fix:`), pousse la branche.
10. **Demande** avant d'ouvrir la PR si l'utilisateur ne l'a pas déjà autorisé. Rédige un corps de
    PR qui référence la spec (`specs/NNN-slug/`).

Reste en français. Si une tâche révèle que le plan est incomplet ou faux, **arrête-toi** et
signale-le plutôt que d'improviser une entorse à la spec.
