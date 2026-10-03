# Plan technique — Accompagnants déclarés du suivi pastoral

- **Spec associée** : `./spec.md`
- **Statut** : Validé
- **Mis à jour le** : 2026-10-01

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `src/app/` n'importe que `@/modules/care` (nouvelles fonctions
      exportées par `src/modules/care/index.ts`) ; aucune dépendance nouvelle entre modules
- [x] **Sécurité** : lecture et écriture passent par `requireCareQualify(churchId)`
      (`requireChurchPermission("care:qualify", churchId)`), `churchId` obligatoire ; chaque
      requête filtre par `churchId`
- [x] **Permissions** via `rolePermissions` : aucune permission nouvelle, `care:qualify` existante
- [x] **Validation** Zod sur la mutation `PUT /api/care/companions`
- [x] **Migration** Prisma : une table + un enum (`prisma migrate dev`)
- [x] **Enums** depuis `@/generated/prisma/client`
- [x] **UI** : `Checkbox`, `Input`, `IconButton`, `Button`, `ConfirmModal`, `EmptyState`,
      `useToast` réutilisés

## Approche générale

Le vivier « STAR » des accompagnants reste **calculé**, comme aujourd'hui, à partir de
l'appartenance au MSDP. On y ajoute seulement des **exceptions déclarées** par église :

- `ADDED` : STAR ajouté nominativement (hors MSDP, ou pour le garder s'il quitte le MSDP) ;
- `EXCLUDED` : membre du MSDP écarté par le référent.

Règle unique, implémentée à un seul endroit (`services/companions.ts`) :

```
accompagnant possible(u) = a un compte lié et validé dans l'église
                         ∧ ( exception(u) = ADDED
                           ∨ ( membre d'un département MSDP ∧ exception(u) ≠ EXCLUDED ) )
```

« A un compte lié et validé » = `MemberUserLink` de l'église avec `validatedAt` non nul (même
critère que `listMsdpCounselors` aujourd'hui). « Membre d'un département MSDP » = la fiche liée
appartient (`member_departments`) à un département de fonction `MSDP` de l'église, **ou**
l'utilisateur est responsable d'un tel département (`user_departments`) — exactement le vivier
accepté par `resolveAssignee` depuis #616.

Sans aucune exception enregistrée, la règle donne le vivier d'aujourd'hui : la spec (« aucun
changement au déploiement ») est tenue **sans migration de données**. L'ajout automatique à
l'arrivée dans le MSDP, et le retrait automatique au départ, découlent du calcul.

La liste proposée (`GET /api/care/companions`) et la validation à l'affectation
(`resolveAssignee`) appellent la même fonction : l'écart corrigé par #616 ne peut plus se
reproduire.

## Modèle de données

```prisma
/// Exception déclarée au vivier calculé des accompagnants STAR (spec 056).
enum CareCompanionMode {
  ADDED    // ajouté nominativement (hors MSDP ou gardé après départ du MSDP)
  EXCLUDED // membre du MSDP écarté par le référent
}

model CareCompanion {
  id          String            @id @default(cuid())
  churchId    String
  userId      String
  mode        CareCompanionMode
  createdById String?
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  church    Church @relation(fields: [churchId], references: [id], onDelete: Cascade)
  user      User   @relation("CareCompanionUser", fields: [userId], references: [id], onDelete: Cascade)
  createdBy User?  @relation("CareCompanionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@unique([churchId, userId])
  @@index([churchId])
  @@map("care_companions")
}
```

Relations inverses sur `Church` (`careCompanions`) et `User` (`careCompanions`,
`careCompanionsCreated`). Migration `add_care_companions` : création de table uniquement, aucune
donnée à reprendre.

Une seule ligne par (église, utilisateur) : exclure un STAR ajouté remplace `ADDED` par
`EXCLUDED` ; « réintégrer » un membre du MSDP ou « retirer » un STAR ajouté **supprime** la
ligne (retour au calcul par défaut). L'exclusion survit à un départ puis retour dans le MSDP
(cas limite de la spec) puisqu'elle n'est pas liée à l'appartenance.

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/care/companions` | GET | `care:qualify` | `?churchId` | `{ profiles, members }` — `members` remplace `msdpMembers` (accompagnants possibles) |
| `/api/care/companions` | PUT | `care:qualify` | `{ churchId, userId, state: "ADDED" \| "EXCLUDED" \| "DEFAULT" }` | `{ userId, state, activeAssignments }` |

Zod du PUT :

```ts
z.object({
  churchId: z.string().min(1),
  userId: z.string().min(1),
  state: z.enum(["ADDED", "EXCLUDED", "DEFAULT"]),
})
```

Règles serveur (`ApiError(400)`) : `ADDED` exige un compte lié et validé dans l'église ;
`EXCLUDED` exige l'appartenance au MSDP (exclure quelqu'un qui n'y est pas n'a pas de sens) ;
`DEFAULT` supprime l'exception éventuelle (idempotent). Chaque changement effectif est tracé par
`logAudit({ action: "UPDATE", entityType: "CareCompanion", entityId: userId, details: { from, to } })`.

Couvert par le préfixe `/api/care` déjà déclaré dans le manifeste (ADR-0012) : pas de nouvelle
déclaration de route. La page reste `/care/parametres` (préfixe `/care`).

## Services / logique métier

Nouveau fichier `src/modules/care/services/companions.ts` :

- `listCompanionCandidates(churchId)` — une requête : utilisateurs ayant un `MemberUserLink`
  validé dans l'église, avec les départements de leur fiche, leur appartenance MSDP (fiche ou
  responsabilité) et leur exception. Base commune des fonctions suivantes.
- `isCompanionEligible(candidate)` — la règle ci-dessus, pure (testable sans base).
- `listEligibleCompanions(churchId)` — remplace `listMsdpCounselors` pour
  `GET /api/care/companions` ; tri par nom.
- `isEligibleCompanion(churchId, userId)` — même règle pour un seul utilisateur (requête ciblée),
  utilisée par `resolveAssignee` (branche `MEMBER`) à la place de la requête ajoutée par #616.
- `getCompanionSettings(churchId)` — pour la page : `msdp` (membres du MSDP, avec `excluded`),
  `added` (exceptions `ADDED` hors MSDP), `candidates` (autres STAR avec compte, pour la
  recherche), et pour chaque personne affichée `activeAssignments` (rendez-vous `VALIDATED` /
  `SCHEDULED` avec `assignedMemberId`, suivis `ASSIGNED` / `CONTACTED` / `IN_FORMATION` avec
  `assignedConseillerMsdpId`), calculés en deux `groupBy`.
- `setCompanionState({ churchId, userId, state, actorId })` — contrôles, upsert ou suppression,
  audit ; renvoie `activeAssignments` pour le message de confirmation.

`listMsdpCounselors` est supprimée (son seul appelant est `GET /api/care/companions`).
`resolveAssignee` conserve son message d'erreur actuel, reformulé en « Cette personne n'est pas
un accompagnant possible de l'église ».

Aucun événement de bus : rien, hors du module, ne réagit à ces changements.

## UI / composants

- **`/care/parametres`** (`page.tsx`, Server Component) : charge `getCompanionSettings` en plus
  des délais et ajoute une seconde carte **« Accompagnants »** sous celle des délais.
- **`CompanionsSettings.tsx`** (client, dans `src/app/(auth)/care/parametres/`) :
  - Groupe **« Équipe MSDP »** (ajout automatique) : une ligne par membre (nom, départements,
    mention « N en cours » le cas échéant) avec un `Checkbox` « Accompagnant ». Décocher =
    `EXCLUDED`, recocher = `DEFAULT`.
  - Groupe **« Ajoutés hors MSDP »** : une ligne par STAR ajouté, `IconButton` « Retirer »
    (`DEFAULT`). `EmptyState` quand vide.
  - **Recherche** : `Input` filtrant localement `candidates` (nom, email), liste de résultats
    avec bouton « Ajouter » (`ADDED`). Liste chargée côté serveur : quelques centaines de STAR au
    plus par église, pas besoin d'une recherche serveur.
  - Exclure ou retirer une personne ayant des demandes en cours ouvre un `ConfirmModal` :
    « N demandes en cours restent confiées à cette personne. Elle ne pourra plus en recevoir de
    nouvelles. » ; sinon action immédiate. Retour par `useToast`, puis `router.refresh()`.
  - Mobile : lignes pleine largeur `min-h-12`, contrôle à droite, recherche au-dessus des
    résultats ; aucune table.
- **`AssigneeSelect.tsx`** : lit `members` au lieu de `msdpMembers`, groupe renommé
  « STAR accompagnants ». Si le groupe est vide, option désactivée « Aucun STAR accompagnant —
  voir Paramètres ».
- **Guide utilisateur** et `docs/` : la section suivi pastoral décrit la liste d'accompagnants.

## Décisions & alternatives écartées

- **Choix** : vivier calculé + exceptions (`ADDED` / `EXCLUDED`) — *Pourquoi* : c'est la seule
  forme qui donne l'ajout automatique à l'arrivée dans le MSDP sans tâche de synchronisation, et
  « aucun changement au déploiement » sans reprise de données.
- **Écarté** : liste explicite pré-remplie à la migration — *Raison* : contredit l'ajout
  automatique voulu par le porteur ; imposerait une synchronisation à chaque changement de
  département.
- **Écarté** : un drapeau sur la fiche STAR ou sur l'appartenance au département — *Raison* : ne
  couvre pas les STAR hors MSDP, et mélangerait une décision du suivi pastoral avec les données
  du module planning (frontière de module).
- **Choix** : une ligne unique par (église, utilisateur) avec un mode — *Pourquoi* : rend
  impossibles les états contradictoires (ajouté et exclu à la fois).
- **Choix** : pas de permission nouvelle, `care:qualify` — *Pourquoi* : c'est déjà le droit
  d'affecter et de régler le module ; la spec réserve le réglage aux mêmes rôles.
- **Pas d'ADR** : décision interne au module `care`, réversible (une table), sans effet sur
  les autres modules ni sur les périmètres d'accès (ADR-0009/0013 inchangés : l'accès de
  l'accompagnant reste vérifié demande par demande par `isCurrentAssignee`).

## Risques & points d'attention

- **Accompagnant hors MSDP et accès** : il n'a ni `care:view` ni appartenance MSDP. Son accès
  repose entièrement sur `isCurrentAssignee` (déjà en place pour les membres MSDP simples) et sur
  le lien « Suivi pastoral » affiché quand il a au moins une demande en charge
  (`(auth)/layout.tsx`). À couvrir par un test de bout en bout du service.
- **Relances et notifications** : `runCareRelances` et les notifications ciblent l'accompagnant
  affecté par son `userId`, indépendamment du MSDP — à vérifier, aucun changement attendu.
- **Page « Accès » (spec 054)** : elle affiche les accès implicites (dont « accompagnant »). Elle
  continue de déduire ce rôle des demandes en charge ; pas de changement dans ce lot.
- **Suppression de compte / lien** : `onDelete: Cascade` sur `userId` ; un lien STAR dévalidé fait
  simplement sortir la personne du vivier (règle « compte lié et validé »).

## Stratégie de tests

- `isCompanionEligible` (pur) : matrice complète — MSDP par fiche / par responsabilité / non
  MSDP × aucune exception / `ADDED` / `EXCLUDED` × compte validé ou non.
- `listEligibleCompanions` / `isEligibleCompanion` (Prisma mocké) : même résultat pour un même
  utilisateur (garde contre la dérive corrigée par #616).
- `resolveAssignee` : accepte un STAR `ADDED` hors MSDP, refuse un membre MSDP `EXCLUDED`.
- `setCompanionState` : `ADDED` refusé sans compte validé, `EXCLUDED` refusé hors MSDP,
  `DEFAULT` idempotent, audit écrit seulement sur changement, `activeAssignments` correct.
- Routes `GET`/`PUT /api/care/companions` : 403 sans `care:qualify` (Secrétaire incluse), 400
  sur body invalide, `churchId` d'une autre église refusé.
- CI `migrations` : rejeu de la migration sur base vierge.
- Vérification manuelle (Playwright, dev) : écran Paramètres en largeur mobile et bureau,
  affectation d'un STAR hors MSDP puis ouverture de la demande avec son compte.
