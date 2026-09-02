# Tâches — Partage de bibliothèque audio entre églises

- **Spec** : `./spec.md` · **Plan** : `./plan.md`
- **Statut** : Terminé

> Tâches **ordonnées** et **vérifiables**. Chacune est atomique et suit les dépendances
> naturelles : migration → services → API → UI → tests. Les tâches `[P]` sont parallélisables.
>
> Les critères d'acceptation de `spec.md` sont référencés en fin de tâche sous la forme
> *(CA : …)* — la couverture complète est vérifiée en fin de document.

## Prérequis

- [x] Branche créée : `feat/partage-bibliotheque-audio`
- [x] Migration Prisma générée (schéma modifié — voir T2)

## Tâches

### 1. Données & migration

- [x] **T1** — Ajouter le modèle `AudioLibraryShare` (`ownerChurchId`, `guestChurchId`,
      `createdAt`), ses deux relations vers `Church` en `onDelete: Cascade`, la contrainte
      `@@unique([ownerChurchId, guestChurchId])`, l'index sur `guestChurchId` et le mapping
      `audio_library_shares`. Ajouter les deux champs de relation côté `Church`
      (`audioSharesGranted`, `audioSharesReceived`). *(fichier : `prisma/schema.prisma`)*
- [x] **T2** — Générer la migration (`npm run db:migrate`, jamais `db push`) et vérifier qu'elle
      s'applique sur une base vierge. *(fichier : `prisma/migrations/…`)*

### 2. Logique métier (services)

- [x] **T3** — Créer `sharing.ts` avec la fonction pivot `listAccessibleLibraryChurchIds(churchId)`
      (l'église elle-même + les propriétaires lui ayant ouvert leur bibliothèque) et
      `listAccessibleLibraryChurches(churchId)` qui l'enrichit de `name` et `primaryColor`.
      *(fichier : `src/modules/audio/services/sharing.ts`)*
- [x] **T4** — Compléter `sharing.ts` avec l'administration : `listOutgoingShares(ownerChurchId)`,
      `grantLibraryShare(ownerChurchId, slug, { confirmOnly })` — refus typés pour slug inconnu,
      slug de sa propre église et doublon — et `revokeLibraryShare(ownerChurchId, shareId)` qui
      vérifie l'appartenance avant suppression.
      *(fichier : `src/modules/audio/services/sharing.ts`)* *(CA : 4, 5, 6)*
- [x] **T5** — Exporter les fonctions de `sharing.ts` depuis l'index du module — seule voie
      d'accès autorisée depuis `src/app/` et `src/lib/`.
      *(fichier : `src/modules/audio/index.ts`)*
- [x] **T6** — Passer `listPublishedServices`, `listSpeakers` et `listSeries` de `churchId: string`
      à `churchIds: string[]`. `listPublishedServices` inclut `church: { select: { id, name,
      primaryColor } }` et remonte ces champs dans `LibraryServiceSummary`. `status: "PUBLISHED"`
      reste forcé. *(fichier : `src/modules/audio/services/library.ts`)* *(CA : 11, 14, 21)*
- [x] **T7** — Passer `getPublishedServiceForMember` à une liste d'églises : le test
      `service.churchId !== churchId` devient un test d'appartenance.
      *(fichier : `src/modules/audio/services/library.ts`)* *(CA : 16)*
- [x] **T8** — Ajouter `requireAudioListenAccess(churchId)` à côté de `requireAudioAccess` :
      Super Admin → OK ; rôle portant `audio:listen` dans l'église visée → OK ; sinon, une des
      églises de l'utilisateur portant `audio:listen` figure-t-elle comme destinataire d'un
      partage de l'église visée → OK ; sinon `FORBIDDEN`. Import du module en dynamique via
      `@/modules/audio`, comme `isCaptureTeamMember` (`auth.ts:690`).
      *(fichier : `src/lib/auth.ts`)* *(CA : 16, 20)*

### 3. API (route handlers)

- [x] **T9** — `GET /api/audio/shares` : `requireCurrentChurchPermission("audio:manage")`,
      retourne l'identifiant public de l'église courante et la liste de ses destinataires.
      *(fichier : `src/app/api/audio/shares/route.ts`)* *(CA : 1, 10)*
- [x] **T10** — `POST /api/audio/shares` : `audio:manage`, corps Zod `{ slug, confirm }`,
      rate-limit `RATE_LIMIT_SENSITIVE` sur les deux temps. `confirm: false` résout sans créer et
      retourne le nom ; `confirm: true` crée. Refus via `ApiError` : 404 identifiant inconnu,
      400 sa propre église, 409 doublon. `logAudit` sur la création.
      *(fichier : `src/app/api/audio/shares/route.ts`)* *(CA : 2, 4, 5, 6, 7, 10, 23)*
- [x] **T11** — `DELETE /api/audio/shares/[id]` : `audio:manage`, `await params`, vérification que
      le partage appartient bien à l'église courante, `logAudit` sur la révocation.
      *(fichier : `src/app/api/audio/shares/[id]/route.ts`)* *(CA : 9, 10, 23)*
- [x] **T12** [P] — Basculer `requireChurchPermission("audio:listen", …)` sur
      `requireAudioListenAccess(service.churchId)` dans la route de comptage de lecture.
      *(fichier : `src/app/api/audio/services/[id]/play/route.ts:24`)* *(CA : 16)*
- [x] **T13** [P] — Même bascule sur la route de diffusion des séquences.
      *(fichier : `src/app/api/audio/services/[id]/stream/[segmentId]/route.ts:21`)* *(CA : 16, 20)*
- [x] **T14** — Ne **rien** changer à la route de génération de lien public : vérifier
      explicitement qu'elle conserve `requireChurchPermission`, et documenter en commentaire que
      le refus pour une église invitée est obtenu par cette garde, sans code dédié.
      *(fichier : `src/app/api/audio/services/[id]/share/route.ts:25`)* *(CA : 17)*

### 4. UI

- [x] **T15** — Section « Partage de ma bibliothèque » dans les paramètres Audio : affichage de
      l'identifiant public de l'église et de son usage, saisie d'un identifiant (`Input` +
      `Button`), `Modal` de confirmation portant le nom résolu (prop `open`, pas `isOpen`), liste
      des destinataires avec révocation confirmée par `Modal`. Aucune liste d'églises n'est
      proposée nulle part.
      *(fichiers : `src/app/(auth)/audio/parametres/page.tsx`, `.../LibrarySharingClient.tsx`)*
      *(CA : 1, 2, 3, 9)*
- [x] **T16** — Page bibliothèque : résoudre le périmètre d'églises via
      `listAccessibleLibraryChurches`, ajouter `church` au `searchParamsSchema` avec
      `.catch(undefined)`, et **intersecter** systématiquement la valeur reçue avec le périmètre
      calculé serveur — jamais l'utiliser directement.
      *(fichier : `src/app/(auth)/audio/ecouter/page.tsx`)* *(CA : 11, 14, 15)*
- [x] **T17** — Badge d'origine sur les cartes, affiché **uniquement** pour un culte dont
      l'église diffère de celle de l'utilisateur, teinté avec `primaryColor` en style inline,
      inséré dans l'en-tête `flex justify-between` existante (pas de ligne supplémentaire, mobile
      compris). *(fichier : `src/app/(auth)/audio/ecouter/page.tsx`)* *(CA : 12, 22)*
- [x] **T18** — Filtre « Église » dans les filtres de la bibliothèque, rendu **seulement si** plus
      d'une église est accessible ; la grille passe alors de `lg:grid-cols-6` à `lg:grid-cols-7`.
      *(fichier : `src/app/(auth)/audio/ecouter/LibraryFiltersClient.tsx`)* *(CA : 13, 22)*
- [x] **T19** — Cascade des filtres : quand une église est sélectionnée, les orateurs et séries
      proposés sont restreints à cette église (liste déjà filtrée passée à `listSpeakers` /
      `listSeries`). *(fichier : `src/app/(auth)/audio/ecouter/page.tsx`)* *(CA : 15)*
- [x] **T20** — Page de détail : `requireAudioListenAccess` sur l'église du culte,
      `getPublishedServiceForMember` avec le périmètre d'églises, et affichage de l'église
      d'origine dans l'en-tête du lecteur quand le culte vient d'ailleurs.
      *(fichier : `src/app/(auth)/audio/ecouter/[id]/page.tsx`)* *(CA : 16, 20)*

### 5. Tests

- [x] **T21** [P] — Services de partage : `listAccessibleLibraryChurchIds` sans partage → l'église
      seule ; avec partage entrant → contient le propriétaire ; un partage **sortant** ne donne
      rien en retour (non-réciprocité). `grantLibraryShare` : slug inconnu, sa propre église,
      doublon. Un renommage d'identifiant ne rompt pas un partage existant.
      *(fichier : `src/modules/audio/services/__tests__/sharing.test.ts`)* *(CA : 4, 5, 6, 8)*
- [x] **T22** [P] — Autorisation : `requireAudioListenAccess` — rôle direct OK, invité OK, ni l'un
      ni l'autre `FORBIDDEN`, partage révoqué `FORBIDDEN`. **Non-contamination** : le partage ne
      confère ni `events:view`, ni `members:view`, ni aucune autre permission dans l'église
      propriétaire. *(fichier : `src/lib/__tests__/auth-audio-sharing.test.ts`)* *(CA : 19, 20)*
- [x] **T23** — Routes audio : le corpus d'isolation existant (403 sans partage) reste
      **inchangé**. Nouveaux cas avec partage actif : lecture et diffusion → 200 ; lien public,
      publication, dépublication, séquences et dépôt → 403 ; culte non publié du propriétaire →
      refusé. *(fichier : `src/app/api/audio/services/__tests__/multi-tenant.test.ts`)*
      *(CA : 16, 17, 18, 20)*
- [x] **T24** [P] — Bibliothèque : une liste d'églises ne remonte que des cultes publiés de ces
      églises ; un culte dépublié disparaît sans délai ; un `church` hors périmètre est ignoré et
      ne fuit rien ; orateurs et séries homonymes entre deux églises sont bien restreints par la
      cascade. *(fichier : `src/modules/audio/services/__tests__/library.test.ts`)*
      *(CA : 11, 14, 15, 21)*
- [x] **T25** [P] — Routes d'administration des partages : `audio:manage` exigé sur les trois
      routes, rate-limit actif sur le POST, révocation impossible sur un partage d'une autre
      église, écriture d'audit sur ouverture et révocation.
      *(fichier : `src/app/api/audio/shares/__tests__/security.test.ts`)* *(CA : 7, 10, 23)*

## Couverture des critères d'acceptation

| CA (spec) | Tâches |
|---|---|
| 1 — identifiant de son église visible | T9, T15 |
| 2 — ouverture par saisie + nom vérifié | T10, T15 |
| 3 — aucune liste d'églises proposée | T15 |
| 4 — identifiant inconnu refusé | T4, T10, T21 |
| 5 — sa propre église refusée | T4, T10, T21 |
| 6 — pas de doublon | T4, T10, T21 |
| 7 — limitation de débit | T10, T25 |
| 8 — partage survit au renommage | T1, T21 |
| 9 — révocation effective | T11, T15 |
| 10 — réservé aux Admins | T9, T10, T11, T25 |
| 11 — cultes du propriétaire visibles chez l'invité | T6, T16, T24 |
| 12 — badge d'origine ciblé | T17 |
| 13 — filtre église conditionnel | T18 |
| 14 — mélange trié par défaut | T6, T16, T24 |
| 15 — filtre + cascade orateurs/séries | T16, T19, T24 |
| 16 — écoute de bout en bout | T7, T8, T12, T13, T20, T23 |
| 17 — pas de lien public sur le contenu d'autrui | T14, T23 |
| 18 — aucune écriture dans l'église propriétaire | T23 |
| 19 — aucune autre donnée accessible | T22 |
| 20 — révocation immédiate | T8, T13, T20, T22, T23 |
| 21 — dépublication instantanée | T6, T24 |
| 22 — espace inchangé sans partage | T17, T18 |
| 23 — trace dans l'historique | T10, T11, T25 |

## Vérification finale

- [x] `npm run typecheck` — couvre exhaustivement le changement de signature de `library.ts` (T6, T7)
- [x] `npm run lint`
- [x] `npm run lint:boundaries` — vérifie que `src/lib/auth.ts` et `src/app/` n'accèdent au module
      que par `@/modules/audio` (T5, T8)
- [x] `npm run test`
- [x] Tous les critères d'acceptation de `spec.md` satisfaits (voir tableau ci-dessus)
- [ ] Vérification manuelle mobile de la bibliothèque : badge d'origine et filtre église
      (non exécutée — pas d'environnement navigateur dans cette session, à faire en revue)
- [ ] PR ouverte vers `main` (volontairement non faite — l'agent ne pousse pas la branche ni
      n'ouvre de PR, voir consigne de livraison)
