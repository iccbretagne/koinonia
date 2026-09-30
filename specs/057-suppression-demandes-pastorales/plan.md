# Plan technique — Suppression des demandes du suivi pastoral et de l'intégration

- **Spec associée** : `./spec.md`
- **Statut** : Validé (décisions arbitrées avec le porteur le 2026-10-01)
- **Mis à jour le** : 2026-10-01

> Ce plan traduit la spec en **approche technique** conforme à `../constitution.md`.

## Vérification de conformité (constitution)

- [x] **Frontières modules** : `care` et `integration` ne s'importent pas (ADR-0001) ; la seule
      orchestration entre les deux (refus de suppression d'une demande d'intégration ayant
      donné naissance à un élément `care`) se fait dans le route handler, qui importe les deux
      index `@/modules/care` et `@/modules/integration`
- [x] **Sécurité** : chaque `DELETE` charge l'objet, prend **son** `churchId` comme église de
      référence (`resolveChurchId`/objet chargé, jamais le contexte affiché), puis
      `requireChurchPermission("care:delete" | "integration:delete", churchId)`
- [x] **Permissions** via `rolePermissions` (`@/lib/registry`) : deux permissions dédiées
      déclarées dans les manifestes, matrice figée `permissions.test.ts` mise à jour
- [x] **Validation** Zod : les trois routes `DELETE` n'ont pas de corps ; l'identifiant vient de
      `await params` — aucune mutation à corps n'est ajoutée
- [x] **Migration** Prisma : une migration additive (`Notification.entityType`/`entityId`,
      nullables + index) — voir « Modèle de données »
- [x] **Enums** importés depuis `@/generated/prisma/client` (aucun nouvel enum)
- [x] **UI** : `Button` (variant `danger`), `ConfirmModal`, `EmptyState`, `useToast` réutilisés

## Approche générale

Suppression **définitive** (pas de corbeille, hors périmètre) de trois objets : demande de
rendez-vous pastoral (`AppointmentRequest`), suivi de nouveau converti (`MsdpFollowUp`) — tous
deux du module `care` — et demande d'intégration (`FamilyIntegrationRequest`, module
`integration`). Chaque suppression, dans une transaction :

1. vérifie l'existence et l'église de l'objet ;
2. refuse (`409`) si un suivi lié existe (règle « option B » de la spec) ;
3. efface ce qui n'existe que par la demande (entrée d'agenda du rendez-vous, historique,
   notifications in-app qui s'y rapportent) ;
4. supprime la ligne.

Puis, une fois la transaction validée, une **seule** ligne de journal `DELETE` est écrite, sans
aucune donnée personnelle. Les listes, relances, statistiques et exports lisant tous la table en
direct, une ligne supprimée disparaît partout sans code supplémentaire.

## Modèle de données

### Rattachement des notifications (seul changement de schéma)

Décision du porteur : les notifications in-app d'une demande supprimée sont **supprimées**, car
leur texte cite presque toujours la personne. Le lien seul ne permet pas de les retrouver
toutes : trois notifications nominatives pointent vers une page générique (« Nouvelle demande
de RDV » → `/care`, « Accompagnement réaffecté » → `/care`, « Demande RDV à planifier » →
`/agenda/schedule`), et celles du demandeur vers `/requests`. On ajoute donc un rattachement
explicite :

```prisma
model Notification {
  // …
  /// Objet métier dont parle la notification (spec 057) — permet de l'effacer avec lui.
  /// Nullable : notifications antérieures et notifications sans objet précis.
  entityType String? @db.VarChar(50)
  entityId   String?

  @@index([entityType, entityId])
}
```

Migration `add_notification_entity` : deux colonnes nullables et un index, **sans reprise de
données**. `NotificationInput` (`src/lib/notifications.ts`) reçoit `entityType?`/`entityId?`,
transmis tels quels par `createNotification`/`notifyUsers`/`notifyUsersWithRole`/
`notifyDeptMembers`. Toutes les notifications émises par `care` et `integration` à propos d'une
demande ou d'un suivi les renseignent (`AppointmentRequest` | `MsdpFollowUp` |
`FamilyIntegrationRequest`, mêmes valeurs que `audit_logs.entityType`).

À la suppression : `notification.deleteMany({ where: { OR: [{ entityType, entityId }, { link:
{ in: liensDeLaDemande } }] } })`. Le second critère rattrape les notifications **antérieures**
au déploiement qui pointent vers la demande (`/care/requests/{id}`, `/care/followups/{id}`,
`/integration/requests/{id}` et l'ancien `/admin/integration/requests/{id}`). Reste non
effaçable : une notification antérieure au déploiement à lien générique (voir risques).

### Contraintes existantes (vérifiées, inchangées)

| Lien | Contrainte actuelle | Effet de la suppression |
|---|---|---|
| `MsdpFollowUp.requestId` → `FamilyIntegrationRequest` | `SET NULL` | Sans objet : suppression refusée tant que le suivi existe |
| `MsdpFollowUp.sourceAppointmentId` → `AppointmentRequest` | `SET NULL` | Idem |
| `AgendaEntry.requestId` → `AppointmentRequest` | `SET NULL` (migration `20260515000000_agenda_module`) | Entrée d'agenda supprimée **explicitement** dans la transaction (voir décisions) |
| `PersonJourney.sourceRequestId` → `FamilyIntegrationRequest` | `SET NULL` | Le dossier « parcours » reste (sa suppression existe déjà, hors périmètre) |
| `AppointmentRequest.personJourneyId`, `MsdpFollowUp.personJourneyId` → `PersonJourney` | `SET NULL` | Sans effet sur le parcours |
| `AppointmentRequest.sourceIntegrationRequestId` (colonne simple, pas de clé étrangère — frontière `care`/`integration`) | — | Suppression de la demande d'intégration refusée tant que ce rendez-vous existe (voir décisions) |

L'**historique** d'une demande est stocké dans `audit_logs` (`entityType` =
`AppointmentRequest` | `MsdpFollowUp` | `FamilyIntegrationRequest`, `entityId` = id), lu par
`getCareHistory` et `family-history.ts`. Ses `details` peuvent contenir des notes libres et des
noms d'accompagnants : ces lignes sont supprimées avec la demande (exigence de la spec :
« efface les données personnelles de la demande et son historique »).

## API

| Endpoint | Méthode | Permission | Entrée | Sortie |
|---|---|---|---|---|
| `/api/care/requests/[id]` | DELETE | `care:delete` | — (`id` via `await params`) | `{ id }` · `404` introuvable/autre église · `409` suivi lié |
| `/api/care/followups/[id]` | DELETE | `care:delete` | — | `{ id }` · `404` |
| `/api/integration/requests/[id]` | DELETE | `integration:delete` | — | `{ id }` · `404` · `409` rendez-vous ou suivi issu de la demande |

- Les trois chemins sont déjà couverts par les préfixes `routes.api` des manifestes `care` et
  `integration` (ADR-0012) : aucune déclaration nouvelle, `route-exhaustiveness.test.ts`
  inchangé.
- Ordre dans chaque handler : `requireAuth()` → chargement par id (`404` si absent) →
  `requireChurchPermission(perm, item.churchId)` (`403`) → service. Un Admin d'une autre église
  obtient donc `403` sans rien apprendre du contenu ; un id inexistant obtient `404`.
- Suppression concurrente : le service supprime par `deleteMany({ where: { id, churchId } })`
  et renvoie `404` si `count === 0` — le second Admin reçoit « Demande introuvable », sans
  erreur 500.
- Messages `409` (repris tels quels par l'UI) :
  - rendez-vous : « Un suivi de nouveau converti est lié à cette demande : supprimez-le d'abord. »
  - intégration : « Cette demande a donné lieu à une demande de rendez-vous pastoral et/ou à un
    suivi de nouveau converti : supprimez-les d'abord. »

## Services / logique métier

### Module `care`

- `manifest.ts` : `"care:delete": ["SUPER_ADMIN", "ADMIN"]`.
- `auth.ts` : `requireCareDelete(churchId)` (= `requireChurchPermission("care:delete", …)`) et
  ajout de `canDelete: boolean` à `CareAccess` (résolu par `rolePermissions`, comme
  `canQualify` — jamais d'approximation par rôle, ADR-0017).
- `services/deletion.ts` (nouveau) :
  - `deleteAppointmentRequest({ id, churchId, actorId })` — transaction : charge
    `{ id, msdpFollowUp: { select: { id } } }` ; `409` si suivi ; `agendaEntry.deleteMany({ where:
    { requestId: id } })` ; `auditLog.deleteMany({ where: { entityType: "AppointmentRequest",
    entityId: id } })` ; `deleteItemNotifications(tx, "AppointmentRequest", id, [liens])` ;
    `appointmentRequest.deleteMany({ where: { id, churchId } })` (`404` si `count === 0`). Après validation : `logAudit({ action: "DELETE", entityType:
    "AppointmentRequest", entityId: id, churchId, userId: actorId })` sans `details`.
  - `deleteMsdpFollowUp({ id, churchId, actorId })` — même schéma, sans contrôle de dépendance
    (rien ne dépend d'un suivi) ; la demande d'origine n'est pas touchée (son lien passe à `NULL`
    par la contrainte existante).
  - `countCareItemsFromIntegrationRequest(tx, requestId)` — compte le rendez-vous
    (`sourceIntegrationRequestId`) et le suivi (`requestId`) issus d'une demande d'intégration ;
    prend le client de transaction en paramètre (même convention que
    `handleIntegrationSubmitted`) pour que le contrôle et la suppression soient atomiques.
- `services/notifications.ts`, `appointments.ts`, `followups.ts`, `relances.ts` : chaque
  notification émise à propos d'une demande ou d'un suivi renseigne `entityType`/`entityId`
  (création, affectation, réaffectation, retour au référent, à planifier, planifié, non retenu,
  relances).
- `index.ts` : exporte les trois fonctions et `requireCareDelete`.

### Noyau (`src/lib/notifications.ts`)

- `NotificationInput` : `entityType?`, `entityId?` (transmis à `create`/`createMany`).
- `deleteItemNotifications(tx, entityType, entityId, links)` : `deleteMany` sur
  `{ entityType, entityId }` **ou** `link ∈ links`. Vit dans le noyau parce que les deux
  modules en ont besoin et qu'ils ne peuvent pas partager de code entre eux (ADR-0001).

### Module `integration`

- `manifest.ts` : `"integration:delete": ["SUPER_ADMIN", "ADMIN"]`.
- `auth.ts` : `requireIntegrationDelete(churchId)` et `canDeleteIntegrationRequest(session,
  churchId)` (booléen pour la page, via `rolePermissions`). Ni l'équipe Intégration/MSDP ni les
  bergers n'y ont accès : la délégation de `requireIntegrationAccess` ne s'applique pas ici.
- `services/deletion.ts` (nouveau) : `deleteIntegrationRequest(tx, { id, churchId })` —
  `auditLog.deleteMany` (`entityType: "FamilyIntegrationRequest"`),
  `deleteItemNotifications` (liens `/integration/requests/{id}` et
  `/admin/integration/requests/{id}`), puis `familyIntegrationRequest.deleteMany({ where: { id,
  churchId } })` (`404` si `count === 0`).
- `services/family-service.ts` : les notifications d'affectation au berger et de renvoi à
  l'équipe renseignent `entityType`/`entityId`.

### Route agenda

- `src/app/api/agenda/requests/[id]/schedule/route.ts` émet « Rendez-vous pastoral confirmé »
  au demandeur : elle renseigne aussi `entityType: "AppointmentRequest"`/`entityId`.
  N'écrit pas le journal lui-même : c'est le handler qui le fait après la transaction, faute de
  pouvoir partager la transaction avec `logAudit`.

### Orchestration intégration (route handler)

```ts
await prisma.$transaction(async (tx) => {
  if ((await countCareItemsFromIntegrationRequest(tx, id)) > 0) throw new ApiError(409, "…");
  await deleteIntegrationRequest(tx, { id, churchId });
});
await logAudit({ action: "DELETE", entityType: "FamilyIntegrationRequest", entityId: id, … });
```

C'est la seule logique hébergée dans `src/app/` : elle se limite à composer deux services de
modules qui ne peuvent pas s'importer (ADR-0001).

## UI / composants

- **Rendez-vous** (`src/app/(auth)/care/requests/[id]/`) : `page.tsx` passe `canDelete`
  (`access.canDelete`) et `linkedFollowUpId` à `RequestActions.tsx`, qui ajoute un bouton
  « Supprimer » (`Button variant="danger"`), séparé des actions de workflow.
- **Suivi** (`src/app/(auth)/care/followups/[id]/`) : même ajout dans `FollowupActions.tsx`.
- **Intégration** (`src/app/(auth)/integration/requests/[id]/`) : `page.tsx` passe `canDelete` et
  la présence d'un rendez-vous/suivi lié à `RequestDetail.tsx`.
- **Confirmation** : `ConfirmModal` (`variant="danger"`), titre « Supprimer définitivement cette
  demande ? », message : « Les coordonnées, le message, l'historique et les notifications de la
  demande seront effacés. Cette action est irréversible. » (+ « Le rendez-vous planifié dans l'agenda sera
  aussi supprimé. » si une entrée d'agenda existe).
- **Suppression bloquée** connue à l'affichage : le clic ouvre une `ConfirmModal` sans
  confirmation possible, qui explique la marche à suivre et donne le lien vers le suivi (ou le
  rendez-vous) lié. L'API reste l'arbitre (`409` affiché en `toast.error` si l'état a changé
  entre-temps).
- Après succès : `toast.success("Demande supprimée.")` puis `router.push` vers la liste
  (`/care` ou `/integration`).
- **Lien de notification périmé** (cas résiduel — notification déjà affichée dans un onglet
  ouvert, lien copié, favori) : ajout d'un `not-found.tsx` dans chacun des trois segments
  `[id]`, affichant un `EmptyState` « Cette demande n'existe plus » (« …ou vous n'y avez pas
  accès ») avec un retour à la liste. Les pages appellent déjà `notFound()` quand l'objet est
  absent **ou** inaccessible : le même message pour les deux cas n'apprend rien sur l'existence
  d'une demande à qui n'y a pas droit. (Vérifier dans `node_modules/next/dist/docs/` le
  comportement de `not-found.tsx` au niveau segment en Next.js 16 avant d'implémenter.)
- **Mobile** : le bouton rejoint la zone d'actions existante (déjà empilée sur mobile) ;
  `ConfirmModal` est déjà adaptée au petit écran. À vérifier à 390 px sur les trois pages.
- **Guide** (`GuideContent.tsx`) : une entrée « Supprimer une demande » (Admin/Super Admin).

## Décisions & alternatives écartées

- **Choix** : suppression physique + effacement des lignes d'historique de la demande + une
  ligne `DELETE` sans `details` — *Pourquoi* : c'est l'exigence explicite de la spec
  (effacement sur demande de la personne) ; `entityType` suffit à dire « quel type de demande ».
  C'est la **première fois** que l'application efface des lignes de `audit_logs` : décision
  consignée dans un ADR (ADR-0019, à rédiger en première tâche) pour qu'elle reste bornée à
  l'effacement de données personnelles d'un objet supprimé, et ne devienne pas un moyen
  général de réécrire le journal.
- **Écarté** : suppression logique (`deletedAt`) — *Raison* : les données personnelles
  resteraient en base, contraire au besoin d'effacement ; et chaque requête de liste,
  statistique, relance et export devrait filtrer la colonne.
- **Choix** : l'entrée d'agenda d'un rendez-vous planifié est supprimée avec lui — *Pourquoi* :
  elle n'existe que par la demande et reprend en général le nom de la personne ; la contrainte
  `SET NULL` la laisserait orpheline dans l'agenda du pasteur. Signalé dans la confirmation.
- **Choix** : une demande d'intégration qui a donné naissance à une **demande de rendez-vous
  pastoral** (case « soin pastoral ») est refusée comme celle qui a donné un suivi —
  *Pourquoi* : même situation que le cas prévu par la spec (un élément `care` issu de la
  demande), et la colonne `sourceIntegrationRequestId` sans clé étrangère resterait sinon
  pendante. **Validé par le porteur (2026-10-01).**
- **Choix** : les notifications in-app de la demande sont **supprimées** avec elle — *Pourquoi* :
  décision du porteur (2026-10-01), leur texte cite la personne. Remplace le scénario de la spec
  « le lien mène à un message » pour le cas général ; `not-found.tsx` reste pour les cas
  résiduels. La spec est mise à jour en conséquence.
- **Choix** : rattachement explicite `Notification.entityType`/`entityId` + rattrapage par lien
  — *Pourquoi* : seul moyen fiable de retrouver les notifications à lien générique.
- **Écarté** : rechercher le nom de la personne dans `message` — *Raison* : homonymes,
  faux positifs sur d'autres demandes, et fragile au moindre changement de libellé.
- **Écarté** : remplacer les liens génériques par le lien de la demande — *Raison* : casse le
  parcours du Protocole (`/agenda/schedule`) et enverrait l'ancien accompagnant, qui n'a plus
  accès, vers une page introuvable.
- **Choix** : contrôle de dépendance dans la même transaction que la suppression —
  *Pourquoi* : aucun suivi ne peut être créé entre le contrôle et la suppression.
- **Écarté** : `onDelete: Restrict` sur les liens vers le suivi (migration) pour que la base
  refuse d'elle-même — *Raison* : ces liens ont été passés en `SET NULL` volontairement
  (archivage d'une demande d'accueil sans perdre le suivi) ; les changer affecterait d'autres
  parcours, pour un gain nul (le service contrôle déjà).
- **Écarté** : faire vérifier par le module `integration` les éléments `care` (lecture directe
  de leurs tables) — *Raison* : `care` est propriétaire de ces tables ; le contrôle passe par une
  fonction exportée de `@/modules/care`, composée dans le handler.
- **Écarté** : notifier l'accompagnant ou la personne — *Raison* : hors spec (« n'est pas
  notifié »).

## Risques & points d'attention

- **Irréversibilité** : aucune restauration. Atténué par la permission réservée à
  Admin/Super Admin et la confirmation explicite.
- **Historique global** (`/admin/audit-logs`) : les lignes supprimées disparaissent aussi de
  cette vue ; seule la ligne `DELETE` reste. Conforme à la spec, à mentionner dans l'ADR.
- **Autres traces de la personne** hors demande (dossier parcours, fiche membre, e-mails déjà
  envoyés) : hors périmètre (spec), non effacées.
- **Notifications antérieures au déploiement à lien générique** (« Nouvelle demande de RDV »,
  « Accompagnement réaffecté », « Demande RDV à planifier », notifications du demandeur) : sans
  rattachement, elles ne peuvent pas être retrouvées sans ambiguïté et restent. Le résidu
  diminue naturellement ; à mentionner dans l'ADR et le CHANGELOG.
- **Oubli de rattachement** sur une future notification : un test vérifie que chaque émission
  `care`/`integration` liée à un objet renseigne `entityType`/`entityId`.
- **Lien mort préexistant** : `family-service.ts:166` produit `/admin/integration/requests/{id}`,
  route qui n'existe plus. Sans rapport avec la suppression, non corrigé ici (à signaler en
  issue).
- **`RequestDetail.tsx`** (intégration) fait 71 Ko : insérer le bouton sans restructurer le
  composant.

## Stratégie de tests

- **Matrice des permissions** (`src/core/__tests__/permissions.test.ts`) : `care:delete` et
  `integration:delete` pour `SUPER_ADMIN`/`ADMIN` uniquement ; mise à jour du tableau de
  `CLAUDE.md` et de `docs/auth.md` dans le même commit.
- **Services** (`prismaMock`, transaction simulée) :
  - `deleteAppointmentRequest` : `409` si suivi lié (rien n'est supprimé) ; supprime entrée
    d'agenda, historique puis demande ; `404` si `count === 0` ; ligne `DELETE` écrite **après**
    la transaction, sans `details`.
  - `deleteMsdpFollowUp` : suppression sans contrôle de dépendance, historique effacé.
  - `countCareItemsFromIntegrationRequest` : 0 / rendez-vous seul / suivi seul / les deux.
  - `deleteIntegrationRequest` : historique, notifications puis demande ; `404`.
  - `deleteItemNotifications` : filtre `OR` (rattachement **ou** lien) ; aucun lien ⇒ seul le
    rattachement.
  - Émissions de notifications `care`/`integration` : `entityType`/`entityId` présents
    (tests existants de `notifications.ts`, `relances.ts`, `family-service.ts` complétés).
- **Routes** (auth mockée, comme `src/app/api/care/companions/__tests__/route.test.ts`) :
  Admin → `200` ; Secrétaire, Référent soins pastoraux, membre de l'équipe Intégration → `403` ;
  Admin d'une autre église → `403` ; id inconnu → `404` ; dépendance → `409`.
- **Manuel** (dev) : les trois suppressions, la suppression bloquée, disparition des
  notifications de la cloche, ouverture d'un lien vers une demande supprimée, rendu à 390 px.
- **CI** : job `migrations` (rejeu sur MariaDB vierge) pour la nouvelle migration.
