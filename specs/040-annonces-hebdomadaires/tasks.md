# Tâches — Feuille d'annonces d'un culte

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Implémentée

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.

## Prérequis

- [x] Branche créée : `feat/annonces-hebdomadaires` (rebasée sur `main`)
- [x] Migration Prisma générée (T1)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter `MODERATION` et `CAPTATION_AUDIO` à `DEPT_FN`, remplacer la chaîne
      littérale `"CAPTATION_AUDIO"` par la constante dans `src/modules/audio/services/access.ts`
      (`src/modules/audio/auth.ts` ne mentionnait la chaîne que dans un commentaire, rien à
      changer côté code) *(fichiers : `src/lib/department-functions.ts`,
      `src/modules/audio/services/access.ts`)*
- [x] **T2** — Ajouter le modèle `AnnouncementSheet` (`churchId`, `eventId` unique, `key`,
      `filename`, `mimeType`, `uploadedById`, `uploadedAt`), plus les relations inverses
      `Event.announcementSheet`, `Church.announcementSheets`,
      `User.announcementSheetsUploaded @relation("AnnouncementSheetUploadedBy")`
      *(fichier : `prisma/schema.prisma`)*
- [x] **T3** — Générer la migration (`npm run db:migrate -- --name add_announcement_sheet`) —
      jamais `db push`

### 2. Logique métier (services)

- [x] **T4** — `findCoordinationMinistryId(churchId)` : résout l'id du ministère nommé
      « Coordination générale » dans l'église, `null` si absent
      *(fichier : `src/modules/planning/services/announcement-sheet.service.ts`)*
- [x] **T5** — `canDepositAnnouncementSheet(session, churchId)` : `true` si `events:manage`
      (géré en amont par l'appelant), sinon membre (`member_departments`) d'un département
      fonction `SECRETARIAT`, sinon `MINISTER` scopé (`getUserMinistryScope`) sur le ministère
      Coordination générale, sinon responsable/adjoint (`getUserDepartmentScope`) d'un département
      dont le `ministryId` est celui de Coordination générale, sinon `false`
      *(fichier : même fichier que T4)*
- [x] **T6** — `canReadAnnouncementSheet(session, churchId)` : `true` si
      `canDepositAnnouncementSheet`, sinon membre d'un département de fonction `MODERATION`,
      `COMMUNICATION`, `CAPTATION_AUDIO` ou `PRODUCTION_MEDIA`
      *(fichier : même fichier que T4)*
- [x] **T7** — `notifyReaders(churchId, eventId, eventTitle, isUpdate)` : résout l'ensemble
      unique des `userId` lecteurs (mêmes populations que T6, requêtées directement) et crée une
      notification par utilisateur, titre distinct dépôt initial vs mise à jour
      *(fichier : même fichier que T4)*

### 3. API (route handlers)

- [x] **T8** — `POST /api/events/[eventId]/announcement-sheet/sign` : `requireChurchPermission
      ("planning:view", churchId)` puis `canDepositAnnouncementSheet`, validation Zod
      (`filename`, `mimeType` whitelist docx/PDF, `size` max 20 Mo), génère la clé S3 et l'URL de
      dépôt signée (`getSignedPutUrl`), renvoie `{ key, url }`
      *(fichier : `src/app/api/events/[eventId]/announcement-sheet/sign/route.ts`)*
- [x] **T9** — `POST /api/events/[eventId]/announcement-sheet` (confirmation) : même garde,
      revalide l'existence de l'objet S3 (`fileExists(key)`, 404 sinon), `upsert` sur `eventId`
      (remplace l'enregistrement existant), supprime l'ancien objet S3 après l'upsert réussi
      (`deleteMediaFile`), appelle `notifyReaders` (`isUpdate` = remplacement ou non), renvoie
      `{ sheet }` (201) *(fichier : `src/app/api/events/[eventId]/announcement-sheet/route.ts`)*
- [x] **T10** — `GET /api/events/[eventId]/announcement-sheet` : même garde avec
      `canReadAnnouncementSheet`, renvoie `{ sheet: null }` si absente, sinon `{ sheet: {
      filename, uploadedAt, uploadedBy }, downloadUrl }` (`getSignedDownloadUrl`, signée à la
      demande) *(fichier : même fichier que T9)*
- [x] **T11** — `DELETE /api/events/[eventId]/announcement-sheet` : `canDepositAnnouncementSheet`,
      404 si absente, supprime l'enregistrement et l'objet S3, renvoie `{ success: true }`
      *(fichier : même fichier que T9)*
- [x] **T12** [P] — `GET /api/events/announcement-sheets` : `requireCurrentChurchPermission
      ("planning:view")` puis `canReadAnnouncementSheet`, liste les événements à venir de l'église
      (filtre `?from=&to=` optionnel) avec leur feuille éventuelle
      *(fichier : `src/app/api/events/announcement-sheets/route.ts`)*

### 4. UI

- [x] **T13** — Section « Feuille d'annonces » sur la vue star-view : état actuel (nom + date de
      dépôt, ou « pas encore disponible »), téléchargement si lecteur, dépôt/remplacement/retrait
      si déposant (`data.announcementSheet.canDeposit`) — upload direct navigateur → S3 via URL
      signée (T8), confirmation ensuite (T9)
      *(fichier : `src/app/(auth)/events/[eventId]/star-view/AnnouncementSheetManager.tsx`,
      nouveau)*
- [x] **T14** [P] — Ajouter `announcementSheet` à l'`include` Prisma et à la réponse de la route
      star-view (`{ filename, uploadedAt, canDeposit, canRead }`, jamais le `downloadUrl` signé
      directement dans cette réponse) et l'intégrer dans `StarViewClient.tsx`
      *(fichiers : `src/app/api/events/[eventId]/star-view/route.ts`,
      `src/app/(auth)/events/[eventId]/star-view/StarViewClient.tsx`)*
- [x] **T15** [P] — Page liste `/events/announcement-sheets` (Server Component) : événements à
      venir de l'église courante avec statut de la feuille, lien vers `star-view` de chacun,
      gardée par `canReadAnnouncementSheet` (redirection `/no-access` sinon)
      *(fichier : `src/app/(auth)/events/announcement-sheets/page.tsx`, nouveau)*
- [x] **T16** [P] — Entrée de navigation vers la page liste (desktop + mobile), visible si
      `planning:view` *(fichiers : `src/components/Sidebar.tsx`, `src/components/MobileNavSheet.tsx`)*

### 5. Tests

- [x] **T17** [P] — Tests de `canDepositAnnouncementSheet` (events:manage, membre Secrétariat,
      Ministre Coordination, responsable dept Coordination, refus), `canReadAnnouncementSheet`
      (déposant, lecteur par fonction ×4, refus), `findCoordinationMinistryId` (trouvé, absent)
      *(fichier : `src/modules/planning/services/__tests__/announcement-sheet.service.test.ts`)*
- [x] **T18** [P] — Tests des routes `announcement-sheet` : sign (validation mimeType/size, 403),
      POST confirmation (création, remplacement + suppression ancien objet S3, 404 objet S3
      absent), GET (feuille présente + URL signée, absente → null, 403 non lecteur), DELETE
      (retrait, 403, 404) *(fichier : `src/app/api/events/__tests__/announcement-sheet.test.ts`)*
- [x] **T19** [P] — Étendre `star-view.test.ts` pour la présence d'`announcementSheet` dans la
      réponse *(fichier : `src/app/api/events/__tests__/star-view.test.ts`)* — aucun
      `star-view.test.ts` n'existait déjà sur cette branche (contrairement à l'hypothèse du
      plan) : fichier créé, centré sur la forme `announcementSheet` (comme pour la spec 041)
- [x] **T20** [P] — Test de la route `GET /api/events/announcement-sheets` (liste, filtre
      from/to, 403 non lecteur) *(fichier :
      `src/app/api/events/__tests__/announcement-sheets-list.test.ts`)*

## Vérification manuelle

> Pas d'environnement navigateur + base seedée disponible dans cette session pour une
> vérification manuelle en direct — laissé `[ ]` volontairement (même pattern que les specs
> 039/041/042). Couvert à la place par les tests automatisés (T17-T20) et une relecture des
> critères d'acceptation ci-dessous.

- [ ] Le Secrétariat (rôle et membre simple) dépose une feuille sur un culte à venir — visible
      immédiatement sur l'événement avec date et nom du déposant
- [ ] La Coordination (Ministre et responsable de département) peut aussi déposer
- [ ] Les lecteurs (Modération, Communication, Régie, Production média) téléchargent la feuille
      mais ne peuvent ni déposer ni retirer
- [ ] Un rôle non habilité ne voit ni la section ni la page liste
- [ ] Déposer une nouvelle version remplace l'ancienne, date de mise à jour visible, notification
      renvoyée aux lecteurs
- [ ] Un culte à venir sans feuille affiche « pas encore disponible »
- [ ] Un fichier hors docx/PDF ou trop volumineux est refusé avec un message clair
- [ ] Suppression d'un événement : sa feuille disparaît
- [ ] Cohérent sur mobile (dépôt et téléchargement)

## Vérification finale

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm run lint:boundaries`
- [x] `npm run test` (146 fichiers, 1558 tests)
- [x] Tous les critères d'acceptation de `spec.md` satisfaits
- [x] PR ouverte vers `main` ([#538](https://github.com/iccbretagne/koinonia/pull/538))
