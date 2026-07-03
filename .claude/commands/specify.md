---
description: Crée la spécification d'une nouvelle feature (quoi/pourquoi, sans technique)
argument-hint: <description de la feature en langage naturel>
---

Tu vas créer la **spécification** d'une nouvelle fonctionnalité de Koinonia à partir de
la description suivante :

> $ARGUMENTS

## Étapes

1. **Lis** `specs/constitution.md` et `specs/templates/spec-template.md`.
2. **Détermine le numéro** de la feature : liste les dossiers `specs/NNN-*` existants et
   prends le prochain entier disponible (format 3 chiffres, ex. `007`). S'il n'y en a
   aucun, commence à `001`.
3. **Choisis un slug** court en kebab-case dérivé de la description (ex. `indisponibilite-plage`).
4. **Crée** le dossier `specs/NNN-slug/` et le fichier `spec.md` à partir du template.
5. **Remplis la spec** :
   - Décris uniquement le **comportement observable** et le **pourquoi**.
   - **Interdit** : noms de tables, librairies, endpoints, composants, ou toute décision technique.
   - Identifie les **rôles concernés** parmi ceux de Koinonia (Super Admin, Admin, Secrétaire,
     Ministre, Resp. département, STAR, Faiseur de Disciples, Reporter).
   - Rédige des **scénarios** concrets (principal + cas limites) et des **critères d'acceptation** binaires.
   - Note explicitement ce qui est **hors périmètre**.
   - Marque les zones d'incertitude avec `[À CLARIFIER: …]`.
6. **Ne code rien.** Ne touche pas au schéma, aux modules, ni au code applicatif.

## Après création

- Affiche le chemin du fichier créé et un résumé de la spec.
- Si des `[À CLARIFIER]` subsistent, **pose les questions** à l'utilisateur avant de considérer la spec prête.
- Rappelle que l'étape suivante est `/plan`.

Reste en français. Respecte `specs/constitution.md`.
