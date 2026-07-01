---
description: Découpe un plan technique en tâches ordonnées et vérifiables
argument-hint: [numéro ou slug de la feature — défaut : la plus récente]
---

Tu vas transformer un plan technique en **liste de tâches** exécutables.

## Cible

- Argument fourni (`$ARGUMENTS`) : le dossier `specs/NNN-*` correspondant.
- **Sans argument** : la feature la plus récemment modifiée qui a un `plan.md` mais pas encore
  de `tasks.md`. En cas de doute, demande.

## Étapes

1. **Lis** : `spec.md`, `plan.md` de la feature, et `specs/templates/tasks-template.md`.
2. **Découpe le travail** en tâches atomiques, chacune :
   - vérifiable (on sait dire si elle est faite),
   - avec le(s) **fichier(s)** cible(s) indiqué(s),
   - ordonnée selon les dépendances naturelles : **migration → services → API → UI → tests**.
3. **Marque `[P]`** les tâches réellement parallélisables (fichiers indépendants).
4. **Inclus les tests** comme tâches à part entière (Vitest), pas en option.
5. **Termine par la checklist de vérification** : typecheck, lint, lint:boundaries, test, critères
   d'acceptation de la spec, PR.
6. Écris le tout dans `tasks.md`. **Ne code rien.**

## Après création

- Affiche le chemin du `tasks.md` et le nombre de tâches.
- Vérifie que chaque **critère d'acceptation** de la spec est couvert par au moins une tâche ;
  signale les manques.
- Rappelle que l'étape suivante est `/implement`.

Reste en français.
