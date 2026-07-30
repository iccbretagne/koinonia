# Plan technique — Backup pour un tiers et gestion des absences par le Secrétariat

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-07-30

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout reste dans `src/modules/planning` ; `src/app/` importe
      uniquement `@/modules/planning`.
- [x] **Sécurité** : nouvelle route protégée par `requireAuth()` + vérification de périmètre
      (`getUserDepartmentScope`), cohérente avec le reste du module.
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — ajout de `SECRETARY` à
      `absences:manage` dans le manifeste existant, aucune nouvelle permission créée.
- [x] **Validation** Zod sur les query params de la nouvelle route.
- [x] **Migration** : `[Aucun changement]` — aucune modification de schéma.
- [x] **Enums** : pas de nouvel enum.
- [x] **UI** : réutilise `CheckboxGroup`/`Select` déjà en place dans `AbsencesClient.tsx`.

## Approche générale

Deux évolutions, l'une triviale, l'autre ciblée :

1. **Secrétaire → `absences:manage`** : `SECRETARY` fait déjà partie de `GLOBAL_ROLES`
   (`src/lib/auth.ts`), donc `getUserDepartmentScope` renvoie déjà `{ scoped: false }` pour ce
   rôle — l'ajouter à `absences:manage` dans le manifeste suffit à lui donner la gestion des
   absences à l'échelle de l'église, **sans aucun autre changement de code**.

2. **Backup pour un tiers** : `validateBackupTargets`/`getDeclarerBackupScope` (spec 013)
   n'ont **pas besoin d'être modifiées** — elles calculent déjà le périmètre de backup à partir
   d'un `userId` passé en paramètre. Aujourd'hui ce paramètre est toujours celui de l'appelant
   (cohérent avec l'auto-déclaration). Il suffit, côté route, de leur passer le `userId` **de la
   personne absente** (résolu via son `MemberUserLink`) au lieu de celui de l'appelant quand la
   déclaration/modification est faite pour un tiers.

   Le seul vrai ajout est côté UI/API : le formulaire ne connaît pas à l'avance le périmètre de
   backup d'un STAR choisi dynamiquement dans un `<Select>` (contrairement au cas "self", précalculé
   côté serveur au chargement de la page). Une route légère `GET /api/absences/backup-options`
   permet de le résoudre à la demande, en réutilisant la même logique que celle de `page.tsx`,
   désormais factorisée dans le service (`listBackupOptions`).

## Modèle de données

`[Aucun changement]`

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/absences/backup-options` | GET *(nouveau)* | `requireAuth()` + vérif. périmètre (même règle que la déclaration pour un tiers) | query : `churchId`, `memberId` | `{ eligible: boolean, options: Array<{ value, label }> }` |

`eligible: false` (options vides) si le STAR ciblé n'a pas de compte lié, ou si ce compte n'a ni
rôle Resp. département ni Ministre — cohérent avec la règle « pas de backup sur un STAR simple ».

Vérification de périmètre : même logique que `POST /api/absences` en mode « pour un tiers »
(le membre ciblé doit être dans le périmètre de gestion de l'appelant — `absences:manage` +
`getUserDepartmentScope`), pour ne pas exposer les rôles/backups possibles d'un STAR hors
périmètre de l'appelant.

`POST /api/absences` et `PATCH /api/absences/[id]` (`action: "update"`) : **signature Zod
inchangée** — seule la résolution interne du « sujet » du backup change (voir Services).

## Services / logique métier

`src/modules/planning/services/absence.service.ts` :

- `listBackupOptions(subjectUserId, churchId, db?)` *(nouveau, extrait de la logique déjà
  présente dans `page.tsx`)* : retourne `{ eligible, options }` — réutilise
  `getDeclarerBackupScope(subjectUserId, ...)` pour le périmètre STAR, et résout les options
  RESPONSIBLE (Ministre du ministère / pairs Resp. département, ou autres Ministres) en excluant
  `subjectUserId` lui-même. Utilisée à la fois par `page.tsx` (cas self) et par la nouvelle route
  (cas tiers) — élimine la duplication actuelle.

- `resolveSubjectUserId(memberId, churchId, db?)` *(nouveau)* : retourne le `userId` lié à ce
  membre (`MemberUserLink`), ou `null` si aucun compte n'est lié.

Pas de changement à `validateBackupTargets`/`getDeclarerBackupScope` elles-mêmes.

## UI / composants

- **`src/app/(auth)/absences/page.tsx`** : remplace le calcul inline des `backupOptions` par un
  appel à `listBackupOptions(session.user.id, churchId)` (cas self, inchangé fonctionnellement).

- **`AbsencesClient.tsx`** :
  - En mode `manage` (déclaration ou édition pour un tiers), dès qu'un STAR est sélectionné dans
    le `<Select>` du formulaire, un appel à `GET /api/absences/backup-options?churchId=&memberId=`
    détermine s'il faut afficher le bloc `CheckboxGroup` « Backup (optionnel) » et avec quelles
    options — remplace le calcul purement local `showBackupField` actuel pour le cas `manage`
    (le cas `self` reste basé sur les props déjà résolues côté serveur, sans appel réseau
    supplémentaire).
  - Pas d'appel si aucun STAR n'est encore sélectionné (`formMemberId` vide).

## Décisions & alternatives écartées

- **Choix** : réutiliser `validateBackupTargets`/`getDeclarerBackupScope` sans les modifier, en
  leur passant le `userId` du sujet plutôt que celui de l'appelant — *Pourquoi* : ces fonctions
  sont déjà paramétrées par `userId`, aucune raison de dupliquer la logique de périmètre pour un
  besoin identique (« le périmètre de backup d'une personne responsable, quel que soit qui déclare
  l'absence »).
- **Choix** : nouvelle route dédiée `GET /api/absences/backup-options` plutôt que d'embarquer le
  calcul dans la réponse de `GET /api/absences` ou de précalculer toutes les combinaisons possibles
  côté serveur — *Pourquoi* : le STAR ciblé en mode `manage` est choisi dynamiquement dans le
  formulaire ; précalculer les options pour tous les STAR gérables serait coûteux (une requête par
  STAR potentiel) pour un usage qui ne concerne qu'un sous-ensemble d'entre eux (ceux qui sont
  eux-mêmes responsables).
- **Écarté** : autoriser le backup y compris quand le STAR ciblé n'a pas de compte lié (en
  autorisant par exemple à choisir le périmètre du **déclarant** dans ce cas) — *Raison* : rejeté
  explicitement par la spec (le périmètre de backup doit toujours être celui de la personne
  absente, jamais du déclarant) ; sans compte lié, ce périmètre n'est pas déterminable.

## Risques & points d'attention

- **Fuite de périmètre via `backup-options`** : la route doit revérifier que `memberId` est dans
  le périmètre de gestion de l'appelant avant de révéler qui pourrait être backup — sinon un
  utilisateur avec `absences:manage` scopé pourrait sonder les rôles d'un STAR hors de son
  périmètre.
- **Cohérence avec la validation serveur** : `validateBackupTargets` reste la source de vérité
  côté écriture (elle revalide tout, y compris si le client a manipulé le `memberId` envoyé à
  `backup-options`) — la nouvelle route n'est qu'un confort d'affichage, jamais une autorisation
  en soi.

## Stratégie de tests

Tests unitaires (Vitest) dans `absence.service.test.ts` :

- `listBackupOptions` retourne `eligible: false` et des options vides pour un `subjectUserId` sans
  rôle Resp. département/Ministre, ou sans compte lié (memberId → `resolveSubjectUserId` → null,
  testé séparément).
- `listBackupOptions` retourne les mêmes options qu'un calcul manuel pour un Resp. département et
  pour un Ministre (non-régression du comportement déjà couvert par les tests de `page.tsx`
  équivalent, désormais dans le service).
- `resolveSubjectUserId` retourne `null` si aucun `MemberUserLink`, l'`userId` sinon.

Tests d'intégration (routes) :

- `GET /api/absences/backup-options` : 401 sans auth, 403 si `memberId` hors périmètre de
  l'appelant, `eligible: false` si le STAR n'a pas de rôle responsable, options correctes sinon.
- `POST /api/absences` (mode tiers, `backups` fourni) : les backups sont validés par rapport au
  périmètre du **STAR ciblé**, pas de l'appelant — reproduit le cas Secrétaire déclarant pour un
  Resp. département.
- Un Secrétaire (sans rôle Resp. département/Ministre) peut déclarer/modifier/annuler une absence
  pour n'importe quel STAR de l'église (plus de restriction de périmètre département).
