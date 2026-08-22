# Plan technique — Rôle Reporter géré comme rôle transverse

- **Spec associée** : `./spec.md`
- **Statut** : Validé *(a posteriori, code déjà mergé)*
- **Mis à jour le** : 2026-08-23

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun changement d'import de module (fichier UI seul)
- [x] **Sécurité** : aucun changement d'API — `requireAuth`/`requirePermission` déjà en place sur `/api/users/{userId}/roles`
- [x] **Permissions** : `rolePermissions` inchangé, `REPORTER` déjà dans `roleSchema` de la route
- [x] **Validation** Zod : inchangée (même endpoint réutilisé)
- [x] **Migration** Prisma : `[Aucune]` — aucun changement de schéma
- [x] **Enums** : `Role.REPORTER` déjà existant dans `@/generated/prisma/client`
- [x] **UI** : réutilisation du mécanisme générique existant (`toggleTransverseRole`), pas de nouveau composant

## Approche générale

Fusionner le rôle `REPORTER` dans le tableau `TransverseRole` déjà utilisé pour
les 5 autres rôles transverses, et supprimer le code dédié devenu redondant
(onglet, état, recherche, fonction de toggle). Aucun changement côté API : le
rôle `REPORTER` était déjà accepté par `roleSchema` dans
`src/app/api/users/[userId]/roles/route.ts` — seul le point d'entrée UI change.

## Modèle de données

`[Aucun changement]`

## API

`[Aucun changement]` — réutilisation de `POST` / `DELETE /api/users/{userId}/roles`
déjà existants et déjà compatibles avec `role: "REPORTER"`.

## Services / logique métier

`[Aucun changement]` — fichier purement UI.

## UI / composants

*Fichier : `src/app/(auth)/admin/access/AccessClient.tsx`*

- `TransverseRole` étendu avec `"REPORTER"`.
- `TRANSVERSE_ROLE_LABELS["REPORTER"] = "Reporter"`, couleur de badge dédiée
  (`bg-icc-violet/10 text-icc-violet border-icc-violet/20`, reprise du style
  précédent de l'onglet dédié).
- Nouvelle constante `TRANSVERSE_ROLES` (tableau) pour éviter la répétition du
  littéral `["ADMIN", "SECRETARY", "DISCIPLE_MAKER", "AGENDA_QUALIFIER",
  "ACCOUNTANT", "REPORTER"]` à 3 endroits du rendu.
- Suppression : onglet `"reporters"` du type `Tab`, bloc JSX associé, état
  `reporterLoading`/`reporterSearch`, dérivé `filteredReporterUsers`, fonction
  `toggleReporter`.

## Décisions & alternatives écartées

- **Choix** : réutiliser `toggleTransverseRole` (générique) plutôt que garder
  `toggleReporter` (dédié) — *Pourquoi* : code strictement identique
  fonctionnellement (mêmes appels API), la duplication n'apportait rien.
- **Écarté** : garder l'onglet "Comptes rendus" en plus de l'ajout dans
  "Rôles transverses" (double affichage) — *Raison* : aurait créé deux façons
  différentes de faire la même action, source de confusion et de bugs de
  synchronisation d'état entre les deux onglets.

## Risques & points d'attention

- Un utilisateur ayant un lien/favori vers l'ancien onglet "Comptes rendus"
  retombera sur l'onglet par défaut (`roles` ou `requests`) — impact mineur,
  pas de lien profond documenté ou communiqué à l'externe pour cet onglet.

## Stratégie de tests

- Pas de test unitaire dédié ajouté : fichier client React sans logique
  métier nouvelle (délègue à des endpoints déjà couverts par les tests
  existants de `src/app/api/users/[userId]/roles/`).
- Vérification manuelle recommandée (non faite avant merge — à faire) :
  attribution/retrait de `Reporter` depuis l'onglet "Rôles transverses" en
  environnement de recette.
