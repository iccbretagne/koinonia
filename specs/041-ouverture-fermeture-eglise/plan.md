# Plan technique — Service d'ouverture et de fermeture de l'église

- **Spec associée** : `./spec.md`
- **Statut** : Implémentée
- **Mis à jour le** : 2026-09-11

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : tout le code applicatif vit dans `src/modules/planning/` (qui
      possède déjà `/admin/events`, `/api/events`, `/admin/welcome-duty`, `/api/welcome-duty`) ou
      dans `src/app/` via son index — pas de nouveau module créé (feature trop petite pour le
      justifier, cf. « Décisions »)
- [x] **Sécurité** : toutes les routes protégées par `requireCurrentChurchPermission`/
      `requireChurchPermission` ; `churchId` toujours résolu via `resolveChurchId("event", eventId)`
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) pour la partie rôle-globale
      (`events:manage`) ; la portée département passe par `getUserDepartmentScope` — voir
      « Services / logique métier » pour le composite (rôle + département Sécurité + tout membre
      Secrétariat) qui ne peut pas s'exprimer comme une simple entrée `rolePermissions`
- [x] **Validation** Zod sur toutes les mutations
- [x] **Migration** Prisma prévue (nouveau modèle `OpeningClosingAssignment` + enum `DutySlot`)
- [x] **Enums** importés depuis `@/generated/prisma/client`
- [x] **UI** : réutilise `src/components/ui/` (`Select`, `Button`, `Modal`) — pas de nouveau
      composant générique nécessaire

## Approche générale

Feature structurellement très proche du service d'accueil (`WelcomeDutyAssignment`, spec
existante) : une table d'affectations nominatives par événement, gérée depuis la fiche
événement, avertie/notifiée via les helpers existants. Deux différences structurantes :

1. **Nominatif sur `Member` directement** (pas d'indirection « famille » comme l'accueil).
2. **Qui peut désigner** est un droit composite non représentable par une seule permission de
   rôle : responsables/adjoints du département de fonction `SECURITE`, **tous** les membres
   (pas seulement responsables) du département de fonction `SECRETARIAT`, plus `events:manage`
   (Secrétaire/Admin/Super Admin). On suit le précédent `isControlTeamMember` du module `rooms`
   (`src/modules/rooms/services/checklist.service.ts`) pour la partie « équipe dédiée », étendu
   d'un cas « n'importe quel membre du département » propre à cette spec.

Pas de nouveau module : on ajoute au module `planning` existant, qui possède déjà les préfixes
`/admin/events` et `/api/events` (la nouvelle route `/api/events/[eventId]/opening-closing`
est donc déjà couverte par le manifeste sans déclaration supplémentaire — même raisonnement que
pour spec 042/`route-exhaustivite.test.ts`, `matchesPrefix()` couvre les sous-chemins).

## Modèle de données

```prisma
enum DutySlot {
  OPENING
  CLOSING
}

/// Désignation nominative pour l'ouverture/fermeture de l'église à un événement (spec 041).
/// Plusieurs personnes possibles par créneau (pas de contrainte d'unicité sur le slot seul) ;
/// l'unicité porte sur (event, slot, membre) pour éviter les doublons du même membre.
model OpeningClosingAssignment {
  id              String   @id @default(cuid())
  churchId        String
  eventId         String
  slot            DutySlot
  memberId        String
  note            String?  @db.VarChar(500)
  createdByUserId String
  createdAt       DateTime @default(now())

  church        Church @relation(fields: [churchId], references: [id])
  event         Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  member        Member @relation(fields: [memberId], references: [id], onDelete: Cascade)
  createdByUser User   @relation(fields: [createdByUserId], references: [id])

  @@unique([eventId, slot, memberId])
  @@index([churchId])
  @@index([memberId])
  @@map("opening_closing_assignments")
}
```

`Event` gagne la relation inverse `openingClosingAssignments OpeningClosingAssignment[]`
(pas de champ `enabled` type `welcomeDutyEnabled` : contrairement à l'accueil, ce service
concerne potentiellement **tout** événement, donc pas de bascule d'activation — cf. « Décisions »).

Migration : `npm run db:migrate -- --name add_opening_closing_assignment`.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/events/[eventId]/opening-closing` | GET | `planning:view` (même garde que `star-view`, consultation large) | — | `{ opening: Assignment[], closing: Assignment[] }` |
| `/api/events/[eventId]/opening-closing` | POST | composite (voir services) | `{ slot: "OPENING"\|"CLOSING", memberId: string, note?: string }` | `{ assignment, absenceWarning: boolean }` |
| `/api/events/[eventId]/opening-closing/[id]` | DELETE | composite (idem POST) | — | `{ success: true }` |

Zod (POST) :
```ts
const schema = z.object({
  slot: z.enum(["OPENING", "CLOSING"]),
  memberId: z.string().min(1),
  note: z.string().max(500).optional(),
});
```

Pas d'endpoint PATCH : une modification = retirer + désigner à nouveau (aligné avec la
contrainte d'unicité et le principe « pas d'écrasement silencieux » — chaque ajout/retrait est
un événement distinct et visible).

## Services / logique métier

Nouveau fichier `src/modules/planning/services/opening-closing.service.ts` :

- `canManageOpeningClosing(session, churchId): Promise<boolean>` — composite :
  1. `true` si `events:manage` accordé (Super Admin/Admin/Secrétaire, via `rolePermissions`) ;
  2. sinon, `true` si l'utilisateur est responsable/adjoint (`getUserDepartmentScope`) d'un
     département dont `function === "SECURITE"` ;
  3. sinon, `true` si le `Member` lié à l'utilisateur (`MemberUserLink`) appartient
     (`member_departments`) à un département dont `function === "SECRETARIAT"` — **peu importe
     son rôle**, contrairement au cas 2 (exigence spec explicite : « n'importe quel membre »).
  4. sinon `false`.
- `findActiveAbsenceForMember(churchId, memberId, eventDate): Promise<Absence | null>` — reprend
  le pattern déjà utilisé dans
  `src/app/api/events/[eventId]/departments/[deptId]/planning/route.ts`
  (`Absence` avec `status: "ACTIVE"`, `startDate <= eventDate <= endDate`).
- `notifyAssignment(memberId, event, slot)` / `notifyRemoval(...)` — résolvent le `userId` via
  `MemberUserLink` (silencieux si le membre n'a pas de compte lié) et appellent
  `createNotification` (`src/lib/notifications.ts`).

Les trois route handlers restent fins : ils résolvent `churchId`, appellent
`canManageOpeningClosing` (POST/DELETE seulement — GET reste sur `planning:view` classique),
valident avec Zod, et délèguent au service.

## UI / composants

- **Fiche événement admin** (`src/app/(auth)/admin/events/[eventId]/EventDetailClient.tsx`) :
  nouvelle section « Ouverture / Fermeture », visible aux seuls utilisateurs habilités (le
  serveur ne renvoie les actions de désignation que si `canManageOpeningClosing` — cohérent avec
  le principe « l'onglet masqué ne dispense jamais du contrôle serveur »). Deux listes (Ouverture
  / Fermeture), chacune avec les noms désignés + bouton retirer, et un sélecteur de membre
  (réutilise le pattern de recherche de membre déjà utilisé pour les désignations d'accueil) +
  bouton ajouter. Créneau vide → badge « Non pourvu ». Absence détectée → toast d'avertissement
  non bloquant après ajout (`absenceWarning` dans la réponse POST).
- **Vue consultation événement** (`src/app/(auth)/events/[eventId]/star-view/StarViewClient.tsx`
  + son API `src/app/api/events/[eventId]/star-view/route.ts`) : ajoute
  `openingClosingAssignments` à l'`include` Prisma existant (même endroit que
  `welcomeDutyAssignments`, déjà présent), affichage en lecture seule sous les départements.
- **Mon planning** (`src/app/(auth)/planning/page.tsx` + `MyPlanningView.tsx`) : nouvelle requête
  `prisma.openingClosingAssignment.findMany({ where: { memberId: link.memberId }, include: { event: true } })`
  en plus des `plannings`/`taskAssignments` existants, passée en prop et rendue comme carte
  supplémentaire par événement (le composant gère déjà l'agrégation multi-source par événement).
- Mobile : les composants ci-dessus sont déjà responsive (mêmes classes Tailwind que le reste de
  la fiche événement) — pas de composant dédié mobile à écrire.

## Décisions & alternatives écartées

- **Choix** : nominatif direct sur `Member`, pas d'indirection façon `WelcomeDutyFamily`/
  `WelcomeDutyAssignment` — *Pourquoi* : la spec désigne des **personnes**, pas des foyers ; la
  double table de l'accueil existe pour gérer un pool de familles réutilisable entre événements,
  besoin absent ici.
- **Choix** : pas de champ `Event.openingClosingEnabled` (contrairement à
  `welcomeDutyEnabled`) — *Pourquoi* : l'accueil ne concerne qu'une partie des événements
  (culte du dimanche typiquement), d'où la bascule ; l'ouverture/fermeture concerne
  structurellement tout événement nécessitant l'accès aux locaux — ajouter une bascule
  serait de la sur-ingénierie pour un cas que la spec ne mentionne pas.
- **Choix** : droit de désignation composite dans un service dédié plutôt qu'une entrée
  `rolePermissions` — *Pourquoi* : `rolePermissions` n'exprime que des droits par **rôle global**
  ou par **portée département via responsabilité** (`getUserDepartmentScope`) ; le cas « tout
  membre simple d'un département » (Secrétariat) n'a pas de précédent dans la matrice de
  permissions et ne peut pas s'y insérer sans casser l'invariant « une permission = un ensemble
  de rôles ». Suit le précédent déjà établi par `isControlTeamMember` (module `rooms`).
- **Écarté** : créer un module `opening-closing` dédié — *Raison* : la feature est trop petite
  (une table, trois routes) pour justifier un manifeste et une entrée de permission autonomes ;
  elle vit naturellement dans `planning`, propriétaire déjà de `/admin/events`/`/api/events`.
- **Écarté** : endpoint `PATCH` pour modifier une désignation — *Raison* : retirer + ajouter
  couvre le besoin avec une seule contrainte d'unicité, et rend chaque changement visible comme
  un événement distinct (pas d'écrasement silencieux entre Sécurité et Secrétariat, exigence
  explicite de la spec).
- **Écarté** : bloquer la désignation d'une personne absente — *Raison* : la spec demande un
  avertissement (« le désignateur en est averti »), pas un blocage ; un simple flag
  `absenceWarning` dans la réponse suffit, pas besoin d'un flux de confirmation à deux temps.

## Risques & points d'attention

- Le composite `canManageOpeningClosing` interroge `MemberUserLink` + `member_departments` en
  plus de `getUserDepartmentScope` — vérifier qu'un utilisateur **sans** compte membre lié
  (`MemberUserLink` absent) ne casse pas silencieusement le contrôle (doit simplement retomber
  aux deux autres cas, jamais lever une erreur).
- `notifyAssignment`/`notifyRemoval` doivent rester silencieux si le membre désigné n'a pas de
  compte utilisateur lié — ne pas faire échouer la création de l'affectation pour ça.
- Vérifier l'absence de régression sur `src/app/api/events/[eventId]/star-view/route.ts` (route
  déjà couverte par de nombreux tests existants) en y ajoutant l'`include`.

## Stratégie de tests

- `src/modules/planning/services/__tests__/opening-closing.service.test.ts` : les 4 branches de
  `canManageOpeningClosing` (events:manage, responsable Sécurité, membre simple Secrétariat,
  aucun des trois) ; `findActiveAbsenceForMember` (absence active chevauchant la date,
  absence hors période, aucune absence).
- `src/app/api/events/__tests__/opening-closing.test.ts` : GET (liste vide, liste peuplée),
  POST (création réussie + notification, 403 pour un rôle non habilité, avertissement absence,
  400 sur payload invalide, doublon `@@unique` renvoyant une erreur métier propre), DELETE
  (retrait réussi + notification, 403, 404 sur id inconnu).
- Étendre le test existant de `star-view` pour vérifier la présence de
  `openingClosingAssignments` dans la réponse.
- Étendre le test existant de `/api/planning` (page « Mon planning ») si un test couvre déjà son
  agrégation, sinon test manuel documenté dans `tasks.md`.
