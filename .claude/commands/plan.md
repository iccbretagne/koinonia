---
description: Traduit une spec validée en plan technique conforme à la constitution
argument-hint: [numéro ou slug de la feature — défaut : la plus récente]
---

Tu vas produire le **plan technique** d'une feature déjà spécifiée.

## Cible

- Argument fourni (`$ARGUMENTS`) : utilise le dossier `specs/NNN-*` correspondant au numéro ou au slug.
- **Sans argument** : prends la feature la plus récemment modifiée dans `specs/` qui possède un
  `spec.md` mais pas encore de `plan.md` (ou dont le plan est à refaire). En cas de doute, demande.

## Étapes

1. **Lis** dans l'ordre : `specs/constitution.md`, la `spec.md` de la feature, et
   `specs/templates/plan-template.md`.
2. **Vérifie la spec** : si elle contient des `[À CLARIFIER]` non résolus, **arrête-toi** et
   pose les questions avant de planifier.
3. **Explore le code existant** pertinent (modules, routes, schéma Prisma, composants UI) pour
   ancrer le plan dans la réalité du repo — ne planifie pas dans le vide.
4. **Rédige `plan.md`** à partir du template :
   - Coche honnêtement la **checklist de conformité** à la constitution.
   - Détaille : modèle de données (+ migration Prisma si besoin), endpoints API (+ permission + Zod),
     services métier, UI (en réutilisant `src/components/ui/`).
   - Consigne les **décisions techniques** et les **alternatives écartées** avec leur justification.
   - Liste risques et **stratégie de tests**.
5. **Respecte impérativement la constitution** : frontières modules (`@/modules/X`), `requireAuth`/
   `requirePermission`, `rolePermissions`, validation Zod, migration Prisma (jamais `db push`),
   enums depuis `@/generated/prisma/client`, `await params`.
6. **Ne code rien.** Le plan décrit ; il n'implémente pas.

## Après création

- Affiche le chemin du `plan.md` et un résumé des choix structurants.
- Signale tout point où la spec force une entorse à la constitution (à arbitrer avec l'utilisateur).
- Rappelle que l'étape suivante est `/tasks`.

Reste en français.
