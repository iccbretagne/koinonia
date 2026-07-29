# Plan technique — Harmonisation et ergonomie du module Absences

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-07-29

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : aucun nouvel import cross-module ; `PlanningGrid` reste dans `src/components/`, `AbsencesClient` dans `src/app/(auth)/absences/`
- [x] **Sécurité** : aucune route existante affaiblie ; le lien vers le détail d'une absence n'est affiché que si l'utilisateur a déjà `absences:view` sur l'église concernée
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) — réutilisé tel quel, pas de nouvelle permission
- [x] **Validation** Zod — aucune mutation nouvelle ; les schémas Zod existants ne changent pas
- [x] **Migration** Prisma : `[Aucun changement]`, aucun champ de schéma ajouté
- [x] **Enums** : `AbsenceStatus` déjà importé depuis `@/generated/prisma/client`, inchangé
- [x] **UI** : réutilisation de `Input`, `Select`, `Button`, `DataTable` existants — aucun nouveau composant `components/ui/`

## Approche générale

Cette feature est purement une passe d'ergonomie/cohérence sur de l'existant, pas une nouvelle
règle métier. Le fil directeur :

1. **Filtres/tri de la vue d'ensemble** : appliqués **côté client**, sur les données déjà
   chargées par `GET /api/absences?scope=all` (qui renvoie déjà les statuts `ACTIVE` **et**
   `CANCELLED`, filtrés côté client aujourd'hui). Même pattern que `RoomsBookingClient`/
   `RoomChecklistsClient` (spec 010) : pas de nouveau paramètre d'API, `useMemo` pour dériver la
   liste affichée à partir des filtres + tri choisis. Aucun changement serveur nécessaire pour
   recherche/statut/période/tri.
2. **Cohérence visuelle** : les variants de `Button` du module sont déjà globalement cohérents
   (déclarer = primaire, annuler une absence = `danger`, fermer une modale = `secondary`) —
   l'audit n'a trouvé qu'une incohérence réelle : le badge de conflit est affiché en texte complet
   dans une table et en icône seule dans l'autre. On unifie sur un seul rendu (texte complet,
   cohérent avec la carte mobile de `DataTable` qui a la largeur pour l'afficher).
3. **Lien conflit → détail** : le badge d'absence affiché dans `PlanningGrid` devient un lien vers
   la vue d'ensemble des absences, avec l'absence concernée mise en évidence. Nécessite d'exposer
   l'`id` de l'absence (actuellement non renvoyé par la route de planning) et de connaître, côté
   page appelante, si l'utilisateur a `absences:view` sur l'église courante (déjà calculable sans
   requête supplémentaire).
4. **Mobile** : réorganisation des contrôles de filtre de la vue d'ensemble en groupes hiérarchisés
   (recherche + statut sur une ligne, période sur une autre, filtres organisationnels + tri sur une
   troisième), chaque groupe s'empilant proprement en dessous de 640px — même leçon tirée de la
   spec 009/010 sur les salles.

## Modèle de données

`[Aucun changement]` — le modèle `Absence` (statut, dates, motif) couvre déjà tous les besoins de
filtrage exprimés dans la spec.

## API

| Endpoint | Méthode | Permission | Changement |
|---|---|---|---|
| `/api/absences` | GET | `absences:view` (scope `all`) / aucune (scope `self`) | **Aucun** — réponse déjà suffisante (statut, dates, `conflicts`) |
| `/api/events/[eventId]/departments/[deptId]/planning` | GET | `planning:view` | `activeAbsence` gagne le champ `id` (en plus de `startDate`/`endDate`) |

Le schéma Zod du `PUT` de la route planning n'est pas concerné (aucune mutation touchée).

## Services / logique métier

Aucun changement dans `src/modules/planning/services/absence.service.ts` ni dans les événements du
bus — la spec exclut explicitement toute évolution des règles métier (permissions, périmètre,
workflow de déclaration/annulation).

`findActiveAbsencesByMember` (dans la route de planning, pas un service — logique déjà locale à la
route) est étendue pour sélectionner et renvoyer `id` en plus de `startDate`/`endDate`.

## UI / composants

### `src/app/(auth)/absences/AbsencesClient.tsx`

- **Filtres vue d'ensemble**, réorganisés en groupes (mobile : `flex-col`, desktop : `flex-row`) :
  - Groupe 1 — recherche & statut : `Input` recherche par nom de membre (filtrage client sur
    `firstName`/`lastName`), `Select` statut (`Actives` par défaut / `Toutes` / `Annulées`).
  - Groupe 2 — période : deux `Input type="date"` (Du / Au), filtrage client sur chevauchement
    avec `[startDate, endDate]` de l'absence.
  - Groupe 3 — filtres organisationnels existants (Ministère, Département, Rôle du déclarant) +
    `Select` de tri (Date de début ↓ par défaut / Date de début ↑ / Nom du membre).
- Les filtres organisationnels (Ministère/Département/Rôle) restent envoyés à l'API comme
  aujourd'hui (ils réduisent le volume chargé) ; recherche/statut/période/tri s'appliquent en plus,
  côté client, via `useMemo`.
- Badge de conflit : un seul rendu (texte complet `⚠ Conflit planning`) utilisé dans les deux
  tables (« Mes absences » et « Vue d'ensemble »).
- Support d'un paramètre d'URL `highlightId` (lu via `useSearchParams`) : si présent et que
  l'absence correspondante est dans la liste affichée (elle l'est par défaut puisque active), la
  ligne est mise en évidence visuellement (ex. anneau/fond coloré) et amenée dans le viewport au
  chargement (`scrollIntoView`). Nécessite d'englober la lecture des search params dans une
  limite `Suspense` côté page serveur (`page.tsx`) — contrainte Next.js App Router.
- Aucun changement aux variants de `Button` existants (ils sont déjà cohérents) — vérification
  incluse dans les critères d'acceptation plutôt que remaniement.

### `src/components/PlanningGrid.tsx`

- `MemberPlanning.activeAbsence` gagne `id: string`.
- `AbsenceBadge` : si un `canViewAbsences` (nouvelle prop `PlanningGridProps`) est vrai, le badge
  est rendu comme lien (`next/link`) vers `/absences?highlightId=<id>`, en conservant exactement
  le même style visuel qu'aujourd'hui (pas de changement de couleur/forme, juste une action de
  clic ajoutée). Si `canViewAbsences` est faux, le badge reste un `<span>` passif (comportement
  actuel, respecte le périmètre de visibilité).
- Les boutons de statut (`EN_SERVICE`/`INDISPONIBLE`/etc.) restent des `<button>` natifs stylés en
  dur : **hors périmètre** de cette feature — ce ne sont pas des actions génériques
  (créer/annuler/fermer) mais un sélecteur de statut à état multiple avec un design spécifique
  (pastilles colorées par statut), donc pas comparable aux variants de `Button`. Les inclure dans
  le système `variant` serait de la sur-ingénierie sans bénéfice observable pour l'utilisateur.

### `src/app/(auth)/dashboard/page.tsx`

- Calcule `canViewAbsences` de la même façon que `canEditPlanning`/`isAdmin` existants (scope par
  église courante à partir de `session.user.churchRoles` + `rolePermissions`), sans requête
  supplémentaire, et le passe en prop à `PlanningGrid`.

## Décisions & alternatives écartées

- **Choix** : filtres/tri de la vue d'ensemble en client-side (`useMemo`) — *Pourquoi* : c'est le
  pattern déjà établi et validé sur le module Salles (specs 009-011), l'API renvoie déjà toutes
  les données nécessaires (y compris les absences annulées), et le volume attendu par église ne
  justifie pas une pagination serveur.
- **Choix** : le clic sur le badge de conflit renvoie vers la ligne mise en évidence dans la vue
  d'ensemble existante plutôt que vers une nouvelle modale de détail dédiée — *Pourquoi* : la vue
  d'ensemble affiche déjà toutes les informations pertinentes (membre, département, ministère,
  période, déclarant, conflit) ; créer un second composant de détail dupliquerait l'information
  sans valeur ajoutée (contrairement au module Salles où la main courante n'avait *aucune* vue de
  détail avant la spec 011).
- **Écarté** : filtre par statut exposé côté API (`GET /api/absences?status=...`) — *Raison* :
  l'API renvoie déjà tous les statuts, ajouter un paramètre serveur dupliquerait une logique déjà
  faisable côté client sans coût de performance notable.
- **Écarté** : harmoniser les boutons de statut de `PlanningGrid` avec le composant `Button` —
  *Raison* : ce sont des indicateurs d'état multi-valeurs avec un design intentionnellement
  distinct (couleur = signification du statut), pas des actions ponctuelles ; la spec vise la
  cohérence des *actions*, pas la refonte d'un composant fonctionnellement différent.
- **Écarté** : « Mes absences » avec les mêmes filtres que la vue d'ensemble — *Raison* : décision
  utilisateur explicite (voir spec, questions ouvertes tranchées) — volume par compte trop faible
  pour justifier des contrôles supplémentaires.

## Risques & points d'attention

- `useSearchParams` dans `AbsencesClient` (Client Component) impose une limite `Suspense` dans
  `page.tsx` pour éviter l'avertissement/erreur de build Next.js App Router sur le rendu statique —
  à vérifier avec `npm run build`.
- La mise en évidence via `highlightId` ne fonctionne que pour une absence **active** (cas d'usage
  du badge de `PlanningGrid`, qui n'affiche que des absences actives) — pas besoin de gérer le cas
  où l'absence est annulée entre le clic et l'affichage de la vue d'ensemble, mais si cela se
  produit (annulée entre-temps), la ligne ne sera simplement pas visible avec le filtre par défaut
  (comportement dégradé acceptable, pas une erreur).
- Vérifier que le nouveau lien du badge n'introduit pas de régression d'accessibilité tactile sur
  mobile (le commentaire existant sur les tooltips non accessibles au toucher doit rester valide —
  le lien doit rester visible et cliquable, pas dépendant d'un hover).
- Repasser une vérification manuelle mobile (captures d'écran, comme pour la spec 009) sur
  `/absences` (vue d'ensemble avec les nouveaux filtres) et sur la grille de planning (badge
  cliquable) avant de considérer la feature terminée.

## Stratégie de tests

- **`src/app/api/events/[eventId]/departments/[deptId]/planning/__tests__/route.test.ts`** :
  étendre les cas existants qui vérifient `activeAbsence` pour couvrir la présence du champ `id`.
- Pas de nouveau test API pour `/api/absences` (aucun changement de contrat).
- Les filtres/tri/recherche/mise en évidence étant de la logique de présentation pure (dérivée par
  `useMemo` dans un Client Component), ils suivent le même choix que pour `RoomsBookingClient` :
  pas de test unitaire dédié à ce niveau (pas de suite de tests de composants React dans ce repo à
  ce jour) — validation par `npm run typecheck`/`npm run lint` + vérification manuelle
  (desktop + mobile) documentée dans les tâches d'implémentation.
- `npm run typecheck && npm run lint && npm run lint:boundaries && npm run test` doivent passer
  avant toute PR (constitution, section V).
